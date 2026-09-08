import { parseTradeIntentHeuristic } from "../lib/trade-intent";
import { assessTradeRisk } from "../lib/risk-engine";
import { normalizeTicker } from "../lib/binance/normalize";
import type { MarketSnapshot } from "../lib/types";

export function parseDemoRequest(text: string) {
  if (!/\b(long|short|buy|sell)\b/i.test(text)) return null;
  const intent = parseTradeIntentHeuristic(text);
  if (!intent) return null;
  const match = text.match(/\$([\d,]+(?:\.\d+)?)\s+portfolio\b/i)
    ?? text.match(/portfolio\s+(?:of\s+)?\$([\d,]+(?:\.\d+)?)/i);
  const equity = match ? Number(match[1].replaceAll(",", "")) : undefined;
  return { intent, equity };
}

/** User-declared scenario, never an assertion about the authenticated account. */
export function assessDemo(text: string, tickerResult: unknown) {
  const request = parseDemoRequest(text);
  if (!request?.equity || !Number.isFinite(request.equity)) throw new Error("Include your portfolio size, for example: I have a $500 portfolio.");
  if (!request.intent.marginAmount && !request.intent.notionalAmount) throw new Error("Include the trade size.");
  const ticker = normalizeTicker(tickerResult, request.intent.symbol);
  if (ticker.symbol !== request.intent.symbol || !(ticker.lastPrice > 0)) throw new Error("Binance returned an invalid price or mismatched symbol.");
  const market: MarketSnapshot = { symbol: ticker.symbol, lastPrice: ticker.lastPrice, timestamp: ticker.timestamp, source: "binance_mcp" };
  const portfolio = { totalEquityUsd: request.equity, availableMarginUsd: request.equity, positions: [], isSimulated: true, label: "User-declared portfolio scenario; available margin assumed; existing positions excluded" };
  const assessment = assessTradeRisk(request.intent, market, portfolio);
  const saferAssessment = assessment.saferAlternative ? assessTradeRisk(assessment.saferAlternative, market, portfolio) : null;
  return { ...assessment, riskScore: assessment.score, riskLevel: assessment.level, primaryReasons: assessment.reasons,
    symbol: request.intent.symbol, direction: request.intent.side, marketType: request.intent.marketType,
    calculations: { ...assessment.calculations, leverage: request.intent.leverage ?? 1 },
    saferAssessment, portfolioEquity: request.equity, entryPrice: ticker.lastPrice, dataTimestamp: ticker.timestamp,
    explanation: "Public Binance price + your stated portfolio. $200 is interpreted as margin. Available margin assumed; existing positions excluded. Funding, spread and volatility are not assessed. Planned loss excludes fees and slippage; stops are not guarantees.",
    executionLabel: "Order preview only — account permissions and exchange filters not verified", orderSubmitted: false,
  };
}

export async function runDemoReview(text: string, tools: string[], call: (tool: string, args: Record<string, unknown>) => Promise<unknown>) {
  const request = parseDemoRequest(text);
  if (!request?.equity) throw new Error("Include your portfolio size, for example: I have a $500 portfolio and want to open a $200 20x BNB long. Check it first.");
  const prefix = request.intent.marketType === "perpetual" ? "futures_usds." : "spot.";
  const tool = tools.find(name => name.startsWith(prefix) && /\.symbolPriceTicker(?:V2)?$/.test(name));
  if (!tool) throw new Error("Binance public price tool is unavailable. Reconnect Binance Agent OS and retry.");
  return assessDemo(text, await call(tool, { symbol: request.intent.symbol }));
}
