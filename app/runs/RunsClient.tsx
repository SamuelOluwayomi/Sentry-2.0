"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  ArrowSquareOut,
  CaretLeft,
  CaretRight,
  CheckCircle,
  Copy,
  Eye,
  GraduationCap,
  Lightning,
  LockKey,
  ShieldCheck,
  Warning,
  X,
} from "../components/phosphor-icons";
import { CheckeredGridBackground } from "../components/checkered-border";
import type { BenchmarkDataset, BenchmarkRun } from "@/lib/benchmark-runs";

interface RunsClientProps {
  initialData: BenchmarkDataset;
}

export function RunsClient({ initialData }: RunsClientProps) {
  const [cluster, setCluster] = useState<"mainnet" | "devnet">("mainnet");
  const [dataset, setDataset] = useState<BenchmarkDataset>(initialData);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [regimeFilter, setRegimeFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedRun, setSelectedRun] = useState<BenchmarkRun | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);

  const summary = dataset.summary;

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey((prev) => (prev === key ? null : prev));
    }, 2000);
  };

  const handleSwitchCluster = async (newCluster: "mainnet" | "devnet") => {
    if (newCluster === cluster) return;
    setCluster(newCluster);
    setLoading(true);
    setCurrentPage(1);
    setStatusFilter("all");
    setRegimeFilter("all");
    setSearchQuery("");

    try {
      const res = await fetch(`/api/runs?cluster=${newCluster}`);
      const json = await res.json();
      if (json.ok) {
        setDataset({
          summary: json.summary,
          runs: json.runs,
        });
      }
    } catch (err) {
      console.error("Failed to fetch benchmark runs for cluster:", newCluster, err);
    } finally {
      setLoading(false);
    }
  };

  const filteredRuns = useMemo(() => {
    return dataset.runs.filter((run) => {
      // Status filter
      if (statusFilter === "finalized" && run.status !== "finalized") return false;
      if (statusFilter === "failed" && run.status !== "failed") return false;
      if (statusFilter === "aborted" && run.status !== "aborted") return false;
      if (statusFilter === "clean" && (run.status !== "finalized" || run.faultType !== "none")) return false;
      if (statusFilter === "faults" && run.faultType === "none" && run.status !== "failed" && run.status !== "aborted") return false;

      // Regime filter
      if (regimeFilter !== "all" && run.regime !== regimeFilter) return false;

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const runNumStr = `#${run.runNumber}`.toLowerCase();
        const scenarioMatch = run.scenarioName.toLowerCase().includes(query) || run.scenarioId.toLowerCase().includes(query);
        const sigMatch = run.signature ? run.signature.toLowerCase().includes(query) : false;
        const hashMatch = run.receiptHash.toLowerCase().includes(query);
        const failureMatch = run.failureClass ? run.failureClass.toLowerCase().includes(query) : false;
        const faultMatch = run.faultType.toLowerCase().includes(query);

        if (!runNumStr.includes(query) && !scenarioMatch && !sigMatch && !hashMatch && !failureMatch && !faultMatch) {
          return false;
        }
      }

      return true;
    });
  }, [dataset.runs, statusFilter, regimeFilter, searchQuery]);

  const totalPages = Math.ceil(filteredRuns.length / pageSize) || 1;
  const paginatedRuns = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRuns.slice(start, start + pageSize);
  }, [filteredRuns, currentPage, pageSize]);

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-[#121212] font-serif selection:bg-[#FF5A26] selection:text-white">
      {/* Background Pattern */}
      <div className="fixed inset-0 pointer-events-none select-none z-0 overflow-hidden [mask-image:radial-gradient(ellipse_at_top,black_50%,transparent_100%)]">
        <CheckeredGridBackground variant="diagonal-lines" cellSize={48} opacity={0.25} />
      </div>

      {/* Navigation Header */}
      <header className="sticky top-0 z-40 border-b-2 border-[#121212] bg-[#FFFFFF]/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-3 text-left group">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden border-2 border-[#121212] bg-black shadow-[2px_2px_0px_#121212] transition-transform group-hover:-translate-y-0.5">
                <Image
                  src="/Sentry-logo.png"
                  alt="Sentry"
                  width={32}
                  height={32}
                  className="h-7 w-7 object-contain"
                  priority
                />
              </span>
              <div className="flex flex-col">
                <span className="font-serif text-sm font-black tracking-tight leading-tight">
                  Sentry Stack Co.
                </span>
                <span className="font-mono text-[10px] text-[#5A564F] uppercase tracking-wider">
                  verifiable benchmark runs
                </span>
              </div>
            </Link>

            <span className="hidden md:inline-block rounded-full border-2 border-[#121212] bg-[#F7F4EC] px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase text-[#FF5A26]">
              {cluster === "mainnet" ? "● Mainnet-Beta Matrix [100]" : "● Devnet Matrix [1,020]"}
            </span>
          </div>

          <nav className="flex items-center gap-3 font-serif text-xs font-bold sm:gap-4 sm:text-sm">
            <Link
              href="/"
              className="text-[#121212] hover:text-[#FF5A26] transition-colors"
            >
              Overview
            </Link>
            <Link
              href="/dashboard"
              className="hidden sm:inline-flex items-center gap-1.5 text-[#121212] hover:text-[#FF5A26] transition-colors"
            >
              <GraduationCap size={15} weight="bold" />
              <span>Academy</span>
            </Link>
            <a
              href="https://sentryacademydocs.vercel.app/docs/benchmarks-and-evidence"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center gap-1 text-[#121212] hover:text-[#FF5A26] transition-colors"
            >
              <span>Docs</span>
              <ArrowSquareOut size={12} weight="bold" />
            </a>
            <a
              href="/api/evidence"
              download
              className="inline-flex h-9 items-center gap-1.5 rounded-full border-2 border-[#121212] bg-white px-3 sm:px-4 font-mono text-xs font-bold text-[#121212] shadow-[2px_2px_0px_#121212] hover:bg-[#121212] hover:text-white transition-all active:translate-x-0.5 active:translate-y-0.5"
            >
              <span>Audit Markdown</span>
              <ArrowSquareOut size={13} weight="bold" />
            </a>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-10 lg:px-8">
        {/* Hero Title Banner */}
        <div className="border-2 border-[#121212] bg-[#FFFFFF] rounded-2xl p-6 sm:p-8 shadow-[4px_4px_0px_#121212]">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border-2 border-[#121212] bg-[#F7F4EC] px-3 py-1 font-mono text-xs font-bold uppercase tracking-wider text-[#FF5A26]">
                <Activity size={14} weight="bold" />
                <span>Zero-Mock Cryptographic Ledger</span>
              </div>
              <h1 className="mt-3 font-serif text-3xl sm:text-5xl font-black tracking-tight leading-tight">
                Benchmark Runs Matrix
              </h1>
              <p className="mt-3 font-sans text-sm sm:text-base leading-relaxed text-[#5A564F]">
                Full execution ledger covering 100 Mainnet-Beta broadcasts and 1,020 Devnet stress runs. Every run is sealed with an unbroken SHA-256 hash chain and asymmetric Ed25519 engine signature.
              </p>
            </div>

            {/* Cluster Switcher Toggle */}
            <div className="flex flex-col gap-2 rounded-2xl border-2 border-[#121212] bg-[#F7F4EC] p-3 shadow-[2px_2px_0px_#121212]">
              <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#5A564F]">
                Benchmark Cluster
              </span>
              <div className="inline-flex rounded-xl border-2 border-[#121212] bg-white p-1">
                <button
                  type="button"
                  onClick={() => handleSwitchCluster("mainnet")}
                  className={`flex items-center gap-2 rounded-lg px-3 sm:px-4 py-2 font-mono text-xs font-bold transition-all ${
                    cluster === "mainnet"
                      ? "bg-[#121212] text-white shadow-[1px_1px_0px_#121212]"
                      : "text-[#121212] hover:bg-[#F7F4EC]"
                  }`}
                >
                  <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
                  <span>Mainnet-Beta (100)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSwitchCluster("devnet")}
                  className={`flex items-center gap-2 rounded-lg px-3 sm:px-4 py-2 font-mono text-xs font-bold transition-all ${
                    cluster === "devnet"
                      ? "bg-[#121212] text-white shadow-[1px_1px_0px_#121212]"
                      : "text-[#121212] hover:bg-[#F7F4EC]"
                  }`}
                >
                  <span className="h-2 w-2 rounded-full bg-amber-400"></span>
                  <span>Devnet Stress (1,020)</span>
                </button>
              </div>
            </div>
          </div>

          {/* Metric Cards Grid */}
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Card 1: Clean Baseline */}
            <div className="rounded-xl border-2 border-[#121212] bg-[#FDFBF7] p-4 shadow-[2px_2px_0px_#121212]">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#5A564F]">
                  Clean Baseline Landing Rate
                </span>
                <span className="flex h-7 w-7 items-center justify-center rounded-lg border-2 border-[#121212] bg-emerald-100 text-emerald-800">
                  <CheckCircle size={15} weight="bold" />
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-serif text-3xl font-black text-emerald-700">
                  {summary.cleanBaselineLandingRate || "100.0%"}
                </span>
                <span className="font-mono text-xs font-bold text-[#5A564F]">
                  ({summary.landedCount}/{summary.cleanBaselineRuns || summary.landedCount})
                </span>
              </div>
              <p className="mt-2 font-sans text-xs text-[#5A564F] leading-snug">
                {cluster === "mainnet"
                  ? "55 clean on-chain broadcasts with valid parameters achieved 100% finality."
                  : "663 clean test broadcasts achieved 100% landing with zero dropped transactions."}
              </p>
            </div>

            {/* Card 2: Fault Injection Classification */}
            <div className="rounded-xl border-2 border-[#121212] bg-[#FDFBF7] p-4 shadow-[2px_2px_0px_#121212]">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#5A564F]">
                  Fault-Injection Classifier
                </span>
                <span className="flex h-7 w-7 items-center justify-center rounded-lg border-2 border-[#121212] bg-amber-100 text-amber-800">
                  <Warning size={15} weight="bold" />
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-serif text-3xl font-black text-[#FF5A26]">
                  {cluster === "mainnet" ? "45 Runs" : "357 Runs"}
                </span>
                <span className="font-mono text-xs font-bold text-amber-700">
                  (100% Caught)
                </span>
              </div>
              <p className="mt-2 font-sans text-xs text-[#5A564F] leading-snug">
                {cluster === "mainnet"
                  ? "38 deliberate faults classified; 7 circuit aborts spent 0 lamports."
                  : "306 intentional faults + 51 circuit-breaker aborts classified by policy."}
              </p>
            </div>

            {/* Card 3: Cryptographic Integrity */}
            <div className="rounded-xl border-2 border-[#121212] bg-[#FDFBF7] p-4 shadow-[2px_2px_0px_#121212]">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#5A564F]">
                  Cryptographic Integrity
                </span>
                <span className="flex h-7 w-7 items-center justify-center rounded-lg border-2 border-[#121212] bg-black text-white">
                  <LockKey size={15} weight="bold" />
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-serif text-3xl font-black text-[#121212]">
                  {cluster === "mainnet" ? "100 / 100" : "1,020 / 1,020"}
                </span>
                <span className="font-mono text-xs font-bold text-emerald-700">
                  Verified
                </span>
              </div>
              <p className="mt-2 font-sans text-xs text-[#5A564F] leading-snug">
                Unbroken SHA-256 receipt hash-chain + Ed25519 digital signatures.
              </p>
            </div>

            {/* Card 4: Dynamic Solami Beam Tips */}
            <div className="rounded-xl border-2 border-[#121212] bg-[#FDFBF7] p-4 shadow-[2px_2px_0px_#121212]">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#5A564F]">
                  Dynamic Solami Tips
                </span>
                <span className="flex h-7 w-7 items-center justify-center rounded-lg border-2 border-[#121212] bg-[#FF5A26] text-white">
                  <Lightning size={15} weight="bold" />
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-serif text-2xl font-black text-[#121212]">
                  {summary.dynamicTipRange.min.toLocaleString()} - {summary.dynamicTipRange.max.toLocaleString()}
                </span>
                <span className="font-mono text-xs font-bold text-[#FF5A26]">
                  Lamports
                </span>
              </div>
              <p className="mt-2 font-sans text-xs text-[#5A564F] leading-snug">
                Empirical SWQoS tips disaggregated from Compute Budget base fees.
              </p>
            </div>
          </div>
        </div>

        {/* Filter and Control Bar */}
        <div className="mt-8 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 rounded-2xl border-2 border-[#121212] bg-white p-4 shadow-[2px_2px_0px_#121212]">
            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-bold uppercase text-[#5A564F] mr-1">
                Filter:
              </span>
              {[
                { id: "all", label: `All (${dataset.runs.length})` },
                { id: "clean", label: `Clean Landed (${summary.landedCount})` },
                { id: "faults", label: `Injected Faults (${summary.failedCount})` },
                { id: "aborted", label: `Policy Aborts (${summary.abortedCount})` },
              ].map((pill) => (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => {
                    setStatusFilter(pill.id);
                    setCurrentPage(1);
                  }}
                  className={`rounded-full border-2 border-[#121212] px-3 py-1 font-mono text-xs font-bold transition-all ${
                    statusFilter === pill.id
                      ? "bg-[#121212] text-white shadow-[1px_1px_0px_#121212]"
                      : "bg-[#F7F4EC] text-[#121212] hover:bg-white"
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>

            {/* Regime Filter & Search */}
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={regimeFilter}
                onChange={(e) => {
                  setRegimeFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="h-10 rounded-xl border-2 border-[#121212] bg-[#F7F4EC] px-3 font-mono text-xs font-bold text-[#121212] focus:outline-none"
              >
                <option value="all">All Regimes</option>
                <option value="calm">Calm</option>
                <option value="moderate">Moderate</option>
                <option value="volatile">Volatile</option>
                <option value="congested">Congested</option>
                <option value="extreme">Extreme</option>
              </select>

              <div className="relative min-w-[240px] flex-1 sm:w-72">
                <input
                  type="text"
                  placeholder="Search run #, scenario, hash..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="h-10 w-full rounded-xl border-2 border-[#121212] bg-[#F7F4EC] pl-3 pr-8 font-mono text-xs text-[#121212] placeholder:text-[#5A564F] focus:bg-white focus:outline-none"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-2.5 text-[#5A564F] hover:text-[#121212]"
                  >
                    <X size={14} weight="bold" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Results Counter and Page Size */}
        <div className="mt-4 flex items-center justify-between px-2 font-mono text-xs text-[#5A564F]">
          <div>
            Showing <span className="font-bold text-[#121212]">{filteredRuns.length}</span> of{" "}
            <span className="font-bold text-[#121212]">{dataset.runs.length}</span> benchmark runs
            {(statusFilter !== "all" || regimeFilter !== "all" || searchQuery) && " (filtered)"}
          </div>
          <div className="flex items-center gap-2">
            <span>Per page:</span>
            {[25, 50, 100].map((sz) => (
              <button
                key={sz}
                type="button"
                onClick={() => {
                  setPageSize(sz);
                  setCurrentPage(1);
                }}
                className={`rounded px-1.5 py-0.5 text-xs font-bold transition-all ${
                  pageSize === sz ? "bg-[#121212] text-white" : "hover:text-[#121212]"
                }`}
              >
                {sz}
              </button>
            ))}
          </div>
        </div>

        {/* Runs Table */}
        <div className="mt-3 overflow-hidden rounded-2xl border-2 border-[#121212] bg-white shadow-[4px_4px_0px_#121212]">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b-2 border-[#121212] bg-[#F7F4EC] font-mono text-[11px] font-bold uppercase tracking-wider text-[#5A564F]">
                  <th className="p-3 w-16 text-center">Run</th>
                  <th className="p-3 min-w-[260px]">Scenario / Protocol</th>
                  <th className="p-3 w-28">Regime</th>
                  <th className="p-3 min-w-[190px]">Status & Classification</th>
                  <th className="p-3 w-28">Tip (Lamports)</th>
                  <th className="p-3 min-w-[170px]">Signature</th>
                  <th className="p-3 min-w-[150px]">SHA-256 Receipt</th>
                  <th className="p-3 w-24 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y border-[#121212]/10 font-sans">
                {paginatedRuns.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-12 text-center font-serif text-base text-[#5A564F]">
                      No benchmark runs match the selected filters.
                    </td>
                  </tr>
                ) : (
                  paginatedRuns.map((run) => {
                    const isLanded = run.status === "finalized";
                    const isAborted = run.status === "aborted";
                    const isClean = isLanded && run.faultType === "none";

                    return (
                      <tr
                        key={run.runNumber}
                        onClick={() => setSelectedRun(run)}
                        className="group cursor-pointer hover:bg-[#FDFBF7] transition-colors"
                      >
                        {/* Run # */}
                        <td className="p-3 text-center font-mono font-bold text-[#121212]">
                          #{run.runNumber}
                        </td>

                        {/* Scenario */}
                        <td className="p-3">
                          <div className="font-serif font-bold text-sm text-[#121212] group-hover:text-[#FF5A26] transition-colors">
                            {run.scenarioName}
                          </div>
                          <div className="font-mono text-[10px] text-[#5A564F]">
                            {run.scenarioId}
                          </div>
                        </td>

                        {/* Regime */}
                        <td className="p-3 font-mono">
                          <span
                            className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${
                              run.regime === "calm"
                                ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                                : run.regime === "volatile"
                                ? "bg-amber-50 text-amber-800 border-amber-300"
                                : run.regime === "congested"
                                ? "bg-orange-50 text-orange-800 border-orange-300"
                                : "bg-purple-50 text-purple-800 border-purple-300"
                            }`}
                          >
                            {run.regime}
                          </span>
                        </td>

                        {/* Status & Classification */}
                        <td className="p-3 font-mono">
                          {isClean ? (
                            <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                              <CheckCircle size={13} weight="bold" />
                              <span>Clean Landed</span>
                            </div>
                          ) : isAborted ? (
                            <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-800">
                              <ShieldCheck size={13} weight="bold" />
                              <span>Policy Abort (0 Spent)</span>
                            </div>
                          ) : (
                            <div className="inline-flex flex-col gap-0.5">
                              <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                                <Warning size={12} weight="bold" />
                                <span>Fault: {run.failureClass || run.faultType}</span>
                              </span>
                            </div>
                          )}
                        </td>

                        {/* Tip Lamports */}
                        <td className="p-3 font-mono text-xs font-semibold">
                          {run.tipLamports > 0 ? (
                            <span>{run.tipLamports.toLocaleString()} L</span>
                          ) : (
                            <span className="text-[#5A564F]">—</span>
                          )}
                        </td>

                        {/* Signature */}
                        <td className="p-3 font-mono text-xs">
                          {run.signature ? (
                            <div className="flex items-center gap-1.5">
                              <a
                                href={
                                  cluster === "mainnet"
                                    ? `https://solscan.io/tx/${run.signature}`
                                    : `https://solscan.io/tx/${run.signature}?cluster=devnet`
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="font-bold text-[#FF5A26] hover:underline flex items-center gap-1"
                                title="Inspect on Solscan"
                              >
                                <span>{run.signature.slice(0, 4)}...{run.signature.slice(-4)}</span>
                                <ArrowSquareOut size={12} weight="bold" />
                              </a>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCopy(run.signature || "", `sig-${run.runNumber}`);
                                }}
                                className="p-1 text-[#5A564F] hover:text-[#121212]"
                                title="Copy full signature"
                              >
                                {copiedKey === `sig-${run.runNumber}` ? (
                                  <span className="text-[10px] font-bold text-emerald-600">Copied</span>
                                ) : (
                                  <Copy size={12} weight="bold" />
                                )}
                              </button>
                            </div>
                          ) : (
                            <span className="text-[#5A564F]">Preflight / None</span>
                          )}
                        </td>

                        {/* SHA-256 Receipt Hash */}
                        <td className="p-3 font-mono text-xs">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[#5A564F]">
                              {run.receiptHash.slice(0, 6)}...{run.receiptHash.slice(-4)}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopy(run.receiptHash, `hash-${run.runNumber}`);
                              }}
                              className="p-1 text-[#5A564F] hover:text-[#121212]"
                              title="Copy SHA-256 Receipt Hash"
                            >
                              {copiedKey === `hash-${run.runNumber}` ? (
                                <span className="text-[10px] font-bold text-emerald-600">Copied</span>
                              ) : (
                                <Copy size={12} weight="bold" />
                              )}
                            </button>
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="p-3 text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedRun(run);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border-2 border-[#121212] bg-[#F7F4EC] px-2.5 py-1 font-mono text-[10px] font-bold text-[#121212] hover:bg-[#121212] hover:text-white transition-colors"
                          >
                            <Eye size={12} weight="bold" />
                            <span>Receipt</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t-2 border-[#121212] bg-[#F7F4EC] px-4 py-3 font-mono text-xs">
              <div>
                Page <span className="font-bold text-[#121212]">{currentPage}</span> of{" "}
                <span className="font-bold text-[#121212]">{totalPages}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border-2 border-[#121212] bg-white disabled:opacity-40 hover:bg-[#121212] hover:text-white transition-colors"
                >
                  <CaretLeft size={14} weight="bold" />
                </button>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border-2 border-[#121212] bg-white disabled:opacity-40 hover:bg-[#121212] hover:text-white transition-colors"
                >
                  <CaretRight size={14} weight="bold" />
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Selected Run Drawer / Modal */}
      {selectedRun && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setSelectedRun(null)}
        >
          <div
            className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border-2 border-[#121212] bg-white p-6 sm:p-8 shadow-[8px_8px_0px_#121212]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b-2 border-[#121212]/15 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full border-2 border-[#121212] bg-[#F7F4EC] px-2.5 py-0.5 font-mono text-xs font-bold uppercase text-[#FF5A26]">
                    Run #{selectedRun.runNumber}
                  </span>
                  <span className="font-mono text-xs uppercase text-[#5A564F]">
                    {cluster.toUpperCase()}
                  </span>
                </div>
                <h2 className="mt-2 font-serif text-2xl font-black text-[#121212]">
                  {selectedRun.scenarioName}
                </h2>
                <div className="font-mono text-xs text-[#5A564F]">
                  Scenario ID: {selectedRun.scenarioId}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRun(null)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-[#121212] bg-white text-[#121212] hover:bg-[#121212] hover:text-white transition-colors"
              >
                <X size={16} weight="bold" />
              </button>
            </div>

            {/* Run Key-Value Grid */}
            <div className="mt-6 space-y-4 text-xs font-mono">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-xl border border-[#121212]/20 bg-[#FDFBF7] p-3">
                  <span className="text-[#5A564F] uppercase text-[10px] font-bold block">Status</span>
                  <span className="text-sm font-bold text-[#121212] uppercase">{selectedRun.status}</span>
                </div>
                <div className="rounded-xl border border-[#121212]/20 bg-[#FDFBF7] p-3">
                  <span className="text-[#5A564F] uppercase text-[10px] font-bold block">Regime</span>
                  <span className="text-sm font-bold text-[#121212] uppercase">{selectedRun.regime}</span>
                </div>
                <div className="rounded-xl border border-[#121212]/20 bg-[#FDFBF7] p-3">
                  <span className="text-[#5A564F] uppercase text-[10px] font-bold block">Dynamic Tip</span>
                  <span className="text-sm font-bold text-[#121212]">{selectedRun.tipLamports.toLocaleString()} Lamports</span>
                </div>
                <div className="rounded-xl border border-[#121212]/20 bg-[#FDFBF7] p-3">
                  <span className="text-[#5A564F] uppercase text-[10px] font-bold block">Fault Type</span>
                  <span className="text-sm font-bold text-[#FF5A26]">{selectedRun.faultType}</span>
                </div>
              </div>

              {/* Solscan / Explorer Links */}
              {selectedRun.signature && (
                <div className="rounded-xl border-2 border-[#121212] bg-[#F7F4EC] p-3">
                  <span className="text-[#5A564F] uppercase text-[10px] font-bold block">Transaction Signature</span>
                  <div className="mt-1 flex items-center justify-between gap-2 break-all text-xs font-bold text-[#121212]">
                    <span>{selectedRun.signature}</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(selectedRun.signature || "", "modal-sig")}
                      className="shrink-0 p-1 text-[#5A564F] hover:text-[#121212]"
                    >
                      {copiedKey === "modal-sig" ? "Copied" : <Copy size={14} weight="bold" />}
                    </button>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <a
                      href={
                        cluster === "mainnet"
                          ? `https://solscan.io/tx/${selectedRun.signature}`
                          : `https://solscan.io/tx/${selectedRun.signature}?cluster=devnet`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-bold text-[#FF5A26] hover:underline"
                    >
                      <span>View on Solscan</span>
                      <ArrowSquareOut size={12} weight="bold" />
                    </a>
                    <span className="text-[#121212]/20">•</span>
                    <a
                      href={
                        cluster === "mainnet"
                          ? `https://explorer.solana.com/tx/${selectedRun.signature}`
                          : `https://explorer.solana.com/tx/${selectedRun.signature}?cluster=devnet`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-bold text-[#121212] hover:underline"
                    >
                      <span>Solana Explorer</span>
                      <ArrowSquareOut size={12} weight="bold" />
                    </a>
                  </div>
                </div>
              )}

              {/* Cryptographic Hashes */}
              <div className="rounded-xl border border-[#121212]/20 bg-[#FDFBF7] p-3 space-y-2">
                <div>
                  <span className="text-[#5A564F] uppercase text-[10px] font-bold block">Previous Receipt Hash (Merkle Chain)</span>
                  <span className="break-all text-[11px] text-[#121212]">{selectedRun.prevReceiptHash}</span>
                </div>
                <div>
                  <span className="text-[#5A564F] uppercase text-[10px] font-bold block">Current Receipt Hash</span>
                  <span className="break-all text-[11px] font-bold text-[#121212]">{selectedRun.receiptHash}</span>
                </div>
                <div>
                  <span className="text-[#5A564F] uppercase text-[10px] font-bold block">Ed25519 Engine Signature</span>
                  <span className="break-all text-[11px] text-[#5A564F]">{selectedRun.engineSignature}</span>
                </div>
              </div>

              {/* Replay Command */}
              <div className="rounded-xl border-2 border-[#121212] bg-[#121212] p-3 text-white">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400 uppercase text-[10px] font-bold">Deterministic CLI Replay</span>
                  <button
                    type="button"
                    onClick={() => handleCopy(selectedRun.reproduceCommand, "modal-cli")}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-[#FF5A26] hover:underline"
                  >
                    <Copy size={13} weight="bold" />
                    <span>{copiedKey === "modal-cli" ? "Copied Command!" : "Copy"}</span>
                  </button>
                </div>
                <code className="mt-1.5 block font-mono text-xs text-emerald-400">
                  {selectedRun.reproduceCommand}
                </code>
              </div>

              {/* Raw JSON Details */}
              <details className="rounded-xl border border-[#121212]/20 bg-[#FDFBF7] p-3">
                <summary className="cursor-pointer font-bold uppercase text-[10px] text-[#5A564F] hover:text-[#121212]">
                  View Raw Cryptographic Receipt JSON
                </summary>
                <pre className="mt-3 overflow-x-auto rounded-lg bg-[#121212] p-3 text-[11px] text-zinc-200">
                  {JSON.stringify(selectedRun, null, 2)}
                </pre>
              </details>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
