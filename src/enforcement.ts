// SPDX-License-Identifier: Apache-2.0
/**
 * Enforcement receipts, and containment that actually stops something.
 *
 * A permit that states conditions and cannot show they reached anything is a
 * document, not a control. Until this module existed, Decirance could say "the
 * permit requires egress to stay disabled" and had no way to distinguish that
 * from "egress is in fact disabled, the gateway acknowledged the policy, and
 * it was still alive ninety seconds ago". Those are different claims and a
 * reviewer is right to ask which one is being made.
 *
 * So the product now separates two states that look identical on a dashboard
 * and are not:
 *
 *   authorised              — a named human decided, conditions are recorded
 *   authorised and enforced — and every condition reached a control that
 *                             acknowledged it and is still reporting
 *
 * The second is strictly stronger and is never inferred from the first.
 *
 * The same argument applies at the other end. Suspending a permit changed a
 * state field: jobs kept running, credentials stayed valid, egress stayed
 * open. An administrative suspension that stops nothing is the criticism a
 * security reviewer should make, and `ContainmentRun` is the answer — an
 * ordered set of actions with verification, timings and a final state that can
 * be `contained`, `partial` or `failed`. "Partial" is a real outcome here and
 * reporting it is the point: a containment that revoked credentials but could
 * not stop three child jobs must not read as success.
 *
 * Decirance does not perform enforcement. It records whether enforcement
 * happened, on the evidence the target systems return. Anything else would put
 * this product in the request path, which is exactly where it should not be.
 */

/** Why a condition is or is not in force at a target control. */
export type EnforcementStatus =
  /** Acknowledged by the target, configuration matches, heartbeat current. */
  | 'enforced'
  /** Acknowledged, but the observed configuration does not match the policy. */
  | 'drifted'
  /** Sent, never acknowledged. */
  | 'unacknowledged'
  /** Acknowledged once, no heartbeat within tolerance. */
  | 'stale'
  /** The target rejected the policy. */
  | 'rejected'
  /** No attempt has been made to enforce this condition anywhere. */
  | 'unenforced';

/**
 * What a control does when it cannot reach its decision point.
 *
 * Recorded per condition because it changes what a healthy-looking receipt is
 * worth. A fail-open control that has lost its heartbeat is not merely
 * unmonitored, it is permissive, and that is worse than a fail-closed control
 * in the same state.
 */
export type FailureMode = 'fail_closed' | 'fail_open' | 'unknown';

export interface EnforcementReceipt {
  permitRef: string;
  /** The permit condition this receipt is evidence for. */
  conditionRef: string;
  /** The system that is supposed to be enforcing it. */
  target: string;
  /** Vendor-side identifier for the policy, where one exists. */
  externalPolicyId?: string;
  /** Digest of the policy Decirance compiled and sent. */
  policyDigest?: string;
  /** Digest of the configuration the target reports as running. */
  observedConfigDigest?: string;
  acknowledgedAt?: string;
  effectiveFrom?: string;
  lastHeartbeatAt?: string;
  failureMode: FailureMode;
  /** Present when the target refused the policy. */
  rejectionReason?: string;
}

export interface EnforcementAssessment {
  conditionRef: string;
  target: string;
  status: EnforcementStatus;
  /** Whether this condition may be counted as in force. */
  inForce: boolean;
  reasons: string[];
}

export interface EnforcementPosture {
  permitRef: string;
  assessments: EnforcementAssessment[];
  /** Conditions with no receipt at all. */
  unenforcedConditions: string[];
  /** True only when every mandatory condition is enforced. */
  fullyEnforced: boolean;
  /**
   * Mandatory conditions not in force whose control fails open. These are the
   * dangerous ones: nothing is stopping the action and nothing will alert.
   */
  permissiveGaps: string[];
  summary: string;
}

/** Default tolerance before a heartbeat is treated as stale. */
export const DEFAULT_HEARTBEAT_TOLERANCE_MS = 15 * 60 * 1000;

function statusOf(
  receipt: EnforcementReceipt,
  now: string,
  toleranceMs: number,
): { status: EnforcementStatus; reasons: string[] } {
  const reasons: string[] = [];

  if (receipt.rejectionReason) {
    return {
      status: 'rejected',
      reasons: [`${receipt.target} rejected the policy: ${receipt.rejectionReason}`],
    };
  }
  if (!receipt.acknowledgedAt) {
    return {
      status: 'unacknowledged',
      reasons: [`${receipt.target} never acknowledged the policy. It was sent; nothing confirms it took effect.`],
    };
  }
  // Drift before staleness: a target that is alive and running the wrong
  // configuration is a worse finding than one that has gone quiet, and
  // reporting only the missing heartbeat would hide it.
  if (
    receipt.policyDigest &&
    receipt.observedConfigDigest &&
    receipt.policyDigest !== receipt.observedConfigDigest
  ) {
    reasons.push(
      `${receipt.target} acknowledged ${receipt.policyDigest} but reports ${receipt.observedConfigDigest} running.`,
    );
    return { status: 'drifted', reasons };
  }
  if (!receipt.lastHeartbeatAt) {
    return {
      status: 'stale',
      reasons: [`${receipt.target} acknowledged the policy but has never reported health.`],
    };
  }
  const age = Date.parse(now) - Date.parse(receipt.lastHeartbeatAt);
  if (Number.isNaN(age)) {
    return { status: 'stale', reasons: [`${receipt.target} returned an unreadable heartbeat time.`] };
  }
  if (age > toleranceMs) {
    return {
      status: 'stale',
      reasons: [`${receipt.target} last reported ${Math.round(age / 60000)} minutes ago, beyond the ${Math.round(toleranceMs / 60000)}-minute tolerance.`],
    };
  }
  return { status: 'enforced', reasons: [] };
}

/**
 * Assess whether a permit's conditions are actually in force.
 *
 * A condition with no receipt is `unenforced`, never "assumed fine". That is
 * the same fail-closed rule the rest of the engine uses: the absence of
 * evidence about enforcement is not evidence of enforcement.
 */
export function assessEnforcement(
  permitRef: string,
  conditions: Array<{ ref: string; mandatory: boolean }>,
  receipts: EnforcementReceipt[],
  options: { now?: string; heartbeatToleranceMs?: number } = {},
): EnforcementPosture {
  const now = options.now ?? new Date().toISOString();
  const tolerance = options.heartbeatToleranceMs ?? DEFAULT_HEARTBEAT_TOLERANCE_MS;
  const byCondition = new Map<string, EnforcementReceipt[]>();
  for (const r of receipts.filter((r) => r.permitRef === permitRef)) {
    byCondition.set(r.conditionRef, [...(byCondition.get(r.conditionRef) ?? []), r]);
  }

  const assessments: EnforcementAssessment[] = [];
  const unenforcedConditions: string[] = [];
  const permissiveGaps: string[] = [];

  for (const condition of conditions) {
    const found = byCondition.get(condition.ref) ?? [];
    if (found.length === 0) {
      unenforcedConditions.push(condition.ref);
      assessments.push({
        conditionRef: condition.ref,
        target: '(none)',
        status: 'unenforced',
        inForce: false,
        reasons: ['No control has been asked to enforce this condition. It is a statement in a document.'],
      });
      if (condition.mandatory) permissiveGaps.push(condition.ref);
      continue;
    }
    for (const receipt of found) {
      const { status, reasons } = statusOf(receipt, now, tolerance);
      const inForce = status === 'enforced';
      assessments.push({ conditionRef: condition.ref, target: receipt.target, status, inForce, reasons });
      if (!inForce && condition.mandatory && receipt.failureMode !== 'fail_closed') {
        permissiveGaps.push(condition.ref);
      }
    }
  }

  const mandatory = new Set(conditions.filter((c) => c.mandatory).map((c) => c.ref));
  const enforcedMandatory = new Set(
    assessments.filter((a) => a.inForce && mandatory.has(a.conditionRef)).map((a) => a.conditionRef),
  );
  const fullyEnforced = mandatory.size > 0 && enforcedMandatory.size === mandatory.size;

  return {
    permitRef,
    assessments,
    unenforcedConditions,
    fullyEnforced,
    permissiveGaps: [...new Set(permissiveGaps)],
    summary: fullyEnforced
      ? `All ${mandatory.size} mandatory condition(s) are enforced and reporting.`
      : `${enforcedMandatory.size} of ${mandatory.size} mandatory condition(s) enforced. The permit is authorised but not fully enforced.`,
  };
}

// ── Containment ────────────────────────────────────────────────────────────

/**
 * The actions a suspension has to perform to mean anything.
 *
 * Ordered by what an attacker-in-possession would exploit first. Stopping
 * in-flight work before revoking credentials is deliberate: revoking first
 * leaves running jobs to fail in unpredictable places, and a job that has
 * already loaded a token keeps it until it exits.
 */
export type ContainmentAction =
  | 'stop_scheduled_runs'
  | 'stop_in_flight_jobs'
  | 'stop_child_agents'
  | 'revoke_credentials'
  | 'block_egress'
  | 'block_model_access'
  | 'disable_tool_connections'
  | 'freeze_evidence'
  | 'snapshot_forensics'
  | 'notify_owners';

export const CONTAINMENT_SEQUENCE: ContainmentAction[] = [
  'stop_scheduled_runs',
  'stop_in_flight_jobs',
  'stop_child_agents',
  'revoke_credentials',
  'block_egress',
  'block_model_access',
  'disable_tool_connections',
  // Forensics after the agent is stopped, so the snapshot is of a quiet system
  // — and before anyone starts remediating, so it is not of a repaired one.
  'freeze_evidence',
  'snapshot_forensics',
  'notify_owners',
];

export type ContainmentOutcome = 'done' | 'partial' | 'failed' | 'not_attempted';

export interface ContainmentStep {
  action: ContainmentAction;
  outcome: ContainmentOutcome;
  target?: string;
  /** How the outcome was confirmed. Unverified is not the same as done. */
  verifiedBy?: string;
  detail?: string;
  at?: string;
}

export interface ContainmentRun {
  permitRef: string;
  trigger: string;
  startedAt: string;
  completedAt?: string;
  steps: ContainmentStep[];
}

export interface ContainmentResult {
  permitRef: string;
  /** `contained` only when every attempted step is done and verified. */
  state: 'contained' | 'partial' | 'failed';
  /** Steps in the standard sequence that nobody attempted. */
  notAttempted: ContainmentAction[];
  /** Steps that were done but nothing confirmed. */
  unverified: ContainmentAction[];
  failed: ContainmentAction[];
  /** Detection to containment, where both timestamps exist. */
  elapsedMs?: number;
  summary: string;
}

/**
 * Judge a containment run.
 *
 * The rule that matters: a step reported `done` with nothing verifying it is
 * not counted as containment. Self-reported success is how an agent's own
 * infrastructure tells you it stopped the agent, and that is exactly the class
 * of evidence the integrity module exists to distrust.
 */
export function assessContainment(run: ContainmentRun): ContainmentResult {
  const byAction = new Map(run.steps.map((s) => [s.action, s]));
  const notAttempted = CONTAINMENT_SEQUENCE.filter(
    (a) => !byAction.has(a) || byAction.get(a)!.outcome === 'not_attempted',
  );
  const failed = run.steps.filter((s) => s.outcome === 'failed').map((s) => s.action);
  const partial = run.steps.filter((s) => s.outcome === 'partial').map((s) => s.action);
  const unverified = run.steps
    .filter((s) => s.outcome === 'done' && !s.verifiedBy)
    .map((s) => s.action);

  const elapsedMs = run.completedAt
    ? Date.parse(run.completedAt) - Date.parse(run.startedAt)
    : undefined;

  const state: ContainmentResult['state'] =
    failed.length > 0
      ? 'failed'
      : partial.length > 0 || unverified.length > 0 || notAttempted.length > 0
        ? 'partial'
        : 'contained';

  const parts: string[] = [];
  if (failed.length) parts.push(`${failed.length} step(s) failed`);
  if (partial.length) parts.push(`${partial.length} partial`);
  if (unverified.length) parts.push(`${unverified.length} unverified`);
  if (notAttempted.length) parts.push(`${notAttempted.length} not attempted`);

  return {
    permitRef: run.permitRef,
    state,
    notAttempted,
    unverified,
    failed,
    elapsedMs: Number.isNaN(elapsedMs as number) ? undefined : elapsedMs,
    summary:
      state === 'contained'
        ? `Contained and verified${elapsedMs !== undefined ? ` in ${Math.round(elapsedMs / 1000)}s` : ''}.`
        : `Containment ${state}: ${parts.join(', ')}. The agent may still be operating.`,
  };
}
