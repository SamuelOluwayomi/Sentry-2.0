#!/usr/bin/env node

/**
 * Sentry CLI (sentry)
 * 
 * An installable CLI to run, manage, and inspect the Smart Transaction Stack.
 * Support commands: run, engine, agent, dashboard, status, evidence, docker-up.
 */

const { spawn, execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const https = require("https");

// Color helper codes
const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  white: "\x1b[97m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  blue: "\x1b[34m",
  dim: "\x1b[2m",
};

const projectRoot = __dirname;
const solami = require("./scripts/cli-solami");

// ---------------------------------------------------------------------------
// Config & Env Loader
// ---------------------------------------------------------------------------

function loadEnv() {
  const envPaths = [
    path.join(projectRoot, ".env"),
    path.join(projectRoot, "engine", ".env"),
  ];
  for (const p of envPaths) {
    if (!fs.existsSync(p)) continue;
    const lines = fs.readFileSync(p, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("="))
        continue;
      const idx = trimmed.indexOf("=");
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed
        .slice(idx + 1)
        .trim()
        .replace(/^['"]|['"]$/g, "");
      process.env[key] = val;
    }
  }
}

loadEnv();

// Helper to check if a command exists in the environment
function commandExists(cmd) {
  try {
    const checkCmd = process.platform === "win32" ? `where ${cmd}` : `which ${cmd}`;
    execSync(checkCmd, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// CLI ASCII Header
// ---------------------------------------------------------------------------
function printHeader() {
  const c = colors;
  console.log('');
  console.log(`${c.magenta}${c.reset}`);
  console.log(`${c.magenta}${c.reset}                                                               ${c.magenta}${c.reset}`);
  console.log(`${c.magenta}${c.reset}  ${c.cyan}███████╣███████╣███╝  ██╗████████╣██████╗ ██╗   ██╗${c.reset}   ${c.magenta}${c.reset}`);
  console.log(`${c.magenta}${c.reset}  ${c.cyan}██╔════╝██╔════╝████╝ ██║╚══██╔══╝██╔══██╗╚██╝ ██╔╝${c.reset}   ${c.magenta}${c.reset}`);
  console.log(`${c.magenta}${c.reset}  ${c.cyan}███████╣█████╣  ██╔██╝██║   ██║   ██████╔╝ ╚████╔╝ ${c.reset}   ${c.magenta}${c.reset}`);
  console.log(`${c.magenta}${c.reset}  ${c.cyan}╚════██║██╔══╝  ██║╚████║   ██║   ██╔══██╗  ╚██╔╝  ${c.reset}   ${c.magenta}${c.reset}`);
  console.log(`${c.magenta}${c.reset}  ${c.cyan}███████║███████╣██║ ╚███║   ██║   ██║  ██║   ██║   ${c.reset}   ${c.magenta}${c.reset}`);
  console.log(`${c.magenta}${c.reset}  ${c.cyan}╚══════╝╚══════╝╚═╝  ╚══╝   ╚═╝   ╚═╝  ╚═╝   ╚═╝   ${c.reset}  ${c.magenta}${c.reset}`);
  console.log(`${c.magenta}${c.reset}                                                               ${c.magenta}${c.reset}`);
  console.log(`${c.magenta}${c.reset}  ${c.bold}${c.white}Smart Transaction Stack${c.reset} ${c.dim}— Advanced Infrastructure Challenge${c.reset}  ${c.magenta}${c.reset}`);
  console.log(`${c.magenta}${c.reset}                                                               ${c.magenta}${c.reset}`);
  console.log(`${c.magenta}${c.reset}  ${c.dim}             Superteam Nigeria  •  Solana Mainnet${c.reset}           ${c.magenta}${c.reset}`);
  console.log(`${c.magenta}${c.reset}`);
  console.log('');
}

// Help Menu
function showHelp() {
  printHeader();
  console.log(`${colors.bold}Usage:${colors.reset} sentry <command> [options]`);
  console.log("\nSolami Live Infrastructure Commands:");
  console.log(`  ${colors.green}status${colors.reset}                   Solami RPC slot, cluster, Beam tip accounts, wallet headroom, ledger summaries`);
  console.log(`  ${colors.green}check${colors.reset}                    5-second live diagnostic (RPC, Beam, wallet, signing)`);
  console.log(`  ${colors.green}monitor${colors.reset}                  Stream live slots and Beam tip conditions`);
  console.log(`  ${colors.green}benchmark <net> [--yes]${colors.reset}  Run the mainnet (100, needs --yes, spends SOL) or devnet (1,020) matrix`);
  console.log(`  ${colors.green}replay <N> [--mainnet]${colors.reset}   Replay a run from the benchmark ledger`);
  console.log(`  ${colors.green}ledger [mainnet|devnet]${colors.reset}  Recompute receipt hash chains and HMAC signatures`);
  console.log(`  ${colors.green}verify <signature>${colors.reset}       On-chain lookup + ledger cross-reference + Beam tip detection`);
  console.log("\nStatus/Inspection Commands:");
  console.log(`  ${colors.green}evidence${colors.reset}                 Generate a judge-ready markdown report (evidence.md)`);
  console.log(`  ${colors.green}ask [query]${colors.reset}              Ask the AI agent a question or open an interactive chat session`);
  console.log(`  ${colors.green}analyze${colors.reset}                 Generate an autonomous system diagnostic audit report`);
  console.log("\nDaemon Run & Testing Commands:");
  console.log(`  ${colors.green}run [--count <N>]${colors.reset}       Start all 3 services concurrently (optional loop count limit)`);
  console.log(`  ${colors.green}fail-test <type>${colors.reset}         Inject failure run to verify AI classification ('zero-tip' | 'expired-hash')`);
  console.log(`  ${colors.green}engine${colors.reset}                   Compile & run the Rust bundle submission engine`);
  console.log(`  ${colors.green}agent${colors.reset}                    Run the AI agent reasoning daemon`);
  console.log(`  ${colors.green}dashboard${colors.reset}                Start Next.js dashboard console`);
  console.log(`  ${colors.green}docs${colors.reset}                     Start Docusaurus documentation site`);
  console.log("\nDeveloper Integration Commands:");
  console.log(`  ${colors.green}serve${colors.reset}                    Start standalone developer API server`);
  console.log("\nDocker Integration Commands:");
  console.log(`  ${colors.green}docker-up${colors.reset}                Spin up the complete containerized stack via Docker Compose`);
  console.log("");
}

// ---------------------------------------------------------------------------
// Commands Implementation
// ---------------------------------------------------------------------------

// 1. Status Command
// Helper to calculate deterministic statistics from logs
function calculateStats(runs) {
  const landed = runs.filter(r => r.status === "Landed");
  const failed = runs.filter(r => r.status === "Failed");
  const invalid = runs.filter(r => r.status === "Invalid");
  const total = runs.length;

  const getMedian = (arr) => {
    if (arr.length === 0) return 0;
    const sorted = arr.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  };

  const getAverage = (arr) => {
    if (arr.length === 0) return 0;
    const sum = arr.reduce((sum, v) => sum + v, 0);
    return Math.round(sum / arr.length);
  };

  const landingTimes = landed
    .filter(r => r.submitted_at && r.landed_at)
    .map(r => new Date(r.landed_at).getTime() - new Date(r.submitted_at).getTime());
  const avgLanding = getAverage(landingTimes);
  const medianLanding = getMedian(landingTimes);

  const procToConfTimes = runs
    .filter(r => r.processed_at && r.confirmed_at)
    .map(r => new Date(r.confirmed_at).getTime() - new Date(r.processed_at).getTime());
  const avgProcToConf = getAverage(procToConfTimes);
  const medianProcToConf = getMedian(procToConfTimes);

  const confToFinalTimes = runs
    .filter(r => r.confirmed_at && r.finalized_at)
    .map(r => new Date(r.finalized_at).getTime() - new Date(r.confirmed_at).getTime());
  const avgConfToFinal = getAverage(confToFinalTimes);
  const medianConfToFinal = getMedian(confToFinalTimes);

  const slotDeltas = landed
    .filter(r => r.submit_slot !== undefined && r.landed_slot !== undefined && r.submit_slot !== null && r.landed_slot !== null)
    .map(r => r.landed_slot - r.submit_slot);
  const avgSlotDelta = getAverage(slotDeltas);
  const medianSlotDelta = getMedian(slotDeltas);

  const submitToFinalizedDeltas = landed
    .filter(r => r.submitted_at && r.finalized_at)
    .map(r => new Date(r.finalized_at).getTime() - new Date(r.submitted_at).getTime());
  const avgSubmitToFinal = getAverage(submitToFinalizedDeltas);
  const medianSubmitToFinal = getMedian(submitToFinalizedDeltas);

  const delayedLandings = slotDeltas.filter(d => d > 2).length;
  const skippedSlotImpactPct = slotDeltas.length ? ((delayedLandings / slotDeltas.length) * 100).toFixed(1) : "0.0";

  const yellowstoneCount = runs.filter(r => r.confirmation_source === "yellowstone_stream").length;
  const fallbackCount = runs.filter(r => r.confirmation_source && r.confirmation_source.includes("rpc")).length;

  const failureCounts = {};
  runs.forEach(r => {
    if (r.status === "Failed" || r.status === "Invalid") {
      const type = r.failure_type || r.error_reason || "unknown";
      failureCounts[type] = (failureCounts[type] || 0) + 1;
    }
  });

  return {
    total,
    landedCount: landed.length,
    failedCount: failed.length,
    invalidCount: invalid.length,
    landedRate: total ? ((landed.length / total) * 100).toFixed(1) : "0.0",
    avgLanding,
    medianLanding,
    avgProcToConf,
    medianProcToConf,
    avgConfToFinal,
    medianConfToFinal,
    avgSlotDelta,
    medianSlotDelta,
    avgSubmitToFinal,
    medianSubmitToFinal,
    skippedSlotImpactPct,
    yellowstoneCount,
    fallbackCount,
    failureCounts
  };
}

function printStatsBlock(stats) {
  console.log(`${colors.bold}SENTRY PIPELINE PERFORMANCE METRICS (召 DETERMINISTIC STATS)${colors.reset}`);
  console.log(`----------------------------------------------------------------------`);
  console.log(`Total Recorded Bundle Runs:         ${colors.bold}${stats.total}${colors.reset}`);
  console.log(`Landed (Success) Bundles:           ${colors.green}${stats.landedCount}${colors.reset} (${stats.landedRate}%)`);
  console.log(`Failed / Invalid Bundles:           ${colors.red}${stats.failedCount + stats.invalidCount}${colors.reset}`);
  console.log(`----------------------------------------------------------------------`);
  console.log(`processed -> confirmed latency:     ${colors.cyan}Avg: ${stats.avgProcToConf}ms | Median: ${stats.medianProcToConf}ms${colors.reset}`);
  console.log(`submit -> landed slot delta:        ${colors.cyan}Avg: ${stats.avgSlotDelta.toFixed(1)} slots | Median: ${stats.medianSlotDelta} slots${colors.reset}`);
  console.log(`submit -> finalized (risk window):   ${colors.cyan}Avg: ${(stats.avgSubmitToFinal / 1000).toFixed(2)}s | Median: ${(stats.medianSubmitToFinal / 1000).toFixed(2)}s${colors.reset}`);
  console.log(`Skipped Slot / Delayed Inclusion:   ${colors.yellow}${stats.skippedSlotImpactPct}% of runs took > 2 slots to land${colors.reset}`);
  console.log(`----------------------------------------------------------------------`);
  console.log(`Confirmation Sources:               Yellowstone: ${stats.yellowstoneCount} | RPC Fallback: ${stats.fallbackCount}`);

  const failTypes = Object.entries(stats.failureCounts);
  if (failTypes.length > 0) {
    console.log(`Failure Categories Observed:`);
    failTypes.forEach(([type, count]) => {
      console.log(`  - ${colors.red}${type}${colors.reset}: ${count} time(s)`);
    });
  } else {
    console.log(`Failure Categories Observed:        ${colors.green}None${colors.reset}`);
  }
  console.log(`----------------------------------------------------------------------\n`);
}

// 2. Evidence Command
function runEvidence() {
  printHeader();

  const logPath = process.env.LIFECYCLE_LOG_PATH || path.join(projectRoot, "engine", "lifecycle_log.jsonl");
  const decisionsPath = process.env.AGENT_DECISIONS_PATH || path.join(projectRoot, "agent_decisions.jsonl");
  const exportPath = path.join(process.cwd(), "evidence.md");

  if (!fs.existsSync(logPath)) {
    console.error(`${colors.red}Error: No lifecycle log found at ${logPath}. Run the engine first!${colors.reset}`);
    process.exit(1);
  }

  const runs = fs.readFileSync(logPath, "utf8")
    .split(/\n/)
    .filter(Boolean)
    .map(line => JSON.parse(line));

  const decisions = fs.existsSync(decisionsPath)
    ? fs.readFileSync(decisionsPath, "utf8")
      .split(/\n/)
      .filter(Boolean)
      .map(line => JSON.parse(line))
    : [];

  const stats = calculateStats(runs);

  const fmtDelta = (a, b) => {
    if (!a || !b) return "--";
    return `${new Date(b).getTime() - new Date(a).getTime()}ms`;
  };

  const markdownContent = `# Sentry Smart Transaction Stack - Operational Evidence

Generated: ${new Date().toISOString()}

This document serves as the judge-ready submission report for the **Sentry** transaction pipeline. It compiles live statistics from recent runs, traces multi-stage confirmations, lists failure recovery actions, and directly answers the bounty's technical questions.

---

## Executive Performance Summary

- **Total Recorded runs**: ${stats.total}
- **Landed (Success)**: ${stats.landedCount}
- **Failed / Invalid**: ${stats.failedCount + stats.invalidCount}
- **Landed Success Rate**: ${stats.landedRate}%
- **Median Landing Latency (submit -> landed)**: ${stats.medianLanding}ms
- **Median processed -> confirmed Latency**: ${stats.medianProcToConf}ms
- **Median confirmed -> finalized Latency**: ${stats.medianConfToFinal}ms
- **Median Submit -> Landed Slot Delta**: ${stats.medianSlotDelta} slots (Average: ${stats.avgSlotDelta.toFixed(1)} slots)
- **Yellowstone Geyser Confirmations**: ${stats.yellowstoneCount}
- **RPC Polling Fallback Confirmations**: ${stats.fallbackCount}

---

## Technical Bounty Questions

### Q1: What does the delta between processed_at and confirmed_at tell you?

Based on our live operations, the delta between \`processed_at\` and \`confirmed_at\` represents the consensus voting latency of the Solana validator network. In our telemetry, we recorded a **median processed -> confirmed delta of ${stats.medianProcToConf}ms**.
- A small delta (like our observed ${stats.medianProcToConf}ms) shows that the network is healthy and vote transactions are propagating and landing almost instantly.
- In congested conditions, this delta rises. Our AI agent actively tracks this value: if the delta spikes, it indicates vote queue congestion, prompting the agent to dynamically increase our Jito tip parameters to ensure our bundles are prioritized in incoming blocks.

### Q2: Why should you never use finalized commitment for your blockhash in time-sensitive transactions?

Solana blockhashes expire exactly 150 slots after their creation. A slot takes roughly 400ms, meaning a blockhash is valid for about 60 seconds.
- A block is \`finalized\` only after it achieves supermajority voting depth, which takes about 31 slots (~12.8 seconds).
- If you request the \`Finalized\` blockhash, you are receiving a blockhash that is already ~31 slots (~12.8 seconds) old. This instantly destroys over **20%** of your transaction's validity window.
- In time-sensitive operations, using a \`Processed\` or \`Confirmed\` blockhash gives the maximum possible duration (the full 150 slots) to propagate, land, or retry the transaction. Our stack measured a **median submit -> finalized time of ${(stats.medianSubmitToFinal / 1000).toFixed(2)} seconds**, proving that while finalization takes time, starting with a fresh processed blockhash guarantees a safe risk margin.

### Q3: What happens to your bundle if the Jito leader skips their slot?

If the scheduled Jito leader skips their slot, that block is never produced, and any bundle targeted for that leader is discarded.
- In our stack, the Jito Block Engine handles this by attempting to forward the bundle to the subsequent Jito leader if the blockhash remains valid.
- We measured that **${stats.skippedSlotImpactPct}% of our landed runs** experienced landing delays of greater than 2 slots. This delay correlates directly with skipped leader slots or minor network propagation lags.
- Under such conditions, Sentry's Rust Engine automatically refreshes the blockhash and tip premium if landing is delayed beyond Jito's inclusion limits, ensuring maximum reliability.

---

## Multi-Stage Transaction Lifecycle Log

Below is the verification table of all submissions in the lifecycle log:

| Run | Status | Confirmation Source | Tip (lamports) | Submit Slot | Landed Slot | Slot Delta | Proc->Conf | Conf->Final | Signature | Failure Type | Recovery / Action |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
${runs.sort((a, b) => a.run_number - b.run_number).map(run => {
    const sig = run.signature ? `[${run.signature.slice(0, 8)}...](https://solscan.io/tx/${run.signature})` : "";
    const slotDelta = (run.submit_slot !== undefined && run.landed_slot !== undefined && run.submit_slot !== null && run.landed_slot !== null)
      ? (run.landed_slot - run.submit_slot)
      : "--";
    const p2c = fmtDelta(run.processed_at, run.confirmed_at);
    const c2f = fmtDelta(run.confirmed_at, run.finalized_at);
    return `| ${run.run_number} | ${run.status} | ${run.confirmation_source ?? "--"} | ${run.tip_lamports} | ${run.submit_slot ?? "--"} | ${run.landed_slot ?? "--"} | ${slotDelta} | ${p2c} | ${c2f} | ${sig} | ${run.failure_type ?? "--"} | ${run.recovery ?? "--"} |`;
  }).join("\n")}

---

## AI Agent Recommendation Log

Here are the details of the AI Agent's recommendation history:

| Time | Model | Action | Recommended Tip (lamports) | Confidence | Observed Risk / Notes |
| --- | --- | --- | ---: | ---: | --- |
${decisions.map(d => {
    return `| ${d.created_at} | ${d.model} | ${d.action} | ${d.recommended_tip_lamports} | ${Math.round(d.confidence * 100)}% | ${d.reason.replace(/\|/g, "/")} |`;
  }).join("\n")}
`;

  fs.writeFileSync(exportPath, markdownContent, "utf8");
  console.log(`${colors.green}Success: Evidence report written to ${exportPath}${colors.reset}`);
}

// 3. AI Query Helper
function askGroq(systemPrompt, userPrompt, onChunk) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      reject(new Error("GROQ_API_KEY is not set. Please add it to your .env file."));
      return;
    }

    const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
    const postData = JSON.stringify({
      model: model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.2,
      stream: true,
      max_tokens: 1024
    });

    const options = {
      hostname: "api.groq.com",
      path: "/openai/v1/chat/completions",
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      if (res.statusCode !== 200) {
        let errData = "";
        res.on("data", (chunk) => { errData += chunk; });
        res.on("end", () => {
          reject(new Error(`Groq API returned HTTP ${res.statusCode}: ${errData}`));
        });
        return;
      }

      let buffer = "";
      res.on("data", (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === "data: [DONE]") continue;
          if (trimmed.startsWith("data: ")) {
            try {
              const data = JSON.parse(trimmed.slice(6));
              const text = data.choices?.[0]?.delta?.content;
              if (text) {
                onChunk(text);
              }
            } catch (e) { }
          }
        }
      });

      res.on("end", () => {
        resolve();
      });
    });

    req.on("error", (e) => {
      reject(e);
    });

    req.write(postData);
    req.end();
  });
}

// 4. Log compiler helper
function compileContext() {
  const logPath = process.env.LIFECYCLE_LOG_PATH || path.join(projectRoot, "engine", "lifecycle_log.jsonl");
  const decisionsPath = process.env.AGENT_DECISIONS_PATH || path.join(projectRoot, "agent_decisions.jsonl");

  let runs = [];
  if (fs.existsSync(logPath)) {
    try {
      runs = fs.readFileSync(logPath, "utf8")
        .split(/\n/)
        .filter(Boolean)
        .map(line => JSON.parse(line));
    } catch { }
  }

  let decisions = [];
  if (fs.existsSync(decisionsPath)) {
    try {
      decisions = fs.readFileSync(decisionsPath, "utf8")
        .split(/\n/)
        .filter(Boolean)
        .map(line => JSON.parse(line));
    } catch { }
  }

  const sliceRuns = runs.slice(-10);
  const sliceDecisions = decisions.slice(-5);

  return {
    runsCount: runs.length,
    decisionsCount: decisions.length,
    rawRuns: JSON.stringify(sliceRuns, null, 2),
    rawDecisions: JSON.stringify(sliceDecisions, null, 2)
  };
}

// 5. Ask Command
async function runAsk(question) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error(`${colors.red}Error: GROQ_API_KEY is not set. Please add it to your .env file.${colors.reset}`);
    process.exit(1);
  }

  const context = compileContext();
  const systemPrompt = `You are the autonomous AI Agent of the Sentry Smart Transaction Stack on Solana.
You have access to the latest transaction bundle submission logs and agent tip decisions.
Analyze the logs to help the user debug performance issues, latency deltas, landing failures, or tip parameters.
Be technical, precise, and concise. Do not use markdown headers (# or ##) inside responses, use bold text for visual structure.
CRITICAL: Do NOT output markdown tables (e.g. using '|'). Terminals have limited width and markdown tables wrap, causing extremely messy and unreadable output. Instead, format tables as clean ASCII text tables with short columns, or use formatted bullet points/lists (e.g. "Run 1: status = Landed, latency = 6.25s") to summarize data cleanly.

Current System Context:
- Total recorded runs: ${context.runsCount}
- Latest 10 bundle runs:
${context.rawRuns}
- Latest agent decisions:
${context.rawDecisions}`;

  if (question) {
    console.log(`${colors.cyan}Query:${colors.reset} ${question}\n`);
    console.log(`${colors.magenta}AI Agent: ${colors.reset}`);
    try {
      await askGroq(systemPrompt, question, (chunk) => {
        process.stdout.write(chunk);
      });
      console.log("\n");
    } catch (err) {
      console.error(`\n${colors.red}Error calling Groq API: ${err.message}${colors.reset}`);
    }
  } else {
    printHeader();
    console.log(`${colors.bold}Interactive AI Operator Console${colors.reset}`);
    console.log(`${colors.dim}Type your questions about pipeline state, slot latency, or failures below.`);
    console.log(`Type "exit", "quit", or "q" to leave the chat.${colors.reset}\n`);

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: `${colors.bold}${colors.green}operator> ${colors.reset}`
    });

    const conversationHistory = [];
    rl.prompt();

    rl.on("line", async (line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        rl.prompt();
        return;
      }
      if (["exit", "quit", "q"].includes(trimmed.toLowerCase())) {
        rl.close();
        return;
      }

      console.log(`\n${colors.magenta}AI Agent: ${colors.reset}`);

      let responseText = "";
      try {
        const historyPrompt = `Here is the conversation history so far:\n${JSON.stringify(conversationHistory, null, 2)}\n\nUser Question: ${trimmed}`;
        await askGroq(systemPrompt, historyPrompt, (chunk) => {
          process.stdout.write(chunk);
          responseText += chunk;
        });
        console.log("\n");
        conversationHistory.push({ role: "user", content: trimmed });
        conversationHistory.push({ role: "assistant", content: responseText });
      } catch (err) {
        console.error(`\n${colors.red}Error: ${err.message}${colors.reset}\n`);
      }

      rl.prompt();
    });

    rl.on("close", () => {
      console.log(`\n${colors.dim}Exiting operator session. Goodbye!${colors.reset}\n`);
    });
  }
}

// 6. Analyze Command (Autonomous Audit)
async function runAnalyze() {
  const logPath = process.env.LIFECYCLE_LOG_PATH || path.join(projectRoot, "engine", "lifecycle_log.jsonl");
  if (!fs.existsSync(logPath)) {
    console.error(`${colors.red}Error: No lifecycle log found at ${logPath}. Run the pipeline first!${colors.reset}`);
    process.exit(1);
  }

  printHeader();
  console.log(`${colors.bold}Generating Autonomous System Diagnostics Report...${colors.reset}\n`);

  const runs = fs.readFileSync(logPath, "utf8")
    .split(/\n/)
    .filter(Boolean)
    .map(line => JSON.parse(line));

  const stats = calculateStats(runs);
  printStatsBlock(stats);

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.log(`${colors.yellow}Notice: GROQ_API_KEY is not set. Skipping AI qualitative analysis.${colors.reset}\n`);
    return;
  }

  console.log(`${colors.magenta}${colors.bold}AI Systems Operator Insights (Qualitative Summary):${colors.reset}`);

  const systemPrompt = `You are a Senior Solana Performance Engineer auditing the Sentry Smart Transaction Stack.
You will receive the deterministic statistics calculated from the pipeline's lifecycle logs.
Provide a single, concise, professional paragraph explaining the operational implications of these metrics.
Focus on: processed-to-confirmed latency, risk window for blockhash expiration (which lasts 150 slots / ~60s), and the impact of skipped slots or congestion.
Keep the output strictly to a single paragraph. Do not use headers, lists, markdown tables, or emojis. Be technical and precise.`;

  const statsSummaryPrompt = `Deterministic Stats Calculated from the logs:
- Total runs: ${stats.total}
- Landed Rate: ${stats.landedRate}% (Landed: ${stats.landedCount}, Failed: ${stats.failedCount + stats.invalidCount})
- processed->confirmed latency delta: Avg ${stats.avgProcToConf}ms, Median ${stats.medianProcToConf}ms
- submit->landed slot delta: Avg ${stats.avgSlotDelta.toFixed(1)} slots, Median ${stats.medianSlotDelta} slots
- submit->finalized time delta: Avg ${(stats.avgSubmitToFinal / 1000).toFixed(2)}s, Median ${(stats.medianSubmitToFinal / 1000).toFixed(2)}s
- Skipped slot impact: ${stats.skippedSlotImpactPct}% of runs took > 2 slots to land
- Confirmation source: Yellowstone Stream: ${stats.yellowstoneCount}, RPC Fallback: ${stats.fallbackCount}
- Failures observed: ${JSON.stringify(stats.failureCounts)}`;

  try {
    await askGroq(systemPrompt, statsSummaryPrompt, (chunk) => {
      process.stdout.write(chunk);
    });
    console.log("\n");
  } catch (err) {
    console.error(`\n${colors.red}Error calling Groq API for insights: ${err.message}${colors.reset}\n`);
  }
}

// 7. Fail Test Command
function runFailTest(type) {
  if (type !== "zero-tip" && type !== "expired-hash") {
    console.error(`${colors.red}Error: Invalid failure type. Must be 'zero-tip' or 'expired-hash'.${colors.reset}`);
    console.log(`Usage: sentry fail-test [zero-tip | expired-hash]`);
    return;
  }
  console.log(`${colors.cyan}Injecting deliberate failure run: ${colors.bold}${type}${colors.reset}\n`);

  process.env.FAIL_TEST = type;
  process.env.RUN_COUNT = "1";

  console.log(`${colors.dim}Running engine with FAIL_TEST=${type} and RUN_COUNT=1...${colors.reset}\n`);
  const child = spawn("cargo", ["run"], { cwd: path.join(projectRoot, "engine"), stdio: "inherit", shell: true });
  child.on("close", code => {
    console.log(`\n${colors.cyan}[fail-test]${colors.reset} Engine exited with code ${code}.`);
  });
}

// Service runners
let children = [];

function killChildren() {
  if (children.length > 0) {
    console.log(`\n${colors.yellow}Stopping all services...${colors.reset}`);
    children.forEach(child => {
      try {
        if (process.platform === "win32") {
          execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: "ignore" });
        } else {
          child.kill("SIGINT");
        }
      } catch { }
    });
    children = [];
  }
}

process.on("SIGINT", () => {
  killChildren();
  process.exit(0);
});

process.on("exit", killChildren);

function startService(label, cmd, args, color, cwd = projectRoot) {
  const child = spawn(cmd, args, {
    cwd,
    shell: true,
    env: { ...process.env, FORCE_COLOR: "1" }
  });

  children.push(child);

  const rlOut = readline.createInterface({ input: child.stdout });
  rlOut.on("line", line => {
    console.log(`${color}[${label}]${colors.reset} ${line}`);
  });

  const rlErr = readline.createInterface({ input: child.stderr });
  rlErr.on("line", line => {
    console.log(`${colors.red}[${label} ERR]${colors.reset} ${line}`);
  });

  child.on("close", code => {
    console.log(`${color}[${label}]${colors.reset} Service exited with code ${code}`);
  });
}

function runEngine() {
  console.log(`${colors.cyan}Building and running Rust Engine... (Ctrl+C to stop)${colors.reset}`);
  const child = spawn("cargo", ["run"], { cwd: path.join(projectRoot, "engine"), stdio: "inherit", shell: true });
  child.on("close", code => {
    console.log(`\n${colors.cyan}[engine]${colors.reset} Exited with code ${code}. Back at sentry> prompt.`);
  });
}

function runAgent() {
  console.log(`${colors.magenta}Running Agent Daemon... (Ctrl+C to stop)${colors.reset}`);
  const child = spawn("npm", ["run", "start"], { cwd: path.join(projectRoot, "agent"), stdio: "inherit", shell: true });
  child.on("close", code => {
    console.log(`\n${colors.magenta}[agent]${colors.reset} Exited with code ${code}. Back at sentry> prompt.`);
  });
}

function runDashboard() {
  console.log(`${colors.green}Running Dashboard Console... (Ctrl+C to stop)${colors.reset}`);
  const child = spawn("npm", ["run", "dev"], { cwd: projectRoot, stdio: "inherit", shell: true });
  child.on("close", code => {
    console.log(`\n${colors.green}[dashboard]${colors.reset} Exited with code ${code}. Back at sentry> prompt.`);
  });
}

function runDocs() {
  console.log(`${colors.green}Running Docusaurus Site on Port 3001... (Ctrl+C to stop)${colors.reset}`);
  const child = spawn("npm", ["run", "start", "--", "--port", "3001"], { cwd: path.join(projectRoot, "docs"), stdio: "inherit", shell: true });
  child.on("close", code => {
    console.log(`\n${colors.green}[docs]${colors.reset} Exited with code ${code}. Back at sentry> prompt.`);
  });
}

function runDocker() {
  console.log(`${colors.cyan}Launching Docker Stack...${colors.reset}`);
  if (!commandExists("docker") || !commandExists("docker-compose")) {
    console.error(`${colors.red}Error: Docker or Docker Compose is not installed or not in PATH.${colors.reset}`);
    return;
  }
  const child = spawn("docker-compose", ["up", "--build"], { cwd: projectRoot, stdio: "inherit", shell: true });
  child.on("close", code => {
    console.log(`\n${colors.cyan}[docker]${colors.reset} Exited with code ${code}. Back at sentry> prompt.`);
  });
}

function runAll(runCount) {
  printHeader();
  console.log(`${colors.bold}Starting complete Sentry pipeline concurrently...${colors.reset}`);
  if (runCount) process.env.RUN_COUNT = runCount.toString();

  // 1. Dashboard on Green
  startService("dashboard", "npm", ["run", "dev"], colors.green, projectRoot);

  // 2. Engine on Cyan
  startService("engine", "cargo", ["run"], colors.cyan, path.join(projectRoot, "engine"));

  // 3. Agent daemon on Magenta
  startService("agent", "npm", ["run", "start"], colors.magenta, path.join(projectRoot, "agent"));

  // 4. Docs on Yellow
  startService("docs", "npm", ["run", "start", "--", "--port", "3001"], colors.yellow, path.join(projectRoot, "docs"));
}

function runServe() {
  console.log(`${colors.green}Running Standalone Developer Server on http://localhost:3050... (Ctrl+C to stop)${colors.reset}`);
  const child = spawn("npx", ["tsx", "server.ts"], { cwd: projectRoot, stdio: "inherit", shell: true });
  child.on("close", code => {
    console.log(`\n${colors.green}[server]${colors.reset} Exited with code ${code}. Back at sentry> prompt.`);
  });
}

// ---------------------------------------------------------------------------
// REPL + Dispatch
// ---------------------------------------------------------------------------

// Blocking commands that hand over stdio to a child process
const BLOCKING_COMMANDS = new Set(["engine", "agent", "dashboard", "docker-up", "run", "docs", "serve"]);

async function dispatch(cmd, parts, isRepl = false) {
  switch (cmd) {
    case "help":
    case "--help":
    case "-h":
      isRepl ? showReplMenu() : showHelp();
      break;

    case "serve":
      if (isRepl) console.log(`${colors.dim}Tip: serve runs in the foreground. Press Ctrl+C to stop it.${colors.reset}`);
      runServe();
      break;

    case "status":
      printHeader();
      await solami.runStatus();
      break;

    case "check":
      await solami.runCheck();
      break;

    case "monitor":
      if (isRepl) console.log(`${colors.dim}Tip: monitor streams until Ctrl+C.${colors.reset}`);
      await solami.runMonitor();
      break;

    case "benchmark":
      await solami.runBenchmark(parts);
      break;

    case "replay":
      await solami.runReplay(parts);
      break;

    case "ledger":
      solami.runLedger(parts[1]);
      break;

    case "evidence":
      solami.runEvidence();
      break;

    case "ask":
      await runAsk(parts.slice(1).join(" "));
      break;

    case "analyze":
      solami.runAnalyze(parts[1]);
      break;

    case "verify":
      await solami.runVerify(parts[1]);
      break;

    case "fail-test":
      runFailTest(parts[1]);
      break;

    case "engine":
      if (isRepl) console.log(`${colors.dim}Tip: engine runs in the foreground. Press Ctrl+C to stop it; the REPL will not respond until then.${colors.reset}`);
      runEngine();
      break;

    case "agent":
      if (isRepl) console.log(`${colors.dim}Tip: agent runs in the foreground. Press Ctrl+C to stop it.${colors.reset}`);
      runAgent();
      break;

    case "dashboard":
      if (isRepl) console.log(`${colors.dim}Tip: dashboard runs in the foreground. Press Ctrl+C to stop it.${colors.reset}`);
      runDashboard();
      break;

    case "docs":
      if (isRepl) console.log(`${colors.dim}Tip: docs runs in the foreground. Press Ctrl+C to stop it.${colors.reset}`);
      runDocs();
      break;

    case "docker-up":
      if (isRepl) console.log(`${colors.dim}Tip: docker-up runs in the foreground. Press Ctrl+C to stop it.${colors.reset}`);
      runDocker();
      break;

    case "run": {
      // Parse --count / -c option
      const countIdx = parts.findIndex(a => a === "--count" || a === "-c");
      let runCount = null;
      if (countIdx !== -1 && parts[countIdx + 1]) {
        runCount = parseInt(parts[countIdx + 1], 10);
        if (isNaN(runCount)) runCount = null;
      }
      if (isRepl) console.log(`${colors.dim}Tip: run starts all services. Press Ctrl+C to stop them.${colors.reset}`);
      runAll(runCount);
      if (!isRepl) setInterval(() => { }, 1000); // keep alive in one-shot mode
      break;
    }

    case "exit":
    case "quit":
    case "q":
      return false; // signals REPL to close

    default:
      console.error(`${colors.red}Unknown command: "${cmd}". Type 'help' for the command list.${colors.reset}\n`);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Interactive REPL menu
// ---------------------------------------------------------------------------
function showReplMenu() {
  console.log(`
${colors.bold}Available commands:${colors.reset}`);
  console.log(`  ${colors.green}status${colors.reset}               live Solami RPC / Beam / wallet / ledger snapshot`);
  console.log(`  ${colors.green}check${colors.reset}                5-second live infrastructure diagnostic`);
  console.log(`  ${colors.green}monitor${colors.reset}              stream live slots and Beam tips (Ctrl+C to stop)`);
  console.log(`  ${colors.green}benchmark <net>${colors.reset}      mainnet (needs --yes, spends SOL) | devnet`);
  console.log(`  ${colors.green}replay <N>${colors.reset}           replay a ledger run (add --mainnet for mainnet)`);
  console.log(`  ${colors.green}ledger [net]${colors.reset}         recompute receipt hash chains`);
  console.log(`  ${colors.green}analyze${colors.reset}              compute deterministic stats + AI insights`);
  console.log(`  ${colors.green}evidence${colors.reset}             generate judge-ready evidence.md`);
  console.log(`  ${colors.green}ask [question]${colors.reset}       ask the AI agent a free-form question`);
  console.log(`  ${colors.green}verify <sig>${colors.reset}         on-chain lookup + ledger cross-reference`);
  console.log(`  ${colors.green}fail-test <type>${colors.reset}     inject a deliberate failure (zero-tip | expired-hash)`);
  console.log(`  ${colors.green}engine${colors.reset}               compile & run the Rust bundle engine`);
  console.log(`  ${colors.green}agent${colors.reset}                run the AI agent daemon`);
  console.log(`  ${colors.green}dashboard${colors.reset}            start the Next.js dashboard`);
  console.log(`  ${colors.green}docs${colors.reset}                 start the Docusaurus site`);
  console.log(`  ${colors.green}serve${colors.reset}                start the standalone developer API server`);
  console.log(`  ${colors.green}run [--count N]${colors.reset}      start all services concurrently`);
  console.log(`  ${colors.green}docker-up${colors.reset}            launch the full Docker stack`);
  console.log(`  ${colors.green}help${colors.reset}                 show this menu again`);
  console.log(`  ${colors.green}exit${colors.reset} / ${colors.green}quit${colors.reset}          quit Sentry\n`);
}

// ---------------------------------------------------------------------------
// REPL loop
// ---------------------------------------------------------------------------
function startRepl() {
  printHeader();
  console.log(`${colors.bold}${colors.cyan}Interactive Operator Console${colors.reset} ${colors.dim}— type 'help' for commands, 'exit' to quit${colors.reset}`);
  showReplMenu();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `\n${colors.bold}${colors.cyan}sentry>${colors.reset} `,
    terminal: true,
  });

  rl.prompt();

  rl.on("line", async (line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      rl.prompt();
      return;
    }

    const parts = trimmed.split(/\s+/);
    const cmd = parts[0].toLowerCase();

    const keepGoing = await dispatch(cmd, parts, true);
    if (keepGoing === false) {
      rl.close();
      return;
    }

    // For blocking commands, don't re-prompt immediately — the child will
    // print its own exit message and stdio will resume after Ctrl+C
    if (!BLOCKING_COMMANDS.has(cmd)) {
      rl.prompt();
    }
  });

  rl.on("close", () => {
    console.log(`\n${colors.dim}Goodbye from Sentry.${colors.reset}\n`);
    process.exit(0);
  });
}

// ---------------------------------------------------------------------------
// Entry point — REPL if no args, one-shot otherwise
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);

if (args.length === 0) {
  startRepl();
} else {
  const cmd = args[0].toLowerCase();
  dispatch(cmd, args, false).then((keepGoing) => {
    // One-shot: process exits naturally once async work is done,
    // unless it's a blocking service that keeps an event-loop handle alive.
  }).catch((err) => {
    console.error(`${colors.red}Fatal: ${err.message}${colors.reset}`);
    process.exit(1);
  });
}
