import * as z from "zod"
import { TradeIntentSchema } from "@/lib/trade-intent"

export const RiskReasonSchema = z.object({
  code: z.string(),
  title: z.string().optional(),
  explanation: z.string().optional(),
  severity: z.enum(["info", "warning", "critical"]),
  message: z.string(),
  metric: z.string().optional(),
  value: z.number().optional(),
})

export const RiskCalculationsSchema = z.object({
  notional: z.number(),
  marginRequired: z.number().optional(),
  portfolioExposurePercent: z.number().optional(),
  maximumPlannedLoss: z.number().optional(),
  maximumPlannedLossPercent: z.number().optional(),
  stopDistancePercent: z.number().optional(),
  riskRewardRatio: z.number().optional(),
  estimatedLiquidationPrice: z.number().optional(),
  spreadBps: z.number().optional(),
  realizedVolatilityPercent: z.number().optional(),
  fundingRatePercent: z.number().optional(),
})

export const RiskAssessmentSchema = z.object({
  score: z.number().min(0).max(100),
  level: z.enum(["low", "moderate", "high", "extreme"]),
  verdict: z.enum(["proceed", "caution", "reduce", "reject"]),
  reasons: z.array(RiskReasonSchema),
  calculations: RiskCalculationsSchema,
  saferAlternative: TradeIntentSchema.optional(),
})

export const MarketSnapshotSchema = z.object({
  symbol: z.string(),
  lastPrice: z.number(),
  bid: z.number().optional(),
  ask: z.number().optional(),
  spreadBps: z.number().optional(),
  change24hPercent: z.number().optional(),
  high24h: z.number().optional(),
  low24h: z.number().optional(),
  volume24h: z.number().optional(),
  fundingRate: z.number().optional(),
  orderBookImbalance: z.number().optional(),
  realizedVolatilityPercent: z.number().optional(),
  timestamp: z.string(),
  source: z.enum(["binance_mcp", "binance_rest_public", "unavailable"]),
})

export const PortfolioPositionSchema = z.object({
  symbol: z.string(),
  side: z.string(),
  notionalUsd: z.number(),
  unrealizedPnlUsd: z.number().optional(),
})

export const PortfolioContextSchema = z.object({
  totalEquityUsd: z.number(),
  availableMarginUsd: z.number(),
  positions: z.array(PortfolioPositionSchema),
  isSimulated: z.boolean(),
  label: z.string(),
})

export const OperatingModeSchema = z.enum(["demo", "readonly", "trading"])

export const ConnectionStateSchema = z.enum([
  "disconnected",
  "public_data",
  "binance_connected",
  "readonly_auth",
  "trading_auth",
  "connection_error",
])

export const AnalysisActivityStepSchema = z.enum([
  "parsing_trade",
  "validating_symbol",
  "fetching_market_data",
  "checking_liquidity",
  "calculating_exposure",
  "evaluating_risk",
  "building_safer_alternative",
  "complete",
  "error",
])

export const AgentAnalysisOutputSchema = z.object({
  verdict: z.enum(["proceed", "caution", "reduce", "reject"]),
  riskScore: z.number(),
  riskLevel: z.enum(["low", "moderate", "high", "extreme"]),
  primaryConcern: z.string(),
  shortExplanation: z.string(),
  evidence: z.array(z.string()),
  maximumEstimatedLoss: z.string().optional(),
  positionExposure: z.string().optional(),
  importantMarketConditions: z.array(z.string()),
  saferProposedTradeSummary: z.string().optional(),
  dataTimestamp: z.string(),
})

/** POST /api/analyze (or equivalent) request body. */
export const AnalyzeTradeRequestSchema = z.object({
  text: z.string().min(1).optional(),
  intent: TradeIntentSchema.optional(),
  demoEquityUsd: z.number().positive().max(1_000_000_000).optional(),
  mode: OperatingModeSchema.optional(),
}).strict().refine((body) => Boolean(body.text?.trim() || body.intent), {
  message: "Provide either text or intent",
})

export const AnalyzeTradeResponseSchema = z.object({
  intent: TradeIntentSchema,
  assessment: RiskAssessmentSchema,
  agent: AgentAnalysisOutputSchema.optional(),
  activityStep: AnalysisActivityStepSchema.optional(),
  connectionState: ConnectionStateSchema.optional(),
  mode: OperatingModeSchema.optional(),
})

export type AnalyzeTradeRequest = z.infer<typeof AnalyzeTradeRequestSchema>
export type AnalyzeTradeResponse = z.infer<typeof AnalyzeTradeResponseSchema>
export type AgentAnalysisOutput = z.infer<typeof AgentAnalysisOutputSchema>
export type AgentAnalysisOutputParsed = AgentAnalysisOutput
