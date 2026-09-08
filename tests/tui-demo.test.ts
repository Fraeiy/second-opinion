import { describe, expect, it, vi } from "vitest";
import { assessDemo, parseDemoRequest, runDemoReview } from "@/tui/demo-review";

const prompt = "I have a $500 portfolio and want to open a $200 20x BNB long. Check it first.";
describe("recordable portfolio scenario", () => {
  it("rejects the original and calculates a smaller safer proposal using stated equity", () => {
    const result = assessDemo(prompt, { content: [{ type: "text", text: JSON.stringify({ symbol: "BNBUSDT", price: "600" }) }] });
    expect(result.portfolioEquity).toBe(500);
    expect(result.verdict).toBe("reject");
    expect(result.riskScore).toBe(92);
    expect(result.calculations.notional).toBe(4000);
    expect(result.calculations.maximumPlannedLoss).toBe(200);
    expect(result.saferAlternative?.leverage).toBe(5);
    expect(result.saferAlternative?.notionalAmount).toBe(500);
    expect(result.saferAssessment?.calculations.maximumPlannedLoss).toBeLessThanOrEqual(5.01);
    expect(result.orderSubmitted).toBe(false);
  });
  it("calls only the detected public ticker, never account or order tools", async () => {
    const call = vi.fn().mockResolvedValue({ symbol: "BNBUSDT", price: "600" });
    await runDemoReview(prompt, ["futures_usds.accountInformationV3", "futures_usds.symbolPriceTicker", "futures_usds.newOrder"], call);
    expect(call).toHaveBeenCalledExactlyOnceWith("futures_usds.symbolPriceTicker", { symbol: "BNBUSDT" });
  });
  it("keeps greetings out of the risk report and requires real public prices", () => {
    expect(parseDemoRequest("hi agent")).toBeNull();
    expect(() => assessDemo(prompt, { isError: true })).toThrow();
    expect(() => assessDemo(prompt, { symbol: "BTCUSDT", price: "600" })).toThrow();
  });
});
