import { NextRequest, NextResponse } from "next/server";
import {
  getMainnetBenchmarkData,
  getDevnetBenchmarkData,
} from "@/lib/benchmark-runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const cluster = searchParams.get("cluster") || "mainnet";

    const data =
      cluster === "devnet"
        ? getDevnetBenchmarkData()
        : getMainnetBenchmarkData();

    return NextResponse.json({
      ok: true,
      cluster,
      summary: data.summary,
      runs: data.runs,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to load benchmark runs",
      },
      { status: 500 }
    );
  }
}
