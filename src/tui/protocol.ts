/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-expressions */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import readline from "node:readline";
import { appServerStartupError, normalizeRepositoryCwd, resolveCodexLaunch, type CodexLaunch } from "./launcher";

export type JsonRpcMessage = { id?: string | number; method?: string; params?: any; result?: any; error?: { code?: number; message?: string; data?: unknown } };
export type NormalizedEvent =
  | { kind: "agent-start"; id: string; phase: "commentary" | "final_answer" | null }
  | { kind: "agent"; id: string; text: string }
  | { kind: "agent-complete"; id: string; phase: "commentary" | "final_answer" | null; text: string }
  | { kind: "activity"; label: string }
  | { kind: "turn"; status: string }
  | { kind: "mcp"; id?: string; server: string; tool: string; status?: string; arguments?: unknown; readOnlyHint?: boolean | null }
  | { kind: "error"; message: string };

export function isInitializeResponse(value: unknown): value is { userAgent: string; platformFamily: string; platformOs: string } {
  if (!value || typeof value !== "object") return false;
  const response = value as Record<string, unknown>;
  return typeof response.userAgent === "string"
    && typeof response.platformFamily === "string"
    && typeof response.platformOs === "string";
}

export const RISK_OUTPUT_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["verdict", "riskScore", "riskLevel", "symbol", "direction", "marketType", "calculations", "primaryReasons", "saferAlternative", "dataTimestamp", "executionLabel", "confirmationRequired", "explanation"],
  properties: {
    verdict: { type: "string", enum: ["proceed", "caution", "reduce", "reject"] },
    riskScore: { type: "number", minimum: 0, maximum: 100 }, riskLevel: { type: "string", enum: ["low", "moderate", "high", "extreme"] },
    symbol: { type: "string" }, direction: { type: "string" }, marketType: { type: "string", enum: ["spot", "perpetual"] },
    calculations: {
      type: "object", additionalProperties: false,
      required: ["notional", "marginRequired", "leverage", "portfolioExposurePercent", "maximumPlannedLoss", "maximumPlannedLossPercent", "stopDistancePercent", "riskRewardRatio", "estimatedLiquidationPrice", "spreadBps", "realizedVolatilityPercent", "fundingRatePercent"],
      properties: {
        notional: { type: ["number", "null"] }, marginRequired: { type: ["number", "null"] }, leverage: { type: ["number", "null"] },
        portfolioExposurePercent: { type: ["number", "null"] }, maximumPlannedLoss: { type: ["number", "null"] }, maximumPlannedLossPercent: { type: ["number", "null"] },
        stopDistancePercent: { type: ["number", "null"] }, riskRewardRatio: { type: ["number", "null"] }, estimatedLiquidationPrice: { type: ["number", "null"] },
        spreadBps: { type: ["number", "null"] }, realizedVolatilityPercent: { type: ["number", "null"] }, fundingRatePercent: { type: ["number", "null"] },
      },
    },
    primaryReasons: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["code", "severity", "title", "explanation", "message", "metric", "value"],
        properties: {
          code: { type: "string" }, severity: { type: "string", enum: ["info", "warning", "critical"] },
          title: { type: "string" }, explanation: { type: "string" }, message: { type: "string" },
          metric: { type: ["string", "null"] }, value: { type: ["number", "null"] },
        },
      },
    },
    saferAlternative: {
      type: ["object", "null"], additionalProperties: false,
      required: ["symbol", "marketType", "side", "marginAmount", "notionalAmount", "leverage", "entryType", "limitPrice", "stopLoss", "takeProfit"],
      properties: {
        symbol: { type: "string" }, marketType: { type: "string", enum: ["spot", "perpetual"] },
        side: { type: "string", enum: ["buy", "sell", "long", "short"] },
        marginAmount: { type: ["number", "null"] }, notionalAmount: { type: ["number", "null"] }, leverage: { type: ["number", "null"] },
        entryType: { type: "string", enum: ["market", "limit"] }, limitPrice: { type: ["number", "null"] },
        stopLoss: { type: ["number", "null"] }, takeProfit: { type: ["number", "null"] },
      },
    },
    dataTimestamp: { type: "string" }, executionLabel: { type: "string" }, confirmationRequired: { type: "boolean" },
    explanation: { type: "string" },
  },
} as const;

export function normalizeEvent(message: JsonRpcMessage): NormalizedEvent | null {
  const p = message.params ?? {};
  switch (message.method) {
    case "item/agentMessage/delta": return { kind: "agent", id: String(p.itemId ?? ""), text: String(p.delta ?? "") };
    case "turn/started": return { kind: "turn", status: "inProgress" };
    case "turn/completed": return { kind: "turn", status: String(p.turn?.status ?? "completed") };
    case "item/started": {
      const item = p.item ?? {};
      if (item.type === "agentMessage") return { kind: "agent-start", id: String(item.id ?? ""), phase: item.phase ?? null };
      if (item.type === "mcpToolCall") return { kind: "mcp", id: item.id, server: item.server, tool: item.tool, status: item.status, arguments: item.arguments, readOnlyHint: item.readOnlyHint };
      if (item.type === "commandExecution") return { kind: "activity", label: "Running a project command" };
      return null;
    }
    case "item/completed": {
      const item = p.item ?? {};
      if (item.type === "agentMessage") return { kind: "agent-complete", id: String(item.id ?? ""), phase: item.phase ?? null, text: String(item.text ?? "") };
      if (item.type === "mcpToolCall") return { kind: "mcp", id: item.id, server: item.server, tool: item.tool, status: item.status, arguments: item.arguments, readOnlyHint: item.readOnlyHint };
      return null;
    }
    case "mcpServer/startupStatus/updated": return { kind: "activity", label: "Updating Binance MCP status" };
    case "error": return { kind: "error", message: String(p.error?.message ?? p.message ?? "Codex App Server error") };
    default: return null;
  }
}

export class AppServerClient {
  private proc?: ChildProcessWithoutNullStreams;
  private nextId = 1;
  private pending = new Map<string | number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  private lineReader?: readline.Interface;
  private eventHandler?: (message: JsonRpcMessage) => void;
  private requestHandler?: (message: JsonRpcMessage, respond: (value: unknown) => void) => void;
  private readonly cwd: string;
  threadId?: string;

  constructor(cwd = process.cwd()) { this.cwd = normalizeRepositoryCwd(cwd); }

  onMessage(handler: (message: JsonRpcMessage) => void) { this.eventHandler = handler; }
  onServerRequest(handler: (message: JsonRpcMessage, respond: (value: unknown) => void) => void) { this.requestHandler = handler; }

  async start(): Promise<any> {
    let launch: CodexLaunch | undefined;
    try {
      launch = await resolveCodexLaunch();
    } catch (error) {
      throw appServerStartupError(error, this.cwd, launch);
    }

    return new Promise((resolve, reject) => {
      try {
        this.proc = spawn(launch.command, launch.args, {
          cwd: this.cwd,
          stdio: ["pipe", "pipe", "pipe"],
          windowsHide: true,
          windowsVerbatimArguments: launch.windowsVerbatimArguments,
        });
      } catch (error) { reject(appServerStartupError(error, this.cwd, launch)); return; }
      this.proc.once("error", (error) => reject(appServerStartupError(error, this.cwd, launch)));
      // Transient background warnings are written to stderr even while JSON-RPC
      // remains healthy. Drain the pipe without presenting those as fatal errors.
      this.proc.stderr.on("data", () => {});
      this.proc.once("exit", (code, signal) => {
        if (code && code !== 0) this.eventHandler?.({ method: "error", params: { message: `Codex App Server exited unexpectedly (${signal ?? `code ${code}`}).` } });
      });
      this.lineReader = readline.createInterface({ input: this.proc.stdout });
      this.lineReader.on("line", (line) => this.receive(line));
      this.request("initialize", { clientInfo: { name: "second-opinion-tui", title: "Second Opinion", version: "0.1.0" }, capabilities: null }).then((v) => {
        if (!isInitializeResponse(v)) {
          const fields = v && typeof v === "object" ? Object.keys(v).join(", ") : "none";
          throw new Error(`Invalid Codex App Server initialize response (response fields: ${fields})`);
        }
        this.notify("initialized"); resolve(v);
      }).catch((error) => reject(appServerStartupError(error, this.cwd, launch)));
    });
  }

  private receive(line: string) {
    let message: JsonRpcMessage; try { message = JSON.parse(line); } catch { return; }
    if (message.id !== undefined && (message.result !== undefined || message.error !== undefined)) {
      const item = this.pending.get(message.id); if (!item) return; this.pending.delete(message.id);
      message.error ? item.reject(new Error(message.error.message ?? "JSON-RPC error")) : item.resolve(message.result); return;
    }
    if (message.id !== undefined && message.method && this.requestHandler) {
      this.requestHandler(message, (value) => this.respond(message.id!, value)); return;
    }
    this.eventHandler?.(message);
  }

  private respond(id: string | number, result: unknown) { this.write({ id, result }); }
  private write(message: JsonRpcMessage) { if (!this.proc?.stdin.writable) throw new Error("App Server is not running"); this.proc.stdin.write(`${JSON.stringify(message)}\n`); }
  notify(method: string, params?: unknown) { this.write({ method, ...(params === undefined ? {} : { params }) }); }
  request(method: string, params?: unknown): Promise<any> { const id = this.nextId++; return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.write({ id, method, params }); }); }

  async startThread(config?: Record<string, unknown>, developerInstructions?: string): Promise<string> {
    const r = await this.request("thread/start", { cwd: this.cwd, approvalPolicy: "on-request", sandbox: "workspace-write", personality: "friendly", serviceName: "second-opinion-tui", config, developerInstructions });
    const id = String(r.thread?.id ?? ""); if (!id) throw new Error("Codex App Server did not return a thread id"); this.threadId = id; return id;
  }
  async resumeThread(threadId: string, config?: Record<string, unknown>, developerInstructions?: string) { const r = await this.request("thread/resume", { threadId, cwd: this.cwd, config, developerInstructions }); const id = String(r.thread?.id ?? threadId); this.threadId = id; return id; }
  async configureThread(config: Record<string, unknown>, developerInstructions: string) {
    return this.startThread(config, developerInstructions);
  }
  async mcpStatus() { return this.request("mcpServerStatus/list", { cursor: null, limit: 50, detail: "toolsAndAuthOnly", threadId: this.threadId ?? null }); }
  async mcpOauthLogin(name: string) { return this.request("mcpServer/oauth/login", { name, threadId: this.threadId ?? null }); }
  async startRiskTurn(text: string) {
    if (!this.threadId) await this.startThread();
    return this.request("turn/start", { threadId: this.threadId, cwd: this.cwd, input: [{ type: "text", text, text_elements: [] }], effort: "high", outputSchema: RISK_OUTPUT_SCHEMA });
  }
  async startChatTurn(text: string, effort: "low" | "medium" = "low") {
    if (!this.threadId) await this.startThread();
    return this.request("turn/start", {
      threadId: this.threadId,
      cwd: this.cwd,
      input: [{ type: "text", text, text_elements: [] }],
      effort,
    });
  }
  interrupt(turnId: string) { return this.request("turn/interrupt", { threadId: this.threadId, turnId }); }
  shutdown() { this.lineReader?.close(); this.proc?.kill(); for (const p of this.pending.values()) p.reject(new Error("App Server stopped")); this.pending.clear(); }
}
