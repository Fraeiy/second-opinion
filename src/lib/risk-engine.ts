import {
  clampScore,
  DEFAULT_RISK_POLICY,
  scoreToLevel,
  type RiskPolicy,
} from "@/lib/policy"
import type {
  MarketSnapshot,
  PortfolioContext,
  RiskAssessment,
  RiskReason,
  TradeIntent,
} from "@/lib/types"

function isLongSide(side: TradeIntent["side"]): boolean {
  return side === "long" || side === "buy"
}

function resolveEntryPrice(intent: TradeIntent, market: MarketSnapshot): number {
  if (intent.entryType === "limit" && intent.limitPrice && intent.limitPrice > 0) {
    return intent.limitPrice
  }
  return market.lastPrice
}

function resolveLeverage(intent: TradeIntent): number {
  if (intent.marketType === "spot") return 1
  const lev = intent.leverage ?? 1
  return lev > 0 ? lev : 1
}

/**
 * Resolve notional and margin from the intent using deterministic rules.
 * Prefer explicit notional; otherwise margin * leverage; otherwise 0.
 */
export function resolveSizing(
  intent: TradeIntent,
  leverage: number,
): { notional: number; marginRequired: number } {
  if (intent.notionalAmount != null && intent.notionalAmount > 0) {
    const notional = intent.notionalAmount
    const marginRequired =
      intent.marginAmount != null && intent.marginAmount > 0
        ? intent.marginAmount
        : notional / leverage
    return { notional, marginRequired }
  }

  if (intent.marginAmount != null && intent.marginAmount > 0) {
    const marginRequired = intent.marginAmount
    return { notional: marginRequired * leverage, marginRequired }
  }

  return { notional: 0, marginRequired: 0 }
}

function stopDistancePercent(
  intent: TradeIntent,
  entryPrice: number,
): number | undefined {
  if (intent.stopLoss == null || !(entryPrice > 0)) return undefined
  const dist = Math.abs(entryPrice - intent.stopLoss) / entryPrice
  return dist * 100
}

function riskRewardRatio(
  intent: TradeIntent,
  entryPrice: number,
): number | undefined {
  if (
    intent.stopLoss == null ||
    intent.takeProfit == null ||
    !(entryPrice > 0)
  ) {
    return undefined
  }
  const risk = Math.abs(entryPrice - intent.stopLoss)
  const reward = Math.abs(intent.takeProfit - entryPrice)
  if (!(risk > 0)) return undefined
  return reward / risk
}

/**
 * Simplified liquidation estimate for linear USDT-margined perps.
 * Ignores fees and maintenance margin nuance; used only for risk UX.
 */
export function estimateLiquidationPrice(
  intent: TradeIntent,
  entryPrice: number,
  leverage: number,
): number | undefined {
  if (intent.marketType !== "perpetual" || !(entryPrice > 0) || leverage <= 1) {
    return undefined
  }
  const move = 1 / leverage
  if (isLongSide(intent.side)) {
    return entryPrice * (1 - move)
  }
  return entryPrice * (1 + move)
}

function maximumPlannedLossUsd(
  intent: TradeIntent,
  notional: number,
  marginRequired: number,
  stopDistPct: number | undefined,
): number {
  if (stopDistPct != null) {
    return notional * (stopDistPct / 100)
  }
  // Without a stop, planned loss is treated as full margin at risk for leveraged
  // trades, or full notional for spot.
  if (intent.marketType === "perpetual") {
    return marginRequired > 0 ? marginRequired : notional
  }
  return notional
}

function pushReason(
  reasons: RiskReason[],
  reason: { code: string; severity: RiskReason["severity"]; message?: string; metric?: string; value?: number },
): void {
  const explanation = reason.message ?? reason.code
  reasons.push({ ...reason, title: reason.code.replaceAll("_", " "), explanation, message: explanation })
}

function leverageScore(
  leverage: number,
  policy: RiskPolicy,
  reasons: RiskReason[],
): number {
  let score = 0
  const { leveragePenalties } = policy

  if (leverage > 20) {
    score += leveragePenalties.above20x
    pushReason(reasons, {
      code: "LEVERAGE_EXTREME",
      severity: "critical",
      message: `Leverage ${leverage}x exceeds 20x and carries extreme liquidation risk.`,
      metric: "leverage",
      value: leverage,
    })
  } else if (leverage > 10) {
    score += leveragePenalties.above10x
    pushReason(reasons, {
      code: "LEVERAGE_HIGH",
      severity: "critical",
      message: `Leverage ${leverage}x is high; small adverse moves can liquidate the position.`,
      metric: "leverage",
      value: leverage,
    })
  } else if (leverage > 5) {
    score += leveragePenalties.above5x
    pushReason(reasons, {
      code: "LEVERAGE_ELEVATED",
      severity: "warning",
      message: `Leverage ${leverage}x is above 5x.`,
      metric: "leverage",
      value: leverage,
    })
  } else if (leverage > 3) {
    score += leveragePenalties.above3x
    pushReason(reasons, {
      code: "LEVERAGE_MODERATE",
      severity: "info",
      message: `Leverage ${leverage}x is moderately elevated.`,
      metric: "leverage",
      value: leverage,
    })
  }

  return score
}

function mapVerdict(
  level: RiskAssessment["level"],
  score: number,
  policy: RiskPolicy,
  hasSaferAlt: boolean,
): RiskAssessment["verdict"] {
  if (level === "extreme" && policy.extremeDefaultsToReject) {
    return "reject"
  }
  if (level === "high") {
    if (policy.highPrefersReduce && hasSaferAlt) return "reduce"
    return score >= 65 ? "reduce" : "caution"
  }
  if (level === "moderate") return "caution"
  return "proceed"
}

/**
 * Deterministic trade risk assessment. All scores and calculations come from
 * inputs and policy thresholds. No LLM-invented numbers.
 */
export function assessTradeRisk(
  intent: TradeIntent,
  market: MarketSnapshot,
  portfolio: PortfolioContext,
  policy: RiskPolicy = DEFAULT_RISK_POLICY,
): RiskAssessment {
  const reasons: RiskReason[] = []
  let score = 0

  const entryPrice = resolveEntryPrice(intent, market)
  const leverage = resolveLeverage(intent)
  const { notional, marginRequired } = resolveSizing(intent, leverage)

  if (!(entryPrice > 0)) {
    pushReason(reasons, {
      code: "INVALID_ENTRY_PRICE",
      severity: "critical",
      message: "Entry price is missing or non-positive; risk cannot be priced reliably.",
      metric: "entryPrice",
      value: entryPrice,
    })
    score += 40
  }

  if (!(notional > 0)) {
    pushReason(reasons, {
      code: "MISSING_SIZE",
      severity: "warning",
      message: "Trade size (margin or notional) was not provided.",
      metric: "notional",
      value: 0,
    })
    score += 10
  }

  score += leverageScore(leverage, policy, reasons)

  const equity = portfolio.totalEquityUsd > 0 ? portfolio.totalEquityUsd : 0
  const openNotional = portfolio.positions.reduce(
    (sum, p) => sum + Math.abs(p.notionalUsd),
    0,
  )
  const portfolioExposurePercent =
    equity > 0 ? ((openNotional + notional) / equity) * 100 : undefined

  if (portfolioExposurePercent != null) {
    if (portfolioExposurePercent >= policy.portfolioExposureCriticalPercent) {
      score += 25
      pushReason(reasons, {
        code: "EXPOSURE_CRITICAL",
        severity: "critical",
        message: `Combined portfolio exposure is ${portfolioExposurePercent.toFixed(1)}% of equity.`,
        metric: "portfolioExposurePercent",
        value: portfolioExposurePercent,
      })
    } else if (portfolioExposurePercent >= policy.portfolioExposureWarnPercent) {
      score += 12
      pushReason(reasons, {
        code: "EXPOSURE_WARN",
        severity: "warning",
        message: `Combined portfolio exposure is ${portfolioExposurePercent.toFixed(1)}% of equity (warn threshold ${policy.portfolioExposureWarnPercent}%).`,
        metric: "portfolioExposurePercent",
        value: portfolioExposurePercent,
      })
    }
  }

  if (marginRequired > portfolio.availableMarginUsd && notional > 0) {
    score += 20
    pushReason(reasons, {
      code: "INSUFFICIENT_MARGIN",
      severity: "critical",
      message: `Required margin $${marginRequired.toFixed(2)} exceeds available $${portfolio.availableMarginUsd.toFixed(2)}.`,
      metric: "marginRequired",
      value: marginRequired,
    })
  }

  const stopDistPct = stopDistancePercent(intent, entryPrice)
  const maxLoss = maximumPlannedLossUsd(
    intent,
    notional,
    marginRequired,
    stopDistPct,
  )
  const maxLossPercent = equity > 0 ? (maxLoss / equity) * 100 : undefined

  const needsStop =
    intent.marketType === "perpetual" ||
    (notional > 0 && equity > 0 && notional / equity >= 0.1)

  if (intent.stopLoss == null && needsStop) {
    score += policy.missingStopLossPenalty
    pushReason(reasons, {
      code: "MISSING_STOP_LOSS",
      severity: "warning",
      message: "No stop loss provided; downside is unbounded relative to the planned thesis.",
      metric: "missingStopLossPenalty",
      value: policy.missingStopLossPenalty,
    })
  } else if (stopDistPct != null && stopDistPct < 0.15 && leverage >= 5) {
    score += 8
    pushReason(reasons, {
      code: "STOP_TOO_TIGHT",
      severity: "warning",
      message: `Stop is only ${stopDistPct.toFixed(2)}% from entry; noise may stop out a ${leverage}x position.`,
      metric: "stopDistancePercent",
      value: stopDistPct,
    })
  }

  if (maxLossPercent != null && maxLossPercent >= policy.maxPlannedLossPercentExtreme) {
    score += 30
    pushReason(reasons, {
      code: "PLANNED_LOSS_EXTREME",
      severity: "critical",
      message: `Maximum planned loss is ${maxLossPercent.toFixed(2)}% of portfolio equity (threshold ${policy.maxPlannedLossPercentExtreme}%).`,
      metric: "maximumPlannedLossPercent",
      value: maxLossPercent,
    })
  } else if (maxLossPercent != null && maxLossPercent >= 2) {
    score += 14
    pushReason(reasons, {
      code: "PLANNED_LOSS_HIGH",
      severity: "warning",
      message: `Maximum planned loss is ${maxLossPercent.toFixed(2)}% of portfolio equity.`,
      metric: "maximumPlannedLossPercent",
      value: maxLossPercent,
    })
  }

  const vol = market.realizedVolatilityPercent
  if (vol != null) {
    if (vol >= policy.volatilityCriticalPercent) {
      score += 18
      pushReason(reasons, {
        code: "VOLATILITY_CRITICAL",
        severity: "critical",
        message: `Realized volatility is ${vol.toFixed(2)}%, which amplifies liquidation and slippage risk.`,
        metric: "realizedVolatilityPercent",
        value: vol,
      })
    } else if (vol >= policy.volatilityWarnPercent) {
      score += 8
      pushReason(reasons, {
        code: "VOLATILITY_WARN",
        severity: "warning",
        message: `Realized volatility is ${vol.toFixed(2)}%.`,
        metric: "realizedVolatilityPercent",
        value: vol,
      })
    }
  }

  const spreadBps = market.spreadBps
  if (spreadBps != null) {
    if (spreadBps >= policy.spreadCriticalBps) {
      score += 15
      pushReason(reasons, {
        code: "SPREAD_CRITICAL",
        severity: "critical",
        message: `Spread is ${spreadBps.toFixed(1)} bps; liquidity is poor for this size thesis.`,
        metric: "spreadBps",
        value: spreadBps,
      })
    } else if (spreadBps >= policy.spreadWarnBps) {
      score += 6
      pushReason(reasons, {
        code: "SPREAD_WARN",
        severity: "warning",
        message: `Spread is ${spreadBps.toFixed(1)} bps.`,
        metric: "spreadBps",
        value: spreadBps,
      })
    }
  }

  if (intent.marketType === "perpetual" && market.fundingRate != null) {
    const fundingPct = market.fundingRate * 100
    const absFunding = Math.abs(fundingPct)
    if (absFunding >= policy.fundingRateCriticalPercent) {
      score += 12
      pushReason(reasons, {
        code: "FUNDING_CRITICAL",
        severity: "warning",
        message: `Funding rate is ${fundingPct.toFixed(4)}%, which can dominate carry for leveraged holds.`,
        metric: "fundingRatePercent",
        value: fundingPct,
      })
    } else if (absFunding >= policy.fundingRateWarnPercent) {
      score += 5
      pushReason(reasons, {
        code: "FUNDING_WARN",
        severity: "info",
        message: `Funding rate is ${fundingPct.toFixed(4)}%.`,
        metric: "fundingRatePercent",
        value: fundingPct,
      })
    }
  }

  const imbalance = market.orderBookImbalance
  if (imbalance != null && Math.abs(imbalance) >= policy.imbalanceWarnAbs) {
    score += 7
    pushReason(reasons, {
      code: "BOOK_IMBALANCE",
      severity: "warning",
      message: `Order book imbalance is ${imbalance.toFixed(2)}; short-term adverse selection risk is elevated.`,
      metric: "orderBookImbalance",
      value: imbalance,
    })
  }

  if (market.source === "unavailable") {
    score += 20
    pushReason(reasons, {
      code: "MARKET_DATA_UNAVAILABLE",
      severity: "critical",
      message: "Market data source is unavailable; assessment confidence is low.",
    })
  }

  // Directional stop sanity for known entry
  if (intent.stopLoss != null && entryPrice > 0) {
    const long = isLongSide(intent.side)
    const stopOnWrongSide =
      (long && intent.stopLoss >= entryPrice) ||
      (!long && intent.stopLoss <= entryPrice)
    if (stopOnWrongSide) {
      score += 15
      pushReason(reasons, {
        code: "STOP_WRONG_SIDE",
        severity: "critical",
        message: "Stop loss is on the wrong side of entry for the trade direction.",
        metric: "stopLoss",
        value: intent.stopLoss,
      })
    }
  }

  const finalScore = clampScore(score)
  const level = scoreToLevel(finalScore, policy)
  const rr = riskRewardRatio(intent, entryPrice)
  const liq = estimateLiquidationPrice(intent, entryPrice, leverage)

  const calculations: RiskAssessment["calculations"] = {
    notional,
    marginRequired: marginRequired > 0 ? marginRequired : undefined,
    portfolioExposurePercent,
    maximumPlannedLoss: notional > 0 || marginRequired > 0 ? maxLoss : undefined,
    maximumPlannedLossPercent: maxLossPercent,
    stopDistancePercent: stopDistPct,
    riskRewardRatio: rr,
    estimatedLiquidationPrice: liq,
    spreadBps: spreadBps,
    realizedVolatilityPercent: vol,
    fundingRatePercent:
      market.fundingRate != null ? market.fundingRate * 100 : undefined,
  }

  const draft: RiskAssessment = {
    score: finalScore,
    level,
    verdict: "caution",
    reasons,
    calculations,
  }

  const saferAlternative = generateSaferAlternative(
    intent,
    draft,
    portfolio,
    policy,
    market.lastPrice,
  )
  draft.saferAlternative = saferAlternative
  draft.verdict = mapVerdict(
    level,
    finalScore,
    policy,
    saferAlternative != null,
  )

  if (reasons.length === 0) {
    pushReason(reasons, {
      code: "WITHIN_POLICY",
      severity: "info",
      message: "No material policy violations detected for the provided inputs.",
    })
  }

  return draft
}

/**
 * Build a mechanically safer trade when the assessment is elevated.
 * Caps leverage, shrinks size so planned loss targets the policy budget,
 * and adds a stop when missing. Returns undefined when no meaningful change
 * is needed or sizing cannot be derived.
 *
 * Optional entryPriceHint lets callers (and assessTradeRisk) place an absolute
 * stop for market entries using the current last price.
 */
export function generateSaferAlternative(
  intent: TradeIntent,
  assessment: RiskAssessment,
  portfolio: PortfolioContext,
  policy: RiskPolicy = DEFAULT_RISK_POLICY,
  entryPriceHint?: number,
): TradeIntent | undefined {
  if (assessment.level === "low" && assessment.score < 20) {
    return undefined
  }

  const leverage = resolveLeverage(intent)
  const targetLeverage = Math.min(
    leverage,
    policy.saferAltMaxLeverage,
    intent.marketType === "spot" ? 1 : policy.saferAltMaxLeverage,
  )

  const equity = portfolio.totalEquityUsd
  if (!(equity > 0)) return undefined

  const lossBudgetUsd =
    equity * (policy.saferAltMaxPortfolioLossPercent / 100)

  // Isolated-margin approx: loss at stop ≈ notional * stopDistPct/100.
  // Keep an existing stop distance when known; otherwise target ~1%.
  let stopDistPct = assessment.calculations.stopDistancePercent
  let stopLoss = intent.stopLoss
  const referencePrice =
    intent.entryType === "limit" && intent.limitPrice && intent.limitPrice > 0
      ? intent.limitPrice
      : entryPriceHint != null && entryPriceHint > 0
        ? entryPriceHint
        : undefined

  if (stopLoss == null) {
    stopDistPct = stopDistPct ?? 1
    if (referencePrice != null && referencePrice > 0) {
      const dist = referencePrice * ((stopDistPct ?? 1) / 100)
      stopLoss = isLongSide(intent.side)
        ? referencePrice - dist
        : referencePrice + dist
    }
  } else if (stopDistPct == null && referencePrice != null && referencePrice > 0) {
    stopDistPct = (Math.abs(referencePrice - stopLoss) / referencePrice) * 100
  }

  const effectiveStopDistPct = stopDistPct != null && stopDistPct > 0 ? stopDistPct : 1

  // notional * (stopDist/100) <= lossBudget  => notional <= lossBudget / (stopDist/100)
  let maxNotionalFromLoss = lossBudgetUsd / (effectiveStopDistPct / 100)

  // If a stop still cannot be placed, treat full margin as at risk and cap it.
  if (stopLoss == null && intent.marketType === "perpetual") {
    maxNotionalFromLoss = Math.min(
      maxNotionalFromLoss,
      lossBudgetUsd * Math.max(targetLeverage, 1),
    )
  } else if (stopLoss == null) {
    maxNotionalFromLoss = Math.min(maxNotionalFromLoss, lossBudgetUsd)
  }

  const currentNotional = assessment.calculations.notional
  const leverageShrink =
    leverage > targetLeverage && leverage > 0 ? targetLeverage / leverage : 1
  const shrunkNotional =
    currentNotional > 0 ? currentNotional * Math.min(1, leverageShrink) : 0
  const targetNotional =
    currentNotional > 0
      ? Math.min(
          currentNotional,
          maxNotionalFromLoss,
          shrunkNotional > 0 ? shrunkNotional : currentNotional,
        )
      : maxNotionalFromLoss

  if (!(targetNotional > 0) || !Number.isFinite(targetNotional)) {
    return undefined
  }

  let targetMargin = targetNotional / Math.max(targetLeverage, 1)
  if (stopLoss == null && intent.marketType === "perpetual") {
    targetMargin = Math.min(targetMargin, lossBudgetUsd)
  }

  // Prefer not increasing margin when cutting leverage; shrink notional instead.
  const priorMargin =
    assessment.calculations.marginRequired != null &&
    assessment.calculations.marginRequired > 0
      ? assessment.calculations.marginRequired
      : intent.marginAmount
  if (priorMargin != null && priorMargin > 0) {
    targetMargin = Math.min(targetMargin, priorMargin)
  }

  // Also respect available margin with a small buffer.
  const cappedMargin = Math.min(
    targetMargin,
    Math.max(0, portfolio.availableMarginUsd * 0.9),
  )
  const finalNotional = cappedMargin * Math.max(targetLeverage, 1)

  const changed =
    targetLeverage < leverage ||
    (currentNotional > 0 && finalNotional < currentNotional * 0.98) ||
    intent.stopLoss == null ||
    assessment.level === "high" ||
    assessment.level === "extreme"

  if (!changed && assessment.level === "moderate" && intent.stopLoss != null) {
    const exposure = assessment.calculations.portfolioExposurePercent
    if (exposure == null || exposure < policy.portfolioExposureWarnPercent) {
      return undefined
    }
  }

  if (!(cappedMargin > 0) || !(finalNotional > 0)) {
    return undefined
  }

  const safer: TradeIntent = {
    symbol: intent.symbol,
    marketType: intent.marketType === "perpetual" ? "perpetual" : "spot",
    side: intent.side,
    marginAmount: roundMoney(cappedMargin),
    notionalAmount: roundMoney(finalNotional),
    leverage:
      intent.marketType === "perpetual" ? roundLeverage(targetLeverage) : undefined,
    entryType: intent.entryType,
    limitPrice: intent.limitPrice,
    stopLoss: stopLoss != null ? roundPrice(stopLoss) : intent.stopLoss,
    takeProfit: intent.takeProfit,
  }

  if (safer.marketType === "spot") {
    delete safer.leverage
    safer.side = intent.side === "short" || intent.side === "sell" ? "sell" : "buy"
  }

  if (intentsEffectivelyEqual(intent, safer)) {
    return undefined
  }

  return safer
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

function roundPrice(n: number): number {
  if (n >= 1000) return Math.round(n * 100) / 100
  if (n >= 1) return Math.round(n * 10_000) / 10_000
  return Math.round(n * 1_000_000) / 1_000_000
}

function roundLeverage(n: number): number {
  return Math.round(n * 100) / 100
}

function intentsEffectivelyEqual(a: TradeIntent, b: TradeIntent): boolean {
  return (
    a.symbol === b.symbol &&
    a.marketType === b.marketType &&
    a.side === b.side &&
    a.entryType === b.entryType &&
    approxEq(a.marginAmount, b.marginAmount) &&
    approxEq(a.notionalAmount, b.notionalAmount) &&
    approxEq(a.leverage, b.leverage) &&
    approxEq(a.limitPrice, b.limitPrice) &&
    approxEq(a.stopLoss, b.stopLoss) &&
    approxEq(a.takeProfit, b.takeProfit)
  )
}

function approxEq(a?: number, b?: number): boolean {
  if (a == null && b == null) return true
  if (a == null || b == null) return false
  return Math.abs(a - b) < 1e-6
}
