---
sidebar_position: 3
---
# Solami Infrastructure

## 1. Overview of Solami Integration

Solami is an enterprise-grade Solana infrastructure provider built to deliver ultra-low latency, high reliability, and guaranteed transaction delivery under adverse network conditions.

Sentry 2.0 is designed from the ground up with Solami as its primary data path across the entire transaction lifecycle:

```text
                               +------------------------------------------+
                               |       Solami Infrastructure Data Path    |
                               +------------------------------------------+
                                      /        |         |        \
            +------------------------+         |         |         +-----------------------+
            |                                  |         |                                 |
            v                                  v         v                                 v
   +-------------------+              +-------------+  +---------------+         +-------------------+
   |    Private RPC    |              |  Beam SWQoS |  |  Blur Streams |         |  Yellowstone gRPC |
   |  (Slot Polling /  |              | (TPU Direct |  |  (Pre-Block   |         |   (Transaction &  |
   |   Simulations)    |              |  Execution) |  |   DEX Feed)   |         |    Slot Firehose) |
   +-------------------+              +-------------+  +---------------+         +-------------------+
            |                                  |                 |                         |
            +----------------------------------+-----------------+-------------------------+
                                               |
                                    +---------------------+
                                    | Dynamic Tip Oracle  |
                                    |  (...beam sinks)    |
                                    +---------------------+
```

---

## 2. Solami Private RPC (`https://rpc.solami.dev/sol`)

Standard public RPC endpoints suffer from severe rate limits, delayed slot observation, and frequent 429 errors. Solami Private RPC provides dedicated, high-throughput nodes with sub-millisecond response times.

### Operational Roles in Sentry 2.0
1. **High-Frequency Slot Progression**: Polled continuously to maintain real-time slot synchronization and detect slot drift across clusters.
2. **Compute Unit Preflight Simulation**: Every transaction is pre-simulated against live on-chain state to verify instruction validity and catch errors before broadcasting.
3. **Blockhash Sampling**: Samples the freshest cluster blockhash immediately before signing to maximize the 150-slot inclusion window.
4. **Rent-Reserve Tracking**: Monitors wallet balances before every execution to protect the SIMD-0047 rent exemption floor (650,240 lamports).

---

## 3. Solami Beam SWQoS (`https://beam.solami.dev:11000`)

### The Stake-Weighted QoS Advantage
In standard Solana transaction routing, transactions are sent to validator RPC nodes and forwarded via standard gossip or unweighted TPU connections. Under heavy DEX competition, validator queues drop unprioritized transactions.

Solami Beam provides **Stake-Weighted Quality of Service (SWQoS)** transaction landing:
- Transactions are routed directly to validator TPU ports backed by substantial staked validator weight.
- Validator leaders prioritize SWQoS-tagged bundles over public mempool traffic.
- Drastically reduces transaction drops during high-volatility DEX liquidation races and token launches.

### Beam Failover Architecture
Sentry 2.0 uses a dual-rail dispatch model (`lib/action-engine.ts`). If the Beam SWQoS endpoint encounters an intermittent network timeout, the action engine automatically races or falls back to the Solami Private RPC rail with zero dropped transactions.

---

## 4. Solami On-Chain Dynamic Tip API

Static priority tips fail in production: they either overpay during calm periods or underpay during congestion spikes.

Sentry 2.0 connects to Solami's live tip address discovery endpoint:
```http
GET https://api.solami.dev/onchain/tip-addresses
```

### Dynamic Tip Pipeline
1. Sentry discovers active Solami Beam tip accounts (ending in `...beam`).
2. The dynamic tip engine queries current 50th, 75th, and 95th percentile fee rates.
3. Depending on the classified market regime (`calm`, `moderate`, `congested`, `extreme`, `volatile`), Sentry dynamically scales the tip amount.
4. An instruction transferring the calculated priority tip is atomically prepended to the transaction package.

---

## 5. Solami Blur WebSocket (`wss://blur.solami.dev/ws`)

High-frequency algorithmic operators cannot wait for full block finalization to detect market regime shifts. Solami Blur provides a real-time pre-block streaming feed:

### Capabilities in Sentry 2.0 (`lib/blur-stream.ts`)
- **Pre-Block DEX Swap Decoding**: Streams raw liquidity pool trades across Raydium CPMM/AMM, Orca Whirlpools, and Meteora DLMM in real time.
- **Sub-Slot Price Impact Tracking**: Feeds price volatility metrics directly into Sentry's regime classifier (`lib/network-snapshot.ts`).
- **Slot Synchronization**: Maintains local `currentSlot` via `setBlurSlot()` to tag events with microsecond precision.
- **Autonomous Trigger Signal**: Emits verified events to trigger autonomous transaction actions before pool reserves rebalance.

---

## 6. Yellowstone gRPC & Native WebSocket

For microsecond-precision confirmation tracking, Sentry 2.0 supports Yellowstone gRPC streaming (`grpc.solami.dev`) alongside Solami's native WebSocket (`wss://ws.solami.dev/ws/sol`).

### Capabilities (`lib/yellowstone-stream.ts`)
- **Slot Pulse Streaming**: Real-time emission of newly observed slots at the `processed` commitment level.
- **Transaction Signature Subscriptions**: Instantaneous notification when a transaction reaches `confirmed` (supermajority consensus) without polling RPC.
- **Zero-Allocation Deserialization**: High-speed binary protocol buffers reduce CPU overhead on high-throughput nodes.

---

## 7. Solami Webhook Alerting (`webhook.solami.dev`)

Sentry 2.0 incorporates webhook event dispatch (`lib/webhook-notifier.ts`) to provide autonomous external observability:
- **Circuit Breaker Activations**: Instant alerts when high slippage or unmanageable congestion triggers the circuit breaker.
- **Tip Escalation Surges**: Notifications when the dynamic tip engine detects a 95th-percentile fee spike.
- **Landing Discrepancy Reports**: Webhook dispatches when dual-rail verification detects validator queue anomalies.

---

## 8. Solami Cluster Consistency & Head Slot Lead

To empirically validate Solami's low-latency performance against public RPC infrastructure, Sentry 2.0 incorporates a continuous multi-node consistency diagnostic (`lib/rpc-consistency.ts`):

- **Head Slot Tracking**: Concurrently queries `getSlot` at `processed` commitment across Solami Private RPC, official Solana Mainnet-Beta public RPC, and secondary cluster mirrors.
- **Solami Slot Lead Margin (`solamiAdvantageSlots`)**: Quantifies the real-time slot lead Solami maintains over public nodes, demonstrating earlier visibility into on-chain state changes.
- **Response Latency Profiling**: Measures round-trip ping time per node, verifying sub-millisecond to low-millisecond response guarantees.
- **Live UI & API Exposure**: Accessible via `GET /api/rpc-check` and visualized in real time on the Observatory Dashboard.


---

## 4. Multi-Stage Latency Waterfall & Cluster Validation Scope

### Multi-Stage Latency Waterfall
Claims of low latency must distinguish local CPU dispatch from physical speed-of-light network transit:

1. **Local Hot-Path Routing & Cuckoo Deduplication**: `< 1 ms` (in-memory TypeScript/V8 and Rust filter evaluation).
2. **Network Transport Round-Trip (RTT)**: `15 - 45 ms` (physical TCP/QUIC transit over WAN to validator TPU sockets).
3. **Leader Block Inclusion & Slot Consensus**: `400 - 800 ms` (Solana 400ms slot duration to confirmed commitment).

### Disaggregating Compute Budget Fees vs. Dynamic Tips
- **Compute Budget Priority Fees**: Sentry sets a base compute unit limit and price (typically 5,000 lamports base fee) to ensure execution inside local validator compute budgets.
- **Solami Beam Dynamic Tips**: Dispatched out-of-band directly to active Solami Beam validator tip accounts (`...beam`), ranging empirically from **1,423 to 8,000 lamports** on Mainnet based on live Jito percentiles.

### Cluster Validation Scope (Mainnet vs. Devnet)
- **Mainnet-Beta Matrix (100 Runs)**: Validates genuine Stake-Weighted Quality of Service (SWQoS) TPU leader routing through Solami Beam with real SOL tips and Solscan-verifiable finality.
- **Devnet Stress Matrix (1,020 Runs)**: Validates transaction pipeline assembly, preflight simulations, and Cuckoo filter eviction under synthetic high volume. (Devnet does not operate SWQoS stake-weighted TPU leader schedules).
