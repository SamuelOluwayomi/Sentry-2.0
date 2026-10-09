import { NextResponse } from "next/server";
export const runtime = "nodejs";

export async function GET() {
  try {
    const { checkRpcConsistency } = await import("../../../lib/rpc-consistency");
    const report = await checkRpcConsistency();
    return NextResponse.json(report, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
