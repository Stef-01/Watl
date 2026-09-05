/**
 * The camera rig.
 *
 * Three sources compose one pose every frame:
 *   1. the hero scrub — distance, azimuth, elevation, offset and focus, driven
 *      by the ScrollTrigger timeline while the arrival section is pinned;
 *   2. the section pose — tweened on `EASE.settle` when a section takes over;
 *   3. the visitor's own orbit — a spring offset from dragging or the arrow
 *      keys, which decays back to the authored view when they scroll.
 *
 * Everything is expressed relative to the engine's authored portrait, so a
 * resize that changes the fit changes every pose with it.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { MathUtils, PerspectiveCamera, Vector3 } from "three";

import { createSpring } from "../motion/spring";
import { PORTRAIT_OFFSET, SPRING } from "../motion/tokens";
import { useEngine } from "./engineContext";
import { pose, scrub } from "./scrub";

/** Shared with Interaction and the keyboard handler. */
export const orbit = {
  azimuth: createSpring(SPRING.orbit, 0),
  elevation: createSpring(SPRING.orbit, 0),
  zoom: createSpring(SPRING.orbit, 1),
  /** True while the visitor holds a drag; the springs then follow directly. */
  dragging: false,
  release() {
    orbit.azimuth.set(0);
    orbit.elevation.set(0);
    orbit.zoom.set(1);
  },
};

const MIN_ZOOM = 0.34;
const MAX_ZOOM = 2.45;
const MIN_ELEVATION = MathUtils.degToRad(-32);
const MAX_ELEVATION = MathUtils.degToRad(56);

export function CameraRig() {
  const engine = useEngine();
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const invalidate = useThree((s) => s.invalidate);
  const scratch = useMemo(() => ({
    target: new Vector3(),
    composed: new Vector3(),
    direction: new Vector3(),
    position: new Vector3(),
    smoothedPosition: new Vector3(),
    smoothedTarget: new Vector3(),
    focus: new Vector3(),
  }), []);
  const primed = useRef(false);

  useEffect(() => {
    const wake = () => invalidate();
    const springs = [orbit.azimuth, orbit.elevation, orbit.zoom];
    /* Springs write on the ticker; the canvas needs a frame when they move. */
    const previous = springs.map((spring) => spring.value);
    const check = () => {
      let moved = false;
      springs.forEach((spring, index) => {
        if (Math.abs(spring.value - previous[index]) > 0.00001) {
          previous[index] = spring.value;
          moved = true;
        }
      });
      if (moved) wake();
    };
    const id = window.setInterval(check, 16);
    return () => window.clearInterval(id);
  }, [invalidate]);

  useFrame((_, delta) => {
    const view = engine.defaultView;
    if (!view || engine.state.qaCameraLock) return;

    const bounds = engine.bounds;
    const height = Math.max(0.0001, bounds.max.y - bounds.min.y);
    const portrait = camera.aspect < 0.82;
    const baseOffsetFraction = view.projectedWidth > 0 ? view.compositionOffset / view.projectedWidth : 0;

    const w = pose.weight;
    const distanceMul = MathUtils.lerp(scrub.distance, pose.distance, w) * orbit.zoom.value;
    const azimuthDeg = MathUtils.lerp(scrub.azimuth, pose.azimuth + pose.azimuthNudge, w);
    const elevationDeg = MathUtils.lerp(scrub.elevation, pose.elevation, w);
    const offsetFraction = portrait
      ? Math.min(baseOffsetFraction, PORTRAIT_OFFSET)
      : MathUtils.lerp(scrub.offset, pose.offset, w);

    /* The authored target, re-offset. The engine already shifted the centre by
       its own aspect-dependent fraction; undo that and apply ours. */
    scratch.target.copy(view.target);
    scratch.target.x += view.compositionOffset - offsetFraction * view.projectedWidth;

    /* While the shoot is growing the camera tracks its tip rather than the
       canopy that does not exist yet. */
    const growth = MathUtils.clamp(scrub.growth, 0, 1);
    const authoredFraction = (view.target.y - bounds.min.y) / height;
    const trackedFraction = MathUtils.lerp(0.22, authoredFraction, MathUtils.smoothstep(growth, 0, 1));
    const followWeight = 1 - w;
    scratch.target.y = MathUtils.lerp(
      view.target.y,
      bounds.min.y + trackedFraction * height,
      followWeight,
    );

    /* Focus blends the target onto the densest raceme for the close-up act. */
    const focus = MathUtils.clamp(scrub.focus * (1 - w), 0, 1);
    scratch.composed.copy(scratch.target).lerp(engine.focusTarget, focus);

    const azimuth = MathUtils.degToRad(azimuthDeg) + orbit.azimuth.value;
    const elevation = MathUtils.clamp(
      MathUtils.degToRad(elevationDeg) + orbit.elevation.value,
      MIN_ELEVATION,
      MAX_ELEVATION,
    );
    const authoredDistance = view.position.distanceTo(view.target);
    const distance = MathUtils.clamp(
      authoredDistance * distanceMul,
      authoredDistance * MIN_ZOOM,
      authoredDistance * MAX_ZOOM,
    );
    scratch.direction.set(
      Math.sin(azimuth) * Math.cos(elevation),
      Math.sin(elevation),
      Math.cos(azimuth) * Math.cos(elevation),
    );
    scratch.position.copy(scratch.composed).addScaledVector(scratch.direction, distance);

    if (!primed.current) {
      scratch.smoothedPosition.copy(scratch.position);
      scratch.smoothedTarget.copy(scratch.composed);
      primed.current = true;
    } else {
      /* A light damp only, so the three pose sources hand over without a
         seam. The scrub and the tweens already carry the authored curves. */
      const lambda = orbit.dragging ? 40 : 14;
      const t = 1 - Math.exp(-lambda * Math.min(delta, 0.05));
      scratch.smoothedPosition.lerp(scratch.position, t);
      scratch.smoothedTarget.lerp(scratch.composed, t);
    }

    const moved = camera.position.distanceToSquared(scratch.smoothedPosition) > 1e-9;
    camera.position.copy(scratch.smoothedPosition);
    camera.near = view.near;
    camera.far = view.far;
    camera.lookAt(scratch.smoothedTarget);
    camera.updateProjectionMatrix();
    if (moved || scratch.smoothedPosition.distanceToSquared(scratch.position) > 1e-7) invalidate();
  }, -1);

  return null;
}
