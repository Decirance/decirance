// SPDX-License-Identifier: Apache-2.0
/**
 * Validate the published examples against the published schemas.
 *
 * Shipping schemas that the reference case does not satisfy would be a worse
 * failure than shipping no schemas: it invites someone to build against a
 * contract nobody checks. CI runs this on every change.
 *
 * The validator covers the JSON Schema subset these schemas actually use —
 * type, required, properties, additionalProperties, enum, const, minLength,
 * minimum, maximum, items. It is not a general-purpose implementation and does
 * not pretend to be: `format` is parsed and deliberately not enforced, because
 * a partial format check that silently passes bad values is worse than an
 * absent one. If the schemas grow beyond this subset, this must grow with them
 * or be replaced by a real validator.
 *
 * Run: npx tsx ./cli/validate.ts
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

interface Schema {
  type?: string;
  required?: string[];
  properties?: Record<string, Schema>;
  additionalProperties?: boolean;
  enum?: unknown[];
  const?: unknown;
  minLength?: number;
  minimum?: number;
  maximum?: number;
  items?: Schema;
  description?: string;
  [key: string]: unknown;
}

const TYPE_OF = (v: unknown): string => {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (Number.isInteger(v)) return 'integer';
  return typeof v;
};

function validate(value: unknown, schema: Schema, path: string, errors: string[]): void {
  if (schema.type) {
    const actual = TYPE_OF(value);
    const ok = schema.type === 'integer'
      ? actual === 'integer'
      : schema.type === 'number'
        ? actual === 'number' || actual === 'integer'
        : actual === schema.type;
    if (!ok) {
      errors.push(`${path}: expected ${schema.type}, got ${actual}`);
      return;
    }
  }

  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${path}: expected the constant ${JSON.stringify(schema.const)}, got ${JSON.stringify(value)}`);
  }
  if (schema.enum && !schema.enum.includes(value as never)) {
    errors.push(`${path}: ${JSON.stringify(value)} is not one of ${schema.enum.map((e) => JSON.stringify(e)).join(', ')}`);
  }
  if (typeof value === 'string' && schema.minLength !== undefined && value.length < schema.minLength) {
    errors.push(`${path}: shorter than minLength ${schema.minLength}`);
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: below minimum ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path}: above maximum ${schema.maximum}`);
  }

  if (Array.isArray(value) && schema.items) {
    value.forEach((item, i) => validate(item, schema.items!, `${path}[${i}]`, errors));
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const object = value as Record<string, unknown>;
    for (const key of schema.required ?? []) {
      if (!(key in object)) errors.push(`${path}: missing required property "${key}"`);
    }
    if (schema.additionalProperties === false && schema.properties) {
      for (const key of Object.keys(object)) {
        if (!(key in schema.properties)) errors.push(`${path}: unexpected property "${key}"`);
      }
    }
    for (const [key, sub] of Object.entries(schema.properties ?? {})) {
      if (key in object) validate(object[key], sub, `${path}.${key}`, errors);
    }
  }
}

const CASES: Array<{ schema: string; file: string }> = [
  { schema: 'agent-passport.schema.json', file: 'examples/meridian-reply-agent/agent-passport.json' },
  { schema: 'context-contract.schema.json', file: 'examples/meridian-reply-agent/context-contract.json' },
  { schema: 'evidence-manifest.schema.json', file: 'examples/meridian-reply-agent/evidence-manifest.json' },
  { schema: 'deployment-permit.schema.json', file: 'examples/meridian-reply-agent/deployment-permit.json' },
];

let failures = 0;

console.log('\nSCHEMA VALIDATION');
console.log('='.repeat(72));

for (const { schema: schemaName, file } of CASES) {
  const schemaPath = join(root, 'schemas', schemaName);
  const filePath = join(root, file);
  if (!existsSync(filePath)) {
    console.log(`  SKIP  ${file} (not generated; run npm run build:examples)`);
    continue;
  }
  const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as Schema;
  const document = JSON.parse(readFileSync(filePath, 'utf8'));
  const errors: string[] = [];
  validate(document, schema, '$', errors);
  if (errors.length === 0) {
    console.log(`  PASS  ${file}`);
  } else {
    failures++;
    console.log(`  FAIL  ${file}  (${schemaName})`);
    for (const e of errors.slice(0, 12)) console.log(`        ${e}`);
    if (errors.length > 12) console.log(`        ...and ${errors.length - 12} more`);
  }
}

// A validator that only ever passes is not evidence of anything, so prove it
// rejects. If this stops failing, the validator has stopped working.
console.log('\nNegative control');
const passportSchema = JSON.parse(readFileSync(join(root, 'schemas', 'agent-passport.schema.json'), 'utf8')) as Schema;
const bad: string[] = [];
validate({ schema_version: '0.1.0' }, passportSchema, '$', bad);
if (bad.length > 0) {
  console.log(`  PASS  an incomplete passport is rejected (${bad.length} error(s))`);
} else {
  failures++;
  console.log('  FAIL  an incomplete passport was accepted; the validator is not validating');
}

// Every schema must itself be parseable and identify itself.
console.log('\nSchemas');
for (const name of readdirSync(join(root, 'schemas'))) {
  try {
    const s = JSON.parse(readFileSync(join(root, 'schemas', name), 'utf8'));
    if (!s.$id || !s.title) throw new Error('missing $id or title');
    console.log(`  PASS  ${name}`);
  } catch (e) {
    failures++;
    console.log(`  FAIL  ${name}: ${(e as Error).message}`);
  }
}

/**
 * Framework mappings cite identifiers that exist.
 *
 * A mapping is a document about someone else's document, and the way it rots is
 * specific: it names a claim that was renamed, or a change kind that was never
 * in the taxonomy at all. The first draft of the OWASP agentic mapping cited
 * five change kinds that did not exist — `guardrail_removed`, `tool_description`,
 * `model_artifact`, `log_plane`, `inter_agent_channels` — each a plausible
 * near-miss of a real one. Nobody reading the prose would have noticed, and the
 * table would have been quietly wrong in a file written to be quoted by buyers.
 */
console.log('\nFramework mappings');
{
  const { MATERIAL_CHANGE_KINDS } = await import('../src/index.ts');
  const graph = JSON.parse(readFileSync(join(root, 'examples', 'meridian-reply-agent', 'assurance-graph.json'), 'utf8')) as { claims: Array<{ ref: string }> };
  const hazards = JSON.parse(readFileSync(join(root, 'threat-library', 'hazards.json'), 'utf8')) as { hazards: Array<{ ref: string }> };
  const claimRefs = new Set(graph.claims.map((c) => c.ref));
  const hazardRefs = new Set(hazards.hazards.map((h) => h.ref));
  /**
   * A backticked lower_snake_case identifier in a mapping is either a change
   * kind or a field of a published document — those are the only two
   * vocabularies these files are entitled to cite. Collecting the schema
   * property names means a mistyped *field* is caught too, not only a mistyped
   * change kind.
   */
  const vocabulary = new Set<string>(MATERIAL_CHANGE_KINDS as readonly string[]);
  const collectProperties = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    const n = node as Record<string, unknown>;
    if (n.properties && typeof n.properties === 'object') {
      for (const [key, child] of Object.entries(n.properties as Record<string, unknown>)) {
        vocabulary.add(key);
        collectProperties(child);
      }
    }
    if (n.items) collectProperties(n.items);
  };
  for (const name of readdirSync(join(root, 'schemas'))) {
    collectProperties(JSON.parse(readFileSync(join(root, 'schemas', name), 'utf8')));
  }

  const mappingsDir = join(root, 'framework-mappings');
  for (const name of readdirSync(mappingsDir).filter((f) => f.endsWith('.md') && f !== 'README.md')) {
    const text = readFileSync(join(mappingsDir, name), 'utf8');
    const problems: string[] = [];

    // Written in backticks, lower_snake_case: a change kind or a document field.
    for (const cited of new Set((text.match(/`[a-z][a-z_]{3,}`/g) ?? []).map((t) => t.slice(1, -1)))) {
      if (!vocabulary.has(cited)) problems.push(`"${cited}" is neither a change kind nor a field in any published schema`);
    }
    for (const cited of new Set(text.match(/\bC-\d{2}\b/g) ?? [])) {
      if (!claimRefs.has(cited)) problems.push(`claim "${cited}" is not in the reference case`);
    }
    for (const cited of new Set(text.match(/\bH-\d{2}\b/g) ?? [])) {
      if (!hazardRefs.has(cited)) problems.push(`hazard "${cited}" is not in the threat library`);
    }

    if (problems.length === 0) {
      console.log(`  PASS  ${name}`);
    } else {
      failures++;
      console.log(`  FAIL  ${name}`);
      for (const p of problems) console.log(`        ${p}`);
    }
  }
}

console.log(`\n${failures === 0 ? 'All schema checks passed.' : `${failures} SCHEMA CHECK(S) FAILED.`}\n`);
process.exitCode = failures === 0 ? 0 : 1;
