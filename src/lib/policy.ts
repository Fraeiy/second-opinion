import policy from "../../risk-policy.json"

/**
 * Configurable risk scoring defaults for the Second Opinion deterministic engine.
 *
 * These values are software defaults used to score and classify trade intents.
 * They are not financial advice, not a recommendation to trade, and do not
 * guarantee outcomes. Operators may tune thresholds for their product UX.
 */

export type RiskPolicy = {
  /** Score 0 through lowMax inclusive maps to level "low". */
  lowMax: number
  /** Score lowMax+1 through moderateMax inclusive maps to "moderate". */
  moderateMax: number
  /** Score moderateMax+1 through highMax inclusive maps to "high". */
  highMax: number
  /** Scores above highMax map to "extreme" (default band 75-100). */

  /** Flat score penalty when a leveraged or large trade has no stop loss. */
  missingStopLossPenalty: number

  /**
   * Planned loss as a percent of portfolio equity at or above this value
   * contributes an extreme-tier penalty.
   */
  maxPlannedLossPercentExtreme: number

  /** Portfolio notional exposure percent that starts a warning penalty. */
  portfolioExposureWarnPercent: number

  /** Portfolio notional exposure percent treated as critical. */
  portfolioExposureCriticalPercent: number

  /**
   * Escalating leverage score penalties.
   * Applies the single highest matching leverage band.
   */
  leveragePenalties: {
    above3x: number
    above5x: number
    above10x: number
    above20x: number
  }

  /** Realized volatility (% ) warning and critical thresholds. */
  volatilityWarnPercent: number
  volatilityCriticalPercent: number

  /** Bid-ask spread in basis points. */
  spreadWarnBps: number
  spreadCriticalBps: number

  /**
   * Absolute funding rate as a percent (e.g. 0.05 means 0.05%).
   * High absolute funding adds score for perpetuals.
   */
  fundingRateWarnPercent: number
  fundingRateCriticalPercent: number

  /** Absolute order book imbalance (0-1 scale) that adds a liquidity warning. */
  imbalanceWarnAbs: number

  /**
   * When building a safer alternative, cap leverage and target planned loss
   * at or below this percent of portfolio equity (default ~1%).
   */
  saferAltMaxLeverage: number
  saferAltMaxPortfolioLossPercent: number

  /**
   * Verdict policy: extreme scores default to reject.
   * High scores prefer reduce when a safer path exists.
   */
  extremeDefaultsToReject: boolean
  highPrefersReduce: boolean
}

// Fail closed on malformed edits to the one shared configuration.
for (const value of Object.values(policy)) {
  const numbers = typeof value === "object" ? Object.values(value) : [value]
  if (numbers.some(n => typeof n === "number" && (!Number.isFinite(n) || n < 0)))
    throw new Error("Risk policy values must be finite and nonnegative")
}
if (!(policy.lowMax < policy.moderateMax && policy.moderateMax < policy.highMax &&
  policy.highMax < 100 && policy.maxDataAgeSeconds > 0 &&
  policy.saferAltMaxLeverage >= 1 &&
  policy.portfolioExposureWarnPercent < policy.portfolioExposureCriticalPercent))
  throw new Error("Invalid risk policy bands or thresholds")

export const DEFAULT_RISK_POLICY: RiskPolicy = policy

export function scoreToLevel(
  score: number,
  policy: RiskPolicy = DEFAULT_RISK_POLICY,
): "low" | "moderate" | "high" | "extreme" {
  const clamped = clampScore(score)
  if (clamped <= policy.lowMax) return "low"
  if (clamped <= policy.moderateMax) return "moderate"
  if (clamped <= policy.highMax) return "high"
  return "extreme"
}

export function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 100
  return Math.max(0, Math.min(100, Math.round(score)))
}
