<!-- SPDX-License-Identifier: CC-BY-4.0 -->
# Quickstart

Fifteen minutes, start to finish. No account, no server, no telemetry:
everything below runs on your machine and writes only to the directory you name.

```bash
git clone https://github.com/Decirance/decirance.git
cd decirance && npm install
```

Every command below is also available as `npx decirance <command>` once the
package is installed.

## 1. Put a complete case on disk

```bash
npm run init -- mycase
```

Four documents and a set of changed Passports:

| File | What it is |
|---|---|
| `agent-passport.json` | what the agent *is* — model, tools, permissions, containment, observability |
| `context-contract.json` | where it may operate, on what data, with what oversight |
| `assurance-graph.json` | 19 claims, 25 evidence edges, and the change kinds that sever each |
| `evidence-manifest.json` | 21 results, each scoped to the Passport it was collected against |
| `changes/` | five changed Passports, for step 4 |

**The case is fictional.** Meridian Council does not exist. It is here so you can
run the method before pointing it at your own agent.

## 2. Assess it

```bash
npm run assess -- mycase
```

You get: which evidence is in scope, each claim's state, and a recommendation
with the single rule that set it. With 21 in-scope results the answer is
**approve with conditions**, bound by `R2b` — a critical claim is contradicted
by evidence, and operating depends on the compensating controls the approver
accepted staying in force.

This is a recommendation. Nothing has been approved.

## 3. Take the decision

```bash
npm run permit -- mycase --approver "Your Name" --role accountable-owner \
  --condition "Human approval before any external send" \
  --accept-risk "RR-02 — incorrect draft may influence a reviewer"
```

Writes `deployment-permit.json`, including an attestation that restates the
exact Passport digest, conditions and accepted risks. The digest is
tamper-evident, not cryptographic: it detects an altered record and does not
prove authorship, and the record says so in a field.

Four things it refuses to do:

- issue a permit with nobody named on it;
- let `--role assurance-engine` (or anything but the accountable owner) approve;
- issue a conditional approval with no conditions recorded;
- issue anything at all when the rules say reject — it writes `refusal.json` and
  exits non-zero instead. There is no override flag.

## 4. Change the agent

The agent is granted a write permission its contract prohibits:

```bash
npm run -s diff -- mycase/agent-passport.json mycase/changes/tool-write-permission.json \
  --graph mycase/assurance-graph.json
```

One classified change — `permission_granted` — and the claims it reaches. Then
move the case onto the new Passport, keeping the old one:

```bash
npx decirance apply mycase/changes/tool-write-permission.json mycase
npm run assess -- mycase
```

**18 of the 21 results carry forward. Three are severed**, named, with the change
that severed them. That is the whole argument of this project: the evidence that
depended on the thing that changed stops counting, and the rest does not.

Ask for the permit again and it will not be the same answer.

## 5. Adding a control does not restore a permit

```bash
npx decirance apply mycase/changes/containment-added.json mycase
npm run assess -- mycase
```

Egress containment is added. The recommendation does not improve, because
authority is restored by evidence and a decision, never by a better
configuration. The permit state machine has no edge that returns an agent to
operating without a human — and that is proved exhaustively over all twelve
states by `npm test`.

## 6. The pack for the people who decide

```bash
npx decirance pack mycase --out decision-pack.md
```

Everything above, as prose and tables: the decision requested, the agent, the
context, the claims needing attention, every rule that fired, the conditions and
accepted risk, a ranked table of what will end the decision, and what the pack
does not tell you. Every figure is computed at render time, so it cannot drift
from the case — which is also why you regenerate it rather than editing it.

Worked example:
[examples/meridian-reply-agent/deployment-case.md](../examples/meridian-reply-agent/deployment-case.md).

## 7. Check everything

```bash
npm test
```

Three harnesses: the engine's property checks, the published examples against
the published schemas, and the quick start above run end to end on real files.

## Point it at your own agent

```bash
npm run scan -- /path/to/your/agent-project
```

Reads `package.json`, an `mcp.json` if present, and `.env.example` for variable
*names*. It never reads a `.env`: values are not informative, and a scanner that
reads secrets is one nobody runs twice. Writes
`.decirance/agent-passport.json` and `.decirance/decirance-findings.json`, and
separates **missing** from **unverifiable** — "no MCP servers configured" and
"servers exist but their descriptions could not be read" are opposite
situations.

Replacing the Passport is the easy half. The assurance graph — which claims
matter for your deployment, what evidence speaks to each, and what change severs
that link — is the work.

## In CI

`assess --require` exits non-zero when a case falls below the level you name, so
a change that invalidates your evidence fails the build rather than merging
quietly:

```bash
npx decirance assess ./mycase --require approve_with_conditions
```

Exit codes: `0` met, `2` below the required level, `1` the case could not be
read.
