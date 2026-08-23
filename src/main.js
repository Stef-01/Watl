/**
 * Entry point.
 *
 * Three.js is roughly four fifths of this site's JavaScript, and it is only
 * ever needed for one decorative panel. So it is behind a dynamic import
 * guarded by three questions: is there a canvas, does WebGL exist, and did
 * the visitor ask for less motion? Any "no" and the CSS gradient — which is
 * what sits under the canvas anyway — is simply left alone.
 */
import "./styles/wattle.css";
import { initMotion, initChrome } from "./motion.js";

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

const canvas = document.querySelector("[data-ground]");
const wants =
  canvas &&
  webglAvailable() &&
  !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Chrome and choreography start immediately; the ground catches up.
initChrome(null);
initMotion(null);

if (wants) {
  import("./ground.js")
    .then(({ createGround }) => {
      const ground = createGround(canvas);
      if (!ground) return;
      canvas.classList.add("is-live");
      // Hand the live ground to the parts that drive it.
      initChrome(ground);
      window.addEventListener("scroll", () => {
        const max = document.body.scrollHeight - window.innerHeight;
        ground.setScroll(max > 0 ? window.scrollY / max : 0);
      }, { passive: true });
    })
    .catch(() => { /* the gradient stands in */ });
}
