<!-- SPDX-License-Identifier: CC-BY-4.0 -->
# Documentation

| Document | What it covers |
|---|---|
| [methodology.md](methodology.md) | The method in full: unit of assessment, objects, claim states, evidence quality, decision rules, dependency judgement, selective invalidation, human accountability, limitations |
| [quickstart.md](quickstart.md) | Clone, scan a project, run the reference assessment |

## Planned

These are named here rather than in the README, so the README does not
advertise directories that do not exist. Nothing below is written yet.

- `concepts/` — models, prompts, tools, RAG, memory, MCP, agent identity, evidence, permits
- `workflows/` — registration, context contract, hazard assessment, evidence review, testing, approval, change management, incident response
- `page-guides/` — what decision each screen supports, what to examine, what completion looks like
- `test-catalogue/` — when each test is required and what success actually means
- `playbooks/` and `templates/` — evidence requests, decision records, questionnaires
- `glossary.md`

The gap this fills is real: AI assurance currently assumes a reader who
already knows what an agent is. Most accountable owners do not, and telling
someone their evidence is insufficient without telling them what to ask for is
not much help.

Content will be CC BY 4.0 rather than Apache 2.0, so it can be reused in
training material and internal policy without the code licence applying.

## Reviewing the weakest part

[dependency-review.md](dependency-review.md) is a generated sheet listing every
`severedBy` set — the change kinds that break each dependency between evidence
and the claim it supports. Every invalidation result the tool produces rests on
those sets, they are judgement calls, and they have not been externally
reviewed. The sheet exists so that reviewing them does not require reading
TypeScript. Disagreements are more useful than agreement.

Regenerate with `npm run dependency-review`.
