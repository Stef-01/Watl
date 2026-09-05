/**
 * The capture loop.
 *
 * Drives the installed Chrome headlessly through the page at desktop and
 * phone sizes, waits for the scene to report ready, and writes a frame at each
 * pin progress and each section into qa/captures/. Compare these against the
 * previous run by eye; that is where the last fifteen percent is dialled.
 *
 *   node tools/capture.mjs                # http://127.0.0.1:5173
 *   node tools/capture.mjs http://127.0.0.1:4173 --tag after
 *   node tools/capture.mjs --only desktop --frames 0,0.5,1
 */
import { mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const baseUrl = args.find((arg) => arg.startsWith("http")) ?? "http://127.0.0.1:5173";
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const tag = option("tag", new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-"));
const only = option("only", "all");
const frames = option("frames", "0,0.12,0.3,0.52,0.7,0.85,1").split(",").map(Number);
const quality = option("quality", "");
const outDir = join(root, "qa", "captures", tag);

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900, dpr: 1 },
  { name: "phone", width: 390, height: 844, dpr: 2, mobile: true },
].filter((viewport) => only === "all" || viewport.name === only);

async function settle(page, ms) {
  await page.evaluate((wait) => new Promise((resolve) => setTimeout(resolve, wait)), ms);
}

async function scrollTo(page, y) {
  await page.evaluate((top) => {
    window.scrollTo({ top, behavior: "auto" });
  }, y);
  /* Lenis lerps and the scrub trails at 0.9 s; give both time to arrive. */
  await settle(page, 1700);
}

async function capture(browser, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.dpr,
    isMobile: Boolean(viewport.mobile),
    hasTouch: Boolean(viewport.mobile),
    reducedMotion: "no-preference",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  const url = new URL(baseUrl);
  if (quality) url.searchParams.set("quality", quality);
  url.searchParams.set("tune", "0");
  await page.goto(url.href, { waitUntil: "networkidle" });
  await page.waitForSelector('#wattle-stage[data-state="ready"]', { timeout: 20000 });
  await settle(page, 2400);

  const dir = join(outDir, viewport.name);
  await mkdir(dir, { recursive: true });

  const metrics = await page.evaluate(() => {
    const arrival = document.getElementById("arrival");
    const pinEnd = arrival ? arrival.getBoundingClientRect().height * 4.2 : 0;
    const top = (id) => {
      const el = document.getElementById(id);
      return el ? el.getBoundingClientRect().top + window.scrollY : 0;
    };
    return {
      pinEnd,
      practice: top("practice"),
      clients: top("clients"),
      contact: top("contact"),
      total: document.documentElement.scrollHeight,
    };
  });

  const pinLength = await page.evaluate(() => {
    const spacer = document.querySelector(".pin-spacer");
    return spacer ? spacer.getBoundingClientRect().height - window.innerHeight : 0;
  });

  let index = 0;
  const shot = async (label) => {
    index += 1;
    const file = join(dir, `${String(index).padStart(2, "0")}-${label}.png`);
    await page.screenshot({ path: file, fullPage: false });
    console.log(`  ${viewport.name}  ${label}`);
  };

  await shot("arrival-load");
  for (const t of frames) {
    if (t === 0) continue;
    await scrollTo(page, Math.round(pinLength * t));
    await shot(`pin-${t.toFixed(2)}`);
  }
  for (const section of ["practice", "clients", "contact"]) {
    await scrollTo(page, metrics[section] - viewport.height * 0.1);
    await shot(section);
  }
  await scrollTo(page, metrics.total);
  await shot("footer");

  const snapshot = await page.evaluate(() => {
    const stage = document.getElementById("wattle-stage");
    return {
      state: stage?.dataset.state,
      treeStage: stage?.dataset.treeStage,
      mature: stage?.dataset.treeMature,
      cultivation: document.getElementById("cultivation-value")?.textContent,
      phase: document.getElementById("cultivation-phase")?.textContent,
    };
  });
  console.log(`  ${viewport.name}  end state`, JSON.stringify(snapshot));
  if (errors.length) {
    console.log(`  ${viewport.name}  console errors:`);
    for (const error of errors) console.log(`    ${error}`);
  }
  await context.close();
  return errors;
}

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
let failures = 0;
try {
  for (const viewport of VIEWPORTS) {
    console.log(`${viewport.name} ${viewport.width}×${viewport.height}`);
    const errors = await capture(browser, viewport);
    failures += errors.length;
  }
} finally {
  await browser.close();
}
console.log(`captures in ${outDir}`);
process.exitCode = failures > 0 ? 1 : 0;
