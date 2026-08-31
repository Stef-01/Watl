# Golden Wattle botanical design QA

## Sources and measured states

- Close morphology reference: `/var/folders/y6/d0jh3m4n3vsf4gbns5cplpmh0000gn/T/codex-clipboard-a12a6aa1-ed8e-4324-a6a3-cf3bf615d89a.png` (666 × 400).
- Whole-branch reference: `/var/folders/y6/d0jh3m4n3vsf4gbns5cplpmh0000gn/T/codex-clipboard-69e9c10a-afdd-4400-9b9e-2b38a67e00c3.png` (1311 × 2000).
- Desktop implementation state: `/tmp/watl-reference-qa/final-desktop-all-open-v7.png` (1440 × 900, DPR 1, high quality, motion off, mature branch, all heads open).
- Flower macro state: `/tmp/watl-reference-qa/final-flower-detail-v3.png` (1000 × 700, DPR 1, high quality, isolated mature head).
- Combined inspection sheets used during the recursive review: `/tmp/watl-reference-qa/compare-full-branch.png` and `/tmp/watl-reference-qa/compare-flower-detail.png`.

The first reference was judged at flower-head scale; the second was judged at branch silhouette and cluster-distribution scale. The implementation preserves the site's dark spatial field and left client rail, so photographic background colour and depth of field were intentionally excluded from the match target.

## Variance inventory and resolution

| Area | Initial variance | Final resolution | Status |
| --- | --- | --- | --- |
| Plant form | Bouquet/tree mass instead of a single branch | One vertically oriented, slightly diagonal branch enters from the lower-right and carries slender lateral twigs | Closed |
| Foliage anatomy | Short, broad or fern-like foliage | Long, narrow, simple lanceolate phyllodes with a tapered tip, shallow keel and three longitudinal nerves | Closed |
| Leaf colour | High-yellow chartreuse/olive cast | Cooler four-step forest/eucalyptus palette sampled against the supplied leaves (`#36532c` to `#69895a`) | Closed |
| Inflorescence placement | Solitary terminal balls at stick ends | 21 axillary raceme axes with fine pedicels and 82 heads distributed across branch orders 0–3 | Closed |
| Raceme rhythm | Even, mechanical spacing | Seeded golden-angle spacing, different raceme lengths, 2–5 visible heads per string, and gravity-biased droop | Closed |
| Bud scale | Green bud began larger than the final bloom | Closed bud is 50% smaller than the previous release, mature flower is 20% smaller, and the cap retires inside a continuously expanding yellow structure | Closed |
| Ghost silhouette | Large green shell remained visible behind the flower | Bud geometry now scales to a retired 0.035 factor and the yellow mass is open-only | Closed |
| Flower character | Spiky sea-urchin rays or smooth plastic sphere | Compact fibrous undercoat, 900 equal-area shell particles per high-detail head, recessed representative stamens and small edge irregularity | Closed |
| Flower colour | Muddy mustard and grey blotching | Saturated lemon core/filament/tip palette with texture carried by light variation rather than desaturation | Closed |
| Bloom staging | Scale-up only | Bud swell → seam separation → cup reveal → five-part floret opening → stamen extension → anther settling → persistent mature head | Closed |
| Hover behaviour | Global or coarse bloom response | Screen-space brush opens only nearby heads, four at a time, with 135 ms local staggering | Closed |
| Composition | Flat frontal specimen and collision with client list | Projection-aware 24° three-quarter landscape view, optically lifted canopy target, and 0.38 projected-width offset compose the complete branch strongly on the right | Closed |
| Finale | No completion acknowledgement | All 82 persistent heads trigger the restrained black “Help your business bloom” contact banner | Closed |

## Recursive appraisal record

1. Rebuilt the prior bouquet/tree as a single branch and replaced the foliage grammar.
2. Rejected the first result because racemes overlapped into caterpillar-like chains; widened and drooped their axes.
3. Fixed the multi-head GPU upload path after the state reported open while only one head visibly changed; the final implementation coalesces all dirty heads into one safe sparse span per attribute.
4. Rebalanced 82 heads across 21 shorter 2–5-head racemes and all four branch orders, so flowers read as a distributed flowering rhythm rather than one dense terminal knot.
5. Replaced the oversized smooth bloom sphere because it recreated the reported ghost-shell artefact.
6. Rejected the exposed long-filament version because it read as a sea urchin; recessed the lines and added a compact point-shell mass.
7. Reduced coarse radial spikes, tightened the particle shell from 0.72 to 0.69 radius, and lowered representative filament opacity to 0.30.
8. Compared the macro and whole-branch states together with both references; corrected foliage hue, flower saturation, camera fill and right-side offset.
9. Re-measured the complete generated silhouette across eleven azimuths; selected 24° because it exposes branch depth while preserving a 1.698 projected height-to-width ratio and improving average flower separation by approximately 8% over the frontal view.
10. Rechecked the settled all-open state rather than judging a partially loaded frame.
11. Verified desktop, mobile hover-area blooming, reduced-motion, full-bloom completion and performance budgets.

## Final technical measurements

- Procedural morphology: 82 flower heads, 21 racemes, no single-head racemes, four botanical branch orders.
- Flower scale: the mature pom-pom is 20% smaller than the previous release; the closed bud is 50% smaller and therefore begins at 0.625 of the resized mature envelope before expanding monotonically through cup, petal, filament, and pollen stages.
- Branch finish: deterministic internode curvature, calmer lateral inclination, and a 0.84 stem-tip taper aligned to the primary continuation ratio remove ruler-straight axes and swollen joints.
- Authored camera: 34° field of view, responsive 24°/18°/10° three-quarter azimuth, 4.5° elevation, and an optically raised target center the flower-bearing canopy while the stem enters from below.
- Exploration range: wheel/pinch zoom speed increased from 0.72 to 1.18; camera distance now spans 0.34×–2.45× the authored distance, with symmetric 18% keyboard zoom steps.
- Environmental motion: Night remains the explicit first-paint default with only black, vignette and the 3D stars; six optional grounds reuse two transform-only atmosphere planes plus a gently drifting contour field, all paused while hidden or motion-reduced.
- Interface telemetry: one fixed lower-left meter reports the current shoot/branch/leaf/bud/bloom phase, shows exact growth percentage or open/total heads, and derives its fill from aggregate biological progress without adding a render loop.
- Fine-pointer feedback: the cursor ring is clamped to the same 20vmin diameter as the 68–104 px bloom-brush radius and changes state only when unopened heads are inside the activation area; touch and reduced-motion paths omit it.
- Stateful UI motion: the ground picker uses a reversible 180 ms opacity/transform transition from the toggle edge, closes through the same path, and bypasses movement for keyboard input; keyboard client scrolling is immediate. Its visual dots retain quiet 11 px proportions inside 28 px targets, and the mobile tray becomes a black 4-column panel below the trigger instead of crossing the wordmark. Reduced-motion keeps only 160 ms opacity/colour feedback and removes movement, scale, stagger, ambient drift and the timed ground dissolve.
- Motion physics: the continuously sampled lifecycle line now renders the exact current growth/bloom transform with no 260 ms trailing interpolation; the indeterminate loader is linear, and direct press acknowledgement across grounds, client links and finale actions shares one 120 ms ease-out token.
- Direct-manipulation focus: interface chrome fades to 34% only after a canvas press crosses the existing 7 px drag threshold, never on a bud click; the bloom brush hides during orbiting and every end/cancel/blur path restores the interface. The client counter and a 16%-width gold baseline preview scroll, hover and keyboard focus without animating the high-frequency counter text.
- Completion motion: the rare full-bloom state replaces a generic whole-panel scale with a 480 ms centre-out clip reveal and one 420 ms content lift delayed by 100 ms. Pointer dismissal reverses the path and restores canvas focus without a keyboard ring; keyboard and reduced-motion entry/exit are immediate. The now-actionless bloom brush stays hidden both while the finale is visible and after dismissal.
- Scroll chrome: the client rail remains natively scrollable, but its thumb is transparent at rest and appears only for fine-pointer hover or keyboard focus; the counter, current-row marker and lower mask carry discovery on touch without painting a persistent gold bar over the list.
- Interaction sampling: hover brush radius 90 px in the recorded desktop state; four heads per brush step.
- Hover-area blooming remains capped at four nearby heads per brush step, independent of total flower count.
- Mature completion state: 82 open, 0 closed, growth 1.0, bloom timeline 1.0.
- Forty-seed robustness audit: 71–84 heads, 18–24 racemes, consistently
  2–5 heads per raceme, all four branch orders represented, and upright
  height-to-width ratios from 1.42 to 2.82.

## Post-approval performance refinement

- The approved high-quality geometry, palette, and 2.7-second choreography are unchanged; the whole-branch camera is now an intentional responsive three-quarter portrait.
- Local bloom updates no longer upload whole scene attributes; the QA surface now reports actual scheduled ranges and bytes.
- Pointer-facing site delays are evaluated once per activation instead of once per item per frame, and the filament hot path performs no temporary array allocation.
- Production no longer maintains or shifts the 240-entry QA frame-time window.
- The constrained profile uses time-correct 30 fps pacing and respects `Save-Data`; the high profile remains uncapped.
- The failure poster changed from a mislabeled 48,626-byte JPEG-in-PNG container to a correct 28,124-byte WebP and is no longer eagerly requested.
- The 139,701-byte Motion runtime is omitted for touch and reduced-motion visitors.
- Static assets use ETag revalidation; HTML remains `no-store`.
- The 70k+ high-detail pom-pom fuzz points now morph position, size, shade, and
  visibility in the vertex shader; one scalar channel changes per frame
  instead of eight, an 87.5% reduction in dynamic attribute traffic with
  identical density.
- A pollen-only sampler was proven against the full choreography at 60,006
  timeline/delay combinations, and packed fuzz releases both retained Vector3
  pose objects after its static GPU attributes are built.
- A local 369,000-sample deterministic CPU benchmark dropped from 174.51 ms
  with the full stage/handoff path to 66.36 ms with the optimized packed
  sampler (62.0% less CPU time, identical checksum). It is also 28.6% faster
  than the previous packed sampler. The render split costs three small cluster
  draw calls in exchange for removing seven of eight dynamic floats per fuzz
  point.
- All 40 regression checks pass after the refactor.

## Final judgement

Final result: passed. The delivered morphology matches the references in the attributes that identify Golden Wattle: simple long phyllodes, axillary strings of multiple spherical heads, a bud-to-fibrous-pompom progression, saturated yellow/green contrast and a drooping branch rhythm. The retained dark background, procedural polygonal surface character and deliberately sparser negative space are product-level presentation choices rather than unresolved botanical defects.
