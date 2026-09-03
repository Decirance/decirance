/**
 * Example agent assurance case.
 *
 * Published as part of the open reference set, so it is deliberately complete
 * and readable rather than minimal: it is the artefact someone evaluating the
 * schema reads first.
 *
 * The case is the Meridian Reply Agent — a back-office casework agent that
 * reads email and documents, retrieves case information, drafts responses and
 * escalates consequential actions for human approval. Its material change is
 * the one in the product brief: read-only access to customer records becomes
 * write access.
 *
 * Every `severedBy` list is a curated judgement about which configuration
 * changes break which dependency. Those judgements, not the traversal, are
 * what an expert reviewer should be asked to agree with.
 */

import type { ClaimNode, EvidenceNode, GraphEdge, ObligationMap } from './invalidation';
import type { PassportSnapshot } from './material-change';
import { passportDigest, serialisePassport } from './passport-io';
import type { AssuranceArgumentLayer } from './argument';

export const EXAMPLE_AGENT = {
  reference: 'AP-014',
  name: 'Meridian Reply Agent',
  owner: 'Ari Rios',
  businessUnit: 'Customer operations',
  environment: 'production',
} as const;

export const EXAMPLE_PASSPORT_V3: PassportSnapshot = {
  modelProvider: 'anthropic',
  modelName: 'claude-sonnet-5',
  modelVersion: '2026-04-01',
  systemPromptDigest: 'sha256:2f1a…c9',
  memoryConfig: { scope: 'case', retentionDays: 30 },
  tools: ['case.read', 'document.read', 'response.draft', 'review.request'],
  permissions: ['case:read', 'document:read', 'draft:create', 'review:request'],
  dataSources: ['case-store', 'document-store'],
  guardrails: ['pii-redaction', 'injection-filter'],
  identityBinding: { principal: 'svc-meridian-reply', scope: 'case-owner' },
  autonomyLevel: 'assisted',
  humanReviewWorkflow: { externalSend: 'required', caseUpdate: 'required' },
  deploymentEnvironment: 'uk-south-prod',
  thirdPartyDependencies: ['retrieval-svc', 'model-api'],
  recoveryObjectives: { rto: '30m', rpo: '5m' },
  providerPlan: 'enterprise',
  accountBinding: 'org:meridian-council',
  dataProcessingTerms: { promptRetention: 'none', trainingUse: 'prohibited' },
  dataResidency: 'uk',
  entitlementExpiry: '2027-03-31',
  mcpServers: ['mcp:case-store@1.2'],
  memoryWritePolicy: { writers: ['agent'], retention: '30d', rollback: 'enabled' },
  modelArtifactDigest: 'sha256:4c1e…7b',
  indexContentSources: ['internal:policy-library'],
};

/** Cyber-security change: a write permission is granted. */
export const EXAMPLE_PASSPORT_V4_CYBER: PassportSnapshot = {
  ...EXAMPLE_PASSPORT_V3,
  permissions: [...EXAMPLE_PASSPORT_V3.permissions, 'case:write'],
};

/**
 * Operational-resilience change: the retrieval provider is replaced and the
 * recovery objective relaxes. Section 7 of the brief requires the demonstrator
 * to cover both sides of Challenge 3, so both changes ship as fixtures.
 */
export const EXAMPLE_PASSPORT_V4_RESILIENCE: PassportSnapshot = {
  ...EXAMPLE_PASSPORT_V3,
  thirdPartyDependencies: ['retrieval-svc-eu', 'model-api'],
  recoveryObjectives: { rto: '4h', rpo: '1h' },
};

/**
 * Commercial change: the provider begins retaining prompts and the agreement
 * moves out of the UK. No line of the agent changed, and the assurance case is
 * still affected - which is the point of recording entitlement in the graph.
 */
export const EXAMPLE_PASSPORT_V4_LICENCE: PassportSnapshot = {
  ...EXAMPLE_PASSPORT_V3,
  dataProcessingTerms: { promptRetention: '30d', trainingUse: 'prohibited' },
  dataResidency: 'eu',
};

/**
 * Contamination change: an external SharePoint source is added to the
 * retrieval index and an unsigned MCP server is registered.
 *
 * This is the scenario worth demonstrating. It is simultaneously a cyber risk
 * (untrusted content becomes instruction), a resilience risk (a poisoned index
 * must be rebuilt), and a change no runtime alert can resolve — because the
 * question it raises is not "did something bad happen" but "is the agent still
 * operating inside what the evidence justified".
 */
export const EXAMPLE_PASSPORT_V4_POISONING: PassportSnapshot = {
  ...EXAMPLE_PASSPORT_V3,
  dataSources: [...EXAMPLE_PASSPORT_V3.dataSources, 'sharepoint-external'],
  indexContentSources: [...EXAMPLE_PASSPORT_V3.indexContentSources, 'external:supplier-sharepoint'],
  mcpServers: [...EXAMPLE_PASSPORT_V3.mcpServers, 'mcp:supplier-lookup@0.4'],
};

/**
 * Real digests, computed from the passports themselves.
 *
 * These were placeholder strings ("passport:v3"), which quietly undermined the
 * central structural claim: that evidence is bound to the configuration it was
 * collected against. A label is not a binding — anyone can write "passport:v3"
 * next to evidence collected against something else. A canonical SHA-256 over
 * the actual document cannot be written by hand.
 */
const digestFor = (snapshot: PassportSnapshot, version: string): string =>
  passportDigest(serialisePassport(snapshot, {
    agentId: 'agt_meridian_reply',
    agentVersion: version,
    owner: EXAMPLE_AGENT.owner,
    purpose: 'Triage inbound casework and draft responses for human review.',
  }));

export const EXAMPLE_PASSPORT_HASHES = {
  v3: digestFor(EXAMPLE_PASSPORT_V3, '3.0.0'),
  v4: digestFor(EXAMPLE_PASSPORT_V4_CYBER, '4.0.0'),
} as const;

export const EXAMPLE_CLAIMS: ClaimNode[] = [
  {
    ref: 'C-01',
    statement:
      'The agent cannot alter durable customer state without a named human approver.',
    domain: 'cyber',
    critical: true,
    coversTests: ['human-approval-workflow-test'],
  },
  {
    ref: 'C-02',
    statement: 'The agent operates under least privilege for its case scope.',
    domain: 'cyber',
    critical: true,
    coversTests: ['least-privilege-review'],
  },
  {
    ref: 'C-03',
    statement: 'Retrieval is limited to the assigned case and linked history.',
    domain: 'cyber',
    critical: false,
    coversTests: ['retrieval-scope-test'],
  },
  {
    ref: 'C-04',
    statement:
      'Injected instructions in inbound documents do not cause tool misuse.',
    domain: 'cyber',
    critical: true,
    coversTests: ['injection-challenge-pack'],
  },
  {
    ref: 'C-05',
    statement: 'Every tool call and reviewer decision is auditable.',
    domain: 'cyber',
    critical: false,
    coversTests: ['audit-trail-sample'],
  },
  {
    ref: 'C-06',
    statement:
      'The agent cannot send external communication without human approval.',
    domain: 'cyber',
    critical: true,
    coversTests: ['external-send-gate-test'],
  },
  {
    ref: 'C-07',
    statement: 'Degraded retrieval does not produce unsourced drafts.',
    domain: 'resilience',
    critical: false,
    coversTests: ['failover-rehearsal'],
  },
  {
    ref: 'C-08',
    statement: 'Case state is preserved across an unplanned restart.',
    domain: 'resilience',
    critical: false,
    coversTests: ['interrupt-resume-test'],
  },
  {
    ref: 'C-10',
    statement:
      'Customer data is processed only under the approved retention and residency terms.',
    domain: 'cyber',
    critical: true,
    coversTests: ['data-processing-terms-review', 'residency-attestation'],
  },
  {
    ref: 'C-11',
    statement: 'Retrieval sources are authorised, allowlisted and traceable to an owner.',
    domain: 'cyber',
    critical: true,
    coversTests: ['retrieval-allowlist-review', 'source-provenance-check'],
  },
  {
    ref: 'C-12',
    statement: 'Untrusted retrieved content cannot become executable instruction.',
    domain: 'cyber',
    critical: true,
    coversTests: ['rag-poisoning-pack', 'indirect-injection-pack'],
  },
  {
    ref: 'C-13',
    statement: 'Agent memory has controlled writers, retention and rollback.',
    domain: 'both',
    critical: false,
    coversTests: ['memory-write-control-test', 'memory-rollback-rehearsal'],
  },
  {
    ref: 'C-14',
    statement: 'Tool and MCP server descriptions are signed or allowlisted before use.',
    domain: 'cyber',
    critical: true,
    coversTests: ['mcp-manifest-signature-check', 'tool-description-poisoning-pack'],
  },
  {
    ref: 'C-09',
    statement:
      'The service meets its recovery time objective after a dependency failure.',
    domain: 'resilience',
    critical: true,
    coversTests: ['recovery-objective-test'],
  },
];

export interface ExampleEvidenceMeta extends EvidenceNode {
  title: string;
  detail: string;
  owner: string;
  collectedAt: string;
  sourceKind: string;
  /** Quality dimensions, 0-100, recorded separately and never averaged. */
  quality: {
    provenance: number;
    coverage: number;
    constructValidity: number;
    ecologicalValidity: number;
    repeatability: number;
  };
}

export const EXAMPLE_EVIDENCE: ExampleEvidenceMeta[] = [
  {
    ref: 'E-104', title: 'Context Contract v3.2',
    detail: 'Tool allow-list, purpose boundary, case scope',
    owner: 'AI Platform', collectedAt: '2026-06-18', sourceKind: 'attestation',
    scopePassportHash: EXAMPLE_PASSPORT_HASHES.v3,
    quality: { provenance: 95, coverage: 80, constructValidity: 75, ecologicalValidity: 70, repeatability: 90 },
  },
  {
    ref: 'E-098', title: 'Replay set / customer intents',
    detail: '1,240 reviewed conversations · 94.8% pass',
    owner: 'Trust Engineering', collectedAt: '2026-06-16', sourceKind: 'inspect_eval',
    scopePassportHash: EXAMPLE_PASSPORT_HASHES.v3,
    quality: { provenance: 90, coverage: 85, constructValidity: 70, ecologicalValidity: 80, repeatability: 85 },
  },
  {
    ref: 'E-093', title: 'Reviewer gate: external send',
    detail: 'Human approval required for outbound action',
    owner: 'CX Operations', collectedAt: '2026-06-12', sourceKind: 'control_test',
    scopePassportHash: EXAMPLE_PASSPORT_HASHES.v3,
    quality: { provenance: 95, coverage: 90, constructValidity: 85, ecologicalValidity: 85, repeatability: 80 },
  },
  {
    ref: 'E-087', title: 'Injection challenge pack',
    detail: '412 adversarial prompts · 96.1% surfaced',
    owner: 'Security Assurance', collectedAt: '2026-06-09', sourceKind: 'inspect_eval',
    scopePassportHash: EXAMPLE_PASSPORT_HASHES.v3,
    quality: { provenance: 90, coverage: 70, constructValidity: 80, ecologicalValidity: 55, repeatability: 75 },
  },
  {
    ref: 'E-081', title: 'PII redaction policy',
    detail: 'Tokenize before retrieval and generation',
    owner: 'Privacy Office', collectedAt: '2026-06-05', sourceKind: 'config_snapshot',
    scopePassportHash: EXAMPLE_PASSPORT_HASHES.v3,
    quality: { provenance: 90, coverage: 75, constructValidity: 70, ecologicalValidity: 65, repeatability: 95 },
  },
  {
    ref: 'E-075', title: 'Failover rehearsal / retrieval',
    detail: '18m degraded mode · no unsourced drafts',
    owner: 'SRE', collectedAt: '2026-05-29', sourceKind: 'resilience_test',
    scopePassportHash: EXAMPLE_PASSPORT_HASHES.v3,
    quality: { provenance: 85, coverage: 65, constructValidity: 75, ecologicalValidity: 90, repeatability: 60 },
  },
  {
    ref: 'E-069', title: 'Audit trail sample',
    detail: '100% tool and reviewer events correlated',
    owner: 'Platform Ops', collectedAt: '2026-05-22', sourceKind: 'runtime_log',
    scopePassportHash: EXAMPLE_PASSPORT_HASHES.v3,
    quality: { provenance: 95, coverage: 85, constructValidity: 80, ecologicalValidity: 95, repeatability: 85 },
  },
  {
    ref: 'E-061', title: 'Case access role matrix',
    detail: 'Read-only access mapped to case owner',
    owner: 'IAM', collectedAt: '2026-05-19', sourceKind: 'config_snapshot',
    scopePassportHash: EXAMPLE_PASSPORT_HASHES.v3,
    quality: { provenance: 95, coverage: 90, constructValidity: 85, ecologicalValidity: 75, repeatability: 95 },
  },
  {
    ref: 'E-055', title: 'Interrupt / resume test',
    detail: '40 runs · state preserved across restart',
    owner: 'SRE', collectedAt: '2026-05-14', sourceKind: 'resilience_test',
    scopePassportHash: EXAMPLE_PASSPORT_HASHES.v3,
    quality: { provenance: 85, coverage: 70, constructValidity: 75, ecologicalValidity: 80, repeatability: 90 },
  },
  {
    ref: 'E-049', title: 'Recovery objective rehearsal',
    detail: 'RTO 27m against a 30m objective',
    owner: 'SRE', collectedAt: '2026-05-11', sourceKind: 'resilience_test',
    scopePassportHash: EXAMPLE_PASSPORT_HASHES.v3,
    quality: { provenance: 85, coverage: 60, constructValidity: 80, ecologicalValidity: 85, repeatability: 65 },
  },
  {
    ref: 'E-118', title: 'Enterprise agreement / data terms',
    detail: 'No prompt retention · no training use · UK residency',
    owner: 'Procurement', collectedAt: '2026-06-20', sourceKind: 'contract_attestation',
    scopePassportHash: EXAMPLE_PASSPORT_HASHES.v3,
    quality: { provenance: 95, coverage: 85, constructValidity: 90, ecologicalValidity: 80, repeatability: 95 },
  },
  {
    ref: 'E-121', title: 'Retrieval source allowlist',
    detail: 'Two internal sources · owner recorded per source',
    owner: 'AI Platform', collectedAt: '2026-06-14', sourceKind: 'config_snapshot',
    scopePassportHash: EXAMPLE_PASSPORT_HASHES.v3,
    quality: { provenance: 95, coverage: 90, constructValidity: 85, ecologicalValidity: 80, repeatability: 95 },
  },
  {
    ref: 'E-124', title: 'RAG poisoning pack',
    detail: '180 planted documents · 97.2% refused as instruction',
    owner: 'Security Assurance', collectedAt: '2026-06-17', sourceKind: 'inspect_eval',
    scopePassportHash: EXAMPLE_PASSPORT_HASHES.v3,
    quality: { provenance: 90, coverage: 75, constructValidity: 85, ecologicalValidity: 65, repeatability: 80 },
  },
  {
    ref: 'E-127', title: 'Memory write control test',
    detail: 'Only the agent identity may write · 40 rollback runs passed',
    owner: 'Platform Ops', collectedAt: '2026-06-11', sourceKind: 'control_test',
    scopePassportHash: EXAMPLE_PASSPORT_HASHES.v3,
    quality: { provenance: 90, coverage: 80, constructValidity: 80, ecologicalValidity: 75, repeatability: 90 },
  },
  {
    ref: 'E-130', title: 'MCP manifest signatures',
    detail: '1 registered server · manifest signed and pinned to 1.2',
    owner: 'AI Platform', collectedAt: '2026-06-19', sourceKind: 'attestation',
    scopePassportHash: EXAMPLE_PASSPORT_HASHES.v3,
    quality: { provenance: 95, coverage: 85, constructValidity: 90, ecologicalValidity: 85, repeatability: 95 },
  },
  {
    ref: 'E-112', title: 'Adaptive injection finding',
    detail: 'Adaptive attack reached a draft tool call in 3 of 200 runs',
    owner: 'Security Assurance', collectedAt: '2026-06-24', sourceKind: 'inspect_eval',
    scopePassportHash: EXAMPLE_PASSPORT_HASHES.v3,
    quality: { provenance: 90, coverage: 55, constructValidity: 85, ecologicalValidity: 70, repeatability: 70 },
  },
];

export const EXAMPLE_EDGES: GraphEdge[] = [
  // Least privilege rests directly on the permission set.
  { kind: 'supports', sourceRef: 'E-061', targetRef: 'C-02', severedBy: ['permission_granted', 'permission_revoked'] },
  // The human-approval gate was justified for a read-only agent.
  { kind: 'supports', sourceRef: 'E-093', targetRef: 'C-01', severedBy: ['permission_granted', 'human_oversight', 'autonomy_level'] },
  { kind: 'supports', sourceRef: 'E-093', targetRef: 'C-06', severedBy: ['human_oversight', 'tool_added'] },
  // Retrieval scope depends on data sources, not on write permissions.
  { kind: 'supports', sourceRef: 'E-098', targetRef: 'C-03', severedBy: ['data_source_added', 'retrieval_service'] },
  { kind: 'supports', sourceRef: 'E-081', targetRef: 'C-03', severedBy: ['data_source_added', 'guardrail_config'] },
  // Injection resistance depends on the model, prompt and tool surface — and
  // on *who serves the model*, which is a separate fact from which model it is.
  // A challenge pack passed against one provider's serving of a model says
  // little about another's: system-level filtering, safety scaffolding and
  // quantisation differ between hosts. Without `model_provider` here, moving
  // the same model identifier to a different provider invalidated nothing at
  // all, which was a hole rather than a judgement.
  { kind: 'supports', sourceRef: 'E-087', targetRef: 'C-04', severedBy: ['model_version', 'model_provider', 'model_artifact_digest', 'system_prompt', 'tool_added'] },
  // A contradictory result. Section 10.2: surviving support must not bury it.
  { kind: 'challenges', sourceRef: 'E-112', targetRef: 'C-04', severedBy: ['guardrail_config'] },
  { kind: 'supports', sourceRef: 'E-069', targetRef: 'C-05', severedBy: ['tool_added', 'guardrail_config'] },
  // Resilience evidence depends on environment and dependencies.
  { kind: 'supports', sourceRef: 'E-075', targetRef: 'C-07', severedBy: ['dependency_provider', 'retrieval_service'] },
  { kind: 'supports', sourceRef: 'E-055', targetRef: 'C-08', severedBy: ['deployment_environment'] },
  { kind: 'supports', sourceRef: 'E-049', targetRef: 'C-09', severedBy: ['dependency_provider', 'recovery_objective', 'third_party_dependency'] },
  { kind: 'supports', sourceRef: 'E-104', targetRef: 'C-06', severedBy: ['tool_added', 'autonomy_level'] },
  // Entitlement evidence. Severed by contractual change alone.
  { kind: 'supports', sourceRef: 'E-118', targetRef: 'C-10', severedBy: ['data_processing_terms', 'data_residency', 'provider_plan', 'account_binding', 'entitlement_expiry'] },
  { kind: 'supports', sourceRef: 'E-081', targetRef: 'C-10', severedBy: ['data_residency', 'guardrail_config'] },
  // Contamination surface. A new retrieval source severs allowlist and
  // injection-resistance evidence; an unsigned MCP server severs the tool
  // description evidence. Memory evidence survives both, which is the point.
  { kind: 'supports', sourceRef: 'E-121', targetRef: 'C-11', severedBy: ['data_source_added', 'index_content_source'] },
  { kind: 'supports', sourceRef: 'E-124', targetRef: 'C-12', severedBy: ['data_source_added', 'index_content_source', 'model_version', 'model_provider', 'model_artifact_digest', 'system_prompt'] },
  { kind: 'supports', sourceRef: 'E-127', targetRef: 'C-13', severedBy: ['memory_write_policy', 'memory_config'] },
  { kind: 'supports', sourceRef: 'E-130', targetRef: 'C-14', severedBy: ['mcp_server_added', 'mcp_server_changed', 'tool_schema_changed'] },
  { kind: 'derives_from', sourceRef: 'C-12', targetRef: 'C-11', severedBy: [] },
  // Auditability is argued from the approval gate holding.
  { kind: 'derives_from', sourceRef: 'C-05', targetRef: 'C-01', severedBy: [] },
];

/** Tests each change kind obliges, independent of existing claims. */
export const EXAMPLE_OBLIGATIONS: ObligationMap = {
  permission_granted: [
    'human-approval-workflow-test',
    'write-integrity-test',
    'rollback-recovery-test',
  ],
  third_party_dependency: [
    'dependency-failover-test',
    'degraded-mode-test',
  ],
  recovery_objective: ['recovery-objective-test', 'restore-rehearsal'],
  data_processing_terms: ['data-processing-terms-review', 'dpia-refresh'],
  index_content_source: [
    'retrieval-allowlist-review',
    'source-provenance-check',
    'rag-poisoning-pack',
    'canary-document-check',
    'index-rebuild-rehearsal',
  ],
  mcp_server_added: [
    'mcp-manifest-signature-check',
    'tool-description-poisoning-pack',
    'tool-allowlist-review',
  ],
  data_source_added: ['retrieval-scope-test', 'content-scanning-check'],
  data_residency: ['residency-attestation', 'transfer-risk-assessment'],
};

/**
 * The argument layer for the reference case.
 *
 * Deliberately partial. Four of the fourteen claims carry an explicit argument;
 * `claimsWithoutArgument` reports the rest, so the gap is visible rather than
 * implied to be complete. A reference case that pretended to a full argument
 * layer would misrepresent how much work an assurance case actually is.
 */
export const EXAMPLE_ARGUMENT_LAYER: AssuranceArgumentLayer = {
  arguments: [
    {
      ref: 'A-01',
      claimRef: 'C-01',
      warrant:
        'The agent holds no write permission, and the only route to durable change is a reviewer-gated task. With no write scope, the claim holds by construction rather than by observed behaviour.',
      inference: 'deductive',
      evidenceRefs: ['E-093', 'E-061'],
      assumptionRefs: ['AS-01', 'AS-02'],
    },
    {
      ref: 'A-04',
      claimRef: 'C-04',
      warrant:
        '412 adversarial prompts were surfaced at 96.1%. The claim is generalised from those cases to inbound documents of the same kind.',
      inference: 'inductive',
      evidenceRefs: ['E-087'],
      assumptionRefs: ['AS-03'],
    },
    {
      ref: 'A-11',
      claimRef: 'C-11',
      warrant:
        'The retrieval allowlist names two internal sources with recorded owners, and indexing configuration applies it before retrieval.',
      inference: 'deductive',
      evidenceRefs: ['E-121'],
      assumptionRefs: ['AS-04'],
    },
    {
      ref: 'A-14',
      claimRef: 'C-14',
      warrant:
        'One MCP server is registered, its manifest is signed and pinned, and the fingerprint covers tool descriptions.',
      inference: 'deductive',
      evidenceRefs: ['E-130'],
      assumptionRefs: ['AS-05'],
    },
  ],
  assumptions: [
    {
      ref: 'AS-01',
      statement: 'The reviewer gate cannot be bypassed by any tool the agent can reach.',
      status: 'holds',
      severedBy: ['tool_added', 'mcp_server_added', 'permission_granted'],
      owner: 'CX Operations',
    },
    {
      ref: 'AS-02',
      statement: 'The agent operates under an identity distinct from any human reviewer.',
      status: 'holds',
      severedBy: ['identity_binding', 'account_binding'],
      owner: 'IAM',
    },
    {
      ref: 'AS-03',
      statement:
        'Inbound documents in production resemble the adversarial corpus in kind and distribution.',
      status: 'unverified',
      severedBy: ['data_source_added', 'index_content_source'],
      owner: 'Security Assurance',
    },
    {
      ref: 'AS-04',
      statement: 'No component other than the indexer can add content to the retrieval corpus.',
      status: 'holds',
      severedBy: ['index_content_source', 'data_source_added'],
      owner: 'AI Platform',
    },
    {
      ref: 'AS-05',
      statement: 'Only the platform team can register or modify an MCP server.',
      status: 'holds',
      severedBy: ['mcp_server_added', 'mcp_server_changed', 'identity_binding'],
      owner: 'AI Platform',
    },
  ],
  defeaters: [
    {
      ref: 'D-01',
      kind: 'undercutting',
      argumentRef: 'A-04',
      statement:
        'Adaptive attacks reached a draft tool call in 3 of 200 runs. The inference from a static corpus to production does not carry against an attacker who adapts.',
      evidenceRefs: ['E-112'],
      addressed: true,
      response:
        'Accepted as residual risk RR-01 against the outbound reviewer gate and a weekly challenge pack, recorded by the accountable owner.',
    },
    {
      ref: 'D-02',
      kind: 'undermining',
      argumentRef: 'A-04',
      statement:
        'The injection pack was executed at ecological validity 55: a sandboxed environment rather than production-like.',
      evidenceRefs: ['E-087'],
      addressed: false,
    },
  ],
  residualUncertainty: [
    {
      ref: 'RU-01',
      claimRef: 'C-04',
      statement:
        'Injection techniques not represented in the corpus, and adaptive attacks beyond those tried, remain unmeasured.',
      whyItRemains:
        'No test set enumerates future attacks. The claim is bounded by what was tried, and the compensating control is the reviewer gate rather than the filter.',
      acceptedBy: EXAMPLE_AGENT.owner,
    },
    {
      ref: 'RU-02',
      claimRef: 'C-01',
      statement:
        'The claim holds while no write permission exists. It says nothing about behaviour if one is granted.',
      whyItRemains:
        'A deductive argument from configuration is only as durable as the configuration. This is why the permit is bound to a passport digest.',
      acceptedBy: EXAMPLE_AGENT.owner,
    },
  ],
};
