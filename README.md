# WATL / Technology Design

WATL is a technology design practice creating interfaces, systems, and experimental tools for futures that have not settled into form. Its homepage is an extreme-minimal field object: a procedural Three.js portrait of a complete hand-tied golden wattle bouquet (*Acacia pycnantha*) suspended inside a deterministic universe of warm light and faint, unresolved signals.

The ground behind it is warm dark earth, a contour field drawn in elevation, an ember low in the frame and grain over all of it — geological and cartographic vocabulary, borrowing nothing from Aboriginal visual language, which encodes particular Country and story and is not a free pattern library.

Orbiting the camera reveals spatial parallax. A nearly imperceptible celestial drift, soft twinkle, and sparse connections keep the surrounding field alive without competing with the botanical form. The object is the identity; everything else has been reduced to coordinates.

Mature heads are dense spherical pom-poms, as deep as they are wide. Complete five-part florets and five round anthers per floret are spread over the whole shell by mirrored golden-angle spirals stepped in equal area — even bands of cos(theta) rather than of radius, which is what fills the flanks of a head instead of piling its florets onto a disc. Every head begins collapsed into a compact olive bud and retains enough topology to unfold into that full mature form. Curved falcate phyllodes taper at both ends and carry five parallel-convergent longitudinal veins. Three.js `0.185.1` is vendored into `vendor/three/` rather than loaded from a CDN, so a fresh clone runs with no install step.

## Ventures

The ventures live in a compact vertical rail on the left, separate from the
contact action. The rail shows one full row and a glimpse of the next, scrolls
independently from the bouquet, and snaps each venture into place. A quiet
`01 / 02` position marker follows native trackpad, wheel, touch and keyboard
scrolling. Hover and focus use only a short horizontal acknowledgement so this
frequently used list stays restrained.

| Link | Goes to |
| --- | --- |
| Bay Health | <https://bayhealth.com.au/> |
| ADHDme | <https://www.adhdme.au/> |
| Contact us | `mailto:` — the address is set on the `.client--contact` link in `index.html` |

The contact link remains in the lower-right corner, outside the scroll region.
Below 620px the venture rail narrows but keeps its left-side vertical model.

To add one, copy an `<a class="client">` inside `nav.client-rail__group` in
`index.html`. Each glyph is its own `<span>` carrying a `--i` index, which is
what the wave staggers on, so the letters have to be split by hand — the link
keeps the real name in `aria-label`, and the glyph container is `aria-hidden`
so a screen reader never spells it out.

## Motion

The page composes itself rather than simply being there. The identity rises a
letter at a time, then the discipline, then the ground switch, then each link
in the rail — about 1.6 seconds end to end.

That timeline is deliberately **not** gated on the 3D scene. The interface is
text and should be readable immediately; waiting on a WebGL build would hold an
empty frame on a slow phone, and would hide the page entirely for the eight
seconds the no-module floor takes to fire. Only the canvas waits for
`.is-ready`.

Elsewhere:

- **The light behind the bouquet breathes** on a 19-second cycle, slow enough
  that you never catch it moving.
- **Hovering one name lets the others recede** to 42%, so the rail has a focus.
- **The swatches deal out** in sequence when the tray opens.
- **Changing ground dissolves rather than cuts.** Gradient stacks cannot
  interpolate, so the backdrop dips to 26% and the layers are swapped at the
  darkest frame — the bouquet stays lit throughout, so it reads as the light
  changing rather than the page redrawing.

Two implementation notes worth keeping:

Entrance animations use `animation-fill-mode: backwards`, not `both`. `both`
keeps the final keyframe applied at animation precedence for the life of the
page, which would outrank the hover-dim declaration and quietly kill it.
`backwards` holds the element hidden through its delay and then hands it back
to the cascade, where every resting value already lives.

The dissolve is a keyframe, not a transition. A transition would have to race
the timer that removes the class, and on a slow frame the dip either never
lands or reverses halfway.

`prefers-reduced-motion: reduce` collapses all of it — duration, delay, and
iteration count — and every animation is written so a single collapsed
iteration leaves the element exactly at rest.

## Interaction

Framer Motion's DOM build is vendored into `vendor/motion/` on the same terms
as Three.js — committed, not fetched — and drives a pointer layer in
`interactions.js`.

- **The links lean toward the cursor** as it passes and spring back when it
  goes. The lean falls off with distance: a full 18px under the cursor, nothing
  at the edge of reach.
- **The light behind the bouquet drifts the other way**, on the softest spring
  on the page. Fast parallax reads as a bug; slow parallax reads as depth.
- **Press gives back** — a small spring-loaded scale. This is the one thing a
  touchscreen keeps, since it is the only feedback a finger gets between
  tapping a link and the page changing.

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
sky and Wash change the drawing rather than its colour.

Night sky is what the site opens on. It is an absence rather than a picture of
a sky: the CSS takes the drawing away and the 3D scene fills what is left. It
is also the one ground that reaches into the scene — the sparse signal threads
between stars are right over drawn earth and wrong over a plain sky, so
`script.js` watches `data-ground` on the root and hides them for this one.

All seven stay dark on purpose: the wordmark, the client names and the field
copy are all set in light ink, so a pale ground would take their contrast with
it.

The tray closes on Escape, on a click outside it, and when focus leaves. The
stored key is `watl.ground.v2`; it was bumped when Night sky became the default
so the change reached people who already had a choice saved.

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
canvas can be read back. That is how `assets/wattle-bouquet-poster.png` is
made: load `?poster=1` at a square viewport, take `canvas.toDataURL()`, then
trim and centre on the botanical mass. The result is transparent on purpose —
no ground is baked into it, so it composites onto the live earth at any aspect
ratio. Regenerate it whenever the artwork changes, or the still shown to
visitors without WebGL will quietly disagree with the site.

`python tools/generate-ground.py` rebuilds the contour field behind the
bouquet.

## Explore the bouquet

- Drag to orbit; use the wheel or a pinch gesture to zoom.
- With a mouse or trackpad, sweep across the bouquet. A soft screen-space brush opens up to four nearby buds in 135ms offsets, then advances every 90ms while the pointer remains in a dense area. This makes local clusters bloom in a patchy wave instead of firing the whole bouquet at once.
- Click or tap a bud to open that head directly and permanently from olive bud to golden pom-pom.
- With the 3D stage focused, use the arrow keys to rotate, `+` / `-` to zoom, `Enter` or `Space` to open every remaining bud immediately, and `Home` to restore the authored view.

The page carries no visible controls. The bouquet is operated directly — by
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
only marks the selected head instead of washing the bouquet in yellow. The
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

When the final filament reaches its mature pose, a full-width plain black completion banner
appears over the bouquet with the line “Help your business bloom,” Stefan's
email, a meeting request, and a dismiss action. Add the real Calendly scheduling
page to the `data-calendly-url` attribute on `#bloom-finale-calendar` in
`index.html`; until that public URL is supplied, the second action uses a
pre-addressed meeting email rather than sending visitors to a guessed or broken
account.

## Accessibility and fallbacks

The scene has a keyboard-focusable wrapper, visible focus treatment, concise operating instructions, and a text description of the bouquet and its spatial field. A polite live region announces deliberate click, keyboard, and completion states without narrating every pointer-brush step. The completion banner is an inert, labelled dialog until the whole bouquet is open, exposes two ordinary links plus an explicit dismiss button, and does not steal focus from a pointer user. A `prefers-reduced-motion: reduce` preference disables autonomous bouquet and celestial motion, snaps each committed bud directly to its mature silhouette, and reveals the completion message without spatial movement. If WebGL is unavailable or scene setup fails, the interface presents an explanatory status and a still bouquet poster instead of an empty canvas.
