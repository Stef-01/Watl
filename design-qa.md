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
| Inflorescence placement | Solitary terminal balls at stick ends | 18 axillary raceme axes with fine pedicels and 72 heads distributed across branch orders 0–3 | Closed |
| Raceme rhythm | Even, mechanical spacing | Seeded golden-angle spacing, different raceme lengths, 2–6 visible heads per string, and gravity-biased droop | Closed |
| Bud scale | Green bud began larger than the final bloom | Bud, cup and open head share one authored radius envelope; the cap retires inside the expanding yellow structure | Closed |
| Ghost silhouette | Large green shell remained visible behind the flower | Bud geometry now scales to a retired 0.035 factor and the yellow mass is open-only | Closed |
| Flower character | Spiky sea-urchin rays or smooth plastic sphere | Compact fibrous undercoat, 900 equal-area shell particles per high-detail head, recessed representative stamens and small edge irregularity | Closed |
| Flower colour | Muddy mustard and grey blotching | Saturated lemon core/filament/tip palette with texture carried by light variation rather than desaturation | Closed |
| Bloom staging | Scale-up only | Bud swell → seam separation → cup reveal → five-part floret opening → stamen extension → anther settling → persistent mature head | Closed |
| Hover behaviour | Global or coarse bloom response | Screen-space brush opens only nearby heads, four at a time, with 135 ms local staggering | Closed |
| Composition | Distant specimen and collision with client list | Camera fill tightened to 0.76, branch target shifted 0.38 of branch width left to render the botanical form strongly on the right | Closed |
| Finale | No completion acknowledgement | All 72 persistent heads trigger the restrained black “Help your business bloom” contact banner | Closed |

## Recursive appraisal record

1. Rebuilt the prior bouquet/tree as a single branch and replaced the foliage grammar.
2. Rejected the first result because racemes overlapped into caterpillar-like chains; widened and drooped their axes.
3. Fixed the multi-head GPU upload path after the state reported open while only one head visibly changed; the final implementation coalesces all dirty heads into one safe sparse span per attribute.
4. Rebalanced the 72-head quota across branch orders so flowers no longer formed one dense terminal knot.
5. Replaced the oversized smooth bloom sphere because it recreated the reported ghost-shell artefact.
6. Rejected the exposed long-filament version because it read as a sea urchin; recessed the lines and added a compact point-shell mass.
7. Reduced coarse radial spikes, tightened the particle shell from 0.72 to 0.69 radius, and lowered representative filament opacity to 0.30.
8. Compared the macro and whole-branch states together with both references; corrected foliage hue, flower saturation, camera fill and right-side offset.
9. Rechecked the settled all-open state rather than judging a partially loaded frame.
10. Verified desktop, mobile hover-area blooming, reduced-motion, full-bloom completion and performance budgets.

## Final technical measurements

- Procedural morphology: 72 flower heads, 18 racemes, no single-head racemes, four botanical branch orders.
- High-detail flower load: 1,980 modeled florets, 9,900 petals, 88,104 display points.
- Settled renderer: 17 draw calls, 498,376 triangles, 88,996 rendered points, three textures, DPR 1 in the recorded desktop state.
- Interaction sampling: hover brush radius 90 px in the recorded desktop state; four heads per brush step.
- Final 390 × 844 hover-area run: one pointer dwell opened 27 nearby heads in three brush steps while leaving 45 remote heads closed; median frame time 8.3 ms and p95 9.0 ms.
- Mature completion state: 72 open, 0 closed, growth 1.0, bloom timeline 1.0.

## Post-approval performance refinement

- The approved high-quality geometry, palette, camera, and 2.7-second choreography are unchanged.
- Local bloom updates no longer upload whole scene attributes; the QA surface now reports actual scheduled ranges and bytes.
- Pointer-facing site delays are evaluated once per activation instead of once per item per frame, and the filament hot path performs no temporary array allocation.
- Production no longer maintains or shifts the 240-entry QA frame-time window.
- The constrained profile uses time-correct 30 fps pacing and respects `Save-Data`; the high profile remains uncapped.
- The failure poster changed from a mislabeled 48,626-byte JPEG-in-PNG container to a correct 28,124-byte WebP and is no longer eagerly requested.
- The 139,701-byte Motion runtime is omitted for touch and reduced-motion visitors.
- Static assets use ETag revalidation; HTML remains `no-store`.
- The 60k+ high-detail pom-pom fuzz points now morph position, size, and shade
  in the vertex shader; only two scalar channels change per frame instead of
  eight, a 75% reduction in dynamic attribute traffic with identical density.
- A pollen-only sampler was proven against the full choreography at 60,006
  timeline/delay combinations, and packed fuzz releases both retained Vector3
  pose objects after its static GPU attributes are built.
- A local 324,000-sample deterministic CPU benchmark dropped from 157.76 ms
  with the full stage/handoff path to 80.87 ms with the packed sampler
  (48.7% less CPU time, identical checksum). The render split costs three
  small cluster draw calls in exchange for removing six dynamic floats per
  fuzz point.
- All 36 regression checks pass after the refactor.

## Final judgement

Final result: passed. The delivered morphology matches the references in the attributes that identify Golden Wattle: simple long phyllodes, axillary strings of multiple spherical heads, a bud-to-fibrous-pompom progression, saturated yellow/green contrast and a drooping branch rhythm. The retained dark background, procedural polygonal surface character and deliberately sparser negative space are product-level presentation choices rather than unresolved botanical defects.
