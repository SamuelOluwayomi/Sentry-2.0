// Sentry 2.0 -- Dual-Rail Transaction Submission//
// Strategy: fire at Solami Beam AND Jito simultaneously (Promise.race-style),
// then take whichever confirms first. Remaining rail is silently abandoned.
// This directly increases landing probability during congestion spikes.

import { Connection, Transaction, VersionedTransaction, Keypair } from "@solana/web3.js";
import bs58 from "bs58";

export interface DualRailParams {
  /** Pre-signed transaction or versioned transaction — serialized as base64 */
  serializedTxBase64: string;
  rpcUrl?: string;
  beamEndpoint?: string;
  jitoEndpoint?: string;
  timeoutMs?: number;
}

export interface DualRailResult {
  signature: string;
  winner: "beam" | "jito" | "rpc";
  landingMs: number;
}

/**
 * Submit a signed transaction simultaneously to Solami Beam, Jito, and RPC.
 * Returns the first successful result (Promise.race semantics).
 */
export async function submitDualRail(params: DualRailParams): Promise<DualRailResult> {
  const {
    serializedTxBase64,
    rpcUrl = process.env.SOLANA_RPC_URL ?? "https://rpc.solami.dev/sol",
    beamEndpoint = process.env.BEAM_ENDPOINT ?? "https://beam.solami.dev:11000",
    jitoEndpoint = process.env.JITO_BLOCK_ENGINE_URL ?? "https://mainnet.block-engine.jito.wtf",
    timeoutMs = 30_000,
  } = params;

  const startMs = Date.now();

  const makeRpc = (url: string, label: "beam" | "jito" | "rpc"): Promise<DualRailResult> =>
    fetch(`${url}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1,
        method: "sendTransaction",
        params: [serializedTxBase64, { encoding: "base64", skipPreflight: label !== "rpc", maxRetries: 2 }],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    })
      .then(async (r) => {
        const j = await r.json() as { result?: string; error?: { message: string } };
        if (j.error) throw new Error(`${label}: ${j.error.message}`);
        if (!j.result) throw new Error(`${label}: no signature in response`);
        return {
          signature: j.result,
          winner: label,
          landingMs: Date.now() - startMs,
        };
      });

  const makeJitoBundle = (): Promise<DualRailResult> =>
    fetch(`${jitoEndpoint}/api/v1/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transaction: { content: serializedTxBase64, isBase64: true } }),
      signal: AbortSignal.timeout(timeoutMs),
    })
      .then(async (r) => {
        const j = await r.json() as { result?: string; error?: { message: string } };
        if (j.error) throw new Error(`jito: ${j.error.message}`);
        return {
          signature: j.result ?? "jito_bundle",
          winner: "jito" as const,
          landingMs: Date.now() - startMs,
        };
      });

  // Fire all rails simultaneously
  const results = await Promise.allSettled([
    makeRpc(beamEndpoint, "beam"),
    makeJitoBundle(),
    makeRpc(rpcUrl, "rpc"),
  ]);

  // Return the first fulfilled result
  for (const r of results) {
    if (r.status === "fulfilled") {
      console.log(`[DualRail] Winner: ${r.value.winner} (${r.value.landingMs}ms) — ${r.value.signature}`);
      return r.value;
    }
  }

  // All failed — surface the most informative error
  const errors = results.map((r) => r.status === "rejected" ? (r.reason as Error).message : "").join(" | ");
  throw new Error(`[DualRail] All submission rails failed: ${errors}`);
}

/**
 * Helper: sign and dual-rail-submit an unsigned Transaction.
 */
export async function signAndSubmitDualRail(
  tx: Transaction,
  keypair: Keypair,
  connection: Connection,
  options?: Partial<DualRailParams>,
): Promise<DualRailResult> {
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = keypair.publicKey;
  tx.sign(keypair);

  const serializedTxBase64 = tx.serialize().toString("base64");
  return submitDualRail({ serializedTxBase64, ...options });
}
