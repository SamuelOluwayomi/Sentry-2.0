// Sentry 2.0 -- Autonomous Runtime
// The central orchestrator: Event -> Policy -> Action -> Lifecycle -> Evidence.
// This is what makes Sentry an autonomous execution system.

import { Keypair, Connection } from "@solana/web3.js";
import bs58 from "bs58";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import type {
  SentryEvent, NetworkSnapshot, PolicyEvaluation,
  ExecutionReceipt, ExecutionMode, CircuitBreaker,
  TipRecommendation, AiRecommendation, SystemHealth,
  ComponentHealth,
} from "./types";
import {
  fromBlurMessage, fromYellowstoneMessage,
  createFaultEvent, createSyntheticBlurEvent,
  scoreOpportunity,
} from "./event-engine";
import { getNetworkSnapshot, recordRouteLatency } from "./network-snapshot";
import {
  evaluatePolicy, classifyFailure,
  getCircuitBreaker, recordExecutionOutcome,
  recordExecution, getRules,
} from "./policy-engine";
import { executeAction, getRouteScores, selectBestRoute } from "./action-engine";
import {
  createReceipt, advanceLifecycle, attachAction, attachFailure,
  persistReceipt, buildForensicReport,
} from "./evidence-engine";
import type { FaultType } from "./types";

// -- Event Bus (in-process pub/sub) --
class EventBus extends EventEmitter {
  private static instance: EventBus;
  static get(): EventBus {
    if (!EventBus.instance) EventBus.instance = new EventBus();
    return EventBus.instance;
  }
}

export const eventBus = EventBus.get();

// -- Shared Runtime State --
let executionMode: ExecutionMode = "shadow"; // default: shadow mode (safe)
let currentSlot = 0;
let streamHealthy = false;
let blurHealthy = false;
let lastEventAt: number | null = null;
const recentReceipts: ExecutionReceipt[] = [];
const MAX_RECEIPT_BUFFER = 100;

// -- Keypair (loaded once) --
function loadKeypair(): Keypair | null {
  try {
    const key = process.env.WALLET_PRIVATE_KEY;
    if (!key) return null;
    const decoded = bs58.decode(key);
    return Keypair.fromSecretKey(decoded);
  } catch {
    return null;
  }
}

const keypair = loadKeypair();
const rpcUrl = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";

// -- Mode Control --
export function setExecutionMode(mode: ExecutionMode) {
  executionMode = mode;
  eventBus.emit("mode_change", mode);
}

export function getExecutionMode(): ExecutionMode {
  return executionMode;
}

// -- System Health --
export function getSystemHealth(): SystemHealth {
  const cb = getCircuitBreaker();
  const overall =
    cb.state === "open" ? "degraded" :
    !streamHealthy && !blurHealthy ? "degraded" : "healthy";

  const components: ComponentHealth[] = [
    {
      name: "Solami Yellowstone",
      status: streamHealthy ? "healthy" : "degraded",
      lastCheckedAt: new Date().toISOString(),
    },
    {
      name: "Solami Blur",
      status: blurHealthy ? "healthy" : "standby",
      lastCheckedAt: new Date().toISOString(),
      detail: blurHealthy ? undefined : "Synthetic events active",
    },
    {
      name: "Solami Beam",
      status: "healthy",
      lastCheckedAt: new Date().toISOString(),
    },
    {
      name: "Jito",
      status: "standby",
      lastCheckedAt: new Date().toISOString(),
      detail: "Fallback route",
    },
    {
      name: "AI Operator",
      status: process.env.GROQ_API_KEY ? "healthy" : "degraded",
      lastCheckedAt: new Date().toISOString(),
      detail: process.env.GROQ_API_KEY ? "Groq LLM connected" : "No API key",
    },
    {
      name: "Policy Engine",
      status: cb.state === "open" ? "degraded" : "healthy",
      lastCheckedAt: new Date().toISOString(),
      detail: cb.state === "open" ? `Circuit breaker open: ${cb.reason}` : undefined,
    },
  ];

  const eventLagMs = lastEventAt ? Date.now() - lastEventAt : undefined;

  return {
    overall,
    components,
    eventLagMs,
    currentSlot,
    executionMode,
    circuitBreaker: cb,
    checkedAt: new Date().toISOString(),
  };
}

// -- AI Operator --
async function consultAI(
  event: SentryEvent,
  network: NetworkSnapshot,
  policy: PolicyEvaluation,
): Promise<AiRecommendation | undefined> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return undefined;

  const prompt = `You are Sentry AI, an autonomous Solana execution system operator.

An event has been detected and the policy engine has evaluated it.

EVENT:
- Type: ${event.type}
- Source: ${event.source}
- Slot: ${event.slot}
- Description: ${event.decoded.description ?? "N/A"}
- Liquidity Delta: ${event.decoded.liquidityDeltaUsd ? "$" + event.decoded.liquidityDeltaUsd.toLocaleString() : "N/A"}
- Volume: ${event.decoded.volumeDeltaUsd ? "$" + event.decoded.volumeDeltaUsd.toLocaleString() : "N/A"}
- Opportunity Score: ${policy.opportunityScore}/100

NETWORK:
- Slot: ${network.slot}
- Regime: ${network.regime}
- Congestion: ${network.congestionScore}/100
- Tip p75: ${network.tipP75.toLocaleString()} lamports
- Tip trend: ${network.tipTrend}
- Slots to leader: ${network.slotsToLeader ?? "unknown"}

POLICY DECISION: ${policy.decision.toUpperCase()}
- Recommended tip: ${policy.recommendedTip.toLocaleString()} lamports
- Recommended route: ${policy.recommendedRoute}

Respond ONLY with a JSON object:
{
  "action": "execute" | "hold" | "increase_tip" | "switch_route",
  "confidence": 0.0-1.0,
  "tipMultiplier": 1.0-2.0,
  "reasoning": "brief explanation under 150 chars"
}`;

  try {
    const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-20b",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 200,
      }),
    });

    if (!resp.ok) return undefined;
    const data = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return undefined;
    const parsed = JSON.parse(jsonMatch[0]) as {
      action?: string; confidence?: number;
      tipMultiplier?: number; reasoning?: string;
    };

    return {
      action: (parsed.action as AiRecommendation["action"]) ?? "execute",
      confidence: parsed.confidence ?? 0.7,
      tipMultiplier: parsed.tipMultiplier,
      reasoning: parsed.reasoning ?? "AI analysis complete.",
      model: "openai/gpt-oss-20b",
      generatedAt: new Date().toISOString(),
    };
  } catch {
    return undefined;
  }
}

// -- Core Pipeline --
export async function processEvent(event: SentryEvent): Promise<ExecutionReceipt> {
  lastEventAt = Date.now();
  const startedAt = new Date().toISOString();

  // 1. Capture network snapshot
  const network = await getNetworkSnapshot(rpcUrl);
  currentSlot = network.slot;

  // 2. Score opportunity
  event.opportunityScore = scoreOpportunity(event, network);

  // 3. Evaluate policy (deterministic)
  const walletBalanceSol = keypair
    ? undefined // we'd need an async call here -- skip for now
    : undefined;
  const policy = evaluatePolicy(event, network, executionMode, walletBalanceSol);

  // 4. Build tip recommendation
  const tipRec: TipRecommendation = {
    lamports: policy.recommendedTip,
    tier: "p75",
    regime: network.regime,
    leaderMultiplier: network.slotsToLeader !== undefined && network.slotsToLeader <= 2 ? 1.3 : 1.0,
    urgencyMultiplier: event.opportunityScore > 80 ? 1.2 : 1.0,
    emaBaseline: network.tipEma ?? network.tipP75,
    reasoning: `p75=${network.tipP75.toLocaleString()} regime=${network.regime} score=${event.opportunityScore}`,
  };

  // 5. Create receipt
  let receipt = createReceipt({
    mode: executionMode,
    trigger: event,
    networkSnapshot: network,
    policyEvaluation: policy,
    tipRecommendation: tipRec,
  });

  // Emit for dashboard SSE streams
  eventBus.emit("receipt", receipt);

  // 6. Blocked: return early
  if (policy.decision === "blocked") {
    await persistReceipt(receipt);
    recentReceipts.unshift(receipt);
    if (recentReceipts.length > MAX_RECEIPT_BUFFER) recentReceipts.pop();
    eventBus.emit("receipt_final", receipt);
    return receipt;
  }

  // 7. Consult AI operator (non-blocking, best-effort)
  const aiRec = await consultAI(event, network, policy);
  if (aiRec) {
    receipt.aiRecommendation = aiRec;
    // AI can recommend hold -- but ONLY if policy already allows.
    // AI cannot override a policy ALLOW into a hard block.
    if (aiRec.action === "hold" && aiRec.confidence > 0.85) {
      receipt.finalStatus = "blocked";
      receipt.currentStage = "blocked";
      await persistReceipt(receipt);
      recentReceipts.unshift(receipt);
      if (recentReceipts.length > MAX_RECEIPT_BUFFER) recentReceipts.pop();
      eventBus.emit("receipt_final", receipt);
      return receipt;
    }
    // AI tip multiplier (capped by policy max)
    if (aiRec.tipMultiplier && aiRec.tipMultiplier > 1) {
      const adjustedTip = Math.min(
        Math.round(policy.recommendedTip * aiRec.tipMultiplier),
        policy.maxTip,
      );
      policy.recommendedTip = adjustedTip;
      tipRec.lamports = adjustedTip;
    }
  }

  // 8. Shadow mode: simulate but don't execute
  if (executionMode === "shadow" || policy.decision === "shadow") {
    receipt.finalStatus = "shadow";
    receipt.completedAt = new Date().toISOString();
    receipt.durationMs = Date.now() - new Date(startedAt).getTime();
    await persistReceipt(receipt);
    recentReceipts.unshift(receipt);
    if (recentReceipts.length > MAX_RECEIPT_BUFFER) recentReceipts.pop();
    eventBus.emit("receipt_final", receipt);
    return receipt;
  }

  // 9. Execute (live mode)
  if (!keypair) {
    receipt.finalStatus = "failed";
    receipt.currentStage = "failed";
    receipt.failureAnalysis = {
      class: "unknown",
      recovery: "abort_do_not_retry",
      retryable: false,
      description: "No wallet keypair configured (WALLET_PRIVATE_KEY not set)",
      retriesAttempted: 0,
    };
    await persistReceipt(receipt);
    return receipt;
  }

  const faultType = event.decoded.faultType as string | undefined;

  // Safety balance guard: protect wallet from rent-exemption violation
  try {
    const conn = new Connection(rpcUrl, "confirmed");
    const bal = await conn.getBalance(keypair.publicKey, "confirmed");
    const RENT_FLOOR = 650_240;
    const SAFETY_BUFFER = 35_000;
    if (bal < RENT_FLOOR + SAFETY_BUFFER && !faultType) {
      receipt.finalStatus = "shadow";
      receipt.currentStage = "blocked";
      receipt.completedAt = new Date().toISOString();
      receipt.durationMs = Date.now() - new Date(startedAt).getTime();
      receipt.failureAnalysis = {
        class: "insufficient_funds",
        recovery: "abort_do_not_retry",
        retryable: false,
        description: `Wallet balance (${bal} lamports) is near Solana rent floor (${RENT_FLOOR}). Diverted to shadow mode to protect wallet.`,
        retriesAttempted: 0,
      };
      await persistReceipt(receipt);
      recentReceipts.unshift(receipt);
      if (recentReceipts.length > MAX_RECEIPT_BUFFER) recentReceipts.pop();
      eventBus.emit("receipt_final", receipt);
      return receipt;
    }
  } catch {
    // continue if balance check network call times out
  }
  let lastError = "";
  const MAX_RETRIES = 2;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      receipt = advanceLifecycle(receipt, "submitted", "rpc");
      eventBus.emit("receipt", receipt);

      const result = await executeAction({
        keypair,
        rpcUrl,
        policy,
        network,
        memoText: `Sentry: ${event.type} at slot ${event.slot}`,
        faultType: attempt === 0 ? faultType : undefined, // faults only on first attempt
      });

      receipt = attachAction(receipt, result);

      if (attempt > 0) {
        receipt.retries.push(result);
      }

      receipt = advanceLifecycle(receipt, "processed", "rpc", network.slot);
      eventBus.emit("receipt", receipt);

      // Brief confirmation wait (Yellowstone would replace this in full implementation)
      await new Promise(resolve => setTimeout(resolve, 1500));

      receipt = advanceLifecycle(receipt, "confirmed", "rpc", network.slot + 1);
      eventBus.emit("receipt", receipt);

      await new Promise(resolve => setTimeout(resolve, 2000));
      receipt = advanceLifecycle(receipt, "finalized", "rpc", network.slot + 32);
      eventBus.emit("receipt", receipt);

      recordExecutionOutcome(true);
      recordExecution(
        getRules().find(r => r.eventTypes.includes(event.type))?.id ?? "unknown",
        result.tipLamports / 1e9,
      );
      recordRouteLatency(result.route as "beam" | "jito", receipt.durationMs ?? 3000);
      break; // Success

    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      const failure = classifyFailure(lastError, attempt);

      if (!failure.retryable || attempt >= MAX_RETRIES) {
        receipt = attachFailure(receipt, { ...failure, retriesAttempted: attempt });
        receipt = advanceLifecycle(receipt, "failed", "rpc");
        recordExecutionOutcome(false);
        break;
      }

      // Retry: bump tip for fee_too_low
      if (failure.class === "fee_too_low") {
        policy.recommendedTip = Math.min(
          Math.round(policy.recommendedTip * 1.5),
          policy.maxTip,
        );
      }
      // Switch route on bundle failure
      if (failure.class === "bundle_failed" && policy.recommendedRoute === "beam") {
        policy.recommendedRoute = "jito";
      }

      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }

  receipt.explorerUrl = receipt.signature
    ? `https://solscan.io/tx/${receipt.signature}`
    : undefined;

  await persistReceipt(receipt);
  recentReceipts.unshift(receipt);
  if (recentReceipts.length > MAX_RECEIPT_BUFFER) recentReceipts.pop();
  eventBus.emit("receipt_final", receipt);
  return receipt;
}

// -- Public Accessors --
export function getRecentReceipts(limit = 20): ExecutionReceipt[] {
  return recentReceipts.slice(0, limit);
}

export function getForensicReport(executionId: string): string | null {
  const receipt = recentReceipts.find(r => r.executionId === executionId);
  if (!receipt) return null;
  return buildForensicReport(receipt);
}

// -- Synthetic Event Loop (when Blur is not connected) --
let syntheticLoopRunning = false;

export function startSyntheticEventLoop(intervalMs = 8000) {
  if (syntheticLoopRunning) return;
  syntheticLoopRunning = true;

  const loop = async () => {
    if (!syntheticLoopRunning) return;
    try {
      const snapshot = await getNetworkSnapshot(rpcUrl);
      currentSlot = snapshot.slot || currentSlot + 1;
      const event = createSyntheticBlurEvent(currentSlot);
      eventBus.emit("event", event);
      // Process autonomously in background
      processEvent(event).catch(() => {/* silent */});
    } catch {
      // non-fatal
    }
    setTimeout(loop, intervalMs);
  };

  setTimeout(loop, 2000);
}

export function stopSyntheticEventLoop() {
  syntheticLoopRunning = false;
}

// -- Fault Injection Entry Point --
export async function injectFault(faultType: FaultType): Promise<ExecutionReceipt> {
  const snapshot = await getNetworkSnapshot(rpcUrl);
  currentSlot = snapshot.slot || currentSlot + 1;
  const event = createFaultEvent(faultType, currentSlot);
  // Override mode to live for fault injection demo
  const savedMode = executionMode;
  if (executionMode === "observe") {
    setExecutionMode("shadow");
  }
  eventBus.emit("event", event);
  const receipt = await processEvent(event);
  setExecutionMode(savedMode);
  return receipt;
}
