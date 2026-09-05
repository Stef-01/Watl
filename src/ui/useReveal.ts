/**
 * Rows and titles rise into place as their section arrives. Heavy things on
 * `EASE.settle` over the title duration; the stagger is the rows token.
 *
 * The tween lives in a GSAP context that reverts on cleanup. A killed `from`
 * tween leaves its start state inline, and the next `from` would read that
 * as its end state — which is exactly what happens under StrictMode's
 * double-run if the context is not reverted.
 */
import { type RefObject } from "react";

import { gsap, ScrollTrigger, useGSAP, ease } from "../motion/gsap";
import { DUR, STAGGER } from "../motion/tokens";
import { useWatl } from "../state/store";

export function useReveal(ref: RefObject<HTMLElement | null>, selector: string) {
  const reduced = useWatl((s) => s.reduced);

  useGSAP(() => {
    const root = ref.current;
    if (!root || reduced) return;
    const items = [...root.querySelectorAll<HTMLElement>(selector)];
    if (items.length === 0) return;
    const tween = gsap.from(items, {
      y: 40,
      opacity: 0,
      duration: DUR.title,
      ease: ease("settle"),
      stagger: STAGGER.rows,
      paused: true,
    });
    ScrollTrigger.create({
      trigger: root,
      start: "top 78%",
      onEnter: () => tween.play(),
      once: true,
    });
  }, { scope: ref, dependencies: [reduced, selector], revertOnUpdate: true });
}
