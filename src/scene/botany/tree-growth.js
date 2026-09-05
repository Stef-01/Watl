export const TREE_GROWTH_DURATION_MS = 8400;
export const TREE_BUD_MATURITY_START = 0.72;

function clamp01(value) {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function bezierCoordinate(t, first, second) {
  const inverse = 1 - t;
  return 3 * inverse * inverse * t * first
    + 3 * inverse * t * t * second
    + t * t * t;
}

function bezierSlope(t, first, second) {
  const inverse = 1 - t;
  return 3 * inverse * inverse * first
    + 6 * inverse * t * (second - first)
    + 3 * t * t * (1 - second);
}

/** Exact strong ease-in-out token used by the rest of the site. */
export function strongEaseInOut(progress) {
  const target = clamp01(progress);
  let parameter = target;
  for (let iteration = 0; iteration < 6; iteration += 1) {
    const error = bezierCoordinate(parameter, 0.77, 0.175) - target;
    const slope = bezierSlope(parameter, 0.77, 0.175);
    if (Math.abs(error) < 0.000001 || Math.abs(slope) < 0.000001) break;
    parameter = clamp01(parameter - error / slope);
  }
  return bezierCoordinate(parameter, 0, 1);
}

function stage(progress, start, end) {
  return strongEaseInOut(clamp01((progress - start) / (end - start)));
}

/**
 * One biological timeline, split into overlapping systems. Branches begin
 * while the trunk is still thickening, leaves arrive only on established
 * wood, and buds are impossible before the explicit maturity threshold.
 */
export function treeGrowthStages(progress, target = {}) {
  const timeline = clamp01(progress);
  target.timeline = timeline;
  target.sapling = stage(timeline, 0, 0.2);
  target.trunk = stage(timeline, 0.03, 0.46);
  target.branches = stage(timeline, 0.18, 0.72);
  target.foliage = stage(timeline, 0.43, 0.84);
  target.buds = stage(timeline, TREE_BUD_MATURITY_START, 1);
  target.mature = timeline >= 1;
  return target;
}

export function treeGrowthProgress(elapsedMs, durationMs = TREE_GROWTH_DURATION_MS) {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return 1;
  return clamp01(elapsedMs / durationMs);
}
