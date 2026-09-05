/**
 * The fixed chrome: the identity top-left, the section nav and ground switch
 * top-right. It composes itself on arrival — the wordmark a letter at a time,
 * then the nav — and recedes to 34 % while the visitor orbits the branch.
 */
import { useRef } from "react";
import { useLenis } from "lenis/react";

import { gsap, useGSAP, ease } from "../motion/gsap";
import { DUR, STAGGER } from "../motion/tokens";
import { useWatl } from "../state/store";
import { GroundSwitch } from "./GroundSwitch";
import { useMagnet } from "./useMagnet";

const NAV = [
  { id: "practice", label: "Practice" },
  { id: "clients", label: "Clients" },
  { id: "contact", label: "Contact" },
] as const;

export function Chrome() {
  const ref = useRef<HTMLElement>(null);
  const orbiting = useWatl((s) => s.orbiting);
  const section = useWatl((s) => s.section);
  const reduced = useWatl((s) => s.reduced);
  const lenis = useLenis();
  useMagnet(ref, ".chrome__link");

  useGSAP(() => {
    if (!ref.current) return;
    if (reduced) {
      gsap.set(".wordmark span, .chrome__nav", { opacity: 1, y: 0 });
      return;
    }
    gsap.from(".wordmark span", {
      y: "0.85em",
      opacity: 0,
      duration: DUR.reveal,
      ease: ease("out"),
      stagger: STAGGER.letters,
      delay: 0.12,
    });
    /* The nav should feel present at once and then land: expo.out. */
    gsap.from(".chrome__nav", {
      opacity: 0,
      duration: DUR.reveal,
      ease: ease("expo"),
      delay: 0.56,
    });
  }, { scope: ref, dependencies: [reduced], revertOnUpdate: true });

  /* Section links travel on the same smoothed scroll the wheel uses, on the
     heavy settle curve, so a click reads as the page moving rather than a
     jump. Reduced motion, or no Lenis, is an instant move. */
  const onNav = (event: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    const target = document.getElementById(id);
    if (!target) return;
    event.preventDefault();
    const top = target.getBoundingClientRect().top + window.scrollY;
    if (reduced || !lenis) {
      window.scrollTo({ top, behavior: "auto" });
      return;
    }
    const curve = gsap.parseEase(ease("settle"));
    lenis.scrollTo(top, { duration: DUR.camera, easing: (t: number) => curve(t) });
  };

  return (
    <header ref={ref} className="chrome interface-layer" data-orbiting={orbiting ? "true" : "false"}>
      <a className="wordmark" href="#main" aria-label="WATL — back to the top">
        <span aria-hidden="true">W</span>
        <span aria-hidden="true">A</span>
        <span aria-hidden="true">T</span>
        <span aria-hidden="true">L</span>
      </a>
      <nav className="chrome__nav" aria-label="Sections">
        <ul>
          {NAV.map((item) => (
            <li key={item.id}>
              <a
                className="chrome__link"
                href={`#${item.id}`}
                aria-current={section === item.id ? "true" : undefined}
                onClick={(event) => onNav(event, item.id)}
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
        <GroundSwitch />
      </nav>
    </header>
  );
}
