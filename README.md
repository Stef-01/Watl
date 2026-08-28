# WATL / Technology Design

WATL is a technology design practice creating interfaces, systems, and experimental tools for futures that have not settled into form. Its homepage is an extreme-minimal field object: a procedural Three.js portrait of a complete hand-tied golden wattle bouquet (*Acacia pycnantha*) suspended inside a deterministic universe of warm light and faint, unresolved signals.

The ground behind it is warm dark earth, a contour field drawn in elevation, an ember low in the frame and grain over all of it — geological and cartographic vocabulary, borrowing nothing from Aboriginal visual language, which encodes particular Country and story and is not a free pattern library.

Orbiting the camera reveals spatial parallax. A nearly imperceptible celestial drift, soft twinkle, and sparse connections keep the surrounding field alive without competing with the botanical form. The object is the identity; everything else has been reduced to coordinates.

Mature heads are dense spherical pom-poms, as deep as they are wide. Complete five-part florets and five round anthers per floret are spread over the whole shell by mirrored golden-angle spirals stepped in equal area — even bands of cos(theta) rather than of radius, which is what fills the flanks of a head instead of piling its florets onto a disc. Compact young buds retain their round form. Curved falcate phyllodes taper at both ends and carry five parallel-convergent longitudinal veins. Three.js `0.185.1` is vendored into `vendor/three/` rather than loaded from a CDN, so a fresh clone runs with no install step.

## Clients

The clients run along the foot of the screen. Hovering or focusing a name
lifts it glyph by glyph in a staggered wave, draws a gold hairline under it
and nudges the arrow; the stagger runs on exit too, so the word settles back
the way it rose. It is CSS on static spans, so it works even if `script.js`
never loads, and `prefers-reduced-motion: reduce` stops it entirely.

| Link | Goes to |
| --- | --- |
| Bay Health | <https://bayhealth.com.au/> |
| ADHDme | <https://www.adhdme.au/> |
| Contact us | `mailto:` — the address is set on the `.client--contact` link in `index.html` |

Clients sit together at the left of the rail; the contact link holds the right
corner on its own, and keeps it when the rail wraps.

To add one, copy an `<a class="client">` inside `nav.client-rail` in
`index.html`. Each glyph is its own `<span>` carrying a `--i` index, which is
what the wave staggers on, so the letters have to be split by hand — the link
keeps the real name in `aria-label`, and the glyph container is `aria-hidden`
so a screen reader never spells it out.

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
| **Night sky** | strata and contours come off, so the star field the 3D scene already renders has the frame to itself |
| **Wash** | the geology comes off and soft overlapping blooms take its place — an abstract painting ground, nothing quoted |

The backdrop is drawn entirely from four custom properties — `--night`,
`--strata`, `--ember`, `--dust` — so five of the seven grounds are just a new
set of those, and every gradient, band and ember re-tints together. Only Night
sky and Wash change the drawing rather than its colour.

All seven stay dark on purpose: the wordmark, the client names and the field
copy are all set in light ink, so a pale ground would take their contrast with
it.

The tray closes on Escape, on a click outside it, and when focus leaves.

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

Run `npm run check` to syntax-check both the server and scene code.

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
- Click or tap a flower to brighten that bloom.
- With the 3D stage focused, use the arrow keys to rotate, `+` / `-` to zoom, `Enter` to trigger a whole-bouquet pollen pulse, and `Home` to restore the authored view.

The page carries no visible controls. The bouquet is operated directly — by
pointer, by touch, and by keyboard — and its sway is fixed at the authored
value (`AUTHORED_DRIFT` in `script.js`). `assets/golden-wattle-bouquet.glb` is
still in the repo as a standalone copy of the object, but nothing on the page
links to it.

## Accessibility and fallbacks

The scene has a keyboard-focusable wrapper, visible focus treatment, concise operating instructions, and a text description of the bouquet and its spatial field. A `prefers-reduced-motion: reduce` preference disables autonomous bouquet and celestial motion while preserving direct pointer and keyboard controls. If WebGL is unavailable or scene setup fails, the interface presents an explanatory status and a still bouquet poster instead of an empty canvas.
