// SPDX-License-Identifier: Apache-2.0
import { digestOf } from './digest';

/**
 * Human attestation over a deployment decision.
 *
 * The product's central claim is that Decirance recommends and an accountable
 * person decides. That only means something if the person's decision is bound
 * to *what they were shown* — the exact passport, case version, recommendation
 * and conditions in front of them at the moment they signed. An approval that
 * floats free of its evidence is a signature on a blank page.
 *
 * IMPORTANT: `digest` is a SHA-256 over the canonical record. It detects any
 * alteration, but it is not a signature: it proves nothing about WHO produced
 * the record, and anyone able to write one can recompute its digest.
 * Non-repudiation needs a key the signer controls, which is out of scope here
 * rather than faked — a field that looks authoritative and is not would be
 * worse than an obviously provisional one.
 */

export interface AttestationInput {
  permitRef: string;
  /** Digest of the Agent Passport the decision was taken against. */
  passportDigest: string;
  caseVersion: string;
  recommendation: string;
  /** What the signer is actually granting. */
  decision: string;
  conditions: string[];
  residualRisksAccepted: string[];
  actor: string;
  role: string;
  at: string;
}

export interface Attestation extends AttestationInput {
  statement: string;
  digest: string;
  /** Never true in this build. Present so callers cannot assume otherwise. */
  cryptographicallySigned: false;
}

export function buildAttestation(input: AttestationInput): Attestation {
  const statement =
    `I, ${input.actor} (${input.role}), accept accountability for operating ` +
    `${input.permitRef} as "${input.decision}" against Agent Passport ${input.passportDigest} ` +
    `and assurance case ${input.caseVersion}. ` +
    (input.conditions.length > 0
      ? `This approval depends on the following remaining in force: ${input.conditions.join('; ')}. `
      : 'No conditions are attached. ') +
    (input.residualRisksAccepted.length > 0
      ? `I accept the residual risks recorded as ${input.residualRisksAccepted.join(', ')}.`
      : 'No material residual risk is accepted.');

  return {
    ...input,
    statement,
    digest: digestOf({ ...input, statement }),
    cryptographicallySigned: false,
  };
}

/** Recompute and compare. False means the record was altered after signing. */
export function verifyAttestation(attestation: Attestation): boolean {
  const { digest, cryptographicallySigned, statement, ...input } = attestation;
  void cryptographicallySigned;
  return digestOf({ ...input, statement }) === digest;
}
