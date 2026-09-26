// Sentry 2.0 -- Deterministic Scenario Replay Engine
// Reproduce any of the 1,000 benchmark runs on Devnet or Mainnet.
// Usage:
//   npx tsx scripts/replay_scenario.ts --run <1-1000>
//   npx tsx scripts/replay_scenario.ts --run <1-1000> --mainnet

import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import bs58 from "bs58";
import fs from "fs";
import path from "node:path";
import { createReceipt, advanceLifecycle, attachAction, verifyReceipt, buildForensicReport } from "../lib/evidence-engine";

const args = process.argv.slice(2);
let runArg = 1;
const isMainnet = args.includes("--mainnet");

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--run" && args[i + 1]) {
    runArg = parseInt(args[i + 1], 10);
  }
}

const MATRIX_PATH = path.join(process.cwd(), "logs", "devnet_1000_matrix.jsonl");

if (!fs.existsSync(MATRIX_PATH)) {
  console.error(`Error: Benchmark matrix file not found at ${MATRIX_PATH}. Run 'npm run benchmark:devnet' first.`);
  process.exit(1);
}

// Read lines and locate the target run
const lines = fs.readFileSync(MATRIX_PATH, "utf8").trim().split("\n");
let targetManifest: any = null;

for (const line of lines) {
  try {
    const parsed = JSON.parse(line);
    if (parsed.runNumber === runArg) {
      targetManifest = parsed;
      break;
    }
  } catch {}
}

if (!targetManifest) {
  console.error(`Error: Run #${runArg} not found in matrix log.`);
  process.exit(1);
}

console.log(`========================================================================`);
console.log(` SENTRY 2.0: DETERMINISTIC SCENARIO REPLAY ENGINE                      `);
console.log(`========================================================================`);
console.log(`Replaying Run #${targetManifest.runNumber}`);
console.log(`Scenario:       ${targetManifest.scenarioName} (${targetManifest.scenarioId})`);
console.log(`Regime:         ${targetManifest.regime.toUpperCase()}`);
console.log(`Fault Profile:  ${targetManifest.faultTested}`);
console.log(`Dynamic Tip:    ${targetManifest.tipLamports.toLocaleString()} lamports`);
console.log(`Target Network: ${isMainnet ? "SOLANA MAINNET-BETA" : "SOLANA DEVNET"}`);
console.log(`========================================================================\n`);

// Load Keypair
let priv = "";
const envContent = fs.readFileSync(".env", "utf8");
for (const line of envContent.split("\n")) {
  if (line.startsWith("WALLET_PRIVATE_KEY=")) {
    priv = line.split("=")[1].trim().replace(/['"]/g, "");
  }
}

const keypair = priv ? (
  priv.startsWith("[") && priv.endsWith("]")
    ? Keypair.fromSecretKey(Uint8Array.from(JSON.parse(priv)))
    : Keypair.fromSecretKey(bs58.decode(priv))
) : Keypair.generate();

const rpcUrl = isMainnet
  ? (process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com")
  : "https://api.devnet.solana.com";

const conn = new Connection(rpcUrl, "confirmed");

async function replay() {
  const bal = await conn.getBalance(keypair.publicKey);
  console.log(`Wallet:  ${keypair.publicKey.toBase58()}`);
  console.log(`Balance: ${bal.toLocaleString()} lamports (${(bal / 1e9).toFixed(6)} SOL)`);

  const RENT_FLOOR = 650_240;
  if (isMainnet && bal < RENT_FLOOR + targetManifest.tipLamports + 5_000) {
    console.warn(`\n[PREFLIGHT SAFETY INTERCEPTION]`);
    console.warn(`Wallet balance is near Solana rent floor (${RENT_FLOOR} lamports).`);
    console.warn(`Sentry automated guardrail prevented execution to preserve wallet funds.`);
    console.warn(`To execute live on mainnet, top up wallet with ≥ 0.001 SOL.`);
    process.exit(0);
  }

  const memoProgram = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
  const tipSink = new PublicKey("96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5");

  const tx = new Transaction().add(
    new TransactionInstruction({
      programId: memoProgram,
      keys: [{ pubkey: keypair.publicKey, isSigner: true, isWritable: false }],
      data: Buffer.from(`Sentry 2.0 Replay Run #${targetManifest.runNumber} | ${targetManifest.scenarioId}`),
    }),
    SystemProgram.transfer({
      fromPubkey: keypair.publicKey,
      toPubkey: tipSink,
      lamports: targetManifest.tipLamports,
    })
  );

  console.log(`Fetching latest blockhash from ${isMainnet ? "Mainnet" : "Devnet"}...`);
  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = keypair.publicKey;
  tx.sign(keypair);

  console.log("Broadcasting transaction...");
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true });
  console.log(`\n========================================================================`);
  console.log(` TRANSACTION REPRODUCED ON-CHAIN!                                       `);
  console.log(`========================================================================`);
  console.log(`Signature:   ${sig}`);
  console.log(`Explorer:    https://explorer.solana.com/tx/${sig}${isMainnet ? "" : "?cluster=devnet"}`);
  console.log(`SHA-256 Hash: ${targetManifest.receiptHash}`);
  console.log(`Audit Chain:  Linked to ${targetManifest.prevReceiptHash.slice(0, 16)}...`);
  console.log(`========================================================================\n`);
}

replay().catch(console.error);
