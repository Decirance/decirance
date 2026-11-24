# A worked assurance case about a skill

`release-check` is a skill that verifies a release candidate. It reads the
repository, runs `npm test`, and reports what failed. A team approved it on
the strength of twelve claims — that it cannot write to a repository, cannot
reach the network, cannot alter the record of what the tests reported, and runs
only when a person invokes it.

Three months later somebody added `Bash(git push:*)` so the skill could finish
the job it had been reporting on, `WebFetch` so it could read the release
notes, and `mcp__deploy__promote` so it could promote the build. They moved to
a stronger model because the summaries were thin.

Every one of those edits is defensible on its own. A text diff shows four
changed lines. This case shows what they cost.

> The skill, its owner and all of its evidence are invented. Nothing here
> describes a real team or a real assessment.

## Run it

A skill file carries configuration and no accountability: no owner, no
environment, no version. That is the format working correctly — a skill is
reusable, and the same file is deployed by different people into different
places. So the translation asks for what the file cannot say, and refuses
without it.

```bash
npx decirance skill examples/release-check-skill/v1.SKILL.md \
  --owner "Ari Rios, Release Engineering Lead" \
  --environment "developer workstations and the shared CI runner" \
  --version 1.0.0 --created-at 2026-09-03T00:00:00.000Z \
  --out before.json

npx decirance skill examples/release-check-skill/v2.SKILL.md \
  --owner "Ari Rios, Release Engineering Lead" \
  --environment "developer workstations and the shared CI runner" \
  --version 2.0.0 --created-at 2026-09-03T00:00:00.000Z \
  --out after.json

npx decirance diff before.json after.json \
  --graph examples/release-check-skill/assurance-graph.json
```

`passport-v1.json` and `passport-v2.json` in this directory are the output of
those first two commands, so the third runs on its own:

```bash
npx decirance diff \
  examples/release-check-skill/passport-v1.json \
  examples/release-check-skill/passport-v2.json \
  --graph examples/release-check-skill/assurance-graph.json
```

`--created-at` is there so the digest is reproducible. Leave it off in real
use; a passport is created when you create it.

## What the case holds

| Claim | Statement | Critical | Severed by |
|---|---|---|---|
| SK-01 | No tool outside the reviewed allow-list can be invoked | yes | tool added or removed, MCP server added |
| SK-02 | Cannot write to a source repository or a deployment target | yes | permission granted, tool added |
| SK-03 | Cannot reach the network, so no retrieved content enters its context | yes | egress, permitted destination, tool added |
| SK-04 | Every tool description the model reads comes from a signed source | no | MCP server added or changed |
| SK-05 | Runs only when a person invokes it | yes | autonomy level, human oversight |
| SK-06 | The instructions supplied are the instructions reviewed | yes | system prompt |
| SK-07 | Behaviour observed in testing is what the configured model produces | no | model version, provider, artefact digest |
| SK-08 | No command it runs can alter the record of what the tests reported | yes | permission granted, logging destination, shared storage |
| SK-09 | A failing check stops the release rather than reading as a pass | no | system prompt, model version, scorer config |
| SK-10 | Credentials in its shell cannot act beyond the repository under test | yes | credential scope, permission granted |
| SK-11 | Anything it changes can be reversed without the skill | no | permission granted, tool added, shutdown mechanism |
| SK-12 | Its effects are confined to the environment it was approved for | yes | deployment environment, permitted destination, tool added |

Twelve artefacts support them, each with a receipt naming the configuration it
was collected against. One of the twelve, **SE-12**, contradicts SK-09: in one
of twelve dry runs the skill reported "tests mostly passing" with two suites
failing. It is published with the rest because a case assembled only from
passes teaches that assurance is collecting passes. The engine reports a
contradiction separately and never nets it off against the volume of support.

The graph also carries an `obligations` map: which tests each kind of change
obliges, for this case. It is a judgement about this system exactly as
`severedBy` is, and authoring your own graph means authoring both. A graph
without it still produces a delta; the delta will say what the change
invalidated, and say plainly that it cannot say what work the change created.

## What the delta concludes

Seven of the twelve claims are critical and lose their support, so the engine
**recommends suspending the existing permit** and caps what may be issued in
its place at a supervised pilot. It does not reject the change — that ceiling
is a policy choice the method leaves to the organisation, and the default here
is the more permissive of the two.

The reason is not that seven lines changed. It is that a read-only verifier and
a deployment actor are different systems, so most of what was established about
the first is not evidence about the second:

- the write-attempt refusal run tested a skill that held no write permission;
- the egress capture observed a skill that held no network tool;
- the record-integrity test relied on the skill holding no credential for the
  store the results go to;
- the reversibility review concluded there was nothing to roll back;
- and the dry-run contradiction on SK-09 does not go away, it goes **out of
  scope** — it was a run of the old instructions, so it has to be re-run before
  anyone can say whether the objection still stands.

That last point is the defect this case found in the engine. A severed
`challenges` edge used to drop out of the report entirely, so a change that
severed only the contradiction moved a claim from *challenged* to *preserved*
with nothing on the page to say a contradictory result had been set aside. The
method forbids a volume of weak support outweighing one credible contradiction;
nothing forbade making the contradiction disappear by changing the
configuration it was collected against. It is now reported, and the claim reads
as *affected* rather than preserved.

The delta also names work **no existing claim covers**:

- `write-integrity-test` and `partial-write-recovery-test`, because every claim
  in this case is about a skill that could not write, so no claim could have
  asked whether a half-finished write leaves the repository consistent;
- `consequential-action-approval-test`, because a tool that promotes a build
  raises a question a read-only case never had to ask — who authorised this
  particular release.

That output is the one nobody produces by hand. Not "retest everything", and
not "it is probably fine" — the specific gap the change opened.

## Where this does not reach

The translation reads the flat `key: value` frontmatter that skill files
actually use, and refuses nested maps, block scalars and `- ` sequences rather
than guessing. A mis-read permission list would produce a confident delta
computed from authority nobody granted.

And a `SKILL.md` is not a security boundary. It is a configuration an
accountable person approved, which is what this case assesses. Whether the
agent can be made to exceed it is a question for the tests the delta names, not
for the file.
