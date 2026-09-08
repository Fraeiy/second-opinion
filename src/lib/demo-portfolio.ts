import type { PortfolioContext } from "@/lib/types"

/**
 * Simulated demo portfolio for Second Opinion demo mode.
 * Clearly labelled as simulated. Not real funds and not connected to an exchange wallet.
 */
export const DEMO_EQUITY_USD = 10_000

export function getDemoPortfolio(): PortfolioContext {
  return {
    totalEquityUsd: DEMO_EQUITY_USD,
    availableMarginUsd: 8_450,
    positions: [
      {
        symbol: "BTCUSDT",
        side: "long",
        notionalUsd: 800,
        unrealizedPnlUsd: 24.5,
      },
      {
        symbol: "ETHUSDT",
        side: "long",
        notionalUsd: 450,
        unrealizedPnlUsd: -12.1,
      },
      {
        symbol: "SOLUSDT",
        side: "short",
        notionalUsd: 300,
        unrealizedPnlUsd: 8.75,
      },
    ],
    isSimulated: true,
    label: "Demo portfolio (simulated $10,000 USDT equity)",
  }
}

export const DEMO_PORTFOLIO: PortfolioContext = getDemoPortfolio()
