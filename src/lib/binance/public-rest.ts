import type { MarketSnapshot } from "@/lib/types";
import type {
  NormalizedFunding,
  NormalizedKline,
  NormalizedOrderBook,
  NormalizedTicker,
} from "@/lib/binance/types";
import {
  BINANCE_FUTURES_REST,
  BINANCE_SPOT_DATA_API,
  BINANCE_SPOT_REST,
  BINANCE_SPOT_REST_FALLBACKS,
} from "@/lib/binance/types";
import {
  computeRealizedVolatilityPercent,
  computeSpreadBps,
  normalizeFunding,
  normalizeKlines,
  normalizeOrderBook,
  normalizeTicker,
} from "@/lib/binance/normalize";

const FUTURES_BASE = BINANCE_FUTURES_REST;
const DEFAULT_TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 12_000;

type CacheEntry<T> = { value: T; expiresAt: number };

const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (hit.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return hit.value as T;
}

function setCached<T>(key: string, value: T): T {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

async function fetchJson<T>(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Binance REST ${res.status}: ${body.slice(0, 180)}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJsonWithFallback<T>(
  path: string,
  bases: readonly string[] = BINANCE_SPOT_REST_FALLBACKS,
): Promise<T> {
  let lastError: Error | undefined;
  for (const base of bases) {
    try {
      return await fetchJson<T>(`${base}${path}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastError ?? new Error(`All Binance REST bases failed for ${path}`);
}

export async function validateSpotSymbol(symbol: string): Promise<boolean> {
  const upper = symbol.toUpperCase();
  const key = `exchangeInfo:spot:${upper}`;
  const cached = getCached<boolean>(key);
  if (cached != null) return cached;

  try {
    const info = await fetchJsonWithFallback<{
      symbols: Array<{ symbol: string; status: string }>;
    }>(`/api/v3/exchangeInfo?symbol=${encodeURIComponent(upper)}`);
    const ok = Boolean(
      info?.symbols?.some((s) => s.symbol === upper && s.status === "TRADING"),
    );
    return setCached(key, ok);
  } catch {
    // Last resort: a successful ticker proves the symbol exists.
    try {
      await fetchSpotTicker(upper);
      return setCached(key, true);
    } catch {
      return setCached(key, false);
    }
  }
}

export async function validatePerpetualSymbol(symbol: string): Promise<boolean> {
  const upper = symbol.toUpperCase();
  const key = `exchangeInfo:futures:${upper}`;
  const cached = getCached<boolean>(key);
  if (cached != null) return cached;

  try {
    const info = await fetchJson<{
      symbols: Array<{ symbol: string; status: string; contractType?: string }>;
    }>(`${FUTURES_BASE}/fapi/v1/exchangeInfo`);
    const ok = info.symbols.some(
      (s) =>
        s.symbol === upper &&
        s.status === "TRADING" &&
        (s.contractType == null || s.contractType === "PERPETUAL"),
    );
    return setCached(key, ok);
  } catch {
    // Futures REST is geo-blocked in some regions (HTTP 451). Fall back to
    // spot symbol validation so perpetual risk demos can still use live prices.
    const spotOk = await validateSpotSymbol(upper);
    return setCached(key, spotOk);
  }
}

export async function fetchSpotTicker(symbol: string): Promise<NormalizedTicker> {
  const upper = symbol.toUpperCase();
  const key = `ticker:spot:${upper}`;
  const cached = getCached<NormalizedTicker>(key);
  if (cached) return cached;

  const data = await fetchJsonWithFallback<unknown>(
    `/api/v3/ticker/24hr?symbol=${encodeURIComponent(upper)}`,
  );
  return setCached(key, normalizeTicker(data, upper));
}

export async function fetchFuturesTicker(symbol: string): Promise<NormalizedTicker> {
  const upper = symbol.toUpperCase();
  const key = `ticker:futures:${upper}`;
  const cached = getCached<NormalizedTicker>(key);
  if (cached) return cached;

  try {
    const data = await fetchJson<unknown>(
      `${FUTURES_BASE}/fapi/v1/ticker/24hr?symbol=${encodeURIComponent(upper)}`,
    );
    return setCached(key, normalizeTicker(data, upper));
  } catch {
    // Geo-restricted futures: use spot ticker as live public price proxy.
    return fetchSpotTicker(upper);
  }
}

export async function fetchOrderBook(
  symbol: string,
  marketType: "spot" | "perpetual",
  limit = 20,
): Promise<NormalizedOrderBook> {
  const upper = symbol.toUpperCase();
  const key = `depth:${marketType}:${upper}:${limit}`;
  const cached = getCached<NormalizedOrderBook>(key);
  if (cached) return cached;

  if (marketType === "perpetual") {
    try {
      const data = await fetchJson<unknown>(
        `${FUTURES_BASE}/fapi/v1/depth?symbol=${encodeURIComponent(upper)}&limit=${limit}`,
      );
      return setCached(key, normalizeOrderBook(data, upper));
    } catch {
      // fall through to spot book
    }
  }

  const data = await fetchJsonWithFallback<unknown>(
    `/api/v3/depth?symbol=${encodeURIComponent(upper)}&limit=${limit}`,
  );
  return setCached(key, normalizeOrderBook(data, upper));
}

export async function fetchKlines(
  symbol: string,
  marketType: "spot" | "perpetual",
  interval = "1h",
  limit = 48,
): Promise<NormalizedKline[]> {
  const upper = symbol.toUpperCase();
  const key = `klines:${marketType}:${upper}:${interval}:${limit}`;
  const cached = getCached<NormalizedKline[]>(key);
  if (cached) return cached;

  if (marketType === "perpetual") {
    try {
      const rows = await fetchJson<unknown>(
        `${FUTURES_BASE}/fapi/v1/klines?symbol=${encodeURIComponent(upper)}&interval=${interval}&limit=${limit}`,
      );
      return setCached(key, normalizeKlines(rows));
    } catch {
      // fall through to spot klines
    }
  }

  const rows = await fetchJsonWithFallback<unknown>(
    `/api/v3/klines?symbol=${encodeURIComponent(upper)}&interval=${interval}&limit=${limit}`,
  );
  return setCached(key, normalizeKlines(rows));
}

export async function fetchFundingRate(symbol: string): Promise<NormalizedFunding | null> {
  const upper = symbol.toUpperCase();
  const key = `funding:${upper}`;
  const cached = getCached<NormalizedFunding>(key);
  if (cached) return cached;

  try {
    const data = await fetchJson<unknown>(
      `${FUTURES_BASE}/fapi/v1/premiumIndex?symbol=${encodeURIComponent(upper)}`,
    );
    return setCached(key, normalizeFunding(data, upper));
  } catch {
    return null;
  }
}

export function clearPublicRestCache(): void {
  cache.clear();
}

export async function buildPublicMarketSnapshot(
  symbol: string,
  marketType: "spot" | "perpetual",
): Promise<MarketSnapshot> {
  const upper = symbol.toUpperCase();
  const [ticker, book, klines, funding] = await Promise.all([
    marketType === "perpetual" ? fetchFuturesTicker(upper) : fetchSpotTicker(upper),
    fetchOrderBook(upper, marketType).catch(() => null),
    fetchKlines(upper, marketType).catch(() => [] as NormalizedKline[]),
    marketType === "perpetual" ? fetchFundingRate(upper) : Promise.resolve(null),
  ]);

  const bid = book?.bids[0]?.[0] ?? ticker.bidPrice;
  const ask = book?.asks[0]?.[0] ?? ticker.askPrice;
  const closes = klines.map((k) => k.close).filter((c) => c > 0);

  return {
    symbol: upper,
    lastPrice: ticker.lastPrice,
    bid,
    ask,
    spreadBps: book?.spreadBps ?? computeSpreadBps(bid, ask),
    change24hPercent: ticker.priceChangePercent,
    high24h: ticker.highPrice,
    low24h: ticker.lowPrice,
    volume24h: ticker.quoteVolume,
    fundingRate: funding?.fundingRate,
    orderBookImbalance: book?.imbalance,
    realizedVolatilityPercent: computeRealizedVolatilityPercent(closes),
    timestamp: new Date().toISOString(),
    source: "binance_rest_public",
  };
}

export const PUBLIC_REST_BASES = {
  preferredSpot: BINANCE_SPOT_DATA_API,
  primarySpot: BINANCE_SPOT_REST,
  futures: BINANCE_FUTURES_REST,
};
