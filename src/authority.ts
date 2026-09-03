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
  /**
   * Lifecycle of the grant itself.
   *
   * A revoked parent must invalidate its children. Without this the delegation
   * chain is checked once at creation and never again, so revoking the parent
   * leaves every sub-agent it spawned holding authority derived from a grant
   * that no longer exists.
   */
  status?: 'active' | 'expired' | 'revoked';
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
  options: { now?: string } = {},
): { valid: boolean; findings: DelegationFinding[] } {
  const findings: DelegationFinding[] = [];
  const now = options.now ?? new Date().toISOString();

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

  // Authority is derived, so it cannot outlive its source. Checked before the
  // containment rules because a revoked parent makes the rest moot.
  if (parent.status === 'revoked') {
    findings.push({
      code: 'parent_revoked',
      severity: 'invalid',
      detail: `Parent grant ${parent.ref} is revoked. Every authority derived from it falls with it; a child still operating is holding authority nobody grants.`,
    });
  }
  if (parent.status === 'expired' || parent.grantExpiry < now) {
    findings.push({
      code: 'parent_expired',
      severity: 'invalid',
      detail: `Parent grant ${parent.ref} expired at ${parent.grantExpiry}. A child cannot be authorised by a grant that has lapsed.`,
    });
  }
  if (child.grantExpiry > parent.grantExpiry) {
    findings.push({
      code: 'child_outlives_parent',
      severity: 'invalid',
      detail: `Child grant runs to ${child.grantExpiry}, beyond the parent's ${parent.grantExpiry}. Delegated authority cannot outlast its source.`,
    });
  }
  if (!parent.actingFor) {
    findings.push({
      code: 'principal_unidentified',
      severity: 'invalid',
      detail: 'Delegated authority must identify the original accountable principal. "The agent did it" is not an audit trail.',
    });
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


export interface ChainLink {
  grant: AuthorityGrant;
  findings: DelegationFinding[];
  valid: boolean;
}

export interface ChainResult {
  valid: boolean;
  links: ChainLink[];
  /** The first grant that broke containment, if any. */
  firstInvalid?: string;
  reasoning: string;
}

/**
 * Validate a whole delegation chain, root first.
 *
 * A chain is only as good as its weakest link, and the failure this catches is
 * a valid-looking leaf beneath an invalid intermediate: checking the leaf
 * against its immediate parent says nothing about whether that parent was
 * entitled to what it is passing on. Once a link breaks, everything below it
 * is unauthorised regardless of how carefully it was narrowed.
 */
export function checkDelegationChain(
  chain: AuthorityGrant[],
  options: { now?: string } = {},
): ChainResult {
  const links: ChainLink[] = [];
  let brokenAt: string | undefined;

  chain.forEach((grant, i) => {
    const parent = i === 0 ? undefined : chain[i - 1];
    const { valid, findings } = checkDelegation(grant, parent, i, options);
    const effectiveFindings = [...findings];
    // Below a broken link, authority is not merely unchecked — it is absent.
    if (brokenAt && valid) {
      effectiveFindings.push({
        code: 'inherits_broken_chain',
        severity: 'invalid',
        detail: `This grant is internally consistent but descends from ${brokenAt}, which is not valid. Authority cannot be derived from a grant that does not hold.`,
      });
    }
    const linkValid = valid && !brokenAt;
    if (!linkValid && !brokenAt) brokenAt = grant.ref;
    links.push({ grant, findings: effectiveFindings, valid: linkValid });
  });

  return {
    valid: !brokenAt,
    links,
    firstInvalid: brokenAt,
    reasoning: brokenAt
      ? `Chain breaks at ${brokenAt}. Every grant below it is unauthorised, however carefully it was narrowed.`
      : `All ${chain.length} link(s) narrow correctly from the root principal.`,
  };
}

/**
 * Check several children of one parent independently.
 *
 * Reported per child rather than as a single verdict: one sibling violating
 * containment must not invalidate the others, and a combined pass/fail would
 * either hide the bad child or condemn the good ones.
 */
export function checkSiblings(
  parent: AuthorityGrant,
  children: AuthorityGrant[],
  options: { now?: string } = {},
): { allValid: boolean; results: Array<{ ref: string; valid: boolean; findings: DelegationFinding[] }>; overCount: boolean } {
  const results = children.map((child) => {
    const { valid, findings } = checkDelegation(child, parent, 1, options);
    return { ref: child.ref, valid, findings };
  });
  return {
    allValid: results.every((r) => r.valid),
    results,
    overCount: children.length > parent.maxChildAgents,
  };
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
  destination?: string;
  parameters?: Record<string, unknown>;
  approvedBy?: string[];
  dryRun?: boolean;
  /** Identity the call would actually run as. */
  credentialIdentity?: string;
  credentialLifetimeSeconds?: number;
  /** Value of the action, where it has one. */
  value?: number;
  /** Calls already made in the current hour, for the rate limit. */
  callsThisHour?: number;
  elapsedSeconds?: number;
  destructive?: boolean;
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

  if (invocation.destination && !contract.egressDestinations.includes(invocation.destination)) {
    denials.push({
      code: 'destination_not_allowed',
      detail: `"${invocation.destination}" is not a permitted egress destination for ${contract.operationId}.`,
    });
  }

  // Parameter constraints, expressed as simple comparisons so they stay
  // readable in a permit a human has to sign.
  for (const [name, rule] of Object.entries(contract.parameterConstraints)) {
    const supplied = invocation.parameters?.[name];
    if (supplied === undefined) continue;
    const match = /^(<=|>=|<|>|==)\s*(.+)$/.exec(rule.trim());
    if (!match) continue;
    const [, op, raw] = match;
    const expected = Number(raw);
    const actual = Number(supplied);
    if (Number.isNaN(expected) || Number.isNaN(actual)) continue;
    const ok =
      op === '<=' ? actual <= expected :
      op === '>=' ? actual >= expected :
      op === '<' ? actual < expected :
      op === '>' ? actual > expected :
      actual === expected;
    if (!ok) {
      denials.push({
        code: 'parameter_constraint',
        detail: `Parameter "${name}" is ${actual}; the contract requires ${rule}.`,
      });
    }
  }

  if (invocation.destructive && !contract.destructive) {
    denials.push({
      code: 'destructive_not_declared',
      detail: `The call would change durable state, but ${contract.operationId} is not contracted as destructive. A contract that understates its effect cannot bound it.`,
    });
  }

  if (contract.financialLimit !== undefined && (invocation.value ?? 0) > contract.financialLimit) {
    denials.push({
      code: 'financial_limit',
      detail: `Value ${invocation.value} exceeds the contracted limit of ${contract.financialLimit}.`,
    });
  }

  if (contract.rateLimitPerHour !== undefined && (invocation.callsThisHour ?? 0) >= contract.rateLimitPerHour) {
    denials.push({
      code: 'rate_limit',
      detail: `${invocation.callsThisHour} call(s) this hour meets the contracted limit of ${contract.rateLimitPerHour}.`,
    });
  }

  if (contract.timeLimitSeconds !== undefined && (invocation.elapsedSeconds ?? 0) > contract.timeLimitSeconds) {
    denials.push({
      code: 'time_limit',
      detail: `Elapsed ${invocation.elapsedSeconds}s exceeds the contracted ${contract.timeLimitSeconds}s.`,
    });
  }

  if (invocation.credentialIdentity && invocation.credentialIdentity !== contract.credentialIdentity) {
    denials.push({
      code: 'credential_identity',
      detail: `Call would run as "${invocation.credentialIdentity}" but the contract binds ${contract.operationId} to "${contract.credentialIdentity}".`,
    });
  }

  if (
    invocation.credentialLifetimeSeconds !== undefined &&
    invocation.credentialLifetimeSeconds > contract.credentialLifetimeSeconds
  ) {
    denials.push({
      code: 'credential_lifetime',
      detail: `Credential lives ${invocation.credentialLifetimeSeconds}s, beyond the contracted ${contract.credentialLifetimeSeconds}s.`,
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
 * Capability classes a contract can confer.
 *
 * Derived from the contract rather than declared, so a tool cannot avoid a
 * composition warning by omitting a label.
 */
export type Capability =
  | 'reads_sensitive'
  | 'reads_identity'
  | 'exports_data'
  | 'retrieves_credentials'
  | 'writes_external'
  | 'sends_communication'
  | 'writes_public_storage'
  | 'makes_network_request'
  | 'creates_child_agent'
  | 'delegable_privileged';

export interface CompositionalRisk {
  pattern: string;
  operations: [string, string];
  /** Why the combination matters, beyond either half. */
  whyItMatters: string;
  /** The data or action the combination puts at risk. */
  affects: string;
  /** Controls already on either contract that bear on this path. */
  mitigatingControls: string[];
  /** Whether a human should look at this pairing. Never an automatic prohibition. */
  requiresHumanReview: boolean;
}

function capabilitiesOf(c: ToolAuthorityContract): Set<Capability> {
  const caps = new Set<Capability>();
  const sensitive = c.permittedDataClasses.some((d) => d !== 'public');
  const external = c.egressDestinations.some((d) => !d.endsWith('.internal'));
  const ops = c.permittedActions.map((a) => a.toLowerCase());
  const id = c.operationId.toLowerCase();

  if (!c.destructive && sensitive) caps.add('reads_sensitive');
  if (/identity|user|directory|people|hr/.test(id)) caps.add('reads_identity');
  if (/export|download|dump|extract/.test(id) || ops.includes('export')) caps.add('exports_data');
  if (/secret|credential|token|vault|key/.test(id)) caps.add('retrieves_credentials');
  if (external) { caps.add('writes_external'); caps.add('makes_network_request'); }
  if (/mail|message|send|notify|chat|post/.test(id) || ops.includes('send')) caps.add('sends_communication');
  if (/public|bucket|blob|share|cdn/.test(id)) caps.add('writes_public_storage');
  if (/spawn|child|subagent|sub_agent|delegate/.test(id)) caps.add('creates_child_agent');
  if (c.destructive && sensitive) caps.add('delegable_privileged');
  return caps;
}

/**
 * The pairings worth surfacing.
 *
 * Each is a path that neither contract forbids on its own. The output is a
 * warning, not a prohibition: whether the pairing is acceptable depends on the
 * context contract and the compensating controls, and that judgement belongs
 * to a person. Reporting it as "denied" would put this engine in the position
 * of overruling a decision it does not have the context to make.
 */
const PATTERNS: Array<{
  name: string;
  from: Capability;
  to: Capability;
  whyItMatters: string;
  affects: string;
}> = [
  {
    name: 'sensitive read + external write',
    from: 'reads_sensitive', to: 'writes_external',
    whyItMatters: 'The canonical exfiltration primitive. Either half is ordinary; together they move protected data out of the organisation in one agent turn, with no rule broken.',
    affects: 'Confidentiality of the data the reading tool can reach.',
  },
  {
    name: 'identity lookup + communication',
    from: 'reads_identity', to: 'sends_communication',
    whyItMatters: 'Enables targeted social engineering under the organisation’s own identity. The agent can find who to approach and then approach them.',
    affects: 'Named individuals, and the organisation’s standing with them.',
  },
  {
    name: 'data export + public storage',
    from: 'exports_data', to: 'writes_public_storage',
    whyItMatters: 'Bulk disclosure without any network call an egress control would see, because the data leaves via a storage surface rather than a request.',
    affects: 'Every record inside the export scope.',
  },
  {
    name: 'credential retrieval + network request',
    from: 'retrieves_credentials', to: 'makes_network_request',
    whyItMatters: 'Turns a read of a secret into use of that secret elsewhere. This is the step that converted an evaluation sandbox escape into a multi-service intrusion in the 2026 incidents.',
    affects: 'Every system the retrieved credential authenticates to, including ones outside this assessment.',
  },
  {
    name: 'child creation + delegable privileged operation',
    from: 'creates_child_agent', to: 'delegable_privileged',
    whyItMatters: 'A privileged operation that can be delegated to spawned children escapes per-instance review: the reviewed agent is not the one acting.',
    affects: 'The delegation chain, and any authority containment that assumed a fixed set of actors.',
  },
];

function mitigationsOn(a: ToolAuthorityContract, b: ToolAuthorityContract): string[] {
  const out: string[] = [];
  for (const c of [a, b]) {
    if (c.requiresTwoPersonApproval) out.push(`${c.operationId} requires two-person approval`);
    else if (c.requiresHumanApproval) out.push(`${c.operationId} requires human approval`);
    if (c.failMode === 'fail_closed') out.push(`${c.operationId} fails closed`);
    if (c.rateLimitPerHour !== undefined) out.push(`${c.operationId} is rate-limited to ${c.rateLimitPerHour}/h`);
    if (c.financialLimit !== undefined) out.push(`${c.operationId} is capped at ${c.financialLimit}`);
    if (c.allowedRecipients.length > 0) out.push(`${c.operationId} restricts recipients`);
  }
  return [...new Set(out)];
}

/**
 * Find compositional risks across a contract set.
 *
 * Individually safe tools compose into unsafe paths, and no single contract
 * can see it: the risk is a property of the set, which is exactly the thing a
 * per-tool review never looks at.
 */
export function findCompositionalRisks(
  contracts: ToolAuthorityContract[],
): CompositionalRisk[] {
  const caps = new Map(contracts.map((c) => [c.operationId, capabilitiesOf(c)]));
  const out: CompositionalRisk[] = [];

  for (const pattern of PATTERNS) {
    for (const a of contracts) {
      if (!caps.get(a.operationId)!.has(pattern.from)) continue;
      for (const b of contracts) {
        if (a.operationId === b.operationId) continue;
        if (!caps.get(b.operationId)!.has(pattern.to)) continue;
        const mitigating = mitigationsOn(a, b);
        out.push({
          pattern: pattern.name,
          operations: [a.operationId, b.operationId],
          whyItMatters: pattern.whyItMatters,
          affects: pattern.affects,
          mitigatingControls: mitigating,
          // A pairing with no approval gate on the acting half is the one a
          // human should see. Where an approval already stands between the
          // capability and its use, the path is bounded and review is optional.
          requiresHumanReview: !b.requiresHumanApproval && !b.requiresTwoPersonApproval,
        });
      }
    }
  }
  return out;
}
