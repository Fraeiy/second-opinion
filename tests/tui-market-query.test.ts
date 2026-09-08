import { describe, expect, it, vi } from "vitest";
import { parseSimplePriceQuery, runSimplePriceQuery, selectPublicPriceTool } from "@/tui/market-query";

describe("fast Binance market queries", () => {
  it("recognizes a simple price question but not a trade review", () => {
    expect(parseSimplePriceQuery("What is the current BNB price?")).toEqual({ asset: "BNB", symbol: "BNBUSDT", marketType: "spot" });
    expect(parseSimplePriceQuery("I want to open a $200 20x BNB long")).toBeNull();
  });

  it("selects the cached public spot ticker and returns a natural answer", async () => {
    const query = parseSimplePriceQuery("What is the current BNB price?")!;
    const tools = ["futures_usds.newOrder", "spot.symbolPriceTicker", "futures_usds.symbolPriceTicker"];
    expect(selectPublicPriceTool(query, tools)).toBe("spot.symbolPriceTicker");
    const call = vi.fn().mockResolvedValue({ symbol: "BNBUSDT", price: "744.83" });

    const answer = await runSimplePriceQuery(query, tools, call);

    expect(call).toHaveBeenCalledExactlyOnceWith("spot.symbolPriceTicker", { symbol: "BNBUSDT" });
    expect(answer).toMatch(/^BNB is currently trading at \$744\.83, updated at .+ UTC\.$/);
  });

  it("times out with a useful retry message", async () => {
    const query = parseSimplePriceQuery("BNB price")!;
    await expect(runSimplePriceQuery(query, ["spot.symbolPriceTicker"], () => new Promise(() => {}), 1))
      .rejects.toThrow("Binance is taking too long. Please retry.");
  });
});
