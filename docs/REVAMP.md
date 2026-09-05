# WATL revamp — R3F + drei + postprocessing + GSAP ScrollTrigger + Lenis

This document is the art-direction and motion contract for the rebuild. Every
number here is the number in the code; when a value is retuned by eye it is
changed here first, then in `src/motion/tokens.ts`.

## 1. What is being kept, what is being replaced

| Kept (the bespoke asset) | Replaced |
| --- | --- |
| The seeded L-system Golden Wattle branch (`wattle-lsystem.js`, `tree-growth.js`, `bloom-motion.js`, `flower-scale.js`) and every geometry, material, shader, and typed-array upload path from `script.js` | Vanilla renderer, `OrbitControls`, hand-rolled rAF loop → React Three Fiber |
| The eight-act 2.7 s bloom morph, the 72 % bud threshold, the 8.4 s growth curves | Time-driven growth on load → **scroll-driven growth and bloom** via GSAP ScrollTrigger scrub |
| The seven CSS grounds (strata / contours / ember / grain) and their dissolve rule | Web Animations dissolve → GSAP timeline through the shared tokens |
| Accessibility contract: keyboard orbit, live region, reduced motion, poster fallback | Vendored Framer Motion springs → a 40-line spring integrator on the GSAP ticker |
| Search identity: title, description, OG/Twitter, JSON-LD graph, robots, sitemap | Vendored Three.js → npm `three@0.185.1`, bundled by Vite |
| Lifecycle meter, ground switch, bloom brush cursor | Client rail (tiny scroll box) → a real Clients section |
| Node regression tests for bloom math, growth, L-system | HTTP smoke test → smoke test against the Vite build |

The glb in `assets/` is a Three.js export of an earlier bouquet (1.77 M
vertices, 26 MB). It is not the hero asset and is moved out of the public
folder so it never ships.

## 2. Page architecture

The canvas is fixed and full-bleed. The document scrolls over it. Lenis owns
the scroll; ScrollTrigger reads Lenis; one master timeline drives the branch.

```
fixed   Chrome         wordmark · nav (Practice / Clients / Contact) · ground dot
fixed   Cultivation    lifecycle meter, bottom-left
fixed   Scroll cue     bottom-right, gone after 4 % scroll
fixed   <Canvas>       branch, star field, effects — z-index 0, alpha over CSS ground

flow    #arrival       100vh, pinned for 420vh (340vh < 720px)
flow    #practice      ≥ 100vh   three practice rows
flow    #clients       ≥ 80vh    two client rows
flow    #contact       ≥ 100vh   "Help your business bloom."
flow    footer         compact
```

Lenis: `lerp 0.085`, `wheelMultiplier 1`, `touchMultiplier 1.35`,
`smoothWheel true`, `syncTouch false`. Reduced motion: Lenis is not created,
the pin is removed, the branch renders mature and fully open, every camera
move is instant.

## 3. Motion tokens (`src/motion/tokens.ts`)

Every GSAP call and every CSS transition reads these. No literal ease strings
anywhere else; the smoke test greps for it.

```
EASE.out      CustomEase  M0,0 C0.23,1 0.32,1 1,1      the site's strong ease-out (kept)
EASE.inOut    CustomEase  M0,0 C0.77,0 0.175,1 1,1     the site's strong ease-in-out (kept)
EASE.settle   CustomEase  M0,0 C0.16,1 0.30,1 1,1      heavy things: camera, section titles
EASE.lift     CustomEase  M0,0 C0.34,1.42 0.64,1 1,1   light things: labels, arrows (overshoot)
EASE.expo     expo.out                                  reveals that should feel instant then land

DUR.press 0.12  DUR.fast 0.16  DUR.ui 0.22  DUR.reveal 0.68  DUR.title 1.1
DUR.camera 1.6  DUR.bloom 2.7 (BLOOM_DURATION_MS)  DUR.dissolve 0.5

SCRUB.hero 0.9  SCRUB.section 0.6
STAGGER.letters 0.056  STAGGER.lines 0.08  STAGGER.rows 0.08  STAGGER.heads 0.135

SPRING.magnet { stiffness 260, damping 24, mass 0.9 }   contact link, ground dot
SPRING.drift  { stiffness 42,  damping 22, mass 1.4 }   pointer parallax on light / atmosphere
SPRING.orbit  { stiffness 38,  damping 14, mass 1.6 }   user drag offset on the camera rig
```

Mass rule: anything heavier than a label uses `EASE.settle` or a spring with
mass ≥ 1.4 and a duration ≥ 1.1 s; anything lighter uses `EASE.lift` or
`EASE.out` at ≤ 0.68 s.

## 4. The hero scrub (pin 420vh, `scrub: SCRUB.hero`)

`t` is pin progress 0 → 1. One GSAP timeline tweens a plain object
`{ growth, bloom, dolly, azimuth, elevation, targetLift, focus, bokeh }`;
`useFrame` reads the object.

| t | Branch | Camera | Type |
| --- | --- | --- | --- |
| load | growth 0 → 0.20 over 1.4 s `EASE.out`, started by the scene the moment it is ready; canvas opacity 0 → 1 over 0.9 s | authored portrait × 1.34 distance | wordmark letters rise (0.68 s, stagger 0.056, delay 0.12); headline lines rise through a mask (1.1 s, stagger 0.08, `EASE.settle`, delay 0.35); scroll cue at 1.6 s |
| 0.00 – 0.52 | growth 0.20 → 1.00 (linear in t; the stage curves in `tree-growth.js` do the easing) | distance 1.34× → 1.06× on `EASE.inOut`; target.y tracks the growing tip: `bounds.min.y + 0.22 h` → authored centre | 0.16 – 0.32: headline exits (y −18 %, opacity 0); 0.34 – 0.48: practice line enters |
| 0.52 – 0.90 | bloom wave in t-space: heads ranked by `0.62 · height + 0.38 · birth`, head *i* starts at `0.52 + 0.20 · rank` and runs 0.18 of t through the eight acts; the wave scrub is t itself | 0.55 – 0.90: distance → 0.62×, azimuth 24° → 40°, elevation 4.5° → 9°, offset → 0.20, target → densest raceme centroid; DoF focus follows target, bokeh 0 → 2.2 over 0.60 – 0.80 | 0.58 – 0.72: "Systems that grow into form." rises |
| 0.90 – 1.00 | settle | distance → 1.06×, azimuth → 30°, bokeh → 0 | text exits, pin releases |

Interactive bloom stays on top: a head's rendered progress is
`max(scroll progress, hover/click progress)`. The hover brush (fine pointers
only, 4 heads per 90 ms step, 135 ms head stagger, 20 vmin ring) is armed as
soon as growth reaches 1.

## 5. Section camera poses (`DUR.camera`, `EASE.settle`, `overwrite: "auto"`)

Poses are spherical offsets from the authored portrait. `offset` is the
composition offset as a fraction of projected width (positive pushes the
branch right).

| Section | distance | azimuth | elevation | offset | notes |
| --- | --- | --- | --- | --- | --- |
| arrival end | 1.06 | 30° | 4.5° | 0.38 | |
| practice | 1.10 | 24° | 4.5° | 0.42 | row hover nudges azimuth to 24 / 38 / 52° over 1.2 s |
| clients | 0.92 | 46° | 8° | 0.44 | row hover: selection light 0 → 0.18 in 0.4 s |
| contact | 1.25 | 18° | 2° | 0.30 | bloom intensity 0.42 → 0.62; the lifecycle meter, the arrival's instrument, is hidden in every section |

Section text keeps to the left six columns with its rules ending where the
text ends; the branch composes into the right six.

Portrait viewports (< 720 px) use offset 0.08 everywhere and the text sits on
a bottom scrim.

## 6. Post-processing (one `EffectComposer`, high profile: MSAA 4; low: 0)

Order: `DepthOfField` (high profile, hero close-up only) → `Bloom` →
`ChromaticAberration` → `ToneMapping(NEUTRAL)` → `SMAA`.

```
Bloom       mipmapBlur, luminanceThreshold 1.0, luminanceSmoothing 0.12,
            intensity 0.42 (0.50 in the close-up, 0.62 in #contact), radius
            0.62, levels 6. Only the flower layers exceed the threshold: the
            pom-pom mass, fuzz and anther sprites carry an emissive gain of
            1.32 in linear light; petals and cups get 0.20 and 0.12 of it as
            emissive intensity. 1.7 blew the cores out to white.
CA          offset (0.0008, 0.0011), radialModulation, modulationOffset 0.40
DoF         focalLength 0.02, bokehScale 0 → 2.2 (scrubbed), focus at the
            active raceme; disabled outside 0.55 ≤ t ≤ 0.95 and on low profile
Vignette / grain / strata stay in CSS behind the transparent canvas.
```

Renderer: `NoToneMapping` on the renderer (the composer tone-maps), exposure
1.1, `SRGBColorSpace`, `dpr` clamped to `[1, 1.4]` high / `[1, 1.12]` low,
`frameloop="demand"` with a ticker that invalidates only while something is
moving (scroll, tween, pointer, autonomous sway) and at 30 fps on the low
profile.

## 7. Type and layout

- Display: Instrument Serif (self-hosted via `@fontsource/instrument-serif`),
  400 and italic. Headline `clamp(4rem, 11vw, 12rem)`, line-height 0.9,
  tracking −0.02em. Section titles `clamp(2.4rem, 6vw, 5.6rem)`.
- Mono: Geist Mono variable (self-hosted). Labels 0.68rem / 0.14em uppercase,
  meters and indices tabular.
- Grid: 12 columns, gutter 1.5rem, page padding `clamp(1.25rem, 3vw, 3rem)`.
  Text lives in columns 1–5; the branch composes into 6–12.
- Ink `#f2f0e8`, gold `#b59a4d`, night `#090909`; the seven ground palettes
  are unchanged.

## 8. Instrument before polish

`?tune=1` (or dev) mounts Leva with every value from sections 4–6 and
`r3f-perf`. Values are copied back into `tokens.ts` by hand; nothing reads
Leva in production.

## 9. Capture loop

`npm run qa:capture` drives the installed Chrome headlessly at 1440×900 and
390×844, writing frames at pin progress 0 / 0.12 / 0.30 / 0.52 / 0.70 / 0.85 /
1 and at each section into `qa/captures/<tag>/`. Every number above was
changed at least once after looking at those frames.

## 10. Lessons the frames taught

- React StrictMode double-invokes memo initialisers and effect cleanups. The
  engine is a document-lifetime singleton, so creation is idempotent and
  nothing disposes it on cleanup.
- `useGSAP` does not revert on dependency change unless `revertOnUpdate` is
  set. Without it the arrival pinned twice and every section sat 420vh late.
- An element GSAP animates must not carry a CSS transition on the same
  property. A reverted `from` tween reads the mid-transition value as its end
  state; hover dims and exit fades live on child elements instead.
- An instanced mesh with morph attributes and no instances must stay
  invisible, or three.js throws mid-frame and every later draw call is lost.
- The bloom wave and the camera acts share one t-space; scrubbing the wave
  over half the pin compressed it into the last quarter.
