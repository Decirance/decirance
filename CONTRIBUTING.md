# Contributing

## The contribution we want most

**Argue with the graph.**

The reference assessment in `examples/meridian-reply-agent/` records, for every
dependency, which configuration changes sever it. For example: granting
`case:write` severs the edge from evidence `E-093` to claim `C-01`.

Those judgements are the method. The traversal is mechanical and finished; the
judgements are curated by hand and have not been independently validated. If
you think one is wrong, open an issue titled `graph: <edge>` and say why. A
disputed edge with reasoning is worth more to this project than a feature.

## Other useful contributions

- **Threat scenarios** for agent patterns not yet covered — add to `threat-library/`.
- **Framework mappings** — NIST AI RMF, ISO/IEC 42001, OWASP agentic guidance, MITRE ATLAS.
- **Adapters** that turn a real tool's output into evidence. `src/inspect-adapter.ts` is the model to follow.
- **A second reference assessment** for a different agent shape.

## What we will decline

- A risk score, a composite rating, or anything that reduces the evidence dimensions to one number.
- Model-generated assurance decisions. Proposals may be assisted; the accepted decision must be deterministic and attributable.
- Adapters that require production credentials or copy customer prompts and data.
- Additions that make an unknown look like a zero. `missing` and `unverifiable` stay distinct everywhere.

## Working on the code

```bash
npm install
npm run typecheck
npm test          # runs the reference assessment and checks the expected results
```

The engine in `src/` is deliberately dependency-free and must stay that way: it
runs in Node and in a browser, and anything published as a reference
implementation should be readable without pulling a tree of packages.

## Schema changes

Schemas are a public contract. A change that removes a field, narrows a type,
or alters the meaning of an existing field is breaking, and needs a version
bump and a note in `ROADMAP.md`. Additive optional fields are not breaking.

## Commit and review

Explain *why* in the commit message, not what — the diff already says what.
Where a decision has a trade-off, record the trade-off.

By contributing you agree your contribution is licensed under Apache 2.0.
