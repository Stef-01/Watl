/**
 * Render probe: page errors with stacks, draw stats, growth uniforms and a
 * still of the deterministic QA mode. Development diagnostics only.
 *
 *   node tools/probe.mjs [baseUrl] [query]
 */
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:5173";
const query = process.argv[3] ?? "";
const reduced = process.argv.includes("--reduced");
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: reduced ? "reduce" : "no-preference" });
const errors = new Set();
page.on("pageerror", (error) => errors.add(error.stack || String(error)));
page.on("console", (message) => {
  if (message.type() === "error") errors.add(message.text());
});
const url = new URL(baseUrl);
url.search = query;
if (!url.searchParams.has("tune")) url.searchParams.set("tune", "0");
await page.goto(url.href, { waitUntil: "networkidle" });
await page.waitForSelector('#wattle-stage[data-state="ready"]', { timeout: 20000 });
await page.waitForTimeout(2500);

const info = await page.evaluate(() => {
  const d = window.__WATL_DEBUG__;
  const engine = d.engine;
  const s = engine.state;
  const renderer = s.renderer;
  const describe = (object, depth = 0, out = []) => {
    if (depth > 3) return out;
    out.push(`${"  ".repeat(depth)}${object.type} ${object.name || ""} visible=${object.visible}${object.count !== undefined ? ` count=${object.count}` : ""}${object.material ? ` mat=${object.material.name || object.material.type}` : ""}`);
    for (const child of object.children) describe(child, depth + 1, out);
    return out;
  };
  const stem = s.growth?.materials?.stemMaterial;
  const program = stem && renderer ? renderer.properties.get(stem) : null;
  return {
    renderInfo: renderer ? { ...renderer.info.render, programs: renderer.info.programs?.length } : null,
    memory: renderer ? { ...renderer.info.memory } : null,
    growth: s.growth?.progress,
    stemGrowth: s.growth?.materials?.stemGrowth?.value,
    leafGrowth: s.growth?.materials?.leafGrowth?.value,
    budGrowth: s.growth?.materials?.budGrowth?.value,
    stemUniformOnProgram: program?.currentProgram ? Object.keys(program.currentProgram.getUniforms().map).filter((k) => /growth/i.test(k)) : null,
    stemUniformsAttached: stem?.userData?.growth ? "userData" : Object.keys(stem ?? {}).filter((k) => /uniform/i.test(k)),
    sceneParent: engine.scene.parent?.type,
    tree: describe(engine.bouquet).slice(0, 40),
    lights: engine.scene.children.filter((c) => c.isGroup && c.name === "WATL_Lights").map((g) => g.children.map((l) => `${l.type}:${l.intensity}`)),
    cameraIsState: s.camera === d.engine.state.camera,
    cameraPos: s.camera.position.toArray().map((v) => v.toFixed(2)),
    bounds: [engine.bounds.min.toArray().map((v) => v.toFixed(2)), engine.bounds.max.toArray().map((v) => v.toFixed(2))],
  };
});
console.log(JSON.stringify(info, null, 1));
console.log("errors:", [...errors].slice(0, 5).join("\n---\n") || "none");
await mkdir("qa/captures/probe", { recursive: true });
const name = `qa/captures/probe/${(query + (reduced ? "_reduced" : "")).replace(/[^a-z0-9]+/gi, "_") || "default"}.png`;
await page.screenshot({ path: name });
console.log("screenshot", name);
await browser.close();
