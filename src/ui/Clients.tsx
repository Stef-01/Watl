/**
 * Clients. Two rows with the authored single-stroke arrow; hovering a row
 * warms the branch's selection light, so the page answers the cursor with
 * light rather than with chrome.
 */
import { useRef } from "react";

import { gsap, ease } from "../motion/gsap";
import { SELECTION_LIGHT } from "../motion/tokens";
import { engineHandle } from "../scene/engineContext";
import { useWatl } from "../state/store";
import { useReveal } from "./useReveal";
import { useSectionPose } from "./useSectionPose";
import { useMagnet } from "./useMagnet";

const CLIENTS = [
  { index: "01", name: "Bay Health", href: "https://bayhealth.com.au/", domain: "bayhealth.com.au" },
  { index: "02", name: "ADHDme", href: "https://www.adhdme.au/", domain: "adhdme.au" },
];

export function Clients() {
  const ref = useRef<HTMLElement>(null);
  const hovered = useWatl((s) => s.hoveredClient);
  const setHovered = useWatl((s) => s.setHoveredClient);
  const reduced = useWatl((s) => s.reduced);
  useSectionPose(ref, "clients");
  useReveal(ref, ".client, .clients__label");
  useMagnet(ref, ".client__arrow-wrap");

  const warm = (index: number) => {
    setHovered(index);
    const engine = engineHandle.current;
    if (!engine) return;
    const light = engine.selectionLight;
    if (index >= 0) {
      /* Light the canopy from its densest raceme; the row is the reason, the
         branch is the answer. */
      light.position.copy(engine.focusTarget);
    }
    const intensity = index >= 0 ? SELECTION_LIGHT.intensity : 0;
    if (reduced) {
      light.intensity = intensity;
      return;
    }
    gsap.to(light, { intensity, duration: SELECTION_LIGHT.duration, ease: ease("out"), overwrite: "auto" });
  };

  return (
    <section ref={ref} className="clients section" id="clients" aria-labelledby="clients-title">
      <div className="section__inner">
        <p className="clients__label label" id="clients-title">Selected clients</p>
        <ul className="clients__rows" data-hovered={hovered >= 0 ? "true" : "false"}>
          {CLIENTS.map((client, index) => (
            <li key={client.index} className="client" data-hovered={hovered === index ? "true" : "false"}>
              <a
                className="client__link"
                href={client.href}
                rel="noreferrer"
                onPointerEnter={() => warm(index)}
                onPointerLeave={() => warm(-1)}
                onFocus={() => warm(index)}
                onBlur={() => warm(-1)}
              >
                <span className="client__index label" aria-hidden="true">{client.index}</span>
                <span className="client__name">{client.name}</span>
                <span className="client__domain label" aria-hidden="true">{client.domain}</span>
                <span className="client__arrow-wrap" aria-hidden="true">
                  <svg className="arrow client__arrow" viewBox="0 0 12 12" focusable="false">
                    <path d="M2.5 9.5 9.5 2.5M4 2.5h5.5V8" />
                  </svg>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
