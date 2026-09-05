# WATL / Technology Design

WATL is a technology design studio for digital products, social media
marketing strategy and product design. Its homepage
is a procedural Golden Wattle branch that grows, buds and flowers as the page
is scrolled, inside a deterministic field of warm light and faint signals.

The branch is the identity, and it is the one bespoke asset on the site: a
seeded parametric L-system, interpreted by a bracketed 3D turtle, with an
eight-act bloom morph per flower head and a packed GPU pom-pom shell. Nothing
is loaded from a model file; the plant renders from rules.

## Stack

| Layer | What it does |
| --- | --- |
| React 19 + Vite | The document, the chrome and the sections |
| React Three Fiber + drei | Owns the renderer, camera and frame loop; the engine's scene graph is mounted as a primitive. drei renders a procedural light-former environment for image-based lighting and trades pixel ratio for frame rate with `PerformanceMonitor` |
| `@react-three/postprocessing` | One composer: depth of field (hero close-up), thresholded bloom, radial chromatic aberration, neutral tone mapping, SMAA |
| GSAP + ScrollTrigger + CustomEase + SplitText | The pinned arrival scrub, section reveals, camera poses, the ground dissolve |
| Lenis | Smoothed native scrolling, driven from the GSAP ticker so scrub and scroll share a frame |
| zustand | The page's shared state; the scene writes to it only on change |
| The engine (`src/scene/engine/`) | The botany, untouched from the original single-file site, minus its renderer |

`docs/REVAMP.md` is the art-direction contract: every number in the motion
system, the camera poses, and the post-processing settings, with the reasons.

## Run

Node 20 or newer.

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173`. Add `?tune=1` for the Leva tuning panel and the
r3f-perf panel; `?qa=1&qaGrowth=1` renders the mature branch deterministically
and exposes `window.__WATTLE_QA__`; `?poster=1` hides every interface layer;
`?quality=high|low` forces a profile; `?seed=<n>` grows a different branch.

```bash
npm run build      # type-check, then a production build into dist/
npm run preview    # serve dist/ on 4173
npm test           # botany regressions, engine regressions, motion-token sweep
npm run qa:smoke   # build, serve, and check the shell a crawler receives
npm run qa:capture # headless frames through the whole scroll, into qa/captures/
```

`qa:capture` drives the installed Chrome headlessly (through `playwright-core`,
no browser download) and writes a frame at each pin progress and each
section at desktop and phone sizes. That is the compare loop: look at the
frames, change a number in `src/motion/tokens.ts`, capture again.

## How the page moves

The canvas is fixed and full-bleed; the document scrolls over it.

**Arrival** is pinned for 420vh (340vh on a phone). One GSAP timeline, scrubbed
at 0.9 s, tweens a plain `scrub` record the scene reads each frame: growth
runs 0.2 → 1 across the first 52 % of the pin while the camera tracks the
rising tip; the bloom wave then opens the heads bottom-up, each head running
its eight acts over 18 % of the pin; the camera comes in to the densest raceme
with depth of field rising and falling inside the act, and settles to the
authored portrait by 90 %. The headline, the practice line and the bloom line
are choreographed on the same timeline, so type and branch never drift.

**Sections** take the camera when they enter — a tweened pose on the heavy
settle curve over 1.6 s — and hand it back when they leave. Practice rows
nudge the azimuth on hover; client rows warm the branch's selection light.

**Interaction stays on top.** A fine pointer sweeping the mature branch still
opens buds in a four-head brush; a click opens one; a drag orbits on a spring
that decays back to the authored view when the visitor scrolls on. A head's
rendered progress is the maximum of the scroll wave and its own interactive
animation, so a hovered bud stays open when the page scrolls back up.

**Every curve is a token.** `src/motion/tokens.ts` holds the four eases, the
durations, the springs, the scrub values, the hero bands and the camera poses.
`npm test` fails if a literal easing curve or raw scrub value appears anywhere
else in `src/`.

**Reduced motion** removes Lenis and the pin. The branch renders mature and
fully open, section poses are set instantly, the arrival is a 160 ms fade.

## Grounds

A small dot, top right. It names the current ground on approach and opens a
row of swatches on click. Night sky is the default and an absence: the CSS
takes the drawing away and the scene's stars fill it. The six optional
grounds — Earth, Ochre, Desert rose, Eucalypt, Dusk, Wash — are drawn from
four custom properties, so a ground is a new set of those and every gradient,
band and ember re-tints together. Changing ground dissolves: the backdrop dips
to 26 % on the strong ease-in-out and the palette swaps at the darkest frame.

There is no dot-painting ground, and that is a decision rather than an
omission. Aboriginal dot painting encodes particular Country and story and is
not a free pattern library; the honest version is a commission from a named
artist, credited beside their work, and the mechanism is ready for it.

## Performance model

The canvas renders on demand. A frame is requested only while something is
moving — the scroll, a tween, the pointer, the branch's own sway — and at
30 fps on the constrained profile, which also caps the pixel ratio at 1.12
and halves the pom-pom density. Bloom uploads touch only the typed-array
ranges of the heads that changed. The composer is thresholded at 1.0 in linear
light: only the flower layers, written un-tone-mapped above that, ever glow.
Fonts are self-hosted and subset; no request leaves the origin.

## Accessibility and fallbacks

The stage is a keyboard-focusable group with visible focus, operating
instructions, and a text description of the branch and its field. Arrow keys
orbit, plus and minus zoom, Enter or Space finishes growth and then opens
every remaining bud, Home restores the view. A polite live region announces
maturity, deliberate opens, and completion. If WebGL is unavailable or the
scene fails to start within eight seconds, a still of the mature branch is
shown with an explanation and a reload.

## Layout of the repository

```
index.html                 the shell: meta, JSON-LD, first-paint ground
src/main.tsx               fonts, styles, motion tokens → CSS, the app
src/App.tsx                Lenis, the fixed layers, the scrolling document
src/motion/                tokens, GSAP registration, the spring integrator, Lenis bridge
src/scene/                 Stage, WattleScene, CameraRig, Effects, Interaction, engine/
src/scene/botany/          the pure modules: L-system, growth curves, bloom motion
src/ui/                    Chrome, Arrival, Practice, Clients, Contact, Footer, meters
src/styles/                tokens, base, grounds, chrome, sections
tools/                     tests, smoke test, capture loop, probes
reference/                 the previous single-file site and the old bouquet export; never shipped
docs/REVAMP.md             the plan and the numbers
```

The production origin is `https://watl-three.vercel.app/`; `vercel.json`
serves the Vite build with immutable asset caching.
