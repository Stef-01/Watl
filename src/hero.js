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
 */
import { animate, scroll, springValue, hover, stagger, inView } from "motion";

const EASE_OUT = [0.16, 1, 0.3, 1];

/** Wrap each character in a span so the title can rise a letter at a time. */
function letters(el) {
  const text = el.textContent.trim();
  el.textContent = "";
  el.setAttribute("aria-label", text);
  const spans = [];
  for (const ch of text) {
    const s = document.createElement("span");
    s.className = "ltr";
    s.textContent = ch === " " ? " " : ch;
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
  if (!el) return;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const lockup = el.querySelector("[data-lockup]");
  const title = el.querySelector("[data-title]");
  const cue = el.querySelector("[data-cue]");
  const touchBtn = el.querySelector("[data-touch]");
  const touch = window.matchMedia("(pointer: coarse)").matches;

  /* ================================================================== *
   * 1. Arrival
   * ================================================================== */
  if (reduced) {
    // Reduced motion still gets the finished picture — just not the assembly.
    el.querySelectorAll("[data-in]").forEach((el) => {
      el.style.opacity = "1";
      el.style.transform = "none";
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

  /* ================================================================== *
   * 2. The pointer
   *
   * Two springs, deliberately mismatched: the horizontal is looser than the
   * vertical, because a lens that yaws freely and pitches reluctantly feels
   * like a head turning rather than a gimbal. A third spring carries heat,
   * which rises only as the cursor closes on the body itself.
   *
   * `springValue` intercepts `.set()` as a *target*, so the raw pointer can
   * be thrown at it every move and the spring does the smoothing.
   * ================================================================== */
  if (!reduced && !touch) {
    const px = springValue(0, { stiffness: 62, damping: 20, mass: 1.1 });
    const py = springValue(0, { stiffness: 84, damping: 24, mass: 1.0 });
    const heat = springValue(0, { stiffness: 100, damping: 26 });

    let x = 0, y = 0;
    px.on("change", (v) => { x = v; stage.current?.setPointer(x, y); });
    py.on("change", (v) => { y = v; stage.current?.setPointer(x, y); });
    heat.on("change", (v) => stage.current?.setHeat(v));

    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
      const ny = ((e.clientY - r.top) / r.height) * 2 - 1;
      px.set(nx);
      py.set(ny);

      // Distance is measured in clip space against where the chest actually
      // projects, so the hot zone follows the entity when the lens swings.
      const at = stage.current?.project();
      if (!at) return;
      const d = Math.hypot((nx - at.x) * 0.7, -ny - at.y);
      heat.set(Math.max(0, 1 - d / 0.55) * 0.6);
      el.dataset.near = d < 0.5 ? "true" : "false";
    }, { passive: true });

    el.addEventListener("pointerleave", () => {
      px.set(0);
      py.set(0);
      heat.set(0);
      el.dataset.near = "false";
    }, { passive: true });
  }

  /* ================================================================== *
   * 3. The touch
   *
   * One gesture, one answer: the field throws petals, the body warms, the
   * vine relights. Pointer and keyboard are wired separately rather than
   * through a helper, so neither can fire twice for one intent.
   * ================================================================== */
  if (!reduced) {
    let spent = false;
    const fire = () => {
      if (!stage.current) return;
      stage.current.pulse();
      if (!spent && cue) {
        spent = true;
        animate(cue, { opacity: 0, y: -6 }, { duration: 0.7, ease: EASE_OUT });
      }
    };

    // Pointer fires on down, for immediacy. Keyboard fires on keydown with
    // the default prevented, so the button never also synthesises a click and
    // the entity never blooms twice for one intent.
    el.addEventListener("pointerdown", (e) => {
      fire();
      if (touch) {
        const r = el.getBoundingClientRect();
        const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
        animate(0, nx * 0.6, {
          duration: 1.5, ease: EASE_OUT,
          onUpdate: (v) => stage.current?.setPointer(v, 0),
        });
      }
    }, { passive: true });

    touchBtn?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        fire();
      }
    });
  }

  /* ================================================================== *
   * 4. The scroll
   *
   * The stage is taller than the viewport so the lens has runway. Progress
   * across that runway drives the camera climb and takes the lockup with it.
   * ================================================================== */
  if (!reduced) {
    scroll(
      (progress) => {
        stage.current?.setScroll(progress);
        if (lockup) {
          // Leave slowly, then commit. The lockup should still be readable
          // through the first third of the climb.
          const out = Math.max(0, (progress - 0.28) / 0.52);
          lockup.style.opacity = String(Math.max(0, 1 - out * 1.25));
          lockup.style.transform = `translate3d(0, ${-out * 7}vh, 0)`;
        }
      },
      { target: el, offset: ["start start", "end end"] }
    );
  }

  /* ================================================================== *
   * 5. The document below
   *
   * One rule for the whole page: sections arrive on a short rise, once, and
   * lists cascade inside them. Nothing else moves.
   * ================================================================== */
  const reveals = document.querySelectorAll("[data-reveal]");
  if (reduced) {
    reveals.forEach((el) => { el.style.opacity = "1"; el.style.transform = "none"; });
  } else {
    reveals.forEach((el) => {
      inView(el, () => {
        const kids = el.querySelectorAll("[data-cascade] > *");
        animate(el, { opacity: [0, 1], y: [14, 0] }, { duration: 0.9, ease: EASE_OUT });
        if (kids.length) {
          animate(kids, { opacity: [0, 1], y: [10, 0] }, {
            duration: 0.8, delay: stagger(0.07, { startDelay: 0.12 }), ease: EASE_OUT,
          });
        }
      }, { amount: 0.18, margin: "0px 0px -12% 0px" });
    });
  }

  /* --- magnetic links: the only hover flourish on the site ------------- */
  if (!reduced && !touch) {
    document.querySelectorAll("[data-go]").forEach((el) => {
      hover(el, () => {
        const arrow = el.querySelector("[data-arrow]");
        if (arrow) animate(arrow, { x: 6 }, { type: "spring", stiffness: 320, damping: 22 });
        return () => { if (arrow) animate(arrow, { x: 0 }, { type: "spring", stiffness: 320, damping: 26 }); };
      });
    });
  }
}
