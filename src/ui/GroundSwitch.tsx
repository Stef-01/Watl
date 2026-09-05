/**
 * The ground switch. A small dot; it names the current ground on approach and
 * opens a row of swatches on click. Changing ground dissolves rather than
 * cuts: gradient stacks cannot interpolate, so the backdrop dips to 26 % and
 * the palette is swapped at the darkest frame. The dissolve is cancellable
 * and a new selection retargets from the backdrop's live opacity.
 */
import { useCallback, useEffect, useRef } from "react";

import { gsap, ease } from "../motion/gsap";
import { DUR } from "../motion/tokens";
import { GROUNDS, GROUND_KEY, useWatl, type Ground } from "../state/store";

const SWAP_OFFSET = 0.42;
const DARKEST = 0.26;

export function GroundSwitch() {
  const ground = useWatl((s) => s.ground);
  const open = useWatl((s) => s.groundOpen);
  const setGround = useWatl((s) => s.setGround);
  const setOpen = useWatl((s) => s.setGroundOpen);
  const setStatus = useWatl((s) => s.setStatus);
  const reduced = useWatl((s) => s.reduced);
  const rootRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const nameRef = useRef<HTMLSpanElement>(null);
  const dissolve = useRef<gsap.core.Timeline | null>(null);

  const current = GROUNDS.find((option) => option.id === ground) ?? GROUNDS[0];

  const paint = useCallback((id: Ground) => {
    const option = GROUNDS.find((item) => item.id === id) ?? GROUNDS[0];
    document.documentElement.dataset.ground = option.id;
    document.getElementById("theme-color")?.setAttribute("content", option.theme);
  }, []);

  useEffect(() => {
    paint(ground);
  }, [ground, paint]);

  const choose = (id: Ground, announce: boolean) => {
    if (id === ground) return;
    const backdrop = document.querySelector<HTMLElement>(".backdrop");
    dissolve.current?.kill();
    if (!backdrop || reduced || document.hidden) {
      setGround(id);
    } else {
      const from = Number(getComputedStyle(backdrop).opacity) || 1;
      const timeline = gsap.timeline({ defaults: { ease: ease("inOut") } });
      timeline
        .fromTo(backdrop, { opacity: from }, { opacity: DARKEST, duration: DUR.dissolve * SWAP_OFFSET })
        .call(() => setGround(id))
        .to(backdrop, { opacity: 1, duration: DUR.dissolve * (1 - SWAP_OFFSET) });
      dissolve.current = timeline;
    }
    const option = GROUNDS.find((item) => item.id === id);
    if (announce && option) setStatus(`${option.label} background.`);
    try {
      window.localStorage.setItem(GROUND_KEY, id);
    } catch {
      /* Not remembering the choice is no reason to refuse it. */
    }
  };

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target as Element).closest(".ground-switch")) setOpen(false);
    };
    const onFocusIn = (event: FocusEvent) => {
      if (!(event.target as Element).closest(".ground-switch")) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, setOpen]);

  const onTrayKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keys.includes(event.key)) return;
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button")];
    const index = Math.max(0, buttons.indexOf(document.activeElement as HTMLButtonElement));
    let next = index;
    if (event.key === "Home") next = 0;
    else if (event.key === "End") next = buttons.length - 1;
    else if (event.key === "ArrowRight") next = (index + 1) % buttons.length;
    else next = (index - 1 + buttons.length) % buttons.length;
    event.preventDefault();
    buttons[next]?.focus();
  };

  const preview = (label: string | null) => {
    if (nameRef.current) nameRef.current.textContent = label ?? current.label;
  };

  return (
    <div ref={rootRef} className="ground-switch" role="group" aria-label="Background">
      <span ref={nameRef} className="ground-switch__name" aria-hidden="true">{current.label}</span>
      <button
        ref={toggleRef}
        className="ground-switch__toggle"
        type="button"
        aria-expanded={open}
        aria-controls="ground-swatches"
        aria-label={`Background: ${current.label}. Change it.`}
        onClick={() => setOpen(!open)}
      >
        <span className="ground-switch__dot" aria-hidden="true" />
      </button>
      <div
        className="ground-switch__swatches"
        id="ground-swatches"
        role="group"
        aria-label="Background choices"
        aria-hidden={!open}
        data-open={open ? "true" : "false"}
        inert={!open}
        onKeyDown={onTrayKey}
      >
        {GROUNDS.map((option) => (
          <button
            key={option.id}
            type="button"
            className="ground-swatch"
            style={{ "--swatch": option.swatch } as React.CSSProperties}
            aria-label={option.label}
            aria-pressed={option.id === ground}
            onPointerEnter={() => preview(option.label)}
            onPointerLeave={() => preview(null)}
            onFocus={() => preview(option.label)}
            onBlur={() => preview(null)}
            onClick={() => {
              choose(option.id, true);
              setOpen(false);
              toggleRef.current?.focus();
            }}
          />
        ))}
      </div>
    </div>
  );
}
