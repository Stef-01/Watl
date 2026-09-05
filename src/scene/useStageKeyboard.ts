/**
 * Keyboard operation of the stage. Arrows orbit, plus and minus zoom, Enter
 * or Space finishes growth and then opens every remaining bud, Home restores
 * the authored view. The visitor's orbit is the same spring the pointer
 * drives, so the two never fight.
 */
import { useEffect, type RefObject } from "react";
import { MathUtils } from "three";

import { orbit } from "./CameraRig";
import { engineHandle } from "./engineContext";
import { scrub } from "./scrub";
import { useWatl } from "../state/store";

const STEP = 0.15;
const ELEVATION_STEP = 0.11;
const ZOOM_FACTOR = 0.82;

export function useStageKeyboard(stageRef: RefObject<HTMLDivElement | null>) {
  const setStatus = useWatl((s) => s.setStatus);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      const engine = engineHandle.current;
      if (!engine) return;
      switch (event.key) {
        case "ArrowLeft":
          orbit.azimuth.set(orbit.azimuth.target - STEP);
          break;
        case "ArrowRight":
          orbit.azimuth.set(orbit.azimuth.target + STEP);
          break;
        case "ArrowUp":
          orbit.elevation.set(MathUtils.clamp(orbit.elevation.target - ELEVATION_STEP, -0.9, 0.9));
          break;
        case "ArrowDown":
          orbit.elevation.set(MathUtils.clamp(orbit.elevation.target + ELEVATION_STEP, -0.9, 0.9));
          break;
        case "+":
        case "=":
          orbit.zoom.set(MathUtils.clamp(orbit.zoom.target * ZOOM_FACTOR, 0.34, 2.45));
          break;
        case "-":
        case "_":
          orbit.zoom.set(MathUtils.clamp(orbit.zoom.target / ZOOM_FACTOR, 0.34, 2.45));
          break;
        case "Enter":
        case " ":
          event.preventDefault();
          if (!engine.growth.complete) {
            scrub.growth = 1;
            engine.completeGrowth(true);
            return;
          }
          engine.openAll(true);
          return;
        case "Home":
        case "0":
          event.preventDefault();
          orbit.release();
          setStatus("View reset.");
          return;
        default:
          return;
      }
      event.preventDefault();
    };

    stage.addEventListener("keydown", onKeyDown);
    return () => stage.removeEventListener("keydown", onKeyDown);
  }, [stageRef, setStatus]);
}
