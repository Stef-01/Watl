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

applyMotionTokens();

if (import.meta.env.DEV) {
  const { exposeDebug } = await import("./dev/expose");
  exposeDebug();
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
