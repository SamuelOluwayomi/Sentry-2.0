import { NextResponse } from "next/server";
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const state = await req.json() as import("../../../lib/tip-engine").NetworkState;
    const { decideTip } = await import("../../../lib/tip-engine");
    const decision = await decideTip(state);
    return NextResponse.json(decision);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
