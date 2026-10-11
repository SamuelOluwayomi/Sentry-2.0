"use client";

import React, { useState } from "react";
import {
  BookOpen,
  CheckCircle,
  FlaskConical,
  GraduationCap,
  Info,
  Lightbulb,
  Play,
  Quotes,
  Star,
  Warning,
  ArrowRight,
  Globe,
  ArrowSquareOut,
} from "../phosphor-icons";
import { Lesson, LabVariant } from "./curriculum";
import { useAcademy, AcademyCluster } from "./academy-store";
import { TaskDialogModal, LiveTestStageList } from "../task-dialog";

export function LessonCard({ lesson }: { lesson: Lesson }) {
  const {
    activeCluster,
    setCluster,
    markLessonRead,
    answerQuiz,
    recordLabCompletion,
    progress,
  } = useAcademy();

  // Selected glossary term
  const [selectedTerm, setSelectedTerm] = useState<string | null>(null);

  // Lab modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [labCluster, setLabCluster] = useState<AcademyCluster>(
    lesson.lab.networks.includes(activeCluster) ? activeCluster : lesson.lab.networks[0]
  );
  const [selectedVariant, setSelectedVariant] = useState<LabVariant | undefined>(
    lesson.lab.variants?.[0]
  );
  const [labStatus, setLabStatus] = useState<
    "idle" | "running" | "completed" | "error" | "cancelled"
  >("idle");
  const [activeStageIndex, setActiveStageIndex] = useState(0);
  const [labResult, setLabResult] = useState<Record<string, unknown> | null>(null);
  const [labError, setLabError] = useState<string | null>(null);

  const isRead = progress.readLessonIds.includes(lesson.id);
  const quizAnswers = progress.quizAnswers[lesson.id] ?? {};
  const completedNetworks = progress.completedLabs[lesson.lab.id] ?? [];
  const labDone = completedNetworks.length > 0;

  // Run the live lab via /api/academy
  const runLab = async () => {
    setModalOpen(true);
    setLabStatus("running");
    setActiveStageIndex(0);
    setLabResult(null);
    setLabError(null);

    const stagesCount = lesson.lab.stages.length;
    const interval = setInterval(() => {
      setActiveStageIndex((prev) => (prev < stagesCount - 1 ? prev + 1 : prev));
    }, 600);

    try {
      const res = await fetch("/api/academy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          network: labCluster,
          lab: lesson.lab.id,
          params: selectedVariant?.params ?? {},
        }),
      });

      const json = await res.json();
      clearInterval(interval);
      setActiveStageIndex(stagesCount);

      if (!res.ok || json.error) {
        setLabStatus("error");
        setLabError(json.error ?? "Lab execution failed");
      } else {
        setLabStatus("completed");
        setLabResult(json);
        recordLabCompletion(lesson.lab.id, labCluster);
        markLessonRead(lesson.id);
      }
    } catch (err) {
      clearInterval(interval);
      setLabStatus("error");
      setLabError(err instanceof Error ? err.message : "Network error during lab");
    }
  };

  return (
    <article
      id={`lesson-${lesson.id}`}
      className="border-2 border-[#121212] bg-[#FFFFFF] rounded-2xl p-6 sm:p-8 space-y-6 shadow-[4px_4px_0px_#121212] transition-shadow hover:shadow-[6px_6px_0px_#121212]"
    >
      {/* Lesson Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-[#121212]/15 pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="font-mono text-xs font-bold text-[#FF5A26] bg-[#FF5A26]/10 px-2 py-0.5 rounded uppercase tracking-wider">
              Lesson {lesson.number} &bull; {lesson.kicker}
            </span>
            {labDone && (
              <span className="inline-flex items-center gap-1 font-mono text-xs font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
                <CheckCircle size={12} weight="bold" /> Completed ({completedNetworks.join(", ")})
              </span>
            )}
          </div>
          <h3 className="font-serif text-2xl sm:text-3xl font-bold text-[#121212] leading-tight">
            {lesson.title}
          </h3>
          <p className="font-sans text-sm sm:text-base text-[#5A564F] mt-2 leading-relaxed max-w-3xl">
            {lesson.summary}
          </p>
        </div>

        <button
          onClick={() => markLessonRead(lesson.id)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 font-mono text-xs font-bold rounded-xl border-2 transition-colors ${
            isRead
              ? "border-emerald-700 bg-emerald-50 text-emerald-800"
              : "border-[#121212] bg-[#F7F4EC] text-[#121212] hover:bg-[#FF5A26] hover:text-white"
          }`}
        >
          {isRead ? (
            <>
              <CheckCircle size={13} weight="bold" /> Concept Reviewed
            </>
          ) : (
            <>
              <BookOpen size={13} weight="bold" /> Mark as Read (+10 XP)
            </>
          )}
        </button>
      </div>

      {/* Cursive Marginal Quote */}
      <div className="border-2 border-[#121212]/15 bg-[#FDFBF7] p-4 rounded-xl relative">
        <p className="font-cursive text-xl sm:text-2xl text-[#121212] italic leading-snug">
          &ldquo;{lesson.quote.text}&rdquo;
        </p>
        <p className="font-mono text-xs text-[#5A564F] mt-1 text-right">
          &mdash; {lesson.quote.author}
        </p>
      </div>

      {/* Conceptual Breakdown */}
      <div className="space-y-3 font-sans text-sm text-[#121212] leading-relaxed">
        {lesson.concept.map((p, idx) => (
          <p key={idx}>{p}</p>
        ))}
      </div>

      {/* Technical Terms & Glossary */}
      <div className="border-2 border-[#121212]/15 bg-[#F7F4EC] p-4 rounded-xl space-y-3">
        <div className="flex items-center gap-2">
          <Lightbulb size={16} weight="bold" className="text-[#FF5A26]" />
          <h4 className="font-serif text-xs font-bold uppercase tracking-wider text-[#121212]">
            Key Technical Terms (Click to inspect definition)
          </h4>
        </div>

        <div className="flex flex-wrap gap-2">
          {lesson.glossary.map((g) => {
            const isSelected = selectedTerm === g.term;
            return (
              <button
                key={g.term}
                onClick={() => setSelectedTerm(isSelected ? null : g.term)}
                className={`px-3 py-1 font-mono text-xs font-bold rounded-lg border-2 transition-all ${
                  isSelected
                    ? "border-[#FF5A26] bg-[#FF5A26] text-white shadow-[2px_2px_0px_#121212]"
                    : "border-[#121212] bg-[#FFFFFF] text-[#121212] hover:border-[#FF5A26]"
                }`}
              >
                {g.term}
              </button>
            );
          })}
        </div>

        {selectedTerm && (
          <div className="mt-3 p-3.5 border-2 border-[#121212] bg-[#FFFFFF] rounded-xl animate-in fade-in duration-150">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-bold uppercase text-[#FF5A26]">
                {selectedTerm}
              </span>
              <button
                onClick={() => setSelectedTerm(null)}
                className="font-mono text-xs text-[#5A564F] hover:text-[#121212]"
              >
                [close]
              </button>
            </div>
            <p className="font-sans text-xs sm:text-sm text-[#121212] mt-1 leading-relaxed">
              {lesson.glossary.find((g) => g.term === selectedTerm)?.definition}
            </p>
          </div>
        )}
      </div>

      {/* On-Chain Architecture Flow */}
      <div className="border-2 border-[#121212]/15 bg-[#FFFFFF] p-4 rounded-xl">
        <h4 className="font-mono text-xs font-bold uppercase tracking-wider text-[#5A564F] mb-3">
          On-Chain Mechanics Flow
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {lesson.flow.map((step, idx) => (
            <div
              key={idx}
              className="border-2 border-[#121212]/15 bg-[#FDFBF7] p-3 rounded-lg flex flex-col justify-between"
            >
              <div>
                <span className="font-mono text-[10px] font-bold text-[#FF5A26]">
                  STEP 0{idx + 1}
                </span>
                <p className="font-serif text-xs font-bold text-[#121212] mt-0.5">
                  {step.label}
                </p>
              </div>
              <p className="font-sans text-[11px] text-[#5A564F] mt-2 leading-snug">
                {step.detail}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Knowledge Check Quizzes */}
      <div className="border-2 border-[#121212]/15 bg-[#FDFBF7] p-5 rounded-xl space-y-4">
        <div className="flex items-center justify-between">
          <span className="font-mono text-xs font-bold uppercase tracking-wider text-[#FF5A26] flex items-center gap-1.5">
            <GraduationCap size={15} weight="bold" /> Check Your Understanding (+15 XP each)
          </span>
          <span className="font-mono text-xs text-[#5A564F]">
            {lesson.quiz.length} Questions
          </span>
        </div>

        {lesson.quiz.map((q, qIdx) => {
          const userAns = quizAnswers[qIdx];
          const hasAnswered = typeof userAns === "number";
          const isCorrect = userAns === q.answer;

          return (
            <div
              key={qIdx}
              className="border-2 border-[#121212]/15 bg-[#FFFFFF] p-4 rounded-xl space-y-3"
            >
              <p className="font-serif text-sm font-bold text-[#121212]">
                {qIdx + 1}. {q.q}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {q.options.map((opt, optIdx) => {
                  const selected = userAns === optIdx;
                  return (
                    <button
                      key={optIdx}
                      onClick={() => answerQuiz(lesson.id, qIdx, optIdx)}
                      className={`text-left p-2.5 rounded-lg border-2 font-sans text-xs transition-all ${
                        selected
                          ? optIdx === q.answer
                            ? "border-emerald-600 bg-emerald-50 text-emerald-950 font-bold"
                            : "border-red-600 bg-red-50 text-red-950 font-bold"
                          : "border-[#121212]/15 bg-[#FDFBF7] hover:border-[#121212] text-[#121212]"
                      }`}
                    >
                      <span className="font-mono font-bold mr-1.5">
                        {String.fromCharCode(65 + optIdx)}.
                      </span>
                      {opt}
                    </button>
                  );
                })}
              </div>

              {hasAnswered && (
                <div
                  className={`p-3 rounded-lg border text-xs font-sans leading-relaxed ${
                    isCorrect
                      ? "border-emerald-500 bg-emerald-50 text-emerald-900"
                      : "border-amber-500 bg-amber-50 text-amber-900"
                  }`}
                >
                  <strong className="block font-mono text-[11px] uppercase mb-0.5">
                    {isCorrect ? "Correct!" : "Not quite:"}
                  </strong>
                  {q.explain}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Interactive Sandbox Bench Action */}
      <div className="border-2 border-[#121212] bg-[#121212] text-white p-5 sm:p-6 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="font-mono text-xs font-bold uppercase tracking-wider text-[#FF5A26] flex items-center gap-1.5">
            <FlaskConical size={14} weight="bold" /> Interactive Cluster Sandbox
          </span>
          <h4 className="font-serif text-lg sm:text-xl font-bold mt-1 text-white">
            {lesson.lab.title}
          </h4>
          <p className="font-sans text-xs sm:text-sm text-[#F7F4EC]/80 mt-1 max-w-xl">
            {lesson.lab.description}
          </p>
        </div>

        <div className="flex flex-col sm:items-end gap-2 shrink-0">
          {/* Cluster & Variant Pickers */}
          <div className="flex flex-wrap items-center gap-2">
            {lesson.lab.networks.length > 1 && (
              <div className="inline-flex rounded-lg border border-white/20 bg-white/10 p-0.5">
                {lesson.lab.networks.map((net) => (
                  <button
                    key={net}
                    onClick={() => {
                      setLabCluster(net);
                      setCluster(net);
                    }}
                    className={`px-2.5 py-1 font-mono text-xs font-bold rounded-md transition-colors ${
                      labCluster === net
                        ? "bg-[#FF5A26] text-white"
                        : "text-white/70 hover:text-white"
                    }`}
                  >
                    {net}
                  </button>
                ))}
              </div>
            )}

            {lesson.lab.variants && (
              <select
                aria-label="Lab variant"
                value={selectedVariant?.id}
                onChange={(e) =>
                  setSelectedVariant(lesson.lab.variants?.find((v) => v.id === e.target.value))
                }
                className="border border-white/20 bg-white/10 text-white font-mono text-xs p-1.5 rounded-lg outline-none"
              >
                {lesson.lab.variants.map((v) => (
                  <option key={v.id} value={v.id} className="bg-[#121212] text-white">
                    {v.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          <button
            onClick={runLab}
            className="inline-flex items-center justify-center gap-2 border-2 border-white bg-[#FF5A26] text-white px-5 py-2.5 font-serif text-xs font-bold rounded-xl hover:bg-[#E84D1C] transition-all shadow-[2px_2px_0px_#FFFFFF] active:translate-x-[1px] active:translate-y-[1px]"
          >
            <Play size={14} weight="bold" />
            <span>{lesson.lab.actionLabel}</span>
          </button>
        </div>
      </div>

      {/* Task Dialog Modal for Live Lab Runs */}
      <TaskDialogModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={lesson.lab.title}
        subtitle={`Running live test on Solana ${labCluster.toUpperCase()}`}
        tag={`SANDBOX LAB &bull; ${lesson.lab.id.toUpperCase()}`}
        status={labStatus}
        maxWidth="max-w-2xl"
      >
        <div className="space-y-4">
          <LiveTestStageList
            stages={lesson.lab.stages.map((s, idx) => ({
              id: `stage-${idx}`,
              label: s,
              detail: idx === activeStageIndex ? "Executing on cluster..." : undefined,
            }))}
            activeStageIndex={activeStageIndex}
          />

          {selectedVariant && (
            <div className="p-3 border-2 border-[#121212]/15 bg-[#FFFFFF] rounded-xl text-xs font-mono text-[#5A564F]">
              <strong className="text-[#121212]">Variant:</strong> {selectedVariant.label} &mdash;{" "}
              {selectedVariant.hint}
            </div>
          )}

          {labError && (
            <div className="p-4 border-2 border-red-600 bg-red-50 text-red-900 rounded-xl space-y-1">
              <div className="flex items-center gap-2 font-mono text-xs font-bold text-red-700">
                <Warning size={14} weight="bold" /> Lab Execution Encountered an Error
              </div>
              <p className="font-sans text-xs">{labError}</p>
            </div>
          )}

          {labResult && (
            <div className="p-4 border-2 border-[#121212] bg-[#FFFFFF] rounded-xl space-y-3">
              <div className="flex items-center justify-between border-b border-[#121212]/15 pb-2">
                <span className="font-mono text-xs font-bold uppercase text-emerald-700 flex items-center gap-1.5">
                  <CheckCircle size={14} weight="bold" /> Verified On-Chain Output
                </span>
                <span className="font-mono text-[11px] text-[#5A564F]">
                  Cluster: {labCluster}
                </span>
              </div>

              {typeof labResult.explorer === "string" && (
                <a
                  href={labResult.explorer}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 font-mono text-xs text-[#FF5A26] font-bold hover:underline"
                >
                  <ArrowSquareOut size={13} weight="bold" /> View on Solana Explorer ({labCluster})
                </a>
              )}

              <pre className="p-3 bg-[#121212] text-[#F7F4EC] rounded-lg font-mono text-xs overflow-x-auto max-h-60">
                {JSON.stringify(labResult, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </TaskDialogModal>
    </article>
  );
}
