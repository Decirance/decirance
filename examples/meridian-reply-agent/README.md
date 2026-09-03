# Meridian Reply Agent — reference assessment

A complete, reproducible assurance case. Every file here is **generated from the
engine** by `npm run build:examples`, so the example cannot drift from the code:
if the engine changes what a delta concludes, these files change with it and the
diff shows exactly what moved.

The agent is fictitious. The method is not.

## The agent

A back-office casework agent that reads email and documents, retrieves case
information, drafts responses, and escalates consequential actions for human
approval. It holds `case:read`, `document:read`, `draft:create` and
`review:request` — and notably **not** `case:write`.

## Files

| File | What it is |
|---|---|
| `agent-passport.json` | The exact configuration assessed, with its digest |
| `context-contract.json` | What the agent is *permitted* to do, including red lines |
| `assurance-graph.json` | 14 claims, 20 typed edges, and what severs each one |
| `evidence-manifest.json` | 16 artefacts with five quality dimensions each, never averaged |
| `deployment-permit.json` | The human-signed authority, bound to the passport digest |
| `deltas/*.json` | Four material changes and what each one did |

## The four changes

| Scenario | Change | Preserved | Invalidated | Recommendation |
|---|---|---|---|---|
| `cyber-write-permission` | `case:write` granted | 10 | 2 | **reject** |
| `resilience-provider-change` | retrieval provider and RTO | 12 | 1 | supervised pilot |
| `commercial-terms-change` | prompt retention and residency | 12 | 1 | supervised pilot |
| `contamination-mcp-rag` | external index source + unsigned MCP server | 9 | 4 | supervised pilot |

Only the first is a **reject**, and for a specific reason: the Context Contract
lists `case:write` as a prohibited action, so the agent holding it is a
demonstrated red-line breach. Rule `R1.red_line_breach` caps the outcome at
reject regardless of how well every other claim is supported. The other three
are serious but not prohibited — they cap at supervised pilot.

## Three things worth reading closely

**`commercial-terms-change` alters no code at all.** The provider begins
retaining prompts and the data moves out of the UK. No tool, permission, model
or prompt changes. A critical claim still dies and the permit still suspends.
That is the argument for recording commercial entitlement in the graph.

**`E-093` appears as both preserved and invalidated** in the cyber delta. It is
the reviewer-gate evidence: it stops justifying "cannot alter durable state"
while still justifying "cannot send external communication". Validity is a
property of the evidence-to-claim edge, not of the artefact — which is why the
evidence schema keeps applicability off the node.

**`C-04` is `challenged`, not `unsupported`.** `E-112`, an adaptive-injection
finding, contradicts it and survives most changes. The organisation accepted
that residual risk against two compensating controls and recorded the
acceptance. Without that record, rule `R2` would cap every scenario at reject
while the permit sat active — a case that contradicts itself.

## Reproduce it

```bash
npm install
npm run build:examples   # regenerates every file here
npm test                 # asserts the properties above still hold
```

## Argue with it

The `severedBy` list on each edge in `assurance-graph.json` is a human
judgement about which changes break which evidence. Those judgements are the
method, and they have **not been independently validated**.

If you think one is wrong — that granting `case:write` should not sever
`E-093 → C-01`, or that something we preserved should have died — open an issue
titled `graph: <edge>`. That is the most useful contribution this project can
receive.
