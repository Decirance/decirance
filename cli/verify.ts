/**
 * Verification harness.
 *
 * Asserts the properties the method depends on, not just that the code runs.
 * Each check names the failure it exists to catch, because a test whose purpose
 * is unclear gets deleted the first time it becomes inconvenient.
 *
 * Run: npm test
 */

import {
  checkContextCompatibility,
  computeDelta,
  diffMcpServers,
  diffPassports,
  fingerprintMcpServer,
  recommend,
  resolveTransition,
  verifyAttestation,
  buildAttestation,
  EXAMPLE_CLAIMS,
  EXAMPLE_CONTEXT_CONTRACT,
  EXAMPLE_EDGES,
  EXAMPLE_EVIDENCE,
  EXAMPLE_MCP_SERVERS,
  EXAMPLE_MCP_SERVERS_POISONED,
  EXAMPLE_OBLIGATIONS,
  EXAMPLE_PASSPORT_HASHES,
  EXAMPLE_PASSPORT_V3,
  EXAMPLE_PASSPORT_V4_CYBER,
  EXAMPLE_PASSPORT_V4_POISONING,
  type PassportSnapshot,
} from '../src/index.ts';

let failures = 0;
function check(name: string, condition: boolean, because: string): void {
  if (condition) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}`);
    console.log(`        ${because}`);
  }
}

const evidence = EXAMPLE_EVIDENCE.map((e) => ({ ref: e.ref, scopePassportHash: e.scopePassportHash }));

function delta(to: PassportSnapshot, unclassified: string[] = []) {
  const diff = diffPassports(EXAMPLE_PASSPORT_V3, to);
  return computeDelta({
    claims: EXAMPLE_CLAIMS,
    evidence,
    edges: EXAMPLE_EDGES,
    changes: diff.changes,
    unclassifiedFields: unclassified,
    obligations: EXAMPLE_OBLIGATIONS,
    currentPassportHash: EXAMPLE_PASSPORT_HASHES.v4,
  });
}

console.log('\nDECIRANCE VERIFICATION');
console.log('='.repeat(72));

console.log('\nDelta engine');
const noChange = delta(EXAMPLE_PASSPORT_V3);
check('no change preserves everything except standing contradictions',
  noChange.summary.invalidated === 0,
  'A passport compared with itself invalidated something. Invalidation must follow a change.');

const cyber = delta(EXAMPLE_PASSPORT_V4_CYBER);
check('a write permission invalidates least-privilege and approval-gate claims',
  cyber.outcomes.find((o) => o.claimRef === 'C-02')?.impact === 'invalidated' &&
  cyber.outcomes.find((o) => o.claimRef === 'C-01')?.impact === 'invalidated',
  'The central worked example no longer produces its documented result.');

check('retrieval-scope evidence survives a permission change',
  cyber.outcomes.find((o) => o.claimRef === 'C-03')?.impact === 'preserved',
  'Selective re-assurance is the product. If unrelated evidence dies, it is a full reassessment wearing a costume.');

check('deterministic: identical inputs give identical output',
  JSON.stringify(delta(EXAMPLE_PASSPORT_V4_CYBER)) === JSON.stringify(cyber),
  'The engine gates a permit a named human signs. It must be reproducible.');

const failClosed = delta(EXAMPLE_PASSPORT_V4_CYBER, ['someUnknownField']);
check('an unclassified change forces full reassessment',
  failClosed.fullReassessmentRequired && failClosed.summary.preserved === 0,
  'Treating an unrecognised change as harmless is the one failure this must never produce.');

console.log('\nEvidence semantics');
check('one artefact can be invalidated for one claim and preserved for another',
  cyber.outcomes.some((o) => o.invalidatedEvidenceRefs.includes('E-093')) &&
  cyber.outcomes.some((o) => o.preservedEvidenceRefs.includes('E-093')),
  'Validity is a property of the evidence-to-claim edge, not of the artefact.');

check('a surviving contradiction outranks surviving support',
  cyber.outcomes.find((o) => o.claimRef === 'C-04')?.impact === 'challenged',
  'A volume of weak support must not bury one credible contradictory result.');

console.log('\nMCP fingerprinting');
const before = EXAMPLE_MCP_SERVERS[0];
const after = EXAMPLE_MCP_SERVERS_POISONED.find((s) => s.name === before.name)!;
check('a description-only change moves the fingerprint',
  fingerprintMcpServer(before) !== fingerprintMcpServer(after),
  'A tool description is instruction surface. If it is outside the fingerprint, the likeliest MCP attack is invisible.');

check('the poisoned server is otherwise identical',
  before.endpoint === after.endpoint && before.version === after.version &&
  JSON.stringify(before.scopes) === JSON.stringify(after.scopes),
  'The example must actually demonstrate the quiet case, not a noisy one.');

const mcpFindings = diffMcpServers(EXAMPLE_MCP_SERVERS, EXAMPLE_MCP_SERVERS_POISONED);
check('a description change is its own finding kind',
  mcpFindings.some((f) => f.kind === 'tool_description_changed'),
  'Folding it into a generic server change loses the distinction that makes the delta useful.');

console.log('\nContext compatibility');
const breach = checkContextCompatibility(EXAMPLE_PASSPORT_V4_CYBER, EXAMPLE_CONTEXT_CONTRACT);
check('a prohibited capability is a breach, not a gap',
  breach.redLines.length > 0 && !breach.compatible,
  'A contract red line the agent actually holds must cap the recommendation at reject.');

check('the baseline passport sits inside its contract',
  checkContextCompatibility(EXAMPLE_PASSPORT_V3, EXAMPLE_CONTEXT_CONTRACT).compatible,
  'The reference case must start in a coherent state.');

console.log('\nRecommendation rules');
const rejected = recommend({
  claims: [{ ref: 'C-01', state: 'supported', critical: true }],
  redLines: breach.redLines,
});
check('a red-line breach caps at reject regardless of claim support',
  rejected.recommendation === 'reject' && rejected.bindingRule?.rule === 'R1.red_line_breach',
  'Ceilings must not be liftable by good findings elsewhere.');

check('an empty assurance case justifies nothing',
  recommend({ claims: [] }).recommendation === 'reject',
  'Defaulting to approve in the absence of evidence would invert the product premise.');

console.log('\nPermit lifecycle');
check('an illegal transition is refused with alternatives',
  resolveTransition('suspended', 'approve').ok === false,
  'A suspended permit must not be reactivated by an approval trigger.');

check('a terminal state accepts nothing',
  resolveTransition('revoked', 'renew').ok === false,
  'Revoked authority must not be renewable in place.');

console.log('\nAttestation');
const attestation = buildAttestation({
  permitRef: 'DP-TEST', passportDigest: 'fnv1a:0000', caseVersion: 'v1',
  recommendation: 'approve_with_conditions', decision: 'active',
  conditions: ['Human approval before external send'], residualRisksAccepted: ['RR-02'],
  actor: 'Ari Rios', role: 'Accountable owner', at: '2026-09-03T00:00:00.000Z',
});
check('an unaltered attestation verifies', verifyAttestation(attestation),
  'A freshly built record must validate against its own digest.');

check('an altered attestation does not verify',
  !verifyAttestation({ ...attestation, decision: 'production' }),
  'Tamper evidence is the only integrity property this record claims.');

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} CHECK(S) FAILED.`}\n`);
process.exitCode = failures === 0 ? 0 : 1;
