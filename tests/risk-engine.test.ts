import { describe, expect, it } from "vitest";
import { assessTradeRisk, generateSaferAlternative } from "@/lib/risk-engine";
import { DEFAULT_RISK_POLICY } from "@/lib/policy";
import { getDemoPortfolio } from "@/lib/demo-portfolio";
import type { MarketSnapshot, TradeIntent } from "@/lib/types";

const market: MarketSnapshot = {
  symbol: "BNBUSDT",
  lastPrice: 600,
  bid: 599.9,
  ask: 600.1,
  spreadBps: 3.3,
  change24hPercent: 1.2,
  fundingRate: 0.0001,
  realizedVolatilityPercent: 2.5,
  orderBookImbalance: 0.1,
  timestamp: new Date().toISOString(),
  source: "binance_rest_public",
};

const dangerous: TradeIntent = {
  symbol: "BNBUSDT",
  marketType: "perpetual",
  side: "long",
  marginAmount: 200,
  leverage: 20,
  entryType: "market",
};

describe("risk engine", () => {
  it("scores high leverage without stop as high or extreme and rejects/reduces", () => {
    const assessment = assessTradeRisk(dangerous, market, getDemoPortfolio());
    expect(assessment.score).toBeGreaterThanOrEqual(55);
    expect(["high", "extreme"]).toContain(assessment.level);
    expect(["reduce", "reject"]).toContain(assessment.verdict);
    expect(assessment.reasons.some((r) => r.code.includes("LEVERAGE"))).toBe(true);
    expect(assessment.reasons.some((r) => r.code === "MISSING_STOP_LOSS")).toBe(true);
  });

  it("applies missing stop loss penalty from policy", () => {
    const withStop: TradeIntent = {
      ...dangerous,
      stopLoss: 570,
    };
    const noStop = assessTradeRisk(dangerous, market, getDemoPortfolio());
    const stopped = assessTradeRisk(withStop, market, getDemoPortfolio());
    expect(noStop.score).toBeGreaterThan(stopped.score);
  });

  it("flags extreme portfolio exposure", () => {
    const huge: TradeIntent = {
      symbol: "BTCUSDT",
      marketType: "perpetual",
      side: "short",
      marginAmount: 4000,
      leverage: 15,
      entryType: "market",
    };
    const assessment = assessTradeRisk(huge, { ...market, symbol: "BTCUSDT" }, getDemoPortfolio());
    expect(assessment.calculations.portfolioExposurePercent ?? 0).toBeGreaterThan(
      DEFAULT_RISK_POLICY.portfolioExposureWarnPercent,
    );
    expect(assessment.score).toBeGreaterThanOrEqual(55);
  });

  it("generates a safer alternative with lower leverage and a stop", () => {
    const assessment = assessTradeRisk(dangerous, market, getDemoPortfolio());
    const safer =
      assessment.saferAlternative ??
      generateSaferAlternative(dangerous, assessment, getDemoPortfolio());
    expect(safer).toBeTruthy();
    expect((safer!.leverage ?? 1) <= 5).toBe(true);
    expect((safer!.notionalAmount ?? 0) < 4000).toBe(true);
    expect(safer!.stopLoss).toBeTypeOf("number");
  });

  it("maps low risk trades to proceed/caution", () => {
    const mild: TradeIntent = {
      symbol: "ETHUSDT",
      marketType: "spot",
      side: "buy",
      notionalAmount: 50,
      entryType: "market",
      stopLoss: market.lastPrice * 0.98,
    };
    const assessment = assessTradeRisk(
      mild,
      { ...market, symbol: "ETHUSDT" },
      getDemoPortfolio(),
    );
    expect(assessment.score).toBeLessThan(55);
    expect(["proceed", "caution"]).toContain(assessment.verdict);
  });
});
