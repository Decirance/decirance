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
  checkProportionality,
  assessCriticality,
  checkDelegation,
  checkToolAuthority,
  findCompositionalRisks,
  type AuthorityGrant,
  type ToolAuthorityContract,
  checkDelegationChain,
  checkSiblings,
} from '../src/index.ts';

let failures = 0;

interface CheckRecord { name: string; passed: boolean; because: string; }
const results: Array<{ property: string; checks: CheckRecord[] }> = [];
let current = 'general';

/** Start a group. Each group is an assurance property, not a folder. */
function section(property: string): void {
  current = property;
  results.push({ property, checks: [] });
  console.log('');
  console.log(property);
}

function check(name: string, condition: boolean, because: string): void {
  if (results.length === 0) results.push({ property: current, checks: [] });
  results[results.length - 1].checks.push({ name, passed: condition, because });
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

section('DECIRANCE VERIFICATION');
console.log('='.repeat(72));

section('Delta engine');
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

section('Evidence semantics');
check('one artefact can be invalidated for one claim and preserved for another',
  cyber.outcomes.some((o) => o.invalidatedEvidenceRefs.includes('E-093')) &&
  cyber.outcomes.some((o) => o.preservedEvidenceRefs.includes('E-093')),
  'Validity is a property of the evidence-to-claim edge, not of the artefact.');

check('a surviving contradiction outranks surviving support',
  cyber.outcomes.find((o) => o.claimRef === 'C-04')?.impact === 'challenged',
  'A volume of weak support must not bury one credible contradictory result.');

section('MCP fingerprinting');
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

section('Context compatibility');
const breach = checkContextCompatibility(EXAMPLE_PASSPORT_V4_CYBER, EXAMPLE_CONTEXT_CONTRACT);
check('a prohibited capability is a breach, not a gap',
  breach.redLines.length > 0 && !breach.compatible,
  'A contract red line the agent actually holds must cap the recommendation at reject.');

check('the baseline passport sits inside its contract',
  checkContextCompatibility(EXAMPLE_PASSPORT_V3, EXAMPLE_CONTEXT_CONTRACT).compatible,
  'The reference case must start in a coherent state.');

section('Recommendation rules');
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

section('Permit lifecycle');
check('an illegal transition is refused with alternatives',
  resolveTransition('suspended', 'approve').ok === false,
  'A suspended permit must not be reactivated by an approval trigger.');

check('a terminal state accepts nothing',
  resolveTransition('revoked', 'renew').ok === false,
  'Revoked authority must not be renewable in place.');

section('Attestation');
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


section('Permit invariant');
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

section('Argument layer');
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


section('Evidence integrity');

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

section('Containment failure');

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


section('Enforcement receipts');

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

section('Containment');

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


section('Proportionality and criticality');

check('assurance cannot begin before the deployment is justified',
  !checkProportionality({ desiredOutcome: 'Draft replies faster' }).mayProceed,
  'A process that starts from the agent existing can only answer "how safely", never "whether". By the time a case is built the second question has been decided by default.');

const fullProposal = {
  desiredOutcome: 'Reduce case reply time', affectedUsers: ['casework'],
  expectedBenefit: '30% faster first response',
  whyAgentIsNeeded: 'Free-text triage no rules engine handles',
  nonAgentAlternative: 'Template macros; rejected, cannot read case history',
  whyThisAutonomy: 'Drafting only; a human sends', owner: 'Head of Casework',
  accountableSponsor: 'Director of Operations',
};
check('a fully justified proposal may proceed',
  checkProportionality(fullProposal).mayProceed,
  'The gate must be passable, or it is an obstacle rather than a check.');

const modest = {
  autonomy: 1, privilege: 1, dataSensitivity: 1, reversibility: 1, operationalReach: 1,
  speed: 1, fanOut: 0, financialAuthority: 0, affectedPopulation: 0, consequenceOfFailure: 1,
} as const;

check('a modest deployment lands in a low tier',
  ['T1_limited', 'T2_standard'].includes(assessCriticality(modest).tier),
  'Proportionality means low-risk deployments must be able to attract low-tier requirements.');

check('a safety consequence escalates regardless of an otherwise modest profile',
  assessCriticality({ ...modest, consequenceOfFailure: 3 }).tier === 'T4_critical',
  'A weighted sum would average a serious property away. An agent that can affect safety is not mid-tier because everything else about it is small.');

check('unbounded spawning escalates on its own',
  assessCriticality({ ...modest, fanOut: 3 }).escalatingFactors.some((e) => e.factor === 'fanOut'),
  'Parallel instances multiply every other factor and defeat per-instance review. 17,600 actions is the same decision taken 17,600 times before anyone looked.');

check('the tier is always accompanied by its contributing factors',
  assessCriticality(modest).contributions.length === 10 && assessCriticality(modest).reasoning.length > 0,
  'A bare tier is the unexplained aggregate this product argues against. A number that hides its derivation is a trust score wearing a different hat.');

section('Authority and delegation');

const parentGrant: AuthorityGrant = {
  ref: 'AG-01', agentIdentity: 'svc-meridian-reply', actingFor: 'org:meridian',
  mode: 'organisation_delegated', businessOwner: 'Casework', technicalOwner: 'AI Platform',
  accountableSponsor: 'Director of Operations', purpose: 'Draft case replies',
  permittedResources: ['case-store'], permittedActions: ['case:read', 'draft:create'],
  prohibitedActions: ['case:delete'], identityProvider: 'entra', credentialType: 'oidc',
  tokenAudience: 'api://case-store', scopes: ['case.read'], credentialLifetimeSeconds: 900,
  grantStart: '2026-06-01', grantExpiry: '2027-03-31', maySpawnSubAgents: true,
  maxDelegationDepth: 2, maxChildAgents: 4, evidenceRefs: ['E-143'],
};

check('a child cannot hold authority its parent lacks',
  !checkDelegation({ ...parentGrant, ref: 'AG-02', delegationParent: 'AG-01',
    permittedActions: [...parentGrant.permittedActions, 'case:write'] }, parentGrant).valid,
  'Authority may only narrow as it is delegated. A sub-agent spawned with a broader scope looks exactly like a correct one until it acts.');

check('a child cannot drop a prohibition it inherited',
  !checkDelegation({ ...parentGrant, ref: 'AG-03', delegationParent: 'AG-01',
    prohibitedActions: [] }, parentGrant).valid,
  'Otherwise prohibiting an action means only that the parent will not do it personally.');

check('a properly narrowed child is valid',
  checkDelegation({ ...parentGrant, ref: 'AG-04', delegationParent: 'AG-01',
    permittedActions: ['case:read'], scopes: [] }, parentGrant).valid,
  'Narrowing must be permitted, or delegation is unusable.');

check('a child credential outliving its parent is flagged',
  checkDelegation({ ...parentGrant, ref: 'AG-05', delegationParent: 'AG-01',
    credentialLifetimeSeconds: 86400 }, parentGrant).findings.some((f) => f.code === 'lifetime_extended'),
  'Revoking the parent would not stop the child, which defeats containment.');

section('Tool authority');

const readContract: ToolAuthorityContract = {
  ref: 'TAC-01', provider: 'mcp:case-store@1.2', operationId: 'mcp:case-store@1.2/case.read',
  toolVersion: '1.2', schemaVersion: '1', permittedActions: ['read'],
  permittedResources: ['case-store'], parameterConstraints: {},
  permittedDataClasses: ['personal'], allowedRecipients: [], egressDestinations: [],
  destructive: false, supportsDryRun: true, requiresHumanApproval: false,
  requiresTwoPersonApproval: false, credentialIdentity: 'svc-meridian-reply',
  credentialLifetimeSeconds: 900, failMode: 'fail_closed', prohibitedCombinations: [],
};
const sendContract: ToolAuthorityContract = {
  ...readContract, ref: 'TAC-02', operationId: 'mcp:mail@2.0/message.send',
  permittedActions: ['send'], permittedResources: ['mail'], permittedDataClasses: ['internal'],
  allowedRecipients: ['casework@meridian.gov.uk'], egressDestinations: ['smtp.external.net'],
  destructive: true, requiresHumanApproval: true, prohibitedCombinations: [],
};

check('an operation with no contract is denied rather than allowed by default',
  !checkToolAuthority({ operationId: 'mcp:case-store@1.2/case.delete' }, [readContract]).permitted,
  'Adding a tool must not silently widen authority. Having no contract yet is a reason to stop, not to proceed.');

check('a recipient outside the allow-list is denied',
  !checkToolAuthority({ operationId: sendContract.operationId, recipient: 'attacker@example.com',
    approvedBy: ['reviewer'] }, [readContract, sendContract]).permitted,
  'This is the boundary an exfiltration path crosses.');

check('a destructive operation without approval is denied',
  !checkToolAuthority({ operationId: sendContract.operationId,
    recipient: 'casework@meridian.gov.uk' }, [readContract, sendContract]).permitted,
  'The contract requires human approval and none was recorded.');

check('a dry run does not require the approval the real call needs',
  checkToolAuthority({ operationId: sendContract.operationId, dryRun: true,
    recipient: 'casework@meridian.gov.uk' }, [readContract, sendContract]).permitted,
  'A dry run needing the same approval as the real call is the real call with extra steps.');

check('read-sensitive plus write-external is reported as a compositional risk',
  findCompositionalRisks([readContract, sendContract]).length === 1,
  'Individually safe tools compose into unsafe paths. Read-a-document plus send-a-message is the canonical exfiltration primitive, and neither contract forbids the other.');


section('Authority containment (lifecycle)');

const T_NOW = '2026-09-03T00:00:00.000Z';
const root: AuthorityGrant = {
  ref: 'AG-ROOT', agentIdentity: 'svc-root', actingFor: 'user:a.reviewer',
  mode: 'user_delegated', businessOwner: 'Casework', technicalOwner: 'AI Platform',
  accountableSponsor: 'Director of Operations', purpose: 'Draft case replies',
  permittedResources: ['case-store'], permittedActions: ['case:read', 'draft:create'],
  prohibitedActions: ['case:delete'], identityProvider: 'entra', credentialType: 'oidc',
  tokenAudience: 'api://case-store', scopes: ['case.read'], credentialLifetimeSeconds: 900,
  grantStart: '2026-06-01', grantExpiry: '2027-03-31', maySpawnSubAgents: true,
  maxDelegationDepth: 3, maxChildAgents: 2, evidenceRefs: ['E-143'], status: 'active',
};
const narrowed = (ref: string, over: Partial<AuthorityGrant> = {}): AuthorityGrant => ({
  ...root, ref, delegationParent: root.ref, permittedActions: ['case:read'], scopes: [], ...over,
});

check('a revoked parent invalidates a dependent child grant',
  !checkDelegation(narrowed('AG-C1'), { ...root, status: 'revoked' }, 1, { now: T_NOW }).valid,
  'Authority is derived. If the source is revoked and the child keeps operating, it holds authority nobody grants — and revocation that does not reach sub-agents is not revocation.');

check('an expired parent invalidates a dependent child grant',
  !checkDelegation(narrowed('AG-C2'), { ...root, grantExpiry: '2026-08-01' }, 1, { now: T_NOW }).valid,
  'A lapsed grant cannot authorise anything, including a child that looks otherwise correct.');

check('a child grant cannot outlive its parent',
  !checkDelegation(narrowed('AG-C3', { grantExpiry: '2028-01-01' }), root, 1, { now: T_NOW }).valid,
  'Otherwise expiry of the parent silently leaves the child running with derived authority.');

check('a three-level chain with an invalid intermediate fails, and names where',
  (() => {
    const mid = narrowed('AG-MID', { permittedActions: [...root.permittedActions, 'case:write'] });
    const leaf = { ...narrowed('AG-LEAF'), delegationParent: 'AG-MID' };
    const r = checkDelegationChain([root, mid, leaf], { now: T_NOW });
    return !r.valid && r.firstInvalid === 'AG-MID';
  })(),
  'Checking a leaf against its immediate parent says nothing about whether that parent was entitled to what it passes on.');

check('a leaf below a broken link is unauthorised even though it narrows correctly',
  (() => {
    const mid = narrowed('AG-MID2', { permittedActions: [...root.permittedActions, 'case:write'] });
    const leaf = { ...narrowed('AG-LEAF2'), delegationParent: 'AG-MID2' };
    const r = checkDelegationChain([root, mid, leaf], { now: T_NOW });
    return r.links[2].valid === false
      && r.links[2].findings.some((f) => f.code === 'inherits_broken_chain');
  })(),
  'Authority cannot be derived from a grant that does not hold, however carefully the child was narrowed.');

check('one sibling violating containment does not invalidate the others',
  (() => {
    const good = narrowed('AG-S1');
    const bad = narrowed('AG-S2', { permittedActions: ['case:read', 'case:delete'] });
    const r = checkSiblings(root, [good, bad], { now: T_NOW });
    return r.results.find((x) => x.ref === 'AG-S1')!.valid
      && !r.results.find((x) => x.ref === 'AG-S2')!.valid
      && !r.allValid;
  })(),
  'A combined verdict would either hide the bad child or condemn the good ones. Neither is a usable answer for an operator deciding what to stop.');

section('Tool contract comparison');

const base: ToolAuthorityContract = {
  ref: 'TAC-B', provider: 'mcp:case-store@1.2', operationId: 'mcp:case-store@1.2/case.update',
  toolVersion: '1.2', schemaVersion: '1', permittedActions: ['update'],
  permittedResources: ['case-store'], parameterConstraints: { amount: '<= 500' },
  permittedDataClasses: ['personal'], allowedRecipients: ['casework@meridian.gov.uk'],
  egressDestinations: ['case-store.internal'], destructive: true, supportsDryRun: true,
  requiresHumanApproval: true, requiresTwoPersonApproval: false, rateLimitPerHour: 20,
  financialLimit: 500, timeLimitSeconds: 30, credentialIdentity: 'svc-meridian-reply',
  credentialLifetimeSeconds: 900, failMode: 'fail_closed', prohibitedCombinations: [],
};
const ok = { operationId: base.operationId, resource: 'case-store', dataClass: 'personal',
  recipient: 'casework@meridian.gov.uk', destination: 'case-store.internal',
  approvedBy: ['reviewer'], credentialIdentity: 'svc-meridian-reply' };

check('a compliant invocation is permitted',
  checkToolAuthority(ok, [base]).permitted,
  'The permitted case must be reachable or the contract is unusable.');

check('a parameter outside its constraint is denied',
  !checkToolAuthority({ ...ok, parameters: { amount: 900 } }, [base]).permitted,
  'A contract that states a limit and does not enforce it is documentation.');

check('an egress destination outside the contract is denied',
  !checkToolAuthority({ ...ok, destination: 'attacker.example.com' }, [base]).permitted,
  'Egress is the boundary the contract exists to hold.');

check('running as a different credential identity is denied',
  !checkToolAuthority({ ...ok, credentialIdentity: 'svc-admin' }, [base]).permitted,
  'A contract bound to one identity and executed as another is a confused deputy.');

check('a credential outliving the contracted lifetime is denied',
  !checkToolAuthority({ ...ok, credentialLifetimeSeconds: 86400 }, [base]).permitted,
  'Short-lived credentials are a control only if the lifetime is checked.');

check('exceeding the financial limit is denied',
  !checkToolAuthority({ ...ok, value: 5000 }, [base]).permitted,
  'A financial ceiling nobody compares against is not a ceiling.');

check('exceeding the hourly rate limit is denied',
  !checkToolAuthority({ ...ok, callsThisHour: 20 }, [base]).permitted,
  'Rate limits bound how much damage occurs before a human notices.');

section('Compositional risk');

const mk = (over: Partial<ToolAuthorityContract>): ToolAuthorityContract => ({
  ...base, requiresHumanApproval: false, destructive: false, financialLimit: undefined,
  rateLimitPerHour: undefined, parameterConstraints: {}, ...over,
});
const sensitiveRead = mk({ ref: 'C1', operationId: 'mcp:case-store@1.2/case.read', permittedDataClasses: ['personal'], egressDestinations: [] });
const externalWrite = mk({ ref: 'C2', operationId: 'mcp:mail@2.0/message.send', egressDestinations: ['smtp.external.net'] });
const identityRead = mk({ ref: 'C3', operationId: 'mcp:directory@1.0/user.lookup', permittedDataClasses: ['personal'], egressDestinations: [] });
const exporter = mk({ ref: 'C4', operationId: 'mcp:reports@1.0/case.export', permittedDataClasses: ['personal'], egressDestinations: [] });
const publicStore = mk({ ref: 'C5', operationId: 'mcp:blob@1.0/public.bucket.put', egressDestinations: ['cdn.example.net'] });
const secretRead = mk({ ref: 'C6', operationId: 'mcp:vault@1.0/secret.get', permittedDataClasses: ['secret'], egressDestinations: [] });
const httpCall = mk({ ref: 'C7', operationId: 'mcp:http@1.0/request.send', egressDestinations: ['api.external.net'] });
const spawner = mk({ ref: 'C8', operationId: 'mcp:orchestrator@1.0/child.spawn', egressDestinations: [] });
const privileged = mk({ ref: 'C9', operationId: 'mcp:case-store@1.2/case.purge', destructive: true, permittedDataClasses: ['personal'], egressDestinations: [] });

const patternsFound = (cs: ToolAuthorityContract[], name: string) =>
  findCompositionalRisks(cs).some((r) => r.pattern === name);

check('sensitive read + external write is detected',
  patternsFound([sensitiveRead, externalWrite], 'sensitive read + external write'),
  'The canonical exfiltration primitive. Neither contract forbids the other.');

check('identity lookup + communication is detected',
  patternsFound([identityRead, externalWrite], 'identity lookup + communication'),
  'Enables targeted social engineering under the organisation’s own identity.');

check('data export + public storage is detected',
  patternsFound([exporter, publicStore], 'data export + public storage'),
  'Bulk disclosure that leaves via a storage surface, which an egress control watching requests never sees.');

check('credential retrieval + network request is detected',
  patternsFound([secretRead, httpCall], 'credential retrieval + network request'),
  'This is the step that turned a sandbox escape into a multi-service intrusion in the 2026 incidents.');

check('child creation + delegable privileged operation is detected',
  patternsFound([spawner, privileged], 'child creation + delegable privileged operation'),
  'A privileged operation delegable to spawned children escapes per-instance review: the reviewed agent is not the one acting.');

check('a compositional risk explains itself rather than only flagging',
  (() => {
    const r = findCompositionalRisks([sensitiveRead, externalWrite])[0];
    return !!r.whyItMatters && !!r.affects && Array.isArray(r.mitigatingControls);
  })(),
  'A warning that names a pair without saying what it puts at risk cannot be acted on.');

check('an approval gate on the acting half removes the need for review',
  !findCompositionalRisks([sensitiveRead, { ...externalWrite, requiresHumanApproval: true }])
    .find((r) => r.pattern === 'sensitive read + external write')!.requiresHumanReview,
  'Where an approval already stands between the capability and its use, the path is bounded. Flagging it anyway trains people to ignore the flag.');

check('a compositional risk is reported, never auto-prohibited',
  checkToolAuthority({ operationId: sensitiveRead.operationId, resource: 'case-store',
    dataClass: 'personal' }, [sensitiveRead, externalWrite]).permitted,
  'Whether a pairing is acceptable depends on the context contract and compensating controls. That judgement belongs to a person, not to this engine.');

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} CHECK(S) FAILED.`}\n`);
process.exitCode = failures === 0 ? 0 : 1;

// `--json <path>` publishes the grouped result for the demonstrator's evidence
// panel, so what the site claims about its own testing is generated from the
// run rather than typed by hand and left to drift.
const jsonIndex = process.argv.indexOf('--json');
if (jsonIndex >= 0) {
  const { writeFileSync, mkdirSync } = await import('node:fs');
  const { dirname, resolve } = await import('node:path');
  const { execSync } = await import('node:child_process');
  let commit = 'unknown';
  try { commit = execSync('git rev-parse --short HEAD').toString().trim(); } catch { /* not a repo */ }
  const out = resolve(process.argv[jsonIndex + 1] ?? 'check-summary.json');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({
    generatedAt: new Date().toISOString(),
    commit,
    total: results.reduce((n, g) => n + g.checks.length, 0),
    failures,
    properties: results
      .filter((g) => g.checks.length > 0)
      .map((g) => ({
        property: g.property,
        passed: g.checks.filter((c) => c.passed).length,
        total: g.checks.length,
        checks: g.checks.map((c) => ({ name: c.name, passed: c.passed })),
      })),
  }, null, 2) + String.fromCharCode(10));
  console.log('Wrote ' + out);
}

