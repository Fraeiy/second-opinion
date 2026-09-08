# Install in a supported client

Requires Node.js 22+, npm, Git and a supported client with its own login.
Use the actual GitHub clone URL where you obtained this repository in place of REPOSITORY_URL.
This checkout has no configured remote, so a public URL cannot yet be supplied.

```sh
git clone REPOSITORY_URL second-opinion
cd second-opinion
npm ci
npm run risk:example
```

The last command is an offline SIMULATED check, not Binance data.
No website, OpenRouter key or Binance environment variable is required.

## Codex CLI

```sh
npm install -g @openai/codex
codex --version
codex mcp add binance-agent-os --url https://agent.binance.com/mcp/agentic
codex mcp login binance-agent-os
codex mcp list
codex
```

Run these from the repository root. If binance-agent-os already exists, inspect it with
`codex mcp get binance-agent-os` rather than adding a duplicate. Complete Binance consent
in the client-owned browser flow. Start with market/account read permissions; enable trading
only when intentionally needed. Within Codex, use /mcp to inspect availability.
AGENTS.md directs the agent to the canonical skill; no manual skill copying is required.
On Windows PowerShell use codex.cmd and npm.cmd if script execution policy blocks the names above.

## Claude Code

Install Claude Code with your platform's instructions at
[Claude Code setup](https://code.claude.com/docs/en/setup).
Then, from this repository:

```sh
claude --version
claude mcp add --transport http --scope local binance-agent-os https://agent.binance.com/mcp/agentic
claude mcp get binance-agent-os
claude
```

Inside Claude Code run /mcp, select Binance and complete authentication through the client's
browser flow. CLAUDE.md points to the same canonical skill, command and policy as Codex.
Local scope keeps the MCP registration in client configuration for this project.

## Verify both clients with identical prompts

First ask:

> Discover the Binance Agent OS read tools. Retrieve the current BNBUSDT perpetual price, my authorized account equity and available margin, and all open positions. Report actual tool names and any unavailable capability. Do not prepare or submit orders.

Then ask:

> I want to open a $200 20x BNB long. Use Second Opinion to check it first.

The agent must run the local command with live observations, present its structured report,
challenge risk and stop before order preparation. If tool discovery or account access fails,
report the limitation. Never paste credentials or tokens into chat, files, the website or scripts.
Tool listings alone do not establish successful account access.

For reproducible offline checking, ask either client to run `npm run risk:example` and
explain the SIMULATED result. See [examples](EXAMPLES.md) and [measured validation](VALIDATION.md).

## Optional website

```sh
npm run dev
```

Open http://localhost:3000. All portfolio and execution behavior is SIMULATED.
Set NEXT_PUBLIC_REPOSITORY_URL in .env.local to the actual HTTPS GitHub repository before
publishing. Never configure Binance auth in website environment variables.

## Sources

[Codex MCP documentation](https://developers.openai.com/codex/mcp) documents client configuration
and MCP OAuth login. [Claude Code MCP documentation](https://code.claude.com/docs/en/mcp)
documents HTTP registration and /mcp authentication.
[Binance supported-client FAQ](https://www.binance.com/en/support/faq/detail/7a6e676e36fb455d96478932cb12d9f3)
lists Codex CLI and Claude Code and supplies the endpoint above.
Client support does not guarantee the user's region, account permissions or requested product is available.
