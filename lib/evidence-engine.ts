// Sentry 2.0 -- Evidence Engine
// Every execution gets a structured, auditable receipt.
// "Why did Sentry do this?" -- answerable from every receipt.

import { appendFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  ExecutionReceipt, SentryEvent, NetworkSnapshot,
  PolicyEvaluation, TipRecommendation, AiRecommendation,
  ActionResult, LifecycleEvent, FailureAnalysis, ExecutionMode,
  LifecycleStage,
} from "./types";

const RECEIPTS_PATH = path.join(process.cwd(), "logs", "execution_receipts.jsonl");

export function createReceipt(params: {
  mode: ExecutionMode;
  trigger: SentryEvent;
  networkSnapshot: NetworkSnapshot;
  policyEvaluation: PolicyEvaluation;
  tipRecommendation: TipRecommendation;
  aiRecommendation?: AiRecommendation;
}): ExecutionReceipt {
  return {
    executionId: randomUUID(),
    mode: params.mode,
    startedAt: new Date().toISOString(),
    trigger: params.trigger,
    networkSnapshot: params.networkSnapshot,
    policyEvaluation: params.policyEvaluation,
    tipRecommendation: params.tipRecommendation,
    aiRecommendation: params.aiRecommendation,
    lifecycle: [],
    currentStage: params.policyEvaluation.decision === "blocked" ? "blocked" : "pending",
    retries: [],
    finalStatus: params.policyEvaluation.decision === "blocked" ? "blocked" :
                 params.policyEvaluation.decision === "shadow" ? "shadow" : "pending",
  };
}

export function advanceLifecycle(
  receipt: ExecutionReceipt,
  stage: LifecycleStage,
  source: "yellowstone" | "rpc" | "timeout",
  slot?: number,
): ExecutionReceipt {
  const event: LifecycleEvent = {
    stage,
    timestamp: new Date().toISOString(),
    source,
    slot,
  };
  receipt.lifecycle.push(event);
  receipt.currentStage = stage;

  if (stage === "finalized" || stage === "confirmed") {
    receipt.finalStatus = stage;
    receipt.completedAt = new Date().toISOString();
    receipt.durationMs = new Date(receipt.completedAt).getTime() -
                         new Date(receipt.startedAt).getTime();
  } else if (stage === "failed") {
    receipt.finalStatus = "failed";
    receipt.completedAt = new Date().toISOString();
    receipt.durationMs = new Date(receipt.completedAt).getTime() -
                         new Date(receipt.startedAt).getTime();
  }

  return receipt;
}

export function attachAction(receipt: ExecutionReceipt, action: ActionResult): ExecutionReceipt {
  receipt.actionResult = action;
  receipt.signature = action.signature;
  receipt.explorerUrl = `https://solscan.io/tx/${action.signature}`;
  receipt.totalTipLamports = action.tipLamports;
  receipt.costSol = action.tipLamports / 1e9;
  return receipt;
}

export function attachFailure(receipt: ExecutionReceipt, failure: FailureAnalysis): ExecutionReceipt {
  receipt.failureAnalysis = failure;
  return receipt;
}

export async function persistReceipt(receipt: ExecutionReceipt): Promise<void> {
  try {
    await appendFile(RECEIPTS_PATH, JSON.stringify(receipt) + "\n", "utf8");
  } catch {
    // Non-fatal: log unavailable
  }
}

export async function readReceipts(limit = 50): Promise<ExecutionReceipt[]> {
  try {
    if (!existsSync(RECEIPTS_PATH)) return [];
    const text = await readFile(RECEIPTS_PATH, "utf8");
    const lines = text.trim().split("\n").filter(Boolean);
    return lines
      .slice(-limit)
      .map(l => {
        try { return JSON.parse(l) as ExecutionReceipt; } catch { return null; }
      })
      .filter((r): r is ExecutionReceipt => r !== null)
      .reverse();
  } catch {
    return [];
  }
}

/** Build a human-readable forensic report for an execution. */
export function buildForensicReport(receipt: ExecutionReceipt): string {
  const lines: string[] = [];
  const net = receipt.networkSnapshot;
  const pol = receipt.policyEvaluation;
  const evt = receipt.trigger;

  lines.push(`# Sentry Execution Report`);
  lines.push(`**Execution ID:** ${receipt.executionId}`);
  lines.push(`**Mode:** ${receipt.mode.toUpperCase()}`);
  lines.push(`**Status:** ${receipt.finalStatus.toUpperCase()}`);
  lines.push(`**Duration:** ${receipt.durationMs ?? "--"}ms`);
  lines.push(``);

  lines.push(`## Trigger`);
  lines.push(`- Source: ${evt.source.toUpperCase()}`);
  lines.push(`- Type: ${evt.type}`);
  lines.push(`- Slot: ${evt.slot}`);
  if (evt.decoded.description) lines.push(`- Event: ${evt.decoded.description}`);
  if (evt.decoded.liquidityDeltaUsd) lines.push(`- Liquidity Delta: $${evt.decoded.liquidityDeltaUsd.toLocaleString()}`);
  lines.push(``);

  lines.push(`## Network State`);
  lines.push(`- Slot: ${net.slot}`);
  lines.push(`- Regime: ${net.regime.toUpperCase()}`);
  lines.push(`- Congestion: ${net.congestionScore ?? "--"}/100`);
  lines.push(`- Tip p50: ${net.tipP50.toLocaleString()} lamports`);
  lines.push(`- Tip p75: ${net.tipP75.toLocaleString()} lamports`);
  lines.push(`- Tip p95: ${net.tipP95.toLocaleString()} lamports`);
  lines.push(`- Tip EMA: ${net.tipEma?.toLocaleString() ?? "--"} lamports`);
  lines.push(`- Tip Trend: ${net.tipTrend ?? "--"}`);
  if (net.slotsToLeader !== undefined) lines.push(`- Slots to Leader: ${net.slotsToLeader}`);
  lines.push(``);

  lines.push(`## Policy Evaluation`);
  lines.push(`- Decision: ${pol.decision.toUpperCase()}`);
  if (pol.blockReason) lines.push(`- Block Reason: ${pol.blockReason}`);
  lines.push(`- Opportunity Score: ${pol.opportunityScore}/100`);
  lines.push(`- Recommended Tip: ${pol.recommendedTip.toLocaleString()} lamports`);
  lines.push(`- Recommended Route: ${pol.recommendedRoute.toUpperCase()}`);
  if (pol.passedChecks.length > 0) {
    lines.push(`- Passed: ${pol.passedChecks.join(", ")}`);
  }
  if (pol.failedChecks.length > 0) {
    lines.push(`- Failed: ${pol.failedChecks.join(", ")}`);
  }
  lines.push(``);

  if (receipt.aiRecommendation) {
    const ai = receipt.aiRecommendation;
    lines.push(`## AI Operator`);
    lines.push(`- Action: ${ai.action.toUpperCase()}`);
    lines.push(`- Confidence: ${Math.round(ai.confidence * 100)}%`);
    lines.push(`- Reasoning: ${ai.reasoning}`);
    if (ai.postmortem) lines.push(`- Postmortem: ${ai.postmortem}`);
    lines.push(``);
  }

  if (receipt.actionResult) {
    const a = receipt.actionResult;
    lines.push(`## Action`);
    lines.push(`- Route: ${a.route.toUpperCase()}`);
    lines.push(`- Tip: ${a.tipLamports.toLocaleString()} lamports`);
    lines.push(`- Simulation: ${a.simulationPassed ? "PASSED" : "FAILED"}`);
    if (a.simulationError) lines.push(`- Simulation Error: ${a.simulationError}`);
    lines.push(`- Signature: ${a.signature}`);
    if (receipt.explorerUrl) lines.push(`- Explorer: ${receipt.explorerUrl}`);
    lines.push(``);
  }

  lines.push(`## Lifecycle`);
  for (const lc of receipt.lifecycle) {
    lines.push(`- ${lc.stage.toUpperCase()} at ${lc.timestamp} via ${lc.source}${lc.slot ? ` (slot ${lc.slot})` : ""}`);
  }
  lines.push(``);

  if (receipt.failureAnalysis) {
    const fa = receipt.failureAnalysis;
    lines.push(`## Failure Analysis`);
    lines.push(`- Class: ${fa.class}`);
    lines.push(`- Recovery: ${fa.recovery}`);
    lines.push(`- Retryable: ${fa.retryable}`);
    lines.push(`- Retries: ${fa.retriesAttempted}`);
    lines.push(`- Description: ${fa.description}`);
    lines.push(``);
  }

  if (receipt.retries.length > 0) {
    lines.push(`## Retries`);
    receipt.retries.forEach((r, i) => {
      lines.push(`- Retry ${i + 1}: Route=${r.route}, Tip=${r.tipLamports.toLocaleString()}, Sig=${r.signature.slice(0, 16)}...`);
    });
    lines.push(``);
  }

  if (receipt.costSol !== undefined) {
    lines.push(`## Economics`);
    lines.push(`- Total Tip: ${receipt.totalTipLamports?.toLocaleString() ?? "--"} lamports`);
    lines.push(`- Cost: ${receipt.costSol.toFixed(6)} SOL`);
  }

  return lines.join("\n");
}
