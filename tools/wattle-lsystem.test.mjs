import assert from "node:assert/strict";

import {
  WATTLE_BUD_BIRTH,
  WATTLE_FLOWER_SCALE,
  WATTLE_GOLDEN_ANGLE,
  deriveWattleSentence,
  generateWattleArchitecture,
  interpretWattleSentence,
} from "../wattle-lsystem.js";

const tests = [];
function test(name, run) {
  tests.push({ name, run });
}

test("the wattle grammar uses the golden angle and preserves balanced branches", () => {
  assert.equal(WATTLE_GOLDEN_ANGLE, Math.PI * (3 - Math.sqrt(5)));
  const sentence = deriveWattleSentence(0x57a771e, "low");
  let depth = 0;
  let peak = 0;
  for (const module of sentence) {
    if (module.symbol === "[") depth += 1;
    if (module.symbol === "]") depth -= 1;
    peak = Math.max(peak, depth);
    assert(depth >= 0, "a branch closed before it opened");
  }
  assert.equal(depth, 0);
  assert(peak >= 2, "the grammar should create hierarchical lateral axes");
});

test("parallel derivation is deterministic for a seed and variable across seeds", () => {
  const first = generateWattleArchitecture({ seed: 1234, quality: "low" });
  const repeat = generateWattleArchitecture({ seed: 1234, quality: "low" });
  const different = generateWattleArchitecture({ seed: 4321, quality: "low" });
  assert.deepEqual(first, repeat);
  assert.notDeepEqual(first.segments, different.segments);
});

test("the turtle emits a hierarchical woody frame with finite geometry", () => {
  const sentence = deriveWattleSentence(0x57a771e, "high");
  const tree = interpretWattleSentence(sentence, "high");
  assert(tree.segments.length >= 45);
  assert(tree.leaves.length >= 24);
  assert(tree.buds.length >= 48 && tree.buds.length <= 84);
  assert(tree.segments.some((segment) => segment.order === 0));
  assert(tree.segments.some((segment) => segment.order >= 2));
  for (const segment of tree.segments) {
    assert(segment.end.every(Number.isFinite));
    assert(segment.birth <= segment.mature);
  }
});

test("parent-to-child development completes wood before any bud is born", () => {
  const tree = generateWattleArchitecture({ seed: 0x57a771e, quality: "high" });
  const woodySegments = tree.segments.filter((segment) => !segment.kind?.startsWith("flower-"));
  assert(woodySegments.every((segment) => segment.birth < WATTLE_BUD_BIRTH));
  assert(tree.buds.every((bud) => bud.birth >= WATTLE_BUD_BIRTH));
  const birthsByOrder = new Map();
  for (const segment of tree.segments) {
    const values = birthsByOrder.get(segment.order) ?? [];
    values.push(segment.birth);
    birthsByOrder.set(segment.order, values);
  }
  const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  assert(mean(birthsByOrder.get(0)) < mean(birthsByOrder.get(2)));
});

test("the branch rises from one lower origin with a restrained diagonal lean", () => {
  const branch = generateWattleArchitecture({ seed: 0x57a771e, quality: "high" });
  const points = branch.segments.flatMap((segment) => [segment.start, segment.end]);
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  assert(height / width > 1.35, `expected an upright branch, got ratio ${height / width}`);
  assert(Math.max(...ys) > 4, "the primary axis should rise substantially upward");
  assert(branch.segments[0].direction[1] > 0.95);
  assert(branch.segments[0].direction[0] < -0.1, "the branch should retain a subtle diagonal lean");
  assert.deepEqual(branch.segments[0].start, [0, 0, 0]);
  const primaryDirections = branch.segments
    .filter((segment) => segment.order === 0 && !segment.kind)
    .map((segment) => segment.direction[0]);
  const primaryCurvature = Math.max(...primaryDirections) - Math.min(...primaryDirections);
  assert(primaryCurvature > 0.006, "the primary axis should curve instead of reading ruler-straight");
  assert(primaryCurvature < 0.06, "the primary axis curvature should remain restrained");
});

test("Golden Wattle phyllodes are long, narrow, alternate blades", () => {
  const branch = generateWattleArchitecture({ seed: 0x57a771e, quality: "high" });
  assert(branch.leaves.length >= 40);
  assert(branch.leaves.every((leaf) => leaf.form === "narrow-lanceolate-phyllode"));
  assert(branch.leaves.every((leaf) => leaf.continuousWithStem === false));
  assert(branch.leaves.every((leaf) => leaf.wingSides === 0));
  assert(branch.leaves.every((leaf) => leaf.width >= 0.115 && leaf.width <= 0.18));
  assert(branch.leaves.every((leaf) => leaf.freeTipRatio >= 0.82 && leaf.freeTipRatio <= 0.94));
  assert(branch.leaves.every((leaf) => 1 / leaf.width > 5.5));
});

test("globular heads hang in multi-head axillary racemes", () => {
  const branch = generateWattleArchitecture({ seed: 0x57a771e, quality: "high" });
  const racemes = Map.groupBy(branch.buds, (bud) => bud.racemeId);
  assert.equal(branch.buds.length, 82);
  assert.equal(racemes.size, 21);
  assert([...racemes.values()].every((heads) => heads.length >= 2 && heads.length <= 5));
  assert(branch.buds.every((head) => head.racemeHeadCount >= 2 && head.racemeHeadCount <= 5));
  assert.equal(branch.segments.filter((segment) => segment.kind === "flower-raceme").length, racemes.size);
  assert.equal(
    branch.segments.filter((segment) => segment.kind === "flower-pedicel").length,
    branch.buds.length,
  );
  for (const raceme of branch.segments.filter((segment) => segment.kind === "flower-raceme")) {
    const length = Math.hypot(...raceme.end.map((value, index) => value - raceme.start[index]));
    assert(length >= 0.38 && length <= 0.64);
  }
  for (const pedicel of branch.segments.filter((segment) => segment.kind === "flower-pedicel")) {
    const length = Math.hypot(...pedicel.end.map((value, index) => value - pedicel.start[index]));
    assert(length >= 0.085 && length <= 0.165);
  }
  assert(new Set(branch.buds.map((bud) => bud.order)).size >= 3, "flowers should span several branch orders");
  const headsByOrder = Map.groupBy(branch.buds, (bud) => bud.order);
  assert.equal(headsByOrder.size, 4);
  assert([...headsByOrder.values()].every((heads) => heads.length >= 17));
  assert.equal(WATTLE_FLOWER_SCALE, 1.2);
  assert(branch.buds.every((bud) => bud.radius > 0.21 && bud.radius < 0.279));
});

let failures = 0;
for (let index = 0; index < tests.length; index += 1) {
  const { name, run } = tests[index];
  try {
    await run();
    console.log(`ok ${index + 1} - ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`not ok ${index + 1} - ${name}`);
    console.error(error);
  }
}

console.log(`1..${tests.length}`);
if (failures) process.exitCode = 1;
