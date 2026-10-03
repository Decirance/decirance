// SPDX-License-Identifier: Apache-2.0
/**
 * Run the published quick start, and assert what it claims.
 *
 * The README promises that someone can go from `init` to a permit, apply a
 * change, and see exactly what it severed, in about fifteen minutes. That
 * promise is the product's front door, and it was broken three separate ways
 * while this file was being written:
 *
 *   - the bundled reference case scoped its evidence to a Passport digest that
 *     matched no published document, so every result read as out of scope;
 *   - the Passport file format carried none of the containment fields, so
 *     `diff` reported "no material change" when a write permission was granted;
 *   - `assess` and `diff` disagreed about the same case, because only one of
 *     them read the approver's accepted mitigation.
 *
 * None of those were visible from inside the engine, where the property checks
 * live, because all three are failures of what reaches disk. So this harness
 * works the way a reader does: real files in a temporary directory, through the
 * command layer, asserting the numbers the documentation prints.
 *
 * Run: npx tsx ./cli/journey.ts
 */

import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit } from './init.ts';
import { assessCase } from './assess.ts';
import { runPermit } from './permit.ts';
import { runApply } from './apply.ts';
import { runDiff } from './diff.ts';

let failures = 0;
function check(name: string, condition: boolean, because: string): void {
  if (condition) { console.log(`  PASS  ${name}`); return; }
  failures += 1;
  console.log(`  FAIL  ${name}`);
  console.log(`        ${because}`);
}

/** The commands print; the harness asserts. Quiet unless something fails. */
function quietly<T>(fn: () => T): { value: T; output: string } {
  const lines: string[] = [];
  const log = console.log;
  const error = console.error;
  console.log = (...a: unknown[]) => { lines.push(a.join(' ')); };
  console.error = (...a: unknown[]) => { lines.push(a.join(' ')); };
  try {
    return { value: fn(), output: lines.join('\n') };
  } finally {
    console.log = log;
    console.error = error;
  }
}

const work = mkdtempSync(join(tmpdir(), 'decirance-journey-'));
const dir = join(work, 'mycase');

try {
  console.log('');
  console.log('QUICK START');
  console.log('='.repeat(72));
  console.log(`  ${work}`);
  console.log('');

  // ---- 1. init ---------------------------------------------------------------
  check('init writes a complete case', quietly(() => runInit([dir])).value === 0, 'init returned non-zero.');
  for (const f of ['agent-passport.json', 'context-contract.json', 'assurance-graph.json', 'evidence-manifest.json', 'README.md']) {
    check(`init writes ${f}`, existsSync(join(dir, f)), `${f} is missing.`);
  }
  check('init writes the changed Passports the quick start uses',
    readdirSync(join(dir, 'changes')).length >= 5, 'Fewer change Passports than the README lists.');
  check('init refuses to overwrite a case it did not create',
    quietly(() => runInit([dir])).value === 1, 'A second init overwrote an existing case without --force.');

  // ---- 2. the case as published ----------------------------------------------
  const base = assessCase(dir);
  check('every piece of evidence is in scope for the Passport beside it',
    base.counts.accepted === 21 && base.counts.unplaceable === 0 && base.counts.rejected === 0,
    `Accepted ${base.counts.accepted}, unplaceable ${base.counts.unplaceable}, rejected ${base.counts.rejected}. `
    + 'The reference case scoped its evidence to a digest no published Passport had.');
  check('the published case recommends approval with conditions',
    base.result.recommendation === 'approve_with_conditions',
    `Recommendation was ${base.result.recommendation}, and the bundled permit says conditional.`);
  check('the challenged critical claim carries a named acceptance',
    base.claims.some((c) => c.ref === 'C-04' && c.mitigationAccepted && Boolean(c.mitigationAcceptedBy)),
    'C-04 is contradicted by evidence; without a recorded acceptance the case cannot be at conditional.');

  // ---- 3. nothing approves itself --------------------------------------------
  check('a permit needs a named person',
    quietly(() => runPermit([dir, '--role', 'accountable-owner'])).value === 1,
    'A permit was issued with nobody named on it.');
  check('the engine cannot approve',
    quietly(() => runPermit([dir, '--approver', 'Automation', '--role', 'assurance-engine'])).value === 1,
    'A non-human role was allowed to grant authority.');
  check('an approval with conditions must record them',
    quietly(() => runPermit([dir, '--approver', 'Ari Rios', '--role', 'accountable-owner', '--quiet'])).value === 1,
    'A conditional approval was issued with no conditions attached.');

  const issued = quietly(() => runPermit([
    dir, '--approver', 'Ari Rios', '--role', 'accountable-owner', '--quiet',
    '--condition', 'Human approval before any external send',
    '--accept-risk', 'RR-02 — incorrect draft may influence a reviewer',
  ]));
  check('a named accountable owner can take the decision', issued.value === 0, issued.output.slice(-400));

  const permit = JSON.parse(readFileSync(join(dir, 'deployment-permit.json'), 'utf8')) as Record<string, any>;
  check('the permit names the Passport it was decided against',
    permit.passport_digest === base.passportDigest, 'The permit floats free of the configuration it approved.');
  check('the attestation binds the signer to the conditions and risks',
    String(permit.attestation.statement).includes('Ari Rios')
    && String(permit.attestation.statement).includes('Human approval before any external send')
    && String(permit.attestation.statement).includes('RR-02'),
    'The statement must restate what was accepted, not merely that something was.');
  check('the record does not claim to be cryptographically signed',
    permit.attestation.cryptographically_signed === false,
    'A tamper-evident digest is not a signature, and must not read as one.');
  check('the permit records what will suspend it',
    Array.isArray(permit.suspension_triggers) && permit.suspension_triggers.includes('permission_granted'),
    'A permit that does not say what ends it is a certificate.');

  // ---- 4. something changes ---------------------------------------------------
  const applied = quietly(() => runApply([join(dir, 'changes', 'tool-write-permission.json'), dir]));
  check('applying a change keeps the Passport it replaced', applied.value === 0
    && readdirSync(join(dir, 'history')).length === 1,
    'Without the previous Passport, nothing can tell what the change severed.');
  check('applying the same configuration twice is a no-op',
    quietly(() => runApply([join(dir, 'agent-passport.json'), dir])).value === 0
    && readdirSync(join(dir, 'history')).length === 1,
    'An identical Passport was recorded as a change.');

  const after = assessCase(dir);
  check('a write permission severs exactly the evidence that depended on it',
    after.counts.severed === 3 && after.counts.carriedForward === 18,
    `Severed ${after.counts.severed}, carried forward ${after.counts.carriedForward}. `
    + 'Selectivity is the product: severing everything, or nothing, are both wrong.');
  check('the severed evidence is named, with the change that severed it',
    after.evidence.filter((e) => e.status === 'severed_by_change')
      .every((e) => (e.severedBy ?? []).includes('permission_granted')),
    'A reviewer has to know which change invalidated which result.');
  check('the change is reported as the classified kind it is',
    after.changesApplied.length === 1 && after.changesApplied[0].changes.includes('permission_granted'),
    'The file format carried no permissions, so this change was once invisible.');
  check('the claims that depended on that evidence are no longer supported',
    ['C-01', 'C-02', 'C-16'].every((ref) => after.claims.find((c) => c.ref === ref)?.state !== 'supported'),
    'Least privilege and credential-scope claims rest on the severed evidence.');
  check('claims nothing severed are untouched',
    ['C-15', 'C-17', 'C-18', 'C-19'].every((ref) => after.claims.find((c) => c.ref === ref)?.state === 'supported'),
    'A change must not invalidate claims it has no path to.');

  // ---- 5. the two commands over one case agree --------------------------------
  const diffOut = quietly(() => runDiff([
    join(dir, 'history', readdirSync(join(dir, 'history'))[0]),
    join(dir, 'agent-passport.json'),
    '--graph', join(dir, 'assurance-graph.json'),
    '--json',
  ]));
  const diffJson = JSON.parse(diffOut.output) as { recommendation: { outcome?: string; recommendation?: string } };
  const diffRecommendation = diffJson.recommendation.recommendation ?? diffJson.recommendation.outcome;
  check('diff and assess reach the same recommendation for the same change',
    diffRecommendation === after.result.recommendation,
    `diff said ${diffRecommendation}, assess said ${after.result.recommendation}. `
    + 'Two tools over one case must not disagree about what the case says.');

  // ---- 6. adding a control restores nothing ----------------------------------
  const before = after.result.recommendation;
  quietly(() => runApply([join(dir, 'changes', 'containment-added.json'), dir]));
  const restored = assessCase(dir);
  check('adding a control does not restore a permit by itself',
    restored.result.recommendation === before || restored.result.recommendation === 'reject',
    `Recommendation moved from ${before} to ${restored.result.recommendation} on a configuration change alone. `
    + 'Authority is restored by evidence and a decision, never by a better configuration.');
  check('the permit on disk still names the superseded Passport',
    JSON.parse(readFileSync(join(dir, 'deployment-permit.json'), 'utf8')).passport_digest !== restored.passportDigest,
    'A permit must not appear to cover a configuration nobody decided on.');

  // ---- 7. evidence nobody can place ------------------------------------------
  rmSync(join(dir, 'history'), { recursive: true, force: true });
  const orphaned = assessCase(dir);
  check('evidence whose Passport is missing supports nothing',
    orphaned.counts.unplaceable === 21 && orphaned.counts.carriedForward === 0,
    `Unplaceable ${orphaned.counts.unplaceable}, carried forward ${orphaned.counts.carriedForward}. `
    + 'Whether a change severed a result cannot be guessed, so it must fail closed.');
  check('and the recommendation falls accordingly',
    orphaned.result.recommendation === 'reject' || orphaned.result.recommendation === 'supervised_pilot',
    `Recommendation was ${orphaned.result.recommendation} with no placeable evidence at all.`);
} finally {
  rmSync(work, { recursive: true, force: true });
  console.log('');
  console.log(`  cleaned up ${work}`);
}

console.log('');
if (failures > 0) {
  console.log(`${failures} CHECK(S) FAILED.\n`);
  process.exitCode = 1;
} else {
  console.log('The quick start does what it says, on files, through the commands.\n');
}
