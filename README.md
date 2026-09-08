# Second Opinion

Second Opinion is a safety-first trading review layer: Codex retrieves observations through the user’s configured Binance Agent OS MCP, a local TypeScript engine calculates risk, and a custom terminal UI makes the challenge and approval boundary visible. “Your AI should know when to push back.”

## Architecture

```text
Ink TUI → Codex App Server (JSON-RPC/stdio) → Second Opinion skill
       → deterministic risk engine → Binance Agent OS MCP
```

The TUI starts `codex app-server` with the absolute repository root as `cwd`, performs `initialize`, creates or resumes a thread, streams item and tool events, and submits turns with a JSON Schema output contract. It never scrapes ANSI output, stores credentials, or auto-approves commands. The generated `.app-server-schema/` bindings are from the installed Codex version and document the protocol used by the client.

## Quick start

```bash
git clone <repository-url>
cd second-opinion
npm install
npm run second-opinion
```

Use Enter to submit, Escape to cancel a turn, `Ctrl+O` to open the operating-mode selector, `S` to select a safer proposal, and `Y`/`N` to answer a Codex command or MCP elicitation approval. `Ctrl+M` is intentionally not used because many terminals send it as Enter. The approval screen is separate from the initial request. Real order submission remains subject to Codex and Binance permissions; the website and demo paths are always labelled `SIMULATED`.

The same selector is available with `/mode`. Direct commands are `/mode market`, `/mode read`, and `/mode trading`. New sessions select Read Only after connected account-capable tools are detected, otherwise Market Data. The header reports the application mode separately from the detected Binance capability.

- **Market Data** exposes only public market-information and discovery tools. Account, position, order, transfer, and generic execution tools are excluded from the Codex thread.
- **Read Only** also exposes account, balance, and position reads, while order writes, cancellations, transfers, and generic execution remain excluded.
- **Trading** is offered only when an authenticated, connected Binance MCP exposes trading tools. Enabling it changes the session's tool allowlist but does not change OAuth scopes and is never approval for an order. Every exposed order-write tool is configured to prompt for a separate explicit approval. Transfers, withdrawals, deposits, borrowing, and repayment remain unavailable.

## Binance and portable agents

Connect the official server in Codex with `codex mcp add binance-agent-os --url https://agent.binance.com/mcp/agentic`, then authenticate with `codex mcp login binance-agent-os`. The TUI reuses that configuration and shows MCP status through `mcpServerStatus/list`; it never asks for keys or OAuth tokens. If authentication is unavailable, it reports the state and can still review simulated inputs.

Claude Code users connect the same MCP URL with `claude mcp add --transport http --scope local binance-agent-os https://agent.binance.com/mcp/agentic`, authenticate in Claude’s native `/mcp` flow, and use `skills/second-opinion/SKILL.md` in the repository. Codex CLI native terminal, Claude Code native terminal, and the custom TUI are the tested integrations; other agents are portable by the skill contract but not claimed as tested.

## Risk policy and demo

`risk-policy.json` is the single threshold source. `src/lib/risk-engine.ts` covers leverage, margin, exposure, stop distance, planned loss, funding, volatility, spread, liquidity, existing positions and risk/reward, and generates a capped-leverage safer candidate. Run the portable deterministic command with `npm run --silent risk:analyze -- <input.json|->`; use `npm run risk:example` for the offline simulated fixture. Demo mode uses public market data plus a clearly labelled simulated portfolio and never places a Binance order.

## Security and limits

Authentication belongs to the supported agent client. No secrets are accepted by this repository. Every trading action requires a fresh, explicit approval and native Binance tool evidence. Account access, maintenance margin, fees, funding and slippage can limit or block a live assessment; liquidation is an intentionally simplified estimate.

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Demo sequence: launch the TUI, submit “I want to open a $200 20x BNB long. Use Second Opinion to check it first.”, watch live ticker/MCP activity, inspect the deterministic rejection and safer comparison, press `S` if desired, then observe the dedicated approval screen. No order is submitted by that sequence.
