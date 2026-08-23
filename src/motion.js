/**
 * Choreography. GSAP owns every transition on the page so that timing,
 * easing and reduced-motion behaviour are decided in one file.
 *
 * The house easing is a long, soft power curve — the visual language is
 * quiet, so nothing here should snap.
 */
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const EASE = "power3.out";
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Split a wordmark into per-letter spans so it can rise a letter at a time. */
function letters(el) {
  const text = el.textContent.trim();
  el.textContent = "";
  el.setAttribute("aria-label", text);
  return [...text].map((ch) => {
    const span = document.createElement("span");
    span.className = "letter";
    span.textContent = ch;
    span.setAttribute("aria-hidden", "true");
    el.appendChild(span);
    return span;
  });
}

export function initMotion(ground) {
  // With reduced motion we still want the page to be *complete* — so make
  // everything visible immediately and register no scroll animation at all.
  if (reduced) {
    gsap.set("[data-reveal], .panel__note, .panel__label, .eyebrow, .panel__mark", { opacity: 1, y: 0 });
    return;
  }

  // --- the wordmark ----------------------------------------------------
  const mark = document.querySelector(".panel__mark");
  if (mark) {
    const chars = letters(mark);
    gsap.set(mark, { opacity: 1 });
    gsap.from(chars, {
      yPercent: 42,
      opacity: 0,
      duration: 1.5,
      ease: "power4.out",
      stagger: 0.075,
      delay: 0.15,
    });
  }

  // --- everything above it ---------------------------------------------
  const intro = gsap.timeline({ delay: 0.1 });
  intro.fromTo(".panel .eyebrow", { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9, ease: EASE })
       .fromTo(".panel__note",    { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 1.1, ease: EASE }, "-=0.65")
       .fromTo(".panel__label",   { opacity: 0 },        { opacity: 1, duration: 0.9, ease: EASE }, "-=0.7");

  // --- section reveals --------------------------------------------------
  gsap.utils.toArray("[data-reveal]").forEach((el) => {
    gsap.fromTo(el, { y: 26, opacity: 0 }, {
      y: 0,
      opacity: 1,
      duration: 1.05,
      ease: EASE,
      scrollTrigger: { trigger: el, start: "top 88%", once: true },
    });
  });

  // Rows arrive in sequence rather than as a block.
  gsap.utils.toArray(".rows").forEach((list) => {
    gsap.fromTo(list.querySelectorAll(".row"), { y: 20, opacity: 0 }, {
      y: 0,
      opacity: 1,
      duration: 0.85,
      ease: EASE,
      stagger: 0.09,
      scrollTrigger: { trigger: list, start: "top 82%", once: true },
    });
  });

  // Plates scale up a hair as they enter — the only transform that reads as
  // motion rather than as a fade.
  gsap.utils.toArray(".plate").forEach((plate) => {
    gsap.fromTo(plate, { scale: 0.965, opacity: 0 }, {
      scale: 1,
      opacity: 1,
      duration: 1.2,
      ease: EASE,
      scrollTrigger: { trigger: plate, start: "top 88%", once: true },
    });
  });

  // --- the wordmark drifts as the panel leaves ---------------------------
  if (mark) {
    gsap.to(mark, {
      yPercent: 14,
      ease: "none",
      scrollTrigger: {
        trigger: ".panel",
        start: "top top",
        end: "bottom top",
        scrub: 0.6,
      },
    });
  }

  // --- scroll feeds the shader ------------------------------------------
  if (ground) {
    ScrollTrigger.create({
      trigger: document.body,
      start: "top top",
      end: "bottom bottom",
      onUpdate: (self) => ground.setScroll(self.progress),
    });
  }

  // Fonts land after first paint and change every measurement.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => ScrollTrigger.refresh());
  }
}

/** Header, theme toggle and the mailto form — small, unglamorous, necessary. */
export function initChrome(ground) {
  const root = document.documentElement;
  const STORE = "watl-theme";

  const setTheme = (mode) => {
    root.setAttribute("data-theme", mode);
    try { localStorage.setItem(STORE, mode); } catch { /* private mode */ }
    document.querySelectorAll("[data-theme-toggle]").forEach((b) => {
      b.setAttribute("aria-pressed", String(mode === "dark"));
      b.setAttribute("aria-label", mode === "dark" ? "Switch to light theme" : "Switch to dark theme");
    });
    if (ground) ground.setTheme(mode);
  };

  document.querySelectorAll("[data-theme-toggle]").forEach((btn) =>
    btn.addEventListener("click", () =>
      setTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark")
    )
  );
  setTheme(root.getAttribute("data-theme") || "light");

  const toggle = document.querySelector("[data-nav-toggle]");
  const nav = document.getElementById("primary-nav");
  if (toggle && nav) {
    const close = () => {
      nav.setAttribute("data-open", "false");
      toggle.setAttribute("aria-expanded", "false");
    };
    toggle.addEventListener("click", () => {
      const open = nav.getAttribute("data-open") === "true";
      nav.setAttribute("data-open", String(!open));
      toggle.setAttribute("aria-expanded", String(!open));
    });
    nav.addEventListener("click", (e) => { if (e.target.closest("a")) close(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
    window.addEventListener("resize", () => { if (window.innerWidth > 780) close(); });
  }

  document.querySelectorAll("[data-year]").forEach((el) => {
    el.textContent = String(new Date().getFullYear());
  });

  const form = document.querySelector("[data-contact-form]");
  if (form) {
    const status = form.querySelector(".form-status");
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const d = new FormData(form);
      const name = String(d.get("name") || "").trim();
      const email = String(d.get("email") || "").trim();
      const org = String(d.get("org") || "").trim();
      const brief = String(d.get("brief") || "").trim();
      const horizon = String(d.get("horizon") || "");

      const fail = (msg) => {
        status.textContent = msg;
        status.dataset.state = "err";
        gsap.fromTo(form, { x: -4 }, { x: 0, duration: 0.45, ease: "elastic.out(1, 0.4)" });
      };

      if (!name || !email || !brief) return fail("Name, email and brief are all required.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("That email address does not look right.");

      const body = [
        `Name: ${name}`,
        `Email: ${email}`,
        `Organisation: ${org || "—"}`,
        `Horizon: ${horizon || "—"}`,
        "",
        brief,
      ].join("\n");

      status.textContent = "Opening your mail client…";
      status.dataset.state = "ok";
      window.location.href =
        `mailto:hello@wattle.technology?subject=${encodeURIComponent(`New brief — ${org || name}`)}` +
        `&body=${encodeURIComponent(body)}`;
    });
  }
}
