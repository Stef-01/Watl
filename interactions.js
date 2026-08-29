/**
 * Pointer interaction, on springs.
 *
 * Framer Motion's DOM build is vendored into vendor/motion/ and loaded as a
 * classic script, so this file reads it off `window.Motion`. Everything here
 * is a layer on top of the CSS, never a replacement for it: the hover wave,
 * the entrance, the dimming and the dissolve all live in styles.css and keep
 * working if this file never loads, fails, or is switched off below. What
 * springs add is the thing CSS genuinely cannot do — a value that chases a
 * moving target and arrives with weight.
 *
 * Three rules shape the whole file:
 *
 *   Springs write to `translate` and `scale`, never `transform`. The CSS owns
 *   `transform` on every element touched here — `rise` on the links, `breathe`
 *   on the light — and a running animation outranks an inline style, so
 *   sharing that property would mean the JS silently losing. The independent
 *   properties compose with it instead of fighting it.
 *
 *   A pointer that cannot hover gets none of it. Magnetism and parallax are
 *   answers to a cursor; on a touchscreen they are jitter.
 *
 *   Reduced motion gets none of it either, and that is checked live rather
 *   than once, because the preference can change while the page is open.
 */

const Motion = window.Motion;

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
const fine = window.matchMedia("(hover: hover) and (pointer: fine)");

/** Springs the page can afford to run on every pointer move. */
const MAGNET = { type: "spring", stiffness: 260, damping: 24, mass: 0.9 };
const DRIFT = { type: "spring", stiffness: 42, damping: 22, mass: 1.4 };
const PRESS = { type: "spring", stiffness: 520, damping: 30 };

/** How far from a link the cursor is felt, and the furthest it can lean. */
const REACH = 130;
const MAX_PULL = 18;

/** Parallax is a suggestion of depth, not a slide. */
const DRIFT_RANGE = 0.032;

function enabled() {
  return Boolean(Motion) && fine.matches && !reduced.matches;
}

/**
 * A pair of spring-driven values written to one element's `translate`.
 * Returns a setter that retargets both springs; the springs carry their own
 * velocity, so a target that moves every frame is followed rather than
 * restarted.
 */
function translator(element) {
  const { motionValue, animate } = Motion;
  const x = motionValue(0);
  const y = motionValue(0);

  const write = () => {
    element.style.translate = `${x.get().toFixed(2)}px ${y.get().toFixed(2)}px`;
  };
  x.on("change", write);
  y.on("change", write);

  return (toX, toY, options) => {
    animate(x, toX, options);
    animate(y, toY, options);
  };
}

/**
 * The links lean toward the cursor as it passes and spring back when it goes.
 * The pull is capped well below the distance travelled, so a name never leaves
 * the line it belongs to — it acknowledges the cursor rather than chasing it.
 */
function magnetise(elements) {
  const magnets = elements.map((element) => ({ element, to: translator(element) }));
  let pointer = null;
  let queued = 0;

  /* Every box is read inside one rAF callback rather than in the pointermove
     handler. A pointer can fire far more often than the screen refreshes, and
     reading a rect after writing a style forces layout each time — so the
     handler only records where the cursor is, and the frame does the work.
     Reading them fresh each frame also means the entrance animation, which is
     still moving these elements for the first second and a half, never leaves
     a stale rect behind. */
  function frame() {
    queued = 0;
    if (!pointer) return;

    for (const magnet of magnets) {
      const box = magnet.element.getBoundingClientRect();
      const dx = pointer.x - (box.left + box.width / 2);
      const dy = pointer.y - (box.top + box.height / 2);
      const distance = Math.hypot(dx, dy);
      const reach = REACH + Math.max(box.width, box.height) / 2;

      if (distance > reach) {
        magnet.to(0, 0, MAGNET);
        continue;
      }

      /* Strength falls off with distance — full lean under the cursor, nothing
         at the edge of reach. Scaling the raw offset instead would invert it:
         the further away the cursor, the harder the pull, and the name would
         leap outward and then snap back at the threshold. */
      const strength = 1 - distance / reach;
      const step = (MAX_PULL * strength) / (distance || 1);
      magnet.to(dx * step, dy * step, MAGNET);
    }
  }

  function onMove(event) {
    pointer = { x: event.clientX, y: event.clientY };
    if (!queued) queued = requestAnimationFrame(frame);
  }

  function release() {
    pointer = null;
    for (const magnet of magnets) magnet.to(0, 0, MAGNET);
  }

  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("pointerleave", release, { passive: true });
  window.addEventListener("blur", release);

  return () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerleave", release);
    window.removeEventListener("blur", release);
    if (queued) cancelAnimationFrame(queued);
    release();
  };
}

/**
 * The light behind the bouquet leans the other way from the cursor, on a very
 * soft spring. It is the slowest thing on the page on purpose: fast parallax
 * reads as a bug, slow parallax reads as depth.
 */
function parallax(light) {
  const to = translator(light);

  function onMove(event) {
    const x = (event.clientX / window.innerWidth - 0.5) * -2;
    const y = (event.clientY / window.innerHeight - 0.5) * -2;
    to(x * window.innerWidth * DRIFT_RANGE, y * window.innerHeight * DRIFT_RANGE, DRIFT);
  }

  window.addEventListener("pointermove", onMove, { passive: true });
  return () => {
    window.removeEventListener("pointermove", onMove);
    to(0, 0, DRIFT);
  };
}

/**
 * Press gives back. This one is worth keeping on touch — it is the only
 * feedback a finger gets between tapping a link and the page changing.
 */
function pressable(elements) {
  if (!Motion.press) return () => {};
  const stops = elements.map((element) =>
    Motion.press(element, () => {
      const { animate } = Motion;
      animate(element, { scale: 0.965 }, PRESS);
      return () => animate(element, { scale: 1 }, PRESS);
    }),
  );
  return () => stops.forEach((stop) => typeof stop === "function" && stop());
}

/** Everything the pointer layer has switched on, so it can be switched off. */
let teardown = [];

function stop() {
  teardown.forEach((off) => off());
  teardown = [];
}

function start() {
  stop();

  const links = [...document.querySelectorAll(".client")];
  const toggle = document.querySelector(".ground-switch__toggle");
  const light = document.querySelector(".stage__light");

  /* Press is the one thing a touchscreen keeps, so it is set up before the
     hover-only gate. */
  if (Motion) {
    teardown.push(pressable([...links, ...(toggle ? [toggle] : [])]));
  }

  if (!enabled()) return;

  teardown.push(magnetise([...links, ...(toggle ? [toggle] : [])]));
  if (light) teardown.push(parallax(light));
}

if (Motion) {
  start();
  /* Both preferences can change while the page is open — a system theme
     switch, or a mouse plugged into a tablet — so the layer is rebuilt rather
     than assumed. */
  reduced.addEventListener("change", start);
  fine.addEventListener("change", start);
} else {
  /* No library, no interaction layer. The CSS floor is already doing its job,
     so there is nothing to fall back to and nothing to report. */
}
