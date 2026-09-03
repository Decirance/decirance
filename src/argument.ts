// SPDX-License-Identifier: Apache-2.0
/**
 * Arguments, assumptions, defeaters and residual uncertainty.
 *
 * The graph was Claim → Evidence with typed edges. That is an evidence
 * traceability graph, and a reviewer would be right to say so. An assurance
 * case additionally has to say *why* the evidence supports the claim, *what
 * must be true* for that reasoning to hold, *what would break it*, and *what
 * remains unknown even when everything passes.
 *
 * The distinction is not academic. An assumption that silently stops holding is
 * how an assurance case rots without any evidence expiring: the tests still
 * pass, the artefacts are still in date, and the argument they support no
 * longer stands. Assumptions therefore carry `severedBy` exactly as edges do.
 *
 * Terminology follows Toulmin (warrant, rebuttal) and maps to the OMG
 * Structured Assurance Case Metamodel, so a case can be exported rather than
 * trapped in a private vocabulary. The mapping is in `SACM_MAPPING` and is our
 * interpretation, not an OMG-endorsed binding.
 */

import type { MaterialChangeKind } from './material-change';

/**
 * How an argument moves from evidence to claim.
 *
 * Recorded because the inference type determines what would undermine it. A
 * deductive step fails differently from an inductive one, and a reviewer
 * challenging "we tested 412 cases so it holds generally" is making a specific
 * objection to induction rather than a general complaint.
 */
export type InferenceType =
  | 'deductive'   // the conclusion follows necessarily, e.g. from a config that makes it impossible
  | 'inductive'   // generalised from observed cases, e.g. a test pass rate
  | 'abductive'   // best explanation, e.g. no incidents observed therefore the control works
  | 'authority';  // asserted by a competent party, e.g. a supplier attestation

export interface ArgumentNode {
  ref: string;
  claimRef: string;
  /** Why the cited evidence supports the claim. The reasoning, not the result. */
  warrant: string;
  inference: InferenceType;
  /** Evidence this argument rests on. */
  evidenceRefs: string[];
  assumptionRefs: string[];
}

export type AssumptionStatus = 'holds' | 'unverified' | 'broken';

export interface Assumption {
  ref: string;
  statement: string;
  status: AssumptionStatus;
  /**
   * Changes that break the assumption.
   *
   * An assumption is not evidence and never expires on a date, but it can stop
   * being true. Without this, a case can rot while every artefact stays valid.
   */
  severedBy: MaterialChangeKind[];
  /** Who is positioned to know whether it still holds. */
  owner: string;
}

/**
 * A defeater: something that, if true, undermines the argument.
 *
 * Three kinds, because they demand different responses. A rebutting defeater
 * attacks the conclusion and needs the claim revisited. An undercutting
 * defeater attacks the inference and needs the reasoning revisited even though
 * the evidence is fine. An undermining defeater attacks the evidence itself.
 * Collapsing them into "counterevidence" loses the response.
 */
export type DefeaterKind = 'rebutting' | 'undercutting' | 'undermining';

export interface Defeater {
  ref: string;
  kind: DefeaterKind;
  argumentRef: string;
  statement: string;
  /** Evidence establishing the defeater, where any exists. */
  evidenceRefs: string[];
  /** Whether it has been answered, and how. */
  addressed: boolean;
  response?: string;
}

/**
 * What remains unknown when everything has passed.
 *
 * Published deliberately. A case that records no residual uncertainty is
 * claiming completeness no testing regime can deliver, and an accountable
 * person signing one deserves to see what they are accepting rather than infer
 * it from silence.
 */
export interface ResidualUncertainty {
  ref: string;
  claimRef: string;
  statement: string;
  /** Why it cannot be resolved with the evidence available. */
  whyItRemains: string;
  acceptedBy?: string;
}

export interface AssuranceArgumentLayer {
  arguments: ArgumentNode[];
  assumptions: Assumption[];
  defeaters: Defeater[];
  residualUncertainty: ResidualUncertainty[];
}

/** Our interpretation of the correspondence to OMG SACM 2.3. Not endorsed. */
export const SACM_MAPPING: Array<{ decirance: string; sacm: string; note: string }> = [
  { decirance: 'Claim', sacm: 'Claim', note: 'Direct.' },
  { decirance: 'ArgumentNode.warrant', sacm: 'ArgumentReasoning', note: 'The reasoning connecting evidence to claim.' },
  { decirance: 'ArgumentNode (evidence link)', sacm: 'AssertedEvidence', note: 'Asserted relationship from artefact to claim.' },
  { decirance: 'ArgumentNode (claim link)', sacm: 'AssertedInference', note: 'Inference from subclaims or evidence to a claim.' },
  { decirance: 'Assumption', sacm: 'Claim (assumed=true)', note: 'SACM marks assumed claims rather than typing them separately.' },
  { decirance: 'Defeater', sacm: 'AssertedChallenge', note: 'A challenge to a claim or inference.' },
  { decirance: 'Evidence', sacm: 'ArtifactReference', note: 'With provenance in ArtifactAsset.' },
  { decirance: 'ResidualUncertainty', sacm: 'Claim (toBeSupported)', note: 'SACM has no first-class uncertainty node; the closest is an unsupported claim.' },
  { decirance: 'severedBy', sacm: '(no equivalent)', note: 'Change-dependency on a relationship is the addition SACM does not model.' },
];

/**
 * Assumptions broken by a set of changes.
 *
 * This is the failure the argument layer exists to catch: evidence still valid,
 * artefacts still in date, and the reasoning they support no longer standing.
 */
export function brokenAssumptions(
  assumptions: Assumption[],
  changes: MaterialChangeKind[],
): Assumption[] {
  const set = new Set(changes);
  return assumptions
    .filter((a) => a.severedBy.some((k) => set.has(k)))
    .map((a) => ({ ...a, status: 'broken' as const }));
}

export interface ArgumentIntegrity {
  argumentRef: string;
  claimRef: string;
  standing: boolean;
  reasons: string[];
}

/**
 * Whether each argument still stands.
 *
 * An argument fails on a broken assumption or an unaddressed defeater, both of
 * which are independent of whether its evidence is still valid — which is the
 * whole reason for modelling them.
 */
export function argumentIntegrity(
  layer: AssuranceArgumentLayer,
  changes: MaterialChangeKind[] = [],
): ArgumentIntegrity[] {
  const broken = new Set(brokenAssumptions(layer.assumptions, changes).map((a) => a.ref));
  const byRef = new Map(layer.assumptions.map((a) => [a.ref, a]));

  return layer.arguments.map((argument) => {
    const reasons: string[] = [];

    for (const ref of argument.assumptionRefs) {
      const assumption = byRef.get(ref);
      if (!assumption) {
        reasons.push(`Assumption ${ref} is referenced but not defined.`);
        continue;
      }
      if (broken.has(ref)) {
        reasons.push(`Assumption ${ref} is broken by this change: ${assumption.statement}`);
      } else if (assumption.status === 'broken') {
        reasons.push(`Assumption ${ref} is recorded as broken: ${assumption.statement}`);
      } else if (assumption.status === 'unverified') {
        reasons.push(`Assumption ${ref} is unverified: ${assumption.statement}`);
      }
    }

    for (const defeater of layer.defeaters) {
      if (defeater.argumentRef !== argument.ref || defeater.addressed) continue;
      reasons.push(`Unaddressed ${defeater.kind} defeater: ${defeater.statement}`);
    }

    return {
      argumentRef: argument.ref,
      claimRef: argument.claimRef,
      // An unverified assumption weakens rather than breaks; a broken one or an
      // unaddressed defeater stops the argument standing.
      standing: !reasons.some((r) => r.includes('broken') || r.includes('defeater')),
      reasons,
    };
  });
}

/** Claims with no argument at all — evidence attached but no stated reasoning. */
export function claimsWithoutArgument(
  claimRefs: string[],
  layer: AssuranceArgumentLayer,
): string[] {
  const argued = new Set(layer.arguments.map((a) => a.claimRef));
  return claimRefs.filter((ref) => !argued.has(ref));
}
