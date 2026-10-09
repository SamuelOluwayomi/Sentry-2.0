// Sentry 2.0 -- RPC Cluster Consistency Checker
//
// Compares Solami private RPC vs public endpoints across:
//   - Slot head (how far ahead is Solami?)
//   - Blockhash freshness
//   - getVersion
//   - Response latency
//
// Results surface on the dashboard to prove Solami RPC superiority.

export interface RpcNode {
  name: string;
  url: string;
}

export interface RpcConsistencyResult {
  name: string;
  url: string;
  slot: number;
  latencyMs: number;
  version: string;
  blockhash: string;
  slotLag: number;   // slots behind the fastest node (0 = fastest)
  error?: string;
}

export interface ConsistencyReport {
  timestamp: number;
  fastestNode: string;
  headSlot: number;
  results: RpcConsistencyResult[];
  solamiAdvantageSlots: number;  // how many slots Solami is ahead of average public
}

const DEFAULT_NODES: RpcNode[] = [
  { name: "Solami (Private)", url: process.env.SOLANA_RPC_URL ?? "https://rpc.solami.dev/sol" },
  { name: "Mainnet-Beta (Public)", url: "https://api.mainnet-beta.solana.com" },
  { name: "Helius (Public)", url: "https://mainnet.helius-rpc.com/?api-key=demo" },
  { name: "Triton (Public)", url: "https://free.rpcpool.com" },
];

async function queryNode(node: RpcNode): Promise<RpcConsistencyResult> {
  const start = Date.now();
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);

    const [slotRes, versionRes] = await Promise.all([
      fetch(node.url, {
        method: "POST", signal: ctrl.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getSlot", params: [{ commitment: "processed" }] }),
      }),
      fetch(node.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "getVersion" }),
      }),
    ]);
    clearTimeout(t);

    const latencyMs = Date.now() - start;
    const slotJson = await slotRes.json() as { result?: number };
    const versionJson = await versionRes.json() as { result?: { "solana-core": string } };

    // Fetch blockhash separately (slightly later, acceptable)
    const bhRes = await fetch(node.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "getLatestBlockhash", params: [{ commitment: "confirmed" }] }),
    });
    const bhJson = await bhRes.json() as { result?: { value?: { blockhash: string } } };

    return {
      name: node.name,
      url: node.url,
      slot: slotJson.result ?? 0,
      latencyMs,
      version: versionJson.result?.["solana-core"] ?? "unknown",
      blockhash: bhJson.result?.value?.blockhash?.slice(0, 8) ?? "?",
      slotLag: 0, // filled in post-processing
    };
  } catch (err) {
    return {
      name: node.name,
      url: node.url,
      slot: 0,
      latencyMs: Date.now() - start,
      version: "error",
      blockhash: "?",
      slotLag: 0,
      error: (err as Error).message.slice(0, 80),
    };
  }
}

/**
 * Run a full consistency check against all configured RPC nodes.
 * Returns a ConsistencyReport showing Solami's slot advantage over public endpoints.
 */
export async function checkRpcConsistency(
  nodes: RpcNode[] = DEFAULT_NODES
): Promise<ConsistencyReport> {
  const results = await Promise.all(nodes.map(queryNode));

  const headSlot = Math.max(...results.map((r) => r.slot));
  const fastestNode = results.find((r) => r.slot === headSlot)?.name ?? "unknown";

  // Fill in slot lag
  for (const r of results) {
    r.slotLag = headSlot - r.slot;
  }

  // Calculate Solami's advantage over public average
  const solamiSlot = results.find((r) => r.name.includes("Solami"))?.slot ?? 0;
  const publicResults = results.filter((r) => !r.name.includes("Solami") && r.slot > 0);
  const publicAvgSlot = publicResults.length > 0
    ? publicResults.reduce((s, r) => s + r.slot, 0) / publicResults.length
    : solamiSlot;
  const solamiAdvantageSlots = Math.round(solamiSlot - publicAvgSlot);

  return {
    timestamp: Date.now(),
    fastestNode,
    headSlot,
    results,
    solamiAdvantageSlots,
  };
}

/**
 * Format a ConsistencyReport for console output 
 */
export function formatConsistencyReport(report: ConsistencyReport): string {
  const lines = [
    `RPC Cluster Consistency Report @ ${new Date(report.timestamp).toISOString()}`,
    `Head slot: ${report.headSlot.toLocaleString()} | Fastest: ${report.fastestNode}`,
    `Solami advantage over public avg: +${report.solamiAdvantageSlots} slots`,
    "",
    ...report.results.map((r) =>
      `  ${r.name.padEnd(24)} slot=${r.slot.toLocaleString().padStart(12)} lag=${String(r.slotLag).padStart(4)}  lat=${r.latencyMs}ms  v=${r.version}${r.error ? ` ERR:${r.error}` : ""}`
    ),
  ];
  return lines.join("\n");
}
