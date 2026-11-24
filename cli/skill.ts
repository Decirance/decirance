// SPDX-License-Identifier: Apache-2.0
/**
 * `decirance skill` — read a skill definition as an Agent Passport.
 *
 * A `SKILL.md` declares a model, a tool list, the permissions those tools
 * carry and the instructions the agent follows. That is most of a Passport, so
 * the delta engine can answer the question a text diff cannot: a line gained
 * `Bash(git push:*)`, and *what does that break*.
 *
 * This is a separate step rather than something `diff` does quietly, because
 * the translation needs facts the file does not contain — who is accountable,
 * and where the skill runs. A command that filled those in for you would be
 * producing a passport describing a deployment nobody described, and every
 * conclusion downstream would inherit the invention. So it asks, refuses
 * without an answer, and prints what it inferred and what it could not.
 *
 *   decirance skill ./release-check/SKILL.md \
 *     --owner "Ari Rios, Director of Customer Operations" \
 *     --environment "developer workstation" \
 *     --version 1.0.0 \
 *     --out before.json
 *
 * Then the existing command does the work:
 *
 *   decirance diff before.json after.json --graph your-assurance-graph.json
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  parseSkill,
  skillToPassport,
  passportDigest,
  serialisePassport,
  parsePassport,
  KNOWN_SKILL_KEYS,
} from '../src/index.ts';

function flag(args: string[], name: string): string | undefined {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : undefined;
}

function rule(char = '='): string {
  return char.repeat(72);
}

export function runSkill(args: string[]): number {
  const positional = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));

  if (positional.length < 1) {
    console.error('Usage: decirance skill <SKILL.md> --owner <who> --environment <where> --version <v> [--out passport.json] [--json]');
    console.error('\nThe owner and environment are not in the file and are not guessed.');
    return 1;
  }

  const path = resolve(positional[0]);
  const parsed = parseSkill(readFileSync(path, 'utf8'));

  if (!parsed.ok) {
    console.error(`\n${path} is not a usable skill definition:`);
    for (const e of parsed.errors) console.error(`  line ${e.line}: ${e.message}`);
    console.error('\nOnly flat `key: value` frontmatter is read. A nested or multi-line value is');
    console.error('refused rather than guessed, because a mis-read tool list would produce a');
    console.error('confident delta computed from permissions nobody wrote.');
    return 1;
  }

  const translated = skillToPassport(parsed.skill, {
    owner: flag(args, 'owner') ?? '',
    environment: flag(args, 'environment') ?? '',
    agentVersion: flag(args, 'version') ?? '',
    agentId: flag(args, 'agent-id'),
    createdAt: flag(args, 'created-at'),
  });

  if (!translated.ok) {
    console.error(`\n${path} parsed, and cannot become a Passport yet.`);
    console.error('\nA skill file is a reusable artefact: the same file is deployed by different');
    console.error('people into different places, so these facts are not in it and cannot be');
    console.error('derived from it. An assessment needs them:\n');
    for (const m of translated.missing) console.error(`  missing  ${m}`);
    console.error('\n  --owner "Name, Role"   --environment "where it runs"   --version 1.0.0\n');
    return 1;
  }

  // Round-tripped through the Passport reader, so a document this command
  // emits is one the rest of the toolchain accepts. A translator whose output
  // its own `diff` rejects would be worse than no translator.
  const check = parsePassport(translated.document);
  if (!check.ok) {
    console.error('\nThe translation produced a document the Passport reader rejects:');
    for (const e of check.errors) console.error(`  ${e.path}: ${e.message}`);
    console.error('\nThis is a defect in the translation, not in your file. Please report it.');
    return 1;
  }

  const digest = passportDigest(translated.document);

  if (args.includes('--json')) {
    console.log(JSON.stringify({ passport: translated.document, digest, warnings: [...parsed.warnings, ...translated.warnings] }, null, 2));
  } else {
    const snapshot = check.snapshot;
    console.log(`\nSKILL AS A PASSPORT`);
    console.log(rule());
    console.log(`  skill          ${parsed.skill.frontmatter.name}`);
    console.log(`  source         ${path}`);
    console.log(`  digest         ${digest}`);
    console.log(`\n  model          ${snapshot.modelName} (${snapshot.modelProvider})`);
    console.log(`  tools          ${snapshot.tools.length > 0 ? snapshot.tools.join(', ') : 'none declared'}`);
    console.log(`  permissions    ${snapshot.permissions.length > 0 ? snapshot.permissions.join(', ') : 'none declared'}`);
    console.log(`  mcp servers    ${snapshot.mcpServers.length > 0 ? snapshot.mcpServers.join(', ') : 'none'}`);
    console.log(`  egress         ${snapshot.networkEgress || 'not declared — the file names no network tool'}`);
    console.log(`  oversight      ${snapshot.autonomyLevel}`);
    console.log(`  instructions   digested; an edit to them is a system_prompt change`);

    if (parsed.skill.unknownKeys.length > 0) {
      console.log(`\n  UNCLASSIFIED   ${parsed.skill.unknownKeys.join(', ')}`);
      console.log('                 Carried into the document, so a change to one forces full');
      console.log('                 reassessment rather than passing unnoticed.');
    }

    const warnings = [...parsed.warnings, ...translated.warnings];
    if (warnings.length > 0) {
      console.log(`\n  What this file does not tell you (${warnings.length}):`);
      for (const w of warnings) console.log(`    - ${w}`);
    }

    console.log('\n  A skill file carries configuration and not accountability. The owner,');
    console.log('  environment and version above came from the command line, not the file.');
    console.log(`\n  Next:  decirance diff <before.json> ${positional[0].endsWith('.json') ? positional[0] : '<after.json>'} --graph <your-graph.json>`);
    console.log(`  Frontmatter understood: ${KNOWN_SKILL_KEYS.join(', ')}\n`);
  }

  const out = flag(args, 'out');
  if (out) {
    // Serialised through the same writer the rest of the toolchain uses, so
    // the digest printed above is the digest of the file on disk.
    const document = serialisePassport(check.snapshot, {
      agentId: translated.document.agent_id,
      agentVersion: translated.document.agent_version,
      owner: translated.document.owner,
      purpose: translated.document.purpose,
      createdAt: translated.document.created_at,
    });
    writeFileSync(resolve(out), `${JSON.stringify({ ...document, digest: passportDigest(document) }, null, 2)}\n`);
    console.log(`  Written: ${resolve(out)}\n`);
  }

  return 0;
}
