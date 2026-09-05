/**
 * The practice. Three rows; hovering one lets the others recede and nudges
 * the camera a few degrees, so the branch turns to face the work.
 */
import { useRef } from "react";

import { gsap, ease } from "../motion/gsap";
import { PRACTICE_AZIMUTHS, PRACTICE_HOVER_DURATION, POSES } from "../motion/tokens";
import { pose } from "../scene/scrub";
import { useWatl } from "../state/store";
import { useReveal } from "./useReveal";
import { useSectionPose } from "./useSectionPose";

const ROWS = [
  {
    index: "01",
    title: "Digital products",
    copy: "Products built end to end: the strategy, the interface, and the engineering underneath it.",
  },
  {
    index: "02",
    title: "Interfaces",
    copy: "Interfaces with weight and restraint, designed in the browser and shipped from it.",
  },
  {
    index: "03",
    title: "Generative systems",
    copy: "Procedural, living systems — like this branch — that render from rules rather than files.",
  },
];

export function Practice() {
  const ref = useRef<HTMLElement>(null);
  const hovered = useWatl((s) => s.hoveredPractice);
  const setHovered = useWatl((s) => s.setHoveredPractice);
  const reduced = useWatl((s) => s.reduced);
  useSectionPose(ref, "practice");
  useReveal(ref, ".practice__row, .practice__label");

  const nudge = (index: number) => {
    setHovered(index);
    const target = index < 0 ? 0 : PRACTICE_AZIMUTHS[index] - POSES.practice.azimuth;
    if (reduced) {
      pose.azimuthNudge = 0;
      return;
    }
    gsap.to(pose, { azimuthNudge: target, duration: PRACTICE_HOVER_DURATION, ease: ease("settle"), overwrite: "auto" });
  };

  return (
    <section ref={ref} className="practice section" id="practice" aria-labelledby="practice-title">
      <div className="section__inner">
        <p className="practice__label label" id="practice-title">Practice</p>
        <ol className="practice__rows" data-hovered={hovered >= 0 ? "true" : "false"}>
          {ROWS.map((row, index) => (
            <li
              key={row.index}
              className="practice__row"
              data-hovered={hovered === index ? "true" : "false"}
              onPointerEnter={() => nudge(index)}
              onPointerLeave={() => nudge(-1)}
            >
              <span className="practice__index label" aria-hidden="true">{row.index}</span>
              <h2 className="practice__title">{row.title}</h2>
              <p className="practice__copy">{row.copy}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
