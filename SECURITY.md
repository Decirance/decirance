# Security policy

## Reporting a vulnerability

Email **security@decirance.com**. Please do not open a public issue for a
vulnerability.

Include what you did, what happened, and what you expected. We aim to
acknowledge within three working days.

## Scope

This repository contains a schema set, an assurance engine and a local CLI.
There is no hosted service here, no account system and no data collection.

In scope:

- Flaws in the delta engine that would cause evidence to be **wrongly preserved** after a change. This is the highest-severity class in this project: a false `preserved` means an organisation skips a test it needed.
- Parser flaws in the Passport, Context Contract or MCP importers, including denial of service on hostile input.
- The CLI reading files it should not, writing outside its output directory, or leaking secrets into its output.

Out of scope:

- The tamper-evidence limits of attestations and receipts. These are documented, not defects: `digestOf` is FNV-1a content addressing and detects an altered record, not authorship. Anyone able to write a record can recompute its digest. Cryptographic signing is on the roadmap.
- Disagreement about a dependency judgement in the reference assessment. That is a correctness discussion — open an issue, see CONTRIBUTING.md.

## Handling of secrets

The CLI never reads `.env` files. Environment variable *names* are read from
`.env.example`-style files for provider detection; values are not read.

If you find any path by which the CLI or engine emits a credential into its
output files or logs, treat it as in scope and report it.
