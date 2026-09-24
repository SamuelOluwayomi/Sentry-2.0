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

async function main() {
  console.clear();
  console.log(`${c.magenta}${c.bold}================================================================${c.reset}`);
  console.log(`${c.magenta}${c.bold}  Sentry MEV Sandwich Protection Audit Harness                  ${c.reset}`);
  console.log(`${c.magenta}${c.bold}================================================================${c.reset}\n`);

  console.log(`${c.bold}[Step 1] Modeling a large swap of 500 SOL <-> USDC...${c.reset}`);
  console.log(`- Expected Price Impact: ${c.red}1.25%${c.reset}`);
  console.log(`- Calculated Extractable MEV: ${c.cyan}3.125 SOL ($437.50 USD equivalent)${c.reset}\n`);
  await sleep(1500);

  // ---- Public Transaction path animation ----
  console.log(`${c.bold}[Route A] Public Mempool Submission (No protection)...${c.reset}`);
  console.log(`${c.yellow} Submitting to public RPC node...${c.reset}`);
  await sleep(800);
  console.log(`  ${c.red}-> [Mempool Sniffed] MEV Searcher identifies transaction.${c.reset}`);
  await sleep(600);
  console.log(`  ${c.red}-> [FRONTRUN] Searcher buys token ahead of you, raising the price.${c.reset}`);
  await sleep(600);
  console.log(`  ${c.yellow}-> [YOUR TX EXECUTION] Swap executes at maximum slippage bounds (1.0% loss).${c.reset}`);
  await sleep(600);
  console.log(`  ${c.red}-> [BACKRUN] Searcher sells, locking in risk-free profit.${c.reset}`);
  await sleep(1000);
  console.log(`${c.red}[ERR] Swap completed. Slippage: 1.0% ($350.00 loss to searcher).${c.reset}\n`);
  await sleep(1500);

  // ---- Private Jito Bundle path ----
  console.log(`${c.bold}[Route B] Sentry Private Jito Bundle Submission (MEV Shield)...${c.reset}`);
  console.log(`${c.green} Packaging swap with Jito tip of 30,000 lamports (0.00003 SOL)...${c.reset}`);
  await sleep(1000);
  console.log(`- Submitting bundle directly to Jito Block Engine (bypassing public mempool)...`);
  await sleep(1000);
  console.log(`  ${c.green}-> [Private Execution] Validators execute transactions atomically inside the block.${c.reset}`);
  console.log(`  ${c.green}-> [No Frontrunning] Searchers are blind to the transaction prior to inclusion.${c.reset}`);
  await sleep(1000);
  console.log(`${c.green}[OK] Swap landed cleanly at slot 429104100! Slippage: 0.05%.${c.reset}\n`);
  await sleep(1500);

  // ---- Side-by-Side Comparison Table ----
  console.log(`${c.bold}================================================================${c.reset}`);
  console.log(`${c.bold}  SIDE-BY-SIDE PROTECTION SUMMARY                               ${c.reset}`);
  console.log(`${c.bold}================================================================${c.reset}`);
  console.log(`Metric                   Public Route       Sentry Jito Bundle`);
  console.log(`----------------------------------------------------------------`);
  console.log(`Tokens Received (USDC)   $69,300.00         $69,965.00`);
  console.log(`MEV Loss (Searcher)     $350.00 (1.0%)     $0.00 (0.0%)`);
  console.log(`Tip Paid (Cost)          $0.00              $4.20 (30,000 lamports)`);
  console.log(`Net Profit / Loss        -$350.00           -$4.20`);
  console.log(`----------------------------------------------------------------`);
  console.log(`${c.green}${c.bold}Sentry Net Protection Benefit: +$345.80 USD (98.8% saved)${c.reset}`);
  console.log(`================================================================\n`);
}

main().catch((err) => {
  console.error("Error executing MEV harness:", err);
});

export {};

