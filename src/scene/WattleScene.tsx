/**
 * Inside the canvas. Builds the engine once, mounts its scene graph as a
 * primitive, and runs the one frame loop that advances growth, bloom, sway,
 * the camera rig and the effects.
 */
import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import type { PerspectiveCamera } from "three";

import { createWattleEngine, type WattleEngine } from "./engine/wattle-engine.js";
import type { Profile } from "./profile";
import { readSeed } from "./profile";
import { EngineContext, engineHandle } from "./engineContext";
import { CameraRig } from "./CameraRig";
import { Effects } from "./Effects";
import { Interaction } from "./Interaction";
import { QaBridge } from "./QaBridge";
import { ScenePerf } from "../dev/ScenePerf";
import { DPR } from "../motion/tokens";
import { scrub } from "./scrub";
import { pageQuery, useWatl, type Cultivation } from "../state/store";
import { gsap, ease } from "../motion/gsap";
import { DUR, HERO } from "../motion/tokens";
import { AUTHORED_DRIFT_VALUE } from "./engine/wattle-engine.js";

interface Props {
  profile: Profile;
  stageRef: RefObject<HTMLDivElement | null>;
}

function queryRecord(query: URLSearchParams): Record<string, string> {
  const record: Record<string, string> = {};
  query.forEach((value, key) => {
    record[key] = value;
  });
  return record;
}

export function WattleScene({ profile, stageRef }: Props) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const viewport = useThree((s) => s.viewport);
  const setDpr = useThree((s) => s.setDpr);

  const setCultivation = useWatl((s) => s.setCultivation);
  const setStatus = useWatl((s) => s.setStatus);
  const setTree = useWatl((s) => s.setTree);
  const setBrushHover = useWatl((s) => s.setBrushHover);
  const setFinale = useWatl((s) => s.setFinale);
  const setOrbiting = useWatl((s) => s.setOrbiting);
  const setSceneState = useWatl((s) => s.setSceneState);

  const qa = useWatl((s) => s.qa);
  const reduced = useWatl((s) => s.reduced);
  const finePointer = useWatl((s) => s.finePointer);
  const hidden = useWatl((s) => s.hidden);
  const ground = useWatl((s) => s.ground);
  const tune = useWatl((s) => s.tune);

  /* The engine is built once. Its hooks write to the store only on change,
     so the React tree re-renders on state, never on frames. */
  const engine = useMemo<WattleEngine>(() => {
    const query = pageQuery;
    const qaGrowth = query.get("qaGrowth");
    const forcedGrowth = qaGrowth !== null ? Number(qaGrowth) : null;
    const initialGrowth = forcedGrowth !== null && Number.isFinite(forcedGrowth)
      ? forcedGrowth
      : qa || reduced || query.get("motion") === "off" || query.get("poster") === "1" ? 1 : 0;
    const created = createWattleEngine(
      {
        profile,
        seed: readSeed(query),
        qa,
        poster: query.get("poster") === "1",
        reduced,
        finePointer,
        initialGrowth,
        query: queryRecord(query),
        camera,
      },
      {
        cultivation: (report) => setCultivation(report as Cultivation),
        status: (message) => setStatus(message),
        stageData: (key, value) => {
          const stage = stageRef.current;
          if (!stage) return;
          if (key === "treeStage" || key === "treeMature") {
            setTree(
              key === "treeMature" ? value === "true" : useWatl.getState().treeMature,
              key === "treeStage" ? value ?? "shoot" : useWatl.getState().treeStage,
            );
          } else if (key === "bloomHover") {
            setBrushHover(value === "true");
          } else if (value === null) {
            delete stage.dataset[key];
          } else {
            stage.dataset[key] = value;
          }
        },
        finale: () => setFinale(true),
        invalidate: () => invalidate(),
        flag: (name, value) => {
          if (name === "orbiting") setOrbiting(value);
        },
      },
    );
    if (initialGrowth > 0) {
      scrub.growth = initialGrowth;
      scrub.bloom = query.get("qaBloomWave") === "0" ? 0 : reduced ? 1 : 0;
    }
    return created;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    engine.attach({ camera, renderer: gl });
    engineHandle.current = engine;
    setSceneState("ready");
    setStatus(engine.growth.complete
      ? "The Golden Wattle branch is mature. Scroll, or move across its buds, to help it bloom."
      : "A young Golden Wattle shoot is ready to grow as you scroll.");
    performance.mark("wattle-scene-ready");
    if (qa) engine.qa.applyQuery();
    /* The shoot pre-grows as the canvas fades in, so the first frame has
       life before the visitor scrolls. Growth beyond this is the scroll's. */
    if (!qa && !reduced && scrub.growth < HERO.preGrowth) {
      gsap.fromTo(scrub, { growth: scrub.growth }, {
        growth: HERO.preGrowth,
        duration: DUR.preGrow,
        ease: ease("out"),
        delay: 0.2,
        overwrite: false,
        onUpdate: () => invalidate(),
      });
    }
    /* No dispose on cleanup: StrictMode runs this cleanup once on mount, and
       the engine is a document-lifetime singleton. `createWattleEngine`
       disposes a stale engine itself when a new one is needed. */
    return () => {
      if (engineHandle.current === engine) engineHandle.current = null;
    };
  }, [engine, camera, gl, qa, reduced, invalidate, setSceneState, setStatus]);

  /* Resize: the engine's authored fit is recomputed and the point-sprite
     materials learn the real pixel ratio. */
  useEffect(() => {
    const rect = gl.domElement.getBoundingClientRect();
    engine.resize(size.width, size.height, viewport.dpr, {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    });
    invalidate();
  }, [engine, gl, size.width, size.height, viewport.dpr, invalidate]);

  useEffect(() => {
    engine.setReduced(reduced);
    if (reduced) {
      scrub.growth = 1;
      scrub.bloom = 1;
    }
    invalidate();
  }, [engine, reduced, invalidate]);

  useEffect(() => {
    engine.setFinePointer(finePointer);
  }, [engine, finePointer]);

  useEffect(() => {
    engine.setHidden(hidden);
    if (!hidden) invalidate();
  }, [engine, hidden, invalidate]);

  useEffect(() => {
    engine.setThreadsVisible(ground !== "night");
    invalidate();
  }, [engine, ground, invalidate]);

  useEffect(() => {
    engine.setBreeze(AUTHORED_DRIFT_VALUE);
  }, [engine]);

  /* The frame loop. The canvas runs on demand; this schedules the next frame
     only while something is moving, and at the profile's cadence. */
  const lastFrame = useRef(0);
  const lastGrowth = useRef(-1);
  const lastBloom = useRef(-1);
  const pending = useRef(0);

  useFrame((_, delta) => {
    const now = performance.now();
    if (lastGrowth.current !== scrub.growth) {
      lastGrowth.current = scrub.growth;
      engine.setGrowth(scrub.growth);
    }
    if (lastBloom.current !== scrub.bloom) {
      lastBloom.current = scrub.bloom;
      engine.setScrollBloom(scrub.bloom);
    }
    const autonomous = !hidden;
    const result = engine.update(now, Math.min(delta, 0.05), { autonomous });
    lastFrame.current = now;

    if (result.animating || result.autonomous) {
      const interval = engine.profile.frameIntervalMs;
      if (interval > 0) {
        if (!pending.current) {
          pending.current = window.setTimeout(() => {
            pending.current = 0;
            invalidate();
          }, interval);
        }
      } else {
        invalidate();
      }
    }
  }, 0);

  useEffect(() => () => {
    if (pending.current) window.clearTimeout(pending.current);
  }, []);

  /* drei's PerformanceMonitor watches the frame rate the composer actually
     achieves and trades pixel ratio for it: a sustained dip drops the canvas
     to the profile's floor, a recovery restores the cap, and after three
     flip-flops it settles on the floor for good. */
  const dprRange = engine.profile.id === "high" ? DPR.high : DPR.low;

  return (
    <EngineContext.Provider value={engine}>
      <PerformanceMonitor
        bounds={() => [38, 58]}
        flipflops={3}
        onDecline={() => setDpr(dprRange[0])}
        onIncline={() => setDpr(Math.min(window.devicePixelRatio || 1, dprRange[1]))}
        onFallback={() => setDpr(dprRange[0])}
      />
      <primitive object={engine.scene} />
      <CameraRig />
      <Interaction stageRef={stageRef} />
      <Effects />
      {qa && <QaBridge />}
      {tune && <ScenePerf />}
    </EngineContext.Provider>
  );
}
