"use client";

import React, { useState } from "react";
import {
  NotePencil,
  Quotes,
  Star,
  Trophy,
  X,
  Minus,
  CaretUp,
  Globe,
  GraduationCap,
  CheckCircle,
} from "../phosphor-icons";
import { FIELD_NOTES, AcademyView } from "./curriculum";
import { useAcademy, AcademyCluster } from "./academy-store";

export function FieldNoteCard({ view }: { view: AcademyView }) {
  const [isOpen, setIsOpen] = useState(true);
  const note = FIELD_NOTES[view] ?? FIELD_NOTES.home;
  const { activeCluster, setCluster, xp, maxXp, rank, nextRank, progressPct } = useAcademy();

  if (!isOpen) {
    return (
      <aside
        aria-label="Academy Field Notes"
        className="fixed bottom-5 right-5 z-40 animate-in fade-in slide-in-from-bottom-2 duration-200"
      >
        <button
          onClick={() => setIsOpen(true)}
          className="inline-flex items-center gap-2 border-2 border-[#121212] bg-[#FDFBF7] px-4 py-2.5 rounded-2xl font-serif text-xs font-bold text-[#121212] shadow-[4px_4px_0px_#121212] hover:bg-[#FFFFFF] hover:border-[#FF5A26] transition-all group"
          title="Open Field Dispatch & Lab Notes"
        >
          <div className="h-6 w-6 rounded-full bg-[#FF5A26] text-white flex items-center justify-center shrink-0">
            <NotePencil size={13} weight="bold" />
          </div>
          <div className="flex flex-col text-left">
            <span className="font-mono text-[10px] uppercase text-[#5A564F] tracking-wider leading-none">
              Field Notes &bull; {rank.name}
            </span>
            <span className="font-serif text-xs font-bold text-[#121212] group-hover:text-[#FF5A26] mt-0.5">
              {xp} / {maxXp} XP &bull; {activeCluster.toUpperCase()}
            </span>
          </div>
          <CaretUp size={14} weight="bold" className="text-[#5A564F] ml-1" />
        </button>
      </aside>
    );
  }

  return (
    <aside
      aria-label="Academy Field Notes"
      className="fixed bottom-5 right-5 z-40 w-[92vw] max-w-sm sm:max-w-md border-2 border-[#121212] bg-[#FDFBF7] rounded-2xl shadow-[6px_6px_0px_#121212] p-5 animate-in fade-in slide-in-from-bottom-3 duration-200 overflow-hidden"
    >
      {/* Top Header */}
      <div className="flex items-start justify-between gap-3 border-b-2 border-[#121212]/15 pb-3">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg border-2 border-[#121212] bg-[#FF5A26] text-white flex items-center justify-center shrink-0">
            <GraduationCap size={16} weight="bold" />
          </div>
          <div>
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#FF5A26] block leading-none">
              Field Dispatch &bull; {view.toUpperCase()}
            </span>
            <h4 className="font-serif text-sm font-bold text-[#121212] mt-0.5">
              {note.title}
            </h4>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsOpen(false)}
            className="border-2 border-[#121212] bg-[#FFFFFF] p-1 rounded-lg hover:bg-[#FF5A26] hover:text-white transition-colors"
            title="Minimize notes"
          >
            <Minus size={13} weight="bold" />
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="border-2 border-[#121212] bg-[#FFFFFF] p-1 rounded-lg hover:bg-[#FF5A26] hover:text-white transition-colors"
            title="Close"
          >
            <X size={13} weight="bold" />
          </button>
        </div>
      </div>

      {/* Cursive Quote Section */}
      <div className="mt-3.5 p-3.5 border-2 border-[#121212]/15 bg-[#FFFFFF] rounded-xl relative">
        <div className="absolute top-2 right-2.5 opacity-20 text-[#121212] pointer-events-none">
          <Quotes size={24} weight="bold" />
        </div>
        <p className="font-cursive text-xl text-[#121212] leading-snug tracking-wide italic">
          &ldquo;{note.quote.text}&rdquo;
        </p>
        <p className="font-mono text-[11px] text-[#5A564F] mt-1 text-right font-medium">
          &mdash; {note.quote.author}
        </p>
      </div>

      {/* Explanatory bullet points */}
      <ul className="mt-3 space-y-1.5 font-sans text-xs text-[#5A564F] leading-relaxed">
        {note.lines.map((line, idx) => (
          <li key={idx} className="flex items-start gap-2">
            <span className="text-[#FF5A26] font-bold text-sm leading-none mt-0.5">&bull;</span>
            <span>{line}</span>
          </li>
        ))}
      </ul>

      {/* Cluster Switcher & Progress Footer */}
      <div className="mt-4 pt-3 border-t-2 border-[#121212]/15 space-y-2.5">
        {/* Cluster Toggle */}
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[11px] font-bold uppercase text-[#5A564F] flex items-center gap-1">
            <Globe size={13} weight="bold" /> Sandbox Cluster:
          </span>
          <div className="inline-flex rounded-lg border-2 border-[#121212] bg-[#FFFFFF] p-0.5">
            <button
              onClick={() => setCluster("devnet")}
              className={`px-2.5 py-0.5 font-mono text-[10px] font-bold rounded-md transition-colors ${
                activeCluster === "devnet"
                  ? "bg-[#121212] text-white"
                  : "text-[#5A564F] hover:text-[#121212]"
              }`}
            >
              Devnet
            </button>
            <button
              onClick={() => setCluster("testnet")}
              className={`px-2.5 py-0.5 font-mono text-[10px] font-bold rounded-md transition-colors ${
                activeCluster === "testnet"
                  ? "bg-[#121212] text-white"
                  : "text-[#5A564F] hover:text-[#121212]"
              }`}
            >
              Testnet
            </button>
          </div>
        </div>

        {/* Rating & XP Bar */}
        <div className="bg-[#FFFFFF] border-2 border-[#121212]/15 p-2.5 rounded-xl space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 font-serif font-bold text-[#121212]">
              <Trophy size={13} weight="bold" className="text-[#FF5A26]" />
              <span>Rank: {rank.name}</span>
            </div>
            <span className="font-mono text-[11px] font-bold text-[#FF5A26]">
              {xp} / {maxXp} XP ({progressPct}%)
            </span>
          </div>

          <div className="w-full h-2 rounded-full border border-[#121212]/20 bg-[#F7F4EC] overflow-hidden">
            <div
              className="h-full bg-[#FF5A26] transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          {nextRank && (
            <p className="font-mono text-[10px] text-[#5A564F]">
              Next milestone: {nextRank.name} at {nextRank.min} XP
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}
