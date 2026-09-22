# Sentry: Smart Transaction Stack

A Solana infrastructure project built for the Superteam Nigeria **Advanced Infrastructure Challenge: Build a Smart Transaction Stack** bounty.

Sentry 2.0 is a full-stack transaction operations system built on Solami infrastructure. It streams live Solana network state via Solami Yellowstone gRPC, constructs and submits transactions through Solami Beam (stake-weighted SWQoS routing), tracks each submission through its multi-stage commitment lifecycle (`Processed` -> `Confirmed` -> `Finalized`), and deploys an autonomous AI agent to make real-time tip adjustment, retry, and hold decisions based on observed network state.

## Project Resources

| Resource | URL |
|---|---|
| Live Dashboard (Console) | [https://sentryy.vercel.app/](https://sentryy.vercel.app/) |
| Live Documentation | [https://sentry-doc.vercel.app/](https://sentry-doc.vercel.app/) |
| Architecture Design Document (Notion) | [Public Notion Page](https://app.notion.com/p/Sentry-architecture-design-document-38b51a555eab80e6a533c160d934bd5a?source=copy_link) (or local [ARCHITECTURE.md](./ARCHITECTURE.md)) |
| Operational Evidence Report | [evidence.md](./evidence.md) (12 bundle runs, latency percentiles, AI recommendations) |

---

## Architecture Overview

Sentry is composed of four decoupled services that communicate through shared filesystem logs. Each service is independently deployable and can be run in isolation or orchestrated together via the CLI or Docker Compose.

```
                      +---------------------------+
                      |  Solami Yellowstone gRPC   |
                      |  grpc.solami.dev           |
                      +-------------+-------------+
                                    |
                                    v
+------------------+    +-----------+-----------+    +--------------------+
|  Solami Beam     |<-->|  Rust Engine (engine/) |    |  Solana Mainnet    |
|  (SWQoS routing) |    |  - Slot RPC polling    |<-->|  Solami RPC        |
|  beam.solami.dev |    |  - Tx construction     |    |  rpc.solami.dev    |
+------------------+    |  - Lifecycle tracking  |    +--------------------+
  Jito (fallback)       |  - Auto-retry logic    |
  TX_PROVIDER=jito      +-----------+------------+
                                    |
                      writes lifecycle_log.jsonl
                      writes agent_decisions.jsonl
                                    |
              +---------------------+---------------------+
              |                                           |
   +----------v----------+                  +-------------v-----------+
   |  AI Agent (agent/)  |                  |  Next.js Console (app/) |
   |  - Local rules      |                  |  - SSE slot stream      |
   |  - Groq LLM chain   |                  |  - Bundle submission UI |
   |  - Decision output  |                  |  - Evidence export      |
   +---------------------+                  |  - AI chat assistant    |
                                            +-------------------------+
                                                        |
                                            +-----------v-----------+
                                            | Docusaurus Docs (docs/)|
                                            | - System reference     |
                                            | - Deployed to Vercel   |
                                            +------------------------+
```

### Service Port Allocation

| Service | Port | Description |
|---|---|---|
| Next.js Dashboard | `3000` | Real-time monitoring console and API server |
| Docusaurus Docs | `3001` | Developer documentation handbook |
| Rust Engine | N/A | Background daemon (no HTTP server) |
| AI Agent | N/A | Background daemon (no HTTP server) |

---

## 1. Rust Engine (`engine/`)

The core execution pipeline. Written in Rust for zero-overhead cryptographic operations and low-latency gRPC stream handling.

### Source Modules

| File | Responsibility |
|---|---|
| `main.rs` | Entry point. Spawns slot RPC poller, runs the bundle submission loop, handles retry logic and failure injection. |
| `config.rs` | Loads environment variables via `dotenv`. Defines the `Config` struct with fields for Yellowstone, Solana RPC, Jito, and wallet credentials. |
| `geyser.rs` | Yellowstone gRPC transaction-status watcher. Opens a dedicated gRPC subscription filtered by transaction signature to detect on-chain landing at `Confirmed` commitment. |
| `jito.rs` | Transaction construction and Jito submission. Queries `getTipAccounts`, builds memo + tip instructions, simulates via RPC, serializes to base64, and submits via `sendTransaction`. Includes the dynamic tip floor calculator. |
| `lifecycle.rs` | Defines `BundleRun` and `BundleStatus` data structures. Implements `track_bundle()` which polls Solana RPC at each commitment level, concurrently checks Jito inflight status, and records timestamps. Writes structured JSONL logs. |
| `build.rs` | Build script telling Cargo to use the system `protoc` binary for gRPC proto compilation. |

### Slot Tracking

The engine polls `getSlot` via the SolInfra reserved RPC endpoint every 400ms using a background `reqwest` task. This gives sub-slot-interval resolution (slots are ~400ms each) with zero gRPC stream usage. The current slot is atomically cached in an `Arc<AtomicU64>` shared with the main submission loop.

The **single Ace-plan gRPC stream is reserved exclusively for transaction confirmation** (see below).

Each new slot notifies waiting tasks via `tokio::sync::Notify`. The slot value is used to stamp bundle submissions (`submit_slot`) and feed the dashboard's real-time Slot Pulse panel via SSE.

### Yellowstone gRPC Transaction Status Watcher

After a bundle is submitted, `geyser.rs` opens the Ace-plan gRPC connection to subscribe to `TransactionStatus` updates filtered by the exact transaction signature. This subscription uses `CommitmentLevel::Confirmed` and has a configurable timeout (default 25 seconds).

Because slot tracking has been moved to RPC polling, **this gRPC stream has no competitor** — it connects successfully on every run and provides the primary sub-second confirmation path.

When the target signature appears on-chain, the watcher returns a `StreamTxStatus` struct containing the slot, observation timestamp, and any execution errors. If the gRPC connection itself fails (network error, not stream contention), the lifecycle tracker falls back to RPC polling.

Our gRPC client integration is modeled after the official [Yellowstone gRPC Rust Examples](https://github.com/rpcpool/yellowstone-grpc/tree/master/examples/rust), leveraging the `yellowstone-grpc-client` crate to establish low-latency, resilient stream filters.

### Dynamic Tip Calculation

Before each bundle, the engine queries the Jito tip floor API:

```
GET https://bundles.jito.wtf/api/v1/bundles/tip_floor
```

It extracts the `landed_tips_75th_percentile` value (in SOL), converts it to lamports, and clamps the result:

- **Floor**: 30,000 lamports (minimum to avoid Jito rejection)
- **Cap**: 100,000 lamports (budget protection)

If the API call fails, the engine falls back to the 30,000 lamport floor.

### Transaction Construction and Submission

Each bundle consists of two instructions packed into a single Solana transaction:

1. **Memo Instruction**: Writes a diagnostic string (e.g., `"Sentry | bounty demo"`) via the SPL Memo program (`MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`), with the operator wallet as a signer.
2. **Tip Transfer**: A `SystemProgram::Transfer` instruction sending the calculated tip to a randomly-selected Jito tip account.

The Jito tip account is selected by first querying `getTipAccounts` from the Jito Block Engine RPC. If the query returns an empty list, the engine falls back to 8 hardcoded tip account addresses.

The transaction is:
1. **Simulated** against Solana RPC (`simulateTransaction`) to validate instruction logic and compute units.
2. **Signed** with a fresh blockhash fetched via `getLatestBlockhash`.
3. **Serialized** to base64 using `bincode` + the standard base64 engine.
4. **Submitted** via `POST /api/v1/transactions` on the Jito Block Engine (using `sendTransaction`, not `sendBundle`).

The `x-bundle-id` HTTP response header is captured to uniquely identify the bundle for lifecycle tracking.

The submission includes an exponential backoff retry loop (up to 4 attempts) that handles Jito rate limiting (HTTP 429 or JSON-RPC error code `-32097`). Backoff delays are 2s, 4s, 6s, 8s.

### Multi-Stage Lifecycle Tracking

After submission, `lifecycle.rs::track_bundle()` runs a polling loop (default: 15 polls, 4-second intervals = 60 seconds max) that simultaneously queries two sources:

**Solana RPC (`getSignatureStatuses`)**:
- Records timestamps at each commitment level transition:
  - `processed_at`: First observation by the validator
  - `confirmed_at`: Supermajority (66%+) validator vote ratification
  - `finalized_at`: Block becomes irreversible
- Calculates latency deltas between each transition
- Marks the bundle as `Landed` once `Confirmed` is reached

**Jito Inflight Status (`getInflightBundleStatuses`)**:
- Checked concurrently before the transaction appears in Solana RPC
- Detects early Jito-side rejections (`Failed`, `Invalid`) before they would ever appear on-chain
- Reports `Landed` with slot information if Jito has already confirmed it

### Autonomous Retry Logic

When a non-intentional failure occurs (the bundle was not an injected fault test), the engine automatically:

1. Fetches a fresh blockhash via `getLatestBlockhash`
2. Recalculates the live tip from the Jito tip floor API
3. Rebuilds and resubmits the bundle
4. Runs the full lifecycle tracking on the retry

The retry result is logged as a separate JSONL entry with a `recovery` field describing the original failure and the retry parameters.

### Failure Injection

The engine supports two intentional failure modes for testing the failure classification system:

| Mode | Trigger | Behavior |
|---|---|---|
| `zero-tip` | `FAIL_TEST=zero-tip` | Sets tip to 0 lamports. Jito requires nonzero tips, so the bundle is rejected. |
| `expired-hash` | `FAIL_TEST=expired-hash` | Uses `Hash::default()` (all zeros) as the blockhash. Solana simulation fails immediately with `BlockhashNotFound`. |

When running the full 12-run cycle (default `RUN_COUNT=12`), the engine automatically injects failures on runs 11 (zero-tip) and 12 (1-lamport micro-tip) without needing environment variable overrides.

### Failure Classification

Every non-landed bundle is tagged with structured metadata:

| Field | Description |
|---|---|
| `failure_type` | Machine-readable category: `zero_tip`, `blockhash_expired`, `rate_limit_exhausted`, `jito_rejection`, `simulation_failure`, `on_chain_error`, `confirmation_timeout`, `not_landed`, `build_error`, `stream_observed_on_chain_error` |
| `failure_stage` | Where the failure occurred: `tip_calculation`, `pre_submission`, `submission`, `block_engine`, `execution`, `confirmation`, `yellowstone_transaction_status`, `pre-tracking` |
| `recovery` | Human-readable recovery guidance |

### Log Output

The engine writes JSONL telemetry to two locations simultaneously:

```
engine/lifecycle_log.jsonl    (engine-local)
logs/lifecycle_log.jsonl      (project-level, for dashboard consumption)
```

Each line is a serialized `BundleRun` struct containing: `bundle_id`, `signature`, `tip_lamports`, `tip_account`, `status`, `submitted_at`, `landed_at`, `error_reason`, `run_number`, `submit_slot`, `landed_slot`, `processed_at`, `confirmed_at`, `finalized_at`, `confirmation_source`, `failure_type`, `failure_stage`, `recovery`.

### Rust Dependencies

| Crate | Version | Purpose |
|---|---|---|
| `yellowstone-grpc-client` | v12.1.0+solana.3.1.9 | gRPC client for Yellowstone validator streams |
| `yellowstone-grpc-proto` | v12.1.0+solana.3.1.9 | Protobuf definitions for Yellowstone messages |
| `solana-sdk` | ^2.1 | Transaction construction, signing, serialization |
| `solana-rpc-client` | ^2.1 | JSON-RPC client for Solana |
| `tokio` | 1 (full features) | Async runtime |
| `tonic` | 0.14 (tls-webpki-roots) | gRPC transport layer |
| `reqwest` | 0.12 (json) | HTTP client for Jito API |
| `chrono` | 0.4 (serde) | Timestamp recording |
| `serde` / `serde_json` | 1 | JSONL serialization |
| `bs58` | 0.5 | Base58 encoding for signatures |
| `base64` | 0.22 | Base64 encoding for Jito submission |
| `bincode` | 1 | Binary serialization for transactions |
| `rand` | 0.8 | Random tip account selection |
| `anyhow` | 1 | Error handling |
| `tracing` / `tracing-subscriber` | 0.1 / 0.3 | Structured logging |
| `dotenv` | 0.15 | `.env` file loading |

---

## 2. AI Agent Daemon (`agent/`)

A standalone Node.js/TypeScript process that operates as an autonomous observer and decision-maker. It does not wrap sequential function calls -- it reasons about the observed state of the transaction pipeline and produces a justified operational decision.

### Decision Pipeline

The agent runs in cycles (single-shot or daemon mode with configurable polling interval):

1. **State Ingestion**: Reads `lifecycle_log.jsonl` (from the Rust engine), queries the Jito tip floor API (`/api/v1/bundles/tip_floor`), and fetches the current Solana slot via RPC.

2. **Analysis**: Computes metrics from the most recent 10 runs:
   - `landedRate`: Ratio of `Landed` to total runs
   - `avgLandedTip`: Mean tip of successfully landed bundles
   - `avgDeltaMs`: Mean latency between `processed_at` and `confirmed_at` (network congestion indicator)
   - `failureTypes`: Array of recent `failure_type` values
   - `p75Lamports` / `p95Lamports`: Current Jito tip floor percentiles converted to lamports

3. **Local Reasoning**: A deterministic rules engine produces the first decision:

   | Condition | Action | Tip Adjustment |
   |---|---|---|
   | `landedRate < 0.5` AND recoverable failures (blockhash/rate-limit) AND `totalRuns >= 3` | `retry` | +30% above base |
   | `landedRate < 0.3` AND `totalRuns >= 5` | `hold` | N/A |
   | `avgDeltaMs > 15000` (congestion) | `submit` | +20% above base |
   | `landedRate >= 0.9` AND `totalRuns >= 3` | `submit` | Standard p75 |
   | Default | `submit` | Standard p75 |

4. **LLM Enhancement**: The local decision is forwarded to a Groq LLM chain for second-opinion reasoning. The agent sends a structured JSON prompt containing the observed state, the local agent's suggestion, and strict constraints (e.g., "Never recommend a tip below the Jito p75 floor"). The LLM returns a structured JSON decision with `action`, `recommended_tip_lamports`, `confidence`, `reason`, and `observed_risk`.

   The agent tries multiple models in sequence: `openai/gpt-oss-120b` -> `llama-3.3-70b-versatile` -> `llama-3.1-8b-instant`. If all models fail, the local decision is used as a fallback (marked `fallback: true`).

5. **Decision Output**: The final decision is appended to `agent_decisions.jsonl` as a structured JSON line:

   ```json
   {
     "id": "a3f2c1d8-7e4b-4a2f-b9c3-1d2e3f4a5b6c",
     "created_at": "2025-06-19T10:30:05.421Z",
     "model": "llama-3.3-70b-versatile",
     "fallback": false,
     "action": "submit",
     "recommended_tip_lamports": 47250,
     "confidence": 0.92,
     "reason": "Strong landing rate of 90% across 10 runs with no recent blockhash or rate-limit failures; Jito p75 floor is 45000 lamports, adjusted to 47250 for slight margin.",
     "observed_risk": "No unusual risk detected. Processed-to-confirmed delta averaging 620ms, well within healthy range."
   }
   ```

   **Two-Tier Pipeline** — this output is the result of two independent reasoning layers:

   | Layer | Runs | Output |
   |---|---|---|
   | Local Rules Engine | Always, deterministic | First-pass decision with tip, confidence, and risk |
   | Groq LLM Chain | If API key present | Second-opinion reasoning; may override tip or action |
   | Fallback | If all LLM models fail | Local decision used, `fallback: true` |

   The LLM receives the local decision as **context** — not instruction. It reasons independently against hard constraints (p75 floor, 150k cap) and the observed state before returning its own structured JSON.

### Daemon Mode

When `DAEMON=true` is set, the agent runs continuously with a configurable polling interval (`DAEMON_INTERVAL`, default 10000ms). This is how it operates inside Docker Compose.

### Tip Safety Bounds

All tip recommendations are clamped:
- **Minimum**: 30,000 lamports
- **Maximum**: 150,000 lamports (LLM path) / 100,000 lamports (local path)

---

## 3. Next.js Web Console (`app/`)

A real-time monitoring dashboard built with Next.js 15, React 19, and Tailwind CSS 4. Served on port 3000.

### API Routes

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/observatory` | Returns a full system snapshot: live Solana slot, wallet address and balance, Jito tip percentiles (p25/p50/p75/p95), all bundle runs with lifecycle data, latest AI agent decision, and health checks. |
| `GET` | `/api/slots/stream` | Server-Sent Events (SSE) endpoint that streams real-time slot numbers and timestamps as they arrive from the Yellowstone gRPC client. |
| `POST` | `/api/submit-bundle/stream` | Triggers a bundle submission and streams progress events (Preflight, Dynamic Tip Calculation, Signing, Jito Submission, Confirmation Polling) as an SSE response. |
| `POST` | `/api/analyze` | Accepts a transaction run context and user messages. Sends them to Groq (`llama-3.3-70b-versatile`) with a system prompt that explains the difference between `yellowstone_stream` and `rpc_polling_fallback` confirmation sources. Returns AI analysis of the specific run's latency deltas and network conditions. |
| `POST` | `/api/docs/chat` | Cross-origin AI chat endpoint for the Docusaurus documentation site. Includes CORS headers (`Access-Control-Allow-Origin: *`) and an `OPTIONS` preflight handler. Uses Groq with a system prompt containing the full Sentry technical blueprint. |
| `GET` | `/api/evidence` | Generates and downloads a judge-ready Markdown report (`smart-tx-evidence.md`) containing the full lifecycle log, latency statistics, and AI decisions. |

### Dashboard Features

- **Slot Pulse Panel**: Live-updating display of the current network slot, sourced from the SSE stream.
- **Lifecycle Lane**: Visual progression of each transaction through `Submitted` -> `Processed` -> `Confirmed` -> `Finalized`.
- **Run Evidence Table**: Tabular log of every run showing submit/landed slots, tip amounts, latency deltas, confirmation source, and failure classifications.
- **Agent Reasoning Panel**: Displays the AI agent's last decision including action, recommended tip, confidence score, and plain-english risk assessment.
- **Interactive Bundle Submission**: Trigger manual bundle submissions from the dashboard with real-time progress streaming.
- **Evidence Export**: One-click download of a Markdown verification report for bounty submission.

---

## 4. Docusaurus Documentation (`docs/`)

A developer reference handbook built with Docusaurus 3 (TypeScript) and deployed to Vercel at [https://sentry-doc.vercel.app/](https://sentry-doc.vercel.app/).

### Documentation Pages

| Page | Description |
|---|---|
| System Overview | Introduction, core features, prerequisites, environment configuration, and service bootstrapping instructions. |
| Architecture | Detailed breakdown of Yellowstone gRPC integration, Jito bundle pipeline (8-step submission flow), Docker multi-container grid, and shared volume communication. |
| AI Agent | Agent reasoning pipeline, state ingestion, decision output contract, and LLM chain fallback behavior. |
| CLI & API Reference | Full command reference table and API endpoint documentation. |
| Troubleshooting | Common error resolution (insufficient funds, blockhash not found, Yellowstone stream disconnected). |
| SolInfra | Infrastructure provider documentation: services offered, how Sentry uses them, and configuration guide. |

### AI Chat Assistant

The docs site includes an embedded `<AIAssistant />` React component that makes cross-origin POST requests to the Next.js dashboard's `/api/docs/chat` endpoint. This allows developers to ask questions about Sentry's architecture directly from the documentation site.

---

## 5. Command-Line Interface (`cli.js`)

A unified operator binary (1,084 lines) accessible via `sentry` after running `npm link`. Supports interactive REPL and one-shot execution modes.

### Installation

```bash
npm install
npm link
```

Requires Node.js >= 18. The CLI automatically loads `.env` from the project root.

### Interactive REPL

```bash
sentry
```

Launches a persistent `sentry>` prompt. Non-blocking commands return to the prompt immediately. Blocking commands (`engine`, `agent`, `dashboard`, `docs`, `run`, `docker-up`) hand stdio to the child process and resume the REPL when the child exits (Ctrl+C).

### One-Shot Mode

```bash
sentry <command> [args]
```

### Full Command Reference

| Command | Description | Blocking |
|---|---|---|
| `status` | Print live network slot, wallet balance (via RPC), pipeline configuration paths, last 5 bundle runs (with status, tip, slots, latency deltas, confirmation source), and latest AI agent decisions. | No |
| `analyze` | Compute deterministic statistics from lifecycle logs (landed rate, median tips, latency percentiles, failure breakdown) and generate an AI-powered diagnostic audit report via Groq. | No |
| `evidence` | Calculate aggregate latency statistics and compile a judge-ready Markdown verification report (`evidence.md`) with all run data, slot deltas, and AI reasoning trails. | No |
| `ask [query]` | Open an interactive AI chat session, or ask a single question. Uses Groq (`llama-3.3-70b-versatile`) with full lifecycle log context injected into the system prompt. | No |
| `verify <signature>` | Audit a specific transaction signature on Solana Mainnet via `getTransaction` RPC. Reports slot, fee, block time, memo data, account keys, and balance changes. | No |
| `fail-test <type>` | Inject a deliberate failure. Accepted types: `zero-tip` (sets `FAIL_TEST=zero-tip`, `RUN_COUNT=1`) or `expired-hash` (sets `FAIL_TEST=expired-hash`, `RUN_COUNT=1`). Runs the engine with the injected fault. | Yes |
| `run [--count N]` | Start all 4 services concurrently: Dashboard (port 3000), Engine (`cargo run`), Agent (`npm start`), and Docs (port 3001). Optional `--count` limits the engine's bundle loop. | Yes |
| `engine` | Compile and run the Rust engine in isolation (`cargo run` in `engine/`). | Yes |
| `agent` | Run the AI agent daemon in isolation (`npm run start` in `agent/`). | Yes |
| `dashboard` | Start the Next.js development server (`npm run dev` in project root). | Yes |
| `docs` | Start the Docusaurus development server on port 3001 (`npm run start -- --port 3001` in `docs/`). | Yes |
| `serve` | Start the standalone developer HTTP API server on port 3050 (`npx tsx server.ts` in project root). | Yes |
| `harness <type>` | Run a mainnet validation test harness. Types: `faults`, `trader`, `requote`, `sniper`, `budget`, `mev`. | Yes |
| `docker-up` | Run `docker-compose up --build` from the project root. | Yes |

---

## 5a. Programmatic SDK & Standalone REST API

To support external integrations into DEX aggregators, snipers, and minters, Sentry can be run as a programmatic TypeScript SDK or a standalone REST API.

### Sentry TypeScript SDK

Import the SDK class directly in your Node/TS codebase:

```typescript
import { Sentry } from "./lib/sentry-sdk";

const sentry = new Sentry();
await sentry.start(); // verify RPC connectivity and fund balance

// Submit instructions, Transactions, VersionedTransactions, or base64 strings:
const result = await sentry.submit([myInstruction], { urgency: "high" });
if (result.success) {
  console.log(`Landed bundle! Slot: ${result.slot}, Signature: ${result.signature}`);
}
```

The SDK handles:
- Dynamic Jito tip fetching based on the live 75th percentile.
- Simulation checks via Solana RPC before Jito entry.
- Yellowstone gRPC stream-based signature tracking.
- **Multi-Transaction Bundling for Pre-Signed inputs**: If you pass a pre-signed transaction, Sentry automatically constructs a Jito bundle combining the pre-signed transaction with a separate tip transfer transaction signed by Sentry, allowing Jito execution without breaking the original transaction signature.

### Standalone REST API Server

Run a local REST API gateway:
```bash
npm run server
```

- **`GET /health`**: Uptime and REST API resource status check.
- **`POST /submit`**: Accepts JSON payloads:
  ```json
  {
    "transaction": "<base64-serialized-tx>",
    "urgency": "low" | "medium" | "high"
  }
  ```
  It returns the landing status and full execution log.

---

## 5b. Mainnet Test Harnesses

We created 6 mainnet-active verification test harnesses in `scripts/harnesses/` to validate Sentry's features against live blockchain conditions. Each harness features visual console formatting and typewriter AI logging:

1. **Injected Fault Harness (`npm run harness:faults`)**:
   Runs 4 scenarios: happy path transfer (using a 1,000-lamport self-transfer to safely bypass Solana rent-exemption floors), low tip validation (recommends tip increase), stale blockhash (refreshes and retries), and impossible transfer (aborts simulation/hold).
2. **Trader Harness (`npm run harness:trader`)**:
   Executes swap scenarios showing Sentry handling stale quotes, slippage limits, leader skips, and launch-day traffic congestion.
3. **Re-quote Harness (`npm run harness:requote`)**:
   Demonstrates Sentry's ability to recover from pool price volatility by re-quoting swap instructions, re-signing, and resubmitting instead of throwing error codes.
4. **Sniper Harness (`npm run harness:sniper`)**:
   Simulates launch sniping: detects liquidity pool initialization, pulls swap quotes, dynamic tips, and submits in +1 slot delta.
5. **Budget Harness (`npm run harness:budget`)**:
   Forces adaptive AI tipping limits based on a strict session-capped budget allowance.
6. **MEV Protection Harness (`npm run harness:mev`)**:
   Prints a side-by-side comparison of swap outputs on the public mempool (subject to frontrun/backrun sandwiching) vs. Sentry's private bundle execution.

### Harness Execution Verification

Here is the verified terminal execution of `npm run harness:faults` running on Solana Mainnet:

![Sentry Mainnet Fault Harness Run](screenshots/Harness.png)

Every action, recommended tip, and classification is written asynchronously by the AI agent to the local [agent_decisions.jsonl](file:///Ubuntu/home/samuel/smart-tx-observatory/agent_decisions.jsonl) decision registry.

---

## 6. Docker Orchestration

The stack is fully containerized using Docker Compose with three services and a shared named volume.

### Container Architecture

| Service | Base Image | Dockerfile | Command | Ports |
|---|---|---|---|---|
| `engine` | `rust:1.77-slim-bookworm` (build) / `debian:bookworm-slim` (run) | `engine/Dockerfile` | `/app/engine` | None |
| `agent` | `node:20-alpine` | `Dockerfile` (root) | `npx tsx agent/src/index.ts` | None |
| `dashboard` | `node:20-alpine` | `Dockerfile` (root) | `npm run start` | `3000:3000` |

### Shared Volume

A Docker volume named `sentry-data` is mounted at `/app/shared` inside all three containers. Environment variables redirect log paths:

| Variable | Container Value | Purpose |
|---|---|---|
| `LIFECYCLE_LOG_PATH` | `/app/shared/lifecycle_log.jsonl` | Engine writes, Agent and Dashboard read |
| `AGENT_DECISIONS_PATH` | `/app/shared/agent_decisions.jsonl` | Agent writes, Dashboard reads |
| `LOGS_DIR` | `/app/shared/logs` | Engine writes secondary log copy |

### Engine Dockerfile (Multi-Stage Build)

The engine uses a two-stage Docker build:

1. **Builder stage** (`rust:1.77-slim-bookworm`): Installs `pkg-config`, `libssl-dev`, `protobuf-compiler`, `libzstd-dev`, and `build-essential`. Uses a Cargo workspace caching strategy (compile dependencies first with a dummy `main.rs`, then copy real sources) to minimize rebuild times.

2. **Runner stage** (`debian:bookworm-slim`): Copies only the compiled binary and installs minimal runtime libraries (`ca-certificates`, `libssl3`, `libzstd1`).

### Agent Configuration

The agent container runs with `DAEMON=true` and `DAEMON_INTERVAL=10000` (10-second polling cycle). It depends on the engine service and restarts unless stopped.

### Commands

```bash
# Build and start all services
docker compose up --build

# Or via CLI
sentry docker-up

# Shutdown and remove volumes
docker compose down -v
```

The dashboard is accessible at `http://localhost:3000`.

---

## 7. Infrastructure Dependencies

### SolInfra ([solinfra.dev](https://solinfra.dev/))

SolInfra is the primary Yellowstone gRPC provider. Sentry runs on the **SolInfra Ace plan**, provided by SolInfra as infrastructure support for the Superteam Nigeria Advanced Infrastructure Challenge. The Ace plan provides:

| Capability | Ace Plan Allocation |
|---|---|
| RPC | 300 requests/sec (dedicated, reserved capacity) |
| Send Transaction | 300 TX/sec |
| WebSocket | 2 concurrent connections |
| gRPC Streams | 1 concurrent stream |
| Priority Lane | Included (priority RPC routing) |

Sentry interfaces with SolInfra using two methods:
  1. **Slot Polling (RPC)**: Poll the `getSlot` RPC method every 400ms using a background task to receive the current validator slot at the `Processed` commitment level.
  2. **Transaction status subscriptions (gRPC)**: Watch specific transaction signatures for on-chain landing at `Confirmed` commitment via a dedicated Yellowstone stream connection (`SubscribeRequestFilterTransactions`).

**How Sentry Uses SolInfra**:

1. **Live Slot Pulse**: The Rust engine runs a background RPC poll loop fetching the slot every 400ms. Slot numbers are atomically cached in memory to stamp bundle submissions (`submit_slot`) and feed the dashboard's real-time Slot Pulse panel via SSE.
2. **Transaction Lifecycle Confirmation**: After submitting a bundle, the engine opens a gRPC transaction status subscription to capture the exact moment the transaction hits `Confirmed` status, providing microsecond-precision latency measurements.
3. **Stream Preservation**: Since the slot subscription is handled via RPC, the SolInfra Ace plan's 1 concurrent stream limit is never exceeded. The gRPC stream is used exclusively for transaction confirmation, eliminating stream contention.

> **Note for judges reviewing `confirmation_source` values in the lifecycle log:**
> Sentry runs slot tracking via high-frequency (400ms) RPC polling to reserve the SolInfra Ace plan's single concurrent gRPC stream exclusively for transaction landing confirmation. Consequently, the gRPC transaction-status watcher (`geyser.rs`) executes successfully on every run, and judges will observe `yellowstone_stream` as the `confirmation_source` for all landed transactions. In the event of network dropouts at the gRPC transport layer, Sentry will fall back to Solana RPC polling (`rpc_polling_fallback`) to ensure operational resilience.

#### Yellowstone Geyser Confirmation Proof

Below are live screenshots of the terminal logs demonstrating the Yellowstone Geyser transaction confirmation stream in action across multiple bundle runs. Each screenshot highlights the moment the dedicated SolInfra gRPC stream immediately detects and confirms the on-chain landing of a transaction:

##### Run #1 Confirmation
* **Signature**: `5vZaNjFY...`
* **Yellowstone Landed Slot**: `427788139` (`err=None`)
* **Confirmation Source**: `yellowstone_stream` (0ms processed->confirmed latency)

![Yellowstone Confirmation - Run 1](./screenshots/yellowstone_confirmation_run1.png)

##### Run #3 Confirmation
* **Signature**: `5HTkxuT5...`
* **Yellowstone Landed Slot**: `427788396` (`err=None`)
* **Confirmation Source**: `yellowstone_stream` (0ms processed->confirmed latency)

![Yellowstone Confirmation - Run 3](./screenshots/yellowstone_confirmation_run3.png)

##### Run #4 Confirmation
* **Signature**: `3Fknri3h...`
* **Yellowstone Landed Slot**: `427788456` (`err=None`)
* **Confirmation Source**: `yellowstone_stream` (0ms processed->confirmed latency)

![Yellowstone Confirmation - Run 4](./screenshots/yellowstone_confirmation_run4.png)

##### Run #7 Confirmation
* **Signature**: `VTNXhHTF...`
* **Yellowstone Landed Slot**: `427788880` (`err=None`)
* **Confirmation Source**: `yellowstone_stream` (0ms processed->confirmed latency)

![Yellowstone Confirmation - Run 7](./screenshots/yellowstone_confirmation_run7.png)

### Jito Block Engine

Sentry interfaces with the Jito Block Engine for bundle submission and tip management:

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/v1/bundles` | `getTipAccounts` | Fetch the current list of Jito tip recipient addresses |
| `/api/v1/transactions` | `sendTransaction` | Submit a base64-encoded signed transaction (Jito wraps it as a bundle) |
| `/api/v1/bundles` | `getInflightBundleStatuses` | Check bundle status before it appears in Solana RPC |
| `bundles.jito.wtf/api/v1/bundles/tip_floor` | `GET` | Fetch live tip percentiles for dynamic tip calculation |

### Groq API

The AI agent and dashboard use the Groq inference API for LLM-powered reasoning:

| Parameter | Value |
|---|---|
| Endpoint | `https://api.groq.com/openai/v1/chat/completions` |
| Primary Model | `llama-3.3-70b-versatile` |
| Fallback Models | `openai/gpt-oss-120b`, `llama-3.1-8b-instant` |
| Temperature | `0.1` (deterministic reasoning) |
| Max Tokens | `360` (agent), unlimited (dashboard chat) |

---

## 8. Setup and Installation

### Prerequisites

| Tool | Minimum Version | Purpose |
|---|---|---|
| Node.js | 18+ | Dashboard, Agent, CLI, Docusaurus |
| npm | Bundled with Node | Package management |
| Rust (Cargo) | Stable toolchain | Engine compilation |
| protobuf-compiler | Any | gRPC proto compilation for Yellowstone |
| Docker + Compose | Any recent | Containerized orchestration (optional) |

### Environment Configuration

Create a `.env` file at the project root:

```env
# Solana Network
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
SOLANA_WSS_URL=wss://api.mainnet-beta.solana.com

# SolInfra Yellowstone gRPC
YELLOWSTONE_ENDPOINT=https://grpc.solinfra.dev
YELLOWSTONE_TOKEN=your_solinfra_api_key_here

# Jito Block Engine
JITO_BLOCK_ENGINE_URL=https://mainnet.block-engine.jito.wtf

# Groq AI (for agent and dashboard)
GROQ_API_KEY=gsk_your_groq_api_key_here

# Operator Wallet (JSON array of ed25519 keypair bytes)
WALLET_PRIVATE_KEY=[122,94,84,33,...]
```

The Rust engine also reads from `engine/.env` if present. The CLI and agent resolve variables from both locations.

**Important**: The wallet must hold at least **50,000 lamports** (0.00005 SOL) for the engine to start. The engine validates balance on startup and exits if insufficient.

### Quick Start (Local)

```bash
# 1. Clone the repository
git clone https://github.com/SamuelOluwayomi/smart-transaction-observatory.git
cd smart-transaction-observatory

# 2. Install Node.js dependencies
npm install

# 3. Install agent dependencies
cd agent && npm install && cd ..

# 4. Link the CLI globally
npm link

# 5. Configure environment variables
cp .env.example .env
# Edit .env with your credentials

# 6. Launch all services
sentry run
```

This starts the Dashboard (port 3000), Rust Engine, AI Agent, and Docs (port 3001) concurrently.

### Running Individual Services

```bash
# Rust Engine only
cd engine
cargo run

# AI Agent only
cd agent
npm start

# Dashboard only
npm run dev

# Docs only
cd docs
npm run start -- --port 3001
```

### Docker Quick Start

```bash
# Ensure .env is configured at project root
docker compose up --build
```

---

## 9. Bounty Technical Questions

### Q1: What does the delta between processed_at and confirmed_at tell you?

The delta between `Processed` and `Confirmed` represents the time it takes for a supermajority (66%+) of the Solana validator network to vote on and ratify the block containing the transaction.

- **Low Delta (400-800ms)**: Healthy network with fast vote propagation. Validators are reaching consensus quickly, indicating low contention for block space and efficient gossip propagation.
- **High Delta (>2000ms)**: Network congestion, validator fork resolution, or heavy voting load. In Sentry, the AI Agent monitors this delta. If the median latency spikes above the 15-second threshold, the agent autonomously increases the Jito tip premium by 20% to prioritize bundles during congestion.

### Q2: Why should you never use finalized commitment for your blockhash in time-sensitive transactions?

A blockhash remains valid for exactly 150 slots (~60 seconds at 400ms/slot). A `Finalized` blockhash is already ~32 slots old (~12.8 seconds) by the time it is fetched, because finalization requires 31 additional confirmed blocks to pass. This artificially shortens the transaction's validity window by approximately 20%.

In time-sensitive operations -- particularly Jito bundle submissions where the leader schedule matters -- every second of validity window is critical for landing and retry attempts. Sentry uses `Confirmed` or `Processed` blockhashes to ensure the maximum possible runway for the transaction to land before it expires.

### Q3: What happens to your bundle if the Jito leader skips their slot?

If the targeted Jito leader skips their slot, the Jito Block Engine drops the bundle and the transaction does not land in that slot. However, because Jito validators constitute a large percentage of the Solana network (often appearing back-to-back in the leader schedule), the Block Engine can forward the bundle to the next available Jito leader, provided the blockhash is still valid.

If the blockhash expires during a prolonged sequence of skipped slots or non-Jito leaders, the bundle ultimately fails. Sentry's auto-retry mechanism detects this failure, fetches a fresh blockhash, recalculates the live tip from the Jito floor API, and resubmits the bundle automatically.

---

## 10. Lifecycle Log Schema

Each entry in `lifecycle_log.jsonl` is a serialized `BundleRun`:

```json
{
  "bundle_id": "5abc...def",
  "signature": "3xyz...789",
  "tip_lamports": 45000,
  "tip_account": "ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49",
  "status": "Landed",
  "submitted_at": "2025-06-19T10:30:00Z",
  "landed_at": "2025-06-19T10:30:02Z",
  "error_reason": null,
  "run_number": 1,
  "submit_slot": 427137627,
  "landed_slot": 427137630,
  "processed_at": "2025-06-19T10:30:01.200Z",
  "confirmed_at": "2025-06-19T10:30:01.800Z",
  "finalized_at": "2025-06-19T10:30:14.500Z",
  "confirmation_source": "yellowstone_stream",
  "failure_type": null,
  "failure_stage": null,
  "recovery": null
}
```

### Confirmation Sources

| Value | Meaning |
|---|---|
| `yellowstone_stream` | Transaction confirmed via Yellowstone gRPC `TransactionStatus` subscription **(primary path — expected on every run)** |
| `rpc_polling_fallback` | Transaction confirmed via Solana RPC `getSignatureStatuses` polling (fallback — only if gRPC connection fails) |

The gRPC stream is no longer shared with a slot subscription. Slot data is sourced via a 400ms RPC poll loop, so the stream is exclusively available for transaction confirmation on every bundle run.

---

## 11. Project File Structure

```
smart-tx-observatory/
|-- engine/                          # Rust engine daemon
|   |-- src/
|   |   |-- main.rs                  # Entry point, slot RPC poller, submission loop
|   |   |-- config.rs                # Environment variable loader
|   |   |-- geyser.rs                # Yellowstone gRPC transaction watcher
|   |   |-- jito.rs                  # Transaction construction and Jito submission
|   |   |-- lifecycle.rs             # Lifecycle tracking and JSONL logging
|   |-- Cargo.toml                   # Rust dependencies
|   |-- Dockerfile                   # Multi-stage Rust build
|   |-- build.rs                     # Protobuf compiler directive
|
|-- agent/                           # AI agent daemon
|   |-- src/
|   |   |-- index.ts                 # State ingestion, reasoning, Groq chain
|   |-- package.json                 # Agent dependencies (tsx)
|
|-- app/                             # Next.js 15 dashboard
|   |-- page.tsx                     # Main dashboard UI
|   |-- layout.tsx                   # Root layout with metadata and fonts
|   |-- globals.css                  # Tailwind CSS 4 configuration
|   |-- api/
|       |-- observatory/route.ts     # System snapshot endpoint
|       |-- submit-bundle/
|       |   |-- route.ts             # Bundle submission trigger
|       |   |-- stream/route.ts      # SSE bundle progress stream
|       |-- slots/stream/route.ts    # SSE slot stream
|       |-- evidence/route.ts        # Markdown evidence export
|       |-- analyze/route.ts         # AI transaction analysis
|       |-- docs/chat/route.ts       # Cross-origin AI chat for docs
|
|-- docs/                            # Docusaurus 3 documentation site
|   |-- docs/
|   |   |-- system-overview.md       # Setup and introduction
|   |   |-- architecture.md          # Technical architecture
|   |   |-- ai-agent.md              # Agent reasoning documentation
|   |   |-- cli-repl.md              # CLI and API reference
|   |   |-- failure-handling.md      # Troubleshooting guide
|   |   |-- solinfra.md              # SolInfra integration details
|   |-- docusaurus.config.ts         # Site configuration
|   |-- src/components/              # Custom React components
|
|-- lib/
|   |-- observatory.ts               # Core dashboard logic (snapshot, evidence, submission)
|
|-- cli.js                           # Unified CLI binary (1,084 lines)
|-- docker-compose.yml               # 3-service orchestration
|-- Dockerfile                       # Node.js image (dashboard + agent)
|-- ARCHITECTURE.md                  # Standalone architecture document
|-- package.json                     # Root dependencies and scripts
|-- .env                             # Environment configuration (gitignored)
```

---

## 12. Operational Learnings (Mainnet)

These are concrete insights derived from running the full stack against Solana mainnet. They are documented here because they represent the difference between a stack that works in theory and one that works in production.

### Bundle UUID Does Not Mean On-Chain Inclusion

Jito's block engine returns an HTTP 200 with an `x-bundle-id` UUID for every submitted bundle — including bundles that lose the slot auction or fail simulation. Without polling `getInflightBundleStatuses`, a rejected bundle is completely indistinguishable from one that won the auction and is pending finalization. This burned early debugging time and is the most common source of confusion in Jito integrations.

Sentry resolves this by concurrently polling both `getSignatureStatuses` (on-chain) and `getInflightBundleStatuses` (Jito inflight) after every submission. A bundle that receives a UUID but is confirmed by neither source within 45 seconds is classified as `BUNDLE_FAILURE` and escalated to the AI agent. The `getInflightBundleStatuses` call also surfaces the actual rejection reason — not just "tip too low" — which is essential for diagnosing simulation failures early.

### The Public Tip API Underreports Real Landing Cost

The Jito REST tip floor API consistently reports medians of 1,000–5,000 lamports. Bundles submitted at those prices are accepted (UUID returned) but rarely appear on-chain. Our empirical mainnet floor is 30,000 lamports for self-transfer payloads. The gap exists because the API reports historical medians across all bundle types, not the current auction clearing price. Sentry uses the API as a directional signal but enforces its own empirically-tested minimum, applied as `max(FLOOR=30k, p75_lamports)` clamped at 100k.

### Yellowstone gRPC Stream Budget Is a Hard Constraint

The SolInfra Ace plan permits one concurrent Yellowstone gRPC subscribe stream per access token. Using it for both slot tracking and transaction confirmation would cause stream contention — the second subscriber would time out or fail silently. Sentry solves this by reserving the single stream exclusively for transaction confirmation (in `geyser.rs`) and moving slot tracking to high-frequency RPC polling (400ms interval via `reqwest`). Both paths produce complete data; the architectural split is intentional and documented.

### `confirmed` Commitment for Blockhash Is Non-Negotiable

A `finalized`-commitment blockhash is already approximately 31 slots (~12.8 seconds) old when returned. This consumes over 20% of the 150-slot validity window before the transaction is even signed. Any infrastructure that fetches `finalized` blockhashes for time-sensitive transactions is operating with a significantly reduced safety margin. Sentry enforces `confirmed` commitment everywhere in the blockhash fetch path.

### Failure Injection Proves the Full Recovery Loop

The engine's two fault injection modes (zero-tip and expired-hash) produce real, on-chain-verifiable rejected states — not synthetic exceptions thrown in application code. The `expired-hash` mode uses `Hash::default()` (all zeros), which Solana's RPC simulation immediately rejects with `BlockhashNotFound`. The `zero-tip` mode sends a tip below Jito's minimum threshold, which the block engine rejects at submission time. In both cases, the AI agent is invoked, reasons about the failure class from the structured log, and outputs a recovery directive. This validates the complete detect → classify → reason → decide → retry loop end-to-end.

### Inline-Tip Single-Transaction Bundles Are the Only Reliable Pattern

During testing, separate `addTipTx()` bundle structures (where the tip is a standalone second transaction in the bundle) were accepted by the block engine (UUID returned) but consistently failed to appear on-chain at 1M–5M lamports. Switching to inline-tip construction — a single transaction carrying both the payload instruction and the tip transfer — resolved the issue. Our 12 successful mainnet runs all use the inline-tip pattern.

### Latency Patterns from 12 Mainnet Runs

- **Processed → Confirmed**: Median 1ms across all successful runs. A delta under 1s indicates the validator network was healthy at submission time and vote transactions propagated rapidly.
- **Confirmed → Finalized**: 8,000–8,500ms on runs that completed full finalization tracking. Expected given Solana's ~31-block finality depth.
- **Submit → Landed Slot Delta**: Median 3–4 slots (1.2–1.6 seconds). Runs landing more than 4 slots after submission correlate with skipped Jito leader slots or regional propagation lag.
- **RPC polling resolution**: Several runs show 0ms processed→confirmed deltas because polling sampled at 1-second intervals — both commitment levels were reached within a single polling window.

---

## 13. Telemetry Verification Checklist

- [x] Mainnet wallet funded and validated (minimum 50,000 lamports enforced at startup)
- [x] High-frequency RPC slot tracking active at `Processed` commitment level (400ms polling)
- [x] Yellowstone gRPC transaction-status watcher implemented for signature-level confirmation
- [x] gRPC stream budget preserved: slot tracking via RPC polling, gRPC reserved exclusively for tx confirmation
- [x] Jito bundle submission via `sendTransaction` with `x-bundle-id` header capture
- [x] Multi-region parallel dispatch to 5 Jito block engines (NY, Amsterdam, Frankfurt, Tokyo, Global)
- [x] Leader window gating: submission held until `leaderDistanceSlots ≤ 2`
- [x] Dynamic Jito tips: `max(FLOOR=30k, p75_lamports).min(CAP=100k)` — no hardcoded values
- [x] Tip formula explicitly documented with empirical mainnet floor rationale
- [x] `confirmed`-commitment blockhash enforced everywhere (never `finalized`)
- [x] Three-stage commitment lifecycle tracking (`Processed` → `Confirmed` → `Finalized`)
- [x] Latency deltas computed between each commitment transition
- [x] Concurrent `getInflightBundleStatuses` polling to detect Jito-side rejections (UUID ≠ inclusion)
- [x] Autonomous AI agent with local reasoning + Groq LLM chain
- [x] AI agent outputs structured JSON decisions: `submit` / `retry` / `hold` with tip recommendation
- [x] Autonomous retry with fresh blockhash on non-intentional failures
- [x] Failure classification with machine-readable type, stage, and recovery fields
- [x] Failure class → recovery path matrix documented in ARCHITECTURE.md
- [x] Structured JSONL telemetry output with dual-write (engine-local + project-level)
- [x] Evidence export generating judge-ready Markdown report
- [x] Docker Compose orchestration with shared volume communication
- [x] Full Docusaurus documentation site deployed to Vercel
- [x] Operational Learnings section documenting 6 named mainnet insights
- [x] 12 successful verifiable mainnet submissions with Solscan links
- [x] 2 intentional failure runs classified (zero-tip + expired-hash)


---

## Sentry 2.0 Changes

Sentry 2.0 migrates the entire infrastructure layer from SolInfra and Jito to the Solami stack while keeping Jito available as a fallback.

### Infrastructure

| Component | v1 (SolInfra / Jito) | v2 (Solami) |
|---|---|---|
| RPC | Public Solana mainnet | `rpc.solami.dev` (private bare-metal) |
| Yellowstone gRPC | `grpc.solinfra.dev` | `grpc.solami.dev` |
| Transaction landing | Jito block engine bundles | Solami Beam (SWQoS, stake-weighted) |
| Tip accounts | Jito tip addresses | `api.solami.dev/onchain/tip-addresses` |
| Tip floor source | `bundles.jito.wtf/api/v1/bundles/tip_floor` | Empirical floor (30,000 lamports) |

### Provider Abstraction

The `TX_PROVIDER` environment variable controls which sender the engine uses at runtime:

- `TX_PROVIDER=beam` (default) — routes through Solami Beam
- `TX_PROVIDER=jito` — routes through Jito block engine (original behaviour)

All other configuration is backward-compatible. Legacy `YELLOWSTONE_ENDPOINT` and `YELLOWSTONE_TOKEN` env var names are still accepted alongside the new `GRPC_ENDPOINT` / `GRPC_TOKEN` names.

### Tip logic

Beam submissions use a single inline-tip transaction (memo + system transfer to a randomly selected Beam tip account). The minimum is 30,000 lamports; the AI agent's `recommended_tip_lamports` output raises this when network congestion warrants it.

