import { NextResponse } from "next/server";
import { getBinanceAdapter } from "@/lib/binance/adapter";
export function GET() { return NextResponse.json(getBinanceAdapter().getStatus("demo")); }
