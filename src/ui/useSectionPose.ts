/**
 * A section takes the camera when it enters and hands it back when it leaves.
 * The pose is tweened, never scrubbed: a section is a place, not a path.
 */
import { useEffect, type RefObject } from "react";

import { gsap, ScrollTrigger, ease } from "../motion/gsap";
import { DUR, POSES, type PoseKey } from "../motion/tokens";
import { pose } from "../scene/scrub";
import { useWatl, type Section } from "../state/store";

export function useSectionPose(ref: RefObject<HTMLElement | null>, key: PoseKey & Section) {
  const setSection = useWatl((s) => s.setSection);
  const reduced = useWatl((s) => s.reduced);

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const target = POSES[key];
    const go = () => {
      setSection(key);
      const values = {
        distance: target.distance,
        azimuth: target.azimuth,
        elevation: target.elevation,
        offset: target.offset,
        bloomIntensity: target.bloomIntensity,
        azimuthNudge: 0,
      };
      if (reduced) {
        gsap.set(pose, { ...values, weight: 1 });
        return;
      }
      gsap.to(pose, { ...values, weight: 1, duration: DUR.camera, ease: ease("settle"), overwrite: "auto" });
    };
    const trigger = ScrollTrigger.create({
      trigger: element,
      start: "top 55%",
      end: "bottom 45%",
      onEnter: go,
      onEnterBack: go,
    });
    return () => trigger.kill();
  }, [ref, key, setSection, reduced]);
}
