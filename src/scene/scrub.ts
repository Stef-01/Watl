/**
 * The values the hero scrub tweens. A plain object, mutated by GSAP on the
 * ScrollTrigger scrub and read by `useFrame` — never React state, because it
 * changes every frame while the visitor scrolls.
 */
import { POSES } from "../motion/tokens";

export interface ScrubState {
  /** Branch growth 0 → 1. */
  growth: number;
  /** Position on the bloom wave 0 → 1 (the engine maps it per head). */
  bloom: number;
  /** Camera distance as a multiple of the authored fit distance. */
  distance: number;
  /** Degrees. */
  azimuth: number;
  /** Degrees. */
  elevation: number;
  /** Composition offset as a fraction of projected width. */
  offset: number;
  /** 0 = look at the authored centre, 1 = look at the densest raceme. */
  focus: number;
  /** 0 = target follows the growing tip, 1 = authored centre. */
  tipFollow: number;
  /** Depth of field bokeh scale. */
  bokeh: number;
  /** Bloom effect intensity. */
  bloomIntensity: number;
}

export const scrub: ScrubState = {
  growth: 0,
  bloom: 0,
  distance: POSES.load.distance,
  azimuth: POSES.load.azimuth,
  elevation: POSES.load.elevation,
  offset: POSES.load.offset,
  focus: 0,
  tipFollow: 1,
  bokeh: 0,
  bloomIntensity: POSES.load.bloomIntensity,
};

/** The section pose the camera settles into once the hero pin releases. It
 *  is tweened, not scrubbed, so it also lives outside React. */
export interface PoseState {
  distance: number;
  azimuth: number;
  elevation: number;
  offset: number;
  bloomIntensity: number;
  /** 0 while the hero owns the camera, 1 once a section owns it. */
  weight: number;
  /** Extra azimuth from a hovered practice row. */
  azimuthNudge: number;
}

export const pose: PoseState = {
  distance: POSES.arrival.distance,
  azimuth: POSES.arrival.azimuth,
  elevation: POSES.arrival.elevation,
  offset: POSES.arrival.offset,
  bloomIntensity: POSES.arrival.bloomIntensity,
  weight: 0,
  azimuthNudge: 0,
};
