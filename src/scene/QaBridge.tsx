/**
 * `?qa=1` exposes the engine's deterministic inspection surface on
 * `window.__WATTLE_QA__`, as the original did, plus scroll control for the
 * capture loop.
 */
import { useEffect } from "react";
import { useThree } from "@react-three/fiber";

import { useEngine } from "./engineContext";
import { pose, scrub } from "./scrub";

declare global {
  interface Window {
    __WATTLE_QA__?: unknown;
    __WATTLE_BOOTED__?: boolean;
  }
}

export function QaBridge() {
  const engine = useEngine();
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    window.__WATTLE_BOOTED__ = true;
    window.__WATTLE_QA__ = Object.freeze({
      ...engine.qa,
      scrub,
      pose,
      setGrowth(progress: number) {
        scrub.growth = progress;
        invalidate();
      },
      setBloomWave(progress: number) {
        scrub.bloom = progress;
        invalidate();
      },
      render() {
        invalidate();
      },
    });
    invalidate();
    return () => {
      delete window.__WATTLE_QA__;
    };
  }, [engine, invalidate]);

  return null;
}
