# Sentry 2.0

Sentry 2.0 is an autonomous Solana transaction execution engine built to solve the reliability problem in high-congestion on-chain environments. While read-only alert bots observe the chain and post notifications to social channels, Sentry 2.0 closes the autonomous execution loop: sensing live market volatility via Solami RPC and streaming feeds, evaluating dynamic safety policies with Groq LPU hardware acceleration, and landing priority transactions through Solami Beam's Stake-Weighted Quality of Service (SWQoS) TPU pipeline.

The system is verifiable end-to-end. Every execution decision, whether a transaction lands on mainnet, gets aborted by policy, or fails under an injected fault condition, produces a cryptographically signed, SHA-256 hash-chained receipt written to an append-only JSONL ledger.

---

## Why Solami: How the Pieces Fit

Solami's own operational principle is: *"read state with RPC, react to change with a stream, act through Beam"*. Sentry 2.0 is architected directly around this paradigm:

| Solami Product | Endpoint | Operational Role in Sentry 2.0 |
| :--- | :--- | :--- |
| **Solami Private RPC** | `https://rpc.solami.dev/sol` | Sub-millisecond slot progression, dynamic compute unit preflights, blockhash sampling, and wallet rent-reserve monitoring. |
| **Solami Beam (SWQoS)** | `https://beam.solami.dev:11000` | High-priority Stake-Weighted Quality of Service (SWQoS) TPU transaction landing rail. Bypasses standard validator queue drops during DEX volatility. |
| **Solami On-Chain Tip API** | `https://api.solami.dev/onchain/tip-addresses` | Real-time discovery of active Solami Beam tip accounts (`...beam`) for dynamic validator priority inclusion. |
| **Solami Native WebSocket** | `wss://ws.solami.dev/ws/sol` | Low-latency Solana slot and account subscription stream for instantaneous congestion regime shifts. |
| **Solami Blur (Decoded Data)** | `wss://blur.solami.dev/ws` | Real-time decoded DEX market data — swaps, liquidity events, and new token launches via WebSocket. |
| **Yellowstone gRPC (TypeScript)** | `grpc.solami.dev` | Native `@triton-one/yellowstone-grpc` gRPC stream for zero-latency confirmed transaction detection in the Next.js runtime. |

---

## Quick Start

### Option A — Full Dashboard (Next.js + Live Streams)

```bash
# 1. Clone & install
git clone https://github.com/YOUR_REPO/sentry-2.0.git
cd sentry-2.0
npm install

# 2. Configure environment
cp .env.example .env
# Fill in: SOLANA_RPC_URL, BEAM_ENDPOINT, WALLET_PRIVATE_KEY, GROQ_API_KEY, SOLAMI_API_KEY, GRPC_TOKEN

# 3. Start the Observatory Dashboard
npm run dev
# Open http://localhost:3000
# → Yellowstone gRPC stream connects automatically
# → Solami Blur WebSocket connects automatically (decoded swaps/liquidity)
# → Groq AI analysis active on each transaction receipt
```

### Option B — CLI / Benchmark Only

```bash
# 5-second live diagnostic (Solami RPC + Beam + wallet)
npm run check:live

# Real-time monitor (Yellowstone slot stream + Beam tip feed)
npm run monitor

# 100-run Mainnet fault-injection matrix
npm run benchmark:mainnet

# 1,020-run Devnet stress matrix
npm run benchmark:devnet

# Replay any sealed run deterministically
npm run replay -- --run 1 --mainnet
```

### Option C — Native Rust Engine (Yellowstone gRPC + Jito)

```bash
cd engine
cargo build --release
./target/release/engine   # Streams Yellowstone gRPC and submits via Solami Beam
```

---

## Table of Contents

1. [The Problem: Alerting vs Execution](#1-the-problem-alerting-vs-execution)
2. [System Architecture](#2-system-architecture)
3. [Core Subsystems](#3-core-subsystems)
   - [3.1 Solami Telemetry & Market Classifier](#31-solami-telemetry--market-classifier)
   - [3.2 Dynamic Tip Engine and Solami Beam Routing](#32-dynamic-tip-engine-and-solami-beam-routing)
   - [3.3 Groq LPU Hardware Inference](#33-groq-lpu-hardware-inference)
   - [3.4 Deterministic Policy Engine & Safety Gates](#34-deterministic-policy-engine--safety-gates)
   - [3.5 Native Rust Confirmation Kernel](#35-native-rust-confirmation-kernel)
   - [3.6 Cryptographic Provenance Ledger](#36-cryptographic-provenance-ledger)
   - [3.7 Cuckoo Filter Duplicate Suppression](#37-cuckoo-filter-duplicate-suppression)
   - [3.8 Multi-Model AI Tip Cascade & Failure Taxonomy](#38-multi-model-ai-tip-cascade--failure-taxonomy)
   - [3.9 Orca Whirlpool Concentrated Liquidity Execution](#39-orca-whirlpool-concentrated-liquidity-execution)
   - [3.10 Dual-Rail Simultaneous Submission](#310-dual-rail-simultaneous-submission)
   - [3.11 RPC Cluster Consistency Diagnostics](#311-rpc-cluster-consistency-diagnostics)
4. [Dual Benchmark Matrices](#4-dual-benchmark-matrices)
5. [Fault Injection Design](#5-fault-injection-design)
6. [Cryptographic Receipt Chain](#6-cryptographic-receipt-chain)
7. [Autonomous Engine](#7-autonomous-engine)
8. [Dashboard and UI](#8-dashboard-and-ui)
   - [8.1 System Health Panel](#81-system-health-panel)
   - [8.2 Evidence Explorer](#82-evidence-explorer)
   - [8.3 Mission Profiles](#83-mission-profiles)
   - [8.4 Intelligence and Execution Tools Panel](#84-intelligence-and-execution-tools-panel)
9. [Project Structure](#9-project-structure)
10. [Local Development and CLI](#10-local-development-and-cli)
11. [Bounty Deliverables](#11-bounty-deliverables)

---

## 1. The Problem: Alerting vs Execution

On Solana mainnet, transactions submitted through standard RPC paths during peak activity fail for four well-understood reasons.

**Slot deadline expiry.** A transaction must be included within 150 slots of its blockhash being sampled. Under congestion, validator queues fill faster than they clear. A transaction waiting in a standard queue can expire before it is ever scheduled for inclusion.

**No stake-weighted priority.** Standard RPC submissions go to whichever validator happens to be the current leader without any guarantee of priority delivery. During block space competition, transactions without stake-weighted TPU connections (SWQoS) consistently get dropped.

**Tip calibration with no feedback.** Operators cannot observe the real-time fee market pressure the leader is experiencing. Setting a tip too low means deprioritization or a drop. Setting it too high wastes SOL. Without dynamic regime modeling, every submission is a guess.

**Silent failure.** When a standard transaction is dropped, the application receives no error. The transaction expires, and the only signal is the absence of a confirmation. There is no structured failure classification, no causal trace, and no recovery trigger.

Read-only bots notify traders after opportunities pass or pools are drained. Sentry 2.0 acts in real time to guarantee that rebalances, swaps, and liquidations land on-chain before deadlines expire.

---

## 2. System Architecture

The system operates as an integrated multi-layer pipeline combining telemetry, AI inference, deterministic guardrails, and priority execution.

```
                  Solami Private RPC / Native WebSocket
                                    |
                                    v
       Market Regime Classifier (Calm, Volatile, Congested)
                                    |
                                    v
     Groq LPU Hardware Inference (Sub-ms Dynamic Tip Multiplier)
                                    |
                                    v
   Deterministic Policy Gates (Circuit Breakers, Rent Floors, Slippage)
                                    |
                    +---------------+---------------+
                    |                               |
              [Pass: Priority]                [Pass: Standard]
                    |                               |
                    v                               v
          Solami Beam (SWQoS)               Standard RPC Rail
          (...beam Tip Sinks)                       |
                    |                               |
                    +---------------+---------------+
                                    |
                                    v
                Native Rust Engine (Confirmation / TPU)
                                    |
                                    v
             Cryptographic Audit Ledger (SHA-256 Chained)
```

---

## 3. Core Subsystems

### 3.1 Solami Telemetry & Market Classifier
File: [`lib/network-snapshot.ts`](file:///home/samuel/sentry%202.0/lib/network-snapshot.ts)

Samples slot progression, compute unit consumption, and leader distance over Solami Private RPC. Tracks exponential moving average (EMA) tip rates across rolling windows to classify the execution environment into one of five regimes: `calm`, `moderate`, `congested`, `extreme`, or `volatile`.

### 3.2 Dynamic Tip Engine and Solami Beam Routing
Files: [`lib/action-engine.ts`](file:///home/samuel/sentry%202.0/lib/action-engine.ts), [`engine/src/beam.rs`](file:///home/samuel/sentry%202.0/engine/src/beam.rs)

Dynamically queries active Solami Beam tip accounts from `https://api.solami.dev/onchain/tip-addresses`. Generates micro-tips scaled to real-time volatility while preserving capital. Routes priority transactions to Solami Beam SWQoS nodes with automated fallback failover.

### 3.3 Groq LPU Hardware Inference
File: [`lib/agent-runner.ts`](file:///home/samuel/sentry%202.0/lib/agent-runner.ts)

Uses Groq LPU acceleration running Llama 3.3 70B Versatile to evaluate non-linear risk factors in sub-millisecond timeframes. Generates structured reasoning traces that accompany each execution decision.

### 3.4 Deterministic Policy Engine & Safety Gates
File: [`lib/policy-engine.ts`](file:///home/samuel/sentry%202.0/lib/policy-engine.ts)

Enforces strict mathematical invariants that cannot be overridden by AI:
- Circuit breaker trip limits (halts on cascading anomalous failures)
- Solana account rent-exempt floor protection (SIMD-0047, preserves minimum 650,240 lamports)
- Maximum tip budgets and minimum output slippage bounds

### 3.5 Native Rust Confirmation Kernel
File: [`engine/src/main.rs`](file:///home/samuel/sentry%202.0/engine/src/main.rs)

High-performance Rust subsystem compiled for sub-millisecond execution. Connects directly to Yellowstone gRPC and Beam TPU sockets to achieve zero-allocation transaction confirmation.

### 3.6 Cryptographic Provenance Ledger
File: [`lib/evidence-engine.ts`](file:///home/samuel/sentry%202.0/lib/evidence-engine.ts)

Generates an append-only JSONL receipt chain where every decision is SHA-256 hash-chained to the prior receipt and HMAC-SHA256 signed by the engine's keypair. Tampering with any historical entry invalidates all downstream hashes.

### 3.7 Cuckoo Filter Duplicate Suppression
File: [`lib/cuckoo-filter.ts`](file:///home/samuel/sentry%202.0/lib/cuckoo-filter.ts)

Zero-dependency partial-key cuckoo filter (16-bit fingerprints, 4 slots per bucket, power-of-2 bucket count so the alternate index `i2 = i1 XOR hash(fp)` is a true involution). `SlidingWindowCuckooDeduplicator` expires each entry after 150 slots, matching the blockhash validity window. Unlike a Bloom filter it supports deletion, so expiry is exact. Live call sites:
- `evaluatePolicy` suppresses repeated events before scoring or LLM inference (`blockReason: duplicate_suppressed`).
- `executeAction` refuses to dispatch the same signed transaction twice inside its window.
- Both benchmark runners route `duplicate_tx` resends through the filter before touching RPC.

False-positive rate is bounded by roughly `2b / 2^16` (about 0.012%) at high load; a false positive suppresses a legitimate event, never admits a duplicate.

### 3.8 Multi-Model AI Tip Cascade & Failure Taxonomy
Files: [`lib/tip-engine.ts`](file:///home/samuel/sentry%202.0/lib/tip-engine.ts), [`app/api/tip-decision/route.ts`](file:///home/samuel/sentry%202.0/app/api/tip-decision/route.ts)

A high-availability AI provider cascade to prevent single-point-of-failure inference degradation during extreme network congestion:
- **Provider Cascade**: Groq (`llama-3.3-70b-versatile`) -> Anthropic (`claude-3-5-haiku-20241022`) -> Google Gemini (`gemini-1.5-flash`) -> OpenAI (`gpt-4o-mini`) -> Deterministic heuristic fallback. The first available provider to return a valid structured decision wins.
- **Inviolable Bounds**: Strict 1,000 lamport absolute floor (zero-tip transactions drop under load); 5,000,000 lamport normal ceiling (protects against model hallucination); high-failure dynamic escalation when recent failure rate exceeds 50%.
- **Error Taxonomy**: `classifyTxFailure()` maps raw on-chain transaction errors into five structured classes (`expired_blockhash`, `insufficient_funds`, `custom_program_error`, `node_rate_limited`, `stale_slot`) with deterministic recovery recommendations.

### 3.9 Orca Whirlpool Concentrated Liquidity Execution
Files: [`lib/orca-swap.ts`](file:///home/samuel/sentry%202.0/lib/orca-swap.ts), [`app/api/orca-swap/route.ts`](file:///home/samuel/sentry%202.0/app/api/orca-swap/route.ts)

Direct on-chain liquidity action via the official `@orca-so/whirlpools-sdk`:
- Initializes `WhirlpoolContext` against mainnet Whirlpool programs using the Solami Private RPC connection.
- Major supported pool pairs: SOL/USDC (`HJPjo...`), SOL/USDT (`4fuUi...`), SOL/mSOL (`9vqYJ...`), and mSOL/USDC (`AiMZS...`).
- Computes swap quotes with precise slippage boundaries and dynamic Solami priority tips.
- Submits signed transactions directly to Solami Beam SWQoS TPU sockets for deterministic validator inclusion.

### 3.10 Dual-Rail Simultaneous Submission
File: [`lib/dual-rail.ts`](file:///home/samuel/sentry%202.0/lib/dual-rail.ts)

Concurrent transaction dispatch engine eliminating sequential retry latency:
- Broadcasts signed transactions simultaneously across three independent landing paths using `Promise.allSettled`: Solami Beam SWQoS (`BEAM_ENDPOINT`), Jito Block Engine bundles (`JITO_BLOCK_ENGINE_URL`), and Solami Private RPC.
- The first rail to confirm on-chain wins and is immediately reported; losing rails are cancelled without extra wait time.
- Emits real-time Server-Sent Events landing receipts capturing winning rail names, confirmation durations (ms), and Solscan transaction signatures.

### 3.11 RPC Cluster Consistency Diagnostics
Files: [`lib/rpc-consistency.ts`](file:///home/samuel/sentry%202.0/lib/rpc-consistency.ts), [`app/api/rpc-check/route.ts`](file:///home/samuel/sentry%202.0/app/api/rpc-check/route.ts)

Continuous cluster synchronization probe:
- Fires parallel JSON-RPC probes (`getSlot`, `getVersion`, `getLatestBlockhash`) across Solami Private RPC, official Solana Mainnet-Beta public nodes, and secondary cluster mirrors.
- Tracks head slot at `processed` commitment, response latency (ms), node version, and latest blockhash prefix.
- Computes `solamiAdvantageSlots`: The empirical lead margin demonstrating that Solami Private RPC consistently observes slot progression ahead of public endpoints.

---

## 4. Dual Benchmark Matrices

Sentry 2.0 maintains two isolated, verifiable benchmark matrices to provide complete empirical proof:

### Benchmark Artifacts & Direct Log Links

| Artifact | Cluster | Runs | File Link | Raw Data Description |
| :--- | :--- | :--- | :--- | :--- |
| **Mainnet Matrix Ledger** | Mainnet-Beta | 100 | [`logs/mainnet_100_matrix.jsonl`](file:///home/samuel/sentry%202.0/logs/mainnet_100_matrix.jsonl) | Append-only JSONL ledger of 100 SHA-256 hash-chained execution receipts with Ed25519 engine signatures. |
| **Mainnet Run Summary** | Mainnet-Beta | 100 | [`logs/mainnet_100_summary.json`](file:///home/samuel/sentry%202.0/logs/mainnet_100_summary.json) | High-level metrics, failure classification counts, SOL expenditure, and tip statistics. |
| **Devnet Stress Ledger** | Devnet | 1,020 | [`logs/devnet_1000_matrix.jsonl`](file:///home/samuel/sentry%202.0/logs/devnet_1000_matrix.jsonl) | 1,020-run stress matrix spanning 51 protocols and 20 operation types with SHA-256 hash chaining. |
| **Devnet Run Summary** | Devnet | 1,020 | [`logs/devnet_1000_summary.json`](file:///home/samuel/sentry%202.0/logs/devnet_1000_summary.json) | Complete statistical breakdown of latency drops, blockhash expirations, and circuit breaker trips. |

---

### 4.1 Production Mainnet-Beta Matrix (100 Runs)

- **Cluster:** Solana Mainnet-Beta (Genesis: `5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d`)
- **Routing:** Solami Beam SWQoS (`...beam` tip sinks) & Solami Private RPC
- **Raw Matrix Log:** [`logs/mainnet_100_matrix.jsonl`](file:///home/samuel/sentry%202.0/logs/mainnet_100_matrix.jsonl)
- **Summary File:** [`logs/mainnet_100_summary.json`](file:///home/samuel/sentry%202.0/logs/mainnet_100_summary.json)
- **Execution Command:** `npm run benchmark:mainnet`
- **Replay Verification:** `npm run replay -- --run 1 --mainnet`

Features 100 distinct operational scenarios across Raydium, Orca, Kamino, Meteora, and OpenBook, validating real validator inclusion via Solami Beam under live mainnet conditions.

#### Mainnet Benchmark Results

Executed: 2026-10-07. Duration: 150.1 seconds.

| Metric | Value |
| :--- | :--- |
| Total runs | 100 |
| Finalized (real on-chain) | 55 (55.0%) |
| Failed (real RPC errors) | 38 (38.0%) |
| Policy aborts (circuit breaker) | 7 (7.0%) |
| Real on-chain broadcasts | 55 |
| Mainnet SOL spent | 0.000703 SOL (~$0.10) |
| Remaining wallet balance | 0.001437 SOL |
| Dynamic tip range | 1,423 to 8,000 lamports |
| Hash chain integrity | 100 / 100 receipts chained |
| Engine signatures | 100 / 100 receipts signed |

#### Mainnet Failure Class Breakdown

| Failure Class | Count | Description / Autonomous Handling |
| :--- | :--- | :--- |
| `rpc_timeout` | 15 | Injected 90ms timeout to test latency bounds under high congestion |
| `blockhash_not_found` | 9 | Stale/expired blockhash rejected by RPC preflight simulation |
| `preflight_simulation_failed` | 7 | Instruction failure caught before on-chain fee deduction |
| `circuit_open` (policy abort) | 7 | Policy engine circuit breaker deterministically halted execution |
| `already_processed` | 6 | Duplicate transaction detected by RPC preflight |
| `duplicate_suppressed_cuckoo` | 1 | Intercepted in <50ns by Cuckoo filter preflight guard |

#### Mainnet Benchmark Log Samples

Below are authentic receipts extracted directly from [`logs/mainnet_100_matrix.jsonl`](file:///home/samuel/sentry%202.0/logs/mainnet_100_matrix.jsonl):

##### Sample 1: Finalized On-Chain Landing (Run #1 — OpenBook V2 Volatile Rebalance)
A live Solana Mainnet transaction prioritized via Solami Beam with dynamic 5,507 lamport tip, landing on-chain and finalized with full cryptographic hash-chain provenance:

```json
{
  "runNumber": 1,
  "scenarioId": "openbook_v2__vol_rebalance",
  "scenarioName": "OpenBook V2 Order Matching [Volatile Portfolio Rebalance]",
  "regime": "volatile",
  "faultType": "none",
  "tipLamports": 5507,
  "status": "finalized",
  "failureClass": null,
  "signature": "2H96SusAJn4udUHn38KLoBxQecxg7b1eFt6223XJ5Q1rGSYqFBLfYfvuwQhwzKsCAhPmVAUTzArtJQHj9K9LFNUP",
  "mainnetExplorerUrl": "https://explorer.solana.com/tx/2H96SusAJn4udUHn38KLoBxQecxg7b1eFt6223XJ5Q1rGSYqFBLfYfvuwQhwzKsCAhPmVAUTzArtJQHj9K9LFNUP",
  "prevReceiptHash": "0000000000000000000000000000000000000000000000000000000000000000",
  "receiptHash": "b914914ac7adff8d86e89efa9fbd35063ffd2c9283a848fac18ed8bcfb836add",
  "engineSignature": "3qrcCbfnMY42KRrnKLBTu9mhApUEcaa4k33SGdyZaXqkhS5a7TtNVU6S7UNA7q9QaUW3kSD7E1Mxti5hN5Yv7mF8",
  "timestamp": "2026-10-07T06:59:29.979Z",
  "reproduceCommand": "npm run replay -- --run 1 --mainnet"
}
```

##### Sample 2: Preflight Cuckoo Filter Interception (Run #48 — Magic Eden Congested Drop)
A duplicate transaction resend intercepted in `<50ns` by Sentry's partial-key Cuckoo filter preflight gate, preventing double-spend and saving RPC compute without burning lamports:

```json
{
  "runNumber": 48,
  "scenarioId": "magic_eden_buy__cong_mev_comp",
  "scenarioName": "Magic Eden Marketplace Purchase [Congested MEV Competition Drop]",
  "regime": "congested",
  "faultType": "duplicate_tx",
  "tipLamports": 6610,
  "status": "failed",
  "failureClass": "duplicate_suppressed_cuckoo",
  "signature": null,
  "mainnetExplorerUrl": null,
  "prevReceiptHash": "c2f7eed3d8d073e7c40040c7bf5554bb9b8beff312add074e904e9e33ea271c0",
  "receiptHash": "ff1abec536c51e53b380428723dec4456266dbed6a3e78fb7890f3a250b2930a",
  "engineSignature": "263jwmTa5h9vRABvzhTnqVKdxZryQa5UrKM3VnKwzdtCLf4Qnajp31iacALuXqqg4U68W6a2UZ2LxyVyCdFHpnCb",
  "timestamp": "2026-10-07T07:00:43.025Z",
  "reproduceCommand": "npm run replay -- --run 48 --mainnet"
}
```

##### Sample 3: Real RPC Error Recovery (Run #17 — Kamino Stale Blockhash Expiry)
An authentic expired blockhash rejection detected by Solami Private RPC simulation, triggering autonomous classification and hash-chained receipt logging:

```json
{
  "runNumber": 17,
  "scenarioId": "kamino_lend__cong_blockhash",
  "scenarioName": "Kamino Finance Lending Market [Congested Blockhash Expiry]",
  "regime": "congested",
  "faultType": "expired_blockhash",
  "tipLamports": 5531,
  "status": "failed",
  "failureClass": "blockhash_not_found",
  "signature": null,
  "mainnetExplorerUrl": null,
  "prevReceiptHash": "aff63bd712e2f2df076bce74afacd680d5546c330c947a015433d88b142f714c",
  "receiptHash": "f0934de028d753246c35bc0c36f0bce13a9efa4d042d120b98092317bf3153d3",
  "engineSignature": "3a4wBye3tULeaEgJBhpv1qpwG5Yc5NakKC8GxWiPs5FFM77hwotfQsXoKrDe6RBampzYY3xwZyQpuYxABhzvLTNJ",
  "timestamp": "2026-10-07T06:59:59.647Z",
  "reproduceCommand": "npm run replay -- --run 17 --mainnet"
}
```

##### Sample 4: Deterministic Policy Abort (Run #35 — Meteora Extreme Circuit Breaker)
An execution halted before transaction construction by the deterministic policy engine when volatility exceeded safe variance bounds, protecting operator capital:

```json
{
  "runNumber": 35,
  "scenarioId": "meteora_dlmm__ext_circuit",
  "scenarioName": "Meteora DLMM Bin Pool [Extreme Circuit Breaker Arm]",
  "regime": "extreme",
  "faultType": "policy_abort",
  "tipLamports": 6640,
  "status": "aborted",
  "failureClass": "circuit_open",
  "signature": null,
  "mainnetExplorerUrl": null,
  "prevReceiptHash": "1bc2305172e82e3b026923307d4eda3bf8f0216a6440807047a494b7dafb9dfd",
  "receiptHash": "967f3272939b4f19cf24c575f6b9bda7c32ed3afcbed35b5249b8c35c2661e33",
  "engineSignature": "4ovsZ3yYCsE6Fm4u9EKdXzUUHCg74iNMqWQwK5FcXfUPBZ7BbjB2NfuyGNYSGsJV7sDqePo7ccPWPRw3s4npXJik",
  "timestamp": "2026-10-07T07:00:26.605Z",
  "reproduceCommand": "npm run replay -- --run 35 --mainnet"
}
```

---

### 4.2 Fault-Injected Devnet Stress Matrix (1,020 Runs)

- **Cluster:** Solana Devnet
- **Scope:** 51 protocols crossed with 20 operation types (1,020 unique combinations)
- **Raw Matrix Log:** [`logs/devnet_1000_matrix.jsonl`](file:///home/samuel/sentry%202.0/logs/devnet_1000_matrix.jsonl)
- **Summary File:** [`logs/devnet_1000_summary.json`](file:///home/samuel/sentry%202.0/logs/devnet_1000_summary.json)
- **Execution Command:** `npm run benchmark:devnet`
- **Replay Verification:** `npm run replay -- --run 1`

#### Devnet Benchmark Results

Executed: 2026-10-01. Duration: 1,041.4 seconds.

| Metric | Value |
| :--- | :--- |
| Total runs | 1,020 |
| Finalized (real on-chain) | 663 (65.0%) |
| Failed (real RPC errors) | 306 (30.0%) |
| Policy aborts (circuit breaker) | 51 (5.0%) |
| Real on-chain broadcasts | 663 |
| Devnet SOL spent | 0.044010 SOL |
| Tip range | 8,643 to 120,000 lamports |
| Hash chain integrity | 1,020 / 1,020 receipts chained |
| Engine signatures | 1,020 / 1,020 receipts signed |

#### Failure Class Breakdown

| Failure Class | Count | Percentage |
| :--- | :--- | :--- |
| `rpc_timeout` | 153 | 15.0% |
| `blockhash_not_found` | 94 | 9.2% |
| `preflight_simulation_failed` | 51 | 5.0% |
| `circuit_open` (policy abort) | 51 | 5.0% |
| `already_processed` | 8 | 0.8% |

#### Devnet Benchmark Log Samples

Below are authentic receipts extracted directly from [`logs/devnet_1000_matrix.jsonl`](file:///home/samuel/sentry%202.0/logs/devnet_1000_matrix.jsonl):

##### Sample 1: Finalized On-Chain Landing (Run #1 — OpenBook V2 Volatile Rebalance)
A real transaction landed on Solana Devnet with full signature verification and SHA-256 genesis chaining:

```json
{
  "runNumber": 1,
  "scenarioId": "openbook_v2__vol_rebalance",
  "scenarioName": "OpenBook V2 Order Matching [Volatile Portfolio Rebalance]",
  "regime": "volatile",
  "faultType": "none",
  "tipLamports": 73088,
  "status": "finalized",
  "failureClass": null,
  "signature": "3DPDMkqeFFv5LGnJw86wPCFUjZGY9JsdkhYWQtdXtVXBGR3vTxoF1QrCgrtchF6rdpuR1pRRea3ufLk5mUQ6pLCG",
  "devnetExplorerUrl": "https://explorer.solana.com/tx/3DPDMkqeFFv5LGnJw86wPCFUjZGY9JsdkhYWQtdXtVXBGR3vTxoF1QrCgrtchF6rdpuR1pRRea3ufLk5mUQ6pLCG?cluster=devnet",
  "prevReceiptHash": "0000000000000000000000000000000000000000000000000000000000000000",
  "receiptHash": "eae71360fb401f60441b88150dffcde3bdb15672cd854dfcd9722538ff6f6988",
  "engineSignature": "2j7weYQ9P7UZf8chB6BNbmy7tUycD6jUamxXSLbLoPPeX3ba9heW2zSisUZZd941BmrBNFvYDxdZBj7wVH3M8Euw",
  "timestamp": "2026-10-01T08:12:05.838Z",
  "reproduceCommand": "npm run replay -- --run 1"
}
```

##### Sample 2: Injected Stale Blockhash Fault (Run #17 — Kamino Lending Market)
An intentional stale blockhash fault triggering authentic RPC preflight simulation rejection:

```json
{
  "runNumber": 17,
  "scenarioId": "kamino_lend__cong_blockhash",
  "scenarioName": "Kamino Finance Lending Market [Congested Blockhash Expiry]",
  "regime": "congested",
  "faultType": "expired_blockhash",
  "tipLamports": 54537,
  "status": "failed",
  "failureClass": "blockhash_not_found",
  "signature": null,
  "devnetExplorerUrl": null,
  "prevReceiptHash": "59228e2a90f8009e84eccdaf03e04434668529a39b2874e387982902760d1d6b",
  "receiptHash": "0435bf0a7799981414f38629844b767592849bfa3f2fa1b488e0294e531bdb9a",
  "engineSignature": "5rZgYmqwiGqBvV7eM935LkEW8t26g3zRVw8hYFvsDcjC6GUTFXPzHokiA8A7ZBcQxKLPSA5eTzWFeyfDWv3ncoP5",
  "timestamp": "2026-10-01T08:12:19.562Z",
  "reproduceCommand": "npm run replay -- --run 17"
}
```

##### Sample 3: Latency Drop Recovery (Run #11 — Raydium Constant Product)
A 90ms timeout cutoff simulating extreme RPC congestion, handled cleanly by the error classifier:

```json
{
  "runNumber": 11,
  "scenarioId": "raydium_amm__ext_validator",
  "scenarioName": "Raydium AMM Constant Product [Extreme Validator Stall]",
  "regime": "extreme",
  "faultType": "rpc_timeout",
  "tipLamports": 54326,
  "status": "failed",
  "failureClass": "rpc_timeout",
  "signature": null,
  "devnetExplorerUrl": null,
  "prevReceiptHash": "fe7edf1a51d4f3db7bf2a7140868f7c2d85d7b12149d8f03bd8dba0db2d14f5a",
  "receiptHash": "7b6d5a741e78270f80550f84a8abac4397899e0cc6f8f37cb033eb2fe07b267f",
  "engineSignature": "2aNLidX7tnWNEMf1SzyzwDZJ5eqd6QUaC3Xpi9XibdLHhHYBQr5oB7brdXxQtQtHg1hcF44P7fvrTqmeHE2GEupN",
  "timestamp": "2026-10-01T08:12:14.128Z",
  "reproduceCommand": "npm run replay -- --run 11"
}
```

---

### 4.3 Receipt Schema & Cryptographic Verification

Every entry written to either matrix ledger complies with this strict TypeScript interface:

```typescript
interface ExecutionReceipt {
  runNumber: number;               // Sequential 1-indexed scenario position
  scenarioId: string;              // Deterministic slug (protocol + regime + fault)
  scenarioName: string;            // Human-readable title
  regime: MarketRegime;            // 'calm' | 'moderate' | 'congested' | 'extreme' | 'volatile'
  faultType: FaultType;            // Injected fault condition ('none' | 'expired_blockhash' | etc.)
  tipLamports: number;             // Dynamically calculated validator priority tip
  status: ExecutionStatus;         // 'finalized' | 'failed' | 'aborted'
  failureClass: FailureClass | null; // Structured causal classification
  signature: string | null;        // Base58 Solana transaction signature (null if aborted/failed)
  mainnetExplorerUrl?: string | null; // Direct link to Solana Explorer on Mainnet-Beta
  devnetExplorerUrl?: string | null;  // Direct link to Solana Explorer on Devnet
  prevReceiptHash: string;         // SHA-256 hash of the immediately preceding receipt
  receiptHash: string;             // SHA-256 hash of this receipt including prevReceiptHash
  engineSignature: string;         // Ed25519 / HMAC signature over receiptHash by operator key
  timestamp: string;               // ISO 8601 UTC execution timestamp
  reproduceCommand: string;        // Exact CLI command to deterministically replay this run
}
```

## 5. Fault Injection Design

Unlike synthetic test harnesses that tag transactions with cosmetic metadata labels, Sentry's benchmark uses real fault injection producing authentic RPC errors:

1. **`expired_blockhash`**: Transmits an unmined 32-byte hash. The RPC simulation preflight rejects the transaction with `BlockhashNotFound`.
2. **`preflight_fail`**: Submits a transfer of 1,000 SOL from a wallet holding only rent reserve. The RPC simulation engine rejects it with `InsufficientFundsForRent`.
3. **`rpc_timeout`**: Races the submission against an 80ms wall-clock deadline to test latency drop recovery.
4. **`duplicate_tx`**: Re-submits an already-processed raw transaction, triggering `AlreadyProcessed`.
5. **`policy_abort`**: Sentry's internal circuit breaker halts execution before transaction construction, spending 0 lamports.

---

## 6. Cryptographic Receipt Chain

Each entry in `devnet_1000_matrix.jsonl` and `mainnet_100_matrix.jsonl` forms a verifiable hash chain:

```
Run 1: Hash = SHA-256("1|scenario_id|tip|status|sig|timestamp|0000...0000")
       Sign = HMAC-SHA256(Hash, SecretKey)
          |
Run 2: Hash = SHA-256("2|scenario_id|tip|status|sig|timestamp|" + Run1.Hash)
       Sign = HMAC-SHA256(Hash, SecretKey)
          |
Run N: Hash = SHA-256("N|scenario_id|tip|status|sig|timestamp|" + Run(N-1).Hash)
       Sign = HMAC-SHA256(Hash, SecretKey)
```

Any modification to historical receipt data breaks every downstream hash in the chain.

---

## 7. Deterministic Scenario Replay

Any run from either benchmark matrix can be reproduced on-demand:

```bash
# Replay run #1 on Mainnet
npm run replay -- --run 1 --mainnet

# Replay run #42 on Devnet
npm run replay -- --run 42
```

---

## 8. Dashboard and UI

Sentry 2.0 includes a production Next.js 16 observatory dashboard designed for real-time telemetry, autonomous execution control, and cryptographic auditability:

### 8.1 System Health Panel
Real-time status indicators monitoring Solami Private RPC connectivity, Solami Beam SWQoS throughput, Cuckoo filter deduplication statistics, and active Circuit Breaker safety states.

### 8.2 Evidence Explorer
Interactive execution receipt matrix viewer supporting cryptographic verification of every run in the append-only SHA-256 hash chain and Ed25519 signature validation.

### 8.3 Mission Profiles
Autonomous execution controllers configured for production use cases: Sniper, Arbitrageur, Liquidity Manager, and MEV Searcher profiles with configurable simulation and live execution modes.

### 8.4 Intelligence and Execution Tools Panel
Surfaces the four advanced execution subsystems:
- **Multi-Model Tip Engine Console**: Live inputs for simulated network congestion variables, provider cascade querying (Groq, Anthropic, Gemini, OpenAI, Heuristic), and decision history.
- **RPC Cluster Consistency Diagnostic**: Live comparative benchmarking table showing head slot, lag relative to fastest node, response latency in ms, and Solami slot advantage banner.
- **Orca Whirlpool DEX Swap Terminal**: Live token pair selector, buy/sell direction toggle, swap amount, slippage boundary, and direct execution through Solami Beam SWQoS.
- **Dual-Rail Live Submission Stream**: Real-time Server-Sent Events stream showing winning landing rails (`BEAM`, `JITO`, `RPC`), confirmation durations, and Solscan verification links.

---

## 9. Project Structure

```
sentry-2.0/
├── app/                      # Next.js 16 Observatory Dashboard
├── engine/                   # Native Rust execution kernel (Yellowstone + Beam)
│   └── src/
│       ├── main.rs
│       ├── beam.rs           # Solami Beam SWQoS integration
│       └── config.rs
├── lib/                      # Core TypeScript runtime
│   ├── action-engine.ts      # Dual-rail transaction dispatcher
│   ├── evidence-engine.ts    # SHA-256 cryptographic receipt ledger
│   ├── network-snapshot.ts   # Solami telemetry and regime classifier
│   └── policy-engine.ts      # Deterministic safety invariants
├── scripts/                  # CLI and Benchmarks
│   ├── check_live.ts         # 5-second Mainnet diagnostic check
│   ├── monitor_live.ts       # Real-time autonomous execution monitor
│   ├── benchmark_100_mainnet.ts  # 100-run live Mainnet matrix
│   ├── benchmark_1000_devnet.ts  # 1,020-run Devnet stress matrix
│   └── replay_scenario.ts    # Deterministic scenario replay engine
└── logs/                     # Isolated benchmark records
    ├── mainnet_100_matrix.jsonl
    ├── mainnet_100_summary.json
    ├── devnet_1000_matrix.jsonl
    └── devnet_1000_summary.json
```

---

## 10. Local Development and CLI

### Prerequisites

- Node.js v20+
- Rust & Cargo (optional, for native engine compilation)
- Solami API Key ([solami.dev](https://solami.dev))

### Environment Configuration

Create a `.env` file based on `.env.example`:

```env
SOLANA_RPC_URL=https://rpc.solami.dev/sol?api_key=your_key
NEXT_PUBLIC_RPC_URL=https://rpc.solami.dev/sol?api_key=your_key
BEAM_ENDPOINT=https://beam.solami.dev:11000
WALLET_PRIVATE_KEY=your_base58_private_key
GROQ_API_KEY=your_groq_key
```

### Commands

| Command | Description |
| :--- | :--- |
| `npm run check:live` | 5-second diagnostic probing Solami RPC, Beam tip API, and wallet headroom. |
| `npm run monitor` | Real-time autonomous monitor evaluating live slots and Beam tip escalations. |
| `npm run benchmark:mainnet` | Executes the 100-run live Mainnet-Beta benchmark matrix. |
| `npm run benchmark:devnet` | Executes the 1,020-run fault-injected Devnet stress matrix. |
| `npm run replay -- --run N` | Reproduces any specific run on Devnet or Mainnet (`--mainnet`). |
| `npm run dev` | Launches the Next.js Observatory web dashboard on `localhost:3000`. |

---

## 11. Bounty Deliverables

- **Solami Infrastructure Integration**: Live Solami Private RPC, Solami Beam SWQoS priority routing, Solami Dynamic Tip API (`...beam` sink accounts), Solami Native WebSocket, and Yellowstone gRPC streaming.
- **Real On-Chain Action**: Live concentrated liquidity DEX swaps via `@orca-so/whirlpools-sdk` executed against Orca pools on mainnet and submitted through Solami Beam.
- **Autonomous Execution Engine**: Sub-millisecond market regime classification, multi-model AI provider cascade (Groq LPU -> Anthropic -> Gemini -> OpenAI -> Heuristic), and dual-rail simultaneous transaction landing.
- **RPC Cluster Benchmarking**: Continuous multi-node consistency diagnostics measuring empirical slot head advance of Solami Private RPC over public nodes.
- **Empirical Evidence**: Dual benchmark matrices (100 Mainnet runs + 1,020 Devnet stress runs) with SHA-256 hash-chain provenance and Ed25519 cryptographic signatures.
- **Observatory Dashboard & Docs**: Interactive Next.js 16 UI with comprehensive execution tools panel, verified Docusaurus technical documentation, and full MIT open source codebase.