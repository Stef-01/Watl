/**
 * The lifecycle meter. It reports the phase the branch is in, the exact growth
 * percentage or open-head count, and a one-line prompt; the fill is written
 * directly, without a trailing transition, so it stays phase-accurate.
 */
import { useEffect, useRef } from "react";

import { TREE_BUD_MATURITY_START } from "../scene/engine/wattle-engine.js";
import { useWatl } from "../state/store";

export function Cultivation() {
  const cultivation = useWatl((s) => s.cultivation);
  const sceneState = useWatl((s) => s.sceneState);
  const orbiting = useWatl((s) => s.orbiting);
  const section = useWatl((s) => s.section);
  const fillRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!fillRef.current) return;
    const progress = sceneState === "error" ? 1 : cultivation?.progress ?? 0;
    fillRef.current.style.transform = `scaleX(${progress.toFixed(4)})`;
  }, [cultivation, sceneState]);

  const phase = sceneState === "error" ? "still" : cultivation?.phase ?? "growth";
  const label = sceneState === "error" ? "Still view" : cultivation?.label ?? "Young shoot";
  const value = sceneState === "error" ? "—" : cultivation?.value ?? "00%";
  const prompt = sceneState === "error"
    ? "Interactive growth is unavailable"
    : cultivation?.prompt ?? "Scroll to grow the branch";

  return (
    <aside
      className="cultivation interface-layer"
      id="cultivation"
      aria-hidden="true"
      data-phase={phase}
      data-orbiting={orbiting ? "true" : "false"}
      data-section={section}
    >
      <div className="cultivation__state">
        <span id="cultivation-phase">{label}</span>
        <span className="cultivation__value" id="cultivation-value">{value}</span>
      </div>
      <span className="cultivation__track" style={{ "--bud-mark": `${TREE_BUD_MATURITY_START * 100}%` } as React.CSSProperties}>
        <span ref={fillRef} className="cultivation__fill" id="cultivation-fill" />
      </span>
      <p className="cultivation__prompt" id="cultivation-prompt">{prompt}</p>
    </aside>
  );
}
