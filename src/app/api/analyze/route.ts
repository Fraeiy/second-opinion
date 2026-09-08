import { NextResponse } from "next/server";
import { getBinanceAdapter } from "@/lib/binance/adapter";
import { getDemoPortfolio } from "@/lib/demo-portfolio";
import { generateRiskNarrative } from "@/lib/narrative";
import { DEFAULT_RISK_POLICY } from "@/lib/policy";
import { rateLimit, clientKeyFromRequest } from "@/lib/rate-limit";
import { assessTradeRisk } from "@/lib/risk-engine";
import { AnalyzeTradeRequestSchema, OperatingModeSchema } from "@/lib/schemas";
import {
  parseTradeIntentHeuristic,
  validateTradeIntent,
} from "@/lib/trade-intent";
import type {
  AnalysisActivityStep,
  OperatingMode,
  PortfolioContext,
  RiskAssessment,
  TradeIntent,
} from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const limited = rateLimit(`analyze:${clientKeyFromRequest(req)}`, {
    limit: 30,
    windowMs: 60_000,
  });
  if (!limited.ok) {
    return NextResponse.json(
      {
        error: "Rate limit exceeded. Retry shortly.",
        retryAfterSec: limited.retryAfterSec,
      },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = AnalyzeTradeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Website path is public-data + labelled simulated portfolio only.
  // Authorized balances/trading live in supported Agent OS clients via SKILL.md.
  const mode: OperatingMode = OperatingModeSchema.catch("demo").parse(
    parsed.data.mode ?? "demo",
  );

  if (mode !== "demo") {
    return NextResponse.json(
      {
        error:
          "This website supports public-market Demo Mode only. Binance Agent OS rejects unapproved custom web clients (3346001). For live balances and trading, install skills/second-opinion/SKILL.md in Codex or Claude Code with the official Binance MCP.",
        code: "WEBSITE_PUBLIC_DEMO_ONLY",
        binanceError: "3346001",
      },
      { status: 400 },
    );
  }

  const policy = DEFAULT_RISK_POLICY;
  const demoEquity = parsed.data.demoEquityUsd;

  const portfolio: PortfolioContext = {
    ...getDemoPortfolio(),
    ...(demoEquity && demoEquity > 0
      ? {
          totalEquityUsd: demoEquity,
          availableMarginUsd: demoEquity * 0.845,
          label: `Simulated portfolio ($${demoEquity.toLocaleString()} USDT equity)`,
        }
      : {}),
  };

  // Force honest labeling on the website path.
  portfolio.isSimulated = true;
  if (!portfolio.label.toLowerCase().includes("simulat")) {
    portfolio.label = `Simulated portfolio: ${portfolio.label}`;
  }

  const steps: AnalysisActivityStep[] = [];
  const push = (step: AnalysisActivityStep) => {
    steps.push(step);
  };

  try {
    push("parsing_trade");

    let intent: TradeIntent | null = null;
    if (parsed.data.intent) {
      const validated = validateTradeIntent(parsed.data.intent);
      if (!validated.success) {
        return NextResponse.json(
          {
            error: "Invalid trade intent",
            details: validated.error.flatten(),
            steps,
          },
          { status: 400 },
        );
      }
      intent = validated.data;
    } else if (parsed.data.text) {
      intent = parseTradeIntentHeuristic(
        parsed.data.text,
        portfolio.totalEquityUsd,
      );
    }

    if (!intent) {
      return NextResponse.json(
        {
          error:
            "Could not parse a trade intent. Include a symbol and direction, for example: I want to open a $200 20x BNB long.",
          needsClarification: true,
          steps,
        },
        { status: 422 },
      );
    }

    const adapter = getBinanceAdapter();

    push("validating_symbol");
    const valid = await adapter.validateSymbol(intent.symbol, intent.marketType);
    if (!valid) {
      return NextResponse.json(
        {
          error: `Symbol ${intent.symbol} was not found or is not trading on Binance ${intent.marketType}.`,
          intent,
          steps: [...steps, "error" as const],
        },
        { status: 404 },
      );
    }

    push("fetching_market_data");
    const market = await adapter.getMarketSnapshot(intent.symbol, intent.marketType);

    if (market.source === "unavailable" || !(market.lastPrice > 0)) {
      return NextResponse.json(
        {
          error: "Live market data is unavailable. Retry in a moment.",
          intent,
          market,
          steps: [...steps, "error" as const],
          connection: adapter.getStatus(mode),
        },
        { status: 503 },
      );
    }

    push("checking_liquidity");
    push("calculating_exposure");
    push("evaluating_risk");

    let assessment: RiskAssessment = assessTradeRisk(
      intent,
      market,
      portfolio,
      policy,
    );

    push("building_safer_alternative");
    if (assessment.saferAlternative) {
      const saferCheck = validateTradeIntent(assessment.saferAlternative);
      if (!saferCheck.success) {
        assessment = { ...assessment, saferAlternative: undefined };
      }
    }

    const narrative = await generateRiskNarrative({
      intent,
      risk: assessment,
      market,
      portfolio,
      mode,
    });

    const preview = await adapter.previewOrder(intent, market, {
      mode: "demo",
      maximumPlannedLoss: assessment.calculations.maximumPlannedLoss,
    });
    const confirmationToken = adapter.createConfirmationToken(intent, "demo");

    let saferPreview = null;
    let saferToken = null;
    if (assessment.saferAlternative) {
      const saferIntent = assessment.saferAlternative;
      const saferAssessment = assessTradeRisk(
        saferIntent,
        market,
        portfolio,
        policy,
      );
      saferPreview = await adapter.previewOrder(saferIntent, market, {
        mode: "demo",
        maximumPlannedLoss: saferAssessment.calculations.maximumPlannedLoss,
      });
      saferToken = adapter.createConfirmationToken(saferIntent, "demo");
    }

    push("complete");

    return NextResponse.json({
      mode: "demo",
      intent,
      market,
      portfolio,
      assessment,
      analysis: narrative.analysis,
      usedModel: narrative.usedModel,
      model: narrative.model,
      preview,
      confirmationToken,
      saferPreview,
      saferConfirmationToken: saferToken,
      steps,
      connection: adapter.getStatus("demo"),
      disclaimer:
        "Website Demo Mode: live public Binance market data + clearly labelled simulated portfolio and simulated execution. Authorized balances/trading require skills/second-opinion/SKILL.md inside Codex or Claude Code with official Binance Agent OS MCP. Binance rejects unapproved custom web clients with error 3346001.",
    });
  } catch (err) {
    console.error("[analyze]", err instanceof Error ? err.message : "unknown");
    return NextResponse.json(
      {
        error: "Analysis failed. Please retry.",
        steps: [...steps, "error" as const],
      },
      { status: 500 },
    );
  }
}
