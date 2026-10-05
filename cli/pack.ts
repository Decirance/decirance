// SPDX-License-Identifier: Apache-2.0
/**
 * Render the Deployment Case as a pack a committee can read.
 *
 * The four case documents answer "may this agent operate here" precisely and
 * in a form nobody outside engineering will read. This renders the same facts
 * as prose and tables: what the agent is, what it may do, which claims the
 * evidence supports, what the rules therefore recommend, and what will end the
 * permit.
 *
 * ## Generated, never typed
 *
 * Every number here is computed from the files at the moment of rendering. A
 * pack assembled by hand is a snapshot that starts drifting from the case
 * immediately, and the drift is invisible: the document still looks current.
 * The provenance block at the end records the Passport digest and the counts so
 * a reader can tell which configuration they are holding a decision about.
 *
 * ## It does not decide anything
 *
 * The pack states the recommendation and the single rule that set it. If a
 * permit exists it is quoted, including who signed it. If none exists the pack
 * says so in the first section rather than reading as an approval.
 *
 * Run: npx decirance pack [dir] [--out <file>]
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { assessCase, type Assessment, type ClaimVerdict } from './assess.ts';

const STATE_LABEL: Record<string, string> = {
  supported: 'Supported',
  partially_supported: 'Partly supported',
  unsupported: 'Not supported',
  invalidated: 'Invalidated',
  challenged: 'Contradicted',
  excepted: 'Excepted',
  not_applicable: 'Not applicable',
  not_assessed: 'Not assessed',
};

const RECOMMENDATION_MEANING: Record<string, string> = {
  approve: 'Operate as described, with no conditions attached.',
  approve_with_conditions: 'Operate as described, for as long as the stated conditions remain in force.',
  supervised_pilot: 'Operate only under supervision, at reduced scope, while the gaps below are closed.',
  reject: 'Do not operate. The evidence does not support this deployment in this context.',
};

interface PassportDoc {
  agent_id?: string; agent_version?: string; owner?: string; purpose?: string; environment?: string;
  components?: { model?: { provider?: string; model?: string; version?: string }; tools?: Array<{ id?: string }>; data_sources?: string[]; mcp_servers?: string[] };
  operating?: { autonomy_level?: string; permissions?: string[]; human_review?: Record<string, unknown> };
  containment?: Record<string, unknown>;
  entitlement?: { data_residency?: string; expiry?: string };
}

interface ContractDoc {
  contract_version?: string;
  scope?: { intended_users?: string[]; affected_parties?: string[]; permitted_actions?: string[]; prohibited_actions?: string[]; accessible_data?: string[] };
  operating?: { autonomy_level?: string; required_human_oversight?: string[]; recovery_objectives?: Record<string, string> };
}

interface PermitDoc {
  permit_id?: string; state?: string; level?: string; conditions?: string[]; residual_risks?: string[];
  approved_by?: string; approved_at?: string; passport_digest?: string; suspension_triggers?: string[];
  attestation?: { statement?: string; digest?: string; cryptographically_signed?: boolean };
}

const list = (items: string[] | undefined, empty = '_None recorded._'): string =>
  items && items.length > 0 ? items.map((i) => `- ${i}`).join('\n') : empty;

function readIf<T>(path: string): T | null {
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as T) : null;
}

/** Claims worth a committee's attention: critical, or not fully supported. */
function attention(claims: ClaimVerdict[]): ClaimVerdict[] {
  return claims.filter((c) => c.critical || c.state !== 'supported');
}

/**
 * Options exist for one reason: the published copy of this pack is a committed
 * artefact, and CI fails the build when regenerating it produces a diff. A
 * wall-clock timestamp and an absolute path would make that diff appear on
 * every run on every machine, so a published render passes both explicitly.
 */
export interface PackOptions {
  /** Fixed ISO timestamp for a published artefact; defaults to now. */
  generatedAt?: string;
  /** What to print instead of the absolute case path. */
  label?: string;
}

export function renderPack(dir: string, options: PackOptions = {}): string {
  const root = resolve(dir);
  const a: Assessment = assessCase(root);
  const passport = readIf<PassportDoc>(join(root, 'agent-passport.json'))!;
  const contract = readIf<ContractDoc>(join(root, 'context-contract.json'));
  const permit = readIf<PermitDoc>(join(root, 'deployment-permit.json'));
  const fictional = existsSync(join(root, '.decirance-fixture'));

  const permitCoversThis = permit?.passport_digest === a.passportDigest;
  const model = passport.components?.model;
  const unsupportedCritical = a.claims.filter((c) => c.critical && c.state !== 'supported' && !c.mitigationAccepted);
  const out: string[] = [];
  const w = (...lines: string[]) => out.push(...lines, '');

  w(`# Deployment Case — ${passport.agent_id ?? 'unnamed agent'} ${passport.agent_version ?? ''}`.trim());

  if (fictional) {
    w(
      '> **This case is fictional.** It was created by `decirance init` as a worked',
      '> example. The agent, the organisation, the evidence and the people named in it',
      '> do not exist. Nothing here is an assessment of a real system.',
    );
  }

  // ---- 1. The decision -------------------------------------------------------
  w('## 1. The decision requested');
  w(`**Recommendation: ${a.result.recommendation.replace(/_/g, ' ')}.** ${RECOMMENDATION_MEANING[a.result.recommendation] ?? ''}`);
  if (a.result.bindingRule) {
    w(`This is set by one rule — **${a.result.bindingRule.rule}**: ${a.result.bindingRule.reason}`
      + (a.result.bindingRule.claimRefs.length > 0 ? ` (${a.result.bindingRule.claimRefs.join(', ')})` : ''));
  }

  if (permitCoversThis && permit) {
    w(`A permit exists for this exact configuration: **${permit.permit_id}**, ${permit.level} (${permit.state}), `
      + `signed by ${permit.approved_by ?? 'nobody recorded'}${permit.approved_at ? ` on ${permit.approved_at.slice(0, 10)}` : ''}.`);
  } else if (permit) {
    w('**No permit covers the configuration in this pack.** A permit exists '
      + `(${permit.permit_id ?? 'unnamed'}) but it was decided against a different Agent Passport, `
      + 'so it does not describe what is now running.');
  } else {
    w('**No permit has been issued.** This pack is the basis for a decision, not a record of one. '
      + 'Authority begins when a named accountable owner takes it.');
  }

  if (a.result.suspendExistingPermit) {
    w(`> **A live permit must be suspended.** ${a.result.suspensionReason ?? 'See the rules in section 5.'}`);
  }

  // ---- 2. The agent ----------------------------------------------------------
  w('## 2. What the agent is');
  w(`${passport.purpose ?? 'No purpose recorded.'}`);
  w('| | |', '|---|---|',
    `| Owner | ${passport.owner ?? '—'} |`,
    `| Environment | ${passport.environment ?? '—'} |`,
    `| Model | ${model ? `${model.provider ?? '?'} ${model.model ?? '?'} ${model.version ?? ''}`.trim() : '—'} |`,
    `| Autonomy | ${passport.operating?.autonomy_level ?? '—'} |`,
    `| Tools | ${(passport.components?.tools ?? []).map((t) => t.id).filter(Boolean).join(', ') || 'none'} |`,
    `| Permissions held | ${(passport.operating?.permissions ?? []).join(', ') || 'none recorded'} |`,
    `| MCP servers | ${(passport.components?.mcp_servers ?? []).join(', ') || 'none'} |`,
    `| Data sources | ${(passport.components?.data_sources ?? []).join(', ') || 'none'} |`,
    `| Agent Passport digest | \`${a.passportDigest}\` |`);

  // ---- 3. The context --------------------------------------------------------
  if (contract) {
    w('## 3. Where it may operate');
    w(`Context Contract version ${contract.contract_version ?? 'unversioned'}.`);
    w('**Permitted actions**', list(contract.scope?.permitted_actions));
    w('**Prohibited actions** — a demonstrated breach of any of these caps the recommendation at reject',
      list(contract.scope?.prohibited_actions));
    w('**Human oversight required for**', list(contract.operating?.required_human_oversight));
    w('**Who is affected**', list(contract.scope?.affected_parties));
  }

  // ---- 4. What the evidence supports ----------------------------------------
  w('## 4. What the evidence supports');
  w(`${a.claims.length} claims were assessed against ${a.evidence.length} pieces of evidence.`);
  w('| | |', '|---|---|',
    `| Collected against this Passport | ${a.counts.accepted} |`,
    `| Carried forward through a change | ${a.counts.carriedForward} |`,
    `| Severed by a change | ${a.counts.severed} |`,
    `| Unplaceable | ${a.counts.unplaceable} |`,
    `| Refused at ingest | ${a.counts.rejected} |`);

  if (a.changesApplied.length > 0) {
    w('### The change since the evidence was collected');
    for (const c of a.changesApplied) {
      w(`Compared with Agent Passport \`${c.from}\`: ${c.changes.length > 0 ? c.changes.map((k) => `\`${k}\``).join(', ') : 'no change that severs an edge in this case'}.`);
      if (c.fullReassessment) {
        w('> A difference nobody has classified. Nothing carries forward, because an '
          + 'unclassified change could have severed anything.');
      }
    }
    if (a.counts.severed > 0) {
      w('These results no longer apply to the agent as it now stands, and must be re-collected:');
      w(a.evidence.filter((e) => e.status === 'severed_by_change')
        .map((e) => `- **${e.ref}** ${e.title} — severed by ${(e.severedBy ?? []).join(', ')}`).join('\n'));
    }
  }

  w('### Claims needing a decision-maker\'s attention');
  w('Critical claims, and any claim the evidence does not fully support. '
    + 'A critical claim is one whose failure is not acceptable at any level of use.');
  w('| Claim | Critical | State | Statement |', '|---|---|---|---|',
    ...attention(a.claims).map((c) =>
      `| ${c.ref} | ${c.critical ? 'Yes' : '—'} | ${STATE_LABEL[c.state] ?? c.state} | ${c.statement} |`));

  const mitigated = a.claims.filter((c) => c.mitigationAccepted);
  if (mitigated.length > 0) {
    w('### Mitigations an approver has accepted');
    w(mitigated.map((c) => `- **${c.ref}** is contradicted by evidence. A mitigation was accepted by **${c.mitigationAcceptedBy}**, and operating depends on it remaining in force.`).join('\n'));
  }
  const ignored = a.claims.filter((c) => c.mitigationIgnored);
  if (ignored.length > 0) {
    w(ignored.map((c) => `> **${c.ref}**: ${c.mitigationIgnored}.`).join('\n'));
  }

  // ---- 5. The rules ----------------------------------------------------------
  w('## 5. Every rule that fired');
  w('Most restrictive first. The rules are deterministic: the same case yields the same '
    + 'recommendation, and no judgement of ours sits between the evidence and the answer.');
  w(a.result.firedRules.length === 0
    ? '_No rule fired._'
    : ['| Rule | Ceiling | Why | Claims |', '|---|---|---|---|',
      ...a.result.firedRules.map((r) => `| ${r.rule} | ${r.ceiling.replace(/_/g, ' ')} | ${r.reason} | ${r.claimRefs.join(', ') || '—'} |`)].join('\n'));

  // ---- 6. Conditions and residual risk --------------------------------------
  w('## 6. Conditions and accepted risk');
  if (permitCoversThis && permit) {
    w('**Conditions the permit depends on**', list(permit.conditions));
    w('**Residual risks accepted by the signer**', list(permit.residual_risks));
    if (permit.attestation?.statement) {
      w('**Attestation**', `> ${permit.attestation.statement}`);
      w(`The attestation digest \`${permit.attestation.digest ?? '—'}\` is tamper-evident, not cryptographic: `
        + 'it detects an altered record and does not prove authorship.');
    }
  } else {
    w('No permit covers this configuration, so there are no conditions or accepted risks on record. '
      + 'The approver sets them at the moment of decision, and they are written into the permit.');
  }

  // ---- 7. What ends the decision --------------------------------------------
  /**
   * Ranked by how much of the case each change would actually sever.
   *
   * The ungrouped list runs to forty-odd identifiers, which is accurate and
   * unreadable — nobody deciding anything gets value from an alphabetical dump.
   * The counts come from the graph's own edges, so this is the real blast radius
   * of each change rather than an editorial guess at which ones matter.
   */
  const graphEdges = readIf<{ edges?: Array<{ kind?: string; sourceRef?: string; targetRef?: string; severedBy?: string[] }> }>(
    join(root, 'assurance-graph.json'))?.edges ?? [];
  const bySeverity = new Map<string, { evidence: Set<string>; claims: Set<string> }>();
  for (const edge of graphEdges) {
    for (const kind of edge.severedBy ?? []) {
      const entry = bySeverity.get(kind) ?? { evidence: new Set<string>(), claims: new Set<string>() };
      if (edge.sourceRef) entry.evidence.add(edge.sourceRef);
      if (edge.targetRef) entry.claims.add(edge.targetRef);
      bySeverity.set(kind, entry);
    }
  }
  const criticalRefs = new Set(a.claims.filter((c) => c.critical).map((c) => c.ref));
  const ranked = [...bySeverity.entries()]
    .map(([kind, e]) => ({
      kind,
      evidence: e.evidence.size,
      claims: e.claims.size,
      critical: [...e.claims].filter((r) => criticalRefs.has(r)).length,
    }))
    .sort((x, y) => y.critical - x.critical || y.evidence - x.evidence || x.kind.localeCompare(y.kind));

  w('## 7. What ends this decision');
  w('This is the difference between a permit and a certificate: the changes after which '
    + 'the case stops being true are named in advance. If one happens, the evidence it severs '
    + 'must be re-collected and the decision retaken.');
  if (ranked.length === 0) {
    w('_The graph records nothing that severs its evidence, which is itself worth questioning._');
  } else {
    w('| Change | Evidence it severs | Claims affected | Of those, critical |', '|---|---|---|---|',
      ...ranked.slice(0, 12).map((r) => `| \`${r.kind}\` | ${r.evidence} | ${r.claims} | ${r.critical} |`));
    if (ranked.length > 12) {
      w(`And ${ranked.length - 12} further change kinds sever less of the case: `
        + `${ranked.slice(12).map((r) => `\`${r.kind}\``).join(', ')}.`);
    }
  }
  if (permitCoversThis && permit?.suspension_triggers?.length) {
    w(`The permit records ${permit.suspension_triggers.length} of these as automatic suspension triggers.`);
  }

  // ---- 8. Limits -------------------------------------------------------------
  w('## 8. What this pack does not tell you');
  const limits = [
    'It does not say the agent is safe. It says whether this configuration, in this context, is supported by the evidence presented — and what would invalidate that.',
    'Evidence quality is recorded per dimension by the assessor who submitted it. Dimensions left blank mean "not assessed", which is different from, and more useful than, a number nobody stands behind.',
    'Nothing here is runtime monitoring. The assessment is of a configuration, not of behaviour in production this morning.',
    'A human approver can approve badly. The record binds the decision to a named person and to this evidence; it does not improve judgement.',
  ];
  if (unsupportedCritical.length > 0) {
    limits.unshift(`**${unsupportedCritical.length} critical claim(s) are not supported and have no accepted mitigation: `
      + `${unsupportedCritical.map((c) => c.ref).join(', ')}.** Operating despite this is a decision somebody has to own explicitly.`);
  }
  if (a.counts.unplaceable > 0) {
    limits.unshift(`**${a.counts.unplaceable} piece(s) of evidence cannot be placed against any Agent Passport that is present**, `
      + 'so whether the change severed them could not be decided. They support nothing in this pack.');
  }
  w(limits.map((l) => `- ${l}`).join('\n'));

  // ---- 9. Provenance ---------------------------------------------------------
  w('## 9. Provenance');
  w('| | |', '|---|---|',
    `| Generated | ${options.generatedAt ?? new Date().toISOString()} |`,
    `| Generated by | \`decirance pack\` |`,
    `| Case directory | \`${root}\` |`,
    `| Agent Passport digest | \`${a.passportDigest}\` |`,
    `| Claims / evidence | ${a.claims.length} / ${a.evidence.length} |`,
    `| Recommendation | ${a.result.recommendation} |`);
  w('Every figure above is computed from the case documents at the moment of rendering. '
    + 'Regenerate with `decirance pack`; do not edit this file, or it stops describing the case.');

  return `${out.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

export function runPack(args: string[]): number {
  const outIndex = args.indexOf('--out');
  const positional = args.filter((a, i) => !a.startsWith('--') && !(outIndex >= 0 && i === outIndex + 1));
  const dir = positional[0] ?? 'decirance-case';
  const markdown = renderPack(dir);

  if (outIndex >= 0) {
    const out = resolve(args[outIndex + 1] ?? join(dir, 'deployment-case.md'));
    writeFileSync(out, markdown);
    console.log(`\nDeployment Case pack written to ${out}\n`);
    return 0;
  }
  process.stdout.write(markdown);
  return 0;
}
