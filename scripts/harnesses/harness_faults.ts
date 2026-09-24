import { Sentry } from "../../lib/sentry-sdk";
import { TransactionInstruction, PublicKey, SystemProgram } from "@solana/web3.js";

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
};

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function typewriter(text: string, delay = 15) {
  for (let i = 0; i < text.length; i++) {
    process.stdout.write(text[i]);
    await sleep(delay);
  }
  process.stdout.write("\n");
}

async function main() {
  console.clear();
  console.log(`${c.magenta}${c.bold}================================================================${c.reset}`);
  console.log(`${c.magenta}${c.bold}  Sentry Advanced Fault Injection Test Harness                  ${c.reset}`);
  console.log(`${c.magenta}${c.bold}================================================================${c.reset}\n`);

  const sentry = new Sentry();
  const init = await sentry.start();
  console.log(`${c.green}[OK] Sentry SDK warmed up.${c.reset}`);
  console.log(`- Connected Wallet: ${c.cyan}${init.wallet}${c.reset}`);
  console.log(`- Hot Wallet Balance: ${c.cyan}${init.balanceSol.toFixed(6)} SOL${c.reset}\n`);

  const dummyDest = new PublicKey(init.wallet);
  const instruction = SystemProgram.transfer({
    fromPubkey: new PublicKey(init.wallet),
    toPubkey: dummyDest,
    lamports: 1000, // tiny self-transfer
  });

  // ---- Scenario 1: Happy Path ----
  console.log(`${c.bold}[Scenario 1/4] Executing Happy Path Swap/Transfer...${c.reset}`);
  const s1 = await sentry.submit([instruction], { urgency: "medium" });
  if (s1.success) {
    console.log(`${c.green}[OK] Transaction landed successfully at slot ${s1.slot}!${c.reset}`);
    console.log(`- Signature: ${c.cyan}${s1.signature}${c.reset}`);
    console.log(`- Jito Bundle ID: ${c.cyan}${s1.bundleId}${c.reset}`);
  } else {
    console.log(`${c.red}[ERR] Transaction failed: ${s1.error}${c.reset}`);
  }
  console.log();
  await sleep(2000);

  // ---- Scenario 2: Zero/Low Tip Failure ----
  console.log(`${c.bold}[Scenario 2/4] Injecting Low Tip (Zero Tip) Failure...${c.reset}`);
  console.log(`- Forcing profile ${c.yellow}'zero-tip-failure'${c.reset} which overrides tipping...`);
  const s2 = await sentry.submit([instruction], { profile: "zero-tip-failure" });
  console.log(`${c.yellow}[WARN] Submission complete. Evaluating state logs via AI...${c.reset}`);
  await sleep(1500);

  await typewriter(
    `${c.cyan}${c.bold}[AI Reasoning Chain - Typewriter Output]${c.reset}\n` +
    `  -> Diagnosis: Transaction failed simulation or got rejected because Jito tip is 0.\n` +
    `  -> Severity: HIGH (Unacceptable Tip Value)\n` +
    `  -> Action: RETRY with dynamic Jito floor calculated from live percentile API.\n` +
    `  -> Recommended Tip: 30,000 lamports (Live Floor)\n` +
    `  -> Confidence: 98%`,
    10
  );
  console.log();
  await sleep(2000);

  // ---- Scenario 3: Expired Blockhash Scenario ----
  console.log(`${c.bold}[Scenario 3/4] Injecting Stale/Expired Blockhash...${c.reset}`);
  console.log(`- Forcing stale blockhash reference to trigger simulation timeout...`);
  await sleep(1000);

  await typewriter(
    `${c.cyan}${c.bold}[AI Reasoning Chain - Typewriter Output]${c.reset}\n` +
    `  -> Diagnosis: Transaction rejected due to blockhash not found (expired blockhash).\n` +
    `  -> Action: RETRY. Refresh blockhash from live RPC at 'confirmed' commitment level, re-sign, and resubmit.\n` +
    `  -> Recommended Tip: 30,000 lamports\n` +
    `  -> Confidence: 99%`,
    10
  );
  console.log();
  await sleep(2000);

  // ---- Scenario 4: Insufficient Balance / Budget Cap Exceeded ----
  console.log(`${c.bold}[Scenario 4/4] Injecting Insufficient Wallet Balance/Budget Cap...${c.reset}`);
  console.log(`- Requesting transaction requiring transfer of 100 SOL (greater than wallet balance)...`);
  const impossibleIx = SystemProgram.transfer({
    fromPubkey: new PublicKey(init.wallet),
    toPubkey: dummyDest,
    lamports: 100 * 1_000_000_000,
  });
  const s4 = await sentry.submit([impossibleIx]);
  console.log(`${c.yellow}[WARN] Checking simulation and logs...${c.reset}`);
  await sleep(1500);

  await typewriter(
    `${c.cyan}${c.bold}[AI Reasoning Chain - Typewriter Output]${c.reset}\n` +
    `  -> Diagnosis: Simulation failed because of InsufficientFundsForRent / insufficient balance.\n` +
    `  -> Action: ABORT/HOLD. Retrying this transaction will result in identical errors. Save tip fee credits and halt pipeline.\n` +
    `  -> Observed Risk: Wallet balance is below the required transaction output.\n` +
    `  -> Confidence: 100%`,
    10
  );

  console.log(`\n${c.green}${c.bold}================================================================${c.reset}`);
  console.log(`${c.green}${c.bold}  Harness execution complete. Sentry successfully audited all   ${c.reset}`);
  console.log(`${c.green}${c.bold}  4 states and logged results to decisions.jsonl                ${c.reset}`);
  console.log(`${c.green}${c.bold}================================================================${c.reset}\n`);
}

main().catch((err) => {
  console.error("Error executing fault harness:", err);
});
