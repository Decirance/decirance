// SPDX-License-Identifier: Apache-2.0
/**
 * The permit invariant.
 *
 * Decirance cannot prove a language model safe, and should never imply it can.
 * But the *authority granted to it* is a small, closed, decidable object, and
 * that can carry a checkable guarantee.
 *
 *   No production action is permitted unless
 *     the permit is in an operating state
 *     AND the running configuration matches the one the permit was bound to
 *     AND every mandatory condition is satisfied
 *     AND the action is within the permitted set
 *     AND the action is not prohibited
 *     AND the permit has not expired
 *
 * The probabilistic model stays outside the proof boundary. What is inside is
 * the question an enforcement point actually asks: may this action proceed?
 *
 * Every clause fails closed. An unknown state, an absent digest or a missing
 * condition denies rather than permits, because the alternative is a bug that
 * grants authority — the only defect class here that could cause harm.
 */

import { ALL_PERMIT_STATES, mayOperate, transitionsFrom, type PermitState } from './permit-state-machine';

export interface PermitBinding {
  reference: string;
  state: PermitState;
  /** Digest of the passport this authority was granted against. */
  passportDigest: string;
  permittedActions: string[];
  prohibitedActions: string[];
  /** Conditions that must hold, with their current satisfaction. */
  conditions: Array<{ ref: string; mandatory: boolean; satisfied: boolean }>;
  expiresAt?: string;
}

export interface ActionRequest {
  action: string;
  /** Digest of the configuration actually running now. */
  currentPassportDigest: string;
  at?: string;
}

export type DenialReason =
  | 'permit_not_operating'
  | 'configuration_mismatch'
  | 'mandatory_condition_unsatisfied'
  | 'action_prohibited'
  | 'action_not_permitted'
  | 'permit_expired';

export interface InvariantResult {
  permitted: boolean;
  /** Every failing clause, not only the first. A caller fixing one should see all. */
  denials: Array<{ reason: DenialReason; detail: string }>;
}

export function checkPermitInvariant(
  permit: PermitBinding,
  request: ActionRequest,
): InvariantResult {
  const denials: InvariantResult['denials'] = [];

  if (!mayOperate(permit.state)) {
    denials.push({
      reason: 'permit_not_operating',
      detail: `Permit ${permit.reference} is ${permit.state}; no action is authorised.`,
    });
  }

  // Configuration binding. An empty digest on either side is a mismatch, not a
  // pass: "we could not determine what is running" must never authorise.
  if (!permit.passportDigest || !request.currentPassportDigest ||
      permit.passportDigest !== request.currentPassportDigest) {
    denials.push({
      reason: 'configuration_mismatch',
      detail: `Permit is bound to ${permit.passportDigest || '(none)'} but ${request.currentPassportDigest || '(unknown)'} is running.`,
    });
  }

  const unsatisfied = permit.conditions.filter((c) => c.mandatory && !c.satisfied);
  if (unsatisfied.length > 0) {
    denials.push({
      reason: 'mandatory_condition_unsatisfied',
      detail: `Mandatory condition(s) not satisfied: ${unsatisfied.map((c) => c.ref).join(', ')}.`,
    });
  }

  // Prohibition is checked before permission, so an action appearing on both
  // lists is denied. A contradictory permit must not grant.
  if (permit.prohibitedActions.includes(request.action)) {
    denials.push({
      reason: 'action_prohibited',
      detail: `"${request.action}" is prohibited by this permit.`,
    });
  } else if (!permit.permittedActions.includes(request.action)) {
    denials.push({
      reason: 'action_not_permitted',
      detail: `"${request.action}" is not in the permitted set.`,
    });
  }

  if (permit.expiresAt) {
    const now = request.at ?? new Date().toISOString();
    if (permit.expiresAt < now) {
      denials.push({
        reason: 'permit_expired',
        detail: `Permit expired at ${permit.expiresAt}.`,
      });
    }
  }

  return { permitted: denials.length === 0, denials };
}

/**
 * Exhaustive check that no permit state outside the operating set can authorise.
 *
 * This is the closest thing here to a proof, and it is a small one: the state
 * space is finite and enumerable, so the property is decided rather than
 * sampled. It is stated as a property over all states rather than tested on a
 * few, because "we tried three states and they denied" is the weaker claim.
 */
export function verifyNoAuthorityOutsideOperatingStates(): {
  holds: boolean;
  violations: PermitState[];
} {
  // The state space itself, not a copy of it.
  //
  // This enumeration is what makes the property *decided* rather than sampled,
  // so a second list that could fall behind the first would be the worst
  // possible defect here: the invariant would go on claiming coverage it no
  // longer had. Adding a state to the machine now extends this check
  // automatically, because there is only one list.
  const violations = ALL_PERMIT_STATES.filter((state) => {
    if (mayOperate(state)) return false;
    // An otherwise perfect request: only the state should deny it.
    const result = checkPermitInvariant(
      {
        reference: 'INV-TEST',
        state,
        passportDigest: 'sha256:test',
        permittedActions: ['case:read'],
        prohibitedActions: [],
        conditions: [{ ref: 'C1', mandatory: true, satisfied: true }],
      },
      { action: 'case:read', currentPassportDigest: 'sha256:test' },
    );
    return result.permitted;
  });

  return { holds: violations.length === 0, violations };
}

/**
 * Exhaustive check that authority is never restored without a human.
 *
 * Suspension is the one action Decirance takes on its own: a material change
 * invalidates critical evidence and the permit is suspended by the engine,
 * under a standing organisational rule, with no person in the loop at that
 * moment. That is defensible only if the machine cannot also undo it. A system
 * that can stop and restart an agent by itself has, in effect, been granted the
 * decision — which is the authority this product exists to keep with a person.
 *
 * So the property is about paths, not states: from any non-operating state,
 * every route back to operation must pass through at least one transition whose
 * actor is `accountable_owner`. It is decided by exhaustive search rather than
 * asserted, because the failure mode is a single transition added later —
 * plausible-looking, machine-actored, and quietly closing the loop.
 *
 * Returns the offending path when one exists, since "some path is wrong" is not
 * an actionable finding.
 */
export function verifyNoAutomaticRestoration(): {
  holds: boolean;
  paths: string[];
} {
  const offending: string[] = [];

  for (const start of ALL_PERMIT_STATES) {
    if (mayOperate(start)) continue;

    // Breadth-first over machine-actored transitions only. If operation is
    // reachable at all in this restricted graph, no human was required.
    const seen = new Set<PermitState>([start]);
    const queue: Array<{ state: PermitState; path: string[] }> = [{ state: start, path: [start] }];

    while (queue.length > 0) {
      const { state, path } = queue.shift()!;
      for (const t of transitionsFrom(state)) {
        if (t.by === 'accountable_owner') continue; // a human decided; not a violation
        if (mayOperate(t.to)) {
          offending.push([...path, `-(${t.trigger}/${t.by})->`, t.to].join(' '));
          continue;
        }
        if (seen.has(t.to)) continue;
        seen.add(t.to);
        queue.push({ state: t.to, path: [...path, `-(${t.trigger}/${t.by})->`, t.to] });
      }
    }
  }

  return { holds: offending.length === 0, paths: offending };
}

/**
 * Exhaustive check that a configuration change always denies.
 *
 * The property the whole product rests on: a permit bound to one configuration
 * must not authorise a different one, in any state.
 */
export function verifyConfigurationBinding(): {
  holds: boolean;
  violations: PermitState[];
} {
  const operating: PermitState[] = ['active', 'pilot', 'restricted'];
  const violations = operating.filter((state) => {
    const result = checkPermitInvariant(
      {
        reference: 'INV-TEST',
        state,
        passportDigest: 'sha256:approved',
        permittedActions: ['case:read'],
        prohibitedActions: [],
        conditions: [],
      },
      { action: 'case:read', currentPassportDigest: 'sha256:changed' },
    );
    return result.permitted;
  });
  return { holds: violations.length === 0, violations };
}
