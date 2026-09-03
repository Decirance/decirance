# Decirance Agent Assurance Methodology

**Version 0.1 · September 2026**

Every claim in this document names the code that implements it. A methodology
whose propositions cannot be executed is a position paper.

---

## 1. The problem

Organisations can already scan applications, evaluate models, monitor agents,
manage identities, enforce runtime policy and record risks. None of that
answers the question an accountable person actually has to sign:

> May **this** agent operate in **this** context?

The gap is not missing evidence. It is that:

- a penetration test does not define acceptable autonomy;
- a model evaluation does not verify production permissions;
- a policy does not prove a control is implemented;
- a dashboard does not record who authorised deployment;
- **passing a test once does not prove the deployed system is still the system that was tested.**

The last is the one this method exists for.

## 2. The unit of assessment

> Decirance does not declare an agent safe. It assesses whether a **specific
> agent configuration** can be authorised for a **specific purpose, environment
> and period**, under stated conditions.

An Agent Passport plus a Context Contract *is* the unit. Evidence is valid only
for the pair it was collected against, and that is enforced structurally: every
evidence record carries the passport and contract digests it was produced
under.

*Implemented in* `src/passport-io.ts`, `src/context-contract.ts`.

## 3. The objects

| Object | Purpose |
|---|---|
| Agent Passport | The exact system: model, prompt digest, tools, permissions, MCP servers, data, entitlement |
| Context Contract | What it is *permitted* to do: purpose, permitted and prohibited actions, autonomy, oversight |
| Assurance Claim | A falsifiable statement that must hold for deployment |
| Evidence | What supports or **challenges** a claim, and the configuration it was collected against |
| Assurance Graph | Typed edges connecting hazards, claims, controls and evidence, each recording what severs it |
| Deployment Permit | The human-authorised, time-bounded authority to operate |

## 4. Claim states

`not_assessed`, `unsupported`, `partially_supported`, `supported`,
`challenged`, `not_applicable`, `excepted`, `invalidated`.

`challenged` is distinct from `unsupported` and the distinction is
load-bearing. A claim with no evidence and a claim contradicted by evidence are
opposite epistemic situations, and merging them lets a contradiction be
resolved by collecting more supporting evidence — which is precisely what must
not happen.

*Implemented in* `src/recommendation.ts` (`deriveClaimState`).

## 5. Evidence quality

Five dimensions, recorded separately and **never averaged**:

| Dimension | Question | Derivable from a log? |
|---|---|---|
| Provenance | Can this be traced to the run and code that produced it? | Yes |
| Coverage | How much of the relevant space was exercised? | Yes |
| Construct validity | Does the test actually measure the claim? | **No** |
| Ecological validity | Did the environment resemble production? | **No** |
| Repeatability | Would a re-run produce the same result? | Partly |

Averaging is refused because strong provenance concealing weak ecological
validity is exactly what a mean hides: one says an artefact is traceable, the
other says it resembles production, and they are not interchangeable.

Construct and ecological validity are human judgements. The Inspect adapter
**requires** them as inputs and will not invent them — a fabricated quality
score is worse than an absent one.

Freshness is deliberately not a sixth score. It is a validity window with a
date, and scoring a date hides when the window closed.

*Implemented in* `src/receipt.ts`, `src/inspect-adapter.ts`.

## 6. Decision rules

Four outcomes: `approve`, `approve_with_conditions`, `supervised_pilot`,
`reject`.

Rules are expressed as **ceilings**, not scores. Each rule that fires caps how
favourable the outcome may be; the result is the most restrictive surviving
cap. That shape makes it structurally impossible for a quantity of good
findings to lift a recommendation past a cap that one serious finding imposed.

| Rule | Ceiling |
|---|---|
| `R1.red_line_breach` — a prohibited capability is actually held | reject |
| `R2.critical_claim_challenged` — contradicted, no accepted mitigation | reject |
| `R3.critical_claim_unsupported` | supervised pilot or reject, by policy |
| `R5.mandatory_condition_incomplete` | supervised pilot |
| `R6.non_critical_gap` | approve with conditions |
| `R7.unaccepted_material_residual_risk` | approve with conditions |
| `R0.no_assessable_claims` | reject |

R0 matters: an empty assurance case justifies nothing. Defaulting to approve in
the absence of evidence would invert the premise.

Every recommendation reports which rules fired, which claims triggered each,
and which rule was **binding**.

*Implemented in* `src/recommendation.ts`.

## 7. Dependency judgement

Every edge in the graph records `severedBy` — the material change kinds that
break it.

**This is the method.** The traversal is mechanical; deciding that granting
`case:write` invalidates the human-approval evidence but not the retrieval-scope
evidence is a human judgement, and it is the part that can be wrong.

*Implemented in* `src/invalidation.ts`. *Curated in* `examples/`.

## 8. Material change taxonomy

Thirty-one change kinds across four surfaces: cyber, operational resilience,
commercial entitlement, and contamination.

Two are worth calling out.

**Commercial entitlement.** A provider that starts retaining prompts, a lapsed
agreement, a move from an enterprise account to a personal key — none changes a
line of the agent, and all can invalidate assurance. This is not licence
management: no seats, no renewals, no spend.

**MCP tool descriptions.** A description is text the model reads as
instruction. Change it and the agent's belief about a tool changes while
endpoint, schema, permissions and version stay identical, so package pinning,
endpoint allowlisting and version comparison all pass. Descriptions are
therefore inside the server fingerprint, and a description-only change is its
own finding kind.

*Implemented in* `src/material-change.ts`, `src/mcp.ts`.

## 9. Selective invalidation

Given two passports, the engine classifies every difference, walks the graph,
and reports what survived.

Three properties are deliberate:

**Deterministic.** No model is consulted. Identical inputs always produce
identical output, because the result gates a permit a named human authorises.

**Fails closed.** A difference the taxonomy cannot classify forces a full
reassessment. Treating an unrecognised change as harmless is the one failure
this must never produce.

**Reports what survived.** `preserved` is the commercially load-bearing half —
it is what turns a reassessment into a targeted one.

One subtlety: scope staleness is reported but does **not** drive invalidation.
After any change every artefact predates the new passport, so treating
staleness as invalidation would collapse the whole case and destroy the
selectivity that is the entire point.

*Implemented in* `src/invalidation.ts`. *Verified in* `cli/verify.ts`.

## 10. Human accountability

Decirance recommends. A named person decides.

An authorisation binds the signer to what they were *shown* — the exact
passport, context, graph and ruleset digests, the recommendation, the
conditions and the accepted residual risks at the moment of signing. An
approval that floats free of its evidence is a signature on a blank page.

Refused transitions are recorded, not discarded. A history of only what
succeeded is not a history.

*Implemented in* `src/attestation.ts`, `src/permit-state-machine.ts`.

## 11. Limitations

Published because a methodology that hides them is marketing.

- Testing cannot establish safety. It establishes that specified failures did not occur under specified conditions.
- A preserved claim means no **modelled** dependency was severed. Unknown attack paths remain unknown.
- The dependency judgements are curated by humans and **have not been independently validated**. This is the open research question, not a detail.
- A permit is bounded by its recorded context and says nothing outside it.
- Runtime behaviour can diverge from tested behaviour.
- Human approvers can approve badly. This records the decision and its basis; it does not improve judgement.
- Digests are content-addressed SHA-256, not signatures. They detect alteration; they prove nothing about authorship. Cryptographic signing is on the roadmap.

## 12. What would make this a standard

Nothing here is a standard yet. It would need independent reviewers publishing
where they disagree with the reference graph, a second organisation
maintaining a scenario pack, and a versioning policy the original authors do
not control alone.

See [GOVERNANCE.md](../GOVERNANCE.md).

---

## Proposition to proof

| Claim | Where to check it |
|---|---|
| Decisions are deterministic | `src/recommendation.ts` · `cli/verify.ts` |
| Unknown changes fail closed | `src/material-change.ts` · `cli/verify.ts` |
| Evidence is context-bound | `schemas/evidence-manifest.schema.json` · `examples/` |
| Contradiction outranks support | `src/invalidation.ts` · `cli/verify.ts` |
| Change triggers selective reassessment | `src/invalidation.ts` · `examples/*/deltas/` |
| Humans remain accountable | `src/permit-state-machine.ts` · `src/attestation.ts` |
| MCP descriptions are material | `src/mcp.ts` · `cli/verify.ts` |
| Limitations are published | This section, README, GOVERNANCE.md |
