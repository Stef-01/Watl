/**
 * r3f-perf, inside the canvas, when `?tune=1`. Lazy so production never
 * bundles it. Draw calls, triangles, GPU time and memory sit bottom-left
 * while the Leva panel sits top-right.
 */
import { lazy, Suspense } from "react";

const Perf = lazy(() => import("r3f-perf").then((module) => ({ default: module.Perf })));

export function ScenePerf() {
  return (
    <Suspense fallback={null}>
      <Perf position="bottom-left" minimal={false} showGraph antialias={false} />
    </Suspense>
  );
}
