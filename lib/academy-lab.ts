// Sentry Academy -- Live cluster lab engine (devnet / testnet)
//
// Every lab here runs against a real public Solana cluster. Nothing is mocked.
// Labs that move lamports use a dedicated sandbox keypair that is NEVER the
// mainnet operator wallet, so experiments cannot touch production funds.

import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type AcademyNetwork = "mainnet" | "devnet" | "testnet";

export const ACADEMY_NETWORKS: AcademyNetwork[] = ["mainnet", "devnet", "testnet"];

const DEFAULT_ENDPOINTS: Record<AcademyNetwork, string> = {
  mainnet: process.env.NEXT_PUBLIC_MAINNET_RPC ?? "https://api.mainnet-beta.solana.com",
  devnet: "https://api.devnet.solana.com",
  testnet: "https://api.testnet.solana.com",
};

// Orca deploys the same Whirlpool program on devnet. SOL / devUSDC, tick spacing 64.
const ORCA_DEVNET_SOL_DEVUSDC = "3KBZiL2g8C7tiJ32hTv5v3KM7aK9htpqTw4cTXz1HvPt";

export function isAcademyNetwork(value: unknown): value is AcademyNetwork {
  return value === "mainnet" || value === "devnet" || value === "testnet";
}

/** Primary endpoint plus any extra endpoints configured via env (comma separated). */
export function getEndpoints(network: AcademyNetwork): { name: string; url: string }[] {
  const envKey =
    network === "mainnet"
      ? "NEXT_PUBLIC_MAINNET_RPC"
      : network === "devnet"
      ? "ACADEMY_DEVNET_RPC_URLS"
      : "ACADEMY_TESTNET_RPC_URLS";
  const extras = (process.env[envKey] ?? "")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
  const all = [DEFAULT_ENDPOINTS[network], ...extras];
  return Array.from(new Set(all)).map((url, i) => ({
    name: i === 0 ? `Solana Foundation ${network}` : safeHost(url),
    url,
  }));
}

function safeHost(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return "custom endpoint";
  }
}

function primaryConnection(network: AcademyNetwork) {
  return new Connection(getEndpoints(network)[0].url, "confirmed");
}

export function explorerUrl(kind: "tx" | "address", value: string, network: AcademyNetwork) {
  if (network === "mainnet") {
    return `https://explorer.solana.com/${kind}/${value}`;
  }
  return `https://explorer.solana.com/${kind}/${value}?cluster=${network}`;
}

// ---------------------------------------------------------------------------
// Sandbox keypair
// ---------------------------------------------------------------------------

let cachedSandbox: Keypair | null = null;
const SANDBOX_PATH = path.join(process.cwd(), ".academy", "sandbox-keypair.json");

export async function getSandboxKeypair(): Promise<Keypair> {
  if (cachedSandbox) return cachedSandbox;

  const fromEnv = process.env.ACADEMY_SANDBOX_SECRET;
  if (fromEnv) {
    try {
      cachedSandbox = Keypair.fromSecretKey(new Uint8Array(JSON.parse(fromEnv)));
      return cachedSandbox;
    } catch {
      // fall through to file-based keypair
    }
  }

  try {
    const raw = await readFile(SANDBOX_PATH, "utf8");
    cachedSandbox = Keypair.fromSecretKey(new Uint8Array(JSON.parse(raw)));
    return cachedSandbox;
  } catch {
    const kp = Keypair.generate();
    try {
      await mkdir(path.dirname(SANDBOX_PATH), { recursive: true });
      await writeFile(SANDBOX_PATH, JSON.stringify(Array.from(kp.secretKey)), "utf8");
    } catch {
      // Read-only filesystem (e.g. serverless). Keep in memory for this instance.
    }
    cachedSandbox = kp;
    return kp;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const start = performance.now();
  const value = await fn();
  return { value, ms: Math.round(performance.now() - start) };
}

function percentile(sorted: number[], p: number) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

async function buildSelfTransfer(
  connection: Connection,
  payer: Keypair,
  opts: { lamports?: number; microLamports?: number; cuLimit?: number; blockhash?: string; to?: PublicKey } = {}
) {
  const latest = opts.blockhash
    ? { blockhash: opts.blockhash, lastValidBlockHeight: 0 }
    : await connection.getLatestBlockhash("confirmed");
  const ixs = [];
  if (opts.cuLimit) ixs.push(ComputeBudgetProgram.setComputeUnitLimit({ units: opts.cuLimit }));
  if (opts.microLamports) ixs.push(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: opts.microLamports }));
  ixs.push(
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: opts.to ?? payer.publicKey,
      lamports: opts.lamports ?? 1_000,
    })
  );
  const message = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: latest.blockhash,
    instructions: ixs,
  }).compileToV0Message();
  const tx = new VersionedTransaction(message);
  tx.sign([payer]);
  return { tx, latest };
}

function classifySimError(err: unknown, logs: string[] | null): { code: string; plain: string } {
  const text = `${describeError(err)} ${(logs ?? []).join(" ")}`;
  if (/BlockhashNotFound/i.test(text))
    return { code: "BlockhashNotFound", plain: "The blockhash is unknown or older than ~150 blocks, so validators refuse the transaction." };
  if (/AccountNotFound/i.test(text))
    return { code: "AccountNotFound", plain: "The fee payer has never been funded on this cluster, so it does not exist on-chain yet." };
  if (/insufficient lamports|InsufficientFundsForFee|insufficient funds/i.test(text))
    return { code: "InsufficientFunds", plain: "The payer cannot cover the transfer amount plus fees." };
  if (/exceeded CUs meter|ComputationalBudgetExceeded|compute units/i.test(text))
    return { code: "ComputeBudgetExceeded", plain: "The instruction needed more compute units than the limit you requested." };
  return { code: "Unknown", plain: describeError(err) };
}

// ---------------------------------------------------------------------------
// Labs
// ---------------------------------------------------------------------------

/** Lesson 1: slots, epochs, blockhashes, leaders. Read-only. */
export async function labPulse(network: AcademyNetwork) {
  const connection = primaryConnection(network);
  const { value: version, ms: versionMs } = await timed(() => connection.getVersion());
  const [processed, confirmed, finalized] = await Promise.all([
    connection.getSlot("processed"),
    connection.getSlot("confirmed"),
    connection.getSlot("finalized"),
  ]);
  const [epochInfo, blockHeight, latest, leader, perf] = await Promise.all([
    connection.getEpochInfo("confirmed"),
    connection.getBlockHeight("confirmed"),
    connection.getLatestBlockhash("confirmed"),
    connection.getSlotLeader("confirmed").catch(() => null),
    connection.getRecentPerformanceSamples(4).catch(() => []),
  ]);
  const slotTimes = perf
    .filter((s) => s.numSlots > 0)
    .map((s) => (s.samplePeriodSecs * 1000) / s.numSlots);
  const avgSlotMs = slotTimes.length
    ? Math.round(slotTimes.reduce((a, b) => a + b, 0) / slotTimes.length)
    : null;
  const tps = perf.length
    ? Math.round(perf.reduce((a, s) => a + s.numTransactions / s.samplePeriodSecs, 0) / perf.length)
    : null;

  return {
    network,
    endpoint: getEndpoints(network)[0].url,
    rpcLatencyMs: versionMs,
    solanaCore: version["solana-core"],
    slots: { processed, confirmed, finalized, confirmedLag: processed - confirmed, finalizedLag: processed - finalized },
    epoch: {
      epoch: epochInfo.epoch,
      slotIndex: epochInfo.slotIndex,
      slotsInEpoch: epochInfo.slotsInEpoch,
      progressPct: Number(((epochInfo.slotIndex / epochInfo.slotsInEpoch) * 100).toFixed(2)),
    },
    blockHeight,
    blockhash: {
      value: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight,
      blocksUntilExpiry: latest.lastValidBlockHeight - blockHeight,
    },
    leader: leader ? leader : null,
    avgSlotMs,
    tps,
  };
}

/** Sandbox wallet status. */
export async function labWallet(network: AcademyNetwork) {
  const kp = await getSandboxKeypair();
  const connection = primaryConnection(network);
  const lamports = await connection.getBalance(kp.publicKey, "confirmed");
  return {
    network,
    address: kp.publicKey.toBase58(),
    lamports,
    sol: lamports / LAMPORTS_PER_SOL,
    explorer: explorerUrl("address", kp.publicKey.toBase58(), network),
  };
}

const DEDICATED_FAUCET_KEY =
  process.env.FAUCET_PRIVATE_KEY ||
  process.env.DEVNET_FAUCET_PRIVATE_KEY ||
  "29RAXBmSvLrDc8iuLwAkshS9MuuXX5ZM2GcMSPoaMF23Q9Uk9MPkmkg4GPLMdj6S5aBNiEDh5BRa76dvbAE9FpTV";

function getFaucetKeypair(): Keypair | null {
  try {
    if (!DEDICATED_FAUCET_KEY) return null;
    return Keypair.fromSecretKey(bs58.decode(DEDICATED_FAUCET_KEY.trim()));
  } catch {
    return null;
  }
}

/** Lesson 2: faucet airdrop. Uses dedicated Sentry faucet vault to prevent public 429 rate-limiting. */
export async function labAirdrop(network: AcademyNetwork, target?: string) {
  if (network === "mainnet") {
    return {
      ok: false,
      error: "Airdrops are not available on Solana Mainnet. Switch the cluster toggle above to Devnet to test airdrops.",
    };
  }
  const kp = await getSandboxKeypair();
  const connection = primaryConnection(network);
  const recipient = target ? new PublicKey(target) : kp.publicKey;
  const before = await connection.getBalance(recipient, "confirmed");
  const amount = network === "devnet" ? 0.25 : 0.5;

  // 1. First, attempt transfer from the dedicated Faucet Vault (immune to public 429 rate limits)
  const faucetKp = getFaucetKeypair();
  if (faucetKp && network === "devnet") {
    try {
      const faucetBal = await connection.getBalance(faucetKp.publicKey, "confirmed");
      const requiredLamports = Math.round(amount * LAMPORTS_PER_SOL);
      if (faucetBal > requiredLamports + 10_000) {
        const tx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: faucetKp.publicKey,
            toPubkey: recipient,
            lamports: requiredLamports,
          })
        );
        const signature = await sendAndConfirmTransaction(connection, tx, [faucetKp], {
          commitment: "confirmed",
        });
        const after = await connection.getBalance(recipient, "confirmed");
        return {
          ok: true,
          network,
          recipient: recipient.toBase58(),
          signature,
          amountSol: amount,
          beforeSol: before / LAMPORTS_PER_SOL,
          afterSol: after / LAMPORTS_PER_SOL,
          faucetSource: "sentry_vault_faucet",
          faucetVault: faucetKp.publicKey.toBase58(),
          explorer: explorerUrl("tx", signature, network),
        };
      }
    } catch (faucetErr) {
      console.warn("[Faucet] Vault transfer error, falling back to public requestAirdrop:", faucetErr);
    }
  }

  // 2. Fallback to standard requestAirdrop
  try {
    const signature = await connection.requestAirdrop(recipient, amount * LAMPORTS_PER_SOL);
    const latest = await connection.getLatestBlockhash("confirmed");
    await connection.confirmTransaction({ signature, ...latest }, "confirmed");
    const after = await connection.getBalance(recipient, "confirmed");
    return {
      ok: true,
      network,
      recipient: recipient.toBase58(),
      signature,
      amountSol: amount,
      beforeSol: before / LAMPORTS_PER_SOL,
      afterSol: after / LAMPORTS_PER_SOL,
      faucetSource: "public_cluster_faucet",
      explorer: explorerUrl("tx", signature, network),
    };
  } catch (err) {
    const msg = describeError(err);
    return {
      ok: false,
      network,
      recipient: recipient.toBase58(),
      beforeSol: before / LAMPORTS_PER_SOL,
      error: /429|rate|limit|Too Many/i.test(msg)
        ? "The public faucet rate-limited this request. Use https://faucet.solana.com with the sandbox address, then re-run."
        : msg,
      faucetUrl: "https://faucet.solana.com",
    };
  }
}

/** Lesson 3: full transaction lifecycle with commitment timeline. Spends ~5,000 lamports in fees. */
export async function labLifecycle(network: AcademyNetwork, microLamports = 0) {
  const kp = await getSandboxKeypair();
  const connection = primaryConnection(network);
  const balance = await connection.getBalance(kp.publicKey, "confirmed");
  if (balance < 20_000) {
    return {
      ok: false,
      network,
      stage: "funding",
      error: "The sandbox wallet needs devnet/testnet SOL first. Run the faucet lab, then retry.",
      address: kp.publicKey.toBase58(),
    };
  }

  const t0 = performance.now();
  const { tx, latest } = await buildSelfTransfer(connection, kp, {
    microLamports: microLamports > 0 ? microLamports : undefined,
    cuLimit: microLamports > 0 ? 1_000 : undefined,
  });
  const built = Math.round(performance.now() - t0);

  const sim = await connection.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: false });
  const simulatedAt = Math.round(performance.now() - t0);
  if (sim.value.err) {
    const c = classifySimError(sim.value.err, sim.value.logs);
    return { ok: false, network, stage: "simulate", error: c.plain, code: c.code, logs: sim.value.logs ?? [] };
  }

  const signature = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 0 });
  const sentAt = Math.round(performance.now() - t0);

  const reached: Record<string, number | null> = { processed: null, confirmed: null, finalized: null };
  let landedSlot: number | null = null;
  let lastRebroadcast = performance.now();
  const deadline = performance.now() + 45_000;
  while (performance.now() < deadline && reached.finalized === null) {
    const { value } = await connection.getSignatureStatuses([signature], { searchTransactionHistory: false });
    const st = value[0];
    const now = Math.round(performance.now() - t0);
    if (st) {
      landedSlot = st.slot;
      if (st.err) {
        return { ok: false, network, stage: "execute", error: describeError(st.err), signature };
      }
      if (reached.processed === null) reached.processed = now;
      if (
        reached.confirmed === null &&
        (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")
      )
        reached.confirmed = now;
      if (reached.finalized === null && st.confirmationStatus === "finalized") reached.finalized = now;
    } else if (performance.now() - lastRebroadcast > 2_000) {
      // Manual rebroadcast: same signed bytes, same signature, so it is safe to resend.
      await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 0 }).catch(() => undefined);
      lastRebroadcast = performance.now();
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  const feeLamports = 5_000 + Math.ceil((microLamports * 1_000) / 1_000_000);
  return {
    ok: reached.confirmed !== null,
    network,
    signature,
    explorer: explorerUrl("tx", signature, network),
    landedSlot,
    blockhash: latest.blockhash,
    lastValidBlockHeight: latest.lastValidBlockHeight,
    computeUnits: sim.value.unitsConsumed ?? null,
    microLamports,
    estimatedFeeLamports: feeLamports,
    timeline: {
      builtMs: built,
      simulatedMs: simulatedAt,
      sentMs: sentAt,
      processedMs: reached.processed,
      confirmedMs: reached.confirmed,
      finalizedMs: reached.finalized,
    },
    logs: sim.value.logs ?? [],
  };
}

/** Lesson 4: priority fee market from recent blocks. Read-only. */
export async function labFees(network: AcademyNetwork) {
  const connection = primaryConnection(network);
  // Writable accounts scope the fee sample to contention on those accounts.
  const hotAccounts = [new PublicKey("whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc")];
  const [global, scoped] = await Promise.all([
    connection.getRecentPrioritizationFees(),
    connection.getRecentPrioritizationFees({ lockedWritableAccounts: hotAccounts }).catch(() => []),
  ]);
  const summarize = (rows: { slot: number; prioritizationFee: number }[]) => {
    const fees = rows.map((r) => r.prioritizationFee).sort((a, b) => a - b);
    const nonZero = fees.filter((f) => f > 0);
    return {
      samples: fees.length,
      nonZeroPct: fees.length ? Math.round((nonZero.length / fees.length) * 100) : 0,
      p25: percentile(fees, 25),
      p50: percentile(fees, 50),
      p75: percentile(fees, 75),
      p95: percentile(fees, 95),
      max: fees.length ? fees[fees.length - 1] : 0,
      slotRange: rows.length ? [rows[0].slot, rows[rows.length - 1].slot] : null,
    };
  };
  const g = summarize(global);
  const cuBudget = 200_000;
  const toLamports = (micro: number) => Math.ceil((micro * cuBudget) / 1_000_000);
  const tiers = [
    { label: "Economy", microLamports: Math.max(g.p25, 0) },
    { label: "Standard", microLamports: Math.max(g.p50, 1) },
    { label: "Fast", microLamports: Math.max(g.p75, 100) },
    { label: "Urgent", microLamports: Math.max(g.p95, 1_000) },
  ].map((t) => ({ ...t, priorityLamportsAt200kCU: toLamports(t.microLamports), totalLamports: 5_000 + toLamports(t.microLamports) }));

  return {
    network,
    baseFeeLamportsPerSignature: 5_000,
    global: g,
    orcaScoped: summarize(scoped),
    tiers,
    note:
      network === "devnet" || network === "testnet"
        ? "Test clusters have little fee competition, so most samples are zero. The same math applies on mainnet, where p75 is often thousands of micro-lamports."
        : "",
  };
}

/** Lesson 5: fault injection via simulation. No SOL is spent. */
export async function labFault(
  network: AcademyNetwork,
  kind: "expired_blockhash" | "insufficient_funds" | "compute_exceeded"
) {
  const kp = await getSandboxKeypair();
  const connection = primaryConnection(network);
  const balance = await connection.getBalance(kp.publicKey, "confirmed");

  let faulty: VersionedTransaction;
  let recovery: VersionedTransaction;
  let injected = "";
  let fix = "";

  if (kind === "expired_blockhash") {
    const stale = Keypair.generate().publicKey.toBase58(); // a syntactically valid but unknown blockhash
    faulty = (await buildSelfTransfer(connection, kp, { blockhash: stale })).tx;
    recovery = (await buildSelfTransfer(connection, kp)).tx;
    injected = `Signed with a blockhash the cluster has never seen (${stale.slice(0, 10)}...).`;
    fix = "Fetched a fresh blockhash with getLatestBlockhash, re-signed, and re-simulated.";
  } else if (kind === "insufficient_funds") {
    const tooMuch = balance + LAMPORTS_PER_SOL;
    const dest = Keypair.generate().publicKey;
    faulty = (await buildSelfTransfer(connection, kp, { lamports: tooMuch, to: dest })).tx;
    recovery = (await buildSelfTransfer(connection, kp, { lamports: 1_000 })).tx;
    injected = `Tried to send ${(tooMuch / LAMPORTS_PER_SOL).toFixed(4)} SOL from a wallet holding ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL.`;
    fix = "Resized the transfer to an amount the wallet can cover, then re-simulated.";
  } else {
    faulty = (await buildSelfTransfer(connection, kp, { cuLimit: 50 })).tx;
    recovery = (await buildSelfTransfer(connection, kp, { cuLimit: 1_000 })).tx;
    injected = "Requested a compute limit of 50 CU. A system transfer needs about 150 CU.";
    fix = "Raised the compute unit limit to 1,000 CU and re-simulated.";
  }

  const faultSim = await connection.simulateTransaction(faulty, { sigVerify: false, replaceRecentBlockhash: false });
  const recoverySim = await connection.simulateTransaction(recovery, { sigVerify: false, replaceRecentBlockhash: false });
  const faultClass = faultSim.value.err ? classifySimError(faultSim.value.err, faultSim.value.logs) : null;
  const recoveryClass = recoverySim.value.err ? classifySimError(recoverySim.value.err, recoverySim.value.logs) : null;

  return {
    network,
    kind,
    sandboxBalanceSol: balance / LAMPORTS_PER_SOL,
    injected,
    fault: {
      rejected: Boolean(faultSim.value.err),
      code: faultClass?.code ?? "None",
      explanation: faultClass?.plain ?? "The cluster unexpectedly accepted this transaction.",
      logs: (faultSim.value.logs ?? []).slice(-6),
    },
    recovery: {
      fix,
      ok: !recoverySim.value.err,
      code: recoveryClass?.code ?? "Ok",
      explanation: recoveryClass?.plain ?? "Simulation succeeded. This transaction would land.",
      unitsConsumed: recoverySim.value.unitsConsumed ?? null,
      logs: (recoverySim.value.logs ?? []).slice(-4),
    },
  };
}

type EndpointSuccess = {
  name: string;
  url: string;
  ok: true;
  latencyMs: number;
  processed: number;
  confirmed: number;
  finalized: number;
  health: string;
};

type EndpointFailure = {
  name: string;
  url: string;
  ok: false;
  error: string;
};

type EndpointResult = EndpointSuccess | EndpointFailure;

/** Lesson 6: RPC consistency. Compares commitment levels and every configured endpoint. */
export async function labConsistency(network: AcademyNetwork) {
  const endpoints = getEndpoints(network);
  const results: EndpointResult[] = await Promise.all(
    endpoints.map(async (ep): Promise<EndpointResult> => {
      const conn = new Connection(ep.url, "confirmed");
      try {
        const { value: processed, ms } = await timed(() => conn.getSlot("processed"));
        const [confirmed, finalized, health] = await Promise.all([
          conn.getSlot("confirmed"),
          conn.getSlot("finalized"),
          fetch(ep.url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }),
            signal: AbortSignal.timeout(5_000),
          })
            .then((r) => r.json() as Promise<{ result?: string; error?: { message: string } }>)
            .then((j) => j.result ?? j.error?.message ?? "unknown")
            .catch(() => "unreachable"),
        ]);
        return { name: ep.name, url: ep.url, ok: true, latencyMs: ms, processed, confirmed, finalized, health };
      } catch (err) {
        return { name: ep.name, url: ep.url, ok: false, error: describeError(err) };
      }
    })
  );
  const okRows = results.filter((r): r is EndpointSuccess => r.ok);
  const head = okRows.length ? Math.max(...okRows.map((r) => r.processed)) : 0;
  // Three back-to-back samples on the primary show how fast the head moves.
  const primary = new Connection(endpoints[0].url, "processed");
  const drift: { atMs: number; slot: number }[] = [];
  const start = performance.now();
  for (let i = 0; i < 3; i++) {
    drift.push({ atMs: Math.round(performance.now() - start), slot: await primary.getSlot("processed") });
    await new Promise((r) => setTimeout(r, 600));
  }
  return {
    network,
    headSlot: head,
    endpoints: results.map((r) => (r.ok ? { ...r, lagSlots: head - r.processed } : r)),
    drift,
    configuredEndpoints: endpoints.length,
    hint:
      endpoints.length < 2
        ? `Only one public ${network} endpoint is configured. Add more via ACADEMY_${network.toUpperCase()}_RPC_URLS to compare providers side by side.`
        : null,
  };
}

/** Lesson 8: multi-rail broadcast. One signed transaction, every rail, same signature. */
export async function labMultiRail(network: AcademyNetwork) {
  const kp = await getSandboxKeypair();
  const endpoints = getEndpoints(network);
  const connection = new Connection(endpoints[0].url, "confirmed");
  const balance = await connection.getBalance(kp.publicKey, "confirmed");
  if (balance < 20_000) {
    return {
      ok: false,
      network,
      error: "The sandbox wallet needs devnet/testnet SOL first. Run the faucet lab, then retry.",
      address: kp.publicKey.toBase58(),
    };
  }
  const { tx } = await buildSelfTransfer(connection, kp);
  const raw = Buffer.from(tx.serialize()).toString("base64");
  const start = performance.now();

  type Rail = { rail: string; url: string; strategy: string; config: Record<string, unknown> };
  const rails: Rail[] = [
    { rail: "Rail A", url: endpoints[0].url, strategy: "RPC-managed retries", config: { encoding: "base64", skipPreflight: true, maxRetries: 5 } },
    { rail: "Rail B", url: endpoints[0].url, strategy: "Preflight + no RPC retries", config: { encoding: "base64", skipPreflight: false, maxRetries: 0 } },
    ...endpoints.slice(1).map((ep, i) => ({
      rail: `Rail ${String.fromCharCode(67 + i)}`,
      url: ep.url,
      strategy: `Independent provider (${ep.name})`,
      config: { encoding: "base64", skipPreflight: true, maxRetries: 3 },
    })),
  ];

  const outcomes = await Promise.all(
    rails.map(async (r) => {
      const t = performance.now();
      try {
        const res = await fetch(r.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "sendTransaction", params: [raw, r.config] }),
          signal: AbortSignal.timeout(10_000),
        });
        const j = (await res.json()) as { result?: string; error?: { message: string } };
        return {
          rail: r.rail,
          strategy: r.strategy,
          host: safeHost(r.url),
          ackMs: Math.round(performance.now() - t),
          signature: j.result ?? null,
          error: j.error?.message ?? null,
        };
      } catch (err) {
        return { rail: r.rail, strategy: r.strategy, host: safeHost(r.url), ackMs: Math.round(performance.now() - t), signature: null, error: describeError(err) };
      }
    })
  );

  const signature = outcomes.find((o) => o.signature)?.signature ?? null;
  let confirmedMs: number | null = null;
  if (signature) {
    const deadline = performance.now() + 30_000;
    while (performance.now() < deadline) {
      const { value } = await connection.getSignatureStatuses([signature]);
      const st = value[0];
      if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) {
        confirmedMs = Math.round(performance.now() - start);
        break;
      }
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  const sorted = [...outcomes].filter((o) => o.signature).sort((a, b) => a.ackMs - b.ackMs);
  return {
    ok: Boolean(signature && confirmedMs !== null),
    network,
    signature,
    explorer: signature ? explorerUrl("tx", signature, network) : null,
    rails: outcomes,
    firstAck: sorted[0]?.rail ?? null,
    identicalSignatures: new Set(outcomes.filter((o) => o.signature).map((o) => o.signature)).size === 1,
    confirmedMs,
  };
}

/** Lesson 7: concentrated liquidity quote on Orca devnet. Read-only. */
export async function labOrcaQuote(network: AcademyNetwork, amountSol = 0.01) {
  if (network !== "devnet") {
    return {
      ok: false,
      network,
      error: "Orca Whirlpools are deployed on mainnet and devnet only. Switch the lab to devnet to run this quote.",
    };
  }
  const [{ WhirlpoolContext, buildWhirlpoolClient, swapQuoteByInputToken, PriceMath }, { Percentage }, { Wallet, BN }] =
    await Promise.all([import("@orca-so/whirlpools-sdk"), import("@orca-so/common-sdk"), import("@coral-xyz/anchor")]);

  const connection = primaryConnection(network);
  const ctx = WhirlpoolContext.from(connection, new Wallet(Keypair.generate()));
  const client = buildWhirlpoolClient(ctx);
  const pool = await client.getPool(new PublicKey(ORCA_DEVNET_SOL_DEVUSDC));
  const data = pool.getData();
  const decA = pool.getTokenAInfo().decimals;
  const decB = pool.getTokenBInfo().decimals;
  const spot = PriceMath.sqrtPriceX64ToPrice(data.sqrtPrice, decA, decB).toNumber();
  const lamportsIn = Math.round(amountSol * LAMPORTS_PER_SOL);

  const quote = await swapQuoteByInputToken(
    pool,
    data.tokenMintA,
    new BN(lamportsIn),
    Percentage.fromFraction(50, 10_000),
    ctx.program.programId,
    ctx.fetcher,
    undefined
  );
  const out = Number(quote.estimatedAmountOut.toString()) / 10 ** decB;
  const minOut = Number(quote.otherAmountThreshold.toString()) / 10 ** decB;
  const execPrice = out / amountSol;
  return {
    ok: true,
    network,
    pool: ORCA_DEVNET_SOL_DEVUSDC,
    explorer: explorerUrl("address", ORCA_DEVNET_SOL_DEVUSDC, network),
    pair: "SOL / devUSDC",
    tickSpacing: data.tickSpacing,
    currentTick: data.tickCurrentIndex,
    feeRatePct: data.feeRate / 10_000,
    liquidity: data.liquidity.toString(),
    spotPrice: spot,
    amountInSol: amountSol,
    estimatedOut: out,
    minimumOutAtSlippage: minOut,
    slippageBps: 50,
    executionPrice: execPrice,
    priceImpactPct: spot > 0 ? Number((((spot - execPrice) / spot) * 100).toFixed(4)) : null,
    estimatedFeeIn: Number(quote.estimatedFeeAmount.toString()) / 10 ** decA,
  };
}
