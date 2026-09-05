import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "@fontsource-variable/geist-mono/wght.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/grounds.css";
import "./styles/chrome.css";
import "./styles/sections.css";

import { applyMotionTokens } from "./motion/cssVars";
import { App } from "./App";
import { createWattleEngine } from "./scene/engine/wattle-engine.js";
import { sceneConfig } from "./scene/profile";
import { pageQuery, useWatl } from "./state/store";

applyMotionTokens();

/* The branch is built here, before React mounts, so its 270 ms of geometry
   work lands on a still-black page instead of freezing the wordmark half
   way through its rise. The scene picks the same engine up by its key. */
{
  const { reduced, finePointer } = useWatl.getState();
  createWattleEngine(sceneConfig(pageQuery, reduced, finePointer), {});
}

if (import.meta.env.DEV) {
  const { exposeDebug } = await import("./dev/expose");
  exposeDebug();
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
