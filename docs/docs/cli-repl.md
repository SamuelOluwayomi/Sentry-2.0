---
sidebar_position: 4
---
# CLI & API Reference

## 5. Sentry CLI & REPL
Sentry comes packaged with a command-line binary. Once linked globally with `npm link`, it can be run using the `sentry` command.

### Operator CLI Reference
Sentry CLI supports one-shot command execution for dev scripting and automated cron tasks:

| Command | Description |
|---|---|
| `sentry run` | Launches all daemon processes concurrently (Dashboard, Engine, and Agent). Supports `--count [N]` parameter. |
| `sentry status` | Displays live node slot, wallet balances, and summaries of recent bundle submissions. |
| `sentry analyze` | Performs a mathematical audit of transaction logs and generates an AI operator summary. |
| `sentry fail test [type]` | Injects deliberate transaction failures (`zero tip` or `expired blockhash`) into the logs. |
| `sentry verify [sig]` | Audits a specific transaction signature directly on the Solana Mainnet blockchain. |
| `sentry evidence` | Calculates latency statistics and compiles a judge-ready markdown verification report. |
| `sentry serve` | Starts the standalone developer HTTP API server on port 3050 (`npx tsx server.ts`). |

### Interactive REPL Console
Executing `sentry` without any arguments drops the operator into a persistent shell. This prevents the command loop from closing after execution, keeping services running and allowing subsequent command invocations:

```bash
$ sentry
  S E N T R Y
  Advanced Infrastructure Challenge | Superteam Nigeria

Interactive Operator Console — type 'help' for commands, 'exit' to quit

sentry> status
- Live Network Slot: 427137627
- Wallet Balance: 0.001863 SOL
sentry> exit
```

## 7. Next.js Dashboard API Reference

Sentry exposes local API endpoints inside the Next.js router. These allow external interfaces to fetch real-time infrastructure data:

### GET `/api/observatory`
Returns the system's operational health, wallet balance, recent runs, Jito floor percentiles, and the last decision computed by the AI agent.

### GET `/api/slots/stream`
Exposes a Server-Sent Events (SSE) connection that streams network slots and timestamps as they arrive from the Yellowstone gRPC client.

### POST `/api/submit-bundle/stream`
Triggers the execution of a bundle on the Rust engine. It streams progress events (Preflight, Dynamic Tip Calculation, Signing, Jito Submission, Confirmation Polling) directly to the console terminal in the dashboard.

---

## 8. Developer Standalone REST API Reference (Port 3050)

Sentry includes a native standalone developer HTTP gateway (run via `sentry serve` or `npm run server`) to submit transactions programmatically from any external programming language or script:

### GET `/health`
Returns system, network node, and validator stream connectivity status.

### POST `/submit`
Accepts a JSON payload to submit a transaction via the Jito execution pipeline:
* **Body parameters**:
  * `transaction` (string): The base64-serialized transaction.
  * `urgency` (string, optional): One of `"low"`, `"medium"`, or `"high"`. Maps to Jito tip percentiles.
* **Response**:
  Returns a JSON execution receipt:
  ```json
  {
    "success": true,
    "signature": "5nK...",
    "bundleId": "f78...",
    "slot": 429724784
  }
  ```

---

## 9. Programmatic TypeScript SDK Reference (`lib/sentry-sdk.ts`)

For native Node.js and TypeScript integrations, developers can import Sentry directly to execute transactions with built-in telemetry:

```typescript
import { Sentry } from "./lib/sentry-sdk";

const sentry = new Sentry();
await sentry.start(); // Warmed up RPC & verified hot wallet balance

// Submit instructions, unsigned Transactions, or pre-signed Transactions:
const result = await sentry.submit([instruction], { urgency: "medium" });
if (result.success) {
  console.log(`Landed! Slot: ${result.slot}, Signature: ${result.signature}`);
} else {
  console.log(`Failed: ${result.error}`);
}
```
