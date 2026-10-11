"use client";

import { useEffect, useState } from "react";
import { RANKS, MAX_XP, XP, LESSONS, Lesson, AcademyView } from "./curriculum";

export type AcademyCluster = "devnet" | "testnet";

export interface AcademyProgress {
  activeCluster: AcademyCluster;
  readLessonIds: string[];
  quizAnswers: Record<string, Record<number, number>>; // lessonId -> qIdx -> selectedOption
  completedLabs: Record<string, string[]>; // labId -> networks completed (e.g. ['devnet', 'testnet'])
}

const STORAGE_KEY = "sentry_academy_progress_v1";

const DEFAULT_PROGRESS: AcademyProgress = {
  activeCluster: "devnet",
  readLessonIds: [],
  quizAnswers: {},
  completedLabs: {},
};

export function loadProgress(): AcademyProgress {
  if (typeof window === "undefined") return DEFAULT_PROGRESS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PROGRESS;
    const parsed = JSON.parse(raw) as Partial<AcademyProgress>;
    return {
      activeCluster: parsed.activeCluster === "testnet" ? "testnet" : "devnet",
      readLessonIds: Array.isArray(parsed.readLessonIds) ? parsed.readLessonIds : [],
      quizAnswers: parsed.quizAnswers ?? {},
      completedLabs: parsed.completedLabs ?? {},
    };
  } catch {
    return DEFAULT_PROGRESS;
  }
}

export function saveProgress(progress: AcademyProgress) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    window.dispatchEvent(new CustomEvent("sentry_academy_updated", { detail: progress }));
  } catch {
    // ignore
  }
}

export function computeXp(progress: AcademyProgress): number {
  let xp = 0;
  // XP for reading lessons
  xp += (progress.readLessonIds?.length ?? 0) * XP.read;

  // XP for correct quiz answers
  for (const lesson of LESSONS) {
    const answers = progress.quizAnswers?.[lesson.id] ?? {};
    lesson.quiz.forEach((q, idx) => {
      if (answers[idx] === q.answer) {
        xp += XP.quizCorrect;
      }
    });
  }

  // XP for completed labs
  for (const [, networks] of Object.entries(progress.completedLabs ?? {})) {
    if (networks && networks.length > 0) {
      xp += XP.labFirst;
      if (networks.length > 1) {
        xp += XP.labSecondNetwork;
      }
    }
  }

  return Math.min(xp, MAX_XP);
}

export function getRank(xp: number) {
  let current = RANKS[0];
  for (const r of RANKS) {
    if (xp >= r.min) current = r;
  }
  const nextIdx = RANKS.findIndex((r) => r.name === current.name) + 1;
  const nextRank = nextIdx < RANKS.length ? RANKS[nextIdx] : null;
  return { current, nextRank };
}

/**
 * React hook to access and update Academy progress across components.
 */
export function useAcademy() {
  const [progress, setProgress] = useState<AcademyProgress>(DEFAULT_PROGRESS);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setProgress(loadProgress());
    setMounted(true);

    const onUpdate = (e: Event) => {
      const detail = (e as CustomEvent<AcademyProgress>).detail;
      if (detail) setProgress(detail);
    };

    window.addEventListener("sentry_academy_updated", onUpdate);
    return () => window.removeEventListener("sentry_academy_updated", onUpdate);
  }, []);

  const setCluster = (cluster: AcademyCluster) => {
    const next = { ...progress, activeCluster: cluster };
    setProgress(next);
    saveProgress(next);
  };

  const markLessonRead = (lessonId: string) => {
    if (progress.readLessonIds.includes(lessonId)) return;
    const next = { ...progress, readLessonIds: [...progress.readLessonIds, lessonId] };
    setProgress(next);
    saveProgress(next);
  };

  const answerQuiz = (lessonId: string, qIdx: number, optionIdx: number) => {
    const lessonAnswers = { ...(progress.quizAnswers[lessonId] ?? {}), [qIdx]: optionIdx };
    const next = {
      ...progress,
      quizAnswers: { ...progress.quizAnswers, [lessonId]: lessonAnswers },
    };
    setProgress(next);
    saveProgress(next);
  };

  const recordLabCompletion = (labId: string, cluster: AcademyCluster) => {
    const existing = progress.completedLabs[labId] ?? [];
    if (!existing.includes(cluster)) {
      const next = {
        ...progress,
        completedLabs: {
          ...progress.completedLabs,
          [labId]: [...existing, cluster],
        },
      };
      setProgress(next);
      saveProgress(next);
    }
  };

  const xp = mounted ? computeXp(progress) : 0;
  const { current: rank, nextRank } = getRank(xp);
  const progressPct = Math.round((xp / MAX_XP) * 100);

  return {
    mounted,
    progress,
    activeCluster: progress.activeCluster,
    setCluster,
    markLessonRead,
    answerQuiz,
    recordLabCompletion,
    xp,
    maxXp: MAX_XP,
    rank,
    nextRank,
    progressPct,
  };
}
