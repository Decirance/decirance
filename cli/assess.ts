// SPDX-License-Identifier: Apache-2.0
/**
 * Assess a Deployment Case: what the evidence supports, and what follows.
 *
 * Takes the four documents a case is made of and answers the question the
 * product exists for — may this agent operate in this context, on this
 * evidence — without inventing anything to fill a gap.
 *
 * ## Evidence carries the configuration it was collected against
 *
 * Every piece of evidence names the digest of the Agent Passport it was
 * collected under. When that is not the Passport in front of us, the question
 * is not "is this stale" but "did the change between those two Passports sever
 * the link between this evidence and the claim it supports".
 *
 * Staleness alone must not invalidate: after any change every artefact predates
 * the new Passport, so treating staleness as invalidation marks the whole case
 * invalid and destroys the selectivity this product exists to provide. So the
 * prior Passport is looked up — in `history/`, or named with `--since` — the
 * delta is computed, and only evidence whose edge the change severs is counted
 * as invalidated. Evidence whose provenance cannot be established at all is
 * counted as invalidated, because an unplaceable result is not a reliable one.
 *
 * ## It cannot approve anything
 *
 * This command produces a recommendation, never a decision. The rules are the
 * specification's, applied deterministically: with no claims at all the answer
 * is `reject`, because an empty assurance case justifies nothing. Taking the
 * decision is `decirance permit`, which requires a named human.
 *
 * Run: npx decirance assess [dir] [--json] [--require <level>]
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  computeDelta,
  deriveClaimState,
  diffPassports,
  parsePassport,
  passportDigest,
  recommend,
  validateSubmission,
  type ClaimState,
  type DeltaInput,
  type DeltaResult,
  type PassportSnapshot,
  type EvidenceSubmission,
  type IngestIssue,
  type Recommendation,
  type RecommendationResult,
} from '../src/index.ts';

const CASE_FILES = {
  passport: 'agent-passport.json',
  graph: 'assurance-graph.json',
  manifest: 'evidence-manifest.json',
  contract: 'context-contract.json',
} as const;

/** Most permissive first. `--require` compares against this order. */
const LEVELS: Recommendation[] = ['approve', 'approve_with_conditions', 'supervised_pilot', 'reject'];

interface GraphEdgeDoc { kind: string; sourceRef: string; targetRef: string; severedBy?: string[] }
interface GraphClaimDoc {
  ref: string; statement: string; domain?: string; critical?: boolean;
  /**
   * An approver's acceptance of a mitigation for a challenged claim.
   *
   * Only counted when it names who accepted it and why. An acceptance with no
   * accountable name attached is the most consequential blank field in an
   * assurance case: it is the one that turns a contradicted critical claim into
   * a permit.
   */
  mitigation?: { accepted?: boolean; accepted_by?: string; rationale?: string };
}
interface ManifestEvidenceDoc {
  ref: string; title: string; detail?: string; source_kind?: string;
  scope_passport_digest?: string; scope_contract_digest?: string;
  collected_at?: string; collected_by?: string; quality?: Record<string, number>;
  valid_until?: string; limitations?: string[];
}

export interface EvidenceVerdict {
  ref: string;
  title: string;
  /**
   * accepted            collected against this Passport
   * carried_forward     collected earlier; the change did not sever its edge
   * severed_by_change   the change severed the link to the claim it supported
   * unplaceable         scoped to a Passport nobody has, so it cannot be judged
   * rejected            refused at ingest, before any of the above
   */
  status: 'accepted' | 'carried_forward' | 'severed_by_change' | 'unplaceable' | 'rejected';
  /** The change kinds that severed it, when it was severed. */
  severedBy?: string[];
  scopeDigest?: string;
  issues: IngestIssue[];
  warnings: IngestIssue[];
  supports: string[];
  contradicts: string[];
}

export interface ClaimVerdict {
  ref: string;
  statement: string;
  state: ClaimState;
  critical: boolean;
  supporting: number;
  challenging: number;
  invalidated: number;
  mitigationAccepted: boolean;
  mitigationAcceptedBy?: string;
  /** Present when a mitigation is claimed but does not name an acceptor or a reason. */
  mitigationIgnored?: string;
}

export interface Assessment {
  dir: string;
  passportDigest: string;
  passportWarnings: string[];
  claims: ClaimVerdict[];
  evidence: EvidenceVerdict[];
  result: RecommendationResult;
  counts: { accepted: number; carriedForward: number; severed: number; unplaceable: number; rejected: number };
  /** One per prior Passport the evidence was resolved through. */
  changesApplied: Array<{ from: string; changes: string[]; fullReassessment: boolean }>;
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * Passports this case has run on before, by digest.
 *
 * `history/` is written by nothing yet — `decirance apply` puts the outgoing
 * Passport there — and `--since` names one directly, which is what somebody
 * who keeps their Passports in version control will use.
 *
 * A Passport that does not parse is skipped rather than fatal: a broken file in
 * the history should not stop today's assessment, and the evidence scoped to it
 * stays unplaceable, which is the conservative answer.
 */
function priorPassports(root: string, since?: string): Map<string, PassportSnapshot> {
  const out = new Map<string, PassportSnapshot>();
  const candidates: string[] = [];

  const historyDir = join(root, 'history');
  if (existsSync(historyDir)) {
    for (const f of readdirSync(historyDir)) if (f.endsWith('.json')) candidates.push(join(historyDir, f));
  }
  if (since) candidates.push(resolve(since));

  for (const path of candidates) {
    try {
      const parsed = parsePassport(readJson(path));
      if (parsed.ok) out.set(passportDigest(parsed.document), parsed.snapshot);
    } catch { /* unreadable or not JSON; stays unplaceable */ }
  }
  return out;
}

/**
 * Assess a case directory. Throws, with a message a person can act on, when a
 * document is missing or unparseable: a partial assessment of a case whose
 * Passport would not parse is a worse answer than refusing to give one.
 */
export function assessCase(dir: string, since?: string): Assessment {
  const root = resolve(dir);
  for (const [what, file] of Object.entries(CASE_FILES)) {
    if (what === 'contract') continue; // optional
    if (!existsSync(join(root, file))) {
      throw new Error(`${root} is not a Deployment Case: ${file} is missing.\nRun "decirance init" to create one.`);
    }
  }

  const parsed = parsePassport(readJson(join(root, CASE_FILES.passport)));
  if (!parsed.ok) {
    throw new Error(
      `${CASE_FILES.passport} did not parse:\n`
      + parsed.errors.map((e) => `  ${e.path}: ${e.message}`).join('\n'),
    );
  }
  const digest = passportDigest(parsed.document);

  const graph = readJson(join(root, CASE_FILES.graph)) as { claims?: GraphClaimDoc[]; edges?: GraphEdgeDoc[] };
  const manifest = readJson(join(root, CASE_FILES.manifest)) as { evidence?: ManifestEvidenceDoc[] };
  const claims = graph.claims ?? [];
  const edges = graph.edges ?? [];
  const evidenceDocs = manifest.evidence ?? [];

  // The manifest describes each result; the graph says which claims it speaks
  // to. Neither document alone is an ingest submission, so they are joined here
  // and the result is put through the same validation an adapter must pass.
  const evidence: EvidenceVerdict[] = evidenceDocs.map((doc) => {
    const supports = edges.filter((e) => e.kind === 'supports' && e.sourceRef === doc.ref).map((e) => e.targetRef);
    const contradicts = edges.filter((e) => e.kind === 'challenges' && e.sourceRef === doc.ref).map((e) => e.targetRef);
    const submission: Partial<EvidenceSubmission> = {
      ref: doc.ref,
      title: doc.title,
      detail: doc.detail ?? doc.title,
      sourceKind: doc.source_kind as EvidenceSubmission['sourceKind'],
      route: 'structured_import',
      scopePassportHash: doc.scope_passport_digest,
      scopeContractHash: doc.scope_contract_digest,
      collectedAt: doc.collected_at ?? '',
      owner: doc.collected_by ?? '',
      claimsSupported: supports,
      claimsContradicted: contradicts,
      quality: doc.quality ?? {},
      limitations: doc.limitations,
      validUntil: doc.valid_until,
    };
    const checked = validateSubmission(submission);
    if (!checked.ok) {
      return { ref: doc.ref, title: doc.title, status: 'rejected', scopeDigest: doc.scope_passport_digest, issues: checked.issues, warnings: [], supports, contradicts };
    }
    const inScope = checked.submission.scopePassportHash === digest;
    return {
      ref: doc.ref,
      title: doc.title,
      // Provisional. Evidence from an earlier Passport is resolved below, once
      // the delta between that Passport and this one is known.
      status: inScope ? 'accepted' : 'unplaceable',
      scopeDigest: checked.submission.scopePassportHash,
      issues: [],
      warnings: checked.warnings,
      supports,
      contradicts,
    };
  });

  /**
   * Resolve evidence from earlier Passports through the change that happened.
   *
   * One delta per prior Passport, not per evidence item: the question "what did
   * this change sever" has one answer for the whole case, and computing it
   * repeatedly would invite the answers to differ.
   */
  const priors = priorPassports(root, since);
  const deltas: Array<{ from: string; result: DeltaResult }> = [];
  const stillUnplaceable = new Set(evidence.filter((e) => e.status === 'unplaceable').map((e) => e.scopeDigest));

  for (const [priorDigest, priorSnapshot] of priors) {
    if (!stillUnplaceable.has(priorDigest)) continue;
    const changes = diffPassports(priorSnapshot, parsed.snapshot);
    const result = computeDelta({
      claims: claims as unknown as DeltaInput['claims'],
      evidence: evidence.map((e) => ({ ref: e.ref, scopePassportHash: e.scopeDigest ?? '' })) as unknown as DeltaInput['evidence'],
      edges: edges as unknown as DeltaInput['edges'],
      changes: changes.changes,
      unclassifiedFields: changes.unclassified.map((u) => u.field),
      currentPassportHash: digest,
    });
    deltas.push({ from: priorDigest, result });

    const severed = new Map<string, string[]>();
    for (const outcome of result.outcomes) {
      for (const ref of outcome.invalidatedEvidenceRefs) {
        severed.set(ref, [...new Set([...(severed.get(ref) ?? []), ...outcome.triggeredBy])]);
      }
    }
    for (const e of evidence) {
      if (e.status !== 'unplaceable' || e.scopeDigest !== priorDigest) continue;
      // A change nobody could classify fails closed: nothing carries forward.
      if (result.fullReassessmentRequired) {
        e.status = 'severed_by_change';
        e.severedBy = ['unclassified change'];
      } else if (severed.has(e.ref)) {
        e.status = 'severed_by_change';
        e.severedBy = severed.get(e.ref);
      } else {
        e.status = 'carried_forward';
      }
    }
  }

  const byRef = new Map(evidence.map((e) => [e.ref, e]));
  const usable = (ref: string) => {
    const status = byRef.get(ref)?.status;
    return status === 'accepted' || status === 'carried_forward';
  };

  const claimVerdicts: ClaimVerdict[] = claims.map((claim) => {
    const supportingRefs = edges.filter((e) => e.kind === 'supports' && e.targetRef === claim.ref).map((e) => e.sourceRef);
    const challengingRefs = edges.filter((e) => e.kind === 'challenges' && e.targetRef === claim.ref).map((e) => e.sourceRef);
    const supporting = supportingRefs.filter(usable).length;
    const challenging = challengingRefs.filter(usable).length;
    const invalidated = supportingRefs.length - supporting;

    const m = claim.mitigation;
    const named = Boolean(m?.accepted_by && m.accepted_by.trim()) && Boolean(m?.rationale && m.rationale.trim());
    const mitigationAccepted = m?.accepted === true && named;
    const mitigationIgnored = m?.accepted === true && !named
      ? 'a mitigation is marked accepted but names no acceptor or no reason, so it is not counted'
      : undefined;

    return {
      ref: claim.ref,
      statement: claim.statement,
      critical: claim.critical === true,
      supporting,
      challenging,
      invalidated,
      mitigationAccepted,
      mitigationAcceptedBy: mitigationAccepted ? m!.accepted_by : undefined,
      mitigationIgnored,
      state: deriveClaimState({ supportingEvidence: supporting, challengingEvidence: challenging, invalidatedEvidence: invalidated }),
    };
  });

  /**
   * The rules see the change, not just its result.
   *
   * Some rules turn on a claim having been invalidated *by a change* rather
   * than merely lacking support — a permit that was live when the agent changed
   * is a different situation from a case that was never supported. Omitting the
   * delta here made `assess` and `diff` answer differently about the same
   * change: supervised pilot from one, reject from the other. One of them had to
   * be wrong, and it was the one with less information.
   *
   * When several prior Passports are in play, the one forcing full reassessment
   * is passed if there is one, because it is the most restrictive.
   */
  const governing = deltas.find((d) => d.result.fullReassessmentRequired) ?? deltas[0];

  const result = recommend({
    claims: claimVerdicts.map((c) => ({
      ref: c.ref, state: c.state, critical: c.critical, mitigationAccepted: c.mitigationAccepted,
    })),
    delta: governing?.result,
  });

  return {
    dir: root,
    passportDigest: digest,
    passportWarnings: parsed.warnings ?? [],
    claims: claimVerdicts,
    evidence,
    result,
    counts: {
      accepted: evidence.filter((e) => e.status === 'accepted').length,
      carriedForward: evidence.filter((e) => e.status === 'carried_forward').length,
      severed: evidence.filter((e) => e.status === 'severed_by_change').length,
      unplaceable: evidence.filter((e) => e.status === 'unplaceable').length,
      rejected: evidence.filter((e) => e.status === 'rejected').length,
    },
    changesApplied: deltas.map((d) => ({
      from: d.from,
      changes: [...new Set(d.result.outcomes.flatMap((o) => o.triggeredBy))],
      fullReassessment: d.result.fullReassessmentRequired,
    })),
  };
}

const STATE_ORDER: ClaimState[] = ['challenged', 'unsupported', 'invalidated', 'partially_supported', 'not_assessed', 'excepted', 'supported', 'not_applicable'];

export function printAssessment(a: Assessment): void {
  console.log('');
  console.log('DEPLOYMENT CASE ASSESSMENT');
  console.log('='.repeat(72));
  console.log(`  Agent Passport   ${a.passportDigest}`);
  console.log(`  Claims           ${a.claims.length}`);
  console.log(
    `  Evidence         ${a.counts.accepted} collected against this Passport`
    + `${a.counts.carriedForward > 0 ? `, ${a.counts.carriedForward} carried forward` : ''}`
    + `${a.counts.severed > 0 ? `, ${a.counts.severed} severed by change` : ''}`
    + `${a.counts.unplaceable > 0 ? `, ${a.counts.unplaceable} unplaceable` : ''}`
    + `${a.counts.rejected > 0 ? `, ${a.counts.rejected} refused at ingest` : ''}`,
  );
  console.log('');

  for (const applied of a.changesApplied) {
    console.log(`  Change since ${applied.from.slice(0, 20)}…`);
    console.log(`    ${applied.changes.length > 0 ? applied.changes.join(', ') : 'nothing that severs an edge in this case'}`);
    if (applied.fullReassessment) {
      console.log('    A difference nobody has classified. Nothing carries forward: an');
      console.log('    unclassified change could sever anything, so it is treated as severing all.');
    }
    console.log('');
  }

  if (a.counts.severed > 0) {
    console.log('  Evidence the change severed — re-collect these against the new Passport:');
    for (const e of a.evidence.filter((x) => x.status === 'severed_by_change')) {
      console.log(`    ${e.ref.padEnd(7)} ${e.title}`);
      console.log(`            severed by ${(e.severedBy ?? []).join(', ')}`);
    }
    console.log('');
  }

  if (a.counts.unplaceable > 0) {
    console.log('  Evidence scoped to an Agent Passport that is not here:');
    for (const e of a.evidence.filter((x) => x.status === 'unplaceable')) {
      console.log(`    ${e.ref.padEnd(7)} ${e.title}`);
    }
    console.log('    Whether the change severed these cannot be decided without that Passport.');
    console.log('    Put it in history/, or name it with --since. Until then they support nothing.');
    console.log('');
  }

  if (a.counts.rejected > 0) {
    console.log('  Evidence refused at ingest:');
    for (const e of a.evidence.filter((x) => x.status === 'rejected')) {
      console.log(`    ${e.ref.padEnd(7)} ${e.title}`);
      for (const i of e.issues) console.log(`            ${i.field}: ${i.message}`);
    }
    console.log('');
  }

  const sorted = [...a.claims].sort((x, y) => STATE_ORDER.indexOf(x.state) - STATE_ORDER.indexOf(y.state));
  console.log('  Claims, least supported first:');
  for (const c of sorted) {
    const mark = c.critical ? '!' : ' ';
    console.log(`  ${mark} ${c.ref.padEnd(7)} ${c.state.padEnd(21)} ${c.statement.slice(0, 54)}`);
    if (c.mitigationAccepted) console.log(`            mitigation accepted by ${c.mitigationAcceptedBy}`);
    if (c.mitigationIgnored) console.log(`            ${c.mitigationIgnored}`);
  }
  console.log('    ! marks a claim whose failure is not acceptable at any level of use.');
  console.log('');

  console.log(`  RECOMMENDATION   ${a.result.recommendation.replace(/_/g, ' ')}`);
  if (a.result.bindingRule) {
    console.log(`  Because          ${a.result.bindingRule.rule}: ${a.result.bindingRule.reason}`);
    if (a.result.bindingRule.claimRefs.length > 0) {
      console.log(`  Claims           ${a.result.bindingRule.claimRefs.join(', ')}`);
    }
  }
  if (a.result.firedRules.length > 1) {
    console.log(`  Other rules      ${a.result.firedRules.slice(1).map((r) => r.rule).join(', ')}`);
  }
  if (a.result.suspendExistingPermit) {
    console.log(`  Live permit      must be suspended — ${a.result.suspensionReason ?? 'see rules above'}`);
  }
  console.log('');
  console.log('  This is a recommendation, not a decision. No permit exists until a named');
  console.log('  person takes one:  decirance permit --approver "Name" --role accountable-owner');
  console.log('');
}

export function runAssess(args: string[]): number {
  const valueFlags = ['--require', '--since'];
  const positional = args.filter((a, i) => !a.startsWith('--') && !valueFlags.includes(args[i - 1] ?? ''));
  const sinceIndex = args.indexOf('--since');
  const assessment = assessCase(positional[0] ?? 'decirance-case', sinceIndex >= 0 ? args[sinceIndex + 1] : undefined);

  if (args.includes('--json')) {
    console.log(JSON.stringify(assessment, null, 2));
  } else {
    printAssessment(assessment);
  }

  const requireIndex = args.indexOf('--require');
  if (requireIndex >= 0) {
    const wanted = args[requireIndex + 1] as Recommendation | undefined;
    if (!wanted || !LEVELS.includes(wanted)) {
      console.error(`--require needs one of: ${LEVELS.join(', ')}`);
      return 1;
    }
    if (LEVELS.indexOf(assessment.result.recommendation) > LEVELS.indexOf(wanted)) {
      console.error(`Recommendation is "${assessment.result.recommendation}", which is below the required "${wanted}".`);
      return 2;
    }
  }
  return 0;
}
