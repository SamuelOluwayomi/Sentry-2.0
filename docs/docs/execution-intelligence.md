---
sidebar_position: 10
---
# Execution Intelligence

This document covers the four upgraded execution subsystems added to Sentry 2.0: the multi-model tip engine, the Orca Whirlpool swap integration, the dual-rail simultaneous submission system, and the RPC cluster consistency checker.

---

## 1. Multi-Model Tip Engine

### Motivation

A single AI provider creates a single point of failure. If Groq is overloaded during a high-congestion event, every execution decision degrades to a static heuristic at exactly the wrong moment.

Sentry 2.0 now implements a provider cascade:

```
Groq (llama-3.3-70b-versatile)
  -> Anthropic (claude-3-5-haiku-20241022)
  -> Google Gemini (gemini-1.5-flash)
  -> OpenAI (gpt-4o-mini)
  -> Deterministic heuristic fallback
```

The first provider to return a valid JSON tip recommendation wins. If all configured providers fail, the heuristic fallback computes a tip deterministically from the tip floor and failure rate with no external call.

### Hard Bounds

The following bounds are enforced regardless of what the AI returns:

| Bound | Value | Rationale |
|---|---|---|
| Floor | 1,000 lamports | Zero-tip transactions always fail under load |
| Normal ceiling | 5,000,000 lamports | Prevents overspending during model hallucination |
| High-failure ceiling | `tip_max` from Jito percentiles | When failure rate exceeds 50%, allows full tip escalation |

### Network State Inputs

```typescript
interface NetworkState {
  currentSlot: number;
  tipMin: number;
  tipMedian: number;
  tipP75: number;
  tipMax: number;
  recentFailureRate: number;       // 0-100
  timeSinceLastSuccessSecs: number;
}
```

### API

```http
POST /api/tip-decision
Content-Type: application/json

{
  "currentSlot": 320000000,
  "tipMin": 1000,
  "tipMedian": 5000,
  "tipP75": 15000,
  "tipMax": 100000,
  "recentFailureRate": 12.5,
  "timeSinceLastSuccessSecs": 30
}
```

Response:

```json
{
  "recommendedLamports": 9500,
  "reasoning": "moderate failure rate, scale above median",
  "confidence": "high",
  "provider": "groq/llama-3.3-70b-versatile"
}
```

### Implementation

`lib/tip-engine.ts` — provider cascade + `classifyTxFailure()` error taxonomy.

---

## 2. Orca Whirlpool Swap

### Motivation

The primary demonstration of Sentry acting on Solana data rather than merely observing it. Using the official `@orca-so/whirlpools-sdk`, Sentry can execute real concentrated liquidity swaps against Orca Whirlpool pools on mainnet, with the resulting transaction submitted via Solami Beam.

### Supported Pools

| Pair | Pool Address |
|---|---|
| SOL/USDC | `HJPjoWUrhoZzkNfRpHuieeFk9WcZWjwy6PBjZ81ngndJ` |
| SOL/USDT | `4fuUiYxTQ6QCrdSq9ouBYcTM7bqSwYTSyLueGZLTy4T4` |
| SOL/mSOL | `9vqYJjDUFecLL2xPUC4Rc7hyCtZ6iJ4mDiVZX7aFXoAe` |
| mSOL/USDC | `AiMZS5U3JMvpdvsr1KeaMiS354Z1DeSg5XjA4yYRxtFf` |

### Execution Flow

1. `WhirlpoolContext.from(connection, wallet, programId, configId)` initialises the SDK with the Solami private RPC connection.
2. `client.getPool(poolAddress)` fetches live pool state.
3. `swapQuoteByInputToken(...)` computes the swap quote with slippage tolerance expressed as `{ numerator, denominator }`.
4. `whirlpool.swap(quote).build()` produces an unsigned transaction.
5. The transaction is signed and submitted to Solami Beam via `sendTransaction` JSON-RPC.

### API

```http
POST /api/orca-swap
Content-Type: application/json

{
  "poolAddress": "HJPjoWUrhoZzkNfRpHuieeFk9WcZWjwy6PBjZ81ngndJ",
  "aToB": true,
  "amountLamports": 1000000,
  "slippagePct": 0.5
}
```

Response:

```json
{
  "signature": "5xPq...",
  "inAmount": 1000000,
  "estimatedOut": 184320,
  "pool": "HJPjoWUrhoZzkNfRpHuieeFk9WcZWjwy6PBjZ81ngndJ",
  "route": "orca_whirlpool"
}
```

### Implementation

`lib/orca-swap.ts` — swap execution and `getWhirlpoolPrice()` price oracle.

---

## 3. Dual-Rail Simultaneous Submission

### Motivation

Sequential fallback (try Beam, then Jito, then RPC) adds latency at exactly the worst moment. During a congestion spike, the first provider may time out after several seconds, at which point the blockhash has aged and the retry lands in a degraded state.

The dual-rail pattern fires all three submission rails simultaneously using `Promise.allSettled` and returns the first successful result. The remaining rails are silently abandoned.

### Submission Order

| Rail | Endpoint | Method |
|---|---|---|
| Beam | `BEAM_ENDPOINT` | `sendTransaction` JSON-RPC |
| Jito | `JITO_BLOCK_ENGINE_URL/api/v1/transactions` | Bundle HTTP API |
| RPC | `SOLANA_RPC_URL` | `sendTransaction` JSON-RPC |

### Usage

```typescript
import { submitDualRail } from "./lib/dual-rail";

const result = await submitDualRail({ serializedTxBase64: tx.serialize().toString("base64") });
// result.winner === "beam" | "jito" | "rpc"
// result.landingMs — milliseconds to first confirmation
```

### Implementation

`lib/dual-rail.ts` — `submitDualRail()` and `signAndSubmitDualRail()`.

---

## 4. RPC Cluster Consistency Checker

### Motivation

A concrete, measurable demonstration that Solami private RPC consistently observes slots ahead of public endpoints.
### What is Measured

Each probe fires three parallel JSON-RPC calls per node (`getSlot`, `getVersion`, `getLatestBlockhash`) and records:

- Slot head at `processed` commitment
- Response latency (ms)
- Solana core version
- First 8 characters of the latest blockhash

### Interpretation

The `solamiAdvantageSlots` field in the report is the difference between the Solami slot and the arithmetic mean of all public endpoints. A consistent positive value confirms that the Solami private RPC is observing slots earlier than public infrastructure.

### API

```http
GET /api/rpc-check
```

Response:

```json
{
  "timestamp": 1728460000000,
  "fastestNode": "Solami (Private)",
  "headSlot": 320485012,
  "solamiAdvantageSlots": 3,
  "results": [
    { "name": "Solami (Private)", "slot": 320485012, "slotLag": 0, "latencyMs": 28 },
    { "name": "Mainnet-Beta (Public)", "slot": 320485009, "slotLag": 3, "latencyMs": 210 }
  ]
}
```

### Implementation

`lib/rpc-consistency.ts` — `checkRpcConsistency()` and `formatConsistencyReport()`.

---

## 5. Dashboard UI Integration

All four execution intelligence modules are surfaced in the Sentry 2.0 Observatory Dashboard under the **Intelligence and Execution Tools** section (`#intelligence-section`), accessible directly from the top navigation dropdown and mobile menu.

### 5.1 Interactive Tip Decision Console (`TipDecisionPanel`)
- Binds directly to live Solami private RPC telemetry (slot progression and 75th-percentile tip rates).
- Allows operators to adjust simulated network variables (failure rate %, time elapsed since last confirmed transaction, minimum tip, maximum tip).
- Displays the winning AI model from the provider cascade (Groq LPU, Anthropic, Gemini, OpenAI, or deterministic fallback), recommendation in lamports, reasoning explanation, and confidence classification (`HIGH`, `MEDIUM`, `LOW`).
- Maintains an append-only in-memory log of recent execution decisions.

### 5.2 Real-Time RPC Consistency Benchmark (`RpcConsistencyPanel`)
- Probes Solami Private RPC against public Mainnet-Beta and secondary RPC mirrors on demand.
- Surfaces an empirical **Solami Slot Advantage** banner highlighting the positive lead delta (+N slots ahead of public cluster averages).
- Tabular breakdown comparing slot head, lag relative to fastest node, ping round-trip latency in milliseconds, and solana-core software versions.

### 5.3 Orca Whirlpool DEX Execution Terminal (`OrcaSwapPanel`)
- Enables manual and automated concentrated liquidity trades directly from the web interface.
- Configurable liquidity pool selector (SOL/USDC, SOL/USDT, SOL/mSOL), trade direction (Sell Token A / Sell Token B), size in SOL, and slippage tolerance.
- Dispatches signed swap instructions through Solami Beam SWQoS with live transaction status updates and one-click Solscan block explorer verification links.

### 5.4 Dual-Rail Live Submission Stream (`DualRailPanel`)
- Connects to the real-time Server-Sent Events stream (`/api/events`) to monitor transactions submitted across the network.
- Inspects winning execution rails (`BEAM`, `JITO`, or `RPC`) as `Promise.allSettled` races resolve.
- Renders landing durations (ms), truncated transaction signatures, and confirmation timestamps in real time.
