// SPDX-License-Identifier: Apache-2.0
/**
 * `decirance diff` — what changed, and what that costs.
 *
 * This is the command the project exists for. Everything else describes an
 * assurance case; this one answers the question an operator actually has when
 * something changes: given that the agent is no longer exactly what was
 * assessed, what is still valid, what is not, and what has to be re-run?
 *
 * The arithmetic is the point. "Re-approve everything" and "hope it's fine"
 * are the two options most teams have, and both are wrong for the same reason:
 * neither is derived from the dependency structure of the evidence. This
 * prints the derivation.
 *
 * A change this tool cannot classify forces full reassessment. That is the
 * conservative direction and it is deliberate: an unknown difference between
 * two configurations is a reason to look again, never a reason to proceed.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  parsePassport,
  passportDigest,
  diffPassports,
  computeDelta,
  reassessmentPlan,
  recommend,
  deriveClaimState,
  EXAMPLE_CLAIMS,
  EXAMPLE_EVIDENCE,
  EXAMPLE_EDGES,
  EXAMPLE_OBLIGATIONS,
  type ClaimNode,
  type EvidenceNode,
  type GraphEdge,
} from '../src/index.ts';

interface GraphInput {
  claims: ClaimNode[];
  evidence: EvidenceNode[];
  edges: GraphEdge[];
}

function readJson(path: string): unknown {
  const full = resolve(path);
  if (!existsSync(full)) {
    throw new Error(`No such file: ${full}`);
  }
  try {
    return JSON.parse(readFileSync(full, 'utf8'));
  } catch (e) {
    throw new Error(`${full} is not valid JSON: ${(e as Error).message}`);
  }
}

/**
 * The graph the diff is computed against.
 *
 * Defaults to the bundled reference case so `decirance diff a.json b.json`
 * does something meaningful on a fresh clone. A real case is supplied with
 * `--graph`, and the distinction is printed, because a delta computed against
 * the example case is a demonstration and must not be mistaken for one
 * computed against your own evidence.
 */
function loadGraph(path?: string): { graph: GraphInput; source: string } {
  if (!path) {
    return {
      graph: { claims: EXAMPLE_CLAIMS, evidence: EXAMPLE_EVIDENCE, edges: EXAMPLE_EDGES },
      source: 'bundled reference case (Meridian Reply Agent)',
    };
  }
  const raw = readJson(path) as Partial<GraphInput>;
  for (const key of ['claims', 'evidence', 'edges'] as const) {
    if (!Array.isArray(raw[key])) {
      throw new Error(`${path}: expected an array property "${key}".`);
    }
  }
  return {
    graph: { claims: raw.claims!, evidence: raw.evidence!, edges: raw.edges! },
    source: resolve(path),
  };
}

function rule(char = '='): string {
  return char.repeat(72);
}

export function runDiff(args: string[]): number {
  const graphIndex = args.indexOf('--graph');
  const graphPath = graphIndex >= 0 ? args[graphIndex + 1] : undefined;
  const asJson = args.includes('--json');
  // See the note in decirance.ts: guard the -1 case or the first file
  // argument is dropped.
  const positional = args.filter(
    (a, i) => !a.startsWith('--') && !(graphIndex >= 0 && i === graphIndex + 1),
  );

  if (positional.length < 2) {
    console.error('Usage: decirance diff <before.json> <after.json> [--graph <assurance-graph.json>] [--json]');
    return 1;
  }

  const before = parsePassport(readJson(positional[0]));
  const after = parsePassport(readJson(positional[1]));

  for (const [label, parsed] of [[positional[0], before], [positional[1], after]] as const) {
    if (!parsed.ok) {
      console.error(`\n${label} is not a usable Agent Passport:`);
      for (const e of parsed.errors) console.error(`  ${e.path}: ${e.message}`);
      return 1;
    }
  }
  // Narrowed by the loop above; restated so the union collapses for the compiler.
  if (!before.ok || !after.ok) return 1;

  const { graph, source } = loadGraph(graphPath);

  const diff = diffPassports(before.snapshot, after.snapshot);
  const beforeHash = passportDigest(before.document);
  const afterHash = passportDigest(after.document);

  // A field the taxonomy does not recognise is not the same as one it knows
  // and found unchanged. It forces full reassessment for the same reason an
  // unclassified difference does: nobody has decided what it means yet.
  const unknown = [...new Set([...before.unknownFields, ...after.unknownFields])];

  const delta = computeDelta({
    claims: graph.claims,
    evidence: graph.evidence,
    edges: graph.edges,
    changes: diff.changes,
    unclassifiedFields: [...diff.unclassified.map((u) => u.field), ...unknown],
    obligations: EXAMPLE_OBLIGATIONS,
    currentPassportHash: beforeHash,
  });

  // Claim states are derived from the graph *after* the change, which is the
  // only state a post-change recommendation may rest on. Evidence invalidated
  // by the change no longer counts as support, and contradicting evidence is
  // counted separately rather than netted off against it.
  const claimStates = delta.outcomes.map((o) => ({
    ref: o.claimRef,
    critical: o.critical,
    state: deriveClaimState({
      supportingEvidence: o.preservedEvidenceRefs.length,
      challengingEvidence: o.challengingEvidenceRefs.length,
      invalidatedEvidence: o.invalidatedEvidenceRefs.length,
    }),
  }));
  const recommendation = recommend({ claims: claimStates, delta });

  if (asJson) {
    console.log(JSON.stringify({
      before: { file: resolve(positional[0]), digest: beforeHash },
      after: { file: resolve(positional[1]), digest: afterHash },
      graphSource: source,
      changes: diff.changes,
      unclassified: diff.unclassified,
      unknownFields: unknown,
      requiresFullReassessment: diff.requiresFullReassessment,
      delta,
      recommendation,
    }, null, 2));
    return 0;
  }

  console.log(`\nDECIRANCE DIFF`);
  console.log(rule());
  console.log(`  before   ${resolve(positional[0])}`);
  console.log(`           ${beforeHash}`);
  console.log(`  after    ${resolve(positional[1])}`);
  console.log(`           ${afterHash}`);
  console.log(`  graph    ${source}`);
  if (!graphPath) {
    console.log('           (a demonstration — pass --graph to use your own case)');
  }

  if (beforeHash === afterHash) {
    console.log('\nThe two passports are identical. Nothing is invalidated.\n');
    return 0;
  }

  console.log('\nMaterial changes');
  if (diff.changes.length === 0) console.log('  (none classified)');
  for (const c of diff.changes) {
    console.log(`  ${c.kind}  [${c.domain}]`);
    console.log(`    ${String(c.field)}: ${c.from ?? '(unset)'} -> ${c.to ?? '(unset)'}`);
    console.log(`    ${c.description}`);
  }

  if (diff.unclassified.length > 0 || unknown.length > 0) {
    console.log('\nUnclassified differences');
    for (const u of diff.unclassified) console.log(`  ${u.field}  —  ${u.reason}`);
    for (const f of unknown) console.log(`  ${f}  —  not a field this taxonomy knows`);
    console.log('  A difference this tool cannot classify forces full reassessment.');
    console.log('  That is the conservative direction and it is deliberate.');
  }

  console.log('\nClaims');
  // reassessmentPlan orders by impact, so the work that matters most is first.
  const affected = reassessmentPlan(delta).filter((o) => o.impact !== 'preserved');
  const preserved = delta.outcomes.filter((o) => o.impact === 'preserved');
  console.log(`  ${preserved.length} preserved, ${affected.length} require attention`);
  for (const o of affected) {
    console.log(`\n  ${o.claimRef}  ${o.impact.toUpperCase()}${o.critical ? '  [critical]' : ''}`);
    console.log(`    ${o.statement}`);
    if (o.triggeredBy.length > 0) console.log(`    triggered by  ${o.triggeredBy.join(', ')}`);
    if (o.path.length > 0) console.log(`    via           ${o.path.join(' -> ')}`);
    if (o.invalidatedEvidenceRefs.length > 0) {
      console.log(`    invalidated   ${o.invalidatedEvidenceRefs.join(', ')}`);
    }
    if (o.challengingEvidenceRefs.length > 0) {
      console.log(`    contradicted by ${o.challengingEvidenceRefs.join(', ')} (still applicable)`);
    }
    for (const t of o.requiredTests) console.log(`    re-run        ${t}`);
  }

  if (delta.newObligations.length > 0) {
    console.log('\nNew obligations');
    console.log('  Work the change created that no existing claim covers.');
    for (const o of delta.newObligations) {
      console.log(`  ${o.testId}  ${o.reason ?? ''}`);
    }
  }

  // A full reassessment re-runs every distinct test the case covers. Counting
  // `requiredTests` here instead would be circular — that field is only
  // populated for claims the change affected, so "full" would always equal
  // "targeted" and the saving would always print as zero.
  const allTests = new Set(graph.claims.flatMap((c) => c.coversTests));
  const targeted = new Set([
    ...affected.flatMap((o) => o.requiredTests),
    ...delta.newObligations.map((o) => o.testId),
  ]);
  const avoided = [...allTests].filter((t) => !targeted.has(t));

  console.log('\nReassessment cost');
  console.log(`  targeted     ${targeted.size} test(s)`);
  console.log(`  full re-run  ${allTests.size} test(s) across the whole case`);
  console.log(`  avoided      ${avoided.length} test(s)`);
  console.log('  Tests avoided is a count over the graph, not an estimate.');
  console.log('  It says nothing about how long a test takes to run.');

  console.log('\nRecommendation');
  console.log(`  ${recommendation.recommendation.toUpperCase().replace(/_/g, ' ')}`);
  console.log(`  ${recommendation.rationale}`);
  if (recommendation.suspendExistingPermit) {
    console.log('\n  SUSPEND THE EXISTING PERMIT');
    console.log(`  ${recommendation.suspensionReason ?? ''}`);
  }
  if (recommendation.firedRules.length > 0) {
    console.log('\n  Rules fired, most restrictive first');
    for (const hit of recommendation.firedRules) {
      const binding = recommendation.bindingRule?.rule === hit.rule ? '  <- binding' : '';
      console.log(`    ${hit.rule}${binding}`);
      console.log(`      ${hit.reason}`);
    }
  }
  console.log('\n  Decirance produces this recommendation. It is not an approval.');
  console.log('  A named accountable owner decides whether to issue the permit.\n');

  return 0;
}
