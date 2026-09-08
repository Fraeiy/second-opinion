# Validation and runtime limitations

Test date: 2026-09-07.

## Local checks

Lint and TypeScript checks passed. All 28 tests across six suites passed.
Tests preserve the original suite and add the portable fixture, freshness/missing inputs,
false live labels, instrument mismatch, model-supplied metrics, full-intent confirmation,
replay, non-demo rejection and mocked website analysis-to-simulation coverage.
The production build completed successfully (exit 0), including compilation, type validation,
static generation and build tracing. Generated routes include /install and /repository;
/api/connection is absent.

The fixture reports reject, 92/extreme, SIMULATED, orderPrepared=false and orderSubmitted=false.
Its 5x candidate has a separate assessment and still triggers critical exposure.
It is not approved for trading.

## Codex CLI 0.153.4

The actual CLI read the canonical skill and successfully ran risk:example.
Windows Node EPERM on C:\Users\USER required an automatically reviewed escalation.
The final read-only test waited for MCP initialization:

- futures_usds.symbolPriceTicker succeeded for BNBUSDT with a server timestamp.
- futures_usds.accountInformationV3 returned Binance -2015.
- Unfiltered futures_usds.positionInformationV2 returned Binance -2015.

The account error was "Invalid API-key, IP, or permissions for action". That is
Binance's error text, not a request to supply credentials to this project.
Complete live inputs were unavailable, so the skill correctly did not run live risk:analyze
or invent a score. No fixture substituted for live data. No order preparation or submission.
Full live end-to-end acceptance remains incomplete.

Earlier runs encountered a transient HTTP 502, an unavailable tool catalog, and required
read approvals blocked by noninteractive approval policy "never". Waiting for required
MCP startup and enabling automatic approval review allowed the final market read.
Use the interactive client normally and retain native tool approvals.

## Claude Code 2.1.220

Version, MCP list and authentication status were checked. No MCP servers are configured
and loggedIn=false. CLAUDE.md, canonical workflow, shared command and setup are structurally
complete. Authenticated Claude execution and live data remain untested.

## Remaining limits

No native live preview/order capability is claimed verified. The workflow requires verified
tools and separate explicit approvals or leaves execution unavailable. The local command
has no networking or order implementation and trusts client-provided provenance assertions.
The skill cannot enforce policy over unrelated host tools.

No Git remote exists. Set the actual GitHub URL before publication; the website shows an
honest unconfigured destination until then. No deployment or new screenshot review occurred.

Dependency installation reported four audit findings (three high, one critical).
This migration did not perform a broad dependency security upgrade; review advisories
before publishing the demo.
