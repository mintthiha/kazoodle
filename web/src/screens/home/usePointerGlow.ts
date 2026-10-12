import { useEffect, useRef } from "react";

// Nudges the hub's background toward the pointer. The hook only writes two
// numbers (--mx / --my, each roughly -0.5..0.5) onto the element; the CSS
// decides how far that actually moves anything.
//
// Deliberately inert on a phone: without a real pointer there is no hover, and
// a touch-dragged background would fight the scroll. Same if the device asks
// for reduced motion — then no listener is attached at all.
export function usePointerGlow<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const hasPointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const wantsStill = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!hasPointer || wantsStill) return;

    // pointermove fires far more often than the screen refreshes, so the
    // handler records the position and lets one animation frame do the write.
    // Without this, a fast mouse queues dozens of style changes per frame.
    let frame = 0;
    let x = 0;
    let y = 0;

    const apply = () => {
      frame = 0;
      el.style.setProperty("--mx", x.toFixed(3));
      el.style.setProperty("--my", y.toFixed(3));
    };

    const onMove = (e: PointerEvent) => {
      x = e.clientX / window.innerWidth - 0.5;
      y = e.clientY / window.innerHeight - 0.5;
      if (frame === 0) frame = window.requestAnimationFrame(apply);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, []);

  return ref;
}
