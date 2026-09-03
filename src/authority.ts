// SPDX-License-Identifier: Apache-2.0
/**
 * Authority grants, delegation, and per-tool authority contracts.
 *
 * The permit invariant used to decide over action strings: `case:read` was
 * either in the permitted set or it was not. That is the granularity of a
 * firewall rule, and it cannot express the questions that actually determine
 * whether a deployment is safe. "The agent may call the case tool" does not
 * say which method, on whose behalf, against which records, up to what value,
 * with a credential living how long, and whether a human sees it first.
 *
 * Two objects close that gap.
 *
 * `AuthorityGrant` records *whose* authority the agent acts under. An agent
 * does not have authority of its own; it exercises someone else's. Recording
 * the principal, the token audience, the credential lifetime and the
 * delegation parent turns "the agent did it" into "the agent did it as this
 * principal, under this grant, which expires". Without that, an audit trail
 * names a service account and stops.
 *
 * `ToolAuthorityContract` bounds a single operation. The rule that makes it
 * worth having is `prohibitedCombinations`: individually safe tools compose
 * into unsafe paths, and read-a-document plus send-an-email is the canonical
 * exfiltration primitive even though neither half is objectionable alone.
 *
 * Everything here fails closed. An operation with no contract is denied, not
 * permitted-by-default, because the alternative is that adding a tool silently
 * widens authority nobody assessed.
 */

export type OperationMode =
  /** Acting for a specific human, with that human's authority. */
  | 'user_delegated'
  /** Acting for the organisation, not any individual. */
  | 'organisation_delegated'
  /** A service with its own bounded authority. */
  | 'service_agent'
  /** A service acting without a delegating principal. */
  | 'autonomous_service';

export interface AuthorityGrant {
  ref: string;
  agentIdentity: string;
  /** The principal whose authority is being exercised. */
  actingFor: string;
  mode: OperationMode;
  businessOwner: string;
  technicalOwner: string;
  accountableSponsor: string;
  purpose: string;
  permittedResources: string[];
  permittedActions: string[];
  prohibitedActions: string[];
  identityProvider: string;
  credentialType: string;
  /** Who the token is for. A token accepted by an unintended audience is a confused deputy. */
  tokenAudience: string;
  scopes: string[];
  /** Credential lifetime in seconds. */
  credentialLifetimeSeconds: number;
  grantStart: string;
  grantExpiry: string;
  revocationEndpoint?: string;
  /** The grant this one was delegated from, if any. */
  delegationParent?: string;
  maySpawnSubAgents: boolean;
  maxDelegationDepth: number;
  maxChildAgents: number;
  evidenceRefs: string[];
}

export interface DelegationFinding {
  code: string;
  severity: 'invalid' | 'warning';
  detail: string;
}

/**
 * Check a delegated grant against its parent.
 *
 * The invariant: **no child may hold authority its parent does not have.**
 * Authority can only narrow as it is delegated. This is checked as set
 * containment rather than trusted to whoever created the child, because the
 * failure is silent — a sub-agent spawned with a broader scope looks exactly
 * like one spawned correctly until it does something nobody authorised.
 */
export function checkDelegation(
  child: AuthorityGrant,
  parent: AuthorityGrant | undefined,
  depth = 1,
): { valid: boolean; findings: DelegationFinding[] } {
  const findings: DelegationFinding[] = [];

  if (!parent) {
    if (child.delegationParent) {
      findings.push({
        code: 'parent_missing',
        severity: 'invalid',
        detail: `Grant ${child.ref} names delegation parent ${child.delegationParent}, which was not supplied. An unverifiable delegation chain cannot be relied on.`,
      });
    }
    return { valid: findings.length === 0, findings };
  }

  if (!parent.maySpawnSubAgents) {
    findings.push({
      code: 'spawn_not_permitted',
      severity: 'invalid',
      detail: `Parent grant ${parent.ref} does not permit sub-agents.`,
    });
  }

  if (depth > parent.maxDelegationDepth) {
    findings.push({
      code: 'depth_exceeded',
      severity: 'invalid',
      detail: `Delegation depth ${depth} exceeds the parent's maximum of ${parent.maxDelegationDepth}.`,
    });
  }

  const widened = (a: string[], b: string[]) => a.filter((x) => !b.includes(x));

  const extraActions = widened(child.permittedActions, parent.permittedActions);
  if (extraActions.length > 0) {
    findings.push({
      code: 'authority_widened',
      severity: 'invalid',
      detail: `Child grant permits actions the parent does not: ${extraActions.join(', ')}. Authority may only narrow as it is delegated.`,
    });
  }

  const extraResources = widened(child.permittedResources, parent.permittedResources);
  if (extraResources.length > 0) {
    findings.push({
      code: 'resources_widened',
      severity: 'invalid',
      detail: `Child grant reaches resources the parent does not: ${extraResources.join(', ')}.`,
    });
  }

  const extraScopes = widened(child.scopes, parent.scopes);
  if (extraScopes.length > 0) {
    findings.push({
      code: 'scopes_widened',
      severity: 'invalid',
      detail: `Child grant holds scopes the parent does not: ${extraScopes.join(', ')}.`,
    });
  }

  // A prohibition on the parent must survive delegation, or prohibiting an
  // action means only "the parent will not do it personally".
  const droppedProhibitions = parent.prohibitedActions.filter(
    (a) => !child.prohibitedActions.includes(a),
  );
  if (droppedProhibitions.length > 0) {
    findings.push({
      code: 'prohibition_dropped',
      severity: 'invalid',
      detail: `Child grant drops prohibitions inherited from the parent: ${droppedProhibitions.join(', ')}.`,
    });
  }

  if (child.credentialLifetimeSeconds > parent.credentialLifetimeSeconds) {
    findings.push({
      code: 'lifetime_extended',
      severity: 'warning',
      detail: `Child credentials outlive the parent's (${child.credentialLifetimeSeconds}s vs ${parent.credentialLifetimeSeconds}s). Revoking the parent will not stop the child.`,
    });
  }

  if (child.tokenAudience !== parent.tokenAudience && child.mode === 'user_delegated') {
    findings.push({
      code: 'audience_changed',
      severity: 'warning',
      detail: `Delegated token audience differs from the parent's. Check this is not a confused-deputy path.`,
    });
  }

  return { valid: !findings.some((f) => f.severity === 'invalid'), findings };
}

// ── Per-tool authority ─────────────────────────────────────────────────────

export interface ToolAuthorityContract {
  ref: string;
  /** Server or tool provider. */
  provider: string;
  /** Fully qualified, versioned operation, e.g. "mcp:case-store@1.2/case.update". */
  operationId: string;
  toolVersion: string;
  schemaVersion: string;
  permittedActions: string[];
  permittedResources: string[];
  /** Constraints on individual parameters, e.g. { amount: "<= 500" }. */
  parameterConstraints: Record<string, string>;
  permittedDataClasses: string[];
  allowedRecipients: string[];
  egressDestinations: string[];
  /** Does invoking this change durable state? */
  destructive: boolean;
  supportsDryRun: boolean;
  requiresHumanApproval: boolean;
  requiresTwoPersonApproval: boolean;
  rateLimitPerHour?: number;
  financialLimit?: number;
  tokenLimit?: number;
  timeLimitSeconds?: number;
  credentialIdentity: string;
  credentialLifetimeSeconds: number;
  failMode: 'fail_open' | 'fail_closed';
  /** Operations that must not be available alongside this one. */
  prohibitedCombinations: string[];
}

export interface ToolInvocation {
  operationId: string;
  resource?: string;
  dataClass?: string;
  recipient?: string;
  parameters?: Record<string, unknown>;
  approvedBy?: string[];
  dryRun?: boolean;
}

export interface ToolAuthorityResult {
  permitted: boolean;
  denials: Array<{ code: string; detail: string }>;
}

/**
 * Decide a single invocation against its contract.
 *
 * An operation with no contract is denied. That is the whole design: adding a
 * tool must not silently widen what the agent may do, and "we had not written
 * a contract for it yet" is a reason to stop, not to proceed.
 */
export function checkToolAuthority(
  invocation: ToolInvocation,
  contracts: ToolAuthorityContract[],
): ToolAuthorityResult {
  const denials: ToolAuthorityResult['denials'] = [];
  const contract = contracts.find((c) => c.operationId === invocation.operationId);

  if (!contract) {
    return {
      permitted: false,
      denials: [{
        code: 'no_contract',
        detail: `No authority contract for "${invocation.operationId}". An operation nobody bounded is not an operation the agent may perform.`,
      }],
    };
  }

  if (invocation.resource && !contract.permittedResources.includes(invocation.resource)) {
    denials.push({
      code: 'resource_not_permitted',
      detail: `"${invocation.resource}" is not in the permitted resources for ${contract.operationId}.`,
    });
  }

  if (invocation.dataClass && !contract.permittedDataClasses.includes(invocation.dataClass)) {
    denials.push({
      code: 'data_class_not_permitted',
      detail: `Data class "${invocation.dataClass}" is not permitted for ${contract.operationId}.`,
    });
  }

  if (invocation.recipient && !contract.allowedRecipients.includes(invocation.recipient)) {
    denials.push({
      code: 'recipient_not_allowed',
      detail: `"${invocation.recipient}" is not an allowed recipient. This is the boundary an exfiltration path crosses.`,
    });
  }

  // Approval is required for the real call, not for a dry run — a dry run that
  // needed the same approval would just be the real call with extra steps.
  if (!invocation.dryRun) {
    const approvals = invocation.approvedBy ?? [];
    if (contract.requiresTwoPersonApproval && new Set(approvals).size < 2) {
      denials.push({
        code: 'two_person_approval_missing',
        detail: `${contract.operationId} requires two distinct approvers; ${new Set(approvals).size} recorded.`,
      });
    } else if (contract.requiresHumanApproval && approvals.length === 0) {
      denials.push({
        code: 'approval_missing',
        detail: `${contract.operationId} requires human approval and none is recorded.`,
      });
    }
  }

  // Compositional risk. Two individually bounded operations can form a path
  // neither contract forbids on its own.
  const available = new Set(contracts.map((c) => c.operationId));
  const conflicts = contract.prohibitedCombinations.filter((op) => available.has(op));
  if (conflicts.length > 0) {
    denials.push({
      code: 'prohibited_combination',
      detail: `${contract.operationId} must not be available alongside ${conflicts.join(', ')}. Individually safe operations compose into unsafe paths.`,
    });
  }

  return { permitted: denials.length === 0, denials };
}

/**
 * Find exfiltration-shaped pairs across a contract set.
 *
 * A read of sensitive data plus a write to somewhere outside the organisation
 * is the shape, whoever wrote the two contracts and whether or not either
 * names the other. Reported rather than blocked: whether it is acceptable
 * depends on the context contract, and that is a human's call.
 */
export function findCompositionalRisks(
  contracts: ToolAuthorityContract[],
): Array<{ read: string; write: string; detail: string }> {
  const readers = contracts.filter(
    (c) => !c.destructive && c.permittedDataClasses.some((d) => d !== 'public'),
  );
  const writers = contracts.filter((c) => c.egressDestinations.length > 0 || c.destructive);
  const out: Array<{ read: string; write: string; detail: string }> = [];

  for (const r of readers) {
    for (const w of writers) {
      if (r.operationId === w.operationId) continue;
      const external = w.egressDestinations.filter((d) => !d.endsWith('.internal'));
      if (external.length === 0) continue;
      out.push({
        read: r.operationId,
        write: w.operationId,
        detail: `${r.operationId} can read ${r.permittedDataClasses.join('/')} and ${w.operationId} can reach ${external.join(', ')}. Neither contract forbids the other, and together they are an exfiltration path.`,
      });
    }
  }
  return out;
}
