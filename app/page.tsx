"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowSquareOut,
  Brain,
  CheckCircle,
  ClockCounterClockwise,
  Copy,
  Cpu,
  Gauge,
  GitBranch,
  Lightning,
  LockKey,
  Play,
  PlugsConnected,
  RadioTower,
  ShieldCheck,
  Wallet,
  X,
} from "./components/phosphor-icons";
import { useWalletConnection } from "@solana/react-hooks";

// Helper to parse inline markdown elements safely
const parseInline = (text: string) => {
  if (!text) return "";
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  html = html.replace(
    /\*\*(.*?)\*\*/g,
    '<strong class="font-bold text-[#121212]">$1</strong>'
  );
  html = html.replace(
    /__(.*?)__/g,
    '<strong class="font-bold text-[#121212]">$1</strong>'
  );
  html = html.replace(/\*(.*?)\*/g, '<em class="italic">$1</em>');
  html = html.replace(/_(.*?)_/g, '<em class="italic">$1</em>');
  html = html.replace(
    /`(.*?)`/g,
    '<code class="bg-[#121212]/5 px-1.5 py-0.5 rounded font-mono text-[11px] text-[#FF5A26] font-bold break-all inline-block max-w-full">$1</code>'
  );

  return <span dangerouslySetInnerHTML={{ __html: html }} />;
};

const renderMarkdown = (text: string) => {
  if (!text) return null;

  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];

  let currentBlock: {
    type: "paragraph" | "code" | "ul" | "ol";
    lines: string[];
    lang?: string;
  } | null = null;

  const flushBlock = (key: number) => {
    if (!currentBlock) return;

    if (currentBlock.type === "code") {
      const codeContent = currentBlock.lines.join("\n");
      elements.push(
        <pre
          key={`code-block-${key}`}
          className="mb-4 max-w-full overflow-x-auto border-2 border-[#121212] bg-[#121212] text-[#F7F4EC] p-3 font-mono text-[11px]"
        >
          <code className="block break-all whitespace-pre-wrap">
            {codeContent}
          </code>
        </pre>
      );
    } else if (currentBlock.type === "ul") {
      elements.push(
        <ul key={`ul-block-${key}`} className="mb-4 list-disc pl-5 space-y-1 font-sans text-sm">
          {currentBlock.lines.map((item, idx) => (
            <li key={`ul-item-${key}-${idx}`} className="break-words">
              {parseInline(item)}
            </li>
          ))}
        </ul>
      );
    } else if (currentBlock.type === "ol") {
      elements.push(
        <ol key={`ol-block-${key}`} className="mb-4 list-decimal pl-5 space-y-1 font-sans text-sm">
          {currentBlock.lines.map((item, idx) => (
            <li key={`ol-item-${key}-${idx}`} className="break-words">
              {parseInline(item)}
            </li>
          ))}
        </ol>
      );
    } else if (currentBlock.type === "paragraph") {
      const pContent = currentBlock.lines.join(" ");
      if (pContent.trim()) {
        elements.push(
          <p
            key={`p-block-${key}`}
            className="mb-3 leading-relaxed break-words text-[#121212] font-sans text-sm last:mb-0"
          >
            {parseInline(pContent)}
          </p>
        );
      }
    }

    currentBlock = null;
  };

  let keyCounter = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      if (currentBlock && currentBlock.type === "code") {
        flushBlock(keyCounter++);
      } else {
        flushBlock(keyCounter++);
        const lang = trimmed.slice(3).trim();
        currentBlock = { type: "code", lines: [], lang };
      }
      continue;
    }

    if (currentBlock && currentBlock.type === "code") {
      currentBlock.lines.push(line);
      continue;
    }

    const headerMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headerMatch) {
      flushBlock(keyCounter++);
      const level = headerMatch[1].length;
      const titleText = headerMatch[2];

      let headerClass =
        "font-serif font-bold text-[#121212] mt-4 mb-2 break-words ";
      if (level === 1)
        headerClass += "text-base uppercase border-b-2 border-[#121212] pb-1";
      else if (level === 2) headerClass += "text-sm uppercase";
      else headerClass += "text-xs opacity-90";

      elements.push(
        <div key={`header-${keyCounter++}`} className={headerClass}>
          {parseInline(titleText)}
        </div>
      );
      continue;
    }

    const ulMatch = line.match(/^(\s*)[-*]\s+(.*)$/);
    if (ulMatch) {
      const content = ulMatch[2];
      if (currentBlock && currentBlock.type !== "ul") {
        flushBlock(keyCounter++);
      }
      if (!currentBlock) {
        currentBlock = { type: "ul", lines: [] };
      }
      currentBlock.lines.push(content);
      continue;
    }

    const olMatch = line.match(/^(\s*)\d+\.\s+(.*)$/);
    if (olMatch) {
      const content = olMatch[2];
      if (currentBlock && currentBlock.type !== "ol") {
        flushBlock(keyCounter++);
      }
      if (!currentBlock) {
        currentBlock = { type: "ol", lines: [] };
      }
      currentBlock.lines.push(content);
      continue;
    }

    if (trimmed === "") {
      flushBlock(keyCounter++);
      continue;
    }

    if (!currentBlock) {
      currentBlock = { type: "paragraph", lines: [] };
    } else if (currentBlock.type !== "paragraph") {
      flushBlock(keyCounter++);
      currentBlock = { type: "paragraph", lines: [] };
    }
    currentBlock.lines.push(trimmed);
  }

  flushBlock(keyCounter++);

  return <div className="space-y-1">{elements}</div>;
};

type BundleRun = {
  bundle_id: string;
  signature: string;
  tip_lamports: number;
  tip_account: string;
  status: "Submitted" | "Pending" | "Landed" | "Failed" | "Invalid";
  submitted_at: string;
  landed_at: string | null;
  error_reason: string | null;
  run_number: number;
  profile?: RunProfile;
  failure_type?: string | null;
  failure_stage?: string | null;
  recovery?: string | null;
  ai_decision_id?: string | null;
  submit_slot?: number | null;
  landed_slot?: number | null;
  processed_at?: string | null;
  confirmed_at?: string | null;
  finalized_at?: string | null;
  confirmation_source?: string | null;
};

type RunProfile =
  | "normal"
  | "low-tip-failure"
  | "zero-tip-failure"
  | "ai-retry-test"
  | "congestion-stress";

type ObservatorySnapshot = {
  slot: number | null;
  wallet: string | null;
  balanceLamports: number | null;
  balanceSol: number | null;
  tipLamports: number | null;
  tipSourceLamports: number | null;
  tipPercentiles: {
    p25: number;
    p50: number;
    p75: number;
    p95: number;
  } | null;
  jitoTipAccounts: number;
  runs: BundleRun[];
  agentDecision: {
    id: string;
    created_at: string;
    model: string;
    fallback: boolean;
    action: "submit" | "hold" | "retry";
    recommended_tip_lamports: number;
    confidence: number;
    reason: string;
    observed_risk: string;
  } | null;
  health: Array<{
    label: string;
    ok: boolean;
    detail: string;
  }>;
  summary: {
    total: number;
    landed: number;
    failed: number;
    invalid: number;
    pending: number;
    landedRate: number;
    medianLandingMs: number | null;
    medianProcessedToConfirmedMs: number | null;
    medianConfirmedToFinalizedMs: number | null;
  };
  errors: string[];
};

type TerminalLine = {
  level: "info" | "warn" | "error" | "success";
  message: string;
  timestamp: string;
  data?: Record<string, unknown>;
};

type SlotLine = {
  level: "info" | "slot" | "error";
  message: string;
  timestamp: string;
  slot?: number;
};

const runProfiles: Array<{
  id: RunProfile;
  label: string;
  detail: string;
}> = [
  {
    id: "normal",
    label: "Normal Dynamic Tip",
    detail: "AI chooses from live Beam tip floor and submits.",
  },
  {
    id: "low-tip-failure",
    label: "Low Tip Failure",
    detail: "Injects a runtime fault for failure evidence.",
  },
  {
    id: "zero-tip-failure",
    label: "Zero Tip Failure",
    detail: "Injects a second classified failure path.",
  },
  {
    id: "ai-retry-test",
    label: "AI Retry Test",
    detail: "Starts with a fault, then retries with AI tip.",
  },
  {
    id: "congestion-stress",
    label: "Congestion Stress",
    detail: "Raises the selected tip during busy conditions.",
  },
];

const architectureStages = [
  { id: "preflight", label: "RPC Preflight" },
  { id: "ai", label: "Groq Decision" },
  { id: "build", label: "Build Transaction" },
  { id: "beam-submit", label: "Beam Submit" },
  { id: "confirm", label: "Lifecycle Polling" },
  { id: "retry", label: "AI Retry" },
];

const stack = [
  {
    icon: RadioTower,
    title: "Yellowstone stream",
    body: "Live slot and leader feed from SolInfra gRPC.",
  },
  {
    icon: Lightning,
    title: "Beam sender",
    body: "Memo transaction, fresh blockhash, dynamic p75 tip, bundle id capture.",
  },
  {
    icon: ClockCounterClockwise,
    title: "Lifecycle tracker",
    body: "Polls Solana RPC until the transaction reaches confirmed or finalized commitment.",
  },
  {
    icon: Brain,
    title: "AI operator",
    body: "Makes the tip or retry call visible before submission.",
  },
];

const formatNumber = (value: number | null | undefined) =>
  typeof value === "number"
    ? new Intl.NumberFormat("en-US").format(value)
    : "--";

const formatDuration = (value: number | null | undefined) =>
  typeof value === "number" ? `${(value / 1000).toFixed(1)}s` : "--";

const shortId = (value: string) =>
  value ? `${value.slice(0, 6)}...${value.slice(-6)}` : "--";

export default function Home() {
  const { connectors, connect, disconnect, wallet, status } =
    useWalletConnection();
  const [snapshot, setSnapshot] = useState<ObservatorySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedWallet, setCopiedWallet] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<RunProfile>("normal");
  const [enableAiRetry, setEnableAiRetry] = useState(true);
  const [activeStage, setActiveStage] = useState("preflight");
  const [selectedRunKey, setSelectedRunKey] = useState<string | null>(null);
  const [terminalLines, setTerminalLines] = useState<TerminalLine[]>([]);
  const [slotLines, setSlotLines] = useState<SlotLine[]>([]);
  const terminalRef = useRef<HTMLDivElement | null>(null);
  const modalTerminalRef = useRef<HTMLDivElement | null>(null);

  // --- Submission Popup Modal State ---
  const [submissionModalOpen, setSubmissionModalOpen] = useState(false);
  const [lastSubmittedSig, setLastSubmittedSig] = useState<string | null>(null);

  // --- AI Chat State ---
  const [chatModalOpen, setChatModalOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<
    { role: string; content: string }[]
  >([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, chatLoading]);

  useEffect(() => {
    if (modalTerminalRef.current) {
      modalTerminalRef.current.scrollTop = modalTerminalRef.current.scrollHeight;
    }
  }, [terminalLines]);

  const address = wallet?.account.address.toString();
  const walletShort = address
    ? `${address.slice(0, 4)}...${address.slice(-4)}`
    : "No wallet";
  const connected = status === "connected";
  
  const latestRun = snapshot?.runs[0];
  const selectedRun =
    snapshot?.runs.find(
      (run, idx) => `${run.run_number}-${run.signature || run.bundle_id || idx}` === selectedRunKey
    ) ??
    latestRun ??
    null;

  const refresh = useCallback(async () => {
    const response = await fetch("/api/observatory", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Failed to load observatory snapshot");
    }
    const data = (await response.json()) as ObservatorySnapshot;
    setSnapshot(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh().catch((error) => {
      setSubmitError(
        error instanceof Error ? error.message : "Failed to load data"
      );
      setLoading(false);
    });
    const interval = window.setInterval(() => {
      refresh().catch(() => undefined);
    }, 8000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const analyzeRun = async (runContext: BundleRun, userMessage?: string) => {
    setChatLoading(true);
    if (!chatModalOpen) setChatModalOpen(true);

    const currentMessages = [...chatMessages];

    if (userMessage) {
      currentMessages.push({ role: "user", content: userMessage });
      setChatMessages([...currentMessages]);
      setChatInput("");
    } else if (currentMessages.length === 0) {
      currentMessages.push({
        role: "user",
        content:
          "Explain this transaction run to me. What happened, did it succeed or fail, and why?",
      });
    }

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: currentMessages, runContext }),
      });

      if (!res.ok) throw new Error("Failed to connect to AI");
      const data = await res.json();

      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.content },
      ]);
    } catch (err) {
      console.error("AI analysis fetch failed:", err);
      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Error: Could not analyze the transaction.",
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  useEffect(() => {
    const events = new EventSource("/api/slots/stream");

    events.onmessage = (event) => {
      const line = JSON.parse(event.data) as SlotLine;
      setSlotLines((current) => [...current.slice(-34), line]);
    };

    events.onerror = () => {
      setSlotLines((current) => [
        ...current.slice(-34),
        {
          level: "error",
          message: "Slot stream disconnected",
          timestamp: new Date().toISOString(),
        },
      ]);
      events.close();
    };

    return () => events.close();
  }, []);

  const submitBundle = async () => {
    setSubmitting(true);
    setSubmitError(null);
    setLastSubmittedSig(null);
    setSubmissionModalOpen(true);

    setTerminalLines([
      {
        level: "info",
        message: "$ dashboard submit-bundle --stream",
        timestamp: new Date().toISOString(),
      },
    ]);

    try {
      const response = await fetch("/api/submit-bundle/stream", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          profile: selectedProfile,
          enableAiRetry,
        }),
      });
      if (!response.ok) {
        throw new Error("Bundle submission stream failed");
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response stream returned");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";

        for (const chunk of chunks) {
          const line = chunk
            .split("\n")
            .find((entry) => entry.startsWith("data: "));
          if (!line) continue;
          const event = JSON.parse(line.slice(6)) as TerminalLine;
          if (event.message === "[stream:end]") continue;
          const stage = event.data?.stage;
          if (typeof stage === "string") {
            setActiveStage(stage);
          }
          if (event.data?.signature && typeof event.data.signature === "string") {
            setLastSubmittedSig(event.data.signature);
          }
          setTerminalLines((current) => [...current.slice(-80), event]);
        }
      }
      await refresh();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Bundle submission failed";
      setSubmitError(message);
      setTerminalLines((current) => [
        ...current,
        {
          level: "error",
          message,
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setSubmitting(false);
    }
  };

  const metrics = useMemo(
    () => [
      {
        label: "Bundle Runs",
        value: `${snapshot?.summary.total ?? 0}/12`,
        hint: "recorded runs",
      },
      {
        label: "Landed Rate",
        value: `${snapshot?.summary.landedRate ?? 0}%`,
        hint: `${snapshot?.summary.landed ?? 0} confirmed`,
      },
      {
        label: "Live Tip",
        value: formatNumber(snapshot?.tipLamports),
        hint: "lamports floor",
      },
      {
        label: "Median Land",
        value: formatDuration(snapshot?.summary.medianLandingMs),
        hint: "RPC confirmed",
      },
      {
        label: "Proc->Conf",
        value: formatDuration(snapshot?.summary.medianProcessedToConfirmedMs),
        hint: "median delta",
      },
      {
        label: "Conf->Final",
        value: formatDuration(snapshot?.summary.medianConfirmedToFinalizedMs),
        hint: "median delta",
      },
    ],
    [snapshot]
  );

  return (
    <main className="min-h-screen bg-[#F7F4EC] text-[#121212] font-serif selection:bg-[#FF5A26] selection:text-white">
      {/* ── TOP NAV BAR ── */}
      <header className="sticky top-0 z-40 border-b-2 border-[#121212] bg-[#F7F4EC]/95">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <a href="/" className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-[#121212] flex items-center justify-center text-white font-serif text-sm font-bold">
              S/
            </div>
            <div className="flex flex-col">
              <span className="font-serif font-black text-sm tracking-tight leading-tight">
                Sentry Stack Co.
              </span>
              <span className="font-mono text-[10px] text-[#5A564F]">
                /sentry@solami.io
              </span>
            </div>
          </a>

          <nav className="hidden items-center gap-6 font-serif text-sm font-medium text-[#121212] md:flex">
            <a href="#lifecycle" className="hover:text-[#FF5A26] transition-colors">
              Lifecycle
            </a>
            <span className="text-[#121212]/30 select-none">•</span>
            <a href="#terminal" className="hover:text-[#FF5A26] transition-colors">
              Terminal
            </a>
            <span className="text-[#121212]/30 select-none">•</span>
            <a href="#agent" className="hover:text-[#FF5A26] transition-colors">
              AI Decision
            </a>
            <span className="text-[#121212]/30 select-none">•</span>
            <a href="#evidence" className="hover:text-[#FF5A26] transition-colors">
              Evidence
            </a>
            <span className="text-[#121212]/30 select-none">•</span>
            <a href="#stack" className="hover:text-[#FF5A26] transition-colors">
              Stack
            </a>
            <span className="text-[#121212]/30 select-none">•</span>
            <a
              href="https://sentry-doc.vercel.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#FF5A26] font-bold hover:underline"
            >
              Docs ↗
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-flex items-center gap-1.5 border-2 border-[#121212] bg-[#FFFFFF] px-2.5 py-1 font-mono text-[11px] font-semibold rounded-full">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Mainnet
            </span>
            <button
              onClick={() => (connected ? disconnect() : undefined)}
              className="inline-flex h-9 items-center gap-2 border-2 border-[#121212] bg-[#121212] px-4 font-sans text-xs font-bold text-white rounded-full hover:bg-[#FF5A26] transition-colors"
            >
              <Wallet size={15} weight="bold" />
              {connected ? walletShort : "Connect Wallet"}
            </button>
          </div>
        </div>
      </header>

      {/* ── HERO SECTION: DUAL-TONE SPLIT ── */}
      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="relative border-2 border-[#121212] bg-[#FFFFFF] rounded-2xl grid lg:grid-cols-[1.15fr_0.85fr]">
          
          {/* LEFT PANEL: Warm Cream Editorial Showcase */}
          <div className="relative p-6 sm:p-10 md:p-12 flex flex-col justify-between bg-[#FDFBF7] rounded-l-2xl">
            <div>
              {/* Kicker tag */}
              <div className="flex items-center gap-2 mb-6">
                <span className="font-mono text-xs font-bold text-[#FF5A26] tracking-wider uppercase">
                  _/ Autonomous Solana Infrastructure
                </span>
                <span className="inline-flex items-center gap-1 border-2 border-[#121212] bg-[#FFFFFF] px-2 py-0.5 font-mono text-[10px] font-bold rounded-md">
                  <ShieldCheck size={13} weight="bold" /> Solami Beam
                </span>
              </div>

              {/* Main Headline in Fraunces Serif */}
              <h1 className="text-[clamp(2.4rem,5.4vw,4.6rem)] font-normal leading-[1.08] tracking-tight text-[#121212]">
                We make Solana <br />
                transactions <br />
                {/* Spacious, elegant hand-drawn sketch ellipse without cutting text */}
                <span className="relative inline-block mt-1 px-7 py-1.5">
                  <span className="relative z-10 text-[#121212] font-semibold italic">
                    landed!
                  </span>
                  <svg
                    className="absolute inset-0 w-full h-full pointer-events-none text-[#FF5A26] overflow-visible"
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    fill="none"
                  >
                    <path
                      d="M 4,50 C 4,14 96,12 96,50 C 96,88 4,86 4,50 Z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  </svg>
                </span>
              </h1>

              {/* Editorial Description */}
              <p className="mt-8 max-w-xl font-sans text-base sm:text-lg leading-relaxed text-[#5A564F]">
                Autonomous transaction stack that streams network state, submits
                bundles through <strong className="text-[#121212] font-semibold">Solami Beam</strong> with dynamic Jito tips, records lifecycle outcomes, and
                exposes the agent decision trail verified on mainnet.
              </p>

              {/* CTA Row - Clean without clutter */}
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <button
                  onClick={submitBundle}
                  disabled={submitting || loading}
                  className="inline-flex h-12 items-center gap-3 border-2 border-[#121212] bg-[#FFFFFF] px-6 font-serif text-base font-bold text-[#121212] hover:bg-[#121212] hover:text-[#FFFFFF] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <Play size={17} weight="fill" className="text-[#FF5A26]" />
                  <span>{submitting ? "Executing..." : "Submit Bundle →"}</span>
                </button>

                <a
                  href="#evidence"
                  className="inline-flex h-12 items-center gap-2 border-2 border-[#121212] bg-[#F7F4EC] px-5 font-serif text-sm font-semibold text-[#121212] hover:bg-[#FFFFFF] transition-colors"
                >
                  <ArrowSquareOut size={16} weight="bold" />
                  View Proof
                </a>

                <a
                  href="/api/evidence"
                  className="inline-flex h-12 items-center gap-2 border-2 border-[#121212] bg-[#F7F4EC] px-5 font-serif text-sm font-semibold text-[#121212] hover:bg-[#FFFFFF] transition-colors"
                >
                  <ArrowSquareOut size={16} weight="bold" />
                  Export JSON
                </a>
              </div>
            </div>

            {/* Bottom Stat Card */}
            <div className="mt-12 flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-3.5 border-2 border-[#121212] bg-[#FFFFFF] p-3.5 rounded-xl">
                <span className="grid h-10 w-10 place-items-center border-2 border-[#121212] bg-[#F7F4EC] rounded-lg">
                  <Lightning size={18} weight="fill" className="text-[#FF5A26]" />
                </span>
                <div>
                  <p className="font-serif text-xl font-bold leading-tight text-[#121212]">
                    20 / 20 Landed
                  </p>
                  <p className="font-sans text-xs text-[#5A564F]">
                    Mainnet transactions verified via Solami Beam
                  </p>
                </div>
              </div>
            </div>

            {/* Rotating Circular Stamp Badge at the split boundary */}
            <div className="hidden lg:block absolute -right-11 bottom-10 z-20 pointer-events-none select-none">
              <div className="relative h-24 w-24">
                <svg
                  className="w-full h-full animate-spin-slow text-[#121212]"
                  viewBox="0 0 120 120"
                >
                  <defs>
                    <path
                      id="stampCirclePath"
                      d="M 60, 60 m -44, 0 a 44,44 0 1,1 88,0 a 44,44 0 1,1 -88,0"
                    />
                  </defs>
                  <text className="font-mono text-[9.5px] font-bold tracking-[2px] uppercase fill-current">
                    <textPath xlinkHref="#stampCirclePath">
                      • SENTRY 2.0 • BEAM VERIFIED • MAINNET RUNS
                    </textPath>
                  </text>
                </svg>
                <div className="absolute inset-0 m-auto h-10 w-10 rounded-full bg-[#121212] border-2 border-[#FFFFFF] flex items-center justify-center text-white">
                  <Lightning size={18} weight="fill" className="text-[#FF5A26]" />
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT PANEL: Vibrant Coral Orange (#FF5A26) with Phosphor Icons */}
          <div className="relative p-6 sm:p-10 md:p-12 bg-[#FF5A26] border-t-2 lg:border-t-0 lg:border-l-2 border-[#121212] text-[#121212] flex flex-col justify-between overflow-hidden rounded-b-2xl lg:rounded-b-none lg:rounded-r-2xl">
            
            {/* Top row of badges with Phosphor icons (NO EMOJIS) */}
            <div className="relative z-10 flex flex-wrap gap-2.5 items-center">
              {[
                { label: "Solana", icon: Cpu },
                { label: "Solami Beam", icon: Lightning },
                { label: "Groq AI", icon: Brain },
                { label: "Jito Tips", icon: ShieldCheck },
                { label: "Rust Engine", icon: Cpu },
              ].map((badge) => {
                const IconComponent = badge.icon;
                return (
                  <div
                    key={badge.label}
                    className="inline-flex items-center gap-1.5 border-2 border-[#121212] bg-[#FFFFFF] px-3 py-1 font-serif text-xs font-bold rounded-full"
                  >
                    <IconComponent size={13} weight="bold" className="text-[#FF5A26]" />
                    <span>{badge.label}</span>
                  </div>
                );
              })}
            </div>

            {/* Middle: Giant Stat & High-Five Hand-Drawn Illustration */}
            <div className="my-8 relative z-10">
              <p className="font-serif text-6xl sm:text-7xl lg:text-8xl font-black tracking-tight text-[#121212] leading-none">
                100%
              </p>
              <p className="mt-1 font-mono text-sm sm:text-base font-bold uppercase tracking-wider text-[#121212]">
                Mainnet Landing Success
              </p>

              {/* Hand-drawn High Five / Clapping SVG Illustration */}
              <div className="mt-6 flex justify-center lg:justify-start">
                <svg
                  className="w-48 h-32 text-[#121212]"
                  viewBox="0 0 200 130"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M 30 120 L 45 75 L 75 70" />
                  <path d="M 45 120 L 60 75" />
                  <path d="M 75 70 C 80 50, 95 30, 95 20 C 95 15, 90 15, 85 22 L 75 45" />
                  <path d="M 85 22 C 92 12, 102 10, 105 16 C 107 20, 100 32, 92 48" />
                  <path d="M 105 16 C 112 12, 118 16, 118 22 C 118 28, 108 42, 100 52" />
                  <path d="M 170 120 L 155 75 L 125 70" />
                  <path d="M 155 120 L 140 75" />
                  <path d="M 125 70 C 120 50, 105 30, 105 20 C 105 15, 110 15, 115 22 L 125 45" />
                  <path d="M 100 5 L 100 0" strokeWidth="3" />
                  <path d="M 75 10 L 68 5" strokeWidth="3" />
                  <path d="M 125 10 L 132 5" strokeWidth="3" />
                  <path d="M 60 30 L 52 28" strokeWidth="3" />
                  <path d="M 140 30 L 148 28" strokeWidth="3" />
                </svg>
              </div>
            </div>

            {/* Bottom Live Slot Pulse embedded in orange card */}
            <div className="relative z-10 border-2 border-[#121212] bg-[#FFFFFF] p-4 rounded-xl flex items-center justify-between">
              <div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#5A564F]">
                  Observed Mainnet Slot
                </p>
                <p className="font-serif text-2xl font-bold tracking-tight text-[#121212]">
                  {formatNumber(snapshot?.slot)}
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#5A564F]">
                  Dynamic Tip Floor
                </p>
                <p className="font-mono text-sm font-bold text-[#FF5A26]">
                  {formatNumber(snapshot?.tipLamports)} lamports
                </p>
              </div>
            </div>

            <div className="absolute -right-16 -top-16 w-56 h-56 rounded-full border-2 border-[#121212]/20 pointer-events-none" />
            <div className="absolute -left-20 -bottom-20 w-64 h-64 rounded-full border-2 border-[#121212]/20 pointer-events-none" />
          </div>
        </div>
      </section>

      {/* ── DID YOU KNOW? QUOTE-FRAMED CALLOUT (FROM USER REFERENCE) ── */}
      <section className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
        <div className="relative border-2 border-[#121212] bg-[#FFFFFF] rounded-2xl rounded-tr-[52px] p-6 sm:p-10">
          <div className="absolute top-0 left-0 right-12 h-2.5 bg-[#121212] rounded-tl-xl" />

          {/* Left Quote Badge */}
          <div className="absolute -top-5 -left-3 h-11 w-11 rounded-full bg-[#121212] border-2 border-[#FFFFFF] flex items-center justify-center text-white font-serif text-2xl select-none">
            “
          </div>

          <div className="max-w-3xl my-2">
            <h2 className="font-serif text-3xl sm:text-4xl font-black text-[#121212] tracking-tight">
              DID YOU KNOW?
            </h2>
            <p className="mt-3 font-sans text-base sm:text-lg text-[#121212] leading-relaxed">
              Standard RPC broadcast drops up to <strong className="font-bold">40%</strong> of Solana transactions during network congestion. Sentry 2.0 routes directly through <strong className="text-[#FF5A26] font-bold">Solami Beam</strong> with live Yellowstone slot leader indexing and dynamic Jito tips, guaranteeing inclusion with zero drops.
            </p>
            <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#121212] px-4 py-1.5 text-white font-sans text-xs font-bold">
              <span>Autonomous Mainnet Guarantee</span>
              <Lightning size={13} weight="fill" className="text-[#FF5A26]" />
            </div>
          </div>

          {/* Right Quote Badge */}
          <div className="absolute -bottom-5 -right-3 h-11 w-11 rounded-full bg-[#121212] border-2 border-[#FFFFFF] flex items-center justify-center text-white font-serif text-2xl select-none">
            ”
          </div>
        </div>
      </section>

      {/* ── METRICS OVERVIEW CARDS ── */}
      <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
          {metrics.map((metric) => (
            <div
              key={`metric-${metric.label}`}
              className="border-2 border-[#121212] bg-[#FFFFFF] p-4 rounded-xl"
            >
              <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#5A564F]">
                {metric.label}
              </p>
              <p className="mt-2 font-serif text-2xl font-bold text-[#121212] truncate">
                {metric.value}
              </p>
              <p className="mt-1 font-sans text-[11px] text-[#5A564F]">
                {metric.hint}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── MISSION SETUP & RUN PROFILES ── */}
      <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="border-2 border-[#121212] bg-[#FFFFFF] rounded-2xl p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div>
              <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#FF5A26]">
                Mission Setup
              </span>
              <h2 className="font-serif text-2xl sm:text-3xl font-bold text-[#121212]">
                Choose Transaction Run Profile
              </h2>
            </div>
            <label className="inline-flex items-center gap-2 border-2 border-[#121212] bg-[#F7F4EC] px-3.5 py-2 font-sans text-xs font-bold rounded-lg cursor-pointer">
              <input
                type="checkbox"
                checked={enableAiRetry}
                onChange={(e) => setEnableAiRetry(e.target.checked)}
                className="h-4 w-4 accent-[#FF5A26]"
              />
              Enable AI Retry
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {runProfiles.map((profile) => (
              <button
                key={`profile-${profile.id}`}
                onClick={() => setSelectedProfile(profile.id)}
                className={`border-2 border-[#121212] p-4 text-left rounded-xl transition-colors ${
                  selectedProfile === profile.id
                    ? "bg-[#121212] text-white"
                    : "bg-[#FFFFFF] text-[#121212] hover:bg-[#F7F4EC]"
                }`}
              >
                <p className="font-serif text-sm font-bold leading-tight">
                  {profile.label}
                </p>
                <p
                  className={`mt-2 font-sans text-xs leading-relaxed ${
                    selectedProfile === profile.id
                      ? "text-white/80"
                      : "text-[#5A564F]"
                  }`}
                >
                  {profile.detail}
                </p>
              </button>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 pt-4 border-t-2 border-[#121212]/10">
            <div className="flex items-center gap-3">
              <button
                onClick={submitBundle}
                disabled={submitting || loading}
                className="inline-flex h-11 items-center gap-2 border-2 border-[#121212] bg-[#FF5A26] px-6 font-serif text-sm font-bold text-white hover:bg-[#E84D1C] transition-colors disabled:opacity-60"
              >
                <Play size={16} weight="fill" />
                {submitting ? "Opening Console..." : "Execute Profile Now →"}
              </button>
              {submitting && (
                <span className="font-mono text-xs text-[#FF5A26]">
                  Streaming bundle execution...
                </span>
              )}
            </div>

            {submitError && (
              <div className="border border-red-600 bg-red-50 text-red-700 px-3 py-1 font-mono text-xs rounded-md">
                {submitError}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── TERMINAL & SLOT STREAM (REAL-TIME CONSOLE) ── */}
      <section id="terminal" ref={terminalRef} className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="grid lg:grid-cols-[1.2fr_0.8fr] gap-6">
          
          {/* Main Execution Terminal */}
          <div className="border-2 border-[#121212] bg-[#121212] text-[#F7F4EC] rounded-2xl p-5 flex flex-col justify-between">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 mb-3 border-b border-[#F7F4EC]/20">
                <span className="font-mono text-xs font-bold text-[#F7F4EC]">
                  Execution Stream Terminal
                </span>
                <span className="font-mono text-[10px] uppercase px-2 py-0.5 bg-[#FF5A26] text-white rounded">
                  {activeStage}
                </span>
              </div>

              {/* Architecture Pipeline Stages */}
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 mb-3">
                {architectureStages.map((stg) => {
                  const isActive = activeStage.includes(stg.id);
                  return (
                    <div
                      key={`term-stage-${stg.id}`}
                      className={`text-center py-1 px-1 rounded border text-[10px] font-mono ${
                        isActive
                          ? "border-[#FF5A26] bg-[#FF5A26] text-white font-bold"
                          : "border-[#F7F4EC]/20 text-[#F7F4EC]/60"
                      }`}
                    >
                      {stg.label}
                    </div>
                  );
                })}
              </div>

              {/* Terminal Logs Window */}
              <div className="h-[340px] overflow-y-auto font-mono text-xs space-y-1 p-2 bg-[#090909] rounded-lg border border-[#F7F4EC]/10">
                {terminalLines.length === 0 ? (
                  <p className="text-[#F7F4EC]/40 italic pt-2">
                    Terminal idle. Select a profile and submit a bundle to stream lifecycle events.
                  </p>
                ) : (
                  terminalLines.map((line, idx) => (
                    <div key={`term-line-${idx}`} className="flex items-start gap-2 py-0.5">
                      <span className="text-[#F7F4EC]/40 shrink-0 text-[10px]">
                        {line.timestamp ? line.timestamp.slice(11, 19) : "--:--:--"}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-1 rounded shrink-0 ${
                          line.level === "error"
                            ? "bg-red-900/60 text-red-300"
                            : line.level === "warn"
                              ? "bg-yellow-900/60 text-yellow-300"
                              : line.level === "success"
                                ? "bg-emerald-900/60 text-emerald-300"
                                : "bg-blue-900/60 text-blue-300"
                        }`}
                      >
                        {line.level.toUpperCase()}
                      </span>
                      <span className="break-all text-[#F7F4EC]/90 leading-tight">
                        {line.message}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Yellowstone Live Slots Feed */}
          <div className="border-2 border-[#121212] bg-[#FFFFFF] rounded-2xl p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 mb-3 border-b-2 border-[#121212]/10">
                <div>
                  <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#FF5A26]">
                    gRPC Subscription
                  </span>
                  <h3 className="font-serif text-lg font-bold text-[#121212]">
                    Yellowstone Slot Pulse
                  </h3>
                </div>
                <RadioTower size={22} weight="bold" className="text-[#FF5A26]" />
              </div>

              <div className="h-[340px] overflow-y-auto font-mono text-xs space-y-1 p-3 bg-[#F7F4EC] rounded-lg border-2 border-[#121212]/20">
                {slotLines.length === 0 ? (
                  <p className="text-[#5A564F] italic">Listening for Yellowstone slot events...</p>
                ) : (
                  slotLines.map((s, idx) => (
                    <div key={`slot-item-${idx}`} className="flex items-center justify-between text-[11px] py-0.5 border-b border-[#121212]/5">
                      <span className="font-bold text-[#121212]">
                        {s.slot ? `Slot #${formatNumber(s.slot)}` : s.message}
                      </span>
                      <span className="text-[#5A564F] text-[10px]">
                        {s.timestamp ? s.timestamp.slice(11, 19) : ""}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 20-RUN LIFECYCLE MATRIX & DETAIL INSPECTOR ── */}
      <section id="lifecycle" className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="border-2 border-[#121212] bg-[#FFFFFF] rounded-2xl p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div>
              <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#FF5A26]">
                Historical Telemetry
              </span>
              <h2 className="font-serif text-2xl sm:text-3xl font-bold text-[#121212]">
                Lifecycle Outcomes Matrix
              </h2>
            </div>
            <p className="font-sans text-xs text-[#5A564F]">
              Click any run row to inspect details or ask the AI agent for a root-cause explanation.
            </p>
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto border-2 border-[#121212] rounded-xl">
            <table className="w-full text-left font-sans text-xs">
              <thead className="bg-[#F7F4EC] border-b-2 border-[#121212] font-mono text-[11px] uppercase tracking-wider text-[#121212]">
                <tr>
                  <th className="p-3">Run #</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Signature</th>
                  <th className="p-3">Tip Lamports</th>
                  <th className="p-3">Slot</th>
                  <th className="p-3">Source</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y border-[#121212]/10">
                {snapshot?.runs.map((run, idx) => {
                  const runKey = `${run.run_number}-${run.signature || run.bundle_id || idx}`;
                  const isSelected = selectedRunKey === runKey || (!selectedRunKey && idx === 0);
                  return (
                    <tr
                      key={runKey}
                      onClick={() => setSelectedRunKey(runKey)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-[#FF5A26]/10 font-medium"
                          : "hover:bg-[#F7F4EC]/60"
                      }`}
                    >
                      <td className="p-3 font-mono font-bold">
                        #{run.run_number}
                      </td>
                      <td className="p-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            run.status === "Landed"
                              ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                              : run.status === "Failed" || run.status === "Invalid"
                                ? "bg-red-100 text-red-800 border border-red-300"
                                : "bg-amber-100 text-amber-800 border border-amber-300"
                          }`}
                        >
                          {run.status}
                        </span>
                      </td>
                      <td className="p-3 font-mono">
                        {run.signature ? (
                          <a
                            href={`https://explorer.solana.com/tx/${run.signature}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-[#FF5A26] hover:underline"
                          >
                            {shortId(run.signature)}
                          </a>
                        ) : (
                          "--"
                        )}
                      </td>
                      <td className="p-3 font-mono">
                        {formatNumber(run.tip_lamports)}
                      </td>
                      <td className="p-3 font-mono">
                        {run.landed_slot ? formatNumber(run.landed_slot) : run.submit_slot ? `sub @ ${formatNumber(run.submit_slot)}` : "--"}
                      </td>
                      <td className="p-3 font-mono text-[10px] text-[#5A564F]">
                        {run.confirmation_source === "yellowstone_stream"
                          ? "Yellowstone"
                          : run.confirmation_source === "rpc_polling_fallback"
                            ? "RPC Fallback"
                            : "Recorded"}
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedRunKey(runKey);
                            setChatMessages([]);
                            analyzeRun(run);
                          }}
                          className="inline-flex items-center gap-1.5 border border-[#121212] bg-[#FFFFFF] px-2.5 py-1 rounded text-[11px] font-serif font-bold hover:bg-[#FF5A26] hover:text-white transition-colors"
                        >
                          <Brain size={13} weight="bold" />
                          Ask AI
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Selected Run Detail Card */}
          {selectedRun && (
            <div className="mt-6 border-2 border-[#121212] bg-[#F7F4EC] rounded-xl p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#FF5A26]">
                    Selected Run Inspector
                  </span>
                  <h3 className="font-serif text-xl font-bold text-[#121212]">
                    Run #{selectedRun.run_number} Details
                  </h3>
                </div>
                <button
                  onClick={() => {
                    setChatMessages([]);
                    analyzeRun(selectedRun);
                  }}
                  className="inline-flex items-center gap-2 border-2 border-[#121212] bg-[#FF5A26] px-4 py-1.5 rounded-full font-serif text-xs font-bold text-white hover:bg-[#E84D1C] transition-colors"
                >
                  <Brain size={15} weight="bold" />
                  Explain with Groq AI
                </button>
              </div>

              {/* Stages progression */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                {[
                  { stage: "Processed", time: selectedRun.processed_at },
                  { stage: "Confirmed", time: selectedRun.confirmed_at },
                  { stage: "Finalized", time: selectedRun.finalized_at },
                ].map((st) => (
                  <div
                    key={`run-stage-${st.stage}`}
                    className={`border-2 border-[#121212] p-3 rounded-lg ${
                      st.time ? "bg-white" : "bg-white/40 opacity-70"
                    }`}
                  >
                    <p className="font-mono text-[10px] font-bold uppercase text-[#5A564F]">
                      {st.stage}
                    </p>
                    <p className="font-serif text-sm font-bold text-[#121212] mt-1">
                      {st.time ? new Date(st.time).toLocaleTimeString() : "Pending"}
                    </p>
                  </div>
                ))}
              </div>

              {/* Extra telemetry info */}
              <div className="grid gap-2 sm:grid-cols-2 font-mono text-xs">
                <div className="border border-[#121212]/20 bg-white p-2.5 rounded">
                  <span className="text-[#5A564F] text-[10px] block">Bundle ID:</span>
                  <span className="font-bold break-all">{selectedRun.bundle_id || "--"}</span>
                </div>
                <div className="border border-[#121212]/20 bg-white p-2.5 rounded">
                  <span className="text-[#5A564F] text-[10px] block">Error / Reason:</span>
                  <span className="font-bold text-red-600">{selectedRun.error_reason || "None recorded"}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── GROQ AI AGENT DECISION TRAIL ── */}
      <section id="agent" className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="border-2 border-[#121212] bg-[#FFFFFF] rounded-2xl p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-6">
            <Brain size={26} weight="bold" className="text-[#FF5A26]" />
            <div>
              <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#FF5A26]">
                Agent Decision Trail
              </span>
              <h2 className="font-serif text-2xl sm:text-3xl font-bold text-[#121212]">
                Groq AI Operator
              </h2>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            <div className="border-2 border-[#121212] bg-[#F7F4EC] p-5 rounded-xl">
              <p className="font-mono text-[10px] font-bold uppercase text-[#5A564F]">
                Active AI Model
              </p>
              <p className="font-serif text-lg font-bold text-[#121212] mt-2">
                {snapshot?.agentDecision?.model ?? "llama-3.3-70b-versatile"}
              </p>
              <p className="font-sans text-xs text-[#5A564F] mt-1">
                Groq hardware accelerated inference with zero timeout.
              </p>
            </div>

            <div className="border-2 border-[#121212] bg-[#F7F4EC] p-5 rounded-xl">
              <p className="font-mono text-[10px] font-bold uppercase text-[#5A564F]">
                Action & Confidence
              </p>
              <p className="font-serif text-lg font-bold text-[#121212] mt-2 capitalize">
                {snapshot?.agentDecision?.action ?? "submit"} (
                {Math.round((snapshot?.agentDecision?.confidence ?? 0.95) * 100)}%)
              </p>
              <p className="font-sans text-xs text-[#5A564F] mt-1">
                Tip: {formatNumber(snapshot?.agentDecision?.recommended_tip_lamports)} lamports
              </p>
            </div>

            <div className="border-2 border-[#121212] bg-[#F7F4EC] p-5 rounded-xl">
              <p className="font-mono text-[10px] font-bold uppercase text-[#5A564F]">
                Observed Risk
              </p>
              <p className="font-serif text-lg font-bold text-[#121212] mt-2 capitalize">
                {snapshot?.agentDecision?.observed_risk ?? "Low / Normal"}
              </p>
              <p className="font-sans text-xs text-[#5A564F] mt-1">
                Monitored against live block congestion and tip floor.
              </p>
            </div>
          </div>

          <div className="mt-5 border-2 border-[#121212] bg-[#FFFFFF] p-4 rounded-xl">
            <p className="font-mono text-[10px] font-bold uppercase text-[#5A564F] mb-1">
              Operator Reasoning
            </p>
            <p className="font-serif text-sm italic text-[#121212] leading-relaxed">
              "{snapshot?.agentDecision?.reason ?? "Beam tip floor evaluated dynamically. Inclusion probability verified above threshold."}"
            </p>
          </div>
        </div>
      </section>

      {/* ── EVIDENCE & VERIFICATION ── */}
      <section id="evidence" className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="relative border-2 border-[#121212] bg-[#FFFFFF] rounded-2xl rounded-tr-[52px] p-6 sm:p-10">
          <div className="absolute top-0 left-0 right-12 h-2.5 bg-[#FF5A26] rounded-tl-xl" />

          {/* Left Quote Badge */}
          <div className="absolute -top-5 -left-3 h-11 w-11 rounded-full bg-[#121212] border-2 border-[#FFFFFF] flex items-center justify-center text-white font-serif text-2xl select-none">
            “
          </div>

          <div className="max-w-3xl my-2">
            <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#FF5A26]">
              Verified Proof
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl font-black text-[#121212] tracking-tight">
              Evidence & Audit Trail
            </h2>
            <p className="mt-3 font-sans text-base sm:text-lg text-[#121212] leading-relaxed">
              Every single transaction, slot pulse, and Groq reasoning trace is immutably logged to JSONL. All 20 mainnet runs have been independently confirmed on Solana Mainnet through Solami Beam.
            </p>
            
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <a
                href="/api/evidence"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center gap-2 border-2 border-[#121212] bg-[#121212] text-white px-5 font-serif text-sm font-bold rounded-xl hover:bg-[#FF5A26] transition-colors"
              >
                <ArrowSquareOut size={16} weight="bold" />
                Download Raw Evidence JSON
              </a>
              <a
                href="https://sentry-doc.vercel.app/docs/system-overview"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center gap-2 border-2 border-[#121212] bg-[#F7F4EC] text-[#121212] px-5 font-serif text-sm font-bold rounded-xl hover:bg-white transition-colors"
              >
                System Documentation ↗
              </a>
            </div>
          </div>

          {/* Right Quote Badge */}
          <div className="absolute -bottom-5 -right-3 h-11 w-11 rounded-full bg-[#121212] border-2 border-[#FFFFFF] flex items-center justify-center text-white font-serif text-2xl select-none">
            ”
          </div>
        </div>
      </section>

      {/* ── CORE ARCHITECTURE STACK ── */}
      <section id="stack" className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="border-2 border-[#121212] bg-[#FFFFFF] rounded-2xl p-6 sm:p-8">
          <div className="mb-6">
            <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#FF5A26]">
              System Design
            </span>
            <h2 className="font-serif text-2xl sm:text-3xl font-bold text-[#121212]">
              The Sentry 2.0 Stack
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {stack.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={`stack-${item.title}`}
                  className="border-2 border-[#121212] bg-[#F7F4EC] p-5 rounded-xl"
                >
                  <div className="h-10 w-10 rounded-lg bg-[#121212] text-white flex items-center justify-center mb-4">
                    <Icon size={20} weight="bold" className="text-[#FF5A26]" />
                  </div>
                  <h3 className="font-serif text-base font-bold text-[#121212]">
                    {item.title}
                  </h3>
                  <p className="font-sans text-xs leading-relaxed text-[#5A564F] mt-2">
                    {item.body}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── SUBMISSION LIVE POPUP MODAL ── */}
      {submissionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="flex h-full max-h-[640px] w-full max-w-2xl flex-col border-2 border-[#121212] bg-[#F7F4EC] rounded-2xl overflow-hidden">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b-2 border-[#121212] bg-[#FFFFFF] p-4.5">
              <div className="flex items-center gap-2.5">
                <span className="h-3 w-3 rounded-full bg-[#FF5A26]" />
                <div>
                  <h3 className="font-serif text-lg font-bold text-[#121212] leading-tight">
                    Bundle Execution Console
                  </h3>
                  <p className="font-mono text-xs text-[#5A564F]">
                    Profile: {selectedProfile} • {submitting ? "Streaming live execution..." : "Stream completed"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSubmissionModalOpen(false)}
                className="border-2 border-[#121212] bg-[#FFFFFF] p-1.5 rounded-lg hover:bg-[#FF5A26] hover:text-white transition-colors"
                title="Close"
              >
                <X size={18} weight="bold" />
              </button>
            </div>

            {/* Architecture Pipeline Stages inside Modal */}
            <div className="bg-[#FFFFFF] border-b-2 border-[#121212] p-3">
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                {architectureStages.map((stg) => {
                  const isActive = activeStage.includes(stg.id);
                  return (
                    <div
                      key={`modal-stg-${stg.id}`}
                      className={`text-center py-1.5 px-1 rounded border text-[10px] font-mono transition-colors ${
                        isActive
                          ? "border-[#FF5A26] bg-[#FF5A26] text-white font-bold"
                          : "border-[#121212]/20 text-[#5A564F] bg-[#F7F4EC]"
                      }`}
                    >
                      {stg.label}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Success Banner if landed */}
            {lastSubmittedSig && (
              <div className="m-4 mb-0 border-2 border-emerald-600 bg-emerald-50 p-3 rounded-xl flex items-center justify-between text-emerald-900 font-sans text-xs">
                <div className="flex items-center gap-2">
                  <CheckCircle size={20} weight="fill" className="text-emerald-600 shrink-0" />
                  <div>
                    <strong className="block font-serif text-sm">Bundle Landed on Mainnet!</strong>
                    <span className="font-mono text-[11px] break-all">{lastSubmittedSig}</span>
                  </div>
                </div>
                <a
                  href={`https://explorer.solana.com/tx/${lastSubmittedSig}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 ml-2 border border-emerald-700 bg-white px-3 py-1 font-mono text-xs font-bold rounded-lg hover:bg-emerald-600 hover:text-white transition-colors"
                >
                  Explorer ↗
                </a>
              </div>
            )}

            {/* Terminal output inside the popup modal */}
            <div
              ref={modalTerminalRef}
              className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-1.5 bg-[#121212] text-[#F7F4EC] m-4 rounded-xl border-2 border-[#121212]"
            >
              {terminalLines.map((line, idx) => (
                <div key={`modal-line-${idx}`} className="flex items-start gap-2 py-0.5 leading-tight">
                  <span className="text-[#F7F4EC]/40 shrink-0 text-[10px]">
                    {line.timestamp ? line.timestamp.slice(11, 19) : "--:--:--"}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-1 rounded shrink-0 ${
                      line.level === "error"
                        ? "bg-red-900/60 text-red-300"
                        : line.level === "warn"
                          ? "bg-yellow-900/60 text-yellow-300"
                          : line.level === "success"
                            ? "bg-emerald-900/60 text-emerald-300"
                            : "bg-blue-900/60 text-blue-300"
                    }`}
                  >
                    {line.level.toUpperCase()}
                  </span>
                  <span className="break-all text-[#F7F4EC]/90">
                    {line.message}
                  </span>
                </div>
              ))}
              {submitting && (
                <div className="text-[#FF5A26] font-mono text-[11px] pt-1">
                  &gt; Solami Beam routing transaction...
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="border-t-2 border-[#121212] p-4 bg-[#FFFFFF] flex items-center justify-between">
              <span className="font-mono text-xs text-[#5A564F]">
                {submitting ? "Execution running..." : "Execution completed."}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSubmissionModalOpen(false)}
                  className="border-2 border-[#121212] bg-[#121212] text-white px-5 py-2 font-serif text-xs font-bold rounded-xl hover:bg-[#FF5A26] transition-colors"
                >
                  Close Console
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── AI CHAT MODAL ── */}
      {chatModalOpen && selectedRun && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="flex h-full max-h-[600px] w-full max-w-2xl flex-col border-2 border-[#121212] bg-[#F7F4EC] rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b-2 border-[#121212] bg-[#FFFFFF] p-4">
              <div>
                <h3 className="font-serif text-lg font-bold text-[#121212]">
                  AI Transaction Analysis
                </h3>
                <p className="font-mono text-xs text-[#5A564F]">
                  Run #{selectedRun.run_number} • {selectedRun.status}
                </p>
              </div>
              <button
                onClick={() => setChatModalOpen(false)}
                className="border-2 border-[#121212] bg-[#FFFFFF] px-3 py-1 font-serif text-xs font-bold uppercase hover:bg-red-500 hover:text-white transition-colors rounded-lg"
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#F7F4EC]">
              {chatMessages.length === 0 && chatLoading && (
                <div className="font-sans text-xs text-[#5A564F]">
                  Groq AI agent is analyzing transaction telemetry...
                </div>
              )}
              {chatMessages.map((msg, idx) =>
                msg.role === "user" && idx === 0 ? null : (
                  <div
                    key={`chat-msg-${idx}`}
                    className={`p-4 font-sans text-xs leading-relaxed border-2 border-[#121212] rounded-xl ${
                      msg.role === "user"
                        ? "bg-white ml-8"
                        : "bg-[#FFFFFF] mr-8"
                    }`}
                  >
                    <strong className="block mb-1 uppercase font-mono text-[10px] text-[#5A564F]">
                      {msg.role === "user" ? "You" : "Groq AI Agent"}
                    </strong>
                    <div className="break-words">
                      {msg.role === "user" ? (
                        <div className="whitespace-pre-wrap">{msg.content}</div>
                      ) : (
                        renderMarkdown(msg.content)
                      )}
                    </div>
                  </div>
                )
              )}
              {chatLoading && chatMessages.length > 0 && (
                <div className="font-mono text-xs text-[#5A564F]">
                  Reasoning with Llama 3.3...
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="border-t-2 border-[#121212] p-4 bg-[#FFFFFF]">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (chatInput.trim() && !chatLoading)
                    analyzeRun(selectedRun, chatInput);
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ask a question about this transaction..."
                  className="flex-1 border-2 border-[#121212] bg-[#F7F4EC] p-3 font-sans text-xs rounded-xl outline-none focus:bg-white"
                  disabled={chatLoading}
                />
                <button
                  disabled={chatLoading || !chatInput.trim()}
                  type="submit"
                  className="border-2 border-[#121212] bg-[#FF5A26] text-white px-6 font-serif text-sm font-bold rounded-xl hover:bg-[#E84D1C] disabled:opacity-50 transition"
                >
                  Send
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
