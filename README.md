# Sentry 2.0

**Autonomous Execution System for Solana: Superteam Nigeria Advanced Infrastructure Bounty**

> Detect. Understand. Decide. Execute. Recover. Prove.

Sentry 2.0 is an autonomous execution system built for Solana mainnet. It ingests live network telemetry, computes market and network conditions, applies deterministic policy safeguards, executes transactions via Solami Beam with dynamic Jito tips, classifies execution outcomes, and publishes verifiable evidence logs.

---

## Project Resources

| Resource | Link |
|---|---|
| Live Dashboard | https://sentryy.vercel.app/ |
| Architecture Design Document | [ARCHITECTURE.md](./ARCHITECTURE.md) |
| Operational Evidence | [evidence.md](./evidence.md) |
| Evidence API Endpoint | `/api/evidence` |

---

## System Architecture

```
Solami Blur (decoded market stream)
Solami Yellowstone (gRPC slot & leader feed)
         |
         v
  [ Event Engine ]
  - Decodes, classifies, and deduplicates network events
  - Computes opportunity scoring (0 to 100)
  - Event types: swap, liquidity change, large transfer, pool creation, fault injection
         |
         v
  [ Network Snapshot ]
  - Tracks slot, scheduled leader, tip floor (p25, p50, p75, p95)
  - Computes tip EMA and congestion trend
  - Classifies network regime: cold, warm, hot, critical
         |
         v
  [ Policy Engine ]
  - Deterministic safety gates
  - Checks opportunity thresholds, congestion score, budget limits, rate limits
  - Automated circuit breaker: 5 consecutive failures trips circuit to OPEN
  - Outputs decision: allowed, blocked, shadow
         |
         v
  [ Groq AI Operator ] (llama-3.3-70b-versatile via Groq LPUs)
  - Evaluates tip adequacy and execution urgency
  - Recommends tip strategy and retry policy
  - Operates strictly within deterministic policy bounds
         |
         v
  [ Action Engine & Smart Router ]
  - Directs submission to optimal route: Solami Beam, direct Jito bundle, or RPC fallback
  - Primary route: Solami Beam (stake-weighted SWQoS priority)
         |
         v
  [ Recovery & Lifecycle Engine ]
  - Tracks commitment progression: processed, confirmed, finalized
  - Automated failure classification: low tip, expired blockhash, simulation error, RPC timeout
  - Triggers policy-governed tip bump and retry when appropriate
         |
         v
  [ Evidence & Audit Ledger ]
  - Append-only JSONL recording of every transaction, slot pulse, and decision trace
```

---

## Key Capabilities

### 1. Solami Beam Execution
All transactions are routed directly through Solami Beam endpoints using dynamic Jito tips based on real-time tip percentiles (p25/p50/p75/p95). This avoids the common transaction drops experienced by standard public RPC broadcasts during network congestion.

### 2. Live Yellowstone Telemetry
Continuous gRPC streaming tracks slot advancement and scheduled validator leaders. Every transaction submit slot and landing slot is recorded and verified.

### 3. Groq LPU Decision Intelligence
Groq hardware-accelerated inference provides sub-second reasoning on transaction urgency, observed network risk, and tip recommendations. The AI advises on execution parameters while deterministic policy engines enforce strict safety guardrails.

### 4. Deterministic Circuit Breakers & Risk Controls
- Maximum tip ceiling per bundle
- Maximum hourly lamports budget
- Circuit breaker tripping after consecutive failed submissions
- Protection against excessive balance depletion (tested against real funded mainnet wallet)

### 5. Automated Failure Classification & Recovery
Failures are classified into actionable categories (insufficient tip, congestion drop, expired blockhash, or RPC preflight error). The recovery engine dynamically bumps tips and resubmits according to rule profiles.

### 6. Mainnet Evidence Ledger
Every bundle submission, signature, commitment timestamp, and agent trace is recorded in `data/runs.jsonl`. The full evidence trail is exportable in real time via the UI and `/api/evidence`.

---

## Live Verification & Testing Metrics

- Network: Solana Mainnet Beta (`mainnet-beta`)
- Funded Test Wallet: `EPpNW3G47SAJ4j1DatpjW7mJMLRTH9Z8K7LJtBfhR8Mt`
- Current Wallet Balance: ~0.00187 SOL (tested from an initial 0.002 SOL funding)
- Dynamic Tip Floor: 30,000 lamports (0.00003 SOL)
- Total Recorded Runs: 22 mainnet runs
- Successful Landings: 16 confirmed mainnet transactions via Solami Beam
- Fault Test Evidence: 4 injected low-tip/zero-tip fault runs demonstrating failure classification and recovery paths
- Median Confirmation: ~15.9s to RPC confirmation

---

## Running Locally

### Prerequisites
- Node.js 18+ (tested on Node v24)
- Rust toolchain (for native engine components in `engine/`)
- Solana CLI keypair (or environment variables)

### Setup

```bash
# Clone the repository
git clone https://github.com/samuel/sentry-2.0.git
cd "sentry 2.0"

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env.local

# Run the Next.js development server
npm run dev
```

Visit `http://localhost:3000` to access the operational dashboard.

---

## Repository Structure

- `app/` - Next.js 15 App Router interface (editorial typography, live stream terminal, lifecycle inspector)
- `app/api/` - Backend endpoints for bundle submission, Yellowstone SSE stream, observatory state, and Groq analysis
- `engine/` - High-performance Rust engine modules for Solami Beam submission and Yellowstone gRPC streaming
- `lib/` - TypeScript action engine, event processors, policy rules, and Groq AI agent integrations
- `scripts/` - Mainnet transaction harnesses and test profile runners
- `data/` - Immutable execution evidence logs (`runs.jsonl`)

---

## License

MIT License. Built for the Superteam Nigeria Advanced Solana Infrastructure Bounty.
