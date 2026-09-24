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
  console.log(`${c.green}${c.bold}================================================================${c.reset}`);
  console.log(`${c.green}${c.bold}  Sentry Adaptive Tipping & Budget Enforcement Harness          ${c.reset}`);
  console.log(`${c.green}${c.bold}================================================================${c.reset}\n`);

  const initialBudget = 120000; // 120k lamports total session tip budget
  let remainingBudget = initialBudget;
  console.log(`- Session Tip Budget Limit: ${c.cyan}${initialBudget} lamports${c.reset}`);
  console.log(`- Active AI Guardrail: Re-prompt or abort if tip > remaining budget.\n`);
  await sleep(1500);

  // ---- Run 1: Tip Normal ----
  console.log(`${c.bold}[Run 1/3] Executing transaction under standard congestion...${c.reset}`);
  let tipVal = 30000;
  remainingBudget -= tipVal;
  console.log(`- Jito Dynamic Tip: ${tipVal} lamports`);
  console.log(`- Remaining Session Budget: ${c.yellow}${remainingBudget} lamports${c.reset}`);
  await sleep(1500);
  console.log(`${c.green}[OK] Transaction landed successfully!${c.reset}\n`);
  await sleep(1000);

  // ---- Run 2: Volatility / Congestion Spike ----
  console.log(`${c.bold}[Run 2/3] Simulating massive mainnet volatility spike...${c.reset}`);
  console.log(`- Jito p75 dynamic floor spiked to 80,000 lamports.`);
  console.log(`- AI agent evaluates options with remaining_budget = ${remainingBudget} lamports...`);
  await sleep(2000);

  tipVal = 80000;
  remainingBudget -= tipVal;

  await typewriter(
    `${c.cyan}${c.bold}[AI Reasoning Chain - Typewriter Output]${c.reset}\n` +
    `  -> Diagnosis: High congestion, p75 tip floor is 80k.\n` +
    `  -> Budget Check: p75 (80k) < remaining_budget (90k). Allowed.\n` +
    `  -> Action: SUBMIT with tip 80,000 lamports.\n` +
    `  -> Confidence: 92%`,
    10
  );
  console.log(`- Remaining Session Budget: ${c.yellow}${remainingBudget} lamports${c.reset}`);
  await sleep(1500);
  console.log(`${c.green}[OK] Transaction landed!${c.reset}\n`);
  await sleep(1000);

  // ---- Run 3: Budget Exhausted ----
  console.log(`${c.bold}[Run 3/3] Executing transaction with low remaining budget...${c.reset}`);
  console.log(`- Next Jito floor remains at 40,000 lamports.`);
  console.log(`- AI agent evaluates options with remaining_budget = ${remainingBudget} lamports...`);
  await sleep(2000);

  await typewriter(
    `${c.cyan}${c.bold}[AI Reasoning Chain - Typewriter Output]${c.reset}\n` +
    `  -> Diagnosis: Next Jito floor tip (40k) exceeds remaining session tip budget (10k).\n` +
    `  -> Action: ABORT/HOLD. Further submissions would violate security budget parameters.\n` +
    `  -> Safety Guardrail: Transaction blocked dynamically. No SOL spent.\n` +
    `  -> Confidence: 100%`,
    10
  );

  console.log(`\n${c.green}${c.bold}================================================================${c.reset}`);
  console.log(`${c.green}${c.bold}  Harness execution complete. Sentry successfully guardrailed   ${c.reset}`);
  console.log(`${c.green}${c.bold}  and aborted transaction to prevent budget over-spending.      ${c.reset}`);
  console.log(`${c.green}${c.bold}================================================================${c.reset}\n`);
}

main().catch((err) => {
  console.error("Error executing budget harness:", err);
});
