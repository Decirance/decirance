// SPDX-License-Identifier: Apache-2.0
/**
 * Context Contract — the conditions under which an agent is *intended* to
 * operate, and the check that the deployed configuration stays inside them.
 *
 * The compatibility check is the part that earns its place. A Passport says
 * what the agent can do; a Contract says what it is permitted to do. Comparing
 * them mechanically catches the case where those have quietly diverged —
 * usually because someone added a tool without revisiting the contract, which
 * is exactly the failure Decirance exists to catch and exactly the failure no
 * amount of runtime monitoring surfaces, because nothing has gone wrong yet.
 *
 * A prohibited action the agent can actually perform is a red-line breach, not
 * a gap. That distinction matters: specification section 10.3 caps a breach at
 * `reject`, while an undeclared capability is a condition to close.
 */

import type { PassportSnapshot } from './material-change';
import type { RedLineBreach } from './recommendation';

export const CONTEXT_SCHEMA_VERSION = '0.1.0';

export interface ContextContract {
  businessPurpose: string;
  intendedUsers: string[];
  affectedParties: string[];
  permittedActions: string[];
  prohibitedActions: string[];
  accessibleData: string[];
  connectedTools: string[];
  autonomyLevel: string;
  requiredHumanOversight: string[];
  dependencies: string[];
  recoveryObjectives: Record<string, unknown>;
  riskAppetite: string;
  stopConditions: string[];
}

export interface ContextContractDocument {
  schema_version: string;
  contract_id: string;
  contract_version: string;
  owner: string;
  purpose: string;
  scope: {
    intended_users?: string[];
    affected_parties?: string[];
    permitted_actions?: string[];
    prohibited_actions?: string[];
    accessible_data?: string[];
    connected_tools?: string[];
  };
  operating: {
    autonomy_level: string;
    required_human_oversight?: string[];
    dependencies?: string[];
    recovery_objectives?: Record<string, unknown>;
  };
  risk: {
    appetite: string;
    stop_conditions?: string[];
  };
}

export type ContextParseResult =
  | { ok: true; contract: ContextContract; unknownFields: string[]; warnings: string[] }
  | { ok: false; errors: Array<{ path: string; message: string }> };

const KNOWN_TOP = new Set([
  'schema_version', 'contract_id', 'contract_version', 'owner', 'purpose',
  'scope', 'operating', 'risk',
]);

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
const strArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

export function parseContextContract(input: unknown): ContextParseResult {
  const errors: Array<{ path: string; message: string }> = [];
  const warnings: string[] = [];

  let raw: unknown = input;
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input);
    } catch (e) {
      return { ok: false, errors: [{ path: '(document)', message: `not valid JSON: ${(e as Error).message}` }] };
    }
  }
  if (!isObject(raw)) {
    return { ok: false, errors: [{ path: '(document)', message: 'expected a JSON object' }] };
  }

  const doc = raw as Record<string, unknown>;
  const version = typeof doc.schema_version === 'string' ? doc.schema_version : '';
  if (!version) errors.push({ path: 'schema_version', message: 'expected a non-empty string' });
  else if (version !== CONTEXT_SCHEMA_VERSION) {
    warnings.push(`Document declares schema_version ${version}; this build understands ${CONTEXT_SCHEMA_VERSION}.`);
  }
  if (typeof doc.purpose !== 'string' || !doc.purpose.trim()) {
    errors.push({ path: 'purpose', message: 'expected a non-empty string' });
  }

  const scope = isObject(doc.scope) ? doc.scope : {};
  const operating = isObject(doc.operating) ? doc.operating : {};
  const risk = isObject(doc.risk) ? doc.risk : {};

  if (typeof operating.autonomy_level !== 'string' || !operating.autonomy_level) {
    errors.push({ path: 'operating.autonomy_level', message: 'expected a non-empty string' });
  }
  if (typeof risk.appetite !== 'string' || !risk.appetite) {
    errors.push({ path: 'risk.appetite', message: 'expected a non-empty string' });
  }
  // A contract that prohibits nothing is almost certainly incomplete rather
  // than permissive, so it is worth saying so out loud.
  if (strArray(scope.prohibited_actions).length === 0) {
    warnings.push('No prohibited actions declared. A contract with no red lines cannot produce a breach.');
  }

  const unknownFields = Object.keys(doc).filter((k) => !KNOWN_TOP.has(k));
  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    unknownFields,
    warnings,
    contract: {
      businessPurpose: String(doc.purpose),
      intendedUsers: strArray(scope.intended_users),
      affectedParties: strArray(scope.affected_parties),
      permittedActions: strArray(scope.permitted_actions),
      prohibitedActions: strArray(scope.prohibited_actions),
      accessibleData: strArray(scope.accessible_data),
      connectedTools: strArray(scope.connected_tools),
      autonomyLevel: String(operating.autonomy_level),
      requiredHumanOversight: strArray(operating.required_human_oversight),
      dependencies: strArray(operating.dependencies),
      recoveryObjectives: isObject(operating.recovery_objectives) ? operating.recovery_objectives : {},
      riskAppetite: String(risk.appetite),
      stopConditions: strArray(risk.stop_conditions),
    },
  };
}

export function serialiseContextContract(
  contract: ContextContract,
  meta: { contractId: string; contractVersion: string; owner: string },
): ContextContractDocument {
  return {
    schema_version: CONTEXT_SCHEMA_VERSION,
    contract_id: meta.contractId,
    contract_version: meta.contractVersion,
    owner: meta.owner,
    purpose: contract.businessPurpose,
    scope: {
      intended_users: contract.intendedUsers,
      affected_parties: contract.affectedParties,
      permitted_actions: contract.permittedActions,
      prohibited_actions: contract.prohibitedActions,
      accessible_data: contract.accessibleData,
      connected_tools: contract.connectedTools,
    },
    operating: {
      autonomy_level: contract.autonomyLevel,
      required_human_oversight: contract.requiredHumanOversight,
      dependencies: contract.dependencies,
      recovery_objectives: contract.recoveryObjectives,
    },
    risk: {
      appetite: contract.riskAppetite,
      stop_conditions: contract.stopConditions,
    },
  };
}

export type CompatibilitySeverity = 'breach' | 'gap' | 'note';

export interface CompatibilityFinding {
  ref: string;
  severity: CompatibilitySeverity;
  message: string;
  /** Passport field the finding came from. */
  field: string;
}

export interface CompatibilityResult {
  findings: CompatibilityFinding[];
  /** Breaches, shaped for the recommendation engine's red-line rule. */
  redLines: RedLineBreach[];
  compatible: boolean;
}

/**
 * Check that a Passport stays inside its Context Contract.
 *
 * `breach` means the agent can do something the contract prohibits — a
 * demonstrated red line, which caps the recommendation at reject.
 * `gap` means the agent can do something the contract never contemplated:
 * serious, but a condition to close rather than a refusal.
 */
export function checkContextCompatibility(
  passport: PassportSnapshot,
  contract: ContextContract,
): CompatibilityResult {
  const findings: CompatibilityFinding[] = [];
  let n = 0;
  const add = (severity: CompatibilitySeverity, field: string, message: string) =>
    findings.push({ ref: `X-${String(++n).padStart(2, '0')}`, severity, field, message });

  const prohibited = new Set(contract.prohibitedActions);
  const permitted = new Set(contract.permittedActions);

  for (const permission of passport.permissions) {
    if (prohibited.has(permission)) {
      add('breach', 'permissions', `The agent holds "${permission}", which the contract prohibits.`);
    } else if (permitted.size > 0 && !permitted.has(permission)) {
      add('gap', 'permissions', `The agent holds "${permission}", which the contract does not permit.`);
    }
  }

  const declaredTools = new Set(contract.connectedTools);
  for (const tool of passport.tools) {
    if (declaredTools.size > 0 && !declaredTools.has(tool)) {
      add('gap', 'tools', `Tool "${tool}" is connected but not declared in the contract.`);
    }
  }

  const declaredData = new Set(contract.accessibleData);
  for (const source of passport.dataSources) {
    if (declaredData.size > 0 && !declaredData.has(source)) {
      add('gap', 'dataSources', `Data source "${source}" is reachable but not declared.`);
    }
  }
  for (const source of passport.indexContentSources) {
    if (declaredData.size > 0 && !declaredData.has(source)) {
      add('gap', 'indexContentSources', `Indexed content source "${source}" is not declared.`);
    }
  }

  if (contract.autonomyLevel && passport.autonomyLevel !== contract.autonomyLevel) {
    add(
      'breach',
      'autonomyLevel',
      `Agent operates at autonomy "${passport.autonomyLevel}" but the contract approves "${contract.autonomyLevel}".`,
    );
  }

  // A contract requiring oversight the passport records no workflow for is a
  // breach rather than a gap: the control the approval depends on is absent.
  if (contract.requiredHumanOversight.length > 0 &&
      Object.keys(passport.humanReviewWorkflow).length === 0) {
    add('breach', 'humanReviewWorkflow', 'The contract requires human oversight but the Passport records no review workflow.');
  }

  for (const dependency of contract.dependencies) {
    if (!passport.thirdPartyDependencies.includes(dependency)) {
      add('note', 'thirdPartyDependencies', `Contract names dependency "${dependency}" which the Passport does not list.`);
    }
  }

  const breaches = findings.filter((f) => f.severity === 'breach');
  return {
    findings,
    redLines: breaches.map((f) => ({ ref: f.ref, description: f.message, demonstrated: true })),
    compatible: breaches.length === 0,
  };
}

/** The contract the example case was approved under. */
export const EXAMPLE_CONTEXT_CONTRACT: ContextContract = {
  businessPurpose: 'Triage inbound casework and draft responses for human review.',
  intendedUsers: ['Customer operations caseworkers'],
  affectedParties: ['Members of the public with an open case'],
  permittedActions: ['case:read', 'document:read', 'draft:create', 'review:request'],
  prohibitedActions: ['message:send', 'case:close', 'payment:execute', 'case:write'],
  accessibleData: ['case-store', 'document-store', 'internal:policy-library'],
  connectedTools: ['case.read', 'document.read', 'response.draft', 'review.request'],
  autonomyLevel: 'assisted',
  requiredHumanOversight: ['External send', 'Durable case update'],
  dependencies: ['retrieval-svc', 'model-api'],
  recoveryObjectives: { rto: '30m', rpo: '5m' },
  riskAppetite: 'Low for irreversible customer-facing action; moderate for drafting.',
  stopConditions: [
    'Any unapproved outbound communication',
    'Retrieval from an unlisted source',
    'Two or more critical claims invalidated',
  ],
};
