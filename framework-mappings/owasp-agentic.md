<!-- SPDX-License-Identifier: CC-BY-4.0 -->
# OWASP Top 10 for Agentic Applications mapping

**Source:** OWASP Top 10 for Agentic Applications for 2026, OWASP GenAI Security
Project — Agentic Security Initiative, published 9 December 2025.
**Checked:** 5 October 2026 · **Mapping version:** 0.1.0

This maps the claims in the reference Deployment Case to the ten ASI categories,
and — more usefully — to the change kinds that **sever the evidence** for each.
It is a claim about someone else's document, so it records what was checked and
when. A mapping that silently goes stale asserts alignment with a document that
has moved.

> **A note on the source text.** The identifiers and titles below were taken
> from the published list. Where the OWASP resource page did not render the
> category titles, they were cross-checked against three independent
> secondary summaries that agreed. If a title here differs from the PDF, the
> PDF is right and this file is wrong: open an issue.
>
> OWASP also publishes an earlier threat taxonomy, *Agentic AI — Threats and
> Mitigations* (T1–T15), which the 2026 list cross-maps in its appendices. This
> mapping follows the ASI list because that is the one a buyer will ask about.

## Why this mapping is shaped differently

A control mapping says "we do something about that". It cannot say whether the
something is still true. Each row below therefore carries a third column that
no framework mapping usually has: **the change kinds, from the 45-kind material
change taxonomy, after which the evidence for that row no longer holds.**

That column is the product. A tool allowlist assessed in March is not a tool
allowlist in June if a tool was added in April, and the point of Decirance is
that the April change invalidates the March evidence by name.

## Coverage

| ASI | Category | Claims in the reference case | Evidence severed by |
|---|---|---|---|
| ASI01 | Agent Goal Hijack | C-04, C-12 (both critical), C-06 | `system_prompt`, `model_version`, `index_content_source`, `mcp_server_added`, `guardrail_config` |
| ASI02 | Tool Misuse & Exploitation | C-01, C-02, C-06 (critical), C-05 | `tool_added`, `permission_granted`, `autonomy_level`, `human_oversight` |
| ASI03 | Identity & Privilege Abuse | C-02, C-16 (critical), C-19 | `permission_granted`, `credential_scope`, `identity_binding`, `account_binding` |
| ASI04 | Agentic Supply Chain Vulnerabilities | C-11, C-14 (critical) | `mcp_server_added`, `mcp_server_changed`, `tool_schema_changed`, `dependency_provider`, `model_artifact_digest`, `package_registry` |
| ASI05 | Unexpected Code Execution (RCE) | C-12 (critical) — **partial** | `tool_added`, `sandbox_image`, `package_registry` |
| ASI06 | Memory & Context Poisoning | C-03, C-11, C-13, C-12 (critical) | `index_content_source`, `memory_write_policy`, `data_source_added` |
| ASI07 | Insecure Inter-Agent Communication | C-18 | `agent_concurrency`, `shared_storage`, `inter_agent_channel` |
| ASI08 | Cascading Failures | C-07, C-09 (critical), C-08 | `dependency_provider`, `recovery_objective` |
| ASI09 | Human-Agent Trust Exploitation | C-01, C-06 (critical) — **partial** | `human_oversight`, `autonomy_level` |
| ASI10 | Rogue Agents | C-17, C-19 (critical), C-15 | `logging_destination`, `monitoring_plane`, `evaluation_harness`, `shutdown_mechanism`, `network_egress` |

Hazards in `threat-library/hazards.json` carry the same ground from the attack
side: H-01 and H-06 under ASI01 and ASI09, H-02 under ASI02 and ASI03, H-03 and
H-04 under ASI04 and ASI06, H-05 under ASI06, H-07 and H-09 under ASI08, H-08
under ASI10, H-10 under the commercial conditions no ASI category covers.

## Gaps, stated plainly

**ASI05 — Unexpected Code Execution is partial, and the gap is structural.** The
reference agent drafts text for human review and executes no code, so C-12
covers "untrusted content cannot become executable instruction" at the
instruction layer and nothing covers process isolation, because there is no
process to isolate. An agent that runs generated code needs claims about its
sandbox, and `containment.sandbox_image` in the Agent Passport exists for
exactly that — unused in this case. Reading this mapping as "RCE is handled"
would be the single worst misreading available.

**ASI09 — Human-Agent Trust Exploitation is partial in the way that matters
most.** C-01 and C-06 require a human approver before durable state changes and
external sends, and E-093 evidences the gate. Neither claim says anything about
whether the approver was shown a *faithful* summary of what they were
approving. That is the live attack in this category, and Decirance records the
oversight workflow without assessing its quality. A reviewer approving 200
drafts an hour is a control on paper.

**ASI07 — Insecure Inter-Agent Communication rests on one non-critical claim.**
C-18 covers unauthorised shared state between concurrent instances of the *same*
agent. Multi-agent systems — several different agents with separate authority,
negotiating — are out of scope for this case and for the reference graph. The
Passport can record `inter_agent_channel`, so the change detection works; the
assurance argument does not exist.

**ASI10 — Rogue Agents is the category Decirance is least modest about, and it
should be read carefully.** C-17 and C-19 are unusual claims and they matter:
the agent must not be able to alter the mechanism that evaluates it or the
record of what it did, and the organisation must be able to stop it inside an
agreed period. Those are assessed against the logging destination, monitoring plane,
evaluation harness and shutdown mechanism in the Passport. What is *not* here is
runtime detection of behavioural drift. Decirance decides whether an agent may
operate and what invalidates that decision; it is not a monitoring product, and
"rogue agent detected at 03:00" is not an output it has.

**No category covers commercial conditions.** C-10 (retention and residency
terms) and H-10 have no ASI home, because the list is a security document. A
permit that lapses when a data processing term changes is still a real
deployment control, and the taxonomy simply does not ask about it.

## What a mapping cannot do

Alignment with a list of risk categories is not evidence that any of them is
mitigated in your deployment. Each row above points at claims in a **fictional**
reference case, with evidence collected against one Agent Passport. For a real
agent the claims will differ, the evidence is yours to collect, and the honest
output of the method is often "this is not supported yet".

Decirance is not affiliated with OWASP, and nothing here is endorsed by the
OWASP GenAI Security Project.
