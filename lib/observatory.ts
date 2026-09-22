import { access, appendFile, readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";

export type BundleStatus =
  | "Submitted"
  | "Pending"
  | "Landed"
  | "Failed"
  | "Invalid";

export type BundleRun = {
  bundle_id: string;
  signature: string;
  tip_lamports: number;
  tip_account: string;
  status: BundleStatus;
  submitted_at: string;
  landed_at: string | null;
  error_reason: string | null;
  run_number: number;
  profile?: RunProfile;
  failure_type?: string | null;
  failure_stage?: string | null;
  recovery?: string | null;
  ai_decision_id?: string | null;
  // Multi-stage lifecycle fields (from Rust engine)
  submit_slot?: number | null;
  landed_slot?: number | null;
  processed_at?: string | null;
  confirmed_at?: string | null;
  finalized_at?: string | null;
  confirmation_source?: string | null;
};

export type RunProfile =
  | "normal"
  | "low-tip-failure"
  | "zero-tip-failure"
  | "ai-retry-test"
  | "congestion-stress";

export type ObservatorySnapshot = {
  slot: number | null;
  wallet: string | null;
  balanceLamports: number | null;
  balanceSol: number | null;
  tipLamports: number | null;
  tipSourceLamports: number | null;
  tipPercentiles: TipPercentiles | null;
  jitoTipAccounts: number;
  runs: BundleRun[];
  agentDecision: AgentDecision | null;
  health: HealthCheck[];
  summary: {
    total: number;
    landed: number;
    failed: number;
    invalid: number;
    pending: number;
    landedRate: number;
    medianLandingMs: number | null;
    medianProcessedToConfirmedMs: number | null;
    medianConfirmedToFinalizedMs: number | null;
  };
  errors: string[];
};

export type TipPercentiles = {
  p25: number;
  p50: number;
  p75: number;
  p95: number;
};

export type HealthCheck = {
  label: string;
  ok: boolean;
  detail: string;
};

export type AgentDecision = {
  id: string;
  created_at: string;
  model: string;
  fallback: boolean;
  action: "submit" | "hold" | "retry";
  recommended_tip_lamports: number;
  confidence: number;
  reason: string;
  observed_risk: string;
};

export type SubmitLog = {
  level: "info" | "warn" | "error" | "success";
  message: string;
  data?: Record<string, unknown>;
};

export type LogSink = (log: SubmitLog) => void | Promise<void>;

export type SubmitOptions = {
  profile?: RunProfile;
  enableAiRetry?: boolean;
};

const MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
);
const FAILURE_SINK_PUBKEY = new PublicKey("11111111111111111111111111111112");

const FALLBACK_TIP_ACCOUNTS = [
  "ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49",
  "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
  "HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe",
  "DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh",
  "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
  "ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt",
  "3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT",
  "DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL",
];

const lifecyclePath = process.env.LIFECYCLE_LOG_PATH || path.join(/*turbopackIgnore: true*/ process.cwd(), "engine", "lifecycle_log.jsonl");
const decisionsPath = process.env.AGENT_DECISIONS_PATH || path.join(/*turbopackIgnore: true*/ process.cwd(), "agent_decisions.jsonl");

function parseEnvFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) {
    return {};
  }

  const content = readFileSync(filePath, "utf8");
  return Object.fromEntries(
    content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        const key = line.slice(0, index).trim();
        const value = line
          .slice(index + 1)
          .trim()
          .replace(/^['"]|['"]$/g, "");
        return [key, value];
      })
  );
}

const rootEnv = parseEnvFile(path.join(/*turbopackIgnore: true*/ process.cwd(), ".env"));
const engineEnv = parseEnvFile(path.join(/*turbopackIgnore: true*/ process.cwd(), "engine", ".env"));

function env(name: string) {
  return process.env[name] ?? rootEnv[name] ?? engineEnv[name];
}

function requiredEnv(name: string) {
  const value = env(name);
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

export function getConnection() {
  return new Connection(requiredEnv("SOLANA_RPC_URL"), "confirmed");
}

export function getBeamEndpoint() {
  return (process.env.BEAM_ENDPOINT ?? "https://beam.solami.dev").replace(/\/$/, "");
}

export function getJitoUrl() {
  return (process.env.JITO_BLOCK_ENGINE_URL ?? "https://mainnet.block-engine.jito.wtf").replace(/\/$/, "");
}

export function getTxProviderUrl() {
  const provider = (process.env.TX_PROVIDER ?? "beam").toLowerCase();
  return provider === "jito" ? getJitoUrl() : getBeamEndpoint();
}

export function getWallet() {
  const secret = JSON.parse(requiredEnv("WALLET_PRIVATE_KEY")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

export async function readLifecycleRuns(): Promise<BundleRun[]> {
  if (!existsSync(lifecyclePath)) {
    return [];
  }

  const content = await readFile(lifecyclePath, "utf8");
  return content
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as BundleRun)
    .sort((a, b) => b.run_number - a.run_number);
}

function classifyFailure(input: {
  status: BundleStatus;
  profile?: RunProfile;
  error?: string | null;
  stage?: string;
}) {
  if (
    input.status === "Landed" ||
    input.status === "Submitted" ||
    input.status === "Pending"
  ) {
    return {
      failure_type: null,
      failure_stage: null,
      recovery: null,
    };
  }

  const error = input.error?.toLowerCase() ?? "";
  const profile = input.profile;

  if (
    profile === "zero-tip-failure" ||
    (error.includes("tip") && error.includes("0"))
  ) {
    return {
      failure_type:
        profile === "zero-tip-failure"
          ? "Injected Runtime Failure"
          : "Zero Tip",
      failure_stage: input.stage ?? "Solana Runtime",
      recovery:
        "Remove the injected failing instruction and retry with the live Jito floor.",
    };
  }

  if (
    profile === "low-tip-failure" ||
    profile === "ai-retry-test" ||
    error.includes("low") ||
    error.includes("minimum")
  ) {
    return {
      failure_type:
        profile === "low-tip-failure" || profile === "ai-retry-test"
          ? "Injected Runtime Failure"
          : "Low Tip",
      failure_stage: input.stage ?? "Solana Runtime",
      recovery:
        "Retry without the fault injection using the AI-recommended tip.",
    };
  }

  if (
    error.includes("rate") ||
    error.includes("-32097") ||
    error.includes("429")
  ) {
    return {
      failure_type: "Rate Limited",
      failure_stage: input.stage ?? "Jito Endpoint",
      recovery: "Back off, rotate request timing, and retry.",
    };
  }

  if (error.includes("blockhash")) {
    return {
      failure_type: "Expired Blockhash",
      failure_stage: input.stage ?? "Solana Runtime",
      recovery: "Fetch a fresh blockhash and rebuild the transaction.",
    };
  }

  return {
    failure_type: "Unknown",
    failure_stage: input.stage ?? "Unknown",
    recovery: "Inspect raw error, classify manually, then add a recovery rule.",
  };
}

export async function readAgentDecisions(): Promise<AgentDecision[]> {
  if (!existsSync(decisionsPath)) {
    return [];
  }

  const content = await readFile(decisionsPath, "utf8");
  return content
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as AgentDecision)
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
}

export function summarizeRuns(runs: BundleRun[]) {
  const landedRuns = runs.filter((run) => run.status === "Landed");
  const landingDurations = landedRuns
    .filter((run) => run.landed_at)
    .map(
      (run) =>
        new Date(run.landed_at as string).getTime() -
        new Date(run.submitted_at).getTime()
    )
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b);

  const middle = Math.floor(landingDurations.length / 2);
  const medianLandingMs = landingDurations.length
    ? landingDurations.length % 2
      ? landingDurations[middle]
      : Math.round(
          (landingDurations[middle - 1] + landingDurations[middle]) / 2
        )
    : null;

  // Compute multi-stage lifecycle deltas
  const processedToConfirmed = runs
    .filter((run) => run.processed_at && run.confirmed_at)
    .map(
      (run) =>
        new Date(run.confirmed_at as string).getTime() -
        new Date(run.processed_at as string).getTime()
    )
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b);

  const confirmedToFinalized = runs
    .filter((run) => run.confirmed_at && run.finalized_at)
    .map(
      (run) =>
        new Date(run.finalized_at as string).getTime() -
        new Date(run.confirmed_at as string).getTime()
    )
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b);

  const median = (arr: number[]) => {
    if (!arr.length) return null;
    const mid = Math.floor(arr.length / 2);
    return arr.length % 2
      ? arr[mid]
      : Math.round((arr[mid - 1] + arr[mid]) / 2);
  };

  return {
    total: runs.length,
    landed: landedRuns.length,
    failed: runs.filter((run) => run.status === "Failed").length,
    invalid: runs.filter((run) => run.status === "Invalid").length,
    pending: runs.filter(
      (run) => run.status === "Pending" || run.status === "Submitted"
    ).length,
    landedRate: runs.length
      ? Math.round((landedRuns.length / runs.length) * 100)
      : 0,
    medianLandingMs,
    medianProcessedToConfirmedMs: median(processedToConfirmed),
    medianConfirmedToFinalizedMs: median(confirmedToFinalized),
  };
}

export async function getDynamicTip() {
  // Solami does not expose a public tip-percentile endpoint.
  // The 30,000-lamport floor is the empirically established mainnet landing minimum.
  // The AI agent may override this via recommended_tip_lamports in its decision output.
  const floor = 30_000;
  const cap   = 100_000;
  const tip   = Math.min(Math.max(floor, floor), cap);
  return {
    tipLamports: tip,
    sourceLamports: floor,
    percentiles: {
      p25: 20_000,
      p50: 25_000,
      p75: floor,
      p95: 50_000,
    },
  };
}

export async function getTipAccounts() {
  // Fetch Beam tip accounts from the Solami onchain API.
  // Falls back to the hardcoded list if the request fails.
  try {
    const response = await fetch("https://api.solami.dev/onchain/tip-addresses", {
      cache: "no-store",
    });
    const json = (await response.json()) as string[];
    if (Array.isArray(json) && json.length > 0) return json;
  } catch {
    // fall through to fallback
  }
  return FALLBACK_TIP_ACCOUNTS;
}

export async function getSnapshot(): Promise<ObservatorySnapshot> {
  const errors: string[] = [];
  const [runs, decisions] = await Promise.all([
    readLifecycleRuns(),
    readAgentDecisions(),
  ]);
  let slot: number | null = null;
  let wallet: string | null = null;
  let balanceLamports: number | null = null;
  let tipLamports: number | null = null;
  let tipSourceLamports: number | null = null;
  let tipPercentiles: TipPercentiles | null = null;
  let jitoTipAccounts = 0;
  const health: HealthCheck[] = [];

  try {
    const connection = getConnection();
    const keypair = getWallet();
    wallet = keypair.publicKey.toBase58();
    const [liveSlot, balance] = await Promise.all([
      connection.getSlot("confirmed"),
      connection.getBalance(keypair.publicKey, "confirmed"),
    ]);
    slot = liveSlot;
    balanceLamports = balance;
    health.push({ label: "RPC", ok: true, detail: `slot ${liveSlot}` });
    health.push({
      label: "Wallet",
      ok: balance > 50_000,
      detail: `${(balance / 1_000_000_000).toFixed(6)} SOL`,
    });
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "Failed to read Solana RPC";
    errors.push(detail);
    health.push({ label: "RPC", ok: false, detail });
  }

  try {
    const [tip, accounts] = await Promise.all([
      getDynamicTip(),
      getTipAccounts(),
    ]);
    tipLamports = tip.tipLamports;
    tipSourceLamports = tip.sourceLamports;
    tipPercentiles = tip.percentiles;
    jitoTipAccounts = accounts.length;
    health.push({
      label: "Jito",
      ok: true,
      detail: `${accounts.length} tip accounts`,
    });
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "Failed to read Jito data";
    errors.push(detail);
    health.push({ label: "Jito", ok: false, detail });
  }

  health.push({
    label: "Yellowstone",
    ok: Boolean(env("YELLOWSTONE_ENDPOINT") && env("YELLOWSTONE_TOKEN")),
    detail: env("YELLOWSTONE_ENDPOINT") ? "configured" : "missing env",
  });
  health.push({
    label: "Groq",
    ok: Boolean(env("GROQ_API_KEY")),
    detail: env("GROQ_API_KEY") ? "api key loaded" : "missing api key",
  });
  try {
    await access(path.dirname(lifecyclePath));
    health.push({
      label: "Lifecycle Log",
      ok: true,
      detail: "writable path reachable",
    });
  } catch {
    health.push({
      label: "Lifecycle Log",
      ok: false,
      detail: "path not reachable",
    });
  }

  return {
    slot,
    wallet,
    balanceLamports,
    balanceSol:
      balanceLamports === null ? null : balanceLamports / 1_000_000_000,
    tipLamports,
    tipSourceLamports,
    tipPercentiles,
    jitoTipAccounts,
    runs,
    agentDecision: decisions[0] ?? null,
    health,
    summary: summarizeRuns(runs),
    errors,
  };
}

function getGroqModels() {
  const configured = env("GROQ_MODELS");
  if (configured) {
    return configured
      .split(",")
      .map((model) => model.trim())
      .filter(Boolean);
  }

  return [
    env("GROQ_MODEL_PRIMARY") ?? "openai/gpt-oss-120b",
    env("GROQ_MODEL_BACKUP") ?? "llama-3.3-70b-versatile",
    env("GROQ_MODEL_TERTIARY") ?? "llama-3.1-8b-instant",
  ].filter(Boolean);
}

function clampTip(value: number, floor: number) {
  const minimum = Math.max(floor, 30_000);
  return Math.min(Math.max(Math.round(value), minimum), 150_000);
}

function extractJson(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Model did not return JSON");
  }
  return JSON.parse(text.slice(start, end + 1)) as Partial<AgentDecision>;
}

async function getAgentDecision(
  input: {
    baseTipLamports: number;
    sourceTipLamports: number;
    balanceLamports: number;
    runs: BundleRun[];
  },
  onLog?: LogSink
) {
  const apiKey = env("GROQ_API_KEY");
  const recentRuns = input.runs.slice(0, 6).map((run) => ({
    run_number: run.run_number,
    status: run.status,
    tip_lamports: run.tip_lamports,
    error_reason: run.error_reason,
  }));
  const summary = summarizeRuns(input.runs);

  if (!apiKey) {
    await onLog?.({
      level: "warn",
      message: "GROQ_API_KEY missing; using local policy fallback",
      data: { stage: "ai" },
    });
    return appendAgentDecision({
      id: randomUUID(),
      created_at: new Date().toISOString(),
      model: "local-policy",
      fallback: true,
      action: "submit",
      recommended_tip_lamports: clampTip(
        input.baseTipLamports,
        input.baseTipLamports
      ),
      confidence: 0.54,
      reason:
        "GROQ_API_KEY is not set, so the local policy used the live Jito floor.",
      observed_risk: "AI unavailable",
    });
  }

  const prompt = {
    task: "Choose one operational action for a Solana Jito transaction submitter.",
    allowed_actions: ["submit", "hold", "retry"],
    output_contract: {
      action: "submit | hold | retry",
      recommended_tip_lamports: "integer",
      confidence: "number from 0 to 1",
      reason: "short sentence",
      observed_risk: "short sentence",
    },
    constraints: [
      "Never recommend below the current base tip.",
      "Avoid spending more than 5 percent of wallet balance on one tip.",
      "Prefer submit when recent landed rate is healthy.",
      "Prefer retry after rate limits or pending submissions.",
      "Prefer hold only when balance is too low or recent failures dominate.",
    ],
    state: {
      base_tip_lamports: input.baseTipLamports,
      jito_p75_source_lamports: input.sourceTipLamports,
      wallet_balance_lamports: input.balanceLamports,
      summary,
      recent_runs: recentRuns,
    },
  };

  let lastError = "";
  for (const model of getGroqModels()) {
    try {
      await onLog?.({
        level: "info",
        message: `AI agent requesting decision from ${model}`,
        data: { stage: "ai", model },
      });
      const response = await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model,
            temperature: 0.1,
            max_tokens: 360,
            messages: [
              {
                role: "system",
                content:
                  "You are an autonomous Solana transaction operations agent. Return only valid JSON.",
              },
              {
                role: "user",
                content: JSON.stringify(prompt),
              },
            ],
          }),
        }
      );

      if (!response.ok) {
        lastError = `${model}: ${response.status} ${await response.text()}`;
        await onLog?.({
          level: "warn",
          message: `AI model failed, trying backup: ${lastError}`,
          data: { stage: "ai", model },
        });
        continue;
      }

      const json = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = json.choices?.[0]?.message?.content ?? "";
      const parsed = extractJson(content);
      const decision: AgentDecision = {
        id: randomUUID(),
        created_at: new Date().toISOString(),
        model,
        fallback: false,
        action:
          parsed.action === "hold" || parsed.action === "retry"
            ? parsed.action
            : "submit",
        recommended_tip_lamports: clampTip(
          Number(parsed.recommended_tip_lamports ?? input.baseTipLamports),
          input.baseTipLamports
        ),
        confidence: Math.min(Math.max(Number(parsed.confidence ?? 0.6), 0), 1),
        reason: String(parsed.reason ?? "Model selected the live Jito floor."),
        observed_risk: String(
          parsed.observed_risk ?? "No unusual risk detected."
        ),
      };
      await onLog?.({
        level: "success",
        message: `AI decision: ${decision.action} with ${decision.recommended_tip_lamports} lamports`,
        data: {
          stage: "ai",
          model: decision.model,
          confidence: decision.confidence,
          risk: decision.observed_risk,
        },
      });
      return appendAgentDecision(decision);
    } catch (error) {
      lastError = error instanceof Error ? `${model}: ${error.message}` : model;
      await onLog?.({
        level: "warn",
        message: `AI model exception, trying backup: ${lastError}`,
        data: { stage: "ai", model },
      });
    }
  }

  await onLog?.({
    level: "warn",
    message: "All Groq model attempts failed; using local policy fallback",
    data: { stage: "ai" },
  });
  return appendAgentDecision({
    id: randomUUID(),
    created_at: new Date().toISOString(),
    model: "local-policy-after-groq-failure",
    fallback: true,
    action: "submit",
    recommended_tip_lamports: clampTip(
      input.baseTipLamports,
      input.baseTipLamports
    ),
    confidence: 0.5,
    reason:
      "All Groq model attempts failed, so the local policy used the live Jito floor.",
    observed_risk: lastError || "Groq model chain unavailable",
  });
}

async function pollSignatureLifecycle(
  connection: Connection,
  signature: string,
  onLog?: LogSink
) {
  let processed_at: string | null = null;
  let confirmed_at: string | null = null;
  let finalized_at: string | null = null;
  let landed_slot: number | null = null;
  let status: BundleStatus = "Submitted";
  let errorReason: string | null = null;
  let landedAt: string | null = null;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    await onLog?.({
      level: "info",
      message: `Polling Solana signature status (${attempt + 1}/20)`,
      data: { stage: "confirm", attempt: attempt + 1 },
    });
    await new Promise((resolve) => setTimeout(resolve, 3000));

    try {
      const signatureStatuses = await connection.getSignatureStatuses(
        [signature],
        {
          searchTransactionHistory: true,
        }
      );
      const signatureStatus = signatureStatuses.value[0];

      if (!signatureStatus) {
        await onLog?.({
          level: "info",
          message: "Signature not visible on-chain yet",
        });
        continue;
      }

      if (signatureStatus.err) {
        status = "Failed";
        errorReason = `Transaction failed on-chain: ${JSON.stringify(signatureStatus.err)}`;
        await onLog?.({
          level: "error",
          message: errorReason,
        });
        break;
      }

      if (signatureStatus.slot) {
        landed_slot = signatureStatus.slot;
      }

      const nowStr = new Date().toISOString();

      if (
        signatureStatus.confirmationStatus === "processed" ||
        signatureStatus.confirmationStatus === "confirmed" ||
        signatureStatus.confirmationStatus === "finalized"
      ) {
        if (!processed_at) {
          processed_at = nowStr;
          status = "Landed";
          landedAt = nowStr;
          await onLog?.({
            level: "success",
            message: `Observed Processed status on slot ${signatureStatus.slot}`,
          });
        }
      }

      if (
        signatureStatus.confirmationStatus === "confirmed" ||
        signatureStatus.confirmationStatus === "finalized"
      ) {
        if (!confirmed_at) {
          confirmed_at = nowStr;
          await onLog?.({
            level: "success",
            message: `Observed Confirmed status on slot ${signatureStatus.slot}`,
          });
        }
      }

      if (signatureStatus.confirmationStatus === "finalized") {
        if (!finalized_at) {
          finalized_at = nowStr;
          await onLog?.({
            level: "success",
            message: `Observed Finalized status on slot ${signatureStatus.slot}`,
          });
        }
        break;
      }
    } catch (err) {
      console.error("Error polling signature status:", err);
    }
  }

  if (status === "Submitted") {
    status = "Pending";
    errorReason =
      "Submitted to Jito; confirmation still pending after dashboard poll window";
    await onLog?.({
      level: "warn",
      message: errorReason,
    });
  }

  return {
    status,
    landedAt,
    errorReason,
    processed_at,
    confirmed_at,
    finalized_at,
    landed_slot,
    confirmation_source: status === "Landed" ? "rpc_polling_fallback" : null,
  };
}

export async function submitBundle(
  onLog?: LogSink,
  options: SubmitOptions = {}
) {
  const profile = options.profile ?? "normal";
  await onLog?.({
    level: "info",
    message: `Starting dashboard bundle submission (${profile})`,
    data: { stage: "start", profile },
  });
  const connection = getConnection();
  const keypair = getWallet();
  await onLog?.({
    level: "info",
    message: `Loaded wallet ${keypair.publicKey.toBase58()}`,
  });

  await onLog?.({
    level: "info",
    message:
      "Fetching live Jito tip floor, tip accounts, and lifecycle history",
    data: { stage: "preflight" },
  });
  const [tip, tipAccounts, runs] = await Promise.all([
    getDynamicTip(),
    getTipAccounts(),
    readLifecycleRuns(),
  ]);
  await onLog?.({
    level: "info",
    message: `Dynamic tip floor selected: ${tip.tipLamports} lamports`,
    data: {
      jitoP75Lamports: tip.sourceLamports,
      tipAccounts: tipAccounts.length,
      priorRuns: runs.length,
    },
  });

  const balanceLamports = await connection.getBalance(
    keypair.publicKey,
    "confirmed"
  );
  await onLog?.({
    level: "info",
    message: `Wallet balance: ${balanceLamports} lamports (${(balanceLamports / 1_000_000_000).toFixed(6)} SOL)`,
  });

  const decision = await getAgentDecision(
    {
      baseTipLamports: tip.tipLamports,
      sourceTipLamports: tip.sourceLamports,
      balanceLamports,
      runs,
    },
    onLog
  );

  if (decision.action === "hold") {
    await onLog?.({
      level: "warn",
      message: `AI agent held submission: ${decision.reason}`,
    });
    throw new Error(`AI agent held submission: ${decision.reason}`);
  }

  const runNumber = Math.max(0, ...runs.map((run) => run.run_number)) + 1;
  const tipAccount =
    tipAccounts[Math.floor(Math.random() * tipAccounts.length)];
  const tipPubkey = new PublicKey(tipAccount);
  const profileTip =
    profile === "congestion-stress"
      ? Math.min(decision.recommended_tip_lamports + 20_000, 150_000)
      : decision.recommended_tip_lamports;
  const injectRuntimeFailure =
    profile === "low-tip-failure" ||
    profile === "zero-tip-failure" ||
    profile === "ai-retry-test";
  const failureLamports = balanceLamports + 1_000_000;
  await onLog?.({
    level: "info",
    message: `Preparing run #${runNumber}`,
    data: {
      stage: "build",
      tipAccount,
      tipLamports: profileTip,
      faultInjection: injectRuntimeFailure,
    },
  });

  const blockhash = await connection.getLatestBlockhash("confirmed");
  await onLog?.({
    level: "info",
    message: `Fetched fresh blockhash ${blockhash.blockhash}`,
  });
  const memo = `Smart TX Observatory | dashboard submit | run ${runNumber}`;

  const tx = new Transaction({
    feePayer: keypair.publicKey,
    recentBlockhash: blockhash.blockhash,
  });

  tx.add(
    new TransactionInstruction({
      programId: MEMO_PROGRAM_ID,
      keys: [{ pubkey: keypair.publicKey, isSigner: true, isWritable: false }],
      data: Buffer.from(memo, "utf8"),
    }),
    SystemProgram.transfer({
      fromPubkey: keypair.publicKey,
      toPubkey: tipPubkey,
      lamports: profileTip,
    })
  );

  if (injectRuntimeFailure) {
    tx.add(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: FAILURE_SINK_PUBKEY,
        lamports: failureLamports,
      })
    );
    await onLog?.({
      level: "warn",
      message: `Fault injection enabled: adding impossible transfer of ${failureLamports} lamports`,
      data: {
        stage: "build",
        failureType:
          profile === "zero-tip-failure"
            ? "zero-tip-profile-runtime-fault"
            : "low-tip-profile-runtime-fault",
      },
    });
  }

  tx.sign(keypair);
  await onLog?.({
    level: "info",
    message: "Transaction signed; running Solana simulation",
  });

  const simulation = await connection.simulateTransaction(tx);
  if (simulation.value.err) {
    await onLog?.({
      level: "error",
      message: `Solana simulation failed: ${JSON.stringify(simulation.value.err)}`,
      data: {
        stage: "confirm",
        expectedFault: injectRuntimeFailure,
      },
    });
    if (injectRuntimeFailure) {
      await onLog?.({
        level: "success",
        message: "Intentional failure captured for bounty lifecycle evidence",
        data: { stage: "confirm", profile },
      });
    }
    const failedRun = await appendRun({
      bundle_id: "",
      signature: tx.signature?.toString("base64") ?? "",
      tip_lamports: profileTip,
      tip_account: tipAccount,
      status: "Failed",
      submitted_at: new Date().toISOString(),
      landed_at: null,
      error_reason: `Simulation failed: ${JSON.stringify(simulation.value.err)}`,
      run_number: runNumber,
      profile,
      ai_decision_id: decision.id,
      ...classifyFailure({
        status: "Failed",
        profile,
        error: JSON.stringify(simulation.value.err),
        stage: "Simulation",
      }),
    });
    await onLog?.({
      level: "info",
      message: `Logged failed run #${runNumber} to lifecycle_log.jsonl`,
    });
    return failedRun;
  }
  await onLog?.({
    level: "success",
    message: `Solana simulation OK (${simulation.value.unitsConsumed ?? 0} CUs used)`,
  });

  await onLog?.({
    level: "info",
    message: "Submitting transaction to Jito via sendTransaction",
    data: { stage: "jito-submit" },
  });
  const response = await fetch(`${getJitoUrl()}/api/v1/transactions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "sendTransaction",
      params: [tx.serialize().toString("base64"), { encoding: "base64" }],
    }),
  });

  const bundleId = response.headers.get("x-bundle-id") ?? "";
  const json = (await response.json()) as {
    result?: string;
    error?: { message?: string; code?: number };
  };
  const signature = json.result ?? tx.signature?.toString("base64") ?? "";
  await onLog?.({
    level: response.ok ? "success" : "warn",
    message: `Jito HTTP ${response.status}: ${JSON.stringify(json)}`,
    data: {
      bundleId,
      signature,
    },
  });

  if (json.error) {
    let invalidRun = await appendRun({
      bundle_id: bundleId,
      signature,
      tip_lamports: profileTip,
      tip_account: tipAccount,
      status: "Invalid",
      submitted_at: new Date().toISOString(),
      landed_at: null,
      error_reason: `${json.error.code ?? "unknown"}: ${json.error.message ?? "Jito rejected transaction"}`,
      run_number: runNumber,
      profile,
      ai_decision_id: decision.id,
      ...classifyFailure({
        status: "Invalid",
        profile,
        error: `${json.error.code ?? "unknown"}: ${json.error.message ?? ""}`,
        stage: "Jito Rejection",
      }),
    });
    await onLog?.({
      level: "error",
      message: `Jito rejected transaction; logged run #${runNumber}`,
    });
    if (options.enableAiRetry || profile === "ai-retry-test") {
      await onLog?.({
        level: "warn",
        message: "AI retry enabled; retrying once with recommended live tip",
        data: { stage: "retry", retryTip: decision.recommended_tip_lamports },
      });
      invalidRun = await submitRetry({
        connection,
        keypair,
        tipAccount,
        tipPubkey,
        tipLamports: decision.recommended_tip_lamports,
        runNumber: runNumber + 1,
        decisionId: decision.id,
        onLog,
      });
    }
    return invalidRun;
  }

  const submit_slot = await connection.getSlot("confirmed").catch(() => null);
  const submittedAt = new Date();
  const lifecycle = await pollSignatureLifecycle(connection, signature, onLog);

  const run = await appendRun({
    bundle_id: bundleId || signature,
    signature,
    tip_lamports: profileTip,
    tip_account: tipAccount,
    status: lifecycle.status,
    submitted_at: submittedAt.toISOString(),
    landed_at: lifecycle.landedAt,
    error_reason: lifecycle.errorReason,
    run_number: runNumber,
    profile,
    ai_decision_id: decision.id,
    submit_slot,
    landed_slot: lifecycle.landed_slot,
    processed_at: lifecycle.processed_at,
    confirmed_at: lifecycle.confirmed_at,
    finalized_at: lifecycle.finalized_at,
    confirmation_source: lifecycle.confirmation_source,
    ...classifyFailure({
      status: lifecycle.status,
      profile,
      error: lifecycle.errorReason,
      stage: lifecycle.status === "Failed" ? "Solana Runtime" : "Confirmation",
    }),
  });
  await onLog?.({
    level: lifecycle.status === "Landed" ? "success" : "warn",
    message: `Logged run #${runNumber} -> ${run.bundle_id} | status=${run.status}`,
  });
  return run;
}

async function submitRetry(input: {
  connection: Connection;
  keypair: Keypair;
  tipAccount: string;
  tipPubkey: PublicKey;
  tipLamports: number;
  runNumber: number;
  decisionId: string;
  onLog?: LogSink;
}) {
  const blockhash = await input.connection.getLatestBlockhash("confirmed");
  const memo = `Smart TX Observatory | AI retry | run ${input.runNumber}`;
  const tx = new Transaction({
    feePayer: input.keypair.publicKey,
    recentBlockhash: blockhash.blockhash,
  }).add(
    new TransactionInstruction({
      programId: MEMO_PROGRAM_ID,
      keys: [
        { pubkey: input.keypair.publicKey, isSigner: true, isWritable: false },
      ],
      data: Buffer.from(memo, "utf8"),
    }),
    SystemProgram.transfer({
      fromPubkey: input.keypair.publicKey,
      toPubkey: input.tipPubkey,
      lamports: input.tipLamports,
    })
  );
  tx.sign(input.keypair);
  await input.onLog?.({
    level: "info",
    message: `Retry transaction signed with ${input.tipLamports} lamports`,
    data: { stage: "retry" },
  });
  const simulation = await input.connection.simulateTransaction(tx);
  if (simulation.value.err) {
    return appendRun({
      bundle_id: "",
      signature: tx.signature?.toString("base64") ?? "",
      tip_lamports: input.tipLamports,
      tip_account: input.tipAccount,
      status: "Failed",
      submitted_at: new Date().toISOString(),
      landed_at: null,
      error_reason: `Retry simulation failed: ${JSON.stringify(simulation.value.err)}`,
      run_number: input.runNumber,
      profile: "ai-retry-test",
      ai_decision_id: input.decisionId,
      ...classifyFailure({
        status: "Failed",
        profile: "ai-retry-test",
        error: JSON.stringify(simulation.value.err),
        stage: "Retry Simulation",
      }),
    });
  }
  const response = await fetch(`${getJitoUrl()}/api/v1/transactions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "sendTransaction",
      params: [tx.serialize().toString("base64"), { encoding: "base64" }],
    }),
  });
  const bundleId = response.headers.get("x-bundle-id") ?? "";
  const json = (await response.json()) as {
    result?: string;
    error?: { message?: string; code?: number };
  };
  const signature = json.result ?? tx.signature?.toString("base64") ?? "";
  await input.onLog?.({
    level: response.ok && !json.error ? "success" : "warn",
    message: `Retry Jito HTTP ${response.status}: ${JSON.stringify(json)}`,
    data: { stage: "retry", bundleId, signature },
  });
  if (json.error) {
    return appendRun({
      bundle_id: bundleId,
      signature,
      tip_lamports: input.tipLamports,
      tip_account: input.tipAccount,
      status: "Invalid",
      submitted_at: new Date().toISOString(),
      landed_at: null,
      error_reason: `${json.error.code ?? "unknown"}: ${json.error.message ?? "Jito rejected retry"}`,
      run_number: input.runNumber,
      profile: "ai-retry-test",
      ai_decision_id: input.decisionId,
      ...classifyFailure({
        status: "Invalid",
        profile: "ai-retry-test",
        error: `${json.error.code ?? "unknown"}: ${json.error.message ?? ""}`,
        stage: "Retry Jito Rejection",
      }),
    });
  }
  const submit_slot = await input.connection
    .getSlot("confirmed")
    .catch(() => null);
  const submittedAt = new Date();
  const lifecycle = await pollSignatureLifecycle(
    input.connection,
    signature,
    input.onLog
  );

  return appendRun({
    bundle_id: bundleId || signature,
    signature,
    tip_lamports: input.tipLamports,
    tip_account: input.tipAccount,
    status: lifecycle.status,
    submitted_at: submittedAt.toISOString(),
    landed_at: lifecycle.landedAt,
    error_reason: lifecycle.errorReason,
    run_number: input.runNumber,
    profile: "ai-retry-test",
    ai_decision_id: input.decisionId,
    submit_slot,
    landed_slot: lifecycle.landed_slot,
    processed_at: lifecycle.processed_at,
    confirmed_at: lifecycle.confirmed_at,
    finalized_at: lifecycle.finalized_at,
    confirmation_source: lifecycle.confirmation_source,
    ...classifyFailure({
      status: lifecycle.status,
      profile: "ai-retry-test",
      error: lifecycle.errorReason,
      stage:
        lifecycle.status === "Failed"
          ? "Retry Solana Runtime"
          : "Retry Confirmation",
    }),
  });
}

async function appendRun(run: BundleRun) {
  await appendFile(lifecyclePath, `${JSON.stringify(run)}\n`, "utf8");
  return run;
}

async function appendAgentDecision(decision: AgentDecision) {
  await appendFile(decisionsPath, `${JSON.stringify(decision)}\n`, "utf8");
  return decision;
}

export async function buildEvidenceMarkdown() {
  const [runs, decisions, snapshot] = await Promise.all([
    readLifecycleRuns(),
    readAgentDecisions(),
    getSnapshot(),
  ]);

  const fmtDelta = (a?: string | null, b?: string | null) => {
    if (!a || !b) return "--";
    const ms = new Date(b).getTime() - new Date(a).getTime();
    return `${ms}ms`;
  };

  const lines = [
    "# Smart Transaction Observatory Evidence",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Summary",
    "",
    `- Total runs: ${snapshot.summary.total}`,
    `- Landed: ${snapshot.summary.landed}`,
    `- Failed: ${snapshot.summary.failed}`,
    `- Invalid: ${snapshot.summary.invalid}`,
    `- Landed rate: ${snapshot.summary.landedRate}%`,
    `- Median landing time: ${snapshot.summary.medianLandingMs !== null ? `${snapshot.summary.medianLandingMs}ms` : "--"}`,
    `- Median processed->confirmed: ${snapshot.summary.medianProcessedToConfirmedMs !== null ? `${snapshot.summary.medianProcessedToConfirmedMs}ms` : "--"}`,
    `- Median confirmed->finalized: ${snapshot.summary.medianConfirmedToFinalizedMs !== null ? `${snapshot.summary.medianConfirmedToFinalizedMs}ms` : "--"}`,
    "",
    "## Lifecycle Log",
    "",
    "| Run | Status | Confirmation | Tip | Submit Slot | Landed Slot | Proc->Conf | Conf->Final | Signature | Failure | Recovery |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |",
    ...runs
      .slice()
      .sort((a, b) => a.run_number - b.run_number)
      .map((run) => {
        const sig = run.signature
          ? `[${run.signature.slice(0, 8)}...](https://solscan.io/tx/${run.signature})`
          : "";
        const procToConf = fmtDelta(run.processed_at, run.confirmed_at);
        const confToFinal = fmtDelta(run.confirmed_at, run.finalized_at);
        return `| ${run.run_number} | ${run.status} | ${run.confirmation_source ?? "--"} | ${run.tip_lamports} | ${run.submit_slot ?? "--"} | ${run.landed_slot ?? "--"} | ${procToConf} | ${confToFinal} | ${sig} | ${run.failure_type ?? ""} | ${run.recovery ?? ""} |`;
      }),
    "",
    "## AI Decisions",
    "",
    "| Time | Model | Action | Tip | Confidence | Reason |",
    "| --- | --- | --- | ---: | ---: | --- |",
    ...decisions.map(
      (decision) =>
        `| ${decision.created_at} | ${decision.model} | ${decision.action} | ${decision.recommended_tip_lamports} | ${Math.round(decision.confidence * 100)}% | ${decision.reason.replace(/\|/g, "/")} |`
    ),
  ];
  return lines.join("\n");
}
