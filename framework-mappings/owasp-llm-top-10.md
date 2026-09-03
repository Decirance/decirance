<!-- SPDX-License-Identifier: CC-BY-4.0 -->
# OWASP Top 10 for LLM Applications mapping

**Source:** OWASP Top 10 for LLM Applications, 2025 list (LLM01:2025 – LLM10:2025),
<https://genai.owasp.org/llm-top-10/>
**Checked:** 3 September 2026 · **Mapping version:** 0.1.0

The OWASP list is a catalogue of vulnerability classes. Decirance is not a
control that mitigates them — it is the record of whether someone has evidence
that they *are* mitigated, and of what stops being true when the agent changes.
So each row below reads: *this vulnerability class corresponds to these claims,
and here is what the reference case can show for them.*

Where the honest answer is "nothing", the row says so. A mapping with ten green
ticks against a threat list nobody tested would be worse than no mapping.

## Coverage

| OWASP entry | Claims | What the reference case shows |
|---|---|---|
| **LLM01:2025** Prompt Injection | C-04, C-12 | H-01, H-04. Injection-challenge pack (E-087); untrusted content cannot become executable instruction. C-04 is *challenged* in the reference case — E-112 contradicts it — and that is deliberate |
| **LLM02:2025** Sensitive Information Disclosure | C-03, C-10 | Retrieval bounded to the assigned case; retention and residency terms bound in the Passport and re-checked on commercial change |
| **LLM03:2025** Supply Chain | C-11, C-14 | MCP server fingerprinting including tool *descriptions*; retrieval source allowlist with a named owner |
| **LLM04:2025** Data and Model Poisoning | C-11, C-12, C-13 | H-03, H-05. Corpus allowlisting, memory writer control and rollback. No pre-training or fine-tuning claim — the reference agent uses a hosted model it does not train |
| **LLM05:2025** Improper Output Handling | C-01, C-06 | **Partial.** The gate on durable state change and outbound send bounds what a malformed output can *do*. Decirance does not inspect or sanitise output content, and nothing here should be read as saying it does |
| **LLM06:2025** Excessive Agency | C-01, C-02, C-06 | The closest fit in the list. The permit invariant in `src/permit-invariant.ts` is exactly this control expressed as a decidable property: no action is authorised outside an operating state, a bound configuration, satisfied conditions and the permitted set |
| **LLM07:2025** System Prompt Leakage | — | **Not covered.** The Passport binds `prompt_digest`, so a changed system prompt is detected as a material change, but no claim addresses disclosure of prompt contents |
| **LLM08:2025** Vector and Embedding Weaknesses | C-03, C-11 | **Partial.** Retrieval scope and source authorisation are claimed. Embedding-space attacks — inversion, cross-tenant leakage through a shared index — are not modelled |
| **LLM09:2025** Misinformation | C-07 | **Partial.** C-07 covers the narrow case that degraded retrieval must not produce unsourced drafts. General factual accuracy is not claimed, and is not the kind of thing this framework can settle |
| **LLM10:2025** Unbounded Consumption | — | **Not covered.** No hazard or claim addresses cost, rate or denial-of-wallet. C-09 covers recovery time after a dependency failure, which is a different property |

## Gaps, stated plainly

Three entries have no coverage at all: **system prompt leakage**, **unbounded
consumption**, and the embedding-specific half of **vector and embedding
weaknesses**. Two more are partial in ways that matter — Decirance bounds what
an improperly handled output can do without inspecting the output, and says
nothing about general accuracy.

These are scoping decisions in the reference case, not findings that the risks
are absent. The Meridian agent drafts replies under human review and does not
execute code, hold a budget, or serve multiple tenants from one index. An agent
that did any of those would need claims this case does not contain.

## What this mapping does not claim

It does not claim conformance, and OWASP does not certify anything. Nothing in
this repository has been reviewed by OWASP or anyone connected to the project.

It also does not claim that a supported claim means the vulnerability is
absent. A claim is supported when evidence exists for it and nothing credible
contradicts it — which is a statement about the state of the evidence, not a
proof about the system. That distinction is the whole point of the framework
and it survives into this mapping.
