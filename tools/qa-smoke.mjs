/**
 * Smoke test against the production build.
 *
 * Builds with Vite, serves `dist/` with `vite preview`, and checks the
 * shell a crawler and a visitor receive: the search identity, the assets the
 * page depends on, the accessibility contract in the markup, and the absence
 * of anything that should never ship (the reference glb, the legacy files,
 * tuning UI). Rendering is covered by `tools/capture.mjs`; this stays
 * dependency-free.
 */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { readFile, readdir, stat } from "node:fs/promises";
import { request } from "node:http";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let checkCount = 0;

async function check(name, callback) {
  await callback();
  checkCount += 1;
  console.log(`ok ${checkCount} - ${name}`);
}

async function reservePort() {
  const socket = createServer();
  socket.unref();
  await new Promise((resolveListen, rejectListen) => {
    socket.once("error", rejectListen);
    socket.listen(0, "127.0.0.1", resolveListen);
  });
  const { port } = socket.address();
  await new Promise((resolveClose) => socket.close(() => resolveClose()));
  return port;
}

function fetchRaw(port, path, method = "GET") {
  return new Promise((resolveRequest, rejectRequest) => {
    const req = request({ hostname: "127.0.0.1", port, path, method }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        resolveRequest({
          status: response.statusCode,
          headers: response.headers,
          body: Buffer.concat(chunks),
        });
      });
    });
    req.once("error", rejectRequest);
    req.end();
  });
}

async function waitForServer(port) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetchRaw(port, "/");
      if (response.status === 200) return;
    } catch {
      /* not up yet */
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`vite preview did not come up on ${port}`);
}

async function walk(dir, out = []) {
  for (const entry of await readdir(dir)) {
    const full = join(dir, entry);
    if ((await stat(full)).isDirectory()) await walk(full, out);
    else out.push(full);
  }
  return out;
}

/* ---------------------------------------------------------------- build */
await check("the production build succeeds", () => {
  const result = spawnSync("npx", ["vite", "build"], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

const dist = join(root, "dist");
const files = await walk(dist);
const relative = files.map((file) => file.slice(dist.length + 1));
const indexHtml = await readFile(join(dist, "index.html"), "utf8");

await check("the shell carries one consistent search and social identity", () => {
  assert.match(indexHtml, /<link rel="canonical" href="https:\/\/watl-three\.vercel\.app\/"/);
  assert.match(indexHtml, /<meta property="og:image" content="https:\/\/watl-three\.vercel\.app\/assets\/wattle-golden-poster\.webp"/);
  assert.match(indexHtml, /<meta name="twitter:card" content="summary_large_image"/);
  assert.match(indexHtml, /"@type": "WebSite"/);
  assert.match(indexHtml, /"@type": "Organization"/);
  assert.match(indexHtml, /"@type": "Person"/);
  assert.match(indexHtml, /"@type": "WebPage"/);
  assert.doesNotMatch(indexHtml, /name="keywords"/);
  assert.match(indexHtml, /data-ground="night"/, "night is the first-paint ground");
});

await check("public assets, robots and sitemap ship; reference files do not", () => {
  for (const expected of ["assets/wattle-golden-poster.webp", "assets/ground-contours.svg", "assets/favicon.svg", "robots.txt", "sitemap.xml"]) {
    assert.ok(relative.includes(expected), `${expected} missing from dist`);
  }
  assert.ok(!relative.some((file) => file.endsWith(".glb")), "no glb ships");
  assert.ok(!relative.some((file) => /legacy/.test(file)), "no legacy file ships");
  const bundleBytes = files
    .filter((file) => file.endsWith(".js"))
    .reduce((sum, file) => sum + spawnSync("wc", ["-c", file], { encoding: "utf8" }).stdout.trim().split(/\s+/)[0] * 1, 0);
  assert.ok(bundleBytes < 2_400_000, `JavaScript payload ${bundleBytes} bytes exceeds the 2.4 MB budget`);
});

await check("self-hosted fonts are bundled and nothing is fetched from a third party", () => {
  assert.ok(relative.some((file) => /instrument-serif.*\.woff2$/.test(file)), "Instrument Serif woff2");
  assert.ok(relative.some((file) => /geist-mono.*\.woff2$/.test(file)), "Geist Mono woff2");
  const css = files.filter((file) => file.endsWith(".css"));
  for (const file of css) {
    const text = spawnSync("cat", [file], { encoding: "utf8" }).stdout;
    assert.doesNotMatch(text, /https?:\/\/(fonts\.googleapis|fonts\.gstatic|unpkg|cdn)/, `${file} references a remote host`);
  }
  assert.doesNotMatch(indexHtml, /<script[^>]+src="https?:/, "no third-party scripts");
});

await check("the source keeps its motion, accessibility and interaction contracts", async () => {
  const stage = await readFile(join(root, "src/scene/Stage.tsx"), "utf8");
  assert.match(stage, /aria-keyshortcuts="Enter Space ArrowUp ArrowDown ArrowLeft ArrowRight \+ - Home"/);
  assert.match(stage, /aria-describedby="scene-description scene-pointer-instructions keyboard-instructions"/);
  assert.match(stage, /frameloop="demand"/, "the canvas renders on demand");
  const status = await readFile(join(root, "src/ui/SceneStatus.tsx"), "utf8");
  assert.match(status, /role="status" aria-live="polite"/);
  const arrival = await readFile(join(root, "src/ui/Arrival.tsx"), "utf8");
  assert.match(arrival, /scrub: SCRUB\.hero/, "the hero scrub reads the token");
  assert.match(arrival, /pin: true/, "the arrival is pinned");
  const effects = await readFile(join(root, "src/scene/Effects.tsx"), "utf8");
  assert.match(effects, /luminanceThreshold=\{FX\.bloom\.threshold\}/, "bloom is thresholded from tokens");
  assert.match(effects, /radialModulation/, "aberration is radially masked");
  const smooth = await readFile(join(root, "src/motion/Smooth.tsx"), "utf8");
  assert.match(smooth, /if \(!enabled\) return <>\{children\}<\/>;/, "reduced motion skips Lenis");
  const interaction = await readFile(join(root, "src/scene/Interaction.tsx"), "utf8");
  assert.match(interaction, /DRAG_SLOP = 7/, "a click never doubles as a drag");
  const engine = await readFile(join(root, "src/scene/engine/wattle-engine.js"), "utf8");
  assert.match(engine, /head\.timeline = Math\.max\(head\.ownTimeline, head\.scroll\)/, "scroll and interaction compose by max");
  assert.doesNotMatch(engine, /document\.(getElementById|querySelector|body|documentElement|hidden)|window\.(addEventListener|requestAnimationFrame|matchMedia|location)/, "the engine never touches the document");
});

/* -------------------------------------------------------------- preview */
const port = await reservePort();
const server = spawn("npx", ["vite", "preview", "--port", String(port), "--strictPort", "--host", "127.0.0.1"], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
});
try {
  await waitForServer(port);

  await check("GET / serves the application shell", async () => {
    const response = await fetchRaw(port, "/");
    assert.equal(response.status, 200);
    assert.match(response.headers["content-type"], /text\/html/);
    const html = response.body.toString("utf8");
    assert.match(html, /<div id="root"><\/div>/);
    assert.match(html, /<noscript>/);
  });

  await check("runtime and poster assets are served with correct MIME types", async () => {
    const scripts = relative.filter((file) => file.endsWith(".js"));
    assert.ok(scripts.length > 0);
    for (const script of scripts.slice(0, 3)) {
      const response = await fetchRaw(port, `/${script}`);
      assert.equal(response.status, 200, script);
      assert.match(response.headers["content-type"], /javascript/, script);
    }
    const poster = await fetchRaw(port, "/assets/wattle-golden-poster.webp");
    assert.equal(poster.status, 200);
    assert.match(poster.headers["content-type"], /image\/webp/);
    const contours = await fetchRaw(port, "/assets/ground-contours.svg");
    assert.match(contours.headers["content-type"], /svg/);
    const robots = await fetchRaw(port, "/robots.txt");
    assert.equal(robots.status, 200);
  });

  await check("source and reference paths are not reachable from the build", async () => {
    /* `vite preview` answers unknown paths with the shell (SPA fallback), so
       the check is on what comes back, not the status: never source, never a
       model, never the legacy document. */
    for (const path of ["/src/main.tsx", "/reference/legacy-index.html", "/reference/golden-wattle-bouquet.glb", "/tools/capture.mjs"]) {
      const response = await fetchRaw(port, path);
      const type = String(response.headers["content-type"] ?? "");
      const body = response.body.toString("utf8", 0, 4096);
      assert.ok(!/javascript|gltf|octet-stream/.test(type), `${path} served as ${type}`);
      assert.ok(!/createRoot\(|import \{|wattle-stage/.test(body) || /<div id="root"><\/div>/.test(body), `${path} leaked content`);
      assert.doesNotMatch(body, /vendor\/three|interactions\.js/, `${path} served the legacy document`);
    }
  });
} finally {
  server.kill("SIGTERM");
  const timeout = setTimeout(() => server.kill("SIGKILL"), 2000);
  await once(server, "exit").catch(() => {});
  clearTimeout(timeout);
}

console.log(`1..${checkCount}`);
