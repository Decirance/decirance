# Governance

## Current state, stated plainly

Decirance is early and maintained by its original authors. There is no
foundation, no steering committee and no multi-vendor governance yet. Claiming
otherwise would be the kind of overstatement this project exists to argue
against.

This document records how decisions are made now, and what would have to change
for the schemas to be credible as a shared standard.

## Decision making

- **Schemas** change by proposal and public discussion in an issue before implementation. They are a contract; changing them quietly breaks other people's work.
- **Engine behaviour** changes by pull request. Any change to invalidation semantics must state its effect on the reference assessment, and the test harness will show it.
- **The reference assessment** changes only with a stated reason. It is the shared example everything else is discussed against, so silent edits make past discussions unreadable.

## What independence would require

The method's central claim is that a change severs specific evidence. That
claim is only credible if people outside the project agree with the
judgements. Concretely, the project needs:

1. Independent reviewers who assess the reference graph and publish where they disagree.
2. A second organisation maintaining a scenario pack.
3. A versioning and deprecation policy the maintainers do not control alone.

Until at least the first exists, treat this as a well-documented method from
one group, not a standard.

## Conflicts of interest

The authors intend to build a commercial product on these schemas. That is
stated openly because it shapes incentives: there is a standing temptation to
keep the useful parts closed and publish only the shape of them.

The test is whether someone can produce a complete, defensible assessment using
only this repository, with no commercial component. If that stops being true,
the project has failed its own premise — please open an issue saying so.
