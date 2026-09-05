/**
 * A hairline and a word, bottom right. It appears once the chrome has
 * composed itself and leaves after the first four percent of the hero.
 */
import { useRef } from "react";

import { gsap, useGSAP, ease } from "../motion/gsap";
import { DUR } from "../motion/tokens";
import { useWatl } from "../state/store";

export function ScrollCue() {
  const ref = useRef<HTMLDivElement>(null);
  const heroProgress = useWatl((s) => s.heroProgress);
  const reduced = useWatl((s) => s.reduced);
  const gone = heroProgress > 0.04;

  useGSAP(() => {
    if (!ref.current || reduced) return;
    /* A label is light: it lands with the small overshoot of the lift curve. */
    gsap.from(ref.current, { opacity: 0, y: 8, duration: DUR.reveal, ease: ease("lift"), delay: 1.6 });
  }, { scope: ref, dependencies: [reduced], revertOnUpdate: true });

  /* With reduced motion the branch is already mature; there is nothing to
     grow by scrolling, so the cue would be a lie. */
  if (reduced) return null;

  return (
    <div ref={ref} className="scroll-cue interface-layer" aria-hidden="true" data-gone={gone ? "true" : "false"}>
      <div className="scroll-cue__inner">
        <span className="scroll-cue__label">Scroll to grow</span>
        <span className="scroll-cue__line"><span /></span>
      </div>
    </div>
  );
}
