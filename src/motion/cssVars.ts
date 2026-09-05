/**
 * Push the motion tokens into CSS custom properties, so a transition written
 * in a stylesheet uses exactly the curve a GSAP tween uses.
 */
import { DUR, EASE } from "./tokens";

export function applyMotionTokens(root: HTMLElement = document.documentElement) {
  const style = root.style;
  style.setProperty("--ease-out", EASE.out.css);
  style.setProperty("--ease-in-out", EASE.inOut.css);
  style.setProperty("--ease-settle", EASE.settle.css);
  style.setProperty("--ease-lift", EASE.lift.css);
  style.setProperty("--duration-press", `${Math.round(DUR.press * 1000)}ms`);
  style.setProperty("--duration-fast", `${Math.round(DUR.fast * 1000)}ms`);
  style.setProperty("--duration-ui", `${Math.round(DUR.ui * 1000)}ms`);
  style.setProperty("--duration-reveal", `${Math.round(DUR.reveal * 1000)}ms`);
  style.setProperty("--duration-title", `${Math.round(DUR.title * 1000)}ms`);
}
