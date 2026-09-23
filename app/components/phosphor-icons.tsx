import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & {
  size?: number;
  weight?: "regular" | "bold" | "fill";
};

type IconPath = {
  d?: string;
  fill?: string;
  points?: string;
  type?: "path" | "circle" | "polyline" | "rect";
  attrs?: Record<string, string | number>;
};

const strokeWidth = (weight?: IconProps["weight"]) =>
  weight === "bold" || weight === "fill" ? 2.6 : 2;

function createIcon(paths: IconPath[]) {
  const Icon = ({ size = 24, weight, className, ...props }: IconProps) => (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth(weight)}
      viewBox="0 0 24 24"
      width={size}
      {...props}
    >
      {paths.map((path, index) => {
        if (path.type === "circle") {
          return <circle key={index} {...path.attrs} />;
        }
        if (path.type === "polyline") {
          return <polyline key={index} points={path.points} {...path.attrs} />;
        }
        if (path.type === "rect") {
          return <rect key={index} {...path.attrs} />;
        }
        return (
          <path
            d={path.d}
            fill={weight === "fill" ? "currentColor" : path.fill || "none"}
            key={index}
            {...path.attrs}
          />
        );
      })}
    </svg>
  );

  return Icon;
}

export const Activity = createIcon([{ d: "M3 12h4l2-7 4 14 2-7h6" }]);

export const ArrowSquareOut = createIcon([
  { type: "rect", attrs: { x: 4, y: 5, width: 15, height: 15, rx: 1 } },
  { d: "M13 4h7v7" },
  { d: "M10 14 20 4" },
]);

export const Brain = createIcon([
  { d: "M9 4a4 4 0 0 0-4 4v1a4 4 0 0 0 0 8v1a3 3 0 0 0 5 2.2" },
  { d: "M15 4a4 4 0 0 1 4 4v1a4 4 0 0 1 0 8v1a3 3 0 0 1-5 2.2" },
  { d: "M9 8h6M8 13h8M12 4v17" },
]);

export const ClockCounterClockwise = createIcon([
  { type: "circle", attrs: { cx: 12, cy: 12, r: 8 } },
  { d: "M12 8v5l3 2" },
  { d: "M4 6v5h5" },
]);

export const Cpu = createIcon([
  { type: "rect", attrs: { x: 7, y: 7, width: 10, height: 10, rx: 1 } },
  { d: "M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" },
]);

export const Gauge = createIcon([
  { d: "M4 15a8 8 0 1 1 16 0" },
  { d: "M12 15l4-5" },
  { d: "M7 19h10" },
]);

export const GitBranch = createIcon([
  { d: "M7 6v7a5 5 0 0 0 5 5h5" },
  { d: "M17 18V8" },
  { type: "circle", attrs: { cx: 7, cy: 5, r: 2 } },
  { type: "circle", attrs: { cx: 17, cy: 6, r: 2 } },
  { type: "circle", attrs: { cx: 17, cy: 18, r: 2 } },
]);

export const Lightning = createIcon([{ d: "M13 2 4 14h7l-1 8 10-13h-7l0-7z" }]);

export const LockKey = createIcon([
  { type: "rect", attrs: { x: 5, y: 10, width: 14, height: 10, rx: 1 } },
  { d: "M8 10V7a4 4 0 0 1 8 0v3" },
  { d: "M12 14v2" },
]);

export const Play = createIcon([{ d: "M8 5v14l11-7z" }]);

export const PlugsConnected = createIcon([
  { d: "M8 8 5 5M16 16l3 3" },
  { d: "M7 13l4 4 6-6-4-4z" },
  { d: "M4 16l4-4M16 4l4 4" },
]);

export const RadioTower = createIcon([
  { d: "M12 11v10" },
  { d: "m8 21 4-10 4 10" },
  { d: "M8 7a5 5 0 0 1 8 0" },
  { d: "M5 4a9 9 0 0 1 14 0" },
]);

export const ShieldCheck = createIcon([
  { d: "M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6z" },
  { d: "m9 12 2 2 4-5" },
]);

export const Wallet = createIcon([
  { type: "rect", attrs: { x: 3, y: 6, width: 18, height: 13, rx: 2 } },
  { d: "M16 12h5v5h-5a2.5 2.5 0 0 1 0-5z" },
  { d: "M6 6V4h12v2" },
]);

export const Copy = createIcon([
  { type: "rect", attrs: { x: 9, y: 9, width: 11, height: 11, rx: 1 } },
  { d: "M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" },
]);

export const X = createIcon([
  { d: "M18 6 6 18M6 6l12 12" },
]);

export const CheckCircle = createIcon([
  { type: "circle", attrs: { cx: 12, cy: 12, r: 9 } },
  { d: "m9 12 2 2 4-4" },
]);
