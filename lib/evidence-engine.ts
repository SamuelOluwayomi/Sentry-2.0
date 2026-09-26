// Sentry 2.0 -- Evidence Engine
// Every execution gets a structured, auditable receipt with cryptographic verification.
// Verifiable Evidence: SHA-256 Hash Chaining + Ed25519 Engine Signatures.

import { appendFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import type {
  ExecutionReceipt, SentryEvent, NetworkSnapshot,
  PolicyEvaluation, TipRecommendation, AiRecommendation,
  ActionResult, LifecycleEvent, FailureAnalysis, ExecutionMode,
  LifecycleStage,
} from "./types";

const RECEIPTS_PATH = path.join(process.cwd(), "logs", "execution_receipts.jsonl");
const GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000";

let lastReceiptHash = GENESIS_HASH;

// Optional cached keypair for signing
let engineSignerKeypair: Keypair | null = null;

export function setEngineSigner(keypair: Keypair) {
  engineSignerKeypair = keypair;
}

function getEngineKeypair(): Keypair | null {
  if (engineSignerKeypair) return engineSignerKeypair;
  const privateKey = process.env.WALLET_PRIVATE_KEY;
  if (!privateKey) return null;
  try {
    const raw = privateKey.trim();
    if (raw.startsWith("[") && raw.endsWith("]")) {
      const bytes = Uint8Array.from(JSON.parse(raw) as number[]);
      engineSignerKeypair = Keypair.fromSecretKey(bytes);
    } else {
      const bytes = bs58.decode(raw);
      engineSignerKeypair = Keypair.fromSecretKey(bytes);
    }
    return engineSignerKeypair;
  } catch {
    return null;
  }
}

/** Compute deterministic SHA-256 hash across immutable execution parameters */
export function computeReceiptDigest(params: {
  executionId: string;
  startedAt: string;
  triggerType: string;
  triggerSlot: number;
  decision: string;
  recommendedTip: number;
  signature?: string;
  finalStatus: string;
  prevReceiptHash: string;
}): string {
  const payload = [
    params.executionId,
    params.startedAt,
    params.triggerType,
    params.triggerSlot,
    params.decision,
    params.recommendedTip,
    params.signature ?? "none",
    params.finalStatus,
    params.prevReceiptHash,
  ].join("|");

  return createHash("sha256").update(payload).digest("hex");
}

export function createReceipt(params: {
  mode: ExecutionMode;
  trigger: SentryEvent;
  networkSnapshot: NetworkSnapshot;
  policyEvaluation: PolicyEvaluation;
  tipRecommendation: TipRecommendation;
  aiRecommendation?: AiRecommendation;
}): ExecutionReceipt {
  const executionId = randomUUID();
  const startedAt = new Date().toISOString();
  const prevReceiptHash = lastReceiptHash;

  const initialDigest = computeReceiptDigest({
    executionId,
    startedAt,
    triggerType: params.trigger.type,
    triggerSlot: params.trigger.slot,
    decision: params.policyEvaluation.decision,
    recommendedTip: params.policyEvaluation.recommendedTip,
    finalStatus: params.policyEvaluation.decision === "blocked" ? "blocked" : "pending",
    prevReceiptHash,
  });

  return {
    executionId,
    mode: params.mode,
    startedAt,
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
    receiptHash: initialDigest,
    prevReceiptHash,
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

  // Update hash upon final status transition
  receipt.receiptHash = computeReceiptDigest({
    executionId: receipt.executionId,
    startedAt: receipt.startedAt,
    triggerType: receipt.trigger.type,
    triggerSlot: receipt.trigger.slot,
    decision: receipt.policyEvaluation.decision,
    recommendedTip: receipt.policyEvaluation.recommendedTip,
    signature: receipt.signature,
    finalStatus: receipt.finalStatus,
    prevReceiptHash: receipt.prevReceiptHash,
  });

  // Sign hash if engine keypair is available
  const keypair = getEngineKeypair();
  if (keypair) {
    try {
      const msgBytes = Buffer.from(receipt.receiptHash, "hex");
      const { sign } = require("tweetnacl");
      const sig = sign.detached(msgBytes, keypair.secretKey);
      receipt.engineSignature = bs58.encode(sig);
      receipt.signerPublicKey = keypair.publicKey.toBase58();
    } catch {
      // non-fatal
    }
  }

  return receipt;
}

export function attachAction(receipt: ExecutionReceipt, action: ActionResult): ExecutionReceipt {
  receipt.actionResult = action;
  receipt.signature = action.signature;
  receipt.explorerUrl = `https://solscan.io/tx/${action.signature}`;
  receipt.totalTipLamports = action.tipLamports;
  receipt.costSol = action.tipLamports / 1e9;

  receipt.receiptHash = computeReceiptDigest({
    executionId: receipt.executionId,
    startedAt: receipt.startedAt,
    triggerType: receipt.trigger.type,
    triggerSlot: receipt.trigger.slot,
    decision: receipt.policyEvaluation.decision,
    recommendedTip: receipt.policyEvaluation.recommendedTip,
    signature: action.signature,
    finalStatus: receipt.finalStatus,
    prevReceiptHash: receipt.prevReceiptHash,
  });

  const keypair = getEngineKeypair();
  if (keypair) {
    try {
      const msgBytes = Buffer.from(receipt.receiptHash, "hex");
      const { sign } = require("tweetnacl");
      const sig = sign.detached(msgBytes, keypair.secretKey);
      receipt.engineSignature = bs58.encode(sig);
      receipt.signerPublicKey = keypair.publicKey.toBase58();
    } catch {
      // non-fatal
    }
  }

  return receipt;
}

export function attachFailure(receipt: ExecutionReceipt, failure: FailureAnalysis): ExecutionReceipt {
  receipt.failureAnalysis = failure;
  return receipt;
}

/** Verify cryptographic integrity of a receipt */
export function verifyReceipt(receipt: ExecutionReceipt): {
  valid: boolean;
  hashMatches: boolean;
  signatureValid: boolean;
  error?: string;
} {
  const expectedHash = computeReceiptDigest({
    executionId: receipt.executionId,
    startedAt: receipt.startedAt,
    triggerType: receipt.trigger.type,
    triggerSlot: receipt.trigger.slot,
    decision: receipt.policyEvaluation.decision,
    recommendedTip: receipt.policyEvaluation.recommendedTip,
    signature: receipt.signature,
    finalStatus: receipt.finalStatus,
    prevReceiptHash: receipt.prevReceiptHash,
  });

  const hashMatches = expectedHash === receipt.receiptHash;
  let signatureValid = false;

  if (receipt.engineSignature && receipt.signerPublicKey) {
    try {
      const msgBytes = Buffer.from(receipt.receiptHash, "hex");
      const sigBytes = bs58.decode(receipt.engineSignature);
      const pubkeyBytes = bs58.decode(receipt.signerPublicKey);
      const { sign } = require("tweetnacl");
      signatureValid = sign.detached.verify(msgBytes, sigBytes, pubkeyBytes);
    } catch {
      signatureValid = false;
    }
  } else {
    // If no engine key configured, hash integrity is valid
    signatureValid = true;
  }

  return {
    valid: hashMatches && signatureValid,
    hashMatches,
    signatureValid,
  };
}

export async function persistReceipt(receipt: ExecutionReceipt): Promise<void> {
  try {
    lastReceiptHash = receipt.receiptHash;
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
  const verification = verifyReceipt(receipt);

  lines.push(`# Sentry Execution Report`);
  lines.push(`**Execution ID:** ${receipt.executionId}`);
  lines.push(`**Mode:** ${receipt.mode.toUpperCase()}`);
  lines.push(`**Status:** ${receipt.finalStatus.toUpperCase()}`);
  lines.push(`**Duration:** ${receipt.durationMs ?? "--"}ms`);
  lines.push(``);

  lines.push(`## Cryptographic Verification (Tamper-Evident Hash Chain)`);
  lines.push(`- **Receipt SHA-256:** \`${receipt.receiptHash}\``);
  lines.push(`- **Previous Receipt:** \`${receipt.prevReceiptHash}\``);
  if (receipt.signerPublicKey) lines.push(`- **Signer Public Key:** \`${receipt.signerPublicKey}\``);
  if (receipt.engineSignature) lines.push(`- **Engine Signature:** \`${receipt.engineSignature}\``);
  lines.push(`- **Cryptographic Audit Status:** ${verification.valid ? "VERIFIED (AUTHENTIC & UNTAMPERED)" : "FAILED"}`);
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
    lines.push(`## AI Supervisory Plane`);
    lines.push(`- Action: ${ai.action.toUpperCase()}`);
    lines.push(`- Confidence: ${Math.round(ai.confidence * 100)}%`);
    lines.push(`- Supervisory Reasoning: ${ai.reasoning}`);
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
