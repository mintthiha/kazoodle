import type { CSSProperties } from "react";

// The hub's one piece of illustration: three dots packed together, three dots
// spread apart, joined by a dotted link. It is the whole product thesis in
// 44 pixels of height — same games whether you're on one couch or three
// continents.
//
// It also answers a hover: point at it and the far dots slide in to join the
// group. Each dot sits in its own <g> so the two motions can coexist — the
// group carries the hover slide, the circle inside carries the idle float.
//
// Decorative, hence aria-hidden: the tagline next to it says the same thing in
// words, and a screen reader does not need it twice.

interface Dot {
  x: number;
  y: number;
  /** How far this dot drifts while idle, in SVG units. */
  float: [number, number];
  /** Where it slides to when the mark is hovered. Only the far dots move. */
  pull?: [number, number];
}

const TOGETHER: Dot[] = [
  { x: 14, y: 22, float: [0, -1.4] },
  { x: 27, y: 22, float: [0.8, 1.2] },
  { x: 40, y: 22, float: [-0.6, -1] },
];

const APART: Dot[] = [
  { x: 74, y: 10, float: [1.4, -1.8], pull: [-18, 12] },
  { x: 100, y: 24, float: [-1.2, 1.6], pull: [-31, -2] },
  { x: 120, y: 9, float: [1, 1.8], pull: [-38, 13] },
];

export function GroupMark() {
  return (
    <svg className="group-mark" viewBox="0 0 128 44" aria-hidden="true" focusable="false">
      <line className="group-link" x1="48" y1="22" x2="66" y2="22" />
      {[...TOGETHER, ...APART].map((dot, i) => (
        <g
          key={`${dot.x}-${dot.y}`}
          className={dot.pull ? "group-wrap group-wrap-apart" : "group-wrap"}
          style={pullVars(dot)}
        >
          <circle
            className={dot.pull ? "group-dot group-dot-apart" : "group-dot"}
            style={dotVars(dot, i)}
            cx={dot.x}
            cy={dot.y}
            r={5.5}
          />
        </g>
      ))}
    </svg>
  );
}

function pullVars(dot: Dot): CSSProperties | undefined {
  if (!dot.pull) return undefined;
  return { "--hx": `${dot.pull[0]}px`, "--hy": `${dot.pull[1]}px` } as CSSProperties;
}

// Entrance delay, idle drift distance and drift duration, all per dot — data
// about this dot, not styles worth a class each.
function dotVars(dot: Dot, i: number): CSSProperties {
  return {
    "--fx": `${dot.float[0]}px`,
    "--fy": `${dot.float[1]}px`,
    "--pop-delay": `${160 + i * 70}ms`,
    "--float-delay": `${700 + i * 180}ms`,
    "--float-time": `${4.4 + i * 0.5}s`,
  } as CSSProperties;
}
