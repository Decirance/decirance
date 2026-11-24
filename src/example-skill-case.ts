// SPDX-License-Identifier: Apache-2.0
/**
 * A worked assurance case whose claims are about a skill.
 *
 * `skill-io` proved the mechanism: a `SKILL.md` can be read as an Agent
 * Passport and the delta engine will say what a change to it costs. But the
 * only graph available to run it against was the Meridian reference case,
 * whose claims are about a council casework agent — so the demonstration
 * printed sentences like "the agent cannot alter durable customer state"
 * against a release-checking skill that has no customers and no state. The
 * arithmetic was real and every claim name was the wrong case.
 *
 * This is the missing half: twelve claims about what a skill definition is
 * actually relied upon to guarantee, the evidence a team would hold for each,
 * and the edges that say which configuration change severs which support.
 *
 * Three things are deliberate.
 *
 * **The claims are about the skill as deployed, not about the file.** "No
 * tool outside the reviewed allow-list can be invoked" is a claim about a
 * running configuration; the file is one input to it. This is why the case
 * needs an owner and an environment that the file cannot supply, and why the
 * same `SKILL.md` deployed to a CI runner and to a laptop is two cases.
 *
 * **Every hash here is derived, never written down.** Evidence is in scope
 * only against a passport digest, and a digest typed into a fixture is a
 * digest that silently stops matching the configuration it names. These are
 * computed from the skill sources below at load, and the module refuses to
 * load if the translation fails.
 *
 * **One piece of evidence contradicts a claim.** SE-12 is a dry-run log in
 * which the model summarised a failing check as "mostly passing". A case made
 * only of supporting artefacts teaches the wrong lesson: that assurance is
 * collecting passes. The engine reports a contradiction separately and never
 * nets it off against the volume of support, and an example with nothing to
 * net off would never show that.
 */

import { passportDigest } from './passport-io';
import { parseSkill, skillToPassport, type SkillDeploymentContext } from './skill-io';
import { exampleShift, shiftExampleDate } from './example-timeline';
import type { ClaimNode, EvidenceNode, GraphEdge } from './invalidation';
import type { ObligationMap } from './invalidation';

/**
 * Fixed, because it is inside the passport digest.
 *
 * Taken from the clock, every regeneration would publish a different digest
 * for an identical skill, and the evidence receipts below — which name that
 * digest as the configuration they were collected against — would all go out
 * of scope once a day.
 */
export const SKILL_CASE_CREATED_AT = '2026-09-03T00:00:00.000Z';

/** The deployment facts the file cannot carry. Supplied, as they must be. */
export const SKILL_CASE_CONTEXT: SkillDeploymentContext = {
  owner: 'Ari Rios, Release Engineering Lead',
  environment: 'developer workstations and the shared CI runner',
  agentVersion: '1.0.0',
  agentId: 'release-check',
  createdAt: SKILL_CASE_CREATED_AT,
};

/**
 * The assessed skill.
 *
 * A read-only verifier: it runs the test suite, reads the result and reports
 * it. That is what the twelve claims below were established against.
 */
export const SKILL_SOURCE_V1 = [
  '---',
  'name: release-check',
  'description: Verify a release candidate before deployment.',
  'allowed-tools: Read, Grep, Glob, Bash(npm test:*)',
  'model: claude-sonnet-5-5',
  'disable-model-invocation: true',
  '---',
  '',
  '# Release Check',
  '',
  'Run the test suite and record the exact output. Report the failures you',
  'find and stop. Do not fix them, and do not deploy anything.',
  '',
].join('\n');

/**
 * The same skill, three months later.
 *
 * Nobody set out to change the system's risk profile. Somebody wanted the
 * skill to finish the job it had been reporting on, so they added the push
 * permission, a fetch for the release notes and the deploy server's promote
 * tool, and moved to a stronger model because the summaries were thin.
 *
 * Every one of those edits is defensible on its own. Together they turn a
 * read-only checker into a deployment actor, which is a different system from
 * the one the case assesses — and that is the judgement a text diff cannot
 * reach and this one can.
 */
export const SKILL_SOURCE_V2 = [
  '---',
  'name: release-check',
  'description: Verify a release candidate, and promote it when the checks pass.',
  'allowed-tools: Read, Grep, Glob, Bash(npm test:*), Bash(git push:*), WebFetch, mcp__deploy__promote',
  'model: claude-opus-5',
  'disable-model-invocation: true',
  '---',
  '',
  '# Release Check',
  '',
  'Run the test suite and record the exact output. Fetch the release notes for',
  'the candidate. If every check passes, push the release tag and promote the',
  'build. If anything fails, report it and stop.',
  '',
].join('\n');

/** Fail closed at load: a fixture that cannot be translated must not load. */
function passportFor(source: string, version: string) {
  const parsed = parseSkill(source);
  if (!parsed.ok) {
    throw new Error(
      `example-skill-case: the v${version} skill source does not parse: `
      + parsed.errors.map((e) => `${e.line}: ${e.message}`).join('; '),
    );
  }
  const translated = skillToPassport(parsed.skill, { ...SKILL_CASE_CONTEXT, agentVersion: version });
  if (!translated.ok) {
    throw new Error(
      `example-skill-case: the v${version} skill cannot be translated: ${translated.missing.join('; ')}`,
    );
  }
  return translated.document;
}

export const SKILL_PASSPORT_V1 = passportFor(SKILL_SOURCE_V1, '1.0.0');
export const SKILL_PASSPORT_V2 = passportFor(SKILL_SOURCE_V2, '2.0.0');

export const SKILL_PASSPORT_HASHES = {
  v1: passportDigest(SKILL_PASSPORT_V1),
  v2: passportDigest(SKILL_PASSPORT_V2),
} as const;

/**
 * What the skill is relied upon to guarantee.
 *
 * Each statement is one a release engineer would recognise as a reason the
 * skill was allowed near a production repository. None of them is written in
 * the skill file, which is the point: the file is the configuration, and these
 * are the claims that configuration was approved on the strength of.
 */
export const SKILL_CLAIMS: ClaimNode[] = [
  {
    ref: 'SK-01',
    statement:
      'The skill can invoke no tool outside the allow-list that was reviewed.',
    domain: 'cyber',
    critical: true,
    coversTests: ['tool-allowlist-review', 'skill-tool-inventory-check'],
  },
  {
    ref: 'SK-02',
    statement:
      'The skill cannot write to a source repository or a deployment target.',
    domain: 'cyber',
    critical: true,
    coversTests: ['write-attempt-refusal-test', 'least-privilege-review'],
  },
  {
    ref: 'SK-03',
    statement:
      'The skill cannot reach the network, so no retrieved content can enter its context.',
    domain: 'cyber',
    critical: true,
    coversTests: ['egress-containment-test'],
  },
  {
    ref: 'SK-04',
    // A skill's tool descriptions are read by the model as instruction. An
    // unsigned MCP manifest is therefore an injection surface, not a
    // dependency detail, and it is assessed apart from the tool inventory.
    statement:
      'Every tool description the model reads as instruction comes from a reviewed, signed source.',
    domain: 'cyber',
    critical: false,
    coversTests: ['mcp-manifest-signature-check', 'tool-description-poisoning-pack'],
  },
  {
    ref: 'SK-05',
    statement: 'The skill runs only when a person invokes it.',
    domain: 'both',
    critical: true,
    coversTests: ['invocation-trigger-review', 'unprompted-invocation-scan'],
  },
  {
    ref: 'SK-06',
    statement:
      'The instructions the skill supplies to the model are the instructions that were reviewed.',
    domain: 'cyber',
    critical: true,
    coversTests: ['prompt-digest-attestation'],
  },
  {
    ref: 'SK-07',
    statement:
      'The behaviour observed in testing is the behaviour the configured model produces.',
    domain: 'both',
    critical: false,
    coversTests: ['behaviour-regression-pack'],
  },
  {
    ref: 'SK-08',
    // The claim about the assurance process rather than about the skill.
    // Without it the case can be fully supported by test records the skill
    // itself was able to write.
    statement:
      'No command the skill runs can alter the record of what the tests reported.',
    domain: 'cyber',
    critical: true,
    coversTests: ['record-integrity-test', 'log-plane-attestation'],
  },
  {
    ref: 'SK-09',
    statement:
      'A failing check stops the release rather than being reported as a pass.',
    domain: 'resilience',
    critical: false,
    coversTests: ['failing-check-escalation-pack'],
  },
  {
    ref: 'SK-10',
    statement:
      'Credentials reachable in the skill’s shell cannot authorise action beyond the repository under test.',
    domain: 'cyber',
    critical: true,
    coversTests: ['credential-scope-review', 'token-lifetime-check'],
  },
  {
    ref: 'SK-11',
    statement:
      'Anything the skill changes can be reversed by a person without the skill’s help.',
    domain: 'resilience',
    critical: false,
    coversTests: ['rollback-recovery-test', 'shutdown-drill'],
  },
  {
    ref: 'SK-12',
    statement:
      'The skill’s effects are confined to the environment it was approved for.',
    domain: 'both',
    critical: true,
    coversTests: ['environment-confinement-review'],
  },
];

const SHIFT = exampleShift();
/*
 * A full timestamp, not a day.
 *
 * `shiftExampleDay` returns `YYYY-MM-DD`, which the evidence manifest schema
 * rejects as a `date-time` and which quietly discards the hour an artefact was
 * collected. For a runtime log that is part of the receipt: two captures on the
 * same day against the same configuration are distinguished by nothing else.
 */
const day = (authored: string) => shiftExampleDate(authored, SHIFT).toISOString();

/**
 * The artefacts. Every receipt names the v1 passport, because that is the
 * configuration they were collected against.
 *
 * `quality` is five separate numbers and is never averaged. SE-02 is the
 * illustrative case: a refusal test has excellent provenance and repeatability
 * and poor coverage, because it proves the forty prompts tried were refused
 * and says nothing about the forty-first. An average would hide exactly the
 * dimension a reviewer needs.
 */
export const SKILL_EVIDENCE_MANIFEST = [
  {
    ref: 'SE-01',
    title: 'Skill tool inventory, release-check v1.0.0',
    detail: 'Allow-list parsed from frontmatter and compared with the approved list',
    source_kind: 'config_snapshot',
    domain: 'cyber' as const,
    state: 'verified' as const,
    scope_passport_digest: SKILL_PASSPORT_HASHES.v1,
    collected_at: day('2026-08-19T09:40:00.000Z'),
    collected_by: 'Release Engineering',
    quality: { provenance: 95, coverage: 90, construct_validity: 85, ecological_validity: 80, repeatability: 95 },
  },
  {
    ref: 'SE-02',
    title: 'Write-attempt refusal run, 40 prompts',
    detail: 'Prompts instructing the skill to commit, push, tag or deploy; all refused',
    source_kind: 'control_test',
    domain: 'cyber' as const,
    state: 'verified' as const,
    scope_passport_digest: SKILL_PASSPORT_HASHES.v1,
    collected_at: day('2026-08-20T14:10:00.000Z'),
    collected_by: 'Release Engineering',
    quality: { provenance: 95, coverage: 45, construct_validity: 80, ecological_validity: 75, repeatability: 90 },
  },
  {
    ref: 'SE-03',
    title: 'Egress capture across 20 skill runs',
    detail: 'No outbound connection observed from the skill process',
    source_kind: 'runtime_log',
    domain: 'cyber' as const,
    state: 'verified' as const,
    scope_passport_digest: SKILL_PASSPORT_HASHES.v1,
    collected_at: day('2026-08-21T11:00:00.000Z'),
    collected_by: 'Platform Security',
    quality: { provenance: 90, coverage: 70, construct_validity: 85, ecological_validity: 85, repeatability: 80 },
  },
  {
    ref: 'SE-04',
    title: 'MCP server registry extract',
    detail: 'No MCP server is declared, so no unsigned tool description reaches the model',
    source_kind: 'config_snapshot',
    domain: 'cyber' as const,
    state: 'verified' as const,
    scope_passport_digest: SKILL_PASSPORT_HASHES.v1,
    collected_at: day('2026-08-19T09:45:00.000Z'),
    collected_by: 'Release Engineering',
    quality: { provenance: 95, coverage: 95, construct_validity: 70, ecological_validity: 65, repeatability: 95 },
  },
  {
    ref: 'SE-05',
    title: 'Invocation trigger review',
    detail: 'disable-model-invocation is set, so the model cannot start the skill unprompted',
    source_kind: 'attestation',
    domain: 'both' as const,
    state: 'verified' as const,
    scope_passport_digest: SKILL_PASSPORT_HASHES.v1,
    collected_at: day('2026-08-22T10:20:00.000Z'),
    collected_by: 'Ari Rios, Release Engineering Lead',
    quality: { provenance: 85, coverage: 80, construct_validity: 75, ecological_validity: 70, repeatability: 90 },
  },
  {
    ref: 'SE-06',
    title: 'Instruction digest attestation',
    detail: 'Digest of the reviewed skill body, countersigned at review',
    source_kind: 'contract_attestation',
    domain: 'cyber' as const,
    state: 'verified' as const,
    scope_passport_digest: SKILL_PASSPORT_HASHES.v1,
    collected_at: day('2026-08-22T10:25:00.000Z'),
    collected_by: 'Ari Rios, Release Engineering Lead',
    quality: { provenance: 100, coverage: 60, construct_validity: 80, ecological_validity: 60, repeatability: 100 },
  },
  {
    ref: 'SE-07',
    title: 'Behaviour regression pack on claude-sonnet-5-5',
    detail: '120 release-check transcripts scored against the expected report shape',
    source_kind: 'inspect_eval',
    domain: 'both' as const,
    state: 'verified' as const,
    scope_passport_digest: SKILL_PASSPORT_HASHES.v1,
    collected_at: day('2026-08-25T16:30:00.000Z'),
    collected_by: 'AI Platform',
    quality: { provenance: 90, coverage: 75, construct_validity: 70, ecological_validity: 65, repeatability: 60 },
  },
  {
    ref: 'SE-08',
    title: 'CI record integrity test',
    detail: 'Test output is written by the runner to a store the skill holds no credential for',
    source_kind: 'control_test',
    domain: 'cyber' as const,
    state: 'verified' as const,
    scope_passport_digest: SKILL_PASSPORT_HASHES.v1,
    collected_at: day('2026-08-26T09:15:00.000Z'),
    collected_by: 'Platform Security',
    quality: { provenance: 95, coverage: 80, construct_validity: 90, ecological_validity: 85, repeatability: 90 },
  },
  {
    ref: 'SE-09',
    title: 'Shell credential scope review',
    detail: 'Tokens present in the skill’s shell are read-scoped to the repository under test',
    source_kind: 'attestation',
    domain: 'cyber' as const,
    state: 'verified' as const,
    scope_passport_digest: SKILL_PASSPORT_HASHES.v1,
    collected_at: day('2026-08-26T13:50:00.000Z'),
    collected_by: 'Platform Security',
    quality: { provenance: 90, coverage: 70, construct_validity: 85, ecological_validity: 75, repeatability: 85 },
  },
  {
    ref: 'SE-10',
    title: 'Reversibility review',
    detail: 'The skill makes no durable change, so there is nothing to roll back',
    source_kind: 'attestation',
    domain: 'resilience' as const,
    state: 'verified' as const,
    scope_passport_digest: SKILL_PASSPORT_HASHES.v1,
    collected_at: day('2026-08-27T11:05:00.000Z'),
    collected_by: 'Release Engineering',
    quality: { provenance: 85, coverage: 90, construct_validity: 80, ecological_validity: 70, repeatability: 90 },
  },
  {
    ref: 'SE-11',
    title: 'Environment confinement review',
    detail: 'Skill runs on developer workstations and the CI runner only; no production credential is present',
    source_kind: 'attestation',
    domain: 'both' as const,
    state: 'verified' as const,
    scope_passport_digest: SKILL_PASSPORT_HASHES.v1,
    collected_at: day('2026-08-27T11:20:00.000Z'),
    collected_by: 'Ari Rios, Release Engineering Lead',
    quality: { provenance: 85, coverage: 75, construct_validity: 80, ecological_validity: 80, repeatability: 85 },
  },
  {
    ref: 'SE-12',
    // The contradiction. Kept in the published example because a case made
    // only of passes teaches that assurance is collecting passes.
    title: 'Dry-run log: failing check summarised as passing',
    detail:
      'In 1 of 12 runs the skill reported "tests mostly passing" with two suites failing; '
      + 'the instruction to stop on failure did not hold',
    source_kind: 'runtime_log',
    domain: 'resilience' as const,
    state: 'verified' as const,
    scope_passport_digest: SKILL_PASSPORT_HASHES.v1,
    collected_at: day('2026-08-28T15:40:00.000Z'),
    collected_by: 'Release Engineering',
    quality: { provenance: 90, coverage: 55, construct_validity: 85, ecological_validity: 90, repeatability: 50 },
  },
];

/** The graph's evidence nodes, derived from the manifest rather than restated. */
export const SKILL_EVIDENCE: EvidenceNode[] = SKILL_EVIDENCE_MANIFEST.map((e) => ({
  ref: e.ref,
  scopePassportHash: e.scope_passport_digest,
}));

/**
 * Which change severs which support.
 *
 * `severedBy` is the whole judgement of the case, and each entry answers one
 * question: if this changed, would the artefact still be about the system we
 * now have? SE-03's egress capture is severed by `tool_added` as well as by
 * `network_egress`, because a capture showing no outbound traffic from a skill
 * with no network tool says nothing about the same skill once it holds one.
 */
export const SKILL_EDGES: GraphEdge[] = [
  { kind: 'supports', sourceRef: 'SE-01', targetRef: 'SK-01', severedBy: ['tool_added', 'tool_removed', 'mcp_server_added'] },
  { kind: 'supports', sourceRef: 'SE-02', targetRef: 'SK-02', severedBy: ['permission_granted', 'tool_added'] },
  { kind: 'supports', sourceRef: 'SE-03', targetRef: 'SK-03', severedBy: ['network_egress', 'permitted_destination', 'tool_added'] },
  { kind: 'supports', sourceRef: 'SE-04', targetRef: 'SK-04', severedBy: ['mcp_server_added', 'mcp_server_changed'] },
  { kind: 'supports', sourceRef: 'SE-05', targetRef: 'SK-05', severedBy: ['autonomy_level', 'human_oversight'] },
  { kind: 'supports', sourceRef: 'SE-06', targetRef: 'SK-06', severedBy: ['system_prompt'] },
  // The instruction digest also supports the stop-on-failure claim, because
  // the instruction to stop is in the body it attests to. One artefact, two
  // claims, severed by the same change — and a third claim it does not touch.
  { kind: 'supports', sourceRef: 'SE-06', targetRef: 'SK-09', severedBy: ['system_prompt'] },
  { kind: 'supports', sourceRef: 'SE-07', targetRef: 'SK-07', severedBy: ['model_version', 'model_provider', 'model_artifact_digest'] },
  { kind: 'supports', sourceRef: 'SE-07', targetRef: 'SK-09', severedBy: ['model_version', 'system_prompt', 'scorer_config'] },
  { kind: 'supports', sourceRef: 'SE-08', targetRef: 'SK-08', severedBy: ['permission_granted', 'logging_destination', 'shared_storage'] },
  { kind: 'supports', sourceRef: 'SE-09', targetRef: 'SK-10', severedBy: ['credential_scope', 'permission_granted'] },
  { kind: 'supports', sourceRef: 'SE-10', targetRef: 'SK-11', severedBy: ['permission_granted', 'tool_added', 'shutdown_mechanism'] },
  { kind: 'supports', sourceRef: 'SE-11', targetRef: 'SK-12', severedBy: ['deployment_environment', 'permitted_destination', 'tool_added'] },
  // A contradiction is severed too. A dry run of the old instructions does not
  // contradict a claim about the new ones — it has to be re-run, which is a
  // different statement from "the objection went away".
  { kind: 'challenges', sourceRef: 'SE-12', targetRef: 'SK-09', severedBy: ['system_prompt', 'model_version'] },
];

/**
 * Tests each change kind obliges.
 *
 * The delta subtracts what the graph already covers from this, so what gets
 * printed as a new obligation is work no existing claim is watching. That is
 * the output nobody produces by hand: not "retest everything", and not "it is
 * probably fine", but the specific gap a change opened.
 */
export const SKILL_OBLIGATIONS: ObligationMap = {
  tool_added: [
    'tool-allowlist-review',
    'skill-tool-inventory-check',
    // A tool that promotes a build raises a question no read-only claim asks:
    // who authorised this particular release.
    'consequential-action-approval-test',
  ],
  tool_removed: ['skill-tool-inventory-check'],
  tool_schema_changed: ['tool-allowlist-review'],
  permission_granted: [
    'least-privilege-review',
    'write-attempt-refusal-test',
    'rollback-recovery-test',
    'record-integrity-test',
    // No claim in this case covers these two, and none could have: both are
    // questions about writing, and the assessed skill could not write. They
    // are the work the change created rather than work it invalidated, which
    // is the distinction the delta exists to draw.
    'write-integrity-test',
    'partial-write-recovery-test',
  ],
  permission_revoked: ['least-privilege-review'],
  mcp_server_added: [
    'mcp-manifest-signature-check',
    'tool-description-poisoning-pack',
    'tool-allowlist-review',
  ],
  mcp_server_changed: ['mcp-manifest-signature-check', 'tool-description-poisoning-pack'],
  network_egress: ['egress-containment-test'],
  permitted_destination: ['egress-containment-test', 'environment-confinement-review'],
  system_prompt: ['prompt-digest-attestation', 'failing-check-escalation-pack'],
  model_version: ['behaviour-regression-pack', 'failing-check-escalation-pack'],
  model_provider: ['behaviour-regression-pack'],
  autonomy_level: ['invocation-trigger-review', 'unprompted-invocation-scan'],
  human_oversight: ['invocation-trigger-review'],
  credential_scope: ['credential-scope-review', 'token-lifetime-check'],
  shutdown_mechanism: ['shutdown-drill', 'rollback-recovery-test'],
  logging_destination: ['log-plane-attestation', 'record-integrity-test'],
  shared_storage: ['record-integrity-test'],
  deployment_environment: ['environment-confinement-review'],
  scorer_config: ['failing-check-escalation-pack'],
  safety_classifier: ['failing-check-escalation-pack'],
};

export const SKILL_CASE_ID = 'case_release_check_skill_v1';
