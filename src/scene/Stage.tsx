/**
 * The fixed stage: a keyboard-focusable wrapper around the canvas, the
 * still-image fallback, and the loader. React Three Fiber owns everything
 * inside the canvas; this component owns the accessible contract around it.
 */
import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { NoToneMapping, SRGBColorSpace } from "three";

import { DPR } from "../motion/tokens";
import { pageQuery, useWatl } from "../state/store";
import { chooseProfile } from "./profile";
import { WattleScene } from "./WattleScene";
import { useStageKeyboard } from "./useStageKeyboard";

const poster = pageQuery.get("poster") === "1";

class SceneBoundary extends Component<{ onError(error: Error): void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    this.props.onError(error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function Stage() {
  const stageRef = useRef<HTMLDivElement>(null);
  const sceneState = useWatl((s) => s.sceneState);
  const setSceneState = useWatl((s) => s.setSceneState);
  const brushHover = useWatl((s) => s.brushHover);
  const treeMature = useWatl((s) => s.treeMature);
  const treeStage = useWatl((s) => s.treeStage);
  const finale = useWatl((s) => s.finale);
  const setProfile = useWatl((s) => s.setProfile);
  const [pointerFocus, setPointerFocus] = useState(false);

  const profile = useMemo(() => {
    const chosen = chooseProfile(window.innerWidth, pageQuery);
    return chosen;
  }, []);

  useEffect(() => {
    setProfile(profile.id);
  }, [profile, setProfile]);

  const onError = useCallback((error: Error) => {
    console.error("Wattle 3D initialization failed", error);
    setSceneState("error", String(error?.message ?? error));
  }, [setSceneState]);

  /* The watchdog. If the scene never reports ready — a module that failed to
     resolve, a GPU that never produced a context — the still is shown rather
     than an empty frame. Eight seconds is the floor, not a timeout on a slow
     phone: a scene that is still building keeps its loader. */
  useEffect(() => {
    if (sceneState !== "loading") return undefined;
    const timer = window.setTimeout(() => {
      if (useWatl.getState().sceneState === "loading" && !document.querySelector("canvas[data-engine]")) {
        setSceneState("error", "The 3D branch did not start.");
      }
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [sceneState, setSceneState]);

  useStageKeyboard(stageRef);

  const dpr = profile.id === "high" ? DPR.high : DPR.low;

  return (
    <section
      ref={stageRef}
      className="stage"
      id="wattle-stage"
      data-testid="wattle-stage"
      data-state={sceneState}
      data-bloom-hover={brushHover ? "true" : "false"}
      data-bloom-finale={finale ? "true" : "false"}
      data-tree-stage={treeStage}
      data-tree-mature={treeMature ? "true" : "false"}
      data-pointer-focus={pointerFocus ? "true" : undefined}
      tabIndex={0}
      role="group"
      aria-label="Interactive 3D Golden Wattle branch growing from young shoot to bloom"
      aria-describedby="scene-description scene-pointer-instructions keyboard-instructions"
      aria-keyshortcuts="Enter Space ArrowUp ArrowDown ArrowLeft ArrowRight + - Home"
      aria-busy={sceneState === "loading"}
      onPointerDown={() => setPointerFocus(true)}
      onKeyDown={() => setPointerFocus(false)}
      onBlur={() => setPointerFocus(false)}
    >
      {sceneState !== "error" && (
        <SceneBoundary onError={onError}>
          <Canvas
            id="wattle-canvas"
            className="stage__canvas"
            dpr={[dpr[0], dpr[1]]}
            frameloop="demand"
            flat
            gl={{
              antialias: false,
              alpha: true,
              powerPreference: "high-performance",
              preserveDrawingBuffer: poster,
              stencil: false,
            }}
            camera={{ fov: 34, near: 0.04, far: 40, position: [0, 0, 6] }}
            onCreated={({ gl }) => {
              gl.setClearColor(0x000000, 0);
              gl.outputColorSpace = SRGBColorSpace;
              gl.toneMapping = NoToneMapping;
              gl.toneMappingExposure = 1.1;
              gl.domElement.dataset.engine = "wattle";
              gl.domElement.setAttribute("aria-hidden", "true");
            }}
            style={{ touchAction: "pan-y" }}
          >
            <Suspense fallback={null}>
              <WattleScene profile={profile} stageRef={stageRef} />
            </Suspense>
          </Canvas>
        </SceneBoundary>
      )}

      <img
        className="stage__fallback"
        id="scene-fallback"
        data-testid="scene-fallback"
        src={sceneState === "error" ? "/assets/wattle-golden-poster.webp" : undefined}
        width="1440"
        height="900"
        decoding="async"
        alt="A mature Golden Wattle branch with a slight diagonal lean, long narrow green phyllodes, and dense strings of spherical yellow flower heads."
        hidden={sceneState !== "error"}
      />

      <div className="loader" id="scene-loading" data-testid="scene-loading" aria-hidden="true" data-visible={sceneState === "loading" ? "true" : "false"}>
        <p>Growing the 3D wattle branch</p>
        <span className="loader__track"><span /></span>
      </div>

      {sceneState === "error" && (
        <div className="scene-error" id="scene-error" data-testid="scene-error">
          <p className="scene-error__title">The 3D branch could not open.</p>
          <p className="scene-error__copy">A still Golden Wattle is shown instead.</p>
          <button id="retry-button" type="button" onClick={() => window.location.reload()}>Reload</button>
        </div>
      )}
    </section>
  );
}
