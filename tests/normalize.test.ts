import { describe, expect, it } from "vitest";
import {
  computeImbalance,
  computeRealizedVolatilityPercent,
  computeSpreadBps,
  toNumber,
  unwrapMcpContent,
} from "@/lib/binance/normalize";

describe("binance normalize", () => {
  it("parses numbers safely", () => {
    expect(toNumber("12.5")).toBe(12.5);
    expect(toNumber("x")).toBeUndefined();
  });

  it("computes spread bps", () => {
    expect(computeSpreadBps(100, 100.1)?.toFixed(2)).toBe("10.00");
  });

  it("computes book imbalance", () => {
    const imbalance = computeImbalance(
      [
        [100, 5],
        [99, 5],
      ],
      [
        [101, 2],
        [102, 2],
      ],
    );
    expect(imbalance).toBeGreaterThan(0);
  });

  it("computes realized volatility from closes", () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i / 3));
    const vol = computeRealizedVolatilityPercent(closes);
    expect(vol).toBeTypeOf("number");
  });

  it("unwraps MCP text content JSON", () => {
    const unwrapped = unwrapMcpContent({
      content: [{ type: "text", text: '{"lastPrice":"1.23"}' }],
    });
    expect(unwrapped).toEqual({ lastPrice: "1.23" });
  });
});
