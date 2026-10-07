---
sidebar_position: 3
---
# Solami Infrastructure

## 1. Overview of Solami Integration

Solami is an enterprise-grade Solana infrastructure provider built to deliver ultra-low latency, high reliability, and guaranteed transaction delivery under adverse network conditions.

Sentry 2.0 is designed from the ground up to utilize Solami's comprehensive suite of developer services:

```text
                           +----------------------------------------+
                           |           Solami Infrastructure        |
                           +----------------------------------------+
                                        /       |       \
                                       /        |        \
                                      v         v         v
                         +---------------+  +-------+  +-----------------+
                         |  Private RPC  |  |  Beam |  | Dynamic Tip API |
                         | (Slot Polling)|  |(SWQoS)|  |  (...beam sinks)|
                         +---------------+  +-------+  +-----------------+
```

---

## 2. Solami Private RPC (`https://rpc.solami.dev/sol`)

Standard public RPC endpoints suffer from severe rate limits, delayed slot observation, and frequent 429 errors. Solami Private RPC provides dedicated, high-throughput nodes with sub-millisecond response times.

### Operational Roles in Sentry 2.0
1. **High-Frequency Slot Progression**: Polled continuously every 400ms to maintain real-time slot synchronization.
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
Sentry 2.0 uses a dual-rail dispatch model. If the Beam SWQoS endpoint encounters an intermittent network timeout, the action engine automatically falls back to the Solami Private RPC rail with zero dropped transactions.

---

## 4. Solami On-Chain Dynamic Tip API

Static priority tips fail in production: they either overpay during calm periods or underpay during congestion spikes.

Sentry 2.0 connects to Solami's live tip address discovery endpoint:
```http
GET https://api.solami.dev/onchain/tip-addresses
```

### Dynamic Tip Pipeline
1. Sentry discovers the active Solami Beam tip accounts (ending in `...beam`).
2. The dynamic tip engine queries current 50th, 75th, and 95th percentile fee rates.
3. Depending on the classified market regime (`calm`, `moderate`, `congested`, `extreme`, `volatile`), Sentry dynamically scales the tip amount.
4. An instruction transferring the calculated priority tip is atomically prepended to the transaction package.

---

## 5. Yellowstone gRPC & Native WebSocket

For microsecond-precision confirmation tracking, Sentry 2.0 supports Yellowstone gRPC streaming alongside Solami's native WebSocket (`wss://ws.solami.dev/ws/sol`).

### Capabilities
- **Slot Pulse Streaming**: Real-time emission of newly observed slots at the `processed` commitment level.
- **Transaction Signature Subscriptions**: Instantaneous notification when a transaction reaches `confirmed` (supermajority consensus) without polling RPC.
- **Zero-Allocation Deserialization**: High-speed binary protocol buffers reduce CPU overhead on high-throughput nodes.
