/**
 * Deterministic, renderer-agnostic choreography for one wattle floret site.
 *
 * The browser renderer and Node regression tests share this module so the
 * botanical ordering cannot drift away from the values that were approved.
 * Inputs and outputs are normalized to [0, 1]; only the convenience time
 * helper deals in milliseconds.
 */

export const BLOOM_DURATION_MS = 2700;
export const BLOOM_MAX_SITE_DELAY = 0.22;

export const STRONG_EASE_IN_OUT = Object.freeze([0.77, 0, 0.175, 1]);
export const STRONG_EASE_OUT = Object.freeze([0.23, 1, 0.32, 1]);

export const PETAL_FILAMENT_GATE = 0.35;
export const OUTER_FILAMENT_PETAL_GATE = 0.6;
export const POLLEN_FILAMENT_GATE = 0.65;

export const BLOOM_STAGE_WINDOWS = Object.freeze({
  wake: Object.freeze([0, 0.08]),
  ripen: Object.freeze([0.05, 0.22]),
  loosen: Object.freeze([0.16, 0.48]),
  petal: Object.freeze([0.34, 0.62]),
  innerFilament: Object.freeze([0.47, 0.74]),
  outerFilament: Object.freeze([0.58, 0.94]),
  pollen: Object.freeze([0.68, 0.97]),
  settle: Object.freeze([0.9, 1]),
});

export const BLOOM_ENVELOPE = Object.freeze({
  closed: 0.58,
  wake: 0.6,
  ripen: 0.64,
  loosen: 0.74,
  petal: 0.86,
  innerFilament: 0.92,
  outerFilament: 0.985,
  pollen: 0.995,
  open: 1,
});

export function clamp01(value) {
  if (!Number.isFinite(value)) return value === Infinity ? 1 : 0;
  return Math.min(1, Math.max(0, value));
}

function cubicCoordinate(t, firstControl, secondControl) {
  const inverse = 1 - t;
  return 3 * inverse * inverse * t * firstControl
    + 3 * inverse * t * t * secondControl
    + t * t * t;
}

function cubicDerivative(t, firstControl, secondControl) {
  const inverse = 1 - t;
  return 3 * inverse * inverse * firstControl
    + 6 * inverse * t * (secondControl - firstControl)
    + 3 * t * t * (1 - secondControl);
}

/**
 * Match CSS cubic-bezier semantics: the input is x, so solve x(t) before
 * evaluating y(t). Newton iteration is followed by bisection for the flat
 * portions of a valid CSS timing curve.
 */
export function cubicBezierAt(progress, x1, y1, x2, y2) {
  const x = clamp01(progress);
  if (x === 0 || x === 1) return x;

  let parameter = x;
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const error = cubicCoordinate(parameter, x1, x2) - x;
    if (Math.abs(error) <= 1e-8) break;
    const slope = cubicDerivative(parameter, x1, x2);
    if (Math.abs(slope) < 1e-7) break;
    parameter -= error / slope;
    if (parameter <= 0 || parameter >= 1) {
      parameter = clamp01(parameter);
      break;
    }
  }

  let low = 0;
  let high = 1;
  for (let iteration = 0; iteration < 20; iteration += 1) {
    const currentX = cubicCoordinate(parameter, x1, x2);
    if (Math.abs(currentX - x) <= 1e-8) break;
    if (currentX < x) low = parameter;
    else high = parameter;
    parameter = (low + high) * 0.5;
  }

  return clamp01(cubicCoordinate(parameter, y1, y2));
}

/** cubic-bezier(0.77, 0, 0.175, 1) */
export function strongEaseInOut(progress) {
  return cubicBezierAt(progress, ...STRONG_EASE_IN_OUT);
}

/** cubic-bezier(0.23, 1, 0.32, 1) */
export function strongEaseOut(progress) {
  return cubicBezierAt(progress, ...STRONG_EASE_OUT);
}

export function normalizedBloomTimeline(elapsedMs) {
  return clamp01(elapsedMs / BLOOM_DURATION_MS);
}

/**
 * Shift a site by as much as 22% of the master timeline, then normalize the
 * remaining interval. This keeps every site delayed at the beginning while
 * guaranteeing an exact mature endpoint at global progress 1.
 */
export function delayedSiteTimeline(timeline, normalizedDelay = 0) {
  const globalProgress = clamp01(timeline);
  const delay = clamp01(normalizedDelay) * BLOOM_MAX_SITE_DELAY;
  if (globalProgress <= delay) return 0;
  return clamp01((globalProgress - delay) / (1 - delay));
}

function windowProgress(timeline, [start, end], easing = strongEaseInOut) {
  if (timeline <= start) return 0;
  if (timeline >= end) return 1;
  return easing((timeline - start) / (end - start));
}

function prerequisiteGate(prerequisite, threshold) {
  if (prerequisite <= threshold) return 0;
  return strongEaseOut((prerequisite - threshold) / (1 - threshold));
}

function gatedProgress(rawProgress, prerequisite, threshold) {
  return Math.min(rawProgress, prerequisiteGate(prerequisite, threshold));
}

/**
 * Return the eight independently useful morphological stage values.
 * `target` can be reused by a real-time renderer to avoid frame allocations.
 */
export function siteBloomProgress(timeline, normalizedDelay = 0, target = {}) {
  const siteTimeline = delayedSiteTimeline(timeline, normalizedDelay);
  const wake = windowProgress(siteTimeline, BLOOM_STAGE_WINDOWS.wake);
  const ripen = windowProgress(siteTimeline, BLOOM_STAGE_WINDOWS.ripen);
  const loosen = windowProgress(siteTimeline, BLOOM_STAGE_WINDOWS.loosen);
  const petal = windowProgress(siteTimeline, BLOOM_STAGE_WINDOWS.petal);

  const innerFilamentRaw = windowProgress(
    siteTimeline,
    BLOOM_STAGE_WINDOWS.innerFilament,
  );
  const outerFilamentRaw = windowProgress(
    siteTimeline,
    BLOOM_STAGE_WINDOWS.outerFilament,
  );
  const innerFilament = gatedProgress(
    innerFilamentRaw,
    petal,
    PETAL_FILAMENT_GATE,
  );
  const outerFilament = gatedProgress(
    outerFilamentRaw,
    petal,
    OUTER_FILAMENT_PETAL_GATE,
  );
  const pollenRaw = windowProgress(siteTimeline, BLOOM_STAGE_WINDOWS.pollen);
  const pollen = gatedProgress(
    pollenRaw,
    outerFilament,
    POLLEN_FILAMENT_GATE,
  );
  const settle = windowProgress(
    siteTimeline,
    BLOOM_STAGE_WINDOWS.settle,
    strongEaseOut,
  );

  target.timeline = siteTimeline;
  target.wake = wake;
  target.ripen = ripen;
  target.loosen = loosen;
  target.petal = petal;
  target.innerFilament = innerFilament;
  target.outerFilament = outerFilament;
  target.pollen = pollen;
  target.settle = settle;
  return target;
}

/**
 * Compute only the late-stage channel needed by the dense pom-pom fuzz.
 * The full stage sampler remains the source of truth for petals and filaments;
 * this narrower path avoids solving six unrelated easing curves for every
 * one of the tens of thousands of peripheral pollen sprites each frame.
 */
export function pollenBloomProgress(timeline, normalizedDelay = 0, target = {}) {
  const siteTimeline = delayedSiteTimeline(timeline, normalizedDelay);
  /* Pollen begins at 0.68, after the petal window completes at 0.62.
     The petal prerequisite is therefore exactly one anywhere pollen can be
     non-zero, making the extra petal curve and gate mathematically redundant. */
  const outerFilament = windowProgress(
    siteTimeline,
    BLOOM_STAGE_WINDOWS.outerFilament,
  );
  const pollenRaw = windowProgress(siteTimeline, BLOOM_STAGE_WINDOWS.pollen);
  const pollen = gatedProgress(
    pollenRaw,
    outerFilament,
    POLLEN_FILAMENT_GATE,
  );

  target.progress = pollen;
  /* siteBloomProgress has already applied this same outer-filament gate.
     Applying pollenVisibility again cannot lower the value, so visibility is
     exactly equal to progress for this peripheral layer. */
  target.visibility = pollen;
  return target;
}

export function siteBloomProgressAtTime(
  elapsedMs,
  normalizedDelay = 0,
  target = {},
) {
  return siteBloomProgress(
    normalizedBloomTimeline(elapsedMs),
    normalizedDelay,
    target,
  );
}

/**
 * The olive capsule relinquishes each surface site as its yellow cup and
 * petals take ownership. Dormant filaments, anthers, and pollen stay fully
 * hidden instead of lingering as a compressed green ghost.
 */
export function capsuleVisibility(stages) {
  const seamRelease = strongEaseInOut(stages.loosen) * 0.35;
  const petalHandoff = strongEaseInOut(clamp01(stages.petal / 0.58));
  return clamp01(1 - Math.max(seamRelease, petalHandoff));
}

export function cupVisibility(stages) {
  const entrance = strongEaseOut(stages.loosen);
  const retirement = strongEaseInOut(clamp01((stages.petal - 0.32) / 0.5));
  return clamp01(entrance * (1 - retirement));
}

export function filamentVisibility(
  filamentProgress,
  petalProgress,
  petalThreshold = PETAL_FILAMENT_GATE,
) {
  return gatedProgress(
    clamp01(filamentProgress),
    clamp01(petalProgress),
    clamp01(petalThreshold),
  );
}

export function pollenVisibility(pollenProgress, outerFilamentProgress) {
  return gatedProgress(
    clamp01(pollenProgress),
    clamp01(outerFilamentProgress),
    POLLEN_FILAMENT_GATE,
  );
}

export function bloomVisibilityHandoff(stages, target = {}) {
  target.capsule = capsuleVisibility(stages);
  target.cup = cupVisibility(stages);
  target.petal = clamp01(stages.petal);
  target.innerFilament = filamentVisibility(
    stages.innerFilament,
    stages.petal,
    PETAL_FILAMENT_GATE,
  );
  target.outerFilament = filamentVisibility(
    stages.outerFilament,
    stages.petal,
    OUTER_FILAMENT_PETAL_GATE,
  );
  target.anther = target.outerFilament > POLLEN_FILAMENT_GATE
    ? prerequisiteGate(target.outerFilament, POLLEN_FILAMENT_GATE)
    : 0;
  target.pollen = pollenVisibility(stages.pollen, stages.outerFilament);
  return target;
}

function envelopeCandidate(start, end, progress) {
  return start + (end - start) * clamp01(progress);
}

/**
 * Target radius relative to the mature flower. Every contribution is
 * monotonic and the maximum is taken, so the visible contour can never
 * collapse while ownership passes from capsule to petals and stamens.
 */
export function bloomEnvelopeTarget(stages) {
  return Math.max(
    BLOOM_ENVELOPE.closed,
    envelopeCandidate(BLOOM_ENVELOPE.closed, BLOOM_ENVELOPE.wake, stages.wake),
    envelopeCandidate(BLOOM_ENVELOPE.closed, BLOOM_ENVELOPE.ripen, stages.ripen),
    envelopeCandidate(BLOOM_ENVELOPE.closed, BLOOM_ENVELOPE.loosen, stages.loosen),
    envelopeCandidate(BLOOM_ENVELOPE.closed, BLOOM_ENVELOPE.petal, stages.petal),
    envelopeCandidate(
      BLOOM_ENVELOPE.closed,
      BLOOM_ENVELOPE.innerFilament,
      stages.innerFilament,
    ),
    envelopeCandidate(
      BLOOM_ENVELOPE.closed,
      BLOOM_ENVELOPE.outerFilament,
      stages.outerFilament,
    ),
    envelopeCandidate(BLOOM_ENVELOPE.closed, BLOOM_ENVELOPE.pollen, stages.pollen),
    envelopeCandidate(BLOOM_ENVELOPE.closed, BLOOM_ENVELOPE.open, stages.settle),
  );
}
