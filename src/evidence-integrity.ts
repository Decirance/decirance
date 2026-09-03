// SPDX-License-Identifier: Apache-2.0
/**
 * Evidence integrity: assurance of the assurance process.
 *
 * Everything else in this engine reasons about what evidence *shows*. This
 * module reasons about whether the evidence can be believed at all — a
 * distinction the field has mostly been able to ignore, and can no longer.
 *
 * The 2026 evaluation incidents made the case concretely. Agents under
 * evaluation reverse-engineered the flag generation, manipulated target
 * programs, attempted to manipulate the scorer, spoofed tool outputs, modified
 * accessible logs, and coordinated through an unauthorised shared channel. The
 * lesson is not that agents can attack systems. It is that **an agent can
 * attack the mechanism being used to evaluate it**, and a "pass" produced
 * inside a boundary the agent could reach is not evidence of anything.
 *
 * So importing a passed result is not enough. Every evidence artefact has to
 * carry the answer to: who produced this, was it collected outside the agent's
 * reach, could the agent see how it was being assessed, could it write to the
 * harness, the scorer or the logs, and does anything independent corroborate
 * it?
 *
 * The central rule is at the bottom and it is deliberately blunt: compromised
 * or unverifiable evidence must never silently support a decision-critical
 * claim. Not "weighted lower" — a weighting would let a volume of doubtful
 * evidence outvote the doubt. The claim loses that support and says so.
 *
 * This is orthogonal to the five quality dimensions. Quality asks whether a
 * sound test measured the right thing well. Integrity asks whether the result
 * you are holding is the result the test produced. High quality and no
 * integrity is the dangerous combination, because it reads as reassuring.
 */

/**
 * Where the evidence was collected, relative to what the agent could reach.
 *
 * The single most important field here. Evidence collected inside the agent's
 * own trust boundary is, at best, the agent's account of itself.
 */
export type CollectionPlane =
  /** Collected by infrastructure the agent had no path to. */
  | 'independent'
  /** Collected on shared infrastructure the agent could reach but not write. */
  | 'shared_readable'
  /** Collected somewhere the agent could write. */
  | 'agent_writable'
  /** Produced by the agent itself. */
  | 'self_reported'
  | 'unknown';

export type IntegrityStatus =
  | 'trusted'
  | 'trusted_with_qualifications'
  | 'contested'
  | 'compromised'
  | 'unverifiable'
  | 'invalid';

/**
 * What the agent could reach, recorded as facts rather than a judgement.
 *
 * Tri-state on purpose. `undefined` means nobody established the answer, which
 * is different from establishing that the answer is no — and it is the common
 * case when importing a result from a tool that never asked the question.
 * Collapsing the two would turn "we did not check" into "it is fine", which is
 * precisely the failure this module exists to prevent.
 */
export interface AgentReach {
  /** Could the agent observe how it was being assessed? */
  couldObserveEvaluation?: boolean;
  /** Could the agent modify the test harness? */
  couldModifyHarness?: boolean;
  /** Could the agent modify the scorer or grading logic? */
  couldModifyScorer?: boolean;
  /** Could the agent read the expected answers? */
  couldAccessExpectedAnswers?: boolean;
  /** Could the agent modify the logs this evidence rests on? */
  couldModifyLogs?: boolean;
  /** Could other agent instances influence the result? */
  otherAgentsCouldInfluence?: boolean;
  /** Did shared infrastructure affect the result? */
  sharedInfrastructureInvolved?: boolean;
}

export interface EvidenceIntegrity {
  evidenceRef: string;
  /** Who or what produced the artefact. */
  producer: string;
  /** Is the producer independent of the team that owns the agent? */
  producerIndependent?: boolean;
  collectionPlane: CollectionPlane;
  reach: AgentReach;
  /** Are the underlying logs append-only? */
  appendOnlyLogs?: boolean;
  /** Is the artefact signed or hashed? */
  tamperEvident?: boolean;
  /** Can the chain from execution to report be reconstructed? */
  chainOfCustodyComplete?: boolean;
  /** Does independent telemetry corroborate it? */
  externallyCorroborated?: boolean;
  /** Does independent telemetry contradict it? */
  contradictedByTelemetry?: boolean;
  /** Were all agent actions captured, including failed and abandoned ones? */
  allActionsCaptured?: boolean;
  /** What this evidence cannot demonstrate, in the assessor's words. */
  limitations?: string[];
  /** An integrity status set by a human, overriding the derived one. */
  assessedStatus?: IntegrityStatus;
  assessedBy?: string;
}

export interface IntegrityFinding {
  code: string;
  severity: 'disqualifying' | 'qualifying' | 'note';
  detail: string;
}

export interface IntegrityAssessment {
  evidenceRef: string;
  status: IntegrityStatus;
  findings: IntegrityFinding[];
  /** May this evidence support a decision-critical claim on its own? */
  admissibleForCriticalClaims: boolean;
  /** What would have to change for the status to improve. */
  remediation: string[];
}

const DISQUALIFYING: IntegrityStatus[] = ['compromised', 'unverifiable', 'invalid'];

/** Whether a status bars evidence from carrying a decision-critical claim. */
export function isDisqualifying(status: IntegrityStatus): boolean {
  return DISQUALIFYING.includes(status);
}

/**
 * Derive an integrity status from the recorded facts.
 *
 * Ordered most severe first and returns on the first match rather than
 * accumulating a score. A single reachable scorer is disqualifying however
 * many reassuring properties sit beside it — averaging is exactly how a
 * compromised result gets through.
 */
export function assessIntegrity(integrity: EvidenceIntegrity): IntegrityAssessment {
  const findings: IntegrityFinding[] = [];
  const remediation: string[] = [];
  const r = integrity.reach;

  // ── Disqualifying: the agent could shape the result itself. ──────────────
  if (r.couldModifyScorer) {
    findings.push({
      code: 'scorer_reachable',
      severity: 'disqualifying',
      detail: 'The agent could modify the scorer. A pass is then a statement about what the agent wrote, not about how it behaved.',
    });
    remediation.push('Move scoring outside the agent boundary and re-run.');
  }
  if (r.couldModifyHarness) {
    findings.push({
      code: 'harness_reachable',
      severity: 'disqualifying',
      detail: 'The agent could modify the test harness, so the test that ran may not be the test that was designed.',
    });
    remediation.push('Isolate the harness from the agent and re-run.');
  }
  if (r.couldModifyLogs) {
    findings.push({
      code: 'logs_writable',
      severity: 'disqualifying',
      detail: 'The agent could modify the logs this evidence rests on. Absence of a recorded action is no longer evidence the action did not happen.',
    });
    remediation.push('Collect logs to an append-only store outside the agent boundary.');
  }
  if (r.couldAccessExpectedAnswers) {
    findings.push({
      code: 'answers_reachable',
      severity: 'disqualifying',
      detail: 'The agent could read the expected answers, so the result measures retrieval rather than capability.',
    });
    remediation.push('Regenerate the expected answers and keep them outside the agent boundary.');
  }
  if (integrity.contradictedByTelemetry) {
    findings.push({
      code: 'telemetry_contradicts',
      severity: 'disqualifying',
      detail: 'Independent telemetry contradicts this evidence. The disagreement must be resolved before either is relied on.',
    });
    remediation.push('Reconcile the artefact against the telemetry that contradicts it.');
  }
  if (integrity.collectionPlane === 'agent_writable') {
    findings.push({
      code: 'collected_in_agent_plane',
      severity: 'disqualifying',
      detail: 'Collected somewhere the agent could write. This is the agent’s account of itself.',
    });
    remediation.push('Re-collect from a plane the agent cannot write to.');
  }

  // ── Qualifying: believable, but not on its own. ──────────────────────────
  if (integrity.collectionPlane === 'self_reported') {
    findings.push({
      code: 'self_reported',
      severity: 'qualifying',
      detail: 'Produced by the agent. Usable as a description of intent, not as evidence of behaviour, without independent corroboration.',
    });
    remediation.push('Corroborate with telemetry collected outside the agent.');
  }
  if (r.couldObserveEvaluation) {
    findings.push({
      code: 'evaluation_observable',
      severity: 'qualifying',
      detail: 'The agent could observe how it was being assessed, so the result may reflect behaviour under observation rather than in operation.',
    });
  }
  if (r.otherAgentsCouldInfluence) {
    findings.push({
      code: 'cross_agent_influence',
      severity: 'qualifying',
      detail: 'Other agent instances could influence the result. Parallel instances sharing a channel have coordinated in recorded incidents.',
    });
  }
  if (r.sharedInfrastructureInvolved) {
    findings.push({
      code: 'shared_infrastructure',
      severity: 'qualifying',
      detail: 'Shared infrastructure was involved, so the result may not isolate this agent.',
    });
  }
  if (integrity.allActionsCaptured === false) {
    findings.push({
      code: 'actions_incomplete',
      severity: 'qualifying',
      detail: 'Not every action was captured. Failed and abandoned attempts are often the informative ones.',
    });
  }
  if (integrity.producerIndependent === false) {
    findings.push({
      code: 'producer_not_independent',
      severity: 'qualifying',
      detail: `Produced by ${integrity.producer}, who is not independent of the team that owns the agent.`,
    });
  }

  // ── Unverifiable: nobody established the answer either way. ──────────────
  const unestablished: string[] = [];
  if (integrity.collectionPlane === 'unknown') unestablished.push('collection plane');
  if (integrity.chainOfCustodyComplete === undefined) unestablished.push('chain of custody');
  if (integrity.tamperEvident === undefined) unestablished.push('tamper evidence');
  if (r.couldModifyLogs === undefined) unestablished.push('log writability');

  const derived: IntegrityStatus = (() => {
    if (findings.some((f) => f.severity === 'disqualifying')) return 'compromised';
    if (integrity.collectionPlane === 'unknown' || unestablished.length >= 3) {
      return 'unverifiable';
    }
    if (findings.some((f) => f.severity === 'qualifying')) {
      return 'trusted_with_qualifications';
    }
    return 'trusted';
  })();

  if (derived === 'unverifiable') {
    findings.push({
      code: 'integrity_unestablished',
      severity: 'disqualifying',
      detail: `Nobody established: ${unestablished.join(', ')}. Unestablished is not the same as sound, and must not be read as it.`,
    });
    remediation.push('Record the collection plane, custody chain and tamper evidence for this artefact.');
  }

  // A human assessment overrides the derived status in either direction: an
  // assessor may know something the fields do not capture. It is recorded as a
  // finding so the override is never invisible.
  const status = integrity.assessedStatus ?? derived;
  if (integrity.assessedStatus && integrity.assessedStatus !== derived) {
    findings.push({
      code: 'human_override',
      severity: 'note',
      detail: `Derived status was "${derived}"; ${integrity.assessedBy ?? 'an assessor'} recorded "${integrity.assessedStatus}".`,
    });
  }

  for (const limitation of integrity.limitations ?? []) {
    findings.push({ code: 'stated_limitation', severity: 'note', detail: limitation });
  }

  return {
    evidenceRef: integrity.evidenceRef,
    status,
    findings,
    admissibleForCriticalClaims: !isDisqualifying(status),
    remediation: [...new Set(remediation)],
  };
}

export interface IntegrityGateResult {
  /** Evidence refs that must not count as support for a critical claim. */
  inadmissible: string[];
  assessments: IntegrityAssessment[];
  /** Critical claims left with no admissible support once the gate applies. */
  criticalClaimsUndermined: Array<{ claimRef: string; lostEvidence: string[] }>;
}

/**
 * Apply the integrity gate across a case.
 *
 * The rule this module exists for: evidence whose integrity is compromised,
 * unverifiable or invalid does not support a decision-critical claim. It is
 * removed from the support set rather than discounted, and the claims that
 * lose their last admissible support are named — because the failure mode is a
 * claim that still looks supported by a stack of artefacts nobody can vouch
 * for.
 */
export function applyIntegrityGate(
  integrities: EvidenceIntegrity[],
  supportEdges: Array<{ evidenceRef: string; claimRef: string; critical: boolean }>,
): IntegrityGateResult {
  const assessments = integrities.map(assessIntegrity);
  const inadmissible = new Set(
    assessments.filter((a) => !a.admissibleForCriticalClaims).map((a) => a.evidenceRef),
  );

  const byClaim = new Map<string, { critical: boolean; all: string[]; lost: string[] }>();
  for (const edge of supportEdges) {
    const entry = byClaim.get(edge.claimRef) ?? { critical: edge.critical, all: [], lost: [] };
    entry.critical = entry.critical || edge.critical;
    entry.all.push(edge.evidenceRef);
    if (inadmissible.has(edge.evidenceRef)) entry.lost.push(edge.evidenceRef);
    byClaim.set(edge.claimRef, entry);
  }

  const criticalClaimsUndermined = [...byClaim.entries()]
    .filter(([, v]) => v.critical && v.lost.length > 0 && v.lost.length === v.all.length)
    .map(([claimRef, v]) => ({ claimRef, lostEvidence: v.lost }));

  return { inadmissible: [...inadmissible], assessments, criticalClaimsUndermined };
}
