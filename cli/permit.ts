// SPDX-License-Identifier: Apache-2.0
/**
 * Take the decision, or record the refusal.
 *
 * This is the one command that produces authority, and it is built to be hard
 * to misuse:
 *
 *   - A permit requires a **named person** and the accountable-owner role.
 *     There is no flag that lets a script, a model or the engine approve
 *     anything. `--role assurance-engine` is refused with the reason.
 *   - A case the rules put at `reject` produces a **refusal record**, not a
 *     permit, and exits non-zero. There is no override flag.
 *   - An approval whose level is conditional or supervised must carry its
 *     conditions. "Approved with conditions" and no conditions recorded is not
 *     a decision; it is a signature on a blank page.
 *   - The attestation binds the signer to the exact Passport digest, claim
 *     states, conditions and accepted risks in front of them at the time. It is
 *     tamper-evident, not cryptographic, and the record says so in a field
 *     rather than leaving a reader to assume.
 *
 * The permit also records what suspends it. That is the difference between a
 * permit and a certificate: it names, up front, the changes after which it
 * stops being true.
 *
 * Run: npx decirance permit [dir] --approver "Name" --role accountable-owner
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  buildAttestation,
  MATERIAL_CHANGE_KINDS,
  type Recommendation,
} from '../src/index.ts';
import { assessCase, printAssessment, type Assessment } from './assess.ts';

/** The only role that may hold a permit open. Neither the engine nor a clock can sign. */
const APPROVING_ROLE = 'accountable-owner';

const OUTCOME: Record<Exclude<Recommendation, 'reject'>, { state: string; level: string; needsConditions: boolean }> = {
  approve: { state: 'active', level: 'production', needsConditions: false },
  approve_with_conditions: { state: 'active', level: 'conditional', needsConditions: true },
  supervised_pilot: { state: 'pilot', level: 'supervised_pilot', needsConditions: true },
};

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

function flags(args: string[], name: string): string[] {
  const out: string[] = [];
  args.forEach((a, i) => { if (a === `--${name}` && args[i + 1] && !args[i + 1].startsWith('--')) out.push(args[i + 1]); });
  return out;
}

/**
 * The changes that end this permit's validity.
 *
 * Taken from the assurance graph itself: a change kind that severs any edge
 * this case depends on is a change that makes the case partly untrue, so it
 * belongs in the permit as a suspension trigger. Deriving it beats a
 * hand-written list that drifts from the graph it is meant to describe.
 */
function suspensionTriggers(dir: string): string[] {
  const graph = JSON.parse(readFileSync(join(dir, 'assurance-graph.json'), 'utf8')) as {
    edges?: Array<{ severedBy?: string[] }>;
  };
  const kinds = new Set<string>();
  for (const edge of graph.edges ?? []) for (const kind of edge.severedBy ?? []) kinds.add(kind);
  // Only kinds the engine knows: a trigger the delta engine cannot detect is a
  // promise the product cannot keep.
  return [...kinds].filter((k) => (MATERIAL_CHANGE_KINDS as readonly string[]).includes(k)).sort();
}

function refusal(dir: string, a: Assessment, args: string[]): number {
  const path = join(dir, 'refusal.json');
  const unsupported = a.claims.filter((c) => c.critical && c.state !== 'supported');
  writeFileSync(path, `${JSON.stringify({
    schema_version: '0.1.0',
    outcome: 'refused',
    agent_passport_digest: a.passportDigest,
    recommendation: a.result.recommendation,
    binding_rule: a.result.bindingRule,
    critical_claims_not_supported: unsupported.map((c) => ({ ref: c.ref, state: c.state, statement: c.statement })),
    refused_at: new Date().toISOString(),
    refused_by: flag(args, 'approver') ?? 'not recorded',
    note: 'No permit was issued. This record exists so the refusal is as auditable as an approval.',
  }, null, 2)}\n`);

  console.log('');
  console.log('NO PERMIT ISSUED');
  console.log('='.repeat(72));
  console.log(`  The rules put this case at "${a.result.recommendation}".`);
  if (a.result.bindingRule) console.log(`  ${a.result.bindingRule.rule}: ${a.result.bindingRule.reason}`);
  if (unsupported.length > 0) {
    console.log('');
    console.log('  Critical claims not supported by in-scope evidence:');
    for (const c of unsupported) console.log(`    ${c.ref.padEnd(7)} ${c.state.padEnd(21)} ${c.statement.slice(0, 50)}`);
  }
  console.log('');
  console.log(`  Refusal recorded in ${path}`);
  console.log('  There is no flag that overrides this. Collect the evidence, or narrow');
  console.log('  the deployment so the claims that matter are ones you can support.');
  console.log('');
  return 2;
}

export function runPermit(args: string[]): number {
  const positional = args.filter((a, i) => !a.startsWith('--') && (i === 0 || !args[i - 1].startsWith('--')));
  const dir = resolve(positional[0] ?? 'decirance-case');
  const approver = flag(args, 'approver');
  const role = flag(args, 'role');

  if (!approver || approver.trim().length === 0) {
    console.error('A permit needs the name of the person taking the decision: --approver "Ari Rios".');
    console.error('This is not a formality. A permit nobody is named on is not a decision.');
    return 1;
  }
  if (role !== APPROVING_ROLE) {
    console.error(`--role must be "${APPROVING_ROLE}". Got ${role ? `"${role}"` : 'nothing'}.`);
    console.error('Only the accountable owner can grant an agent authority to operate.');
    console.error('The engine, this tool, a model and a scheduler cannot, by design.');
    return 1;
  }

  const assessment = assessCase(dir);
  if (!args.includes('--quiet')) printAssessment(assessment);

  if (assessment.result.recommendation === 'reject') return refusal(dir, assessment, args);

  const outcome = OUTCOME[assessment.result.recommendation];
  const conditions = flags(args, 'condition');
  const accepted = flags(args, 'accept-risk');

  if (outcome.needsConditions && conditions.length === 0) {
    console.error(`The rules put this case at "${assessment.result.recommendation}", so the permit must`);
    console.error('record what the approval depends on:');
    console.error('');
    console.error('  --condition "Human approval before any external send" \\');
    console.error('  --condition "Read-only case retrieval only"');
    console.error('');
    console.error('Each condition is a thing whose removal ends this permit.');
    return 1;
  }

  const passport = JSON.parse(readFileSync(join(dir, 'agent-passport.json'), 'utf8')) as {
    agent_id?: string; agent_version?: string; operating?: { permissions?: string[] };
    entitlement?: { prohibited?: string[] };
  };
  const now = new Date().toISOString();
  const permit = {
    schema_version: '0.1.0',
    permit_id: flag(args, 'ref') ?? `DP-${now.slice(0, 10)}-${assessment.passportDigest.slice(-6)}`,
    permit_version: 1,
    agent_id: passport.agent_id ?? 'unknown',
    agent_version: passport.agent_version ?? 'unknown',
    passport_digest: assessment.passportDigest,
    state: outcome.state,
    level: outcome.level,
    permitted_actions: passport.operating?.permissions ?? [],
    prohibited_actions: passport.entitlement?.prohibited ?? [],
    conditions,
    residual_risks: accepted,
    suspension_triggers: suspensionTriggers(dir),
    valid_from: now,
    ...(flag(args, 'expires') ? { expires_at: flag(args, 'expires') } : {}),
    accountable_owner: approver,
    approved_by: approver,
    approved_at: now,
    attestation: {},
  };

  const attestation = buildAttestation({
    permitRef: permit.permit_id,
    passportDigest: assessment.passportDigest,
    caseVersion: `${assessment.claims.length} claims, ${assessment.counts.accepted} in-scope evidence`,
    recommendation: assessment.result.recommendation,
    decision: `${permit.level} (${permit.state})`,
    conditions,
    residualRisksAccepted: accepted,
    actor: approver,
    role: 'accountable_owner',
    at: now,
  });
  permit.attestation = {
    statement: attestation.statement,
    digest: attestation.digest,
    cryptographically_signed: false,
  };

  const path = join(dir, 'deployment-permit.json');
  writeFileSync(path, `${JSON.stringify(permit, null, 2)}\n`);

  console.log('PERMIT ISSUED');
  console.log('='.repeat(72));
  console.log(`  ${permit.permit_id}   ${permit.level} (${permit.state})`);
  console.log('');
  console.log(`  ${attestation.statement}`);
  console.log('');
  console.log(`  Suspended automatically by: ${permit.suspension_triggers.slice(0, 6).join(', ')}`);
  if (permit.suspension_triggers.length > 6) console.log(`                              and ${permit.suspension_triggers.length - 6} more change kinds`);
  console.log('');
  console.log(`  Written to ${path}`);
  console.log('  The attestation digest is tamper-evident, not cryptographic: it detects an');
  console.log('  altered record, and does not prove authorship.');
  console.log('');
  console.log('  When something changes:  decirance diff <old-passport> <new-passport> --graph <graph>');
  console.log('');
  return 0;
}
