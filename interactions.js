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

let Motion = window.Motion;
let motionLoad = null;
const MOTION_SRC = "./vendor/motion/motion.js";

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
const fine = window.matchMedia("(hover: hover) and (pointer: fine)");

/** Springs the page can afford to run on every pointer move. */
const MAGNET = { type: "spring", stiffness: 260, damping: 24, mass: 0.9 };
const DRIFT = { type: "spring", stiffness: 42, damping: 22, mass: 1.4 };
const PRESS = { type: "spring", stiffness: 520, damping: 30 };

/** How far from a link the cursor is felt, and the furthest it can lean. */
const REACH = 130;
const MAX_PULL = 18;

/** Parallax is a suggestion of depth, not a slide. The optional atmosphere
 *  layers move more slowly than the light, and in opposing directions, so
 *  the pointer reveals depth without pulling the environment around. */
const PARALLAX_TARGETS = Object.freeze([
  Object.freeze({ selector: ".stage__light", range: 0.032 }),
  Object.freeze({ selector: ".backdrop__atmosphere--weather", range: 0.012 }),
  Object.freeze({ selector: ".backdrop__atmosphere--horizon", range: -0.007 }),
]);

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
  let queued = 0;
  let lastX = Number.NaN;
  let lastY = Number.NaN;
  let xAnimation = null;
  let yAnimation = null;

  const flush = () => {
    queued = 0;
    element.style.translate = `${x.get().toFixed(2)}px ${y.get().toFixed(2)}px`;
  };
  const schedule = () => {
    if (!queued) queued = requestAnimationFrame(flush);
  };
  const stopX = x.on("change", schedule);
  const stopY = y.on("change", schedule);

  return {
    to(toX, toY, options) {
      if (Math.abs(toX - lastX) < 0.02 && Math.abs(toY - lastY) < 0.02) return;
      lastX = toX;
      lastY = toY;
      xAnimation = animate(x, toX, options);
      yAnimation = animate(y, toY, options);
    },
    destroy() {
      xAnimation?.stop?.();
      yAnimation?.stop?.();
      stopX?.();
      stopY?.();
      if (queued) cancelAnimationFrame(queued);
      element.style.removeProperty("translate");
    },
  };
}

/**
 * The links lean toward the cursor as it passes and spring back when it goes.
 * The pull is capped well below the distance travelled, so a name never leaves
 * the line it belongs to — it acknowledges the cursor rather than chasing it.
 */
function magnetise(elements) {
  const magnets = elements.map((element) => ({ element, motion: translator(element) }));
  let pointerX = 0;
  let pointerY = 0;
  let hasPointer = false;
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
    if (!hasPointer) return;

    for (const magnet of magnets) {
      const box = magnet.element.getBoundingClientRect();
      const dx = pointerX - (box.left + box.width / 2);
      const dy = pointerY - (box.top + box.height / 2);
      const distance = Math.hypot(dx, dy);
      const reach = REACH + Math.max(box.width, box.height) / 2;

      if (distance > reach) {
        magnet.motion.to(0, 0, MAGNET);
        continue;
      }

      /* Strength falls off with distance — full lean under the cursor, nothing
         at the edge of reach. Scaling the raw offset instead would invert it:
         the further away the cursor, the harder the pull, and the name would
         leap outward and then snap back at the threshold. */
      const strength = 1 - distance / reach;
      const step = (MAX_PULL * strength) / (distance || 1);
      magnet.motion.to(dx * step, dy * step, MAGNET);
    }
  }

  function onMove(event) {
    pointerX = event.clientX;
    pointerY = event.clientY;
    hasPointer = true;
    if (!queued) queued = requestAnimationFrame(frame);
  }

  function release() {
    hasPointer = false;
    for (const magnet of magnets) magnet.motion.to(0, 0, MAGNET);
  }

  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("pointerleave", release, { passive: true });
  window.addEventListener("blur", release);

  return () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerleave", release);
    window.removeEventListener("blur", release);
    if (queued) cancelAnimationFrame(queued);
    magnets.forEach((magnet) => magnet.motion.destroy());
  };
}

/**
 * The light behind the bouquet leans the other way from the cursor, on a very
 * soft spring. It is the slowest thing on the page on purpose: fast parallax
 * reads as a bug, slow parallax reads as depth.
 */
function parallax(layers) {
  const fields = layers.map(({ element, range }) => ({
    motion: translator(element),
    range,
  }));
  let pointerX = 0;
  let pointerY = 0;
  let queued = 0;

  function frame() {
    queued = 0;
    const x = (pointerX / window.innerWidth - 0.5) * -2;
    const y = (pointerY / window.innerHeight - 0.5) * -2;
    for (const field of fields) {
      field.motion.to(
        x * window.innerWidth * field.range,
        y * window.innerHeight * field.range,
        DRIFT,
      );
    }
  }

  function onMove(event) {
    pointerX = event.clientX;
    pointerY = event.clientY;
    if (!queued) queued = requestAnimationFrame(frame);
  }

  window.addEventListener("pointermove", onMove, { passive: true });
  return () => {
    window.removeEventListener("pointermove", onMove);
    if (queued) cancelAnimationFrame(queued);
    fields.forEach((field) => field.motion.destroy());
  };
}

/**
 * The bloom brush is feedback, not decoration: its diameter makes the hover
 * activation area visible and it tightens only when the raycaster has found a
 * closed bud. Position follows the pointer directly; only the ring's state is
 * transitioned in CSS, so there is no cursor lag.
 */
function bloomCursor(cursor, canvas) {
  let pointerX = -96;
  let pointerY = -96;
  let queued = 0;

  function frame() {
    queued = 0;
    cursor.style.transform = `translate3d(${pointerX.toFixed(2)}px, ${pointerY.toFixed(2)}px, 0)`;
  }

  function move(event) {
    pointerX = event.clientX;
    pointerY = event.clientY;
    cursor.dataset.visible = "true";
    if (!queued) queued = requestAnimationFrame(frame);
  }

  function hide() {
    cursor.dataset.visible = "false";
    cursor.dataset.pressed = "false";
  }

  function press() {
    cursor.dataset.pressed = "true";
  }

  function release() {
    cursor.dataset.pressed = "false";
  }

  canvas.addEventListener("pointerenter", move, { passive: true });
  canvas.addEventListener("pointermove", move, { passive: true });
  canvas.addEventListener("pointerleave", hide, { passive: true });
  canvas.addEventListener("pointerdown", press, { passive: true });
  canvas.addEventListener("pointerup", release, { passive: true });
  canvas.addEventListener("pointercancel", hide, { passive: true });
  window.addEventListener("blur", hide);

  return () => {
    canvas.removeEventListener("pointerenter", move);
    canvas.removeEventListener("pointermove", move);
    canvas.removeEventListener("pointerleave", hide);
    canvas.removeEventListener("pointerdown", press);
    canvas.removeEventListener("pointerup", release);
    canvas.removeEventListener("pointercancel", hide);
    window.removeEventListener("blur", hide);
    if (queued) cancelAnimationFrame(queued);
    cursor.style.removeProperty("transform");
    cursor.removeAttribute("data-visible");
    cursor.removeAttribute("data-pressed");
  };
}

/**
 * Press gives back on the spring-enabled pointer layer. Touch keeps the CSS
 * active state, so it has immediate feedback without loading this runtime.
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

/**
 * Keep the tiny rail counter in step with native scrolling. The list itself
 * remains a real overflow region — trackpad momentum, keyboard scrolling and
 * accessibility tooling all retain their platform behaviour. This listener
 * only reports the row nearest the top edge and never drives the scroll.
 */
function clientPosition(list) {
  const items = [...list.querySelectorAll(".client")];
  const current = document.querySelector("#client-current");
  const total = document.querySelector("#client-total");
  let queued = 0;

  if (total) total.textContent = String(items.length).padStart(2, "0");

  function update() {
    queued = 0;
    let closest = 0;
    let distance = Infinity;
    const firstOffset = items[0]?.offsetTop || 0;

    items.forEach((item, index) => {
      const delta = Math.abs(item.offsetTop - firstOffset - list.scrollTop);
      if (delta < distance) {
        distance = delta;
        closest = index;
      }
    });

    if (current) current.textContent = String(closest + 1).padStart(2, "0");
  }

  function onScroll() {
    if (!queued) queued = requestAnimationFrame(update);
  }

  function onKeyDown(event) {
    const keys = ["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End"];
    if (!keys.includes(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;

    const firstOffset = items[0]?.offsetTop || 0;
    let nearest = 0;
    let distance = Infinity;

    items.forEach((item, index) => {
      const delta = Math.abs(item.offsetTop - firstOffset - list.scrollTop);
      if (delta < distance) {
        nearest = index;
        distance = delta;
      }
    });

    if (event.key === "Home") nearest = 0;
    else if (event.key === "End") nearest = items.length - 1;
    else if (event.key === "ArrowDown" || event.key === "PageDown") nearest += 1;
    else nearest -= 1;

    nearest = Math.max(0, Math.min(items.length - 1, nearest));
    event.preventDefault();
    list.scrollTo({
      top: items[nearest].offsetTop - firstOffset,
      /* Keyboard navigation is a high-frequency precision action. The row
         changes immediately; pointer and trackpad momentum remain native. */
      behavior: "auto",
    });
  }

  list.addEventListener("scroll", onScroll, { passive: true });
  list.addEventListener("keydown", onKeyDown);
  update();

  return () => {
    list.removeEventListener("scroll", onScroll);
    list.removeEventListener("keydown", onKeyDown);
    if (queued) cancelAnimationFrame(queued);
  };
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
  const magneticLinks = links.filter((link) => !link.closest("#client-list"));
  const clientList = document.querySelector("#client-list");
  const toggle = document.querySelector(".ground-switch__toggle");
  const cursor = document.querySelector("#bloom-cursor");
  const canvas = document.querySelector("#wattle-canvas");
  const parallaxLayers = PARALLAX_TARGETS
    .map(({ selector, range }) => ({ element: document.querySelector(selector), range }))
    .filter(({ element }) => element);

  if (clientList) teardown.push(clientPosition(clientList));

  /* This direct, transform-only feedback does not need the spring runtime, so
     it is available immediately while Motion loads in parallel. */
  if (fine.matches && !reduced.matches && cursor && canvas) {
    teardown.push(bloomCursor(cursor, canvas));
  }

  if (!enabled()) return;

  teardown.push(pressable([...links, ...(toggle ? [toggle] : [])]));

  /* The compact client list gets only its 0.22rem CSS acknowledgement. A
     magnetic pull inside a scroll surface makes rows feel loose and noisy;
     the separate contact action can keep the more expressive spring. */
  teardown.push(magnetise([...magneticLinks, ...(toggle ? [toggle] : [])]));
  if (parallaxLayers.length > 0) teardown.push(parallax(parallaxLayers));
}

function loadMotion() {
  if (Motion) return Promise.resolve(Motion);
  if (motionLoad) return motionLoad;
  motionLoad = new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = MOTION_SRC;
    script.async = true;
    script.onload = () => {
      Motion = window.Motion;
      resolve(Motion);
    };
    script.onerror = () => resolve(null);
    document.head.append(script);
  });
  return motionLoad;
}

function syncMotionLayer() {
  start();
  if (!Motion && fine.matches && !reduced.matches) {
    void loadMotion().then((loaded) => {
      if (loaded && fine.matches && !reduced.matches) start();
    });
  }
}

syncMotionLayer();
/* Both preferences can change while the page is open — a system motion
   preference, or a mouse plugged into a tablet — so the layer is rebuilt
   rather than assumed. The 137 kB spring runtime is requested only when a
   fine pointer can use it. */
reduced.addEventListener("change", syncMotionLayer);
fine.addEventListener("change", syncMotionLayer);
