import { describe, expect, it, vi } from "vitest";
import { buildModeConfig, classifyBinanceTool, detectBinanceCapability, isToolAllowed, parseModeCommand, TRADING_PERMISSION_UNAVAILABLE, waitForBinanceStatus } from "@/tui/modes";

const tools = {
  "futures_usds.symbolPriceTicker": { description: "Symbol Price Ticker" },
  "futures_usds.accountInformationV3": { description: "Account Information V3 (USER_DATA)" },
  "futures_usds.positionInformationV2": { description: "Position Information V2 (USER_DATA)" },
  "futures_usds.newOrder": { description: "New Order (TRADE)" },
  "futures_usds.cancelOrder": { description: "Cancel Order (TRADE)" },
  "asset.universalTransfer": { description: "Universal Transfer (USER_DATA)" },
  tool_search: { description: "Search tools" },
  tool_execute: { description: "Execute any visible tool" },
};

describe("Second Opinion operating modes", () => {
  it("blocks account, write, transfer, and generic execution tools in Market Data mode", () => {
    expect(isToolAllowed("market", "futures_usds.symbolPriceTicker", tools["futures_usds.symbolPriceTicker"])).toBe(true);
    for (const name of ["futures_usds.accountInformationV3", "futures_usds.positionInformationV2", "futures_usds.newOrder", "futures_usds.cancelOrder", "asset.universalTransfer", "tool_execute"] as const) {
      expect(isToolAllowed("market", name, tools[name])).toBe(false);
    }
  });

  it("allows account reads but blocks every write path in Read Only mode", () => {
    expect(isToolAllowed("read", "futures_usds.accountInformationV3", tools["futures_usds.accountInformationV3"])).toBe(true);
    expect(isToolAllowed("read", "futures_usds.positionInformationV2", tools["futures_usds.positionInformationV2"])).toBe(true);
    for (const name of ["futures_usds.newOrder", "futures_usds.cancelOrder", "asset.universalTransfer", "tool_execute"] as const) {
      expect(isToolAllowed("read", name, tools[name])).toBe(false);
    }
  });

  it("requires a prompt for every Trading order tool and never enables transfers", () => {
    const config = buildModeConfig("trading", tools).mcp_servers["binance-agent-os"];
    expect(config.enabled_tools).toContain("futures_usds.newOrder");
    expect(config.enabled_tools).toContain("futures_usds.cancelOrder");
    expect(config.enabled_tools).not.toContain("asset.universalTransfer");
    expect(config.enabled_tools).not.toContain("tool_execute");
    expect(config.tools["futures_usds.newOrder"]).toEqual({ approval_mode: "prompt" });
    expect(config.tools["futures_usds.cancelOrder"]).toEqual({ approval_mode: "prompt" });
  });

  it("detects Trading only from a connected authenticated MCP exposing trade tools", () => {
    expect(detectBinanceCapability({ name: "binance-agent-os", runtimeStatus: "connected", authStatus: "oAuth", tools })).toBe("Trading");
    expect(detectBinanceCapability({ name: "binance-agent-os", runtimeStatus: "starting", authStatus: "oAuth", tools })).toBe("Unknown");
    expect(classifyBinanceTool("asset.universalTransfer", tools["asset.universalTransfer"])).toBe("transfer");
  });

  it("waits for Binance MCP startup before detecting capability", async () => {
    const statuses = [
      { name: "binance-agent-os", runtimeStatus: "starting", authStatus: "oAuth", tools: {} },
      { name: "binance-agent-os", runtimeStatus: "connected", authStatus: "oAuth", tools },
    ];
    const fetchStatus = vi.fn().mockImplementation(async () => ({ data: [statuses.shift()] }));

    const status = await waitForBinanceStatus(fetchStatus, { pollMs: 0, timeoutMs: 100 });

    expect(fetchStatus).toHaveBeenCalledTimes(2);
    expect(status?.runtimeStatus).toBe("connected");
    expect(detectBinanceCapability(status)).toBe("Trading");
  });

  it("parses every documented typed mode command", () => {
    expect(parseModeCommand("/mode")).toBe("selector");
    expect(parseModeCommand("/mode market")).toBe("market");
    expect(parseModeCommand("/mode read")).toBe("read");
    expect(parseModeCommand("/mode trading")).toBe("trading");
    expect(parseModeCommand("/mode other")).toBeNull();
    expect(TRADING_PERMISSION_UNAVAILABLE).toContain("grant the required Trade scope");
  });
});
