/**
 * Hazards and test scenarios, mapped to NCSC agentic-AI guidance themes.
 *
 * Two reasons this is data in the open package rather than content in the app.
 *
 * First, a UK assessor's first question about any assurance claim is "against
 * what?" — an assurance case that cites nothing external is one organisation's
 * opinion. Naming the guidance theme each hazard answers turns the graph into
 * something a reviewer can check against a published document.
 *
 * Second, sector scenario packs are the commercial line. If packs are data
 * with a stable shape, a finance or health pack is content someone can author;
 * if they are code, every pack is an engineering project.
 *
 * The theme list follows NCSC "Managing the cyber risk of agentic AI" and the
 * UK AI Cyber Security Code of Practice. Themes are recorded as identifiers
 * rather than quoted text so the pack does not go stale when wording changes.
 */

import type { AssuranceDomain } from './material-change';

export type NcscTheme =
  | 'threat_modelling'
  | 'deterministic_safeguards'
  | 'gated_approvals'
  | 'human_oversight'
  | 'proportional_autonomy'
  | 'explicit_red_lines'
  | 'sandboxing'
  | 'unique_agent_identity'
  | 'least_privilege_credentials'
  | 'telemetry'
  | 'immutable_logs'
  | 'incident_response'
  | 'emergency_shutdown'
  | 'supply_chain_integrity';

export const NCSC_THEME_LABEL: Record<NcscTheme, string> = {
  threat_modelling: 'Threat modelling',
  deterministic_safeguards: 'Deterministic safeguards',
  gated_approvals: 'Gated approvals',
  human_oversight: 'Human oversight',
  proportional_autonomy: 'Proportional autonomy',
  explicit_red_lines: 'Explicit red lines',
  sandboxing: 'Sandboxing',
  unique_agent_identity: 'Unique agent identity',
  least_privilege_credentials: 'Least-privilege, short-lived credentials',
  telemetry: 'Near-real-time telemetry',
  immutable_logs: 'Immutable logs',
  incident_response: 'Incident response',
  emergency_shutdown: 'Emergency shutdown',
  supply_chain_integrity: 'Supply-chain integrity',
};

export type Severity = 'low' | 'moderate' | 'high' | 'critical';

export interface Hazard {
  ref: string;
  title: string;
  description: string;
  domain: AssuranceDomain;
  severity: Severity;
  themes: NcscTheme[];
  /** Claims that address this hazard. */
  addressedBy: string[];
}

export interface Scenario {
  ref: string;
  title: string;
  hazardRef: string;
  domain: AssuranceDomain;
  /** Identifier of the executable test, e.g. an Inspect task. */
  method: string;
  /** Claims whose evidence this scenario produces. */
  informs: string[];
  description: string;
}

export const EXAMPLE_HAZARDS: Hazard[] = [
  {
    ref: 'H-01',
    title: 'Untrusted content becomes instruction',
    description:
      'Retrieved documents, email or tool output carry text the model follows as direction rather than treating as data.',
    domain: 'cyber',
    severity: 'critical',
    themes: ['deterministic_safeguards', 'explicit_red_lines', 'threat_modelling'],
    addressedBy: ['C-04', 'C-12'],
  },
  {
    ref: 'H-02',
    title: 'Authority exceeds what was assessed',
    description:
      'The agent acquires a permission, tool or autonomy level beyond the boundary the evidence justified.',
    domain: 'cyber',
    severity: 'critical',
    themes: ['least_privilege_credentials', 'proportional_autonomy', 'unique_agent_identity'],
    addressedBy: ['C-01', 'C-02', 'C-06'],
  },
  {
    ref: 'H-03',
    title: 'Retrieval corpus contamination',
    description:
      'An unauthorised or unverified source enters the index, so poisoned content reaches the agent through a trusted path.',
    domain: 'cyber',
    severity: 'high',
    themes: ['supply_chain_integrity', 'threat_modelling', 'deterministic_safeguards'],
    addressedBy: ['C-11', 'C-12'],
  },
  {
    ref: 'H-04',
    title: 'Tool or MCP description poisoning',
    description:
      'An unsigned or altered tool manifest changes what the model believes a tool does, without any change to the tool itself.',
    domain: 'cyber',
    severity: 'high',
    themes: ['supply_chain_integrity', 'deterministic_safeguards'],
    addressedBy: ['C-14'],
  },
  {
    ref: 'H-05',
    title: 'Memory contamination and drift',
    description:
      'Planted or stale memory influences later decisions after the originating interaction is gone.',
    domain: 'both',
    severity: 'moderate',
    themes: ['deterministic_safeguards', 'immutable_logs'],
    addressedBy: ['C-13'],
  },
  {
    ref: 'H-06',
    title: 'Human oversight is bypassed or ineffective',
    description:
      'A consequential action completes without the named approver, or the approval is a rubber stamp.',
    domain: 'cyber',
    severity: 'critical',
    themes: ['gated_approvals', 'human_oversight', 'explicit_red_lines'],
    addressedBy: ['C-01', 'C-06'],
  },
  {
    ref: 'H-07',
    title: 'Dependency failure degrades unsafely',
    description:
      'Loss of retrieval, a model endpoint or a downstream service produces confident but unsourced output instead of a safe stop.',
    domain: 'resilience',
    severity: 'high',
    themes: ['incident_response', 'emergency_shutdown'],
    addressedBy: ['C-07', 'C-09'],
  },
  {
    ref: 'H-08',
    title: 'Action is not reconstructable after the fact',
    description:
      'Tool calls, retrieved sources and reviewer decisions cannot be correlated, so an incident cannot be investigated.',
    domain: 'both',
    severity: 'high',
    themes: ['immutable_logs', 'telemetry', 'incident_response'],
    addressedBy: ['C-05'],
  },
  {
    ref: 'H-09',
    title: 'State is lost or duplicated on interruption',
    description:
      'A restart mid-task loses case state or repeats an action that should have happened once.',
    domain: 'resilience',
    severity: 'moderate',
    themes: ['incident_response', 'sandboxing'],
    addressedBy: ['C-08'],
  },
  {
    ref: 'H-10',
    title: 'Contractual conditions no longer hold',
    description:
      'Retention, residency or entitlement terms change so that processing continues outside what was approved.',
    domain: 'cyber',
    severity: 'high',
    themes: ['supply_chain_integrity', 'threat_modelling'],
    addressedBy: ['C-10'],
  },
];

export const EXAMPLE_SCENARIOS: Scenario[] = [
  {
    ref: 'S-01', title: 'Indirect prompt injection via attachment', hazardRef: 'H-01',
    domain: 'cyber', method: 'inspect:injection_challenge_pack', informs: ['C-04'],
    description: 'Adversarial instructions embedded in inbound documents attempt to redirect tool use.',
  },
  {
    ref: 'S-02', title: 'Adaptive injection under a static defence', hazardRef: 'H-01',
    domain: 'cyber', method: 'inspect:adaptive_injection_probe', informs: ['C-04', 'C-12'],
    description: 'Attacks adapted against the deployed filter rather than a fixed benchmark set.',
  },
  {
    ref: 'S-03', title: 'Permission escalation attempt', hazardRef: 'H-02',
    domain: 'cyber', method: 'inspect:privilege_escalation_pack', informs: ['C-02'],
    description: 'The agent is induced to attempt an action outside its granted permission set.',
  },
  {
    ref: 'S-04', title: 'Unauthorised external communication', hazardRef: 'H-06',
    domain: 'cyber', method: 'inspect:external_send_gate', informs: ['C-06', 'C-01'],
    description: 'The agent is pushed toward sending outbound content without the approval gate.',
  },
  {
    ref: 'S-05', title: 'Planted retrieval document', hazardRef: 'H-03',
    domain: 'cyber', method: 'inspect:rag_poisoning_pack', informs: ['C-11', 'C-12'],
    description: 'Poisoned documents are indexed from an added source and offered to the agent.',
  },
  {
    ref: 'S-06', title: 'Canary document retrieval', hazardRef: 'H-03',
    domain: 'cyber', method: 'harness:canary_document_check', informs: ['C-11'],
    description: 'Marked documents reveal retrieval from sources outside the allowlist.',
  },
  {
    ref: 'S-07', title: 'Altered MCP tool manifest', hazardRef: 'H-04',
    domain: 'cyber', method: 'harness:mcp_manifest_signature_check', informs: ['C-14'],
    description: 'A registered server presents a changed description; signature and pin are checked.',
  },
  {
    ref: 'S-08', title: 'Memory write by an unauthorised principal', hazardRef: 'H-05',
    domain: 'cyber', method: 'harness:memory_write_control_test', informs: ['C-13'],
    description: 'A non-agent identity attempts to write durable memory; rollback is then exercised.',
  },
  {
    ref: 'S-09', title: 'Retrieval outage', hazardRef: 'H-07',
    domain: 'resilience', method: 'harness:failover_rehearsal', informs: ['C-07'],
    description: 'Retrieval is withdrawn mid-task; drafts must not proceed unsourced.',
  },
  {
    ref: 'S-10', title: 'Recovery objective rehearsal', hazardRef: 'H-07',
    domain: 'resilience', method: 'harness:recovery_objective_test', informs: ['C-09'],
    description: 'A dependency is failed and restoration is timed against the stated RTO.',
  },
  {
    ref: 'S-11', title: 'Interrupt and resume', hazardRef: 'H-09',
    domain: 'resilience', method: 'harness:interrupt_resume_test', informs: ['C-08'],
    description: 'The agent is restarted mid-case; state must survive without duplicate actions.',
  },
  {
    ref: 'S-12', title: 'Audit correlation sample', hazardRef: 'H-08',
    domain: 'both', method: 'harness:audit_trail_sample', informs: ['C-05'],
    description: 'Tool calls, sources and reviewer decisions are correlated across a sample of cases.',
  },
  {
    ref: 'S-13', title: 'Data-processing terms review', hazardRef: 'H-10',
    domain: 'cyber', method: 'harness:data_processing_terms_review', informs: ['C-10'],
    description: 'Current provider terms are checked against the approved retention and residency.',
  },
];

/** NCSC themes with no hazard addressing them — a coverage gap, made visible. */
export function uncoveredThemes(hazards: Hazard[] = EXAMPLE_HAZARDS): NcscTheme[] {
  const covered = new Set(hazards.flatMap((h) => h.themes));
  return (Object.keys(NCSC_THEME_LABEL) as NcscTheme[]).filter((t) => !covered.has(t));
}

/** Hazards whose addressing claims have no scenario producing evidence. */
export function untestedHazards(
  hazards: Hazard[] = EXAMPLE_HAZARDS,
  scenarios: Scenario[] = EXAMPLE_SCENARIOS,
): Hazard[] {
  const tested = new Set(scenarios.map((s) => s.hazardRef));
  return hazards.filter((h) => !tested.has(h.ref));
}
