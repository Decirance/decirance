# Quickstart

```bash
git clone https://github.com/Decirance/decirance.git
cd decirance && npm install
```

## Scan a project

```bash
npm run scan -- /path/to/your/agent-project
```

Reads `package.json`, an `mcp.json` if present, and `.env.example` for
variable *names*. It never reads a `.env`: values are not informative and a
scanner that reads secrets is one nobody runs twice.

Writes `.decirance/agent-passport.json` and `.decirance/decirance-findings.json`.

The output separates **missing** from **unverifiable**. "No MCP servers
configured" and "servers exist but their tool descriptions could not be read"
are opposite situations — one is a small attack surface, the other is an
unmeasured one.

## Run the reference assessment

```bash
npm test                 # 18 checks over the properties the method depends on
npm run build:examples   # regenerate examples/ from the engine
```

`npm test` asserts behaviour, not just that the code runs: that unclassified
changes fail closed, that a contradiction outranks surviving support, that a
description-only MCP change moves the fingerprint, that an empty case
justifies nothing.

## Read the reference case

`examples/meridian-reply-agent/` is a complete assessment with four change
scenarios. Start with its [README](../examples/meridian-reply-agent/README.md),
then open `deltas/cyber-write-permission.json`.

## Disagree with it

The `severedBy` list on each edge in `assurance-graph.json` is a human
judgement about which changes break which evidence. Those judgements are the
method, and they have not been independently validated.

Open an issue titled `graph: <edge>`. See [CONTRIBUTING.md](../CONTRIBUTING.md).
