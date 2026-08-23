/**
 * The hand on the entity.
 *
 * Everything the visitor does to the artwork passes through here, and all of
 * it is expressed in Motion — springs for anything the pointer drives, tweens
 * for anything the page drives. The reason for the split is physical: a
 * cursor is a hand, and a hand has mass, so it gets a spring; a scrollbar is
 * a position, so it gets read straight.
 *
 * The DOM lockup and the geometry are choreographed from the same file on
 * purpose. When the title's letters land, the vine has finished climbing —
 * that only stays true if one timeline owns both.
 *
 * Five things the visitor can do, and none of them adds a control to the page:
 *
 *   move    the lens follows, and the body warms as you close on it
 *   drag    a deliberate turn, further than a glance, that springs home
 *   tap     the field throws petals and the vine relights
 *   keys    arrows turn it, Enter blooms it — the artwork is a real button
 *   wait    it breathes, and it blinks
 */
import { animate, scroll, springValue, hover, stagger, inView } from "motion";

const EASE_OUT = [0.16, 1, 0.3, 1];

/** Past this much travel a press was a drag, and must not also bloom. */
const DRAG_SLOP = 9;

/** Wrap each character in a span so the title can rise a letter at a time. */
function letters(el) {
  const text = el.textContent.trim();
  el.textContent = "";
  el.setAttribute("aria-label", text);
  const spans = [];
  for (const ch of text) {
    const s = document.createElement("span");
    s.className = "ltr";
    s.textContent = ch === " " ? " " : ch;
    s.setAttribute("aria-hidden", "true");
    el.appendChild(s);
    spans.push(s);
  }
  return spans;
}

/**
 * @param {{current: object|null}} stage
 *   A mutable handle on the artwork. The scene arrives a few hundred
 *   milliseconds after the type starts moving, so every read is late-bound
 *   through `stage.current`.
 */
export function initHero(stage) {
  const el = document.querySelector("[data-stage]");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const touch = window.matchMedia("(pointer: coarse)").matches;

  // The document choreography runs on every page; the rest of this file only
  // has something to do where there is a stage.
  initDocument(reduced, touch);
  if (!el) return;

  const lockup = el.querySelector("[data-lockup]");
  const title = el.querySelector("[data-title]");
  const cue = el.querySelector("[data-cue]");
  const touchBtn = el.querySelector("[data-touch]");

  /* ================================================================== *
   * 1. Arrival
   * ================================================================== */
  if (reduced) {
    // Reduced motion still gets the finished picture — just not the assembly.
    el.querySelectorAll("[data-in]").forEach((node) => {
      node.style.opacity = "1";
      node.style.transform = "none";
    });
    if (title) title.style.opacity = "1";
    stage.current?.setReveal(1);
  } else {
    const chars = title ? letters(title) : [];
    if (title) title.style.opacity = "1";

    // The eyebrow opens out of tight tracking. Everything else rises.
    animate(
      el.querySelectorAll("[data-in='brow']"),
      { opacity: [0, 1], letterSpacing: ["0.02em", "0.34em"] },
      { duration: 1.6, delay: 0.15, ease: EASE_OUT }
    );

    animate(
      chars,
      { opacity: [0, 1], y: ["58%", "0%"] },
      { duration: 1.5, delay: stagger(0.055, { startDelay: 0.42 }), ease: [0.2, 1, 0.24, 1] }
    );

    animate(
      el.querySelectorAll("[data-in='script']"),
      { opacity: [0, 1], y: [22, 0] },
      { duration: 1.5, delay: 0.92, ease: EASE_OUT }
    );

    // The one bounce on the site.
    animate(
      el.querySelectorAll("[data-in='ornament']"),
      { opacity: [0, 1], scale: [0.4, 1], rotate: [-18, 0] },
      { type: "spring", stiffness: 120, damping: 16, delay: 1.25 }
    );

    animate(
      el.querySelectorAll("[data-in='tail']"),
      { opacity: [0, 1], y: [14, 0] },
      { duration: 1.3, delay: stagger(0.12, { startDelay: 1.42 }), ease: EASE_OUT }
    );

    // And the vine climbs while the letters land, so the entity wakes with
    // the type rather than after it. By the half-second mark the scene has
    // normally arrived; if it has not, these frames are simply dropped.
    animate(0, 1, {
      duration: 2.6, delay: 0.5, ease: [0.22, 1, 0.32, 1],
      onUpdate: (v) => stage.current?.setReveal(v),
    });
  }

  if (reduced) {
    // Nothing below this line applies: the artwork is a held still, and the
    // scroll would only move a lens that is not running.
    return;
  }

  /* ================================================================== *
   * 2. Springs
   *
   * Four values, four different masses. The horizontal is looser than the
   * vertical, because a lens that yaws freely and pitches reluctantly reads
   * as a head turning rather than as a gimbal. Spin is slowest of all — a
   * deliberate turn should take its time coming home.
   *
   * `springValue` intercepts `.set()` as a *target*, so the raw pointer can
   * be thrown at it on every move and the spring does the smoothing.
   * ================================================================== */
  const px = springValue(0, { stiffness: 62, damping: 20, mass: 1.1 });
  const py = springValue(0, { stiffness: 84, damping: 24, mass: 1.0 });
  const heat = springValue(0, { stiffness: 100, damping: 26 });
  const spin = springValue(0, { stiffness: 38, damping: 16, mass: 1.3 });
  const pull = springValue(0, { stiffness: 90, damping: 22 });

  let x = 0, y = 0;
  px.on("change", (v) => { x = v; stage.current?.setPointer(x, y); });
  py.on("change", (v) => { y = v; stage.current?.setPointer(x, y); });
  heat.on("change", (v) => stage.current?.setHeat(v));
  spin.on("change", (v) => stage.current?.setSpin(v));
  pull.on("change", (v) => stage.current?.setPull(v));

  /* ================================================================== *
   * 3. Idle
   *
   * Left alone, the entity blinks. It is the cheapest possible signal that
   * the thing is alive rather than rendered once, and it is the reason people
   * touch it. The timer resets on any interaction, so it never blinks at
   * somebody who is already engaged.
   * ================================================================== */
  let idle = 0;
  let blinking = null;

  function blink() {
    blinking?.stop();
    blinking = animate(0, 1, {
      duration: 0.34,
      ease: "easeInOut",
      // A lid falls faster than it lifts.
      onUpdate: (t) => stage.current?.setLid(t < 0.4 ? t / 0.4 : 1 - (t - 0.4) / 0.6),
      onComplete: () => stage.current?.setLid(0),
    });
  }

  function wake() {
    clearTimeout(idle);
    // Between five and nine seconds, so the rhythm never becomes a metronome.
    idle = setTimeout(() => { blink(); wake(); }, 5000 + Math.random() * 4000);
  }
  wake();

  /* ================================================================== *
   * 4. The cue
   *
   * One line, taught in two steps, then gone. Anything more instructional
   * than this belongs on a different kind of site.
   * ================================================================== */
  let taught = 0;
  function teach(next) {
    if (!cue || taught > 1) return;
    taught += 1;
    if (next) {
      animate(cue, { opacity: [1, 0] }, { duration: 0.32, ease: "easeOut" }).then(() => {
        cue.textContent = next;
        animate(cue, { opacity: [0, 1] }, { duration: 0.5, ease: EASE_OUT });
      });
    } else {
      animate(cue, { opacity: 0, y: -6 }, { duration: 0.7, ease: EASE_OUT });
    }
  }

  /* ================================================================== *
   * 5. Pointer, drag and tap
   *
   * One pointer pipeline handles all three, because they are one gesture with
   * three outcomes and splitting them is how you end up blooming the entity
   * every time somebody tries to turn it.
   * ================================================================== */
  let down = null;

  el.addEventListener("pointerdown", (e) => {
    down = { x: e.clientX, y: e.clientY, spin: spin.get(), moved: 0 };
    el.setPointerCapture?.(e.pointerId);
    el.dataset.dragging = "true";
    clearTimeout(idle);
  }, { passive: true });

  el.addEventListener("pointermove", (e) => {
    const r = el.getBoundingClientRect();
    const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
    const ny = ((e.clientY - r.top) / r.height) * 2 - 1;

    if (down) {
      // Dragging: the whole width of the stage is about a 70° turn, which is
      // enough to see the pod's thickness and the figure's far shoulder
      // without ever letting the composition fall apart.
      const dx = e.clientX - down.x;
      down.moved = Math.max(down.moved, Math.hypot(dx, e.clientY - down.y));
      spin.set(down.spin - (dx / r.width) * 1.2);
      if (down.moved > DRAG_SLOP && taught === 1) teach(null);
    } else {
      px.set(nx);
      py.set(ny);
    }

    // Heat and pull are measured against where the chest actually projects, so
    // the hot zone follows the entity when the lens swings rather than sitting
    // in a fixed rectangle.
    const at = stage.current?.project();
    if (!at) return;
    const d = Math.hypot((nx - at.x) * 0.7, -ny - at.y);
    heat.set(Math.max(0, 1 - d / 0.55) * 0.6);
    pull.set(0.85);
    el.dataset.near = d < 0.5 ? "true" : "false";
    wake();
  }, { passive: true });

  function release(e) {
    if (!down) return;
    const tapped = down.moved <= DRAG_SLOP;
    down = null;
    el.dataset.dragging = "false";
    el.releasePointerCapture?.(e.pointerId);

    // A drag springs home. A tap blooms.
    spin.set(0);
    if (tapped) {
      stage.current?.pulse();
      teach(touch ? null : "Drag to turn");
    }
    wake();
  }

  el.addEventListener("pointerup", release, { passive: true });
  el.addEventListener("pointercancel", release, { passive: true });

  el.addEventListener("pointerleave", () => {
    if (down) return;
    px.set(0);
    py.set(0);
    heat.set(0);
    pull.set(0);
    el.dataset.near = "false";
  }, { passive: true });

  /* --- keyboard: the artwork is a real button, so it takes real keys ---- */
  touchBtn?.addEventListener("keydown", (e) => {
    const step = e.shiftKey ? 0.24 : 0.1;
    switch (e.key) {
      case "Enter":
      case " ":
        stage.current?.pulse();
        teach(touch ? null : "Arrow keys turn it");
        break;
      case "ArrowLeft":  spin.set(spin.get() + step); break;
      case "ArrowRight": spin.set(spin.get() - step); break;
      case "ArrowUp":    py.set(Math.max(-1, y - 0.25)); break;
      case "ArrowDown":  py.set(Math.min(1, y + 0.25)); break;
      case "Escape":     spin.set(0); px.set(0); py.set(0); break;
      default: return;
    }
    e.preventDefault();
    wake();
  });

  /* ================================================================== *
   * 6. The scroll
   *
   * The stage is 168vh with a 100vh sticky hold inside it, which splits the
   * travel in two: the hold is pinned for the first 68vh — the lens's runway —
   * and then rides up and off over the last 100vh as the document arrives
   * underneath. Both halves need driving, and they need different things, so
   * one observer covers the whole stage and the two phases are derived from it.
   *
   *   0 → 0.405   the climb: the lens rises from the chest to the crown and
   *               the pair turns toward each other
   *   0.405 → 1   the exit: the artwork fades as it leaves, and the masthead
   *               hands itself over from cream to ink
   * ================================================================== */
  const RUNWAY = 68 / 168;          // the sticky portion, as a fraction
  const hold = el.querySelector(".stage__hold");
  // The corner lines are positioned against the hold rather than the lockup,
  // so they need telling separately or they hang around after the type has gone.
  const corners = el.querySelectorAll("[data-fade]");
  const root = document.documentElement;

  scroll(
    (p) => {
      const climb = Math.min(1, p / RUNWAY);
      const exit = Math.max(0, (p - RUNWAY) / (1 - RUNWAY));

      stage.current?.setScroll(climb);

      if (lockup) {
        // Leave slowly, then commit. The lockup should still be readable
        // through the first third of the climb.
        const out = Math.max(0, (climb - 0.28) / 0.52);
        lockup.style.opacity = String(Math.max(0, 1 - out * 1.25));
        lockup.style.transform = `translate3d(0, ${-out * 7}vh, 0)`;
      }
      for (const c of corners) c.style.opacity = String(Math.max(0, 1 - Math.max(0, (climb - 0.14) / 0.34)));

      // The artwork dims as it goes, rather than being sliced off by the
      // viewport edge. It is still there; it is just no longer the subject.
      if (hold) hold.style.opacity = String(Math.max(0, 1 - exit * 1.6));

      // And the masthead changes hands early in the exit — a cream header over
      // bone paper is the one state this design cannot hold.
      root.setAttribute("data-past-stage", String(exit > 0.12));
    },
    { target: el, offset: ["start start", "end start"] }
  );
}

/* ==================================================================== *
 * The document below the stage
 *
 * One rule for the whole site: sections arrive on a short rise, once, and
 * lists cascade inside them. Nothing else moves.
 * ==================================================================== */
function initDocument(reduced, touch) {
  const reveals = document.querySelectorAll("[data-reveal]");

  if (reduced) {
    reveals.forEach((node) => { node.style.opacity = "1"; node.style.transform = "none"; });
  } else {
    reveals.forEach((node) => {
      inView(node, () => {
        const kids = node.querySelectorAll("[data-cascade] > *");
        animate(node, { opacity: [0, 1], y: [14, 0] }, { duration: 0.9, ease: EASE_OUT });
        if (kids.length) {
          animate(kids, { opacity: [0, 1], y: [10, 0] }, {
            duration: 0.8, delay: stagger(0.07, { startDelay: 0.12 }), ease: EASE_OUT,
          });
        }
      }, { amount: 0.18, margin: "0px 0px -12% 0px" });
    });
  }

  // Magnetic arrows: the only hover flourish on the site.
  if (!reduced && !touch) {
    document.querySelectorAll("[data-go]").forEach((node) => {
      hover(node, () => {
        const arrow = node.querySelector("[data-arrow]");
        if (arrow) animate(arrow, { x: 6 }, { type: "spring", stiffness: 320, damping: 22 });
        return () => {
          if (arrow) animate(arrow, { x: 0 }, { type: "spring", stiffness: 320, damping: 26 });
        };
      });
    });
  }
}
