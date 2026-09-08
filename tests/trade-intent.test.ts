import { describe, expect, it } from "vitest";
import {
  normalizeSymbol,
  parseTradeIntentHeuristic,
  validateTradeIntent,
} from "@/lib/trade-intent";

describe("trade intent", () => {
  it("normalizes symbols to USDT pairs", () => {
    expect(normalizeSymbol("bnb")).toBe("BNBUSDT");
    expect(normalizeSymbol("BTCUSDT")).toBe("BTCUSDT");
    expect(normalizeSymbol("eth/usdc")).toBe("ETHUSDT");
  });

  it("parses the hackathon demo long", () => {
    const intent = parseTradeIntentHeuristic(
      "I want to open a $200 20x BNB long. Check it first.",
    );
    expect(intent).toBeTruthy();
    expect(intent!.symbol).toBe("BNBUSDT");
    expect(intent!.marketType).toBe("perpetual");
    expect(intent!.side).toBe("long");
    expect(intent!.marginAmount).toBe(200);
    expect(intent!.leverage).toBe(20);
    expect(intent!.entryType).toBe("market");
  });

  it("parses portfolio percent shorts", () => {
    const intent = parseTradeIntentHeuristic(
      "Can I risk 40% of my portfolio on a 15x BTC short?",
      10_000,
    );
    expect(intent).toBeTruthy();
    expect(intent!.symbol).toBe("BTCUSDT");
    expect(intent!.side).toBe("short");
    expect(intent!.leverage).toBe(15);
    expect(intent!.marginAmount).toBe(4000);
  });

  it("validates with Zod", () => {
    const ok = validateTradeIntent({
      symbol: "ETHUSDT",
      marketType: "spot",
      side: "buy",
      notionalAmount: 100,
      entryType: "market",
    });
    expect(ok.success).toBe(true);

    const bad = validateTradeIntent({
      symbol: "",
      marketType: "spot",
      side: "buy",
      entryType: "market",
    });
    expect(bad.success).toBe(false);
  });
});
