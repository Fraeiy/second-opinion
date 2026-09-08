import { NextResponse } from "next/server";
import { z } from "zod";
import { getBinanceAdapter } from "@/lib/binance/adapter";
import { clientKeyFromRequest, rateLimit } from "@/lib/rate-limit";
import { TradeIntentSchema } from "@/lib/trade-intent";

export const runtime = "nodejs";

const ExecuteSchema = z.object({
  intent: TradeIntentSchema,
  confirmationToken: z.string().min(10),
  acknowledged: z.literal(true),
  mode: z.literal("demo").default("demo"),
});

export async function POST(req: Request) {
  const limited = rateLimit(`execute:${clientKeyFromRequest(req)}`, {
    limit: 10,
    windowMs: 60_000,
  });
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded", retryAfterSec: limited.retryAfterSec },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = ExecuteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          "Execution requires a valid intent, confirmation token, and acknowledged=true. The original chat message is never enough.",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const adapter = getBinanceAdapter();
  const result = await adapter.submitOrder(
    parsed.data.intent,
    parsed.data.confirmationToken,
    {
      mode: parsed.data.mode,
      acknowledged: parsed.data.acknowledged,
    },
  );

  return NextResponse.json({
    result,
    connection: adapter.getStatus(parsed.data.mode),
  });
}
