// SPDX-License-Identifier: Apache-2.0
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
  argumentIntegrity,
  brokenAssumptions,
  checkContextCompatibility,
  checkPermitInvariant,
  claimsWithoutArgument,
  verifyConfigurationBinding,
  verifyNoAuthorityOutsideOperatingStates,
  EXAMPLE_ARGUMENT_LAYER,
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
  assessIntegrity,
  applyIntegrityGate,
  EXAMPLE_PASSPORT_V5_CONTAINMENT,
  deriveClaimState,
  type EvidenceIntegrity,
  assessEnforcement,
  assessContainment,
  CONTAINMENT_SEQUENCE,
  type EnforcementReceipt,
  type ContainmentRun,
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
  permitRef: 'DP-TEST', passportDigest: 'sha256:0000', caseVersion: 'v1',
  recommendation: 'approve_with_conditions', decision: 'active',
  conditions: ['Human approval before external send'], residualRisksAccepted: ['RR-02'],
  actor: 'Ari Rios', role: 'Accountable owner', at: '2026-09-03T00:00:00.000Z',
});
check('an unaltered attestation verifies', verifyAttestation(attestation),
  'A freshly built record must validate against its own digest.');

check('an altered attestation does not verify',
  !verifyAttestation({ ...attestation, decision: 'production' }),
  'Tamper evidence is the only integrity property this record claims.');


console.log('\nPermit invariant');
const noAuthority = verifyNoAuthorityOutsideOperatingStates();
check('no non-operating permit state can authorise an action',
  noAuthority.holds,
  `States that wrongly authorised: ${noAuthority.violations.join(', ')}. This is the one property this project can actually decide rather than sample; a hole in it grants authority.`);

const binding = verifyConfigurationBinding();
check('a permit does not authorise a configuration it was not bound to',
  binding.holds,
  `States that authorised a mismatched configuration: ${binding.violations.join(', ')}. This is the property the whole product rests on.`);

check('an action on both the permitted and prohibited lists is denied',
  !checkPermitInvariant(
    { reference: 'T', state: 'active', passportDigest: 'd', permittedActions: ['x'], prohibitedActions: ['x'], conditions: [] },
    { action: 'x', currentPassportDigest: 'd' },
  ).permitted,
  'A contradictory permit must not grant. Prohibition is checked before permission for exactly this case.');

check('an unknown running configuration denies rather than passes',
  !checkPermitInvariant(
    { reference: 'T', state: 'active', passportDigest: 'd', permittedActions: ['x'], prohibitedActions: [], conditions: [] },
    { action: 'x', currentPassportDigest: '' },
  ).permitted,
  '"We could not determine what is running" must never authorise.');

check('every failing clause is reported, not only the first',
  checkPermitInvariant(
    { reference: 'T', state: 'suspended', passportDigest: 'a', permittedActions: [], prohibitedActions: [], conditions: [{ ref: 'C1', mandatory: true, satisfied: false }] },
    { action: 'y', currentPassportDigest: 'b' },
  ).denials.length >= 4,
  'A caller fixing one denial should be able to see the others in the same result.');

console.log('\nArgument layer');
const integrity = argumentIntegrity(EXAMPLE_ARGUMENT_LAYER);
check('an unaddressed defeater stops its argument standing',
  integrity.find((a) => a.argumentRef === 'A-04')?.standing === false,
  'D-02 is an unaddressed undermining defeater on A-04. An argument with an open challenge does not stand.');

check('an argument with sound assumptions stands',
  integrity.find((a) => a.argumentRef === 'A-01')?.standing === true,
  'A-01 rests on assumptions recorded as holding and carries no open defeater.');

check('a change can break an assumption without touching any evidence',
  brokenAssumptions(EXAMPLE_ARGUMENT_LAYER.assumptions, ['tool_added']).length > 0,
  'This is the failure the argument layer exists to catch: every artefact still valid, and the reasoning they support no longer standing.');

check('claims without an argument are reported rather than assumed complete',
  claimsWithoutArgument(EXAMPLE_CLAIMS.map((c) => c.ref), EXAMPLE_ARGUMENT_LAYER).length > 0,
  'The reference argument layer is deliberately partial. Pretending otherwise would misrepresent how much work an assurance case is.');


console.log('\nEvidence integrity');

const sound: EvidenceIntegrity = {
  evidenceRef: 'E-T1', producer: 'Independent Assessor', producerIndependent: true,
  collectionPlane: 'independent', reach: {
    couldObserveEvaluation: false, couldModifyHarness: false, couldModifyScorer: false,
    couldAccessExpectedAnswers: false, couldModifyLogs: false,
  },
  appendOnlyLogs: true, tamperEvident: true, chainOfCustodyComplete: true,
  externallyCorroborated: true, allActionsCaptured: true,
};
check('evidence collected outside the agent boundary is trusted',
  assessIntegrity(sound).status === 'trusted',
  'Independent collection, tamper evidence and a complete custody chain should not be downgraded.');

check('a reachable scorer disqualifies evidence however sound it otherwise looks',
  !assessIntegrity({ ...sound, reach: { ...sound.reach, couldModifyScorer: true } }).admissibleForCriticalClaims,
  'The 2026 evaluations included attempts to manipulate the scorer. A pass an agent could write is not a pass, and no quantity of good properties beside it changes that.');

check('writable logs disqualify: absence of a record stops being evidence of absence',
  assessIntegrity({ ...sound, reach: { ...sound.reach, couldModifyLogs: true } }).status === 'compromised',
  'Agents modified accessible logs in the recorded incidents. If the agent could edit the log, a missing action is not evidence the action did not happen.');

check('unestablished integrity is unverifiable, not trusted',
  assessIntegrity({ evidenceRef: 'E-T2', producer: 'Vendor', collectionPlane: 'unknown', reach: {} }).status === 'unverifiable',
  'An imported result that never recorded where it was collected must not be read as sound. "Nobody checked" and "it is fine" are different answers.');

check('unverifiable evidence cannot carry a decision-critical claim',
  !assessIntegrity({ evidenceRef: 'E-T3', producer: 'Vendor', collectionPlane: 'unknown', reach: {} }).admissibleForCriticalClaims,
  'Compromised or unverifiable evidence must not silently support a critical claim.');

check('a human override is applied and recorded rather than applied silently',
  (() => {
    const a = assessIntegrity({ ...sound, assessedStatus: 'contested', assessedBy: 'A. Reviewer' });
    return a.status === 'contested' && a.findings.some((f) => f.code === 'human_override');
  })(),
  'An assessor may know something the fields do not capture, but an override that leaves no trace is indistinguishable from a bug.');

check('a critical claim losing all admissible support is named',
  applyIntegrityGate(
    [{ evidenceRef: 'E-X', producer: 'agent', collectionPlane: 'self_reported', reach: { couldModifyLogs: true } }],
    [{ evidenceRef: 'E-X', claimRef: 'C-99', critical: true }],
  ).criticalClaimsUndermined.length === 1,
  'The failure mode is a claim that still looks supported by artefacts nobody can vouch for. It has to be named, not merely down-weighted.');

console.log('\nContainment failure');

const containmentDiff = diffPassports(EXAMPLE_PASSPORT_V3, EXAMPLE_PASSPORT_V5_CONTAINMENT);
const containmentDelta = computeDelta({
  claims: EXAMPLE_CLAIMS, evidence: EXAMPLE_EVIDENCE, edges: EXAMPLE_EDGES,
  changes: containmentDiff.changes,
  unclassifiedFields: containmentDiff.unclassified.map((u) => u.field),
  obligations: EXAMPLE_OBLIGATIONS, currentPassportHash: EXAMPLE_PASSPORT_HASHES.v3,
});
const impactOf = (ref: string) => containmentDelta.outcomes.find((o) => o.claimRef === ref)?.impact;

check('the containment surface is fully classified, forcing no blanket reassessment',
  containmentDiff.unclassified.length === 0 && containmentDiff.changes.length >= 8,
  'Every containment field must be in the taxonomy. An unclassified one fails closed to full reassessment, which is safe but destroys the selective-reassessment claim.');

check('opening an egress path invalidates egress containment',
  impactOf('C-15') === 'invalidated',
  'A shared proxy with internet reachability is exactly the change the egress evidence was collected to exclude.');

check('moving logs into the agent plane invalidates evaluation integrity',
  impactOf('C-17') === 'invalidated',
  'This is the incident lesson: the agent gained reach over the record of its own behaviour, without any change to the agent itself.');

check('injection evidence survives a containment change',
  impactOf('C-12') === 'preserved',
  'Selective reassessment is only worth anything if unrelated evidence is preserved. A containment change must not invalidate retrieval-injection evidence.');

check('a containment change suspends the permit',
  recommend({
    claims: containmentDelta.outcomes.map((o) => ({
      ref: o.claimRef, critical: o.critical,
      state: deriveClaimState({
        supportingEvidence: o.preservedEvidenceRefs.length,
        challengingEvidence: o.challengingEvidenceRefs.length,
        invalidatedEvidence: o.invalidatedEvidenceRefs.length,
      }),
    })),
    delta: containmentDelta,
  }).suspendExistingPermit,
  'Critical containment claims invalidated by a change must not leave a live permit standing.');

check('the change generates evidence-integrity work, not only re-tests',
  containmentDelta.newObligations.some((o) => o.testId === 'evidence-integrity-review'),
  'A change of log plane does not invalidate the tests; it invalidates the record of them. The obligation differs and the plan must say so.');


console.log('\nEnforcement receipts');

const NOW = '2026-09-03T12:00:00.000Z';
const liveReceipt: EnforcementReceipt = {
  permitRef: 'DEC-2026-0001', conditionRef: 'K-01', target: 'agent-gateway',
  externalPolicyId: 'AG-0042', policyDigest: 'sha256:aa', observedConfigDigest: 'sha256:aa',
  acknowledgedAt: '2026-09-03T09:00:00.000Z', lastHeartbeatAt: '2026-09-03T11:58:00.000Z',
  failureMode: 'fail_closed',
};
const conditions = [{ ref: 'K-01', mandatory: true }, { ref: 'K-02', mandatory: true }];

check('a condition with no receipt is unenforced, never assumed satisfied',
  assessEnforcement('DEC-2026-0001', conditions, [liveReceipt], { now: NOW })
    .unenforcedConditions.includes('K-02'),
  'Absence of evidence about enforcement is not evidence of enforcement. A condition nobody sent anywhere is a sentence in a document.');

check('a permit is not fully enforced while any mandatory condition is unenforced',
  !assessEnforcement('DEC-2026-0001', conditions, [liveReceipt], { now: NOW }).fullyEnforced,
  '"Authorised" and "authorised and enforced" are different claims, and the second must never be inferred from the first.');

check('an acknowledged policy running a different configuration reads as drifted, not enforced',
  assessEnforcement('DEC-2026-0001', [{ ref: 'K-01', mandatory: true }],
    [{ ...liveReceipt, observedConfigDigest: 'sha256:bb' }], { now: NOW })
    .assessments[0].status === 'drifted',
  'A live target running the wrong policy is a worse finding than a quiet one, and must not be hidden behind a healthy heartbeat.');

check('a lapsed heartbeat is stale rather than enforced',
  assessEnforcement('DEC-2026-0001', [{ ref: 'K-01', mandatory: true }],
    [{ ...liveReceipt, lastHeartbeatAt: '2026-09-03T09:05:00.000Z' }], { now: NOW })
    .assessments[0].status === 'stale',
  'A control that stopped reporting three hours ago is not known to be enforcing anything.');

check('a fail-open control that is not in force is reported as a permissive gap',
  assessEnforcement('DEC-2026-0001', [{ ref: 'K-01', mandatory: true }],
    [{ ...liveReceipt, lastHeartbeatAt: undefined, failureMode: 'fail_open' }], { now: NOW })
    .permissiveGaps.includes('K-01'),
  'A fail-open control that has lost its heartbeat is not merely unmonitored, it is permissive. That is worse than fail-closed in the same state and must be surfaced separately.');

check('every mandatory condition enforced and reporting is fully enforced',
  assessEnforcement('DEC-2026-0001', [{ ref: 'K-01', mandatory: true }], [liveReceipt], { now: NOW })
    .fullyEnforced,
  'The positive case must be reachable, or the distinction is theatre.');

console.log('\nContainment');

const fullRun: ContainmentRun = {
  permitRef: 'DEC-2026-0001', trigger: 'egress containment invalidated',
  startedAt: '2026-09-03T12:00:00.000Z', completedAt: '2026-09-03T12:04:12.000Z',
  steps: CONTAINMENT_SEQUENCE.map((action) => ({
    action, outcome: 'done' as const, verifiedBy: 'platform-security', at: NOW,
  })),
};
check('a complete, verified run is contained',
  assessContainment(fullRun).state === 'contained',
  'The positive case must be reachable.');

check('a step reported done with nothing verifying it does not count as contained',
  assessContainment({
    ...fullRun,
    steps: fullRun.steps.map((s) =>
      s.action === 'revoke_credentials' ? { ...s, verifiedBy: undefined } : s),
  }).state === 'partial',
  'Self-reported success is how an agent’s own infrastructure tells you it stopped the agent. That is exactly the evidence class this project distrusts elsewhere, and containment is not an exception.');

check('skipping steps entirely leaves containment partial, not successful',
  assessContainment({ ...fullRun, steps: [fullRun.steps[0]] }).state === 'partial',
  'A suspension that stopped the scheduler and left credentials live has not contained anything.');

check('a failed step makes the whole run failed',
  assessContainment({
    ...fullRun,
    steps: fullRun.steps.map((s) =>
      s.action === 'block_egress' ? { ...s, outcome: 'failed' as const } : s),
  }).state === 'failed',
  'One unrevoked path is enough. Containment does not average.');

check('detection-to-containment time is measured',
  (assessContainment(fullRun).elapsedMs ?? 0) > 0,
  'The research questions require containment latency as a measured quantity, not an assertion.');

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} CHECK(S) FAILED.`}\n`);
process.exitCode = failures === 0 ? 0 : 1;
