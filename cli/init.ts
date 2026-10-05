// SPDX-License-Identifier: Apache-2.0
/**
 * Put a complete, working Deployment Case on disk.
 *
 * The repository already ships one — `examples/meridian-reply-agent` — but
 * reading an example and running one are different experiences, and the second
 * is the one that decides whether somebody adopts this. `decirance init`
 * copies the case into a directory you own, adds the changed Passports the
 * change scenarios need, and writes the seven commands that walk the method
 * end to end.
 *
 * ## The case is fictional, and says so everywhere
 *
 * Meridian Council does not exist, and neither does its reply agent. The
 * generated README says so in its first line, and every file carries
 * `"fictional": true` where the schema allows a free field. Somebody who
 * inherits this directory a month later must not be able to mistake it for an
 * assessment of a real system — that mistake is the one failure mode of
 * shipping a realistic example.
 *
 * Run: npx decirance init [dir]
 */

import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EXAMPLE_AGENT,
  EXAMPLE_PASSPORT_V4_CYBER,
  EXAMPLE_PASSPORT_V4_LICENCE,
  EXAMPLE_PASSPORT_V4_POISONING,
  EXAMPLE_PASSPORT_V4_RESILIENCE,
  EXAMPLE_PASSPORT_V5_CONTAINMENT,
  serialisePassport,
  passportDigest,
  type PassportSnapshot,
} from '../src/index.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'examples', 'meridian-reply-agent');

/** The changes the quick start walks through, newest Passport per scenario. */
const CHANGES: Array<{ file: string; version: string; snapshot: PassportSnapshot; headline: string }> = [
  { file: 'tool-write-permission.json', version: '4.0.0', snapshot: EXAMPLE_PASSPORT_V4_CYBER, headline: 'the agent is granted a write permission its contract prohibits' },
  { file: 'retrieval-provider-change.json', version: '4.1.0', snapshot: EXAMPLE_PASSPORT_V4_RESILIENCE, headline: 'the retrieval provider and recovery objective change' },
  { file: 'model-licence-change.json', version: '4.2.0', snapshot: EXAMPLE_PASSPORT_V4_LICENCE, headline: 'the model licence, retention terms and data residency change' },
  { file: 'untrusted-corpus.json', version: '4.3.0', snapshot: EXAMPLE_PASSPORT_V4_POISONING, headline: 'an MCP server starts serving an unvetted corpus' },
  { file: 'containment-added.json', version: '5.0.0', snapshot: EXAMPLE_PASSPORT_V5_CONTAINMENT, headline: 'egress containment is added, which should restore nothing by itself' },
];

function write(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function runInit(args: string[]): number {
  const positional = args.filter((a) => !a.startsWith('--'));
  const target = resolve(positional[0] ?? 'decirance-case');
  const force = args.includes('--force');

  if (existsSync(target) && readdirSync(target).length > 0 && !force) {
    console.error(`${target} already exists and is not empty.`);
    console.error('Pass --force to overwrite it, or name another directory.');
    return 1;
  }

  mkdirSync(target, { recursive: true });
  for (const file of ['agent-passport.json', 'context-contract.json', 'assurance-graph.json', 'evidence-manifest.json']) {
    cpSync(join(source, file), join(target, file));
  }

  const changeDir = join(target, 'changes');
  mkdirSync(changeDir, { recursive: true });
  for (const change of CHANGES) {
    const doc = serialisePassport(change.snapshot, {
      agentId: 'agt_meridian_reply',
      agentVersion: change.version,
      owner: EXAMPLE_AGENT.owner,
      purpose: 'Triage inbound casework and draft responses for human review.',
      // Fixed, not the clock: created_at is inside the digest, so defaulting
      // would make two runs of `init` produce different hashes for identical
      // configurations.
      createdAt: '2026-09-03T00:00:00.000Z',
    });
    write(join(changeDir, change.file), { ...doc, digest: passportDigest(doc) });
  }

  writeFileSync(join(target, 'README.md'), readme(target));
  // Marks the case as the worked example, so `decirance pack` can label the
  // document rather than leaving a realistic-looking pack to be mistaken for
  // an assessment of a real system.
  writeFileSync(join(target, '.decirance-fixture'), [
    'Created by `decirance init`. Meridian Council does not exist.',
    'Delete this file only once the case holds a real agent, its real context and',
    'its real evidence — `decirance pack` reads it to label the pack as a worked',
    'example, and that label is the only thing stopping a realistic document from',
    'being mistaken for an assessment of a real system.',
    '',
  ].join('\n'));

  console.log('');
  console.log(`A complete Deployment Case is now in ${target}`);
  console.log('');
  console.log('  agent-passport.json      what the agent is, exactly');
  console.log('  context-contract.json    where it may operate, and on what');
  console.log('  assurance-graph.json     19 claims, 25 evidence edges, and what severs each');
  console.log('  evidence-manifest.json   21 pieces of evidence, each scoped to a Passport');
  console.log(`  changes/                 ${CHANGES.length} changed Passports, for the change step`);
  console.log('');
  console.log('This case is fictional — Meridian Council does not exist. Next:');
  console.log('');
  console.log(`  npx decirance assess ${positional[0] ?? 'decirance-case'}`);
  console.log('');
  return 0;
}

function readme(target: string): string {
  const dir = target.split(/[\\/]/).pop() ?? 'decirance-case';
  return `# Deployment Case — Meridian reply agent (fictional)

**This case is fictional.** Meridian Council does not exist, and neither does its
reply agent. Nothing here is an assessment of a real system. It exists so you can
run the method end to end before pointing it at your own agent.

Everything below runs locally. No account, no server, no telemetry.

## The method, in seven commands

\`\`\`bash
# 1. What is the agent, and what does the evidence support?
npx decirance assess ${dir}

# 2. Take the decision. It refuses unless a named person accepts it,
#    and refuses outright if the case does not support operating.
npx decirance permit ${dir} --approver "Your Name" --role accountable-owner

# 3. Something changes: the agent is granted a write permission.
npx decirance diff ${dir}/agent-passport.json ${dir}/changes/tool-write-permission.json \\
  --graph ${dir}/assurance-graph.json

# 4. Re-assess against the changed Passport.
cp ${dir}/changes/tool-write-permission.json ${dir}/agent-passport.json
npx decirance assess ${dir}

# 5. Ask for the permit again. The same evidence no longer supports it.
npx decirance permit ${dir} --approver "Your Name" --role accountable-owner

# 6. Adding a control does not restore a permit by itself.
npx decirance diff ${dir}/agent-passport.json ${dir}/changes/containment-added.json \\
  --graph ${dir}/assurance-graph.json

# 7. The engine's own property checks, including that invariant.
npx decirance verify
\`\`\`

## The other changes

${CHANGES.map((c) => `- \`changes/${c.file}\` — ${c.headline}`).join('\n')}

## Pointing it at your own agent

\`\`\`bash
npx decirance scan /path/to/your/agent-project   # drafts a Passport
\`\`\`

The scanner reads only files a repository normally contains, and never reads a
\`.env\`: variable *names* are informative, values are not.

Replacing the Passport is the easy half. The assurance graph — which claims
matter for your deployment, what evidence speaks to each, and what change
severs that link — is the work, and it is the work a Deployment Case engagement
does with you.
`;
}
