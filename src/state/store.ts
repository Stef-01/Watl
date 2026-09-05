/**
 * The page's shared state. React reads it through selectors; the scene writes
 * to it only when a value actually changes, so the meter, the status line and
 * the chrome re-render on state changes rather than on frames.
 */
import { create } from "zustand";

export type Ground = "night" | "earth" | "ochre" | "rose" | "moss" | "dusk" | "wash";
export type Section = "arrival" | "practice" | "clients" | "contact";
export type SceneState = "loading" | "ready" | "error";
export type ProfileId = "high" | "low";

export interface Cultivation {
  phase: "growth" | "bloom" | "complete" | "still";
  label: string;
  value: string;
  prompt: string;
  progress: number;
  open: number;
  total: number;
  growth: number;
}

export interface GroundOption {
  id: Ground;
  label: string;
  theme: string;
  swatch: string;
}

export const GROUNDS: readonly GroundOption[] = [
  { id: "night", label: "Night sky", theme: "#090909", swatch: "#7a94d2" },
  { id: "earth", label: "Earth", theme: "#090909", swatch: "#978453" },
  { id: "ochre", label: "Ochre", theme: "#0d0704", swatch: "#d6742c" },
  { id: "rose", label: "Desert rose", theme: "#0d0509", swatch: "#d1738f" },
  { id: "moss", label: "Eucalypt", theme: "#050806", swatch: "#7fae7a" },
  { id: "dusk", label: "Dusk", theme: "#07060d", swatch: "#9678c4" },
  { id: "wash", label: "Wash", theme: "#0a0709", swatch: "#c98f9c" },
];

export const GROUND_KEY = "watl.ground.v2";

export function isGround(value: unknown): value is Ground {
  return GROUNDS.some((ground) => ground.id === value);
}

export function readStoredGround(): Ground {
  try {
    const stored = window.localStorage.getItem(GROUND_KEY);
    if (isGround(stored)) return stored;
  } catch {
    /* Private mode, or site data blocked. The default is still right. */
  }
  const attribute = document.documentElement.dataset.ground;
  return isGround(attribute) ? attribute : "night";
}

interface WatlStore {
  sceneState: SceneState;
  sceneError: string | null;
  profile: ProfileId;
  reduced: boolean;
  finePointer: boolean;
  hidden: boolean;
  ground: Ground;
  groundOpen: boolean;
  cultivation: Cultivation | null;
  status: string;
  orbiting: boolean;
  brushHover: boolean;
  treeMature: boolean;
  treeStage: string;
  section: Section;
  heroProgress: number;
  finale: boolean;
  tune: boolean;
  qa: boolean;
  hoveredClient: number;
  hoveredPractice: number;

  setSceneState(state: SceneState, error?: string | null): void;
  setProfile(profile: ProfileId): void;
  setReduced(reduced: boolean): void;
  setFinePointer(fine: boolean): void;
  setHidden(hidden: boolean): void;
  setGround(ground: Ground): void;
  setGroundOpen(open: boolean): void;
  setCultivation(cultivation: Cultivation): void;
  setStatus(status: string): void;
  setOrbiting(orbiting: boolean): void;
  setBrushHover(hover: boolean): void;
  setTree(mature: boolean, stage: string): void;
  setSection(section: Section): void;
  setHeroProgress(progress: number): void;
  setFinale(finale: boolean): void;
  setHoveredClient(index: number): void;
  setHoveredPractice(index: number): void;
}

function readQuery(): URLSearchParams {
  return new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
}

const query = readQuery();

export const useWatl = create<WatlStore>((set) => ({
  sceneState: "loading",
  sceneError: null,
  profile: "high",
  reduced: typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  finePointer: typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches,
  hidden: typeof document !== "undefined" && document.hidden,
  ground: typeof window !== "undefined" ? readStoredGround() : "night",
  groundOpen: false,
  cultivation: null,
  status: "Growing the 3D Golden Wattle branch.",
  orbiting: false,
  brushHover: false,
  treeMature: false,
  treeStage: "shoot",
  section: "arrival",
  heroProgress: 0,
  finale: false,
  tune: query.get("tune") === "1" || (import.meta.env.DEV && query.get("tune") !== "0"),
  qa: query.get("qa") === "1",
  hoveredClient: -1,
  hoveredPractice: -1,

  setSceneState: (sceneState, sceneError = null) => set({ sceneState, sceneError }),
  setProfile: (profile) => set({ profile }),
  setReduced: (reduced) => set({ reduced }),
  setFinePointer: (finePointer) => set({ finePointer }),
  setHidden: (hidden) => set({ hidden }),
  setGround: (ground) => set({ ground }),
  setGroundOpen: (groundOpen) => set({ groundOpen }),
  setCultivation: (cultivation) => set({ cultivation }),
  setStatus: (status) => set({ status }),
  setOrbiting: (orbiting) => set((s) => (s.orbiting === orbiting ? s : { orbiting })),
  setBrushHover: (brushHover) => set((s) => (s.brushHover === brushHover ? s : { brushHover })),
  setTree: (treeMature, treeStage) => set((s) => (
    s.treeMature === treeMature && s.treeStage === treeStage ? s : { treeMature, treeStage }
  )),
  setSection: (section) => set((s) => (s.section === section ? s : { section })),
  setHeroProgress: (heroProgress) => set((s) => (
    Math.abs(s.heroProgress - heroProgress) < 0.002 ? s : { heroProgress }
  )),
  setFinale: (finale) => set({ finale }),
  setHoveredClient: (hoveredClient) => set({ hoveredClient }),
  setHoveredPractice: (hoveredPractice) => set({ hoveredPractice }),
}));

export const pageQuery = query;
