/**
 * One GSAP instance, with the site's eases registered before anything can
 * tween. Import `gsap` from here, never from the package, so the eases are
 * guaranteed to exist and the ScrollTrigger / Lenis bridge is guaranteed to
 * be wired.
 */
import { gsap } from "gsap";
import { CustomEase } from "gsap/CustomEase";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";

import { EASE, type EaseKey } from "./tokens";

gsap.registerPlugin(ScrollTrigger, CustomEase, SplitText, useGSAP);

for (const key of Object.keys(EASE) as EaseKey[]) {
  const curve = EASE[key];
  if (curve.path && !CustomEase.get(curve.id)) {
    CustomEase.create(curve.id, curve.path);
  }
}

/** The ease id GSAP understands for one of the site's curves. */
export function ease(key: EaseKey): string {
  return EASE[key].id;
}

gsap.defaults({ ease: ease("out") });

export { gsap, ScrollTrigger, SplitText, useGSAP, CustomEase };
