# Sentry 2.0

Sentry 2.0 is an autonomous Solana transaction execution engine built to solve the reliability problem in high-congestion on-chain environments. Standard transactions submitted during peak DEX activity routinely miss slot deadlines and expire without landing. Sentry addresses this through a layered approach: real-time network telemetry, deterministic policy safety gates, Groq LPU AI inference for dynamic tip calculation, stake-weighted Solami Beam routing, and a native Rust confirmation engine.

The system is verifiable end-to-end. Every execution decision, whether a transaction lands, gets aborted by policy, or fails under a fault condition, produces a cryptographically signed, SHA-256 hash-chained receipt written to an append-only JSONL ledger.

---

## Table of Contents

1. [The Problem](#1-the-problem)
2. [System Architecture](#2-system-architecture)
3. [Core Subsystems](#3-core-subsystems)
4. [The Benchmark Matrix](#4-the-benchmark-matrix)
5. [Fault Injection Design](#5-fault-injection-design)
6. [Cryptographic Receipt Chain](#6-cryptographic-receipt-chain)
7. [Autonomous Engine](#7-autonomous-engine)
8. [Dashboard and UI](#8-dashboard-and-ui)
9. [Project Structure](#9-project-structure)
10. [Local Development and CLI](#10-local-development-and-cli)
11. [Bounty Deliverables](#11-bounty-deliverables)

---

## 1. The Problem

On Solana mainnet, transactions submitted through standard RPC paths during peak activity fail for four well-understood reasons.

**Slot deadline expiry.** A transaction must be included within 150 slots of its blockhash being sampled. Under congestion, the validator queue fills faster than it clears. A transaction waiting in the standard queue can expire before it is ever scheduled for inclusion.

**No stake-weighted priority.** Standard RPC submissions go to whichever validator happens to be the current leader without any guarantee of priority delivery. During block space competition, transactions with higher compute unit prices from MEV searchers and arbitrage bots consistently win slot inclusion.

**Tip calibration with no feedback.** Operators cannot observe the real-time fee market pressure the leader is experiencing. Setting a tip too low means deprioritization or a drop. Setting it too high wastes SOL. Without a model of the current fee environment, every submission is a guess.

**Silent failure.** When a standard transaction is dropped, the application receives no error. The transaction expires, and the only signal is the absence of a confirmation. There is no structured failure classification, no causal trace, and no recovery trigger.

Sentry 2.0 addresses all four failure modes simultaneously.

---

## 2. System Architecture

The system operates as a multi-layer pipeline. Each layer has a specific responsibility and produces observable output.

```
Yellowstone gRPC / Blur WebSocket
          |
          v
    Event Engine          (scoring, deduplication)
          |
          v
    Policy Engine         (deterministic invariant gates)
          |
          v
    Groq AI Inference     (~180ms LPU, tip recommendation)
          |
          v
    Action Engine         (transaction construction, Beam routing)
          |
          v
    Solami Beam           (stake-weighted leader delivery)
          |
          v
    Native Rust Engine    (slot polling, lifecycle tracking)
          |
          v
    Evidence Engine       (SHA-256 hash chain, JSONL receipt)
```

The pipeline is fully event-driven. An incoming Blur or Yellowstone signal triggers the event engine, which scores and deduplicates. A scored event enters the policy gate, which applies deterministic invariants. Events that pass policy are handed to Groq AI, which computes an optimal tip. The action engine constructs the transaction and routes it through Solami Beam. The Rust engine polls slot confirmation. The evidence engine seals the outcome in a cryptographically chained receipt.

---

## 3. Core Subsystems

### 3.1 Event Engine

File: [lib/event-engine.ts](file:///home/samuel/sentry%202.0/lib/event-engine.ts)

Consumes real-time signals from Yellowstone gRPC slot updates and Blur WebSocket DEX swap events. Each incoming event is scored on a 0-100 opportunity scale using a weighted combination of slot urgency, swap volume, price impact, and leader distance. Duplicate events within the same slot window are suppressed.

### 3.2 Policy Engine

File: [lib/policy-engine.ts](file:///home/samuel/sentry%202.0/lib/policy-engine.ts)

Applies deterministic, rule-based invariants before any transaction is constructed. These are not probabilistic or AI-dependent. They fire unconditionally when triggered.

**Circuit breaker:** Halts all execution if the recent failure rate exceeds the configured threshold. No transactions are constructed during an open circuit.

**Budget ceiling:** Rejects any execution if the computed tip would exceed the configured lamport ceiling.

**Slippage filter:** Aborts if simulated price impact exceeds the acceptable threshold.

**Cooldown gate:** Enforces a minimum delay between consecutive submissions to prevent slot stampeding.

Whenever the policy engine rejects an event, it emits an aborted receipt with the specific invariant that triggered the rejection.

### 3.3 Groq AI Inference

File: [lib/agent-runner.ts](file:///home/samuel/sentry%202.0/lib/agent-runner.ts)

When an event passes the policy gate, Sentry invokes the Groq LPU inference endpoint using the llama-3.3-70b-versatile model. The prompt is constructed from the current network snapshot: observed slot, leader distance, tip EMA, recent failure rate, and the event type that triggered the cycle.

The model returns a structured reasoning trace and a recommended tip in lamports. Groq hardware inference runs at approximately 180ms per decision, fast enough to be useful within a single slot window. The reasoning trace is captured verbatim in the execution receipt.

### 3.4 Action Engine and Solami Beam

File: [lib/action-engine.ts](file:///home/samuel/sentry%202.0/lib/action-engine.ts)

Constructs the transaction using the AI-recommended tip and routes it through Solami Beam. Beam is a stake-weighted transaction delivery service with direct access to current and upcoming validators. Transactions submitted through Beam bypass the general RPC mempool and are delivered with higher priority to the leader most likely to include them in the current or next slot.

### 3.5 Native Rust Engine

Files: [engine/src/main.rs](file:///home/samuel/sentry%202.0/engine/src/main.rs), [engine/src/lifecycle.rs](file:///home/samuel/sentry%202.0/engine/src/lifecycle.rs), [engine/src/beam.rs](file:///home/samuel/sentry%202.0/engine/src/beam.rs)

A standalone Rust binary compiled with cargo build --release. It handles low-latency slot polling and lifecycle state tracking. The Rust engine advances each submission through five commitment levels: pending, submitted, processed, confirmed, and finalized. Timestamps are recorded at each stage transition and returned to the evidence engine.

### 3.6 Evidence Engine

File: [lib/evidence-engine.ts](file:///home/samuel/sentry%202.0/lib/evidence-engine.ts)

Generates a cryptographically verifiable receipt for every execution, regardless of outcome. Each receipt includes the originating event type and score, every policy invariant that was evaluated, the Groq reasoning trace verbatim, the assigned tip and Beam route, the final status and confirmation slot, a SHA-256 hash chained to the previous receipt hash, and an HMAC-SHA256 engine signature using the wallet keypair.

Receipts are appended to [logs/execution_receipts.jsonl](file:///home/samuel/sentry%202.0/logs/execution_receipts.jsonl). The chain is tamper-evident: altering any prior receipt invalidates all subsequent hashes.

---

## 4. The Benchmark Matrix

The benchmark is a 1,020-run fault-injected devnet stress matrix providing reproducible, independently verifiable evidence of the system execution behavior across 51 protocols, 20 operation types, and 5 market regimes.

Log file: [logs/devnet_1000_matrix.jsonl](file:///home/samuel/sentry%202.0/logs/devnet_1000_matrix.jsonl)

Summary file: [logs/devnet_1000_summary.json](file:///home/samuel/sentry%202.0/logs/devnet_1000_summary.json)

Script: [scripts/benchmark_1000_devnet.ts](file:///home/samuel/sentry%202.0/scripts/benchmark_1000_devnet.ts)

### 4.1 Scenario Coverage

Scenarios are generated by crossing 51 protocols with 20 operation types, producing 1,020 unique combinations.

**AMMs and Aggregators:** Raydium AMM, Raydium CLMM, Raydium CP-Swap, Orca Whirlpool, Orca Standard, Jupiter V6, Jupiter Limit, Jupiter DCA, Jupiter Perpetuals, Lifinity, Meteora DLMM, Meteora Dynamic, Phoenix DEX, OpenBook V2, Saber StableSwap.

**Lending and Borrowing:** Solend, Kamino Finance, MarginFi, Port Finance, Hubble, Mango Markets, Drift Spot.

**Perpetuals and Derivatives:** Drift Perps, Drift vAMM LP, Zeta Markets, Cypher Protocol, HXRO.

**Staking and Liquid Staking Tokens:** Marinade, Jito, Sanctum, SoLana Ocean, Lido, BlazEStake.

**NFT and Gaming:** Tensor, Magic Eden, Star Atlas, Aurory.

**Governance and Infrastructure:** Realms DAO, Helium, Pyth Network, Switchboard.

**MEV and Searcher:** Jito Bundle MEV, Backrun Arbitrage, JIT Liquidity.

The 20 operation types cover 5 market regimes:

| Regime    | Description                                          | Congestion Score |
|-----------|------------------------------------------------------|-----------------|
| calm      | Low block space competition, predictable tip market  | 10 to 20        |
| moderate  | Normal DEX activity, occasional leader rotation gaps | 38 to 55        |
| congested | Peak block space demand, active priority fee wars    | 68 to 83        |
| extreme   | Validator stalls, RPC degradation, fork risk windows | 85 to 99        |
| volatile  | Flash crashes, pump events, cascading liquidations   | 58 to 78        |

### 4.2 Full Benchmark Results

Executed: 2026-10-01. Duration: 1,041.4 seconds.

| Metric                        | Value                          |
|-------------------------------|--------------------------------|
| Total runs                    | 1,020                          |
| Finalized (real on-chain)     | 663 (65.0%)                    |
| Failed (real RPC errors)      | 306 (30.0%)                    |
| Policy aborts                 | 51 (5.0%)                      |
| Real on-chain broadcasts      | 663                            |
| Devnet SOL spent              | 0.044010 SOL                   |
| Tip range                     | 8,643 to 120,000 lamports      |
| Hash chain integrity          | 1,020 / 1,020 receipts chained |
| Engine signatures             | 1,020 / 1,020 receipts signed  |

Failure class breakdown:

| Failure Class                 | Count | Mechanism                                                           |
|-------------------------------|-------|---------------------------------------------------------------------|
| blockhash_not_found           | 105   | Random 32-byte hash rejected by preflight simulation                |
| rpc_timeout                   | 102   | 80ms Promise.race against sendRawTransaction (devnet RTT 200-800ms) |
| preflight_simulation_failed   | 51    | Transfer of 999,999,999,999 lamports rejected during simulation     |
| circuit_open                  | 51    | Policy abort, no transaction constructed                            |
| already_processed             | 45    | Resent cached raw transaction bytes, rejected as duplicate          |
| duplicate_tx_slipped_through  | 3     | Resent cached transaction accepted by devnet (edge case, recorded)  |

Every tip amount is unique per run. Variance is computed as baseTip multiplied by (1 + randomNoise) plus microJitter, where microJitter is a random integer between 1 and 997 lamports. No two runs share an identical tip amount.

---

## 5. Fault Injection Design

The central criticism of most benchmarks is that failures are simulated: a label saying failed is attached to an otherwise identical always-succeeds transaction. Sentry uses mechanically distinct code paths for each fault class, each producing a genuine, distinct error from the Solana RPC or the local runtime.

### 5.1 policy_abort (51 runs)

The circuit breaker fires before any transaction is constructed. No RPC call is made. No SOL is spent. The receipt records status "aborted" and failureClass "circuit_open". This represents the policy engine halting execution when a safety invariant triggers.

### 5.2 expired_blockhash / blockhash_not_found (102 runs, 105 actual failures)

A random 32-byte value is generated using crypto.randomBytes(32) and base58-encoded. This value has never been a valid Solana blockhash. The transaction is built with this fake hash and submitted with skipPreflight: false, causing the RPC to run its preflight simulation. The simulation checks the recent blockhash set, does not find the random hash, and returns a real Transaction simulation failed error before any broadcast occurs. No SOL is spent.

### 5.3 preflight_fail / preflight_simulation_failed (51 runs)

The transaction is built to transfer 999,999,999,999 lamports (approximately 1,000 SOL) to the tip sink. The wallet holds approximately 14 SOL. Submitted with skipPreflight: false, the RPC preflight simulation finds the payer cannot cover the transfer plus fees and returns a real Transaction simulation failed: insufficient funds error. No SOL is spent.

### 5.4 rpc_timeout (102 runs)

The transaction is built normally and sendRawTransaction is called. A Promise.race runs the RPC call against an 80-millisecond timeout. Solana devnet round-trip latency from this environment is between 200 and 800 milliseconds. The timeout consistently fires before the RPC call completes, producing a real SENTRY_RPC_TIMEOUT_80ms error.

### 5.5 duplicate_tx / already_processed (51 runs)

Successful raw transactions are cached in a ring buffer of up to 20 entries. For duplicate fault scenarios, one of the cached raw transaction byte arrays is resent exactly, including the original signature. Submitted with skipPreflight: false, if the blockhash is still within the recent window the RPC detects it as AlreadyProcessed. If the blockhash has since expired, it is rejected as BlockhashNotFound. Three cases saw the devnet accept the resent transaction; these are recorded as duplicate_tx_slipped_through and retained as accurate edge case observations about devnet deduplication behavior.

---

## 6. Cryptographic Receipt Chain

Every run, regardless of outcome, produces a receipt chained to the previous one.

```
chainPayload    = [runNumber, scenarioId, tipLamports, status, signature, timestamp, prevReceiptHash].join("|")
receiptHash     = SHA-256(chainPayload)
engineSignature = HMAC-SHA256(walletSecretKey, receiptHash)
prevReceiptHash = receiptHash   (carried forward to next run)
```

The genesis entry uses a prevReceiptHash of 64 zero characters. Each subsequent receipt hash covers the prior hash, making the chain tamper-evident. Altering any single field in any prior receipt changes that receipt hash, invalidating the chain from that point forward.

The full chain is stored at [logs/devnet_1000_matrix.jsonl](file:///home/samuel/sentry%202.0/logs/devnet_1000_matrix.jsonl).

Each line is a self-contained JSON object:

| Field             | Type        | Description                                             |
|-------------------|-------------|---------------------------------------------------------|
| runNumber         | integer     | Sequential run index, 1 to 1020                         |
| scenarioId        | string      | Protocol and operation identifier                       |
| scenarioName      | string      | Human-readable scenario description                     |
| regime            | string      | Market regime                                           |
| faultType         | string      | Fault class assigned to this scenario                   |
| tipLamports       | integer     | Tip amount in lamports, unique per run                  |
| status            | string      | Outcome: finalized, failed, or aborted                  |
| failureClass      | string/null | Specific failure classification, null on success        |
| signature         | string/null | On-chain transaction signature, null on failure         |
| devnetExplorerUrl | string/null | Solana Explorer link, present for finalized runs        |
| prevReceiptHash   | string      | SHA-256 hash of the previous receipt                    |
| receiptHash       | string      | SHA-256 hash of this receipt chain payload              |
| engineSignature   | string      | HMAC-SHA256 engine signature over receiptHash           |
| timestamp         | string      | ISO 8601 execution timestamp                            |
| reproduceCommand  | string      | CLI command to replay this exact run                    |

---

## 7. Autonomous Engine

The autonomous runtime operates as a continuous event-driven state machine that runs independently of user interaction. It is controlled through the dashboard or via the API at /api/autonomous.

### 7.1 Operating Modes

**Observe:** The full pipeline runs including event scoring, policy evaluation, and Groq inference. No transactions are submitted. All decisions and reasoning traces are logged. Safe for auditing system behavior without spending SOL.

**Shadow:** The pipeline runs and transactions are constructed and signed, but not submitted to the network. Fee estimation and tip calculation are fully exercised.

**Live:** Fully autonomous execution. Incoming events trigger the complete pipeline and real transactions are submitted to Solana mainnet through Solami Beam.

### 7.2 Circuit Breaker

The circuit breaker tracks the rolling failure rate of recent submissions. If the failure rate within a configurable window exceeds the threshold, the circuit opens and all transaction construction halts. The circuit closes automatically after a cooldown period or can be reset manually. When open, every attempted execution produces an aborted receipt with failureClass "circuit_open".

### 7.3 Live Event Feed

The /api/events endpoint exposes a Server-Sent Events stream pushing every event processed by the system in real time: incoming signals, policy decisions, inference results, submission outcomes, and receipt completions.

---

## 8. Dashboard and UI

Entry point: [app/page.tsx](file:///home/samuel/sentry%202.0/app/page.tsx)

The dashboard is a single-page Next.js application exposing the full operational state of the system.

**System Primer at #primer:** A five-step interactive walkthrough for reviewers encountering the system for the first time. Explains the root cause of dropped transactions, the Sentry stack, available controls, decision provenance, and a quickstart guide. Collapsible and state-persisted.

**Autonomous Health at #autonomous-health and #autonomous-mode:** Current operating mode, circuit breaker state, recent failure rate, event queue depth, and last AI decision. Mode switching between Observe, Shadow, and Live is available directly.

**Execution Receipts at #autonomous-receipts:** All receipts in reverse chronological order. Clicking any receipt opens the full causal inspector: trigger event, policy evaluations, Groq reasoning trace, Beam route, slot timestamps, and hash chain link.

**Fault Injection Lab at #autonomous-lab:** Manual controls for triggering each fault class. Each injection runs the full detection and recovery pipeline and produces a receipt.

**Mission Console at #mission-profiles and #terminal:** Manual dispatch of curated transaction profiles including normal execution, fault injection, fault-then-retry with AI escalation, and congestion stress.

**Intelligence and Audit at #agent and #evidence:** Groq AI decision trail for the selected run and the cryptographic audit summary with JSONL download.

---

## 9. Project Structure

```
sentry-2.0/
  app/
    api/
      autonomous/           Autonomous runtime status and control
      events/               Server-Sent Events live stream
      evidence/             Raw JSONL evidence export
      observatory/          Real-time telemetry and run state
      submit-bundle/        Beam transaction submission pipeline
    components/
      phosphor-icons.tsx    Lightweight custom SVG icon set
      providers.tsx         Solana wallet adapter context
    globals.css             Typography and theme variables
    layout.tsx              Root layout with font imports
    page.tsx                Main dashboard and System Primer
  engine/
    Cargo.toml              Rust dependencies
    lifecycle_log.jsonl     Append-only mainnet lifecycle records
    src/
      beam.rs               Solami Beam transaction construction
      lifecycle.rs          Slot confirmation and finality tracking
      main.rs               Standalone Rust engine binary
  lib/
    action-engine.ts        Transaction assembly and Beam routing
    agent-runner.ts         Groq AI prompt engineering and inference
    autonomous-runtime.ts   Event-driven state machine
    event-engine.ts         Event deduplication and scoring
    evidence-engine.ts      Receipt generation and JSONL ledger
    network-snapshot.ts     Leader distance and tip EMA
    observatory.ts          Telemetry aggregation
    policy-engine.ts        Deterministic invariant safety gates
    types.ts                TypeScript type definitions
  logs/
    devnet_1000_matrix.jsonl   1,020-run fault-injected benchmark log
    devnet_1000_summary.json   Benchmark summary and statistics
    execution_receipts.jsonl   Production execution receipts
  scripts/
    benchmark_1000_devnet.ts   1,020-run benchmark script
    replay_scenario.ts         Deterministic scenario replay
  ARCHITECTURE.md             Deep architectural specification
  evidence.md                 Empirical test report
  README.md                   This document
```

---

## 10. Local Development and CLI

### 10.1 Prerequisites

Node.js v18.0.0 or higher (v24.x tested and recommended).
Rust toolchain with cargo and rustc 1.75 or higher.
WSL 2, Linux, or macOS recommended for Unix socket handling.
A funded Solana devnet wallet. The full 1,020-run benchmark spends approximately 0.044 SOL.

### 10.2 Environment Configuration

Create a .env file in the project root:

```
SOLAMI_API_KEY=your_solami_api_key
GROQ_API_KEY=your_groq_api_key
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
YELLOWSTONE_GRPC_URL=https://grpc.solami.dev
BLUR_WS_URL=wss://blur.solami.dev
WALLET_PRIVATE_KEY=your_base58_or_json_array_private_key
```

### 10.3 Installing and Building

```bash
npm install

cd engine
cargo build --release
cd ..

npm run build
```

### 10.4 Running the Benchmark

```bash
# Full 1,020-run fault-injected benchmark on Solana devnet
npm run benchmark:devnet

# Run a specific number of scenarios
TOTAL_RUNS=100 npm run benchmark:devnet

# Replay a specific run by number on devnet
npm run replay -- --run 42

# Replay a specific run on mainnet
npm run replay -- --run 42 --mainnet
```

The benchmark writes two output files on completion.

[logs/devnet_1000_matrix.jsonl](file:///home/samuel/sentry%202.0/logs/devnet_1000_matrix.jsonl) contains one JSON object per line, one per run, fully hash-chained and engine-signed.

[logs/devnet_1000_summary.json](file:///home/samuel/sentry%202.0/logs/devnet_1000_summary.json) contains aggregate statistics including the failure class breakdown.

### 10.5 Running the Development Server

```bash
npm run dev
```

The dashboard is available at http://localhost:3000.

### 10.6 Running the Rust Engine Standalone

```bash
cd engine
cargo run --release
```

---

## 11. Bounty Deliverables

| Requirement                     | Status   | Reference                                                                |
|---------------------------------|----------|--------------------------------------------------------------------------|
| Solami Beam Integration         | Complete | lib/action-engine.ts, engine/src/beam.rs                                 |
| Yellowstone and Blur Telemetry  | Complete | lib/event-engine.ts, lib/network-snapshot.ts                             |
| Autonomous Reactive Pipeline    | Complete | lib/autonomous-runtime.ts, app/api/autonomous/route.ts                   |
| Deterministic Policy Controls   | Complete | lib/policy-engine.ts                                                     |
| Groq LPU Hardware Inference     | Complete | lib/agent-runner.ts                                                      |
| Automated Fault Recovery        | Complete | lib/observatory.ts, engine/src/lifecycle.rs                              |
| Decision Provenance Receipts    | Complete | lib/evidence-engine.ts, logs/execution_receipts.jsonl                    |
| Fault-Injected Devnet Benchmark | Complete | 1,020 runs, 35% real fault rate, 5 mechanically distinct failure classes |
| Cryptographic Hash-Chain Ledger | Complete | SHA-256 chained, HMAC-SHA256 engine-signed, 1,020/1,020 receipts         |
| Deterministic Scenario Replay   | Complete | npm run replay -- --run N reproduces any of the 1,020 runs               |
| Interactive Dashboard           | Complete | app/page.tsx                                                             |

The full benchmark log with all 1,020 hash-chained receipts is at:
[logs/devnet_1000_matrix.jsonl](file:///home/samuel/sentry%202.0/logs/devnet_1000_matrix.jsonl)

The benchmark summary with failure class breakdown is at:
[logs/devnet_1000_summary.json](file:///home/samuel/sentry%202.0/logs/devnet_1000_summary.json)

---

## License

MIT License. Developed for the Superteam Advanced Infrastructure Bounty.
