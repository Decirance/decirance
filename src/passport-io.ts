/**
 * Agent Passport wire format — import and export.
 *
 * The on-the-wire shape follows Appendix A of the specification (nested
 * `components`, snake_case) rather than the engine's internal flat
 * `PassportSnapshot`. That separation is deliberate: the wire format is the
 * thing published as an open schema and written by other people's CI
 * pipelines, so it has to stay stable even when the engine's internals move.
 *
 * Validation fails closed. An unrecognised field is reported rather than
 * dropped, for the same reason the change taxonomy reports unclassified
 * differences: silently ignoring part of a manifest would mean assuring a
 * system that is not the system described.
 */

import { digestOf } from './digest';
import type { PassportSnapshot } from './material-change';

export const PASSPORT_SCHEMA_VERSION = '0.1.0';

export interface PassportDocument {
  schema_version: string;
  agent_id: string;
  agent_version: string;
  owner: string;
  purpose?: string;
  environment: string;
  created_at?: string;
  components: {
    model: { provider: string; model: string; version: string };
    prompt_digest: string;
    memory?: Record<string, unknown>;
    tools?: Array<{ id: string; version?: string; permissions?: string[] }>;
    data_sources?: string[];
    guardrails?: string[];
    identity?: Record<string, unknown>;
    dependencies?: string[];
    /** Contamination surface: MCP servers, indexed content, memory writers. */
    mcp_servers?: string[];
    index_content_sources?: string[];
    memory_write_policy?: Record<string, unknown>;
    model_artifact_digest?: string;
  };
  operating?: {
    autonomy_level?: string;
    human_review?: Record<string, unknown>;
    recovery_objectives?: Record<string, unknown>;
  };
  /** Commercial entitlement the agent operates under. */
  entitlement?: {
    provider_plan?: string;
    account_binding?: string;
    data_processing_terms?: Record<string, unknown>;
    data_residency?: string;
    expiry?: string;
    contract_ref?: string;
  };
  /** Digest over the normalised document, excluding this field. */
  digest?: string;
}

export interface PassportParseError {
  path: string;
  message: string;
}

export type PassportParseResult =
  | {
      ok: true;
      snapshot: PassportSnapshot;
      document: PassportDocument;
      /** Fields present in the document that the taxonomy does not know. */
      unknownFields: string[];
      warnings: string[];
    }
  | { ok: false; errors: PassportParseError[] };

const KNOWN_TOP_LEVEL = new Set([
  'schema_version', 'agent_id', 'agent_version', 'owner', 'purpose',
  'environment', 'created_at', 'components', 'operating', 'entitlement',
  'digest',
]);
const KNOWN_COMPONENTS = new Set([
  'model', 'prompt_digest', 'memory', 'tools', 'data_sources', 'guardrails',
  'identity', 'dependencies', 'mcp_servers', 'index_content_sources',
  'memory_write_policy', 'model_artifact_digest',
]);

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function requireString(
  value: unknown,
  path: string,
  errors: PassportParseError[],
): string {
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push({ path, message: 'expected a non-empty string' });
    return '';
  }
  return value;
}

/**
 * Parse and validate an Agent Passport document.
 *
 * Accepts a parsed object or a JSON string, so callers can hand it a pasted
 * blob or an uploaded file without pre-processing.
 */
export function parsePassport(input: unknown): PassportParseResult {
  const errors: PassportParseError[] = [];
  const warnings: string[] = [];

  let raw: unknown = input;
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input);
    } catch (e) {
      return {
        ok: false,
        errors: [{ path: '(document)', message: `not valid JSON: ${(e as Error).message}` }],
      };
    }
  }

  if (!isObject(raw)) {
    return { ok: false, errors: [{ path: '(document)', message: 'expected a JSON object' }] };
  }

  const doc = raw as Partial<PassportDocument> & Record<string, unknown>;

  const schemaVersion = requireString(doc.schema_version, 'schema_version', errors);
  if (schemaVersion && schemaVersion !== PASSPORT_SCHEMA_VERSION) {
    warnings.push(
      `Document declares schema_version ${schemaVersion}; this build understands ${PASSPORT_SCHEMA_VERSION}.`,
    );
  }
  requireString(doc.agent_id, 'agent_id', errors);
  requireString(doc.agent_version, 'agent_version', errors);
  requireString(doc.owner, 'owner', errors);
  const environment = requireString(doc.environment, 'environment', errors);

  if (!isObject(doc.components)) {
    errors.push({ path: 'components', message: 'expected an object' });
    return { ok: false, errors };
  }
  const components = doc.components as Record<string, unknown>;

  if (!isObject(components.model)) {
    errors.push({ path: 'components.model', message: 'expected an object' });
  }
  const model = (isObject(components.model) ? components.model : {}) as Record<string, unknown>;
  const provider = requireString(model.provider, 'components.model.provider', errors);
  const modelName = requireString(model.model, 'components.model.model', errors);
  const modelVersion = requireString(model.version, 'components.model.version', errors);
  const promptDigest = requireString(components.prompt_digest, 'components.prompt_digest', errors);

  const tools = Array.isArray(components.tools) ? components.tools : [];
  if (!Array.isArray(components.tools)) {
    warnings.push('components.tools is absent; the agent is recorded as having no tools.');
  }

  const toolIds: string[] = [];
  const permissions: string[] = [];
  tools.forEach((t, i) => {
    if (!isObject(t)) {
      errors.push({ path: `components.tools[${i}]`, message: 'expected an object' });
      return;
    }
    const id = requireString(t.id, `components.tools[${i}].id`, errors);
    if (id) toolIds.push(id);
    if (Array.isArray(t.permissions)) {
      for (const p of t.permissions) {
        if (typeof p === 'string') permissions.push(p);
      }
    }
  });

  const operating = isObject(doc.operating) ? doc.operating : {};
  const entitlement = isObject(doc.entitlement) ? doc.entitlement : {};

  // Unknown fields are surfaced, never dropped.
  const unknownFields = [
    ...Object.keys(doc).filter((k) => !KNOWN_TOP_LEVEL.has(k)),
    ...Object.keys(components)
      .filter((k) => !KNOWN_COMPONENTS.has(k))
      .map((k) => `components.${k}`),
  ];

  if (errors.length > 0) return { ok: false, errors };

  const strArray = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  const obj = (v: unknown): Record<string, unknown> => (isObject(v) ? v : {});
  const str = (v: unknown, fallback = ''): string =>
    typeof v === 'string' ? v : fallback;

  const snapshot: PassportSnapshot = {
    modelProvider: provider,
    modelName,
    modelVersion,
    systemPromptDigest: promptDigest,
    memoryConfig: obj(components.memory),
    tools: toolIds,
    permissions: [...new Set(permissions)].sort(),
    dataSources: strArray(components.data_sources),
    guardrails: strArray(components.guardrails),
    identityBinding: obj(components.identity),
    autonomyLevel: str(operating.autonomy_level, 'unspecified'),
    humanReviewWorkflow: obj(operating.human_review),
    deploymentEnvironment: environment,
    thirdPartyDependencies: strArray(components.dependencies),
    recoveryObjectives: obj(operating.recovery_objectives),
    providerPlan: str(entitlement.provider_plan, 'unspecified'),
    accountBinding: str(entitlement.account_binding, 'unspecified'),
    dataProcessingTerms: obj(entitlement.data_processing_terms),
    dataResidency: str(entitlement.data_residency, 'unspecified'),
    entitlementExpiry: str(entitlement.expiry, 'unspecified'),
    mcpServers: strArray(components.mcp_servers),
    memoryWritePolicy: obj(components.memory_write_policy),
    modelArtifactDigest: str(components.model_artifact_digest, 'unspecified'),
    indexContentSources: strArray(components.index_content_sources),
  };

  return {
    ok: true,
    snapshot,
    document: doc as unknown as PassportDocument,
    unknownFields,
    warnings,
  };
}

/** Render a snapshot back out as a wire-format document. */
export function serialisePassport(
  snapshot: PassportSnapshot,
  meta: { agentId: string; agentVersion: string; owner: string; purpose?: string },
): PassportDocument {
  return {
    schema_version: PASSPORT_SCHEMA_VERSION,
    agent_id: meta.agentId,
    agent_version: meta.agentVersion,
    owner: meta.owner,
    purpose: meta.purpose,
    environment: snapshot.deploymentEnvironment,
    created_at: new Date().toISOString(),
    components: {
      model: {
        provider: snapshot.modelProvider,
        model: snapshot.modelName,
        version: snapshot.modelVersion,
      },
      prompt_digest: snapshot.systemPromptDigest,
      memory: snapshot.memoryConfig,
      tools: snapshot.tools.map((id) => ({ id })),
      data_sources: snapshot.dataSources,
      guardrails: snapshot.guardrails,
      identity: snapshot.identityBinding,
      dependencies: snapshot.thirdPartyDependencies,
      mcp_servers: snapshot.mcpServers,
      index_content_sources: snapshot.indexContentSources,
      memory_write_policy: snapshot.memoryWritePolicy,
      model_artifact_digest: snapshot.modelArtifactDigest,
    },
    operating: {
      autonomy_level: snapshot.autonomyLevel,
      human_review: snapshot.humanReviewWorkflow,
      recovery_objectives: snapshot.recoveryObjectives,
    },
    entitlement: {
      provider_plan: snapshot.providerPlan,
      account_binding: snapshot.accountBinding,
      data_processing_terms: snapshot.dataProcessingTerms,
      data_residency: snapshot.dataResidency,
      expiry: snapshot.entitlementExpiry,
    },
  };
}

/**
 * Canonical SHA-256 digest over a passport document, excluding `digest`
 * itself. Keys are sorted at every depth so two semantically identical
 * manifests written by different tools agree — otherwise "has this changed?"
 * would be answered by JSON key ordering rather than by content.
 */
export function passportDigest(doc: PassportDocument): string {
  return digestOf(doc, ['digest']);
}
