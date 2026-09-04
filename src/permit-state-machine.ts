/**
 * Deployment Permit lifecycle.
 *
 * The permit is the artefact that carries authority to operate, so its legal
 * transitions are defined here as data rather than scattered across handlers.
 * Every transition names the actor role that may make it and whether it came
 * from the published lifecycle or was inferred — see `source` below.
 */

export type PermitState =
  | 'proposed'
  | 'under_review'
  /**
   * Assessment finished, decision not taken.
   *
   * Previously implicit inside under_review, which meant the engine could not
   * represent the moment the product's whole argument turns on: a case that is
   * ready, and a decision nobody has made yet.
   */
  | 'awaiting_approval'
  | 'active'
  | 'pilot'
  | 'restricted'
  | 'suspended'
  | 'reassessment'
  | 'expired'
  | 'rejected'
  | 'revoked'
  /** Replaced by a newer permit version. Terminal. */
  | 'superseded';

/**
 * Every permit state, as data.
 *
 * The authority invariant is decided by enumerating states, so it needs the
 * state space as a value rather than only as a type. Exporting it means a new
 * state cannot be added without the exhaustiveness check noticing.
 */
export const ALL_PERMIT_STATES: PermitState[] = [
  'proposed', 'under_review', 'awaiting_approval', 'active', 'pilot',
  'restricted', 'suspended', 'reassessment', 'expired', 'rejected',
  'revoked', 'superseded',
];

export type ActorRole =
  | 'accountable_owner' // the human who signs
  | 'assurance_engine' // Decirance itself, for evidence-driven transitions
  | 'system'; // time-based transitions

/**
 * `source` distinguishes transitions defined in the Product Requirements and
 * Implementation Specification section 6.2 from ones added to make the machine
 * total.
 *
 * The earlier product brief left `restricted` and `pilot` without exits. The
 * specification supplies four of them (restricted->suspended,
 * restricted->expired, pilot->expired, active->revoked), which are now marked
 * `spec`. The remaining `inferred` entries are still not in any source
 * document and are kept separable so they can be confirmed or dropped rather
 * than silently becoming policy.
 */
export type TransitionSource = 'spec' | 'inferred';

export interface PermitTransition {
  from: PermitState;
  to: PermitState;
  /** Machine-readable trigger, used as the permit event type. */
  trigger: string;
  by: ActorRole;
  source: TransitionSource;
  description: string;
}

export const PERMIT_TRANSITIONS: readonly PermitTransition[] = [
  {
    from: 'proposed',
    to: 'under_review',
    trigger: 'submit_for_assessment',
    by: 'accountable_owner',
    source: 'spec',
    description: 'Agent and context submitted; evidence gathering begins.',
  },
  {
    // The engine may declare the assessment finished. That is the most it may
    // do. Previously `under_review` ran straight to `active` on an "approve"
    // trigger, so a recommendation could become a permit with nothing in
    // between — which is the one thing the product says never happens.
    from: 'under_review',
    to: 'awaiting_approval',
    trigger: 'submit_for_decision',
    by: 'assurance_engine',
    source: 'inferred',
    description:
      'Assessment complete and a recommendation produced. No authority is granted; a named person must decide.',
  },
  {
    from: 'awaiting_approval',
    to: 'active',
    trigger: 'approve',
    by: 'accountable_owner',
    source: 'spec',
    description: 'Human approval. Evidence supports operation in context.',
  },
  {
    from: 'awaiting_approval',
    to: 'pilot',
    trigger: 'approve_supervised_pilot',
    by: 'accountable_owner',
    source: 'spec',
    description:
      'Restricted approval to obtain missing evidence under human review.',
  },
  {
    from: 'awaiting_approval',
    to: 'rejected',
    trigger: 'reject',
    by: 'accountable_owner',
    source: 'spec',
    description: 'Risk or evidential uncertainty exceeds tolerance.',
  },
  {
    from: 'pilot',
    to: 'active',
    trigger: 'complete_pilot_evidence',
    by: 'accountable_owner',
    source: 'spec',
    description: 'Missing evidence obtained; full authority granted.',
  },
  {
    from: 'active',
    to: 'restricted',
    trigger: 'restrict',
    by: 'assurance_engine',
    source: 'spec',
    description:
      'Risk or evidence gap. Authority reduced to the previously justified boundary.',
  },
  {
    from: 'active',
    to: 'suspended',
    trigger: 'suspend_material_change',
    by: 'assurance_engine',
    source: 'spec',
    description: 'A material change invalidated evidence. Operation pauses.',
  },
  {
    from: 'active',
    to: 'expired',
    trigger: 'expire',
    by: 'system',
    source: 'spec',
    description: 'Validity period elapsed or an expiry condition was met.',
  },
  {
    from: 'suspended',
    to: 'reassessment',
    trigger: 'begin_reassessment',
    by: 'assurance_engine',
    source: 'spec',
    description: 'Targeted reassessment of the affected claims begins.',
  },
  {
    from: 'expired',
    to: 'reassessment',
    trigger: 'begin_reassessment',
    by: 'assurance_engine',
    source: 'spec',
    description: 'Renewal review begins.',
  },
  {
    from: 'reassessment',
    to: 'active',
    trigger: 'renew',
    by: 'accountable_owner',
    source: 'spec',
    description: 'Reassessment satisfied. Permit renewed.',
  },
  {
    from: 'reassessment',
    to: 'restricted',
    trigger: 'renew_restricted',
    by: 'accountable_owner',
    source: 'spec',
    description: 'Renewed with reduced permissions or autonomy.',
  },
  {
    from: 'reassessment',
    to: 'revoked',
    trigger: 'revoke',
    by: 'accountable_owner',
    source: 'spec',
    description: 'Authority withdrawn.',
  },

  // Exits from `restricted` and `pilot`. Four are given by specification
  // section 6.2; the three marked `inferred` are not in any source document
  // and need a decision. The open question is whether a restricted permit must
  // route through `suspended` to reach reassessment (as section 6.2 implies)
  // or may enter it directly — the former pauses operation during the review,
  // the latter does not, and that is a policy choice rather than a modelling
  // one.
  {
    from: 'restricted',
    to: 'reassessment',
    trigger: 'begin_reassessment',
    by: 'assurance_engine',
    source: 'inferred',
    description: 'Reassessment of a restricted permit begins.',
  },
  {
    from: 'restricted',
    to: 'suspended',
    trigger: 'suspend_material_change',
    by: 'assurance_engine',
    source: 'spec',
    description: 'A further material change occurred while restricted.',
  },
  {
    from: 'restricted',
    to: 'revoked',
    trigger: 'revoke',
    by: 'accountable_owner',
    source: 'inferred',
    description: 'Authority withdrawn from a restricted permit.',
  },
  {
    from: 'restricted',
    to: 'expired',
    trigger: 'expire',
    by: 'system',
    source: 'spec',
    description: 'A restricted permit reached its validity date.',
  },
  {
    from: 'pilot',
    to: 'suspended',
    trigger: 'suspend_material_change',
    by: 'assurance_engine',
    source: 'inferred',
    description: 'A material change occurred during the supervised pilot.',
  },
  {
    from: 'pilot',
    to: 'restricted',
    trigger: 'restrict',
    by: 'assurance_engine',
    source: 'inferred',
    description: 'Pilot evidence weakened; scope reduced.',
  },
  {
    from: 'pilot',
    to: 'expired',
    trigger: 'expire',
    by: 'system',
    source: 'spec',
    description: 'The pilot window elapsed.',
  },
  {
    from: 'active',
    to: 'revoked',
    trigger: 'revoke',
    by: 'accountable_owner',
    source: 'spec',
    description: 'Authority withdrawn directly, e.g. after an incident.',
  },
];

/** States from which no transition is possible. */
export const TERMINAL_STATES: readonly PermitState[] = ['rejected', 'revoked'];

/**
 * States in which the agent may actually run.
 *
 * `restricted` is included because a restricted permit still authorises
 * operation — but only inside `restrictedToBoundary`. Callers must read that
 * boundary rather than treating restricted as equivalent to active.
 */
export const OPERATING_STATES: readonly PermitState[] = [
  'active',
  'pilot',
  'restricted',
];

/**
 * Supersession, appended so a reissue leaves its predecessor terminal.
 *
 * Without it, renewing produced a new version while the old one still read as
 * live — two permits for one agent, both apparently in force.
 */
export const SUPERSESSION_TRANSITIONS: PermitTransition[] = [
  {
    from: 'active',
    to: 'superseded',
    trigger: 'supersede',
    by: 'assurance_engine',
    source: 'inferred',
    description: 'A new permit version was issued for this agent and context.',
  },
  {
    from: 'restricted',
    to: 'superseded',
    trigger: 'supersede',
    by: 'assurance_engine',
    source: 'inferred',
    description: 'A new permit version was issued for this agent and context.',
  },
];

export function mayOperate(state: PermitState): boolean {
  return OPERATING_STATES.includes(state);
}

export function isTerminal(state: PermitState): boolean {
  return TERMINAL_STATES.includes(state);
}

export function transitionsFrom(state: PermitState): PermitTransition[] {
  return [...PERMIT_TRANSITIONS, ...SUPERSESSION_TRANSITIONS].filter((t) => t.from === state);
}

export type TransitionResult =
  | { ok: true; transition: PermitTransition }
  | { ok: false; reason: string; allowed: PermitTransition[] };

/**
 * Resolve a trigger against the current state.
 *
 * Returns a result rather than throwing, and always reports what *would* have
 * been legal — a rejected transition is itself an auditable event, so the
 * caller needs the alternatives to record why the attempt failed.
 */
export function resolveTransition(
  from: PermitState,
  trigger: string,
): TransitionResult {
  const allowed = transitionsFrom(from);
  if (isTerminal(from)) {
    return {
      ok: false,
      reason: `Permit is in terminal state "${from}"; no transition is possible.`,
      allowed: [],
    };
  }
  const transition = allowed.find((t) => t.trigger === trigger);
  if (!transition) {
    return {
      ok: false,
      reason: `Trigger "${trigger}" is not valid from state "${from}".`,
      allowed,
    };
  }
  return { ok: true, transition };
}

/**
 * The state a permit must move to when a delta invalidates evidence.
 *
 * Suspension is the default because continuing to operate on evidence known to
 * be invalid is the failure mode the product exists to prevent. Restriction is
 * only correct when no critical claim was invalidated, since the agent can then
 * still be trusted inside the narrower boundary the surviving evidence covers.
 */
export function stateAfterMaterialChange(args: {
  current: PermitState;
  invalidatedCriticalClaims: number;
  invalidatedClaims: number;
}): { to: PermitState; trigger: string; rationale: string } | null {
  if (!mayOperate(args.current)) return null;
  if (args.invalidatedClaims === 0) return null;

  if (args.invalidatedCriticalClaims > 0) {
    return {
      to: 'suspended',
      trigger: 'suspend_material_change',
      rationale: `${args.invalidatedCriticalClaims} critical claim(s) invalidated; operation must pause pending targeted reassessment.`,
    };
  }
  return {
    to: 'restricted',
    trigger: 'restrict',
    rationale: `${args.invalidatedClaims} non-critical claim(s) invalidated; authority reduced to the previously justified boundary.`,
  };
}
