import { NextRequest, NextResponse } from "next/server";
import {
  setExecutionMode, getExecutionMode,
  getSystemHealth, getRecentReceipts,
  injectFault, processEvent, startSyntheticEventLoop,
  stopSyntheticEventLoop, getForensicReport,
} from "@/lib/autonomous-runtime";
import { getNetworkSnapshot } from "@/lib/network-snapshot";
import { getRouteScores } from "@/lib/action-engine";
import { getRules, updateRule, getCircuitBreaker } from "@/lib/policy-engine";
import { readReceipts } from "@/lib/evidence-engine";
import type { ExecutionMode, FaultType } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") ?? "status";

  switch (action) {
    case "status": {
      const [health, network, receipts] = await Promise.all([
        Promise.resolve(getSystemHealth()),
        getNetworkSnapshot(),
        Promise.resolve(getRecentReceipts(20)),
      ]);
      return NextResponse.json({
        mode: getExecutionMode(),
        health,
        network,
        receipts,
        routeScores: getRouteScores(),
        circuitBreaker: getCircuitBreaker(),
        rules: getRules(),
      });
    }

    case "receipts": {
      const limit = parseInt(searchParams.get("limit") ?? "50");
      const receipts = await readReceipts(limit);
      return NextResponse.json({ receipts });
    }

    case "network": {
      const network = await getNetworkSnapshot();
      return NextResponse.json(network);
    }

    case "forensic": {
      const id = searchParams.get("id");
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const report = getForensicReport(id);
      if (!report) return NextResponse.json({ error: "not found" }, { status: 404 });
      return NextResponse.json({ report });
    }

    case "routes": {
      return NextResponse.json({ routes: getRouteScores() });
    }

    default:
      return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = String(body.action ?? "");

  switch (action) {
    case "set_mode": {
      const mode = body.mode as ExecutionMode;
      if (!["observe", "shadow", "live"].includes(mode)) {
        return NextResponse.json({ error: "invalid mode" }, { status: 400 });
      }
      setExecutionMode(mode);
      if (mode !== "observe") {
        startSyntheticEventLoop();
      } else {
        stopSyntheticEventLoop();
      }
      return NextResponse.json({ ok: true, mode });
    }

    case "inject_fault": {
      const faultType = body.faultType as FaultType;
      const validFaults: FaultType[] = [
        "expired_blockhash", "low_tip", "zero_tip",
        "rpc_failure", "stream_disconnect", "rate_limit", "simulation_failure",
      ];
      if (!validFaults.includes(faultType)) {
        return NextResponse.json({ error: "invalid fault type" }, { status: 400 });
      }
      try {
        const receipt = await injectFault(faultType);
        return NextResponse.json({ ok: true, receipt });
      } catch (err) {
        return NextResponse.json({
          error: err instanceof Error ? err.message : String(err),
        }, { status: 500 });
      }
    }

    case "update_rule": {
      const rule = body.rule as Parameters<typeof updateRule>[0];
      if (!rule?.id) return NextResponse.json({ error: "rule.id required" }, { status: 400 });
      updateRule(rule);
      return NextResponse.json({ ok: true, rules: getRules() });
    }

    case "start_events": {
      const interval = typeof body.intervalMs === "number" ? body.intervalMs : 8000;
      startSyntheticEventLoop(interval);
      return NextResponse.json({ ok: true });
    }

    case "stop_events": {
      stopSyntheticEventLoop();
      return NextResponse.json({ ok: true });
    }

    default:
      return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }
}
