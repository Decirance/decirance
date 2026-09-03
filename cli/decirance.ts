#!/usr/bin/env -S npx tsx
// SPDX-License-Identifier: Apache-2.0
/**
 * decirance — command line entry point.
 *
 * Usage:
 *   decirance scan [dir] [--out <dir>]
 *   decirance diff <before.json> <after.json> [--graph <graph.json>] [--json]
 *   decirance validate [file...]
 *   decirance verify
 *
 * The scan reads only files a repository normally contains. It never reads a
 * `.env`: environment variable *names* are informative for provider detection,
 * values are not, and a scanner that slurps secrets is one nobody runs twice.
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanForReadiness, serialisePassport, type ScanInput } from '../src/index.ts';

const MCP_CANDIDATES = [
  'mcp.json', '.mcp.json', '.cursor/mcp.json', '.vscode/mcp.json',
  'claude_desktop_config.json', '.claude/mcp.json',
];
const ENV_CANDIDATES = ['.env.example', '.env.sample', '.env.template'];

function readIfPresent(root: string, relative: string): string | undefined {
  const path = join(root, relative);
  try {
    return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
  } catch {
    return undefined;
  }
}

function firstPresent(root: string, candidates: string[]) {
  for (const candidate of candidates) {
    const text = readIfPresent(root, candidate);
    if (text !== undefined) return { path: candidate, text };
  }
  return undefined;
}

function usage(): void {
  console.log(`
decirance — open assurance for AI agents

  scan [dir] [--out <dir>]
      Inventory an agent project and draft an Agent Passport.
      Reads only files a repository normally contains; never reads a .env.

  diff <before.json> <after.json> [--graph <graph.json>] [--json]
      Given two Agent Passports, report what materially changed, which claims
      and evidence that invalidates, what must be re-run, and the resulting
      recommendation ceiling. Uses the bundled reference case unless --graph
      names your own assurance graph.

  validate [file...]
      Check JSON documents against the published schemas. With no arguments,
      validates every bundled example — which is what CI runs.

  verify
      Run the property checks over the engine: the permit invariant across all
      permit states, digest vectors, invalidation determinism and the argument
      layer. Exits non-zero on any failure.

Docs:   https://github.com/Decirance/decirance
Licence: Apache-2.0 (code), CC BY 4.0 (documentation)
`);
}

function scan(args: string[]): void {
  const outIndex = args.indexOf('--out');
  const outDir = outIndex >= 0 ? args[outIndex + 1] : '.decirance';
  // `indexOf` returns -1 when the flag is absent, which would make this
  // `i !== 0` and silently discard the first positional argument — so
  // `decirance scan ./project` would scan the working directory instead.
  const positional = args.filter(
    (a, i) => !a.startsWith('--') && !(outIndex >= 0 && i === outIndex + 1),
  );
  const root = resolve(positional[0] ?? '.');

  if (!existsSync(root)) {
    console.error(`No such directory: ${root}`);
    process.exitCode = 1;
    return;
  }

  const mcp = firstPresent(root, MCP_CANDIDATES);
  const env = firstPresent(root, ENV_CANDIDATES);
  const pkg = readIfPresent(root, 'package.json');

  const input: ScanInput = {
    mcpConfig: mcp?.text,
    packageManifest: pkg,
    envReference: env?.text,
  };
  const report = scanForReadiness(input);

  console.log(`\nDECIRANCE SCAN  ·  ${root}`);
  console.log('='.repeat(72));
  console.log('\nRead');
  console.log(`  package.json        ${pkg ? 'yes' : 'not found'}`);
  console.log(`  mcp configuration   ${mcp ? mcp.path : 'not found'}`);
  console.log(`  env reference       ${env ? env.path : 'not found'}  (names only)`);

  if (report.detectedFrameworks.length > 0) console.log(`\nFrameworks\n  ${report.detectedFrameworks.join(', ')}`);
  if (report.detectedProviders.length > 0) console.log(`\nProviders reachable\n  ${report.detectedProviders.join(', ')}`);

  if (report.mcpServers.length > 0) {
    console.log('\nMCP servers');
    for (const s of report.mcpServers) {
      const approval = s.approved === true ? 'approved' : s.approved === false ? 'NOT APPROVED' : 'approval unrecorded';
      console.log(`  ${s.name}  [${s.deployment}/${s.transport}]  ${approval}`);
      console.log(`    fingerprint ${s.fingerprint}`);
      for (const t of s.tools) console.log(`    tool ${t.name}${t.description ? '' : '  (no description available)'}`);
    }
  }
  for (const w of report.mcpWarnings) console.log(`  ! ${w}`);

  console.log('\nField status');
  for (const f of report.fields) {
    console.log(`  ${f.status.toUpperCase().padEnd(13)} ${f.field}${f.value ? `  ${f.value}` : ''}`);
    if (f.note) console.log(`                ${f.note}`);
  }

  console.log('\nGaps');
  if (report.gaps.length === 0) console.log('  (none)');
  for (const g of report.gaps) {
    console.log(`  [${g.severity}] ${g.ref}  ${g.title}`);
    console.log(`      why    ${g.why}`);
    console.log(`      action ${g.action}`);
  }

  console.log('\nRecommended tests');
  for (const t of report.recommendedTests) console.log(`  ${t}`);

  console.log(`\nReadiness\n  ${report.verdict.toUpperCase().replace(/_/g, ' ')}`);
  console.log(`  ${report.verdictReason}`);

  const target = resolve(root, outDir);
  mkdirSync(target, { recursive: true });
  writeFileSync(
    join(target, 'agent-passport.json'),
    JSON.stringify(serialisePassport(report.draftPassport, {
      agentId: 'agt_unnamed', agentVersion: '0.1.0', owner: 'unassigned',
      purpose: 'Draft produced by decirance scan; complete before assessment.',
    }), null, 2),
  );
  writeFileSync(join(target, 'decirance-findings.json'), JSON.stringify({
    scannedAt: new Date().toISOString(), root, ...report,
  }, null, 2));

  console.log(`\nWritten\n  ${join(outDir, 'agent-passport.json')}\n  ${join(outDir, 'decirance-findings.json')}`);
  console.log('\nA scan reports what it could read, not what is true.');
  console.log('The passport is a draft, not an assurance decision.\n');
}

/**
 * `validate` and `verify` are the repository's own checks, exposed as verbs.
 *
 * They were previously reachable only as script paths, which meant the two
 * commands most likely to be tried by someone deciding whether to trust this
 * project did nothing. Both are spawned rather than imported so that a
 * non-zero exit propagates unchanged: a check that fails must fail the shell,
 * not print a warning and return success.
 */
async function runScript(name: string, args: string[] = []): Promise<number> {
  const { spawnSync } = await import('node:child_process');
  const here = dirname(fileURLToPath(import.meta.url));
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', join(here, name), ...args],
    { stdio: 'inherit' },
  );
  if (result.error) {
    console.error(`Could not run ${name}: ${result.error.message}`);
    return 1;
  }
  return result.status ?? 1;
}

const [command, ...rest] = process.argv.slice(2).filter((a) => a !== '--');

switch (command) {
  case 'scan':
    scan(rest);
    break;
  case 'diff': {
    const { runDiff } = await import('./diff.ts');
    try {
      process.exitCode = runDiff(rest);
    } catch (e) {
      console.error((e as Error).message);
      process.exitCode = 1;
    }
    break;
  }
  case 'validate':
    process.exitCode = await runScript('validate.ts', rest);
    break;
  case 'verify':
    process.exitCode = await runScript('verify.ts', rest);
    break;
  case undefined:
  case 'help':
  case '--help': usage(); break;
  default:
    console.error(`Unknown command: ${command}`);
    usage();
    process.exitCode = 1;
}
