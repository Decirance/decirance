// SPDX-License-Identifier: Apache-2.0
/**
 * Add explicit `.js` extensions to relative specifiers in the emitted package.
 *
 * The source is written with extensionless relative imports (`from './digest'`)
 * because that is what the bundler that builds the web application expects.
 * Node's ESM resolver does not do extension guessing, so the same text emitted
 * unchanged produces a package that type-checks perfectly and throws
 * ERR_MODULE_NOT_FOUND the moment anybody imports it — which is exactly the
 * failure this project had before: `npm i decirance` delivered files that
 * could not be loaded.
 *
 * Rewriting at publish time rather than changing the source keeps one copy of
 * the engine shared with the application. `.d.ts` files are rewritten too, so
 * consumers on `moduleResolution: node16` resolve types the same way they
 * resolve code.
 *
 * Run: npx tsx ./cli/fix-extensions.ts dist
 */

import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** `from './x'`, `import('./x')` and `export … from '../y'`. */
const SPECIFIER = /(\bfrom\s*|\bimport\s*\(\s*)(['"])(\.\.?\/[^'"]*)(['"])/g;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(js|d\.ts)$/.test(entry)) out.push(full);
  }
  return out;
}

function rewrite(spec: string, fileDir: string): string {
  // Already explicit: leave it alone.
  if (/\.(js|json|mjs|cjs)$/.test(spec)) return spec;
  // A directory import needs /index.js, a module import needs .js.
  const asDir = resolve(fileDir, spec);
  if (existsSync(asDir) && statSync(asDir).isDirectory()) return `${spec}/index.js`;
  return `${spec}.js`;
}

const target = resolve(process.argv[2] ?? 'dist');
if (!existsSync(target)) {
  console.error(`No such directory: ${target}. Run the compiler first.`);
  process.exit(1);
}

let changed = 0;
for (const file of walk(target)) {
  const before = readFileSync(file, 'utf8');
  const dir = resolve(file, '..');
  const after = before.replace(
    SPECIFIER,
    (_m, lead: string, q1: string, spec: string, q2: string) =>
      `${lead}${q1}${rewrite(spec, dir)}${q2}`,
  );
  if (after !== before) {
    writeFileSync(file, after);
    changed++;
  }
}
console.log(`Rewrote relative specifiers in ${changed} emitted file(s).`);
