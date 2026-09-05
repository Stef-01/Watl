/**
 * Development only: put the motion runtime and the store on `window` so the
 * capture and diagnostic scripts can read scroll positions, trigger bounds
 * and page state from outside.
 */
import { gsap, ScrollTrigger } from "../motion/gsap";
import { pose, scrub } from "../scene/scrub";
import { engineHandle } from "../scene/engineContext";
import { useWatl } from "../state/store";

declare global {
  interface Window {
    __WATL_DEBUG__?: unknown;
  }
}

export function exposeDebug() {
  window.__WATL_DEBUG__ = {
    gsap,
    ScrollTrigger,
    scrub,
    pose,
    store: useWatl,
    get engine() {
      return engineHandle.current;
    },
  };
}
