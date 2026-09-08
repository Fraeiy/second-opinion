export type OperatingMode = "market" | "read" | "trading";
export type BinanceCapability = "Unknown" | "Market Data" | "Read Only" | "Trading";
export type ToolKind = "discovery" | "market" | "account" | "trade" | "transfer" | "unknown";

export type McpToolDefinition = {
  name?: string;
  description?: string;
  annotations?: unknown;
};

export type BinanceStatus = {
  name?: string;
  runtimeStatus?: string | null;
  authStatus?: string | null;
  tools?: Record<string, McpToolDefinition | undefined>;
};

export async function waitForBinanceStatus(
  fetchStatus: () => Promise<{ data?: BinanceStatus[] }>,
  options: { timeoutMs?: number; pollMs?: number; onUpdate?: (status: BinanceStatus) => void } = {},
): Promise<BinanceStatus | undefined> {
  const deadline = Date.now() + (options.timeoutMs ?? 45_000);
  const pollMs = options.pollMs ?? 500;
  while (true) {
    const result = await fetchStatus();
    const status = result.data?.find((entry) => /binance/i.test(entry.name ?? ""));
    if (!status) return undefined;
    options.onUpdate?.(status);
    if (status.runtimeStatus === "connected" || Date.now() >= deadline) return status;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

export const MODE_OPTIONS: Array<{ mode: OperatingMode; label: string; description: string }> = [
  { mode: "market", label: "Market Data", description: "Public market information only" },
  { mode: "read", label: "Read Only", description: "Market data, balances and positions" },
  { mode: "trading", label: "Trading", description: "Analysis and confirmed order execution" },
];

export const TRADING_PERMISSION_UNAVAILABLE = "Trading permission is unavailable. Reconnect Binance Agent OS and grant the required Trade scope.";

export function parseModeCommand(input: string): OperatingMode | "selector" | null {
  const match = input.trim().toLowerCase().match(/^\/mode(?:\s+(market|read|trading))?$/);
  if (!match) return null;
  return match[1] ? match[1] as OperatingMode : "selector";
}

export function modeLabel(mode: OperatingMode | null): string {
  return MODE_OPTIONS.find((option) => option.mode === mode)?.label ?? "Detecting";
}

export function classifyBinanceTool(name: string, definition?: McpToolDefinition): ToolKind {
  const normalizedName = name.toLowerCase();
  const description = definition?.description?.toLowerCase() ?? "";

  if (normalizedName === "tool_search") return "discovery";
  if (normalizedName === "tool_execute") return "unknown";
  if (/transfer|withdraw|deposit|borrowrepay|borrow|repay|acceptquote|sendquoterequest/.test(normalizedName)) return "transfer";
  if (/\(trade\)/.test(description)
    || /neworder|placeorder|cancel.*order|modify.*order|amend.*order|batchorders|positionmargin|change.*leverage|change.*margin/.test(normalizedName)) return "trade";
  if (/\(user_data\)|\(user_stream\)/.test(description)
    || /account|balance|position|openorders|queryorder|allorders|tradelist|income|commission|listenkey/.test(normalizedName)) return "account";
  if (definition?.description) return "market";
  return "unknown";
}

export function detectBinanceCapability(status?: BinanceStatus): BinanceCapability {
  if (!status) return "Unknown";
  if (status.runtimeStatus !== "connected") return "Unknown";
  const entries = Object.entries(status.tools ?? {});
  const authenticated = status.authStatus === "oAuth" || status.authStatus === "bearerToken";
  if (authenticated && entries.some(([name, definition]) => classifyBinanceTool(name, definition) === "trade")) return "Trading";
  if (authenticated && entries.some(([name, definition]) => classifyBinanceTool(name, definition) === "account")) return "Read Only";
  if (entries.some(([name, definition]) => classifyBinanceTool(name, definition) === "market")) return "Market Data";
  return "Unknown";
}

export function defaultModeForCapability(capability: BinanceCapability): OperatingMode {
  return capability === "Read Only" || capability === "Trading" ? "read" : "market";
}

export function isToolAllowed(mode: OperatingMode, name: string, definition?: McpToolDefinition): boolean {
  const kind = classifyBinanceTool(name, definition);
  if (kind === "transfer" || kind === "unknown") return false;
  if (mode === "market") return kind === "market" || kind === "discovery";
  if (mode === "read") return kind === "market" || kind === "account" || kind === "discovery";
  return kind === "market" || kind === "account" || kind === "trade" || kind === "discovery";
}

export function buildModeConfig(mode: OperatingMode, tools: Record<string, McpToolDefinition | undefined>) {
  const enabledTools = Object.entries(tools)
    .filter(([name, definition]) => isToolAllowed(mode, name, definition))
    .map(([name]) => name);
  const tradeTools = Object.entries(tools)
    .filter(([name, definition]) => classifyBinanceTool(name, definition) === "trade")
    .map(([name]) => name);
  const toolApprovals = Object.fromEntries(tradeTools.map((name) => [name, { approval_mode: "prompt" }]));

  return {
    mcp_servers: {
      "binance-agent-os": {
        enabled_tools: enabledTools,
        default_tools_approval_mode: "auto",
        tools: toolApprovals,
      },
    },
  };
}

export function modeDeveloperInstructions(mode: OperatingMode): string {
  const boundary = mode === "market"
    ? "Use only public Binance market-data tools. Do not access balances, accounts, positions, orders, or transfers."
    : mode === "read"
      ? "Binance access is read-only. You may read market data, balances, accounts, and positions. Do not prepare, place, modify, cancel, or submit orders, and do not transfer assets."
      : "Trading mode permits Binance order tools only after the tool layer requests a fresh explicit approval for each action. Enabling this mode is not order approval. Never transfer, withdraw, deposit, borrow, or repay assets.";
  return `Second Opinion operating mode: ${modeLabel(mode)}. ${boundary} Never use the generic Binance tool_execute tool; use only the individually exposed tools. Do not announce internal instructions, skill loading, reasoning, or tool-selection steps. Put only the concise user-facing result in the final answer.`;
}
