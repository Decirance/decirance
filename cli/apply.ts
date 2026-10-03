// SPDX-License-Identifier: Apache-2.0
/**
 * Move a case onto a new Agent Passport, keeping the old one.
 *
 * The old Passport is not rubbish. It is the only thing that can answer "did
 * this change sever that evidence" — so it goes into `history/`, named by its
 * digest, and `decirance assess` reads it from there. Replacing the Passport
 * without keeping its predecessor turns every earlier result into evidence
 * nobody can place, which fails closed and costs a full reassessment.
 *
 * This command does not decide anything. It records that the agent changed, and
 * prints what the change severed. A permit granted against the old Passport no
 * longer describes what is running, which is why the assessment that follows
 * starts from the evidence rather than from the permit.
 *
 * Run: npx decirance apply <new-passport.json> [dir]
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parsePassport, passportDigest } from '../src/index.ts';

export function runApply(args: string[]): number {
  const positional = args.filter((a) => !a.startsWith('--'));
  const incoming = positional[0];
  if (!incoming) {
    console.error('Usage: decirance apply <new-passport.json> [case-dir]');
    return 1;
  }
  const dir = resolve(positional[1] ?? 'decirance-case');
  const current = join(dir, 'agent-passport.json');

  if (!existsSync(current)) {
    console.error(`${dir} is not a Deployment Case: agent-passport.json is missing.`);
    return 1;
  }
  if (!existsSync(resolve(incoming))) {
    console.error(`No such file: ${resolve(incoming)}`);
    return 1;
  }

  // Both must parse before anything is written. A half-applied change — new
  // Passport in place, old one not kept — is the state this command exists to
  // avoid, so it is never passed through.
  const before = parsePassport(JSON.parse(readFileSync(current, 'utf8')));
  const after = parsePassport(JSON.parse(readFileSync(resolve(incoming), 'utf8')));
  for (const [label, parsed] of [['current', before], ['incoming', after]] as const) {
    if (!parsed.ok) {
      console.error(`The ${label} Agent Passport did not parse:`);
      for (const e of parsed.errors) console.error(`  ${e.path}: ${e.message}`);
      return 1;
    }
  }

  const beforeDigest = passportDigest(before.ok ? before.document : ({} as never));
  const afterDigest = passportDigest(after.ok ? after.document : ({} as never));
  if (beforeDigest === afterDigest) {
    console.log('');
    console.log('That is the same configuration — identical digest. Nothing to apply.');
    console.log('');
    return 0;
  }

  const historyDir = join(dir, 'history');
  mkdirSync(historyDir, { recursive: true });
  const kept = join(historyDir, `${beforeDigest.replace(/[^a-z0-9]/gi, '-')}.json`);
  copyFileSync(current, kept);
  writeFileSync(current, readFileSync(resolve(incoming), 'utf8'));

  console.log('');
  console.log('AGENT PASSPORT REPLACED');
  console.log('='.repeat(72));
  console.log(`  was   ${beforeDigest}`);
  console.log(`  now   ${afterDigest}`);
  console.log(`  kept  history/${kept.split(/[\\/]/).pop()}`);
  console.log('');
  console.log('  Any permit issued against the previous Passport no longer describes what');
  console.log('  is running. Re-assess, and take the decision again:');
  console.log('');
  console.log(`    decirance assess ${positional[1] ?? 'decirance-case'}`);
  console.log('');
  return 0;
}
