"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  ArrowSquareOut,
  BookOpen,
  CheckCircle,
  Copy,
  Cpu,
  FlaskConical,
  Globe,
  GraduationCap,
  Lightbulb,
  List,
  LockKey,
  Play,
  Question,
  ShieldCheck,
  Trophy,
  X,
} from "../components/phosphor-icons";
import { CheckeredBorder, CheckeredGridBackground } from "../components/checkered-border";
import { LiveTestStageList, TaskDialogModal } from "../components/task-dialog";
import { LESSONS, Lesson, LabVariant } from "../components/academy/curriculum";
import { useAcademy } from "../components/academy/academy-store";

type TrainingNetwork = "mainnet" | "devnet";

const ONBOARDING_KEY = "sentry_training_dashboard_onboarded_v1";

const snippets: Record<string, string> = {
  "slots-blockhashes": `const latest = await connection.getLatestBlockhash("confirmed");
const slot = await connection.getSlot("processed");
const remaining = latest.lastValidBlockHeight - await connection.getBlockHeight();`,
  "sandbox-faucet": `const signature = await connection.requestAirdrop(
  sandbox.publicKey,
  0.5 * LAMPORTS_PER_SOL
);
await connection.confirmTransaction({ signature, ...latest }, "confirmed");`,
  "tx-lifecycle": `const message = new TransactionMessage({
  payerKey,
  recentBlockhash,
  instructions,
}).compileToV0Message();
const tx = new VersionedTransaction(message);`,
  "priority-fees": `const fees = await connection.getRecentPrioritizationFees();
const priorityLamports = Math.ceil((microLamports * cuLimit) / 1_000_000);`,
  "failure-modes": `if (failure.code === "BlockhashNotFound") {
  const fresh = await connection.getLatestBlockhash("confirmed");
  return rebuildAndResign(fresh.blockhash);
}`,
  "rpc-consistency": `const [processed, confirmed, finalized] = await Promise.all([
  connection.getSlot("processed"),
  connection.getSlot("confirmed"),
  connection.getSlot("finalized"),
]);`,
  "amm-quotes": `const quote = await swapQuoteByInputToken(
  pool,
  inputMint,
  amountIn,
  Percentage.fromFraction(50, 10_000),
);`,
  "multi-rail": `const outcomes = await Promise.allSettled(
  rails.map((rail) => rail.sendRawTransaction(signedBytes))
);`,
};

function lessonCleared(lesson: Lesson, progress: ReturnType<typeof useAcademy>["progress"]) {
  const labDone = (progress.completedLabs[lesson.lab.id] ?? []).length > 0;
  const answers = progress.quizAnswers[lesson.id] ?? {};
  const quizDone = lesson.quiz.every((question, index) => answers[index] === question.answer);
  return labDone && quizDone;
}

function unlockedLessonIndex(progress: ReturnType<typeof useAcademy>["progress"]) {
  let unlocked = 0;
  for (let index = 0; index < LESSONS.length; index += 1) {
    if (index === 0 || lessonCleared(LESSONS[index - 1], progress)) {
      unlocked = index;
    } else {
      break;
    }
  }
  return unlocked;
}

export default function DashboardPage() {
  const academy = useAcademy();
  const {
    progress,
    xp,
    maxXp,
    rank,
    nextRank,
    markLessonRead,
    answerQuiz,
    recordLabCompletion,
  } = academy;

  const [network, setNetwork] = useState<TrainingNetwork>("mainnet");
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);
  const [variant, setVariant] = useState<LabVariant | undefined>(undefined);
  const [labStatus, setLabStatus] = useState<"idle" | "running" | "completed" | "error">("idle");
  const [stageIndex, setStageIndex] = useState(0);
  const [labResult, setLabResult] = useState<Record<string, unknown> | null>(null);
  const [labError, setLabError] = useState<string | null>(null);

  const unlockedIndex = useMemo(() => unlockedLessonIndex(progress), [progress]);
  const activeLesson = LESSONS.find((lesson) => lesson.id === activeLessonId) ?? null;
  const cleared = LESSONS.filter((lesson) => lessonCleared(lesson, progress));
  const nextLesson = LESSONS.find((lesson, index) => index <= unlockedIndex && !lessonCleared(lesson, progress));
  const progressPct = Math.round((cleared.length / LESSONS.length) * 100);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setShowOnboarding(localStorage.getItem(ONBOARDING_KEY) !== "true");
  }, []);

  useEffect(() => {
    if (!activeLesson) return;
    markLessonRead(activeLesson.id);
    setVariant(activeLesson.lab.variants?.[0]);
    setLabStatus("idle");
    setStageIndex(0);
    setLabResult(null);
    setLabError(null);
  }, [activeLessonId]);

  const closeOnboarding = () => {
    localStorage.setItem(ONBOARDING_KEY, "true");
    setShowOnboarding(false);
  };

  const openLesson = (lesson: Lesson) => {
    const index = LESSONS.findIndex((item) => item.id === lesson.id);
    if (index > unlockedIndex) return;
    setActiveLessonId(lesson.id);
    setSidebarOpen(false);
  };

  const runLab = async () => {
    if (!activeLesson) return;

    setLabStatus("running");
    setStageIndex(0);
    setLabResult(null);
    setLabError(null);

    const timer = window.setInterval(() => {
      setStageIndex((current) => Math.min(current + 1, activeLesson.lab.stages.length - 1));
    }, 650);

    try {
      const response = await fetch("/api/academy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          network,
          lab: activeLesson.lab.id,
          params: variant?.params ?? {},
        }),
      });
      const json = (await response.json()) as Record<string, unknown>;
      window.clearInterval(timer);
      setStageIndex(activeLesson.lab.stages.length);

      if (!response.ok || json.error || json.ok === false) {
        setLabStatus("error");
        setLabError(String(json.error ?? "The lab returned an unsuccessful result."));
        setLabResult(json);
        return;
      }

      setLabStatus("completed");
      setLabResult(json);
      recordLabCompletion(activeLesson.lab.id, "devnet");
      markLessonRead(activeLesson.id);
    } catch (error) {
      window.clearInterval(timer);
      setLabStatus("error");
      setLabError(error instanceof Error ? error.message : "Unable to run the live lab.");
    }
  };

  const onboarding = [
    {
      title: "Overview first",
      body: "Track your rank, XP, network context, unlocked module, and completion pace from this page.",
    },
    {
      title: "Clear one module at a time",
      body: "Each module teaches the mechanism, shows a code pattern, runs a live Devnet lab, then checks understanding.",
    },
    {
      title: "Mainnet and Devnet context",
      body: "Use Mainnet mode for production framing and Devnet mode for safe live exercises backed by the existing academy API.",
    },
  ];

  return (
    <main className="sentry-bw min-h-screen bg-[#FFFFFF] text-[#121212] font-serif selection:bg-[#121212] selection:text-white">
      <div className="grid min-h-screen lg:h-screen lg:overflow-hidden lg:grid-cols-[310px_1fr]">
        <aside className="sticky top-0 z-40 border-b-2 border-[#121212] bg-[#FDFBF7] lg:static lg:z-auto lg:h-screen lg:overflow-hidden lg:border-b-0 lg:border-r-2">
          <div className="flex max-h-svh flex-col lg:h-full lg:max-h-none">
            <div className="flex items-center justify-between gap-3 border-b-2 border-[#121212] p-3 sm:p-4">
              <Link href="/" className="flex min-w-0 items-center gap-3 text-left">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden border-2 border-[#121212] bg-black">
                  <Image
                    src="/Sentry-logo.png"
                    alt="Sentry"
                    width={32}
                    height={32}
                    className="h-7 w-7 object-contain"
                    priority
                  />
                </span>
                <div className="flex min-w-0 flex-col">
                  <span className="break-words font-serif font-black text-sm tracking-tight leading-tight">
                    Sentry Stack Co.
                  </span>
                  <span className="break-words font-mono text-xs text-[#5A564F]">
                    training dashboard
                  </span>
                </div>
              </Link>
              <button
                type="button"
                aria-controls="dashboard-sidebar-panel"
                aria-expanded={sidebarOpen}
                onClick={() => setSidebarOpen((open) => !open)}
                className="inline-flex h-10 min-w-10 items-center justify-center rounded-xl border-2 border-[#121212] bg-[#121212] text-white transition-colors hover:bg-[#FF5A26] lg:hidden"
              >
                {sidebarOpen ? <X size={18} weight="bold" /> : <List size={18} weight="bold" />}
              </button>
            </div>

            <div
              id="dashboard-sidebar-panel"
              className={`${sidebarOpen ? "flex" : "hidden"} max-h-[calc(100svh-68px)] flex-col overflow-hidden lg:flex lg:max-h-none lg:min-h-0 lg:flex-1`}
            >
              <div className="border-b-2 border-[#121212] p-3 sm:p-4">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold uppercase text-[#5A564F]">Progress</span>
                  <span className="font-mono text-xs font-bold text-[#FF5A26]">{progressPct}%</span>
                </div>
                <div className="mt-2 h-3 overflow-hidden rounded-full border-2 border-[#121212] bg-white">
                  <div className="h-full bg-[#FF5A26] transition-all" style={{ width: `${progressPct}%` }} />
                </div>
                <div className="mt-3 inline-flex w-full rounded-xl border-2 border-[#121212] bg-white p-1">
                  {(["mainnet", "devnet"] as TrainingNetwork[]).map((item) => (
                    <button
                      key={item}
                      onClick={() => setNetwork(item)}
                      className={`h-9 flex-1 rounded-lg font-mono text-xs font-bold capitalize transition-colors ${
                        network === item ? "bg-[#FF5A26] text-white" : "text-[#5A564F] hover:text-[#121212]"
                      }`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>

              <nav className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3 lg:max-h-none lg:space-y-1" aria-label="Training modules">
                <button className="flex min-h-11 w-full items-center gap-3 rounded-xl border-2 border-[#121212] bg-[#121212] px-3 text-left text-white">
                <Activity size={17} weight="bold" />
                <span className="font-serif text-sm font-bold">Overview</span>
              </button>

              {LESSONS.map((lesson, index) => {
                const locked = index > unlockedIndex;
                const done = lessonCleared(lesson, progress);
                return (
                  <button
                    key={lesson.id}
                    onClick={() => openLesson(lesson)}
                    disabled={locked}
                    className={`flex min-h-12 w-full items-center gap-3 rounded-xl border-2 px-3 text-left transition-colors ${
                      locked
                        ? "border-[#121212]/20 bg-[#E2DDD5] text-[#5A564F]"
                        : "border-[#121212] bg-white hover:bg-[#F7F4EC]"
                    }`}
                  >
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border-2 border-[#121212] bg-[#F7F4EC] font-mono text-[10px] font-bold">
                      {locked ? <LockKey size={13} weight="bold" /> : done ? <CheckCircle size={13} weight="bold" /> : lesson.number}
                    </span>
                      <span className="min-w-0">
                      <span className="block break-words font-serif text-sm font-bold leading-snug">{lesson.title}</span>
                      <span className="block break-words font-mono text-[10px] uppercase leading-snug text-[#5A564F]">{lesson.kicker}</span>
                    </span>
                  </button>
                );
              })}
              </nav>

              <div className="border-t-2 border-[#121212] p-3 sm:p-4 space-y-2">
                <Link
                  href="/runs"
                  className="inline-flex h-10 w-full items-center justify-center rounded-xl border-2 border-[#121212] bg-white font-mono text-xs font-bold text-[#121212] hover:bg-[#F7F4EC]"
                >
                  Benchmark Runs
                </Link>
                <a
                  href="https://sentryacademydocs.vercel.app/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-10 w-full items-center justify-center rounded-xl border-2 border-[#121212] bg-white font-mono text-xs font-bold text-[#FF5A26] hover:bg-[#F7F4EC]"
                >
                  Docs
                </a>
              </div>
            </div>
          </div>
        </aside>

        <section className="relative min-w-0 lg:h-screen lg:overflow-y-auto">
          <div className="fixed inset-0 pointer-events-none select-none z-0 overflow-hidden [mask-image:radial-gradient(ellipse_at_top,black_55%,transparent_100%)]">
            <CheckeredGridBackground variant="diagonal-lines" cellSize={52} opacity={0.34} />
          </div>

          <div className="relative z-10 mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
            <header className="border-2 border-[#121212] bg-[#FFFFFF] rounded-2xl p-5 sm:p-6 shadow-[4px_4px_0px_#121212]">
              <div className="flex flex-wrap items-start justify-between gap-5">
                <div>
                  <span className="font-mono text-xs font-bold uppercase tracking-wider text-[#FF5A26]">
                    Overview / {network.toUpperCase()} CONTEXT
                  </span>
                  <h1 className="mt-1 font-serif text-3xl leading-tight sm:text-5xl font-black tracking-tight">
                    Technical execution training
                  </h1>
                  <p className="mt-3 max-w-3xl font-sans text-sm sm:text-base leading-relaxed text-[#5A564F]">
                    Learn the internals behind Sentry: slots, blockhashes, fees, failure handling, RPC consistency, concentrated liquidity, and multi-rail submission.
                  </p>
                </div>
                <div className="hidden h-16 w-16 items-center justify-center rounded-2xl border-2 border-[#121212] bg-[#FF5A26] text-white shadow-[3px_3px_0px_#121212] sm:flex">
                  <GraduationCap size={30} weight="bold" />
                </div>
              </div>
            </header>

            <section className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="border-2 border-[#121212] bg-[#FDFBF7] rounded-2xl p-5 sm:p-6 shadow-[4px_4px_0px_#121212]">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[#121212]/15 pb-4">
                  <div>
                    <span className="font-mono text-xs font-bold uppercase text-[#FF5A26]">Current rank</span>
                    <h2 className="font-serif text-3xl font-black">{rank.name}</h2>
                  </div>
                  <div className="flex items-center gap-2 rounded-full border-2 border-[#121212] bg-white px-3 py-1.5 font-mono text-xs font-bold">
                    <Trophy size={14} weight="bold" className="text-[#FF5A26]" />
                    {xp} / {maxXp} XP
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {[
                    ["Modules cleared", `${cleared.length}/${LESSONS.length}`],
                    ["Next rank", nextRank ? nextRank.name : "Complete"],
                    ["Live labs", "Mainnet"],
                  ].map(([label, value]) => (
                    <div key={label} className="border-2 border-[#121212] bg-white rounded-xl p-4">
                      <p className="font-mono text-[10px] font-bold uppercase text-[#5A564F]">{label}</p>
                      <p className="mt-1 font-serif text-xl font-black">{value}</p>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => nextLesson && openLesson(nextLesson)}
                  disabled={!nextLesson}
                  className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border-2 border-[#121212] bg-[#FF5A26] px-5 text-center font-serif text-sm font-bold text-white shadow-[2px_2px_0px_#121212] hover:bg-[#E84D1C] disabled:opacity-50 sm:w-auto"
                >
                  {nextLesson ? `Continue: ${nextLesson.title}` : "All modules cleared"}
                  <ArrowRight size={14} weight="bold" />
                </button>
              </div>

              <div className="border-2 border-[#121212] bg-[#121212] text-white rounded-2xl p-5 sm:p-6 shadow-[4px_4px_0px_#FF5A26]">
                <span className="font-mono text-xs font-bold uppercase tracking-wider text-white">Training loop</span>
                <div className="mt-4 space-y-3">
                  {[
                    [BookOpen, "Read the mechanism"],
                    [Cpu, "Inspect the code pattern"],
                    [FlaskConical, "Run the live test"],
                    [Question, "Pass the quick quiz"],
                  ].map(([Icon, label]) => {
                    const StepIcon = Icon as typeof BookOpen;
                    return (
                      <div key={label as string} className="flex items-center gap-3 rounded-xl border border-white/15 bg-white/5 p-3">
                        <StepIcon size={17} weight="bold" className="text-white" />
                        <span className="font-sans text-sm">{label as string}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            <section className="mt-6 border-2 border-[#121212] bg-white rounded-2xl shadow-[4px_4px_0px_#121212] overflow-hidden">
              <div className="border-b-2 border-[#121212] bg-[#FDFBF7] p-5">
                <span className="font-mono text-xs font-bold uppercase text-[#FF5A26]">Module map</span>
                <h2 className="font-serif text-2xl font-black">Unlock sequence</h2>
              </div>
              <div className="grid md:grid-cols-2 xl:grid-cols-4">
                {LESSONS.map((lesson, index) => {
                  const locked = index > unlockedIndex;
                  const done = lessonCleared(lesson, progress);
                  return (
                    <button
                      key={lesson.id}
                      onClick={() => openLesson(lesson)}
                      disabled={locked}
                      className={`min-h-56 border-b-2 border-[#121212] p-5 text-left md:odd:border-r-2 xl:border-r-2 xl:[&:nth-child(4n)]:border-r-0 ${
                        locked ? "bg-[#E2DDD5] text-[#5A564F]" : "bg-[#FDFBF7] hover:bg-white"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold text-[#FF5A26]">LESSON {lesson.number}</span>
                        {locked ? <LockKey size={18} weight="bold" /> : done ? <CheckCircle size={18} weight="bold" /> : <Play size={18} weight="bold" />}
                      </div>
                      <h3 className="mt-3 font-serif text-xl font-black leading-tight">{lesson.title}</h3>
                      <p className="mt-3 font-sans text-sm leading-6">{lesson.summary}</p>
                    </button>
                  );
                })}
              </div>
              <CheckeredBorder variant="hybrid-cascade" height={18} />
            </section>
          </div>
        </section>
      </div>

      <TaskDialogModal
        isOpen={showOnboarding}
        onClose={closeOnboarding}
        title={onboarding[onboardingStep].title}
        subtitle="Dashboard onboarding"
        tag="SENTRY TRAINING"
        status="idle"
        maxWidth="max-w-xl"
        footerActions={
          <button
            onClick={() => {
              if (onboardingStep < onboarding.length - 1) {
                setOnboardingStep((step) => step + 1);
              } else {
                closeOnboarding();
              }
            }}
            className="inline-flex h-9 items-center gap-2 rounded-xl border-2 border-[#121212] bg-[#FF5A26] px-4 font-serif text-xs font-bold text-white hover:bg-[#E84D1C]"
          >
            {onboardingStep < onboarding.length - 1 ? "Next" : "Enter Overview"}
            <ArrowRight size={13} weight="bold" />
          </button>
        }
      >
        <p className="font-sans text-sm leading-7 text-[#5A564F]">{onboarding[onboardingStep].body}</p>
      </TaskDialogModal>

      <TaskDialogModal
        isOpen={Boolean(activeLesson)}
        onClose={() => setActiveLessonId(null)}
        title={activeLesson?.title ?? ""}
        subtitle={activeLesson ? `Lesson ${activeLesson.number} / ${activeLesson.kicker}` : undefined}
        tag="LESSON MODULE"
        status={labStatus}
        maxWidth="max-w-5xl"
      >
                {activeLesson && (
          <div className="space-y-6">
            {/* Row 1: What this teaches & IDE Code Pattern */}
            <div className="grid gap-5 lg:grid-cols-2">
              <section className="border-2 border-[#121212] bg-white rounded-xl p-5 shadow-[3px_3px_0px_#121212] flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2.5 pb-3 border-b-2 border-[#121212]/10">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#FF5A26]/10 text-[#FF5A26] border border-[#121212]/15">
                      <Lightbulb size={16} weight="bold" />
                    </span>
                    <div>
                      <h3 className="font-serif text-lg font-black text-[#121212] leading-tight">What this teaches</h3>
                      <p className="font-mono text-[10px] uppercase tracking-wider text-[#5A564F]">Core Mechanism</p>
                    </div>
                  </div>
                  <div className="mt-3.5 space-y-3 font-sans text-sm leading-relaxed text-[#24211D]">
                    {activeLesson.concept.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-[#121212]/10 flex items-center justify-between font-mono text-[11px] text-[#5A564F]">
                  <span>Track: {activeLesson.kicker}</span>
                  <span className="font-bold text-[#FF5A26]">Lesson {activeLesson.number} of {LESSONS.length}</span>
                </div>
              </section>

              {/* IDE Code Viewer Component */}
              <div className="flex flex-col">
                <IdeCodeViewer code={snippets[activeLesson.id] ?? ""} lessonId={activeLesson.id} />
              </div>
            </div>

            {/* Row 2: Live Test Lab in CLI Terminal */}
            <CliLabRunner
              lesson={activeLesson}
              variant={variant}
              setVariant={setVariant}
              labStatus={labStatus}
              stageIndex={stageIndex}
              runLab={runLab}
              labResult={labResult}
              labError={labError}
              network={network}
              setNetwork={setNetwork}
            />

            {/* Row 3: Quick Quiz */}
            <section className="border-2 border-[#121212] bg-white rounded-xl p-5 shadow-[3px_3px_0px_#121212]">
              <div className="flex items-center justify-between gap-3 pb-3 border-b-2 border-[#121212]/10">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#FF5A26]/10 text-[#FF5A26] border border-[#121212]/15">
                    <Question size={16} weight="bold" />
                  </span>
                  <div>
                    <h3 className="font-serif text-lg font-black text-[#121212] leading-tight">Quick quiz</h3>
                    <p className="font-mono text-[10px] uppercase tracking-wider text-[#5A564F]">Knowledge Check</p>
                  </div>
                </div>
                <span className="font-mono text-xs font-bold rounded-full border border-[#121212]/20 bg-[#F7F4EC] px-2.5 py-1 text-[#121212]">
                  {activeLesson.quiz.length} Questions
                </span>
              </div>

              <div className="mt-4 space-y-4">
                {activeLesson.quiz.map((question, questionIndex) => {
                  const selected = progress.quizAnswers[activeLesson.id]?.[questionIndex];
                  return (
                    <div key={question.q} className="rounded-xl border-2 border-[#121212]/15 bg-[#FDFBF7] p-4 space-y-3">
                      <p className="font-serif text-sm font-bold text-[#121212] leading-6">
                        {questionIndex + 1}. {question.q}
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {question.options.map((option, optionIndex) => {
                          const isSelected = selected === optionIndex;
                          const isCorrect = optionIndex === question.answer;
                          return (
                            <button
                              key={option}
                              onClick={() => answerQuiz(activeLesson.id, questionIndex, optionIndex)}
                              className={`min-h-10 rounded-lg border-2 p-2.5 text-left font-sans text-xs leading-5 transition-all ${
                                isSelected
                                  ? isCorrect
                                    ? "border-emerald-600 bg-emerald-50 text-emerald-950 font-bold"
                                    : "border-red-600 bg-red-50 text-red-950 font-bold"
                                  : "border-[#121212]/20 bg-white text-[#121212] hover:border-[#121212]"
                              }`}
                            >
                              <span className="font-mono font-bold mr-1.5">{String.fromCharCode(65 + optionIndex)}.</span>{" "}
                              {option}
                            </button>
                          );
                        })}
                      </div>
                      {typeof selected === "number" && (
                        <div className={`mt-2 rounded-lg border-2 p-3 font-sans text-xs leading-5 ${
                          selected === question.answer
                            ? "border-emerald-500 bg-emerald-50 text-emerald-950"
                            : "border-amber-500 bg-amber-50 text-amber-950"
                        }`}>
                          <strong className="block font-mono text-[11px] uppercase mb-0.5">
                            {selected === question.answer ? "✓ Correct:" : "ℹ Explanation:"}
                          </strong>
                          {question.explain}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Row 4: Module Clearance & Unlock Progress (At the bottom of tutorial flow) */}
            <section className="border-2 border-[#121212] bg-white rounded-xl p-5 shadow-[3px_3px_0px_#121212]">
              <div className="flex items-center justify-between pb-3 border-b-2 border-[#121212]/10">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#FF5A26]/10 text-[#FF5A26] border border-[#121212]/15">
                    <Globe size={16} weight="bold" />
                  </span>
                  <div>
                    <h3 className="font-serif text-lg font-black text-[#121212] leading-tight">Module clearance progress</h3>
                    <p className="font-mono text-[10px] uppercase tracking-wider text-[#5A564F]">Curriculum Requirements</p>
                  </div>
                </div>
                <span className={`font-mono text-xs font-bold px-3 py-1 rounded-full border ${
                  lessonCleared(activeLesson, progress)
                    ? "border-emerald-600 bg-emerald-50 text-emerald-950"
                    : "border-[#121212]/20 bg-[#F7F4EC] text-[#121212]"
                }`}>
                  {lessonCleared(activeLesson, progress) ? "✓ CLEARED" : "IN PROGRESS"}
                </span>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {/* 1. Lab status */}
                {(() => {
                  const labDone = (progress.completedLabs[activeLesson.lab.id] ?? []).length > 0;
                  return (
                    <div className={`p-3.5 rounded-xl border-2 flex items-start gap-2.5 ${
                      labDone ? "border-emerald-600 bg-emerald-50 text-emerald-950" : "border-[#121212]/15 bg-[#FDFBF7] text-[#5A564F]"
                    }`}>
                      <div className="mt-0.5 shrink-0">
                        {labDone ? <CheckCircle size={18} weight="fill" className="text-emerald-600" /> : <ShieldCheck size={18} className="text-[#5A564F]" />}
                      </div>
                      <div>
                        <div className="font-serif text-xs font-bold leading-tight">Live Test Lab</div>
                        <div className="font-mono text-[11px] mt-0.5">{labDone ? "Executed & Verified" : "Awaiting execution"}</div>
                      </div>
                    </div>
                  );
                })()}

                {/* 2. Quiz status */}
                {(() => {
                  const quizDone = activeLesson.quiz.every((question, index) => progress.quizAnswers[activeLesson.id]?.[index] === question.answer);
                  return (
                    <div className={`p-3.5 rounded-xl border-2 flex items-start gap-2.5 ${
                      quizDone ? "border-emerald-600 bg-emerald-50 text-emerald-950" : "border-[#121212]/15 bg-[#FDFBF7] text-[#5A564F]"
                    }`}>
                      <div className="mt-0.5 shrink-0">
                        {quizDone ? <CheckCircle size={18} weight="fill" className="text-emerald-600" /> : <ShieldCheck size={18} className="text-[#5A564F]" />}
                      </div>
                      <div>
                        <div className="font-serif text-xs font-bold leading-tight">Quick Quiz</div>
                        <div className="font-mono text-[11px] mt-0.5">{quizDone ? "All answers correct" : "Answer questions"}</div>
                      </div>
                    </div>
                  );
                })()}

                {/* 3. Concept status */}
                {(() => {
                  const conceptDone = progress.readLessonIds.includes(activeLesson.id);
                  return (
                    <div className={`p-3.5 rounded-xl border-2 flex items-start gap-2.5 ${
                      conceptDone ? "border-emerald-600 bg-emerald-50 text-emerald-950" : "border-[#121212]/15 bg-[#FDFBF7] text-[#5A564F]"
                    }`}>
                      <div className="mt-0.5 shrink-0">
                        {conceptDone ? <CheckCircle size={18} weight="fill" className="text-emerald-600" /> : <ShieldCheck size={18} className="text-[#5A564F]" />}
                      </div>
                      <div>
                        <div className="font-serif text-xs font-bold leading-tight">Concept Theory</div>
                        <div className="font-mono text-[11px] mt-0.5">{conceptDone ? "Reviewed" : "Reviewing"}</div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {lessonCleared(activeLesson, progress) && (
                <div className="mt-4 rounded-xl border-2 border-emerald-700 bg-emerald-50 p-4 font-sans text-sm text-emerald-950 flex items-center gap-3">
                  <Trophy size={22} weight="fill" className="text-emerald-700 shrink-0" />
                  <div>
                    <strong className="block font-serif text-sm font-bold">Module cleared!</strong>
                    <span className="font-mono text-xs text-emerald-900">
                      The next lesson in the curriculum is now unlocked and ready in your sidebar.
                    </span>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </TaskDialogModal>
    </main>
  );
}


function renderHighlightedLine(line: string) {
  if (!line.trim()) return <span className="tok-ident">&nbsp;</span>;

  // Regex matching comments, strings, keywords, types, numbers, function calls, identifiers
  const regex = /(\/\/[^\n]*)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`[^`]*`)|(\b(?:const|let|var|await|async|new|if|else|return|Promise)\b)|(\b\d+(?:_\d+)*(?:\.\d+)?\b)|(\b(?:TransactionMessage|VersionedTransaction|Percentage|LAMPORTS_PER_SOL|Math)\b)|([a-zA-Z_$][a-zA-Z0-9_$]*(?=\s*\())|([a-zA-Z_$][a-zA-Z0-9_$]*)|([^\s\w]+|\s+)/g;

  const tokens: React.ReactNode[] = [];
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = regex.exec(line)) !== null) {
    const [full, comment, str, kw, num, typeIdent, fnCall, ident, other] = match;
    const key = `tok-${idx++}`;

    if (comment) {
      tokens.push(<span key={key} className="tok-comment">{comment}</span>);
    } else if (str) {
      tokens.push(<span key={key} className="tok-str">{str}</span>);
    } else if (kw) {
      tokens.push(<span key={key} className="tok-kw">{kw}</span>);
    } else if (num) {
      tokens.push(<span key={key} className="tok-num">{num}</span>);
    } else if (typeIdent) {
      tokens.push(<span key={key} className="tok-type">{typeIdent}</span>);
    } else if (fnCall) {
      tokens.push(<span key={key} className="tok-fn">{fnCall}</span>);
    } else if (ident) {
      tokens.push(<span key={key} className="tok-ident">{ident}</span>);
    } else {
      tokens.push(<span key={key} className="tok-punct">{other || full}</span>);
    }
  }

  return tokens.length > 0 ? tokens : <span className="tok-ident">{line}</span>;
}

function IdeCodeViewer({ code, lessonId }: { code: string; lessonId: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const lines = code.split("\n");

  return (
    <div
      data-ide="true"
      data-dark="true"
      className="flex flex-col rounded-xl border-2 border-[#121212] shadow-[3px_3px_0px_#121212] overflow-hidden"
      style={{ backgroundColor: "#0D1117", color: "#F0F6FC" }}
    >
      {/* IDE Window Chrome Header - Clean Dev Tab, NO MAC DOTS */}
      <div
        className="flex items-center justify-between border-b border-[#30363D] px-3.5 py-2.5"
        style={{ backgroundColor: "#161B22", color: "#F0F6FC" }}
      >
        <div className="flex items-center gap-2">
          {/* Active File Tab */}
          <div
            className="flex items-center gap-2 rounded-md px-3 py-1 font-mono text-xs font-bold border border-[#30363D]"
            style={{ backgroundColor: "#0D1117", color: "#F0F6FC" }}
          >
            <span className="rounded bg-[#3178C6] px-1 py-0.2 text-[10px] font-black text-white">TS</span>
            <span className="tok-ident">{lessonId}.ts</span>
          </div>
          <span className="tok-comment font-mono text-[11px] uppercase tracking-wider hidden sm:inline">
            TypeScript / Anchor
          </span>
        </div>

        {/* Right toolbar */}
        <button
          onClick={handleCopy}
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md border border-[#30363D] px-2.5 py-1 font-mono text-[11px] font-bold hover:bg-[#30363D] transition-colors"
          style={{ backgroundColor: "#21262D", color: "#F0F6FC" }}
          title="Copy code snippet"
        >
          {copied ? (
            <>
              <CheckCircle size={13} weight="bold" className="tok-str" />
              <span className="tok-str">Copied!</span>
            </>
          ) : (
            <>
              <Copy size={13} weight="bold" className="tok-punct" />
              <span className="tok-punct">Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Editor Body with Line Numbers */}
      <div
        className="flex-1 overflow-x-auto p-3.5 font-mono text-xs leading-6 max-h-64 overflow-y-auto"
        style={{ backgroundColor: "#0D1117", color: "#F0F6FC" }}
      >
        <table className="w-full border-collapse">
          <tbody>
            {lines.map((line, idx) => (
              <tr key={idx} className="hover:bg-[#161B22]/50">
                <td
                  className="tok-line-num w-9 select-none pr-3 text-right font-mono text-xs border-r border-[#30363D] align-top"
                >
                  {String(idx + 1).padStart(2, "0")}
                </td>
                <td className="pl-3.5 whitespace-pre font-mono text-xs align-top">
                  {renderHighlightedLine(line)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* IDE Status Bar */}
      <div
        className="flex items-center justify-between border-t border-[#30363D] px-3.5 py-1.5 font-mono text-[11px]"
        style={{ backgroundColor: "#161B22", color: "#8B949E" }}
      >
        <div className="flex items-center gap-3">
          <span className="tok-comment">TypeScript</span>
          <span className="tok-comment">UTF-8</span>
          <span className="tok-comment">Spaces: 2</span>
        </div>
        <div>
          <span className="tok-comment">{lines.length} lines</span>
        </div>
      </div>
    </div>
  );
}

function CliLabRunner({
  lesson,
  variant,
  setVariant,
  labStatus,
  stageIndex,
  runLab,
  labResult,
  labError,
  network,
  setNetwork,
}: {
  lesson: Lesson;
  variant?: LabVariant;
  setVariant: (v?: LabVariant) => void;
  labStatus: "idle" | "running" | "completed" | "error";
  stageIndex: number;
  runLab: () => void;
  labResult: Record<string, unknown> | null;
  labError: string | null;
  network: TrainingNetwork;
  setNetwork: (net: TrainingNetwork) => void;
}) {
  return (
    <section
      data-terminal="true"
      data-dark="true"
      className="flex flex-col rounded-xl border-2 border-[#121212] shadow-[4px_4px_0px_#121212] overflow-hidden"
      style={{ backgroundColor: "#0A0D14", color: "#F3F4F6" }}
    >
      {/* CLI Window Title Bar - NO MAC DOTS */}
      <div
        className="flex flex-wrap items-center justify-between border-b border-zinc-800 px-4 py-2.5 gap-2"
        style={{ backgroundColor: "#161B26", color: "#F3F4F6" }}
      >
        <div className="flex items-center gap-2">
          <span className="term-prompt font-mono text-xs font-black tracking-wider uppercase">
            TERMINAL
          </span>
          <span className="term-que font-mono text-xs">//</span>
          <span className="term-label font-mono text-xs font-bold">
            sentry@{network}: ~/labs/{lesson.id}
          </span>
        </div>

        {/* Network cluster toggle: default Mainnet, switchable to Devnet */}
        <div className="flex items-center gap-2">
          <span className="term-que font-mono text-[11px] font-bold">
            CLUSTER:
          </span>
          <div className="inline-flex rounded-lg border border-zinc-700 p-0.5 font-mono text-xs" style={{ backgroundColor: "#0F141C" }}>
            <button
              type="button"
              onClick={() => setNetwork("mainnet")}
              className="px-2.5 py-1 rounded font-bold transition-colors"
              style={{
                backgroundColor: network === "mainnet" ? "#FF5A26" : "transparent",
                color: network === "mainnet" ? "#FFFFFF" : "#9CA3AF",
              }}
            >
              MAINNET (DEFAULT)
            </button>
            <button
              type="button"
              onClick={() => setNetwork("devnet")}
              className="px-2.5 py-1 rounded font-bold transition-colors"
              style={{
                backgroundColor: network === "devnet" ? "#10B981" : "transparent",
                color: network === "devnet" ? "#000000" : "#9CA3AF",
              }}
            >
              DEVNET
            </button>
          </div>
        </div>
      </div>

      {/* Terminal Command & Execution Header */}
      <div
        className="border-b border-zinc-800 p-3.5 sm:p-4"
        style={{ backgroundColor: "#0D111A", color: "#F3F4F6" }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 font-mono text-xs font-bold">
              <span className="term-prompt">$</span>
              <span className="term-cmd">sentry test:lab --cluster {network} --target {lesson.lab.id}</span>
              {variant && (
                <span className="term-variant">--variant {variant.id}</span>
              )}
            </div>
            <p className="term-desc mt-1.5 font-mono text-xs leading-relaxed">
              # {lesson.lab.description}
            </p>
          </div>

          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto shrink-0">
            {lesson.lab.variants && (
              <select
                aria-label="Lab variant"
                value={variant?.id}
                onChange={(event) =>
                  setVariant(lesson.lab.variants?.find((item) => item.id === event.target.value))
                }
                className="term-cmd h-9 rounded-lg border border-zinc-700 px-2.5 font-mono text-xs font-bold outline-none"
                style={{ backgroundColor: "#161B26" }}
              >
                {lesson.lab.variants.map((item) => (
                  <option key={item.id} value={item.id} className="bg-[#121212] text-white">
                    {item.label}
                  </option>
                ))}
              </select>
            )}

            <button
              onClick={runLab}
              disabled={labStatus === "running"}
              type="button"
              className="inline-flex h-9 flex-1 sm:flex-none items-center justify-center gap-2 rounded-lg border-2 border-emerald-400 px-4 font-mono text-xs font-black shadow-[0_0_12px_rgba(16,185,129,0.3)] disabled:opacity-50 transition-all active:scale-95"
              style={{ backgroundColor: "#10B981" }}
            >
              <Play size={12} weight="bold" style={{ color: "#000000" }} />
              <span className="term-btn-text uppercase">
                {labStatus === "running" ? "RUNNING..." : lesson.lab.actionLabel}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Terminal Test Pipeline Stages */}
      <div
        className="p-3.5 sm:p-4 font-mono text-xs space-y-2"
        style={{ backgroundColor: "#080B11", color: "#F3F4F6" }}
      >
        <div
          className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider pb-1 border-b border-zinc-800/80"
        >
          <span className="term-que">CLI Test Stages [{lesson.lab.stages.length}]</span>
          <span
            className={
              labStatus === "running"
                ? "term-run"
                : labStatus === "completed"
                ? "term-pass"
                : "term-que"
            }
          >
            Status: {labStatus.toUpperCase()} ({network.toUpperCase()})
          </span>
        </div>

        <div className="space-y-1.5 pt-1">
          {lesson.lab.stages.map((stage, idx) => {
            const isDone = labStatus === "completed" || (labStatus === "running" && idx < stageIndex);
            const isCurrent = labStatus === "running" && idx === stageIndex;

            return (
              <div
                key={stage}
                className="flex items-start gap-2.5 rounded-lg border p-2.5 transition-colors"
                style={{
                  backgroundColor: isCurrent ? "rgba(245, 158, 11, 0.12)" : isDone ? "rgba(16, 185, 129, 0.1)" : "rgba(24, 24, 27, 0.5)",
                  borderColor: isCurrent ? "rgba(245, 158, 11, 0.7)" : isDone ? "rgba(16, 185, 129, 0.5)" : "rgba(39, 39, 42, 0.7)",
                }}
              >
                <div className="shrink-0 font-bold">
                  {isDone ? (
                    <span className="term-pass">[✓ PASS]</span>
                  ) : isCurrent ? (
                    <span className="term-run animate-pulse">[▶ RUN ]</span>
                  ) : (
                    <span className="term-que">[· QUE ]</span>
                  )}
                </div>

                <div className="term-que shrink-0 font-bold">
                  [{String(idx + 1).padStart(2, "0")}/{String(lesson.lab.stages.length).padStart(2, "0")}]
                </div>

                <div className="flex-1 min-w-0">
                  <span className={isCurrent ? "term-sub font-bold" : isDone ? "term-label font-bold" : "term-que"}>
                    {stage}
                  </span>
                  {isCurrent && (
                    <span className="term-sub block mt-0.5 text-[11px]">
                      ↳ Querying Solana {network.toUpperCase()} RPC...
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Terminal Error Stream */}
      {labError && (
        <div
          className="border-t border-red-900/80 p-4 font-mono text-xs"
          style={{ backgroundColor: "rgba(69, 10, 10, 0.85)", color: "#FCA5A5" }}
        >
          <div className="flex items-center gap-2 font-bold mb-1 text-red-400">
            <span>[FATAL ERROR] Test execution failed:</span>
          </div>
          <pre
            className="rounded p-2.5 whitespace-pre-wrap border border-red-800/60 text-red-300"
            style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
          >
            {labError}
          </pre>
        </div>
      )}

      {/* Terminal Stdout Output Stream */}
      {labResult && (
        <div
          className="border-t border-zinc-800 p-4 font-mono text-xs"
          style={{ backgroundColor: "#05070B" }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2 pb-2 border-b border-zinc-800/80">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#34D399" }} />
              <span className="term-stdout font-bold uppercase tracking-wider">
                [STDOUT] Execution Payload (200 OK) - {network.toUpperCase()}
              </span>
            </div>
            {typeof labResult.explorer === "string" && (
              <a
                href={labResult.explorer}
                target="_blank"
                rel="noopener noreferrer"
                className="term-explorer inline-flex items-center gap-1.5 font-bold"
              >
                <span>[EXPLORER] View on Solana Explorer ↗</span>
                <ArrowSquareOut size={12} weight="bold" />
              </a>
            )}
          </div>

          <div
            className="rounded-lg border border-zinc-800 p-3 max-h-60 overflow-y-auto"
            style={{ backgroundColor: "#0A0E17" }}
          >
            <div className="term-que text-[11px] mb-1">// Telemetry response payload:</div>
            <pre
              className="term-stdout font-mono text-xs whitespace-pre-wrap leading-relaxed"
            >
              {JSON.stringify(labResult, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </section>
  );
}
