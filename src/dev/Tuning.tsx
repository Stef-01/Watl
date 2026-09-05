/**
 * Instrument before polish. `?tune=1` mounts Leva with the values the eye
 * dials — bloom, aberration, depth of field, the section poses — and the
 * r3f-perf panel. Numbers are copied back into src/motion/tokens.ts by hand;
 * nothing here runs in production.
 */
import { lazy, Suspense, useEffect } from "react";
import { useControls, folder, button } from "leva";

import { FX, POSES } from "../motion/tokens";
import { pose, scrub } from "../scene/scrub";
import { fxLive } from "../scene/Effects";
import { engineHandle } from "../scene/engineContext";

const Perf = lazy(() => import("./Perf"));

export function Tuning() {
  const values = useControls({
    Bloom: folder({
      bloomIntensity: { value: FX.bloom.intensity, min: 0, max: 2, step: 0.01 },
      bloomThreshold: { value: FX.bloom.threshold, min: 0, max: 2, step: 0.01 },
      bloomRadius: { value: FX.bloom.radius, min: 0, max: 1, step: 0.01 },
      overrideBloom: { value: false },
    }),
    Aberration: folder({
      chromatic: { value: FX.chromatic.x, min: 0, max: 0.005, step: 0.0001 },
    }),
    "Depth of field": folder({
      bokehMax: { value: FX.dof.bokehMax, min: 0, max: 6, step: 0.05 },
    }),
    Emissive: folder({
      emissiveGain: { value: FX.emissiveGain, min: 0.5, max: 4, step: 0.02 },
    }),
    Camera: folder({
      poseWeight: { value: pose.weight, min: 0, max: 1, step: 0.01 },
      distance: { value: POSES.arrival.distance, min: 0.3, max: 2.5, step: 0.01 },
      azimuth: { value: POSES.arrival.azimuth, min: -90, max: 90, step: 0.5 },
      elevation: { value: POSES.arrival.elevation, min: -30, max: 50, step: 0.5 },
      offset: { value: POSES.arrival.offset, min: -0.2, max: 0.6, step: 0.01 },
      drivePose: { value: false },
    }),
    Branch: folder({
      growth: { value: 1, min: 0, max: 1, step: 0.001 },
      wave: { value: 0, min: 0, max: 1, step: 0.001 },
      driveBranch: { value: false },
      breeze: { value: 0.42, min: 0, max: 1.5, step: 0.01 },
    }),
    "Copy tokens": button(() => {
      const engine = engineHandle.current;
      const snapshot = {
        bloom: { intensity: fxLive.bloomIntensity, threshold: fxLive.bloomThreshold, radius: fxLive.bloomRadius },
        chromatic: fxLive.chromatic,
        bokehMax: fxLive.bokehMax,
        pose: { distance: pose.distance, azimuth: pose.azimuth, elevation: pose.elevation, offset: pose.offset },
        qa: engine?.qa.snapshot(),
      };
      console.info("[watl tune]", JSON.stringify(snapshot, null, 2));
    }),
  });

  useEffect(() => {
    fxLive.bloomIntensity = values.overrideBloom ? values.bloomIntensity : null;
    fxLive.bloomThreshold = values.bloomThreshold;
    fxLive.bloomRadius = values.bloomRadius;
    fxLive.chromatic = values.chromatic;
    fxLive.bokehMax = values.bokehMax;
    fxLive.emissiveGain = values.emissiveGain;
  }, [values.bloomIntensity, values.bloomThreshold, values.bloomRadius, values.overrideBloom, values.chromatic, values.bokehMax, values.emissiveGain]);

  useEffect(() => {
    if (!values.drivePose) return;
    pose.weight = values.poseWeight;
    pose.distance = values.distance;
    pose.azimuth = values.azimuth;
    pose.elevation = values.elevation;
    pose.offset = values.offset;
  }, [values.drivePose, values.poseWeight, values.distance, values.azimuth, values.elevation, values.offset]);

  useEffect(() => {
    if (!values.driveBranch) return;
    scrub.growth = values.growth;
    scrub.bloom = values.wave;
  }, [values.driveBranch, values.growth, values.wave]);

  useEffect(() => {
    engineHandle.current?.setBreeze(values.breeze);
  }, [values.breeze]);

  return (
    <Suspense fallback={null}>
      <Perf />
    </Suspense>
  );
}
