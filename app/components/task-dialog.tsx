"use client";

import React, { useEffect } from "react";
import { X, Play, ArrowRight, CheckCircle, Warning, ClockCounterClockwise } from "./phosphor-icons";

export interface TaskDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  tag?: string;
  status?: "idle" | "running" | "completed" | "error" | "cancelled";
  onCancel?: () => void;
  cancelLabel?: string;
  children: React.ReactNode;
  footerActions?: React.ReactNode;
  maxWidth?: string;
}

/**
 * TaskDialogModal: A standardized brutalist-editorial modal dialogue
 * for running interactive tests, simulations, and transactions with live progress,
 * cancel/close support, and contained result displays.
 */
export function TaskDialogModal({
  isOpen,
  onClose,
  title,
  subtitle,
  tag = "INTERACTIVE TASK",
  status = "idle",
  onCancel,
  cancelLabel = "Cancel Test",
  children,
  footerActions,
  maxWidth = "max-w-2xl",
}: TaskDialogProps) {
  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Lock background scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const statusBadge = () => {
    switch (status) {
      case "running":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-amber-400 bg-amber-50 text-amber-900 font-mono text-[11px] font-bold">
            <span className="h-2 w-2 rounded-full bg-amber-500 animate-ping" />
            Running Test...
          </span>
        );
      case "completed":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-emerald-400 bg-emerald-50 text-emerald-900 font-mono text-[11px] font-bold">
            <CheckCircle size={12} weight="bold" className="text-emerald-600" />
            Completed
          </span>
        );
      case "error":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-red-400 bg-red-50 text-red-900 font-mono text-[11px] font-bold">
            <Warning size={12} weight="bold" className="text-red-600" />
            Error
          </span>
        );
      case "cancelled":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-[#121212]/20 bg-[#F7F4EC] text-[#5A564F] font-mono text-[11px] font-bold">
            Cancelled
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-[#121212]/20 bg-[#F7F4EC] text-[#5A564F] font-mono text-[11px] font-bold">
            Ready
          </span>
        );
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm animate-in fade-in duration-200 sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`flex h-[94svh] max-h-[94svh] w-full ${maxWidth} flex-col border-2 border-[#121212] bg-[#FDFBF7] rounded-t-2xl shadow-[6px_6px_0px_#121212] overflow-hidden sm:h-full sm:max-h-[85vh] sm:rounded-2xl`}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b-2 border-[#121212] bg-[#FFFFFF] px-4 py-3 sm:px-5 sm:py-4">
          <div className="min-w-0 flex flex-col gap-0.5 pr-3 sm:pr-4">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#FF5A26] bg-[#FF5A26]/10 px-2 py-0.5 rounded">
                {tag}
              </span>
              {statusBadge()}
            </div>
            <h3 className="font-serif text-base sm:text-xl font-bold text-[#121212] leading-tight">
              {title}
            </h3>
            {subtitle && (
              <p className="font-mono text-[11px] sm:text-xs text-[#5A564F] mt-0.5">
                {subtitle}
              </p>
            )}
          </div>

          <button
            onClick={onClose}
            className="border-2 border-[#121212] bg-white p-1.5 rounded-xl hover:bg-[#FF5A26] hover:text-white transition-colors shrink-0"
            title="Close dialogue"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-5">
          {children}
        </div>

        {/* Modal Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-[#121212] bg-[#FFFFFF] px-4 py-3 sm:px-5 sm:py-3.5">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            {status === "running" && onCancel && (
              <button
                onClick={onCancel}
                className="border-2 border-red-600 bg-red-50 text-red-700 px-4 py-1.5 font-mono text-xs font-bold rounded-xl hover:bg-red-600 hover:text-white transition-colors"
              >
                {cancelLabel}
              </button>
            )}
            {footerActions}
          </div>

          <button
            onClick={onClose}
            style={{ backgroundColor: "#121212", color: "#FFFFFF" }}
            className="min-h-10 border-2 border-[#121212] !bg-[#121212] !text-white px-6 py-2 font-mono text-xs font-black uppercase tracking-wider rounded-xl hover:!bg-[#FF5A26] transition-colors ml-auto shadow-[2px_2px_0px_#121212]"
          >
            <span style={{ color: "#FFFFFF" }} className="!text-white font-mono text-xs font-bold">Close Dialogue</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * TaskActionCard: Editorial card component displayed on the page.
 * Shows title, a brief description of what the feature does, and a prominent
 * action button that triggers the execution dialogue box. Results are NOT
 * rendered here by default.
 */
export function TaskActionCard({
  tag,
  title,
  description,
  actionLabel,
  actionIcon: ActionIcon = Play,
  onAction,
  hasRun = false,
  lastRunSummary,
  variant = "default",
  disabled = false,
  className = "",
}: {
  tag?: string;
  title: string;
  description: string;
  actionLabel: string;
  actionIcon?: React.ComponentType<{ size?: number; className?: string; weight?: "regular" | "bold" | "fill" }>;
  onAction: () => void;
  hasRun?: boolean;
  lastRunSummary?: string;
  variant?: "default" | "orange" | "dark";
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`border-2 border-[#121212] bg-[#FFFFFF] rounded-2xl p-5 sm:p-6 flex flex-col justify-between transition-shadow hover:shadow-[4px_4px_0px_#121212] ${className}`}
    >
      <div>
        {tag && (
          <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#FF5A26] bg-[#FF5A26]/10 px-2 py-0.5 rounded inline-block mb-2">
            {tag}
          </span>
        )}
        <h4 className="font-serif text-lg font-bold text-[#121212] leading-snug">
          {title}
        </h4>
        <p className="font-sans text-xs sm:text-sm text-[#5A564F] mt-2 leading-relaxed">
          {description}
        </p>
      </div>

      <div className="mt-5 pt-4 border-t-2 border-[#121212]/10 flex flex-wrap items-center justify-between gap-3">
        {hasRun && lastRunSummary ? (
          <span className="font-mono text-[11px] text-[#5A564F] bg-[#F7F4EC] px-2.5 py-1 rounded-lg border border-[#121212]/15">
            {lastRunSummary}
          </span>
        ) : (
          <span className="font-mono text-[11px] text-[#5A564F]">
            Results appear in popup
          </span>
        )}

        <button
          onClick={onAction}
          disabled={disabled}
          className={`inline-flex items-center gap-2 border-2 border-[#121212] px-4 py-2 font-serif text-xs font-bold rounded-xl transition-all disabled:opacity-50 shadow-[2px_2px_0px_#121212] active:translate-x-[1px] active:translate-y-[1px] ${
            variant === "orange"
              ? "bg-[#FF5A26] text-white hover:bg-[#E84D1C]"
              : variant === "dark"
              ? "bg-[#121212] text-white hover:bg-[#FF5A26]"
              : "bg-[#FF5A26] text-white hover:bg-[#E84D1C]"
          }`}
        >
          <ActionIcon size={13} weight="bold" />
          <span>{actionLabel}</span>
        </button>
      </div>
    </div>
  );
}

/**
 * LiveTestStageList: Renders step-by-step test execution stages inside dialogue boxes.
 */
export function LiveTestStageList({
  stages,
  activeStageIndex,
}: {
  stages: { id: string; label: string; detail?: string }[];
  activeStageIndex: number;
}) {
  return (
    <div className="space-y-2 border-2 border-[#121212] bg-[#FFFFFF] p-4 rounded-xl">
      <p className="font-mono text-xs font-bold uppercase tracking-wider text-[#5A564F] mb-3">
        Test Execution Steps
      </p>
      <div className="space-y-2">
        {stages.map((stage, idx) => {
          const isDone = idx < activeStageIndex;
          const isCurrent = idx === activeStageIndex;
          return (
            <div
              key={stage.id}
              className={`flex items-start gap-3 p-2.5 rounded-lg border transition-colors ${
                isCurrent
                  ? "border-[#FF5A26] bg-[#FF5A26]/5 text-[#121212]"
                  : isDone
                  ? "border-emerald-300 bg-emerald-50/50 text-[#121212]"
                  : "border-transparent text-[#5A564F] opacity-60"
              }`}
            >
              <div className="shrink-0 mt-0.5">
                {isDone ? (
                  <CheckCircle size={15} weight="bold" className="text-emerald-600" />
                ) : isCurrent ? (
                  <span className="h-3.5 w-3.5 rounded-full border-2 border-[#FF5A26] border-t-transparent animate-spin inline-block" />
                ) : (
                  <span className="h-3.5 w-3.5 rounded-full border border-[#121212]/30 inline-block" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-serif text-xs font-bold leading-tight">
                  {stage.label}
                </p>
                {stage.detail && (
                  <p className="font-mono text-[11px] text-[#5A564F] mt-0.5">
                    {stage.detail}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
