import { describe, expect, it, vi } from "vitest";
import { AppServerClient, isInitializeResponse, normalizeEvent, RISK_OUTPUT_SCHEMA } from "@/tui/protocol";

describe("Codex App Server TUI protocol", () => {
  it("normalizes safe agent and MCP activity without reasoning text", () => {
    expect(normalizeEvent({ method: "item/started", params: { item: { type: "agentMessage", id: "message-2" } } })).toEqual({ kind: "agent-start" });
    expect(normalizeEvent({ method: "item/agentMessage/delta", params: { delta: "hello" } })).toEqual({ kind: "agent", text: "hello" });
    expect(normalizeEvent({ method: "item/started", params: { item: { type: "mcpToolCall", server: "binance-agent-os", tool: "futures_usds.markPrice", status: "inProgress" } } })).toEqual({ kind: "mcp", server: "binance-agent-os", tool: "futures_usds.markPrice", status: "inProgress" });
    expect(normalizeEvent({ method: "item/reasoning/textDelta", params: { delta: "private" } })).toBeNull();
  });

  it("requires structured risk fields and bounded score", () => {
    expect(RISK_OUTPUT_SCHEMA.required).toContain("confirmationRequired");
    expect(RISK_OUTPUT_SCHEMA.properties.riskScore.minimum).toBe(0);
    expect(RISK_OUTPUT_SCHEMA.properties.riskScore.maximum).toBe(100);
  });

  it("uses recursively strict object schemas accepted by structured outputs", () => {
    const visit = (schema: unknown): void => {
      if (!schema || typeof schema !== "object") return;
      const node = schema as { type?: string | string[]; additionalProperties?: boolean; required?: string[]; properties?: Record<string, unknown>; items?: unknown };
      if (node.type === "object" || Array.isArray(node.type) && node.type.includes("object")) {
        expect(node.additionalProperties).toBe(false);
        expect(new Set(node.required)).toEqual(new Set(Object.keys(node.properties ?? {})));
      }
      Object.values(node.properties ?? {}).forEach(visit);
      if (node.items) visit(node.items);
    };

    visit(RISK_OUTPUT_SCHEMA);
  });

  it("accepts the documented App Server initialize response without assuming user-agent contents", () => {
    expect(isInitializeResponse({
      userAgent: "second-opinion-tui/0.1.0",
      codexHome: String.raw`C:\Users\trader\.codex`,
      platformFamily: "windows",
      platformOs: "windows",
    })).toBe(true);
    expect(isInitializeResponse({ userAgent: "client-name-only" })).toBe(false);
  });

  it("starts ordinary chat without forcing the trading skill or a JSON schema", async () => {
    const client = new AppServerClient(process.cwd());
    client.threadId = "thread-1";
    const request = vi.spyOn(client, "request").mockResolvedValue({ turn: { id: "turn-1" } });

    await client.startChatTurn("check my spot balance");

    expect(request).toHaveBeenCalledWith("turn/start", {
      threadId: "thread-1",
      cwd: expect.any(String),
      input: [{ type: "text", text: "check my spot balance", text_elements: [] }],
    });
    expect(request.mock.calls[0][1]).not.toHaveProperty("outputSchema");
  });
});
