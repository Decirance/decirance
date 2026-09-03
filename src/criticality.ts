// SPDX-License-Identifier: Apache-2.0
/**
 * Criticality tier and the proportionality gate.
 *
 * Two things NCSC asks for that this engine could not previously express:
 * that controls be proportional to autonomy and consequence, and that someone
 * ask whether an agent is needed at all before assuring one.
 *
 * The tier is derived, never entered. A field someone types is a field someone
 * negotiates down, and "the team assessed this as Tier 2" is not a statement
 * anyone can check. Here the factors are recorded, the arithmetic is fixed,
 * and the tier follows — so a disagreement becomes a disagreement about a
 * specific factor, which is a conversation worth having, rather than about a
 * conclusion, which is not.
 *
 * The score is deliberately never shown alone. `TierResult` carries the
 * contributing factors and what each one added, because a bare "Tier 3" is the
 * unexplained aggregate this product exists to argue against. A number that
 * hides its derivation is a trust score wearing a different hat.
 *
 * The proportionality gate is separate and comes first. It does not assess
 * risk; it asks whether the deployment has a stated benefit, a considered
 * non-agent alternative, and a reason the requested autonomy is necessary. An
 * assurance process that begins by assuming the agent should exist can only
 * ever answer "how safely", never "whether".
 */

/**
 * The factors that drive the tier.
 *
 * Ordinal 0–3 rather than free-form, because the whole point is comparability
 * between assessments. Each is a question with a defensible answer, not an
 * impression.
 */
export interface CriticalityFactors {
  /** 0 suggest-only · 1 act with approval · 2 act with review after · 3 unsupervised */
  autonomy: 0 | 1 | 2 | 3;
  /** 0 read public · 1 read internal · 2 write scoped · 3 write broad or admin */
  privilege: 0 | 1 | 2 | 3;
  /** 0 none · 1 internal · 2 personal data · 3 special category or protectively marked */
  dataSensitivity: 0 | 1 | 2 | 3;
  /** 0 trivially reversible · 1 reversible with effort · 2 hard · 3 irreversible */
  reversibility: 0 | 1 | 2 | 3;
  /** 0 single record · 1 team · 2 organisation · 3 external parties or public */
  operationalReach: 0 | 1 | 2 | 3;
  /** 0 human-paced · 1 minutes · 2 seconds · 3 unbounded machine speed */
  speed: 0 | 1 | 2 | 3;
  /** 0 no sub-agents · 1 fixed few · 2 many · 3 dynamic or unbounded spawning */
  fanOut: 0 | 1 | 2 | 3;
  /** 0 none · 1 low value · 2 material · 3 unbounded financial authority */
  financialAuthority: 0 | 1 | 2 | 3;
  /** 0 internal staff · 1 many staff · 2 customers · 3 vulnerable people or public */
  affectedPopulation: 0 | 1 | 2 | 3;
  /** 0 inconvenience · 1 service disruption · 2 serious harm · 3 safety or rights */
  consequenceOfFailure: 0 | 1 | 2 | 3;
}

export type CriticalityTier = 'T1_limited' | 'T2_standard' | 'T3_elevated' | 'T4_critical';

/**
 * Version of the classification policy.
 *
 * The tier is a *versioned policy-derived classification*, not a measurement.
 * The weights and thresholds below are research hypotheses drawn from current
 * guidance; no study validates them. Versioning them is what makes that honest
 * rather than merely admitted: when calibration data arrives from design
 * partners, the policy changes version and every prior classification remains
 * interpretable against the rules that actually produced it.
 */
export const CRITICALITY_METHODOLOGY_VERSION = '0.1.0-research';

export const CRITICALITY_LIMITATION =
  'The initial thresholds are research hypotheses derived from current guidance. ' +
  'They require calibration through design-partner deployments and observed outcomes.';

export interface FactorContribution {
  factor: keyof CriticalityFactors;
  value: number;
  weight: number;
  contribution: number;
  /** Why this factor is weighted as it is. */
  note: string;
  /** Why *this value* was selected, in the assessor's words. */
  rationale?: string;
}

/**
 * Who confirmed the input facts, and when.
 *
 * Recorded because the tier is only as good as the answers behind it. A
 * classification with no named person behind its inputs is an assertion about
 * an agent nobody looked at.
 */
export interface CriticalityProvenance {
  /** Free-text rationale per factor. */
  rationales?: Partial<Record<keyof CriticalityFactors, string>>;
  confirmedBy?: string;
  calculatedAt?: string;
}

export interface TierResult {
  tier: CriticalityTier;
  /** The policy version that produced this tier. */
  methodologyVersion: string;
  /** The calculation rule, stated so the tier can be recomputed by hand. */
  calculationRule: string;
  confirmedBy?: string;
  calculatedAt?: string;
  /** Stated on every result, not buried in documentation. */
  limitation: string;
  /** Shown only alongside `contributions`. Never on its own. */
  score: number;
  maximum: number;
  contributions: FactorContribution[];
  /** Factors that forced the tier upward on their own. */
  escalatingFactors: Array<{ factor: keyof CriticalityFactors; reason: string }>;
  reasoning: string[];
}

/**
 * Weights, with the reasoning attached.
 *
 * Irreversibility and consequence weigh most because they determine what a
 * mistake costs, and that is the question proportionality turns on. Speed and
 * fan-out weigh more than they intuitively should: they set how much damage
 * occurs before a human notices, which is the variable the 2026 evaluation
 * incidents turned on — 17,600 actions is not a worse decision than 20, it is
 * the same decision taken 17,600 times before anyone looked.
 */
const WEIGHTS: Record<keyof CriticalityFactors, { weight: number; note: string }> = {
  autonomy: { weight: 3, note: 'Determines whether a human sees the action before it happens.' },
  privilege: { weight: 3, note: 'Bounds what the agent can do at all.' },
  dataSensitivity: { weight: 2, note: 'Sets the cost of disclosure and the legal exposure.' },
  reversibility: { weight: 4, note: 'Determines what a mistake costs after it is made.' },
  operationalReach: { weight: 2, note: 'How far a single error propagates.' },
  speed: { weight: 3, note: 'How much happens before a human can intervene.' },
  fanOut: { weight: 3, note: 'Parallel instances multiply every other factor.' },
  financialAuthority: { weight: 2, note: 'Direct loss exposure.' },
  affectedPopulation: { weight: 2, note: 'Who bears the consequence, and whether they chose to.' },
  consequenceOfFailure: { weight: 4, note: 'The severity the whole assessment is proportionate to.' },
};

/**
 * Factors that raise the tier on their own, regardless of the total.
 *
 * Without these, a low total could average away a genuinely serious property.
 * An irreversible action affecting the public is not a mid-tier deployment
 * because everything else about it is modest — and a weighted sum is exactly
 * the mechanism that would say otherwise.
 */
const ESCALATIONS: Array<{
  factor: keyof CriticalityFactors;
  atLeast: number;
  floor: CriticalityTier;
  reason: string;
}> = [
  { factor: 'consequenceOfFailure', atLeast: 3, floor: 'T4_critical', reason: 'Failure can affect safety or fundamental rights.' },
  { factor: 'reversibility', atLeast: 3, floor: 'T3_elevated', reason: 'Actions cannot be undone, so detection after the fact is not a mitigation.' },
  { factor: 'autonomy', atLeast: 3, floor: 'T3_elevated', reason: 'No human sees the action before it happens.' },
  { factor: 'affectedPopulation', atLeast: 3, floor: 'T3_elevated', reason: 'Consequences fall on the public or on vulnerable people.' },
  { factor: 'fanOut', atLeast: 3, floor: 'T3_elevated', reason: 'Unbounded spawning multiplies every other factor and defeats per-instance review.' },
];

const TIER_ORDER: CriticalityTier[] = ['T1_limited', 'T2_standard', 'T3_elevated', 'T4_critical'];

export function assessCriticality(
  factors: CriticalityFactors,
  provenance: CriticalityProvenance = {},
): TierResult {
  const contributions: FactorContribution[] = (
    Object.keys(WEIGHTS) as Array<keyof CriticalityFactors>
  ).map((factor) => {
    const { weight, note } = WEIGHTS[factor];
    const value = factors[factor];
    return {
      factor, value, weight, contribution: value * weight, note,
      rationale: provenance.rationales?.[factor],
    };
  });

  const score = contributions.reduce((n, c) => n + c.contribution, 0);
  const maximum = contributions.reduce((n, c) => n + c.weight * 3, 0);
  const ratio = score / maximum;

  let tier: CriticalityTier =
    ratio >= 0.66 ? 'T4_critical' : ratio >= 0.45 ? 'T3_elevated' : ratio >= 0.22 ? 'T2_standard' : 'T1_limited';

  const escalatingFactors: TierResult['escalatingFactors'] = [];
  for (const rule of ESCALATIONS) {
    if (factors[rule.factor] >= rule.atLeast) {
      escalatingFactors.push({ factor: rule.factor, reason: rule.reason });
      if (TIER_ORDER.indexOf(rule.floor) > TIER_ORDER.indexOf(tier)) tier = rule.floor;
    }
  }

  const reasoning = [
    `Weighted score ${score} of ${maximum} (${Math.round(ratio * 100)}%).`,
    ...escalatingFactors.map((e) => `Raised to at least ${TIER_ORDER[TIER_ORDER.indexOf(tier)]}: ${e.reason}`),
    'The score is meaningless without the factors beside it. A tier that cannot be traced to specific answers is an unexplained rating.',
    'Challenge an input factor rather than the tier. The tier is derived; editing it directly would discard the derivation that makes it reviewable.',
  ];

  return {
    tier,
    methodologyVersion: CRITICALITY_METHODOLOGY_VERSION,
    calculationRule:
      'Each factor (0-3) is multiplied by its weight and summed. The ratio to the maximum sets a band ' +
      '(>=66% T4, >=45% T3, >=22% T2, else T1). Independent escalation rules may then raise the tier, ' +
      'never lower it, so a severe factor cannot be averaged away by modest ones.',
    confirmedBy: provenance.confirmedBy,
    calculatedAt: provenance.calculatedAt,
    limitation: CRITICALITY_LIMITATION,
    score, maximum, contributions, escalatingFactors, reasoning,
  };
}

// ── Proportionality gate ───────────────────────────────────────────────────

export interface DeploymentProposal {
  desiredOutcome?: string;
  affectedUsers?: string[];
  expectedBenefit?: string;
  /** Why an agent, rather than a script, a form or a person. */
  whyAgentIsNeeded?: string;
  /** The non-agent alternative that was considered. */
  nonAgentAlternative?: string;
  /** Why the requested autonomy level is necessary rather than convenient. */
  whyThisAutonomy?: string;
  owner?: string;
  accountableSponsor?: string;
}

export interface ProportionalityResult {
  /** Whether assurance may begin. */
  mayProceed: boolean;
  missing: Array<{ field: keyof DeploymentProposal; question: string }>;
  reasoning: string;
}

const REQUIRED: Array<{ field: keyof DeploymentProposal; question: string }> = [
  { field: 'desiredOutcome', question: 'What outcome is this agent meant to produce?' },
  { field: 'expectedBenefit', question: 'What is the expected benefit, and to whom?' },
  { field: 'whyAgentIsNeeded', question: 'Why does this need an agent rather than a script, a form or a person?' },
  { field: 'nonAgentAlternative', question: 'What non-agent alternative was considered, and why was it rejected?' },
  { field: 'whyThisAutonomy', question: 'Why is the requested autonomy necessary rather than convenient?' },
  { field: 'owner', question: 'Who owns this deployment?' },
  { field: 'accountableSponsor', question: 'Who is accountable for the decision to run it?' },
];

/**
 * The gate that runs before assurance begins.
 *
 * NCSC asks organisations to consider whether AI is needed at all, or whether
 * a lower-risk process would do. An assurance pipeline that starts from the
 * agent's existence can only answer "how safely", never "whether" — and by the
 * time an assurance case is built, the answer to "whether" has been decided by
 * default and nobody was asked.
 *
 * This is not a risk assessment. It is a refusal to begin one until somebody
 * has written down why the deployment should happen.
 */
export function checkProportionality(proposal: DeploymentProposal): ProportionalityResult {
  const missing = REQUIRED.filter(({ field }) => {
    const value = proposal[field];
    if (Array.isArray(value)) return value.length === 0;
    return typeof value !== 'string' || value.trim().length === 0;
  });

  return {
    mayProceed: missing.length === 0,
    missing,
    reasoning: missing.length === 0
      ? 'The deployment has a stated benefit, a considered alternative, a justification for its autonomy, and a named accountable sponsor. Assurance may begin.'
      : `${missing.length} question(s) unanswered. Assurance cannot begin: a case built now would establish how safely this agent can run, never whether it should.`,
  };
}
