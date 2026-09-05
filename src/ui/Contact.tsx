/**
 * The finale. By the time the visitor arrives here the wave has opened every
 * head, and the branch pulls wide and low behind the line it earned.
 */
import { useRef } from "react";

import { gsap, ScrollTrigger, SplitText, useGSAP, ease } from "../motion/gsap";
import { DUR, STAGGER } from "../motion/tokens";
import { useWatl } from "../state/store";
import { useMagnet } from "./useMagnet";
import { useSectionPose } from "./useSectionPose";

const EMAIL = "info@wattle.tech.au";
const CALENDLY_URL = "";

function calendlyHref(): string | null {
  const raw = CALENDLY_URL.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || !/(^|\.)calendly\.com$/i.test(url.hostname)) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function Contact() {
  const ref = useRef<HTMLElement>(null);
  const reduced = useWatl((s) => s.reduced);
  useSectionPose(ref, "contact");
  useMagnet(ref, ".contact__action");
  const calendly = calendlyHref();

  useGSAP(() => {
    const root = ref.current;
    if (!root || reduced) return;
    const title = root.querySelector<HTMLElement>(".contact__title");
    const rest = [...root.querySelectorAll<HTMLElement>(".contact__copy, .contact__actions")];
    if (!title) return;
    const split = new SplitText(title, { type: "lines", linesClass: "line", mask: "lines" });
    const timeline = gsap.timeline({ paused: true });
    timeline.from(split.lines, {
      yPercent: 110,
      duration: DUR.title + 0.1,
      ease: ease("settle"),
      stagger: STAGGER.lines + 0.02,
    });
    timeline.from(rest, {
      y: 24,
      opacity: 0,
      filter: "blur(4px)",
      duration: DUR.reveal,
      ease: ease("out"),
      stagger: STAGGER.rows,
    }, "-=0.6");
    ScrollTrigger.create({
      trigger: root,
      start: "top 70%",
      onEnter: () => timeline.play(),
      once: true,
    });
    return () => {
      split.revert();
    };
  }, { scope: ref, dependencies: [reduced], revertOnUpdate: true });

  return (
    <section ref={ref} className="contact section" id="contact" aria-labelledby="contact-title">
      <div className="section__inner">
        <h2 className="contact__title" id="contact-title">Help your business bloom.</h2>
        <p className="contact__copy">Bring us your next product, campaign, or ambitious idea.</p>
        <div className="contact__actions">
          <a
            className="contact__action contact__action--primary"
            href={`mailto:${EMAIL}?subject=Help%20my%20business%20bloom`}
          >
            {EMAIL}
            <svg className="arrow" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
              <path d="M2.5 9.5 9.5 2.5M4 2.5h5.5V8" />
            </svg>
          </a>
          <a
            className="contact__action"
            id="bloom-finale-calendar"
            data-booking-fallback={calendly ? "false" : "email"}
            href={calendly ?? `mailto:${EMAIL}?subject=Book%20a%20meeting%20with%20WATL&body=Hi%20WATL%2C%0A%0AWe%27d%20like%20to%20book%20a%20meeting%20about%3A%0A`}
            target={calendly ? "_blank" : undefined}
            rel={calendly ? "noreferrer" : undefined}
          >
            {calendly ? "Book on Calendly" : "Request a meeting"}
            <svg className="arrow" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
              <path d="M2.5 9.5 9.5 2.5M4 2.5h5.5V8" />
            </svg>
          </a>
        </div>
      </div>
    </section>
  );
}
