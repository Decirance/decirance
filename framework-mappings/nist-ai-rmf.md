<!-- SPDX-License-Identifier: CC-BY-4.0 -->
# NIST AI Risk Management Framework mapping

**Source:** NIST AI RMF 1.0 (NIST AI 100-1), Core functions GOVERN, MAP,
MEASURE, MANAGE and their categories,
<https://airc.nist.gov/AI_RMF_Knowledge_Base/AI_RMF/Core_And_Profiles/5-sec-core>
**Checked:** 3 September 2026 · **Mapping version:** 0.1.0

The AI RMF is a framework for organising risk management activity. Decirance
implements a narrow slice of it: the part where a decision about a *specific
deployment* has to be justified from evidence, and re-justified when the
deployment changes. Most of GOVERN is organisational and Decirance does not
touch it.

Mapping is at category level (GOVERN 1, MAP 2, …) rather than subcategory,
because a subcategory-level claim would imply a line-by-line assessment that has
not been done.

## GOVERN

| Category | Addressed by | Notes |
|---|---|---|
| **GOVERN 1** Policies and processes for mapping, measuring, managing AI risk | Permit lifecycle; red lines | The 10-state permit machine in `src/permit-state-machine.ts` is the process; `prohibited_actions` in the Context Contract are the policy limits, and a breach caps the recommendation at reject |
| **GOVERN 2** Accountability structures | Permit attestation; accountable owner | Every permit names the person who accepted the residual risk. The recommendation is explicitly not an approval — section 6 of the Assurance Pack records who decides |
| **GOVERN 3** Workforce diversity, equity, inclusion, accessibility | — | **Not covered.** Out of scope for a deployment-authorisation tool |
| **GOVERN 4** Culture that considers and communicates AI risk | Field guide | **Partial.** `src/field-guide.ts` gives each claim a plain-language meaning, who to ask, what evidence counts and what the red flags are — aimed at a risk owner who is not an ML engineer. That is a communication aid, not a culture programme |
| **GOVERN 5** Engagement with relevant AI actors | — | **Not covered** |
| **GOVERN 6** Third-party software, data and supply chain | C-11, C-14 | MCP server fingerprinting including tool descriptions; retrieval source allowlist with a named owner; provider change is a classified material change |

## MAP

| Category | Addressed by | Notes |
|---|---|---|
| **MAP 1** Context is established and understood | Context Contract | The context the agent is authorised *for*, separate from the agent itself. A permit binds one to the other |
| **MAP 2** Categorization of the AI system | Agent Passport | Model, prompt digest, tools, permissions, data sources, MCP servers, autonomy, environment, residency — the configuration the assessment was made against, hashed |
| **MAP 3** Capabilities, targeted usage, goals, benefits and costs | Agent Passport `purpose`, entitlement | Benefits and costs are not modelled |
| **MAP 4** Risks and benefits mapped for all components | `threat-library/hazards.json`; claims | H-01 to H-10 with severity, each linked to the claims that address it |
| **MAP 5** Impacts to individuals, groups, communities, society | — | **Not covered.** There is no impact assessment here. This is the largest single gap against the RMF and it is a real one, not a scoping artefact |

## MEASURE

| Category | Addressed by | Notes |
|---|---|---|
| **MEASURE 1** Appropriate methods and metrics identified and applied | Evidence quality dimensions | Provenance, coverage, construct validity, ecological validity and repeatability, recorded per artefact and **never averaged** — a single number would hide the dimension that fails |
| **MEASURE 2** AI systems evaluated for trustworthy characteristics | Evidence graph | **Partial.** Decirance records and reasons about evaluations; it does not run them. Evidence comes from systems it reads, not systems it operates |
| **MEASURE 3** Mechanisms for tracking identified risks over time | Assurance delta; `severedBy` | The signature capability. A change to the configuration severs specific dependency edges and the invalidation follows deterministically |
| **MEASURE 4** Feedback about efficacy of measurement | Residual uncertainty; defeaters | `src/argument.ts` records what remains unknown when everything has passed, and defeaters split into rebutting, undercutting and undermining so a challenge to the *measurement* is distinguishable from a challenge to the conclusion |

## MANAGE

| Category | Addressed by | Notes |
|---|---|---|
| **MANAGE 1** Risks prioritised, responded to and managed | Recommendation ceilings | R0–R7 and R2b. Ceilings, not scores: the most restrictive rule wins, and the binding rule is named |
| **MANAGE 2** Strategies to maximise benefit and minimise negative impact | Conditions on permit | **Partial.** Conditions and compensating controls are recorded and must remain satisfied for the permit to authorise. Benefit is not modelled |
| **MANAGE 3** Risks and benefits from third parties managed | C-11, C-14; commercial change kinds | Provider change, plan change and terms change are classified material changes that invalidate the claims resting on them |
| **MANAGE 4** Risk treatments documented and monitored regularly | Permit events; expiry | Append-only event log including refused transitions; permits expire rather than persisting silently |

## What this mapping does not claim

NIST does not certify conformance to the AI RMF, and no artefact here has been
reviewed by NIST or anyone connected to it. The RMF is voluntary guidance and
this is one reading of how a deployment-authorisation tool corresponds to it.

Two categories are uncovered and one — **MAP 5, impacts to individuals and
society** — is a genuine gap rather than a scoping decision. Decirance reasons
about whether an agent may operate given its evidence. It has nothing to say
about who is affected if it does.
