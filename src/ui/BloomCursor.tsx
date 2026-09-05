/**
 * The bloom brush, visible on fine pointers. A hairline ring matches the real
 * 20 vmin activation diameter and follows the cursor directly; it tightens to
 * gold only when the raycaster finds unopened heads. Immediate feedback, not
 * a trailing cursor.
 */
import { useEffect, useRef } from "react";

import { useWatl } from "../state/store";

export function BloomCursor() {
  const ref = useRef<HTMLDivElement>(null);
  const finePointer = useWatl((s) => s.finePointer);
  const reduced = useWatl((s) => s.reduced);
  const brushHover = useWatl((s) => s.brushHover);
  const treeMature = useWatl((s) => s.treeMature);
  const orbiting = useWatl((s) => s.orbiting);
  const finale = useWatl((s) => s.finale);

  useEffect(() => {
    const cursor = ref.current;
    if (!cursor || !finePointer || reduced) return undefined;
    let x = -96;
    let y = -96;
    let queued = 0;
    const frame = () => {
      queued = 0;
      cursor.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
    };
    const move = (event: PointerEvent) => {
      const overCanvas = (event.target as Element | null)?.closest?.("#wattle-stage");
      cursor.dataset.visible = overCanvas ? "true" : "false";
      x = event.clientX;
      y = event.clientY;
      if (!queued) queued = requestAnimationFrame(frame);
    };
    const hide = () => {
      cursor.dataset.visible = "false";
      cursor.dataset.pressed = "false";
    };
    const press = () => {
      cursor.dataset.pressed = "true";
    };
    const release = () => {
      cursor.dataset.pressed = "false";
    };
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerdown", press, { passive: true });
    window.addEventListener("pointerup", release, { passive: true });
    window.addEventListener("pointercancel", hide, { passive: true });
    window.addEventListener("blur", hide);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", press);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", hide);
      window.removeEventListener("blur", hide);
      if (queued) cancelAnimationFrame(queued);
    };
  }, [finePointer, reduced]);

  if (!finePointer || reduced) return null;

  return (
    <div
      ref={ref}
      className="bloom-cursor"
      id="bloom-cursor"
      aria-hidden="true"
      data-mature={treeMature ? "true" : "false"}
      data-hover={brushHover ? "true" : "false"}
      data-hidden={orbiting || finale ? "true" : "false"}
    >
      <span className="bloom-cursor__ring" />
    </div>
  );
}
