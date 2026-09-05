/**
 * The hand on the branch.
 *
 * Wheel belongs to the page — Lenis scrolls it. What the canvas keeps is the
 * drag, which orbits, and the hover, which blooms. A press that travels more
 * than seven pixels is a drag and never also a click; a drag lets the chrome
 * recede. On touch the vertical axis pans the page (`touch-action: pan-y`)
 * and a horizontal drag orbits.
 */
import { useEffect, type RefObject } from "react";
import { useThree } from "@react-three/fiber";
import { MathUtils } from "three";

import { useEngine } from "./engineContext";
import { orbit } from "./CameraRig";
import { useWatl } from "../state/store";

const DRAG_SLOP = 7;
const ROTATE_SPEED = 0.0052;

export function Interaction({ stageRef }: { stageRef: RefObject<HTMLDivElement | null> }) {
  const engine = useEngine();
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const setOrbiting = useWatl((s) => s.setOrbiting);

  useEffect(() => {
    const canvas = gl.domElement;
    let press: { id: number; x: number; y: number; lastX: number; lastY: number; moved: boolean } | null = null;

    const viewport = () => {
      const rect = canvas.getBoundingClientRect();
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 && event.pointerType === "mouse") return;
      stageRef.current?.focus({ preventScroll: true });
      press = { id: event.pointerId, x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, moved: false };
      engine.setPress({ pointerId: event.pointerId, x: event.clientX, y: event.clientY });
    };

    const onPointerMove = (event: PointerEvent) => {
      if (press && press.id === event.pointerId) {
        const distance = Math.hypot(event.clientX - press.x, event.clientY - press.y);
        if (!press.moved && distance > DRAG_SLOP) {
          /* A touch drag that is mostly vertical is a scroll, not an orbit;
             the browser already has it. */
          if (event.pointerType === "touch" && Math.abs(event.clientY - press.y) > Math.abs(event.clientX - press.x)) {
            press = null;
            engine.setPress(null);
            return;
          }
          press.moved = true;
          orbit.dragging = true;
          engine.markDragged();
          engine.setControlsActive(true);
          setOrbiting(true);
          try {
            canvas.setPointerCapture(event.pointerId);
          } catch {
            /* Capture is a nicety; the window listeners below cover the rest. */
          }
        }
        if (press.moved) {
          const dx = event.clientX - press.lastX;
          const dy = event.clientY - press.lastY;
          press.lastX = event.clientX;
          press.lastY = event.clientY;
          orbit.azimuth.set(orbit.azimuth.target - dx * ROTATE_SPEED);
          orbit.elevation.set(MathUtils.clamp(orbit.elevation.target + dy * ROTATE_SPEED * 0.8, -0.9, 0.9));
          invalidate();
        }
        return;
      }
      engine.setHoverPointer(event.clientX, event.clientY, viewport());
    };

    const endPress = () => {
      if (press?.moved) {
        orbit.dragging = false;
        engine.setControlsActive(false);
        setOrbiting(false);
      }
      press = null;
      engine.setPress(null);
      invalidate();
    };

    const onPointerUp = (event: PointerEvent) => {
      if (!press || press.id !== event.pointerId) return;
      endPress();
    };

    const onClick = (event: MouseEvent) => {
      if (engine.pointerDragged) return;
      engine.activateAt(event.clientX, event.clientY, viewport());
      invalidate();
    };

    const onLeave = () => {
      engine.clearHover();
    };

    const onBlur = () => endPress();

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", endPress);
    canvas.addEventListener("lostpointercapture", endPress);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("click", onClick);
    window.addEventListener("blur", onBlur);
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", endPress);
      canvas.removeEventListener("lostpointercapture", endPress);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("click", onClick);
      window.removeEventListener("blur", onBlur);
    };
  }, [engine, gl, invalidate, setOrbiting, stageRef]);

  /* Scrolling returns the camera to the authored view: the visitor's orbit is
     an aside, and the page's own choreography resumes as soon as they move on. */
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      if (Math.abs(window.scrollY - last) < 2) return;
      last = window.scrollY;
      if (!orbit.dragging) orbit.release();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return null;
}
