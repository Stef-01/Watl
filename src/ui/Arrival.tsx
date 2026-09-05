/**
 * The arrival. One pinned section, one scrubbed timeline, three lines of
 * type. The timeline tweens the `scrub` record the scene reads; the type is
 * choreographed on the same timeline so the words and the branch never drift.
 *
 * Every band below is in pin progress `t`; the numbers are `HERO` in tokens.
 */
import { useRef } from "react";

import { gsap, ScrollTrigger, SplitText, useGSAP, ease } from "../motion/gsap";
import { DUR, HERO, POSES, SCRUB, STAGGER } from "../motion/tokens";
import { pose, scrub } from "../scene/scrub";
import { useWatl } from "../state/store";

export function Arrival() {
  const ref = useRef<HTMLElement>(null);
  const reduced = useWatl((s) => s.reduced);
  const setHeroProgress = useWatl((s) => s.setHeroProgress);
  const setSection = useWatl((s) => s.setSection);

  useGSAP(() => {
    const root = ref.current;
    if (!root) return;
    const headline = root.querySelector<HTMLElement>(".arrival__headline");
    const practice = root.querySelector<HTMLElement>(".arrival__practice");
    const bloomLine = root.querySelector<HTMLElement>(".arrival__bloom");
    if (!headline || !practice || !bloomLine) return;

    if (reduced) {
      scrub.growth = 1;
      scrub.bloom = 1;
      Object.assign(scrub, {
        distance: POSES.arrival.distance,
        azimuth: POSES.arrival.azimuth,
        elevation: POSES.arrival.elevation,
        offset: POSES.arrival.offset,
        focus: 0,
        bokeh: 0,
        bloomIntensity: POSES.arrival.bloomIntensity,
      });
      gsap.set([headline, practice, bloomLine], { clearProps: "all" });
      gsap.set([practice, bloomLine], { opacity: 0 });
      gsap.set(headline, { opacity: 1 });
      gsap.from(headline, { opacity: 0, duration: DUR.fast, ease: ease("out") });
      return;
    }

    const split = new SplitText(headline, { type: "lines", linesClass: "line" });

    /* Arrival: the wordmark composes in Chrome; here the headline lines fade
       up, quietly, a line at a time. The shoot's pre-growth is started by the
       scene itself the moment it is ready, so it is never clobbered by a
       build. */
    gsap.set(headline, { opacity: 1 });
    gsap.from(split.lines, {
      opacity: 0,
      y: 12,
      duration: DUR.title,
      ease: ease("settle"),
      stagger: STAGGER.lines,
      delay: 0.35,
    });
    const portrait = window.innerWidth < 720;
    const pinVh = portrait ? HERO.pinVhMobile : HERO.pinVh;

    const timeline = gsap.timeline({
      defaults: { ease: "none" },
      scrollTrigger: {
        trigger: root,
        start: "top top",
        end: () => `+=${(window.innerHeight * pinVh) / 100}`,
        pin: true,
        pinSpacing: true,
        anticipatePin: 1,
        scrub: SCRUB.hero,
        invalidateOnRefresh: true,
        onUpdate: (self) => setHeroProgress(self.progress),
        onEnter: () => setSection("arrival"),
        onEnterBack: () => setSection("arrival"),
        onLeave: () => {
          gsap.to(pose, { weight: 1, duration: DUR.camera, ease: ease("settle"), overwrite: "auto" });
        },
        onLeaveBack: () => {
          gsap.to(pose, { weight: 0, duration: DUR.camera, ease: ease("settle"), overwrite: "auto" });
        },
      },
    });

    /* The branch: growth across the first band, then the wave. Both are
       linear in t; the botanical curves live in the engine. */
    /* immediateRender is off so creating the timeline does not stamp the
       pre-growth value over the arrival tween; the first scroll takes over. */
    timeline.fromTo(scrub, { growth: HERO.preGrowth }, { growth: 1, duration: HERO.growthEnd, immediateRender: false }, 0);
    /* The wave reads pin progress directly; its bands (WAVE in the engine)
       are authored in the same t-space as the camera acts above. */
    timeline.fromTo(scrub, { bloom: 0 }, { bloom: 1, duration: 1 }, 0);
    /* The camera holds a wider frame while the shoot rises and comes in to
       the authored portrait as it matures. */
    timeline.fromTo(
      scrub,
      { distance: POSES.load.distance },
      { distance: POSES.grown.distance, duration: HERO.growthEnd, ease: ease("inOut") },
      0,
    );
    /* The close-up act: in to the densest raceme, up and around, with depth
       of field rising and falling inside it. */
    const [closeIn, closeOut] = HERO.closeup;
    timeline.to(scrub, {
      distance: POSES.closeup.distance,
      azimuth: POSES.closeup.azimuth,
      elevation: POSES.closeup.elevation,
      offset: POSES.closeup.offset,
      focus: 1,
      bloomIntensity: POSES.closeup.bloomIntensity,
      duration: (closeOut - closeIn) * 0.55,
      ease: ease("inOut"),
    }, closeIn);
    const [dofIn, dofFull] = HERO.dof;
    timeline.to(scrub, { bokeh: 1, duration: dofFull - dofIn, ease: ease("inOut") }, dofIn);
    const [settleIn, settleOut] = HERO.settle;
    timeline.to(scrub, {
      distance: POSES.arrival.distance,
      azimuth: POSES.arrival.azimuth,
      elevation: POSES.arrival.elevation,
      offset: POSES.arrival.offset,
      focus: 0,
      bokeh: 0,
      bloomIntensity: POSES.arrival.bloomIntensity,
      duration: settleOut - settleIn,
      ease: ease("inOut"),
    }, settleIn);

    /* The type. Headline out, practice line in, bloom line in, everything out. */
    /* The headline leaves as a fade, no travel: it is the quiet line the
       branch grows past. */
    const [exitIn, exitOut] = HERO.headlineExit;
    timeline.to(split.lines, {
      opacity: 0,
      duration: exitOut - exitIn,
      ease: ease("inOut"),
      stagger: STAGGER.lines * 0.5,
    }, exitIn);
    const [practiceIn, practiceOut] = HERO.practiceLine;
    timeline.fromTo(practice, { opacity: 0, y: 24 }, {
      opacity: 1,
      y: 0,
      duration: (practiceOut - practiceIn) * 0.5,
      ease: ease("out"),
    }, practiceIn + (practiceOut - practiceIn) * 0.3);
    timeline.to(practice, { opacity: 0, y: -16, duration: 0.06, ease: ease("inOut") }, closeIn - 0.02);
    const [bloomIn, bloomOut] = HERO.bloomLine;
    timeline.fromTo(bloomLine, { opacity: 0, y: 24 }, {
      opacity: 1,
      y: 0,
      duration: (bloomOut - bloomIn) * 0.6,
      ease: ease("out"),
    }, bloomIn);
    timeline.to(bloomLine, { opacity: 0, y: -16, duration: 0.06, ease: ease("inOut") }, settleIn - 0.04);

    ScrollTrigger.refresh();
    return () => {
      split.revert();
    };
  }, { scope: ref, dependencies: [reduced], revertOnUpdate: true });

  return (
    <section ref={ref} className="arrival section" id="arrival" aria-labelledby="arrival-title">
      <div className="arrival__inner">
        <h1 className="arrival__headline" id="arrival-title">
          Technology <em>design</em>
        </h1>
        <p className="arrival__practice label">
          Digital products · Interfaces · Generative systems
        </p>
        <p className="arrival__bloom">
          Systems that grow <em>into form.</em>
        </p>
      </div>
    </section>
  );
}
