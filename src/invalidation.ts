/**
 * The Assurance Delta engine.
 *
 * Given a set of classified material changes and the assurance graph, decide
 * which claims survive the change and which do not. Deterministic by design:
 * no model is consulted, and the same inputs always produce the same output,
 * because the result gates a permit that a named human signs.
 *
 * The commercially load-bearing output is `preserved` — the evidence that does
 * *not* need re-collecting. That is the half of the result that turns a
 * reassessment into a targeted one.
 */

import type { AssuranceDomain, MaterialChange, MaterialChangeKind } from './material-change';

export type EdgeKind =
  | 'supports' // evidence -> claim
  | 'challenges' // evidence -> claim (contradicts it)
  | 'depends_on' // claim -> control, or claim -> component
  | 'mitigates' // control -> hazard
  | 'addresses' // claim -> hazard
  | 'explores' // scenario -> hazard
  | 'derives_from'; // claim -> claim

export type ClaimImpact =
  | 'preserved'
  | 'affected'
  | 'invalidated'
  | 'unproven'
  | 'challenged'
  /**
   * The engine could not decide either way.
   *
   * Distinct from `affected`, which is a finding, and from `preserved`, which
   * is a positive statement that no modelled dependency was severed. `unknown`
   * says the graph does not cover the question — an unclassified change, or a
   * dependency the model does not represent.
   *
   * Reporting these as `affected` overstated what had been established;
   * reporting them as `preserved` would have been dangerous. Neither is
   * honest, which is why the third answer has to exist.
   */
  | 'unknown';

export interface GraphEdge {
  kind: EdgeKind;
  sourceRef: string;
  targetRef: string;
  /** Material change kinds that sever this dependency. */
  severedBy: MaterialChangeKind[];
}

export interface ClaimNode {
  ref: string;
  statement: string;
  domain: AssuranceDomain;
  critical: boolean;
  /** Test identifiers this claim's evidence covers. */
  coversTests: string[];
}

export interface EvidenceNode {
  ref: string;
  /** Passport hash the artefact was collected against. */
  scopePassportHash: string;
}

/**
 * Tests a change kind obliges the organisation to run. Supplied by the caller
 * so scenario packs stay data, not code.
 */
export type ObligationMap = Partial<Record<MaterialChangeKind, string[]>>;

export interface DeltaInput {
  claims: ClaimNode[];
  evidence: EvidenceNode[];
  edges: GraphEdge[];
  changes: MaterialChange[];
  /** Unclassified passport differences; any entry forces full reassessment. */
  unclassifiedFields?: string[];
  obligations?: ObligationMap;
  /** Hash of the passport the case currently rests on. */
  currentPassportHash: string;
}

export interface ClaimOutcome {
  claimRef: string;
  statement: string;
  domain: AssuranceDomain;
  critical: boolean;
  impact: ClaimImpact;
  triggeredBy: MaterialChangeKind[];
  /** Edge path from the severed dependency to this claim. */
  path: string[];
  invalidatedEvidenceRefs: string[];
  preservedEvidenceRefs: string[];
  /**
   * Evidence that contradicts this claim and is still applicable after the
   * change. Reported separately and never netted off against supporting
   * evidence: specification section 10.2 requires that a volume of weak
   * support must not outweigh one credible contradictory result.
   */
  challengingEvidenceRefs: string[];
  requiredTests: string[];
}

export interface NewObligation {
  testId: string;
  triggeredBy: MaterialChangeKind;
  reason: string;
}

export interface DeltaResult {
  outcomes: ClaimOutcome[];
  newObligations: NewObligation[];
  summary: {
    preserved: number;
    affected: number;
    invalidated: number;
    unproven: number;
    challenged: number;
    /** Claims the graph could not decide either way. */
    unknown: number;
    evidencePreserved: number;
    evidenceInvalidated: number;
    /** Share of claims needing no further work, 0-1. */
    reassessmentAvoided: number;
  };
  fullReassessmentRequired: boolean;
  fullReassessmentReason?: string;
  /**
   * Evidence collected against a different passport. Reported for visibility
   * under the "evidence honesty" principle, but deliberately NOT used to drive
   * invalidation: after any change every artefact predates the new passport,
   * so scope staleness alone would mark the whole case invalid and destroy the
   * selectivity the product exists to provide. Severed edges decide impact.
   */
  scopeStaleEvidenceRefs: string[];
}

export function computeDelta(input: DeltaInput): DeltaResult {
  const {
    claims,
    evidence,
    edges,
    changes,
    unclassifiedFields = [],
    obligations = {},
    currentPassportHash,
  } = input;

  // Specification section 10.4: a cosmetic metadata change has no assurance
  // impact once confirmed. It stays in `changes` so the confirmation is still
  // recorded, but it severs nothing.
  const bearingChanges = changes.filter((c) => c.kind !== 'cosmetic_metadata');
  const changeKinds = new Set(bearingChanges.map((c) => c.kind));
  const evidenceByRef = new Map(evidence.map((e) => [e.ref, e]));

  const scopeStaleEvidenceRefs = evidence
    .filter((e) => e.scopePassportHash !== currentPassportHash)
    .map((e) => e.ref);

  // Fail closed: an unrecognised configuration difference means the graph
  // cannot be reasoned about, so nothing may be preserved.
  //
  // The outcome is `unknown` rather than `affected`. The engine has not found
  // an impact on these claims; it has failed to look, and those are different
  // things to tell an accountable person. The work required is identical —
  // everything is retested — but the reason on the page is now true.
  if (unclassifiedFields.length > 0) {
    return {
      outcomes: claims.map((c) => ({
        claimRef: c.ref,
        statement: c.statement,
        domain: c.domain,
        critical: c.critical,
        impact: 'unknown' as const,
        triggeredBy: [],
        path: [],
        invalidatedEvidenceRefs: [],
        preservedEvidenceRefs: [],
        challengingEvidenceRefs: [],
        requiredTests: c.coversTests,
      })),
      newObligations: [],
      summary: {
        preserved: 0,
        // Not "affected": the engine has not found an impact on these claims,
        // it has failed to look. Counting them as findings would overstate what
        // was established.
        affected: 0,
        unknown: claims.length,
        invalidated: 0,
        unproven: 0,
        challenged: 0,
        evidencePreserved: 0,
        evidenceInvalidated: 0,
        reassessmentAvoided: 0,
      },
      fullReassessmentRequired: true,
      fullReassessmentReason: `Unclassified passport change(s): ${unclassifiedFields.join(', ')}. The material change taxonomy cannot determine their effect, so no evidence may be preserved.`,
      scopeStaleEvidenceRefs,
    };
  }

  const severed = edges.filter((e) =>
    e.severedBy.some((k) => changeKinds.has(k)),
  );
  const severedSet = new Set(severed);

  // Direct invalidation: a severed edge terminating at a claim.
  const directly = new Map<string, { kinds: Set<MaterialChangeKind>; path: string[] }>();
  for (const edge of severed) {
    if (edge.kind !== 'supports' && edge.kind !== 'depends_on') continue;
    // `supports` runs evidence -> claim; `depends_on` runs claim -> control.
    const claimRef = edge.kind === 'supports' ? edge.targetRef : edge.sourceRef;
    const entry = directly.get(claimRef) ?? {
      kinds: new Set<MaterialChangeKind>(),
      path: [],
    };
    for (const k of edge.severedBy) {
      if (changeKinds.has(k)) entry.kinds.add(k);
    }
    entry.path.push(`${edge.sourceRef} -[${edge.kind}]-> ${edge.targetRef}`);
    directly.set(claimRef, entry);
  }

  // Propagate along derives_from: a claim built on an invalidated claim is
  // affected, not invalidated — its own evidence may still hold.
  const derived = new Map<string, { from: string; path: string[] }>();
  const derivesEdges = edges.filter((e) => e.kind === 'derives_from');
  let frontier = new Set(directly.keys());
  const seen = new Set(frontier);
  while (frontier.size > 0) {
    const next = new Set<string>();
    for (const edge of derivesEdges) {
      if (!frontier.has(edge.targetRef) || seen.has(edge.sourceRef)) continue;
      derived.set(edge.sourceRef, {
        from: edge.targetRef,
        path: [`${edge.sourceRef} -[derives_from]-> ${edge.targetRef}`],
      });
      next.add(edge.sourceRef);
      seen.add(edge.sourceRef);
    }
    frontier = next;
  }

  const outcomes: ClaimOutcome[] = claims.map((claim) => {
    const supporting = edges.filter(
      (e) => e.kind === 'supports' && e.targetRef === claim.ref,
    );
    const invalidatedEvidenceRefs = supporting
      .filter((e) => severedSet.has(e))
      .map((e) => e.sourceRef)
      .filter((ref) => evidenceByRef.has(ref));
    const preservedEvidenceRefs = supporting
      .filter((e) => !severedSet.has(e))
      .map((e) => e.sourceRef)
      .filter((ref) => evidenceByRef.has(ref));

    // Contradictory evidence that the change did not sever still stands.
    const challengingEvidenceRefs = edges
      .filter(
        (e) =>
          e.kind === 'challenges' &&
          e.targetRef === claim.ref &&
          !severedSet.has(e),
      )
      .map((e) => e.sourceRef)
      .filter((ref) => evidenceByRef.has(ref));

    const direct = directly.get(claim.ref);
    const indirect = derived.get(claim.ref);

    let impact: ClaimImpact = 'preserved';
    let triggeredBy: MaterialChangeKind[] = [];
    let path: string[] = [];

    if (direct) {
      impact = 'invalidated';
      triggeredBy = [...direct.kinds];
      path = direct.path;
    } else if (indirect) {
      impact = 'affected';
      path = indirect.path;
      triggeredBy = [...(directly.get(indirect.from)?.kinds ?? [])];
    } else if (challengingEvidenceRefs.length > 0) {
      // A surviving contradiction outranks preservation regardless of how much
      // supporting evidence also survived (specification section 10.2). A
      // challenged claim cannot be quietly carried through a delta.
      impact = 'challenged';
    }

    return {
      claimRef: claim.ref,
      statement: claim.statement,
      domain: claim.domain,
      critical: claim.critical,
      impact,
      triggeredBy,
      path,
      invalidatedEvidenceRefs,
      preservedEvidenceRefs,
      challengingEvidenceRefs,
      requiredTests: impact === 'preserved' ? [] : claim.coversTests,
    };
  });

  // Obligations the change creates that no existing claim covers. These are
  // genuinely new assurance gaps, not invalidated old ones.
  const covered = new Set(claims.flatMap((c) => c.coversTests));
  const newObligations: NewObligation[] = [];
  for (const change of bearingChanges) {
    for (const testId of obligations[change.kind] ?? []) {
      if (covered.has(testId)) continue;
      if (newObligations.some((o) => o.testId === testId)) continue;
      newObligations.push({
        testId,
        triggeredBy: change.kind,
        reason: `${change.description} No existing claim covers "${testId}".`,
      });
    }
  }

  const count = (i: ClaimImpact) =>
    outcomes.filter((o) => o.impact === i).length;
  const evidenceInvalidated = new Set(
    outcomes.flatMap((o) => o.invalidatedEvidenceRefs),
  ).size;
  const evidencePreserved = new Set(
    outcomes.flatMap((o) => o.preservedEvidenceRefs),
  ).size;
  const preserved = count('preserved');

  return {
    outcomes,
    newObligations,
    summary: {
      preserved,
      affected: count('affected'),
      unknown: count('unknown'),
      invalidated: count('invalidated'),
      unproven: newObligations.length,
      challenged: count('challenged'),
      evidencePreserved,
      evidenceInvalidated,
      reassessmentAvoided: claims.length === 0 ? 0 : preserved / claims.length,
    },
    fullReassessmentRequired: false,
    scopeStaleEvidenceRefs,
  };
}

/** Claims that must be re-tested, most consequential first. */
export function reassessmentPlan(result: DeltaResult): ClaimOutcome[] {
  const rank: Record<ClaimImpact, number> = {
    // "We cannot tell" about a critical claim is not a lesser finding than a
    // known one, so it sorts alongside invalidation rather than below it.
    unknown: 0,
    invalidated: 0,
    challenged: 1,
    affected: 2,
    unproven: 3,
    preserved: 4,
  };
  return result.outcomes
    .filter((o) => o.impact !== 'preserved')
    .sort(
      (a, b) =>
        Number(b.critical) - Number(a.critical) ||
        rank[a.impact] - rank[b.impact] ||
        a.claimRef.localeCompare(b.claimRef),
    );
}
