---
sidebar_position: 8
---
# Live Observatory & Block Scanner

## 1. Next.js 16 Web Dashboard

Sentry 2.0 features a production-ready Next.js 16 web observatory dashboard designed for real-time mission monitoring:
- **System Health Panel**: Continuous live status indicators for Solami Private RPC, Solami Beam, WebSocket connections, and Circuit Breaker state.
- **Evidence Explorer**: Interactive dual-rail matrix viewer with live cryptographic verification of all 100 Mainnet and 1,020 Devnet receipts.
- **Mission Profiles**: Dynamic operational profiles configuring execution risk parameters.

---

## 2. Live Confirmed Block Scanner

In Sentry 1, event generation relied on synthetic dummy loops. Sentry 2.0 replaces all synthetic generators with a **Live Confirmed Block Scanner** (`fetchLiveTransferEvents` in `lib/event-engine.ts`).

### Scanner Pipeline
1. Queries real confirmed blocks ~32 slots behind cluster head over Solami Private RPC.
2. Decodes genuine on-chain Solana transactions, extracting:
   - System Program transfers.
   - SPL Token transfers and DEX swaps.
   - Fee payer addresses, transfer lamports, and recent blockhashes.
3. Streams genuine on-chain market activity directly into Sentry's execution pipeline, ensuring that every transaction evaluated represents real decentralized finance volume.

---

## 3. Dynamic 3-Tier Tip Oracle

Sentry 2.0 eliminates hardcoded priority fees. Priority tips are calculated dynamically across a 3-tier oracle hierarchy:

```text
                  +-----------------------------------+
                  |      Dynamic 3-Tier Tip Oracle     |
                  +-----------------------------------+
                                    |
            +-----------------------+-----------------------+
            |                                               |
            v                                               v
    [Solami Beam Sinks]                           [On-Chain RPC Stream]
   (Percentiles: 50/75/95)                      (getRecentPrioritizationFees)
            |                                               |
            +-----------------------+-----------------------+
                                    |
                                    v
                     [30,000 Lamport Beam Floor]
                                    |
                                    v
                  Dynamic Micro-Tip Injected to Transaction
```

1. **Solami Beam Percentiles**: Evaluates real-time validator inclusion percentiles (50th, 75th, 95th).
2. **On-Chain Priority Fee History**: Queries RPC `getRecentPrioritizationFees` across the last 150 slots.
3. **Beam Priority Floor**: Enforces a minimum 30,000 lamport tip floor for Beam SWQoS inclusion when routing priority transactions.

---

## 4. Mission Profiles

Operators can configure Sentry 2.0 into four specialized mission profiles:

| Profile | Target Operations | Risk Bounds | Routing Priority |
| :--- | :--- | :--- | :--- |
| **Sniper** | Token launches, pool creations | High tip tolerance, tight blockhash | Maximum Solami Beam SWQoS |
| **Arbitrageur** | Cross-DEX price discrepancies | Low latency, strict slippage bounds | Solami Beam SWQoS |
| **Liquidity Manager** | Pool rebalancing, fee collection | Moderate tips, high success priority | Dynamic failover (Beam + RPC) |
| **MEV Searcher** | Sandwich defense, liquidation racing | Highest tip multiplier, zero duplicates | Beam SWQoS + Cuckoo Filter |
