import { usePointerGlow } from "./usePointerGlow";

// The hub's backdrop: a coloured glow and a faint grid, fixed to the viewport
// so they bleed past the 30rem content column.
//
// These are real elements rather than pseudo-elements because three different
// things move them — the pointer, a slow idle drift, and a tile being hovered
// — and a single element can only run one transform at a time. The wrapper
// takes the pointer, the glow inside it takes the drift.
export function HomeBackground() {
  const ref = usePointerGlow<HTMLDivElement>();

  return (
    <div className="home-bg" aria-hidden="true" ref={ref}>
      <div className="home-bg-glow" />
      <div className="home-bg-grid" />
    </div>
  );
}
