# NCSC mapping

**Sources:** NCSC guidance on managing the cyber risk of agentic AI; UK AI
Cyber Security Code of Practice.
**Checked:** 3 September 2026 · **Mapping version:** 0.1.0

This maps Decirance claims and controls to the themes those documents raise. It
is a claim about someone else's document, so it records what was checked and
when. A mapping that silently goes stale asserts compliance with a document
that has moved.

Themes are recorded as identifiers in `threat-library/hazards.json` rather than
quoted text, so the pack does not break when wording changes.

## Coverage

| NCSC theme | Addressed by | Evidence in the reference case |
|---|---|---|
| Threat modelling | H-01, H-02, H-03 | Hazard set with severity and addressing claims |
| Deterministic safeguards | C-01, C-12, C-14 | Reviewer gate, tool allowlist, MCP manifest signing |
| Gated approvals | C-01, C-06 | E-093 reviewer gate on outbound action |
| Human oversight | C-01, C-06 | Human review workflow in the Passport; permit attestation |
| Proportional autonomy | C-02 | Autonomy level bound in the Context Contract and checked against the Passport |
| Explicit red lines | — | `prohibited_actions` in the Context Contract; breach caps at reject |
| Least-privilege, short-lived credentials | C-02 | E-061 case access role matrix |
| Unique agent identity | C-02 | `identity` binding in the Passport |
| Immutable logs | C-05 | E-069 audit trail sample; append-only permit events |
| Near-real-time telemetry | C-05 | Partial — runtime telemetry ingestion is not built |
| Incident response | H-07, H-08 | Partial — stop conditions recorded, no incident linkage |
| Emergency shutdown | H-07 | Partial — permit suspension exists, no runtime kill path |
| Sandboxing | H-09 | **Not covered** |
| Supply-chain integrity | C-14, C-11 | MCP fingerprinting, retrieval source allowlist, model artefact digest |

## Gaps, stated plainly

`uncoveredThemes()` in `src/scenario-pack.ts` computes this rather than leaving
it to be noticed, and the Technical Pack prints it.

**Sandboxing** has no hazard or claim in the reference case. The Meridian agent
is drafting-only, so isolation was not modelled — which is a scoping decision,
not evidence that isolation is unnecessary. An agent that executes code would
need it.

**Telemetry, incident response and emergency shutdown** are partial. Decirance
records that these controls are required and whether evidence exists; it does
not ingest runtime events or trigger a shutdown. That is deliberate — Decirance
sits out of the request path — but it means the evidence for these themes comes
from systems Decirance reads rather than systems it operates.

## What this mapping does not claim

It does not claim conformance. NCSC guidance is guidance, not a certifiable
standard, and no artefact here has been reviewed by NCSC or anyone connected to
it. The mapping says: *these themes correspond to these claims, and here is the
evidence for each*. Whether that satisfies a given organisation's obligations
is that organisation's judgement.
