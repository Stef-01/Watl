# WATL — Wattle Technologies

The Wattle Technologies site, built on Vite with **GSAP** for choreography and **Three.js** for a living background.

Sibling to [Stef-01/Wattle](https://github.com/Stef-01/Wattle), which holds the Next.js company site. This repo is the animated build.

---

## Run it

```bash
npm install
```

```bash
npm run dev
```

`npm run build` writes `dist/`; `npm run preview` serves the built output on port 4180.

---

## What the two libraries actually do

**Three.js — one canvas, one job.** The full-bleed violet panel on each page is a single full-screen quad running a fragment shader: a diagonal wash, three blobs drifting on slow mutually-prime orbits so the loop never announces itself, and per-pixel grain that kills the banding a wide violet gradient always shows on 8-bit displays. Above it, 160 gold pollen points rise and wrap. Scroll position feeds a `uScroll` uniform that deepens the wash as you descend.

**GSAP — every transition on the page.** The wordmark is split per letter and staggered up on load; the intro copy runs on a timeline; ScrollTrigger drives section reveals, sequenced rows, and a scrubbed parallax on the wordmark as the panel leaves. Timing, easing and reduced-motion behaviour are decided in one file so nothing drifts out of step.

### The capability gate

Three.js is about four fifths of the JavaScript here and serves one decorative panel, so it is behind a dynamic `import()` guarded by three questions — is there a canvas, does WebGL exist, and has the visitor asked for reduced motion? Any "no" and it never downloads.

| | initial | deferred |
|---|---|---|
| JS | 46.5 KB gz (GSAP + chrome) | 116 KB gz (Three.js) |
| CSS | 3.5 KB gz | — |

Underneath the canvas is a CSS gradient painting the same picture. That is the real background — the canvas fades in over it only once a WebGL context genuinely exists, so a failure is a still gradient, never a blank rectangle. The render loop also pauses whenever the panel scrolls out of view or the tab is hidden.

---

## Structure

```
index.html  approach.html  work.html      Six HTML entries; Vite builds each
about.html  contact.html   404.html       one separately

src/main.js         Boot order + the capability gate
src/ground.js       Three.js: shader ground, pollen, theme, loop
src/motion.js       GSAP: timelines, ScrollTrigger, chrome, contact form
src/styles/         The design system, 18 numbered sections
public/assets/      Motifs, icons, social card
```

---

## Design

Wattle gold `#E9B44C` on soft violet, set in Cormorant Garamond over Inter. The wordmark is the one loud element: WATL enormous, gold, cropped by the lower edge of its panel. Gold is only ever letterforms — never a background.

Light and dark both supported; the shader swaps its own palette when the theme changes. Full token table and rationale live in the sibling repo's design notes.

---

## Content status

Copy is structurally final but the positioning is illustrative — the fieldwork entries are engagement *shapes*, not real named clients, and `hello@wattle.technology` is a placeholder. The company facts (ADHD.ME, the team, ventures) live in the Next.js site, not here.

## Deployment

Nothing is configured. `npm run build` produces a static `dist/` that drops onto any host. `base: "./"` in `vite.config.js` means it also works from a sub-path such as GitHub Pages without changes.
