// Sentry 2.0 -- Network Snapshot
// Captures real-time network state: slot, leader, tips, congestion, latency.
// This is the ExecutionContext every transaction decision is grounded in.

import type { NetworkSnapshot, NetworkRegime } from "./types";

const JITO_TIP_URL = "https://bundles.jito.wtf/api/v1/bundles/tip_floor";
const BEAM_HEALTH_URL = "https://beam.solami.dev/health";
const BEAM_TIP_URL = "https://app.solami.dev/api/v1/tips/percentiles";

// EMA state (persisted across calls in-process)
let tipEma = 0;
const TIP_EMA_ALPHA = 0.2; // fast-adapting EMA
const tipHistory: number[] = [];
const CONGESTION_WINDOW = 20; // slots

// Route latency tracking
const beamLatencies: number[] = [];
const jitoLatencies: number[] = [];

function computeEma(newValue: number, prev: number): number {
  if (prev === 0) return newValue;
  return TIP_EMA_ALPHA * newValue + (1 - TIP_EMA_ALPHA) * prev;
}

function classifyRegime(p75: number, congestion: number): NetworkRegime {
  if (p75 > 80_000 || congestion > 85) return "critical";
  if (p75 > 40_000 || congestion > 65) return "hot";
  if (p75 > 10_000 || congestion > 35) return "warm";
  return "cold";
}

function computeTipTrend(history: number[]): "rising" | "falling" | "stable" {
  if (history.length < 3) return "stable";
  const recent = history.slice(-3);
  const oldest = recent[0];
  const newest = recent[recent.length - 1];
  const changePct = ((newest - oldest) / (oldest || 1)) * 100;
  if (changePct > 15) return "rising";
  if (changePct < -15) return "falling";
  return "stable";
}

async function fetchTipPercentiles(): Promise<{
  p25: number; p50: number; p75: number; p95: number;
}> {
  // Try Beam/Solami first
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const resp = await fetch(BEAM_TIP_URL, { signal: controller.signal });
    clearTimeout(timer);
    if (resp.ok) {
      const data = await resp.json() as { p25?: number; p50?: number; p75?: number; p95?: number };
      if (data.p75) {
        return {
          p25: data.p25 ?? 2000,
          p50: data.p50 ?? 4000,
          p75: data.p75,
          p95: data.p95 ?? data.p75 * 2,
        };
      }
    }
  } catch {
    // fall through
  }

  // Fall back to Jito tip API
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const resp = await fetch(JITO_TIP_URL, { signal: controller.signal });
    clearTimeout(timer);
    if (resp.ok) {
      const arr = await resp.json() as Array<Record<string, number>>;
      if (Array.isArray(arr) && arr.length > 0) {
        const row = arr[0];
        return {
          p25: Math.round((row.p25_landed_tips ?? row.landed_tips_25th_percentile ?? 2000) * 1e9),
          p50: Math.round((row.p50_landed_tips ?? row.landed_tips_50th_percentile ?? 4000) * 1e9),
          p75: Math.round((row.p75_landed_tips ?? row.landed_tips_75th_percentile ?? 8000) * 1e9),
          p95: Math.round((row.p95_landed_tips ?? row.landed_tips_95th_percentile ?? 20000) * 1e9),
        };
      }
    }
  } catch {
    // fall through
  }

  // Hardcoded fallback (representative mainnet values)
  return { p25: 2_000, p50: 5_000, p75: 12_000, p95: 30_000 };
}

async function checkHealth(url: string, timeoutMs = 2500): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const start = Date.now();
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    const latency = Date.now() - start;
    beamLatencies.push(latency);
    if (beamLatencies.length > 20) beamLatencies.shift();
    return resp.ok;
  } catch {
    return false;
  }
}

async function fetchCurrentSlot(rpcUrl: string): Promise<number> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const resp = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getSlot", params: [{ commitment: "processed" }] }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (resp.ok) {
      const json = await resp.json() as { result?: number };
      return json.result ?? 0;
    }
  } catch {
    // fall through
  }
  return 0;
}

/** Capture a full NetworkSnapshot from live Solami/Jito APIs. */
export async function captureNetworkSnapshot(rpcUrl?: string): Promise<NetworkSnapshot> {
  const capturedAt = new Date().toISOString();
  const url = rpcUrl ?? process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";

  const [tips, beamHealthy, slot] = await Promise.all([
    fetchTipPercentiles(),
    checkHealth(BEAM_HEALTH_URL),
    fetchCurrentSlot(url),
  ]);

  // Update EMA
  tipEma = computeEma(tips.p75, tipEma);
  tipHistory.push(tips.p75);
  if (tipHistory.length > CONGESTION_WINDOW) tipHistory.shift();

  // Compute congestion score from tip trend and EMA deviation
  const emaDev = tipEma > 0 ? Math.abs(tips.p75 - tipEma) / tipEma : 0;
  const congestionScore = Math.min(100, Math.round(emaDev * 100 + (tips.p75 / 1000)));

  const regime = classifyRegime(tips.p75, congestionScore);
  const tipTrend = computeTipTrend(tipHistory);

  return {
    capturedAt,
    slot,
    tipP25: tips.p25,
    tipP50: tips.p50,
    tipP75: tips.p75,
    tipP95: tips.p95,
    tipEma: Math.round(tipEma),
    tipTrend,
    regime,
    congestionScore,
    beamHealthy,
    jitoHealthy: true, // assume healthy unless we know otherwise
    yellowstoneHealthy: true,
    blurHealthy: true,
    rpcHealthy: slot > 0,
  };
}

/** Lightweight cached snapshot (re-captured every 2s at most). */
let cachedSnapshot: NetworkSnapshot | null = null;
let lastCaptureMs = 0;
const CACHE_TTL_MS = 2000;

export async function getNetworkSnapshot(rpcUrl?: string): Promise<NetworkSnapshot> {
  const now = Date.now();
  if (cachedSnapshot && now - lastCaptureMs < CACHE_TTL_MS) {
    return cachedSnapshot;
  }
  cachedSnapshot = await captureNetworkSnapshot(rpcUrl);
  lastCaptureMs = now;
  return cachedSnapshot;
}

/** Record a successful route landing to improve scoring. */
export function recordRouteLatency(route: "beam" | "jito", latencyMs: number) {
  if (route === "beam") {
    beamLatencies.push(latencyMs);
    if (beamLatencies.length > 50) beamLatencies.shift();
  } else {
    jitoLatencies.push(latencyMs);
    if (jitoLatencies.length > 50) jitoLatencies.shift();
  }
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function getRoutePerformance() {
  return {
    beam: {
      medianLatencyMs: Math.round(median(beamLatencies)),
      sampleSize: beamLatencies.length,
    },
    jito: {
      medianLatencyMs: Math.round(median(jitoLatencies)),
      sampleSize: jitoLatencies.length,
    },
  };
}
