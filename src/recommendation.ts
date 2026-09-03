/**
 * Deployment recommendation. Specification section 10.3.
 *
 * The rules table is expressed as *ceilings*, not as a score. Each rule that
 * fires caps how favourable the recommendation may be, and the result is the
 * most restrictive surviving cap. That shape matters: it makes it impossible
 * for a quantity of good findings to lift a recommendation past a cap that a
 * single serious finding imposed, which is the arithmetic failure the "no
 * unexplained trust score" principle exists to prevent.
 *
 * Every firing rule is returned with the claims that triggered it, satisfying
 * the section 10.5 requirement that a recommendation expose its rule path.
 */

import type { DeltaResult } from './invalidation';

export type Recommendation =
  | 'approve'
  | 'approve_with_conditions'
  | 'supervised_pilot'
  | 'reject';

/** Specification section 10.1. */
export type ClaimState =
  | 'not_assessed'
  | 'unsupported'
  | 'partially_supported'
  | 'supported'
  | 'challenged'
  | 'not_applicable'
  | 'excepted'
  | 'invalidated';

/** Most restrictive first. A ceiling is the highest index still permitted. */
const ORDER: readonly Recommendation[] = [
  'reject',
  'supervised_pilot',
  'approve_with_conditions',
  'approve',
];

function rank(r: Recommendation): number {
  return ORDER.indexOf(r);
}

/** Returns whichever of the two is more restrictive. */
export function mostRestrictive(
  a: Recommendation,
  b: Recommendation,
): Recommendation {
  return rank(a) <= rank(b) ? a : b;
}

export interface ClaimAssessment {
  ref: string;
  state: ClaimState;
  critical: boolean;
  /** A mitigation accepted by an authorised approver for a challenged claim. */
  mitigationAccepted?: boolean;
}

export interface ResidualRisk {
  ref: string;
  material: boolean;
  accepted: boolean;
  acceptedBy?: string;
}

export interface DeploymentCondition {
  ref: string;
  mandatory: boolean;
  complete: boolean;
  owner?: string;
  dueBy?: string;
}

export interface RedLineBreach {
  ref: string;
  description: string;
  demonstrated: boolean;
}

export interface RecommendationInput {
  claims: ClaimAssessment[];
  residualRisks?: ResidualRisk[];
  conditions?: DeploymentCondition[];
  redLines?: RedLineBreach[];
  /** Present when this assessment follows a material change. */
  delta?: DeltaResult;
  /**
   * Policy choice for the "critical claim unsupported" rule, which section
   * 10.3 leaves as "supervised pilot or reject, policy dependent". Recorded
   * explicitly so the resulting recommendation stays reproducible: the same
   * inputs under a different policy must not silently produce a different
   * answer.
   */
  unsupportedCriticalPolicy?: 'supervised_pilot' | 'reject';
}

export interface RuleHit {
  /** Stable identifier, for citing the rule in an assurance pack. */
  rule: string;
  ceiling: Recommendation;
  reason: string;
  claimRefs: string[];
}

export interface RecommendationResult {
  recommendation: Recommendation;
  /** Every rule that fired, most restrictive first. */
  firedRules: RuleHit[];
  /** The single rule that set the final ceiling. */
  bindingRule: RuleHit | null;
  /** True when a live permit must be suspended regardless of the above. */
  suspendExistingPermit: boolean;
  suspensionReason?: string;
  rationale: string;
}

/**
 * Evaluate the section 10.3 rules.
 *
 * Deterministic and total: with no claims at all the result is `reject`,
 * because an empty assurance case justifies nothing. Defaulting to `approve`
 * in the absence of evidence would invert the product's entire premise.
 */
export function recommend(input: RecommendationInput): RecommendationResult {
  const {
    claims,
    residualRisks = [],
    conditions = [],
    redLines = [],
    delta,
    unsupportedCriticalPolicy = 'supervised_pilot',
  } = input;

  const fired: RuleHit[] = [];
  const assessable = claims.filter((c) => c.state !== 'not_applicable');

  // R1 - prohibited action or red-line breach demonstrated.
  const breaches = redLines.filter((r) => r.demonstrated);
  if (breaches.length > 0) {
    fired.push({
      rule: 'R1.red_line_breach',
      ceiling: 'reject',
      // Descriptions arrive as complete sentences from the contract check, so
      // trim their terminators before re-punctuating the joined list.
      reason: `Red line breached: ${breaches.map((b) => b.description.replace(/\.\s*$/, '')).join('; ')}.`,
      claimRefs: [],
    });
  }

  // R2 - critical claim challenged with no accepted mitigation.
  const challenged = assessable.filter(
    (c) => c.critical && c.state === 'challenged' && !c.mitigationAccepted,
  );
  if (challenged.length > 0) {
    fired.push({
      rule: 'R2.critical_claim_challenged',
      ceiling: 'reject',
      reason:
        'A critical claim is contradicted by evidence and no mitigation has been accepted.',
      claimRefs: challenged.map((c) => c.ref),
    });
  }

  // R3 - critical claim unsupported. Section 10.3 makes the ceiling a policy
  // choice between supervised pilot and reject.
  const unsupported = assessable.filter(
    (c) =>
      c.critical &&
      (c.state === 'unsupported' ||
        c.state === 'not_assessed' ||
        c.state === 'invalidated'),
  );
  if (unsupported.length > 0) {
    fired.push({
      rule: 'R3.critical_claim_unsupported',
      ceiling: unsupportedCriticalPolicy,
      reason: `Critical claim(s) without sufficient support, under the "${unsupportedCriticalPolicy}" policy.`,
      claimRefs: unsupported.map((c) => c.ref),
    });
  }

  // R4 - critical evidence invalidated after a material change. This does not
  // cap the recommendation for the new case; it suspends the permit that the
  // old evidence was supporting. Kept separate for that reason.
  const invalidatedCritical =
    delta?.outcomes.filter((o) => o.critical && o.impact === 'invalidated') ??
    [];
  const suspendExistingPermit = invalidatedCritical.length > 0;

  // R5 - mandatory condition incomplete.
  const incompleteMandatory = conditions.filter(
    (c) => c.mandatory && !c.complete,
  );
  if (incompleteMandatory.length > 0) {
    fired.push({
      rule: 'R5.mandatory_condition_incomplete',
      ceiling: 'supervised_pilot',
      reason: `Mandatory condition(s) not yet met: ${incompleteMandatory.map((c) => c.ref).join(', ')}.`,
      claimRefs: [],
    });
  }

  // R6 - non-critical gaps with owners and deadlines.
  const nonCriticalGaps = assessable.filter(
    (c) =>
      !c.critical &&
      (c.state === 'unsupported' ||
        c.state === 'partially_supported' ||
        c.state === 'not_assessed' ||
        c.state === 'invalidated' ||
        c.state === 'challenged'),
  );
  if (nonCriticalGaps.length > 0) {
    fired.push({
      rule: 'R6.non_critical_gap',
      ceiling: 'approve_with_conditions',
      reason: 'Non-critical claims require further evidence.',
      claimRefs: nonCriticalGaps.map((c) => c.ref),
    });
  }

  // R7 - unaccepted material residual risk.
  const unacceptedRisk = residualRisks.filter((r) => r.material && !r.accepted);
  if (unacceptedRisk.length > 0) {
    fired.push({
      rule: 'R7.unaccepted_material_residual_risk',
      ceiling: 'approve_with_conditions',
      reason: `Material residual risk not accepted by an authorised approver: ${unacceptedRisk.map((r) => r.ref).join(', ')}.`,
      claimRefs: [],
    });
  }

  // R0 - an assurance case with nothing assessable justifies nothing.
  if (assessable.length === 0) {
    fired.push({
      rule: 'R0.no_assessable_claims',
      ceiling: 'reject',
      reason:
        'The assurance case contains no assessable claims, so no operation is justified.',
      claimRefs: [],
    });
  }

  fired.sort((a, b) => rank(a.ceiling) - rank(b.ceiling));

  const recommendation = fired.reduce<Recommendation>(
    (acc, hit) => mostRestrictive(acc, hit.ceiling),
    'approve',
  );
  const bindingRule =
    fired.find((h) => h.ceiling === recommendation) ?? null;

  const rationale = bindingRule
    ? `${recommendation.replace(/_/g, ' ')} — ${bindingRule.reason} (rule ${bindingRule.rule}${bindingRule.claimRefs.length ? `, claims ${bindingRule.claimRefs.join(', ')}` : ''})`
    : 'approve — all mandatory claims are supported and no unaccepted material residual risk remains.';

  return {
    recommendation,
    firedRules: fired,
    bindingRule,
    suspendExistingPermit,
    suspensionReason: suspendExistingPermit
      ? `${invalidatedCritical.length} critical claim(s) invalidated by a material change: ${invalidatedCritical.map((o) => o.claimRef).join(', ')}.`
      : undefined,
    rationale,
  };
}

/**
 * Derive a claim's support state from its delta outcome and evidence counts.
 *
 * Separated from `recommend` so the two are independently checkable: this maps
 * graph facts to a claim state, `recommend` maps claim states to a decision.
 */
export function deriveClaimState(args: {
  supportingEvidence: number;
  challengingEvidence: number;
  invalidatedEvidence: number;
  excepted?: boolean;
  applicable?: boolean;
}): ClaimState {
  if (args.applicable === false) return 'not_applicable';
  if (args.excepted) return 'excepted';
  // A live contradiction outranks any amount of support (section 10.2).
  if (args.challengingEvidence > 0) return 'challenged';
  if (args.supportingEvidence === 0) {
    return args.invalidatedEvidence > 0 ? 'invalidated' : 'unsupported';
  }
  if (args.invalidatedEvidence > 0) return 'partially_supported';
  return 'supported';
}
