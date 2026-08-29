import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { request } from "node:http";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let checkCount = 0;

async function check(name, callback) {
  await callback();
  checkCount += 1;
  console.log(`ok ${checkCount} - ${name}`);
}

function syntaxCheck(file) {
  const result = spawnSync(process.execPath, ["--check", file], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

async function reservePort() {
  const socket = createServer();
  socket.unref();
  await new Promise((resolveListen, rejectListen) => {
    socket.once("error", rejectListen);
    socket.listen(0, "127.0.0.1", resolveListen);
  });
  const address = socket.address();
  assert(address && typeof address === "object");
  await new Promise((resolveClose, rejectClose) => {
    socket.close((error) => error ? rejectClose(error) : resolveClose());
  });
  return address.port;
}

function waitForServer(child, port) {
  return new Promise((resolveReady, rejectReady) => {
    let stderr = "";
    const timeout = setTimeout(() => {
      rejectReady(new Error(`Server did not start on port ${port}. ${stderr}`));
    }, 5_000);

    const cleanup = () => {
      clearTimeout(timeout);
      child.stdout.off("data", onStdout);
      child.stderr.off("data", onStderr);
      child.off("exit", onExit);
    };
    const onStdout = (chunk) => {
      if (!String(chunk).includes(`http://127.0.0.1:${port}`)) return;
      cleanup();
      resolveReady();
    };
    const onStderr = (chunk) => {
      stderr += String(chunk);
    };
    const onExit = (code, signal) => {
      cleanup();
      rejectReady(new Error(
        `Server exited before becoming ready (code ${code}, signal ${signal}). ${stderr}`,
      ));
    };

    child.stdout.on("data", onStdout);
    child.stderr.on("data", onStderr);
    child.once("exit", onExit);
  });
}

async function stopServer(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  const timeout = setTimeout(() => child.kill("SIGKILL"), 2_000);
  await once(child, "exit");
  clearTimeout(timeout);
}

function requestWithHost(port, host) {
  return new Promise((resolveResponse, rejectResponse) => {
    const outgoing = request({
      hostname: "127.0.0.1",
      port,
      path: "/",
      headers: { Host: host },
    }, (response) => {
      response.resume();
      response.once("end", () => resolveResponse(response));
    });
    outgoing.once("error", rejectResponse);
    outgoing.end();
  });
}

const [indexSource, scriptSource, stylesSource] = await Promise.all([
  readFile(resolve(root, "index.html"), "utf8"),
  readFile(resolve(root, "script.js"), "utf8"),
  readFile(resolve(root, "styles.css"), "utf8"),
]);

await check("JavaScript entry points parse", () => {
  syntaxCheck("server.mjs");
  syntaxCheck("script.js");
  syntaxCheck("tools/qa-smoke.mjs");
});

await check("the scene keeps its keyboard and screen-reader contract", () => {
  assert.match(indexSource, /id=["']wattle-stage["'][\s\S]*?tabindex=["']0["']/);
  assert.match(indexSource, /id=["']wattle-stage["'][\s\S]*?role=["']group["']/);
  assert.match(indexSource, /aria-describedby=["'][^"']*scene-description[^"']*keyboard-instructions[^"']*["']/);
  assert.match(indexSource, /id=["']stage-status["'][\s\S]*?role=["']status["'][\s\S]*?aria-live=["']polite["']/);
  assert.match(indexSource, /id=["']scene-fallback["'][\s\S]*?\salt=["'][^"']+["']/);
});

await check("the page imports only the vendored Three.js runtime", () => {
  assert.match(indexSource, /["']three["']\s*:\s*["']\.\/vendor\/three\/three\.module\.js["']/);
  assert.match(indexSource, /["']three\/addons\/["']\s*:\s*["']\.\/vendor\/three\/addons\/["']/);
  assert.doesNotMatch(indexSource, /https?:\/\/[^"']*(?:three|unpkg|jsdelivr)/i);
});

await check("reduced motion and the deterministic QA surface remain wired", () => {
  assert.match(stylesSource, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(scriptSource, /matchMedia\(["']\(prefers-reduced-motion:\s*reduce\)["']\)/);
  assert.match(scriptSource, /window\.__WATTLE_BOOTED__\s*=\s*true/);
  assert.match(scriptSource, /window\.__WATTLE_QA__\s*=\s*Object\.freeze/);
  assert.match(scriptSource, /\bsnapshot\s*\(\)\s*\{/);
  assert.match(scriptSource, /\bprojectBloomPoint\s*\(/);
  assert.match(scriptSource, /query\.get\(["']quality["']\)/);
  assert.match(scriptSource, /query\.get\(["']qaFail["']\)/);
});

await check("interactive blooming keeps its pointer, keyboard, and motion safeguards", () => {
  assert.match(indexSource, /data-bloom-hover=["']false["']/);
  assert.match(indexSource, /data-bloom-finale=["']false["']/);
  assert.match(indexSource, /aria-keyshortcuts=["'][^"']*Enter[^"']*Space[^"']*["']/);
  assert.match(stylesSource, /@media\s*\(hover:\s*hover\)\s*and\s*\(pointer:\s*fine\)/);
  assert.match(scriptSource, /function\s+activateBloomAtIndex\s*\(/);
  assert.match(scriptSource, /function\s+bloomAtHoverArea\s*\(/);
  assert.match(scriptSource, /function\s+triggerBouquetBloom\s*\(/);
  assert.match(scriptSource, /const\s+spatialAllowed\s*=\s*!reduceBloomMotion\(\)/);
  assert.match(scriptSource, /distance\s*>\s*BLOOM_DRAG_SLOP/);
  assert.match(scriptSource, /\bbudMatrices\b/);
  assert.match(scriptSource, /\bbudPositions\b/);
  assert.match(scriptSource, /head\.committedOpen\s*=\s*true/);
  assert.match(scriptSource, /head\.mode\s*=\s*["']open["']/);
  assert.match(scriptSource, /BUD_FILAMENT_LENGTH/);
  assert.match(scriptSource, /BLOOM_BRUSH_STEP_MS/);
  assert.match(scriptSource, /BLOOM_BRUSH_BATCH_SIZE/);
  assert.match(scriptSource, /BLOOM_BRUSH_HEAD_STAGGER_MS/);
  assert.match(scriptSource, /BLOOM_UNFURL_MS\s*=\s*2700/);
  assert.match(scriptSource, /rawDuration\s*===\s*null/);
  assert.match(scriptSource, /BLOOM_LIGHT_INTENSITY\s*=\s*0\.72/);
  assert.doesNotMatch(scriptSource, /BLOOM_RADIAL_SPREAD/);
});

await check("the all-bloomed business banner stays accessible and actionable", () => {
  assert.match(indexSource, /id=["']bloom-finale["'][\s\S]*?role=["']dialog["']/);
  assert.match(indexSource, /Help your business bloom\./i);
  assert.match(indexSource, /mailto:Stefan\.thottunkal@gmail\.com/i);
  assert.match(indexSource, /id=["']bloom-finale-calendar["'][\s\S]*?data-calendly-url=/);
  assert.match(indexSource, /id=["']bloom-finale-dismiss["']/);
  assert.match(scriptSource, /function\s+showBloomFinale\s*\(/);
  assert.match(stylesSource, /\.bloom-finale\.is-visible/);
  assert.match(stylesSource, /\.bloom-finale\s*\{[\s\S]*?background:\s*#050505/);
  assert.doesNotMatch(stylesSource, /\.bloom-finale[\s\S]{0,500}transition:\s*all/);
});

const port = await reservePort();
const child = spawn(process.execPath, ["server.mjs"], {
  cwd: root,
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
});

try {
  await waitForServer(child, port);
  const baseUrl = `http://127.0.0.1:${port}`;

  await check("GET / serves the accessible application shell", async () => {
    const response = await fetch(`${baseUrl}/?quality=low&qa=1`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    const body = await response.text();
    assert.match(body, /id=["']wattle-canvas["']/);
    assert.match(body, /<script\s+type=["']module["']\s+src=["']\.\/script\.js["']/);
  });

  await check("public runtime and poster assets have correct MIME types", async () => {
    const scriptResponse = await fetch(`${baseUrl}/script.js?cache-bust=qa`);
    assert.equal(scriptResponse.status, 200);
    assert.match(scriptResponse.headers.get("content-type") ?? "", /^text\/javascript\b/);
    assert.match(await scriptResponse.text(), /window\.__WATTLE_BOOTED__/);

    const threeResponse = await fetch(`${baseUrl}/vendor/three/three.module.js`, { method: "HEAD" });
    assert.equal(threeResponse.status, 200);
    assert.match(threeResponse.headers.get("content-type") ?? "", /^text\/javascript\b/);
    assert.equal(await threeResponse.text(), "");

    const posterResponse = await fetch(`${baseUrl}/assets/wattle-bouquet-poster.png`, { method: "HEAD" });
    assert.equal(posterResponse.status, 200);
    assert.equal(posterResponse.headers.get("content-type"), "image/png");
    assert(Number(posterResponse.headers.get("content-length")) > 0);
    assert.equal(await posterResponse.text(), "");
  });

  await check("non-public source and hidden paths stay private", async () => {
    const sourceResponse = await fetch(`${baseUrl}/src/hero.js`);
    assert.equal(sourceResponse.status, 404);
    const hiddenResponse = await fetch(`${baseUrl}/.git/config`);
    assert.equal(hiddenResponse.status, 404);
  });

  await check("unsupported methods and hostile Host headers are rejected", async () => {
    const methodResponse = await fetch(`${baseUrl}/`, { method: "POST" });
    assert.equal(methodResponse.status, 405);
    assert.equal(methodResponse.headers.get("allow"), "GET, HEAD");

    const hostResponse = await requestWithHost(port, "watl.invalid");
    assert.equal(hostResponse.statusCode, 403);
  });
} finally {
  await stopServer(child);
}

console.log(`1..${checkCount}`);
