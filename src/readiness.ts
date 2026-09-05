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
 * Second, `not_detected` and `unknown` are different and stay different.
 * "The configuration was read and declares no MCP servers" and "no
 * configuration was supplied" are opposite situations: one is a small attack
 * surface, the other is an unmeasured one. Collapsing them into "not found"
 * would make an unknown look like a zero.
 */

import { fingerprintMcpServer, parseMcpConfig, type McpServer } from './mcp';
import type { PassportSnapshot } from './material-change';
import { digestOf } from './digest';

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

/**
 * How a field's value came to be known.
 *
 * The previous four labels conflated two distinctions a reviewer needs.
 * `detected` covered both a fact read straight out of a supplied configuration
 * and a fact guessed from dependency names — very different confidence,
 * presented identically. And `missing` covered both "the file was read and the
 * thing is genuinely absent" and "nothing was supplied, so we cannot say",
 * which is the difference between information and the absence of it.
 *
 * Absence of evidence is the one thing this scan must never report as evidence
 * of absence, so it gets its own label rather than sharing one.
 */
export type FieldStatus =
  /** Stated by the submitter or a manifest. An assertion, trusted as such, not verified. */
  | 'declared'
  /** Read directly out of a supplied artefact. */
  | 'directly_detected'
  /** Concluded from indirect signal such as dependency names. Weaker than detection. */
  | 'inferred'
  /** The artefact was read and the thing is genuinely not there. This is information. */
  | 'not_detected'
  /** Nothing was supplied, or what was supplied could not be read. This is not information. */
  | 'unknown';

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
    : { servers: [], warnings: [], unknownFields: [], readable: true };
  const mcpServers = mcp.servers.map((s) => ({ ...s, fingerprint: fingerprintMcpServer(s) }));

  if (!input.mcpConfig) {
    fields.push({ field: 'MCP servers', status: 'unknown', note: 'No configuration supplied. Whether the agent uses MCP is unknown, not none.' });
  } else if (!mcp.readable) {
    // Unreadable is not "none". Reporting a parse failure as "declares no
    // servers" made malformed input improve the verdict — the blocking gap for
    // unapproved servers vanished along with the servers — which is precisely
    // the failure this scan exists to catch.
    fields.push({
      field: 'MCP servers',
      status: 'unknown',
      note: `Configuration supplied but could not be parsed: ${mcp.warnings[0] ?? 'unreadable'}. Whether the agent uses MCP is unknown, not none.`,
    });
    gaps.push({
      ref: 'G-MCP-PARSE',
      severity: 'blocking',
      title: 'MCP configuration could not be read',
      why: 'An unreadable configuration hides the tool and description surface entirely. Nothing can be concluded about MCP exposure, and an absent conclusion must never be recorded as an absent risk.',
      action: 'Correct the configuration so it parses, then run the scan again.',
    });
  } else if (mcpServers.length === 0) {
    fields.push({ field: 'MCP servers', status: 'not_detected', note: 'Configuration supplied and read; it declares no servers.' });
  } else {
    fields.push({ field: 'MCP servers', status: 'directly_detected', value: mcpServers.map((s) => s.name).join(', ') });
    recommendedTests.add('mcp-manifest-signature-check');
    recommendedTests.add('tool-description-poisoning-pack');

    // --- Local (stdio) execution surface ---------------------------------
    //
    // Remote servers were scrutinised — unspecified auth, unapproved endpoints —
    // and local ones were not, which is backwards. A remote server reached over
    // HTTPS with a scoped token is frequently the *safer* arrangement. A stdio
    // server is a command this machine runs, with the user's own privileges,
    // often fetched at launch from a public registry and handed a directory or a
    // database.
    //
    // The most common real config shape was therefore receiving less scrutiny
    // than our own demonstration sample, from a product whose stated
    // differentiator is MCP-aware assurance.
    //
    // These read `packageRef`, which is the command and its arguments. Nothing
    // here inspects `env`: the parser never retains it, and it is where the
    // secrets are.
    const local = mcpServers.filter((s) => s.transport === 'stdio');
    if (local.length > 0) {
      const unpinned = local.filter((s) =>
        /(^|\s)(npx|uvx|pipx|bunx)(\s|$)/.test(s.packageRef ?? '')
        && !/@\d+\.\d+/.test(s.packageRef ?? ''));
      if (unpinned.length > 0) {
        gap('material', 'Local server fetched at launch without a pinned version',
          `${unpinned.map((s) => `"${s.name}"`).join(', ')} ${unpinned.length === 1 ? 'is' : 'are'} started with a launcher that resolves and executes the latest published package. The code the agent runs can change between two launches with no change to this configuration, which invalidates any behavioural evidence collected against it without anyone editing anything.`,
          'Pin an exact version in the command, or vendor the server and reference the pinned artefact.');
        recommendedTests.add('mcp-manifest-signature-check');
      }

      const containerised = local.filter((s) => /(^|\s)(docker|podman|nerdctl)(\s|$)/.test(s.packageRef ?? ''));
      if (containerised.length > 0) {
        gap('material', 'Local server runs a container at agent start',
          `${containerised.map((s) => `"${s.name}"`).join(', ')} ${containerised.length === 1 ? 'invokes' : 'invoke'} a container runtime. Whatever the image contains executes with the launching user's access to the host daemon, and the image reference is not itself evidence of what runs.`,
          'Record the image digest rather than a tag, and state what the container is permitted to reach.');
      }

      // Absolute paths passed as arguments are a scope grant in disguise.
      const withPaths = local
        .map((s) => ({ s, paths: (s.packageRef ?? '').split(/\s+/).filter((a) => /^([A-Za-z]:[\\/]|\/)[^\s]+/.test(a)) }))
        .filter((x) => x.paths.length > 0);
      if (withPaths.length > 0) {
        gap('material', 'Filesystem scope granted through command arguments',
          `${withPaths.map((x) => `"${x.s.name}" (${x.paths.join(', ')})`).join('; ')}. A directory handed to a server on its command line is a permission, but it appears nowhere in the declared scopes, so it is invisible to a review that reads scopes alone.`,
          'Declare the filesystem scope alongside the other permissions so it can be assessed and re-checked when it changes.');
      }

      const withDsn = local.filter((s) =>
        /(postgres(ql)?|mysql|mongodb(\+srv)?|redis|mssql):\/\//i.test(s.packageRef ?? ''));
      if (withDsn.length > 0) {
        gap('blocking', 'Database connection string on a command line',
          `${withDsn.map((s) => `"${s.name}"`).join(', ')} ${withDsn.length === 1 ? 'carries' : 'carry'} a connection string in its arguments. That is a data scope granted outside the declared permissions, and a connection string on a command line is visible to every process on the machine — if it contained a password, treat that password as disclosed.`,
          'Move the credential to a secret store, declare the database scope explicitly, and rotate anything that has been passed this way.');
      }

      if (local.some((s) => s.approved !== true)) {
        gap('material', 'Local servers carry no approval record',
          'A local server executes code on the machine running the agent. None of these records an approval, so nothing distinguishes a reviewed server from one a developer added last week.',
          'Record who approved each local server and when, in the same place remote approvals are held.');
      }
    }

    const undescribed = mcpServers.filter((s) => s.tools.length === 0 || s.tools.every((t) => !t.description));
    if (undescribed.length > 0) {
      gap('material', 'MCP tool descriptions not available',
        'A tool description is text the model reads as instruction, and it is the surface a poisoning attack changes while leaving endpoint, schema and version untouched. It cannot be fingerprinted while unread.',
        `Query ${undescribed.map((s) => `"${s.name}"`).join(', ')} for ${undescribed.length === 1 ? 'its' : 'their'} advertised tools and re-scan.`);
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
  const modelInferred = !modelKnown && detectedProviders.length > 0;
  fields.push({
    field: 'Model',
    status: modelKnown ? 'declared' : modelInferred ? 'inferred' : 'unknown',
    value: modelKnown ? `${input.modelProvider}/${input.modelName} ${input.modelVersion ?? '(unpinned)'}` : detectedProviders.join(', ') || undefined,
    // The note is tied to the inference, not merely to the absence of a
    // declaration. It previously appeared whenever the model was undeclared,
    // so a scan that detected nothing at all still said "inferred from
    // dependency and environment names" — describing reasoning it had not
    // done. Separating the labels made that visible.
    note: modelKnown
      ? undefined
      : modelInferred
        ? 'Inferred from dependency and environment names, which indicates a provider is reachable, not which model is used.'
        : 'No provider was declared, and none could be inferred from what was supplied.',
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
    status: promptDigest ? 'declared' : 'unknown',
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
    status: permissions.length > 0 ? 'declared' : 'unknown',
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
  fields.push({ field: 'Accountable owner', status: input.owner ? 'declared' : 'unknown', value: input.owner });
  if (!input.owner) {
    gap('blocking', 'No accountable owner',
      'A permit is a person accepting accountability. With no named owner there is nobody to issue one.',
      'Name the individual who will sign the Deployment Permit.');
  }
  fields.push({ field: 'Purpose', status: input.purpose ? 'declared' : 'unknown', value: input.purpose });
  if (!input.purpose) {
    gap('material', 'No stated purpose',
      'Assurance is context-specific. Without a purpose there is no context to assure against.',
      'Draft a Context Contract, starting from the business purpose.');
  }

  // --- Data ----------------------------------------------------------------
  const dataSources = input.dataSources ?? [];
  fields.push({
    field: 'Data sources',
    status: dataSources.length > 0 ? 'declared' : 'unknown',
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
    status: evidenceRefs.length > 0 ? 'declared' : 'unknown',
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
    // A repository scan cannot determine any of this. Left empty on purpose:
    // the integrity assessment reads an unset collection plane as unverifiable,
    // and a scanner that guessed "deny-all" would manufacture the reassuring
    // answer for the field that matters most.
    networkEgress: '',
    permittedDestinations: [],
    sandboxImage: '',
    packageRegistries: [],
    sharedStorage: [],
    interAgentChannels: [],
    maxConcurrentInstances: '',
    safetyClassifiers: [],
    loggingDestination: '',
    logPlane: '',
    monitoringPlane: '',
    evaluationHarness: '',
    scorerConfig: '',
    shutdownMechanism: '',
    credentialScopes: [],
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
