# Decirance

**The open assurance framework for deciding whether a specific AI agent should be allowed to operate in a specific context — and for determining what must be reassessed when that context changes.**

Decirance does not declare an agent safe. It assesses whether a **specific agent configuration** can be authorised for a **specific purpose, environment and period**, under stated conditions, and records who accepted the residual risk.

When the agent changes — a model version, a tool, a permission, an MCP server, a data source, a contractual term — Decirance determines which assurance claims are affected, preserves the evidence that still holds, and generates the minimum reassessment required.

---

## Why this exists

A penetration test does not define acceptable autonomy. A model evaluation does not verify production permissions. A policy does not prove a control is implemented. A dashboard does not record who authorised deployment. And passing a test once does not prove the deployed system is still the system that was tested.

The gap is not a lack of evidence. It is that nothing connects the evidence to a decision, and nothing tells you which evidence survives a change.

---

## Try it in two minutes

```bash
git clone https://github.com/Decirance/decirance.git
cd decirance && npm install

# Scan a project for agent frameworks, model providers and MCP servers
npm run scan -- /path/to/your/agent-project

# Run the reference assessment and its four change scenarios
npm test
```

No account, no server, no telemetry. The scanner reads only files a repository
normally contains, and it never reads a `.env` — environment variable *names*
are informative, values are not.

---

## What is in this repository

| Path | Contents |
|---|---|
| `schemas/` | Agent Passport, Context Contract, Evidence Manifest, Deployment Permit — JSON Schema |
| `src/` | The reference assurance engine. Dependency-free TypeScript, runs in Node or a browser |
| `cli/` | `decirance scan`, and the verification harness |
| `examples/meridian-reply-agent/` | A complete, reproducible reference assessment |
| `threat-library/` | Hazards and executable scenarios, mapped to NCSC guidance themes |
| `framework-mappings/` | [NCSC mapping](framework-mappings/ncsc.md); others planned |
| `docs/` | [Methodology](docs/methodology.md), [quickstart](docs/quickstart.md), [dependency review sheet](docs/dependency-review.md) |

---

## The six objects

| Object | Purpose |
|---|---|
| **Agent Passport** | The exact system being assessed — model, prompt digest, tools, permissions, MCP servers, data, entitlement |
| **Context Contract** | The conditions it is *intended* to operate under — purpose, permitted and prohibited actions, autonomy, oversight |
| **Assurance Claim** | A falsifiable statement that must hold for deployment |
| **Evidence** | What supports or challenges each claim, and the configuration it was collected against |
| **Assurance Graph** | Typed edges connecting hazards, claims, controls and evidence — each recording what severs it |
| **Deployment Permit** | The human-authorised, time-bounded authority to operate |

A Passport plus a Context Contract is the unit of assurance. Evidence is valid
only for the pair it was collected against, which is enforced structurally
rather than by convention.

---

## The Assurance Delta

The distinctive part. Given two Passports, the engine classifies every
difference against a material-change taxonomy, walks the graph, and reports
what survived.

```
Detected change
  [permission_granted] Permission "case:write" added.

  ! C-01  INVALIDATED  cannot alter durable state without a named approver
  ! C-02  INVALIDATED  operates under least privilege
    C-03  PRESERVED    retrieval limited to the assigned case
    C-05  AFFECTED     via C-05 -[derives_from]-> C-01

  preserved 10 · invalidated 2 · reassessment avoided 71%
  Permit: active -> suspended
```

Three properties are deliberate:

**Deterministic.** No model is consulted. The same inputs always produce the
same output, because the result gates a permit a named human authorises.

**Fails closed.** A configuration difference the taxonomy cannot classify
forces a full reassessment. Treating an unrecognised change as harmless is the
one failure this must never produce.

**Reports what survived.** `preserved` is the commercially load-bearing half —
it is what turns a reassessment into a targeted one.

---

## MCP

A server's fingerprint **includes its tool descriptions**.

A description is text the model reads as instruction. Change it and the agent's
belief about what a tool does changes, while endpoint, schema, permissions and
version all stay identical — so package pinning, endpoint allowlisting and
version comparison all pass. If descriptions sat outside the fingerprint, the
most likely MCP poisoning attack would be invisible to the system built to
catch it.

```
case-store
  before sha256:9fd5cc6864caed12269597c491196460…
  after  sha256:7ed4cb4c160fd172100982791d8040be…  CHANGED
  endpoint unchanged · version unchanged · scopes unchanged
```

---

## No score

Decirance never produces a risk number. A recommendation is one of four named
outcomes — `approve`, `approve_with_conditions`, `supervised_pilot`, `reject` —
capped by named rules, each reporting the claims that triggered it and which
rule was binding.

Evidence quality is recorded across five dimensions and **never averaged**.
Strong provenance concealing weak ecological validity is exactly the failure an
average produces: one says an artefact is traceable, the other says it
resembles production, and they are not interchangeable.

---

## What this cannot do

Publishing limitations is part of the method.

- Testing cannot establish safety. It establishes that specified failures did not occur in specified conditions.
- Unknown attack methods remain unknown. A preserved claim means no *modelled* dependency was severed.
- The dependency judgements — which changes sever which evidence — are curated by humans. Their correctness is the open research question, not a solved part.
- A permit is bounded by its recorded context and says nothing outside it.
- Runtime behaviour can diverge from tested behaviour.
- Human approvers can approve badly. Decirance records the decision and its basis; it does not improve judgement.
- Attestation and receipt digests are **content-addressed SHA-256, not signatures**. They detect an altered record; they prove nothing about authorship. Cryptographic signing is on the roadmap.

---

## Status

**v0.1 — early.** The schemas, engine, taxonomy and reference assessment are
real and runnable. They have not been validated by independent reviewers, and
the interfaces will change. See [ROADMAP.md](ROADMAP.md).

Decirance is not a regulator, a certification body, or a substitute for your
own governance. It produces a recommendation; your accountable owner decides.

---

## Contributing

The most valuable contribution right now is **disagreement about the graph**.
If you think a `severedBy` list in the reference assessment is wrong, open an
issue — that is the claim the whole method rests on. See
[CONTRIBUTING.md](CONTRIBUTING.md).

## Licensing

Decirance is **open core**, and the boundary is stated rather than implied.

| | |
|---|---|
| Code, schemas, taxonomies, adapters, examples | [Apache 2.0](LICENSES/Apache-2.0.txt) |
| Methodology and documentation in `/docs` | [CC BY 4.0](LICENSES/CC-BY-4.0.txt) |
| The Decirance name and logo | Not licensed — see [TRADEMARKS.md](TRADEMARKS.md) |
| The hosted platform | Commercial, and not in this repository |

Full detail in [LICENSING.md](LICENSING.md).

Apache 2.0 for code because an organisation integrating this into its own
security or governance systems must not inherit licensing obligations across
them, and because the explicit patent grant is what enterprise legal review
actually asks about. CC BY 4.0 for documentation so a department, university or
trainer can copy the methodology into internal policy, adapt it and translate
it, with attribution.

Saying "Decirance is open source" without the boundary would imply the whole
product is here. It is not — the managed platform, evidence registry, access
control, signing service, connectors and sector packs are commercial.

Contributions are certified by a [Developer Certificate of
Origin](https://developercertificate.org/) sign-off (`git commit -s`), not a
CLA. See [CONTRIBUTING.md](CONTRIBUTING.md).
