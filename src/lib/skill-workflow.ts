import { z } from "zod";
import policy from "../../risk-policy.json";
import { TradeIntentSchema, parseTradeIntentHeuristic } from "./trade-intent";
import { PortfolioContextSchema } from "./schemas";
import { assessTradeRisk } from "./risk-engine";
import { computeSpreadBps, computeImbalance, computeRealizedVolatilityPercent } from "./binance/normalize";
import type { MarketSnapshot } from "./types";

const positive = z.number().positive();
const level = z.tuple([positive, z.number().nonnegative()]);
export const SkillInputSchema = z.object({
  mode: z.enum(["live", "fixture"]),
  text: z.string().min(1).optional(),
  intent: TradeIntentSchema.optional(),
  market: z.object({
    symbol: z.string().regex(/^[A-Z0-9]+USDT$/),
    marketType: z.enum(["spot", "perpetual"]),
    lastPrice: positive,
    timestamp: z.iso.datetime(),
    bid: positive.optional(), ask: positive.optional(),
    fundingRate: z.number().optional(),
    closes: z.array(positive).optional(),
    bids: z.array(level).optional(), asks: z.array(level).optional(),
  }).strict(),
  portfolio: PortfolioContextSchema.extend({
    totalEquityUsd: positive,
    availableMarginUsd: z.number().nonnegative(),
  }).strict(),
  provenance: z.object({
    source: z.enum(["binance_agent_os", "fixture"]),
    marketTool: z.string().min(1),
    accountTool: z.string().min(1),
    positionsTool: z.string().min(1),
    accountTimestamp: z.iso.datetime(),
    positionsTimestamp: z.iso.datetime(),
    symbolValidated: z.literal(true),
    positionsComplete: z.literal(true),
  }).strict(),
}).strict();

/** Pure analysis. Input is supplied by the supported client; no network, secrets or order calls. */
export function runSkillWorkflow(raw: unknown, now = Date.now()) {
  const input = SkillInputSchema.parse(raw);
  if (input.mode === "live") {
    if (input.provenance.source !== "binance_agent_os" || input.portfolio.isSimulated)
      throw new Error("Live analysis requires Agent OS account and market data.");
    for (const timestamp of [input.market.timestamp, input.provenance.accountTimestamp, input.provenance.positionsTimestamp]) {
      const age = now - Date.parse(timestamp);
      if (age > policy.maxDataAgeSeconds * 1000 || age < -policy.futureTimestampToleranceSeconds * 1000)
        throw new Error("Stale or future data. Refresh through the supported client's Binance MCP.");
    }
  } else if (input.provenance.source !== "fixture" || !input.portfolio.isSimulated) {
    throw new Error("Fixtures must be labelled simulated.");
  }
  if (input.intent && input.text) throw new Error("Provide text or intent, not both.");
  if (!input.intent && !/\b(long|short|buy|sell)\b/i.test(input.text ?? ""))
    throw new Error("Clarify direction before analysis.");
  if (!input.intent && /\b(?:[A-Z]+(?:\/)?(?:USDC|BUSD)|spot.*\d+\s*x)\b/i.test(input.text ?? ""))
    throw new Error("Clarify unsupported quote currency or leveraged spot product.");
  const intent = TradeIntentSchema.parse(input.intent ??
    parseTradeIntentHeuristic(input.text ?? "", input.portfolio.totalEquityUsd));
  if (!intent.marginAmount && !intent.notionalAmount) throw new Error("Clarify size or provide entry and stop for loss-budget sizing.");
  if (intent.symbol !== input.market.symbol || intent.marketType !== input.market.marketType)
    throw new Error("Market symbol/type does not match intent.");
  if (intent.entryType === "limit" && !intent.limitPrice) throw new Error("Limit price required.");
  if (intent.marketType === "spot" && (intent.leverage && intent.leverage !== 1 || !["buy", "sell"].includes(intent.side)))
    throw new Error("Spot only supports unleveraged buy/sell.");
  if (intent.marketType === "perpetual" && (!intent.leverage || !["long", "short"].includes(intent.side)))
    throw new Error("Perpetual requires leverage and long/short direction.");
  const leverage = intent.marketType === "spot" ? 1 : intent.leverage!;
  if (intent.marginAmount && intent.notionalAmount &&
      Math.abs(intent.marginAmount * leverage - intent.notionalAmount) > 0.01)
    throw new Error("Conflicting margin and notional; clarify sizing.");
  const m = input.market;
  const bid = m.bid ?? m.bids?.[0]?.[0];
  const ask = m.ask ?? m.asks?.[0]?.[0];
  if (bid && ask && bid > ask) throw new Error("Crossed bid/ask data.");
  const market: MarketSnapshot = {
    symbol: m.symbol, lastPrice: m.lastPrice, timestamp: m.timestamp,
    source: input.mode === "live" ? "binance_mcp" : "binance_rest_public",
    bid, ask, fundingRate: m.fundingRate,
    spreadBps: computeSpreadBps(bid, ask),
    orderBookImbalance: m.bids && m.asks ? computeImbalance(m.bids, m.asks) : undefined,
    realizedVolatilityPercent: m.closes ? computeRealizedVolatilityPercent(m.closes) : undefined,
  };
  const assessment = assessTradeRisk(intent, market, input.portfolio);
  if (Object.values(assessment.calculations).some(value =>
    typeof value === "number" && !Number.isFinite(value)))
    throw new Error("Input exceeds finite calculation limits.");
  const saferAssessment = assessment.saferAlternative
    ? assessTradeRisk(assessment.saferAlternative, market, input.portfolio) : null;
  const gaps = [
    market.spreadBps == null ? "spread" : null,
    market.orderBookImbalance == null ? "orderBook" : null,
    market.realizedVolatilityPercent == null ? "volatility" : null,
    intent.marketType === "perpetual" && m.fundingRate == null ? "funding" : null,
  ].filter((v): v is string => v !== null);
  return {
    schemaVersion: 1, mode: input.mode, intent,
    verdict: assessment.verdict, riskScore: assessment.score, riskLevel: assessment.level,
    primaryConcern: assessment.reasons[0]?.explanation,
    evidence: assessment.reasons, calculations: assessment.calculations,
    saferAlternative: assessment.saferAlternative ?? null,
    saferAssessment, dataTimestamp: market.timestamp, provenance: input.provenance,
    dataGaps: gaps,
    sizingAssumption: input.text ? "Dollar amounts beside leverage and portfolio percentages are margin commitments; confirm this interpretation." : "Explicit structured sizing.",
    lossCaveat: "Planned loss excludes fees, funding and slippage; a stop is not a guaranteed maximum. No-stop perpetual loss uses margin at risk, not a cross-margin loss bound. Liquidation is a simplified estimate.",
    executionLabel: input.mode === "fixture" ? "SIMULATED" : "blocked",
    confirmationRequired: true,
    preparationEligible: input.mode === "live" && gaps.length === 0 &&
      assessment.verdict !== "reject" && assessment.verdict !== "reduce" &&
      !assessment.reasons.some(r => r.severity === "critical"),
    orderPrepared: false, orderSubmitted: false,
  };
}
