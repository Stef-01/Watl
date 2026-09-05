/**
 * Diagnostic: load the dev site headlessly and print what ScrollTrigger and
 * the page believe at a few scroll positions.
 *
 *   node tools/debug-scroll.mjs [http://127.0.0.1:5173]
 */
import { chromium } from "playwright-core";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:5173";

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (error) => console.log("PAGE ERROR", String(error)));
page.on("console", (message) => {
  if (message.type() === "error" || message.type() === "warning") console.log(`console.${message.type()}:`, message.text());
});
const url = new URL(baseUrl);
url.searchParams.set("tune", "0");
await page.goto(url.href, { waitUntil: "networkidle" });
await page.waitForSelector('#wattle-stage[data-state="ready"]', { timeout: 20000 });
await page.waitForTimeout(2500);

const report = async (label) => {
  const info = await page.evaluate(() => {
    const d = window.__WATL_DEBUG__;
    const triggers = d.ScrollTrigger.getAll().map((t) => ({
      trigger: t.trigger?.id || t.trigger?.className || "?",
      pin: Boolean(t.pin),
      start: Math.round(t.start),
      end: Math.round(t.end),
      progress: Number(t.progress.toFixed(3)),
      active: t.isActive,
    }));
    const spacer = document.querySelector(".pin-spacer");
    const headline = document.querySelector(".arrival__headline");
    const lines = [...document.querySelectorAll(".arrival__headline .line")];
    const cs = headline ? getComputedStyle(headline) : null;
    const engine = d.engine;
    const cam = engine?.state?.camera;
    return {
      scrollY: window.scrollY,
      scrollHeight: document.documentElement.scrollHeight,
      spacerHeight: spacer ? spacer.getBoundingClientRect().height : null,
      section: d.store.getState().section,
      heroProgress: d.store.getState().heroProgress,
      scrub: Object.fromEntries(Object.entries(d.scrub).filter(([, v]) => typeof v === "number").map(([k, v]) => [k, Number(v.toFixed(3))])),
      pose: Object.fromEntries(Object.entries(d.pose).filter(([, v]) => typeof v === "number").map(([k, v]) => [k, Number(v.toFixed(3))])),
      triggers,
      headline: cs ? { opacity: cs.opacity, display: cs.display, lines: lines.length, fontFamily: cs.fontFamily.slice(0, 40), rect: headline.getBoundingClientRect().toJSON() } : null,
      lineStyles: lines.slice(0, 2).map((line) => ({ transform: line.style.transform, opacity: getComputedStyle(line).opacity, parent: line.parentElement?.className })),
      engine: engine ? {
        growth: engine.growth?.progress,
        open: engine.bloom?.openCount,
        heads: engine.headCount,
        defaultView: engine.defaultView ? { distance: engine.defaultView.position.distanceTo(engine.defaultView.target).toFixed(3), target: engine.defaultView.target.toArray().map((v) => v.toFixed(2)) } : null,
        camera: cam ? { pos: cam.position.toArray().map((v) => v.toFixed(2)), aspect: cam.aspect.toFixed(3) } : null,
        sceneChildren: engine.scene?.children.length,
        threads: engine.universe?.userData?.threads?.visible,
      } : null,
      cue: (() => { const el = document.querySelector(".scroll-cue"); return el ? { opacity: getComputedStyle(el).opacity, inline: el.getAttribute("style"), gone: el.dataset.gone } : null; })(),
      rows: [...document.querySelectorAll(".practice__row, .client, .contact__copy")].map((el) => `${el.className.split(" ")[0]}:${getComputedStyle(el).opacity}`),
      lenis: document.documentElement.classList.contains("lenis"),
      fontsReady: document.documentElement.classList.contains("fonts-ready"),
    };
  });
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(info, null, 1));
};

await report("load");
const pinLength = await page.evaluate(() => {
  const spacer = document.querySelector(".pin-spacer");
  return spacer ? spacer.getBoundingClientRect().height - window.innerHeight : 0;
});
for (const t of [0.3, 0.7, 1.0]) {
  await page.evaluate((top) => window.scrollTo({ top, behavior: "auto" }), Math.round(pinLength * t));
  await page.waitForTimeout(1800);
  await report(`pin ${t}`);
}
const practiceTop = await page.evaluate(() => document.getElementById("practice").getBoundingClientRect().top + window.scrollY);
await page.evaluate((top) => window.scrollTo({ top, behavior: "auto" }), practiceTop - 90);
await page.waitForTimeout(1800);
await report("practice");
await browser.close();
