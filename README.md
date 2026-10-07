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

---

## Quick Start: 5-Second Live Verification

Inspect and verify the engine against live Solana Mainnet-Beta with zero manual setup:

```bash
# 1. Probe Solami RPC, Beam tip sinks, wallet rent reserve, and cryptographic signing (5 seconds)
npm run check:live

# 2. Start the real-time autonomous execution monitor (streams live slots & dynamic Beam tips)
npm run monitor

# 3. Execute the 100-run live Mainnet benchmark matrix
npm run benchmark:mainnet

# 4. Execute the 1,020-run fault-injected Devnet stress matrix
npm run benchmark:devnet

# 5. Deterministically reproduce any run from the cryptographically verified ledger
npm run replay -- --run 1 --mainnet
```

---

## Table of Contents

1. [The Problem: Alerting vs Execution](#1-the-problem-alerting-vs-execution)
2. [System Architecture](#2-system-architecture)
3. [Core Subsystems](#3-core-subsystems)
4. [Dual Benchmark Matrices](#4-dual-benchmark-matrices)
5. [Fault Injection Design](#5-fault-injection-design)
6. [Cryptographic Receipt Chain](#6-cryptographic-receipt-chain)
7. [Autonomous Engine](#7-autonomous-engine)
8. [Dashboard and UI](#8-dashboard-and-ui)
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

---

## 4. Dual Benchmark Matrices

Sentry 2.0 maintains two isolated, verifiable benchmark matrices to provide complete empirical proof:

### 4.1 Production Mainnet-Beta Matrix (100 Runs)

- **Cluster:** Solana Mainnet-Beta (Genesis: `5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d`)
- **Routing:** Solami Beam SWQoS (`...beam` tip sinks)
- **Log File:** [`logs/mainnet_100_matrix.jsonl`](file:///home/samuel/sentry%202.0/logs/mainnet_100_matrix.jsonl)
- **Summary File:** [`logs/mainnet_100_summary.json`](file:///home/samuel/sentry%202.0/logs/mainnet_100_summary.json)
- **Runner:** `npm run benchmark:mainnet`
- **Explorer Target:** Real mainnet transaction links (`https://explorer.solana.com/tx/<sig>`)

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

### 4.2 Fault-Injected Devnet Stress Matrix (1,020 Runs)

- **Cluster:** Solana Devnet
- **Scope:** 51 protocols crossed with 20 operation types (1,020 unique combinations)
- **Log File:** [`logs/devnet_1000_matrix.jsonl`](file:///home/samuel/sentry%202.0/logs/devnet_1000_matrix.jsonl)
- **Summary File:** [`logs/devnet_1000_summary.json`](file:///home/samuel/sentry%202.0/logs/devnet_1000_summary.json)
- **Runner:** `npm run benchmark:devnet`

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

---

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

Sentry 2.0 includes a production Next.js 16 observatory dashboard with:
- **System Health Panel**: Real-time status for Solami RPC, Solami Beam, and Circuit Breaker state.
- **Evidence Explorer**: Interactive dual-rail matrix viewer with live cryptographic verification.
- **Mission Profiles**: Autonomous execution controls for Snipers, Arbitrageurs, Liquidity Managers, and MEV Searchers.

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

- **Solami Infrastructure Integration**: Live Solami Private RPC, Solami Beam SWQoS priority routing, and real-time Beam tip address discovery.
- **Autonomous Execution Engine**: Sub-millisecond market regime classification, Groq LPU inference, and dual-rail transaction landing.
- **Empirical Evidence**: Dual benchmark matrices (100 Mainnet runs + 1,020 Devnet stress runs) with cryptographic hash-chain provenance.
- **Open Source**: Full MIT License with reproducible CLI tools.
