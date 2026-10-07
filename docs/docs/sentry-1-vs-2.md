---
sidebar_position: 10
---
# Sentry 1 vs Sentry 2.0: Complete Evolution

## 1. Executive Summary

Sentry 1 was an initial prototype demonstrating basic Jito bundle construction and simple log monitoring. While functional as a proof-of-concept, it suffered from public mempool drops, lack of preflight deduplication, unmanaged rent risks, synthetic mock data, and unverified logging.

**Sentry 2.0 is a complete architectural overhaul** engineered specifically for the Superteam Solami Infrastructure Challenge. It introduces live Solami Beam SWQoS routing, a sub-50ns Cuckoo filter deduplicator, Groq LPU hardware inference, dual verifiable benchmark matrices (100 Mainnet + 1,020 Devnet runs), SHA-256 hash-chained cryptographic provenance, and a 100% zero-mock runtime.

---

## 2. Comprehensive 15-Dimension Comparison Matrix

| Dimension | Sentry 1 (Legacy Prototype) | Sentry 2.0 (Production Submission) | Architectural Impact |
| :--- | :--- | :--- | :--- |
| **1. Infrastructure Gateway** | Public Solana RPC / SolInfra gRPC | **Solami Private RPC & Native WebSocket** | Eliminates 429 rate limits; enables sub-millisecond slot progression tracking. |
| **2. Transaction Execution Rail** | Standard Jito Bundle endpoints | **Solami Beam (SWQoS) TPU Pipeline** | Bypasses public mempool drops via Stake-Weighted Quality of Service leader delivery. |
| **3. Validator Tip Discovery** | Static hardcoded tip accounts | **Solami Dynamic Tip API (`...beam`)** | Real-time discovery of active Solami Beam tip accounts from `https://api.solami.dev`. |
| **4. Deduplication Engine** | None (duplicate resends wasted RPC) | **Sub-50ns Partial-Key Cuckoo Filter** | 4-slot power-of-2 bucket cuckoo hashing with 150-slot sliding window eviction. |
| **5. AI Operator Architecture** | Blocking LLM in node event loop | **Decoupled Hot Path (sub-1ms) / Cold Path (Groq LPU)** | Zero blocking on execution path; sub-millisecond post-mortem causal analysis on Groq LPUs. |
| **6. Market Data Feeds** | Simulated mock prices | **Blur Market Feeds & Live On-Chain Telemetry** | Real orderbook depth and volatility metrics inform dynamic regime classification. |
| **7. Event Ingestion** | Synthetic dummy event loops | **Live Confirmed Block Scanner** | Decodes genuine transfers and swaps ~32 slots behind tip via `fetchLiveTransferEvents`. |
| **8. Dynamic Tip Oracle** | Static fallback constants | **Dynamic 3-Tier Oracle** | Blends Solami Beam percentiles, Jito floor, and RPC fees with a 30,000 lamport Beam floor. |
| **9. Rent Floor Protection** | Ad-hoc wallet balance checks | **SIMD-0047 Rent Reserve Guardian** | Inviolable 650,240 lamport floor prevents operator wallet de-allocation. |
| **10. Benchmark Matrices** | None (unverified manual runs) | **Dual Empirical Matrices (1,120 Runs)** | 100 live Mainnet-Beta runs + 1,020 Devnet stress runs spanning 51 DeFi protocols. |
| **11. Audit Ledger & Provenance** | Unverified plain text JSON logs | **SHA-256 Hash Chain + Ed25519 Signatures** | Every receipt is cryptographically chained and signed with TweetNaCl Ed25519. |
| **12. Fault-Injection Architecture** | Cosmetic metadata label tagging | **Authentic Solana RPC Rejections** | Injects real expired blockhashes, rent rejections, latency cutoffs, and policy aborts. |
| **13. Deterministic Replay** | None | **CLI Scenario Replay Engine** | `npm run replay -- --run N` reproduces any historical execution receipt deterministically. |
| **14. Web Observatory UI** | Static mocked stats dashboard | **Next.js 16 Real-Time Observatory** | Server-Sent Events (SSE) slot pulse, live cryptographic verification, mission profiles. |
| **15. Capital Efficiency** | Unoptimized tip expenditures | **Sub-Dollar 100-Run Mainnet Test** | 100 Mainnet runs completed with only $0.10 USD (0.000703 SOL) total capital spent. |

---

## 3. Detailed Changelog & Code Evolution

### Infrastructure & Execution
- **Removed**: Legacy SolInfra gRPC dependencies and outdated public RPC connections.
- **Added**: Deep native integration with Solami Private RPC (`https://rpc.solami.dev/sol`), Solami Beam (`https://beam.solami.dev:11000`), and Solami Tip Addresses API (`https://api.solami.dev/onchain/tip-addresses`).
- **Improved**: Rust engine kernel (`engine/src/beam.rs`) refactored to support direct TPU socket connections and multi-rail failover.

### Preflight Deduplication
- **Added**: Zero-dependency `CuckooFilter` and `SlidingWindowCuckooDeduplicator` (`lib/cuckoo-filter.ts`).
- **Performance**: Sub-50ns lookup latency, 16-bit FNV-1a fingerprints, power-of-2 bitmasked index resolution, 150-slot blockhash lifetime matching.
- **Empirical Validation**: Mainnet Run #48 verified live preflight interception (`duplicate_suppressed_cuckoo`).

### Zero-Mock Runtime
- **Removed**: Synthetic math mock transactions and dummy random intervals.
- **Added**: `fetchLiveTransferEvents` (`lib/event-engine.ts`) scanning confirmed Solana blocks.
- **Added**: Dynamic 3-tier tip oracle dynamically polling live fee percentiles.
- **Added**: SIMD-0047 rent reserve guardian enforcing 650,240 lamport minimum balance.

### Benchmarks & Cryptography
- **Added**: 100-run live Mainnet benchmark suite (`scripts/benchmark_100_mainnet.ts`).
- **Added**: 1,020-run Devnet stress benchmark suite (`scripts/benchmark_1000_devnet.ts`).
- **Added**: Cryptographic receipt hashing and Ed25519 signing (`lib/evidence-engine.ts`).
- **Added**: Deterministic scenario replay CLI (`scripts/replay_scenario.ts`).
