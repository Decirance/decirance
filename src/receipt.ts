/**
 * Evidence receipts.
 *
 * A receipt binds an evidence artefact to the configuration it was collected
 * against, who collected it, and when. Without one, "this test passed" is a
 * claim about an unnamed artefact produced by an unnamed party at an unknown
 * time against an unknown configuration — which is not evidence, it is an
 * assertion.
 *
 * The specification calls for an "immutable receipt plus lifecycle status".
 * Immutability here is enforced by content addressing: change any bound field
 * and the digest stops matching, and `verifyReceipt` says so.
 *
 * As with attestations, this is tamper-evident and not cryptographic. Anyone
 * who can write a receipt can recompute its digest. That is stated on the type
 * rather than left for a reader to discover, because a receipt that appears to
 * prove provenance and does not is worse than one that admits its limits.
 */

import { digestOf } from './attestation';

export interface EvidenceQuality {
  provenance: number;
  coverage: number;
  constructValidity: number;
  ecologicalValidity: number;
  repeatability: number;
}

export interface ReceiptInput {
  evidenceRef: string;
  title: string;
  /** Digest of the artefact itself — the log, export or attestation file. */
  artefactDigest: string;
  /** Configuration the artefact was collected against. */
  scopePassportDigest: string;
  scopeContractDigest: string;
  sourceKind: string;
  sourceUri?: string;
  collectedAt: string;
  collectedBy: string;
  quality: EvidenceQuality;
  /** Freshness window. Absent means the artefact never expires on time alone. */
  validUntil?: string;
}

export interface EvidenceReceipt extends ReceiptInput {
  receiptDigest: string;
  issuedAt: string;
  cryptographicallySigned: false;
}

export function issueReceipt(input: ReceiptInput, issuedAt = new Date().toISOString()): EvidenceReceipt {
  return {
    ...input,
    issuedAt,
    receiptDigest: digestOf({ ...input, issuedAt }),
    cryptographicallySigned: false,
  };
}

export function verifyReceipt(receipt: EvidenceReceipt): boolean {
  const { receiptDigest, cryptographicallySigned, ...rest } = receipt;
  void cryptographicallySigned;
  return digestOf(rest) === receiptDigest;
}

export type ReceiptStatus =
  | 'valid'
  | 'stale'
  | 'out_of_scope'
  | 'tampered';

export interface ReceiptAssessment {
  status: ReceiptStatus;
  reasons: string[];
}

/**
 * Assess a receipt against the case's current scope and the clock.
 *
 * Ordering matters: tampering is checked first because a receipt that does not
 * verify tells you nothing reliable about its own scope or dates, so reporting
 * it as merely "stale" would understate the problem.
 */
export function assessReceipt(
  receipt: EvidenceReceipt,
  context: {
    currentPassportDigest: string;
    currentContractDigest: string;
    now?: string;
  },
): ReceiptAssessment {
  const reasons: string[] = [];

  if (!verifyReceipt(receipt)) {
    return {
      status: 'tampered',
      reasons: ['Receipt digest does not match its contents; the record was altered after issue.'],
    };
  }

  const now = context.now ?? new Date().toISOString();
  if (receipt.validUntil && receipt.validUntil < now) {
    reasons.push(`Freshness window closed on ${receipt.validUntil}.`);
    return { status: 'stale', reasons };
  }

  if (receipt.scopePassportDigest !== context.currentPassportDigest) {
    reasons.push(
      `Collected against passport ${receipt.scopePassportDigest}, case now rests on ${context.currentPassportDigest}.`,
    );
  }
  if (receipt.scopeContractDigest !== context.currentContractDigest) {
    reasons.push(
      `Collected against contract ${receipt.scopeContractDigest}, case now rests on ${context.currentContractDigest}.`,
    );
  }
  if (reasons.length > 0) return { status: 'out_of_scope', reasons };

  return { status: 'valid', reasons: [] };
}

/**
 * Weakest dimensions of a receipt's quality.
 *
 * Returned as a list rather than a single score. A mean would let strong
 * provenance conceal weak ecological validity, and those are not
 * interchangeable: one says the artefact is traceable, the other says it
 * resembles production.
 */
export function weakDimensions(
  quality: EvidenceQuality,
  threshold = 70,
): Array<{ dimension: keyof EvidenceQuality; value: number }> {
  return (Object.keys(quality) as Array<keyof EvidenceQuality>)
    .filter((k) => quality[k] < threshold)
    .map((k) => ({ dimension: k, value: quality[k] }))
    .sort((a, b) => a.value - b.value);
}
