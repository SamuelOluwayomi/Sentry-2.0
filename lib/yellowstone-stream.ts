// Sentry 2.0 -- Yellowstone gRPC TypeScript Client
// Connects to Solami Yellowstone gRPC firehose and feeds real confirmed
// transactions into the event engine as canonical SentryEvents.

import Client, { CommitmentLevel } from '@triton-one/yellowstone-grpc';
import type { SubscribeRequestFilterTransactions } from '@triton-one/yellowstone-grpc';
import { EventEmitter } from 'node:events';
import { fromYellowstoneMessage } from './event-engine';
import type { SentryEvent } from './types';

let streamRunning = false;
let _streamHealthy = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY_MS = 30_000;

export const yellowstoneEmitter = new EventEmitter();

export function isYellowstoneHealthy(): boolean {
  return _streamHealthy;
}

export async function startYellowstoneStream(): Promise<void> {
  if (streamRunning) return;
  streamRunning = true;
  reconnectAttempts = 0;
  await connectWithRetry();
}

export function stopYellowstoneStream(): void {
  streamRunning = false;
  _streamHealthy = false;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
}

async function connectWithRetry(): Promise<void> {
  if (!streamRunning) return;
  const endpoint = process.env.GRPC_ENDPOINT ?? 'https://grpc.solami.dev';
  const token = process.env.GRPC_TOKEN ?? '';
  try {
    await connectStream(endpoint, token);
    reconnectAttempts = 0;
  } catch (err) {
    _streamHealthy = false;
    yellowstoneEmitter.emit('health', false);
    const delay = Math.min(1000 * 2 ** reconnectAttempts, MAX_RECONNECT_DELAY_MS);
    reconnectAttempts++;
    console.warn('[Yellowstone] Stream error, reconnecting in', delay, 'ms:', err instanceof Error ? err.message : String(err));
  }
  if (streamRunning) {
    const delay = Math.min(1000 * 2 ** Math.min(reconnectAttempts, 5), MAX_RECONNECT_DELAY_MS);
    reconnectTimer = setTimeout(() => connectWithRetry(), delay);
  }
}

async function connectStream(endpoint: string, token: string): Promise<void> {
  const client = new Client(endpoint, token, {});

  const stream = await client.subscribe();

  return new Promise<void>((resolve, reject) => {
    const txFilter: SubscribeRequestFilterTransactions = {
      vote: false,
      failed: false,
      signature: undefined,
      accountInclude: [],
      accountExclude: [],
      accountRequired: [],
    };

    stream.write({
      accounts: {},
      slots: {},
      transactions: { sentry_watch: txFilter },
      transactionsStatus: {},
      entry: {},
      blocks: {},
      blocksMeta: {},
      commitment: CommitmentLevel.CONFIRMED,
      accountsDataSlice: [],
      ping: undefined,
    }, (err?: Error | null) => {
      if (err) reject(new Error('Yellowstone subscribe write failed: ' + err.message));
    });

    _streamHealthy = true;
    reconnectAttempts = 0;
    yellowstoneEmitter.emit('health', true);
    console.log('[Yellowstone] gRPC stream ACTIVE —', endpoint);

    stream.on('data', (data: Record<string, unknown>) => {
      try {
        if (data.transaction) {
          const txUpdate = data.transaction as Record<string, unknown>;
          const slot = Number(data.slot ?? txUpdate.slot ?? 0);
          const txInfo = txUpdate.transaction as Record<string, unknown> | undefined;
          const meta = txUpdate.meta as Record<string, unknown> | undefined;
          const txMsg = (txInfo?.transaction as Record<string, unknown> | undefined)?.message as Record<string, unknown> | undefined;
          const raw = {
            signature: txUpdate.signature instanceof Uint8Array
              ? Buffer.from(txUpdate.signature as Uint8Array).toString('base64')
              : String(txUpdate.signature ?? ''),
            accountKeys: ((txMsg?.accountKeys ?? []) as unknown[]).map((k) =>
              k instanceof Uint8Array ? Buffer.from(k as Uint8Array).toString('base64') : String(k)),
            lamports: Number((meta as Record<string, unknown>)?.fee ?? 0),
            postBalance: Number(((meta?.postBalances as number[]) ?? [])[0] ?? 0),
            err: (meta as Record<string, unknown>)?.err ?? null,
          };
          if (raw.err) return;
          const event: SentryEvent | null = fromYellowstoneMessage(raw, slot);
          if (event) yellowstoneEmitter.emit('event', event);
        } else if (data.ping) {
          stream.write({ ping: { id: 1 } } as unknown as Parameters<typeof stream.write>[0], () => {});
        }
      } catch { /* non-fatal */ }
    });

    stream.on('error', (err: Error) => {
      _streamHealthy = false;
      yellowstoneEmitter.emit('health', false);
      reject(err);
    });

    stream.on('end', () => {
      _streamHealthy = false;
      yellowstoneEmitter.emit('health', false);
      console.warn('[Yellowstone] Stream ended — will reconnect');
      resolve();
    });

    stream.on('close', () => {
      _streamHealthy = false;
      yellowstoneEmitter.emit('health', false);
      resolve();
    });
  });
}
