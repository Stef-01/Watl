/**
 * Post-processing, selective by design.
 *
 * Bloom is thresholded at 1.0 in linear light. Nothing on the branch reaches
 * that except the flower layers, which the engine writes un-tone-mapped at
 * `FX.emissiveGain`; the phyllodes, bark and stars stay below it and never
 * glow. Chromatic aberration is radially masked so the centre of the frame is
 * clean. Depth of field exists only for the hero's close-up act, on the high
 * profile, with its focus on the raceme the camera is looking at.
 *
 * The composer tone-maps at the end (the renderer is `flat`), then SMAA.
 */
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  Bloom,
  ChromaticAberration,
  DepthOfField,
  EffectComposer,
  SMAA,
  ToneMapping,
  Vignette,
} from "@react-three/postprocessing";
import { BlendFunction, ToneMappingMode } from "postprocessing";
import { Vector2 } from "three";
import type { BloomEffect, DepthOfFieldEffect } from "postprocessing";

import { FX } from "../motion/tokens";
import { useEngine } from "./engineContext";
import { pose, scrub } from "./scrub";
import { pageQuery, useWatl } from "../state/store";

/** Live overrides written by the tuning panel. Production never touches it. */
export const fxLive: {
  bloomIntensity: number | null;
  bloomThreshold: number;
  bloomRadius: number;
  chromatic: number;
  bokehMax: number;
  emissiveGain: number;
} = {
  bloomIntensity: null,
  bloomThreshold: FX.bloom.threshold,
  bloomRadius: FX.bloom.radius,
  chromatic: FX.chromatic.x,
  bokehMax: FX.dof.bokehMax,
  emissiveGain: FX.emissiveGain,
};

const chromaticOffset = new Vector2(FX.chromatic.x, FX.chromatic.y);

/* `?tone=agx` trials the AgX curve; neutral is the authored default. */
const toneMode = pageQuery.get("tone") === "agx" ? ToneMappingMode.AGX : ToneMappingMode.NEUTRAL;

export function Effects() {
  const engine = useEngine();
  const profile = useWatl((s) => s.profile);
  const bloomRef = useRef<BloomEffect>(null);
  const dofRef = useRef<DepthOfFieldEffect>(null);
  const high = profile === "high";

  const appliedGain = useRef(-1);

  useFrame(() => {
    if (appliedGain.current !== fxLive.emissiveGain) {
      appliedGain.current = fxLive.emissiveGain;
      engine.setEmissiveGain(fxLive.emissiveGain);
    }
    const bloom = bloomRef.current;
    if (bloom) {
      const scrubbed = scrub.bloomIntensity;
      const sectioned = pose.bloomIntensity;
      const target = fxLive.bloomIntensity ?? (scrubbed * (1 - pose.weight) + sectioned * pose.weight);
      if (Math.abs(bloom.intensity - target) > 0.0005) bloom.intensity = target;
      if (bloom.luminanceMaterial.threshold !== fxLive.bloomThreshold) {
        bloom.luminanceMaterial.threshold = fxLive.bloomThreshold;
      }
    }
    const dof = dofRef.current;
    if (dof) {
      const scale = scrub.bokeh * (1 - pose.weight) * fxLive.bokehMax;
      if (Math.abs(dof.bokehScale - scale) > 0.001) dof.bokehScale = scale;
      dof.target = engine.focusTarget;
    }
    if (chromaticOffset.x !== fxLive.chromatic) {
      chromaticOffset.set(fxLive.chromatic, fxLive.chromatic * (FX.chromatic.y / FX.chromatic.x));
    }
  });

  return (
    <EffectComposer multisampling={high ? 4 : 0} enableNormalPass={false}>
      {high ? (
        <DepthOfField
          ref={dofRef}
          focalLength={FX.dof.focalLength}
          bokehScale={0}
          target={engine.focusTarget}
        />
      ) : <></>}
      <Bloom
        ref={bloomRef}
        mipmapBlur
        luminanceThreshold={FX.bloom.threshold}
        luminanceSmoothing={FX.bloom.smoothing}
        intensity={FX.bloom.intensity}
        radius={FX.bloom.radius}
        levels={FX.bloom.levels}
      />
      <ChromaticAberration
        blendFunction={BlendFunction.NORMAL}
        offset={chromaticOffset}
        radialModulation
        modulationOffset={FX.chromatic.modulationOffset}
      />
      <Vignette eskil={false} offset={FX.vignette.offset} darkness={FX.vignette.darkness} />
      <ToneMapping mode={toneMode} />
      {high ? <SMAA /> : <></>}
    </EffectComposer>
  );
}
