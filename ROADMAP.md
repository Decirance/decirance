# Roadmap

Dated statements are intentions, not commitments.

## v0.1 — now

Schemas, engine, material-change taxonomy, MCP fingerprinting, Inspect adapter,
CLI scanner, threat library, one complete reference assessment with four change
scenarios.

**Interfaces will change.** Nothing here is stable yet.

## v0.2 — next

- **Independent review of the reference graph.** The single most important item. Until people outside the project have disputed the `severedBy` judgements, the method is unvalidated.
- Cryptographic signing for attestations and receipts, replacing content-addressed tamper evidence.
- Framework mappings for NIST AI RMF, ISO/IEC 42001, OWASP agentic guidance and MITRE ATLAS.
- A second reference assessment for a differently shaped agent.
- `decirance assess` and `decirance diff` as first-class CLI verbs.

## v0.3 — later

- AgentDojo adapter alongside Inspect.
- Evidence manifest signing and cross-organisation evidence reuse.
- A GitHub Action that runs a delta on pull request and reports what a change would invalidate.
- Schema versioning and deprecation policy.

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
