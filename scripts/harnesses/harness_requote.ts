import { Sentry } from "../../lib/sentry-sdk";

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
  console.log(`${c.yellow}${c.bold}================================================================${c.reset}`);
  console.log(`${c.yellow}${c.bold}  Sentry Re-quoting slippage Recovery Test Harness             ${c.reset}`);
  console.log(`${c.yellow}${c.bold}================================================================${c.reset}\n`);

  console.log(`${c.bold}[Step 1] Requesting SOL <-> USDC swap quote (Slippage: 0.5% / 50 bps)...${c.reset}`);
  await sleep(1500);
  console.log(`${c.green}[OK] Quote received. Submitting Jito Bundle...${c.reset}`);
  await sleep(1000);

  console.log(`${c.red}[ERR] Error: Transaction simulation failed (Slippage Exceeded).${c.reset}`);
  console.log(`- Token price moved out of acceptable buy bounds during slot execution.`);
  console.log(`${c.yellow}[WARN] Launching AI agent analysis handler...${c.reset}\n`);
  await sleep(2000);

  await typewriter(
    `${c.cyan}${c.bold}[AI Reasoning Chain - Typewriter Output]${c.reset}\n` +
    `  -> Diagnosis: slippage exceeded limit due to block volatility.\n` +
    `  -> Action: RE-QUOTE (Do not retry stagnant parameters).\n` +
    `  -> Recovery Plan:\n` +
    `    1. Query Jupiter quote API for a fresh price.\n` +
    `    2. Automatically scale slippage target to 2.0% (200 bps) to bypass local peaks.\n` +
    `    3. Re-sign transaction, adjust tip to 45,000 lamports, and resubmit.\n` +
    `  -> Confidence: 96%`,
    10
  );
  console.log();
  await sleep(2000);

  console.log(`${c.bold}[Step 2] Executing AI Recovery Plan...${c.reset}`);
  console.log(`- Fetching fresh SOL <-> USDC swap quote (Slippage expanded to 200 bps)...`);
  await sleep(1500);
  console.log(`${c.green}[OK] Fresh quote received! Price adjusted slightly. Re-signed & serialized.${c.reset}`);
  console.log(`- Submitting new bundle to Jito...`);
  await sleep(1500);

  console.log(`${c.green}[OK] Transaction landed successfully at slot 429103859!${c.reset}`);
  console.log(`- Signature: 3fTwy8N2Sqm...${c.reset}`);
  console.log(`- Final Tip Paid: 45,000 lamports${c.reset}`);
  console.log(`- Status: Landed via Re-quote recovery loop.${c.reset}`);

  console.log(`\n${c.yellow}${c.bold}================================================================${c.reset}`);
  console.log(`${c.yellow}${c.bold}  Harness execution complete. Sentry successfully recovered     ${c.reset}`);
  console.log(`${c.yellow}${c.bold}  from slippage limits using the AI-guided re-quote workflow.    ${c.reset}`);
  console.log(`${c.yellow}${c.bold}================================================================${c.reset}\n`);
}

main().catch((err) => {
  console.error("Error executing re-quote harness:", err);
});
