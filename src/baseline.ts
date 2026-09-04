// SPDX-License-Identifier: Apache-2.0
/**
 * The Organisation Assurance Baseline, and policy containment.
 *
 * Everything else in this engine assesses one agent against one context. This
 * asks a prior question: what does *this organisation* permit, prohibit and
 * require of any AI system at all? Without an answer, "fit for us" has no
 * referent — an agent can only be shown fit for a context somebody wrote down,
 * and the context was previously the top of the policy hierarchy with nothing
 * above it.
 *
 * That absence had a consequence worth stating plainly. The rule that a
 * narrower level may not weaken a broader one was not merely unimplemented; it
 * was *unstatable*, because a Context Contract had no parent to be checked
 * against. Prohibitions lived on the contract, so prohibiting an action meant
 * only that this contract did not permit it — the next contract could permit it
 * freely, and nothing would notice.
 *
 * The containment reasoning here is deliberately the same as `checkDelegation`
 * in `authority.ts`, one level up. A Context Contract is to a Baseline what a
 * child grant is to its parent: it may narrow, and it may not widen or drop an
 * inherited prohibition. Using one mechanism means the product gives one answer
 * to "may a narrower thing weaken a broader one", rather than two answers that
 * happen to agree today.
 *
 * A rule with no machine-evaluable predicate is still a real obligation. It is
 * carried as `humanReviewOnly` and reported as such, because presenting a prose
 * policy as automatically enforced would be the same overclaim this product
 * exists to argue against.
 */

import { digestOf } from './digest';

export type BaselineStatus =
  | 'draft' | 'in_review' | 'approved' | 'active'
  | 'superseded' | 'expired' | 'withdrawn';

/**
 * What a rule does when it applies.
 *
 * `deny` and `require` are the two that bind: everything else narrows or
 * escalates. Conflict resolution treats `deny` as strongest, which is why it is
 * first.
 */
export type RuleOutcome =
  | 'deny'
  | 'require'
  | 'require_evidence'
  | 'restrict'
  | 'escalate'
  | 'allow';

/** Where a rule is actually enforced, as opposed to merely stated. */
export type EnforcementLocation =
  | 'design' | 'ci' | 'identity' | 'gateway'
  | 'runtime' | 'monitoring' | 'human_procedure';

export interface BaselineRule {
  ruleId: string;
  /** Stable across revisions, so a rule can be traced through versions. */
  key: string;
  category: string;
  /** The rule as a person would state it. */
  statement: string;
  outcome: RuleOutcome;
  /**
   * The action or capability this rule governs, in the same vocabulary the
   * Context Contract uses. Absent for rules that cannot be evaluated
   * mechanically.
   */
  subject?: string;
  /**
   * True when no machine-evaluable predicate exists. The rule still binds; it
   * binds a person rather than the engine, and saying so is the point.
   */
  humanReviewOnly?: boolean;
  /** May a time-bounded exception ever be granted against this rule? */
  exceptable: boolean;
  requiredApprover?: string;
  evidenceObligation?: string;
  enforcementLocation: EnforcementLocation;
  sourceRef?: string;
  reasonCode: string;
}

export interface OrganisationAssuranceBaseline {
  id: string;
  organisationId: string;
  name: string;
  schemaVersion: string;
  revision: string;
  status: BaselineStatus;
  effectiveFrom: string;
  reviewDueAt: string;
  ownerUserId: string;
  approvedBy?: string;
  approvedAt?: string;
  jurisdictions: string[];
  sectors: string[];
  rules: BaselineRule[];
  supersedesId?: string;
}

/** Canonical digest over the rules that bind, so a permit can name what it was decided under. */
export function baselineDigest(baseline: OrganisationAssuranceBaseline): string {
  return digestOf({
    id: baseline.id,
    revision: baseline.revision,
    rules: [...baseline.rules]
      .sort((a, b) => a.ruleId.localeCompare(b.ruleId))
      .map((r) => ({ ruleId: r.ruleId, key: r.key, outcome: r.outcome, subject: r.subject ?? null })),
  });
}

// ── Containment ────────────────────────────────────────────────────────────

/**
 * The part of a Context Contract that policy containment can see.
 *
 * Deliberately narrow. A contract has many fields; only these can widen or
 * narrow what the organisation already decided.
 */
export interface ContractPolicyView {
  ref: string;
  permittedActions: string[];
  prohibitedActions: string[];
  /** Controls the contract asserts are in place, by rule key or control name. */
  satisfiedRequirements: string[];
}

export interface PolicyContainmentFinding {
  ruleId: string;
  ruleKey: string;
  severity: 'violation' | 'unresolved' | 'note';
  detail: string;
  /** What would resolve it. */
  remedy?: string;
}

export interface PolicyContainmentResult {
  contractRef: string;
  baselineRevision: string;
  baselineDigest: string;
  valid: boolean;
  findings: PolicyContainmentFinding[];
  /** Prohibitions the contract correctly carried down. */
  inherited: string[];
  /** Rules that bind a person rather than the engine. */
  humanReviewObligations: string[];
}

/**
 * Check a Context Contract against the organisation's baseline.
 *
 * The invariant, stated as containment: a contract may prohibit more than the
 * baseline does and require more than the baseline does. It may not permit
 * something the baseline denies, and it may not drop a prohibition it
 * inherited.
 *
 * Findings are `violation` when the engine can decide, and `unresolved` when
 * it cannot — a rule the contract neither satisfies nor visibly addresses is
 * not silently passed. That is the same fail-closed direction the change
 * taxonomy takes with an unclassified difference.
 */
export function checkPolicyContainment(
  baseline: OrganisationAssuranceBaseline,
  contract: ContractPolicyView,
): PolicyContainmentResult {
  const findings: PolicyContainmentFinding[] = [];
  const inherited: string[] = [];
  const humanReviewObligations: string[] = [];

  const permitted = new Set(contract.permittedActions);
  const prohibited = new Set(contract.prohibitedActions);
  const satisfied = new Set(contract.satisfiedRequirements);

  for (const rule of baseline.rules) {
    if (rule.humanReviewOnly || !rule.subject) {
      humanReviewObligations.push(`${rule.ruleId} — ${rule.statement}`);
      continue;
    }

    switch (rule.outcome) {
      case 'deny': {
        // Permitting what the organisation denies is the clearest violation.
        if (permitted.has(rule.subject)) {
          findings.push({
            ruleId: rule.ruleId,
            ruleKey: rule.key,
            severity: 'violation',
            detail: `The contract permits "${rule.subject}", which the organisation prohibits: ${rule.statement}`,
            remedy: `Remove "${rule.subject}" from permitted actions, or seek a policy exception if this rule allows one${rule.exceptable ? '' : ' — this one does not'}.`,
          });
          break;
        }
        // Silence is not inheritance. A prohibition the contract does not
        // carry down is one the next reader will not see.
        if (!prohibited.has(rule.subject)) {
          findings.push({
            ruleId: rule.ruleId,
            ruleKey: rule.key,
            severity: 'unresolved',
            detail: `The contract neither permits nor prohibits "${rule.subject}". An organisational prohibition must be carried down explicitly, not left implied.`,
            remedy: `Add "${rule.subject}" to the contract's prohibited actions.`,
          });
          break;
        }
        inherited.push(`${rule.subject} — prohibited by ${rule.ruleId}`);
        break;
      }

      case 'require':
      case 'require_evidence': {
        if (!satisfied.has(rule.subject)) {
          findings.push({
            ruleId: rule.ruleId,
            ruleKey: rule.key,
            severity: 'unresolved',
            detail: `The organisation requires "${rule.subject}" and the contract does not record it as satisfied: ${rule.statement}`,
            remedy: rule.evidenceObligation
              ? `Supply: ${rule.evidenceObligation}`
              : `Record how "${rule.subject}" is met in this context.`,
          });
          break;
        }
        inherited.push(`${rule.subject} — required by ${rule.ruleId}`);
        break;
      }

      case 'restrict':
      case 'escalate': {
        if (permitted.has(rule.subject) && !satisfied.has(rule.subject)) {
          findings.push({
            ruleId: rule.ruleId,
            ruleKey: rule.key,
            severity: 'unresolved',
            detail: `"${rule.subject}" is permitted but the organisation restricts it: ${rule.statement}`,
            remedy: rule.requiredApprover
              ? `Obtain approval from ${rule.requiredApprover}, and record it.`
              : 'Record the compensating restriction in this contract.',
          });
        }
        break;
      }

      case 'allow':
      default:
        break;
    }
  }

  return {
    contractRef: contract.ref,
    baselineRevision: baseline.revision,
    baselineDigest: baselineDigest(baseline),
    // Unresolved does not invalidate — it blocks a clean pass and must be seen.
    valid: !findings.some((f) => f.severity === 'violation'),
    findings,
    inherited,
    humanReviewObligations,
  };
}

/**
 * Whether the baseline has enough decisions in it to assess an agent at all.
 *
 * Returns named gaps rather than a percentage. A completeness score would
 * invite an organisation to optimise the number, and the number is not the
 * thing — the missing decision is.
 */
export type BaselineReadiness =
  | 'ready_for_assessment'
  | 'ready_for_restricted_pilot_only'
  | 'incomplete';

const REQUIRED_CATEGORIES = [
  'accountability',
  'prohibited_use',
  'data_classification',
  'human_oversight',
  'authority_limits',
  'evidence',
  'permit_duration',
  'incident',
  'material_change',
] as const;

export function baselineCompleteness(baseline: OrganisationAssuranceBaseline): {
  readiness: BaselineReadiness;
  missing: Array<{ category: string; whyItMatters: string }>;
} {
  const present = new Set(baseline.rules.map((r) => r.category));
  const WHY: Record<string, string> = {
    accountability: 'Without a named owner, no permit has anyone to bind.',
    prohibited_use: 'Without prohibitions, every assessment starts from "why not".',
    data_classification: 'Without data rules, an agent cannot be told which data it may touch.',
    human_oversight: 'Without oversight rules, "a human is involved" cannot be checked.',
    authority_limits: 'Without limits, authority is bounded only by what the tools happen to allow.',
    evidence: 'Without evidence requirements, sufficiency is decided case by case and inconsistently.',
    permit_duration: 'Without a maximum duration, a permit issued once persists indefinitely.',
    incident: 'Without an incident owner, suspension has nobody to perform it.',
    material_change: 'Without change rules, an agent can drift out of what was assessed unnoticed.',
  };

  const missing = REQUIRED_CATEGORIES
    .filter((c) => !present.has(c))
    .map((c) => ({ category: c, whyItMatters: WHY[c] }));

  const readiness: BaselineReadiness =
    missing.length === 0 ? 'ready_for_assessment'
      : missing.length <= 2 ? 'ready_for_restricted_pilot_only'
        : 'incomplete';

  return { readiness, missing };
}
