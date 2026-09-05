/**
 * Links lean toward the cursor as it passes and spring back when it goes.
 * The pull is capped well below the distance travelled, so a control never
 * leaves the line it belongs to. Fine pointers only; reduced motion, none.
 */
import { useEffect, type RefObject } from "react";

import { createTranslator } from "../motion/spring";
import { MAGNET, SPRING } from "../motion/tokens";
import { useWatl } from "../state/store";

export function useMagnet(scope: RefObject<HTMLElement | null>, selector: string) {
  const finePointer = useWatl((s) => s.finePointer);
  const reduced = useWatl((s) => s.reduced);

  useEffect(() => {
    const root = scope.current;
    if (!root || !finePointer || reduced) return undefined;
    const elements = [...root.querySelectorAll<HTMLElement>(selector)];
    const magnets = elements.map((element) => ({ element, motion: createTranslator(element, SPRING.magnet) }));
    let pointerX = 0;
    let pointerY = 0;
    let hasPointer = false;
    let queued = 0;

    const frame = () => {
      queued = 0;
      if (!hasPointer) return;
      for (const magnet of magnets) {
        const box = magnet.element.getBoundingClientRect();
        const dx = pointerX - (box.left + box.width / 2);
        const dy = pointerY - (box.top + box.height / 2);
        const distance = Math.hypot(dx, dy);
        const reach = MAGNET.reach + Math.max(box.width, box.height) / 2;
        if (distance > reach) {
          magnet.motion.to(0, 0);
          continue;
        }
        const strength = 1 - distance / reach;
        const step = (MAGNET.maxPull * strength) / (distance || 1);
        magnet.motion.to(dx * step, dy * step);
      }
    };
    const onMove = (event: PointerEvent) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
      hasPointer = true;
      if (!queued) queued = requestAnimationFrame(frame);
    };
    const release = () => {
      hasPointer = false;
      magnets.forEach((magnet) => magnet.motion.to(0, 0));
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerleave", release, { passive: true });
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", release);
      window.removeEventListener("blur", release);
      if (queued) cancelAnimationFrame(queued);
      magnets.forEach((magnet) => magnet.motion.destroy());
    };
  }, [scope, selector, finePointer, reduced]);
}
