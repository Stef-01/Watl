# WATL / Technology Design

WATL is a technology design practice creating interfaces, systems, and experimental tools for futures that have not settled into form. Its homepage is an extreme-minimal field object: a procedural Three.js portrait of a complete hand-tied golden wattle bouquet (*Acacia pycnantha*) suspended inside a deterministic universe of warm light and faint, unresolved signals.

Orbiting the camera reveals spatial parallax. A nearly imperceptible celestial drift, soft twinkle, and sparse connections keep the surrounding field alive without competing with the botanical form. The object is the identity; everything else has been reduced to coordinates.

Mature heads form dense, symmetrical biconvex pom-poms. Complete five-part florets and five round anthers per floret follow mirrored golden-angle Fermat spirals across both faces, so the back is as full as the front. Compact young buds retain their round form. Curved falcate phyllodes taper at both ends and carry five parallel-convergent longitudinal veins. Three.js `0.185.1` is vendored into `vendor/three/` rather than loaded from a CDN, so a fresh clone runs with no install step.

## Run locally

Node.js 18 or newer is recommended. There are no runtime dependencies to
fetch — Three.js is committed under `vendor/three/`.

```bash
npm run dev
```

Open `http://127.0.0.1:4173`. Keep the local server running instead of opening `index.html` directly, because the viewer uses JavaScript modules. This is a development-only server bound to the loopback interface; set `PORT` to an integer from 1 through 65535 to use another local port.

Run `npm run check` to syntax-check both the server and scene code.

## Explore the bouquet

- Drag to orbit; use the wheel or a pinch gesture to zoom.
- Click or tap a flower to brighten that bloom.
- With the 3D stage focused, use the arrow keys to rotate, `+` / `-` to zoom, `Enter` to trigger a whole-bouquet pollen pulse, and `Home` to restore the authored view.
- Adjust **Drift** to change the botanical sway. **Hold** stops both bouquet movement and celestial drift without disabling manual inspection; **Release** starts them again.
- Use **Origin** to restore the authored camera.

## Export

Choose **Object** to save `golden-wattle-bouquet.glb`. The GLB contains the generated bouquet asset, including the symmetrical double-sided five-merous flower heads, compact buds, and falcate veined phyllodes, for use in GLB-compatible 3D software. The spatial universe, webpage controls, and interactive camera are intentionally not part of the exported botanical asset.

A ready-made high-detail copy is also included at `assets/golden-wattle-bouquet.glb`.

## Accessibility and fallbacks

The scene has a keyboard-focusable wrapper, visible focus treatment, concise operating instructions, and a text description of the bouquet and its spatial field. A `prefers-reduced-motion: reduce` preference disables autonomous bouquet and celestial motion while preserving direct pointer and keyboard controls. If WebGL is unavailable or scene setup fails, the interface presents an explanatory status and a still bouquet poster instead of an empty canvas.
