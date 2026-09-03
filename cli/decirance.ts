#!/usr/bin/env -S npx tsx
/**
 * decirance — command line entry point.
 *
 * Usage:
 *   decirance scan [dir] [--out <dir>]
 *
 * The scan reads only files a repository normally contains. It never reads a
 * `.env`: environment variable *names* are informative for provider detection,
 * values are not, and a scanner that slurps secrets is one nobody runs twice.
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
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

  decirance scan [dir] [--out <dir>]   Inventory an agent project and draft a Passport

Docs: https://github.com/Decirance/decirance
`);
}

function scan(args: string[]): void {
  const outIndex = args.indexOf('--out');
  const outDir = outIndex >= 0 ? args[outIndex + 1] : '.decirance';
  const positional = args.filter((a, i) => !a.startsWith('--') && i !== outIndex + 1);
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

const [command, ...rest] = process.argv.slice(2).filter((a) => a !== '--');
switch (command) {
  case 'scan': scan(rest); break;
  case undefined:
  case 'help':
  case '--help': usage(); break;
  default:
    console.error(`Unknown command: ${command}`);
    usage();
    process.exitCode = 1;
}
