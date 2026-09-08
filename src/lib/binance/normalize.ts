import type {
  NormalizedBalance,
  NormalizedFunding,
  NormalizedKline,
  NormalizedOrderBook,
  NormalizedPosition,
  NormalizedTicker,
} from "@/lib/binance/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pick(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (key in obj && obj[key] !== undefined && obj[key] !== null) {
      return obj[key];
    }
  }
  return undefined;
}

export function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export function requireNumber(value: unknown, label: string): number {
  const n = toNumber(value);
  if (n === undefined) {
    throw new Error(`Expected numeric ${label}, got ${String(value)}`);
  }
  return n;
}

export function toStringValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

export function computeSpreadBps(
  bid?: number,
  ask?: number,
): number | undefined {
  if (bid == null || ask == null || !(bid > 0) || !(ask > 0)) return undefined;
  const mid = (bid + ask) / 2;
  if (!(mid > 0)) return undefined;
  return ((ask - bid) / mid) * 10_000;
}

export function computeImbalance(
  bids: Array<[number, number]>,
  asks: Array<[number, number]>,
  levels = 10,
): number | undefined {
  const bidVol = bids.slice(0, levels).reduce((s, [, q]) => s + q, 0);
  const askVol = asks.slice(0, levels).reduce((s, [, q]) => s + q, 0);
  const total = bidVol + askVol;
  if (!(total > 0)) return undefined;
  return (bidVol - askVol) / total;
}

/** Sample standard deviation of simple returns as percent. */
export function computeRealizedVolatilityPercent(
  closes: number[],
): number | undefined {
  if (closes.length < 14) return undefined;
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i += 1) {
    const prev = closes[i - 1];
    const cur = closes[i];
    if (prev > 0 && cur > 0) {
      returns.push((cur - prev) / prev);
    }
  }
  if (returns.length < 13) return undefined;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance =
    returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (returns.length - 1);
  const stdev = Math.sqrt(variance);
  return stdev * 100;
}

/**
 * MCP tools often wrap JSON in text content blocks.
 * Accept raw objects, JSON strings, or MCP CallToolResult-like shapes.
 */
export function unwrapMcpContent(result: unknown): unknown {
  if (result == null) return result;

  if (typeof result === "string") {
    const trimmed = result.trim();
    if (
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))
    ) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return result;
      }
    }
    return result;
  }

  if (!isRecord(result)) return result;

  if (result.structuredContent != null) {
    return unwrapMcpContent(result.structuredContent);
  }

  if (Array.isArray(result.content)) {
    const texts = result.content
      .map((item) => {
        if (item && typeof item === "object" && "text" in item) {
          return String((item as { text: string }).text);
        }
        return null;
      })
      .filter(Boolean) as string[];

    if (texts.length === 1) {
      return unwrapMcpContent(texts[0]);
    }
    if (texts.length > 1) {
      for (const text of texts) {
        const parsed = unwrapMcpContent(text);
        if (parsed !== text) return parsed;
      }
      try {
        return JSON.parse(texts.join(""));
      } catch {
        return texts;
      }
    }
  }

  if (result.data != null) return unwrapMcpContent(result.data);
  if (result.result != null) return unwrapMcpContent(result.result);

  return result;
}

function normalizeLevel(entry: unknown): [number, number] | null {
  if (Array.isArray(entry) && entry.length >= 2) {
    const price = toNumber(entry[0]);
    const quantity = toNumber(entry[1]);
    if (price === undefined || quantity === undefined) return null;
    return [price, quantity];
  }
  if (isRecord(entry)) {
    const price = toNumber(pick(entry, ["price", "p"]));
    const quantity = toNumber(pick(entry, ["quantity", "qty", "q"]));
    if (price === undefined || quantity === undefined) return null;
    return [price, quantity];
  }
  return null;
}

export function normalizeTicker(
  input: unknown,
  fallbackSymbol?: string,
): NormalizedTicker {
  const data = unwrapMcpContent(input);
  const obj = Array.isArray(data)
    ? isRecord(data[0])
      ? data[0]
      : null
    : isRecord(data)
      ? data
      : null;

  if (!obj) {
    throw new Error("Unable to normalize ticker: unexpected payload shape");
  }

  const symbol =
    toStringValue(pick(obj, ["symbol", "s"])) ?? fallbackSymbol ?? "";
  if (!symbol) {
    throw new Error("Unable to normalize ticker: missing symbol");
  }

  return {
    symbol: symbol.toUpperCase(),
    lastPrice: requireNumber(
      pick(obj, ["lastPrice", "last", "price", "c", "close"]),
      "lastPrice",
    ),
    bidPrice: toNumber(pick(obj, ["bidPrice", "bid", "b"])),
    askPrice: toNumber(pick(obj, ["askPrice", "ask", "a"])),
    priceChangePercent: toNumber(
      pick(obj, ["priceChangePercent", "priceChangePercent24h", "P"]),
    ),
    highPrice: toNumber(pick(obj, ["highPrice", "highPrice24h", "high", "h"])),
    lowPrice: toNumber(pick(obj, ["lowPrice", "lowPrice24h", "low", "l"])),
    quoteVolume: toNumber(pick(obj, ["quoteVolume", "quoteVolume24h", "q"])),
    timestamp: new Date().toISOString(),
  };
}

export function normalizeKlines(input: unknown): NormalizedKline[] {
  const data = unwrapMcpContent(input);
  if (!Array.isArray(data)) {
    throw new Error("Unable to normalize klines: expected an array");
  }

  const out: NormalizedKline[] = [];
  for (const row of data) {
    if (Array.isArray(row) && row.length >= 7) {
      out.push({
        openTime: requireNumber(row[0], "openTime"),
        open: requireNumber(row[1], "open"),
        high: requireNumber(row[2], "high"),
        low: requireNumber(row[3], "low"),
        close: requireNumber(row[4], "close"),
        volume: requireNumber(row[5], "volume"),
        closeTime: requireNumber(row[6], "closeTime"),
      });
      continue;
    }
    if (isRecord(row)) {
      out.push({
        openTime: requireNumber(
          pick(row, ["openTime", "t", "startTime"]),
          "openTime",
        ),
        open: requireNumber(pick(row, ["open", "o"]), "open"),
        high: requireNumber(pick(row, ["high", "h"]), "high"),
        low: requireNumber(pick(row, ["low", "l"]), "low"),
        close: requireNumber(pick(row, ["close", "c"]), "close"),
        volume: requireNumber(pick(row, ["volume", "v"]), "volume"),
        closeTime: requireNumber(
          pick(row, ["closeTime", "T", "endTime"]),
          "closeTime",
        ),
      });
    }
  }
  return out;
}

export function normalizeOrderBook(
  input: unknown,
  fallbackSymbol?: string,
): NormalizedOrderBook {
  const data = unwrapMcpContent(input);
  if (!isRecord(data)) {
    throw new Error("Unable to normalize order book: unexpected payload shape");
  }

  const symbol =
    toStringValue(pick(data, ["symbol", "s"])) ?? fallbackSymbol ?? "UNKNOWN";
  const bidsRaw = pick(data, ["bids", "b"]);
  const asksRaw = pick(data, ["asks", "a"]);
  const bids = Array.isArray(bidsRaw)
    ? (bidsRaw.map(normalizeLevel).filter(Boolean) as Array<[number, number]>)
    : [];
  const asks = Array.isArray(asksRaw)
    ? (asksRaw.map(normalizeLevel).filter(Boolean) as Array<[number, number]>)
    : [];
  const bestBid = bids[0]?.[0];
  const bestAsk = asks[0]?.[0];

  return {
    symbol: symbol.toUpperCase(),
    bids,
    asks,
    imbalance: computeImbalance(bids, asks),
    spreadBps: computeSpreadBps(bestBid, bestAsk),
    timestamp: new Date().toISOString(),
  };
}

export function normalizeFunding(
  input: unknown,
  fallbackSymbol?: string,
): NormalizedFunding {
  const data = unwrapMcpContent(input);
  const obj = Array.isArray(data)
    ? isRecord(data[0])
      ? data[0]
      : null
    : isRecord(data)
      ? data
      : null;

  if (!obj) {
    throw new Error("Unable to normalize funding: unexpected payload shape");
  }

  const symbol =
    toStringValue(pick(obj, ["symbol", "s"])) ?? fallbackSymbol ?? "";
  if (!symbol) {
    throw new Error("Unable to normalize funding: missing symbol");
  }

  return {
    symbol: symbol.toUpperCase(),
    fundingRate: requireNumber(
      pick(obj, ["lastFundingRate", "fundingRate", "r"]),
      "fundingRate",
    ),
    markPrice: toNumber(pick(obj, ["markPrice", "p"])),
    nextFundingTime: toNumber(pick(obj, ["nextFundingTime", "T"])),
    timestamp: new Date().toISOString(),
  };
}

export function normalizeBalances(input: unknown): NormalizedBalance[] {
  const data = unwrapMcpContent(input);
  let rows: unknown[] = [];

  if (Array.isArray(data)) {
    rows = data;
  } else if (isRecord(data)) {
    const balances = pick(data, ["balances", "assets", "accountBalances"]);
    if (Array.isArray(balances)) rows = balances;
  }

  const out: NormalizedBalance[] = [];
  for (const row of rows) {
    if (!isRecord(row)) continue;
    const asset = toStringValue(pick(row, ["asset", "a", "currency", "coin"]));
    if (!asset) continue;
    out.push({
      asset: asset.toUpperCase(),
      free: toNumber(pick(row, ["free", "available", "availableBalance"])) ?? 0,
      locked:
        toNumber(pick(row, ["locked", "freeze", "frozen", "lockedBalance"])) ??
        0,
    });
  }
  return out;
}

export function normalizePositions(input: unknown): NormalizedPosition[] {
  const data = unwrapMcpContent(input);
  let rows: unknown[] = [];

  if (Array.isArray(data)) {
    rows = data;
  } else if (isRecord(data)) {
    const positions = pick(data, ["positions", "positionRisk"]);
    if (Array.isArray(positions)) rows = positions;
  }

  const out: NormalizedPosition[] = [];
  for (const row of rows) {
    if (!isRecord(row)) continue;
    const symbol = toStringValue(pick(row, ["symbol", "s"]));
    if (!symbol) continue;

    const positionAmt =
      toNumber(
        pick(row, ["positionAmt", "positionAmount", "qty", "quantity", "size"]),
      ) ?? 0;
    const entryPrice = toNumber(
      pick(row, ["entryPrice", "avgPrice", "averagePrice"]),
    );
    const markPrice = toNumber(pick(row, ["markPrice"]));
    const notionalUsd =
      toNumber(pick(row, ["notional", "notionalUsd", "positionNotional"])) ??
      (markPrice != null
        ? Math.abs(positionAmt * markPrice)
        : entryPrice != null
          ? Math.abs(positionAmt * entryPrice)
          : Math.abs(positionAmt));

    if (notionalUsd === 0 && positionAmt === 0) continue;

    const sideRaw = toStringValue(pick(row, ["positionSide", "side"]));
    let side = sideRaw?.toUpperCase() ?? "";
    if (!side) {
      side = positionAmt > 0 ? "LONG" : positionAmt < 0 ? "SHORT" : "FLAT";
    }

    out.push({
      symbol: symbol.toUpperCase(),
      side,
      notionalUsd,
      entryPrice,
      unrealizedPnlUsd: toNumber(
        pick(row, ["unrealizedProfit", "unRealizedProfit", "upl", "unrealizedPnlUsd"]),
      ),
      leverage: toNumber(pick(row, ["leverage"])),
    });
  }
  return out;
}
