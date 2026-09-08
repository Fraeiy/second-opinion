# Second Opinion

For trading reviews, read [the canonical skill](skills/second-opinion/SKILL.md).
Use [risk-policy.json](risk-policy.json), [scripts/analyze.ts](scripts/analyze.ts)
and [src/lib/risk-engine.ts](src/lib/risk-engine.ts) for every client.
Setup: [docs/INSTALL.md](docs/INSTALL.md). Do not duplicate underlying logic here.

Website execution is always simulated. Binance authentication and live account access
belong only to supported MCP clients. Never treat chat as execution confirmation or
invent Binance tool names. No secrets in client code.

For code changes, preserve useful work and run lint, typecheck, tests and production build.
