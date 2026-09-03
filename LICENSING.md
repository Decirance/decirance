# Decirance licensing

Unless a file states otherwise:

- **Source code, JSON schemas, machine-readable taxonomies, adapters and
  reference implementations** are licensed under the **Apache License 2.0**
  ([LICENSES/Apache-2.0.txt](LICENSES/Apache-2.0.txt)).
- **Documentation, methodology, educational articles and diagrams in `/docs`**
  are licensed under **Creative Commons Attribution 4.0 International**
  ([LICENSES/CC-BY-4.0.txt](LICENSES/CC-BY-4.0.txt)).
- **The Decirance name, trademarks and logos** are not granted under either
  licence. See [TRADEMARKS.md](TRADEMARKS.md).
- **Third-party standards and referenced materials** remain subject to their
  owners' rights. See "Framework mappings" below.

## By path

| Path | Licence | SPDX |
|---|---|---|
| `src/` | Apache 2.0 | `Apache-2.0` |
| `cli/` | Apache 2.0 | `Apache-2.0` |
| `schemas/` | Apache 2.0 | `Apache-2.0` |
| `threat-library/` | Apache 2.0 | `Apache-2.0` |
| `examples/` | Apache 2.0 | `Apache-2.0` |
| `docs/` | CC BY 4.0 | `CC-BY-4.0` |
| `framework-mappings/` | CC BY 4.0 | `CC-BY-4.0` |
| `README.md`, `GOVERNANCE.md`, `CONTRIBUTING.md`, `SECURITY.md`, `ROADMAP.md` | CC BY 4.0 | `CC-BY-4.0` |

The split is deliberate. Code that an organisation integrates into its own
security or governance systems must not create licensing obligations across
those systems — Apache 2.0 is permissive and carries an explicit contributor
patent grant, which is what enterprise and public-sector legal review actually
asks about.

Documentation is CC BY 4.0 so a company, university, department or trainer can
copy the methodology into internal policy and training material, translate it,
adapt it and use it commercially, with attribution. The share-alike and
non-commercial variants were considered and rejected: both create uncertainty
for exactly the consultants and regulated businesses most likely to adopt it.

## Attribution for documentation

> Based on the Decirance Agent Assurance Methodology, version 0.1, licensed
> under CC BY 4.0. Changes have been made.

## What this repository is, precisely

Decirance is **open core**. The schemas, reference engine, change taxonomy,
CLI and baseline methodology are open. The managed operational platform —
hosted evidence registry, SSO and role-based access, multi-organisation
tenancy, approval workflows, cryptographic signing, continuous monitoring,
enterprise connectors, portfolio reporting, supplier evidence exchange,
validated sector packs, private-cloud deployment and support — is commercial
and is not in this repository.

Saying "Decirance is open source" without that distinction would imply the
entire product is here. It is not, and the distinction is stated wherever the
project is described.

## Framework mappings

`framework-mappings/` contains **Decirance interpretations**. They are not
endorsed by, affiliated with, or approved by any standards body or authority.

Mappings reference section identifiers and describe our own correspondence.
They do not reproduce substantial text from standards documents. ISO/IEC
standards in particular are copyrighted and sold; nothing here grants any right
to them, and using a mapping against one may require legitimate access to the
standard itself.

Where a mapping cites UK government material such as NCSC guidance, that
material remains subject to its own terms.

## Contributions

Contributions are made under Apache 2.0 for code and CC BY 4.0 for
documentation, certified by a Developer Certificate of Origin sign-off. See
[CONTRIBUTING.md](CONTRIBUTING.md).

---

*This file explains the project's licensing position. It is not legal advice,
and it has not yet been reviewed by a solicitor. Anyone relying on it for a
commercial decision should take their own advice.*
