/**
 * Chrome — theme, navigation, the year, the contact form.
 *
 * Small, unglamorous, and deliberately free of any animation library: none of
 * it is choreography. The one thing worth noting is `data-past-stage`, which
 * the masthead's whole appearance hangs off. Over the artwork the header is
 * cream and weightless; past it, ink on a hairline. That flip is driven by an
 * observer on a sentinel rather than by a scroll handler, so it costs nothing.
 */

const STORE = "watl-theme";

/**
 * @param {{current: {setTheme(mode: string): void}|null}} stage
 *   The artwork, if it has loaded yet. Only the theme hook needs it.
 */
export function initChrome(stage) {
  const root = document.documentElement;

  /* --- theme ---------------------------------------------------------- */
  const setTheme = (mode) => {
    root.setAttribute("data-theme", mode);
    try { localStorage.setItem(STORE, mode); } catch { /* private mode */ }
    document.querySelectorAll("[data-theme-toggle]").forEach((b) => {
      b.setAttribute("aria-pressed", String(mode === "dark"));
      b.setAttribute("aria-label", mode === "dark" ? "Switch to light theme" : "Switch to dark theme");
    });
    stage?.current?.setTheme(mode);
  };

  document.querySelectorAll("[data-theme-toggle]").forEach((btn) =>
    btn.addEventListener("click", () =>
      setTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark")
    )
  );
  // The inline head script has already set the attribute; this only
  // synchronises the buttons and the canvas with it.
  setTheme(root.getAttribute("data-theme") || "light");

  /* --- the masthead's two states -------------------------------------- */
  // Pages with a stage hand this to the hero's scroll observer, which already
  // knows where the artwork is in its travel — an IntersectionObserver on the
  // stage cannot express "early in the exit", which is the moment that matters.
  // Interior pages have no stage, so the masthead is solid from the start.
  if (!document.querySelector("[data-stage]")) {
    root.setAttribute("data-past-stage", "true");
  } else if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    // No scroll observer runs under reduced motion, so fall back to a plain
    // one-shot: solid as soon as anything has been scrolled at all.
    const set = () => root.setAttribute("data-past-stage", String(window.scrollY > 80));
    set();
    window.addEventListener("scroll", set, { passive: true });
  }

  /* --- navigation ----------------------------------------------------- */
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

  /* --- contact ------------------------------------------------------- */
  const form = document.querySelector("[data-contact-form]");
  if (form) {
    const status = form.querySelector(".form-status");
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const d = new FormData(form);
      const get = (k) => String(d.get(k) || "").trim();
      const name = get("name");
      const email = get("email");
      const org = get("org");
      const brief = get("brief");
      const horizon = get("horizon");

      const fail = (msg) => {
        status.textContent = msg;
        status.dataset.state = "err";
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
