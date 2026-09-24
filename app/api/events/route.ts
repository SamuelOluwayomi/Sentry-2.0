import { NextRequest } from "next/server";
import { eventBus, getSystemHealth, getRecentReceipts, getExecutionMode } from "@/lib/autonomous-runtime";
import { getNetworkSnapshot } from "@/lib/network-snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      function send(data: unknown) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch { /* closed */ }
      }

      // Send initial state burst
      Promise.all([
        getSystemHealth(),
        getNetworkSnapshot(),
      ]).then(([health, network]) => {
        send({ type: "health", payload: health });
        send({ type: "network", payload: network });
        const receipts = getRecentReceipts(10);
        receipts.forEach(r => send({ type: "receipt", payload: r }));
      }).catch(() => {});

      // Forward event bus messages to SSE
      const onEvent = (evt: unknown) => send({ type: "event", payload: evt });
      const onReceipt = (r: unknown) => send({ type: "receipt", payload: r });
      const onReceiptFinal = (r: unknown) => send({ type: "receipt_final", payload: r });
      const onHealth = (h: unknown) => send({ type: "health", payload: h });
      const onNetwork = (n: unknown) => send({ type: "network", payload: n });

      eventBus.on("event", onEvent);
      eventBus.on("receipt", onReceipt);
      eventBus.on("receipt_final", onReceiptFinal);

      // Heartbeat + periodic health/network push
      const heartbeat = setInterval(async () => {
        try {
          const health = getSystemHealth();
          send({ type: "health", payload: health });
          const network = await getNetworkSnapshot();
          send({ type: "network", payload: network });
          send({ type: "ping", payload: { ts: Date.now() } });
        } catch { /* non-fatal */ }
      }, 5000);

      request.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        eventBus.off("event", onEvent);
        eventBus.off("receipt", onReceipt);
        eventBus.off("receipt_final", onReceiptFinal);
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    },
  });
}
