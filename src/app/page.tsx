"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type {
  MarketSnapshot,
  RiskAssessment,
  TradeIntent,
} from "@/lib/types";
import type { OrderPreview, OrderSubmissionResult } from "@/lib/binance/types";

type Result = {
  intent: TradeIntent;
  market: MarketSnapshot;
  portfolio: { isSimulated: boolean; label: string };
  assessment: RiskAssessment;
  analysis: { primaryConcern: string; shortExplanation: string };
  preview: OrderPreview;
  confirmationToken: string;
  saferPreview: OrderPreview | null;
  saferConfirmationToken: string | null;
  usedModel: boolean;
  model?: string;
  steps: string[];
  disclaimer?: string;
};

const examples = [
  "I want to open a $200 20x BNB long. Check it first.",
  "Can I risk 40% of my portfolio on a 15x BTC short?",
  "Build me a lower-risk ETH trade with a maximum loss of $10.",
];

const flow = [
  ["parsing_trade", "Parsing trade", "Extracting symbol, side and size"],
  ["validating_symbol", "Validating symbol", "Checking the Binance market"],
  ["fetching_market_data", "Fetching market data", "Live public ticker and depth"],
  ["checking_liquidity", "Checking liquidity", "Spread and order-book depth"],
  ["calculating_exposure", "Calculating exposure", "Sizing against simulated equity"],
  ["evaluating_risk", "Evaluating risk", "Applying deterministic policy"],
  ["building_safer_alternative", "Building safer alternative", "Restructuring dangerous inputs"],
] as const;

const money = (n?: number) =>
  n == null
    ? "Not defined"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      }).format(n);

const num = (n?: number, u = "") => (n == null ? "Unavailable" : `${n.toFixed(2)}${u}`);

export default function Home() {
  const [prompt, setPrompt] = useState(examples[0]);
  const [equity, setEquity] = useState(10000);
  const [modal, setModal] = useState<"about" | "settings" | "architecture" | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [safer, setSafer] = useState(false);
  const [ack, setAck] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [execution, setExecution] = useState<OrderSubmissionResult | null>(null);
  const [marketStatus, setMarketStatus] = useState("Checking public market data...");
  const aborter = useRef<AbortController | null>(null);

  useEffect(() => {
    fetch("/api/demo-status")
      .then((r) => r.json())
      .then((d) =>
        setMarketStatus(
          d.message ||
            "Public Binance market data available. Portfolio and execution are simulated on this website.",
        ),
      )
      .catch(() => setMarketStatus("Could not reach market-status endpoint."));
  }, []);

  const preview = useMemo(
    () => (safer && result?.saferPreview ? result.saferPreview : result?.preview),
    [result, safer],
  );
  const token = safer ? result?.saferConfirmationToken : result?.confirmationToken;

  async function analyze(e?: FormEvent) {
    e?.preventDefault();
    if (!prompt.trim()) return;
    aborter.current?.abort();
    aborter.current = new AbortController();
    setLoading(true);
    setError("");
    setResult(null);
    setExecution(null);
    setSafer(false);
    setAck(false);
    try {
      const r = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: prompt.slice(0, 2000),
          mode: "demo",
          demoEquityUsd: equity,
        }),
        signal: aborter.current.signal,
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Analysis failed.");
      setResult(d);
      if (d.connection?.message) setMarketStatus(d.connection.message);
    } catch (c) {
      if ((c as Error).name !== "AbortError") setError((c as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function confirm() {
    if (!preview || !token || !ack) return;
    const r = await fetch("/api/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        intent: preview.intent,
        confirmationToken: token,
        acknowledged: true,
        mode: "demo",
      }),
    });
    const d = await r.json();
    if (!r.ok) setError(d.error || "Confirmation failed.");
    else {
      setExecution(d.result);
      setAck(false);
    }
  }

  const score = result?.assessment.score ?? 0;

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top">
          <span className="brand-mark" aria-hidden>
            <i />
            <i />
          </span>
          <span>
            <strong>SECOND OPINION</strong>
            <small>PORTABLE TRADING SAFETY SKILL</small>
          </span>
        </a>
        <div className="header-actions">
          <div className="mode-switch" role="status" aria-label="Website mode">
            <button type="button" className="active">
              Public demo
            </button>
          </div>
          <button
            type="button"
            className="connect-btn"
            onClick={() => setModal("architecture")}
          >
            Live account setup
          </button>
          <button type="button" className="icon-btn" onClick={() => setModal("about")} aria-label="About">
            ?
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setModal("settings")}
            aria-label="Settings"
          >
            &#9881;
          </button>
        </div>
      </header>

      <div className="status-strip" id="top">
        <span className="status-dot public_data" />
        <strong>PUBLIC MARKET DATA</strong>
        <span>{marketStatus}</span>
        <span className="status-meta">SIMULATED PORTFOLIO / SIMULATED EXECUTION</span>
      </div>

      <section className="hero">
        <p className="eyebrow">THE CONTROL LAYER BETWEEN INTENT AND EXECUTION</p>
        <h1>
          Your AI should know
          <br />
          when to <em>push back.</em>
        </h1>
        <p>
          Second Opinion is a portable safety layer that gives supported AI trading agents
          the ability to challenge risky trades before execution.
        </p>
        <p>
          This website uses live public Binance market data with a clearly labelled simulated
          portfolio. Authorized balances and trading run through the Second Opinion skill inside
          Codex or Claude Code, where Binance Agent OS MCP is supported.
        </p>
        <div className="hero-actions">
          <a className="button primary" href="/install">Install for Codex / Claude Code</a>
          <a className="button secondary" href="/repository">GitHub repository</a>
          <button
            type="button"
            className="button primary"
            onClick={() => {
              setPrompt(examples[0]);
              void analyze();
            }}
            disabled={loading}
          >
            Run public risk check
          </button>
          <button type="button" className="button secondary" onClick={() => setModal("architecture")}>
            How live accounts work
          </button>
        </div>
      </section>

      <div className="workspace">
        <section className="compose-card">
          <div className="section-label">
            <span>01</span> PROPOSE A TRADE
          </div>
          <form onSubmit={analyze}>
            <label className="sr-only" htmlFor="prompt">
              Trade proposal
            </label>
            <textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              maxLength={2000}
              disabled={loading}
            />
            <div className="composer-foot">
              <span>{prompt.length}/2000 / Natural language</span>
              {loading ? (
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => aborter.current?.abort()}
                >
                  Stop analysis
                </button>
              ) : (
                <button type="submit" className="button primary">
                  Run risk check -&gt;
                </button>
              )}
            </div>
          </form>
          <div className="examples">
            <span>TRY AN EXAMPLE</span>
            {examples.map((x, i) => (
              <button key={x} type="button" onClick={() => setPrompt(x)}>
                0{i + 1} {x}
              </button>
            ))}
          </div>
        </section>

        <aside className="activity-card">
          <div className="section-label">
            <span>LIVE</span> AGENT ACTIVITY
          </div>
          <ol>
            {flow.map(([key, title, detail], i) => {
              const done = result?.steps.includes(key);
              return (
                <li key={key} className={done ? "done" : loading && i === 0 ? "active" : ""}>
                  <b>{done ? "OK" : i + 1}</b>
                  <div>
                    <strong>{title}</strong>
                    <small>{detail}</small>
                  </div>
                </li>
              );
            })}
          </ol>
          {!loading && !result && <p className="waiting">Waiting for a trade proposal.</p>}
        </aside>
      </div>

      {error && (
        <section className="error-banner" role="alert">
          <strong>Analysis interrupted</strong>
          <span>{error}</span>
          <button type="button" onClick={() => analyze()}>
            Retry
          </button>
        </section>
      )}

      {result && (
        <section className="report">
          <div className="report-head">
            <div>
              <div className="section-label">
                <span>02</span> SECOND OPINION
              </div>
              <h2>{result.intent.symbol} risk report</h2>
              <p>
                Live public Binance data at {new Date(result.market.timestamp).toLocaleTimeString()}{" "}
                · {result.portfolio.label}
              </p>
            </div>
            <span className={`verdict ${result.assessment.verdict}`}>
              {result.assessment.verdict.toUpperCase()}
            </span>
          </div>

          <div className="risk-grid">
            <article className="score-card">
              <div
                className="score-ring"
                style={{ "--score": `${score * 3.6}deg` } as React.CSSProperties}
              >
                <div>
                  <strong>{score}</strong>
                  <span>/ 100</span>
                </div>
              </div>
              <div>
                <p>DETERMINISTIC RISK SCORE</p>
                <h3>{result.assessment.level.toUpperCase()} RISK</h3>
                <span>Policy thresholds are configurable</span>
              </div>
            </article>
            {(
              [
                [
                  "MAX PLANNED LOSS",
                  money(result.assessment.calculations.maximumPlannedLoss),
                  result.intent.stopLoss ? "Stop-based estimate" : "No stop loss defined",
                ],
                [
                  "PORTFOLIO EXPOSURE",
                  num(result.assessment.calculations.portfolioExposurePercent, "%"),
                  "Simulated equity",
                ],
                ["LEVERAGE", `${result.intent.leverage ?? 1}x`, result.intent.marketType],
                [
                  "STOP DISTANCE",
                  num(result.assessment.calculations.stopDistancePercent, "%"),
                  result.intent.stopLoss ? "Protected" : "Missing protection",
                ],
              ] as const
            ).map((x) => (
              <article className="metric" key={x[0]}>
                <span>{x[0]}</span>
                <strong>{x[1]}</strong>
                <small>{x[2]}</small>
              </article>
            ))}
          </div>

          <div className="evidence-grid">
            <article>
              <span className="mini-label">PRIMARY CONCERN</span>
              <h3>{result.analysis.primaryConcern}</h3>
              <p>{result.analysis.shortExplanation}</p>
              <div className="source-note">
                {result.usedModel
                  ? `AI explanation via ${result.model}`
                  : "Deterministic explanation"}
              </div>
            </article>
            <article>
              <span className="mini-label">WHY IT WAS FLAGGED</span>
              <ol>
                {result.assessment.reasons.slice(0, 3).map((r) => (
                  <li key={r.code}>
                    <b>{r.severity === "critical" ? "!" : "i"}</b>
                    <span>{r.message}</span>
                  </li>
                ))}
              </ol>
            </article>
            <article>
              <span className="mini-label">MARKET CONDITIONS</span>
              <dl>
                <div>
                  <dt>Last price</dt>
                  <dd>{money(result.market.lastPrice)}</dd>
                </div>
                <div>
                  <dt>24h move</dt>
                  <dd>{num(result.market.change24hPercent, "%")}</dd>
                </div>
                <div>
                  <dt>Funding</dt>
                  <dd>
                    {result.market.fundingRate == null
                      ? "Unavailable"
                      : num(result.market.fundingRate * 100, "%")}
                  </dd>
                </div>
                <div>
                  <dt>Bid / ask spread</dt>
                  <dd>{num(result.market.spreadBps, " bps")}</dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>Binance public API</dd>
                </div>
              </dl>
            </article>
          </div>

          {result.saferPreview && (
            <article className="safer-card">
              <div className="safer-copy">
                <span className="mini-label">SAFER STRUCTURE</span>
                <h3>Reduce the blast radius</h3>
                <p>
                  The policy engine resized leverage and capital at risk while preserving direction.
                </p>
                <button
                  type="button"
                  className={`button ${safer ? "selected" : "primary"}`}
                  onClick={() => {
                    setSafer(true);
                    setAck(false);
                  }}
                >
                  {safer ? "Safer plan selected" : "Use safer plan ->"}
                </button>
              </div>
              <div className="comparison">
                <div>
                  <b>FIELD</b>
                  <b>ORIGINAL</b>
                  <b>SAFER PLAN</b>
                </div>
                {(
                  [
                    [
                      "Margin",
                      money(result.preview.intent.marginAmount),
                      money(result.saferPreview.intent.marginAmount),
                    ],
                    [
                      "Leverage",
                      `${result.preview.leverage ?? 1}x`,
                      `${result.saferPreview.leverage ?? 1}x`,
                    ],
                    [
                      "Notional",
                      money(result.preview.notional),
                      money(result.saferPreview.notional),
                    ],
                    [
                      "Planned loss",
                      money(result.preview.maximumPlannedLoss),
                      money(result.saferPreview.maximumPlannedLoss),
                    ],
                  ] as const
                ).map((x) => (
                  <div key={x[0]}>
                    <span>{x[0]}</span>
                    <span>{x[1]}</span>
                    <strong>{x[2]}</strong>
                  </div>
                ))}
              </div>
            </article>
          )}

          {preview && (
            <article className="approval-card">
              <div className="approval-head">
                <div>
                  <span className="mini-label">03 / EXPLICIT APPROVAL</span>
                  <h3>Final order preview</h3>
                </div>
                <span className="execution-label simulated">SIMULATED</span>
              </div>
              <div className="order-summary">
                {(
                  [
                    ["Symbol", preview.symbol],
                    ["Side", preview.side.toUpperCase()],
                    ["Market", preview.marketType],
                    ["Order type", preview.entryType],
                    ["Notional", money(preview.notional)],
                    ["Leverage", `${preview.leverage ?? 1}x`],
                    ["Entry", preview.entryPriceLabel],
                    ["Stop loss", money(preview.stopLoss)],
                    ["Take profit", money(preview.takeProfit)],
                    ["Est. fee", money(preview.estimatedFeeUsd)],
                    ["Max planned loss", money(preview.maximumPlannedLoss)],
                    ["Execution", "SIMULATED - not a real Binance order"],
                  ] as const
                ).map((x) => (
                  <div key={x[0]}>
                    <span>{x[0]}</span>
                    <strong>{x[1]}</strong>
                  </div>
                ))}
              </div>
              <label className="acknowledgement">
                <input
                  type="checkbox"
                  checked={ack}
                  onChange={(e) => setAck(e.target.checked)}
                />
                <span>
                  I reviewed this preview and understand that{" "}
                  <strong>no real Binance order will be placed on this website</strong>.
                </span>
              </label>
              <div className="approval-actions">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => {
                    setAck(false);
                    setExecution(null);
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="button confirm"
                  disabled={!ack}
                  onClick={() => void confirm()}
                >
                  Confirm simulated order
                </button>
              </div>
              {execution && (
                <div className={`execution-result ${execution.ok ? "ok" : "bad"}`}>
                  <strong>{execution.label}</strong>
                  <span>{execution.message}</span>
                  {execution.orderId && <code>{execution.orderId}</code>}
                </div>
              )}
            </article>
          )}

          {result.disclaimer && (
            <p className="waiting" style={{ marginTop: 24 }}>
              {result.disclaimer}
            </p>
          )}
        </section>
      )}

      <footer>
        <span>SECOND OPINION / OPEN SOURCE PRE-TRADE RISK CONTROL</span>
        <p>
          Website: public market demo. Live account auth: Codex / Claude Code + Agent OS skill.
        </p>
        <button type="button" className="footer-link" onClick={() => setModal("architecture")}>
          Architecture notes
        </button>
      </footer>

      {modal && (
        <div className="modal-backdrop" onMouseDown={() => setModal(null)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button type="button" className="modal-close" onClick={() => setModal(null)}>
              x
            </button>

            {modal === "architecture" && (
              <>
                <span className="mini-label">ARCHITECTURE</span>
                <h2>Why there is no Connect Binance button</h2>
                <p>
                  Binance Agent OS currently rejects unapproved custom web clients with error{" "}
                  <strong>3346001</strong>. This website therefore does not advertise direct MCP
                  account login.
                </p>
                <ol className="how-list">
                  <li>
                    <b>1</b>
                    <span>
                      <strong>This website</strong>
                      Live public Binance market analysis, simulated portfolio, simulated execution
                      labels.
                    </span>
                  </li>
                  <li>
                    <b>2</b>
                    <span>
                      <strong>Supported Agent path</strong>
                      Install <code>skills/second-opinion/SKILL.md</code> in Codex or Claude Code.
                    </span>
                  </li>
                  <li>
                    <b>3</b>
                    <span>
                      <strong>Add official MCP</strong>
                      <code className="verify-prompt">
                        claude mcp add binance-mcp-server --transport http
                        https://agent.binance.com/mcp/agentic
                      </code>
                    </span>
                  </li>
                  <li>
                    <b>4</b>
                    <span>
                      <strong>Authenticate there</strong>
                      Then verify with: Use the Binance MCP Server to show the current BTCUSDT
                      price and 24-hour change.
                    </span>
                  </li>
                </ol>
                <div className="connect-actions" style={{ marginTop: 16 }}>
                  <button
                    type="button"
                    className="button primary"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(
                          "claude mcp add binance-mcp-server --transport http https://agent.binance.com/mcp/agentic",
                        );
                      } catch {
                        /* ignore */
                      }
                    }}
                  >
                    Copy Claude MCP command
                  </button>
                  <a
                    className="button secondary"
                    href="https://developers.binance.com/en/docs/agent-native/mcp-server/agentic"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Binance Agent OS docs
                  </a>
                </div>
              </>
            )}

            {modal === "settings" && (
              <>
                <span className="mini-label">DEMO SETTINGS</span>
                <h2>Simulated portfolio</h2>
                <p>
                  Website equity is simulated. Live balances require the skill in a supported
                  Agent.
                </p>
                <label>
                  Simulated portfolio equity (USD)
                  <input
                    className="settings-input"
                    type="number"
                    min={100}
                    value={equity}
                    onChange={(e) => setEquity(Math.max(100, Number(e.target.value)))}
                  />
                </label>
              </>
            )}

            {modal === "about" && (
              <>
                <span className="mini-label">HOW IT WORKS</span>
                <h2>A deliberate pause before execution</h2>
                <ol className="how-list">
                  {(
                    [
                      ["Understand intent", "Natural language becomes validated trade data."],
                      ["Retrieve public evidence", "Live Binance market data supports the analysis."],
                      ["Calculate risk", "Deterministic policy owns every number."],
                      ["Push back", "Dangerous structures are rejected or resized."],
                      ["Require approval", "A separate acknowledgement gates simulated execution."],
                    ] as const
                  ).map(([a, b], i) => (
                    <li key={a}>
                      <b>{i + 1}</b>
                      <span>
                        <strong>{a}</strong>
                        {b}
                      </span>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
