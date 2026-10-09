import { liveDeduplicator } from "./cuckoo-filter";
// Sentry 2.0 -- Action Engine
// Builds, simulates, signs, and submits transactions.
// Selects optimal route. Enforces hard guardrails.

import {
  Connection, Keypair, PublicKey, SystemProgram,
  Transaction, TransactionInstruction, Message,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { randomUUID } from "node:crypto";
import type {
  ActionResult, RouteScore, PolicyEvaluation, NetworkSnapshot,
} from "./types";

import { submitDualRail } from "./dual-rail";
import { decideTip, classifyTxFailure } from "./tip-engine";
import { executeOrcaWhirlpoolSwap, KNOWN_POOLS } from "./orca-swap";
export { decideTip, classifyTxFailure, KNOWN_POOLS, executeOrcaWhirlpoolSwap };

const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
const BEAM_ENDPOINT = process.env.BEAM_ENDPOINT ?? "https://beam.solami.dev";
const JITO_ENDPOINT = process.env.JITO_BLOCK_ENGINE_URL ?? "https://mainnet.block-engine.jito.wtf";
const TIP_API_URL = "https://app.solami.dev/api/v1/tips/accounts";

const FALLBACK_TIP_ACCOUNTS = [
  "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
  "HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe",
  "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
];

// -- Route Performance Tracking --
const routeStats = new Map<string, {
  submissions: number;
  landed: number;
  latencies: number[];
  lastUsed: string;
  consecutive_failures: number;
}>();

function getRouteStats(route: string) {
  if (!routeStats.has(route)) {
    routeStats.set(route, {
      submissions: 0, landed: 0, latencies: [],
      lastUsed: new Date().toISOString(),
      consecutive_failures: 0,
    });
  }
  return routeStats.get(route)!;
}

export function recordRouteOutcome(route: "beam" | "jito" | "rpc", success: boolean, latencyMs: number) {
  const stats = getRouteStats(route);
  stats.submissions++;
  if (success) {
    stats.landed++;
    stats.consecutive_failures = 0;
  } else {
    stats.consecutive_failures++;
  }
  stats.latencies.push(latencyMs);
  if (stats.latencies.length > 100) stats.latencies.shift();
  stats.lastUsed = new Date().toISOString();
}

function medianOf(arr: number[]): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 !== 0 ? s[m] : (s[m-1] + s[m]) / 2;
}

export function getRouteScores(): RouteScore[] {
  const routes: Array<"beam" | "jito" | "rpc"> = ["beam", "jito", "rpc"];
  return routes.map(route => {
    const stats = getRouteStats(route);
    const landingRate = stats.submissions > 0
      ? Math.round((stats.landed / stats.submissions) * 100) / 100
      : 1.0; // assume healthy if untested
    const medianLatencyMs = Math.round(medianOf(stats.latencies));

    // Score = landingRate * 50 + latencyScore * 30 + healthScore * 20
    const latencyScore = medianLatencyMs === 0 ? 1 : Math.max(0, 1 - medianLatencyMs / 10000);
    const healthScore = stats.consecutive_failures < 3 ? 1 : 0;
    const score = Math.round(landingRate * 50 + latencyScore * 30 + healthScore * 20);

    return {
      route,
      score,
      submissions: stats.submissions,
      landingRate,
      medianLatencyMs,
      lastUsed: stats.lastUsed,
      healthy: stats.consecutive_failures < 5,
    };
  });
}

export function selectBestRoute(
  network: NetworkSnapshot,
  preferred: "beam" | "jito" | "rpc" | "auto",
): "beam" | "jito" | "rpc" {
  if (preferred !== "auto" && network[`${preferred}Healthy` as keyof NetworkSnapshot]) {
    return preferred;
  }
  // Auto: score all routes and pick best healthy one
  const scores = getRouteScores()
    .filter(s => s.healthy)
    .sort((a, b) => b.score - a.score);
  return scores[0]?.route ?? "beam";
}

// -- Tip Accounts --
async function getTipAccount(): Promise<string> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const resp = await fetch(TIP_API_URL, { signal: controller.signal });
    clearTimeout(timer);
    if (resp.ok) {
      const accounts = await resp.json() as string[];
      if (Array.isArray(accounts) && accounts.length > 0) {
        return accounts[Math.floor(Math.random() * accounts.length)];
      }
    }
  } catch {
    // fall through
  }
  return FALLBACK_TIP_ACCOUNTS[Math.floor(Math.random() * FALLBACK_TIP_ACCOUNTS.length)];
}

// -- Core Execution --
export async function executeAction(params: {
  keypair: Keypair;
  rpcUrl: string;
  policy: PolicyEvaluation;
  network: NetworkSnapshot;
  memoText?: string;
  faultType?: string;
}): Promise<ActionResult> {
  const { keypair, rpcUrl, policy, network, memoText, faultType } = params;
  const route = policy.recommendedRoute;
  const tipLamports = policy.recommendedTip;
  const submittedAt = new Date().toISOString();

  const tipAccount = await getTipAccount();
  const tipPubkey = new PublicKey(tipAccount);
  const memoProgramId = new PublicKey(MEMO_PROGRAM_ID);
  const connection = new Connection(rpcUrl, "confirmed");

  // Fault injection: zero tip
  const actualTip = faultType === "zero_tip" ? 0 :
                    faultType === "low_tip" ? 100 :
                    tipLamports;

  // Fault injection: expired blockhash
  let blockhash: string;
  let lastValidBlockHeight: number;
  if (faultType === "expired_blockhash") {
    blockhash = "11111111111111111111111111111111";
    lastValidBlockHeight = 0;
  } else {
    const bh = await connection.getLatestBlockhash("confirmed");
    blockhash = bh.blockhash;
    lastValidBlockHeight = bh.lastValidBlockHeight;
  }

  // Build instructions
  const memo = memoText ?? `Sentry 2.0 autonomous execution ${randomUUID().slice(0, 8)}`;
  const memoIx = new TransactionInstruction({
    programId: memoProgramId,
    keys: [],
    data: Buffer.from(memo),
  });
  const tipIx = SystemProgram.transfer({
    fromPubkey: keypair.publicKey,
    toPubkey: tipPubkey,
    lamports: actualTip,
  });

  // Simulate (unless fault-injecting simulation failure)
  let simulationPassed = true;
  let simulationError: string | undefined;
  if (faultType !== "simulation_failure") {
    try {
      const msg = new Message({
        header: {
          numRequiredSignatures: 1,
          numReadonlySignedAccounts: 0,
          numReadonlyUnsignedAccounts: 0,
        },
        accountKeys: [],
        recentBlockhash: blockhash,
        instructions: [],
      });
      const simTx = new Transaction({ recentBlockhash: blockhash, feePayer: keypair.publicKey });
      simTx.add(memoIx, tipIx);
      const simResult = await connection.simulateTransaction(simTx);
      if (simResult.value.err) {
        simulationPassed = false;
        simulationError = JSON.stringify(simResult.value.err);
      }
    } catch (e) {
      // Non-fatal simulation error (e.g. fault-injected blockhash)
      simulationPassed = false;
      simulationError = e instanceof Error ? e.message : String(e);
    }
  } else {
    // Build a transfer the wallet cannot afford and let the RPC node simulate it.
    const balance = await connection.getBalance(keypair.publicKey, "confirmed");
    const failTx = new Transaction({ recentBlockhash: blockhash, feePayer: keypair.publicKey });
    failTx.add(SystemProgram.transfer({
      fromPubkey: keypair.publicKey,
      toPubkey: tipPubkey,
      lamports: balance + 1_000_000_000,
    }));
    const failSim = await connection.simulateTransaction(failTx);
    simulationPassed = !failSim.value.err;
    simulationError = failSim.value.err ? JSON.stringify(failSim.value.err) : undefined;
  }

  // Build and sign transaction
  const tx = new Transaction({ recentBlockhash: blockhash, feePayer: keypair.publicKey });
  tx.add(memoIx, tipIx);
  tx.sign(keypair);
  const signature = tx.signatures[0]?.publicKey
    ? tx.signatures[0].publicKey.toBase58()
    : "unknown";
  const rawSig = tx.signatures[0]?.signature;
  const actualSig = rawSig ? Buffer.from(rawSig).toString("base64") : randomUUID();

  // Real simulation failure: the node itself rejects an over-balance transfer
  if (faultType === "simulation_failure" && simulationError) {
    throw new Error(`Simulation failed: ${simulationError}`);
  }

  // Cuckoo-filter preflight: never dispatch the same signed transaction twice
  // within its 150-slot blockhash validity window.
  if (liveDeduplicator.checkAndRecord(`tx:${signature}:${actualSig}`, network.slot)) {
    throw new Error(`duplicate_suppressed: transaction already dispatched (${actualSig.slice(0, 16)})`);
  }

  // Select endpoint
  const endpoint = route === "jito"
    ? `${JITO_ENDPOINT}/api/v1/transactions`
    : `${BEAM_ENDPOINT}/`;

  // Submit via Beam/Jito JSON-RPC
  const serialized = tx.serialize().toString("base64");
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "sendTransaction",
    params: [serialized, { encoding: "base64", skipPreflight: true }],
  };

  const startMs = Date.now();
  const resp = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const latencyMs = Date.now() - startMs;

  const respText = await resp.text();
  let respJson: { result?: string; error?: { message?: string } } = {};
  try { respJson = JSON.parse(respText); } catch { /* ignore */ }

  if (respJson.error) {
    const errMsg = respJson.error.message ?? "Unknown provider error";
    recordRouteOutcome(route, false, latencyMs);
    throw new Error(errMsg);
  }

  const bundleId = respJson.result ?? actualSig;
  recordRouteOutcome(route, true, latencyMs);

  // Recover actual base58 sig from the transaction
  let base58Sig = bundleId;
  try {
    const { default: bs58 } = await import("bs58");
    if (rawSig) {
      base58Sig = bs58.encode(rawSig);
    }
  } catch {
    base58Sig = bundleId;
  }

  return {
    route,
    signature: base58Sig,
    bundleId,
    tipLamports: actualTip,
    tipAccount,
    submittedAt,
    simulationPassed,
    simulationError,
  };
}


// ── Jupiter v6 Swap Strategy (via Solami Beam) ───────────────────────────────
// Executes a real token swap on mainnet using the Jupiter Aggregator v6 API.
// The signed transaction is broadcast through Solami Beam for priority landing.
export async function executeJupiterSwap(params: {
  keypair: import("@solana/web3.js").Keypair;
  inputMint: string;   // e.g. "So11111111111111111111111111111111111111112" for SOL
  outputMint: string;  // e.g. USDC mint
  amountLamports: number;
  tipLamports: number;
  slippageBps?: number;
}): Promise<{ signature: string; inAmount: number; outAmount: number; route: string }> {
  const { keypair, inputMint, outputMint, amountLamports, tipLamports, slippageBps = 50 } = params;

  // 1. Quote best route from Jupiter v6
  const quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountLamports}&slippageBps=${slippageBps}&onlyDirectRoutes=false`;
  const quoteResp = await fetch(quoteUrl, { signal: AbortSignal.timeout(6000) });
  if (!quoteResp.ok) throw new Error(`Jupiter quote HTTP ${quoteResp.status}`);
  const quote = await quoteResp.json() as {
    inAmount: string; outAmount: string;
    routePlan: Array<{ swapInfo: { label: string } }>;
  };

  const routeLabel = quote.routePlan?.[0]?.swapInfo?.label ?? "jupiter";
  console.log(`[Jupiter] ${routeLabel}: ${quote.inAmount} -> ${quote.outAmount}`);

  // 2. Build swap transaction
  const swapResp = await fetch("https://quote-api.jup.ag/v6/swap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: keypair.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      prioritizationFeeLamports: tipLamports,
      dynamicComputeUnitLimit: true,
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!swapResp.ok) throw new Error(`Jupiter swap TX HTTP ${swapResp.status}`);
  const { swapTransaction } = await swapResp.json() as { swapTransaction: string };

  // 3. Deserialise, sign, and submit via Solami Beam
  const { VersionedTransaction } = await import("@solana/web3.js");
  const tx = VersionedTransaction.deserialize(Buffer.from(swapTransaction, "base64"));
  tx.sign([keypair]);

  const beamEndpoint = process.env.BEAM_ENDPOINT ?? "https://beam.solami.dev";
  const beamResp = await fetch(`${beamEndpoint}/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1,
      method: "sendTransaction",
      params: [Buffer.from(tx.serialize()).toString("base64"), { encoding: "base64", skipPreflight: true }],
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const beamJson = await beamResp.json() as { result?: string; error?: { message: string } };
  if (beamJson.error) throw new Error(`Beam rejected swap: ${beamJson.error.message}`);

  const { default: bs58mod } = await import("bs58");
  const rawSig = tx.signatures[0];
  const signature = rawSig ? bs58mod.encode(rawSig) : (beamJson.result ?? "unknown");

  return { signature, inAmount: parseInt(quote.inAmount, 10), outAmount: parseInt(quote.outAmount, 10), route: routeLabel };
}

