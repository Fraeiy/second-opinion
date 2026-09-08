# Portable architecture migration

## Conflicts found

The existing UI already described a public demo, but its adapter still probed MCP,
inferred authorization from tool discovery and contained live-order placeholders.
The health route exposed an MCP URL and an environment-controlled demo flag.
The skill was duplicated and lacked an executable input/output contract. HTTP requests
could override risk policy. OpenRouter could author numerical report fields.
Demo confirmation hashes omitted entry type, limit price, stop and take profit.

## Preserved

Next.js, TypeScript, Tailwind styling, dashboard layout, public REST fetching, numeric
normalizers, intent parser, deterministic engine and thresholds, Zod schemas, simulated
portfolio, rate limits, safer-alternative display, confirmation UI and all existing tests.
Existing user environment values were not inspected or changed.

## Changed

- Canonical skills/second-opinion/SKILL.md with thin AGENTS.md, CLAUDE.md and .agents entry.
- Shared risk-policy.json imported and validated by src/lib/policy.ts.
- Local scripts/analyze.ts and src/lib/skill-workflow.ts: strict JSON input, freshness,
  observation provenance, deterministic calculations and structured report.
- Supported-client-only authentication and live data, dynamic tool discovery, read-only
  default, separate preparation approval and confirmation for each exact trading action.
- Website adapter limited to public REST and simulation; full-intent expiring single-use tokens.
- Website API rejects injected market/account data and policy overrides.
- Deterministic narrative preserves the useful template without external model-generated numbers.
- Landing-page positioning, installation route, configurable GitHub destination and metadata.
- README architecture diagram, environment example, exact client setup and identical example prompts.
- Regression coverage for the portable workflow and website simulation boundary.

## Removed

src/lib/binance/mcp-client.ts, its unused barrel, /api/connection, MCP probing,
inferred authorization, real-order placeholder branches and tool-name hints,
the @modelcontextprotocol/sdk website dependency, external OpenRouter calls and unused prompts.
The useful narrative moved to src/lib/narrative.ts. Obsolete environment examples and
website-first documentation were replaced.

This checkout had no committed project baseline; removed uncommitted source versions
cannot be restored through Git. No reset, restart, deployment or unrelated cleanup occurred.

## Limitations

See [validation](VALIDATION.md). Binance account permissions block full live acceptance.
Claude Code has no login/MCP configuration here. The actual GitHub URL is needed before
publication. No real order, authentication change or publication occurred.
