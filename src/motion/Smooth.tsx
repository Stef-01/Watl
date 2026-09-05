/**
 * Lenis, driven by the GSAP ticker, reporting to ScrollTrigger.
 *
 * Lenis keeps native scrolling (no transformed wrapper), so ScrollTrigger pins
 * with `position: fixed` exactly as it would without it. One ticker owns
 * both, which is what keeps a scrubbed pin and a smoothed scroll in the same
 * frame. Under reduced motion the component renders nothing and the document
 * scrolls natively.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { ReactLenis, type LenisRef } from "lenis/react";

import { gsap, ScrollTrigger } from "./gsap";
import { LENIS } from "./tokens";

export function Smooth({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const ref = useRef<LenisRef>(null);

  useEffect(() => {
    if (!enabled) return undefined;
    const tick = (time: number) => {
      ref.current?.lenis?.raf(time * 1000);
    };
    const onScroll = () => ScrollTrigger.update();
    const lenis = ref.current?.lenis;
    lenis?.on("scroll", onScroll);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    return () => {
      lenis?.off("scroll", onScroll);
      gsap.ticker.remove(tick);
    };
  }, [enabled]);

  if (!enabled) return <>{children}</>;

  return (
    <ReactLenis
      root
      ref={ref}
      options={{
        autoRaf: false,
        lerp: LENIS.lerp,
        wheelMultiplier: LENIS.wheelMultiplier,
        touchMultiplier: LENIS.touchMultiplier,
        smoothWheel: true,
        syncTouch: false,
      }}
    >
      {children}
    </ReactLenis>
  );
}
