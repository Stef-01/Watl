import { HIGH_PROFILE, LOW_PROFILE } from "./engine/wattle-engine.js";

export type Profile = typeof HIGH_PROFILE | typeof LOW_PROFILE;

interface NavigatorHints extends Navigator {
  deviceMemory?: number;
  connection?: { saveData?: boolean };
}

/** The constrained profile keeps the same botanical sequence at a stable
 *  30 fps and a 1.12 DPR ceiling. `?quality=high|low` overrides it. */
export function chooseProfile(width: number, query: URLSearchParams): Profile {
  const requested = query.get("quality");
  if (requested === "high") return HIGH_PROFILE;
  if (requested === "low") return LOW_PROFILE;

  const hints = navigator as NavigatorHints;
  const memory = Number(hints.deviceMemory || 8);
  const cores = Number(navigator.hardwareConcurrency || 8);
  const saveData = Boolean(hints.connection?.saveData);
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const constrained = saveData || coarse || width < 680 || memory <= 4 || cores <= 4;
  return constrained ? LOW_PROFILE : HIGH_PROFILE;
}

export function readSeed(query: URLSearchParams): number | undefined {
  const value = query.get("seed");
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed >>> 0 : undefined;
}
