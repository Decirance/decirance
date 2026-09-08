// SPDX-License-Identifier: Apache-2.0
/**
 * The evidence ingestion contract.
 *
 * One shape that every route into the system produces — manual upload,
 * structured import, an API submission, or an adapter reading a specific
 * evaluation framework. Defined here, in the open package, because an
 * organisation deciding whether to send us evidence needs to see exactly what
 * we ask for before they send anything.
 *
 * ## The contract is mostly about refusing things
 *
 * An evidence record that does not say what configuration it was collected
 * against is not evidence of anything. It is a result, and a result unattached
 * to a system is the thing this product exists to stop people relying on. So
 * `scopePassportHash` is required, and ingestion fails without it rather than
 * defaulting to "current" — defaulting would silently attach yesterday's test
 * to today's agent, which is the exact failure the delta engine is built to
 * detect.
 *
 * The same applies to `claimsSupported`. An artefact that supports no claim is
 * either misfiled or the case is missing a claim, and both need a person.
 * Accepting it produces a case that looks well-evidenced and answers nothing.
 *
 * ## Quality is recorded, never computed
 *
 * The five dimensions arrive from the submitter, and this module does not
 * derive them. An adapter that inferred `constructValidity` from a pass rate
 * would be inventing an assessor's judgement from a number that cannot contain
 * it. Where an adapter genuinely knows a dimension — repeatability from a
 * seeded, pinned run — it says so and cites why; where it does not, the
 * dimension is absent and the gap is visible.
 */

/**
 * The five quality dimensions, reused from `receipt` rather than redeclared.
 *
 * A second identical interface would compile and would be the beginning of two
 * definitions of what evidence quality is — the duplication defect this project
 * keeps finding in itself.
 *
 * Five, not six. Applicability, whether evidence speaks to a claim at all, is a
 * binding decision recorded on the graph edge rather than a score: as a sixth
 * dimension it could be averaged away by the other five.
 */
import type { EvidenceQuality } from './receipt';
/** Where a record came from. Extended by adapters, not by callers. */
export type EvidenceSourceKind =
  | 'inspect_eval'
  | 'control_test'
  | 'config_snapshot'
  | 'attestation'
  | 'red_team'
  | 'monitoring'
  | 'manual';

/**
 * How the record reached us.
 *
 * Separate from `sourceKind`, which says what the evidence *is*. A red-team
 * result typed in by hand and the same result arriving from a framework are the
 * same kind of evidence with very different provenance, and a reviewer needs
 * both facts.
 */
export type IngestRoute = 'manual' | 'structured_import' | 'api' | 'adapter';

export interface EvidenceSubmission {
  /** Stable reference within the case, e.g. E-093. */
  ref: string;
  title: string;
  detail: string;
  sourceKind: EvidenceSourceKind;
  route: IngestRoute;

  /**
   * The configuration this was collected against.
   *
   * Required, and never defaulted. Evidence with no scope is a result rather
   * than evidence, and attaching it to whatever is running now is the silent
   * failure the delta engine exists to prevent.
   */
  scopePassportHash: string;
  /** The operating context, where the collection depended on one. */
  scopeContractHash?: string;

  /** ISO 8601. When the evidence was produced, not when it was uploaded. */
  collectedAt: string;
  /** The team or person accountable for the result. Not a system name. */
  owner: string;

  /** Claims this speaks to. At least one of these two must be non-empty. */
  claimsSupported: string[];
  claimsContradicted?: string[];

  /**
   * Assessor judgement, per dimension, 0-100. Partial by design.
   *
   * An adapter supplies only the dimensions it can defend. Absence means "not
   * assessed", which is a different and more useful statement than a number
   * nobody stands behind.
   */
  quality: Partial<EvidenceQuality>;

  /** Known limits on what this result can support. Free text, kept verbatim. */
  limitations?: string[];

  /** Adapter-specific provenance: run id, commit, dataset digest, tool version. */
  provenanceRefs?: Record<string, string>;

  /** After which the result should not be relied on without re-collection. */
  validUntil?: string;
}

export interface IngestIssue {
  severity: 'reject' | 'warn';
  field: string;
  message: string;
}

export type IngestResult =
  | { ok: true; submission: EvidenceSubmission; warnings: IngestIssue[] }
  | { ok: false; issues: IngestIssue[] };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/;
const QUALITY_DIMENSIONS: Array<keyof EvidenceQuality> = [
  'provenance', 'coverage', 'constructValidity', 'ecologicalValidity', 'repeatability',
];

/**
 * Validate a submission, failing closed.
 *
 * Returns every issue rather than the first: a submitter fixing one field
 * should not have to discover the next by resubmitting, and an adapter author
 * needs the whole picture in one run.
 */
export function validateSubmission(input: unknown): IngestResult {
  const issues: IngestIssue[] = [];
  const warnings: IngestIssue[] = [];
  const reject = (field: string, message: string) => issues.push({ severity: 'reject', field, message });
  const warn = (field: string, message: string) => warnings.push({ severity: 'warn', field, message });

  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, issues: [{ severity: 'reject', field: '(root)', message: 'A submission must be a JSON object.' }] };
  }
  const s = input as Record<string, unknown>;

  for (const field of ['ref', 'title', 'detail', 'sourceKind', 'route', 'owner'] as const) {
    if (typeof s[field] !== 'string' || !(s[field] as string).trim()) {
      reject(field, `"${field}" is required and must be a non-empty string.`);
    }
  }

  if (typeof s.scopePassportHash !== 'string' || !s.scopePassportHash.trim()) {
    reject('scopePassportHash',
      'Required. Evidence that does not name the configuration it was collected against '
      + 'cannot be checked for applicability later, and defaulting it to the current '
      + 'passport would silently attach an old result to a changed agent.');
  }

  if (typeof s.collectedAt !== 'string' || !ISO_DATE.test(s.collectedAt)) {
    reject('collectedAt', 'Required, as an ISO 8601 date. This is when the evidence was produced, not when it was uploaded.');
  }

  const supported = Array.isArray(s.claimsSupported) ? s.claimsSupported : [];
  const contradicted = Array.isArray(s.claimsContradicted) ? s.claimsContradicted : [];
  if (supported.length === 0 && contradicted.length === 0) {
    reject('claimsSupported',
      'An artefact must speak to at least one claim, supporting or contradicting it. '
      + 'Evidence attached to nothing makes a case look well-evidenced while answering '
      + 'no question in it.');
  }
  for (const ref of [...supported, ...contradicted]) {
    if (typeof ref !== 'string' || !ref.trim()) {
      reject('claimsSupported', 'Claim references must be non-empty strings.');
    }
  }

  const quality = (typeof s.quality === 'object' && s.quality !== null ? s.quality : {}) as Record<string, unknown>;
  for (const dim of QUALITY_DIMENSIONS) {
    const v = quality[dim];
    if (v === undefined) continue;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 100) {
      reject(`quality.${dim}`, `"${dim}" must be a number between 0 and 100 when present.`);
    }
  }
  const assessed = QUALITY_DIMENSIONS.filter((d) => quality[d] !== undefined);
  if (assessed.length === 0) {
    warn('quality',
      'No quality dimension was assessed. The record is accepted, and a reviewer will '
      + 'see an artefact nobody has judged — which is honest, and weaker than it looks.');
  } else if (assessed.length < QUALITY_DIMENSIONS.length) {
    const missing = QUALITY_DIMENSIONS.filter((d) => quality[d] === undefined);
    warn('quality',
      `Not assessed: ${missing.join(', ')}. Absence is recorded as "not assessed" rather than `
      + 'inferred, so the gap stays visible.');
  }

  if (s.validUntil !== undefined && (typeof s.validUntil !== 'string' || !ISO_DATE.test(s.validUntil))) {
    reject('validUntil', 'When present, must be an ISO 8601 date.');
  }

  if (s.route === 'manual' && !s.provenanceRefs) {
    warn('provenanceRefs',
      'A manually entered result carries no run identifier, so it cannot be traced back '
      + 'to an execution. That is not a reason to refuse it; it is a reason a reviewer '
      + 'should weigh it differently.');
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, submission: input as EvidenceSubmission, warnings };
}

/**
 * An adapter turns one framework's output into submissions.
 *
 * Deliberately small. The value is in the contract being stable and documented,
 * so a partner can write the adapter for whatever they already run — and one
 * adapter maintained by us is worth more than five written speculatively
 * against tools nobody in the pilot uses.
 */
export interface EvidenceAdapter {
  /** Identifier recorded on every record this adapter produces. */
  id: string;
  /** What it reads, in a sentence a non-engineer can check. */
  describes: string;
  /** Dimensions this adapter can defend, and why. Everything else stays absent. */
  assessableDimensions: Partial<Record<keyof EvidenceQuality, string>>;
  parse(raw: unknown, context: AdapterContext): IngestResult[];
}

export interface AdapterContext {
  /** The passport digest the run was executed against. Supplied, never guessed. */
  scopePassportHash: string;
  /** Accountable owner for results this run produces. */
  owner: string;
  /** Maps a framework's test identifier to a claim reference in the case. */
  claimForTest: (testId: string) => string | undefined;
}
