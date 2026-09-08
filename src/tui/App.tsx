/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useApp, useInput, useStdin } from "ink";
import path from "node:path";
import { parseDemoRequest, runDemoReview } from "./demo-review";
import { parseSimplePriceQuery, runSimplePriceQuery } from "./market-query";
import { formatConversationText } from "./presentation";
import { AppServerClient, normalizeEvent, type JsonRpcMessage } from "./protocol";
import { buildModeConfig, defaultModeForCapability, detectBinanceCapability, isToolAllowed, MODE_OPTIONS, modeDeveloperInstructions, modeLabel, parseModeCommand, TRADING_PERMISSION_UNAVAILABLE, waitForBinanceStatus, type BinanceCapability, type McpToolDefinition, type OperatingMode } from "./modes";

type Approval = { message: JsonRpcMessage; respond: (value: unknown) => void } | null;
const yellow = "#F0B90B";
function Panel({ title, children, color = yellow }: { title: string; children: React.ReactNode; color?: string }) { return <Box borderStyle="round" borderColor={color} flexDirection="column" paddingX={1} marginBottom={1}><Text color={color} bold>{title}</Text>{children}</Box>; }
function line(label: string, value: unknown) { return <Text key={label}><Text color="#9CA3AF">{label.padEnd(22)}</Text><Text>{value == null ? "—" : String(value)}</Text></Text>; }
function approvalResponse(message: JsonRpcMessage, accepted: boolean) {
  if (message.method === "mcpServer/elicitation/request") return { action: accepted ? "accept" : "decline", content: null, _meta: null };
  if (message.method === "item/tool/requestUserInput") {
    const questions = Array.isArray(message.params?.questions) ? message.params.questions : [];
    const answers = Object.fromEntries(questions.map((question: any) => {
      const labels = Array.isArray(question.options) ? question.options.map((option: any) => String(option.label)) : [];
      const pattern = accepted ? /accept|approve|continue|yes|allow/i : /decline|reject|cancel|no|deny/i;
      return [String(question.id), { answers: [labels.find((label: string) => pattern.test(label)) ?? (accepted ? "Accept" : "Decline")] }];
    }));
    return { answers };
  }
  return { decision: accepted ? "accept" : "decline" };
}
function approvalDetail(message: JsonRpcMessage): string {
  if (message.method === "item/tool/requestUserInput") return (message.params?.questions ?? []).map((question: any) => question.question).filter(Boolean).join("\n") || message.method;
  return String(message.params?.message ?? message.params?.command ?? message.params?.reason ?? message.method);
}

export function App() {
  const { exit } = useApp();
  const { isRawModeSupported } = useStdin();
  const [client] = useState(() => new AppServerClient(path.resolve(process.cwd())));
  const [status, setStatus] = useState("connecting"); const [binance, setBinance] = useState("checking");
  const [mode, setMode] = useState<OperatingMode | null>(null); const [capability, setCapability] = useState<BinanceCapability>("Unknown");
  const [binanceTools, setBinanceTools] = useState<Record<string, McpToolDefinition | undefined>>({});
  const [selectorOpen, setSelectorOpen] = useState(false); const [selectedModeIndex, setSelectedModeIndex] = useState(1); const [tradingConfirm, setTradingConfirm] = useState(false); const [modeChanging, setModeChanging] = useState(false);
  const [input, setInput] = useState(""); const [history, setHistory] = useState<Array<{ role: string; text: string }>>([]); const [agentText, setAgentText] = useState("");
  const [activities, setActivities] = useState<string[]>([]); const [report, setReport] = useState<any>(null); const [error, setError] = useState(""); const [approval, setApproval] = useState<Approval>(null); const [turnId, setTurnId] = useState<string>();
  const [saferAccepted, setSaferAccepted] = useState(false); const [previewConfirmed, setPreviewConfirmed] = useState(false); const [tradeRequested, setTradeRequested] = useState(false); const [turnActive, setTurnActive] = useState(false);
  const modeRef = useRef<OperatingMode | null>(null); const toolsRef = useRef<Record<string, McpToolDefinition | undefined>>({}); const turnIdRef = useRef<string | undefined>(undefined); const agentTextRef = useRef(""); const messagePhasesRef = useRef(new Map<string, "commentary" | "final_answer" | null>());

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { toolsRef.current = binanceTools; }, [binanceTools]);
  useEffect(() => { turnIdRef.current = turnId; }, [turnId]);

  useEffect(() => { let alive = true;
    client.onMessage((m) => { const e = normalizeEvent(m); if (!e) return;
      if (e.kind === "agent-start") { messagePhasesRef.current.set(e.id, e.phase); if (e.phase === "final_answer") { agentTextRef.current = ""; setAgentText(""); } else setActivities((v) => v.at(-1) === "Codex is working" ? v : [...v.slice(-7), "Codex is working"]); }
      if (e.kind === "agent" && messagePhasesRef.current.get(e.id) === "final_answer") agentTextRef.current += e.text;
      if (e.kind === "agent-complete") { messagePhasesRef.current.set(e.id, e.phase); if (e.phase === "final_answer") { const answer = formatConversationText(e.text); agentTextRef.current = answer; setAgentText(answer); } else setActivities((v) => v.at(-1) === "Codex progress updated" ? v : [...v.slice(-7), "Codex progress updated"]); }
      if (e.kind === "activity") setActivities((v) => v.at(-1) === e.label ? v : [...v.slice(-7), e.label]);
      if (e.kind === "mcp") { setBinance("connected"); setActivities((v) => [...v.slice(-7), `Binance: ${e.tool}`]); const activeMode = modeRef.current; if (activeMode && /binance/i.test(e.server) && e.status === "inProgress" && !isToolAllowed(activeMode, e.tool, toolsRef.current[e.tool])) { setError(`Blocked ${e.tool}: it is not allowed in ${modeLabel(activeMode)} mode.`); if (turnIdRef.current) void client.interrupt(turnIdRef.current); } }
      if (e.kind === "turn") { const active = e.status === "inProgress"; setTurnActive(active); setTurnId((current) => m.params?.turn?.id ?? current); if (!active) { const reply = agentTextRef.current.trim(); if (reply) setHistory((v) => [...v, { role: "Second Opinion", text: reply }]); agentTextRef.current = ""; setAgentText(""); messagePhasesRef.current.clear(); setActivities((v) => [...v.slice(-7), "Response complete"]); } }
      if (e.kind === "error") { setError(e.message); setActivities((v) => [...v.slice(-7), "Request failed"]); }
    });
    client.onServerRequest((m, respond) => {
      const serverName = String(m.params?.serverName ?? ""); const requestText = JSON.stringify(m.params ?? {});
      if (modeRef.current !== "trading" && /binance/i.test(serverName) && /order|cancel|trade|transfer|withdraw|deposit|borrow|repay/i.test(requestText)) {
        respond({ action: "decline", content: null, _meta: null }); setError(`Blocked Binance write request in ${modeLabel(modeRef.current)} mode.`); return;
      }
      setApproval({ message: m, respond });
    });
    (async () => { try { await client.start(); if (!alive) return; setStatus("connected"); await client.startThread(); try {
      const b = await waitForBinanceStatus(() => client.mcpStatus(), { onUpdate: (entry) => {
        if (alive) setBinance(`${entry.runtimeStatus ?? "checking"}${entry.authStatus && entry.authStatus !== "unknown" ? ` / ${entry.authStatus}` : ""}`);
      } });
      if (!b) { await client.configureThread(buildModeConfig("market", {}), modeDeveloperInstructions("market")); setBinance("not configured"); setCapability("Unknown"); setMode("market"); return; }
      const tools = b.tools ?? {}; const detected = detectBinanceCapability(b); const initialMode = defaultModeForCapability(detected);
      setBinance(`${b.runtimeStatus ?? "configured"}${b.authStatus && b.authStatus !== "unknown" ? ` / ${b.authStatus}` : ""}`); setBinanceTools(tools); setCapability(detected);
      await client.configureThread(buildModeConfig(initialMode, tools), modeDeveloperInstructions(initialMode));
      if (alive) { setMode(initialMode); setSelectedModeIndex(MODE_OPTIONS.findIndex((option) => option.mode === initialMode)); }
    } catch { await client.configureThread(buildModeConfig("market", {}), modeDeveloperInstructions("market")); setBinance("unavailable"); setCapability("Unknown"); setMode("market"); } } catch (e) { if (alive) { setStatus("unavailable"); setError(e instanceof Error ? e.message : String(e)); } } })();
    return () => { alive = false; client.shutdown(); };
  }, [client]);

  const activateMode = async (nextMode: OperatingMode) => {
    if (turnActive) { setError("Finish or cancel the active turn before switching modes."); return; }
    setModeChanging(true); setError("");
    try { await client.configureThread(buildModeConfig(nextMode, binanceTools), modeDeveloperInstructions(nextMode)); setMode(nextMode); setSelectedModeIndex(MODE_OPTIONS.findIndex((option) => option.mode === nextMode)); setActivities((v) => [...v.slice(-7), `Mode changed to ${modeLabel(nextMode)}`]); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setModeChanging(false); }
  };

  const requestMode = (nextMode: OperatingMode) => {
    setSelectorOpen(false);
    if (nextMode === "trading") {
      if (capability !== "Trading") { setError(TRADING_PERMISSION_UNAVAILABLE); return; }
      setTradingConfirm(true); return;
    }
    void activateMode(nextMode);
  };

  const submit = async () => {
    const text = input.trim(); if (!text || turnActive || modeChanging) return;
    const command = parseModeCommand(text);
    if (command) { setInput(""); if (command === "selector") setSelectorOpen(true); else requestMode(command); return; }
    setInput(""); setHistory(v => [...v, { role: "You", text }]); setReport(null); setAgentText(""); setError(""); setSaferAccepted(false); setPreviewConfirmed(false);
    const request = parseDemoRequest(text); const priceQuery = parseSimplePriceQuery(text); setTradeRequested(Boolean(request));
    if (priceQuery) {
      setActivities(["Checking Binance\u2026"]);
      if (status !== "connected" || !mode || Object.keys(binanceTools).length === 0) { setError("Binance is still connecting. Please retry once the header shows connected."); return; }
      setTurnActive(true);
      try {
        const answer = await runSimplePriceQuery(priceQuery, Object.keys(binanceTools), (tool, args) => client.request("mcpServer/tool/call", { threadId: client.threadId, server: "binance-agent-os", tool, arguments: args }));
        setHistory((v) => [...v, { role: "Second Opinion", text: answer }]); setActivities(["Binance price received"]);
      } catch (e) { setError(e instanceof Error ? e.message : "Binance price data is unavailable. Please retry."); setActivities(["Binance request failed"]); }
      finally { setTurnActive(false); }
      return;
    }
    if (!request) {
      if (status !== "connected" || !mode) { setError("Codex is still connecting. Please retry once ready."); return; }
      setTurnActive(true); setActivities(["Codex is responding"]);
      try {
        const started = await client.startChatTurn(text, "low");
        const id = started?.turn?.id;
        if (id) { setTurnId(String(id)); turnIdRef.current = String(id); }
      } catch (e) {
        setTurnActive(false); setError(e instanceof Error ? e.message : "Codex could not start the conversation turn.");
      }
      return;
    }
    if (status !== "connected" || !mode) { setError("Binance is still connecting. Please retry once ready."); return; }
    setTurnActive(true); setActivities(["Reading public Binance price", "Running full deterministic risk analysis"]);
    try {
      const result = await runDemoReview(text, Object.keys(binanceTools), async (tool, args) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try { return await Promise.race([
          client.request("mcpServer/tool/call", { threadId: client.threadId, server: "binance-agent-os", tool, arguments: args }),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Binance price request timed out. Please retry.")), 25000); }),
        ]); } finally { clearTimeout(timer); }
      });
      setReport(result); setActivities(["Public Binance price received", "Deterministic risk calculation complete", "Safer trade ready"]);
      setHistory(v => [...v, { role: "Second Opinion", text: result.verdict === "reject" ? "I would reject this trade. Review the risk and safer alternative below." : "Your trade review is ready below." }]);
    } catch (e) { setError(e instanceof Error ? e.message : "Public market data unavailable. Please retry."); setActivities(["Review stopped — retry public market data"]); }
    finally { setTurnActive(false); }
  };
  useInput((ch, key) => { if (key.ctrl && ch === "c") { client.shutdown(); exit(); return; } if (key.ctrl && ch.toLowerCase() === "o") { if (!approval && !tradingConfirm) { setSelectorOpen(true); setSelectedModeIndex(Math.max(0, MODE_OPTIONS.findIndex((option) => option.mode === mode))); } return; } if (saferAccepted && !previewConfirmed && !tradingConfirm && !selectorOpen) { if (ch.toLowerCase() === "y") { setPreviewConfirmed(true); return; } if (key.escape || ch.toLowerCase() === "n") { setSaferAccepted(false); return; } return; } if (tradingConfirm) { if (key.escape || ch.toLowerCase() === "n") { setTradingConfirm(false); return; } if (ch.toLowerCase() === "y") { setTradingConfirm(false); void activateMode("trading"); } return; } if (selectorOpen) { if (key.escape) { setSelectorOpen(false); return; } if (key.upArrow) { setSelectedModeIndex((v) => (v + MODE_OPTIONS.length - 1) % MODE_OPTIONS.length); return; } if (key.downArrow) { setSelectedModeIndex((v) => (v + 1) % MODE_OPTIONS.length); return; } if (/^[1-3]$/.test(ch)) { const index = Number(ch) - 1; setSelectedModeIndex(index); requestMode(MODE_OPTIONS[index].mode); return; } if (key.return) { requestMode(MODE_OPTIONS[selectedModeIndex].mode); } return; } if (key.escape) { if (turnActive && turnId) void client.interrupt(turnId); return; } if (key.return) { void submit(); return; } if (key.backspace || key.delete) { setInput((v) => v.slice(0, -1)); return; } if (approval && (ch.toLowerCase() === "y" || ch.toLowerCase() === "n")) { const accepted = ch.toLowerCase() === "y"; approval.respond(approvalResponse(approval.message, accepted)); setApproval(null); return; } if (!input && report?.saferAlternative && ch.toLowerCase() === "s") { setSaferAccepted(true); return; } if (ch && !key.ctrl && !key.meta) setInput((v) => v + ch); }, { isActive: isRawModeSupported && process.env.CI !== "1" });
  const display = useMemo(() => report ?? null, [report]); const calc = display?.calculations ?? {};
  return <Box flexDirection="column" padding={1} width="100%">
    <Box justifyContent="space-between"><Text color={yellow} bold>SECOND OPINION</Text><Text>Your AI should know when to push back.</Text></Box>
    <Box justifyContent="space-between" marginBottom={1}><Text>Codex: <Text color={status === "connected" ? "green" : "red"}>{status}</Text></Text><Text>Binance MCP: <Text color={binance.includes("connected") || binance.includes("oAuth") ? "green" : "yellow"}>{binance}</Text></Text><Text>Mode: <Text color={yellow}>{modeLabel(mode)}</Text> | Binance capability: <Text color={capability === "Unknown" ? "yellow" : "green"}>{capability}</Text></Text></Box>
    <Panel title="Conversation"><Text color="#9CA3AF">{history.slice(-3).map((x) => `${x.role}: ${x.text}`).join("\n") || "Ask Codex a question or enter a trade request."}</Text>{agentText && <Text><Text color={yellow}>Second Opinion: </Text>{agentText}</Text>}{error && <Text color="red">Error: {error}</Text>}</Panel>
    <Box><Box flexDirection="column" width="48%" marginRight={1}><Panel title="Activity">{(activities.length ? activities : ["Waiting for a request"]).map((x, i) => <Text key={`${x}-${i}`} color={i === activities.length - 1 ? yellow : "gray"}>{i === activities.length - 1 ? "◉ " : "✓ "}{x}</Text>)}</Panel><Panel title="Input"><Text color={yellow}>› </Text><Text>{input || "Type here; Enter submits"}</Text></Panel></Box><Box flexDirection="column" width="52%">{tradeRequested && <Panel title="Risk report" color={display?.riskLevel === "extreme" ? "red" : display?.riskLevel === "high" ? "yellow" : "green"}>{display ? <><Text color="yellow">{display.explanation}</Text>{line("Portfolio (stated)", display.portfolioEquity)}{line("Risk score", `${display.riskScore}/100 · ${display.riskLevel}`)}{line("Decision", display.verdict.toUpperCase())}{line("Symbol", display.symbol)}{line("Direction", display.direction)}{line("Market", display.marketType)}{line("Margin", calc.marginRequired ?? calc.margin)}{line("Leverage", calc.leverage)}{line("Notional", calc.notional)}{line("Stop distance", calc.stopDistancePercent)}{line("Max planned loss", calc.maximumPlannedLoss)}{line("Portfolio exposure", calc.portfolioExposurePercent)}{line("Funding", calc.fundingRatePercent)}{line("Timestamp", display.dataTimestamp)}{display.primaryReasons?.slice(0, 3).map((r: any) => <Text key={r.code} color={r.severity === "critical" ? "red" : "yellow"}>• {r.title ?? r.code}: {r.explanation ?? r.message}</Text>)}</> : <Text color="gray">Structured assessment will appear after analysis.</Text>}</Panel>}{display?.saferAlternative && <Panel title="Safer trade comparison" color="green"><Text>Original: {calc.marginRequired ?? "?"} margin · {calc.notional ?? "?"} notional · {display.calculations?.leverage ?? "?"}x</Text><Text>Safer: {display.saferAlternative.marginAmount} margin · {display.saferAlternative.notionalAmount} notional · {display.saferAlternative.leverage ?? 1}x</Text><Text>Stop: {display.saferAlternative.stopLoss ?? "—"}  Take profit: {display.saferAlternative.takeProfit ?? "—"}</Text><Text>Planned loss: original ${calc.maximumPlannedLoss} → safer ${display.saferAssessment?.calculations.maximumPlannedLoss?.toFixed(2)}</Text><Text>Safer risk: {display.saferAssessment?.score}/100 · {display.saferAssessment?.level}</Text><Text color={saferAccepted ? "green" : yellow}>{saferAccepted ? "Safer plan selected" : "Press S to review final confirmation"}</Text></Panel>}</Box></Box>
    {saferAccepted && display?.saferAlternative && <Panel title={previewConfirmed ? "CONFIRMED ORDER PREVIEW" : "FINAL CONFIRMATION"} color={previewConfirmed ? "green" : yellow}>
      <Text>{display.saferAlternative.side.toUpperCase()} {display.symbol} perpetual · Market entry</Text>
      <Text>Margin: ${display.saferAlternative.marginAmount} · Leverage: {display.saferAlternative.leverage}x · Notional: ${display.saferAlternative.notionalAmount}</Text>
      <Text>Stop: {display.saferAlternative.stopLoss} · Planned loss: ${display.saferAssessment?.calculations.maximumPlannedLoss?.toFixed(2)}</Text>
      <Text>Account access and exchange order filters are unverified. Preview only; no order will be sent.</Text>
      <Text>{previewConfirmed ? "Preview confirmed. No order submitted." : "Confirm the safer proposal and margin interpretation? Y Confirm preview · N Back"}</Text>
    </Panel>}
    {approval && <Panel title="APPROVAL REQUIRED" color="red"><Text color="red">Codex is requesting approval for: {approval.message.method}</Text><Text>{approvalDetail(approval.message)}</Text><Text color={yellow}>Y accept · N decline</Text></Panel>}
    {selectorOpen && <Panel title="Select operating mode"><Text color={selectedModeIndex === 0 ? yellow : undefined}>{selectedModeIndex === 0 ? "› " : "  "}1  Market Data    Public market information only</Text><Text color={selectedModeIndex === 1 ? yellow : undefined}>{selectedModeIndex === 1 ? "› " : "  "}2  Read Only      Market data, balances and positions</Text><Text color={selectedModeIndex === 2 ? yellow : undefined}>{selectedModeIndex === 2 ? "› " : "  "}3  Trading        Analysis and confirmed order execution</Text><Text>↑/↓ Navigate   Enter Select   Esc Cancel</Text></Panel>}
    {tradingConfirm && <Panel title="Enable Trading mode?" color="red"><Text>Second Opinion will be allowed to prepare real Binance orders.</Text><Text>Every order will still require separate explicit confirmation.</Text><Text></Text><Text color={yellow}>Y Enable Trading</Text><Text>N Cancel</Text></Panel>}
    <Text color="#9CA3AF">Enter submit · Esc cancel turn · Ctrl+O modes · /mode · S safer plan · Y/N approval · Ctrl-C exit</Text>
  </Box>;
}
