/**
 * Classification of the difference between two Agent Passports.
 *
 * This is the input alphabet of the Assurance Delta. The rule that matters is
 * at the bottom of the file: anything the taxonomy cannot name is returned as
 * `unclassified` and forces a full reassessment. Treating an unrecognised
 * configuration difference as harmless is the one failure this component must
 * never produce, because it would silently preserve evidence for a system that
 * is no longer the system that was tested.
 */

export type MaterialChangeKind =
  | 'model_version'
  | 'model_provider'
  | 'system_prompt'
  | 'memory_config'
  | 'tool_added'
  | 'tool_removed'
  | 'tool_schema_changed'
  | 'permission_granted'
  | 'permission_revoked'
  | 'data_source_added'
  | 'data_source_removed'
  | 'autonomy_level'
  | 'human_oversight'
  | 'guardrail_config'
  | 'identity_binding'
  | 'deployment_environment'
  | 'dependency_provider'
  | 'retrieval_service'
  | 'third_party_dependency'
  | 'recovery_objective'
  // Commercial and contractual surface. Decirance does not manage seats or
  // renewals - that is software asset management. It records the entitlement
  // an agent depends on, so that a change to it becomes a graph dependency:
  // a provider that starts retaining prompts, an agreement that lapses, or an
  // agent moved from an enterprise account to a personal API key all
  // invalidate assurance evidence without touching a line of the agent.
  | 'provider_plan'
  | 'account_binding'
  | 'data_processing_terms'
  | 'data_residency'
  | 'entitlement_expiry'
  // Contamination surface. Kept distinct from the generic tool and data
  // fields because the poisoning threats differ in kind: a new MCP server
  // introduces an unsigned tool *description* the model reads as instruction,
  // whereas a new retrieval source introduces untrusted *content*. They
  // invalidate different claims and demand different tests.
  | 'mcp_server_added'
  | 'mcp_server_changed'
  | 'memory_write_policy'
  | 'model_artifact_digest'
  | 'index_content_source'
  // Containment and evaluation-integrity surface. The 2026 evaluation
  // incidents showed that an agent's reachable environment — its egress path,
  // its sandbox, the package proxy it pulls through, the store its logs go to,
  // the harness and scorer that judge it — is part of the assessed system, not
  // infrastructure detail beneath it. An agent that cannot reach the internet
  // is a different system from the same agent that can, and a "pass" recorded
  // to a log the agent could write is not the same artefact as one recorded
  // where it could not.
  | 'network_egress'
  | 'permitted_destination'
  | 'sandbox_image'
  | 'package_registry'
  | 'shared_storage'
  | 'inter_agent_channel'
  | 'agent_concurrency'
  | 'safety_classifier'
  | 'logging_destination'
  | 'monitoring_plane'
  | 'evaluation_harness'
  | 'scorer_config'
  | 'shutdown_mechanism'
  | 'credential_scope'
  | 'cosmetic_metadata';

export type AssuranceDomain = 'cyber' | 'resilience' | 'both';

/**
 * A change's domain, which may be `none`. Kept separate from
 * `AssuranceDomain` because graph nodes must always sit in cyber, resilience
 * or both, whereas a cosmetic metadata change sits in neither and saying
 * otherwise would misreport it in the delta.
 */
export type ChangeDomain = AssuranceDomain | 'none';

/** Which side of Challenge 3 each change kind belongs to. */
export const CHANGE_DOMAIN: Record<MaterialChangeKind, ChangeDomain> = {
  model_version: 'both',
  model_provider: 'both',
  system_prompt: 'cyber',
  memory_config: 'cyber',
  tool_added: 'cyber',
  tool_removed: 'both',
  tool_schema_changed: 'cyber',
  permission_granted: 'cyber',
  permission_revoked: 'cyber',
  data_source_added: 'cyber',
  data_source_removed: 'both',
  autonomy_level: 'both',
  human_oversight: 'both',
  guardrail_config: 'cyber',
  identity_binding: 'cyber',
  deployment_environment: 'resilience',
  dependency_provider: 'resilience',
  retrieval_service: 'resilience',
  third_party_dependency: 'resilience',
  recovery_objective: 'resilience',
  provider_plan: 'both',
  account_binding: 'cyber',
  data_processing_terms: 'cyber',
  data_residency: 'cyber',
  entitlement_expiry: 'resilience',
  mcp_server_added: 'cyber',
  mcp_server_changed: 'cyber',
  memory_write_policy: 'cyber',
  model_artifact_digest: 'both',
  index_content_source: 'cyber',
  network_egress: 'cyber',
  permitted_destination: 'cyber',
  sandbox_image: 'cyber',
  package_registry: 'cyber',
  shared_storage: 'cyber',
  inter_agent_channel: 'cyber',
  // Concurrency and shutdown bear on both: more parallel instances is a
  // containment question and a capacity one, and a shutdown path that no
  // longer works is a recovery failure as much as a security one.
  agent_concurrency: 'both',
  safety_classifier: 'cyber',
  logging_destination: 'cyber',
  monitoring_plane: 'cyber',
  evaluation_harness: 'cyber',
  scorer_config: 'cyber',
  shutdown_mechanism: 'both',
  credential_scope: 'cyber',
  cosmetic_metadata: 'none',
};

export interface PassportSnapshot {
  modelProvider: string;
  modelName: string;
  modelVersion: string;
  systemPromptDigest: string;
  memoryConfig: Record<string, unknown>;
  tools: string[];
  permissions: string[];
  dataSources: string[];
  guardrails: string[];
  identityBinding: Record<string, unknown>;
  autonomyLevel: string;
  humanReviewWorkflow: Record<string, unknown>;
  deploymentEnvironment: string;
  thirdPartyDependencies: string[];
  recoveryObjectives: Record<string, unknown>;
  /** Commercial entitlement the agent operates under. */
  providerPlan: string;
  accountBinding: string;
  dataProcessingTerms: Record<string, unknown>;
  dataResidency: string;
  entitlementExpiry: string;
  /** Contamination surface. */
  mcpServers: string[];
  memoryWritePolicy: Record<string, unknown>;
  modelArtifactDigest: string;
  indexContentSources: string[];
  /**
   * Containment and evaluation-integrity surface.
   *
   * `logPlane` and `monitoringPlane` are the two that matter most and are the
   * least obvious: they record whether the agent could write to the place its
   * own evidence is collected. An agent that gains that reach invalidates the
   * integrity of every artefact collected there, without any change to the
   * agent itself.
   */
  networkEgress: string;
  permittedDestinations: string[];
  sandboxImage: string;
  packageRegistries: string[];
  sharedStorage: string[];
  interAgentChannels: string[];
  maxConcurrentInstances: string;
  safetyClassifiers: string[];
  loggingDestination: string;
  logPlane: string;
  monitoringPlane: string;
  evaluationHarness: string;
  scorerConfig: string;
  shutdownMechanism: string;
  credentialScopes: string[];
}

export interface MaterialChange {
  kind: MaterialChangeKind;
  domain: ChangeDomain;
  field: keyof PassportSnapshot;
  from: string | null;
  to: string | null;
  description: string;
}

export interface UnclassifiedChange {
  field: string;
  reason: string;
}

export interface PassportDiff {
  changes: MaterialChange[];
  unclassified: UnclassifiedChange[];
  /** True when any unclassified difference was seen. Fail closed. */
  requiresFullReassessment: boolean;
}

const KNOWN_FIELDS: readonly (keyof PassportSnapshot)[] = [
  'modelProvider',
  'modelName',
  'modelVersion',
  'systemPromptDigest',
  'memoryConfig',
  'tools',
  'permissions',
  'dataSources',
  'guardrails',
  'identityBinding',
  'autonomyLevel',
  'humanReviewWorkflow',
  'deploymentEnvironment',
  'thirdPartyDependencies',
  'recoveryObjectives',
  'providerPlan',
  'accountBinding',
  'dataProcessingTerms',
  'dataResidency',
  'entitlementExpiry',
  'networkEgress',
  'permittedDestinations',
  'sandboxImage',
  'packageRegistries',
  'sharedStorage',
  'interAgentChannels',
  'maxConcurrentInstances',
  'safetyClassifiers',
  'loggingDestination',
  'logPlane',
  'monitoringPlane',
  'evaluationHarness',
  'scorerConfig',
  'shutdownMechanism',
  'credentialScopes',
  'mcpServers',
  'memoryWritePolicy',
  'modelArtifactDigest',
  'indexContentSources',
];

function scalarChange(
  field: keyof PassportSnapshot,
  kind: MaterialChangeKind,
  from: unknown,
  to: unknown,
  label: string,
): MaterialChange | null {
  if (String(from) === String(to)) return null;
  return {
    kind,
    domain: CHANGE_DOMAIN[kind],
    field,
    from: from == null ? null : String(from),
    to: to == null ? null : String(to),
    description: `${label} changed from "${String(from)}" to "${String(to)}".`,
  };
}

function jsonChange(
  field: keyof PassportSnapshot,
  kind: MaterialChangeKind,
  from: unknown,
  to: unknown,
  label: string,
): MaterialChange | null {
  const a = JSON.stringify(from ?? {});
  const b = JSON.stringify(to ?? {});
  if (a === b) return null;
  return {
    kind,
    domain: CHANGE_DOMAIN[kind],
    field,
    from: a,
    to: b,
    description: `${label} changed.`,
  };
}

function setChanges(
  field: keyof PassportSnapshot,
  addedKind: MaterialChangeKind,
  removedKind: MaterialChangeKind,
  from: string[],
  to: string[],
  label: string,
): MaterialChange[] {
  const before = new Set(from);
  const after = new Set(to);
  const out: MaterialChange[] = [];
  for (const item of after) {
    if (!before.has(item)) {
      out.push({
        kind: addedKind,
        domain: CHANGE_DOMAIN[addedKind],
        field,
        from: null,
        to: item,
        description: `${label} "${item}" added.`,
      });
    }
  }
  for (const item of before) {
    if (!after.has(item)) {
      out.push({
        kind: removedKind,
        domain: CHANGE_DOMAIN[removedKind],
        field,
        from: item,
        to: null,
        description: `${label} "${item}" removed.`,
      });
    }
  }
  return out;
}

/**
 * Compare two passports and classify every difference.
 *
 * Only fields in `KNOWN_FIELDS` are compared. Any other key present on either
 * snapshot is reported as unclassified rather than ignored, so extending the
 * Passport without extending this taxonomy degrades safely — the delta becomes
 * conservative instead of becoming wrong.
 */
export function diffPassports(
  from: PassportSnapshot,
  to: PassportSnapshot,
): PassportDiff {
  const changes: MaterialChange[] = [];
  const unclassified: UnclassifiedChange[] = [];

  const push = (c: MaterialChange | null) => {
    if (c) changes.push(c);
  };

  push(
    scalarChange(
      'modelProvider',
      'model_provider',
      from.modelProvider,
      to.modelProvider,
      'Model provider',
    ),
  );
  push(
    scalarChange(
      'modelVersion',
      'model_version',
      `${from.modelName}@${from.modelVersion}`,
      `${to.modelName}@${to.modelVersion}`,
      'Model version',
    ),
  );
  push(
    scalarChange(
      'systemPromptDigest',
      'system_prompt',
      from.systemPromptDigest,
      to.systemPromptDigest,
      'System prompt',
    ),
  );
  push(
    jsonChange(
      'memoryConfig',
      'memory_config',
      from.memoryConfig,
      to.memoryConfig,
      'Memory configuration',
    ),
  );
  push(
    scalarChange(
      'autonomyLevel',
      'autonomy_level',
      from.autonomyLevel,
      to.autonomyLevel,
      'Autonomy level',
    ),
  );
  push(
    jsonChange(
      'humanReviewWorkflow',
      'human_oversight',
      from.humanReviewWorkflow,
      to.humanReviewWorkflow,
      'Human review workflow',
    ),
  );
  push(
    jsonChange(
      'identityBinding',
      'identity_binding',
      from.identityBinding,
      to.identityBinding,
      'Identity binding',
    ),
  );
  push(
    scalarChange(
      'deploymentEnvironment',
      'deployment_environment',
      from.deploymentEnvironment,
      to.deploymentEnvironment,
      'Deployment environment',
    ),
  );
  push(
    jsonChange(
      'recoveryObjectives',
      'recovery_objective',
      from.recoveryObjectives,
      to.recoveryObjectives,
      'Recovery objectives',
    ),
  );

  push(jsonChange('memoryWritePolicy', 'memory_write_policy', from.memoryWritePolicy, to.memoryWritePolicy, 'Memory write policy'));
  push(scalarChange('modelArtifactDigest', 'model_artifact_digest', from.modelArtifactDigest, to.modelArtifactDigest, 'Model artefact digest'));
  push(scalarChange('providerPlan', 'provider_plan', from.providerPlan, to.providerPlan, 'Provider plan'));
  push(scalarChange('accountBinding', 'account_binding', from.accountBinding, to.accountBinding, 'Account binding'));
  push(jsonChange('dataProcessingTerms', 'data_processing_terms', from.dataProcessingTerms, to.dataProcessingTerms, 'Data-processing terms'));
  push(scalarChange('dataResidency', 'data_residency', from.dataResidency, to.dataResidency, 'Data residency'));
  push(scalarChange('entitlementExpiry', 'entitlement_expiry', from.entitlementExpiry, to.entitlementExpiry, 'Entitlement expiry'));

  push(scalarChange('networkEgress', 'network_egress', from.networkEgress, to.networkEgress, 'Network egress policy'));
  push(scalarChange('sandboxImage', 'sandbox_image', from.sandboxImage, to.sandboxImage, 'Sandbox image'));
  push(scalarChange('maxConcurrentInstances', 'agent_concurrency', from.maxConcurrentInstances, to.maxConcurrentInstances, 'Maximum concurrent instances'));
  push(scalarChange('loggingDestination', 'logging_destination', from.loggingDestination, to.loggingDestination, 'Logging destination'));
  // Two separate facts. The destination can stay the same while the plane
  // changes from one the agent cannot write to one it can, and that second
  // change is the one that destroys evidence integrity.
  push(scalarChange('logPlane', 'logging_destination', from.logPlane, to.logPlane, 'Log collection plane'));
  push(scalarChange('monitoringPlane', 'monitoring_plane', from.monitoringPlane, to.monitoringPlane, 'Monitoring plane'));
  push(scalarChange('evaluationHarness', 'evaluation_harness', from.evaluationHarness, to.evaluationHarness, 'Evaluation harness'));
  push(scalarChange('scorerConfig', 'scorer_config', from.scorerConfig, to.scorerConfig, 'Scorer configuration'));
  push(scalarChange('shutdownMechanism', 'shutdown_mechanism', from.shutdownMechanism, to.shutdownMechanism, 'Shutdown mechanism'));

  changes.push(
    ...setChanges('permittedDestinations', 'permitted_destination', 'permitted_destination', from.permittedDestinations, to.permittedDestinations, 'Permitted destination'),
    ...setChanges('packageRegistries', 'package_registry', 'package_registry', from.packageRegistries, to.packageRegistries, 'Package registry'),
    ...setChanges('sharedStorage', 'shared_storage', 'shared_storage', from.sharedStorage, to.sharedStorage, 'Shared storage'),
    ...setChanges('interAgentChannels', 'inter_agent_channel', 'inter_agent_channel', from.interAgentChannels, to.interAgentChannels, 'Inter-agent channel'),
    // Removal matters as much as addition here: a disabled safety classifier
    // is the change, and treating removals as uninteresting would miss it.
    ...setChanges('safetyClassifiers', 'safety_classifier', 'safety_classifier', from.safetyClassifiers, to.safetyClassifiers, 'Safety classifier'),
    ...setChanges('credentialScopes', 'credential_scope', 'credential_scope', from.credentialScopes, to.credentialScopes, 'Credential scope'),
  );

  changes.push(
    ...setChanges('tools', 'tool_added', 'tool_removed', from.tools, to.tools, 'Tool'),
    ...setChanges(
      'permissions',
      'permission_granted',
      'permission_revoked',
      from.permissions,
      to.permissions,
      'Permission',
    ),
    ...setChanges(
      'dataSources',
      'data_source_added',
      'data_source_removed',
      from.dataSources,
      to.dataSources,
      'Data source',
    ),
    ...setChanges(
      'guardrails',
      'guardrail_config',
      'guardrail_config',
      from.guardrails,
      to.guardrails,
      'Guardrail',
    ),
    ...setChanges('mcpServers', 'mcp_server_added', 'mcp_server_changed', from.mcpServers, to.mcpServers, 'MCP server'),
    ...setChanges('indexContentSources', 'index_content_source', 'index_content_source', from.indexContentSources, to.indexContentSources, 'Indexed content source'),
    ...setChanges(
      'thirdPartyDependencies',
      'third_party_dependency',
      'third_party_dependency',
      from.thirdPartyDependencies,
      to.thirdPartyDependencies,
      'Third-party dependency',
    ),
  );

  const known = new Set<string>(KNOWN_FIELDS as readonly string[]);
  for (const key of new Set([...Object.keys(from), ...Object.keys(to)])) {
    if (!known.has(key)) {
      unclassified.push({
        field: key,
        reason:
          'Passport field is not in the material change taxonomy, so its effect on the assurance graph cannot be determined.',
      });
    }
  }

  return {
    changes,
    unclassified,
    requiresFullReassessment: unclassified.length > 0,
  };
}
