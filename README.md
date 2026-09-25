# Sentry 2.0: Autonomous Smart Transaction Stack on Solana

**Superteam Advanced Infrastructure Bounty Submission**  
*Detect. Understand. Decide. Execute. Recover. Prove.*

[![Solana Mainnet](https://img.shields.io/badge/Network-Solana%20Mainnet%20Beta-black?style=flat-square&logo=solana)](https://explorer.solana.com/)
[![Routing](https://img.shields.io/badge/Router-Solami%20Beam%20SWQoS-FF5A26?style=flat-square)](https://solami.dev/)
[![Telemetry](https://img.shields.io/badge/Stream-Yellowstone%20gRPC%20%2B%20Blur-blue?style=flat-square)](https://solami.dev/)
[![Inference](https://img.shields.io/badge/AI%20LPU-Groq%20Hardware%20Inference-black?style=flat-square)](https://groq.com/)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](./LICENSE)

---

## Table of Contents

1. [Executive Summary & Problem Statement](#1-executive-summary--problem-statement)
2. [Architectural Overview](#2-architectural-overview)
3. [Engineering & Tooling Decisions: Why This Stack?](#3-engineering--tooling-decisions-why-this-stack)
4. [Subsystem Deep Dives](#4-subsystem-deep-dives)
   - [Event Ingestion & Opportunity Scoring](#41-event-ingestion--opportunity-scoring)
   - [Network Snapshot & Market Regime Classification](#42-network-snapshot--market-regime-classification)
   - [Deterministic Policy Engine & Invariant Gates](#43-deterministic-policy-engine--invariant-gates)
   - [Groq LPU Sub-Slot Tactical Inference](#44-groq-lpu-sub-slot-tactical-inference)
   - [Action Engine, Solami Beam & Jito Bundles](#45-action-engine-solami-beam--jito-bundles)
   - [Automated Recovery & Lifecycle Tracking](#46-automated-recovery--lifecycle-tracking)
   - [Verifiable Decision Provenance Ledger](#47-verifiable-decision-provenance-ledger)
5. [Fault Injection Taxonomy & Resilience Lab](#5-fault-injection-taxonomy--resilience-lab)
6. [Calculated Landing Metrics & Empirical Mainnet Proof](#6-calculated-landing-metrics--empirical-mainnet-proof)
7. [User Interface & Operator Experience](#7-user-interface--operator-experience)
8. [Project Structure](#8-project-structure)
9. [Local Development, Deployment & CLI Guide](#9-local-development-deployment--cli-guide)
10. [Bounty Deliverables & Evidence Index](#10-bounty-deliverables--evidence-index)

---

## 1. Executive Summary & Problem Statement

### 1.1 The Solana Congestion Paradox
Solana processes thousands of transactions per second across 400-millisecond slots organized into 4-slot leader batches. However, during high-volatility DEX volume surges (Raydium, Whirlpools, Pump.fun), the public network experiences severe degradation:
- **Up to 40% Packet Loss**: Standard RPC nodes blast UDP and QUIC packets blindly across public TPU nodes. When validators become saturated, packets are discarded before reaching the leader's banking stage.
- **Blind Priority Fee Bidding**: Applications estimate static priority fees without knowing the scheduled slot leader or real-time percentile distribution. Users either wildly overpay or get outbid in microsecond congestion bursts.
- **Zero Observability into Dropped Transactions**: When a transaction fails to land, standard RPCs return generic timeout errors with zero causal traces explaining whether the failure was due to an expired blockhash, an outbid tip, or packet drop.

### 1.2 The Evolution: From Sentry 1 to Sentry 2.0
- **Sentry 1 (The Passive Observer)**: Sentry 1 operated as an observatory. It read historical runs, allowed manual bundle submission, and polled RPCs for basic status. It had no ability to react autonomously to on-chain conditions, lacked sub-slot market telemetry, and possessed no recovery intelligence.
- **Sentry 2.0 (The Autonomous Smart Transaction Stack)**: Sentry 2.0 shifts from passive observation to an active, autonomous closed-loop execution engine. It connects directly to live Yellowstone gRPC and Blur market data streams, evaluates events through deterministic safety policies, optimizes tip bidding using sub-slot Groq LPU inference, routes transactions directly to the scheduled leader via Solami Beam SWQoS, automatically detects and recovers from execution faults, and logs immutable decision provenance receipts for every slot transition.

---

## 2. Architectural Overview

```
                      [ LIVE SOLANA MAINNET TELEMETRY ]
                                     │
         ┌───────────────────────────┴───────────────────────────┐
         │                                                       │
         ▼                                                       ▼
  [ Solami Blur ]                                     [ Solami Yellowstone ]
  Pre-block decoded DEX events                         gRPC slot & leader feed
  (Swaps, Liquidity, Pools)                           (Leader schedule, Geyser)
         │                                                       │
         └───────────────────────────┬───────────────────────────┘
                                     │
                                     ▼
                        ┌─────────────────────────┐
                        │   1. EVENT ENGINE       │
                        │ - Decodes & Deduplicates│
                        │ - Opportunity Scoring   │
                        │ - Priority Assessment   │
                        └────────────┬────────────┘
                                     │
                                     ▼
                        ┌─────────────────────────┐
                        │  2. NETWORK SNAPSHOT    │
                        │ - Scheduled Leader Dist │
                        │ - Tip Floor EMA (p75)   │
                        │ - Congestion Regime     │
                        └────────────┬────────────┘
                                     │
                                     ▼
                        ┌─────────────────────────┐
                        │   3. POLICY ENGINE      │
                        │ - Deterministic Gates   │
                        │ - Max Tip / Slippage    │
                        │ - Automated Circuit Brk │
                        │ ──> ALLOW / BLOCK / SHADOW
                        └────────────┬────────────┘
                                     │ (Allowed / Shadow)
                                     ▼
                        ┌─────────────────────────┐
                        │   4. GROQ AI OPERATOR   │
                        │ - LPU Hardware (~180ms) │
                        │ - Tactical Tip Strategy │
                        │ - Urgency & Risk Bounds │
                        └────────────┬────────────┘
                                     │
                                     ▼
                        ┌─────────────────────────┐
                        │   5. ACTION ENGINE      │
                        │ - Transaction Assembly  │
                        │ - Tip Account Injection │
                        │ - Direct Beam Dispatch  │
                        └────────────┬────────────┘
                                     │
                    ┌────────────────┴────────────────┐
                    │                                 │
     (Primary Route)▼                  (Fallback Route)▼
      ┌─────────────────────────┐       ┌─────────────────────────┐
      │   Solami Beam (SWQoS)   │       │   Direct Jito Bundle    │
      │   Leader Priority Pipe  │       │   Block-Engine Tip      │
      └─────────────┬───────────┘       └─────────────┬───────────┘
                    │                                 │
                    └────────────────┬────────────────┘
                                     │
                                     ▼
                        ┌─────────────────────────┐
                        │ 6. RECOVERY & LIFECYCLE │
                        │ - Processed/Conf/Final  │
                        │ - Fault Classification  │
                        │ - Dynamic Retry & Bump  │
                        └────────────┬────────────┘
                                     │
                                     ▼
                        ┌─────────────────────────┐
                        │  7. DECISION PROVENANCE │
                        │ - Immutable Receipt Log │
                        │ - Full Causal Audit     │
                        │ - JSONL Evidence Proof  │
                        └─────────────────────────┘
```

---

## 3. Engineering & Tooling Decisions: Why This Stack?

Every component in Sentry 2.0 was deliberately selected to solve a specific bottleneck in high-frequency Solana transaction routing:

### 3.1 Solami Beam vs. Standard Public RPC
- **The Bottleneck**: Standard RPC nodes broadcast transactions over public UDP/QUIC to random cluster nodes. During priority gas wars, up to 40% of packets get dropped before reaching the current slot leader.
- **Why Solami Beam**: Solami Beam provides **Stake-Weighted Quality of Service (SWQoS)** direct validator ingress. It identifies the upcoming scheduled validator leader and routes transactions through dedicated, stake-weighted validator connections, guaranteeing inclusion without public mempool packet drops.

### 3.2 Solami Blur vs. Polling RPC Logs
- **The Bottleneck**: Reading transactions via standard `onLogs` or `getSignaturesForAddress` notifications only reports state *after* a block has already been built and sealed (400ms to 1200ms latency). By that time, trading opportunities or liquidation windows have closed.
- **Why Solami Blur**: Blur decodes Solana market activity at the transaction serialization layer in flight. It streams decoded DEX swaps (Raydium, Orca Whirlpools, Meteora) and pool reserve updates sub-slot, allowing Sentry 2.0 to trigger policy evaluations before blocks seal.

### 3.3 Solami Yellowstone gRPC vs. JSON-RPC `getSlot`
- **The Bottleneck**: Polling JSON-RPC for slot changes introduces HTTP serialization overhead and 200–500ms jitter, causing applications to submit transactions against stale blockhashes or to the previous slot leader.
- **Why Solami Yellowstone**: Yellowstone Geyser streams raw Protobuf messages over persistent gRPC channels directly from validator memory. Sentry 2.0 receives slot tick events and leader schedule transitions with sub-millisecond latency.

### 3.4 Jito Block-Engine Bundles vs. Raw Fee Escalation
- **The Bottleneck**: Increasing compute-budget priority fees on standard transactions burns SOL even if the transaction fails due to slippage or frontrunning.
- **Why Jito Bundles**: Jito bundles execute atomically (all-or-nothing). If condition invariants fail during execution, the bundle is dropped and **zero tip is charged**. Sentry dynamically selects tip accounts from the on-chain tip registry and bids according to live network percentiles.

### 3.5 Groq LPUs (`llama-3.3-70b-versatile`) vs. Standard Cloud LLMs
- **The Bottleneck**: In Solana's 400ms slot architecture, standard cloud LLM APIs (OpenAI GPT-4, Anthropic Claude) take 2.0 to 5.0 seconds to respond. An AI model that takes 3 seconds to recommend a tip has missed 7 Solana slots.
- **Why Groq LPUs**: Groq's Tensor Streaming Processors (LPU architecture) achieve **~180ms Time-To-First-Token (TTFT)**. Groq can evaluate network congestion, leader proximity, and slippage risk within a single slot window, providing genuine sub-slot tactical intelligence.

### 3.6 Rust Engine (`engine/`) + TypeScript Runtime (`lib/`) Hybrid Architecture
- **Rust Engine (`engine/src/`)**: Zero-copy gRPC protobuf deserialization, ed25519 bundle signing, raw network packet dispatch, and high-frequency confirmation polling. Native performance with zero garbage collection pauses.
- **TypeScript Runtime (`lib/`)**: Rich reactive event bus, deterministic policy evaluator, Next.js 15 App Router server-side streaming (SSE), dynamic dashboard controls, and rapid configuration.

---

## 4. Subsystem Deep Dives

### 4.1 Event Ingestion & Opportunity Scoring
File: [`lib/event-engine.ts`](file:///home/samuel/sentry%202.0/lib/event-engine.ts)

The Event Engine ingests market and network events, deduplicates them through a time-windowed hash cache, and assigns a normalized **Opportunity Score (0 to 100)**:

$$\text{Score} = \min\left(100, \left(\frac{\text{volumeUsd}}{1000} \times 20\right) + (\text{impactPct} \times 15) + \text{basePriority}\right)$$

Supported event categories:
1. `swap`: High-volume DEX token swaps on Raydium / Orca.
2. `liquidity_add` / `liquidity_remove`: AMM reserve alterations affecting slippage depth.
3. `large_transfer`: Substantial SOL or SPL-token movements signaling whale activity.
4. `pool_created`: New DEX pool initialization requiring immediate liquidity analysis.
5. `fault_injection`: Synthetic test events dispatched by the resilience lab.

### 4.2 Network Snapshot & Market Regime Classification
File: [`lib/network-snapshot.ts`](file:///home/samuel/sentry%202.0/lib/network-snapshot.ts)

The Network Snapshot maintains a rolling window of mainnet conditions:
- **Leader Distance (`slotsToLeader`)**: Number of slots until our staked validator leader assumes block production.
- **Dynamic Tip EMA**: Exponential Moving Average smoothing rapid percentile volatility:
  $$\text{EMA}_t = \alpha \cdot \text{Tip}_{p75} + (1 - \alpha) \cdot \text{EMA}_{t-1}$$
- **Congestion Regimes**:
  - `cold` (Score < 30): Low network contention, base tip floor (30,000 lamports).
  - `warm` (Score 30–60): Moderate activity, standard p75 tip floor.
  - `hot` (Score 60–85): Severe DEX contention, p90 tip floor, strict slippage enforcement.
  - `critical` (Score > 85): Network distress, non-critical execution paused.

### 4.3 Deterministic Policy Engine & Invariant Gates
File: [`lib/policy-engine.ts`](file:///home/samuel/sentry%202.0/lib/policy-engine.ts)

AI models are probabilistic; financial infrastructure must be deterministic. The Policy Engine enforces absolute invariants that **cannot be overridden by the AI operator**:
- `maxTipLamports`: Hard ceiling on single bundle tips (default: 100,000 lamports / 0.0001 SOL).
- `maxHourlyBudgetLamports`: Maximum cumulative tip expenditure allowed per hour.
- `minWalletBalanceSol`: Guaranteed reserve floor (ensures the real funded wallet never depletes below 0.0015 SOL).
- `maxSlippageBps`: Rejection threshold for unfavorable pool impact (default: 150 bps / 1.5%).
- **Automated Circuit Breaker**:
  - `CLOSED`: Normal operation.
  - `OPEN`: Tripped after 5 consecutive execution failures. All execution is halted; events transition to `blocked`.
  - `HALF-OPEN`: Cooldown state after 30 seconds allowing a single probe transaction.

### 4.4 Groq LPU Sub-Slot Tactical Inference
File: [`lib/agent-runner.ts`](file:///home/samuel/sentry%202.0/lib/agent-runner.ts), [`agent/src/index.ts`](file:///home/samuel/sentry%202.0/agent/src/index.ts)

When the Policy Engine allows an event, telemetry is dispatched to Groq LPUs (`llama-3.3-70b-versatile`):
- Prompt payload: Current slot, leader distance, tip percentiles (p25/p50/p75/p95), recent landed rate, and failure history.
- AI Output:
  ```json
  {
    "action": "submit",
    "recommended_tip_lamports": 45000,
    "confidence": 0.94,
    "observed_risk": "low",
    "reason": "Tip p75 is stable. Leader scheduled in 2 slots. Sufficient wallet margin."
  }
  ```
- Guardrail clamp: If Groq outputs a tip exceeding `maxTipLamports`, the Policy Engine automatically clamps the value to the deterministic ceiling.

### 4.5 Action Engine, Solami Beam & Jito Bundles
File: [`lib/action-engine.ts`](file:///home/samuel/sentry%202.0/lib/action-engine.ts), [`engine/src/beam.rs`](file:///home/samuel/sentry%202.0/engine/src/beam.rs)

Transactions are constructed and submitted via Solami Beam:
1. Fresh blockhash acquired from high-speed RPC connection.
2. System transfer instruction created from funded mainnet wallet.
3. Jito tip instruction added targeting active Beam tip accounts (`DfXygSm...`, `DttWaMu...`, `ADuUkR4...`).
4. Wire-formatted transaction serialized and signed with ed25519 keypair.
5. Dispatched via HTTP POST to `https://api.solami.dev/beam/v1/bundle` with SWQoS priority header.

### 4.6 Automated Recovery & Lifecycle Tracking
File: [`lib/observatory.ts`](file:///home/samuel/sentry%202.0/lib/observatory.ts), [`engine/src/lifecycle.rs`](file:///home/samuel/sentry%202.0/engine/src/lifecycle.rs)

Every submission tracks three sequential commitment states:
$$\text{Submitted} \longrightarrow \text{Processed} \longrightarrow \text{Confirmed} \longrightarrow \text{Finalized}$$

If a submission does not land within 15 seconds:
1. **Classification**: Analyzes error code (`ExpiredBlockhash`, `InsufficientPriorityFee`, `RateLimited`).
2. **Strategy**: If retryable (e.g. low tip), the engine computes a 30% tip escalation.
3. **Execution**: Fetches a fresh blockhash and re-routes via Beam.

### 4.7 Verifiable Decision Provenance Ledger
File: [`lib/evidence-engine.ts`](file:///home/samuel/sentry%202.0/lib/evidence-engine.ts)

Every transaction emits an immutable JSONL receipt stored in `logs/execution_receipts.jsonl`. Each receipt documents the full causal chain:
- `trigger`: Originating event ID, source (Blur/Yellowstone), type, and opportunity score.
- `policyEvaluation`: Invariant checks passed, circuit breaker state, assigned route.
- `agentDecision`: Groq model ID, inference latency, recommended tip, and full reasoning text.
- `actionResult`: Mainnet signature, actual tip paid, total cost in SOL, and duration.
- `lifecycle`: Millisecond timestamps for processed, confirmed, and finalized stages.

---

## 5. Fault Injection Taxonomy & Resilience Lab

Sentry 2.0 includes a dedicated Fault Injection Lab (`#autonomous-lab`) to prove resilience against common mainnet failure modes:

| Injected Fault | Simulated Mechanism | Detection & Recovery Strategy | Receipt Status |
|---|---|---|---|
| `expired_blockhash` | Injects blockhash from 200 slots ago | Sentry identifies expired hash, re-acquires latest blockhash from RPC, and resubmits | `failed` → `confirmed` |
| `low_tip` | Submits bundle with 5,000 lamports (below floor) | Detected as underbid; recovery engine escalates tip by +30% to hit p75 floor | `failed` → recovered |
| `zero_tip` | Omits Jito tip instruction entirely | Bundle validator rejects; failure classified as `insufficient_fee`; retry blocked by policy | `failed` (classified) |
| `rate_limit_exceeded` | Triggers 20 synthetic events in 1 second | Rate limiter throttles excess; non-critical events dropped cleanly | `blocked` |
| `congestion_spike` | Simulates network congestion score 95/100 | Mode transitions to defensive; tips bumped to p95 floor | `shadow` / safe |
| `simulation_failure` | Generates instruction with invalid account data | Preflight simulation detects error; transaction held to save fees | `blocked` |
| `circuit_breaker_trip` | Simulates 5 consecutive execution drops | Circuit breaker trips to `OPEN`; all outbound traffic locked | `circuit_open` |

---

## 6. Calculated Landing Metrics & Empirical Mainnet Proof

All metrics displayed on Sentry 2.0 are **dynamically calculated from real on-chain execution logs**, with zero hardcoded values.

### 6.1 Real Mainnet Test Environment
- **Network**: Solana Mainnet Beta (`mainnet-beta`)
- **Funded Wallet**: `EPpNW3G47SAJ4j1DatpjW7mJMLRTH9Z8K7LJtBfhR8Mt`
- **Initial Funding**: 0.0020 SOL
- **Current Balance**: ~0.00187 SOL (proving minimal, highly optimized capital consumption)
- **Dynamic Tip Floor**: 30,000 lamports (0.00003 SOL)

### 6.2 The Calculated Landing Rate
The Mainnet Landing Rate shown on the hero is derived dynamically from recorded runs:

$$\text{Landing Rate} = \frac{\text{Landed Runs}}{\text{Total Submissions}} \times 100 = \frac{16}{22} \times 100 = \mathbf{72.7\%}$$

- **Total Recorded Mainnet Submissions**: 22 runs
- **Confirmed Landed Transactions**: 16 runs (via Solami Beam SWQoS)
- **Deliberate Failure Tests**: 4 runs (injected low-tip and zero-tip faults demonstrating classified recovery)
- **Median Landing Latency**: ~15.9 seconds to RPC confirmation
- **Processed to Confirmed Delta**: ~2.5 seconds
- **Confirmed to Finalized Delta**: ~12.2 seconds

### 6.3 Verifiable Mainnet Transaction Proofs

| Run # | Mainnet Signature | Tip (Lamports) | Confirmation Source | Solscan Explorer |
|---|---|---|---|---|
| #1 | `5vZaNjFYzhTKqPrdTf3vZPYB35Uump3XRrQsaD4WuhEQywoZjFKmgXs884hZXNUbFNpQGigrN7BDVEGuFd6JdcQH` | 30,000 | Yellowstone gRPC | [View on Solscan ↗](https://solscan.io/tx/5vZaNjFYzhTKqPrdTf3vZPYB35Uump3XRrQsaD4WuhEQywoZjFKmgXs884hZXNUbFNpQGigrN7BDVEGuFd6JdcQH) |
| #2 | `2VBxnYzXPPfMTAmxXBm7fFn4cFRZBg5p8UX66hCFE1ZTcBsLUgQiTswmqa4heSSZZPUBPzxNoLHd1GJCFPTnaoHt` | 30,000 | RPC Polling Fallback | [View on Solscan ↗](https://solscan.io/tx/2VBxnYzXPPfMTAmxXBm7fFn4cFRZBg5p8UX66hCFE1ZTcBsLUgQiTswmqa4heSSZZPUBPzxNoLHd1GJCFPTnaoHt) |
| #3 | `5HTkxuT5Nh3gvqzsrUuasvwqCgRbkfc24Sv31eCiBwMJwSpxHGGeqr93wekH6cVnKBvVrEXzDh9cNHrixNMAGXRq` | 30,000 | Yellowstone gRPC | [View on Solscan ↗](https://solscan.io/tx/5HTkxuT5Nh3gvqzsrUuasvwqCgRbkfc24Sv31eCiBwMJwSpxHGGeqr93wekH6cVnKBvVrEXzDh9cNHrixNMAGXRq) |
| #4 | `3Fknri3hh2PUi6nvkwumrkQ8tJ4nkT7i5UJ8taTcedo5mdjQfLeBkemRn7TMwUd1sXmgFaVRyKyyXE8vd3ZwdFt4` | 30,000 | Yellowstone gRPC | [View on Solscan ↗](https://solscan.io/tx/3Fknri3hh2PUi6nvkwumrkQ8tJ4nkT7i5UJ8taTcedo5mdjQfLeBkemRn7TMwUd1sXmgFaVRyKyyXE8vd3ZwdFt4) |
| #5 | `3NdCGaus4AGawpYiJPXDdQtp7jp64pWP98EVjBhgzstgXsCtwiB1NWPyWyx4aEWfvR6QoqWmUK9EVkXKbcGJWqM2` | 30,000 | RPC Polling Fallback | [View on Solscan ↗](https://solscan.io/tx/3NdCGaus4AGawpYiJPXDdQtp7jp64pWP98EVjBhgzstgXsCtwiB1NWPyWyx4aEWfvR6QoqWmUK9EVkXKbcGJWqM2) |

---

## 7. User Interface & Operator Experience

The interface adheres to an **editorial brutalist design language** (warm cream paper `#FDFBF7`, solid 2px `#121212` borders, `#FF5A26` safety orange accents, Fraunces serif typography, and JetBrains Mono code tags).

### 7.1 Interactive System Primer (`#primer`)
Positioned at the top of the dashboard for new visitors:
- **5-Step Walkthrough**: Explains the root cause of dropped transactions, the Sentry 2.0 stack, available operator tools, decision provenance, and a 3-step quickstart roadmap.
- **Collapsible & Persisted**: Can be minimized or reopened anytime with a single click.
- **Editorial Reference Styling**: High-contrast highlight boxes, step indicators, problem quotes, and direct action CTAs.

### 7.2 Comprehensive Navigation with Hover Dropdowns
The top header includes nested hover dropdowns for full section navigation:
- **Primer**: Direct link to the system walkthrough (`#primer`).
- **Autonomous Engine ▾**:
  - System Health & Circuit Breaker (`#autonomous-health`)
  - Execution Mode Switcher (`#autonomous-mode`)
  - Live Event Feed (`#autonomous-events`)
  - Execution Receipts (`#autonomous-receipts`)
  - Fault Injection Lab (`#autonomous-lab`)
- **Mission Console ▾**:
  - Run Profiles (`#mission-profiles`)
  - Execution Terminal (`#terminal`)
  - Lifecycle Stages (`#lifecycle`)
- **Intelligence & Audit ▾**:
  - Groq AI Decision Trail (`#agent`)
  - Verifiable Evidence (`#evidence`)
  - Architecture Stack (`#stack`)
- **Docs ↗**: Link to system documentation.

### 7.3 Mobile-First Optimization
The dashboard is fully responsive across mobile, tablet, and desktop viewports:
- Touch-friendly hit targets (minimum 44px).
- Dedicated slide-out mobile navigation drawer.
- Responsive grid re-flowing from single-column mobile to multi-column desktop layouts.
- Zero horizontal layout breaks or clipping.

---

## 8. Project Structure

```
sentry-2.0/
├── app/
│   ├── api/
│   │   ├── autonomous/       # Autonomous runtime status & control endpoint
│   │   ├── events/           # Server-Sent Events (SSE) live event stream
│   │   ├── evidence/         # Raw JSONL evidence export endpoint
│   │   ├── observatory/      # Real-time state, metrics, and runs endpoint
│   │   └── submit-bundle/    # Beam transaction execution pipeline
│   ├── components/
│   │   ├── phosphor-icons.tsx# Lightweight custom SVG icon set
│   │   └── providers.tsx     # Solana wallet adapter context providers
│   ├── globals.css           # Editorial typography & theme variables
│   ├── layout.tsx            # Root layout with font imports
│   └── page.tsx              # Main dashboard, System Primer, and Control Center
├── engine/                   # Native Rust Engine Subsystem
│   ├── Cargo.toml            # Rust dependencies (solana-client, tokio, tonic)
│   ├── lifecycle_log.jsonl   # Append-only mainnet lifecycle records (22 runs)
│   └── src/
│       ├── beam.rs           # Solami Beam transaction construction & dispatch
│       ├── lifecycle.rs      # Slot confirmation & finality tracking
│       └── main.rs           # Standalone Rust engine CLI
├── lib/                      # Core TypeScript Autonomous Subsystems
│   ├── action-engine.ts      # Transaction assembly & Beam routing
│   ├── agent-runner.ts       # Groq AI prompt engineering & inference loop
│   ├── autonomous-runtime.ts # Autonomous event-driven state machine
│   ├── event-engine.ts       # Event deduplication & opportunity scoring
│   ├── evidence-engine.ts    # Execution receipt generation & JSONL ledger
│   ├── network-snapshot.ts   # Leader distance & tip EMA smoothing
│   ├── observatory.ts        # Telemetry aggregation & landing calculations
│   ├── policy-engine.ts      # Deterministic invariant safety gates
│   └── types.ts              # Universal TypeScript type definitions
├── logs/
│   └── execution_receipts.jsonl # Complete immutable decision receipts
├── ARCHITECTURE.md           # Deep architectural specification
├── evidence.md               # Empirical mainnet test report
└── README.md                 # System documentation & developer guide
```

---

## 9. Local Development, Deployment & CLI Guide

### 9.1 Prerequisites
- **Node.js**: v18.0.0 or higher (v24.x recommended)
- **Rust Toolchain**: `cargo` and `rustc` 1.75+ (for native engine compilation)
- **WSL 2 or Linux/macOS**: Recommended for Unix socket handling

### 9.2 Environment Configuration
Create a `.env.local` file in the root directory:

```bash
# Solami Infrastructure API Key
SOLAMI_API_KEY=your_solami_api_key_here

# Groq LPU Hardware Inference Key
GROQ_API_KEY=your_groq_api_key_here

# Solana Mainnet RPC Connection
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# Yellowstone gRPC Endpoint
YELLOWSTONE_GRPC_URL=https://grpc.solami.dev

# Blur WebSocket Market Stream
BLUR_WS_URL=wss://blur.solami.dev

# Keypair for Funded Mainnet Submissions (Base58 or JSON array)
SOLANA_PRIVATE_KEY=your_base58_private_key_here
```

### 9.3 Installing Dependencies & Building

```bash
# Install frontend & TypeScript dependencies
npm install

# Compile the native Rust engine
cd engine
cargo build --release
cd ..

# Verify TypeScript compilation (Zero errors)
npm run build # or ./node_modules/.bin/tsc --noEmit
```

### 9.4 Running the Development Server

```bash
npm run dev
```

Open `http://localhost:3000` to interact with the operational dashboard.

---

## 10. Bounty Deliverables & Evidence Index

| Deliverable Requirement | Status | Implementation Reference |
|---|---|---|
| **Solami Beam Integration** | **Complete** | [`lib/action-engine.ts`](file:///home/samuel/sentry%202.0/lib/action-engine.ts), [`engine/src/beam.rs`](file:///home/samuel/sentry%202.0/engine/src/beam.rs) |
| **Yellowstone & Blur Telemetry** | **Complete** | [`lib/event-engine.ts`](file:///home/samuel/sentry%202.0/lib/event-engine.ts), [`lib/network-snapshot.ts`](file:///home/samuel/sentry%202.0/lib/network-snapshot.ts) |
| **Autonomous Reactive Pipeline** | **Complete** | [`lib/autonomous-runtime.ts`](file:///home/samuel/sentry%202.0/lib/autonomous-runtime.ts), [`app/api/autonomous/route.ts`](file:///home/samuel/sentry%202.0/app/api/autonomous/route.ts) |
| **Deterministic Policy Controls** | **Complete** | [`lib/policy-engine.ts`](file:///home/samuel/sentry%202.0/lib/policy-engine.ts) |
| **Groq LPU Hardware Inference** | **Complete** | [`lib/agent-runner.ts`](file:///home/samuel/sentry%202.0/lib/agent-runner.ts), [`agent/src/index.ts`](file:///home/samuel/sentry%202.0/agent/src/index.ts) |
| **Automated Fault Recovery** | **Complete** | [`lib/observatory.ts`](file:///home/samuel/sentry%202.0/lib/observatory.ts), [`engine/src/lifecycle.rs`](file:///home/samuel/sentry%202.0/engine/src/lifecycle.rs) |
| **Decision Provenance Receipts** | **Complete** | [`lib/evidence-engine.ts`](file:///home/samuel/sentry%202.0/lib/evidence-engine.ts), [`logs/execution_receipts.jsonl`](file:///home/samuel/sentry%202.0/logs/execution_receipts.jsonl) |
| **Empirical Mainnet Verification** | **Complete** | 22 recorded runs, 16 landed, 72.7% calculated landing rate ([evidence.md](./evidence.md)) |
| **Interactive System Primer & UI** | **Complete** | [`app/page.tsx`](file:///home/samuel/sentry%202.0/app/page.tsx) (`#primer`, `#autonomous`, hover nav dropdowns) |

---

## License

MIT License. Developed for the Superteam Advanced Infrastructure Bounty.
