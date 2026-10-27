// SPDX-License-Identifier: Apache-2.0
/**
 * Run the Method Validation Pack: does the engine reach the right assurance
 * answer, not merely a consistent one.
 *
 * ## What this measures, and what the existing checks do not
 *
 * `verify` proves the engine is self-consistent — the permit invariant holds,
 * digests are stable, invalidation is deterministic. None of that says the
 * rules are *correct*. A rule that severs the wrong edge is severed
 * deterministically every time.
 *
 * So this harness scores the engine against expectations held separately from
 * the rules, in `validation/cases/**​/scenarios/*.json`. Those expectations were
 * authored from what each claim says — not from the `severedBy` lists being
 * tested — precisely so the two can disagree. A disagreement is the useful
 * output of this file: it is either a defect in the rules or a defect in the
 * expectation, and an external reviewer decides which.
 *
 * ## The metric that matters
 *
 * **Dangerous false preservation**: evidence the engine kept that the
 * expectation says should have been reassessed. Work avoided is easy to
 * inflate — an engine that invalidates nothing avoids all of it — so the
 * saving is only meaningful beside this number. Every instance is listed
 * individually rather than summarised, because one is a finding.
 *
 * ## Labels are not yet independent, and the report says so
 *
 * Every expectation currently carries `provenance: team`. Measured against
 * labels written by the people who wrote the rules, a score means very little,
 * and the report refuses to be quotable while that is true. It becomes
 * quotable when reviewers have recorded decisions in `validation/reviews/` and
 * a scenario's label is adjudicated.
 *
 * Run: npx tsx ./cli/validate-method.ts [--json] [--out <dir>]
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkContextCompatibility,
  computeDelta,
  deriveClaimState,
  diffPassports,
  parseContextContract,
  parsePassport,
  passportDigest,
  recommend,
  type ClaimNode,
  type DeltaResult,
  type EvidenceNode,
  type GraphEdge,
  type ObligationMap,
  type PassportSnapshot,
} from '../src/index.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const validationDir = join(root, 'validation');

/** The change types the pack must cover, from the development directive. */
const REQUIRED_COVERAGE = [
  'model-version', 'system-prompt', 'tool-added', 'mcp-tool-description',
  'permission-escalation', 'outbound-destination', 'credential-scope',
  'retrieval-source', 'human-approval-removed', 'monitoring-control-failure',
  'evidence-expired', 'policy-change', 'unknown-change',
];

/**
 * What the reassessed case can support. Deliberately separate from whether the
 * live permit stops now: "suspend pending reassessment" and "once reassessed,
 * this supports a supervised pilot" are both true at once, and the first
 * version of this harness collapsed them — so fourteen of fourteen scenarios
 * came out as "suspend" and the comparison measured nothing.
 *
 * `undetermined` exists for an unclassified change, where no ceiling can
 * honestly be computed.
 */
type Ceiling = 'continue' | 'continue_with_conditions' | 'restrict_or_pilot' | 'reject' | 'undetermined';
const CEILINGS: Ceiling[] = ['continue', 'continue_with_conditions', 'restrict_or_pilot', 'reject', 'undetermined'];

interface Scenario {
  schema_version: string;
  id: string;
  title: string;
  case: string;
  context: string;
  change_family: 'passport_diff' | 'operational_signal' | 'evidence_state' | 'external_policy';
  engine_capability: 'supported' | 'partial' | 'absent';
  change: { description: string; passport_patch?: Record<string, unknown>; signal?: Record<string, unknown> };
  expected: {
    affected_claims: string[];
    invalidated_evidence: string[];
    preserved_evidence?: string[];
    permit_ceiling: Ceiling;
    suspend_pending_reassessment: boolean;
    full_reassessment_required?: boolean;
  };
  labels: { provenance: 'team' | 'reviewed' | 'adjudicated' | 'observed'; author: string; date: string; rationale: string };
  reviews: unknown[];
  adjudication: unknown | null;
}

interface CaseFile {
  id: string;
  title: string;
  fictional?: boolean;
  /**
   * Who modelled the graph. A disagreement against a graph generated from the
   * engine's own constants points at the severedBy taxonomy; against a graph a
   * deployer wrote, it points at that case's modelling. Reporting both as one
   * number would blame the engine for a case author's omission.
   */
  graph_authored_by?: 'engine reference constants' | 'case author';
  sources: Record<string, string>;
  obligations?: string;
}

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;

/** Objects merge, arrays and scalars replace. Documented in validation/README.md. */
function applyPatch(base: unknown, patch: unknown): unknown {
  if (Array.isArray(patch) || patch === null || typeof patch !== 'object') return patch;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown> ?? {}) };
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    out[key] = key in out ? applyPatch(out[key], value) : value;
  }
  return out;
}

const problems: string[] = [];
const fail = (message: string) => problems.push(message);

// ---- load cases ------------------------------------------------------------
interface LoadedCase {
  file: CaseFile;
  dir: string;
  claims: Array<ClaimNode & { evidence?: { supports?: string[]; challenges?: string[] }; mitigation?: { accepted?: boolean; accepted_by?: string; rationale?: string } }>;
  edges: GraphEdge[];
  evidenceRefs: string[];
  evidence: EvidenceNode[];
  passportDoc: Record<string, unknown>;
  passportSnapshot: PassportSnapshot;
  passportHash: string;
  contract?: ReturnType<typeof parseContextContract>;
  obligations: ObligationMap;
  scenarios: Scenario[];
}

function loadCases(): LoadedCase[] {
  const casesDir = join(validationDir, 'cases');
  const out: LoadedCase[] = [];

  for (const id of readdirSync(casesDir)) {
    const dir = join(casesDir, id);
    const file = readJson<CaseFile>(join(dir, 'case.json'));
    const graph = readJson<{ claims: LoadedCase['claims']; edges: GraphEdge[] }>(resolve(dir, file.sources.assurance_graph));
    const manifest = readJson<{ evidence: Array<{ ref: string; scope_passport_digest?: string }> }>(resolve(dir, file.sources.evidence_manifest));
    const passportDoc = readJson<Record<string, unknown>>(resolve(dir, file.sources.agent_passport));

    const parsed = parsePassport(passportDoc);
    if (!parsed.ok) {
      fail(`${id}: agent passport does not parse: ${parsed.errors.map((e) => `${e.path} ${e.message}`).join('; ')}`);
      continue;
    }
    const passportHash = passportDigest(parsed.document);

    const contract = file.sources.context_contract
      ? parseContextContract(readJson(resolve(dir, file.sources.context_contract)))
      : undefined;
    if (contract && !contract.ok) fail(`${id}: context contract does not parse`);

    const obligations: ObligationMap = file.obligations
      ? (readJson<{ obligations: ObligationMap }>(resolve(dir, file.obligations)).obligations)
      : {};

    const scenarioDir = join(dir, 'scenarios');
    const scenarios = existsSync(scenarioDir)
      ? readdirSync(scenarioDir).filter((f) => f.endsWith('.json')).map((f) => readJson<Scenario>(join(scenarioDir, f)))
      : [];

    out.push({
      file, dir,
      claims: graph.claims,
      edges: graph.edges,
      evidenceRefs: manifest.evidence.map((e) => e.ref),
      // Every artefact is in scope for the passport the case rests on: this pack
      // measures what a *change* severs, so scope staleness must not confound it.
      evidence: manifest.evidence.map((e) => ({ ref: e.ref, scopePassportHash: passportHash })),
      passportDoc, passportSnapshot: parsed.snapshot, passportHash,
      contract, obligations, scenarios,
    });
  }
  return out;
}

// ---- structural validation -------------------------------------------------
function validateStructure(cases: LoadedCase[]): void {
  const seen = new Set<string>();
  for (const c of cases) {
    const claimRefs = new Set(c.claims.map((x) => x.ref));
    const evidenceRefs = new Set(c.evidenceRefs);

    for (const s of c.scenarios) {
      if (s.case !== c.file.id) fail(`${s.id}: declares case "${s.case}" but sits under "${c.file.id}"`);
      if (seen.has(s.id)) fail(`${s.id}: duplicate scenario id`);
      seen.add(s.id);
      if (!CEILINGS.includes(s.expected.permit_ceiling)) {
        fail(`${s.id}: permit_ceiling "${s.expected.permit_ceiling}" is not one of ${CEILINGS.join(', ')}`);
      }
      if (typeof s.expected.suspend_pending_reassessment !== 'boolean') {
        fail(`${s.id}: suspend_pending_reassessment must be stated. Whether the live permit stops now is the operational half of the answer.`);
      }
      if (!s.labels?.provenance) fail(`${s.id}: no label provenance`);
      if (!s.labels?.rationale) fail(`${s.id}: no rationale. An expectation nobody justified cannot be reviewed.`);
      for (const ref of s.expected.affected_claims) {
        if (!claimRefs.has(ref)) fail(`${s.id}: expects claim ${ref}, which is not in the case graph`);
      }
      for (const ref of [...s.expected.invalidated_evidence, ...(s.expected.preserved_evidence ?? [])]) {
        if (!evidenceRefs.has(ref)) fail(`${s.id}: expects evidence ${ref}, which is not in the case manifest`);
      }
      if (s.change_family === 'passport_diff' && !s.change.passport_patch) {
        fail(`${s.id}: a passport_diff scenario needs a passport_patch`);
      }
      if (s.change_family !== 'passport_diff' && !s.change.signal) {
        fail(`${s.id}: a ${s.change_family} scenario needs a signal describing what happened`);
      }
      if (s.change_family === 'passport_diff' && s.engine_capability !== 'supported') {
        fail(`${s.id}: a passport diff is something the engine can evaluate; capability should be "supported"`);
      }
    }
  }

  const covered = new Set([...cases.flatMap((c) => c.scenarios.map((s) => s.id.split('/')[1]))]);
  for (const required of REQUIRED_COVERAGE) {
    if (!covered.has(required)) fail(`no scenario covers the required change type "${required}"`);
  }
  if (cases.length < 2) fail('the pack needs more than one agent case, or it measures the rules against the case they were written for');
}

// ---- evaluate one scenario -------------------------------------------------
interface Evaluation {
  id: string;
  title: string;
  case: string;
  family: string;
  capability: string;
  evaluated: boolean;
  reason?: string;
  engine?: {
    changes: string[];
    unclassified: string[];
    fullReassessmentRequired: boolean;
    affectedClaims: string[];
    invalidatedEvidence: string[];
    preservedEvidence: string[];
    requiredTests: string[];
    ceiling: Ceiling;
    suspendPendingReassessment: boolean;
    recommendation: string;
    contractFindings: Array<{ ref: string; severity: string; message: string }>;
  };
  expected: Scenario['expected'];
  comparison?: {
    truePositives: string[];
    unnecessaryInvalidation: string[];
    dangerousFalsePreservation: string[];
    claimsMissed: string[];
    claimsOverreached: string[];
    ceilingMatches: boolean;
    suspensionMatches: boolean;
    pointsAt: 'engine_rules' | 'case_graph' | null;
    evidencePreservedShare: number;
    testsAvoidedShare: number;
  };
  labels: Scenario['labels'];
}

function engineAnswer(delta: DeltaResult, c: LoadedCase, breach: boolean): { ceiling: Ceiling; suspendPendingReassessment: boolean; recommendation: string } {
  // Documented mapping, because this is a judgement and must be visible.
  if (breach) return { ceiling: 'reject', suspendPendingReassessment: true, recommendation: 'red_line_breach' };

  const mitigated = new Set(
    c.claims.filter((x) => x.mitigation?.accepted === true && x.mitigation.accepted_by && x.mitigation.rationale).map((x) => x.ref),
  );
  const claimStates = delta.outcomes.map((o) => ({
    ref: o.claimRef,
    critical: o.critical,
    mitigationAccepted: mitigated.has(o.claimRef),
    state: deriveClaimState({
      supportingEvidence: o.preservedEvidenceRefs.length,
      challengingEvidence: o.challengingEvidenceRefs.length,
      invalidatedEvidence: o.invalidatedEvidenceRefs.length,
    }),
  }));
  const result = recommend({ claims: claimStates, delta });
  const map: Record<string, Ceiling> = {
    approve: 'continue',
    approve_with_conditions: 'continue_with_conditions',
    supervised_pilot: 'restrict_or_pilot',
    reject: 'reject',
  };
  return {
    ceiling: map[result.recommendation] ?? 'restrict_or_pilot',
    suspendPendingReassessment: result.suspendExistingPermit || delta.fullReassessmentRequired,
    recommendation: result.recommendation,
  };
}

function evaluate(s: Scenario, c: LoadedCase): Evaluation {
  const base: Evaluation = {
    id: s.id, title: s.title, case: s.case, family: s.change_family,
    capability: s.engine_capability, evaluated: false, expected: s.expected, labels: s.labels,
  };

  if (s.change_family !== 'passport_diff') {
    return {
      ...base,
      reason: s.engine_capability === 'absent'
        ? 'The engine has no input for this kind of event, so it cannot be scored. The expectation stands as a specification for the capability.'
        : 'Partially modelled: the engine can represent the state but has no path from it to reassessment.',
    };
  }

  const after = applyPatch(c.passportDoc, s.change.passport_patch) as Record<string, unknown>;
  const parsedAfter = parsePassport(after);
  if (!parsedAfter.ok) {
    fail(`${s.id}: the patched passport does not parse: ${parsedAfter.errors.map((e) => e.path).join(', ')}`);
    return { ...base, reason: 'patched passport did not parse' };
  }

  const diff = diffPassports(c.passportSnapshot, parsedAfter.snapshot);
  const unclassified = [
    ...diff.unclassified.map((u) => u.field),
    // A field the document format does not carry at all is also unclassified,
    // and must fail closed rather than vanish.
    ...(parsedAfter.unknownFields ?? []).filter((f) => !(c.passportSnapshot as unknown as Record<string, unknown>)[f]),
  ];

  const delta = computeDelta({
    claims: c.claims.map((x) => ({ ref: x.ref, statement: x.statement, domain: x.domain, critical: x.critical, coversTests: x.coversTests })),
    evidence: c.evidence,
    edges: c.edges,
    changes: diff.changes,
    unclassifiedFields: unclassified,
    obligations: c.obligations,
    currentPassportHash: passportDigest(parsedAfter.document),
  });

  let breach = false;
  const contractFindings: Array<{ ref: string; severity: string; message: string }> = [];
  if (c.contract?.ok) {
    const compat = checkContextCompatibility(parsedAfter.snapshot, c.contract.contract);
    for (const f of compat.findings) {
      contractFindings.push({ ref: f.ref, severity: f.severity, message: f.message });
      if (f.severity === 'breach') breach = true;
    }
  }

  const answer = engineAnswer(delta, c, breach);

  const invalidated = [...new Set(delta.outcomes.flatMap((o) => o.invalidatedEvidenceRefs))];
  const affected = delta.outcomes.filter((o) => o.impact !== 'preserved').map((o) => o.claimRef);
  const requiredTests = [...new Set([...delta.outcomes.flatMap((o) => o.requiredTests), ...delta.newObligations.map((n) => n.testId)])];
  const allTests = [...new Set(c.claims.flatMap((x) => x.coversTests))];

  const expectedInvalidated = new Set(s.expected.invalidated_evidence);
  const enginePreserved = c.evidenceRefs.filter((r) => !invalidated.includes(r));

  return {
    ...base,
    evaluated: true,
    engine: {
      changes: diff.changes.map((ch) => ch.kind),
      unclassified,
      fullReassessmentRequired: delta.fullReassessmentRequired,
      affectedClaims: affected,
      invalidatedEvidence: invalidated,
      preservedEvidence: enginePreserved,
      requiredTests,
      ceiling: answer.ceiling,
      suspendPendingReassessment: answer.suspendPendingReassessment,
      recommendation: answer.recommendation,
      contractFindings,
    },
    comparison: {
      truePositives: invalidated.filter((r) => expectedInvalidated.has(r)),
      unnecessaryInvalidation: invalidated.filter((r) => !expectedInvalidated.has(r)),
      dangerousFalsePreservation: [...expectedInvalidated].filter((r) => !invalidated.includes(r)),
      claimsMissed: s.expected.affected_claims.filter((r) => !affected.includes(r)),
      claimsOverreached: affected.filter((r) => !s.expected.affected_claims.includes(r)),
      ceilingMatches: answer.ceiling === s.expected.permit_ceiling,
      suspensionMatches: answer.suspendPendingReassessment === s.expected.suspend_pending_reassessment,
      pointsAt: (invalidated.length !== expectedInvalidated.size || s.expected.affected_claims.some((r) => !affected.includes(r)))
        ? (c.file.graph_authored_by === 'case author' ? 'case_graph' : 'engine_rules')
        : null,
      evidencePreservedShare: c.evidenceRefs.length === 0 ? 0 : enginePreserved.length / c.evidenceRefs.length,
      testsAvoidedShare: allTests.length === 0 ? 0 : 1 - requiredTests.filter((t) => allTests.includes(t)).length / allTests.length,
    },
  };
}

// ---- reviewer data ---------------------------------------------------------
interface ReviewerAgreement {
  scenario: string;
  reviewers: number;
  pairwiseAgreement: number | null;
  note?: string;
}

function reviewerAgreement(): { files: number; perScenario: ReviewerAgreement[]; note: string } {
  const dir = join(validationDir, 'reviews');
  const files = existsSync(dir)
    ? readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'REVIEW-TEMPLATE.json')
    : [];
  if (files.length === 0) {
    return { files: 0, perScenario: [], note: 'No reviewer submissions. Every expectation is unreviewed, so no agreement can be computed.' };
  }

  const byScenario = new Map<string, Array<{ reviewer: string; affected: string[] }>>();
  for (const f of files) {
    const review = readJson<{ reviewer: { id: string }; decisions: Array<{ scenario: string; proposed?: { affected_claims?: string[] } }> }>(join(dir, f));
    for (const d of review.decisions ?? []) {
      const list = byScenario.get(d.scenario) ?? [];
      list.push({ reviewer: review.reviewer?.id ?? f, affected: d.proposed?.affected_claims ?? [] });
      byScenario.set(d.scenario, list);
    }
  }

  const jaccard = (a: string[], b: string[]) => {
    const A = new Set(a); const B = new Set(b);
    const inter = [...A].filter((x) => B.has(x)).length;
    const union = new Set([...a, ...b]).size;
    return union === 0 ? 1 : inter / union;
  };

  const perScenario: ReviewerAgreement[] = [];
  for (const [scenario, list] of byScenario) {
    if (list.length < 2) {
      perScenario.push({ scenario, reviewers: list.length, pairwiseAgreement: null, note: 'one reviewer only' });
      continue;
    }
    const scores: number[] = [];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) scores.push(jaccard(list[i].affected, list[j].affected));
    }
    perScenario.push({ scenario, reviewers: list.length, pairwiseAgreement: scores.reduce((a, b) => a + b, 0) / scores.length });
  }
  return { files: files.length, perScenario, note: 'Agreement is mean pairwise Jaccard overlap of the claims each reviewer marked affected.' };
}

// ---- run -------------------------------------------------------------------
const cases = loadCases();
validateStructure(cases);

const evaluations: Evaluation[] = [];
for (const c of cases) for (const s of c.scenarios) evaluations.push(evaluate(s, c));

const scored = evaluations.filter((e) => e.evaluated && e.comparison);
const tp = scored.reduce((n, e) => n + e.comparison!.truePositives.length, 0);
const fp = scored.reduce((n, e) => n + e.comparison!.unnecessaryInvalidation.length, 0);
const fn = scored.reduce((n, e) => n + e.comparison!.dangerousFalsePreservation.length, 0);
const dangerous = scored.flatMap((e) => e.comparison!.dangerousFalsePreservation.map((ref) => ({ scenario: e.id, evidence: ref })));
const unnecessary = scored.flatMap((e) => e.comparison!.unnecessaryInvalidation.map((ref) => ({ scenario: e.id, evidence: ref })));
const mean = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);

const agreement = reviewerAgreement();
const allTeamLabels = evaluations.every((e) => e.labels.provenance === 'team');

const result = {
  schema_version: '0.1.0',
  generated_at: new Date().toISOString(),
  quotable: false,
  quotable_reason: allTeamLabels
    ? 'Every expectation was authored by the team that wrote the rules. Scored against its own authors, an engine proves nothing. This becomes quotable when reviewers have recorded decisions in validation/reviews/ and the labels are adjudicated.'
    : 'Some labels are reviewed; see per-scenario provenance. Treat the aggregate as provisional until every scored scenario is adjudicated.',
  cases: cases.map((c) => ({ id: c.file.id, title: c.file.title, fictional: c.file.fictional === true, claims: c.claims.length, evidence: c.evidenceRefs.length, scenarios: c.scenarios.length })),
  coverage: { required: REQUIRED_COVERAGE.length, present: REQUIRED_COVERAGE.filter((r) => evaluations.some((e) => e.id.endsWith('/' + r))).length },
  metrics: {
    scenarios_total: evaluations.length,
    scenarios_scored: scored.length,
    scenarios_unscorable: evaluations.length - scored.length,
    invalidation_precision: tp + fp === 0 ? null : tp / (tp + fp),
    invalidation_recall: tp + fn === 0 ? null : tp / (tp + fn),
    dangerous_false_preservation: fn,
    unnecessary_invalidation: fp,
    evidence_preserved_share: mean(scored.map((e) => e.comparison!.evidencePreservedShare)),
    tests_avoided_share: mean(scored.map((e) => e.comparison!.testsAvoidedShare)),
    permit_ceiling_matches: scored.filter((e) => e.comparison!.ceilingMatches).length,
    suspension_matches: scored.filter((e) => e.comparison!.suspensionMatches).length,
    disagreements_pointing_at_engine_rules: scored.filter((e) => e.comparison!.pointsAt === 'engine_rules').length,
    disagreements_pointing_at_a_case_graph: scored.filter((e) => e.comparison!.pointsAt === 'case_graph').length,
  },
  dangerous_false_preservation: dangerous,
  unnecessary_invalidation: unnecessary,
  reviewer_agreement: agreement,
  scenarios: evaluations,
};

const outIndex = process.argv.indexOf('--out');
const outDir = outIndex >= 0 ? resolve(process.argv[outIndex + 1]) : join(validationDir, 'results');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'latest.json'), `${JSON.stringify(result, null, 2)}\n`);

// ---- report ----------------------------------------------------------------
const pct = (n: number | null) => (n === null ? '—' : `${(n * 100).toFixed(0)}%`);
const md: string[] = [];
md.push('<!-- Generated by cli/validate-method.ts. Do not edit. -->');
md.push('# Method validation result', '');
md.push(`Generated ${result.generated_at}`, '');
md.push('> **Not quotable.** ' + result.quotable_reason, '');
md.push('## Scope', '');
md.push('| Case | Claims | Evidence | Scenarios |', '|---|---|---|---|');
for (const c of result.cases) md.push(`| ${c.title}${c.fictional ? ' (fictional)' : ''} | ${c.claims} | ${c.evidence} | ${c.scenarios} |`);
md.push('', `Required change types covered: ${result.coverage.present} of ${result.coverage.required}.`, '');
md.push('## Headline', '');
md.push('| Metric | Value |', '|---|---|');
md.push(`| **Dangerous false preservation** | **${result.metrics.dangerous_false_preservation}** |`);
md.push(`| Unnecessary invalidation | ${result.metrics.unnecessary_invalidation} |`);
md.push(`| Invalidation precision | ${pct(result.metrics.invalidation_precision)} |`);
md.push(`| Invalidation recall | ${pct(result.metrics.invalidation_recall)} |`);
md.push(`| Evidence preserved, mean | ${pct(result.metrics.evidence_preserved_share)} |`);
md.push(`| Tests avoided, mean | ${pct(result.metrics.tests_avoided_share)} |`);
md.push(`| Permit ceiling agrees | ${result.metrics.permit_ceiling_matches} of ${result.metrics.scenarios_scored} |`);
md.push(`| Suspension decision agrees | ${result.metrics.suspension_matches} of ${result.metrics.scenarios_scored} |`);
md.push(`| Disagreements pointing at the taxonomy | ${result.metrics.disagreements_pointing_at_engine_rules} |`);
md.push(`| Disagreements pointing at a case author's graph | ${result.metrics.disagreements_pointing_at_a_case_graph} |`);
md.push(`| Scenarios scored | ${result.metrics.scenarios_scored} of ${result.metrics.scenarios_total} |`);
md.push('');
md.push('Dangerous false preservation is evidence the engine kept that the expectation says should have been reassessed. It is the number to read first: work avoided is trivially inflated by invalidating nothing.', '');

if (dangerous.length > 0) {
  md.push('### Evidence preserved that the expectation would reassess', '');
  for (const d of dangerous) md.push(`- \`${d.evidence}\` in **${d.scenario}**`);
  md.push('', 'Each is either a defect in the rules or an expectation that is wrong. An external reviewer decides which; until then neither reading is established.', '');
}

const unscorable = evaluations.filter((e) => !e.evaluated);
if (unscorable.length > 0) {
  md.push('## Capability gaps the pack exposes', '');
  md.push('These scenarios describe things that happen to real deployments and that the engine has no input for. They are specifications, not failures — and they cannot be scored.', '');
  md.push('| Scenario | Family | Capability | Why it cannot be scored |', '|---|---|---|---|');
  for (const e of unscorable) md.push(`| ${e.id} | ${e.family} | ${e.capability} | ${e.reason} |`);
  md.push('');
}

md.push('## Per scenario', '');
md.push('| Scenario | Labels | Engine ceiling | Expected | Suspends | Missed claims | Over-reached | False preservation | Points at |', '|---|---|---|---|---|---|---|---|---|');
for (const e of evaluations) {
  if (!e.evaluated) { md.push(`| ${e.id} | ${e.labels.provenance} | not evaluable | ${e.expected.permit_ceiling} | — | — | — | — | — |`); continue; }
  const c = e.comparison!;
  md.push(`| ${e.id} | ${e.labels.provenance} | ${e.engine!.ceiling} | ${e.expected.permit_ceiling} | ${e.engine!.suspendPendingReassessment ? 'yes' : 'no'}${c.suspensionMatches ? '' : ' (expected ' + (e.expected.suspend_pending_reassessment ? 'yes' : 'no') + ')'} | ${c.claimsMissed.join(', ') || '—'} | ${c.claimsOverreached.join(', ') || '—'} | ${c.dangerousFalsePreservation.join(', ') || 'none'} | ${c.pointsAt ?? '—'} |`);
}
md.push('');
md.push('## Reviewer agreement', '');
md.push(agreement.files === 0 ? agreement.note : `${agreement.files} reviewer file(s). ${agreement.note}`);
md.push('');
md.push('## How to review this', '');
md.push('See [validation/README.md](../README.md). Copy `reviews/REVIEW-TEMPLATE.json`, record your own answer per scenario before reading the engine column above, and open a pull request.');
md.push('');
writeFileSync(join(outDir, 'latest.md'), `${md.join('\n')}\n`);

// ---- console ---------------------------------------------------------------
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log('');
  console.log('METHOD VALIDATION');
  console.log('='.repeat(72));
  console.log(`  Cases                        ${result.cases.length}`);
  console.log(`  Scenarios                    ${result.metrics.scenarios_total} (${result.metrics.scenarios_scored} scored, ${result.metrics.scenarios_unscorable} not evaluable by the engine)`);
  console.log(`  Required change types        ${result.coverage.present} of ${result.coverage.required}`);
  console.log('');
  console.log(`  DANGEROUS FALSE PRESERVATION ${result.metrics.dangerous_false_preservation}`);
  console.log(`  Unnecessary invalidation     ${result.metrics.unnecessary_invalidation}`);
  console.log(`  Invalidation precision       ${pct(result.metrics.invalidation_precision)}`);
  console.log(`  Invalidation recall          ${pct(result.metrics.invalidation_recall)}`);
  console.log(`  Evidence preserved, mean     ${pct(result.metrics.evidence_preserved_share)}`);
  console.log(`  Tests avoided, mean          ${pct(result.metrics.tests_avoided_share)}`);
  console.log(`  Permit ceiling agrees        ${result.metrics.permit_ceiling_matches} of ${result.metrics.scenarios_scored}`);
  console.log(`  Suspension decision agrees   ${result.metrics.suspension_matches} of ${result.metrics.scenarios_scored}`);
  console.log('');
  for (const e of scored) {
    const c = e.comparison!;
    const flag = c.dangerousFalsePreservation.length > 0 ? '  !!' : (c.claimsMissed.length > 0 || !c.ceilingMatches ? '   ?' : '    ');
    console.log(`${flag} ${e.id.padEnd(44)} ceiling ${e.engine!.ceiling.padEnd(22)} expected ${e.expected.permit_ceiling}`);
    if (c.claimsMissed.length > 0) console.log(`       claims the engine did not reach: ${c.claimsMissed.join(', ')}`);
    if (c.dangerousFalsePreservation.length > 0) console.log(`       EVIDENCE PRESERVED THAT SHOULD BE REASSESSED: ${c.dangerousFalsePreservation.join(', ')}`);
  }
  console.log('');
  console.log('  NOT QUOTABLE while labels are the team\'s own. See validation/README.md.');
  console.log(`  Written: validation/results/latest.json and latest.md`);
  console.log('');
}

if (problems.length > 0) {
  console.log('STRUCTURAL PROBLEMS');
  for (const p of problems) console.log(`  FAIL  ${p}`);
  console.log('');
  process.exitCode = 1;
}
