"use client";

import React from "react";
import { GraduationCap, Star, Trophy, Globe } from "../phosphor-icons";
import { TRACKS, lessonsForView, AcademyView } from "./curriculum";
import { LessonCard } from "./lesson-card";
import { useAcademy } from "./academy-store";

export function AcademyTrackSection({ view }: { view: AcademyView }) {
  const track = TRACKS.find((t) => t.view === view) ?? TRACKS[0];
  const lessons = lessonsForView(view);
  const { activeCluster, setCluster, xp, rank, progress } = useAcademy();

  const completedInTrack = lessons.filter((l) =>
    (progress.completedLabs[l.lab.id] ?? []).length > 0
  ).length;

  return (
    <section
      id={`academy-track-${view}`}
      aria-label={`${track.title} Curriculum Track`}
      className="mx-auto max-w-7xl px-4 py-8 sm:px-6 space-y-6"
    >
      {/* Track Header Box */}
      <div className="border-2 border-[#121212] bg-[#FDFBF7] rounded-2xl p-6 sm:p-8 shadow-[4px_4px_0px_#121212]">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-[#121212]/15 pb-5">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 mb-2">
              <span className="font-mono text-xs font-bold text-[#FF5A26] bg-[#FF5A26]/10 px-2.5 py-0.5 rounded uppercase tracking-wider">
                {track.label} &bull; Interactive Learning Track
              </span>
              <span className="font-mono text-xs font-bold text-[#5A564F] bg-[#121212]/5 px-2 py-0.5 rounded">
                {completedInTrack} of {lessons.length} Labs Passed
              </span>
            </div>
            <h2 className="font-serif text-3xl sm:text-4xl font-black text-[#121212] leading-tight">
              {track.title} Masterclass &amp; Live Sandbox
            </h2>
            <p className="font-sans text-sm sm:text-base text-[#5A564F] mt-2 leading-relaxed">
              {track.blurb}
            </p>
          </div>

          {/* Quick cluster switcher */}
          <div className="flex flex-col items-start sm:items-end gap-2 shrink-0">
            <span className="font-mono text-xs font-bold uppercase text-[#5A564F] flex items-center gap-1">
              <Globe size={13} weight="bold" /> Execution Cluster:
            </span>
            <div className="inline-flex rounded-xl border-2 border-[#121212] bg-[#FFFFFF] p-1 shadow-[2px_2px_0px_#121212]">
              <button
                onClick={() => setCluster("devnet")}
                className={`px-3 py-1 font-mono text-xs font-bold rounded-lg transition-colors ${
                  activeCluster === "devnet"
                    ? "bg-[#FF5A26] text-white"
                    : "text-[#5A564F] hover:text-[#121212]"
                }`}
              >
                Devnet
              </button>
              <button
                onClick={() => setCluster("testnet")}
                className={`px-3 py-1 font-mono text-xs font-bold rounded-lg transition-colors ${
                  activeCluster === "testnet"
                    ? "bg-[#FF5A26] text-white"
                    : "text-[#5A564F] hover:text-[#121212]"
                }`}
              >
                Testnet
              </button>
            </div>
          </div>
        </div>

        {/* Track stats bar */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center gap-3">
            <span className="text-[#121212] font-bold">
              Current Rank: <span className="text-[#FF5A26]">{rank.name}</span>
            </span>
            <span className="text-[#121212]/30">&bull;</span>
            <span className="text-[#5A564F]">Total Score: {xp} XP</span>
          </div>
          <span className="text-[#5A564F]">
            Every lab runs against genuine Solana public infrastructure.
          </span>
        </div>
      </div>

      {/* Render Lessons */}
      <div className="space-y-6">
        {lessons.map((lesson) => (
          <LessonCard key={lesson.id} lesson={lesson} />
        ))}
      </div>
    </section>
  );
}
