import { useEffect } from "react";

import { Smooth } from "./motion/Smooth";
import { ScrollTrigger } from "./motion/gsap";
import { pageQuery, useWatl } from "./state/store";
import { Stage } from "./scene/Stage";
import { Backdrop } from "./ui/Backdrop";
import { Chrome } from "./ui/Chrome";
import { Cultivation } from "./ui/Cultivation";
import { ScrollCue } from "./ui/ScrollCue";
import { BloomCursor } from "./ui/BloomCursor";
import { SceneStatus } from "./ui/SceneStatus";
import { Arrival } from "./ui/Arrival";
import { Practice } from "./ui/Practice";
import { Clients } from "./ui/Clients";
import { Contact } from "./ui/Contact";
import { Footer } from "./ui/Footer";
import { Tuning } from "./dev/Tuning";

const poster = pageQuery.get("poster") === "1";

/** Media queries and visibility are watched, not sampled once, because each
 *  can change while the page is open. */
function useEnvironment() {
  const setReduced = useWatl((s) => s.setReduced);
  const setFinePointer = useWatl((s) => s.setFinePointer);
  const setHidden = useWatl((s) => s.setHidden);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const onReduced = () => {
      setReduced(reduced.matches);
      document.documentElement.dataset.motion = reduced.matches ? "reduced" : "full";
    };
    const onFine = () => setFinePointer(fine.matches);
    const onVisibility = () => {
      setHidden(document.hidden);
      document.documentElement.dataset.ambientMotion = document.hidden ? "paused" : "running";
    };
    onReduced();
    onFine();
    onVisibility();
    reduced.addEventListener("change", onReduced);
    fine.addEventListener("change", onFine);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      reduced.removeEventListener("change", onReduced);
      fine.removeEventListener("change", onFine);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [setReduced, setFinePointer, setHidden]);
}

export function App() {
  useEnvironment();
  const reduced = useWatl((s) => s.reduced);
  const tune = useWatl((s) => s.tune);

  useEffect(() => {
    document.documentElement.classList.toggle("poster-mode", poster);
  }, []);

  /* Self-hosted fonts arrive within the first frames, but line splitting and
     pin measurements must not run against fallback metrics. */
  useEffect(() => {
    let cancelled = false;
    document.fonts.ready.then(() => {
      if (cancelled) return;
      document.documentElement.classList.add("fonts-ready");
      ScrollTrigger.refresh();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Smooth enabled={!reduced && !poster}>
      <Backdrop />
      <Stage />
      <BloomCursor />
      {!poster && (
        <>
          <Chrome />
          <Cultivation />
          <ScrollCue />
          <SceneStatus />
        </>
      )}
      <main className="flow" id="main" data-poster={poster ? "true" : "false"}>
        <Arrival />
        {!poster && (
          <>
            <Practice />
            <Clients />
            <Contact />
            <Footer />
          </>
        )}
      </main>
      {tune && <Tuning />}
    </Smooth>
  );
}
