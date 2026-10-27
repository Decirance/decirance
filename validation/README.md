<!-- SPDX-License-Identifier: CC-BY-4.0 -->
# Method Validation Pack

This answers a question the test suite cannot: **does the engine reach the right
assurance answer**, not merely a consistent one.

`npm test` proves self-consistency — the permit invariant holds across all
twelve states, digests are stable, invalidation is deterministic. A rule that
severs the wrong edge passes every one of those checks, deterministically, every
time. So this pack scores the engine against expectations held **separately from
the rules**, and publishes where the two disagree.

```bash
npm run validate-method
```

Results are written to [`results/latest.md`](results/latest.md) and
`results/latest.json`.

## The number to read first

**Dangerous false preservation**: evidence the engine kept that the expectation
says should have been reassessed. Every instance is listed individually, because
one is a finding.

Work avoided is the easy number and the one worth least on its own: an engine
that invalidates nothing avoids all reassessment. The saving only means
something beside this figure.

## Why these results are not quotable

Every expectation currently carries `provenance: team`. They were written by the
same people who wrote the rules being measured, which is the one thing a
benchmark must not be. Scored against its own authors, an engine proves nothing.

The expectations were at least authored from a different place than the rules:
from **what each claim says**, with the `severedBy` lists deliberately not
consulted while writing them. That is why the two disagree in eight places. It
makes the disagreements real, but it does not make the labels independent.

A result becomes quotable when a scenario's label is `adjudicated` — reviewed by
people outside the team, with disagreements resolved and recorded. `observed` is
stronger still: a deployer labelled a real change on their own system before
seeing any Decirance output.

## How to review this

You are reviewing the **expectations**, not the code.

1. Read a case: `cases/<case>/case.json` and the documents it points at.
2. Copy `reviews/REVIEW-TEMPLATE.json` to `reviews/<your-id>-<case>.json`.
3. For each scenario, **write your own answer before reading
   `results/latest.md`**: which claims the change affects, which evidence stops
   supporting them, whether the live permit should stop now, and what the
   reassessed case could support. The engine's answer is in the results file;
   reading it first makes your answer worth much less.
4. Record disagreement explicitly. A reviewer who disagrees with an expectation
   has produced the most valuable row in the table.
5. Open a pull request adding your file. Do not edit the scenarios: a reviewer
   amending a fixture is indistinguishable from the fixture having been right.

Adjudication is a separate, recorded step: where reviewers disagree with each
other, a named adjudicator writes the resolution into the scenario's
`adjudication` field with a reason, and the label provenance becomes
`adjudicated`.

## What a scenario file contains

```jsonc
{
  "id": "meridian-reply-agent/permission-escalation",
  "change_family": "passport_diff",      // or operational_signal, evidence_state, external_policy
  "engine_capability": "supported",      // supported | partial | absent
  "change": {
    "description": "case:write is added to the agent permissions.",
    "passport_patch": { "operating": { "permissions": ["…"] } }
  },
  "expected": {
    "affected_claims": ["C-01", "C-02", "C-16"],
    "invalidated_evidence": ["E-093", "E-061", "E-143"],
    "permit_ceiling": "reject",              // what the reassessed case could support
    "suspend_pending_reassessment": true,    // whether the live permit stops now
    "full_reassessment_required": false
  },
  "labels": { "provenance": "team", "authored_from": "claim statements", "rationale": "…" },
  "reviews": [],
  "adjudication": null
}
```

Two fields that are easy to conflate, and were conflated in the first version of
the runner: **ceiling** is what the case could support once reassessed;
**suspend_pending_reassessment** is whether the permit stops in the meantime.
Both are usually true at once, and collapsing them made every scenario come out
as "suspend" while measuring nothing.

`passport_patch` is applied to the case's Agent Passport: objects merge, arrays
and scalars replace. `preserved_evidence` may be omitted, in which case it is the
complement of `invalidated_evidence` within the case.

## What the pack deliberately exposes

Three of the required change types are things that happen to real deployments
and that the engine **has no input for**. They are included as specifications
rather than quietly dropped, and the runner reports them as capability gaps
instead of scoring them:

| Scenario | Why it cannot be scored |
|---|---|
| `monitoring-control-failure` | A control that fails in operation is not a configuration diff. The engine reasons over recorded changes to the Agent Passport; it has no input for an operational signal. |
| `evidence-expired` | Evidence has a validity window at ingest, but the delta engine has no notion of time passing. A claim supported only by lapsed evidence still reads as supported. |
| `policy-change` | A revised Organisation Assurance Baseline creates a new obligation with no evidence against it. The engine can check a contract against a baseline, but has no path from a baseline revision to a reassessment obligation. |

## Where a disagreement points

The Meridian graph is generated from the engine's own example constants, so a
disagreement there points at the **`severedBy` taxonomy** — the rules
themselves. The Northgrid tariff graph was written as a case author would write
one, so a disagreement there points at **that case's modelling**. The runner
labels each disagreement accordingly, because reporting both as one number would
blame the engine for an author's omission.

## Cases

| Case | Agent | Claims | Evidence | Graph authored by |
|---|---|---|---|---|
| `meridian-reply-agent` | Council casework reply drafting (fictional) | 19 | 21 | engine reference constants |
| `tariff-advice-agent` | Domestic energy tariff advice (fictional) | 8 | 8 | case author |

Both are fictional. The second exists so the rules are not measured only against
the case they were written for — and it earns its place: it produced a
disagreement of its own.

## Adding a case

Add a directory under `cases/` with `case.json` pointing at an Agent Passport, a
Context Contract, an assurance graph and an evidence manifest, then scenarios
under `scenarios/`. A case without a Context Contract cannot express a red line,
so the runner cannot tell a prohibited action from a widened one.

The structural checks fail if a scenario references a claim or evidence
reference that does not exist, if a required change type is uncovered, if an
expectation carries no rationale, or if the pack drops below two cases.
