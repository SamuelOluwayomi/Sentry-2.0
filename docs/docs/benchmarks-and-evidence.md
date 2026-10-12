---
sidebar_position: 7
---
# Dual Benchmark Matrices & Evidence

## 1. Dual Benchmark Architecture

Sentry 2.0 maintains two isolated, verifiable benchmark matrices to provide complete empirical proof:
1. **Production Mainnet-Beta Matrix (100 Runs)**: Demonstrates live validator inclusion, dynamic tip calibration, and capital preservation under real mainnet market conditions.
2. **Fault-Injected Devnet Stress Matrix (1,020 Runs)**: Comprehensive stress matrix testing 51 protocols across 20 operation types to validate every failure class and recovery path.

### Benchmark Artifacts & Direct Log Links

| Artifact | Cluster | Runs | File Link | Raw Data Description |
| :--- | :--- | :--- | :--- | :--- |
| **Mainnet Matrix Ledger** | Mainnet-Beta | 100 | [`logs/mainnet_100_matrix.jsonl`](file:///home/samuel/sentry%202.0/logs/mainnet_100_matrix.jsonl) | Append-only JSONL ledger of 100 SHA-256 hash-chained execution receipts with Ed25519 engine signatures. |
| **Mainnet Run Summary** | Mainnet-Beta | 100 | [`logs/mainnet_100_summary.json`](file:///home/samuel/sentry%202.0/logs/mainnet_100_summary.json) | High-level metrics, failure classification counts, SOL expenditure, and tip statistics. |
| **Devnet Stress Ledger** | Devnet | 1,020 | [`logs/devnet_1000_matrix.jsonl`](file:///home/samuel/sentry%202.0/logs/devnet_1000_matrix.jsonl) | 1,020-run stress matrix spanning 51 protocols and 20 operation types with SHA-256 hash chaining. |
| **Devnet Run Summary** | Devnet | 1,020 | [`logs/devnet_1000_summary.json`](file:///home/samuel/sentry%202.0/logs/devnet_1000_summary.json) | Complete statistical breakdown of latency drops, blockhash expirations, and circuit breaker trips. |

---

## 2. Production Mainnet-Beta Matrix (100 Runs)

- **Cluster**: Solana Mainnet-Beta
- **Genesis Hash**: `5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d`
- **Routing**: Solami Beam SWQoS (`...beam` tip sinks) & Solami Private RPC
- **Executed At**: 2026-10-07
- **Duration**: 150.1 seconds

### Mainnet Results Table & Run Category Breakdown

To evaluate Sentry 2.0 with statistical integrity, the 100 runs must be separated into **clean baseline broadcasts** versus **deliberate fault-injection tests**:

| Execution Category | Runs | Success Metric | Outcome |
| :--- | :--- | :--- | :--- |
| **Clean Baseline Broadcasts** | 55 | **100% Landing Rate** (55/55) | All 55 non-faulted transactions confirmed and finalized on Solana Mainnet-Beta via Solami Beam SWQoS. |
| **Injected Fault Classification Tests** | 38 | **100% Classification Accuracy** (38/38) | All 38 deliberate fault conditions (`rpc_timeout`, `blockhash_not_found`, `preflight_simulation_failed`, `already_processed`) were caught and categorized by Sentry's failure taxonomy without unhandled runtime crashes. |
| **Circuit Breaker Policy Aborts** | 7 | **100% Capital Preservation** (7/7) | All 7 safety guard triggers halted execution before transaction assembly, spending exactly 0 lamports. |

#### Aggregate Ledger Metrics

| Metric | Empirical Value |
| :--- | :--- |
| Total Runs | 100 |
| Finalized On-Chain Broadcasts | 55 (100% of clean baseline runs) |
| Injected Fault Classification Tests | 38 (100% correctly caught and mapped) |
| Policy Aborts (Circuit Breakers) | 7 (0 lamports spent) |
| Total SOL Spent | 0.000703 SOL (~$0.10 USD) |
| Remaining Wallet Balance | 0.001437 SOL (Preserved above standard 0-byte rent floor) |
| Dynamic Tip Range | 1,423 to 8,000 lamports |
| Hash Chain Integrity | 100 / 100 receipts chained |
| Asymmetric Ed25519 Signatures | 100 / 100 receipts verified via `tweetnacl` |

:::note Duplicate Classification: `already_processed` vs `blockhash_not_found`
In Solana validator RPC architecture, when a transaction is submitted, the node evaluates the recent blockhash cache *before* querying the signature cache:
- If a duplicate transaction is re-broadcast while its blockhash is still valid (under 150 slots), the RPC returns `AlreadyProcessed`.
- If a duplicate transaction is re-broadcast after its blockhash has expired (over 150 slots), the validator rejects it as `BlockhashNotFound` before ever checking the duplicate signature cache.
Both outcomes verify that duplicate transactions never execute twice on-chain.
:::

:::info Cluster Validation Scope: Devnet vs. Mainnet
- **Devnet Stress Matrix (1,020 Runs)**: Validates state machines, Cuckoo filter deduplication, preflight simulation, and error taxonomy at scale. Devnet does not have validator-staked SWQoS leaders or Jito block engines.
- **Mainnet-Beta Matrix (100 Runs)**: Serves as the sole empirical validation for **Solami Beam SWQoS priority routing**, with real SOL tips and verifiable on-chain signatures on Solscan.
:::

### Mainnet Failure Class Breakdown

| Failure Class | Count | Description & Handling |
| :--- | :--- | :--- |
| `rpc_timeout` | 15 | Injected 90ms timeout to verify latency-drop recovery |
| `blockhash_not_found` | 9 | Expired blockhash caught cleanly by RPC simulation |
| `preflight_simulation_failed` | 7 | Instruction failure caught before on-chain fee burn |
| `circuit_open` | 7 | Policy engine circuit breaker halted execution, spending 0 SOL |
| `already_processed` | 6 | Duplicate detected by RPC preflight simulation |
| `duplicate_suppressed_cuckoo` | 1 | Intercepted in sub-50ns by Cuckoo filter preflight guard |

---

## 3. Fault-Injected Devnet Stress Matrix (1,020 Runs)

- **Cluster**: Solana Devnet
- **Scope**: 51 DeFi Protocols x 20 Operation Types = 1,020 Unique Scenarios
- **Executed At**: 2026-10-01
- **Duration**: 1,041.4 seconds

### Devnet Results Table

| Metric | Empirical Value |
| :--- | :--- |
| Total Runs | 1,020 |
| Finalized On-Chain | 663 (65.0%) |
| Failed (Authentic RPC Errors) | 306 (30.0%) |
| Policy Aborts (Circuit Breakers) | 51 (5.0%) |
| Real On-Chain Broadcasts | 663 |
| Devnet SOL Spent | 0.044010 SOL |
| Dynamic Tip Range | 8,643 to 120,000 lamports |
| Hash Chain Integrity | 1,020 / 1,020 receipts chained |
| Engine Signatures | 1,020 / 1,020 receipts verified |

---

## 4. Cryptographic Provenance Architecture

To ensure tamper-proof auditability for judges and operators, every execution receipt is hash-chained:

```text
Run 1: Hash = SHA-256("1|scenario_id|tip|status|sig|timestamp|0000...0000")
       Sign = Ed25519(Hash, OperatorPrivateKey)
          |
Run 2: Hash = SHA-256("2|scenario_id|tip|status|sig|timestamp|" + Run1.Hash)
       Sign = Ed25519(Hash, OperatorPrivateKey)
          |
Run N: Hash = SHA-256("N|scenario_id|tip|status|sig|timestamp|" + Run(N-1).Hash)
       Sign = Ed25519(Hash, OperatorPrivateKey)
```

Modifying any historical field invalidates every subsequent hash in the ledger.

### Deterministic Replay Engine
Any scenario from either matrix can be reproduced deterministically:

```bash
# Replay run #1 on Mainnet
npm run replay -- --run 1 --mainnet

# Replay run #17 on Devnet
npm run replay -- --run 17
```
