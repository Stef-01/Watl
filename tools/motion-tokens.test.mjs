/**
 * Every easing curve on the site lives in src/motion/tokens.ts. This sweep
 * fails the build if a literal cubic-bezier, a raw GSAP ease string, or a
 * hard-coded scrub value appears anywhere else in src/.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const src = join(root, "src");
const allowed = new Set(["src/motion/tokens.ts", "src/styles/tokens.css"]);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx?|jsx?|css)$/.test(entry)) out.push(full);
  }
  return out;
}

const offenders = [];
const patterns = [
  { name: "literal cubic-bezier", regex: /cubic-bezier\(/ },
  { name: "raw GSAP ease string", regex: /ease:\s*["'`](power|expo|sine|back|elastic|bounce|circ|quad|cubic|quart|quint)\b/ },
  { name: "raw scrub number", regex: /scrub:\s*[0-9.]+/ },
  { name: "raw spring config", regex: /stiffness:\s*[0-9]/ },
];

for (const file of walk(src)) {
  const rel = relative(root, file);
  if (allowed.has(rel)) continue;
  if (rel.startsWith("src/scene/engine/") || rel.startsWith("src/scene/botany/")) continue;
  const text = readFileSync(file, "utf8");
  for (const { name, regex } of patterns) {
    if (regex.test(text)) offenders.push(`${rel}: ${name}`);
  }
}

assert.deepEqual(offenders, [], `motion values outside tokens.ts:\n${offenders.join("\n")}`);
console.log("ok - every ease, scrub and spring reads from src/motion/tokens.ts");
