import { AgentAnalysisOutputSchema, type AgentAnalysisOutput } from "./schemas";
import type { TradeIntent, MarketSnapshot, RiskAssessment, PortfolioContext } from "./types";
function repairWithDeterministicFallback(input: {
  intent: TradeIntent;
  risk: RiskAssessment;
  market: MarketSnapshot;
}): AgentAnalysisOutput {
  const topReasons = input.risk.reasons.slice(0, 3).map((r) => r.explanation);
  return AgentAnalysisOutputSchema.parse({
    verdict: input.risk.verdict,
    riskScore: input.risk.score,
    riskLevel: input.risk.level,
    primaryConcern: topReasons[0] || "Review the calculated risk metrics before continuing.",
    shortExplanation: `Deterministic engine scored this ${input.intent.symbol} trade at ${input.risk.score}/100 (${input.risk.level}). Verdict: ${input.risk.verdict}.`,
    evidence: topReasons.length
      ? topReasons
      : [`Score ${input.risk.score}`, `Notional ${input.risk.calculations.notional}`],
    maximumEstimatedLoss:
      input.risk.calculations.maximumPlannedLoss != null
        ? `$${input.risk.calculations.maximumPlannedLoss.toFixed(2)}`
        : "Undefined without a stop loss",
    positionExposure:
      input.risk.calculations.portfolioExposurePercent != null
        ? `${input.risk.calculations.portfolioExposurePercent.toFixed(1)}% of portfolio notional`
        : undefined,
    importantMarketConditions: [
      `Last price ${input.market.lastPrice}`,
      input.market.fundingRate != null
        ? `Funding ${(input.market.fundingRate * 100).toFixed(4)}%`
        : "Funding unavailable",
      input.market.spreadBps != null
        ? `Spread ${input.market.spreadBps.toFixed(2)} bps`
        : "Spread unavailable",
    ].filter(Boolean),
    saferProposedTradeSummary: input.risk.saferAlternative
      ? `${input.risk.saferAlternative.side} ${input.risk.saferAlternative.symbol} at ${input.risk.saferAlternative.leverage ?? 1}x`
      : undefined,
    dataTimestamp: input.market.timestamp,
  });
}

export async function generateRiskNarrative(input: {
  intent: TradeIntent; risk: RiskAssessment; market: MarketSnapshot;
  portfolio: PortfolioContext; mode: string;
}): Promise<{ analysis: AgentAnalysisOutput; usedModel: boolean; model?: string }> {
  return { analysis: repairWithDeterministicFallback(input), usedModel: false };
}
