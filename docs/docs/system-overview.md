---
sidebar_position: 1
---
# System Overview

## 1. Introduction to Sentry 2.0

Sentry 2.0 is an autonomous, low-latency Solana transaction execution engine built to solve the execution reliability crisis in high-congestion on-chain environments. 

On Solana, transactions submitted through standard public RPC nodes during periods of extreme DEX volatility or NFT mints suffer from four fundamental failure modes:
1. **Slot Deadline Expiration**: Transactions must be confirmed within 150 slots of their blockhash. Standard validator queues fill faster than they process, dropping transactions silently.
2. **Lack of Stake-Weighted Priority**: Standard RPC submissions go to random validator nodes without Stake-Weighted Quality of Service (SWQoS), leading to unprioritized drops.
3. **Static & Miscalibrated Tipping**: Static priority tips waste capital when network load is low, and get outcompeted when MEV activity spikes.
4. **Silent Drops without Telemetry**: Standard RPC nodes return no actionable failure classification when transactions expire, preventing autonomous recovery.

While conventional alert bots passively monitor the chain and emit delayed notifications to Discord or Telegram, **Sentry 2.0 closes the autonomous execution loop**:
- **Senses** real-time network volatility via Solami Private RPC and native WebSocket streams.
- **Deduplicates** transaction attempts in sub-50ns using a mathematical partial-key Cuckoo filter.
- **Evaluates** dynamic safety policies and out-of-band market intelligence with Groq LPU hardware acceleration.
- **Lands** priority transactions on-chain via Solami Beam's Stake-Weighted Quality of Service (SWQoS) TPU pipeline.
- **Proves** every execution result cryptographically through an append-only, SHA-256 hash-chained and Ed25519-signed receipt ledger.

---

## 2. The Solami Infrastructure Paradigm

Sentry 2.0 is architected directly around Solami's operational principle:
> *"Read state with RPC, react to change with a stream, act through Beam."*

| Solami Product | Endpoint | Role in Sentry 2.0 |
| :--- | :--- | :--- |
| **Solami Private RPC** | `https://rpc.solami.dev/sol` | Sub-millisecond slot tracking, dynamic compute unit preflights, blockhash sampling, and SIMD-0047 rent protection. |
| **Solami Beam (SWQoS)** | `https://beam.solami.dev:11000` | Stake-Weighted Quality of Service TPU priority rail. Directly injects transactions into validator leader blocks, bypassing public mempool congestion. |
| **Solami Dynamic Tip API** | `https://api.solami.dev/onchain/tip-addresses` | Real-time discovery of active Solami Beam tip accounts (`...beam`) for dynamic validator priority inclusion. |
| **Solami Native WebSocket** | `wss://ws.solami.dev/ws/sol` | Microsecond-latency slot and account subscription feeds. |
| **Blur Market Feeds** | Orderbook telemetry | Real-time orderbook depth and bid-ask spread signals for volatility classification. |

---

## 3. Core Pillars of Sentry 2.0

### Sub-50ns Preflight Deduplication (Cuckoo Filter)
Implements a partial-key Cuckoo filter (`lib/cuckoo-filter.ts`) with 4 slots per bucket, 16-bit FNV-1a fingerprints, and power-of-2 bucket sizing. Features a 150-slot sliding window deduplicator that matches Solana's blockhash lifetime. Intercepts duplicate transaction submissions in under 50 nanoseconds before touching RPC or spending gas.

### Decoupled Hot Execution Path vs. Cold Telemetry Path
- **Deterministic Hot Path (sub-1ms)**: Zero network calls to remote AI. Runs locally inside Node.js and the native Rust engine. Handles Cuckoo deduplication, SIMD-0047 rent protection, circuit breaker gating, dynamic tip calculation, and Solami Beam dispatch.
- **Cognitive Cold Path (Groq LPU)**: Utilizes Groq Language Processing Units running Llama 3.3 70B Versatile for sub-millisecond post-mortem causal failure analysis, anomaly detection, and macro policy tuning without blocking live transaction execution.

### Live Confirmed Block Scanner (Zero-Mock Runtime)
Replaced synthetic event generators with `fetchLiveTransferEvents` (`lib/event-engine.ts`), which decodes real transactions from confirmed Solana blocks approximately 32 slots behind chain head. Combines this with a dynamic 3-tier tip oracle polling Solami Beam percentiles, Jito bundle floors, and on-chain RPC `getRecentPrioritizationFees`.

### Dual Verifiable Benchmark Matrices
Provides empirical proof across two isolated environments:
1. **Production Mainnet-Beta Matrix (100 Runs)**: 55 landed on-chain transactions, 38 real RPC error recoveries, 7 circuit breaker aborts, 1 Cuckoo filter interception. Spent only `0.000703 SOL` (~$0.10 USD) while preserving rent reserves.
2. **Fault-Injected Devnet Stress Matrix (1,020 Runs)**: 51 protocols crossed with 20 operation types (663 landed, 306 failed, 51 aborted).

### Cryptographic Audit Ledger
Every single execution receipt is SHA-256 hash-chained to the immediately preceding receipt and signed with Ed25519 (`TweetNaCl`). Tampering with any historical entry breaks downstream hashes, enabling deterministic scenario replay via `npm run replay`.

---

## 4. Quick Start & Live Verification

Verify Sentry 2.0 against live Solana Mainnet-Beta in 5 seconds with zero setup:

```bash
# 1. Run the 5-second diagnostic probing Solami RPC, Beam tip sinks, and wallet rent reserves
npm run check:live

# 2. Start the real-time autonomous execution monitor
npm run monitor

# 3. Execute the 100-run live Mainnet benchmark matrix
npm run benchmark:mainnet

# 4. Execute the 1,020-run fault-injected Devnet stress matrix
npm run benchmark:devnet

# 5. Deterministically replay any scenario from the hash-chained ledger
npm run replay -- --run 1 --mainnet
```

---

## 5. Environment Configuration

All sensitive configuration parameters are managed strictly through environment variables. Sentry 2.0 enforces a strict security policy: **no private keys or secrets are ever hardcoded in code or committed to repositories**.

Create a `.env` file in the project root:

```env
# Solami Infrastructure Endpoints
SOLANA_RPC_URL=https://rpc.solami.dev/sol?api_key=your_solami_api_key
NEXT_PUBLIC_RPC_URL=https://rpc.solami.dev/sol?api_key=your_solami_api_key
SOLANA_WS_URL=wss://ws.solami.dev/ws/sol?api_key=your_solami_api_key
BEAM_ENDPOINT=https://beam.solami.dev:11000

# Operator Wallet Credentials
WALLET_PRIVATE_KEY=your_base58_private_key_here

# Groq LPU Hardware Acceleration
GROQ_API_KEY=gsk_your_groq_api_key_here

# Native Yellowstone gRPC Stream (Optional)
YELLOWSTONE_ENDPOINT=https://grpc.solami.dev
YELLOWSTONE_TOKEN=your_solami_token_here
```
