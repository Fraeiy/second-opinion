export type TradeIntent = {
  symbol: string
  marketType: "spot" | "perpetual"
  side: "long" | "short" | "buy" | "sell"
  marginAmount?: number
  notionalAmount?: number
  leverage?: number
  entryType: "market" | "limit"
  limitPrice?: number
  stopLoss?: number
  takeProfit?: number
}

export type RiskReason = {
  code: string
  title: string
  explanation: string
  severity: "info" | "warning" | "critical"
  /** Backward-compatible alias retained for existing website renderers. */
  message?: string
  metric?: string
  value?: number
}

export type RiskAssessment = {
  score: number
  level: "low" | "moderate" | "high" | "extreme"
  verdict: "proceed" | "caution" | "reduce" | "reject"
  reasons: RiskReason[]
  calculations: {
    notional: number
    marginRequired?: number
    portfolioExposurePercent?: number
    maximumPlannedLoss?: number
    maximumPlannedLossPercent?: number
    stopDistancePercent?: number
    riskRewardRatio?: number
    estimatedLiquidationPrice?: number
    spreadBps?: number
    realizedVolatilityPercent?: number
    fundingRatePercent?: number
  }
  saferAlternative?: TradeIntent
}

export type OperatingMode = "demo" | "readonly" | "trading"
export type ConnectionState =
  | "disconnected"
  | "public_data"
  | "binance_connected"
  | "readonly_auth"
  | "trading_auth"
  | "connection_error"

export type MarketSnapshot = {
  symbol: string
  lastPrice: number
  bid?: number
  ask?: number
  spreadBps?: number
  change24hPercent?: number
  high24h?: number
  low24h?: number
  volume24h?: number
  fundingRate?: number
  orderBookImbalance?: number
  realizedVolatilityPercent?: number
  timestamp: string
  source: "binance_mcp" | "binance_rest_public" | "unavailable"
}

export type PortfolioContext = {
  totalEquityUsd: number
  availableMarginUsd: number
  positions: Array<{
    symbol: string
    side: string
    notionalUsd: number
    unrealizedPnlUsd?: number
  }>
  isSimulated: boolean
  label: string
}

export type AnalysisActivityStep =
  | "parsing_trade"
  | "validating_symbol"
  | "fetching_market_data"
  | "checking_liquidity"
  | "calculating_exposure"
  | "evaluating_risk"
  | "building_safer_alternative"
  | "complete"
  | "error"

export type AgentAnalysisOutput = {
  verdict: RiskAssessment["verdict"]
  riskScore: number
  riskLevel: RiskAssessment["level"]
  primaryConcern: string
  shortExplanation: string
  evidence: string[]
  maximumEstimatedLoss?: string
  positionExposure?: string
  importantMarketConditions: string[]
  saferProposedTradeSummary?: string
  dataTimestamp: string
}

/** Convenience alias used by market data helpers. */
export type MarketType = TradeIntent["marketType"]
