// Sentry 2.0 -- Solami Blur WebSocket Client
// Connects to the Solami Blur decoded market-data stream and feeds real
// swap / liquidity / token-launch events into the Sentry event bus.

import WebSocket from 'ws';
import { EventEmitter } from 'node:events';
import { fromBlurMessage } from './event-engine';
import type { SentryEvent } from './types';

let ws: WebSocket | null = null;
let blurRunning = false;
let _blurHealthy = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY_MS = 30_000;
let currentSlot = 0;

export const blurEmitter = new EventEmitter();

export function isBlurHealthy(): boolean { return _blurHealthy; }
export function setBlurSlot(slot: number): void { currentSlot = slot; }

export async function startBlurStream(): Promise<void> {
  if (blurRunning) return;
  blurRunning = true;
  reconnectAttempts = 0;
  connectBlur();
}

export function stopBlurStream(): void {
  blurRunning = false;
  _blurHealthy = false;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (ws) { try { ws.close(); } catch { /* ignore */ } ws = null; }
}

function connectBlur(): void {
  if (!blurRunning) return;
  const apiKey = process.env.SOLAMI_API_KEY ?? '';
  if (!apiKey) {
    console.warn('[Blur] SOLAMI_API_KEY not set — Blur stream disabled');
    return;
  }

  const wsUrl = 'wss://blur.solami.dev/ws?api_key=' + apiKey;
  console.log('[Blur] Connecting to Solami Blur WebSocket...');

  try {
    ws = new WebSocket(wsUrl, {
      handshakeTimeout: 10_000,
      headers: { 'User-Agent': 'sentry/2.0', 'x-api-key': apiKey },
    });
  } catch {
    scheduleReconnect();
    return;
  }

  ws.on('open', () => {
    _blurHealthy = true;
    reconnectAttempts = 0;
    blurEmitter.emit('health', true);
    console.log('[Blur] WebSocket OPEN — receiving decoded market data');
    ws?.send(JSON.stringify({ type: 'subscribe', channels: ['swaps', 'liquidity', 'launches', 'pools'] }));
  });

  ws.on('message', (raw: Buffer | ArrayBuffer | Buffer[]) => {
    try {
      const data = JSON.parse(Buffer.isBuffer(raw) ? raw.toString('utf8') : raw.toString()) as Record<string, unknown>;
      if (data.type === 'ping' || data.type === 'pong' || data.type === 'connected') {
        if (data.type === 'ping') ws?.send(JSON.stringify({ type: 'pong' }));
        return;
      }
      const event: SentryEvent | null = fromBlurMessage(data, currentSlot);
      if (event) blurEmitter.emit('event', event);
    } catch { /* non-fatal */ }
  });

  ws.on('error', (err: Error) => {
    _blurHealthy = false;
    blurEmitter.emit('health', false);
    console.warn('[Blur] WebSocket error:', err.message);
  });

  ws.on('close', (code: number, reason: Buffer) => {
    _blurHealthy = false;
    blurEmitter.emit('health', false);
    ws = null;
    console.warn('[Blur] WebSocket closed (code=' + code + ', reason=' + reason.toString().slice(0, 80) + ') — scheduling reconnect');
    scheduleReconnect();
  });

  const pingInterval = setInterval(() => {
    if (ws?.readyState === WebSocket.OPEN) { ws.ping(); }
    else { clearInterval(pingInterval); }
  }, 20_000);
}

function scheduleReconnect(): void {
  if (!blurRunning) return;
  const delay = Math.min(1000 * 2 ** Math.min(reconnectAttempts, 5), MAX_RECONNECT_DELAY_MS);
  reconnectAttempts++;
  reconnectTimer = setTimeout(() => connectBlur(), delay);
}
