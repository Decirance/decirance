# Deployment Case — agt_meridian_reply 3.0.0

> **This case is fictional.** It was created by `decirance init` as a worked
> example. The agent, the organisation, the evidence and the people named in it
> do not exist. Nothing here is an assessment of a real system.

## 1. The decision requested

**Recommendation: approve with conditions.** Operate as described, for as long as the stated conditions remain in force.

This is set by one rule — **R2b.critical_claim_challenged_mitigated**: A critical claim is contradicted by evidence. Operation depends on the accepted compensating controls remaining in force. (C-04)

A permit exists for this exact configuration: **DP-2026-014**, conditional (active), signed by Ari Rios on 2026-06-18.

## 2. What the agent is

Triage inbound casework and draft responses for human review.

| | |
|---|---|
| Owner | Ari Rios |
| Environment | uk-south-prod |
| Model | anthropic claude-sonnet-5 2026-04-01 |
| Autonomy | assisted |
| Tools | case.read, document.read, response.draft, review.request |
| Permissions held | case:read, document:read, draft:create, review:request |
| MCP servers | mcp:case-store@1.2 |
| Data sources | case-store, document-store |
| Agent Passport digest | `sha256:b34b4f8ec5ed659bf615dfb4b0573b65f8509cd39f9bd73122cf17c49699d46f` |

## 3. Where it may operate

Context Contract version 3.2.0.

**Permitted actions**
- case:read
- document:read
- draft:create
- review:request

**Prohibited actions** — a demonstrated breach of any of these caps the recommendation at reject
- message:send
- case:close
- payment:execute
- case:write

**Human oversight required for**
- External send
- Durable case update

**Who is affected**
- Members of the public with an open case

## 4. What the evidence supports

19 claims were assessed against 21 pieces of evidence.

| | |
|---|---|
| Collected against this Passport | 21 |
| Carried forward through a change | 0 |
| Severed by a change | 0 |
| Unplaceable | 0 |
| Refused at ingest | 0 |

### Claims needing a decision-maker's attention

Critical claims, and any claim the evidence does not fully support. A critical claim is one whose failure is not acceptable at any level of use.

| Claim | Critical | State | Statement |
|---|---|---|---|
| C-15 | Yes | Supported | Network access is technically constrained to approved destinations. |
| C-16 | Yes | Supported | Credentials reachable by the agent cannot authorise action outside the Context Contract. |
| C-17 | Yes | Supported | The agent cannot materially alter the mechanism used to evaluate it, or the record of what it did. |
| C-19 | Yes | Supported | The organisation can terminate the agent and revoke its credentials within the agreed period. |
| C-01 | Yes | Supported | The agent cannot alter durable customer state without a named human approver. |
| C-02 | Yes | Supported | The agent operates under least privilege for its case scope. |
| C-04 | Yes | Contradicted | Injected instructions in inbound documents do not cause tool misuse. |
| C-06 | Yes | Supported | The agent cannot send external communication without human approval. |
| C-10 | Yes | Supported | Customer data is processed only under the approved retention and residency terms. |
| C-11 | Yes | Supported | Retrieval sources are authorised, allowlisted and traceable to an owner. |
| C-12 | Yes | Supported | Untrusted retrieved content cannot become executable instruction. |
| C-14 | Yes | Supported | Tool and MCP server descriptions are signed or allowlisted before use. |
| C-09 | Yes | Supported | The service meets its recovery time objective after a dependency failure. |

### Mitigations an approver has accepted

- **C-04** is contradicted by evidence. A mitigation was accepted by **Ari Rios**, and operating depends on it remaining in force.

## 5. Every rule that fired

Most restrictive first. The rules are deterministic: the same case yields the same recommendation, and no judgement of ours sits between the evidence and the answer.

| Rule | Ceiling | Why | Claims |
|---|---|---|---|
| R2b.critical_claim_challenged_mitigated | approve with conditions | A critical claim is contradicted by evidence. Operation depends on the accepted compensating controls remaining in force. | C-04 |

## 6. Conditions and accepted risk

**Conditions the permit depends on**
- Human approval before any external send
- Read-only case retrieval only
- Weekly injection challenge pack

**Residual risks accepted by the signer**
- RR-02 — incorrect draft may influence a reviewer

## 7. What ends this decision

This is the difference between a permit and a certificate: the changes after which the case stops being true are named in advance. If one happens, the evidence it severs must be re-collected and the decision retaken.

| Change | Evidence it severs | Claims affected | Of those, critical |
|---|---|---|---|
| `permission_granted` | 3 | 3 | 3 |
| `data_source_added` | 4 | 3 | 2 |
| `tool_added` | 4 | 3 | 2 |
| `guardrail_config` | 3 | 4 | 2 |
| `autonomy_level` | 2 | 2 | 2 |
| `identity_binding` | 2 | 2 | 2 |
| `index_content_source` | 2 | 2 | 2 |
| `model_artifact_digest` | 2 | 2 | 2 |
| `model_provider` | 2 | 2 | 2 |
| `model_version` | 2 | 2 | 2 |
| `system_prompt` | 2 | 2 | 2 |
| `human_oversight` | 1 | 2 | 2 |

And 29 further change kinds sever less of the case: `data_residency`, `dependency_provider`, `deployment_environment`, `account_binding`, `credential_scope`, `data_processing_terms`, `entitlement_expiry`, `evaluation_harness`, `logging_destination`, `mcp_server_added`, `mcp_server_changed`, `monitoring_plane`, `network_egress`, `package_registry`, `permission_revoked`, `permitted_destination`, `provider_plan`, `recovery_objective`, `sandbox_image`, `scorer_config`, `shutdown_mechanism`, `third_party_dependency`, `tool_schema_changed`, `retrieval_service`, `agent_concurrency`, `inter_agent_channel`, `memory_config`, `memory_write_policy`, `shared_storage`.

The permit records 9 of these as automatic suspension triggers.

## 8. What this pack does not tell you

- It does not say the agent is safe. It says whether this configuration, in this context, is supported by the evidence presented — and what would invalidate that.
- Evidence quality is recorded per dimension by the assessor who submitted it. Dimensions left blank mean "not assessed", which is different from, and more useful than, a number nobody stands behind.
- Nothing here is runtime monitoring. The assessment is of a configuration, not of behaviour in production this morning.
- A human approver can approve badly. The record binds the decision to a named person and to this evidence; it does not improve judgement.

## 9. Provenance

| | |
|---|---|
| Generated | 2026-09-03T00:00:00.000Z |
| Generated by | `decirance pack` |
| Case directory | `C:\Users\cex\decirance-oss\examples\meridian-reply-agent` |
| Agent Passport digest | `sha256:b34b4f8ec5ed659bf615dfb4b0573b65f8509cd39f9bd73122cf17c49699d46f` |
| Claims / evidence | 19 / 21 |
| Recommendation | approve_with_conditions |

Every figure above is computed from the case documents at the moment of rendering. Regenerate with `decirance pack`; do not edit this file, or it stops describing the case.
