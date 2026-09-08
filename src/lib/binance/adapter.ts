import { createHash, randomUUID } from "node:crypto";
import type { OperatingMode, TradeIntent, MarketSnapshot } from "@/lib/types";
import { DEFAULT_BINANCE_CAPABILITIES, type OrderPreview, type OrderSubmissionResult } from "./types";
import { buildPublicMarketSnapshot, validatePerpetualSymbol, validateSpotSymbol } from "./public-rest";
import { resolveSizing } from "@/lib/risk-engine";

/** Website-only public data and simulation. This module has no MCP or authentication path. */
export function createBinanceAdapter(_options: { mode?: OperatingMode } = {}) {
  void _options;
  const pending = new Map<string, { key: string; expires: number }>();
  const key = (intent: TradeIntent, mode: OperatingMode) =>
    createHash("sha256").update(JSON.stringify([
      intent.symbol, intent.marketType, intent.side, intent.marginAmount,
      intent.notionalAmount, intent.leverage, intent.entryType, intent.limitPrice,
      intent.stopLoss, intent.takeProfit, mode,
    ])).digest("hex");
  return {
    getConnectionState: () => "public_data" as const,
    getCapabilities: () => ({ ...DEFAULT_BINANCE_CAPABILITIES }),
    getStatus: (_mode: OperatingMode = "demo") => {
      void _mode;
      return {
        state: "public_data" as const, mode: "demo" as const,
        capabilities: { ...DEFAULT_BINANCE_CAPABILITIES },
        message: "Public market demo. Portfolio and execution are SIMULATED.",
      };
    },
    validateSymbol: (symbol: string, marketType: "spot" | "perpetual") =>
      marketType === "perpetual" ? validatePerpetualSymbol(symbol) : validateSpotSymbol(symbol),
    getMarketSnapshot: buildPublicMarketSnapshot,
    createConfirmationToken(intent: TradeIntent, mode: OperatingMode) {
      for (const [token, value] of pending) if (value.expires <= Date.now()) pending.delete(token);
      if (pending.size >= 1000) pending.delete(pending.keys().next().value!);
      const token = randomUUID();
      pending.set(token, { key: key(intent, mode), expires: Date.now() + 600_000 });
      return token;
    },
    async previewOrder(intent: TradeIntent, market: MarketSnapshot,
      opts: { mode: OperatingMode; maximumPlannedLoss?: number }): Promise<OrderPreview> {
      const leverage = intent.marketType === "spot" ? 1 : intent.leverage ?? 1;
      const { notional } = resolveSizing(intent, leverage);
      const price = intent.entryType === "limit" ? intent.limitPrice : market.lastPrice;
      return {
        intent, symbol: intent.symbol, side: intent.side, marketType: intent.marketType,
        entryType: intent.entryType, notional, leverage,
        quantity: price && price > 0 ? notional / price : undefined,
        entryPriceLabel: intent.entryType === "limit" ? `Limit ${price}` : `Market ~${price}`,
        stopLoss: intent.stopLoss, takeProfit: intent.takeProfit,
        maximumPlannedLoss: opts.maximumPlannedLoss,
        executionLabel: "SIMULATED",
        warnings: ["SIMULATED preview. No Binance order will be submitted."],
        timestamp: new Date().toISOString(),
      };
    },
    async submitOrder(intent: TradeIntent, token: string,
      opts: { mode: OperatingMode; acknowledged: boolean }): Promise<OrderSubmissionResult> {
      const entry = pending.get(token);
      const ok = opts.mode === "demo" && opts.acknowledged && !!entry &&
        entry.expires > Date.now() && entry.key === key(intent, opts.mode);
      if (ok || (entry && entry.expires <= Date.now())) pending.delete(token);
      return {
        ok, simulated: true, label: "SIMULATED - not a real Binance order",
        message: ok ? "Simulated fill recorded. No Binance order was submitted."
          : "Simulation requires demo mode, acknowledgement and a fresh matching unused preview token.",
        ...(ok ? { orderId: `sim_${randomUUID()}` } : {}),
        intent, timestamp: new Date().toISOString(),
      };
    },
  };
}
export type BinanceAdapter = ReturnType<typeof createBinanceAdapter>;
let singleton: BinanceAdapter | undefined;
export function getBinanceAdapter() { return singleton ??= createBinanceAdapter(); }
