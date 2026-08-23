/**
 * Entry.
 *
 * Load order is the whole design of this file. The artwork is the largest
 * thing the site ships and the only thing that needs a GPU, so it is behind a
 * dynamic import guarded by two questions — is there a canvas, and is there
 * WebGL. Everything else runs immediately.
 *
 * Both layers are initialised exactly once, and handed a mutable reference
 * rather than the scene itself. That is what lets the type start arriving
 * before the GPU has answered: the choreography reads `stage.current` when it
 * needs the entity, finds null for the first few hundred milliseconds, and
 * simply skips the parts that need geometry.
 *
 * Note what is *not* guarded: reduced motion. A visitor who asked for less
 * movement still gets the picture — the scene renders exactly one frame and
 * then never touches requestAnimationFrame again. Withholding the artwork
 * would be withholding the content.
 */
import "./styles/watl.css";
import { initChrome } from "./chrome.js";
import { initHero } from "./hero.js";

function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return Boolean(
      window.WebGLRenderingContext &&
      (c.getContext("webgl2") || c.getContext("webgl"))
    );
  } catch {
    return false;
  }
}

/** The one handle on the artwork, shared by every layer that drives it. */
const stage = { current: null };

initChrome(stage);
initHero(stage);

const canvas = document.querySelector("[data-bloom]");

if (canvas && webglAvailable()) {
  import("./bloom/scene.js")
    .then(({ createBloom }) => {
      const theme = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
      const bloom = createBloom(canvas, { theme });
      if (!bloom) return;

      stage.current = bloom;
      canvas.classList.add("is-live");
      document.documentElement.setAttribute("data-bloom-tier", bloom.tier);
      // Development only; Vite strips this branch from the production bundle.
      if (import.meta.env.DEV) window.__watl = bloom;
    })
    .catch(() => { /* the still holds the frame */ });
}
