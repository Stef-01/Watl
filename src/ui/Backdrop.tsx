import { useEffect, useRef } from "react";

import { createTranslator } from "../motion/spring";
import { PARALLAX, SPRING } from "../motion/tokens";
import { useWatl } from "../state/store";

/**
 * The CSS ground behind the transparent canvas, plus the light the branch
 * stands in. On a fine pointer the light and the atmosphere layers separate
 * under the cursor on one soft spring — slow parallax reads as depth. Springs
 * write `translate`, never `transform`, because the CSS owns `transform` on
 * these layers for their ambient drift.
 */
export function Backdrop() {
  const lightRef = useRef<HTMLDivElement>(null);
  const weatherRef = useRef<HTMLSpanElement>(null);
  const horizonRef = useRef<HTMLSpanElement>(null);
  const finePointer = useWatl((s) => s.finePointer);
  const reduced = useWatl((s) => s.reduced);

  useEffect(() => {
    if (!finePointer || reduced) return undefined;
    const candidates: Array<{ element: HTMLElement | null; range: number }> = [
      { element: lightRef.current, range: PARALLAX.light },
      { element: weatherRef.current, range: PARALLAX.weather },
      { element: horizonRef.current, range: PARALLAX.horizon },
    ];
    const fields: Array<{ motion: ReturnType<typeof createTranslator>; range: number }> = [];
    for (const candidate of candidates) {
      if (candidate.element) {
        fields.push({ motion: createTranslator(candidate.element, SPRING.drift), range: candidate.range });
      }
    }
    let pointerX = 0;
    let pointerY = 0;
    let queued = 0;

    const frame = () => {
      queued = 0;
      const x = (pointerX / window.innerWidth - 0.5) * -2;
      const y = (pointerY / window.innerHeight - 0.5) * -2;
      for (const field of fields) {
        field.motion.to(x * window.innerWidth * field.range, y * window.innerHeight * field.range);
      }
    };
    const onMove = (event: PointerEvent) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
      if (!queued) queued = requestAnimationFrame(frame);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (queued) cancelAnimationFrame(queued);
      fields.forEach((field) => field.motion.destroy());
    };
  }, [finePointer, reduced]);

  return (
    <>
      <div className="backdrop" aria-hidden="true">
        <span ref={weatherRef} className="backdrop__atmosphere backdrop__atmosphere--weather" />
        <span ref={horizonRef} className="backdrop__atmosphere backdrop__atmosphere--horizon" />
      </div>
      <div ref={lightRef} className="stage__light" aria-hidden="true" />
    </>
  );
}
