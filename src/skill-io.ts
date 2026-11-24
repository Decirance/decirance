// SPDX-License-Identifier: Apache-2.0
/**
 * A skill definition, read as an Agent Passport.
 *
 * A `SKILL.md` declares the same class of facts a Passport does — a model, a
 * set of tools, the permissions those tools carry, the instructions the agent
 * follows — so the question is whether the delta engine can say what a change
 * to one *costs*, rather than merely that the file changed. A text diff shows
 * a line gained `Bash(git push:*)`. It cannot say which claims that breaks or
 * which tests have to be re-run, and that is the only part a reviewer needs.
 *
 * Two findings are built into the shape of this module, and both matter more
 * than the translation itself.
 *
 * **A skill file is about half a Passport.** It carries the configuration and
 * none of the accountability or the context: no owner, no environment, no
 * version, no entitlement. Those are not oversights in the format — a skill is
 * a reusable artefact and the same file is deployed by different people into
 * different places. So the translation cannot be a pure function of the file,
 * and `skillToPassport` refuses rather than inventing an owner. An invented
 * owner is the one defect this project cannot ship: the method's claim is that
 * a named person is accountable, and a passport with a fabricated owner is a
 * decision nobody took.
 *
 * **The frontmatter is YAML, and a wrong read is worse than a refusal.** This
 * reads the flat `key: value` subset that skill frontmatter actually uses and
 * rejects anything else — nested maps, block scalars, `- ` sequences — instead
 * of guessing. A parser that silently mis-reads a permission list would hand a
 * reviewer a confident delta computed from the wrong tools, which is the exact
 * failure the engine's fail-closed rules exist to prevent. Unrecognised keys
 * are reported and reach the delta as unclassified fields, so an unknown
 * frontmatter key forces full reassessment on its own.
 */

import { digestOf } from './digest';
import type { PassportDocument } from './passport-io';

/** The frontmatter keys this translation understands. */
export const KNOWN_SKILL_KEYS = [
  'name', 'description', 'allowed-tools', 'model', 'disable-model-invocation',
  'license', 'version', 'metadata',
] as const;

export interface SkillDocument {
  /** Flat frontmatter, keys lower-cased exactly as written in the file. */
  frontmatter: Record<string, string>;
  /** Everything after the closing delimiter: the instructions themselves. */
  body: string;
  /** Frontmatter keys the translation does not know what to do with. */
  unknownKeys: string[];
}

export interface SkillParseError {
  line: number;
  message: string;
}

export type SkillParseResult =
  | { ok: true; skill: SkillDocument; warnings: string[] }
  | { ok: false; errors: SkillParseError[] };

/**
 * Facts a skill file cannot carry, and which a caller has to supply.
 *
 * Every field here is mandatory in a Passport and absent from every skill
 * file, by design rather than by omission.
 */
export interface SkillDeploymentContext {
  /** The accountable owner. Never defaulted. */
  owner: string;
  /** Where this skill is deployed: the Passport's `environment`. */
  environment: string;
  /** The version of *this deployment* of the skill. */
  agentVersion: string;
  /** Identifier for the deployed agent. Defaults to the skill's own name. */
  agentId?: string;
  createdAt?: string;
}

const DELIMITER = '---';

/**
 * Tool names that reach the network.
 *
 * Egress is a containment fact rather than a tool fact, and the containment
 * claims are assessed against it, so a skill that gains `WebFetch` has changed
 * its enclosure and not only its tool list.
 */
const NETWORK_TOOLS = new Set(['WebFetch', 'WebSearch', 'Fetch']);

/** Model id prefixes this translation recognises. An unknown one is reported. */
const MODEL_PROVIDERS: Array<[string, string]> = [
  ['claude-', 'anthropic'],
  ['gpt-', 'openai'],
  ['o1-', 'openai'],
  ['gemini-', 'google'],
];

/**
 * Read a skill file.
 *
 * Deliberately strict. Anything outside the flat subset is an error with its
 * line number, because the alternative is a delta computed from a tool list
 * nobody wrote.
 */
export function parseSkill(source: string): SkillParseResult {
  const errors: SkillParseError[] = [];
  const warnings: string[] = [];
  const lines = source.split(/\r?\n/);

  if (lines[0]?.trim() !== DELIMITER) {
    return {
      ok: false,
      errors: [{ line: 1, message: `expected a frontmatter block opening with ${DELIMITER}` }],
    };
  }

  const close = lines.findIndex((l, i) => i > 0 && l.trim() === DELIMITER);
  if (close === -1) {
    return { ok: false, errors: [{ line: 1, message: 'frontmatter block is never closed' }] };
  }

  const frontmatter: Record<string, string> = {};
  for (let i = 1; i < close; i += 1) {
    const raw = lines[i];
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;

    if (line.startsWith('- ')) {
      errors.push({ line: i + 1, message: 'YAML sequences are not supported; use a comma-separated value' });
      continue;
    }
    if (/^\s/.test(raw) || /:\s*[|>]/.test(line)) {
      errors.push({ line: i + 1, message: 'nested maps and block scalars are not supported' });
      continue;
    }
    const at = line.indexOf(':');
    if (at <= 0) {
      errors.push({ line: i + 1, message: 'expected `key: value`' });
      continue;
    }
    const key = line.slice(0, at).trim().toLowerCase();
    let value = line.slice(at + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key in frontmatter) {
      errors.push({ line: i + 1, message: `duplicate key \`${key}\`` });
      continue;
    }
    frontmatter[key] = value;
  }

  if (errors.length > 0) return { ok: false, errors };

  if (!frontmatter.name) {
    return { ok: false, errors: [{ line: 1, message: 'frontmatter has no `name`' }] };
  }

  const known = new Set<string>(KNOWN_SKILL_KEYS);
  const unknownKeys = Object.keys(frontmatter).filter((k) => !known.has(k));
  if (unknownKeys.length > 0) {
    warnings.push(
      `Unrecognised frontmatter: ${unknownKeys.join(', ')}. These reach the delta as `
      + 'unclassified fields, which forces full reassessment.',
    );
  }

  const body = lines.slice(close + 1).join('\n').trim();
  if (body === '') warnings.push('The skill has no instructions below the frontmatter.');

  return { ok: true, skill: { frontmatter, body, unknownKeys }, warnings };
}

export interface SkillTool {
  id: string;
  permissions: string[];
}

/**
 * Split an `allowed-tools` entry into a tool and the permission it carries.
 *
 * `Bash(git push:*)` is one tool with one permission, not a tool named
 * "Bash(git push:*)". Treating it as a name would make every permission change
 * read as a tool addition — the delta would be conservative, and wrong about
 * why, which teaches a reviewer nothing.
 */
export function parseToolEntry(entry: string): SkillTool {
  const trimmed = entry.trim();
  const open = trimmed.indexOf('(');
  if (open > 0 && trimmed.endsWith(')')) {
    return { id: trimmed.slice(0, open), permissions: [trimmed.slice(open + 1, -1)] };
  }
  return { id: trimmed, permissions: [] };
}

/** `mcp__server__tool` names the server it belongs to. */
/**
 * Collapse an `allowed-tools` list into one entry per distinct tool.
 *
 * `Bash(npm test:*), Bash(git push:*)` is one tool holding two permissions,
 * not two tools called Bash. Emitting it twice made the tool inventory grow
 * whenever a permission was added, so granting `git push` read as *adding
 * Bash* — a change the engine would flag, for the wrong reason, and a reviewer
 * would be told a tool appeared that had been there all along. Conservative
 * and wrong about why is the failure this module's own header warns against.
 */
export function collapseTools(entries: SkillTool[]): SkillTool[] {
  const byId = new Map<string, Set<string>>();
  for (const entry of entries) {
    const held = byId.get(entry.id) ?? new Set<string>();
    for (const permission of entry.permissions) held.add(permission);
    byId.set(entry.id, held);
  }
  return [...byId].map(([id, permissions]) => ({ id, permissions: [...permissions].sort() }));
}

export function mcpServerOf(toolId: string): string | null {
  const parts = toolId.split('__');
  return toolId.startsWith('mcp__') && parts.length >= 3 ? parts[1] : null;
}

export type SkillToPassportResult =
  | { ok: true; document: PassportDocument; warnings: string[] }
  | { ok: false; missing: string[] };

/**
 * Translate a parsed skill into a Passport document.
 *
 * Refuses when the deployment context is incomplete. `fail closed for missing
 * mandatory inputs` is a rule about assessments, and a passport assembled from
 * defaults would be an assessment of a deployment nobody described.
 */
export function skillToPassport(
  skill: SkillDocument,
  context: SkillDeploymentContext,
): SkillToPassportResult {
  const missing: string[] = [];
  if (!context.owner?.trim()) missing.push('owner — the named person accountable for this deployment');
  if (!context.environment?.trim()) missing.push('environment — where this skill is deployed');
  if (!context.agentVersion?.trim()) missing.push('agentVersion — the version of this deployment');
  if (missing.length > 0) return { ok: false, missing };

  const warnings: string[] = [];

  const entries = collapseTools(
    (skill.frontmatter['allowed-tools'] ?? '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
      .map(parseToolEntry),
  );

  if (!skill.frontmatter['allowed-tools']) {
    warnings.push(
      'No `allowed-tools`. On most runtimes that means the skill inherits every tool the '
      + 'session holds, which is the opposite of an empty tool list — recorded here as no '
      + 'declared tools, so state the inherited set explicitly if that is not what you mean.',
    );
  }

  const mcpServers = [...new Set(entries.map((t) => mcpServerOf(t.id)).filter((s): s is string => s !== null))];
  const networked = entries.filter((t) => NETWORK_TOOLS.has(t.id)).map((t) => t.id);

  const modelId = skill.frontmatter.model ?? '';
  let provider = 'unspecified';
  if (modelId) {
    const hit = MODEL_PROVIDERS.find(([prefix]) => modelId.startsWith(prefix));
    if (hit) {
      provider = hit[1];
    } else {
      warnings.push(`Model id "${modelId}" matches no known provider prefix; provider recorded as unspecified.`);
    }
  } else {
    warnings.push('No `model`. The skill runs on whatever the session selected, which is not a configuration anyone assessed.');
  }

  // A skill file names a model and never a version separately, so the id
  // stands for both. Said out loud because `model_version` is a suspension
  // trigger on most permits, and a reader needs to know the trigger is
  // watching an id rather than a pinned build.
  if (modelId) {
    warnings.push('A skill file does not separate model from version; the id is recorded as both.');
  }

  const document: PassportDocument = {
    schema_version: '0.1.0',
    agent_id: context.agentId?.trim() || `skill:${skill.frontmatter.name}`,
    agent_version: context.agentVersion,
    owner: context.owner,
    purpose: skill.frontmatter.description || `Skill: ${skill.frontmatter.name}`,
    environment: context.environment,
    ...(context.createdAt ? { created_at: context.createdAt } : {}),
    components: {
      model: { provider, model: modelId || 'unspecified', version: modelId || 'unspecified' },
      // The instructions are this agent's system prompt. Digesting them is
      // what turns an edited procedure into a `system_prompt` change rather
      // than an invisible one.
      prompt_digest: digestOf({ instructions: skill.body }),
      tools: entries.map((t) => ({ id: t.id, permissions: t.permissions })),
      // Plain names, which is what the Passport reader reads. Written as
      // `{ id, signed }` objects this was accepted by the document type and
      // silently dropped by the reader, so adding an MCP server to a skill
      // registered as `tool_added` and never as `mcp_server_added` — the
      // contamination surface changed and the kind that watches it stayed
      // quiet. Caught by the check that asserts the kind, not by the types.
      ...(mcpServers.length > 0 ? { mcp_servers: mcpServers } : {}),
    },
    ...(networked.length > 0
      ? {
        containment: {
          network_egress: 'unrestricted',
          // A skill file states that the agent may reach the network and never
          // where to. Unknown is read as unknown, never as safe.
          permitted_destinations: ['unspecified'],
        },
      }
      : {}),
    operating: {
      /*
       * `disable-model-invocation: true` means a person has to invoke the
       * skill. That is the only oversight signal the format carries, and it
       * maps onto two Passport fields rather than one: `autonomy_level`, which
       * drives the `autonomy_level` change kind, and `human_review`, which
       * drives `human_oversight`. Both are suspension triggers on most
       * permits, so writing only one would leave half the change invisible.
       */
      autonomy_level: skill.frontmatter['disable-model-invocation'] === 'true'
        ? 'invoked_only_by_a_person'
        : 'model_may_invoke_without_a_person',
      human_review: {
        invocation: skill.frontmatter['disable-model-invocation'] === 'true'
          ? 'a person invokes the skill'
          : 'the model may invoke the skill unprompted',
      },
      // The flat permission list, which a permit records as one set. Also
      // derivable from the tool inventory, and the Passport reader reads both.
      permissions: [...new Set(entries.flatMap((t) => t.permissions))].sort(),
    },
  } as PassportDocument;

  // Unknown frontmatter travels into the document so the delta sees it. A key
  // the translation dropped would be a difference the engine never knew about,
  // which is precisely the silent staleness this is meant to catch.
  for (const key of skill.unknownKeys) {
    (document as unknown as Record<string, unknown>)[`skill_${key}`] = skill.frontmatter[key];
  }

  return { ok: true, document, warnings };
}
