import { normalizeTicker } from "../lib/binance/normalize";

export type SimplePriceQuery = { symbol: string; asset: string; marketType: "spot" | "perpetual" };

export function parseSimplePriceQuery(text: string): SimplePriceQuery | null {
  if (!/\b(price|quote|trading at)\b/i.test(text) || /\b(long|short|buy|sell|portfolio|leverage|\d+x)\b/i.test(text)) return null;
  const match = text.match(/\b(?:price|quote)\s+(?:of|for)\s+([a-z0-9]{2,12})\b/i)
    ?? text.match(/\b([a-z0-9]{2,12})\s+(?:price|quote)\b/i);
  if (!match) return null;
  const raw = match[1].toUpperCase();
  const asset = raw.replace(/(?:USDT|USD)$/i, "");
  if (!asset) return null;
  return { asset, symbol: `${asset}USDT`, marketType: /\b(futures?|perpetual|perp)\b/i.test(text) ? "perpetual" : "spot" };
}

export function selectPublicPriceTool(query: SimplePriceQuery, toolNames: string[]): string | undefined {
  const preferredPrefix = query.marketType === "perpetual" ? "futures_usds." : "spot.";
  return toolNames.find((name) => name.startsWith(preferredPrefix) && /\.symbolPriceTicker(?:V2)?$/.test(name))
    ?? toolNames.find((name) => /\.symbolPriceTicker(?:V2)?$/.test(name));
}

export function formatPriceAnswer(query: SimplePriceQuery, result: unknown): string {
  const ticker = normalizeTicker(result, query.symbol);
  if (ticker.symbol !== query.symbol || !(ticker.lastPrice > 0)) throw new Error("Binance returned an invalid price or mismatched symbol.");
  const price = ticker.lastPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 8 });
  const updated = new Date(ticker.timestamp).toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
  return `${query.asset} is currently trading at $${price}, updated at ${updated}.`;
}

export async function runSimplePriceQuery(
  query: SimplePriceQuery,
  toolNames: string[],
  call: (tool: string, args: Record<string, unknown>) => Promise<unknown>,
  timeoutMs = 12_000,
): Promise<string> {
  const tool = selectPublicPriceTool(query, toolNames);
  if (!tool) throw new Error("Binance public price data is unavailable. Reconnect Binance Agent OS and retry.");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      call(tool, { symbol: query.symbol }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Binance is taking too long. Please retry.")), timeoutMs); }),
    ]);
    return formatPriceAnswer(query, result);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
