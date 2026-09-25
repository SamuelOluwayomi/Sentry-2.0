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

export const Warning = createIcon([
  { d: "M12 4 2 20h20L12 4z" },
  { d: "M12 10v5" },
  { type: "circle", attrs: { cx: 12, cy: 18, r: 0.5, fill: "currentColor", stroke: "none" } },
]);

export const ArrowRight = createIcon([{ d: "M5 12h14M13 6l6 6-6 6" }]);

export const Eye = createIcon([
  { d: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" },
  { type: "circle", attrs: { cx: 12, cy: 12, r: 3 } },
]);

export const FlaskConical = createIcon([
  { d: "M9 3h6M9 3v8l-5 9a1 1 0 0 0 .9 1.5h14.2a1 1 0 0 0 .9-1.5L15 11V3" },
  { d: "M9 14h6" },
]);

export const Pulse = createIcon([
  { d: "M2 12h4l2-7 4 14 2-7h4l2 5" },
]);

export const CircleWavyWarning = createIcon([
  { d: "M12 3a9 9 0 1 0 0 18A9 9 0 0 0 12 3z" },
  { d: "M12 8v5" },
  { type: "circle", attrs: { cx: 12, cy: 16, r: 0.5, fill: "currentColor", stroke: "none" } },
]);

export const Power = createIcon([
  { d: "M18.4 5.6a9 9 0 1 1-12.8 0" },
  { d: "M12 2v8" },
]);

export const ArrowClockwise = createIcon([
  { d: "M20 11a8 8 0 1 1-1.7-5" },
  { d: "M20 4v7h-7" },
]);

export const Siren = createIcon([
  { d: "M4 20h16" },
  { d: "M12 2v2" },
  { d: "M4.9 4.9 6.3 6.3" },
  { d: "M2 12h2" },
  { d: "M20 12h2" },
  { d: "M17.7 6.3l1.4-1.4" },
  { d: "M8 20V12a4 4 0 0 1 8 0v8" },
]);

export const TestTube = createIcon([
  { d: "M9 3h6l2 5H7L9 3z" },
  { d: "M7 8v10a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V8" },
  { d: "M9 13h6" },
]);

export const Broadcast = createIcon([
  { d: "M18 9a6 6 0 0 0-12 0" },
  { d: "M21 6a9 9 0 0 0-18 0" },
  { type: "circle", attrs: { cx: 12, cy: 12, r: 2 } },
  { d: "M12 14v6" },
]);

export const CloudSlash = createIcon([
  { d: "M2 2l20 20" },
  { d: "M5.7 5.7A7 7 0 0 0 19 13" },
  { d: "M10.4 3.2A7 7 0 0 1 19 9h1a3 3 0 0 1 2.8 4" },
  { d: "M3 13H2a3 3 0 0 0 2.4 4.8" },
  { d: "M8 20h8" },
]);

export const CaretDown = createIcon([{ d: "m6 9 6 6 6-6" }]);
export const CaretUp = createIcon([{ d: "m18 15-6-6-6 6" }]);
export const CaretLeft = createIcon([{ d: "m15 18-6-6 6-6" }]);
export const CaretRight = createIcon([{ d: "m9 6 6 6-6 6" }]);
export const List = createIcon([{ d: "M4 6h16M4 12h16M4 18h16" }]);
export const Info = createIcon([
  { type: "circle", attrs: { cx: 12, cy: 12, r: 9 } },
  { d: "M12 8h.01M12 12v4" },
]);
