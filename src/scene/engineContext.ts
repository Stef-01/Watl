import { createContext, useContext } from "react";

import type { WattleEngine } from "./engine/wattle-engine.js";

/** The engine lives outside React state — it is built once per canvas and
 *  mutated every frame — so it is shared by reference. Components outside the
 *  canvas (the client rows, the QA bridge) reach it through this handle. */
export const engineHandle: { current: WattleEngine | null } = { current: null };

export const EngineContext = createContext<WattleEngine | null>(null);

export function useEngine(): WattleEngine {
  const engine = useContext(EngineContext);
  if (!engine) throw new Error("useEngine must be used inside the wattle scene");
  return engine;
}
