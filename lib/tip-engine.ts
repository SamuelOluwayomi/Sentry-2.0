// Sentry 2.0 -- Multi-Model AI Tip Engine
// Provider cascade: Groq → Anthropic → Gemini → OpenAI
// Hard bounds: floor 1,000 lamports | ceiling 5,000,000 lamports
// Failure-rate scaling: if failure_rate > 50%, allow up to tip_max
export interface NetworkState {
  currentSlot: number;
  tipMin: number;
  tipMedian: number;
  tipP75: number;
  tipMax: number;
  recentFailureRate: number;       // 0-100
  timeSinceLastSuccessSecs: number;
}

export interface TipDecision {
  recommendedLamports: number;
  reasoning: string;
  confidence: "high" | "medium" | "low";
  provider: string;
}

// ── Hard bounds 
const HARD_FLOOR = 1_000;         // never tip < 1,000 lamports
const HARD_CEILING = 5_000_000;     // never tip > 0.005 SOL under normal conditions
const HIGH_FAILURE_THRESHOLD = 50;  // above 50% failure rate → scale ceiling to tip_max

function buildPrompt(state: NetworkState): string {
  const effectiveCeiling = state.recentFailureRate > HIGH_FAILURE_THRESHOLD
    ? state.tipMax
    : Math.min(HARD_CEILING, state.tipMax);

  return `Given the following Solana network state, return the optimal Jito/Beam tip in lamports.

Network state:
- Current slot: ${state.currentSlot}
- Seconds since last successful landing: ${state.timeSinceLastSuccessSecs}
- Tip floor (lamports): min=${state.tipMin}, median=${state.tipMedian}, p75=${state.tipP75}, p95=${state.tipMax}
- Recent tx failure rate: ${state.recentFailureRate.toFixed(1)}%

Constraints (HARD — violating any invalidates your output):
- recommended_lamports MUST be >= ${HARD_FLOOR}
- recommended_lamports MUST be <= ${effectiveCeiling}
- If failure rate is 0% and time since success is 0, bid at or near the minimum (${state.tipMin}).
- Only increase tip proportionally to failure rate.

Respond with ONLY this JSON object, nothing else:
{"recommended_lamports": <integer>, "reasoning": "<very short, max 10 words>", "confidence": "high|medium|low"}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function heuristicTip(state: NetworkState): TipDecision {
  // Deterministic fallback: lerp between tipMin and tipMax based on failure rate
  const t = Math.min(state.recentFailureRate / 100, 1);
  const ceil = state.recentFailureRate > HIGH_FAILURE_THRESHOLD ? state.tipMax : HARD_CEILING;
  const raw = state.tipMin + t * (ceil - state.tipMin);
  const lamports = clamp(Math.round(raw), HARD_FLOOR, ceil);
  return {
    recommendedLamports: lamports,
    reasoning: `${state.recentFailureRate.toFixed(0)}% fail rate heuristic`,
    confidence: "medium",
    provider: "heuristic_fallback",
  };
}

// ── Provider implementations ──────────────────────────────────────────────

async function tryGroq(prompt: string): Promise<TipDecision | null> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  const models = ["llama-3.3-70b-versatile", "llama3-70b-8192", "mixtral-8x7b-32768"];
  for (const model of models) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST", signal: ctrl.signal,
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], temperature: 0.1, max_tokens: 100 }),
      });
      clearTimeout(t);
      if (!res.ok) continue;
      const j = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
      const raw = j.choices?.[0]?.message?.content ?? "";
      const parsed = JSON.parse(raw.match(/\{[\s\S]*?\}/)?.[0] ?? "{}") as Partial<TipDecision>;
      if (parsed.recommendedLamports) return { ...parsed, provider: `groq/${model}` } as TipDecision;
    } catch { /* try next */ }
  }
  return null;
}

async function tryAnthropic(prompt: string): Promise<TipDecision | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", signal: ctrl.signal,
      headers: {
        "x-api-key": key, "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 100,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const j = await res.json() as { content?: Array<{ text?: string }> };
    const raw = j.content?.[0]?.text ?? "";
    const parsed = JSON.parse(raw.match(/\{[\s\S]*?\}/)?.[0] ?? "{}") as Partial<TipDecision>;
    if (parsed.recommendedLamports) return { ...parsed, provider: "anthropic/claude-3-5-haiku" } as TipDecision;
  } catch { /* fall through */ }
  return null;
}

async function tryGemini(prompt: string): Promise<TipDecision | null> {
  const key = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_AI_KEY;
  if (!key) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
      {
        method: "POST", signal: ctrl.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 100 } }),
      }
    );
    clearTimeout(t);
    if (!res.ok) return null;
    const j = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const raw = j.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const parsed = JSON.parse(raw.match(/\{[\s\S]*?\}/)?.[0] ?? "{}") as Partial<TipDecision>;
    if (parsed.recommendedLamports) return { ...parsed, provider: "gemini/flash-1.5" } as TipDecision;
  } catch { /* fall through */ }
  return null;
}

async function tryOpenAI(prompt: string): Promise<TipDecision | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST", signal: ctrl.signal,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: prompt }], max_tokens: 100, temperature: 0.1 }),
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const j = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    const raw = j.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(raw.match(/\{[\s\S]*?\}/)?.[0] ?? "{}") as Partial<TipDecision>;
    if (parsed.recommendedLamports) return { ...parsed, provider: "openai/gpt-4o-mini" } as TipDecision;
  } catch { /* fall through */ }
  return null;
}

// ── Public API 

/**
 * Cascade order: Groq → Anthropic → Gemini → OpenAI → heuristic fallback
 * Result is always hard-clamped to [HARD_FLOOR, effective_ceiling].
 */
export async function decideTip(state: NetworkState): Promise<TipDecision> {
  const prompt = buildPrompt(state);
  const effectiveCeiling = state.recentFailureRate > HIGH_FAILURE_THRESHOLD
    ? state.tipMax : Math.min(HARD_CEILING, state.tipMax);

  const decision =
    await tryGroq(prompt) ??
    await tryAnthropic(prompt) ??
    await tryGemini(prompt) ??
    await tryOpenAI(prompt) ??
    heuristicTip(state);

  // Always hard-clamp regardless of what the AI returned
  decision.recommendedLamports = clamp(
    Math.round(decision.recommendedLamports),
    HARD_FLOOR,
    effectiveCeiling,
  );

  console.log(`[TipEngine] ${decision.provider}: ${decision.recommendedLamports} lamports — "${decision.reasoning}"`);
  return decision;
}

/**
 * Classify a raw RPC/Beam error string into a structured recovery action.
 */
export type RecoveryAction =
  | "refresh_blockhash"
  | "increase_tip"
  | "wait_one_slot"
  | "abort_insufficient_funds"
  | "give_up";

export interface FailureClassification {
  category: string;
  recovery: RecoveryAction;
  tipMultiplier: number;  // e.g. 1.5 = increase tip by 50%
  retryable: boolean;
}

export function classifyTxFailure(rawError: string): FailureClassification {
  const err = rawError.toLowerCase();

  if (err.includes("blockhash") || err.includes("expired")) {
    return { category: "ExpiredBlockhash", recovery: "refresh_blockhash", tipMultiplier: 1.0, retryable: true };
  }
  if (err.includes("insufficient") && err.includes("fund")) {
    return { category: "InsufficientFunds", recovery: "abort_insufficient_funds", tipMultiplier: 1.0, retryable: false };
  }
  if (err.includes("fee too low") || err.includes("fee_too_low") || err.includes("feepayernotfound")) {
    return { category: "FeeTooLow", recovery: "increase_tip", tipMultiplier: 1.5, retryable: true };
  }
  if (err.includes("leader") || err.includes("skipped") || err.includes("slot skipped")) {
    return { category: "LeaderSkipped", recovery: "wait_one_slot", tipMultiplier: 1.0, retryable: true };
  }
  if (err.includes("timeout") || err.includes("timed out")) {
    return { category: "Timeout", recovery: "refresh_blockhash", tipMultiplier: 1.2, retryable: true };
  }
  if (err.includes("simulation failed") || err.includes("preflight")) {
    return { category: "SimulationFailed", recovery: "give_up", tipMultiplier: 1.0, retryable: false };
  }

  return { category: "Unknown", recovery: "give_up", tipMultiplier: 1.0, retryable: false };
}
