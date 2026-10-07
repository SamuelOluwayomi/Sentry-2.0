---
sidebar_position: 9
---
# CLI, SDK & REPL Reference

## 1. Operator CLI Commands

Sentry 2.0 provides an extensive suite of command-line tools for development, automated operations, and audit verification:

| Command | Description |
| :--- | :--- |
| `npm run check:live` | 5-second diagnostic probing Solami RPC, Beam tip API, wallet rent reserve, and keypair signing. |
| `npm run monitor` | Real-time autonomous monitor streaming live slots and dynamic Solami Beam tips. |
| `npm run benchmark:mainnet` | Executes the 100-run live Mainnet-Beta benchmark matrix. |
| `npm run benchmark:devnet` | Executes the 1,020-run fault-injected Devnet stress matrix. |
| `npm run replay -- --run N [--mainnet]` | Deterministically replays any specific run from the cryptographic ledger. |
| `npm run server` | Starts the standalone developer HTTP gateway on port 3050 (`npx tsx server.ts`). |
| `npm run dev` | Launches the Next.js 16 Web Observatory on `localhost:3000`. |

---

## 2. 5-Second Live Diagnostic (`npm run check:live`)

Run this command to verify environment health against live Solana Mainnet-Beta:

```bash
$ npm run check:live

========================================================================
 SENTRY 2.0: 5-SECOND LIVE MAINNET DIAGNOSTIC CHECK
========================================================================
 Target Network:  Solana Mainnet-Beta
 RPC Endpoint:    https://rpc.solami.dev/sol
 Cluster Check:   Verified Mainnet-Beta (Slot 454129841)
 Solami Beam:     https://beam.solami.dev:11000 [ONLINE]
 Tip API:         https://api.solami.dev/onchain/tip-addresses [REACHABLE]
 Wallet Balance:  2,139,280 lamports (0.002139 SOL)
 Rent Floor:      650,240 lamports (SIMD-0047 protected)
 Usable Balance:  1,489,040 lamports (0.001489 SOL)
 Cuckoo Filter:   Active (Sub-50ns Preflight Deduplication)
 Engine Signing:  Ed25519 (TweetNaCl) [VERIFIED]
========================================================================
STATUS: ALL SYSTEMS OPERATIONAL (0 ERRORS DETECTED)
```

---

## 3. Developer REST API Reference (Port 3050)

When running the standalone server (`npm run server`), Sentry exposes REST endpoints on port 3050:

### `GET /health`
Returns system status, active network slot, Solami Beam endpoint status, and wallet balance.

### `POST /submit`
Submits a raw transaction through Sentry's execution pipeline:
```json
{
  "transaction": "<base64-encoded-transaction>",
  "urgency": "high"
}
```
Response:
```json
{
  "success": true,
  "signature": "2H96Sus...",
  "slot": 454129850,
  "rail": "solami_beam_swqos",
  "tipLamports": 5507
}
```

---

## 4. Programmatic TypeScript SDK (`lib/sentry-sdk.ts`)

Developers can embed Sentry directly into their Node.js applications:

```typescript
import { Sentry } from "./lib/sentry-sdk";

const sentry = new Sentry();
await sentry.start();

// Submit instructions or transactions with automatic Beam SWQoS prioritization
const result = await sentry.submit([swapInstruction], { urgency: "high" });

if (result.success) {
  console.log(`Transaction Landed! Signature: ${result.signature}, Slot: ${result.slot}`);
} else {
  console.error(`Execution Failed: ${result.error}`);
}
```
