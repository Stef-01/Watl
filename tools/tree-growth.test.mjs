import assert from "node:assert/strict";
import {
  TREE_BUD_MATURITY_START,
  TREE_GROWTH_DURATION_MS,
  strongEaseInOut,
  treeGrowthProgress,
  treeGrowthStages,
} from "../src/scene/botany/tree-growth.js";

let count = 0;
function test(name, callback) {
  callback();
  count += 1;
  console.log(`ok ${count} - ${name}`);
}

test("the authored growth lasts 8.4 seconds and buds wait for 72% maturity", () => {
  assert.equal(TREE_GROWTH_DURATION_MS, 8400);
  assert.equal(TREE_BUD_MATURITY_START, 0.72);
});

test("the strong easing token is exact, bounded, and monotonic", () => {
  let previous = -Infinity;
  for (let index = 0; index <= 10_000; index += 1) {
    const value = strongEaseInOut(index / 10_000);
    assert(value >= 0 && value <= 1);
    assert(value >= previous);
    previous = value;
  }
  assert.equal(strongEaseInOut(0), 0);
  assert.equal(strongEaseInOut(1), 1);
});

test("tree systems progress monotonically and finish exactly", () => {
  const channels = ["sapling", "trunk", "branches", "foliage", "buds"];
  const previous = Object.fromEntries(channels.map((channel) => [channel, 0]));
  for (let index = 0; index <= 10_000; index += 1) {
    const stages = treeGrowthStages(index / 10_000);
    for (const channel of channels) {
      assert(stages[channel] >= previous[channel]);
      assert(stages[channel] >= 0 && stages[channel] <= 1);
      previous[channel] = stages[channel];
    }
  }
  const finished = treeGrowthStages(1);
  assert(channels.every((channel) => finished[channel] === 1));
  assert.equal(finished.mature, true);
});

test("no bud exists before maturity while the woody frame is established", () => {
  const before = treeGrowthStages(TREE_BUD_MATURITY_START - 0.0001);
  const at = treeGrowthStages(TREE_BUD_MATURITY_START);
  assert.equal(before.buds, 0);
  assert.equal(at.buds, 0);
  assert(at.branches > 0.99);
  assert(at.foliage > 0);
});

test("elapsed time conversion clamps both ends", () => {
  assert.equal(treeGrowthProgress(-100), 0);
  assert.equal(treeGrowthProgress(4200), 0.5);
  assert.equal(treeGrowthProgress(8400), 1);
  assert.equal(treeGrowthProgress(20_000), 1);
});

console.log(`1..${count}`);
