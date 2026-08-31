import assert from "node:assert/strict";

import {
  BLOOM_BUD_RESIZE_FACTOR,
  BLOOM_BUD_TO_MATURE_SCALE,
  BLOOM_MATURE_RESIZE_FACTOR,
  WATTLE_FLOWER_SCALE,
} from "../flower-scale.js";

import {
  BLOOM_DURATION_MS,
  BLOOM_ENVELOPE,
  BLOOM_MAX_SITE_DELAY,
  BLOOM_STAGE_WINDOWS,
  OUTER_FILAMENT_PETAL_GATE,
  PETAL_FILAMENT_GATE,
  POLLEN_FILAMENT_GATE,
  STRONG_EASE_IN_OUT,
  STRONG_EASE_OUT,
  bloomEnvelopeTarget,
  bloomVisibilityHandoff,
  capsuleVisibility,
  delayedSiteTimeline,
  normalizedBloomTimeline,
  pollenBloomProgress,
  siteBloomProgress,
  siteBloomProgressAtTime,
  strongEaseInOut,
  strongEaseOut,
} from "../bloom-motion.js";

const STAGE_NAMES = [
  "wake",
  "ripen",
  "loosen",
  "petal",
  "innerFilament",
  "outerFilament",
  "pollen",
  "settle",
];
const DELAYS = [0, 0.01, 0.17, 0.5, 0.83, 1];
const SAMPLE_COUNT = 10_000;
const EPSILON = 1e-12;
let testCount = 0;

function test(name, callback) {
  callback();
  testCount += 1;
  console.log(`ok ${testCount} - ${name}`);
}

function assertUnit(value, label) {
  assert(Number.isFinite(value), `${label} must be finite, received ${value}`);
  assert(value >= -EPSILON, `${label} fell below zero: ${value}`);
  assert(value <= 1 + EPSILON, `${label} exceeded one: ${value}`);
}

function assertNear(actual, expected, tolerance = 1e-9, label = "value") {
  assert(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected}, received ${actual}`,
  );
}

test("the approved 2.7 second choreography and exact curves stay fixed", () => {
  assert.equal(BLOOM_DURATION_MS, 2700);
  assert.equal(BLOOM_MAX_SITE_DELAY, 0.22);
  assert.deepEqual(STRONG_EASE_IN_OUT, [0.77, 0, 0.175, 1]);
  assert.deepEqual(STRONG_EASE_OUT, [0.23, 1, 0.32, 1]);
  assert.deepEqual(BLOOM_STAGE_WINDOWS, {
    wake: [0, 0.08],
    ripen: [0.05, 0.22],
    loosen: [0.16, 0.48],
    petal: [0.34, 0.62],
    innerFilament: [0.47, 0.74],
    outerFilament: [0.58, 0.94],
    pollen: [0.68, 0.97],
    settle: [0.9, 1],
  });
  assert.equal(PETAL_FILAMENT_GATE, 0.35);
  assert.equal(OUTER_FILAMENT_PETAL_GATE, 0.6);
  assert.equal(POLLEN_FILAMENT_GATE, 0.65);
});

test("strong easing helpers are bounded, monotonic, and exact at endpoints", () => {
  for (const [name, easing] of [
    ["strongEaseInOut", strongEaseInOut],
    ["strongEaseOut", strongEaseOut],
  ]) {
    assert.equal(easing(-1), 0);
    assert.equal(easing(0), 0);
    assert.equal(easing(1), 1);
    assert.equal(easing(2), 1);
    let previous = 0;
    for (let index = 0; index <= SAMPLE_COUNT; index += 1) {
      const value = easing(index / SAMPLE_COUNT);
      assertUnit(value, `${name}[${index}]`);
      assert(value + EPSILON >= previous, `${name} regressed at ${index}`);
      previous = value;
    }
  }

  assertNear(strongEaseInOut(0.25), 0.0528887014, 1e-8, "in-out quarter");
  assertNear(strongEaseInOut(0.5), 0.5959707025, 1e-8, "in-out midpoint");
  assertNear(strongEaseInOut(0.75), 0.95628193, 1e-8, "in-out three-quarter");
  assertNear(strongEaseOut(0.25), 0.7753816553, 1e-8, "out quarter");
  assertNear(strongEaseOut(0.5), 0.9659825603, 1e-8, "out midpoint");
  assertNear(strongEaseOut(0.75), 0.9973622544, 1e-8, "out three-quarter");
});

test("time conversion and normalized site delay preserve exact endpoints", () => {
  assert.equal(normalizedBloomTimeline(-100), 0);
  assert.equal(normalizedBloomTimeline(0), 0);
  assert.equal(normalizedBloomTimeline(BLOOM_DURATION_MS), 1);
  assert.equal(normalizedBloomTimeline(BLOOM_DURATION_MS * 2), 1);

  for (const delay of DELAYS) {
    assert.equal(delayedSiteTimeline(0, delay), 0);
    assert.equal(delayedSiteTimeline(1, delay), 1);
    assert.deepEqual(
      siteBloomProgressAtTime(0, delay),
      siteBloomProgress(0, delay),
    );
    assert.deepEqual(
      siteBloomProgressAtTime(BLOOM_DURATION_MS, delay),
      siteBloomProgress(1, delay),
    );
  }

  assert.equal(delayedSiteTimeline(BLOOM_MAX_SITE_DELAY, 1), 0);
  assert(delayedSiteTimeline(0.5, 1) < delayedSiteTimeline(0.5, 0));
});

test("all eight stage channels stay bounded and monotonic for every site delay", () => {
  for (const delay of DELAYS) {
    const previous = Object.fromEntries(STAGE_NAMES.map((name) => [name, 0]));
    for (let index = 0; index <= SAMPLE_COUNT; index += 1) {
      const stages = siteBloomProgress(index / SAMPLE_COUNT, delay);
      assertUnit(stages.timeline, `timeline delay=${delay} sample=${index}`);
      for (const name of STAGE_NAMES) {
        const value = stages[name];
        assertUnit(value, `${name} delay=${delay} sample=${index}`);
        assert(
          value + EPSILON >= previous[name],
          `${name} regressed for delay ${delay} at sample ${index}`,
        );
        previous[name] = value;
      }
    }

    const closed = siteBloomProgress(0, delay);
    const open = siteBloomProgress(1, delay);
    for (const name of STAGE_NAMES) {
      assert.equal(closed[name], 0, `${name} must start at zero`);
      assert.equal(open[name], 1, `${name} must finish at one`);
    }
  }
});

test("later sites never overtake earlier sites", () => {
  for (let index = 0; index <= SAMPLE_COUNT; index += 1) {
    const timeline = index / SAMPLE_COUNT;
    let earlier = siteBloomProgress(timeline, 0);
    for (const delay of DELAYS.slice(1)) {
      const later = siteBloomProgress(timeline, delay);
      assert(later.timeline <= earlier.timeline + EPSILON);
      for (const name of STAGE_NAMES) {
        assert(
          later[name] <= earlier[name] + EPSILON,
          `${name} at delay ${delay} overtook previous site at ${timeline}`,
        );
      }
      earlier = later;
    }
  }
});

test("petals gate both filament phases and outer filaments gate pollen", () => {
  for (const delay of DELAYS) {
    for (let index = 0; index <= SAMPLE_COUNT; index += 1) {
      const stages = siteBloomProgress(index / SAMPLE_COUNT, delay);
      if (stages.innerFilament > 0) {
        assert(
          stages.petal > PETAL_FILAMENT_GATE,
          `inner filament escaped petal gate at ${index}/${SAMPLE_COUNT}`,
        );
      }
      if (stages.outerFilament > 0) {
        assert(
          stages.petal > OUTER_FILAMENT_PETAL_GATE,
          `outer filament escaped petal gate at ${index}/${SAMPLE_COUNT}`,
        );
      }
      if (stages.pollen > 0) {
        assert(
          stages.outerFilament > POLLEN_FILAMENT_GATE,
          `pollen escaped filament gate at ${index}/${SAMPLE_COUNT}`,
        );
      }
    }
  }
});

test("the packed fuzz sampler exactly matches full pollen choreography", () => {
  const packed = {};
  for (const delay of DELAYS) {
    for (let index = 0; index <= SAMPLE_COUNT; index += 1) {
      const timeline = index / SAMPLE_COUNT;
      const stages = siteBloomProgress(timeline, delay);
      const visibility = bloomVisibilityHandoff(stages);
      assert.equal(pollenBloomProgress(timeline, delay, packed), packed);
      assertNear(packed.progress, stages.pollen, 1e-12, "packed pollen progress");
      assertNear(packed.visibility, visibility.pollen, 1e-12, "packed pollen visibility");
      assert.equal(packed.visibility, packed.progress);
    }
  }
});

test("visibility ownership has no dormant filament or pollen ghost", () => {
  for (const delay of DELAYS) {
    const closed = siteBloomProgress(0, delay);
    const closedVisibility = bloomVisibilityHandoff(closed);
    assert.deepEqual(closedVisibility, {
      capsule: 1,
      cup: 0,
      petal: 0,
      innerFilament: 0,
      outerFilament: 0,
      anther: 0,
      pollen: 0,
    });

    const openVisibility = bloomVisibilityHandoff(siteBloomProgress(1, delay));
    assert.equal(openVisibility.capsule, 0);
    assert.equal(openVisibility.cup, 0);
    assert.equal(openVisibility.petal, 1);
    assert.equal(openVisibility.innerFilament, 1);
    assert.equal(openVisibility.outerFilament, 1);
    assert.equal(openVisibility.anther, 1);
    assert.equal(openVisibility.pollen, 1);

    for (let index = 0; index <= SAMPLE_COUNT; index += 1) {
      const stages = siteBloomProgress(index / SAMPLE_COUNT, delay);
      const visibility = bloomVisibilityHandoff(stages);
      for (const [name, value] of Object.entries(visibility)) {
        assertUnit(value, `${name} visibility delay=${delay} sample=${index}`);
      }
      assert(
        Math.max(visibility.capsule, visibility.cup, visibility.petal) >= 0.5,
        `surface ownership gap for delay ${delay} at sample ${index}`,
      );
      if (stages.petal >= 0.7) {
        assert.equal(capsuleVisibility(stages), 0);
      }
      if (visibility.innerFilament > 0) {
        assert(stages.petal > PETAL_FILAMENT_GATE);
      }
      if (visibility.outerFilament > 0) {
        assert(stages.petal > OUTER_FILAMENT_PETAL_GATE);
      }
      if (visibility.pollen > 0 || visibility.anther > 0) {
        assert(stages.outerFilament > POLLEN_FILAMENT_GATE);
      }
    }
  }
});

test("the target envelope expands monotonically without the inverted-core dip", () => {
  assert.equal(BLOOM_BUD_RESIZE_FACTOR, 0.5);
  assert.equal(BLOOM_MATURE_RESIZE_FACTOR, 0.8);
  assert.equal(BLOOM_BUD_TO_MATURE_SCALE, 0.625);
  assertNear(WATTLE_FLOWER_SCALE / 1.5, BLOOM_MATURE_RESIZE_FACTOR);
  assertNear(
    WATTLE_FLOWER_SCALE * BLOOM_BUD_TO_MATURE_SCALE / 1.5,
    BLOOM_BUD_RESIZE_FACTOR,
  );
  assert.equal(BLOOM_ENVELOPE.closed, 0.58 * BLOOM_BUD_TO_MATURE_SCALE);
  assert.equal(BLOOM_ENVELOPE.open, 1);

  for (const delay of DELAYS) {
    let previous = BLOOM_ENVELOPE.closed;
    for (let index = 0; index <= SAMPLE_COUNT; index += 1) {
      const stages = siteBloomProgress(index / SAMPLE_COUNT, delay);
      const envelope = bloomEnvelopeTarget(stages);
      assert(
        envelope >= BLOOM_ENVELOPE.closed,
        `envelope fell below the closed bud at ${index}/${SAMPLE_COUNT}`,
      );
      assert(envelope <= BLOOM_ENVELOPE.open + EPSILON);
      assert(
        envelope + EPSILON >= previous,
        `envelope regressed for delay ${delay} at ${index}/${SAMPLE_COUNT}`,
      );
      previous = envelope;
    }

    assert.equal(
      bloomEnvelopeTarget(siteBloomProgress(0, delay)),
      0.58 * BLOOM_BUD_TO_MATURE_SCALE,
    );
    assert.equal(bloomEnvelopeTarget(siteBloomProgress(1, delay)), 1);
  }
});

test("reusable targets avoid allocating during real-time sampling", () => {
  const stages = {};
  const visibility = {};
  assert.equal(siteBloomProgress(0.5, 0.5, stages), stages);
  assert.equal(bloomVisibilityHandoff(stages, visibility), visibility);
  assert.equal(siteBloomProgressAtTime(1350, 0.5, stages), stages);
  assert.equal(bloomVisibilityHandoff(stages, visibility), visibility);
});

console.log(`1..${testCount}`);
