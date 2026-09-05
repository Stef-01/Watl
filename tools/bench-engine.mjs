/**
 * Engine benchmark: build time and per-frame cost while the wave moves.
 *   node tools/bench-engine.mjs
 */
globalThis.window = { setTimeout, clearTimeout };
const path = new URL("../src/scene/engine/wattle-engine.js", import.meta.url).href;
const { createWattleEngine, HIGH_PROFILE, LOW_PROFILE, WAVE } = await import(path);
for (const profile of [HIGH_PROFILE, LOW_PROFILE]) {
  const t0 = performance.now();
  const engine = createWattleEngine({ profile, initialGrowth: 1 }, {});
  const build = performance.now() - t0;
  // wave scrub: measure per-frame cost mid-wave with many heads moving
  engine.setScrollBloom(0);
  engine.update(performance.now(), 0.016);
  const frames = [];
  let t = WAVE.start;
  for (let i = 0; i < 40; i += 1) {
    t += 0.004; // a brisk scroll: 0.4% of the pin per frame
    engine.setScrollBloom(t);
    const f0 = performance.now();
    engine.update(performance.now(), 0.016);
    frames.push(performance.now() - f0);
  }
  const dirtyMax = Math.max(...frames).toFixed(1);
  const dirtyAvg = (frames.reduce((a, b) => a + b, 0) / frames.length).toFixed(1);
  const heads = engine.headCount;
  const mid = engine.heads.filter((h) => h.timeline > 0 && h.timeline < 1).length;
  console.log(`${profile.id}: build ${build.toFixed(0)} ms | wave frame avg ${dirtyAvg} ms, max ${dirtyMax} ms | heads ${heads}, mid-morph ${mid}`);
  engine.dispose();
}
