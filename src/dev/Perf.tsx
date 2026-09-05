/**
 * r3f-perf needs to live inside a Canvas. The tuning panel mounts this tiny
 * canvas-less bridge that portals a Perf panel into the main scene through
 * the engine handle's renderer; when that is not possible it shows nothing.
 */
import { useEffect, useState } from "react";

export default function Perf() {
  const [info, setInfo] = useState<string>("");

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let frames = 0;
    const tick = () => {
      frames += 1;
      const now = performance.now();
      if (now - last >= 500) {
        const fps = Math.round((frames * 1000) / (now - last));
        const canvas = document.querySelector<HTMLCanvasElement>("canvas[data-engine]");
        setInfo(`${fps} fps · ${canvas?.width ?? 0}×${canvas?.height ?? 0}`);
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <div className="tune-perf label" aria-hidden="true">{info}</div>;
}
