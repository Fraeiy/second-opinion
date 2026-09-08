import type { TradeIntent } from "@/lib/types";

export const BINANCE_SPOT_REST = "https://api.binance.com";
/** Public market-data mirror that remains reachable in some geo-restricted networks. */
export const BINANCE_SPOT_DATA_API = "https://data-api.binance.vision";
export const BINANCE_FUTURES_REST = "https://fapi.binance.com";
export const BINANCE_SPOT_REST_FALLBACKS = [
  BINANCE_SPOT_DATA_API,
  BINANCE_SPOT_REST,
] as const;


/** Capability flags derived from public REST plus discovered MCP tools. */
export type BinanceCapability =
  | "publicMarketData"
  | "symbolValidation"
  | "ticker"
  | "klines"
  | "orderBook"
  | "fundingRate"
  | "accountBalances"
  | "positions"
  | "orderPreview"
  | "orderSubmission";

export type BinanceCapabilities = Record<BinanceCapability, boolean>;

export type NormalizedTicker = {
  symbol: string;
  lastPrice: number;
  bidPrice?: number;
  askPrice?: number;
  priceChangePercent?: number;
  highPrice?: number;
  lowPrice?: number;
  quoteVolume?: number;
  timestamp: string;
};

export type NormalizedKline = {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
};

export type NormalizedOrderBook = {
  symbol: string;
  bids: Array<[number, number]>;
  asks: Array<[number, number]>;
  imbalance?: number;
  spreadBps?: number;
  timestamp: string;
};

export type NormalizedFunding = {
  symbol: string;
  fundingRate: number;
  markPrice?: number;
  nextFundingTime?: number;
  timestamp: string;
};

export type NormalizedBalance = {
  asset: string;
  free: number;
  locked: number;
};

export type NormalizedPosition = {
  symbol: string;
  side: string;
  notionalUsd: number;
  entryPrice?: number;
  unrealizedPnlUsd?: number;
  leverage?: number;
};

export type OrderPreview = {
  intent: TradeIntent;
  symbol: string;
  side: TradeIntent["side"];
  marketType: TradeIntent["marketType"];
  entryType: TradeIntent["entryType"];
  quantity?: number;
  notional: number;
  leverage?: number;
  entryPriceLabel: string;
  stopLoss?: number;
  takeProfit?: number;
  estimatedFeeUsd?: number;
  maximumPlannedLoss?: number;
  executionLabel: "SIMULATED";
  warnings: string[];
  confirmationToken?: string;
  timestamp: string;
};

export type OrderSubmissionResult = {
  ok: boolean;
  simulated: boolean;
  /** Explicit label. Demo results must say they are not real Binance orders. */
  label: string;
  orderId?: string;
  message: string;
  intent: TradeIntent;
  timestamp: string;
};



export const DEFAULT_BINANCE_CAPABILITIES: BinanceCapabilities = {
  publicMarketData: true,
  symbolValidation: true,
  ticker: true,
  klines: true,
  orderBook: true,
  fundingRate: true,
  accountBalances: false,
  positions: false,
  orderPreview: true,
  orderSubmission: false,
};
