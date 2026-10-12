---
sidebar_position: 9
---
# Sentry Academy & Interactive Developer Lab

## 1. Overview

The **Sentry Academy** (accessible at [https://sentryacademy.vercel.app/dashboard](https://sentryacademy.vercel.app/dashboard) or locally via `/dashboard`) is an interactive, browser-native developer curriculum and testing laboratory designed to teach, verify, and benchmark high-performance Solana transaction execution using Solami's data infrastructure.

Unlike static documentation, each academy lesson pairs verified technical theory with:
1. **Interactive IDE Code Viewer**: Real-time syntax-highlighted TypeScript implementation with clean tab headers, copy-to-clipboard, and line numbers.
2. **CLI Terminal Test Runner**: An authentic developer terminal simulator that executes real RPC calls, prints formatted test stages (`[✓ PASS]`, `[▶ RUN]`, `[· QUE]`), and displays structured stdout telemetry with clickable Solana Explorer verification links.
3. **Multi-Cluster Execution Toggle**: Runs by default on **Mainnet-Beta** for zero-latency network telemetry, slot lag benchmarks, and quote simulations, with a one-click toggle to **Devnet** for transaction dispatch and test airdrops.
4. **Knowledge Verification Quizzes & Module Clearance**: Step-by-step progress tracking with real-time status indicators across Theory, Quiz, and Live Labs.

---

## 2. Curriculum Modules

| Module ID | Title | Key Concepts & Solami Data Path | Cluster Support |
| :--- | :--- | :--- | :--- |
| `01_pulse` | **Cluster Pulse & Slot Telemetry** | Fetches `processed`, `confirmed`, and `finalized` slots; computes slot drift, slot advantage, and measures RPC latency. | Mainnet (Default) / Devnet |
| `02_tip_oracle` | **Dynamic Tip Oracle & Beam Sink Discovery** | Queries Solami's dynamic tip engine, discovers active `...beam` sink addresses, and computes 75th/95th percentile tips. | Mainnet (Default) / Devnet |
| `03_cuckoo_guard` | **Zero-Allocation Cuckoo Deduplication** | Tests sub-50ns fingerprint insertion and duplicate rejection to prevent double-spend during mempool latency spikes. | In-Memory Engine |
| `04_orca_whirlpool` | **Orca Whirlpool Concentrated Liquidity Swap** | Evaluates live on-chain pool state via `@orca-so/whirlpools-sdk`, simulates price impact, and constructs SWQoS bundles. | Mainnet (Default) / Devnet |
| `05_rpc_consistency` | **Multi-Node RPC Consistency Benchmark** | Compares Solami Private RPC head slot and latency against Triton, Helius, and Solana public endpoints. | Mainnet (Default) / Devnet |
| `06_dual_rail` | **Dual-Rail Transaction Landing Race** | Dispatches simultaneous transactions across Solami Beam SWQoS and Jito bundles, recording the winning rail. | Mainnet (Default) / Devnet |
| `07_airdrop_faucet` | **Devnet Test Harness & Faucet Protocol** | Diagnostic test harness requesting cluster airdrops to fund operator rent reserves for automated testing. | Devnet (Guides switch if on Mainnet) |

---

## 3. The CLI Terminal Test Runner (`CliLabRunner`)

The test runner provides terminal-grade feedback for developers:
- **Header Badge**: Displays active cluster (`sentry@mainnet` or `sentry@devnet`).
- **Cluster Switcher**: Instant `CLUSTER: [ MAINNET (DEFAULT) | DEVNET ]` buttons embedded directly in the terminal interface.
- **Progressive Test Stages**: Each assertion runs asynchronously and updates its state pill from `[· QUE]` to `[▶ RUN]` to `[✓ PASS]` (or `[✗ FAIL]`).
- **Live Output Stream**: Prints complete telemetry JSON payloads and direct block explorer hyperlinks (`https://explorer.solana.com/tx/...` or `.../block/...`).

---

## 4. Architecture & Endpoints

The Academy test runner connects to dedicated Next.js API routes:
- `GET /api/academy?action=run&lesson=<id>&network=<mainnet|devnet>`: Executes the on-chain laboratory test harness and returns structured timing, slot metrics, and Explorer transaction links.
- `lib/academy-lab.ts`: Contains the production test runners, assertion verifiers, and multi-network RPC dispatchers.
