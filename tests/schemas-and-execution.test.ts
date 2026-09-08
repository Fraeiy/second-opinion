import { describe, expect, it } from "vitest";
import { AgentAnalysisOutputSchema } from "@/lib/schemas";
import { createBinanceAdapter } from "@/lib/binance/adapter";
import type { MarketSnapshot, TradeIntent } from "@/lib/types";

describe("model output validation", () => {
  it("accepts valid agent analysis output", () => {
    const parsed = AgentAnalysisOutputSchema.parse({
      verdict: "reject",
      riskScore: 82,
      riskLevel: "extreme",
      primaryConcern: "Leverage too high",
      shortExplanation: "20x with no stop is extreme.",
      evidence: ["leverage 20x", "missing stop"],
      importantMarketConditions: ["funding 0.01%"],
      dataTimestamp: new Date().toISOString(),
    });
    expect(parsed.verdict).toBe("reject");
  });

  it("rejects malformed analysis output", () => {
    expect(() =>
      AgentAnalysisOutputSchema.parse({
        verdict: "maybe",
        riskScore: 10,
      }),
    ).toThrow();
  });
});

describe("confirmation boundary and labels", () => {
  const intent: TradeIntent = {
    symbol: "BNBUSDT",
    marketType: "perpetual",
    side: "long",
    marginAmount: 200,
    leverage: 20,
    entryType: "market",
  };

  const market: MarketSnapshot = {
    symbol: "BNBUSDT",
    lastPrice: 600,
    timestamp: new Date().toISOString(),
    source: "binance_rest_public",
  };

  it("labels demo previews as SIMULATED", async () => {
    const adapter = createBinanceAdapter({ mode: "demo" });
    const preview = await adapter.previewOrder(intent, market, { mode: "demo" });
    expect(preview.executionLabel).toBe("SIMULATED");
  });

  it("refuses execution without acknowledgement", async () => {
    const adapter = createBinanceAdapter({ mode: "demo" });
    const token = adapter.createConfirmationToken(intent, "demo");
    const result = await adapter.submitOrder(intent, token, {
      mode: "demo",
      acknowledged: false,
    });
    expect(result.ok).toBe(false);
    expect(result.simulated).toBe(true);
    expect(result.label.toLowerCase()).toContain("simulated");
  });

  it("demo confirm returns simulated fill label", async () => {
    const adapter = createBinanceAdapter({ mode: "demo" });
    const token = adapter.createConfirmationToken(intent, "demo");
    const result = await adapter.submitOrder(intent, token, {
      mode: "demo",
      acknowledged: true,
    });
    expect(result.ok).toBe(true);
    expect(result.simulated).toBe(true);
    expect(result.label).toContain("SIMULATED");
    expect(result.message.toLowerCase()).toContain("no binance order");
  });

  it("rejects changed stop and limit, replay and live modes", async () => {
    const adapter = createBinanceAdapter();
    const token = adapter.createConfirmationToken(intent, "demo");
    for (const changed of [{ ...intent, stopLoss: 590 }, { ...intent, limitPrice: 610 }]) {
      expect((await adapter.submitOrder(changed, token, { mode: "demo", acknowledged: true })).ok).toBe(false);
    }
    expect((await adapter.submitOrder(intent, token, { mode: "demo", acknowledged: true })).ok).toBe(true);
    expect((await adapter.submitOrder(intent, token, { mode: "demo", acknowledged: true })).ok).toBe(false);
    for (const mode of ["readonly", "trading"] as const) {
      const liveToken = adapter.createConfirmationToken(intent, mode);
      const result = await adapter.submitOrder(intent, liveToken, { mode, acknowledged: true });
      expect(result.ok).toBe(false);
      expect(result.simulated).toBe(true);
      expect((await adapter.previewOrder(intent, market, { mode })).executionLabel).toBe("SIMULATED");
    }
  });
});
