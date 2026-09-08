# Cross-client acceptance examples

Run the identical prompts from the repository root in Codex CLI and Claude Code.
Both use the same canonical skill, scripts/analyze.ts and risk-policy.json.

| Prompt | Expected behavior |
| --- | --- |
| I want to open a $200 20x BNB long. Use Second Opinion to check it first. | Retrieve Agent OS observations, disclose margin interpretation, run engine, challenge risk, show candidate, stop before preparation |
| Can I risk 40% of my portfolio on a 15x BTC short? Use Second Opinion before any order. | Clarify commitment versus loss budget; deterministic sizing from live equity; no order |
| Build me a lower-risk ETH trade with a maximum loss of $10. | Ask direction, entry and stop; never fabricate them or claim a guaranteed loss bound |
| Use the safer plan. | Refresh data, rerun exact candidate; accepting a candidate does not authorize preparation or trading |
| Cancel. | Stop pending preparation; cancelling an existing exchange order requires its exact identity and a separate action approval |

## Reproducible report

Ask either client: "Run npm run risk:example and explain the SIMULATED report. Do not call trading tools."
With the checked-in BNB fixture and unchanged policy, the expected report includes:

```json
{
  "mode": "fixture",
  "verdict": "reject",
  "riskScore": 92,
  "riskLevel": "extreme",
  "calculations": {
    "notional": 4000,
    "marginRequired": 200,
    "portfolioExposurePercent": 400,
    "maximumPlannedLoss": 200,
    "maximumPlannedLossPercent": 20
  },
  "executionLabel": "SIMULATED",
  "confirmationRequired": true,
  "orderPrepared": false,
  "orderSubmitted": false
}
```

This excerpt is a test expectation, never a live market claim. The full report also includes
evidence, provenance, caveats and a separately assessed safer candidate.
Live values and scores vary with observed data; do not copy fixture numbers into live reports.
