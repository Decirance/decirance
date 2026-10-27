/**
 * The boundary between what a model suggests and what the engine may use.
 *
 * An assistant that reads a supplier's security policy and offers "this looks
 * like evidence for C-11" is useful. The same assistant silently writing that
 * into an assurance case is the end of the product: a permit would then rest on
 * a sentence nobody checked, and the audit trail would show a claim supported
 * with no person behind the support.
 *
 * So model output is a *proposal*, and a proposal is not a record. This module
 * defines the difference and makes it structural rather than conventional:
 *
 *   - a proposal carries where it came from — document, passage, model, version,
 *     prompt version, time — and cannot be constructed without them;
 *   - it starts `PROPOSED` and only a named person moves it;
 *   - `valueOf` refuses to return anything for a proposal nobody has accepted,
 *     so the deterministic engine cannot read one by accident;
 *   - accepting requires a reviewer, editing requires the edited value, and
 *     rejecting keeps the original for the record.
 *
 * ## What this module is not
 *
 * It is not an assistant. There is no model call here, no prompt, no HTTP. It is
 * the shape the assistant must produce and the gate its output must pass, built
 * first so the assistant cannot be written in a way that bypasses it. The
 * provider interface below has one implementation in this file — a fixture
 * provider that labels itself as fixtures, so a demonstration can never be
 * mistaken for a live result.
 *
 * ## Why confidence is not a score
 *
 * `confidence` is the model's own stated uncertainty about *its extraction*,
 * recorded because a reviewer should see it. It says nothing about whether the
 * claim is true or the control adequate, and nothing here combines it with
 * anything else. A number that merges extraction confidence with assurance
 * strength would be the composite trust score this product refuses to produce.
 */

/** What an assistant may offer. Each is a suggestion about the case, never a decision. */
export type ProposalType =
  | 'control_extraction'
  | 'obligation_extraction'
  | 'evidence_metadata'
  | 'evidence_claim_mapping'
  | 'contradiction'
  | 'change_classification'
  | 'test_suggestion'
  | 'evidence_gap'
  | 'approver_explanation';

/**
 * `PROPOSED` is the only state a model can produce. The other three require a
 * person, and `EDITED` exists because "accepted after I fixed it" is a different
 * fact from "accepted as offered" — collapsing them would hide how much of the
 * case the assistant actually got right.
 */
export type ProposalStatus = 'PROPOSED' | 'ACCEPTED' | 'EDITED' | 'REJECTED';

/** Where in which document the proposal came from. A proposal with no source is an assertion. */
export interface ProposalSource {
  /** Stable identifier of the document as ingested. */
  documentId: string;
  /** Digest of the exact bytes read, so a later edit to the document is visible. */
  documentDigest: string;
  /** Page, section, line range — whatever locates the passage in that document. */
  locator: string;
  /** The passage itself, quoted. A reviewer must be able to read it without opening the file. */
  quote: string;
}

/** Which model produced this, under which prompt and workflow. All required. */
export interface ModelAttribution {
  provider: string;
  model: string;
  modelVersion: string;
  /** Version of the prompt that produced it. Changing a prompt changes the output. */
  promptVersion: string;
  /** Version of the surrounding workflow: chunking, retrieval, post-processing. */
  workflowVersion: string;
  /**
   * False for anything a model did not actually produce — fixtures, replays,
   * worked examples. A fixture presented as a live result is the specific
   * dishonesty this field exists to prevent.
   */
  live: boolean;
}

export interface ProposalConfidence {
  /** 0–1, the model's stated confidence in the extraction. Never combined with anything. */
  value: number;
  /** What the number is about, in the model's own terms. */
  basis: string;
}

export interface ProposalReview {
  /** The person. Not a service account, not a role name on its own. */
  reviewer: string;
  reviewerRole: string;
  at: string;
  /** Why. Required on reject and on edit; a rejection with no reason teaches nobody. */
  reason?: string;
}

export interface Proposal<T = unknown> {
  id: string;
  type: ProposalType;
  /** At least one. Enforced by `validateProposal`. */
  sources: ProposalSource[];
  model: ModelAttribution;
  createdAt: string;
  confidence: ProposalConfidence;
  /** Plain-language account of what is being proposed and why, for the reviewer. */
  explanation: string;
  status: ProposalStatus;
  /** What the model offered. Kept verbatim for ever, including after an edit. */
  proposedValue: T;
  /** Present once a person has acted. */
  review?: ProposalReview;
  /** Present when accepted as offered or after an edit: the value that may be used. */
  value?: T;
}

export interface ProposalIssue {
  field: string;
  message: string;
}

/**
 * Refuse a malformed proposal at the boundary, with every issue at once.
 *
 * Fails closed: absent attribution, no source passage, a confidence outside
 * 0–1, or a status a model is not allowed to produce are all rejections rather
 * than warnings.
 */
export function validateProposal(input: unknown): { ok: true; proposal: Proposal } | { ok: false; issues: ProposalIssue[] } {
  const issues: ProposalIssue[] = [];
  const reject = (field: string, message: string) => issues.push({ field, message });

  if (typeof input !== 'object' || input === null) {
    return { ok: false, issues: [{ field: '(proposal)', message: 'expected an object' }] };
  }
  const p = input as Partial<Proposal> & Record<string, unknown>;

  for (const field of ['id', 'type', 'createdAt', 'explanation', 'status'] as const) {
    if (typeof p[field] !== 'string' || (p[field] as string).length === 0) reject(field, 'required');
  }
  if (!('proposedValue' in p)) reject('proposedValue', 'required: the thing being proposed');

  if (!Array.isArray(p.sources) || p.sources.length === 0) {
    reject('sources', 'at least one source passage is required. A proposal with no source is an assertion.');
  } else {
    p.sources.forEach((s, i) => {
      for (const field of ['documentId', 'documentDigest', 'locator', 'quote'] as const) {
        if (typeof s?.[field] !== 'string' || s[field].length === 0) reject(`sources[${i}].${field}`, 'required');
      }
    });
  }

  const m = p.model as Partial<ModelAttribution> | undefined;
  for (const field of ['provider', 'model', 'modelVersion', 'promptVersion', 'workflowVersion'] as const) {
    if (typeof m?.[field] !== 'string' || m[field]!.length === 0) reject(`model.${field}`, 'required');
  }
  if (typeof m?.live !== 'boolean') {
    reject('model.live', 'required: state plainly whether a model actually produced this');
  }

  const c = p.confidence as Partial<ProposalConfidence> | undefined;
  if (typeof c?.value !== 'number' || Number.isNaN(c.value) || c.value < 0 || c.value > 1) {
    reject('confidence.value', 'required, 0 to 1');
  }
  if (typeof c?.basis !== 'string' || c.basis.length === 0) {
    reject('confidence.basis', 'required: a number with no stated basis cannot be weighed');
  }

  if (p.status !== undefined && !['PROPOSED', 'ACCEPTED', 'EDITED', 'REJECTED'].includes(p.status)) {
    reject('status', `unknown status "${String(p.status)}"`);
  }
  if (p.status !== 'PROPOSED' && !p.review) {
    reject('review', 'a proposal past PROPOSED must name the person who moved it');
  }

  return issues.length > 0 ? { ok: false, issues } : { ok: true, proposal: input as Proposal };
}

/** What a model is allowed to hand over: a proposal nobody has reviewed. */
export type ProposalDraft<T = unknown> = Omit<Proposal<T>, 'status' | 'review' | 'value'>;

export function draftProposal<T>(draft: ProposalDraft<T>): Proposal<T> {
  return { ...draft, status: 'PROPOSED' };
}

export type ReviewDecision<T> =
  | { decision: 'accept'; reviewer: string; reviewerRole: string; at: string; reason?: string }
  | { decision: 'edit'; reviewer: string; reviewerRole: string; at: string; value: T; reason: string }
  | { decision: 'reject'; reviewer: string; reviewerRole: string; at: string; reason: string };

export type ReviewResult<T> =
  | { ok: true; proposal: Proposal<T> }
  | { ok: false; reason: string };

/**
 * A person decides. Returns a new record; the original proposed value survives.
 *
 * Refuses a second review of the same proposal. Re-deciding is a legitimate act
 * but it is a new event, not an overwrite of the first — and an overwrite would
 * erase the fact that someone had already accepted it.
 */
export function reviewProposal<T>(proposal: Proposal<T>, decision: ReviewDecision<T>): ReviewResult<T> {
  if (proposal.status !== 'PROPOSED') {
    return { ok: false, reason: `proposal ${proposal.id} is already ${proposal.status}; record a new proposal rather than overwriting the review` };
  }
  if (!decision.reviewer?.trim() || !decision.reviewerRole?.trim()) {
    return { ok: false, reason: 'a review needs the name and role of the person making it' };
  }
  const review: ProposalReview = {
    reviewer: decision.reviewer, reviewerRole: decision.reviewerRole, at: decision.at,
    ...(decision.reason ? { reason: decision.reason } : {}),
  };

  if (decision.decision === 'accept') {
    return { ok: true, proposal: { ...proposal, status: 'ACCEPTED', review, value: proposal.proposedValue } };
  }
  if (decision.decision === 'edit') {
    if (decision.value === undefined) return { ok: false, reason: 'an edit must supply the edited value' };
    if (!decision.reason?.trim()) return { ok: false, reason: 'an edit must say what was wrong with the proposal' };
    return { ok: true, proposal: { ...proposal, status: 'EDITED', review, value: decision.value } };
  }
  if (!decision.reason?.trim()) return { ok: false, reason: 'a rejection must say why, or it teaches nobody' };
  return { ok: true, proposal: { ...proposal, status: 'REJECTED', review } };
}

/**
 * The gate. Call this wherever assistant output would enter the engine.
 *
 * Throws for anything not accepted by a named person. Deliberately a throw
 * rather than a filter: silently dropping unaccepted proposals would produce a
 * quietly incomplete case, and silently including them is the failure this
 * whole module exists to prevent.
 */
export function acceptedValue<T>(proposal: Proposal<T>): T {
  if (proposal.status === 'PROPOSED') {
    throw new Error(
      `Proposal ${proposal.id} is PROPOSED and has not been accepted by anyone. `
      + 'Model output cannot enter an assurance case without a named person accepting it.',
    );
  }
  if (proposal.status === 'REJECTED') {
    throw new Error(`Proposal ${proposal.id} was rejected by ${proposal.review?.reviewer ?? 'a reviewer'} and has no usable value.`);
  }
  if (!proposal.review?.reviewer) {
    throw new Error(`Proposal ${proposal.id} claims to be ${proposal.status} but names no reviewer.`);
  }
  if (proposal.value === undefined) {
    throw new Error(`Proposal ${proposal.id} is ${proposal.status} but carries no value.`);
  }
  return proposal.value;
}

/** True only for a proposal a named person accepted or edited. */
export function isAccepted<T>(proposal: Proposal<T>): boolean {
  return (proposal.status === 'ACCEPTED' || proposal.status === 'EDITED')
    && Boolean(proposal.review?.reviewer) && proposal.value !== undefined;
}

/**
 * Split a batch at the boundary, for a caller that has to report both halves.
 *
 * The counts are the useful output: "the assistant offered 40, a reviewer
 * accepted 31, edited 6 and rejected 3" is the measurement that tells you
 * whether the assistant is worth its place.
 */
export function partitionProposals<T>(proposals: Array<Proposal<T>>): {
  usable: Array<Proposal<T>>;
  awaitingReview: Array<Proposal<T>>;
  rejected: Array<Proposal<T>>;
  counts: { proposed: number; accepted: number; edited: number; rejected: number };
} {
  return {
    usable: proposals.filter((p) => isAccepted(p)),
    awaitingReview: proposals.filter((p) => p.status === 'PROPOSED'),
    rejected: proposals.filter((p) => p.status === 'REJECTED'),
    counts: {
      proposed: proposals.filter((p) => p.status === 'PROPOSED').length,
      accepted: proposals.filter((p) => p.status === 'ACCEPTED').length,
      edited: proposals.filter((p) => p.status === 'EDITED').length,
      rejected: proposals.filter((p) => p.status === 'REJECTED').length,
    },
  };
}

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

export interface AssistantRequest {
  type: ProposalType;
  /** The documents to read, already ingested and digested by the caller. */
  documents: Array<{ documentId: string; documentDigest: string; text: string }>;
  /** Case context the assistant may refer to: claim refs and statements, evidence refs. */
  context?: Record<string, unknown>;
  /** Hard ceiling on how many proposals to return, so a reviewer is not buried. */
  maxProposals?: number;
}

/**
 * Provider-independent, so the assistant is not welded to one vendor and so a
 * fixture provider can stand in for tests without pretending to be live.
 *
 * `live` is on the provider as well as on each proposal: a caller should be
 * able to refuse to run at all when it has no live provider, rather than
 * discovering afterwards that the output was fixtures.
 */
export interface AssistantProvider {
  id: string;
  live: boolean;
  attribution: Omit<ModelAttribution, 'live'>;
  propose(request: AssistantRequest): Promise<Array<ProposalDraft>>;
}

/**
 * A provider that returns prepared drafts and says so.
 *
 * Every proposal it emits carries `model.live: false` and a provider id of
 * `fixture:<name>`, which `validateProposal` preserves and any report must
 * print. There is deliberately no option to make it claim otherwise.
 */
export function fixtureProvider(name: string, drafts: Array<ProposalDraft>): AssistantProvider {
  const attribution = {
    provider: `fixture:${name}`,
    model: 'none',
    modelVersion: 'none',
    promptVersion: 'none',
    workflowVersion: 'fixture',
  };
  return {
    id: `fixture:${name}`,
    live: false,
    attribution,
    async propose(request) {
      const wanted = request.maxProposals ?? drafts.length;
      return drafts
        .filter((d) => d.type === request.type)
        .slice(0, wanted)
        .map((d) => ({ ...d, model: { ...attribution, live: false } }));
    },
  };
}

/**
 * Refuse to run an assistant workflow that is not what it claims to be.
 *
 * `requireLive` is the flag a production deployment sets. Without it, a fixture
 * provider is allowed and must be labelled; with it, a fixture provider is an
 * error rather than a quiet substitution.
 */
export function selectProvider(
  providers: AssistantProvider[],
  options: { requireLive: boolean },
): { ok: true; provider: AssistantProvider } | { ok: false; reason: string } {
  const live = providers.find((p) => p.live);
  if (options.requireLive) {
    return live
      ? { ok: true, provider: live }
      : { ok: false, reason: 'no live model provider is configured, and fixtures must not stand in for one here' };
  }
  const chosen = live ?? providers[0];
  return chosen ? { ok: true, provider: chosen } : { ok: false, reason: 'no provider supplied' };
}
