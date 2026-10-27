# Roadmap

Dated statements are intentions, not commitments.

## v0.1 — now

Checked against the code on 27 October 2026. Four items that sat under "next"
had shipped, and this section understated what exists — a roadmap that lags the
repository misleads in both directions at once.

- Schemas for Agent Passport, Context Contract, Evidence Manifest and Deployment Permit, each validated against the bundled examples with a negative control.
- The engine: 45-kind material-change taxonomy, Assurance Delta with tri-state impact, recommendation ceilings, a 12-state permit machine with an exhaustively decided authority invariant, canonical digests, MCP fingerprinting, organisation baseline and policy containment, criticality, authority and tool-authority contracts, the evidence ingestion contract and an Inspect adapter.
- CLI: `init`, `assess`, `permit`, `apply`, `pack`, `diff`, `scan`, `validate`, `verify`.
- A GitHub Action that assesses a case in CI and fails the build below a named level.
- Six framework mappings: OWASP Top 10 for Agentic Applications, OWASP LLM Top 10, NCSC, NIST AI RMF, ISO/IEC 42001, MITRE ATLAS.
- One complete reference assessment with five change scenarios and a generated Deployment Case pack.
- The Method Validation Pack: 17 scenarios across two agent cases, with the metrics and the review workflow. Its labels are the team's own, so its numbers are not quotable.
- The assistant boundary: the proposal record, its review state machine and the gate that stops unaccepted model output reaching the engine. No assistant exists yet — only the boundary it will have to pass.

**Interfaces will change.** Nothing here is stable yet, and there is no schema
versioning or deprecation policy — which is itself on the list below.

## v0.2 — next

- **Independent review of the reference graph and of the validation labels.** The single most important item, and nothing else on this list substitutes for it. The pack in `validation/` now makes it a reviewable job rather than an invitation: 17 scenarios, a template, and an adjudication step. Until people outside the project have disputed these judgements, the method is unvalidated and the numbers stay unquotable.
- Cryptographic signing for attestations and receipts, replacing content-addressed tamper evidence. Sigstore-compatible bundles rather than anything invented here.
- A tagged release, a changelog, and a published package. `npx decirance` is promoted in the README and does not work yet, because nothing is published.
- Schema versioning and deprecation policy, before any schema is called stable.
- The AI assistant itself, against the boundary already built: extraction and claim-mapping proposals with a measured benchmark, which needs a live provider and a labelled set.
- Evidence ingestion as a product surface. The contract and one adapter exist in the engine and nothing calls them.
- A third change family the engine cannot represent today: evidence expiry, an operational control failure, and a baseline revision. The validation pack specifies all three and scores none of them.

## v0.3 — later

- AgentDojo adapter alongside Inspect.
- OpenTelemetry ingestion, with a stated mapping from runtime events to change kinds.
- CycloneDX ML-BOM as a component-provenance source.
- Evidence manifest signing and cross-organisation evidence reuse.
- A conformance fixture suite, so a third-party implementation can prove it agrees.
- PR comments from the Action, which today writes only a job summary.
- A reproducible container quickstart.

## Explicitly not planned here

These belong in a commercial product, not the open core, and saying so is part
of keeping the boundary honest:

- A hosted multi-tenant platform, SSO, RBAC or delegated authority.
- Automated cloud and SaaS connectors, continuous monitoring, notifications.
- Runtime enforcement or an inline gateway.
- Portfolio reporting across many agents.

## Never

- A composite risk score.
- Model-generated deployment decisions without deterministic rules and a named human.
- Anything that makes an unverifiable input look like a verified zero.
