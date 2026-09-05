/**
 * The typed surface of the JavaScript engine that React reads. The engine
 * itself is untyped on purpose — it is the original botany, kept verbatim.
 */
import type * as THREE from "three";

export interface EngineProfile {
  id: "high" | "low";
  dprCap: number;
  frameIntervalMs: number;
  pompomFuzzPerBloom: number;
  bloomHeadsPerFrame: number;
}

export interface EngineHead {
  index: number;
  value: number;
  timeline: number;
  scroll: number;
  waveStart: number;
  committedOpen: boolean;
  mode: "bud" | "scheduled" | "opening" | "open" | "checkpoint";
}

export interface DefaultView {
  position: THREE.Vector3;
  target: THREE.Vector3;
  near: number;
  far: number;
  minDistance: number;
  maxDistance: number;
  azimuth: number;
  elevation: number;
  projectedWidth: number;
  projectedHeight: number;
  compositionOffset: number;
}

export interface Viewport {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface CultivationReport {
  phase: "growth" | "bloom" | "complete";
  label: string;
  value: string;
  prompt: string;
  progress: number;
  open: number;
  total: number;
  growth: number;
}

export interface EngineHooks {
  cultivation?(report: CultivationReport): void;
  status?(message: string): void;
  stageData?(key: string, value: string | null): void;
  finale?(): void;
  invalidate?(): void;
  flag?(name: string, value: boolean): void;
}

export interface EngineConfig {
  profile: EngineProfile;
  seed?: number;
  qa?: boolean;
  poster?: boolean;
  reduced?: boolean;
  finePointer?: boolean;
  initialGrowth?: number;
  query?: Record<string, string>;
  camera?: THREE.PerspectiveCamera;
}

export interface EngineSnapshot {
  state: string;
  seed: number;
  qualityTier: string;
  [key: string]: unknown;
}

export interface EngineQa {
  applyQuery(): boolean;
  heroBloomIndex(): number;
  focusBloom(index?: number, view?: string): unknown;
  focusLeaf(index?: number): unknown;
  projectBloomPoint(index: number, u?: number, v?: number, axial?: number): unknown;
  activateBloom(index?: number): boolean;
  activateBouquet(): boolean;
  setBloomCheckpoint(index?: number, timeline?: number, isolate?: boolean): unknown;
  sampleBloomGeometry(index?: number): unknown;
  releaseCamera(): void;
  snapshot(): EngineSnapshot;
}

export interface WattleEngine {
  readonly disposed: boolean;
  readonly state: { qaCameraLock: boolean; camera: THREE.PerspectiveCamera; [key: string]: unknown };
  scene: THREE.Group;
  bouquet: THREE.Group;
  universe: THREE.Group;
  universeMaterial: THREE.ShaderMaterial;
  selectionLight: THREE.PointLight;
  data: { bounds: THREE.Box3; all: { blooms: Array<{ index: number; position: THREE.Vector3 }> } };
  bounds: THREE.Box3;
  profile: EngineProfile;
  seed: number;
  focusTarget: THREE.Vector3;
  headCount: number;
  readonly defaultView: DefaultView | null;
  readonly growth: { progress: number; complete: boolean };
  readonly bloom: { openCount: number; activeCount: number; progress: number; hoveredIndex: number; pendingUploads: number };
  readonly heads: EngineHead[];
  readonly cultivation: CultivationReport | null;
  readonly pointerDragged: boolean;
  qa: EngineQa;

  attach(parts: { camera?: THREE.PerspectiveCamera; renderer?: THREE.WebGLRenderer }): void;
  resize(width: number, height: number, pixelRatio: number, viewport?: Viewport): DefaultView | null;
  fitView(): DefaultView | null;
  setViewport(viewport: Viewport): void;
  setGrowth(progress: number): boolean;
  completeGrowth(announce?: boolean): boolean;
  setScrollBloom(progress: number): void;
  update(now: number, deltaSeconds: number, options?: { autonomous?: boolean }): { animating: boolean; autonomous: boolean };
  setHoverPointer(clientX: number, clientY: number, viewport?: Viewport): boolean;
  clearHover(): void;
  setControlsActive(active: boolean): void;
  setPress(press: { pointerId: number; x: number; y: number } | null): void;
  markDragged(): void;
  pickAt(clientX: number, clientY: number, viewport?: Viewport): number;
  activateAt(clientX: number, clientY: number, viewport?: Viewport): boolean;
  activateHead(index: number, announce?: boolean): boolean;
  openAll(announce?: boolean): boolean;
  resetBloom(): void;
  setReduced(reduced: boolean): void;
  setFinePointer(fine: boolean): void;
  setHidden(hidden: boolean): void;
  setInViewport(inViewport: boolean): void;
  setThreadsVisible(visible: boolean): void;
  setBreeze(strength: number): void;
  setEmissiveGain(gain: number): void;
  resetSway(): void;
  findHeadWorldPosition(index: number, target: THREE.Vector3): THREE.Vector3 | null;
  dispose(): void;
}

export const HIGH_PROFILE: EngineProfile;
export const LOW_PROFILE: EngineProfile;
export const WAVE: { start: number; spread: number; span: number };
export const DEFAULT_SEED_VALUE: number;
export const AUTHORED_DRIFT_VALUE: number;
export const TREE_BUD_MATURITY_START: number;
export const TREE_GROWTH_DURATION_MS: number;
export const BLOOM_DURATION_MS: number;
export function createWattleEngine(config: EngineConfig, hooks?: EngineHooks): WattleEngine;
