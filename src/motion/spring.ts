/**
 * A damped spring, stepped on the GSAP ticker.
 *
 * Duration-based tweens cannot follow a target that moves every frame
 * without restarting; a spring carries its own velocity and simply retargets.
 * That is what the pointer needs — magnetism, parallax, the drag offset on
 * the camera rig — and it is the "weight" the eye reads as physical.
 *
 * Semi-implicit Euler at no more than 120 steps a second, which is stable for
 * every stiffness used on this site. A spring sleeps once it is within a
 * hundredth of rest and removes itself from the ticker.
 */
import { gsap } from "./gsap";
import type { SpringConfig } from "./tokens";

const MAX_STEP = 1 / 120;
const REST = 0.01;

export interface Spring {
  readonly value: number;
  readonly velocity: number;
  readonly target: number;
  set(target: number): void;
  jump(value: number): void;
  stop(): void;
}

export function createSpring(
  config: SpringConfig,
  initial = 0,
  onUpdate?: (value: number) => void,
): Spring {
  let value = initial;
  let target = initial;
  let velocity = 0;
  let ticking = false;

  const step = (dt: number) => {
    const displacement = value - target;
    const acceleration = (-config.stiffness * displacement - config.damping * velocity) / config.mass;
    velocity += acceleration * dt;
    value += velocity * dt;
  };

  const tick = (_time: number, deltaMs: number) => {
    let remaining = Math.min(deltaMs / 1000, 0.1);
    while (remaining > 0) {
      const dt = Math.min(MAX_STEP, remaining);
      step(dt);
      remaining -= dt;
    }
    if (Math.abs(value - target) < REST && Math.abs(velocity) < REST) {
      value = target;
      velocity = 0;
      sleep();
    }
    onUpdate?.(value);
  };

  const wake = () => {
    if (ticking) return;
    ticking = true;
    gsap.ticker.add(tick);
  };

  const sleep = () => {
    if (!ticking) return;
    ticking = false;
    gsap.ticker.remove(tick);
  };

  return {
    get value() {
      return value;
    },
    get velocity() {
      return velocity;
    },
    get target() {
      return target;
    },
    set(next) {
      if (next === target) return;
      target = next;
      wake();
    },
    jump(next) {
      value = next;
      target = next;
      velocity = 0;
      sleep();
      onUpdate?.(value);
    },
    stop() {
      sleep();
    },
  };
}

/** Two springs writing one element's `translate`, which composes with any
 *  CSS `transform` the element already animates. */
export function createTranslator(element: HTMLElement, config: SpringConfig) {
  let queued = 0;
  const flush = () => {
    queued = 0;
    element.style.translate = `${x.value.toFixed(2)}px ${y.value.toFixed(2)}px`;
  };
  const schedule = () => {
    if (!queued) queued = requestAnimationFrame(flush);
  };
  const x = createSpring(config, 0, schedule);
  const y = createSpring(config, 0, schedule);
  return {
    to(nextX: number, nextY: number) {
      x.set(nextX);
      y.set(nextY);
    },
    destroy() {
      x.stop();
      y.stop();
      if (queued) cancelAnimationFrame(queued);
      element.style.removeProperty("translate");
    },
  };
}
