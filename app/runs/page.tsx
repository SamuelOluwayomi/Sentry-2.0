import type { Metadata } from "next";
import { getMainnetBenchmarkData } from "@/lib/benchmark-runs";
import { RunsClient } from "./RunsClient";

export const metadata: Metadata = {
  title: "Verifiable Benchmark Runs Matrix | Sentry 2.0",
  description:
    "Explore 100 Mainnet-Beta and 1,020 Devnet verifiable fault-injected transaction benchmark runs with Solscan signatures, Ed25519 engine signatures, and SHA-256 hash chains.",
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function RunsPage() {
  const initialData = getMainnetBenchmarkData();
  return <RunsClient initialData={initialData} />;
}
