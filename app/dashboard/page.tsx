"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  ArrowSquareOut,
  BookOpen,
  CheckCircle,
  Cpu,
  FlaskConical,
  Globe,
  GraduationCap,
  Lightbulb,
  LockKey,
  Play,
  Question,
  ShieldCheck,
  Trophy,
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
          network: "devnet",
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
    <main className="min-h-screen bg-[#F7F4EC] text-[#121212] font-serif selection:bg-[#FF5A26] selection:text-white">
      <div className="grid min-h-screen lg:h-screen lg:overflow-hidden lg:grid-cols-[310px_1fr]">
        <aside className="border-b-2 border-[#121212] bg-[#FDFBF7] lg:h-screen lg:overflow-hidden lg:border-b-0 lg:border-r-2">
          <div className="flex h-full flex-col">
            <div className="border-b-2 border-[#121212] p-4">
              <Link href="/" className="flex items-center gap-3 text-left">
                <div className="h-8 w-8 rounded-full bg-[#121212] flex items-center justify-center text-white font-serif text-sm font-bold">
                  S/
                </div>
                <div className="flex flex-col">
                  <span className="font-serif font-black text-sm tracking-tight leading-tight">
                    Sentry Stack Co.
                  </span>
                  <span className="font-mono text-xs text-[#5A564F]">
                    training dashboard
                  </span>
                </div>
              </Link>
            </div>

            <div className="border-b-2 border-[#121212] p-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold uppercase text-[#5A564F]">Progress</span>
                <span className="font-mono text-xs font-bold text-[#FF5A26]">{progressPct}%</span>
              </div>
              <div className="mt-2 h-3 rounded-full border-2 border-[#121212] bg-white overflow-hidden">
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

            <nav className="flex-1 overflow-y-auto p-3 space-y-1" aria-label="Training modules">
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
                      <span className="block truncate font-serif text-sm font-bold">{lesson.title}</span>
                      <span className="block truncate font-mono text-[10px] uppercase text-[#5A564F]">{lesson.kicker}</span>
                    </span>
                  </button>
                );
              })}
            </nav>

            <div className="border-t-2 border-[#121212] p-4">
              <a
                href="https://sentry-doc.vercel.app/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 w-full items-center justify-center rounded-xl border-2 border-[#121212] bg-white font-mono text-xs font-bold text-[#FF5A26] hover:bg-[#F7F4EC]"
              >
                Docs
              </a>
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
                  <h1 className="mt-1 font-serif text-3xl sm:text-5xl font-black tracking-tight">
                    Technical execution training
                  </h1>
                  <p className="mt-3 max-w-3xl font-sans text-sm sm:text-base leading-relaxed text-[#5A564F]">
                    Learn the internals behind Sentry: slots, blockhashes, fees, failure handling, RPC consistency, concentrated liquidity, and multi-rail submission.
                  </p>
                </div>
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-[#121212] bg-[#FF5A26] text-white shadow-[3px_3px_0px_#121212]">
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

                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  {[
                    ["Modules cleared", `${cleared.length}/${LESSONS.length}`],
                    ["Next rank", nextRank ? nextRank.name : "Complete"],
                    ["Live labs", "Devnet"],
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
                  className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[#121212] bg-[#FF5A26] px-5 font-serif text-sm font-bold text-white shadow-[2px_2px_0px_#121212] hover:bg-[#E84D1C] disabled:opacity-50"
                >
                  {nextLesson ? `Continue: ${nextLesson.title}` : "All modules cleared"}
                  <ArrowRight size={14} weight="bold" />
                </button>
              </div>

              <div className="border-2 border-[#121212] bg-[#121212] text-white rounded-2xl p-5 sm:p-6 shadow-[4px_4px_0px_#FF5A26]">
                <span className="font-mono text-xs font-bold uppercase tracking-wider text-[#FF5A26]">Training loop</span>
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
                        <StepIcon size={17} weight="bold" className="text-[#FF5A26]" />
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
          <div className="grid gap-5 lg:grid-cols-[1fr_0.82fr]">
            <div className="space-y-5">
              <section className="border-2 border-[#121212] bg-white rounded-xl p-4">
                <div className="flex items-center gap-2">
                  <Lightbulb size={17} weight="bold" className="text-[#FF5A26]" />
                  <h3 className="font-serif text-lg font-black">What this teaches</h3>
                </div>
                <div className="mt-3 space-y-3 font-sans text-sm leading-7 text-[#5A564F]">
                  {activeLesson.concept.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </section>

              <section className="border-2 border-[#121212] bg-[#121212] text-white rounded-xl p-4">
                <div className="flex items-center gap-2">
                  <Cpu size={17} weight="bold" className="text-[#FF5A26]" />
                  <h3 className="font-serif text-lg font-black">Code pattern</h3>
                </div>
                <pre className="mt-3 max-h-56 overflow-auto rounded-lg border border-white/15 bg-black/25 p-3 font-mono text-xs leading-6 text-[#F7F4EC]">
                  <code>{snippets[activeLesson.id]}</code>
                </pre>
              </section>

              <section className="border-2 border-[#121212] bg-[#F7F4EC] rounded-xl p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <FlaskConical size={17} weight="bold" className="text-[#FF5A26]" />
                      <h3 className="font-serif text-lg font-black">{activeLesson.lab.title}</h3>
                    </div>
                    <p className="mt-2 max-w-2xl font-sans text-sm leading-6 text-[#5A564F]">{activeLesson.lab.description}</p>
                    {network === "mainnet" && (
                      <p className="mt-2 font-mono text-[11px] font-bold text-[#FF5A26]">
                        Mainnet context selected. This training lab executes on Devnet for safety.
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {activeLesson.lab.variants && (
                      <select
                        aria-label="Lab variant"
                        value={variant?.id}
                        onChange={(event) =>
                          setVariant(activeLesson.lab.variants?.find((item) => item.id === event.target.value))
                        }
                        className="h-10 rounded-xl border-2 border-[#121212] bg-white px-3 font-mono text-xs font-bold"
                      >
                        {activeLesson.lab.variants.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    )}
                    <button
                      onClick={runLab}
                      disabled={labStatus === "running"}
                      className="inline-flex h-10 items-center gap-2 rounded-xl border-2 border-[#121212] bg-[#FF5A26] px-4 font-serif text-xs font-bold text-white shadow-[2px_2px_0px_#121212] hover:bg-[#E84D1C] disabled:opacity-50"
                    >
                      <Play size={13} weight="bold" />
                      {labStatus === "running" ? "Running" : activeLesson.lab.actionLabel}
                    </button>
                  </div>
                </div>

                {(labStatus === "running" || labResult || labError) && (
                  <div className="mt-4 space-y-4">
                    <LiveTestStageList
                      stages={activeLesson.lab.stages.map((stage, index) => ({
                        id: `stage-${index}`,
                        label: stage,
                        detail: index === stageIndex ? "Executing on Devnet" : undefined,
                      }))}
                      activeStageIndex={stageIndex}
                    />
                    {labError && (
                      <div className="rounded-xl border-2 border-red-600 bg-red-50 p-3 font-sans text-sm text-red-900">
                        {labError}
                      </div>
                    )}
                    {labResult && (
                      <div className="rounded-xl border-2 border-[#121212] bg-white p-3">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <span className="font-mono text-xs font-bold uppercase text-[#FF5A26]">Live output</span>
                          {typeof labResult.explorer === "string" && (
                            <a
                              href={labResult.explorer}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 font-mono text-xs font-bold text-[#FF5A26] hover:underline"
                            >
                              Explorer
                              <ArrowSquareOut size={13} weight="bold" />
                            </a>
                          )}
                        </div>
                        <pre className="max-h-64 overflow-auto rounded-lg bg-[#121212] p-3 font-mono text-xs leading-6 text-[#F7F4EC]">
                          {JSON.stringify(labResult, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </section>
            </div>

            <aside className="space-y-5">
              <section className="border-2 border-[#121212] bg-white rounded-xl p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Question size={17} weight="bold" className="text-[#FF5A26]" />
                    <h3 className="font-serif text-lg font-black">Quick quiz</h3>
                  </div>
                  <span className="font-mono text-[10px] font-bold uppercase text-[#5A564F]">
                    {activeLesson.quiz.length} questions
                  </span>
                </div>

                <div className="mt-4 space-y-4">
                  {activeLesson.quiz.map((question, questionIndex) => {
                    const selected = progress.quizAnswers[activeLesson.id]?.[questionIndex];
                    return (
                      <div key={question.q} className="rounded-xl border-2 border-[#121212]/15 bg-[#FDFBF7] p-3">
                        <p className="font-serif text-sm font-bold leading-6">{question.q}</p>
                        <div className="mt-3 grid gap-2">
                          {question.options.map((option, optionIndex) => {
                            const isSelected = selected === optionIndex;
                            const isCorrect = optionIndex === question.answer;
                            return (
                              <button
                                key={option}
                                onClick={() => answerQuiz(activeLesson.id, questionIndex, optionIndex)}
                                className={`min-h-10 rounded-lg border-2 p-2 text-left font-sans text-xs leading-5 ${
                                  isSelected
                                    ? isCorrect
                                      ? "border-emerald-600 bg-emerald-50 text-emerald-950"
                                      : "border-red-600 bg-red-50 text-red-950"
                                    : "border-[#121212]/20 bg-white hover:border-[#121212]"
                                }`}
                              >
                                <span className="font-mono font-bold">{String.fromCharCode(65 + optionIndex)}.</span>{" "}
                                {option}
                              </button>
                            );
                          })}
                        </div>
                        {typeof selected === "number" && (
                          <p className="mt-2 rounded-lg border border-[#121212]/15 bg-white p-2 font-sans text-xs leading-5 text-[#5A564F]">
                            {question.explain}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="border-2 border-[#121212] bg-[#F7F4EC] rounded-xl p-4">
                <div className="flex items-center gap-2">
                  <Globe size={17} weight="bold" className="text-[#FF5A26]" />
                  <h3 className="font-serif text-lg font-black">Unlock status</h3>
                </div>
                <div className="mt-4 space-y-2 font-sans text-sm">
                  <StatusLine done={(progress.completedLabs[activeLesson.lab.id] ?? []).length > 0} label="Live lab completed" />
                  <StatusLine
                    done={activeLesson.quiz.every((question, index) => progress.quizAnswers[activeLesson.id]?.[index] === question.answer)}
                    label="Quiz passed"
                  />
                  <StatusLine done={progress.readLessonIds.includes(activeLesson.id)} label="Concept reviewed" />
                </div>
                {lessonCleared(activeLesson, progress) && (
                  <div className="mt-4 rounded-xl border-2 border-emerald-700 bg-emerald-50 p-3 font-sans text-sm text-emerald-950">
                    Module cleared. The next sidebar lesson is unlocked.
                  </div>
                )}
              </section>
            </aside>
          </div>
        )}
      </TaskDialogModal>
    </main>
  );
}

function StatusLine({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      {done ? (
        <CheckCircle size={16} weight="bold" className="text-emerald-700" />
      ) : (
        <ShieldCheck size={16} weight="bold" className="text-[#5A564F]" />
      )}
      <span className={done ? "font-bold text-[#121212]" : "text-[#5A564F]"}>{label}</span>
    </div>
  );
}
