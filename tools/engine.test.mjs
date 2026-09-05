/**
 * Headless engine regression. Builds the branch without a renderer, walks the
 * growth and the scroll wave, opens a head interactively, and checks that the
 * two channels compose the way the page relies on.
 */
import assert from "node:assert/strict";

globalThis.window = globalThis.window ?? {
  setTimeout: globalThis.setTimeout.bind(globalThis),
  clearTimeout: globalThis.clearTimeout.bind(globalThis),
};

const { createWattleEngine, HIGH_PROFILE, LOW_PROFILE, WAVE } = await import(
  "../src/scene/engine/wattle-engine.js"
);

let checks = 0;
function check(name, fn) {
  fn();
  checks += 1;
  console.log(`ok ${checks} - ${name}`);
}

const events = { cultivation: [], status: [], stage: {}, finale: 0 };
const engine = createWattleEngine(
  { profile: HIGH_PROFILE, qa: false, reduced: false, finePointer: true, initialGrowth: 0 },
  {
    cultivation: (c) => events.cultivation.push(c),
    status: (s) => events.status.push(s),
    stageData: (key, value) => { events.stage[key] = value; },
    finale: () => { events.finale += 1; },
    invalidate: () => {},
  },
);

check("the engine builds a branch with heads, leaves and a star field", () => {
  assert.ok(engine.headCount >= 60, `expected ≥ 60 heads, got ${engine.headCount}`);
  assert.ok(engine.data.all.leaves.length > 40);
  assert.ok(engine.universe.userData.starCount > 400);
  assert.ok(engine.scene.children.includes(engine.bouquet));
});

check("growth is reversible and reports its stage", () => {
  engine.setGrowth(0.3);
  assert.equal(events.stage.treeStage, "branching");
  assert.equal(engine.growth.complete, false);
  engine.setGrowth(0.8);
  assert.equal(events.stage.treeStage, "budding");
  engine.setGrowth(1);
  assert.equal(engine.growth.complete, true);
  assert.equal(events.stage.treeMature, "true");
  engine.setGrowth(0.5);
  assert.equal(engine.growth.complete, false);
  engine.setGrowth(1);
});

check("the scroll wave opens heads bottom-up and is reversible", () => {
  const now = 1000;
  engine.setScrollBloom(0);
  engine.update(now, 0.016);
  assert.equal(engine.bloom.openCount, 0);

  engine.setScrollBloom(WAVE.start + WAVE.span * 0.5);
  engine.update(now + 16, 0.016);
  const partial = engine.heads.filter((head) => head.timeline > 0 && head.timeline < 1).length;
  assert.ok(partial > 0, "some heads are mid-morph part way through the wave");
  assert.ok(engine.bloom.openCount < engine.headCount);

  engine.setScrollBloom(1);
  engine.update(now + 32, 0.016);
  assert.equal(engine.bloom.openCount, engine.headCount, "every head is open at the end of the wave");
  assert.equal(events.finale, 1, "the finale fires once");

  engine.setScrollBloom(0);
  engine.update(now + 48, 0.016);
  assert.equal(engine.bloom.openCount, 0, "scrolling back closes uncommitted heads");
  assert.equal(events.finale, 1, "the finale does not fire again");
});

check("an interactively opened head stays open when the scroll rewinds", () => {
  const index = engine.heads[3].index;
  engine.setScrollBloom(0);
  engine.update(performance.now(), 0.016);
  assert.ok(engine.activateHead(index, false));
  const now = performance.now();
  engine.update(now + 1400, 1.4);
  assert.ok(engine.heads[3].timeline > 0.3 && engine.heads[3].timeline < 1, "opening at 1.4 s of 2.7 s");
  engine.update(now + 3000, 1.6);
  assert.equal(engine.heads[3].timeline, 1);
  assert.equal(engine.bloom.openCount, 1);
  engine.setScrollBloom(0);
  engine.update(now + 3100, 0.1);
  assert.equal(engine.heads[3].timeline, 1, "still open");
  assert.equal(engine.bloom.openCount, 1);
});

check("hovering a scroll-opened bud continues from where the wave left it", () => {
  const head = engine.heads[10];
  engine.setScrollBloom(head.waveStart + WAVE.span * 0.4);
  engine.update(performance.now(), 0.016);
  const before = head.timeline;
  assert.ok(before > 0.3 && before < 0.5, `wave placed the head at ${before.toFixed(3)}`);
  engine.activateHead(head.index, false);
  const now = performance.now();
  engine.update(now + 16, 0.016);
  assert.ok(head.timeline >= before - 0.001, "no backwards jump on activation");
  engine.update(now + 4000, 4);
  assert.equal(head.timeline, 1);
});

check("the lifecycle meter reports bloom counts after maturity", () => {
  const last = events.cultivation.at(-1);
  assert.ok(last);
  assert.equal(last.phase === "bloom" || last.phase === "complete", true);
  assert.match(last.value, /^\d\d \/ \d\d$/);
});

/* One engine lives at a time: creating the low-profile engine retires the
   high one, so its numbers are read first. */
const highHeads = engine.headCount;
const highTips = engine.data.all.tips.length;

check("creating a second engine retires the first", () => {
  const low = createWattleEngine(
    { profile: LOW_PROFILE, qa: false, reduced: false, finePointer: false, initialGrowth: 1 },
    {},
  );
  assert.equal(engine.disposed, true);
  assert.equal(low.disposed, false);
  assert.ok(low.headCount < highHeads || low.data.all.tips.length < highTips, "the low profile is lighter");
  const again = createWattleEngine(
    { profile: LOW_PROFILE, qa: false, reduced: false, finePointer: false, initialGrowth: 1 },
    {},
  );
  assert.equal(again, low, "the same configuration returns the live engine");
  low.dispose();
  assert.equal(low.disposed, true);
});

check("reduced motion renders the wave as a step", () => {
  const reduced = createWattleEngine(
    { profile: LOW_PROFILE, qa: false, reduced: true, finePointer: false, initialGrowth: 1 },
    {},
  );
  reduced.setScrollBloom(0.6);
  reduced.update(100, 0.016);
  const mid = reduced.heads.filter((head) => head.timeline > 0 && head.timeline < 1).length;
  assert.equal(mid, 0, "no head is mid-morph under reduced motion");
  reduced.dispose();
});

console.log(`# ${checks} engine checks passed`);
