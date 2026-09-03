<!-- SPDX-License-Identifier: CC-BY-4.0 -->
# MITRE ATLAS mapping

**Source:** MITRE ATLAS (Adversarial Threat Landscape for Artificial-Intelligence
Systems), matrix tactics and techniques, <https://atlas.mitre.org/>. Tactic and
technique identifiers taken from the published `atlas-data` distribution.
**Checked:** 3 September 2026 · **Mapping version:** 0.1.0

ATLAS is an adversary behaviour model — what an attacker does, in what order.
Decirance is an assurance framework — what you can show about a deployment
before you authorise it. The two are not the same kind of object, and a mapping
that implied otherwise would be dishonest.

The useful question is narrower: **which ATLAS tactics does the reference
hazard set actually consider, and which does it ignore?** Most of the matrix is
ignored, and that is the finding.

## Tactics

| Tactic | ID | Hazards / claims | Notes |
|---|---|---|---|
| Reconnaissance | AML.TA0002 | — | Not modelled |
| Resource Development | AML.TA0003 | C-14 | **Partial.** Tool and MCP description signing addresses one supply-side path: a poisoned server the agent is configured to trust |
| Initial Access | AML.TA0004 | H-01, C-04, C-12 | **AML.T0051 LLM Prompt Injection** is the technique the reference case takes most seriously. Injected instructions in inbound documents (H-01) and untrusted retrieved content (C-12) are separate hazards because they arrive by different routes |
| AI Model Access | AML.TA0000 | C-02 | Least privilege on the case scope bounds what model access yields |
| Execution | AML.TA0005 | C-01, C-06 | The gate on durable state change and outbound communication. This is where the permit invariant does its work: an action outside the permitted set is denied regardless of what the model produced |
| Persistence | AML.TA0006 | H-05, C-13 | Memory contamination and drift; controlled writers, retention and rollback |
| Privilege Escalation | AML.TA0012 | H-02, C-02 | "Authority exceeds what was assessed" is the hazard; configuration binding in the permit is the check |
| Defense Evasion | AML.TA0007 | — | **Not covered** |
| Credential Access | AML.TA0013 | — | **Not covered.** Secrets handling is out of scope; the scanner deliberately never reads a `.env` |
| Discovery | AML.TA0008 | — | Not modelled |
| Lateral Movement | AML.TA0015 | — | **Not covered** |
| Collection | AML.TA0009 | C-03, C-10 | Retrieval bounded to the assigned case; retention and residency terms |
| AI Attack Staging | AML.TA0001 | H-03, C-11 | **Partial.** Retrieval corpus contamination and source allowlisting. Model-level staging — proxy models, adversarial example crafting — is not modelled |
| Command and Control | AML.TA0014 | — | **Not covered** |
| Exfiltration | AML.TA0010 | C-06, C-03, C-10 | Outbound communication requires human approval; retrieval scope bounds what could leave |
| Impact | AML.TA0011 | C-01 | No durable change to customer state without a named approver |

## What this mapping is for

Six of sixteen tactics are uncovered and three more are partial. That is not a
defect to be corrected by adding rows — it reflects what the reference agent
is. Meridian Reply Agent drafts replies under human review. It does not execute
code, hold credentials, move laterally, or maintain a channel to anywhere.

The value of running the mapping anyway is that the uncovered tactics are now
*visible*. An organisation deploying an agent that does execute code can see
immediately that Execution, Defense Evasion and Command and Control need claims
this case does not contain, rather than inheriting a hazard set that was never
scoped for them.

## What this mapping does not claim

It does not claim coverage of ATLAS, and MITRE has not reviewed it. ATLAS
describes adversary behaviour observed in the wild; Decirance records whether
evidence exists for claims about a deployment. A claim being supported means
evidence exists and nothing credible contradicts it. It does not mean the
corresponding technique would fail against this agent — that would be a claim
about the system, and no assurance case can deliver it.
