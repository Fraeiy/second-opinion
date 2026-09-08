import { describe, expect, it } from "vitest";
import fixture from "../examples/bnb-risk.fixture.json";
import { runSkillWorkflow } from "@/lib/skill-workflow";
describe("portable risk workflow", () => {
  it("challenges the same prompt deterministically with no order", () => {
    const result = runSkillWorkflow(fixture);
    expect(result.riskScore).toBe(92);
    expect(result.verdict).toBe("reject");
    expect(result.calculations.notional).toBe(4000);
    expect(result.saferAlternative?.leverage).toBe(5);
    expect(result.saferAssessment?.calculations.maximumPlannedLoss).toBeLessThanOrEqual(10);
    expect(result.orderSubmitted).toBe(false);
    expect(result.executionLabel).toBe("SIMULATED");
  });
  it("blocks falsely labelled live fixtures and missing account context", () => {
    expect(() => runSkillWorkflow({ ...fixture, mode: "live" })).toThrow();
    expect(() => runSkillWorkflow({ ...fixture, portfolio: undefined })).toThrow();
  });
  it("blocks stale live snapshots", () => {
    expect(() => runSkillWorkflow({
      ...fixture, mode: "live",
      portfolio: { ...fixture.portfolio, isSimulated: false },
      provenance: { ...fixture.provenance, source: "binance_agent_os" },
    }, Date.parse("2026-09-07T12:03:00Z"))).toThrow(/Stale/);
  });
  it("requires direction, size and matching instruments", () => {
    for (const text of ["BNB", "Buy BNB", "$200 20x BTC long"])
      expect(() => runSkillWorkflow({ ...fixture, text })).toThrow();
  });
  it("does not accept model-calculated market metrics", () => {
    expect(() => runSkillWorkflow({ ...fixture, market: { ...fixture.market, spreadBps: 0 } })).toThrow();
  });
  it("keeps fresh live analysis blocked pending approval", () => {
    const result = runSkillWorkflow({
      ...fixture, mode: "live",
      portfolio: { ...fixture.portfolio, isSimulated: false },
      provenance: { ...fixture.provenance, source: "binance_agent_os" },
    }, Date.parse(fixture.market.timestamp));
    expect(result.executionLabel).toBe("blocked");
    expect(result.confirmationRequired).toBe(true);
    expect(result.orderPrepared).toBe(false);
  });
});
