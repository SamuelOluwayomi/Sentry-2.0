---
sidebar_position: 6
---
# Real Fault-Injection & Safety Invariants

## 1. Zero-Mock Testing Philosophy

In institutional Solana execution, synthetic test suites that mock network calls or return hardcoded success strings provide zero assurance of live performance. When real network congestion strikes, mocked systems fail catastrophically.

Sentry 2.0 enforces a strict **Zero-Mock Architecture**:
- All benchmark runs connect to live Solana clusters (Mainnet-Beta and Devnet).
- Fault-injection scenarios produce **authentic Solana RPC preflight simulation rejections**.
- Every execution receipt is signed with real cryptographic keypairs.

---

## 2. Authentic Fault-Injection Suite

The benchmark harness implements five realistic fault conditions:

| Fault Type | Injection Mechanism | Authentic Cluster Response |
| :--- | :--- | :--- |
| **`expired_blockhash`** | Transmits an unmined, invalid 32-byte blockhash | RPC simulation preflight rejects with `BlockhashNotFound`. |
| **`preflight_fail`** | Submits a transfer of 1,000 SOL from a wallet holding rent reserve | RPC simulation rejects with `InsufficientFundsForRent`. |
| **`rpc_timeout`** | Races the broadcast against an 80ms wall-clock deadline | Client-side timeout triggers latency-drop recovery. |
| **`duplicate_tx`** | Resends an identical raw transaction signature | Intercepted in ~200ns by in-memory Cuckoo filter, or rejected by validator RPC with `AlreadyProcessed` / `BlockhashNotFound`. |
| **`policy_abort`** | Simulates extreme market volatility crossing risk thresholds | Sentry's internal circuit breaker trips before signing, spending 0 lamports. |

---

## 3. Deterministic Safety Invariants

Sentry 2.0 implements non-negotiable safety guardrails that protect operator capital under all network conditions:

### 3.1 SIMD-0047 Rent Floor Protection
Solana accounts require a minimum balance to remain rent-exempt. Under Solana Improvement Document 0047 (SIMD-0047), draining an account below the rent-exempt floor risks de-allocation or failed preflights.
- Sentry enforces an inviolable floor of **650,240 lamports** (~0.00065 SOL).
- Even during extreme tip escalation, the policy engine refuses to construct transactions that would dip below this reserve.
- In the 100-run Mainnet matrix, Sentry completed all 100 runs, spent only 0.000703 SOL, and left 0.001437 SOL in the wallet—comfortably above the rent floor.

### 3.2 Circuit Breaker State Machine
To prevent runaway fee burn during cascading on-chain anomalies, Sentry maintains a finite-state machine:
- **`Closed` (Normal Operation)**: All policy-compliant transactions proceed to execution.
- **`Open` (Halted)**: Trips when consecutive failures exceed 3 within a 10-slot window. Aborts execution before transaction construction, spending 0 lamports.
- **`Half-Open` (Probing)**: Dispatches a single test transaction with high SWQoS priority. If successful, resets to `Closed`; if failed, returns to `Open`.


---

## 4. Clean-Run Baseline vs. Fault-Injection Classification

To ensure rigorous reporting integrity, Sentry 2.0 strictly separates **clean baseline production transactions** from **intentional fault-injection classification experiments**:

| Metric Category | Mainnet-Beta Runs | Finality / Outcome | Verification |
| :--- | :--- | :--- | :--- |
| **Clean Baseline Broadcasts** | **55 Runs** | **100% Landed (55 / 55)** | Verifiable on Solscan & Solana Explorer |
| **Intentional Injected Faults** | **38 Runs** | **100% Correctly Classified** | Authentic RPC error classifications |
| **Circuit-Breaker Aborts** | **7 Runs** | **0 Lamports Wasted** | Deterministic preflight policy halts |
| **Total Benchmark Ledger** | **100 Runs** | **100% Cryptographically Chained** | SHA-256 Merkle chain + Ed25519 signatures |

### Cache Verification Order Note
Validators evaluate their recent blockhash cache (under 150 slots) **before** evaluating their transaction signature cache. When an expired duplicate is submitted, validators return `BlockhashNotFound` rather than `AlreadyProcessed`. Sentry's multi-class classifier accounts for this evaluation order.
