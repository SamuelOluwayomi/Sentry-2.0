// Sentry 2.0 -- Event Engine
// Decodes, classifies, scores, and deduplicates incoming Solana events.
// Consumes from Solami Blur (decoded market data) and Yellowstone (raw gRPC).

import { randomUUID } from "node:crypto";
import type {
  SentryEvent, EventSource, EventType, FaultType,
  NetworkSnapshot,
} from "./types";

// -- Deduplication Window (last N event IDs) --
const DEDUP_WINDOW = 500;
const seenEventIds = new Set<string>();
const seenOrder: string[] = [];

function deduplicate(id: string): boolean {
  if (seenEventIds.has(id)) return true; // duplicate
  seenEventIds.add(id);
  seenOrder.push(id);
  if (seenOrder.length > DEDUP_WINDOW) {
    const oldest = seenOrder.shift()!;
    seenEventIds.delete(oldest);
  }
  return false;
}

// -- Opportunity Scorer --
// Pure deterministic scoring. No LLM involved.
export function scoreOpportunity(event: SentryEvent, network: NetworkSnapshot): number {
  let score = 50; // baseline

  // Liquidity signal
  const liq = event.decoded.liquidityDeltaUsd ?? 0;
  if (liq > 100_000) score += 30;
  else if (liq > 50_000) score += 20;
  else if (liq > 10_000) score += 10;
  else if (liq < 1_000) score -= 15;

  // Volume signal
  const vol = event.decoded.volumeDeltaUsd ?? 0;
  if (vol > 50_000) score += 10;
  else if (vol > 10_000) score += 5;

  // Network health
  const congestion = network.congestionScore ?? 50;
  if (congestion < 30) score += 10;
  else if (congestion > 70) score -= 20;
  else if (congestion > 85) score -= 35;

  // Leader proximity
  const slotsToLeader = network.slotsToLeader ?? 10;
  if (slotsToLeader <= 2) score += 15;
  else if (slotsToLeader <= 5) score += 8;
  else if (slotsToLeader > 20) score -= 10;

  // Tip regime
  if (network.regime === "cold") score += 8;
  else if (network.regime === "critical") score -= 20;

  // Transfer size
  const sol = event.decoded.transferAmountSol ?? 0;
  if (sol > 100) score += 15;
  else if (sol > 10) score += 5;

  return Math.min(100, Math.max(0, Math.round(score)));
}

// -- Event Classifier --
// Maps raw Blur/Yellowstone payloads to canonical SentryEvent types.
function classifyBlurEvent(raw: Record<string, unknown>): {
  type: EventType;
  decoded: SentryEvent["decoded"];
} {
  const kind = String(raw.type ?? raw.kind ?? "");
  const data = (raw.data ?? raw) as Record<string, unknown>;

  if (kind.includes("swap") || kind.includes("trade")) {
    return {
      type: "swap",
      decoded: {
        pool: String(data.pool ?? data.market ?? ""),
        tokenA: String(data.tokenA ?? data.inputMint ?? ""),
        tokenB: String(data.tokenB ?? data.outputMint ?? ""),
        volumeDeltaUsd: Number(data.volumeUsd ?? data.amountUsd ?? 0),
        priceUsd: Number(data.price ?? data.priceUsd ?? 0),
        description: `Swap: ${(data.volumeUsd ?? 0)} USD`,
      },
    };
  }

  if (kind.includes("liquidity")) {
    const delta = Number(data.liquidityDeltaUsd ?? data.deltaUsd ?? data.change ?? 0);
    return {
      type: "liquidity_change",
      decoded: {
        pool: String(data.pool ?? data.market ?? ""),
        liquidityDeltaUsd: delta,
        description: `Liquidity ${delta >= 0 ? "+" : ""}${Math.round(delta).toLocaleString()} USD`,
      },
    };
  }

  if (kind.includes("launch") || kind.includes("mint")) {
    return {
      type: "token_launch",
      decoded: {
        tokenA: String(data.mint ?? data.token ?? ""),
        description: "New token launch detected",
      },
    };
  }

  if (kind.includes("pool")) {
    return {
      type: "pool_creation",
      decoded: {
        pool: String(data.pool ?? data.market ?? ""),
        description: "New pool created",
      },
    };
  }

  return {
    type: "unknown",
    decoded: { description: `Unknown Blur event: ${kind}` },
  };
}

function classifyYellowstoneEvent(raw: Record<string, unknown>): {
  type: EventType;
  decoded: SentryEvent["decoded"];
} {
  const sig = String(raw.signature ?? "");
  const accounts = (raw.accountKeys ?? []) as string[];
  const lamports = Number(raw.lamports ?? raw.postBalance ?? 0);
  const solAmount = lamports / 1e9;

  // Large transfer heuristic (>= 10 SOL moving)
  if (solAmount >= 10) {
    return {
      type: "large_transfer",
      decoded: {
        signature: sig,
        transferAmountSol: solAmount,
        account: accounts[0] ?? "",
        description: `Large transfer: ${solAmount.toFixed(2)} SOL`,
      },
    };
  }

  // Program activity
  const program = accounts.find(a => a.length === 44 || a.length === 43);
  if (program) {
    return {
      type: "program_activity",
      decoded: {
        signature: sig,
        program,
        description: `Program activity: ${program.slice(0, 8)}...`,
      },
    };
  }

  return {
    type: "account_change",
    decoded: {
      signature: sig,
      description: "On-chain transaction observed",
    },
  };
}

// -- Public API --

/** Create a SentryEvent from a raw Solami Blur WebSocket message. */
export function fromBlurMessage(
  raw: unknown,
  slot: number,
): SentryEvent | null {
  try {
    const obj = raw as Record<string, unknown>;
    const { type, decoded } = classifyBlurEvent(obj);
    const id = String(obj.id ?? obj.txid ?? `blur-${slot}-${randomUUID()}`);

    if (deduplicate(id)) {
      return null; // already processed
    }

    return {
      id,
      source: "blur",
      type,
      slot,
      receivedAt: new Date().toISOString(),
      raw,
      decoded,
    };
  } catch {
    return null;
  }
}

/** Create a SentryEvent from a raw Yellowstone gRPC transaction update. */
export function fromYellowstoneMessage(
  raw: unknown,
  slot: number,
): SentryEvent | null {
  try {
    const obj = raw as Record<string, unknown>;
    const sig = String(obj.signature ?? "");
    const id = sig ? `ys-${sig}` : `ys-${slot}-${randomUUID()}`;

    if (deduplicate(id)) {
      return null;
    }

    const { type, decoded } = classifyYellowstoneEvent(obj);
    return {
      id,
      source: "yellowstone",
      type,
      slot,
      receivedAt: new Date().toISOString(),
      raw,
      decoded,
    };
  } catch {
    return null;
  }
}

/** Operator-triggered fault test. The resulting transaction is real and the failure comes from the live network. */
export function createFaultEvent(faultType: FaultType, slot: number): SentryEvent {
  const descriptions: Record<FaultType, string> = {
    expired_blockhash: "Fault injected: blockhash will be expired at submission",
    low_tip: "Fault injected: tip set below Beam minimum floor",
    zero_tip: "Fault injected: zero-lamport tip",
    simulation_failure: "Fault test: simulating a transfer larger than wallet balance",
  };

  return {
    id: `fault-${faultType}-${randomUUID()}`,
    source: "operator",
    type: "fault_injection",
    slot,
    receivedAt: new Date().toISOString(),
    decoded: {
      faultType,
      description: descriptions[faultType],
    },
    opportunityScore: 0,
  };
}

/**
 * Live on-chain event source. Pulls a real confirmed block over JSON-RPC and
 * emits one `large_transfer` event per transaction whose largest account
 * balance increase is >= minSol. Nothing here is generated locally.
 */
export async function fetchLiveTransferEvents(
  rpcUrl: string,
  slot: number,
  minSol = Number(process.env.LARGE_TRANSFER_MIN_SOL ?? 1000),
): Promise<SentryEvent[]> {
  const resp = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "getBlock",
      params: [slot, {
        encoding: "json", transactionDetails: "full", rewards: false,
        commitment: "confirmed", maxSupportedTransactionVersion: 1,
      }],
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!resp.ok) return [];
  const json = await resp.json() as {
    result?: { transactions: Array<{
      transaction: { signatures: string[]; message: { accountKeys: string[] } };
      meta: { err: unknown; preBalances: number[]; postBalances: number[] } | null;
    }> };
  };
  const txs = json.result?.transactions ?? [];
  const events: SentryEvent[] = [];
  for (const tx of txs) {
    const meta = tx.meta;
    if (!meta || meta.err) continue;
    let best = 0;
    let bestIdx = -1;
    for (let i = 0; i < meta.postBalances.length; i++) {
      const delta = meta.postBalances[i] - meta.preBalances[i];
      if (delta > best) { best = delta; bestIdx = i; }
    }
    const sol = best / 1e9;
    if (sol < minSol) continue;
    const signature = tx.transaction.signatures[0];
    const id = `rpc-${signature}`;
    if (deduplicate(id)) continue;
    events.push({
      id,
      source: "rpc",
      type: "large_transfer",
      slot,
      receivedAt: new Date().toISOString(),
      decoded: {
        signature,
        account: tx.transaction.message.accountKeys[bestIdx],
        transferAmountSol: Math.round(sol * 100) / 100,
        description: `Large transfer: ${Math.round(sol * 100) / 100} SOL`,
      },
    });
  }
  return events;
}
