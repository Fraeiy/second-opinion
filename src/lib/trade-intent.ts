import * as z from "zod"
import type { TradeIntent } from "@/lib/types"

export const TradeIntentSchema = z.object({
  symbol: z.string().min(1),
  marketType: z.enum(["spot", "perpetual"]),
  side: z.enum(["long", "short", "buy", "sell"]),
  marginAmount: z.number().positive().optional(),
  notionalAmount: z.number().positive().optional(),
  leverage: z.number().positive().optional(),
  entryType: z.enum(["market", "limit"]),
  limitPrice: z.number().positive().optional(),
  stopLoss: z.number().positive().optional(),
  takeProfit: z.number().positive().optional(),
})

export type TradeIntentParsed = z.infer<typeof TradeIntentSchema>

const QUOTE_SUFFIXES = ["USDT", "USD", "BUSD", "USDC"] as const

const KNOWN_BASES = [
  "BTC",
  "ETH",
  "BNB",
  "SOL",
  "XRP",
  "ADA",
  "DOGE",
  "AVAX",
  "DOT",
  "LINK",
  "MATIC",
  "POL",
  "LTC",
  "ATOM",
  "UNI",
  "APT",
  "ARB",
  "OP",
  "SUI",
  "TIA",
  "NEAR",
  "FIL",
  "AAVE",
  "PEPE",
  "WIF",
  "TRX",
  "TON",
] as const

/**
 * Normalize a user symbol fragment to a Binance-style XXXUSDT pair.
 */
export function normalizeSymbol(raw: string): string {
  const cleaned = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "")
  if (!cleaned) return cleaned

  for (const quote of QUOTE_SUFFIXES) {
    if (cleaned.endsWith(quote) && cleaned.length > quote.length) {
      const base = cleaned.slice(0, -quote.length)
      return `${base}USDT`
    }
  }

  return `${cleaned}USDT`
}

export function validateTradeIntent(
  data: unknown,
): { success: true; data: TradeIntent } | { success: false; error: z.ZodError } {
  const result = TradeIntentSchema.safeParse(data)
  if (result.success) {
    return { success: true, data: result.data }
  }
  return { success: false, error: result.error }
}

function parseNumberToken(raw: string): number | undefined {
  const cleaned = raw.replace(/[$,]/g, "").trim()
  if (!cleaned) return undefined
  const n = Number(cleaned)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

function extractSide(text: string): TradeIntent["side"] | undefined {
  const lower = text.toLowerCase()
  if (/\b(short|shorts|shorting)\b/.test(lower)) return "short"
  if (/\b(long|longs|longing)\b/.test(lower)) return "long"
  if (/\b(sell|selling)\b/.test(lower)) return "sell"
  if (/\b(buy|buying)\b/.test(lower)) return "buy"
  return undefined
}

function extractLeverage(text: string): number | undefined {
  const m = text.match(/(\d+(?:\.\d+)?)\s*x\b/i)
  if (!m) return undefined
  return parseNumberToken(m[1])
}

function extractSymbol(text: string): string | undefined {
  const pair = text.match(/\b([A-Za-z]{2,10}\s*\/\s*[A-Za-z]{2,10})\b/)
  if (pair) {
    return normalizeSymbol(pair[1])
  }

  const suffixed = text.match(
    /\b([A-Za-z]{2,10}(?:USDT|USD|BUSD|USDC))\b/i,
  )
  if (suffixed) {
    return normalizeSymbol(suffixed[1])
  }

  const upper = text.toUpperCase()
  for (const base of KNOWN_BASES) {
    const re = new RegExp(`\\b${base}\\b`)
    if (re.test(upper)) {
      return normalizeSymbol(base)
    }
  }

  return undefined
}

function extractDollarAmount(
  text: string,
  patterns: RegExp[],
): number | undefined {
  for (const pattern of patterns) {
    const m = text.match(pattern)
    if (m?.[1]) {
      const n = parseNumberToken(m[1])
      if (n != null) return n
    }
  }
  return undefined
}

function extractPortfolioPercent(text: string): number | undefined {
  const m = text.match(
    /(\d+(?:\.\d+)?)\s*%\s*(?:of\s+)?(?:my\s+|the\s+|our\s+)?(?:portfolio|equity|account|balance)/i,
  )
  if (!m) {
    const alt = text.match(
      /(?:portfolio|equity|account|balance)\s*(?:of\s*)?(\d+(?:\.\d+)?)\s*%/i,
    )
    if (!alt?.[1]) return undefined
    const n = Number(alt[1])
    return Number.isFinite(n) && n > 0 ? n : undefined
  }
  const n = Number(m[1])
  return Number.isFinite(n) && n > 0 ? n : undefined
}

function extractLimitPrice(text: string): number | undefined {
  return extractDollarAmount(text, [
    /(?:limit(?:\s+price)?|at|@)\s*\$?\s*(\d+(?:\.\d+)?)/i,
  ])
}

function extractStopLoss(text: string): number | undefined {
  return extractDollarAmount(text, [
    /(?:stop(?:\s*-?\s*loss)?|sl)\s*(?:at|@|=|:)?\s*\$?\s*(\d+(?:\.\d+)?)/i,
  ])
}

function extractTakeProfit(text: string): number | undefined {
  return extractDollarAmount(text, [
    /(?:take(?:\s*-?\s*profit)?|tp)\s*(?:at|@|=|:)?\s*\$?\s*(\d+(?:\.\d+)?)/i,
  ])
}

function extractMaxLossUsd(text: string): number | undefined {
  return extractDollarAmount(text, [
    /(?:max(?:imum)?\s*loss|risk)\s*(?:of\s*)?\$\s*(\d+(?:\.\d+)?)/i,
    /\$\s*(\d+(?:\.\d+)?)\s*(?:max(?:imum)?\s*loss|risk)/i,
  ])
}

function extractLeadingMargin(text: string): number | undefined {
  // "$200 20x BNB long", "open a $200 20x", or "margin $200"
  const withLeverage = text.match(
    /\$\s*(\d+(?:\.\d+)?)\s+(?:\d+(?:\.\d+)?)\s*x\b/i,
  )
  if (withLeverage?.[1]) return parseNumberToken(withLeverage[1])

  const leading = text.match(/^\$\s*(\d+(?:\.\d+)?)/)
  if (leading?.[1]) return parseNumberToken(leading[1])

  const openAmount = text.match(
    /(?:open|buy|long|short|risk|use|allocate)\s+(?:a\s+|an\s+)?\$\s*(\d+(?:\.\d+)?)/i,
  )
  if (openAmount?.[1]) return parseNumberToken(openAmount[1])

  return extractDollarAmount(text, [
    /(?:margin|size|collateral)\s*(?:of\s*)?\$\s*(\d+(?:\.\d+)?)/i,
    /\$\s*(\d+(?:\.\d+)?)\s*(?:margin|collateral)/i,
  ])
}

function extractNotional(text: string): number | undefined {
  return extractDollarAmount(text, [
    /(?:notional|position(?:\s*size)?)\s*(?:of\s*)?\$\s*(\d+(?:\.\d+)?)/i,
  ])
}

/**
 * Heuristic natural-language parser for common trade phrasings.
 * Returns null when symbol and direction cannot be inferred.
 *
 * Supported examples:
 * - "$200 20x BNB long"
 * - "40% of portfolio on 15x BTC short" (requires portfolioEquityUsd)
 * - "ETH trade max loss $10"
 *
 * Optional portfolioEquityUsd resolves portfolio-percent sizing.
 */
export function parseTradeIntentHeuristic(
  text: string,
  portfolioEquityUsd?: number,
): TradeIntent | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  const symbol = extractSymbol(trimmed)
  if (!symbol) return null

  const leverage = extractLeverage(trimmed)
  const sideRaw = extractSide(trimmed)
  const limitPrice = extractLimitPrice(trimmed)
  const stopLoss = extractStopLoss(trimmed)
  const takeProfit = extractTakeProfit(trimmed)
  const maxLossUsd = extractMaxLossUsd(trimmed)
  const portfolioPct = extractPortfolioPercent(trimmed)

  const marketType: TradeIntent["marketType"] =
    leverage != null && leverage > 1 ? "perpetual" : "spot"

  let side: TradeIntent["side"]
  if (sideRaw) {
    if (marketType === "spot") {
      side =
        sideRaw === "long" || sideRaw === "buy"
          ? "buy"
          : sideRaw === "short" || sideRaw === "sell"
            ? "sell"
            : sideRaw
    } else {
      side =
        sideRaw === "buy" ? "long" : sideRaw === "sell" ? "short" : sideRaw
    }
  } else {
    // Default direction when unspecified.
    side = marketType === "spot" ? "buy" : "long"
  }

  let marginAmount = extractLeadingMargin(trimmed)
  let notionalAmount = extractNotional(trimmed)

  if (portfolioPct != null) {
    if (portfolioEquityUsd == null || !(portfolioEquityUsd > 0)) {
      // Percent sizing cannot be resolved without equity context.
      // Still return structural fields when leverage/side/symbol are clear,
      // leaving size empty for the caller to fill.
      marginAmount = undefined
      notionalAmount = undefined
    } else {
      const sized = (portfolioEquityUsd * portfolioPct) / 100
      // "40% of portfolio on 15x" is treated as margin commitment.
      marginAmount = sized
      if (leverage != null && leverage > 0) {
        notionalAmount = sized * leverage
      } else {
        notionalAmount = sized
      }
    }
  }

  const entryType: TradeIntent["entryType"] =
    limitPrice != null ? "limit" : "market"

  const intent: TradeIntent = {
    symbol,
    marketType,
    side,
    entryType,
  }

  if (marginAmount != null) intent.marginAmount = marginAmount
  if (notionalAmount != null) intent.notionalAmount = notionalAmount
  if (leverage != null && marketType === "perpetual") intent.leverage = leverage
  if (limitPrice != null) intent.limitPrice = limitPrice
  if (stopLoss != null) intent.stopLoss = stopLoss
  if (takeProfit != null) intent.takeProfit = takeProfit

  // Attach max loss as a synthetic tight size hint only when we have price
  // context via limit and no other size: margin ≈ maxLoss for spot-like risk.
  if (
    maxLossUsd != null &&
    intent.marginAmount == null &&
    intent.notionalAmount == null &&
    limitPrice != null &&
    stopLoss != null
  ) {
    const stopDist = Math.abs(limitPrice - stopLoss) / limitPrice
    if (stopDist > 0) {
      intent.notionalAmount = maxLossUsd / stopDist
      if (leverage != null && leverage > 0 && marketType === "perpetual") {
        intent.marginAmount = intent.notionalAmount / leverage
        intent.leverage = leverage
      }
    }
  }

  return intent
}
