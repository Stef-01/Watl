/**
 * Motion tokens.
 *
 * Every GSAP tween, every spring, every CSS transition and every scroll pose
 * on the site reads from this file. Nothing else may carry a literal easing
 * curve; `tools/motion-tokens.test.mjs` greps for it. Consistency is what
 * reads as intention — the same four curves, applied by mass, everywhere.
 *
 * Mass rule: anything heavier than a label (camera, section titles, the
 * branch itself) moves on `EASE.settle` or a spring with mass ≥ 1.4 over at
 * least 1.1 s. Anything lighter (labels, arrows, meters) moves on `EASE.lift`
 * or `EASE.out` in 0.68 s or less.
 */

export const EASE = {
  /** The site's strong ease-out. Kept from the original. */
  out: {
    id: "watl-out",
    path: "M0,0 C0.23,1 0.32,1 1,1",
    css: "cubic-bezier(0.23, 1, 0.32, 1)",
  },
  /** The site's strong ease-in-out. Kept from the original. */
  inOut: {
    id: "watl-in-out",
    path: "M0,0 C0.77,0 0.175,1 1,1",
    css: "cubic-bezier(0.77, 0, 0.175, 1)",
  },
  /** Heavy things: the camera, section titles, the ground dissolve. */
  settle: {
    id: "watl-settle",
    path: "M0,0 C0.16,1 0.3,1 1,1",
    css: "cubic-bezier(0.16, 1, 0.3, 1)",
  },
  /** Light things: labels, arrows, indices. A little overshoot. */
  lift: {
    id: "watl-lift",
    path: "M0,0 C0.34,1.42 0.64,1 1,1",
    css: "cubic-bezier(0.34, 1.42, 0.64, 1)",
  },
  /** Reveals that should feel instant, then land. GSAP built-in. */
  expo: {
    id: "expo.out",
    path: "",
    css: "cubic-bezier(0.16, 1, 0.3, 1)",
  },
} as const;

export type EaseKey = keyof typeof EASE;

/** Seconds. */
export const DUR = {
  press: 0.12,
  fast: 0.16,
  ui: 0.22,
  reveal: 0.68,
  title: 1.1,
  camera: 1.6,
  bloom: 2.7,
  dissolve: 0.5,
  canvasIn: 0.9,
  preGrow: 1.4,
} as const;

export const SCRUB = {
  hero: 0.9,
  section: 0.6,
} as const;

export const STAGGER = {
  letters: 0.056,
  lines: 0.08,
  rows: 0.08,
  heads: 0.135,
} as const;

export interface SpringConfig {
  stiffness: number;
  damping: number;
  mass: number;
}

export const SPRING = {
  magnet: { stiffness: 260, damping: 24, mass: 0.9 },
  drift: { stiffness: 42, damping: 22, mass: 1.4 },
  orbit: { stiffness: 38, damping: 14, mass: 1.6 },
} as const satisfies Record<string, SpringConfig>;

/** Pointer magnetism: reach in px and the furthest a control leans. */
export const MAGNET = { reach: 130, maxPull: 18 } as const;

/** Pointer parallax ranges as a fraction of the viewport. */
export const PARALLAX = {
  light: 0.032,
  weather: 0.012,
  horizon: -0.007,
} as const;

/** Lenis. */
export const LENIS = {
  lerp: 0.085,
  wheelMultiplier: 1,
  touchMultiplier: 1.35,
} as const;

/**
 * The hero pin. `t` is pin progress 0 → 1; every band below is in `t`.
 * 0.52 + 0.20 + 0.18 = 0.90 is where the last head finishes and the camera
 * settles, which is why those three numbers are also `WAVE` in the engine.
 */
export const HERO = {
  pinVh: 420,
  pinVhMobile: 340,
  preGrowth: 0.28,
  growthEnd: 0.52,
  headlineExit: [0.16, 0.32],
  practiceLine: [0.34, 0.48],
  closeup: [0.55, 0.9],
  bloomLine: [0.58, 0.72],
  dof: [0.6, 0.8],
  settle: [0.9, 1],
  cueFade: 0.04,
} as const;

/** Camera poses as offsets from the authored portrait. Angles in degrees. */
export interface CameraPose {
  distance: number;
  azimuth: number;
  elevation: number;
  offset: number;
  bloomIntensity: number;
}

export const POSES = {
  load: { distance: 1.34, azimuth: 24, elevation: 4.5, offset: 0.38, bloomIntensity: 0.42 },
  grown: { distance: 1.06, azimuth: 24, elevation: 4.5, offset: 0.38, bloomIntensity: 0.42 },
  closeup: { distance: 0.62, azimuth: 40, elevation: 9, offset: 0.2, bloomIntensity: 0.5 },
  arrival: { distance: 1.06, azimuth: 30, elevation: 4.5, offset: 0.38, bloomIntensity: 0.42 },
  practice: { distance: 1.1, azimuth: 24, elevation: 4.5, offset: 0.42, bloomIntensity: 0.42 },
  clients: { distance: 0.92, azimuth: 46, elevation: 8, offset: 0.44, bloomIntensity: 0.46 },
  contact: { distance: 1.25, azimuth: 18, elevation: 2, offset: 0.3, bloomIntensity: 0.62 },
} as const satisfies Record<string, CameraPose>;

export type PoseKey = keyof typeof POSES;

/** Practice rows nudge the azimuth on hover. Degrees. */
export const PRACTICE_AZIMUTHS = [24, 38, 52] as const;
export const PRACTICE_HOVER_DURATION = 1.2;

/** Portrait viewports centre the branch and put the text on a scrim. */
export const PORTRAIT_OFFSET = 0.08;

/** Post-processing. Tuned by eye through `?tune=1`. */
export const FX = {
  bloom: {
    threshold: 1.0,
    smoothing: 0.12,
    intensity: 0.42,
    radius: 0.62,
    levels: 6,
  },
  chromatic: {
    x: 0.0008,
    y: 0.0011,
    modulationOffset: 0.4,
  },
  dof: {
    focalLength: 0.02,
    bokehMax: 2.2,
  },
  vignette: {
    offset: 0.28,
    darkness: 0.5,
  },
  /** How far the flower layers exceed 1.0 so only they cross the threshold. */
  emissiveGain: 1.32,
} as const;

/** The procedural environment (src/scene/Lighting.tsx). Intensities are
 *  light-former emissive strengths; `environment` scales the whole map. */
export const LIGHT_RIG = {
  environment: 0.85,
  key: 2.2,
  rim: 1.6,
  bounce: 0.6,
  sky: 0.5,
} as const;

/** Selection light on a hovered client row. */
export const SELECTION_LIGHT = { intensity: 0.18, duration: 0.4 } as const;

export const DPR = {
  high: [1, 1.4],
  low: [1, 1.12],
} as const;

export const LOW_PROFILE_FPS = 30;
