/**
 * Agent Readiness Scan.
 *
 * Takes whatever an organisation already has — an mcp.json, a package
 * manifest, an env file, a permissions export — and produces a draft Agent
 * Passport, a map of what evidence is missing, and a statement of whether the
 * agent is ready to be assessed at all.
 *
 * Two rules govern the output.
 *
 * First, no score. The verdict is one of three named states, and every field
 * carries an explicit status. A number would invite comparison between agents
 * that share no context, which is the failure the whole product argues
 * against.
 *
 * Second, `missing` and `unverifiable` are different and stay different.
 * "No MCP servers are configured" and "MCP servers exist but their tool
 * descriptions were not available to read" are opposite situations: one is a
 * small attack surface, the other is an unmeasured one. Collapsing them into
 * "not found" would make an unknown look like a zero.
 */

import { fingerprintMcpServer, parseMcpConfig, type McpServer } from './mcp';
import type { PassportSnapshot } from './material-change';
import { digestOf } from './attestation';

export interface ScanInput {
  /** Contents of an mcp.json or equivalent. */
  mcpConfig?: string;
  /** Contents of a package.json, for framework and provider detection. */
  packageManifest?: string;
  /** Contents of a .env.example or similar — names only, never values. */
  envReference?: string;
  permissions?: string[];
  dataSources?: string[];
  modelProvider?: string;
  modelName?: string;
  modelVersion?: string;
  /** Hashed immediately; the text is never retained. */
  systemPrompt?: string;
  owner?: string;
  purpose?: string;
  environment?: string;
  evidenceRefs?: string[];
}

export type FieldStatus = 'declared' | 'detected' | 'missing' | 'unverifiable';

export interface ScanField {
  field: string;
  status: FieldStatus;
  value?: string;
  note?: string;
}

export interface ScanGap {
  ref: string;
  severity: 'blocking' | 'material' | 'advisory';
  title: string;
  why: string;
  action: string;
}

export type ReadinessVerdict =
  | 'insufficient_information'
  | 'evidence_gaps'
  | 'ready_for_assessment';

export interface ReadinessReport {
  verdict: ReadinessVerdict;
  verdictReason: string;
  draftPassport: PassportSnapshot;
  fields: ScanField[];
  detectedFrameworks: string[];
  detectedProviders: string[];
  mcpServers: Array<McpServer & { fingerprint: string }>;
  mcpWarnings: string[];
  gaps: ScanGap[];
  recommendedTests: string[];
  nextActions: string[];
}

const FRAMEWORK_SIGNALS: Array<[RegExp, string]> = [
  [/@modelcontextprotocol\/sdk/, 'Model Context Protocol SDK'],
  [/langgraph/, 'LangGraph'],
  [/\blangchain\b/, 'LangChain'],
  [/crewai/, 'CrewAI'],
  [/autogen/, 'AutoGen'],
  [/semantic-kernel/, 'Semantic Kernel'],
  [/llamaindex/, 'LlamaIndex'],
  [/@anthropic-ai\/claude-agent-sdk/, 'Claude Agent SDK'],
];

const PROVIDER_SIGNALS: Array<[RegExp, string]> = [
  [/ANTHROPIC_API_KEY|@anthropic-ai\/sdk/, 'Anthropic'],
  [/OPENAI_API_KEY|(^|[^a-z])openai([^a-z]|$)/i, 'OpenAI'],
  [/AZURE_OPENAI|@azure\/openai/, 'Azure OpenAI'],
  [/AWS_BEDROCK|@aws-sdk\/client-bedrock/, 'AWS Bedrock'],
  [/GOOGLE_(API|VERTEX)|@google-cloud\/vertexai/, 'Google Vertex AI'],
];

/** Permission shapes that grant more than a case-scoped agent should hold. */
const BROAD_PERMISSION = /(^|[:.*])(\*|all|admin|owner|write:all|delete)($|[:.*])/i;

function detect(signals: Array<[RegExp, string]>, haystack: string): string[] {
  return [...new Set(signals.filter(([re]) => re.test(haystack)).map(([, name]) => name))];
}

export function scanForReadiness(input: ScanInput): ReadinessReport {
  const fields: ScanField[] = [];
  const gaps: ScanGap[] = [];
  const nextActions: string[] = [];
  const recommendedTests = new Set<string>();
  let gapRef = 0;
  const gap = (severity: ScanGap['severity'], title: string, why: string, action: string) =>
    gaps.push({ ref: `G-${String(++gapRef).padStart(2, '0')}`, severity, title, why, action });

  const haystack = `${input.packageManifest ?? ''}\n${input.envReference ?? ''}`;
  const detectedFrameworks = detect(FRAMEWORK_SIGNALS, haystack);
  const detectedProviders = detect(PROVIDER_SIGNALS, haystack);

  // --- MCP inventory -------------------------------------------------------
  const mcp = input.mcpConfig
    ? parseMcpConfig(input.mcpConfig)
    : { servers: [], warnings: [], unknownFields: [] };
  const mcpServers = mcp.servers.map((s) => ({ ...s, fingerprint: fingerprintMcpServer(s) }));

  if (!input.mcpConfig) {
    fields.push({ field: 'MCP servers', status: 'unverifiable', note: 'No configuration supplied. Whether the agent uses MCP is unknown, not none.' });
  } else if (mcpServers.length === 0) {
    fields.push({ field: 'MCP servers', status: 'missing', note: 'Configuration supplied but declares no servers.' });
  } else {
    fields.push({ field: 'MCP servers', status: 'detected', value: mcpServers.map((s) => s.name).join(', ') });
    recommendedTests.add('mcp-manifest-signature-check');
    recommendedTests.add('tool-description-poisoning-pack');

    const undescribed = mcpServers.filter((s) => s.tools.length === 0 || s.tools.every((t) => !t.description));
    if (undescribed.length > 0) {
      gap('material', 'MCP tool descriptions not available',
        'A tool description is text the model reads as instruction, and it is the surface a poisoning attack changes while leaving endpoint, schema and version untouched. It cannot be fingerprinted while unread.',
        `Query ${undescribed.map((s) => `"${s.name}"`).join(', ')} for its advertised tools and re-scan.`);
    }
    const unapproved = mcpServers.filter((s) => s.approved !== true);
    if (unapproved.length > 0) {
      gap('blocking', 'Unapproved MCP servers in use',
        'An agent connected to a server nobody approved is operating outside any assessed boundary.',
        `Record an owner and approval decision for ${unapproved.map((s) => `"${s.name}"`).join(', ')}.`);
    }
    const weakAuth = mcpServers.filter((s) => s.authMethod === 'unspecified');
    if (weakAuth.length > 0) {
      gap('material', 'MCP authentication unspecified',
        'A remote server with no stated authentication may be reachable by anything that can resolve its endpoint.',
        `Declare the authentication method for ${weakAuth.map((s) => `"${s.name}"`).join(', ')}.`);
    }
  }

  // --- Model ---------------------------------------------------------------
  const modelKnown = Boolean(input.modelProvider && input.modelName);
  fields.push({
    field: 'Model',
    status: modelKnown ? 'declared' : detectedProviders.length > 0 ? 'detected' : 'missing',
    value: modelKnown ? `${input.modelProvider}/${input.modelName} ${input.modelVersion ?? '(unpinned)'}` : detectedProviders.join(', ') || undefined,
    note: modelKnown ? undefined : 'Inferred from dependency and environment names, which indicates a provider is reachable, not which model is used.',
  });
  if (!modelKnown) {
    gap('blocking', 'Model and version not declared',
      'Behavioural evidence is only valid for the model it was collected against, so no evaluation result can be scoped without this.',
      'Declare provider, model and exact version in the Agent Passport.');
  } else if (!input.modelVersion) {
    gap('material', 'Model version unpinned',
      'An unpinned model can change under the agent without any change to its code, silently invalidating behavioural evidence.',
      'Pin the model version and record it.');
    recommendedTests.add('model-substitution-check');
  }

  // --- Prompt --------------------------------------------------------------
  const promptDigest = input.systemPrompt ? digestOf(input.systemPrompt) : undefined;
  fields.push({
    field: 'System prompt',
    status: promptDigest ? 'declared' : 'missing',
    value: promptDigest,
    note: promptDigest ? 'Hashed on receipt; the text is not retained.' : undefined,
  });
  if (!promptDigest) {
    gap('material', 'No system prompt digest',
      'A prompt change alters behaviour without altering configuration. Without a digest there is nothing to compare against.',
      'Supply the prompt for hashing, or supply a digest computed locally.');
  }

  // --- Permissions ---------------------------------------------------------
  const permissions = input.permissions ?? [];
  fields.push({
    field: 'Permissions',
    status: permissions.length > 0 ? 'declared' : 'missing',
    value: permissions.join(', ') || undefined,
  });
  if (permissions.length === 0) {
    gap('blocking', 'No permission set declared',
      'Least-privilege and authority claims cannot be stated, let alone evidenced, without knowing what the agent may do.',
      'Export the agent\'s effective permissions and attach them.');
  } else {
    const broad = permissions.filter((p) => BROAD_PERMISSION.test(p));
    if (broad.length > 0) {
      gap('blocking', 'Broad permission scopes',
        `${broad.join(', ')} grant more than a scoped agent needs, and an over-broad grant cannot be constrained by evidence afterwards.`,
        'Narrow the scopes, or record an explicit justification and compensating control.');
      recommendedTests.add('least-privilege-review');
      recommendedTests.add('privilege-escalation-pack');
    }
    if (permissions.some((p) => /write|delete|send|execute/i.test(p))) {
      recommendedTests.add('human-approval-workflow-test');
      recommendedTests.add('write-integrity-test');
      recommendedTests.add('rollback-recovery-test');
    }
  }

  // --- Ownership and context ----------------------------------------------
  fields.push({ field: 'Accountable owner', status: input.owner ? 'declared' : 'missing', value: input.owner });
  if (!input.owner) {
    gap('blocking', 'No accountable owner',
      'A permit is a person accepting accountability. With no named owner there is nobody to issue one.',
      'Name the individual who will sign the Deployment Permit.');
  }
  fields.push({ field: 'Purpose', status: input.purpose ? 'declared' : 'missing', value: input.purpose });
  if (!input.purpose) {
    gap('material', 'No stated purpose',
      'Assurance is context-specific. Without a purpose there is no context to assure against.',
      'Draft a Context Contract, starting from the business purpose.');
  }

  // --- Data ----------------------------------------------------------------
  const dataSources = input.dataSources ?? [];
  fields.push({
    field: 'Data sources',
    status: dataSources.length > 0 ? 'declared' : 'unverifiable',
    value: dataSources.join(', ') || undefined,
    note: dataSources.length === 0 ? 'Not supplied. Reachable data is unknown rather than none.' : undefined,
  });
  if (dataSources.length > 0) {
    recommendedTests.add('retrieval-allowlist-review');
    recommendedTests.add('rag-poisoning-pack');
  }

  // --- Evidence ------------------------------------------------------------
  const evidenceRefs = input.evidenceRefs ?? [];
  fields.push({
    field: 'Existing evidence',
    status: evidenceRefs.length > 0 ? 'declared' : 'missing',
    value: evidenceRefs.join(', ') || undefined,
  });
  if (evidenceRefs.length === 0) {
    gap('material', 'No evidence attached',
      'Every claim would start unsupported, so the first assessment can only produce a supervised pilot at best.',
      'Attach evaluation results, configuration exports and control attestations.');
  }

  recommendedTests.add('indirect-injection-pack');
  recommendedTests.add('audit-trail-sample');

  // --- Verdict -------------------------------------------------------------
  const blocking = gaps.filter((g) => g.severity === 'blocking');
  let verdict: ReadinessVerdict;
  let verdictReason: string;
  if (blocking.length > 0) {
    verdict = 'insufficient_information';
    verdictReason = `${blocking.length} blocking gap(s): the agent cannot be assessed until these are supplied. An assessment run now would describe a system nobody has fully declared.`;
    nextActions.push(...blocking.map((g) => g.action));
  } else if (gaps.length > 0) {
    verdict = 'evidence_gaps';
    verdictReason = `The configuration is complete enough to assess. ${gaps.length} evidence gap(s) remain, which will cap the recommendation until closed.`;
    nextActions.push(...gaps.slice(0, 4).map((g) => g.action));
  } else {
    verdict = 'ready_for_assessment';
    verdictReason = 'Configuration and evidence are sufficient to build an assurance case and issue a recommendation.';
    nextActions.push('Build the assurance graph and run the first assessment.');
  }

  const draftPassport: PassportSnapshot = {
    modelProvider: input.modelProvider ?? detectedProviders[0] ?? 'unspecified',
    modelName: input.modelName ?? 'unspecified',
    modelVersion: input.modelVersion ?? 'unspecified',
    systemPromptDigest: promptDigest ?? 'unspecified',
    memoryConfig: {},
    tools: mcpServers.flatMap((s) => s.tools.map((t) => t.name)),
    permissions: [...permissions].sort(),
    dataSources,
    guardrails: [],
    identityBinding: {},
    autonomyLevel: 'unspecified',
    humanReviewWorkflow: {},
    deploymentEnvironment: input.environment ?? 'unspecified',
    thirdPartyDependencies: detectedProviders,
    recoveryObjectives: {},
    providerPlan: 'unspecified',
    accountBinding: 'unspecified',
    dataProcessingTerms: {},
    dataResidency: 'unspecified',
    entitlementExpiry: 'unspecified',
    mcpServers: mcpServers.map((s) => (s.version ? `mcp:${s.name}@${s.version}` : `mcp:${s.name}`)),
    memoryWritePolicy: {},
    modelArtifactDigest: 'unspecified',
    indexContentSources: [],
  };

  return {
    verdict,
    verdictReason,
    draftPassport,
    fields,
    detectedFrameworks,
    detectedProviders,
    mcpServers,
    mcpWarnings: mcp.warnings,
    gaps,
    recommendedTests: [...recommendedTests].sort(),
    nextActions,
  };
}
