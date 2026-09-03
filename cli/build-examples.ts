// SPDX-License-Identifier: Apache-2.0
/**
 * Generate the reference assessment files from the engine.
 *
 * The example is generated rather than hand-maintained so it cannot drift from
 * the code. If the engine changes what a delta concludes, the published example
 * changes with it and the diff shows exactly what moved — which is the only way
 * a reference assessment stays trustworthy over time.
 *
 * Run: npm run build:examples
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkContextCompatibility,
  computeDelta,
  deriveClaimState,
  diffPassports,
  passportDigest,
  reassessmentPlan,
  recommend,
  serialiseContextContract,
  serialisePassport,
  stateAfterMaterialChange,
  EXAMPLE_AGENT,
  EXAMPLE_CLAIMS,
  EXAMPLE_CONTEXT_CONTRACT,
  EXAMPLE_EDGES,
  EXAMPLE_EVIDENCE,
  EXAMPLE_HAZARDS,
  EXAMPLE_MCP_SERVERS,
  EXAMPLE_OBLIGATIONS,
  EXAMPLE_PASSPORT_HASHES,
  EXAMPLE_PASSPORT_V3,
  EXAMPLE_PASSPORT_V4_CYBER,
  EXAMPLE_PASSPORT_V4_LICENCE,
  EXAMPLE_PASSPORT_V4_POISONING,
  EXAMPLE_PASSPORT_V4_RESILIENCE,
  EXAMPLE_SCENARIOS,
  type PassportSnapshot,
} from '../src/index.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const exampleDir = join(root, 'examples', 'meridian-reply-agent');
const deltaDir = join(exampleDir, 'deltas');
const threatDir = join(root, 'threat-library');

const write = (path: string, value: unknown) => {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  console.log(`  ${path.replace(root, '.')}`);
};

const passportDoc = serialisePassport(EXAMPLE_PASSPORT_V3, {
  agentId: 'agt_meridian_reply',
  agentVersion: '3.0.0',
  owner: EXAMPLE_AGENT.owner,
  purpose: 'Triage inbound casework and draft responses for human review.',
});
const contractDoc = serialiseContextContract(EXAMPLE_CONTEXT_CONTRACT, {
  contractId: 'ctx_meridian_casework',
  contractVersion: '3.2.0',
  owner: EXAMPLE_AGENT.owner,
});
const passportHash = passportDigest(passportDoc);

const evidenceRefsFor = (claimRef: string) => ({
  supports: EXAMPLE_EDGES.filter((e) => e.kind === 'supports' && e.targetRef === claimRef).map((e) => e.sourceRef),
  challenges: EXAMPLE_EDGES.filter((e) => e.kind === 'challenges' && e.targetRef === claimRef).map((e) => e.sourceRef),
});

function runScenario(name: string, to: PassportSnapshot, label: string) {
  const diff = diffPassports(EXAMPLE_PASSPORT_V3, to);
  const result = computeDelta({
    claims: EXAMPLE_CLAIMS,
    evidence: EXAMPLE_EVIDENCE.map((e) => ({ ref: e.ref, scopePassportHash: e.scopePassportHash })),
    edges: EXAMPLE_EDGES,
    changes: diff.changes,
    unclassifiedFields: diff.unclassified.map((u) => u.field),
    obligations: EXAMPLE_OBLIGATIONS,
    currentPassportHash: EXAMPLE_PASSPORT_HASHES.v4,
  });
  const compatibility = checkContextCompatibility(to, EXAMPLE_CONTEXT_CONTRACT);
  const decision = recommend({
    claims: result.outcomes.map((o) => ({
      ref: o.claimRef,
      critical: o.critical,
      // C-04 is contradicted by E-112, an adaptive-injection finding that
      // reached a draft tool call in 3 of 200 runs. The organisation accepted
      // that residual risk against two compensating controls — the reviewer
      // gate on outbound action, and a weekly injection challenge pack — and
      // recorded the acceptance. Without this the case is internally
      // inconsistent: rule R2 would cap every scenario at reject while the
      // permit sits active, and a reference assessment that contradicts itself
      // teaches the wrong thing.
      mitigationAccepted: o.claimRef === 'C-04',
      state: deriveClaimState({
        supportingEvidence: o.preservedEvidenceRefs.length,
        challengingEvidence: o.challengingEvidenceRefs.length,
        invalidatedEvidence: o.invalidatedEvidenceRefs.length,
      }),
    })),
    delta: result,
    redLines: compatibility.redLines,
    residualRisks: [
      { ref: 'RR-01', material: true, accepted: true, acceptedBy: EXAMPLE_AGENT.owner },
      { ref: 'RR-02', material: true, accepted: true, acceptedBy: EXAMPLE_AGENT.owner },
    ],
  });
  const permitMove = stateAfterMaterialChange({
    current: 'active',
    invalidatedCriticalClaims: result.outcomes.filter((o) => o.critical && o.impact === 'invalidated').length,
    invalidatedClaims: result.summary.invalidated,
  });

  write(join(deltaDir, `${name}.json`), {
    scenario: label,
    detected_changes: diff.changes,
    unclassified: diff.unclassified,
    context_compatibility: compatibility.findings,
    claim_impacts: result.outcomes,
    new_obligations: result.newObligations,
    minimum_reassessment: reassessmentPlan(result).map((o) => ({ claim: o.claimRef, tests: o.requiredTests })),
    summary: result.summary,
    recommendation: {
      outcome: decision.recommendation,
      rationale: decision.rationale,
      binding_rule: decision.bindingRule?.rule ?? null,
      rules_fired: decision.firedRules,
    },
    permit_impact: permitMove ?? { to: 'active', rationale: 'No claim was invalidated; the permit stands.' },
  });
  return { name, summary: result.summary, recommendation: decision.recommendation };
}

function main(): void {
  mkdirSync(deltaDir, { recursive: true });
  mkdirSync(threatDir, { recursive: true });

  console.log('\nBuilding reference assessment');
  console.log('='.repeat(72));

  write(join(exampleDir, 'agent-passport.json'), { ...passportDoc, digest: passportHash });
  write(join(exampleDir, 'context-contract.json'), contractDoc);

  write(join(exampleDir, 'evidence-manifest.json'), {
    schema_version: '0.1.0',
    case_id: 'case_meridian_v1',
    evidence: EXAMPLE_EVIDENCE.map((e) => ({
      ref: e.ref,
      title: e.title,
      detail: e.detail,
      source_kind: e.sourceKind,
      scope_passport_digest: e.scopePassportHash,
      scope_contract_digest: 'contract:v3.2',
      collected_at: new Date(e.collectedAt).toISOString(),
      collected_by: e.owner,
      quality: {
        provenance: e.quality.provenance,
        coverage: e.quality.coverage,
        construct_validity: e.quality.constructValidity,
        ecological_validity: e.quality.ecologicalValidity,
        repeatability: e.quality.repeatability,
      },
    })),
  });

  write(join(exampleDir, 'assurance-graph.json'), {
    schema_version: '0.1.0',
    case_id: 'case_meridian_v1',
    claims: EXAMPLE_CLAIMS.map((c) => ({ ...c, evidence: evidenceRefsFor(c.ref) })),
    edges: EXAMPLE_EDGES,
    mcp_servers: EXAMPLE_MCP_SERVERS,
  });

  write(join(exampleDir, 'deployment-permit.json'), {
    schema_version: '0.1.0',
    permit_id: 'DP-2026-014',
    permit_version: 1,
    agent_id: 'agt_meridian_reply',
    agent_version: '3.0.0',
    context_version: '3.2.0',
    passport_digest: passportHash,
    state: 'active',
    level: 'conditional',
    permitted_actions: EXAMPLE_CONTEXT_CONTRACT.permittedActions,
    prohibited_actions: EXAMPLE_CONTEXT_CONTRACT.prohibitedActions,
    conditions: [
      'Human approval before any external send',
      'Read-only case retrieval only',
      'Weekly injection challenge pack',
    ],
    residual_risks: ['RR-02 — incorrect draft may influence a reviewer'],
    suspension_triggers: [
      'permission_granted', 'tool_added', 'human_oversight', 'model_version',
      'dependency_provider', 'data_processing_terms', 'data_residency',
      'mcp_server_added', 'index_content_source',
    ],
    valid_from: '2026-06-18T00:00:00.000Z',
    expires_at: '2026-09-30T23:59:59.000Z',
    accountable_owner: EXAMPLE_AGENT.owner,
    approved_by: EXAMPLE_AGENT.owner,
    approved_at: '2026-06-18T11:05:00.000Z',
    attestation: { cryptographically_signed: false },
  });

  write(join(threatDir, 'hazards.json'), { schema_version: '0.1.0', hazards: EXAMPLE_HAZARDS });
  write(join(threatDir, 'scenarios.json'), { schema_version: '0.1.0', scenarios: EXAMPLE_SCENARIOS });

  const results = [
    runScenario('cyber-write-permission', EXAMPLE_PASSPORT_V4_CYBER, 'Cyber-security change — write permission granted'),
    runScenario('resilience-provider-change', EXAMPLE_PASSPORT_V4_RESILIENCE, 'Operational-resilience change — retrieval provider and recovery objective'),
    runScenario('commercial-terms-change', EXAMPLE_PASSPORT_V4_LICENCE, 'Commercial change — retention terms and data residency'),
    runScenario('contamination-mcp-rag', EXAMPLE_PASSPORT_V4_POISONING, 'Contamination change — external retrieval source and unsigned MCP server'),
  ];

  console.log('\nScenario results');
  for (const r of results) {
    console.log(`  ${r.name.padEnd(28)} preserved ${r.summary.preserved}  invalidated ${r.summary.invalidated}  ${r.recommendation}`);
  }
  console.log('');
}

main();
