# Local input and report contract

Run from the repository root:

```sh
npm run --silent risk:analyze -- .second-opinion/input.json
```

Alternatively pass "-" to read JSON from stdin. Exit code 1 and a blocked error mean no valid
report was produced. The command makes no network calls and never prepares or submits orders.

Use examples/bnb-risk.fixture.json as the schema example, not as a source of live values.
The validator is src/lib/skill-workflow.ts. Only these fields are accepted:

| Field | Meaning |
| --- | --- |
| mode | live or fixture |
| text OR intent | Original supported prompt, or explicit TradeIntentSchema fields |
| market | symbol, marketType, lastPrice, timestamp; optional bid/ask, fundingRate (decimal rate), closes, bids/asks as [price, quantity] |
| portfolio | totalEquityUsd, availableMarginUsd, positions, isSimulated, label |
| portfolio.positions | Complete positions: symbol, side, notionalUsd, optional unrealizedPnlUsd |
| provenance | source, actual marketTool/accountTool/positionsTool names, accountTimestamp, positionsTimestamp, symbolValidated=true, positionsComplete=true |

Live input requires source=binance_agent_os, isSimulated=false and fresh timestamps
within risk-policy.json limits. Fixture input requires source=fixture and isSimulated=true.
Do not invent tool names, snapshots or account valuations. An empty positions list is valid
only when a successful complete account read reports no positions.

The client must copy actual USD/USDT equity and available-margin fields from the relevant account.
Do not pass token quantities as dollars, sum overlapping wallets or use spot equity to imply
available futures collateral. The present contract supports linear USDT proposals. Other quotes,
multi-asset valuation or incompatible response shapes require a verified deterministic adapter.
Document the precise account scope in portfolio.label.

Copy raw prices, funding decimals and depth levels. The module calculates spread, imbalance,
sample standard deviation of simple closing returns (not annualized), percentage sizing and risk.
All closes must use the same interval; prefer hourly bars. Record the observation time without
relabelling stale exchange observations. Raw tool credentials must never enter this contract.

Dollar amounts beside leverage are interpreted as margin for analysis; portfolio-percent
phrases are margin commitment, not a maximum-loss constraint. The report discloses that assumption.
Clarify before preparation. For maximum-loss sizing use an explicit direction, entry and stop;
the parser calculates notional from their distance. Missing direction or size blocks.

The report returns verdict, riskScore, riskLevel, evidence, calculations, saferAlternative,
saferAssessment, dataGaps, provenance, dataTimestamp, sizingAssumption, lossCaveat,
executionLabel, confirmationRequired, preparationEligible, orderPrepared and orderSubmitted.
Preparation eligibility is not approval. Fixtures always say SIMULATED; live reports remain blocked
for execution. No separate HTTP service or client-specific numerical logic is needed.

Input provenance is a client assertion, not a cryptographic attestation. A standalone caller
can fabricate input; the skill requires actual MCP evidence. Keep live input in ignored
.second-opinion/ or stdin and delete it when no longer needed.
