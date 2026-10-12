"use client";

import * as React from "react";

export type CheckeredVariant =
  | "solid"
  | "diagonal-lines"
  | "diagonal-reverse"
  | "cross-hatch"
  | "diagonal-dense"
  | "mixture"
  | "hybrid-cascade";

interface CheckeredBorderProps {
  variant: CheckeredVariant;
  height?: number;
  className?: string;
  idPrefix?: string;
}

export function CheckeredBorder({
  variant,
  height = 16,
  className = "",
  idPrefix = "chk",
}: CheckeredBorderProps) {
  const uid = React.useId().replace(/:/g, "_");
  const patternId = `${idPrefix}_${variant}_${uid}`;

  // Base cell size (each square is 12x12 px, so 2x2 grid pattern is 24x24 px)
  const s = 12;
  const pSize = s * 2; // 24

  return (
    <div
      className={`w-full overflow-hidden select-none pointer-events-none ${className}`}
      style={{ height: `${height}px` }}
      aria-hidden="true"
    >
      <svg
        width="100%"
        height="100%"
        className="w-full h-full block"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* =
              1. VARIANT: SOLID (Section 1 / Hero)
              Checkered boxes fully shaded in alternating black & orange
              = */}
          {variant === "solid" && (
            <pattern
              id={patternId}
              width={pSize}
              height={pSize}
              patternUnits="userSpaceOnUse"
            >
              <rect width={pSize} height={pSize} fill="#F7F4EC" />
              <rect x="0" y="0" width={s} height={s} fill="#121212" />
              <rect x={s} y="0" width={s} height={s} fill="#FF5A26" />
              <rect x="0" y={s} width={s} height={s} fill="#FF5A26" />
              <rect x={s} y={s} width={s} height={s} fill="#121212" />
              <line x1="0" y1="0" x2={pSize} y2="0" stroke="#121212" strokeWidth="0.8" />
              <line x1="0" y1={s} x2={pSize} y2={s} stroke="#121212" strokeWidth="0.8" />
              <line x1="0" y1="0" x2="0" y2={pSize} stroke="#121212" strokeWidth="0.8" />
              <line x1={s} y1="0" x2={s} y2={pSize} stroke="#121212" strokeWidth="0.8" />
            </pattern>
          )}

          {/* =
              2. VARIANT: DIAGONAL-LINES (Section 2 / Explainer 01)
              Checkered boxes shaded with 45° diagonal lines
              = */}
          {variant === "diagonal-lines" && (
            <pattern
              id={patternId}
              width={pSize}
              height={pSize}
              patternUnits="userSpaceOnUse"
            >
              <rect width={pSize} height={pSize} fill="#FFFFFF" />
              {/* Cell 1: 0..s, 0..s with 45° lines */}
              <g stroke="#121212" strokeWidth="1.4" strokeLinecap="square">
                <line x1="-2" y1="4" x2="4" y2="-2" />
                <line x1="-2" y1="8" x2="8" y2="-2" />
                <line x1="-2" y1="12" x2="12" y2="-2" stroke="#FF5A26" strokeWidth="1.6" />
                <line x1="2" y1="14" x2="14" y2="2" />
                <line x1="6" y1="14" x2="14" y2="6" />
                <line x1="10" y1="14" x2="14" y2="10" />
              </g>
              {/* Cell 4: s..2s, s..2s with 45° lines */}
              <g
                transform={`translate(${s}, ${s})`}
                stroke="#121212"
                strokeWidth="1.4"
                strokeLinecap="square"
              >
                <line x1="-2" y1="4" x2="4" y2="-2" />
                <line x1="-2" y1="8" x2="8" y2="-2" />
                <line x1="-2" y1="12" x2="12" y2="-2" stroke="#FF5A26" strokeWidth="1.6" />
                <line x1="2" y1="14" x2="14" y2="2" />
                <line x1="6" y1="14" x2="14" y2="6" />
                <line x1="10" y1="14" x2="14" y2="10" />
              </g>
              {/* Grid cell outlines */}
              <line x1="0" y1="0" x2={pSize} y2="0" stroke="#121212" strokeWidth="0.8" />
              <line x1="0" y1={s} x2={pSize} y2={s} stroke="#121212" strokeWidth="0.8" />
              <line x1="0" y1="0" x2="0" y2={pSize} stroke="#121212" strokeWidth="0.8" />
              <line x1={s} y1="0" x2={s} y2={pSize} stroke="#121212" strokeWidth="0.8" />
            </pattern>
          )}

          {/* =
              3. VARIANT: DIAGONAL-REVERSE (Section 3 / Explainer 02)
              Checkered boxes shaded with reverse -45° diagonal lines (135°)
              = */}
          {variant === "diagonal-reverse" && (
            <pattern
              id={patternId}
              width={pSize}
              height={pSize}
              patternUnits="userSpaceOnUse"
            >
              <rect width={pSize} height={pSize} fill="#FFFFFF" />
              {/* Cell 1: 0..s, 0..s with -45° lines */}
              <g stroke="#FF5A26" strokeWidth="1.4" strokeLinecap="square">
                <line x1="14" y1="4" x2="8" y2="-2" />
                <line x1="14" y1="8" x2="4" y2="-2" stroke="#121212" strokeWidth="1.4" />
                <line x1="14" y1="12" x2="0" y2="-2" />
                <line x1="10" y1="14" x2="-2" y2="2" stroke="#121212" strokeWidth="1.4" />
                <line x1="6" y1="14" x2="-2" y2="6" />
                <line x1="2" y1="14" x2="-2" y2="10" />
              </g>
              {/* Cell 4: s..2s, s..2s with -45° lines */}
              <g
                transform={`translate(${s}, ${s})`}
                stroke="#FF5A26"
                strokeWidth="1.4"
                strokeLinecap="square"
              >
                <line x1="14" y1="4" x2="8" y2="-2" />
                <line x1="14" y1="8" x2="4" y2="-2" stroke="#121212" strokeWidth="1.4" />
                <line x1="14" y1="12" x2="0" y2="-2" />
                <line x1="10" y1="14" x2="-2" y2="2" stroke="#121212" strokeWidth="1.4" />
                <line x1="6" y1="14" x2="-2" y2="6" />
                <line x1="2" y1="14" x2="-2" y2="10" />
              </g>
              {/* Grid cell outlines */}
              <line x1="0" y1="0" x2={pSize} y2="0" stroke="#121212" strokeWidth="0.8" />
              <line x1="0" y1={s} x2={pSize} y2={s} stroke="#121212" strokeWidth="0.8" />
              <line x1="0" y1="0" x2="0" y2={pSize} stroke="#121212" strokeWidth="0.8" />
              <line x1={s} y1="0" x2={s} y2={pSize} stroke="#121212" strokeWidth="0.8" />
            </pattern>
          )}

          {/* =
              4. VARIANT: CROSS-HATCH (Section 4 / Explainer 03)
              Checkered boxes shaded with intersecting cross-hatch diagonals
              = */}
          {variant === "cross-hatch" && (
            <pattern
              id={patternId}
              width={pSize}
              height={pSize}
              patternUnits="userSpaceOnUse"
            >
              <rect width={pSize} height={pSize} fill="#FFFFFF" />
              {/* Cell 1: cross-hatch */}
              <g stroke="#121212" strokeWidth="1.2" strokeLinecap="square">
                <line x1="0" y1="3" x2="12" y2="3" stroke="#FF5A26" strokeWidth="1" />
                <line x1="0" y1="6" x2="12" y2="6" />
                <line x1="0" y1="9" x2="12" y2="9" stroke="#FF5A26" strokeWidth="1" />
                <line x1="3" y1="0" x2="3" y2="12" stroke="#FF5A26" strokeWidth="1" />
                <line x1="6" y1="0" x2="6" y2="12" />
                <line x1="9" y1="0" x2="9" y2="12" stroke="#FF5A26" strokeWidth="1" />
              </g>
              {/* Cell 4: cross-hatch */}
              <g
                transform={`translate(${s}, ${s})`}
                stroke="#121212"
                strokeWidth="1.2"
                strokeLinecap="square"
              >
                <line x1="0" y1="3" x2="12" y2="3" stroke="#FF5A26" strokeWidth="1" />
                <line x1="0" y1="6" x2="12" y2="6" />
                <line x1="0" y1="9" x2="12" y2="9" stroke="#FF5A26" strokeWidth="1" />
                <line x1="3" y1="0" x2="3" y2="12" stroke="#FF5A26" strokeWidth="1" />
                <line x1="6" y1="0" x2="6" y2="12" />
                <line x1="9" y1="0" x2="9" y2="12" stroke="#FF5A26" strokeWidth="1" />
              </g>
              {/* Grid cell outlines */}
              <line x1="0" y1="0" x2={pSize} y2="0" stroke="#121212" strokeWidth="0.8" />
              <line x1="0" y1={s} x2={pSize} y2={s} stroke="#121212" strokeWidth="0.8" />
              <line x1="0" y1="0" x2="0" y2={pSize} stroke="#121212" strokeWidth="0.8" />
              <line x1={s} y1="0" x2={s} y2={pSize} stroke="#121212" strokeWidth="0.8" />
            </pattern>
          )}

          {/* =
              5. VARIANT: DIAGONAL-DENSE (Section 5 / Explainer 04)
              High-density fine diagonal razor stripes
              = */}
          {variant === "diagonal-dense" && (
            <pattern
              id={patternId}
              width={pSize}
              height={pSize}
              patternUnits="userSpaceOnUse"
            >
              <rect width={pSize} height={pSize} fill="#FFFFFF" />
              {/* Cell 1: dense diagonal */}
              <g stroke="#121212" strokeWidth="1" strokeLinecap="square">
                <line x1="-2" y1="2" x2="2" y2="-2" />
                <line x1="-2" y1="4" x2="4" y2="-2" stroke="#FF5A26" />
                <line x1="-2" y1="6" x2="6" y2="-2" />
                <line x1="-2" y1="8" x2="8" y2="-2" stroke="#FF5A26" />
                <line x1="-2" y1="10" x2="10" y2="-2" />
                <line x1="-2" y1="12" x2="12" y2="-2" stroke="#FF5A26" />
                <line x1="0" y1="14" x2="14" y2="0" />
                <line x1="2" y1="14" x2="14" y2="2" stroke="#FF5A26" />
                <line x1="4" y1="14" x2="14" y2="4" />
                <line x1="6" y1="14" x2="14" y2="6" stroke="#FF5A26" />
                <line x1="8" y1="14" x2="14" y2="8" />
                <line x1="10" y1="14" x2="14" y2="10" stroke="#FF5A26" />
              </g>
              {/* Cell 4: dense diagonal */}
              <g
                transform={`translate(${s}, ${s})`}
                stroke="#121212"
                strokeWidth="1"
                strokeLinecap="square"
              >
                <line x1="-2" y1="2" x2="2" y2="-2" />
                <line x1="-2" y1="4" x2="4" y2="-2" stroke="#FF5A26" />
                <line x1="-2" y1="6" x2="6" y2="-2" />
                <line x1="-2" y1="8" x2="8" y2="-2" stroke="#FF5A26" />
                <line x1="-2" y1="10" x2="10" y2="-2" />
                <line x1="-2" y1="12" x2="12" y2="-2" stroke="#FF5A26" />
                <line x1="0" y1="14" x2="14" y2="0" />
                <line x1="2" y1="14" x2="14" y2="2" stroke="#FF5A26" />
                <line x1="4" y1="14" x2="14" y2="4" />
                <line x1="6" y1="14" x2="14" y2="6" stroke="#FF5A26" />
                <line x1="8" y1="14" x2="14" y2="8" />
                <line x1="10" y1="14" x2="14" y2="10" stroke="#FF5A26" />
              </g>
              {/* Grid cell outlines */}
              <line x1="0" y1="0" x2={pSize} y2="0" stroke="#121212" strokeWidth="0.8" />
              <line x1="0" y1={s} x2={pSize} y2={s} stroke="#121212" strokeWidth="0.8" />
              <line x1="0" y1="0" x2="0" y2={pSize} stroke="#121212" strokeWidth="0.8" />
              <line x1={s} y1="0" x2={s} y2={pSize} stroke="#121212" strokeWidth="0.8" />
            </pattern>
          )}

          {/* =
              6. VARIANT: MIXTURE (Section 6 / Explainer 05)
              The Mixture: Solid orange + Black diagonal lines combined!
              = */}
          {variant === "mixture" && (
            <pattern
              id={patternId}
              width={pSize}
              height={pSize}
              patternUnits="userSpaceOnUse"
            >
              <rect width={pSize} height={pSize} fill="#FFFFFF" />
              {/* Cell 1: Solid orange */}
              <rect x="0" y="0" width={s} height={s} fill="#FF5A26" />
              {/* Cell 2: Black diagonal lines */}
              <g
                transform={`translate(${s}, 0)`}
                stroke="#121212"
                strokeWidth="1.5"
                strokeLinecap="square"
              >
                <line x1="-2" y1="4" x2="4" y2="-2" />
                <line x1="-2" y1="8" x2="8" y2="-2" />
                <line x1="-2" y1="12" x2="12" y2="-2" />
                <line x1="2" y1="14" x2="14" y2="2" />
                <line x1="6" y1="14" x2="14" y2="6" />
                <line x1="10" y1="14" x2="14" y2="10" />
              </g>
              {/* Cell 3: Orange diagonal lines */}
              <g
                transform={`translate(0, ${s})`}
                stroke="#FF5A26"
                strokeWidth="1.5"
                strokeLinecap="square"
              >
                <line x1="14" y1="4" x2="8" y2="-2" />
                <line x1="14" y1="8" x2="4" y2="-2" />
                <line x1="14" y1="12" x2="0" y2="-2" />
                <line x1="10" y1="14" x2="-2" y2="2" />
                <line x1="6" y1="14" x2="-2" y2="6" />
                <line x1="2" y1="14" x2="-2" y2="10" />
              </g>
              {/* Cell 4: Solid black */}
              <rect x={s} y={s} width={s} height={s} fill="#121212" />
              {/* Grid cell outlines */}
              <line x1="0" y1="0" x2={pSize} y2="0" stroke="#121212" strokeWidth="0.8" />
              <line x1="0" y1={s} x2={pSize} y2={s} stroke="#121212" strokeWidth="0.8" />
              <line x1="0" y1="0" x2="0" y2={pSize} stroke="#121212" strokeWidth="0.8" />
              <line x1={s} y1="0" x2={s} y2={pSize} stroke="#121212" strokeWidth="0.8" />
            </pattern>
          )}

          {/* =
              7. VARIANT: HYBRID-CASCADE (Section 7 / Explainer 06)
              Grand Finale: Alternating solid hazard check & dual-tone hatch
              = */}
          {variant === "hybrid-cascade" && (
            <pattern
              id={patternId}
              width={pSize}
              height={pSize}
              patternUnits="userSpaceOnUse"
            >
              <rect width={pSize} height={pSize} fill="#FDFBF7" />
              {/* Cell 1: Solid black with orange diagonal stripes */}
              <rect x="0" y="0" width={s} height={s} fill="#121212" />
              <g stroke="#FF5A26" strokeWidth="1.4" strokeLinecap="square">
                <line x1="-2" y1="6" x2="6" y2="-2" />
                <line x1="-2" y1="12" x2="12" y2="-2" />
                <line x1="4" y1="14" x2="14" y2="4" />
              </g>
              {/* Cell 2: Dense cross-hatch */}
              <g
                transform={`translate(${s}, 0)`}
                stroke="#121212"
                strokeWidth="1"
                strokeLinecap="square"
              >
                <line x1="0" y1="4" x2="12" y2="4" stroke="#FF5A26" />
                <line x1="0" y1="8" x2="12" y2="8" stroke="#FF5A26" />
                <line x1="4" y1="0" x2="4" y2="12" />
                <line x1="8" y1="0" x2="8" y2="12" />
              </g>
              {/* Cell 3: Dense diagonal orange */}
              <g
                transform={`translate(0, ${s})`}
                stroke="#FF5A26"
                strokeWidth="1.5"
                strokeLinecap="square"
              >
                <line x1="-2" y1="4" x2="4" y2="-2" />
                <line x1="-2" y1="8" x2="8" y2="-2" />
                <line x1="-2" y1="12" x2="12" y2="-2" />
                <line x1="2" y1="14" x2="14" y2="2" />
                <line x1="6" y1="14" x2="14" y2="6" />
                <line x1="10" y1="14" x2="14" y2="10" />
              </g>
              {/* Cell 4: Solid orange with black diagonal stripes */}
              <rect x={s} y={s} width={s} height={s} fill="#FF5A26" />
              <g
                transform={`translate(${s}, ${s})`}
                stroke="#121212"
                strokeWidth="1.4"
                strokeLinecap="square"
              >
                <line x1="14" y1="4" x2="8" y2="-2" />
                <line x1="14" y1="10" x2="2" y2="-2" />
                <line x1="8" y1="14" x2="-2" y2="4" />
              </g>
              {/* Grid cell outlines */}
              <line x1="0" y1="0" x2={pSize} y2="0" stroke="#121212" strokeWidth="0.8" />
              <line x1="0" y1={s} x2={pSize} y2={s} stroke="#121212" strokeWidth="0.8" />
              <line x1="0" y1="0" x2="0" y2={pSize} stroke="#121212" strokeWidth="0.8" />
              <line x1={s} y1="0" x2={s} y2={pSize} stroke="#121212" strokeWidth="0.8" />
            </pattern>
          )}
        </defs>

        <rect width="100%" height="100%" fill={`url(#${patternId})`} />
      </svg>
    </div>
  );
}

/**
 * CheckeredTextRibbon: A curated decorative element placed directly beneath
 * section kicker labels or title headlines on the landing page background.
 */
export function CheckeredTextRibbon({
  variant,
  caption,
  className = "",
}: {
  variant: CheckeredVariant;
  caption?: string;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-2.5 my-3.5 max-w-xl ${className}`}>
      <div className="flex-1 border-2 border-[#121212] rounded-md overflow-hidden bg-white shadow-[2px_2px_0px_#121212]">
        <CheckeredBorder variant={variant} height={14} />
      </div>
      {caption && (
        <span className="font-mono text-[10px] uppercase font-bold tracking-wider text-[#5A564F] shrink-0 border border-[#121212]/20 bg-[#F7F4EC] px-1.5 py-0.5 rounded">
          {caption}
        </span>
      )}
    </div>
  );
}

/**
 * Helper to generate 45-degree diagonal hatching lines inside an s x s square at (offsetX, offsetY)
 * using direct SVG path syntax (avoiding nested pattern browser rendering bugs).
 */
function generateHatchPath(
  s: number,
  step: number,
  reverse = false,
  offsetX = 0,
  offsetY = 0
): string {
  const segments: string[] = [];
  for (let k = step; k < 2 * s; k += step) {
    let x1: number, y1: number, x2: number, y2: number;
    if (k <= s) {
      x1 = 0;
      y1 = k;
      x2 = k;
      y2 = 0;
    } else {
      x1 = k - s;
      y1 = s;
      x2 = s;
      y2 = k - s;
    }
    if (reverse) {
      x1 = s - x1;
      x2 = s - x2;
    }
    segments.push(
      `M${(x1 + offsetX).toFixed(1)},${(y1 + offsetY).toFixed(1)}L${(x2 + offsetX).toFixed(1)},${(y2 + offsetY).toFixed(1)}`
    );
  }
  return segments.join(" ");
}

/**
 * Helper to generate seamless corner crosshair plus (+) markers at all grid intersections
 * without edge clipping.
 */
function generateCrosshairPath(s: number, pSize: number, arm = 4.5): string {
  return [
    // Interior center vertex (s, s)
    `M${s - arm},${s}h${arm * 2}M${s},${s - arm}v${arm * 2}`,
    // Horizontal edge vertices (s, 0) and (s, pSize)
    `M${s - arm},0h${arm * 2}M${s},0v${arm}`,
    `M${s - arm},${pSize}h${arm * 2}M${s},${pSize}v-${arm}`,
    // Vertical edge vertices (0, s) and (pSize, s)
    `M0,${s - arm}v${arm * 2}M0,${s}h${arm}`,
    `M${pSize},${s - arm}v${arm * 2}M${pSize},${s}h-${arm}`,
    // 4 Corner vertices meeting across adjacent tiles
    `M0,0h${arm}M0,0v${arm}`,
    `M${pSize},0h-${arm}M${pSize},0v${arm}`,
    `M0,${pSize}h${arm}M0,${pSize}v-${arm}`,
    `M${pSize},${pSize}h-${arm}M${pSize},${pSize}v-${arm}`,
  ].join(" ");
}

/**
 * CheckeredGridBackground: An architectural drafting checkered grid pattern
 * with soft, fine diagonal hatching in alternating squares, delicate hairline borders,
 * and subtle corner crosshairs, calibrated for optimal background readability
 * matching the refined editorial aesthetic of aanuore.works.
 */
export function CheckeredGridBackground({
  variant = "diagonal-lines",
  cellSize = 44,
  opacity = 0.85,
  className = "",
}: {
  variant?: CheckeredVariant;
  cellSize?: number;
  opacity?: number;
  className?: string;
}) {
  const uid = React.useId().replace(/:/g, "_");
  const patternId = `grid_master_${variant}_${uid}`;
  const s = cellSize;
  const pSize = s * 2;

  // Precompute hatch paths for Cell 1 (0, 0) and Cell 4 (s, s)
  const hatchStep = variant === "diagonal-dense" ? 4 : 6;
  const isReverse = variant === "diagonal-reverse";

  const forwardCell1 = generateHatchPath(s, hatchStep, false, 0, 0);
  const forwardCell4 = generateHatchPath(s, hatchStep, false, s, s);

  const reverseCell1 = generateHatchPath(s, hatchStep, true, 0, 0);
  const reverseCell4 = generateHatchPath(s, hatchStep, true, s, s);

  const crossCell1 = `${forwardCell1} ${reverseCell1}`;
  const crossCell4 = `${forwardCell4} ${reverseCell4}`;

  // Crosshair path
  const crosshairs = generateCrosshairPath(s, pSize, 4);

  return (
    <div
      className={`absolute inset-0 pointer-events-none select-none overflow-hidden ${className}`}
      style={{ opacity }}
      aria-hidden="true"
    >
      <svg width="100%" height="100%" className="w-full h-full block">
        <defs>
          <pattern
            id={patternId}
            width={pSize}
            height={pSize}
            patternUnits="userSpaceOnUse"
          >
            {/* 1. SOLID VARIANT */}
            {variant === "solid" && (
              <>
                <rect x="0" y="0" width={s} height={s} fill="rgba(18, 18, 18, 0.05)" />
                <rect x={s} y={s} width={s} height={s} fill="rgba(255, 90, 38, 0.07)" />
              </>
            )}

            {/* 2. DIAGONAL-LINES VARIANT (aanuore.works reference: delicate & legible) */}
            {variant === "diagonal-lines" && (
              <>
                <rect x="0" y="0" width={s} height={s} fill="rgba(18, 18, 18, 0.015)" />
                <rect x={s} y={s} width={s} height={s} fill="rgba(18, 18, 18, 0.015)" />
                <path
                  d={`${forwardCell1} ${forwardCell4}`}
                  stroke="rgba(18, 18, 18, 0.18)"
                  strokeWidth="1.1"
                  strokeLinecap="square"
                />
              </>
            )}

            {/* 3. DIAGONAL-REVERSE VARIANT */}
            {variant === "diagonal-reverse" && (
              <>
                <rect x="0" y="0" width={s} height={s} fill="rgba(18, 18, 18, 0.015)" />
                <rect x={s} y={s} width={s} height={s} fill="rgba(18, 18, 18, 0.015)" />
                <path
                  d={`${reverseCell1} ${reverseCell4}`}
                  stroke="rgba(18, 18, 18, 0.18)"
                  strokeWidth="1.1"
                  strokeLinecap="square"
                />
              </>
            )}

            {/* 4. CROSS-HATCH VARIANT */}
            {variant === "cross-hatch" && (
              <>
                <rect x="0" y="0" width={s} height={s} fill="rgba(18, 18, 18, 0.015)" />
                <rect x={s} y={s} width={s} height={s} fill="rgba(18, 18, 18, 0.015)" />
                <path
                  d={`${crossCell1} ${crossCell4}`}
                  stroke="rgba(18, 18, 18, 0.15)"
                  strokeWidth="1.0"
                  strokeLinecap="square"
                />
              </>
            )}

            {/* 5. DIAGONAL-DENSE VARIANT */}
            {variant === "diagonal-dense" && (
              <>
                <rect x="0" y="0" width={s} height={s} fill="rgba(18, 18, 18, 0.015)" />
                <rect x={s} y={s} width={s} height={s} fill="rgba(18, 18, 18, 0.015)" />
                <path
                  d={`${forwardCell1} ${forwardCell4}`}
                  stroke="rgba(18, 18, 18, 0.16)"
                  strokeWidth="0.9"
                  strokeLinecap="square"
                />
              </>
            )}

            {/* 6. MIXTURE VARIANT */}
            {variant === "mixture" && (
              <>
                <rect x="0" y="0" width={s} height={s} fill="rgba(18, 18, 18, 0.02)" />
                <path
                  d={forwardCell1}
                  stroke="rgba(18, 18, 18, 0.20)"
                  strokeWidth="1.1"
                  strokeLinecap="square"
                />
                <rect x={s} y={s} width={s} height={s} fill="rgba(255, 90, 38, 0.03)" />
                <path
                  d={forwardCell4}
                  stroke="rgba(255, 90, 38, 0.26)"
                  strokeWidth="1.1"
                  strokeLinecap="square"
                />
              </>
            )}

            {/* 7. HYBRID-CASCADE VARIANT */}
            {variant === "hybrid-cascade" && (
              <>
                <rect x="0" y="0" width={s} height={s} fill="rgba(18, 18, 18, 0.22)" />
                <path
                  d={forwardCell1}
                  stroke="rgba(255, 90, 38, 0.40)"
                  strokeWidth="1.2"
                  strokeLinecap="square"
                />
                <rect x={s} y={s} width={s} height={s} fill="rgba(255, 90, 38, 0.18)" />
                <path
                  d={reverseCell4}
                  stroke="rgba(18, 18, 18, 0.25)"
                  strokeWidth="1.2"
                  strokeLinecap="square"
                />
              </>
            )}

            {/* Delicate hairline borders */}
            <line x1="0" y1={s} x2={pSize} y2={s} stroke="rgba(18, 18, 18, 0.10)" strokeWidth="0.8" />
            <line x1={s} y1="0" x2={s} y2={pSize} stroke="rgba(18, 18, 18, 0.10)" strokeWidth="0.8" />
            <rect
              x="0"
              y="0"
              width={pSize}
              height={pSize}
              fill="none"
              stroke="rgba(18, 18, 18, 0.10)"
              strokeWidth="0.8"
            />

            {/* Subtle corner plus (+) crosshairs at all cell corners */}
            <path
              d={crosshairs}
              stroke="rgba(18, 18, 18, 0.32)"
              strokeWidth="1.1"
              strokeLinecap="square"
            />
          </pattern>
        </defs>

        <rect width="100%" height="100%" fill={`url(#${patternId})`} />
      </svg>
    </div>
  );
}
