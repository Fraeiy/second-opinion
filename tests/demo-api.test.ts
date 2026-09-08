import { describe, it, expect, vi } from "vitest";
import { POST as analyze } from "@/app/api/analyze/route";
import { POST as execute } from "@/app/api/execute/route";
vi.mock("@/lib/binance/public-rest", () => ({
  validatePerpetualSymbol: async () => true,
  validateSpotSymbol: async () => true,
  buildPublicMarketSnapshot: async (symbol: string) => ({
    symbol, lastPrice: 600, bid: 599.9, ask: 600.1,
    timestamp: new Date().toISOString(), source: "binance_rest_public",
  }),
}));
function request(body: unknown) {
  return new Request("http://localhost/api", { method: "POST",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
describe("website simulation boundary", () => {
  it("analyzes then simulates a confirmed demo without a real order", async () => {
    const response = await analyze(request({ text: "$200 20x BNB long", mode: "demo" }));
    expect(response.status).toBe(200);
    const report = await response.json();
    expect(report.portfolio.isSimulated).toBe(true);
    expect(report.preview.executionLabel).toBe("SIMULATED");
    const fill = await execute(request({
      intent: report.intent, confirmationToken: report.confirmationToken,
      acknowledged: true, mode: "demo",
    }));
    const result = (await fill.json()).result;
    expect(result.ok).toBe(true);
    expect(result.simulated).toBe(true);
    expect(result.message).toContain("No Binance order");
  });
  it("rejects live modes, injected portfolios and policy overrides", async () => {
    for (const body of [
      { text: "$200 20x BNB long", mode: "trading" },
      { text: "$200 20x BNB long", portfolio: {} },
      { text: "$200 20x BNB long", policy: { lowMax: 100 } },
    ]) expect((await analyze(request(body))).status).toBe(400);
    expect((await execute(request({
      intent: { symbol: "BNBUSDT", side: "long", marketType: "perpetual", entryType: "market" },
      mode: "trading", confirmationToken: "not-a-real-token", acknowledged: true,
    }))).status).toBe(400);
  });
});
