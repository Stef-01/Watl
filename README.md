# WATL / Technology Design

WATL is a technology design practice creating interfaces, systems, and experimental tools for futures that have not settled into form. Its homepage is an extreme-minimal field object: a procedural living Golden Wattle branch growing inside a deterministic universe of warm light and faint, unresolved signals.

The site opens on a plain black starry night so the branch has immediate visual authority. Six optional grounds reinterpret the same space through restrained earth, mineral, dusk, eucalypt and wash atmospheres. Their vocabulary stays geological, botanical and cartographic, borrowing nothing from Aboriginal visual language, which encodes particular Country and story and is not a free pattern library.

Orbiting the camera reveals spatial parallax. A nearly imperceptible celestial drift, soft twinkle, and sparse connections keep the surrounding field alive without competing with the botanical form. The object is the identity; everything else has been reduced to coordinates.

The object has one tapered, mostly upright axis with a restrained diagonal lean and thinner secondary twigs emerging in developmental order. Long narrow lanceolate phyllodes alternate around those twigs. Mature axils carry drooping racemes of three to six globular heads on fine radial pedicels. Each head blooms from an olive bead-cluster into a compact yellow pom-pom: five-part florets remain recessed beneath representative stamen bundles, a dense equal-area particle shell, and a fibrous procedural undercoat. Three.js `0.185.1` is vendored into `vendor/three/` rather than loaded from a CDN, so a fresh clone runs with no install step.

## Clients

The clients live in a compact vertical rail on the left, separate from the
contact action. The rail shows almost two rows at once, scrolls
independently from the tree, and snaps each client into place. A quiet
`01 / 02` position marker follows native trackpad, wheel, touch and keyboard
scrolling. Hover and focus use only a short horizontal acknowledgement so this
frequently used list stays restrained. Each row uses the same authored
single-stroke arrow and grows a one-pixel gold baseline from its origin; no
font glyph is asked to impersonate an icon.

| Link | Goes to |
| --- | --- |
| Bay Health | <https://bayhealth.com.au/> |
| ADHDme | <https://www.adhdme.au/> |
| Contact us | `mailto:` — the address is set on the `.client--contact` link in `index.html` |

The contact link remains in the lower-right corner, outside the scroll region.
Below 620px the client rail narrows but keeps its left-side vertical model.

To add one, copy an `<a class="client">` inside `nav.client-rail__group` in
`index.html`. Each glyph is its own `<span>` carrying a `--i` index, which is
what the wave staggers on, so the letters have to be split by hand — the link
keeps the real name in `aria-label`, and the glyph container is `aria-hidden`
so a screen reader never spells it out.

## Search and sharing

The production origin is `https://watl-three.vercel.app/`. The document keeps
its canonical URL, title, description, Open Graph metadata, Twitter card and
JSON-LD graph aligned to that one origin. The graph describes the site, WATL,
Stefan, the page and its primary Golden Wattle image as linked entities instead
of five unrelated schema fragments. The visible hero also states the actual
practice areas, so crawlers and people receive the same proposition.

`robots.txt` allows the public experience and advertises the root
`sitemap.xml`. The sitemap contains only the canonical homepage because query
parameters such as `qa`, `quality`, `motion`, and `poster` are render modes of
the same experience, not indexable pages. Update the sitemap's `<lastmod>` and
the WebPage `dateModified` together whenever the public content changes
substantially. The 1440 × 900 WebP fallback doubles as the social card, keeping
link previews fast without adding another large asset. A `keywords` meta tag is
deliberately omitted; the title, visible copy, links, semantics and structured
data carry the page's meaning.

## Motion

The page composes itself rather than simply being there. The identity rises a
letter at a time, then the discipline, then the ground switch, then each link
and the lifecycle meter — about 1.55 seconds end to end. Every entrance uses
the shared strong ease-out and hands its resting state back to the cascade.

That timeline is deliberately **not** gated on the 3D scene. The interface is
text and should be readable immediately; waiting on a WebGL build would hold an
empty frame on a slow phone, and would hide the page entirely for the eight
seconds the no-module floor takes to fire. Only the canvas waits for
`.is-ready`.

Elsewhere:

- **The branch extends from a young shoot to maturity** over 8.4 seconds on first load.
- **The light behind the tree breathes** on a 19-second cycle, slow enough
  that you never catch it moving.
- **Hovering one name lets the others recede** to 42%, so the rail has a focus.
- **The ground tray opens and closes from its trigger** as one interruptible
  180 ms transition. It can reverse midway without restarting a keyframe;
  keyboard-triggered opens and closes are immediate.
- **Changing ground dissolves rather than cuts.** Gradient stacks cannot
  interpolate, so the backdrop dips to 26% and the layers are swapped at the
  darkest frame — the tree stays lit throughout, so it reads as the light
  changing rather than the page redrawing. The dissolve is cancellable and a
  new selection retargets from the backdrop's live opacity, avoiding flashes
  under rapid input.
- **Optional grounds carry slow environmental motion.** A high weather field,
  low horizon reflection and contour plane drift on separate 34–56 second
  transform-only cycles. Night removes and pauses them, preserving the simple
  black star field as the default.
- **The lifecycle meter moves through the biological states.** Its fill uses
  the exact tree-growth progress, marks the 72% bud threshold, then resets as
  the phase changes from growth to blooming and fills from the aggregate
  flower-head choreography rather than jumping only when a head finishes. Its
  transform is written directly without a trailing CSS transition, so the line
  remains phase-accurate even while the render loop is advancing every frame.
- **Continuous and direct motion use separate physics.** The indeterminate
  loader travels at a constant linear velocity, while press feedback shares a
  fast 120 ms ease-out token; neither inherits the slower narrative timing used
  for tree growth or the rare completion reveal.

Two implementation notes worth keeping:

Entrance animations use `animation-fill-mode: backwards`, not `both`. `both`
keeps the final keyframe applied at animation precedence for the life of the
page, which would outrank the hover-dim declaration and quietly kill it.
`backwards` holds the element hidden through its delay and then hands it back
to the cascade, where every resting value already lives.

The ground dissolve uses the Web Animations API rather than a restarted CSS
keyframe. This lets a new selection cancel the in-flight motion and begin from
the exact rendered opacity while the palette swap remains aligned to the
darkest frame.

`prefers-reduced-motion: reduce` removes position, scale, stagger, ambient
loops and botanical drift while preserving short opacity and colour feedback.
The first interface arrival becomes one 160 ms fade, optional grounds remain
visually rich but still, and the ground swap skips its timed dissolve rather
than racing a shortened animation.

## Interaction

Framer Motion's DOM build is vendored into `vendor/motion/` on the same terms
as Three.js — committed, not fetched — and drives a pointer layer in
`interactions.js`. The 137 kB runtime is requested lazily only when a fine
pointer can use the springs; touch and reduced-motion visitors retain the CSS
interaction floor without downloading it.

- **The separate contact action leans toward the cursor** and springs back;
  client rows deliberately keep only their restrained CSS acknowledgement.
- **The light and optional atmosphere separate under the pointer**, on one
  shared soft spring loop. The weather field, horizon and tree light move at
  different amplitudes and opposing depths; Night keeps only the light and
  star field visible.
- **Press gives back** — a small spring-loaded scale on fine-pointer devices;
  touch keeps the immediate CSS active state without paying for the spring
  runtime.
- **The bloom brush is visible on fine pointers.** A hairline ring matches the
  actual 20vmin activation diameter, follows the cursor directly, and tightens
  only when the raycaster finds unopened heads. It is immediate feedback, not
  a trailing cursor effect, and it never appears on touch or reduced-motion
  devices.
- **Lifecycle guidance follows the input method.** Fine pointers are invited
  to move across buds; coarse pointers are told to tap. Plugging in or removing
  a pointer updates the visible guidance without rebuilding the scene.
- **The interface yields during direct manipulation.** Once a canvas press
  crosses the real drag threshold, the wordmark, clients, ground control and
  lifecycle meter recede to 34% while the bloom brush disappears. Releasing,
  cancelling, losing pointer capture or leaving the window restores the chrome;
  ordinary bud clicks never trigger the effect. Pointer-originated canvas focus
  also suppresses the viewport ring, while the next keyboard event restores
  visible focus.
- **The client rail reports intent as well as scroll position.** Its counter
  and restrained gold row marker follow hover and keyboard focus immediately,
  then return to the row nearest the native scroll origin.

Three constraints hold this layer honest:

**It is a layer, never a replacement.** The hover wave, the entrance, the
dimming and the dissolve all live in `styles.css`. If `interactions.js` or the
library fails to load, the page loses the springs and nothing else — the two
scripts are deferred separately from the scene module so no one failure takes
another down.

**Springs write to `translate` and `scale`, never `transform`.** The CSS owns
`transform` on every element this touches — `rise` on the links, `breathe` on
the light — and a running animation outranks an inline style, so sharing that
property would mean the JS silently losing. The independent properties compose
with it instead.

**Layout is read once a frame, not once a pointer event.** A pointer fires far
more often than the screen refreshes, and reading a rect after writing a style
forces layout each time. The handler records where the cursor is; a
`requestAnimationFrame` callback does the measuring.

A pointer that cannot hover gets no magnetism or parallax, and
`prefers-reduced-motion: reduce` gets none of the layer at all. Both are
watched rather than sampled once, because either can change while the page is
open.

## Grounds

A small dot sits top right. It names the current ground when you approach it,
and opens a row of swatches on click — seven is too many to cycle through.

| Ground | What it is |
| --- | --- |
| **Earth** | the authored one: warm dark earth, strata, contour field, ember |
| **Ochre** | the same drawing in red-earth colour |
| **Desert rose** | the same drawing in dusk pink |
| **Eucalypt** | the same drawing in deep leaf green |
| **Dusk** | the same drawing in deep violet |
| **Night sky** | the default: everything drawn comes off — strata, datum line, ember, contours, and the scene's signal threads — leaving black, a whisper of vignette, and stars |
| **Wash** | the geology comes off and soft overlapping blooms take its place — an abstract painting ground, nothing quoted |

The backdrop is drawn entirely from four custom properties — `--night`,
`--strata`, `--ember`, `--dust` — so five of the seven grounds are just a new
set of those, and every gradient, band and ember re-tints together. Only Night
sky and Wash change the base drawing rather than its colour. The six optional
worlds also feed two broad composited atmosphere planes. Dusk bends its upper
plane into an auroral arc; Wash turns it into drifting pigment pools; the
geological grounds move their own mineral light through the contour field.

Night sky is what the site opens on. It is an absence rather than a picture of
a sky: the CSS takes the drawing away and the 3D scene fills what is left. It
is also the one ground that reaches into the scene — the sparse signal threads
between stars are right over drawn earth and wrong over a plain sky, so
`script.js` watches `data-ground` on the root and hides them for this one.
The `<html>` element is authored with `data-ground="night"`, so even the first
paint before JavaScript runs is the simple black sky rather than a flash of an
optional ground.

All seven stay dark on purpose: the wordmark, the client names and the field
copy are all set in light ink, so a pale ground would take their contrast with
it.

The tray closes on Escape, on a click outside it, and when focus leaves. Its
horizontal swatches support Left/Right wrapping plus Home/End navigation, and
the adjacent name previews whichever swatch currently has pointer or keyboard
focus. On small screens they move into a compact black four-column panel below
the trigger rather than crossing the wordmark. The stored key is
`watl.ground.v2`; it was bumped when Night sky became the default so the change
reached people who already had a choice saved.

The switch is wired inline in `index.html`, not in `script.js`, so it still
works if the scene module never loads. The choice is remembered in
`localStorage` under `watl.ground`, and every read and write is wrapped —
blocked site data changes nothing but whether the choice survives a reload.

### On a dot-painting ground

There isn't one, and that is a decision rather than an omission.

Aboriginal dot painting is not a style in the public domain. It encodes
particular Country and particular story, and which designs a person may paint
is governed by customary law within the communities they belong to. A
generated imitation of it — which is the only thing code in this repository
could produce — would be the exact borrowing the ground's own note in
`styles.css` was written to refuse, and an advisor's encouragement does not
transfer a right that is not theirs alone to give.

The honest version is a commission: a named artist, licensed, paid, and
credited on the page beside their work. That is a good thing for this site to
do, and the mechanism is ready for it — a commissioned ground is one more
entry in `GROUNDS` in `index.html` and one rule in `styles.css` that paints
the artwork, with the artist's name shown next to it. Bringing the artwork is
the part that has to happen away from the keyboard.

## Run locally

Node.js 18 or newer is recommended. There are no runtime dependencies to
fetch — Three.js is committed under `vendor/three/`.

```bash
npm run dev
```

Open `http://127.0.0.1:4173`. Keep the local server running instead of opening `index.html` directly, because the viewer uses JavaScript modules. This is a development-only server bound to the loopback interface; set `PORT` to an integer from 1 through 65535 to use another local port.

Run `npm run check` to syntax-check the server, scene, choreography module, and
test files. Run `npm test` for the dense bloom-math regressions plus the HTTP,
accessibility, interaction-contract, and asset smoke tests.

`?poster=1` hides every interface layer and, because it is the mode the still
is exported from, also asks the renderer to preserve its drawing buffer so the
canvas can be read back. The WebGL-failure still lives at
`assets/wattle-golden-poster.webp`; it is captured from the same mature procedural
branch and therefore preserves the narrow phyllodes, strung spherical flowers, dark
ground, and right-weighted composition when WebGL is unavailable.

`python tools/generate-ground.py` rebuilds the contour field behind the tree.

## Performance model

The scene is event-driven: it stops requesting frames while it is off-screen,
hidden, motion-reduced, or visually settled. High quality remains uncapped for
smooth desktop bloom choreography. The constrained-device profile keeps the
same time-based stages at a stable 30 fps and a 1.12 DPR ceiling, avoiding
thermal load without slowing the botanical sequence.

Bloom geometry is grouped by flower head. An interaction updates only the
affected typed-array ranges; Three.js merges adjacent ranges before sending
them to WebGL, so hovering four heads no longer re-uploads the other 68. Each
head's pointer-facing site delays are cached for its activation, and the hot
filament path writes directly into its typed arrays without per-frame arrays.
QA mode exposes the scheduled transfer as `data-qa-bloom-upload-*` and in the
snapshot's `frameMetrics.bloomUpload` object.

The dense pom-pom fuzz has its own packed render path. Its closed and open
positions, sizes, and colour shades stay in static GPU attributes; the CPU now
updates one bloom-progress value while the vertex shader performs the morph
and uses that same gated value for visibility. That reduces dynamic fuzz
transfer from eight floats to one per particle (87.5%) without removing a
single point. A pollen-only choreography
sampler remains numerically identical to the full stage model while skipping
the six stage curves this late layer does not use, and the temporary source
and origin vectors are released after packing. QA exposes the packed count and
both per-point transfer costs in `snapshot().lod`.

The WebGL failure poster is a 28 kB WebP and has no eager `src`. It is requested
only if scene initialization fails. The optional Motion layer is likewise
lazy on pointer capability, keeping the initial network focused on the scene.
Animated grounds add no images, timers, or dependencies: two reusable gradient
elements stay on compositor transforms, share the existing pointer rAF, pause
when the document is hidden, and become static under reduced motion. Night
keeps both layers transparent and paused.
The local server keeps HTML uncached but gives scripts, styles, vendor modules,
and assets ETag revalidation, so a refresh can return `304` instead of sending
the two-megabyte Three.js runtime again.

## Branch growth and flowering

The first-load growth is an 8.4-second explanatory sequence driven by a seeded,
parametric stochastic L-system. Parallel apex rewriting establishes the branch
hierarchy; a bracketed 3D turtle interprets the modules; golden-angle roll
distributes lateral axes around the primary branch; and every segment and phyllode carries
its own developmental window. A visible shoot rises from its lower cut end with a slight lean,
parent axes precede child twigs, lanceolate phyllodes unfurl locally, and axillary flower racemes begin only at
72% maturity. Hover and click bloom picking remain
locked until growth reaches 100%, so flowers cannot exist on an immature tree.
The stage math lives in `tree-growth.js`; the grammar and turtle interpreter
live in `wattle-lsystem.js`. They are swept by `npm run test:tree-growth` and
`npm run test:wattle-lsystem`. `?qa=1&qaGrowth=0.68` freezes any normalized growth
checkpoint for deterministic inspection. Reduced-motion, poster, and ordinary
QA modes render the mature branch immediately.

The architecture is informed by Prusinkiewicz and Lindenmayer's
[The Algorithmic Beauty of Plants](https://algorithmicbotany.org/papers/#abop),
especially its treatment of parallel rewriting, bracketed turtle state,
parametric tree models, phyllotaxis, and interpolation between developmental
states. The separation between grammar, seeded parameter generation, and
turtle interpretation also draws on SimonDev's MIT-licensed
[LSystems_JavaScript](https://github.com/simondevyoutube/LSystems_JavaScript)
demonstration, adapted here from 2D canvas drawing to a testable 3D botanical
architecture with per-module growth windows.

## Explore the branch

- Drag to orbit; use the wheel or a pinch gesture to explore the expanded close-detail-to-whole-branch zoom range.
- With a mouse or trackpad, sweep across the mature branch. A soft screen-space brush opens up to four nearby buds in 135ms offsets, then advances every 90ms while the pointer remains in a dense area. This makes local clusters bloom in a patchy wave instead of firing the whole branch at once.
- Click or tap a bud to open that head directly and permanently from olive bud to golden pom-pom.
- With the 3D stage focused, use the arrow keys to rotate, `+` / `-` to zoom, `Enter` or `Space` to finish growth first and then open every remaining bud, and `Home` to restore the authored view.

The page carries no visible controls. The branch is operated directly — by
pointer, by touch, and by keyboard — and its sway is fixed at the authored
value (`AUTHORED_DRIFT` in `script.js`). `assets/golden-wattle-bouquet.glb` is
still in the repo as a standalone copy of the object, but nothing on the page
links to it.

Blooming is a persistent botanical state change rather than a scale pulse.
The closed head is made from independent five-lobed olive capsules; the mature
flower is a separate structure of persistent golden corolla cups, five-part
petals, attached stamens, a longer outer stamen halo, anthers, and pollen. The
old visible receptacle sphere is retained only as an invisible interaction
proxy, so it cannot survive underneath the flower as a green ghost silhouette.
Bud pores follow their own shrinking capsules and anthers follow the live ends
of their filaments, eliminating detached dots during the handoff.

The 2.7-second morph has eight explicit acts: wake, ripen, loosen, petal open,
inner stamen extension, outer stamen extension, pollen, and settle. A
surface-distance field starts at the pointer-facing side and offsets floret
sites by up to 22% of the master timeline, producing a coherent wave rather
than a simultaneous radial pop. Golden cups persist as capsules retire, so the
visible envelope grows monotonically through the transfer of ownership. A
strong ease-in-out curve connects the main acts, while a very low local light
only marks the selected head instead of washing the tree in yellow. The
bloom brush is limited to fine pointers, a drag cancels it so an orbit never
fires a flower accidentally, and an opened flower stays open. Keyboard
activation commits the remaining buds without motion.

For deterministic visual QA, add `?qa=1&qaTimeline=0.56&qaIsolate=1` to freeze
the hero head at an exact normalized checkpoint. `qaView=face`, `profile`,
`oblique`, or `rear` selects the inspection angle; `qaBloom=<index>` selects a
specific head. The stage exposes the measured envelope, component visibility,
surface ownership, dormant-part visibility, and anther-to-filament gap as
`data-qa-morph-*` attributes. The shared `bloom-motion.js` module is swept at
10,001 samples across multiple site delays by `npm run test:bloom-motion`.
Use `?qa=1&qaGrowth=1&qaFinale=animate` to play the completion reveal without
manually opening every head.

When the final filament reaches its mature pose, a full-width plain black completion banner
appears over the tree with the line “Help your business bloom,” Stefan's
email, a meeting request, and a dismiss action. The band opens from its centre
edge over 480 ms while the content makes one delayed 420 ms lift; both paths
retarget cleanly when dismissed. Keyboard activation and reduced motion use the
same final composition instantly. Add the real Calendly scheduling page to the
`data-calendly-url` attribute on `#bloom-finale-calendar` in `index.html`; until
that public URL is supplied, the second action uses a pre-addressed meeting email
rather than sending visitors to a guessed or broken account.

## Accessibility and fallbacks

The scene has a keyboard-focusable wrapper, visible focus treatment, concise operating instructions, and a text description of the tree and its spatial field. A polite live region announces maturity, deliberate click, keyboard, and completion states without narrating every pointer-brush step. The completion banner is an inert, labelled dialog until the whole tree is open, exposes two ordinary links plus an explicit dismiss button, and does not steal focus from a pointer user; keyboard completion moves focus into the dialog and returns it visibly to the scene. Pointer dismissal returns focus without painting a keyboard ring. A `prefers-reduced-motion: reduce` preference skips spatial tree growth, disables autonomous tree and celestial motion, snaps each committed bud directly to its mature silhouette, and reveals the completion message without spatial movement. If WebGL is unavailable or scene setup fails, the interface presents an explanatory status and a still mature-tree poster instead of an empty canvas.
