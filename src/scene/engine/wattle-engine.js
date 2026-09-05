/**
 * The Golden Wattle engine.
 *
 * This is the botany from the original single-file site, carved out of its
 * renderer. Everything that draws the branch — the seeded L-system, the
 * instanced geometry, the packed pom-pom shaders, the eight-act bloom morph,
 * and the sparse typed-array uploads — is unchanged. What changed is
 * ownership: React Three Fiber owns the renderer, camera, frame loop and
 * post-processing, and the engine reports outward through `hooks` instead of
 * touching the document.
 *
 * The one new capability is the scroll wave. Each flower head carries a
 * `scroll` timeline set by the page's ScrollTrigger; the head's rendered
 * timeline is the maximum of that wave and its own interactive animation, so
 * a hovered bud still opens ahead of the scroll and stays open.
 */
import * as THREE from "three";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import {
  BLOOM_DURATION_MS,
  BLOOM_MAX_SITE_DELAY,
  bloomEnvelopeTarget,
  bloomVisibilityHandoff,
  pollenBloomProgress,
  siteBloomProgress,
} from "../botany/bloom-motion.js";
import {
  TREE_BUD_MATURITY_START,
  TREE_GROWTH_DURATION_MS,
  treeGrowthStages,
} from "../botany/tree-growth.js";
import { BLOOM_BUD_TO_MATURE_SCALE } from "../botany/flower-scale.js";
import { generateWattleArchitecture } from "../botany/wattle-lsystem.js";

export { TREE_BUD_MATURITY_START, TREE_GROWTH_DURATION_MS, BLOOM_DURATION_MS };

const DEFAULT_SEED = 0x57a771e;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const FULL_TURN = Math.PI * 2;
const FLORET_PARTS = 5;
/* Acacia flowers have a five-part perianth but numerous stamens. Eight fine
   rendered bundles per floret create the dense pom-pom mass at interactive
   scale without turning every biological filament into geometry. */
const STAMEN_BUNDLES_PER_FLORET = 8;
const PHYLLODE_VEIN_COUNT = 3;
const PHYLLODE_VEIN_SEGMENTS = 10;
const PHYLLODE_WING_SIDES = 0;
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const TREE_ROOT = new THREE.Vector3(0, 0, 0);
/* The load view is an authored botanical portrait. A mild telephoto field of
   view and three-quarter azimuth reveal the branch's real depth without
   turning the specimen into a dramatic wide-angle object. */
const DEFAULT_CAMERA_FOV = 34;
const DEFAULT_VIEW_AZIMUTH_LANDSCAPE = THREE.MathUtils.degToRad(24);
const DEFAULT_VIEW_AZIMUTH_TABLET = THREE.MathUtils.degToRad(18);
const DEFAULT_VIEW_AZIMUTH_PORTRAIT = THREE.MathUtils.degToRad(10);
const DEFAULT_VIEW_ELEVATION = THREE.MathUtils.degToRad(4.5);
const MIN_ZOOM_DISTANCE_RATIO = 0.34;
const MAX_ZOOM_DISTANCE_RATIO = 2.45;
const KEYBOARD_ZOOM_FACTOR = 0.82;
/* Kept as an internal alias because the bloom instance builders all express
   their matrices relative to one shared pivot. That pivot is now the root of
   a living tree, not the hand-tie point of a bouquet. */
const GATHER_POINT = TREE_ROOT;
const BLOOM_CORE_SCALE = 0.36;
const BLOOM_DRAG_SLOP = 7;
const BLOOM_UNFURL_MS = BLOOM_DURATION_MS;
const BLOOM_REDUCED_FEEDBACK_MS = 180;
const BLOOM_BRUSH_STEP_MS = 90;
const BLOOM_BRUSH_RADIUS_MIN = 68;
const BLOOM_BRUSH_RADIUS_MAX = 104;
const BLOOM_BRUSH_VIEWPORT_RATIO = 0.1;
const BLOOM_BRUSH_BATCH_SIZE = 4;
const BLOOM_BRUSH_HEAD_STAGGER_MS = 135;
const BUD_CAP_RADIUS_FACTOR = 0.49 * BLOOM_BUD_TO_MATURE_SCALE;
const BUD_CAP_SCALE_FACTOR = 0.46 * BLOOM_BUD_TO_MATURE_SCALE;
const BUD_CAP_RIPEN_SCALE = 1.08;
const BUD_CAP_RETIRED_SCALE = 0.035;
const BUD_FLORET_RADIUS_FACTOR = 0.55 * BLOOM_BUD_TO_MATURE_SCALE;
const CUP_FLORET_RADIUS_FACTOR = 0.74;
const BUD_FLORET_TANGENTIAL_SCALE = 0.5 * BLOOM_BUD_TO_MATURE_SCALE;
const BUD_FLORET_AXIAL_SCALE = 0.58 * BLOOM_BUD_TO_MATURE_SCALE;
const CUP_FLORET_TANGENTIAL_SCALE = 0.72;
const CUP_FLORET_AXIAL_SCALE = 0.78;
const BUD_TIP_SCALE = 0.68 * BLOOM_BUD_TO_MATURE_SCALE;
const INTERNAL_CORE_SCALE_FACTOR = 0.78;
const BLOOM_LIGHT_INTENSITY = 0.18;
const BLOOM_REDUCED_LIGHT_INTENSITY = 0.1;
/* The bud palette stays olive and papery until the corolla takes over. The
   previous red-brown pore accent read as a second flower species in the dark
   field, so it now sits in the same neutral bark family. */
const BUD_CORE_COLOR = new THREE.Color(0x5a5a37);
const BUD_CAP_COLOR = new THREE.Color(0x7b7a4a);
const RIPE_CAP_COLOR = new THREE.Color(0xaca34a);
const RETIRED_CAP_COLOR = new THREE.Color(0x6f6a46);
const BUD_FLORET_COLOR = new THREE.Color(0xc3a71a);
const CUP_FLORET_COLOR = new THREE.Color(0xd3b91c);
const BUD_FILAMENT_COLOR = new THREE.Color(0xc8ae21);
const BUD_TIP_BURGUNDY = new THREE.Color(0x594d33);

/* A Golden Wattle head carries many tiny flowers. The lower
   profile retains that biological density through larger round anther sprites
   rather than radial filament length, keeping the silhouette compact and the
   hover interaction responsive. */

/* How much of each hemisphere the mirrored pairs cover, measured in cos(theta)
   rather than in radius. One would be a closed hemisphere per side and would
   put both florets of the equatorial pair in the same place; this stops just
   short of the equator and leaves them a gap to occupy. */
const SHELL_COS_SPAN = 0.94;

const YOUNG_STEM_COLORS = [0x75805b, 0x849064, 0x929b70];
const BARK_COLORS = [0x5f5637, 0x716341, 0x82724c, 0x94835c];
/* Cooler forest/eucalyptus greens sampled from the supplied photographs.
   Keeping blue closer to green removes the previous chartreuse cast while
   the four values retain natural sun/shade variation across the branch. */
const LEAF_COLORS = [0x36532c, 0x456438, 0x557647, 0x69895a];
const YOUNG_PHYLLODE_COLORS = [0x50663f, 0x60774d, 0x71885c, 0x81986b];
const CORE_COLORS = [0xd9b800, 0xe6c400, 0xf2d300, 0xffdf00];
const FILAMENT_COLORS = [0xf4d000, 0xffdc00, 0xffe522, 0xffea3b];
const PETAL_COLORS = [0xe8c600, 0xf3d200, 0xffde00, 0xffe62e];
const TIP_COLORS = [0xf9d900, 0xffe200, 0xffe933, 0xffef5e];
// Kept pale and mineral so the spatial field reads as depth, not a second
// source of yellow competing with the flowering racemes.
const UNIVERSE_COLORS = [0xd8d5c9, 0xb5b4a8, 0xc8c4b4, 0xd5c98c];


/* The sway the branch is authored at. */
const AUTHORED_DRIFT = 0.42;


export const HIGH_PROFILE = Object.freeze({
  id: "high",
  branchCount: 10,
  mainSegments: 9,
  mainLeaves: 11,
  twigSegments: 4,
  heroFlorets: 36,
  openFlorets: 24,
  innerFibersPerBloom: 12,
  exportInnerFibers: 6,
  interiorSpecks: 18,
  exportCenterSpecks: 4,
  pompomFuzzPerBloom: 900,
  dprCap: 1.4,
  frameIntervalMs: 0,
});

export const LOW_PROFILE = Object.freeze({
  id: "low",
  branchCount: 7,
  mainSegments: 7,
  mainLeaves: 8,
  twigSegments: 3,
  heroFlorets: 26,
  openFlorets: 18,
  innerFibersPerBloom: 8,
  exportInnerFibers: 4,
  interiorSpecks: 10,
  exportCenterSpecks: 3,
  pompomFuzzPerBloom: 360,
  dprCap: 1.12,
  frameIntervalMs: 1000 / 30,
});

export const DEFAULT_SEED_VALUE = DEFAULT_SEED;
export const AUTHORED_DRIFT_VALUE = AUTHORED_DRIFT;

/* The scroll wave: heads open bottom-up across this slice of the hero pin.
   `WAVE_START`..`WAVE_START + WAVE_SPREAD` is where each head begins, ordered
   by rank; every head then takes `WAVE_HEAD_SPAN` of pin progress to run its
   eight acts. 0.52 + 0.20 + 0.18 = 0.90, which is where the camera settles. */
export const WAVE = Object.freeze({ start: 0.52, spread: 0.2, span: 0.18 });

/* Hover picking runs often enough that its scratch objects cannot be allowed
   to become garbage. Clicks and hover share this one picker and one result. */
const bloomPicker = {
  pointer: new THREE.Vector2(),
  raycaster: new THREE.Raycaster(),
  instanceMatrix: new THREE.Matrix4(),
  worldMatrix: new THREE.Matrix4(),
  worldPosition: new THREE.Vector3(),
  worldScale: new THREE.Vector3(),
  worldQuaternion: new THREE.Quaternion(),
  hitCenter: new THREE.Vector3(),
  hitAxis: new THREE.Vector3(),
  hitMatrix: new THREE.Matrix4(),
  inverseHitMatrix: new THREE.Matrix4(),
  inverseMeshMatrix: new THREE.Matrix4(),
  localOrigin: new THREE.Vector3(),
  localEnd: new THREE.Vector3(),
  localDirection: new THREE.Vector3(),
  localHit: new THREE.Vector3(),
  worldHit: new THREE.Vector3(),
  localRay: new THREE.Ray(),
  unitSphere: new THREE.Sphere(new THREE.Vector3(), 1),
  brushSphere: new THREE.Sphere(),
  resultPosition: new THREE.Vector3(),
  resultNormal: new THREE.Vector3(),
  resultIndex: -1,
  resultRadius: 0,
};

const bloomBrush = {
  projected: new THREE.Vector3(),
  candidates: [],
};

const bloomMorphScratch = {
  stages: {},
  visibility: {},
  pollen: {},
};

/* One engine per document. The module keeps a single state record so the
   botany functions below can stay exactly as they were written; `create`
   resets it, and `dispose` empties it. */
const options = {
  poster: false,
  query: {},
};

const query = {
  get(key) {
    return Object.prototype.hasOwnProperty.call(options.query, key) ? options.query[key] : null;
  },
  has(key) {
    return Object.prototype.hasOwnProperty.call(options.query, key);
  },
};

let hooks = {};

function freshState() {
  return {
    ready: false,
    rendererState: "loading",
    qa: false,
    profile: HIGH_PROFILE,
    data: null,
    renderer: null,
    scene: null,
    camera: null,
    controls: null,
    bouquet: null,
    universe: null,
    universeMaterial: null,
    bloom: null,
    swayGroups: [],
    coreMeshes: [],
    pointsMaterial: null,
    fuzzMaterial: null,
    pompomMassMaterial: null,
    petalMaterial: null,
    selectionLight: null,
    lights: null,
    reduced: false,
    finePointer: false,
    hidden: false,
    qaMotionOff: false,
    qaCameraLock: false,
    motionPaused: false,
    inViewport: true,
    userMoved: false,
    breeze: AUTHORED_DRIFT,
    motionTime: 0,
    lastFrame: 0,
    renderedFrames: 0,
    frameTimes: [],
    statusTimer: 0,
    defaultView: null,
    press: null,
    pointerDragged: false,
    controlsActive: false,
    hoverPointer: {
      x: 0,
      y: 0,
      pending: false,
      lastBrushAt: -Infinity,
    },
    viewport: { left: 0, top: 0, width: 1, height: 1 },
    stageData: {},
    selectedBloomIndex: -1,
    qaIsolatedBloomIndex: -1,
    finaleShown: false,
    finaleDismissed: false,
    growth: null,
    cultivationKey: "",
    cultivationProgress: -1,
    lastCultivation: null,
    scrollBloom: 0,
  };
}

let state = freshState();

function setStageData(key, value) {
  if (value === null || value === undefined) {
    delete state.stageData[key];
  } else {
    state.stageData[key] = String(value);
  }
  hooks.stageData?.(key, value === null || value === undefined ? null : String(value));
}

function invalidate() {
  hooks.invalidate?.();
}

function headOpen(head) {
  return head.committedOpen || head.timeline >= 0.9995;
}

function notifyFinale() {
  if (state.finaleShown) return false;
  state.finaleShown = true;
  hooks.finale?.();
  return true;
}

function setStatus(message, resetAfter = 0) {
  window.clearTimeout(state.statusTimer);
  hooks.status?.(message);
  if (resetAfter) {
    state.statusTimer = window.setTimeout(() => {
      if (!state.ready) {
        hooks.status?.("Growing the 3D Golden Wattle branch.");
        return;
      }
      if (!state.growth?.complete) {
        hooks.status?.("The Golden Wattle shoot is still growing.");
        return;
      }
      const remaining = state.bloom?.heads.filter((head) => !headOpen(head)).length ?? 0;
      hooks.status?.(remaining > 0
        ? `Move across the mature branch to bloom it. ${remaining} buds remain.`
        : "All flowers are open.");
    }, resetAfter);
  }
}

/* The lifecycle meter. The phase, label, value and prompt are derived from the
   same growth and bloom state the renderer uses, and only pushed to React when
   one of them changes; the fill progress is pushed whenever it moves by more
   than a twentieth of a percent. */
function syncCultivation() {
  const growth = state.growth?.progress ?? 0;
  const treeStage = state.stageData.treeStage || "shoot";
  const total = state.bloom?.heads.length ?? 0;
  const open = state.bloom?.openCount ?? 0;
  const bloomProgress = state.bloom?.progress ?? 0;
  const active = state.bloom?.activeCount ?? 0;
  const usesHover = state.finePointer;
  let phase = "growth";
  let label = ({
    shoot: "Young shoot",
    branching: "Branching",
    leafing: "Leafing",
    budding: "Budding",
  })[treeStage] || "Growing";
  let value = `${String(Math.round(growth * 100)).padStart(2, "0")}%`;
  let prompt = growth >= TREE_BUD_MATURITY_START
    ? "Flower heads are beginning to form"
    : "A living system is taking form";
  let progress = growth;

  if (growth >= 1) {
    const complete = total > 0 && open >= total;
    phase = complete ? "complete" : "bloom";
    label = complete ? "Full bloom" : active > 0 ? "Flowering" : "Bloom";
    value = `${String(open).padStart(2, "0")} / ${String(total).padStart(2, "0")}`;
    prompt = complete
      ? "The living system is complete"
      : active > 0
        ? usesHover
          ? "The branch is responding to you"
          : "A flower is opening"
        : open > 0
          ? usesHover
            ? "Keep moving across closed buds"
            : "Keep scrolling, or tap a closed bud"
          : usesHover
            ? "Keep scrolling, or move across the buds"
            : "Keep scrolling, or tap a bud";
    progress = bloomProgress;
  }

  const key = `${phase}|${label}|${value}|${prompt}`;
  const changedText = state.cultivationKey !== key;
  const changedProgress = Math.abs(progress - state.cultivationProgress) > 0.0005;
  if (!changedText && !changedProgress) return;
  state.cultivationKey = key;
  state.cultivationProgress = progress;
  state.lastCultivation = { phase, label, value, prompt, progress, open, total, growth };
  hooks.cultivation?.(state.lastCultivation);
}

function createTreeGrowthController(initialProgress) {
  return {
    progress: initialProgress,
    stages: treeGrowthStages(initialProgress, {}),
    duration: TREE_GROWTH_DURATION_MS,
    active: false,
    complete: initialProgress >= 1,
    announcedMaturity: initialProgress >= 1,
    trunks: [],
    canopies: [],
    leaves: [],
    materials: null,
  };
}

/* The interactive channel is the original hover / click animation. The scroll
   channel is the wave. Rendering reads the maximum, so a bud the visitor opened
   stays open when they scroll back up, and a bud the scroll opened keeps
   opening from where it is when they hover it. */
function updateBloomHead(head, now) {
  let active = false;
  if (head.mode === "scheduled" || head.mode === "opening") {
    if (head.mode === "scheduled" && now < head.startAt) {
      active = true;
    } else {
      head.mode = "opening";
      const progress = THREE.MathUtils.clamp((now - head.startAt) / head.duration, 0, 1);
      head.ownTimeline = THREE.MathUtils.lerp(head.timelineFrom, head.target, progress);
      head.ownValue = THREE.MathUtils.lerp(head.from, head.target, easeBloom(progress, head.easing));
      if (progress < 1) {
        active = true;
      } else {
        head.ownValue = head.target;
        head.ownTimeline = head.target;
        head.mode = "open";
      }
    }
  }
  head.timeline = Math.max(head.ownTimeline, head.scroll);
  head.value = Math.max(head.ownValue, head.scroll);
  return active;
}

function updateHoverPicking(now) {
  if (!state.growth?.complete) {
    state.hoverPointer.pending = false;
    clearBloomHover(now);
    return;
  }
  if (!state.hoverPointer.pending || !state.finePointer || state.controlsActive || state.press) return;
  if (now - state.hoverPointer.lastBrushAt < BLOOM_BRUSH_STEP_MS) return;

  state.hoverPointer.lastBrushAt = now;
  bloomAtHoverArea(state.hoverPointer.x, state.hoverPointer.y, now);
}

function applyTreeGrowth(progress, force = false) {
  if (!state.growth) return;
  state.growth.progress = THREE.MathUtils.clamp(progress, 0, 1);
  const stages = treeGrowthStages(state.growth.progress, state.growth.stages);
  /* L-system modules now own their developmental windows. The assembled branch
     remains at its final coordinate frame while individual segments extend
     from their parent nodes and leaves unfold locally. */
  for (const trunk of state.growth.trunks) {
    trunk.scale.setScalar(1);
  }
  for (const canopy of state.growth.canopies) {
    canopy.visible = stages.branches > 0.001;
    canopy.scale.setScalar(1);
  }
  if (state.growth.materials?.stemGrowth) {
    state.growth.materials.stemGrowth.value = state.growth.progress;
  }
  if (state.growth.materials?.leafGrowth) {
    state.growth.materials.leafGrowth.value = state.growth.progress;
  }
  if (state.growth.materials?.saplingLeafGrowth) {
    state.growth.materials.saplingLeafGrowth.value = state.growth.progress;
  }
  if (state.growth.materials?.budGrowth) {
    state.growth.materials.budGrowth.value = Math.max(0.025, stages.buds);
  }
  if (state.growth.materials?.tipGrowth) {
    state.growth.materials.tipGrowth.value = Math.max(0.025, stages.buds);
  }
  if (state.growth.materials?.fuzzGrowth) {
    state.growth.materials.fuzzGrowth.value = Math.max(0.025, stages.buds);
  }

  for (const leaf of state.growth.leaves) leaf.visible = state.growth.progress > 0.12;
  for (const renderable of state.bloom?.renderables.caps ?? []) {
    renderable.mesh.visible = stages.buds > 0.001;
  }
  for (const renderable of state.bloom?.renderables.tips ?? []) {
    renderable.points.visible = stages.buds > 0.001;
  }
  for (const renderable of state.bloom?.renderables.fuzz ?? []) {
    renderable.points.visible = stages.buds > 0.001;
  }
  /* Empty renderables stay hidden: an instanced morph mesh with no instances
     has no morph texture, and three.js throws mid-frame if it is asked to
     draw one. */
  for (const renderable of state.bloom?.renderables.masses ?? []) {
    renderable.points.visible = stages.buds > 0.001 && renderable.items.length > 0;
  }
  for (const renderable of state.bloom?.renderables.cups ?? []) {
    renderable.mesh.visible = stages.buds > 0.001 && renderable.mesh.count > 0;
  }
  for (const renderable of state.bloom?.renderables.florets ?? []) {
    renderable.mesh.visible = stages.buds > 0.001 && renderable.mesh.count > 0;
  }
  for (const renderable of state.bloom?.renderables.filaments ?? []) {
    renderable.lines.visible = stages.buds > 0.001 && renderable.items.length > 0;
  }

  state.growth.complete = state.growth.progress >= 1;
  const stageName = stages.mature
    ? "mature"
    : stages.buds > 0
      ? "budding"
      : stages.foliage > 0
        ? "leafing"
        : stages.branches > 0
          ? "branching"
      : "shoot";
  setStageData("treeGrowth", state.growth.progress.toFixed(4));
  setStageData("treeStage", stageName);
  setStageData("treeMature", String(state.growth.complete));
  syncCultivation();
  if (state.qa) {
    setStageData("qaTreeGrowth", state.growth.progress.toFixed(4));
    setStageData("qaTreeStage", stageName);
    setStageData("qaTreeMature", String(state.growth.complete));
  }
}

function completeTreeGrowth(announce = true) {
  if (!state.growth || state.growth.complete) return false;
  state.growth.active = false;
  applyTreeGrowth(1, true);
  if (announce) setStatus("The Golden Wattle is mature. Its buds are ready to flower.", 1800);
  invalidate();
  return true;
}

function reduceBloomMotion() {
  return state.reduced || query.get("motion") === "off" || options.poster;
}

function bloomUnfurlDuration() {
  if (query.get("qa") !== "1") return BLOOM_UNFURL_MS;
  const rawDuration = query.get("qaBloomDuration");
  if (rawDuration === null || rawDuration.trim() === "") return BLOOM_UNFURL_MS;
  const requested = Number(rawDuration);
  return Number.isFinite(requested)
    ? THREE.MathUtils.clamp(requested, 240, 5000)
    : BLOOM_UNFURL_MS;
}

function createBloomController(data) {
  const count = data.all.blooms.length;
  const centers = new Float32Array(count * 3);
  let minY = Infinity;
  let maxY = -Infinity;

  for (const bloom of data.all.blooms) {
    const offset = bloom.index * 3;
    centers[offset] = bloom.position.x;
    centers[offset + 1] = bloom.position.y - GATHER_POINT.y;
    centers[offset + 2] = bloom.position.z;
    minY = Math.min(minY, bloom.position.y);
    maxY = Math.max(maxY, bloom.position.y);
  }

  return {
    centers,
    minY,
    maxY,
    hoveredIndex: -1,
    cascadeActive: false,
    cascadeEndsAt: 0,
    activeCount: 0,
    openCount: 0,
    progress: 0,
    maxProgress: 0,
    maxTimeline: 0,
    dirtyHeads: [],
    uploadStats: {
      dirtyHeadCount: 0,
      rangeCount: 0,
      bytes: 0,
      peakBytes: 0,
    },
    renderables: {
      masses: [],
      caps: [],
      cups: [],
      florets: [],
      filaments: [],
      tips: [],
      fuzz: [],
    },
    capLookup: new Map(),
    floretLookup: new Map(),
    filamentLookup: [],
    heads: data.all.blooms.map((bloom) => ({
      index: bloom.index,
      value: 0,
      from: 0,
      timeline: 0,
      timelineFrom: 0,
      target: 0,
      startAt: 0,
      duration: 0,
      mode: "bud",
      easing: "in-out",
      committedOpen: false,
      originNormal: bloom.faceNormal.clone(),
      delayRevision: 0,
      ownValue: 0,
      ownTimeline: 0,
      scroll: 0,
      waveStart: 0,
    })),
  };
}

function cubicBezierCoordinate(t, first, second) {
  const inverse = 1 - t;
  return 3 * inverse * inverse * t * first
    + 3 * inverse * t * t * second
    + t * t * t;
}

function cubicBezierSlope(t, first, second) {
  const inverse = 1 - t;
  return 3 * inverse * inverse * first
    + 6 * inverse * t * (second - first)
    + 3 * t * t * (1 - second);
}

function solveCubicBezier(progress, x1, y1, x2, y2) {
  const target = THREE.MathUtils.clamp(progress, 0, 1);
  let parameter = target;

  for (let iteration = 0; iteration < 5; iteration += 1) {
    const error = cubicBezierCoordinate(parameter, x1, x2) - target;
    const slope = cubicBezierSlope(parameter, x1, x2);
    if (Math.abs(error) < 0.00001 || Math.abs(slope) < 0.00001) break;
    parameter = THREE.MathUtils.clamp(parameter - error / slope, 0, 1);
  }

  return cubicBezierCoordinate(parameter, y1, y2);
}

function easeBloom(progress, easing) {
  return easing === "in-out"
    ? solveCubicBezier(progress, 0.77, 0, 0.175, 1)
    : solveCubicBezier(progress, 0.23, 1, 0.32, 1);
}

function beginBloomActivation(head, now, delay = 0) {
  if (head.committedOpen) return false;
  if (query.get("qa") === "1") {
    state.frameTimes.length = 0;
  }
  const effectiveDelay = head.value > 0.001 ? 0 : delay;
  head.committedOpen = true;
  head.from = head.value;
  head.timelineFrom = head.timeline;
  head.target = 1;
  head.startAt = now + effectiveDelay;
  head.duration = reduceBloomMotion()
    ? BLOOM_REDUCED_FEEDBACK_MS
    : Math.max(240, bloomUnfurlDuration() * (1 - head.value));
  head.easing = reduceBloomMotion() ? "out" : "in-out";
  head.mode = effectiveDelay > 0 ? "scheduled" : "opening";
  return true;
}

function bloomLightWeight(head) {
  if (!head) return 0;
  if (head.mode === "opening") {
    const span = Math.max(0.0001, 1 - head.from);
    const progress = THREE.MathUtils.clamp((head.value - head.from) / span, 0, 1);
    return 4 * progress * (1 - progress);
  }
  return 0;
}

function updateBloomAnimation(now) {
  if (!state.bloom) return false;
  const dirty = state.bloom.dirtyHeads;
  const previousActiveCount = state.bloom.activeCount;
  const previousOpenCount = state.bloom.openCount;
  const previousProgress = state.bloom.progress;
  dirty.length = 0;
  let activeCount = 0;
  let openCount = 0;
  let bloomProgress = 0;
  let maxProgress = 0;
  let maxTimeline = 0;

  for (const head of state.bloom.heads) {
    const was = head.value;
    const wasTimeline = head.timeline;
    const active = updateBloomHead(head, now);
    if (active) activeCount += 1;
    if (headOpen(head)) openCount += 1;
    bloomProgress += head.value;
    maxProgress = Math.max(maxProgress, head.value);
    maxTimeline = Math.max(maxTimeline, head.timeline);
    if (
      Math.abs(was - head.value) > 0.00001
      || Math.abs(wasTimeline - head.timeline) > 0.00001
    ) dirty.push(head.index);
  }

  if (dirty.length > 0) applyBloomEffects(dirty);

  state.bloom.activeCount = activeCount;
  state.bloom.openCount = openCount;
  state.bloom.progress = bloomProgress / Math.max(1, state.bloom.heads.length);
  state.bloom.maxProgress = maxProgress;
  state.bloom.maxTimeline = maxTimeline;
  state.bloom.cascadeActive = now < state.bloom.cascadeEndsAt;

  if (state.qa) {
    setStageData("qaBloomActive", String(activeCount));
    setStageData("qaBloomProgress", maxProgress.toFixed(4));
    setStageData("qaBloomTimeline", maxTimeline.toFixed(4));
    setStageData("qaBloomCascade", String(state.bloom.cascadeActive));
    setStageData("qaBloomSelected", String(state.selectedBloomIndex));
    const selected = state.bloom.heads[state.selectedBloomIndex];
    setStageData("qaBloomSelectedProgress", (selected?.value ?? 0).toFixed(4));
    setStageData("qaBloomSelectedTimeline", (selected?.timeline ?? 0).toFixed(4));
    setStageData("qaBloomOpenCount", String(openCount));
    setStageData("qaBloomClosedCount", String(state.bloom.heads.length - openCount));
  }

  if (state.selectedBloomIndex >= 0) {
    const selected = state.bloom.heads[state.selectedBloomIndex];
    state.selectionLight.intensity = bloomLightWeight(selected)
      * (reduceBloomMotion() ? BLOOM_REDUCED_LIGHT_INTENSITY : BLOOM_LIGHT_INTENSITY);
  } else {
    state.selectionLight.intensity = 0;
  }

  if (openCount === state.bloom.heads.length) {
    notifyFinale(!reduceBloomMotion());
  }

  if (
    dirty.length > 0
    || activeCount !== previousActiveCount
    || openCount !== previousOpenCount
    || Math.abs(state.bloom.progress - previousProgress) > 0.0005
  ) syncCultivation();

  return activeCount > 0;
}

function resetBloomState() {
  if (!state.bloom) return;
  state.bloom.hoveredIndex = -1;
  state.bloom.cascadeActive = false;
  state.bloom.cascadeEndsAt = 0;
  setStageData("bloomHover", "false");
  const dirty = [];
  for (const head of state.bloom.heads) {
    head.ownValue = head.committedOpen ? 1 : 0;
    head.ownTimeline = head.ownValue;
    head.value = Math.max(head.ownValue, head.scroll);
    head.timeline = Math.max(head.ownTimeline, head.scroll);
    head.timelineFrom = head.timeline;
    head.from = head.value;
    head.target = head.ownValue;
    head.mode = head.committedOpen ? "open" : "bud";
    dirty.push(head.index);
  }
  applyBloomEffects(dirty);
  state.bloom.activeCount = 0;
  state.bloom.openCount = state.bloom.heads.filter((head) => headOpen(head)).length;
  state.bloom.progress = state.bloom.openCount / Math.max(1, state.bloom.heads.length);
  state.bloom.maxProgress = state.bloom.openCount > 0 ? 1 : 0;
  state.bloom.maxTimeline = state.bloom.maxProgress;
  state.selectionLight.intensity = 0;
  if (state.bloom.openCount === state.bloom.heads.length) {
    notifyFinale(false);
  }
  syncCultivation();
}

function addLighting(scene) {
  /* Neutral, broad light preserves the reference's grey-olive foliage without
     painting the branch orange or green. Brightness comes from coverage rather
     than saturated emitters, so the scene stays quiet when no bloom is active. */
  /* The environment map now carries the ambient term, so the hemisphere
     steps back; the rim steps forward to cut the silhouette from the night. */
  const hemisphere = new THREE.HemisphereLight(0xf4f1dd, 0x30382b, 0.7);
  hemisphere.name = "hemisphere";
  scene.add(hemisphere);

  const key = new THREE.DirectionalLight(0xfff5d7, 1.25);
  key.name = "key";
  key.position.set(-4.2, 6.5, 5.2);
  scene.add(key);

  const rim = new THREE.DirectionalLight(0xd9e4ff, 0.6);
  rim.name = "rim";
  rim.position.set(4.8, 2.6, -4.4);
  scene.add(rim);

  const fill = new THREE.DirectionalLight(0xe7ead6, 0.28);
  fill.name = "fill";
  fill.position.set(0, -2, 4);
  scene.add(fill);

  state.selectionLight = new THREE.PointLight(0xe7cf72, 0, 2.2, 2);
  scene.add(state.selectionLight);
}

function buildUniverse(bounds, seed, profile) {
  const random = mulberry32((seed ^ 0x91e10da5) >>> 0);
  const root = new THREE.Group();
  root.name = "WATL_Spatial_Universe";

  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const extent = Math.max(size.x, size.y, size.z);
  const innerRadius = extent * 1.45;
  const outerRadius = extent * 4.15;
  const count = profile.id === "high" ? 820 : 460;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  const alphas = new Float32Array(count);
  const color = new THREE.Color();
  const phase = random() * FULL_TURN;

  for (let index = 0; index < count; index += 1) {
    const direction = fibonacciSphereDirection(index, count, phase, 0.045, random);
    const layerMix = Math.pow(random(), 0.58);
    const distance = THREE.MathUtils.lerp(innerRadius, outerRadius, layerMix);
    const point = direction.multiplyScalar(distance);
    positions[index * 3] = point.x;
    positions[index * 3 + 1] = point.y;
    positions[index * 3 + 2] = point.z;

    const gold = random() > 0.955;
    const colorIndex = gold ? UNIVERSE_COLORS.length - 1 : Math.floor(random() * 3);
    color.setHex(UNIVERSE_COLORS[colorIndex]);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;

    const proximity = 1 - layerMix;
    sizes[index] = (0.55 + Math.pow(random(), 5) * 1.75) * (0.84 + proximity * 0.3);
    phases[index] = random() * FULL_TURN;
    alphas[index] = gold
      ? 0.62 + random() * 0.25
      : 0.18 + Math.pow(random(), 1.6) * 0.62;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.name = "Spatial_Light_Field";
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute("aAlpha", new THREE.BufferAttribute(alphas, 1));
  geometry.computeBoundingSphere();

  const material = new THREE.ShaderMaterial({
    name: "Quiet_Celestial_Light",
    transparent: true,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
    vertexColors: true,
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
    },
    vertexShader: `
      attribute float aSize;
      attribute float aPhase;
      attribute float aAlpha;
      uniform float uTime;
      uniform float uPixelRatio;
      varying vec3 vColor;
      varying float vAlpha;

      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        float depth = max(0.15, -viewPosition.z);
        float perspective = clamp(150.0 / depth, 0.52, 2.2);
        float twinkle = 0.96 + sin(uTime * 0.22 + aPhase) * 0.04;
        gl_PointSize = max(1.0, aSize * uPixelRatio * perspective * twinkle);
        gl_Position = projectionMatrix * viewPosition;
        vColor = color;
        vAlpha = aAlpha;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;

      void main() {
        float distanceToCenter = length(gl_PointCoord - vec2(0.5));
        float disc = 1.0 - smoothstep(0.27, 0.5, distanceToCenter);
        if (disc < 0.01) discard;
        gl_FragColor = vec4(vColor, disc * vAlpha);
      }
    `,
  });

  const points = new THREE.Points(geometry, material);
  points.name = "Celestial_Depth_Field";
  points.frustumCulled = false;
  points.renderOrder = -20;

  const threadCount = profile.id === "high" ? 28 : 16;
  const threadPositions = new Float32Array(threadCount * 6);
  for (let thread = 0; thread < threadCount; thread += 1) {
    const startIndex = Math.floor(random() * count);
    const endIndex = (startIndex + 1 + Math.floor(random() * 6)) % count;
    threadPositions.set(positions.subarray(startIndex * 3, startIndex * 3 + 3), thread * 6);
    threadPositions.set(positions.subarray(endIndex * 3, endIndex * 3 + 3), thread * 6 + 3);
  }
  const threadGeometry = new THREE.BufferGeometry();
  threadGeometry.name = "Sparse_Signal_Connections";
  threadGeometry.setAttribute("position", new THREE.BufferAttribute(threadPositions, 3));
  const threadMaterial = new THREE.LineBasicMaterial({
    name: "Faint_Signal_Material",
    color: 0x8c887d,
    transparent: true,
    opacity: 0.09,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
  });
  const threads = new THREE.LineSegments(threadGeometry, threadMaterial);
  threads.name = "Unresolved_Signal_Threads";
  threads.frustumCulled = false;
  threads.renderOrder = -21;

  root.position.copy(center);
  root.userData = { starCount: count, threadCount, innerRadius, outerRadius, threads };
  root.add(threads, points);
  return { root, material };
}

function generateBouquetData(profile, seed) {
  const random = mulberry32(seed);
  const makeBucket = () => ({
    segments: [],
    leaves: [],
    blooms: [],
    caps: [],
    florets: [],
    filaments: [],
    tips: [],
  });
  const data = {
    seed,
    clusters: [makeBucket(), makeBucket(), makeBucket()],
    all: makeBucket(),
    bounds: new THREE.Box3(),
  };

  const push = (category, value, cluster) => {
    data.clusters[cluster][category].push(value);
    data.all[category].push(value);
  };

  const addSegment = (start, end, radius, color, cluster, role = "branch", growth = null) => {
    push("segments", {
      start: start.clone(),
      end: end.clone(),
      radius,
      color,
      role,
      birth: growth?.birth ?? (role === "trunk" ? 0.03 : 0.18),
      mature: growth?.mature ?? (role === "trunk" ? 0.46 : 0.72),
      branchOrder: growth?.order ?? (role === "trunk" ? 0 : 1),
    }, cluster);
  };

  const addLeaf = (
    position,
    direction,
    length,
    width,
    roll,
    color,
    cluster,
    role = "canopy",
    growth = null,
  ) => {
    const bladeAxis = direction.clone().normalize();
    const facingBias = new THREE.Vector3(0, 0.08, 1)
      .add(new THREE.Vector3(signed(random) * 0.28, signed(random) * 0.12, signed(random) * 0.22));
    facingBias.addScaledVector(bladeAxis, -facingBias.dot(bladeAxis));
    if (facingBias.lengthSq() < 0.01) facingBias.copy(X_AXIS);
    const bladeNormal = facingBias.normalize();
    const bladeAcross = new THREE.Vector3().crossVectors(bladeAxis, bladeNormal).normalize();
    bladeNormal.crossVectors(bladeAcross, bladeAxis).normalize();
    const basis = new THREE.Matrix4().makeBasis(bladeAcross, bladeAxis, bladeNormal);
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(basis);
    const handedness = random() < 0.5 ? -1 : 1;
    quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(
      Y_AXIS,
      signed(random) * 0.32 + (handedness < 0 ? Math.PI : 0),
    ));
    push("leaves", {
      position: position.clone(),
      quaternion,
      length,
      width,
      color,
      form: growth?.form ?? "narrow-lanceolate-phyllode",
      continuousWithStem: growth?.continuousWithStem ?? false,
      wingSides: growth?.wingSides ?? PHYLLODE_WING_SIDES,
      freeTipRatio: growth?.freeTipRatio ?? 0.88,
      veinCount: PHYLLODE_VEIN_COUNT,
      tapersBothEnds: true,
      undulation: 0.72 + random() * 0.3,
      curve: 0.82 + random() * 0.24,
      handedness,
      role,
      birth: growth?.birth ?? 0.43,
      mature: growth?.mature ?? 0.84,
      branchOrder: growth?.order ?? 1,
    }, cluster);
  };

  const addBloom = (
    position,
    baseRadius,
    cluster,
    prominence = "primary",
    pedicelAxis = Y_AXIS,
    growth = null,
  ) => {
    const bloomOrdinal = data.all.blooms.length;
    const archetypeRandom = mulberry32(
      (seed ^ Math.imul(bloomOrdinal + 1, 0x9e3779b9)) >>> 0,
    );
    const archetypeRoll = archetypeRandom();
    const heroThreshold = prominence === "terminal" ? 0.66 : prominence === "primary" ? 0.71 : 0.82;
    /* Every head carries its mature topology. Its interactive pose supplies
       the bud, so even the smallest head has enough florets and stamens to
       become a recognisable golden pom-pom instead of scaling a sparse shell. */
    const archetype = archetypeRoll > heroThreshold ? "hero" : "open";
    const radiusScale = archetype === "hero"
      ? 1.16 + random() * 0.09
      : 1.03 + random() * 0.09;
    const radius = baseRadius * radiusScale;
    const maturity = archetype === "hero"
      ? 0.96 + random() * 0.04
      : 0.78 + random() * 0.14;
    const phase = random() * FULL_TURN;
    const normalizedPedicel = pedicelAxis.clone().normalize();
    const displayNormal = new THREE.Vector3(
      THREE.MathUtils.clamp(position.x * 0.11, -0.33, 0.33),
      0.1,
      1,
    ).normalize();
    const presentationRoll = archetypeRandom();
    const presentationWeight = presentationRoll < 0.62
      ? 0.72
      : presentationRoll < 0.88
        ? 0.58
        : 0.38;
    const faceNormal = normalizedPedicel.multiplyScalar(1 - presentationWeight)
      .addScaledVector(displayNormal, presentationWeight)
      .normalize();
    const faceQuaternion = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, faceNormal);
    faceQuaternion.multiply(new THREE.Quaternion().setFromAxisAngle(Y_AXIS, phase * 0.31));
    const basisU = X_AXIS.clone().applyQuaternion(faceQuaternion).normalize();
    const basisV = Z_AXIS.clone().applyQuaternion(faceQuaternion).normalize();
    const headForm = "dense-globular-pompom";
    const rosetteRadius = radius * (archetype === "hero" ? 0.74 : 0.72);
    // The receptacle used to be flattened to sit inside a lens. Inside a ball
    // it has to be a ball, or the flanks show a disc through the florets.
    const coreScale3 = archetype === "hero"
      ? new THREE.Vector3(0.7, 0.68, 0.7)
      : new THREE.Vector3(0.68, 0.66, 0.68);
    const coreOffset = 0;
    const coreColor = choose(CORE_COLORS, random);
    const surfaceFloretCount = archetype === "hero"
      ? profile.heroFlorets
      : profile.openFlorets;
    const rawInnerCount = Math.max(7, Math.round(profile.innerFibersPerBloom * (
      archetype === "hero" ? 1.7 : 1
    )));
    const innerCount = Math.ceil(rawInnerCount / 2) * 2;
    const rawCenterSpeckCount = Math.max(10, Math.round(profile.interiorSpecks * (
      archetype === "hero" ? 1.9 : 1.08
    )));
    const centerSpeckCount = Math.ceil(rawCenterSpeckCount / 2) * 2;
    const exportInnerCount = Math.min(innerCount, Math.max(3, Math.round(
      profile.exportInnerFibers * (archetype === "hero" ? 1 : 0.65),
    )));
    const exportCenterCount = Math.min(centerSpeckCount, Math.max(2, Math.round(
      profile.exportCenterSpecks * (archetype === "hero" ? 1 : 0.7),
    )));
    const bloom = {
      index: bloomOrdinal,
      position: position.clone(),
      radius,
      color: coreColor,
      undercoatColor: choose(PETAL_COLORS.slice(1), random),
      maturity,
      archetype,
      prominence,
      headForm,
      faceNormal: faceNormal.clone(),
      faceQuaternion: faceQuaternion.clone(),
      basisU,
      basisV,
      rosetteRadius,
      coreScale3,
      coreOffset,
      layerCount: 3,
      surfaceFloretCount,
      packing: null,
      birth: growth?.birth ?? 0.72,
      matureAt: growth?.mature ?? 1,
      branchOrder: growth?.order ?? 2,
    };
    push("blooms", bloom, cluster);

    const emergenceOrderFor = (patchIndex, salt) => {
      let value = (
        seed
        ^ Math.imul(bloomOrdinal + 1, 0x9e3779b9)
        ^ Math.imul(patchIndex + 1, 0x85ebca6b)
        ^ salt
      ) >>> 0;
      value ^= value >>> 16;
      value = Math.imul(value, 0x7feb352d);
      value ^= value >>> 15;
      value = Math.imul(value, 0x846ca68b);
      value ^= value >>> 16;
      return (value >>> 0) / 4294967296;
    };

    const spatialNoiseFor = (normal, salt = 0) => THREE.MathUtils.clamp(
      0.5
        + Math.sin(
          normal.x * 5.1
            + normal.y * 3.7
            + normal.z * 4.3
            + phase
            + salt * 0.000001,
        ) * 0.28
        + Math.sin(
          normal.x * 2.4
            - normal.y * 4.6
            + normal.z * 3.2
            - phase * 0.7,
        ) * 0.22,
      0,
      1,
    );

    const addCurvedFiber = (
      start,
      end,
      startColor,
      endColor,
      lineRadius,
      role,
      exportable,
      bloomOrder,
      metadata = null,
    ) => {
      const axis = end.clone().sub(start).normalize();
      const bendDirection = randomUnitVector(random);
      bendDirection.addScaledVector(axis, -bendDirection.dot(axis));
      if (bendDirection.lengthSq() < 0.01) bendDirection.crossVectors(axis, Y_AXIS);
      if (bendDirection.lengthSq() < 0.01) bendDirection.crossVectors(axis, X_AXIS);
      bendDirection.normalize();
      const expressiveBend = role === "outer" && random() < 0.06 ? 0.015 + random() * 0.025 : 0;
      const bendAmount = role === "inner"
        ? radius * (0.075 + random() * 0.115)
        : start.distanceTo(end) * (0.08 + random() * 0.12 + expressiveBend);
      const bend = start.clone().lerp(end, 0.4 + random() * 0.2)
        .addScaledVector(bendDirection, bendAmount);
      const midColor = choose(FILAMENT_COLORS, random);

      const filament = {
        id: data.all.filaments.length,
        start,
        bend,
        end,
        startColor,
        midColor,
        endColor,
        radius: lineRadius,
        role,
        exportable,
        headIndex: bloomOrdinal,
        bloomOrder,
        bloomPhase: THREE.MathUtils.clamp(
          end.distanceTo(position) / Math.max(radius, 0.0001),
          0,
          1,
        ),
        ...(metadata ?? {}),
      };
      push("filaments", filament, cluster);
      return filament;
    };

    const rosetteSamples = [];
    for (let index = 0; index < surfaceFloretCount; index += 1) {
      const bloomOrder = emergenceOrderFor(Math.floor(index / 4), 0x68bc21eb);
      let normal;
      let heightScale;
      let motifScale;
      let floretAnchor;
      let terminal;
      let filamentStart;
      let layer = 0;
      let radialT = 0;

      const side = index % 2 === 0 ? 1 : -1;
      const pairIndex = Math.floor(index / 2);
      const pairCount = Math.ceil(surfaceFloretCount / 2);
      const pairRandom = mulberry32((
        seed
        ^ Math.imul(bloomOrdinal + 1, 0x85ebca6b)
        ^ Math.imul(pairIndex + 1, 0xc2b2ae35)
      ) >>> 0);
      const sample = (pairIndex + 0.5) / pairCount;
        /* Equal-area bands on a shell need cos(theta) spaced evenly, not
           radius. Spacing radius evenly — sqrt(sample), the disc rule — is
           precisely what piled these florets onto a lens and left the flanks
           of every head bare. Archimedes' hat-box, and the heads become
           balls. */
      const cosTheta = 1 - sample * SHELL_COS_SPAN;
      const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
      radialT = sinTheta;
      const angle = pairIndex * GOLDEN_ANGLE + phase;
      const radialDirection = basisU.clone().multiplyScalar(Math.cos(angle))
        .addScaledVector(basisV, Math.sin(angle))
        .normalize();
      const sideNormal = faceNormal.clone().multiplyScalar(side);
      const tangentDirection = new THREE.Vector3()
        .crossVectors(sideNormal, radialDirection)
        .normalize();
      const edgeWeight = THREE.MathUtils.smoothstep(radialT, 0.58, 1);
        /* A real head is a lumpy ball, not a turned one. The wobble now rides
           the whole radius rather than the rim alone, because on a sphere
           every part of the surface is silhouette from some angle. */
      const scallop = 0.022 * Math.sin(angle * 5 + phase * 1.3)
        + edgeWeight * (
          0.055 * Math.sin(angle * 7 + phase * 1.7)
          + 0.03 * Math.sin(angle * 11 - phase * 0.8)
          + 0.022 * signed(pairRandom)
        );
      const shellRadius = rosetteRadius * (1 + scallop);
      layer = radialT < 0.34 ? 0 : radialT < 0.72 ? 1 : 2;
      const surfacePoint = position.clone()
        .addScaledVector(radialDirection, shellRadius * sinTheta)
        .addScaledVector(faceNormal, shellRadius * cosTheta * side);
        /* On a ball the normal is the radius. The old outward-slope fudge was
           an approximation of a curvature the geometry now actually has. */
      normal = radialDirection.clone().multiplyScalar(sinTheta)
        .addScaledVector(sideNormal, cosTheta)
        .addScaledVector(tangentDirection, 0.02 * Math.sin(angle * 7 - phase))
        .normalize();
        /* A hemisphere carries twice the area of the disc it projects onto, so
           the hexagonal spacing that fills it is wider by root two. */
      const spacing = rosetteRadius * Math.sqrt(
        4 * Math.PI / (Math.sqrt(3) * pairCount),
      );
        /* Nearly flat now. The old gradient shrank the florets at the centre
           of the head, which is right for a lens — the middle of a lens is the
           part you look straight down onto — and wrong for a ball, where it
           leaves the pole smooth while the rim stays fizzy and reads as a bald
           patch from any distance. A real head is one size of floret all
           over. */
      const layerScale = [1, 1.02, 1.08][layer];
      const rimCharacter = 1 + edgeWeight * (
        0.1 * Math.sin(angle * 7 + phase * 0.43)
        + 0.055 * signed(pairRandom)
      );
      motifScale = spacing / (2 * 0.82) * 1.38 * layerScale * rimCharacter
        * (0.95 + pairRandom() * 0.1);
      heightScale = [1.02, 1, 1.06][layer] * (0.96 + pairRandom() * 0.08);
      floretAnchor = surfacePoint.clone().addScaledVector(normal, -motifScale * 0.035);
      /* A wattle head is a soft, compact ball. The earlier reach exposed each
         individual filament as a radial spoke and turned the silhouette into
         a sea urchin; keep the halo short enough that density, not length,
         makes the bloom feel fluffy. */
      terminal = floretAnchor.clone().addScaledVector(normal, motifScale * 0.12 * heightScale);
      filamentStart = surfacePoint.clone().addScaledVector(
        normal,
        -motifScale * (0.045 + pairRandom() * 0.035),
      );
      rosetteSamples.push({
        surfacePoint: surfacePoint.clone(),
        terminal: terminal.clone(),
        normal: normal.clone(),
        side,
        pairIndex,
        radialT,
        layer,
        motifScale,
        heightScale,
      });

      const quaternion = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, normal);
      quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(
        Y_AXIS,
        Math.floor(index / 2) * GOLDEN_ANGLE * 0.5
          + index % 2 * Math.PI / FLORET_PARTS
          + signed(random) * 0.08,
      ));

      const bloomNoise = spatialNoiseFor(normal, index + 1);
      const siteKey = `${bloomOrdinal}:${index}`;
      const openOffset = floretAnchor.clone().sub(position);
      const budPosition = position.clone().addScaledVector(
        openOffset,
        BUD_FLORET_RADIUS_FACTOR,
      );
      const cupPosition = position.clone().addScaledVector(
        openOffset,
        CUP_FLORET_RADIUS_FACTOR,
      );
      const capPosition = position.clone().addScaledVector(
        openOffset,
        BUD_CAP_RADIUS_FACTOR,
      );
      const capScale = motifScale * BUD_CAP_SCALE_FACTOR;

      push("caps", {
        position: capPosition,
        quaternion: quaternion.clone(),
        normal: normal.clone(),
        scale: capScale,
        color: BUD_CAP_COLOR.getHex(),
        headIndex: bloomOrdinal,
        siteIndex: index,
        siteKey,
        bloomOrder,
        bloomNoise,
      }, cluster);

      push("tips", {
        position: capPosition.clone().addScaledVector(normal, capScale * 0.88),
        origin: capPosition.clone(),
        size: capScale * 0.2,
        color: BUD_TIP_BURGUNDY.getHex(),
        role: "bud-pore",
        headIndex: bloomOrdinal,
        siteIndex: index,
        siteKey,
        bloomOrder,
        bloomNoise,
        exportable: false,
      }, cluster);

      /* In Acacia the petals disappear beneath the stamen mass. Keep them as
         the animated opening mechanism, but recess them so the final read is
         hundreds of round anthers forming one soft sphere. */
      const petalMotifScale = motifScale * 0.09;
      push("florets", {
        position: floretAnchor,
        budPosition,
        cupPosition,
        quaternion,
        normal: normal.clone(),
        scale: petalMotifScale,
        heightScale,
        color: choose(PETAL_COLORS, random),
        headIndex: bloomOrdinal,
        siteIndex: index,
        siteKey,
        headForm,
        layer,
        radialT,
        bloomOrder,
        bloomNoise,
        bloomPhase: radialT,
        petalCount: FLORET_PARTS,
        exportable: true,
      }, cluster);

      for (let part = 0; part < STAMEN_BUNDLES_PER_FLORET; part += 1) {
        const angle = part / STAMEN_BUNDLES_PER_FLORET * FULL_TURN;
        const cosine = Math.cos(angle);
        const sine = Math.sin(angle);
        const tangent = basisU.clone().multiplyScalar(cosine)
          .addScaledVector(basisV, sine)
          .normalize();
        /* The photographic pom-pom is made by filaments crossing the whole
           visible ball, not by a smooth sphere with hairs pasted onto its
           rim. Each representative stamen therefore starts well inside the
           head and reaches a slightly irregular point near the outer shell. */
        const stamenStart = position.clone()
          .addScaledVector(normal, radius * (0.52 + random() * 0.1))
          .addScaledVector(tangent, radius * (0.01 + random() * 0.018));
        const antherPosition = surfacePoint.clone()
          .addScaledVector(normal, radius * (0.018 + random() * 0.04))
          .addScaledVector(tangent, radius * (0.018 + random() * 0.025));
        const filament = addCurvedFiber(
          stamenStart,
          antherPosition,
          choose(FILAMENT_COLORS, random),
          choose(TIP_COLORS, random),
          radius * (0.0018 + random() * 0.0008),
          "floret",
          true,
          bloomOrder,
          {
            partIndex: part,
            bloomNoise,
            normal: normal.clone(),
          },
        );
        push("tips", {
          position: antherPosition,
          origin: stamenStart,
          size: radius * (0.009 + random() * 0.009),
          color: choose(TIP_COLORS, random),
          role: "floret-anther",
          headIndex: bloomOrdinal,
          siteIndex: index,
          siteKey,
          partIndex: part,
          bloomOrder,
          bloomNoise,
          bloomPhase: radialT,
          sourceFilamentId: filament.id,
          exportable: true,
        }, cluster);
      }

      const startColor = choose(FILAMENT_COLORS, random);
      const endColor = choose(TIP_COLORS, random);

      addCurvedFiber(
        filamentStart,
        terminal,
        startColor,
        endColor,
        radius * (0.002 + random() * 0.001),
        "outer",
        true,
        bloomOrder,
        {
          siteIndex: index,
          siteKey,
          bloomNoise,
          normal: normal.clone(),
        },
      );

    }
    bloom.packing = measureRosettePacking(rosetteSamples, bloom);

    for (let index = 0; index < innerCount; index += 1) {
      const bloomOrder = emergenceOrderFor(Math.floor(index / 3), 0x27d4eb2d);
      const side = index % 2 === 0 ? 1 : -1;
      const pairIndex = Math.floor(index / 2);
      const pairCount = innerCount / 2;
      const pairRandom = mulberry32((
        seed
        ^ Math.imul(bloomOrdinal + 1, 0x27d4eb2d)
        ^ Math.imul(pairIndex + 1, 0x165667b1)
      ) >>> 0);
      const angle = pairIndex * GOLDEN_ANGLE + phase * 0.73;
      const radialDirection = basisU.clone().multiplyScalar(Math.cos(angle))
        .addScaledVector(basisV, Math.sin(angle));
      const radialT = Math.sqrt((pairIndex + 0.5) / pairCount);
      const start = position.clone()
        .addScaledVector(radialDirection, rosetteRadius * radialT * 0.12)
        .addScaledVector(faceNormal, side * radius * (0.035 + pairRandom() * 0.045));
      const end = position.clone()
        .addScaledVector(radialDirection, rosetteRadius * radialT * (0.44 + pairRandom() * 0.17))
        .addScaledVector(faceNormal, side * radius * (
          0.17 + 0.18 * (1 - radialT * radialT) + pairRandom() * 0.09
        ));
      const startColor = choose(CORE_COLORS, random);
      const endColor = choose(TIP_COLORS, random);
      const filament = addCurvedFiber(
        start,
        end,
        startColor,
        endColor,
        radius * (0.006 + random() * 0.003),
        "inner",
        index < exportInnerCount,
        bloomOrder,
        { bloomNoise: bloomOrder },
      );
      push("tips", {
        position: end.clone(),
        origin: start.clone(),
        size: radius * (0.035 + random() * 0.026),
        color: endColor,
        role: "center",
        headIndex: bloomOrdinal,
        bloomOrder,
        bloomNoise: bloomOrder,
        sourceFilamentId: filament.id,
        bloomPhase: THREE.MathUtils.clamp(
          end.distanceTo(position) / Math.max(radius, 0.0001),
          0,
          1,
        ),
        exportable: index < exportInnerCount,
      }, cluster);
    }

    const centerPhase = phase + GOLDEN_ANGLE * 0.5;
    for (let index = 0; index < centerSpeckCount; index += 1) {
      const bloomOrder = emergenceOrderFor(Math.floor(index / 4), 0xd3a2646c);
      const side = index % 2 === 0 ? 1 : -1;
      const pairIndex = Math.floor(index / 2);
      const pairCount = centerSpeckCount / 2;
      const pairRandom = mulberry32((
        seed
        ^ Math.imul(bloomOrdinal + 1, 0xd3a2646c)
        ^ Math.imul(pairIndex + 1, 0xfd7046c5)
      ) >>> 0);
      const radialT = Math.sqrt((pairIndex + 0.5) / pairCount) * 0.62;
      const angle = pairIndex * GOLDEN_ANGLE + centerPhase;
      const radialDirection = basisU.clone().multiplyScalar(Math.cos(angle))
        .addScaledVector(basisV, Math.sin(angle));
      const speckPosition = position.clone()
        .addScaledVector(radialDirection, rosetteRadius * radialT)
        .addScaledVector(faceNormal, side * radius * (
          0.12 + 0.24 * (1 - radialT * radialT) + pairRandom() * 0.05
        ));
      push("tips", {
        position: speckPosition,
        origin: position.clone(),
        size: radius * (archetype === "hero"
          ? 0.04 + random() * 0.03
          : 0.035 + random() * 0.026),
        color: choose(TIP_COLORS, random),
        role: "center",
        headIndex: bloomOrdinal,
        bloomOrder,
        bloomNoise: bloomOrder,
        bloomPhase: THREE.MathUtils.clamp(
          speckPosition.distanceTo(position) / Math.max(radius, 0.0001),
          0,
          1,
        ),
        exportable: index < exportCenterCount,
      }, cluster);
    }

    /* The reference reads as one fibrous yellow ball at normal viewing size,
       not as a diagram of its individual five-part florets. A secondary
       equal-area particle shell supplies that perceptual mass with tiny round
       anthers. It is point geometry (one draw call), so this added density is
       substantially cheaper than lengthening or multiplying line filaments. */
    const fuzzCount = Math.round(profile.pompomFuzzPerBloom * (archetype === "hero" ? 1.14 : 1));
    for (let index = 0; index < fuzzCount; index += 1) {
      const fuzzRandom = mulberry32((
        seed
        ^ Math.imul(bloomOrdinal + 1, 0x51ed270b)
        ^ Math.imul(index + 1, 0x9e3779b9)
      ) >>> 0);
      const axial = 1 - 2 * (index + 0.5) / fuzzCount;
      const radial = Math.sqrt(Math.max(0, 1 - axial * axial));
      const angle = index * GOLDEN_ANGLE + phase * 1.17;
      const normal = basisU.clone().multiplyScalar(Math.cos(angle) * radial)
        .addScaledVector(basisV, Math.sin(angle) * radial)
        .addScaledVector(faceNormal, axial)
        .normalize();
      /* Keep the photographic halo compact.  Golden-wattle heads have a
         fibrous edge, but their countless short filaments overlap into a
         cohesive pom-pom rather than leaving isolated points far outside the
         silhouette. */
      const shellRadius = radius * (0.51 + Math.pow(fuzzRandom(), 0.75) * 0.18);
      const fuzzPosition = position.clone().addScaledVector(normal, shellRadius);
      const bloomOrder = emergenceOrderFor(Math.floor(index / 6), 0x51ed270b);
      push("tips", {
        position: fuzzPosition,
        origin: position.clone().addScaledVector(normal, radius * 0.2),
        size: radius * (0.008 + fuzzRandom() * 0.009),
        color: choose(TIP_COLORS, fuzzRandom),
        role: "pompom-fuzz",
        headIndex: bloomOrdinal,
        bloomOrder,
        bloomNoise: spatialNoiseFor(normal, index + 1701),
        bloomPhase: shellRadius / Math.max(radius, 0.0001),
        exportable: false,
      }, cluster);
    }

    /* A tiny warm receptacle is intermittently visible through the stamens in
       the photographic references. It anchors the fluff without turning the
       flower into a dark-eyed daisy. */
    push("tips", {
      position: position.clone().addScaledVector(faceNormal, radius * 0.63),
      origin: position.clone(),
      size: radius * (0.065 + random() * 0.025),
      color: 0x8f6313,
      role: "flower-receptacle",
      headIndex: bloomOrdinal,
      bloomOrder: 0.96,
      bloomNoise: 0.5,
      bloomPhase: 0.66,
      exportable: false,
    }, cluster);
  };

  /* Parametric stochastic L-system: parallel apex rewriting creates the
     hierarchy; the 3D turtle supplies geometry and per-module developmental
     windows. The right-anchored apical axis extends leftward while lateral
     sprays emerge in golden-angle succession. */
  const architecture = generateWattleArchitecture({
    seed,
    quality: profile.id,
  });
  const toWorld = (tuple) => new THREE.Vector3(...tuple).add(TREE_ROOT);

  for (const segment of architecture.segments) {
    const start = toWorld(segment.start);
    const end = toWorld(segment.end);
    const cluster = end.x < -0.34 ? 0 : end.x > 0.34 ? 2 : 1;
    const branchT = THREE.MathUtils.clamp(segment.order / 3, 0, 1);
    const ageT = THREE.MathUtils.clamp(segment.birth / 0.7, 0, 1);
    const color = mixColor(
      choose(BARK_COLORS.slice(0, 3), random),
      choose(YOUNG_STEM_COLORS, random),
      branchT * 0.72 + ageT * 0.18,
    );
    addSegment(
      start,
      end,
      segment.radius,
      color,
      cluster,
      segment.order === 0 ? "trunk" : "branch",
      segment,
    );
  }

  for (const leaf of architecture.leaves) {
    const position = toWorld(leaf.position);
    const direction = new THREE.Vector3(...leaf.direction).normalize();
    const cluster = position.x < -0.34 ? 0 : position.x > 0.34 ? 2 : 1;
    const role = leaf.order === 0 && leaf.birth < 0.12 ? "sapling" : "canopy";
    addLeaf(
      position,
      direction,
      leaf.length,
      leaf.width,
      leaf.roll,
      choose(role === "sapling" ? YOUNG_PHYLLODE_COLORS : LEAF_COLORS, random),
      cluster,
      role,
      leaf,
    );
  }

  for (let index = 0; index < architecture.buds.length; index += 1) {
    const bud = architecture.buds[index];
    const position = toWorld(bud.position);
    const direction = new THREE.Vector3(...bud.direction).normalize();
    const cluster = position.x < -0.34 ? 0 : position.x > 0.34 ? 2 : 1;
    const prominence = bud.order <= 1
      ? "terminal"
      : index % 4 === 0
        ? "primary"
        : "companion";
    addBloom(
      position,
      bud.radius,
      cluster,
      prominence,
      direction,
      bud,
    );
  }

  data.grammar = {
    family: "parametric-stochastic-bracketed-l-system",
    axiom: "A(0)",
    iterations: profile.id === "high" ? 6 : 5,
    moduleCount: architecture.sentence.length,
    segmentCount: architecture.segments.length,
    terminalBudCount: architecture.buds.length,
    racemeCount: new Set(architecture.buds.map((bud) => bud.racemeId)).size,
    peduncleCount: architecture.segments.filter((segment) => segment.kind === "flower-pedicel").length,
  };

  computeDataBounds(data);
  data.metrics = computeSemanticMetrics(data);
  return data;
}

function computeDataBounds(data) {
  const box = data.bounds;
  box.makeEmpty();

  for (const segment of data.all.segments) {
    box.expandByPoint(segment.start);
    box.expandByPoint(segment.end);
  }

  for (const leaf of data.all.leaves) {
    const tip = new THREE.Vector3(0, leaf.length, leaf.length * 0.12 * (leaf.curve ?? 1))
      .applyQuaternion(leaf.quaternion)
      .add(leaf.position);
    const bladePadding = Math.max(0.025, leaf.length * leaf.width * 0.58);
    const padding = new THREE.Vector3(bladePadding, bladePadding, bladePadding);
    box.expandByPoint(leaf.position.clone().sub(padding));
    box.expandByPoint(leaf.position.clone().add(padding));
    box.expandByPoint(tip.clone().sub(padding));
    box.expandByPoint(tip.clone().add(padding));
  }

  for (const bloom of data.all.blooms) {
    const padding = new THREE.Vector3(1, 1, 1).multiplyScalar(bloom.radius * 1.24);
    box.expandByPoint(bloom.position.clone().sub(padding));
    box.expandByPoint(bloom.position.clone().add(padding));
  }

  for (const floret of data.all.florets) {
    const padding = new THREE.Vector3(1, 1, 1).multiplyScalar(floret.scale * 1.08);
    box.expandByPoint(floret.position.clone().sub(padding));
    box.expandByPoint(floret.position.clone().add(padding));
  }

  for (const filament of data.all.filaments) {
    const padding = new THREE.Vector3(1, 1, 1).multiplyScalar(filament.radius * 2);
    for (const point of [filament.start, filament.bend, filament.end]) {
      box.expandByPoint(point.clone().sub(padding));
      box.expandByPoint(point.clone().add(padding));
    }
  }

  for (const tip of data.all.tips) {
    const padding = new THREE.Vector3(1, 1, 1).multiplyScalar(tip.size * 1.1);
    box.expandByPoint(tip.position.clone().sub(padding));
    box.expandByPoint(tip.position.clone().add(padding));
  }
}

function buildBouquet(data) {
  const root = new THREE.Group();
  root.name = "Golden_Wattle_Branch";
  root.userData = {
    species: "Golden Wattle reference morphology",
    seed: data.seed,
    description: "Procedural living Golden Wattle branch grown from a young shoot",
    architecture: data.grammar?.family ?? "procedural-branch",
    lsystemAxiom: data.grammar?.axiom ?? null,
    lsystemIterations: data.grammar?.iterations ?? null,
    lsystemModuleCount: data.grammar?.moduleCount ?? null,
    inflorescenceForm: "multi-head axillary racemes with short radial pedicels",
    racemeCount: data.grammar?.racemeCount ?? 0,
    headForm: "dense spherical pom-poms collapsed into interactive globular bud poses",
    floretMerosity: FLORET_PARTS,
    floretPacking: "mirrored equal-area golden-angle shells with compact round anther coverage",
    phyllodeForm: "long narrow lanceolate green phyllodes with three visible nerves",
  };

  /* The 0.84 tip matches the primary continuation ratio, so consecutive
     internodes meet without the bead-like swelling produced by the former
     0.70 tip. Lateral axes still taper faster and remain visibly subordinate. */
  const stemGeometry = new THREE.CylinderGeometry(
    0.84,
    1,
    1,
    state.profile.id === "high" ? 8 : 6,
    1,
    true,
  );
  /* Instanced bark colours are multiplied with the geometry colour in
     Three.js. CylinderGeometry has no vertex colour attribute by default, so
     enabling vertexColors on the stem material would otherwise multiply the
     instance colour by an undefined channel and turn every trunk black. A
     white base keeps the per-segment bark ramp intact. */
  stemGeometry.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(
      new Float32Array(stemGeometry.attributes.position.count * 3).fill(1),
      3,
    ),
  );
  stemGeometry.name = "Stem_Segment_Geometry";
  const leafGeometry = createLeafGeometry();
  const floretGeometry = createFivePartFloretGeometry();
  const capGeometry = createBudCapsuleGeometry();
  const cupGeometry = createCorollaCupGeometry();
  const coreGeometry = createBloomSupportGeometry();

  /* Materials respond to the page's procedural environment (see
     src/scene/Lighting.tsx): bark stays matte but picks up a little sky,
     phyllodes carry the leathery sheen of a real Acacia blade. */
  const stemMaterial = new THREE.MeshStandardMaterial({
    color: 0xfffffe,
    roughness: 0.84,
    metalness: 0,
    vertexColors: true,
    envMapIntensity: 0.55,
  });
  stemMaterial.name = "Stem_Material";
  const stemGrowth = { value: 1 };
  enableTimedStemGrowth(stemMaterial, stemGrowth);
  const leafMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xfffffe,
    roughness: 0.6,
    metalness: 0,
    emissive: 0x000000,
    emissiveIntensity: 0,
    vertexColors: true,
    side: THREE.DoubleSide,
    envMapIntensity: 0.9,
    sheen: 0.55,
    sheenRoughness: 0.6,
    sheenColor: new THREE.Color(0x8fb56a),
  });
  leafMaterial.name = "Phyllode_Material";
  const leafGrowth = { value: 1 };
  enableTimedPhyllodeGrowth(leafMaterial, leafGrowth);
  const saplingLeafMaterial = leafMaterial.clone();
  saplingLeafMaterial.name = "Sapling_Phyllode_Material";
  const saplingLeafGrowth = { value: 1 };
  enableTimedPhyllodeGrowth(saplingLeafMaterial, saplingLeafGrowth);
  const coreMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
  coreMaterial.name = "Invisible_Bloom_Interaction_Proxy_Material";
  const pompomMassMaterial = createPompomMassMaterial();
  const capMaterial = new THREE.MeshStandardMaterial({
    color: 0xfffffe,
    roughness: 0.78,
    metalness: 0,
    vertexColors: true,
    alphaHash: true,
    envMapIntensity: 0.6,
  });
  capMaterial.name = "Closed_Floret_Capsule_Material";
  const budGrowth = { value: 1 };
  enableInstancedVisibility(capMaterial, "bud-capsule", budGrowth);
  const cupMaterial = new THREE.MeshStandardMaterial({
    color: 0xfffffe,
    roughness: 0.62,
    metalness: 0,
    emissive: 0x000000,
    emissiveIntensity: 0,
    vertexColors: true,
    alphaHash: true,
    envMapIntensity: 0.5,
  });
  cupMaterial.name = "Golden_Corolla_Cup_Material";
  enableInstancedVisibility(cupMaterial, "corolla-cup");
  const petalMaterial = new THREE.MeshStandardMaterial({
    color: 0xfffffe,
    roughness: 0.62,
    metalness: 0,
    emissive: 0x000000,
    emissiveIntensity: 0,
    vertexColors: true,
    side: THREE.DoubleSide,
    envMapIntensity: 0.5,
  });
  petalMaterial.name = "Five_Part_Floret_Material";
  enableInstancedVisibility(petalMaterial, "petal-morph");
  const lineMaterial = new LineMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
    linewidth: state.profile.id === "high" ? 0.22 : 0.2,
    worldUnits: false,
    alphaToCoverage: true,
  });
  lineMaterial.name = "Recessed_Stamen_Filament_Material";
  enableLineVisibility(lineMaterial);
  const pointsMaterial = createPointsMaterial();
  const fuzzMaterial = createPompomFuzzMaterial();
  const swayGroups = [];
  const coreMeshes = [];

  const growthTrunks = [];
  const growthCanopies = [];
  const growthLeaves = [];

  data.clusters.forEach((bucket, clusterIndex) => {
    const group = new THREE.Group();
    group.name = ["Left_Wattle_Crown", "Central_Wattle_Crown", "Right_Wattle_Crown"][clusterIndex];
    group.position.copy(GATHER_POINT);
    group.userData.sway = {
      phase: 0.7 + clusterIndex * 1.93,
      frequency: 0.34 + clusterIndex * 0.035,
      amplitude: [0.011, 0.007, 0.013][clusterIndex],
    };

    const trunk = createStemInstances(
      bucket.segments.filter((item) => item.role === "trunk"),
      stemGeometry,
      stemMaterial,
    );
    trunk.name = "Branch_Primary_Axis_Segments";
    const stems = createStemInstances(
      bucket.segments.filter((item) => item.role !== "trunk"),
      stemGeometry,
      stemMaterial,
    );
    stems.name = "Branch_Lateral_Axis_Segments";
    const leaves = createLeafInstances(
      bucket.leaves.filter((item) => item.role !== "sapling"),
      leafGeometry,
      leafMaterial,
    );
    const saplingLeaves = createLeafInstances(
      bucket.leaves.filter((item) => item.role === "sapling"),
      leafGeometry,
      saplingLeafMaterial,
    );
    saplingLeaves.name = "Juvenile_Golden_Wattle_Phyllodes";
    const cores = createCoreInstances(bucket.blooms, coreGeometry, coreMaterial);
    /* Interaction proxies never render. The mature yellow mass is a separate
       soft point-sprite layer whose visibility follows the bloom timeline, so
       an olive sphere can never ghost behind a half-open flower. */
    cores.visible = false;
    const pompomMass = createPompomMassPoints(bucket.blooms, pompomMassMaterial);
    const caps = createCapInstances(bucket.caps, capGeometry, capMaterial);
    const cups = createCupInstances(bucket.florets, cupGeometry, cupMaterial);
    const florets = createFloretInstances(bucket.florets, floretGeometry, petalMaterial);
    const filaments = createFilamentLines(bucket.filaments, lineMaterial);
    const regularTips = [];
    const fuzzTips = [];
    for (const item of bucket.tips) {
      if (item.role === "pompom-fuzz") fuzzTips.push(item);
      else regularTips.push(item);
    }
    const tips = createTipPoints(regularTips, pointsMaterial);
    const fuzz = createPompomFuzzPoints(fuzzTips, fuzzMaterial);

    const canopy = new THREE.Group();
    canopy.name = "Growing_Wattle_Canopy";
    canopy.add(stems, leaves, cores, pompomMass, caps, cups, florets, filaments, tips, fuzz);
    const saplingFrame = new THREE.Group();
    saplingFrame.name = "Growing_Sapling_Frame";
    saplingFrame.add(trunk, saplingLeaves);
    group.add(saplingFrame, canopy);
    root.add(group);
    swayGroups.push(group);
    coreMeshes.push(cores);
    growthTrunks.push(saplingFrame);
    growthCanopies.push(canopy);
    growthLeaves.push(leaves);
  });

  return {
    root,
    swayGroups,
    coreMeshes,
    pointsMaterial,
    fuzzMaterial,
    pompomMassMaterial,
    petalMaterial,
    growthTrunks,
    growthCanopies,
    growthLeaves,
    growthMaterials: {
      cupMaterial,
      leafMaterial,
      leafGrowth,
      stemMaterial,
      stemGrowth,
      saplingLeafMaterial,
      saplingLeafGrowth,
      capMaterial,
      budGrowth,
      pointsMaterial,
      tipGrowth: pointsMaterial.uniforms.uGrowthScale,
      fuzzMaterial,
      fuzzGrowth: fuzzMaterial.uniforms.uGrowthScale,
    },
  };
}

function createLeafGeometry() {
  const positions = [];
  const colors = [];
  const uvs = [];
  const indices = [];
  const columns = [-1, -0.67, -0.33, 0, 0.33, 0.67, 1];
  const rowCount = 21;

  /* The references are dominated by long, narrow, pointed phyllodes. A
     fourteen-row blade keeps the base pinched, the middle nearly parallel,
     and the tip acute. Five columns provide a central keel and enough cross
     section for broad, soft highlights without making the leaf look faceted. */
  for (let row = 0; row < rowCount; row += 1) {
    const y = row / (rowCount - 1);
    const taper = Math.pow(Math.max(0, Math.sin(Math.PI * y)), 0.58);
    const width = row === 0 ? 0.028 : row === rowCount - 1 ? 0.001 : taper * 0.49;
    for (let column = 0; column < columns.length; column += 1) {
      const crossT = columns[column];
      const edgeT = Math.abs(crossT);
      const ridge = Math.sin(Math.PI * y) * (1 - Math.pow(edgeT, 1.4)) * 0.024;
      const longitudinalCurve = Math.pow(y, 1.55) * 0.12;
      const edgeFlutter = Math.sin(y * Math.PI * 2.2 + crossT * 1.5) * edgeT * 0.008;
      const x = crossT * width;
      const z = ridge + longitudinalCurve + edgeFlutter;
      positions.push(x, y, z);
      const tone = 0.79 + (1 - edgeT) * 0.14 + y * 0.045;
      colors.push(tone, tone, tone);
      uvs.push((crossT + 1) * 0.5, y);
    }
  }

  const columnCount = columns.length;
  for (let row = 0; row < rowCount - 1; row += 1) {
    for (let column = 0; column < columnCount - 1; column += 1) {
      const a = row * columnCount + column;
      const b = a + 1;
      const d = (row + 1) * columnCount + column;
      const c = d + 1;
      indices.push(a, d, c, a, c, b);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("aPhyllodeUv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.name = "Narrow_Lanceolate_Golden_Wattle_Phyllode";
  return geometry;
}

function createFivePartFloretGeometry() {
  const openPositions = [];
  const colors = [];
  const indices = [];
  const appendVertex = (x, y, z, tone) => {
    openPositions.push(x, y, z);
    colors.push(tone, tone, tone);
    return openPositions.length / 3 - 1;
  };

  const center = appendVertex(0, 0.035, 0, 0.96);
  const roots = [];
  for (let part = 0; part < FLORET_PARTS; part += 1) {
    const angle = part / FLORET_PARTS * FULL_TURN;
    roots.push(appendVertex(Math.cos(angle) * 0.11, 0.015, Math.sin(angle) * 0.11, 0.98));
  }

  for (let part = 0; part < FLORET_PARTS; part += 1) {
    const next = (part + 1) % FLORET_PARTS;
    indices.push(center, roots[part], roots[next]);
  }

  for (let part = 0; part < FLORET_PARTS; part += 1) {
    const angle = part / FLORET_PARTS * FULL_TURN;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const tangentX = -sin;
    const tangentZ = cos;
    const root = roots[part];
    const shoulderLeft = appendVertex(
      cos * 0.37 + tangentX * 0.15,
      0.045,
      sin * 0.37 + tangentZ * 0.15,
      0.99,
    );
    const tipLeft = appendVertex(
      cos * 0.61 + tangentX * 0.082,
      0.085,
      sin * 0.61 + tangentZ * 0.082,
      1.08,
    );
    const tipRight = appendVertex(
      cos * 0.61 - tangentX * 0.082,
      0.085,
      sin * 0.61 - tangentZ * 0.082,
      1.08,
    );
    const shoulderRight = appendVertex(
      cos * 0.37 - tangentX * 0.15,
      0.045,
      sin * 0.37 - tangentZ * 0.15,
      0.99,
    );
    const petalCrown = appendVertex(cos * 0.43, 0.17, sin * 0.43, 1.04);
    indices.push(
      root, shoulderLeft, petalCrown,
      shoulderLeft, tipLeft, petalCrown,
      tipLeft, tipRight, petalCrown,
      tipRight, shoulderRight, petalCrown,
      shoulderRight, root, petalCrown,
    );

  }

  const closedPositions = openPositions.slice();
  const cuppedPositions = openPositions.slice();
  for (let offset = 0; offset < openPositions.length; offset += 3) {
    const x = openPositions[offset];
    const y = openPositions[offset + 1];
    const z = openPositions[offset + 2];
    const radial = Math.hypot(x, z);
    if (radial <= 0.12 && y <= 0.04) continue;

    const directionX = radial > 0.0001 ? x / radial : 0;
    const directionZ = radial > 0.0001 ? z / radial : 0;
    const extent = THREE.MathUtils.clamp((radial - 0.11) / 0.5, 0, 1);
    const closedRadius = THREE.MathUtils.lerp(0.12, 0.15, extent);
    const cupRadius = THREE.MathUtils.lerp(0.2, 0.38, extent);

    closedPositions[offset] = directionX * closedRadius;
    closedPositions[offset + 1] = THREE.MathUtils.lerp(0.24, 0.58, extent) + y * 0.08;
    closedPositions[offset + 2] = directionZ * closedRadius;
    cuppedPositions[offset] = directionX * cupRadius;
    cuppedPositions[offset + 1] = THREE.MathUtils.lerp(0.2, 0.4, extent) + y * 0.22;
    cuppedPositions[offset + 2] = directionZ * cupRadius;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(closedPositions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.morphAttributes.position = [
    new THREE.Float32BufferAttribute(cuppedPositions, 3),
    new THREE.Float32BufferAttribute(openPositions, 3),
  ];
  geometry.morphAttributes.normal = [
    createPoseNormalAttribute(cuppedPositions, indices),
    createPoseNormalAttribute(openPositions, indices),
  ];
  geometry.morphTargetsRelative = false;
  geometry.computeBoundingSphere();
  geometry.name = "Closed_Cupped_Open_Five_Part_Floret";
  return geometry;
}

function createPoseNormalAttribute(positions, indices) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const normals = geometry.getAttribute("normal").clone();
  geometry.dispose();
  return normals;
}

function createBudCapsuleGeometry() {
  const sphere = new THREE.SphereGeometry(1, 10, 4);
  const geometry = sphere.toNonIndexed();
  sphere.dispose();
  const positions = geometry.getAttribute("position");
  const colors = new Float32Array(positions.count * 3);

  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const z = positions.getZ(index);
    const radial = Math.hypot(x, z);
    const angle = Math.atan2(z, x);
    const lobe = 1 + Math.cos(angle * FLORET_PARTS) * 0.055 * Math.pow(radial, 1.3);
    const rootTaper = y < -0.15 ? THREE.MathUtils.lerp(0.7, 1, (y + 1) / 0.85) : 1;
    positions.setXYZ(
      index,
      x * lobe * rootTaper,
      y * 0.94,
      z * lobe * rootTaper,
    );
    const seam = 0.86 + (0.5 + 0.5 * Math.cos(angle * FLORET_PARTS)) * 0.16;
    colors[index * 3] = seam;
    colors[index * 3 + 1] = seam;
    colors[index * 3 + 2] = seam;
  }

  positions.needsUpdate = true;
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.name = "Five_Lobed_Closed_Floret_Capsule";
  return geometry;
}

function createCorollaCupGeometry() {
  const sphere = new THREE.SphereGeometry(1, 10, 3);
  const geometry = sphere.toNonIndexed();
  sphere.dispose();
  const positions = geometry.getAttribute("position");
  const colors = new Float32Array(positions.count * 3);

  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const z = positions.getZ(index);
    const radial = Math.hypot(x, z);
    const angle = Math.atan2(z, x);
    const lobe = 1 + Math.cos(angle * FLORET_PARTS) * 0.035 * radial;
    positions.setXYZ(index, x * lobe, y * 0.82, z * lobe);
    const tone = 0.94 + Math.max(0, y) * 0.08;
    colors[index * 3] = tone;
    colors[index * 3 + 1] = tone;
    colors[index * 3 + 2] = tone;
  }

  positions.needsUpdate = true;
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.name = "Low_Poly_Golden_Corolla_Cup";
  return geometry;
}

function createBloomSupportGeometry() {
  const geometry = new THREE.SphereGeometry(1, 24, 16);
  const positions = geometry.getAttribute("position");

  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const z = positions.getZ(index);
    const angle = Math.atan2(z, x);
    const radial = Math.hypot(x, z);
    const scallop = 1
      + 0.028 * Math.sin(angle * 7 + 0.62) * Math.pow(radial, 1.4)
      + 0.014 * Math.sin((y + angle) * 13.0);
    const rearTaper = y < 0 ? THREE.MathUtils.lerp(0.92, 1, y + 1) : 1;
    positions.setXYZ(
      index,
      x * scallop * rearTaper,
      y < 0 ? y * 1.015 : y * 0.985,
      z * scallop * rearTaper,
    );
  }

  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(
      new Float32Array(positions.count * 3).fill(1),
      3,
    ),
  );
  geometry.computeBoundingSphere();
  geometry.name = "Smooth_Perforated_Pompom_Undercoat";
  return geometry;
}

function enableLocalGrowth(material, growthUniform, cacheKey) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGrowthScale = growthUniform;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float uGrowthScale;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        transformed *= uGrowthScale;`,
      );
  };
  material.customProgramCacheKey = () => `watl-local-growth-${cacheKey}-v1`;
}

function enableTimedStemGrowth(material, growthUniform) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTreeProgress = growthUniform;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        attribute float instanceBirth;
        attribute float instanceMature;
        uniform float uTreeProgress;
        varying float vStemGrowth;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vStemGrowth = smoothstep(instanceBirth, instanceMature, uTreeProgress);
        if (instanceBirth <= 0.001) vStemGrowth = max(0.18, vStemGrowth);
        transformed.y = -0.5 + (transformed.y + 0.5) * vStemGrowth;
        transformed.xz *= mix(0.62, 1.0, vStemGrowth);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying float vStemGrowth;`,
      )
      .replace(
        "#include <alphatest_fragment>",
        `if (vStemGrowth <= 0.001) discard;
        #include <alphatest_fragment>`,
      );
  };
  material.customProgramCacheKey = () => "watl-timed-stem-growth-v1";
}

function enableTimedPhyllodeGrowth(material, growthUniform) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTreeProgress = growthUniform;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        attribute float instanceBirth;
        attribute float instanceMature;
        attribute vec2 aPhyllodeUv;
        uniform float uTreeProgress;
        varying float vLeafGrowth;
        varying vec2 vPhyllodeUv;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vLeafGrowth = smoothstep(instanceBirth, instanceMature, uTreeProgress);
        vPhyllodeUv = aPhyllodeUv;
        float longitudinalGrowth = smoothstep(0.0, 0.7, vLeafGrowth);
        float bladeUnfurl = smoothstep(0.18, 1.0, vLeafGrowth);
        transformed.y *= max(0.035, longitudinalGrowth);
        transformed.xz *= mix(0.035, 1.0, bladeUnfurl);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying float vLeafGrowth;
        varying vec2 vPhyllodeUv;`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
        float mainNerve = exp(-pow((vPhyllodeUv.x - 0.5) * 27.0, 2.0));
        float sideNerveA = exp(-pow((vPhyllodeUv.x - 0.36) * 42.0, 2.0));
        float sideNerveB = exp(-pow((vPhyllodeUv.x - 0.64) * 42.0, 2.0));
        float grazing = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.0);
        diffuseColor.rgb *= 0.965 + mainNerve * 0.095 + (sideNerveA + sideNerveB) * 0.035;
        vec3 sunlitEdge = diffuseColor.rgb * vec3(0.96, 1.08, 0.9) + vec3(0.012, 0.024, 0.008);
        diffuseColor.rgb = mix(diffuseColor.rgb, sunlitEdge, grazing * 0.2);`,
      )
      .replace(
        "#include <alphatest_fragment>",
        `if (vLeafGrowth <= 0.001) discard;
        #include <alphatest_fragment>`,
      );
  };
  material.customProgramCacheKey = () => "watl-lanceolate-phyllode-growth-v3";
}

function enableInstancedVisibility(material, cacheKey, growthUniform = null) {
  material.onBeforeCompile = (shader) => {
    if (growthUniform) shader.uniforms.uGrowthScale = growthUniform;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        attribute float instanceVisibility;
        ${growthUniform ? "uniform float uGrowthScale;" : ""}
        varying float vInstanceVisibility;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        ${growthUniform ? "transformed *= uGrowthScale;" : ""}
        vInstanceVisibility = instanceVisibility;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying float vInstanceVisibility;`,
      )
      .replace(
        "#include <alphahash_fragment>",
        `diffuseColor.a *= clamp(vInstanceVisibility, 0.0, 1.0);
        #include <alphahash_fragment>`,
      );
  };
  material.customProgramCacheKey = () => `watl-instance-visibility-${cacheKey}-${growthUniform ? "growth" : "static"}-v2`;
}

function enableLineVisibility(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        attribute float instanceVisibility;
        varying float vLineVisibility;`,
      )
      .replace(
        "void main() {",
        `void main() {
        vLineVisibility = instanceVisibility;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying float vLineVisibility;`,
      )
      .replace(
        "float alpha = opacity;",
        `if (vLineVisibility <= 0.001) discard;
        float alpha = opacity * vLineVisibility;`,
      );
  };
  material.customProgramCacheKey = () => "watl-line-visibility-v1";
}

function createStemInstances(items, sourceGeometry, material) {
  const geometry = sourceGeometry.clone();
  geometry.setAttribute("instanceBirth", new THREE.InstancedBufferAttribute(
    Float32Array.from(items, (item) => item.birth ?? 0),
    1,
  ));
  geometry.setAttribute("instanceMature", new THREE.InstancedBufferAttribute(
    Float32Array.from(items, (item) => item.mature ?? 1),
    1,
  ));
  const mesh = new THREE.InstancedMesh(geometry, material, items.length);
  mesh.name = "Stem_Segments";
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  mesh.frustumCulled = false;
  const matrix = new THREE.Matrix4();

  items.forEach((item, index) => {
    composeSegmentMatrix(
      item.start.clone().sub(GATHER_POINT),
      item.end.clone().sub(GATHER_POINT),
      item.radius,
      matrix,
    );
    mesh.setMatrixAt(index, matrix);
    mesh.setColorAt(index, new THREE.Color(item.undercoatColor ?? item.color));
  });

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

function buildHeadRanges(items) {
  const ranges = Array(state.data.all.blooms.length).fill(null);
  items.forEach((item, index) => {
    const headIndex = item.headIndex ?? item.index;
    if (!Number.isInteger(headIndex) || headIndex < 0) return;
    if (!ranges[headIndex]) {
      ranges[headIndex] = { start: index, count: 1 };
    } else {
      ranges[headIndex].count = index - ranges[headIndex].start + 1;
    }
  });
  return ranges;
}

function createLeafInstances(items, sourceGeometry, material) {
  const geometry = sourceGeometry.clone();
  geometry.setAttribute("instanceBirth", new THREE.InstancedBufferAttribute(
    Float32Array.from(items, (item) => item.birth ?? 0.43),
    1,
  ));
  geometry.setAttribute("instanceMature", new THREE.InstancedBufferAttribute(
    Float32Array.from(items, (item) => item.mature ?? 0.84),
    1,
  ));
  const mesh = new THREE.InstancedMesh(geometry, material, items.length);
  mesh.name = "Narrow_Lanceolate_Phyllodes";
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  mesh.frustumCulled = false;
  const matrix = new THREE.Matrix4();

  items.forEach((item, index) => {
    composeLeafMatrix(item, matrix, GATHER_POINT);
    mesh.setMatrixAt(index, matrix);
    mesh.setColorAt(index, new THREE.Color(item.color));
  });

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

function createCapInstances(items, sourceGeometry, material) {
  const geometry = sourceGeometry.clone();
  const visibilityAttribute = new THREE.InstancedBufferAttribute(
    new Float32Array(items.length).fill(1),
    1,
  );
  visibilityAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("instanceVisibility", visibilityAttribute);
  const mesh = new THREE.InstancedMesh(geometry, material, items.length);
  mesh.name = "Closed_Floret_Capsules";
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  const closedMatrices = new Float32Array(items.length * 16);
  const ripeMatrices = new Float32Array(items.length * 16);
  const retiredMatrices = new Float32Array(items.length * 16);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();

  items.forEach((item, index) => {
    const head = state.data.all.blooms[item.headIndex];
    const closedPosition = item.position.clone().sub(GATHER_POINT);
    matrix.compose(
      closedPosition,
      item.quaternion,
      scale.set(item.scale, item.scale * 1.06, item.scale),
    );
    matrix.toArray(closedMatrices, index * 16);

    position.copy(item.position)
      .addScaledVector(item.normal, item.scale * 0.055)
      .sub(GATHER_POINT);
    matrix.compose(
      position,
      item.quaternion,
      scale.set(
        item.scale * BUD_CAP_RIPEN_SCALE,
        item.scale * BUD_CAP_RIPEN_SCALE * 1.12,
        item.scale * BUD_CAP_RIPEN_SCALE,
      ),
    );
    matrix.toArray(ripeMatrices, index * 16);

    position.copy(head.position)
      .lerp(item.position, 0.62)
      .sub(GATHER_POINT);
    matrix.compose(
      position,
      item.quaternion,
      scale.setScalar(item.scale * BUD_CAP_RETIRED_SCALE),
    );
    matrix.toArray(retiredMatrices, index * 16);
    mesh.setMatrixAt(index, matrix.fromArray(closedMatrices, index * 16));
    mesh.setColorAt(index, BUD_CAP_COLOR);
  });

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) {
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor.needsUpdate = true;
  }
  const closedColors = mesh.instanceColor?.array.slice() ?? null;
  const ripeColors = closedColors?.slice() ?? null;
  const retiredColors = closedColors?.slice() ?? null;
  if (ripeColors && retiredColors) {
    for (let index = 0; index < items.length; index += 1) {
      RIPE_CAP_COLOR.toArray(ripeColors, index * 3);
      RETIRED_CAP_COLOR.toArray(retiredColors, index * 3);
    }
  }
  const renderable = {
    mesh,
    items,
    ranges: buildHeadRanges(items),
    closedMatrices,
    ripeMatrices,
    retiredMatrices,
    closedColors,
    ripeColors,
    retiredColors,
    visibilityAttribute,
  };
  state.bloom.renderables.caps.push(renderable);
  items.forEach((item, index) => {
    state.bloom.capLookup.set(item.siteKey, {
      renderable,
      index,
    });
  });
  return mesh;
}

function createCupInstances(items, sourceGeometry, material) {
  const geometry = sourceGeometry.clone();
  const visibilityAttribute = new THREE.InstancedBufferAttribute(
    new Float32Array(items.length),
    1,
  );
  visibilityAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("instanceVisibility", visibilityAttribute);
  const mesh = new THREE.InstancedMesh(geometry, material, items.length);
  mesh.name = "Persistent_Golden_Corolla_Cups";
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  const closedMatrices = new Float32Array(items.length * 16);
  const cupMatrices = new Float32Array(items.length * 16);
  const openMatrices = new Float32Array(items.length * 16);
  const matrix = new THREE.Matrix4();
  const scale = new THREE.Vector3();

  items.forEach((item, index) => {
    matrix.compose(
      item.budPosition.clone().sub(GATHER_POINT),
      item.quaternion,
      scale.setScalar(item.scale * 0.02),
    );
    matrix.toArray(closedMatrices, index * 16);
    matrix.compose(
      item.cupPosition.clone().sub(GATHER_POINT),
      item.quaternion,
      scale.set(item.scale * 0.34, item.scale * 0.44, item.scale * 0.34),
    );
    matrix.toArray(cupMatrices, index * 16);
    matrix.compose(
      item.position.clone().sub(GATHER_POINT),
      item.quaternion,
      scale.set(item.scale * 0.29, item.scale * 0.36, item.scale * 0.29),
    );
    matrix.toArray(openMatrices, index * 16);
    mesh.setMatrixAt(index, matrix.fromArray(closedMatrices, index * 16));
    mesh.setColorAt(index, CUP_FLORET_COLOR);
  });

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) {
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor.needsUpdate = true;
  }
  const closedColors = mesh.instanceColor?.array.slice() ?? null;
  const cupColors = closedColors?.slice() ?? null;
  const openColors = closedColors?.slice() ?? null;
  items.forEach((item, index) => {
    if (!closedColors || !cupColors || !openColors) return;
    const offset = index * 3;
    BUD_FLORET_COLOR.toArray(closedColors, offset);
    CUP_FLORET_COLOR.toArray(cupColors, offset);
    new THREE.Color(item.color).toArray(openColors, offset);
  });
  const renderable = {
    mesh,
    items,
    ranges: buildHeadRanges(items),
    closedMatrices,
    cupMatrices,
    openMatrices,
    closedColors,
    cupColors,
    openColors,
    visibilityAttribute,
  };
  state.bloom.renderables.cups.push(renderable);
  return mesh;
}

function createFloretInstances(items, sourceGeometry, material) {
  const geometry = sourceGeometry.clone();
  const visibilityAttribute = new THREE.InstancedBufferAttribute(
    new Float32Array(items.length),
    1,
  );
  visibilityAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("instanceVisibility", visibilityAttribute);
  const mesh = new THREE.InstancedMesh(geometry, material, items.length);
  mesh.name = "Five_Part_Floret_Rosettes";
  /* A deterministic tree seed can leave the central crown without flower
     sites. Three.js expects an instanced morph texture only when at least one
     instance has called setMorphAt; keeping the empty morph mesh out of the
     render list avoids asking it to upload a texture that cannot exist. */
  mesh.visible = items.length > 0;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  const matrix = new THREE.Matrix4();
  const scale = new THREE.Vector3();
  const morphDriver = new THREE.Mesh(geometry, material);
  morphDriver.updateMorphTargets();
  const openMatrices = new Float32Array(items.length * 16);
  const cupMatrices = new Float32Array(items.length * 16);
  const budMatrices = new Float32Array(items.length * 16);

  items.forEach((item, index) => {
    matrix.compose(
      item.position.clone().sub(GATHER_POINT),
      item.quaternion,
      scale.set(item.scale, item.scale * item.heightScale, item.scale),
    );
    matrix.toArray(openMatrices, index * 16);
    matrix.compose(
      item.cupPosition.clone().sub(GATHER_POINT),
      item.quaternion,
      scale.set(
        item.scale * CUP_FLORET_TANGENTIAL_SCALE,
        item.scale * item.heightScale * CUP_FLORET_AXIAL_SCALE,
        item.scale * CUP_FLORET_TANGENTIAL_SCALE,
      ),
    );
    matrix.toArray(cupMatrices, index * 16);
    matrix.compose(
      item.budPosition.clone().sub(GATHER_POINT),
      item.quaternion,
      scale.set(
        item.scale * BUD_FLORET_TANGENTIAL_SCALE,
        item.scale * item.heightScale * BUD_FLORET_AXIAL_SCALE,
        item.scale * BUD_FLORET_TANGENTIAL_SCALE,
      ),
    );
    matrix.toArray(budMatrices, index * 16);
    mesh.setMatrixAt(index, matrix);
    mesh.setColorAt(index, BUD_FLORET_COLOR);
    morphDriver.morphTargetInfluences[0] = 0;
    morphDriver.morphTargetInfluences[1] = 0;
    mesh.setMorphAt(index, morphDriver);
  });

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.morphTexture) mesh.morphTexture.needsUpdate = true;
  if (mesh.instanceColor) {
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor.needsUpdate = true;
  }
  const budColors = mesh.instanceColor?.array.slice() ?? null;
  const cupColors = budColors?.slice() ?? null;
  const openColors = budColors?.slice() ?? null;
  items.forEach((item, index) => {
    if (budColors && cupColors && openColors) {
      const colorOffset = index * 3;
      const shade = 0.9 + (item.bloomNoise ?? 0.5) * 0.1;
      budColors[colorOffset] = BUD_FLORET_COLOR.r * shade;
      budColors[colorOffset + 1] = BUD_FLORET_COLOR.g * shade;
      budColors[colorOffset + 2] = BUD_FLORET_COLOR.b * shade;
      cupColors[colorOffset] = CUP_FLORET_COLOR.r * shade;
      cupColors[colorOffset + 1] = CUP_FLORET_COLOR.g * shade;
      cupColors[colorOffset + 2] = CUP_FLORET_COLOR.b * shade;
      new THREE.Color(item.color).toArray(openColors, colorOffset);
    }
  });
  const renderable = {
    mesh,
    items,
    ranges: buildHeadRanges(items),
    openMatrices,
    cupMatrices,
    budMatrices,
    openColors,
    cupColors,
    budColors,
    visibilityAttribute,
    morphDriver,
  };
  state.bloom.renderables.florets.push(renderable);
  items.forEach((item, index) => {
    state.bloom.floretLookup.set(item.siteKey, {
      renderable,
      index,
    });
  });
  return mesh;
}

function createCoreInstances(items, geometry, material) {
  const mesh = new THREE.InstancedMesh(geometry, material, items.length);
  mesh.name = "Invisible_Bloom_Interaction_Proxies";
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  mesh.frustumCulled = false;
  const matrix = new THREE.Matrix4();

  items.forEach((item, index) => {
    composeBloomCoreMatrix(item, matrix, GATHER_POINT);
    mesh.setMatrixAt(index, matrix);
  });

  mesh.instanceMatrix.needsUpdate = true;
  mesh.userData.hitRadii = items.map((item) => item.radius * 1.18);
  mesh.userData.bloomIndices = items.map((item) => item.index);
  mesh.userData.hitShapes = items.map((item) => ({
    radial: item.radius * 1.16,
    axial: item.radius * 1.16,
    centerOffset: -(item.coreOffset ?? 0),
  }));
  return mesh;
}

function createPompomMassPoints(items, material) {
  const positions = [];
  const colors = [];
  const sizes = [];
  const seeds = [];
  for (const item of items) {
    const position = item.position.clone().sub(GATHER_POINT);
    positions.push(position.x, position.y, position.z);
    appendColor(colors, new THREE.Color(item.undercoatColor ?? item.color));
    sizes.push(item.radius * 1.42);
    seeds.push(((item.index + 1) * 0.61803398875) % 1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("aSize", new THREE.Float32BufferAttribute(sizes, 1));
  geometry.setAttribute("aSeed", new THREE.Float32BufferAttribute(seeds, 1));
  const visibilityAttribute = new THREE.Float32BufferAttribute(new Float32Array(items.length), 1);
  visibilityAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("aVisibility", visibilityAttribute);
  geometry.computeBoundingSphere();
  geometry.name = "Soft_Globular_Pompom_Mass_Points";
  const points = new THREE.Points(geometry, material);
  points.name = "Open_Only_Soft_Pompom_Masses";
  points.frustumCulled = false;
  points.renderOrder = -1;
  state.bloom.renderables.masses.push({
    points,
    items,
    ranges: buildHeadRanges(items),
    visibilityAttribute,
  });
  return points;
}

function createPompomMassMaterial() {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: 1 },
      uPointScale: { value: 920 },
      uEmissiveGain: { value: 1 },
    },
    vertexShader: `
      attribute float aSize;
      attribute float aVisibility;
      attribute float aSeed;
      attribute vec3 color;
      varying vec3 vColor;
      varying float vVisibility;
      varying float vSeed;
      uniform float uPixelRatio;
      uniform float uPointScale;

      void main() {
        vColor = color;
        vVisibility = aVisibility;
        vSeed = aSeed;
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        float attenuation = uPointScale / max(0.4, -viewPosition.z);
        gl_PointSize = max(1.0, aSize * attenuation * uPixelRatio);
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform float uEmissiveGain;
      varying vec3 vColor;
      varying float vVisibility;
      varying float vSeed;

      float hash21(vec2 point) {
        point = fract(point * vec2(123.34, 456.21));
        point += dot(point, point + 45.32 + vSeed * 11.0);
        return fract(point.x * point.y);
      }

      float valueNoise(vec2 point) {
        vec2 cell = floor(point);
        vec2 local = fract(point);
        local = local * local * (3.0 - 2.0 * local);
        float a = hash21(cell);
        float b = hash21(cell + vec2(1.0, 0.0));
        float c = hash21(cell + vec2(0.0, 1.0));
        float d = hash21(cell + vec2(1.0, 1.0));
        return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
      }

      void main() {
        if (vVisibility <= 0.001) discard;
        vec2 point = gl_PointCoord * 2.0 - 1.0;
        float angle = atan(point.y, point.x);
        float fibrousEdge = 1.0
          + 0.052 * sin(angle * 19.0 + vSeed * 29.0)
          + 0.028 * sin(angle * 37.0 - vSeed * 41.0);
        float radius = length(point) / fibrousEdge;
        if (radius > 1.0) discard;
        float sphereDepth = sqrt(max(0.0, 1.0 - radius * radius));
        vec3 normal = normalize(vec3(point.x, -point.y, sphereDepth));
        vec3 lightDirection = normalize(vec3(-0.4, 0.5, 1.0));
        float diffuse = max(0.0, dot(normal, lightDirection));
        float coarseFiber = valueNoise(point * 23.0 + vSeed * 7.0);
        float fineFiber = valueNoise(point * 57.0 - vSeed * 13.0);
        float radialFiber = 0.82 + 0.18 * sin(
          angle * 73.0 + radius * 91.0 + fineFiber * 6.0 + vSeed * 17.0
        );
        float micro = (0.66 + coarseFiber * 0.34 + fineFiber * 0.12) * radialFiber;
        float alpha = 1.0 - smoothstep(0.76, 1.0, radius);
        alpha *= 0.86 + fineFiber * 0.14;
        /* Preserve the reference's saturated lemon yellow. Fine structural
           variation should read as crossing filaments, not as grey/brown
           blotches that desaturate the whole head. */
        float fiberLight = 0.84 + micro * 0.22;
        vec3 color = vColor * (0.86 + sphereDepth * 0.18 + diffuse * 0.1) * fiberLight;
        color *= vec3(1.06, 1.04, 0.72);
        color *= uEmissiveGain;
        gl_FragColor = vec4(color, alpha * vVisibility * 0.98);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthTest: true,
    depthWrite: false,
  });
  material.name = "Soft_Globular_Pompom_Mass_Material";
  return material;
}

function createFilamentLines(items, material) {
  const positions = [];
  const colors = [];

  for (const item of items) {
    const start = item.start.clone().sub(GATHER_POINT);
    const bend = item.bend.clone().sub(GATHER_POINT);
    const end = item.end.clone().sub(GATHER_POINT);
    positions.push(
      start.x, start.y, start.z,
      bend.x, bend.y, bend.z,
      bend.x, bend.y, bend.z,
      end.x, end.y, end.z,
    );
    appendColor(colors, item.startColor);
    appendColor(colors, item.midColor);
    appendColor(colors, item.midColor);
    appendColor(colors, item.endColor);
  }

  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(positions);
  geometry.setColors(colors);
  const visibilityAttribute = new THREE.InstancedBufferAttribute(
    new Float32Array(items.length * 2),
    1,
  );
  visibilityAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("instanceVisibility", visibilityAttribute);
  geometry.computeBoundingSphere();
  geometry.name = "Curved_Stamen_Lines";
  const positionBuffer = geometry.attributes.instanceStart.data;
  const colorBuffer = geometry.attributes.instanceColorStart.data;
  positionBuffer.setUsage(THREE.DynamicDrawUsage);
  colorBuffer.setUsage(THREE.DynamicDrawUsage);
  const lines = new LineSegments2(geometry, material);
  lines.name = "Curved_Stamens";
  lines.frustumCulled = false;
  const openPositions = positionBuffer.array.slice();
  const budPositions = openPositions.slice();
  const openColors = colorBuffer.array.slice();
  const budColors = openColors.slice();
  items.forEach((item, index) => {
    const itemOffset = index * 12;
    const startX = openPositions[itemOffset];
    const startY = openPositions[itemOffset + 1];
    const startZ = openPositions[itemOffset + 2];
    const endX = startX + (openPositions[itemOffset + 9] - startX) * 0.002;
    const endY = startY + (openPositions[itemOffset + 10] - startY) * 0.002;
    const endZ = startZ + (openPositions[itemOffset + 11] - startZ) * 0.002;
    const bendX = THREE.MathUtils.lerp(startX, endX, 0.46);
    const bendY = THREE.MathUtils.lerp(startY, endY, 0.46);
    const bendZ = THREE.MathUtils.lerp(startZ, endZ, 0.46);

    budPositions.set([
      startX, startY, startZ,
      bendX, bendY, bendZ,
      bendX, bendY, bendZ,
      endX, endY, endZ,
    ], itemOffset);

    const shade = 0.86 + (item.bloomNoise ?? item.bloomOrder ?? 0.5) * 0.14;
    for (let vertexOffset = 0; vertexOffset < 12; vertexOffset += 3) {
      budColors[itemOffset + vertexOffset] = BUD_FILAMENT_COLOR.r * shade;
      budColors[itemOffset + vertexOffset + 1] = BUD_FILAMENT_COLOR.g * shade;
      budColors[itemOffset + vertexOffset + 2] = BUD_FILAMENT_COLOR.b * shade;
    }
  });
  const renderable = {
    lines,
    items,
    ranges: buildHeadRanges(items),
    positionBuffer,
    colorBuffer,
    openPositions,
    budPositions,
    openColors,
    budColors,
    visibilityAttribute,
  };
  state.bloom.renderables.filaments.push(renderable);
  items.forEach((item, index) => {
    state.bloom.filamentLookup[item.id] = { renderable, index };
  });
  return lines;
}

function createTipPoints(items, material) {
  const positions = [];
  const colors = [];
  const sizes = [];
  const seeds = [];

  for (const item of items) {
    const position = item.position.clone().sub(GATHER_POINT);
    positions.push(position.x, position.y, position.z);
    appendColor(colors, item.color);
    sizes.push(item.size);
    seeds.push(item.bloomNoise ?? item.bloomOrder ?? ((item.headIndex ?? 0) * 0.61803398875) % 1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("aSize", new THREE.Float32BufferAttribute(sizes, 1));
  geometry.setAttribute("aSeed", new THREE.Float32BufferAttribute(seeds, 1));
  geometry.setAttribute(
    "aVisibility",
    new THREE.Float32BufferAttribute(
      items.map((item) => Number(item.role === "bud-pore")),
      1,
    ),
  );
  geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
  geometry.attributes.color.setUsage(THREE.DynamicDrawUsage);
  geometry.attributes.aSize.setUsage(THREE.DynamicDrawUsage);
  geometry.attributes.aVisibility.setUsage(THREE.DynamicDrawUsage);
  geometry.computeBoundingSphere();
  geometry.name = "Pollen_Tip_Points";
  const points = new THREE.Points(geometry, material);
  points.name = "Pollen_Tips";
  points.frustumCulled = false;
  const openPositions = geometry.attributes.position.array.slice();
  const budPositions = openPositions.slice();
  const openColors = geometry.attributes.color.array.slice();
  const budColors = openColors.slice();
  const openSizes = geometry.attributes.aSize.array.slice();
  const budSizes = openSizes.slice();
  items.forEach((item, index) => {
    const offset = index * 3;
    const origin = (item.origin ?? item.position).clone().sub(GATHER_POINT);
    budPositions[offset] = origin.x;
    budPositions[offset + 1] = origin.y;
    budPositions[offset + 2] = origin.z;
    budSizes[index] = openSizes[index] * BUD_TIP_SCALE;
    if (item.role !== "bud-pore") {
      const shade = 0.88 + (item.bloomNoise ?? item.bloomOrder ?? 0.5) * 0.12;
      budColors[offset] = openColors[offset] * shade;
      budColors[offset + 1] = openColors[offset + 1] * shade;
      budColors[offset + 2] = openColors[offset + 2] * shade;
    }
  });
  state.bloom.renderables.tips.push({
    points,
    items,
    ranges: buildHeadRanges(items),
    openPositions,
    budPositions,
    openColors,
    budColors,
    openSizes,
    budSizes,
    visibilityAttribute: geometry.attributes.aVisibility,
  });
  return points;
}

function createPompomFuzzPoints(items, material) {
  const count = items.length;
  const positions = new Float32Array(count * 3);
  const origins = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const seeds = new Float32Array(count);
  const shades = new Float32Array(count);
  const siteDelays = new Float32Array(count);
  const progressAttribute = new THREE.Float32BufferAttribute(new Float32Array(count), 1);
  const color = new THREE.Color();

  for (let index = 0; index < count; index += 1) {
    const item = items[index];
    const offset = index * 3;
    const position = item.position.clone().sub(GATHER_POINT);
    const origin = (item.origin ?? item.position).clone().sub(GATHER_POINT);
    const seed = item.bloomNoise
      ?? item.bloomOrder
      ?? ((item.headIndex ?? 0) * 0.61803398875) % 1;
    color.set(item.color);

    positions[offset] = position.x;
    positions[offset + 1] = position.y;
    positions[offset + 2] = position.z;
    origins[offset] = origin.x;
    origins[offset + 1] = origin.y;
    origins[offset + 2] = origin.z;
    colors[offset] = color.r;
    colors[offset + 1] = color.g;
    colors[offset + 2] = color.b;
    sizes[index] = item.size;
    seeds[index] = seed;
    shades[index] = 0.88 + seed * 0.12;
    siteDelays[index] = THREE.MathUtils.clamp(seed, 0, 1);

    /* Fuzz has no directional site normal, so its delay is its deterministic
       noise value. Pack it directly and release the two Vector3 instances now
       duplicated in GPU buffers. */
    item.position = null;
    item.origin = null;
  }

  progressAttribute.setUsage(THREE.DynamicDrawUsage);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aOrigin", new THREE.Float32BufferAttribute(origins, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("aSize", new THREE.Float32BufferAttribute(sizes, 1));
  geometry.setAttribute("aSeed", new THREE.Float32BufferAttribute(seeds, 1));
  geometry.setAttribute("aShade", new THREE.Float32BufferAttribute(shades, 1));
  geometry.setAttribute("aProgress", progressAttribute);
  geometry.computeBoundingSphere();
  geometry.name = "GPU_Morphed_Pompom_Fuzz_Points";

  const points = new THREE.Points(geometry, material);
  points.name = "GPU_Morphed_Pompom_Fuzz";
  points.frustumCulled = false;
  const ranges = buildHeadRanges(items);
  state.bloom.renderables.fuzz.push({
    points,
    count,
    ranges,
    siteDelays,
    progressAttribute,
    /* Progress is also the exact visibility handoff for this layer. Keeping
       the alias preserves QA sampling without allocating a second GPU buffer. */
    visibilityAttribute: progressAttribute,
  });
  return points;
}

function createPompomFuzzMaterial() {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: 1 },
      uPointScale: { value: 920 },
      uEmissiveGain: { value: 1 },
      uGrowthScale: { value: 1 },
    },
    vertexShader: `
      attribute vec3 aOrigin;
      attribute float aSize;
      attribute float aSeed;
      attribute float aShade;
      attribute float aProgress;
      attribute vec3 color;
      varying vec3 vColor;
      varying float vVisibility;
      varying float vSeed;
      uniform float uPixelRatio;
      uniform float uPointScale;
      uniform float uGrowthScale;

      void main() {
        float progress = clamp(aProgress, 0.0, 1.0);
        vColor = color * mix(aShade, 1.0, progress);
        vVisibility = progress;
        vSeed = aSeed;
        vec3 morphedPosition = mix(aOrigin, position, progress);
        vec4 viewPosition = modelViewMatrix * vec4(morphedPosition, 1.0);
        float attenuation = uPointScale / max(0.4, -viewPosition.z);
        float pointScale = mix(${BUD_TIP_SCALE.toFixed(2)}, 1.0, progress);
        gl_PointSize = max(1.0, aSize * pointScale * attenuation * uPixelRatio * uGrowthScale);
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform float uEmissiveGain;
      varying vec3 vColor;
      varying float vVisibility;
      varying float vSeed;
      uniform float uGrowthScale;

      void main() {
        if (vVisibility <= 0.001) discard;
        vec2 point = gl_PointCoord * 2.0 - 1.0;
        float angle = atan(point.y, point.x);
        float edgeVariation = 1.0
          + sin(angle * 7.0 + vSeed * 31.0) * 0.026
          + sin(angle * 13.0 - vSeed * 19.0) * 0.014;
        float radius = length(point) / edgeVariation;
        if (radius > 1.0) discard;
        float edgeWidth = max(fwidth(radius) * 1.5, 0.018);
        float alpha = 1.0 - smoothstep(1.0 - edgeWidth, 1.0, radius);
        float sphereDepth = sqrt(max(0.0, 1.0 - radius * radius));
        vec3 normal = normalize(vec3(point.x, -point.y, sphereDepth));
        vec3 lightDirection = normalize(vec3(-0.42, 0.52, 1.0));
        float diffuse = max(0.0, dot(normal, lightDirection));
        float highlight = pow(diffuse, 9.0);
        float fibril = 0.975 + 0.025 * sin(angle * 17.0 + vSeed * 43.0)
          * smoothstep(0.32, 0.92, radius);
        vec3 color = vColor * (0.88 + diffuse * 0.2 + highlight * 0.035) * fibril;
        float growthVisibility = smoothstep(0.18, 0.45, uGrowthScale);
        color *= uEmissiveGain;
        gl_FragColor = vec4(color, alpha * vVisibility * growthVisibility);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthTest: true,
    depthWrite: true,
  });
  material.name = "GPU_Morphed_Pompom_Fuzz_Material";
  return material;
}

function createPointsMaterial() {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: 1 },
      uPointScale: { value: 920 },
      uEmissiveGain: { value: 1 },
      uGrowthScale: { value: 1 },
    },
    vertexShader: `
      attribute float aSize;
      attribute float aVisibility;
      attribute float aSeed;
      attribute vec3 color;
      varying vec3 vColor;
      varying float vVisibility;
      varying float vSeed;
      uniform float uPixelRatio;
      uniform float uPointScale;
      uniform float uGrowthScale;

      void main() {
        vColor = color;
        vVisibility = aVisibility;
        vSeed = aSeed;
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        float attenuation = uPointScale / max(0.4, -viewPosition.z);
        gl_PointSize = max(1.0, aSize * attenuation * uPixelRatio * uGrowthScale);
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform float uEmissiveGain;
      varying vec3 vColor;
      varying float vVisibility;
      varying float vSeed;
      uniform float uGrowthScale;

      void main() {
        if (vVisibility <= 0.001) discard;
        vec2 point = gl_PointCoord * 2.0 - 1.0;
        float angle = atan(point.y, point.x);
        float edgeVariation = 1.0
          + sin(angle * 7.0 + vSeed * 31.0) * 0.026
          + sin(angle * 13.0 - vSeed * 19.0) * 0.014;
        float radius = length(point) / edgeVariation;
        if (radius > 1.0) discard;
        float edgeWidth = max(fwidth(radius) * 1.5, 0.018);
        float alpha = 1.0 - smoothstep(1.0 - edgeWidth, 1.0, radius);
        float sphereDepth = sqrt(max(0.0, 1.0 - radius * radius));
        vec3 normal = normalize(vec3(point.x, -point.y, sphereDepth));
        vec3 lightDirection = normalize(vec3(-0.42, 0.52, 1.0));
        float diffuse = max(0.0, dot(normal, lightDirection));
        float highlight = pow(diffuse, 9.0);
        float fibril = 0.975 + 0.025 * sin(angle * 17.0 + vSeed * 43.0)
          * smoothstep(0.32, 0.92, radius);
        /* Hundreds of overlapping, softly irregular anther discs form one
           compact pom-pom. The low-contrast fibril modulation keeps close-up
           texture without turning the head into a radial sea urchin. */
        vec3 color = vColor * (0.88 + diffuse * 0.2 + highlight * 0.035) * fibril;
        float growthVisibility = smoothstep(0.18, 0.45, uGrowthScale);
        color *= uEmissiveGain;
        gl_FragColor = vec4(color, alpha * vVisibility * growthVisibility);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthTest: true,
    depthWrite: true,
  });
  material.name = "Soft_Pompom_Anther_Material";
  return material;
}

function bloomSiteDelay(head, item) {
  if (item.fixedSiteDelay) return item.siteDelay;
  if (item.siteDelayRevision === head.delayRevision) return item.siteDelay;
  let normal = item.normal;
  if (!normal && Number.isInteger(item.siteIndex)) {
    const lookup = state.bloom.floretLookup.get(item.siteKey);
    normal = lookup?.renderable.items[lookup.index].normal;
  }
  const noise = THREE.MathUtils.clamp(item.bloomNoise ?? item.bloomOrder ?? 0.5, 0, 1);
  const delay = !normal || !head.originNormal
    ? noise
    : THREE.MathUtils.clamp(
      Math.acos(THREE.MathUtils.clamp(normal.dot(head.originNormal), -1, 1)) / Math.PI * 0.65
        + noise * 0.35,
      0,
      1,
    );
  item.siteDelay = delay;
  item.siteDelayRevision = head.delayRevision;
  return delay;
}

function bloomStagesFor(head, item, spatialAllowed) {
  /* Without spatial motion a head is either closed or open: an interactive
     commit, or a wave that has passed it, both count as open. */
  const timeline = spatialAllowed
    ? head.timeline
    : Number(head.committedOpen || head.scroll >= 1);
  return siteBloomProgress(
    timeline,
    bloomSiteDelay(head, item),
    bloomMorphScratch.stages,
  );
}

function mixThreePoseArrays(target, offset, closed, middle, open, middleProgress, openProgress) {
  for (let component = 0; component < 16; component += 1) {
    const index = offset + component;
    const middleValue = THREE.MathUtils.lerp(closed[index], middle[index], middleProgress);
    target[index] = THREE.MathUtils.lerp(middleValue, open[index], openProgress);
  }
}

function mixThreePoseColors(target, offset, closed, middle, open, middleProgress, openProgress) {
  for (let component = 0; component < 3; component += 1) {
    const index = offset + component;
    const middleValue = THREE.MathUtils.lerp(closed[index], middle[index], middleProgress);
    target[index] = THREE.MathUtils.lerp(middleValue, open[index], openProgress);
  }
}

function bloomRenderableVisible(headIndex) {
  return state.qaIsolatedBloomIndex < 0 || state.qaIsolatedBloomIndex === headIndex;
}

function applyBloomEffects(dirtyHeads) {
  if (!state.bloom || dirtyHeads.length === 0) return;
  const spatialAllowed = !reduceBloomMotion();
  const uploadStats = state.bloom.uploadStats;
  uploadStats.dirtyHeadCount = dirtyHeads.length;
  uploadStats.rangeCount = 0;
  uploadStats.bytes = 0;
  const pendingRanges = new Map();
  const queueRange = (attribute, start, count) => {
    if (!attribute || count <= 0) return;
    const end = start + count;
    const pending = pendingRanges.get(attribute);
    if (pending) {
      pending.start = Math.min(pending.start, start);
      pending.end = Math.max(pending.end, end);
    } else {
      pendingRanges.set(attribute, { start, end });
    }
  };

  for (const renderable of state.bloom.renderables.masses) {
    const visibility = renderable.visibilityAttribute.array;
    renderable.visibilityAttribute.clearUpdateRanges();
    let changed = false;
    for (const headIndex of dirtyHeads) {
      const range = renderable.ranges[headIndex];
      if (!range) continue;
      const head = state.bloom.heads[headIndex];
      const qaVisible = bloomRenderableVisible(headIndex);
      for (let index = range.start; index < range.start + range.count; index += 1) {
        const stages = bloomStagesFor(head, renderable.items[index], spatialAllowed);
        const openMass = THREE.MathUtils.smoothstep(
          Math.max(stages.petal * 0.72, stages.innerFilament),
          0.22,
          0.92,
        );
        visibility[index] = qaVisible ? openMass * 0.92 : 0;
      }
      queueRange(renderable.visibilityAttribute, range.start, range.count);
      changed = true;
    }
    if (changed) {
      renderable.visibilityAttribute.needsUpdate = true;
    }
  }

  for (const renderable of state.bloom.renderables.caps) {
    const matrixAttribute = renderable.mesh.instanceMatrix;
    const colorAttribute = renderable.mesh.instanceColor;
    const matrices = matrixAttribute.array;
    const colors = colorAttribute?.array;
    const visibility = renderable.visibilityAttribute.array;
    matrixAttribute.clearUpdateRanges();
    colorAttribute?.clearUpdateRanges();
    renderable.visibilityAttribute.clearUpdateRanges();
    let changed = false;

    for (const headIndex of dirtyHeads) {
      const range = renderable.ranges[headIndex];
      if (!range) continue;
      const head = state.bloom.heads[headIndex];
      const qaVisible = bloomRenderableVisible(headIndex);
      for (let index = range.start; index < range.start + range.count; index += 1) {
        const stages = bloomStagesFor(head, renderable.items[index], spatialAllowed);
        const handoff = bloomVisibilityHandoff(stages, bloomMorphScratch.visibility);
        const ripen = Math.max(stages.wake * 0.35, stages.ripen);
        const retire = 1 - handoff.capsule;
        const matrixOffset = index * 16;
        mixThreePoseArrays(
          matrices,
          matrixOffset,
          renderable.closedMatrices,
          renderable.ripeMatrices,
          renderable.retiredMatrices,
          ripen,
          retire,
        );
        if (colors && renderable.closedColors && renderable.ripeColors && renderable.retiredColors) {
          mixThreePoseColors(
            colors,
            index * 3,
            renderable.closedColors,
            renderable.ripeColors,
            renderable.retiredColors,
            stages.ripen,
            retire,
          );
        }
        visibility[index] = qaVisible && handoff.capsule > 0.025 ? 1 : 0;
      }
      queueRange(matrixAttribute, range.start * 16, range.count * 16);
      queueRange(colorAttribute, range.start * 3, range.count * 3);
      queueRange(renderable.visibilityAttribute, range.start, range.count);
      changed = true;
    }
    if (changed) {
      matrixAttribute.needsUpdate = true;
      if (colorAttribute) colorAttribute.needsUpdate = true;
      renderable.visibilityAttribute.needsUpdate = true;
    }
  }

  for (const renderable of state.bloom.renderables.cups) {
    const matrixAttribute = renderable.mesh.instanceMatrix;
    const colorAttribute = renderable.mesh.instanceColor;
    const matrices = matrixAttribute.array;
    const colors = colorAttribute?.array;
    const visibility = renderable.visibilityAttribute.array;
    matrixAttribute.clearUpdateRanges();
    colorAttribute?.clearUpdateRanges();
    renderable.visibilityAttribute.clearUpdateRanges();
    let changed = false;

    for (const headIndex of dirtyHeads) {
      const range = renderable.ranges[headIndex];
      if (!range) continue;
      const head = state.bloom.heads[headIndex];
      const qaVisible = bloomRenderableVisible(headIndex);
      for (let index = range.start; index < range.start + range.count; index += 1) {
        const stages = bloomStagesFor(head, renderable.items[index], spatialAllowed);
        const handoff = bloomVisibilityHandoff(stages, bloomMorphScratch.visibility);
        const matrixOffset = index * 16;
        mixThreePoseArrays(
          matrices,
          matrixOffset,
          renderable.closedMatrices,
          renderable.cupMatrices,
          renderable.openMatrices,
          stages.loosen,
          stages.petal,
        );
        if (colors && renderable.closedColors && renderable.cupColors && renderable.openColors) {
          mixThreePoseColors(
            colors,
            index * 3,
            renderable.closedColors,
            renderable.cupColors,
            renderable.openColors,
            stages.loosen,
            stages.petal,
          );
        }
        visibility[index] = qaVisible && Math.max(handoff.cup, stages.petal) > 0.015 ? 1 : 0;
      }
      queueRange(matrixAttribute, range.start * 16, range.count * 16);
      queueRange(colorAttribute, range.start * 3, range.count * 3);
      queueRange(renderable.visibilityAttribute, range.start, range.count);
      changed = true;
    }
    if (changed) {
      matrixAttribute.needsUpdate = true;
      if (colorAttribute) colorAttribute.needsUpdate = true;
      renderable.visibilityAttribute.needsUpdate = true;
    }
  }

  for (const renderable of state.bloom.renderables.florets) {
    const matrixAttribute = renderable.mesh.instanceMatrix;
    const colorAttribute = renderable.mesh.instanceColor;
    const matrices = matrixAttribute.array;
    const colors = colorAttribute?.array;
    const visibility = renderable.visibilityAttribute.array;
    matrixAttribute.clearUpdateRanges();
    colorAttribute?.clearUpdateRanges();
    renderable.visibilityAttribute.clearUpdateRanges();
    let changed = false;

    for (const headIndex of dirtyHeads) {
      const range = renderable.ranges[headIndex];
      if (!range) continue;
      const head = state.bloom.heads[headIndex];
      const qaVisible = bloomRenderableVisible(headIndex);
      for (let index = range.start; index < range.start + range.count; index += 1) {
        const stages = bloomStagesFor(head, renderable.items[index], spatialAllowed);
        const handoff = bloomVisibilityHandoff(stages, bloomMorphScratch.visibility);
        const matrixOffset = index * 16;
        mixThreePoseArrays(
          matrices,
          matrixOffset,
          renderable.budMatrices,
          renderable.cupMatrices,
          renderable.openMatrices,
          stages.loosen,
          stages.petal,
        );
        if (colors && renderable.budColors && renderable.cupColors && renderable.openColors) {
          mixThreePoseColors(
            colors,
            index * 3,
            renderable.budColors,
            renderable.cupColors,
            renderable.openColors,
            stages.loosen,
            stages.petal,
          );
        }
        renderable.morphDriver.morphTargetInfluences[0] = stages.loosen * (1 - stages.petal);
        renderable.morphDriver.morphTargetInfluences[1] = stages.petal;
        renderable.mesh.setMorphAt(index, renderable.morphDriver);
        visibility[index] = qaVisible && Math.max(handoff.cup, handoff.petal) > 0.015 ? 1 : 0;
      }
      queueRange(matrixAttribute, range.start * 16, range.count * 16);
      queueRange(colorAttribute, range.start * 3, range.count * 3);
      queueRange(renderable.visibilityAttribute, range.start, range.count);
      changed = true;
    }
    if (changed) {
      matrixAttribute.needsUpdate = true;
      if (colorAttribute) colorAttribute.needsUpdate = true;
      if (renderable.mesh.morphTexture) renderable.mesh.morphTexture.needsUpdate = true;
      renderable.visibilityAttribute.needsUpdate = true;
    }
  }

  for (const renderable of state.bloom.renderables.filaments) {
    const positions = renderable.positionBuffer.array;
    const colors = renderable.colorBuffer.array;
    const visibility = renderable.visibilityAttribute.array;
    renderable.positionBuffer.clearUpdateRanges();
    renderable.colorBuffer.clearUpdateRanges();
    renderable.visibilityAttribute.clearUpdateRanges();
    let changed = false;

    for (const headIndex of dirtyHeads) {
      const range = renderable.ranges[headIndex];
      if (!range) continue;
      const head = state.bloom.heads[headIndex];
      const qaVisible = bloomRenderableVisible(headIndex);
      for (let index = range.start; index < range.start + range.count; index += 1) {
        const item = renderable.items[index];
        const stages = bloomStagesFor(head, item, spatialAllowed);
        const handoff = bloomVisibilityHandoff(stages, bloomMorphScratch.visibility);
        const outerFilament = item.role === "outer";
        const progress = outerFilament ? stages.outerFilament : stages.innerFilament;
        const visibleProgress = outerFilament
          ? handoff.outerFilament
          : handoff.innerFilament;
        const itemOffset = index * 12;
        let rootX = renderable.openPositions[itemOffset];
        let rootY = renderable.openPositions[itemOffset + 1];
        let rootZ = renderable.openPositions[itemOffset + 2];
        if (Number.isInteger(item.siteIndex)) {
          const floret = state.bloom.floretLookup.get(item.siteKey);
          if (floret) {
            const floretMatrices = floret.renderable.mesh.instanceMatrix.array;
            const floretOffset = floret.index * 16;
            if (item.rootLocal) {
              const local = item.rootLocal;
              rootX = floretMatrices[floretOffset] * local.x
                + floretMatrices[floretOffset + 4] * local.y
                + floretMatrices[floretOffset + 8] * local.z
                + floretMatrices[floretOffset + 12];
              rootY = floretMatrices[floretOffset + 1] * local.x
                + floretMatrices[floretOffset + 5] * local.y
                + floretMatrices[floretOffset + 9] * local.z
                + floretMatrices[floretOffset + 13];
              rootZ = floretMatrices[floretOffset + 2] * local.x
                + floretMatrices[floretOffset + 6] * local.y
                + floretMatrices[floretOffset + 10] * local.z
                + floretMatrices[floretOffset + 14];
            } else {
              rootX = floretMatrices[floretOffset + 12];
              rootY = floretMatrices[floretOffset + 13];
              rootZ = floretMatrices[floretOffset + 14];
            }
          }
        }
        const extension = Math.max(progress, 0.002);
        const openStartX = renderable.openPositions[itemOffset];
        const openStartY = renderable.openPositions[itemOffset + 1];
        const openStartZ = renderable.openPositions[itemOffset + 2];
        const bendX = rootX + (renderable.openPositions[itemOffset + 3] - openStartX) * extension;
        const bendY = rootY + (renderable.openPositions[itemOffset + 4] - openStartY) * extension;
        const bendZ = rootZ + (renderable.openPositions[itemOffset + 5] - openStartZ) * extension;
        const endX = rootX + (renderable.openPositions[itemOffset + 9] - openStartX) * extension;
        const endY = rootY + (renderable.openPositions[itemOffset + 10] - openStartY) * extension;
        const endZ = rootZ + (renderable.openPositions[itemOffset + 11] - openStartZ) * extension;
        positions[itemOffset] = rootX;
        positions[itemOffset + 1] = rootY;
        positions[itemOffset + 2] = rootZ;
        positions[itemOffset + 3] = bendX;
        positions[itemOffset + 4] = bendY;
        positions[itemOffset + 5] = bendZ;
        positions[itemOffset + 6] = bendX;
        positions[itemOffset + 7] = bendY;
        positions[itemOffset + 8] = bendZ;
        positions[itemOffset + 9] = endX;
        positions[itemOffset + 10] = endY;
        positions[itemOffset + 11] = endZ;
        for (let vertexOffset = 0; vertexOffset < 12; vertexOffset += 1) {
          const offset = itemOffset + vertexOffset;
          colors[offset] = THREE.MathUtils.lerp(
            renderable.budColors[offset],
            renderable.openColors[offset],
            progress,
          );
        }
        const lineVisibility = qaVisible ? visibleProgress : 0;
        visibility[index * 2] = lineVisibility;
        visibility[index * 2 + 1] = lineVisibility;
      }
      queueRange(renderable.positionBuffer, range.start * 12, range.count * 12);
      queueRange(renderable.colorBuffer, range.start * 12, range.count * 12);
      queueRange(renderable.visibilityAttribute, range.start * 2, range.count * 2);
      changed = true;
    }
    if (changed) {
      renderable.positionBuffer.needsUpdate = true;
      renderable.colorBuffer.needsUpdate = true;
      renderable.visibilityAttribute.needsUpdate = true;
    }
  }

  for (const renderable of state.bloom.renderables.fuzz) {
    const progressAttribute = renderable.progressAttribute;
    const progressValues = progressAttribute.array;
    progressAttribute.clearUpdateRanges();
    let changed = false;

    for (const headIndex of dirtyHeads) {
      const range = renderable.ranges[headIndex];
      if (!range) continue;
      const head = state.bloom.heads[headIndex];
      const timeline = spatialAllowed ? head.timeline : Number(head.committedOpen);
      const qaVisible = bloomRenderableVisible(headIndex);
      for (let index = range.start; index < range.start + range.count; index += 1) {
        const pollen = pollenBloomProgress(
          timeline,
          renderable.siteDelays[index],
          bloomMorphScratch.pollen,
        );
        progressValues[index] = qaVisible ? pollen.progress : 0;
      }
      queueRange(progressAttribute, range.start, range.count);
      changed = true;
    }
    if (changed) {
      progressAttribute.needsUpdate = true;
    }
  }

  for (const renderable of state.bloom.renderables.tips) {
    const positionAttribute = renderable.points.geometry.attributes.position;
    const colorAttribute = renderable.points.geometry.attributes.color;
    const sizeAttribute = renderable.points.geometry.attributes.aSize;
    const visibilityAttribute = renderable.visibilityAttribute;
    const positions = positionAttribute.array;
    const colors = colorAttribute.array;
    const sizes = sizeAttribute.array;
    const visibility = visibilityAttribute.array;
    positionAttribute.clearUpdateRanges();
    colorAttribute.clearUpdateRanges();
    sizeAttribute.clearUpdateRanges();
    visibilityAttribute.clearUpdateRanges();
    let changed = false;

    for (const headIndex of dirtyHeads) {
      const range = renderable.ranges[headIndex];
      if (!range) continue;
      const head = state.bloom.heads[headIndex];
      const qaVisible = bloomRenderableVisible(headIndex);
      for (let index = range.start; index < range.start + range.count; index += 1) {
        const item = renderable.items[index];
        const stages = bloomStagesFor(head, item, spatialAllowed);
        const handoff = bloomVisibilityHandoff(stages, bloomMorphScratch.visibility);
        const offset = index * 3;
        let progress = stages.pollen;
        let itemVisibility = handoff.pollen;
        if (item.role === "bud-pore") {
          progress = 0;
          itemVisibility = handoff.capsule > 0.025 ? 1 : 0;
        } else if (item.role === "floret-anther") {
          progress = stages.innerFilament;
          itemVisibility = handoff.innerFilament;
        } else if (item.role === "center") {
          const sourceLinked = Number.isInteger(item.sourceFilamentId);
          if (sourceLinked) {
            progress = stages.innerFilament;
            itemVisibility = handoff.innerFilament;
          }
        }
        const capSource = item.role === "bud-pore" && Number.isInteger(item.siteIndex)
          ? state.bloom.capLookup.get(item.siteKey)
          : null;
        const source = Number.isInteger(item.sourceFilamentId)
          ? state.bloom.filamentLookup[item.sourceFilamentId]
          : null;
        if (capSource) {
          const capOffset = capSource.index * 16;
          const capMatrices = capSource.renderable.mesh.instanceMatrix.array;
          positions[offset] = capMatrices[capOffset + 4] * 0.88 + capMatrices[capOffset + 12];
          positions[offset + 1] = capMatrices[capOffset + 5] * 0.88 + capMatrices[capOffset + 13];
          positions[offset + 2] = capMatrices[capOffset + 6] * 0.88 + capMatrices[capOffset + 14];
        } else if (source) {
          const sourceOffset = source.index * 12 + 9;
          const sourcePositions = source.renderable.positionBuffer.array;
          positions[offset] = sourcePositions[sourceOffset];
          positions[offset + 1] = sourcePositions[sourceOffset + 1];
          positions[offset + 2] = sourcePositions[sourceOffset + 2];
        } else {
          positions[offset] = THREE.MathUtils.lerp(
            renderable.budPositions[offset],
            renderable.openPositions[offset],
            progress,
          );
          positions[offset + 1] = THREE.MathUtils.lerp(
            renderable.budPositions[offset + 1],
            renderable.openPositions[offset + 1],
            progress,
          );
          positions[offset + 2] = THREE.MathUtils.lerp(
            renderable.budPositions[offset + 2],
            renderable.openPositions[offset + 2],
            progress,
          );
        }
        for (let component = 0; component < 3; component += 1) {
          const componentOffset = offset + component;
          colors[componentOffset] = THREE.MathUtils.lerp(
            renderable.budColors[componentOffset],
            renderable.openColors[componentOffset],
            progress,
          );
        }
        sizes[index] = item.role === "bud-pore"
          ? renderable.budSizes[index] * (0.2 + handoff.capsule * 0.8)
          : THREE.MathUtils.lerp(
            renderable.budSizes[index],
            renderable.openSizes[index],
            progress,
          );
        visibility[index] = qaVisible ? itemVisibility : 0;
      }
      queueRange(positionAttribute, range.start * 3, range.count * 3);
      queueRange(colorAttribute, range.start * 3, range.count * 3);
      queueRange(sizeAttribute, range.start, range.count);
      queueRange(visibilityAttribute, range.start, range.count);
      changed = true;
    }
    if (changed) {
      positionAttribute.needsUpdate = true;
      colorAttribute.needsUpdate = true;
      sizeAttribute.needsUpdate = true;
      visibilityAttribute.needsUpdate = true;
    }
  }

  for (const [attribute, range] of pendingRanges) {
    const count = range.end - range.start;
    attribute.addUpdateRange(range.start, count);
    uploadStats.rangeCount += 1;
    uploadStats.bytes += count * attribute.array.BYTES_PER_ELEMENT;
  }
  uploadStats.peakBytes = Math.max(uploadStats.peakBytes, uploadStats.bytes);
  if (state.qa) {
    setStageData("qaBloomUploadBytes", String(uploadStats.bytes));
    setStageData("qaBloomUploadRanges", String(uploadStats.rangeCount));
    setStageData("qaBloomUploadDirtyHeads", String(uploadStats.dirtyHeadCount));
  }
}

function composeSegmentMatrix(start, end, radius, target) {
  const direction = end.clone().sub(start);
  const length = direction.length();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, direction.normalize());
  const position = start.clone().add(end).multiplyScalar(0.5);
  target.compose(position, quaternion, new THREE.Vector3(radius, length * 1.06, radius));
  return target;
}

function composeLeafMatrix(item, target, offset = null) {
  const position = item.position.clone();
  if (offset) position.sub(offset);
  target.compose(
    position,
    item.quaternion,
    new THREE.Vector3(
      item.length * item.width,
      item.length,
      item.length * (item.curve ?? 1),
    ),
  );
  return target;
}

function composeFloretMatrix(item, target, offset = null) {
  const position = item.position.clone();
  if (offset) position.sub(offset);
  target.compose(
    position,
    item.quaternion,
    new THREE.Vector3(item.scale, item.scale * item.heightScale, item.scale),
  );
  return target;
}

function composeBloomCoreMatrix(item, target, offset = null) {
  const position = item.position.clone().addScaledVector(
    item.faceNormal ?? Y_AXIS,
    item.coreOffset ?? 0,
  );
  if (offset) position.sub(offset);
  const fallbackScale = item.coreScale ?? BLOOM_CORE_SCALE;
  const scale3 = item.coreScale3
    ? item.coreScale3.clone()
    : new THREE.Vector3(fallbackScale, fallbackScale, fallbackScale);
  target.compose(
    position,
    item.faceQuaternion ?? new THREE.Quaternion(),
    scale3.multiplyScalar(item.radius * INTERNAL_CORE_SCALE_FACTOR),
  );
  return target;
}

function fitView() {
  const size = state.data.bounds.getSize(new THREE.Vector3());
  const center = state.data.bounds.getCenter(new THREE.Vector3());
  const verticalFov = THREE.MathUtils.degToRad(state.camera.fov);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * state.camera.aspect);
  const portrait = state.camera.aspect < 0.82;
  const azimuth = state.camera.aspect > 1.25
    ? DEFAULT_VIEW_AZIMUTH_LANDSCAPE
    : state.camera.aspect > 0.82
      ? DEFAULT_VIEW_AZIMUTH_TABLET
      : DEFAULT_VIEW_AZIMUTH_PORTRAIT;
  const elevation = portrait ? DEFAULT_VIEW_ELEVATION * 0.68 : DEFAULT_VIEW_ELEVATION;
  const cosAzimuth = Math.cos(azimuth);
  const sinAzimuth = Math.sin(azimuth);
  const cosElevation = Math.cos(elevation);
  const sinElevation = Math.sin(elevation);

  /* Fit the rotated silhouette rather than its unrotated world-space box.
     This keeps the complete branch composition stable as the authored view
     moves away from a flat frontal angle. */
  const projectedWidth = Math.abs(size.x * cosAzimuth) + Math.abs(size.z * sinAzimuth);
  const projectedDepth = Math.abs(size.x * sinAzimuth) + Math.abs(size.z * cosAzimuth);
  const projectedHeight = Math.abs(size.y * cosElevation)
    + Math.abs(projectedDepth * sinElevation);
  const verticalDistance = projectedHeight * 0.5 / Math.tan(verticalFov / 2);
  const horizontalDistance = projectedWidth * 0.5 / Math.tan(horizontalFov / 2);
  const margin = portrait ? 0.92 : state.camera.aspect < 1.25 ? 0.86 : 0.81;
  const distance = (
    Math.max(verticalDistance, horizontalDistance)
    + projectedDepth * cosElevation * 0.5
  ) * margin;

  const compositionOffset = state.camera.aspect > 1.25
    ? projectedWidth * 0.38
    : state.camera.aspect > 0.85
      ? projectedWidth * 0.28
      : state.camera.aspect > 0.62
        ? projectedWidth * 0.13
        : projectedWidth * 0.08;
  center.x -= compositionOffset;
  /* Geometry is bottom-heavy while flowers and leaves form the visual mass
     above its bounding-box midpoint. This optical lift centers the living
     canopy and lets the rooted stem enter naturally from the lower edge. */
  center.y += size.y * (portrait ? 0.025 : 0.055);
  const viewDirection = new THREE.Vector3(
    sinAzimuth * cosElevation,
    sinElevation,
    cosAzimuth * cosElevation,
  );
  state.camera.position.copy(center).addScaledVector(viewDirection, distance);
  state.controls.target.copy(center);
  state.controls.minDistance = distance * MIN_ZOOM_DISTANCE_RATIO;
  state.controls.maxDistance = distance * MAX_ZOOM_DISTANCE_RATIO;
  state.camera.near = 0.04;
  const universeReach = state.universe?.userData?.outerRadius ?? 0;
  state.camera.far = Math.max(
    state.controls.maxDistance + size.y * 3.6,
    state.controls.maxDistance + universeReach * 1.08,
  );
  state.camera.updateProjectionMatrix();
  state.controls.update();

  state.defaultView = {
    position: state.camera.position.clone(),
    target: state.controls.target.clone(),
    near: state.camera.near,
    far: state.camera.far,
    minDistance: state.controls.minDistance,
    maxDistance: state.controls.maxDistance,
    azimuth,
    elevation,
    projectedWidth,
    projectedHeight,
    compositionOffset,
  };
}

function updateSway(time) {
  const strength = state.breeze;
  for (const group of state.swayGroups) {
    const sway = group.userData.sway;
    const wave = Math.sin(time * sway.frequency * Math.PI * 2 + sway.phase);
    const secondWave = Math.cos(time * sway.frequency * 1.37 * Math.PI * 2 + sway.phase * 0.7);
    group.rotation.z = wave * sway.amplitude * strength;
    group.rotation.x = secondWave * sway.amplitude * 0.42 * strength;
    group.rotation.y = wave * sway.amplitude * 0.26 * strength;
  }
}

function updateUniverse(time) {
  if (!state.universe || !state.universeMaterial) return;
  state.universe.rotation.y = time * 0.0032;
  state.universe.rotation.x = Math.sin(time * 0.018) * 0.012;
  state.universe.rotation.z = Math.cos(time * 0.013) * 0.006;
  state.universeMaterial.uniforms.uTime.value = time;
}

function resetSwayPose() {
  for (const group of state.swayGroups) group.rotation.set(0, 0, 0);
}

function resetUniversePose() {
  if (state.universe) state.universe.rotation.set(0, 0, 0);
  if (state.universeMaterial) state.universeMaterial.uniforms.uTime.value = 0;
}

function clearBloomHover(now = performance.now()) {
  if (!state.bloom) {
    setStageData("bloomHover", "false");
    return;
  }
  state.bloom.hoveredIndex = -1;
  setStageData("bloomHover", "false");
}

function bloomAtHoverArea(clientX, clientY, now) {
  const rect = state.viewport;
  if (rect.width <= 0 || rect.height <= 0 || !state.bloom) {
    state.hoverPointer.pending = false;
    clearBloomHover(now);
    return false;
  }

  const brushRadius = THREE.MathUtils.clamp(
    Math.min(rect.width, rect.height) * BLOOM_BRUSH_VIEWPORT_RATIO,
    BLOOM_BRUSH_RADIUS_MIN,
    BLOOM_BRUSH_RADIUS_MAX,
  );
  bloomPicker.pointer.set(
    (clientX - rect.left) / rect.width * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1,
  );
  bloomPicker.raycaster.setFromCamera(bloomPicker.pointer, state.camera);
  let candidateCount = 0;

  for (const mesh of state.coreMeshes) {
    for (let instanceId = 0; instanceId < mesh.count; instanceId += 1) {
      const index = mesh.userData.bloomIndices?.[instanceId] ?? -1;
      const head = state.bloom.heads[index];
      if (!head || headOpen(head)) continue;

      mesh.getMatrixAt(instanceId, bloomPicker.instanceMatrix);
      bloomPicker.worldMatrix.multiplyMatrices(mesh.matrixWorld, bloomPicker.instanceMatrix);
      bloomPicker.worldPosition.setFromMatrixPosition(bloomPicker.worldMatrix);
      bloomBrush.projected.copy(bloomPicker.worldPosition).project(state.camera);
      if (bloomBrush.projected.z < -1 || bloomBrush.projected.z > 1) continue;

      const x = rect.left + (bloomBrush.projected.x + 1) * 0.5 * rect.width;
      const y = rect.top + (1 - bloomBrush.projected.y) * 0.5 * rect.height;
      const distance = Math.hypot(clientX - x, clientY - y);
      if (distance > brushRadius) continue;

      const candidate = bloomBrush.candidates[candidateCount] ?? {
        index: -1,
        distance: Infinity,
        x: 0,
        y: 0,
        z: 0,
        nx: 0,
        ny: 0,
        nz: 1,
      };
      candidate.index = index;
      candidate.distance = distance;
      candidate.x = bloomPicker.worldPosition.x;
      candidate.y = bloomPicker.worldPosition.y;
      candidate.z = bloomPicker.worldPosition.z;
      const hitRadius = mesh.userData.hitRadii?.[instanceId]
        ?? mesh.userData.hitShapes?.[instanceId]?.radial
        ?? 0.2;
      bloomPicker.brushSphere.center.copy(bloomPicker.worldPosition);
      bloomPicker.brushSphere.radius = hitRadius;
      if (bloomPicker.raycaster.ray.intersectSphere(bloomPicker.brushSphere, bloomPicker.worldHit)) {
        bloomPicker.resultNormal.copy(bloomPicker.worldHit).sub(bloomPicker.worldPosition).normalize();
      } else {
        bloomPicker.resultNormal.copy(state.camera.position).sub(bloomPicker.worldPosition).normalize();
      }
      bloomPicker.inverseMeshMatrix.copy(mesh.matrixWorld).invert();
      bloomPicker.resultNormal.transformDirection(bloomPicker.inverseMeshMatrix);
      candidate.nx = bloomPicker.resultNormal.x;
      candidate.ny = bloomPicker.resultNormal.y;
      candidate.nz = bloomPicker.resultNormal.z;
      bloomBrush.candidates[candidateCount] = candidate;
      candidateCount += 1;
    }
  }

  bloomBrush.candidates.length = candidateCount;
  bloomBrush.candidates.sort((a, b) => a.distance - b.distance);
  if (candidateCount === 0) {
    state.hoverPointer.pending = false;
    clearBloomHover(now);
    if (query.get("qa") === "1") setStageData("qaBloomBrushCount", "0");
    return false;
  }

  const batchSize = Math.min(candidateCount, BLOOM_BRUSH_BATCH_SIZE);
  for (let index = 0; index < batchSize; index += 1) {
    const target = bloomBrush.candidates[index];
    bloomPicker.resultPosition.set(target.x, target.y, target.z);
    bloomPicker.resultNormal.set(target.nx, target.ny, target.nz);
    activateBloomAtIndex(
      target.index,
      bloomPicker.resultPosition,
      false,
      index * BLOOM_BRUSH_HEAD_STAGGER_MS,
      bloomPicker.resultNormal,
    );
  }

  const nextTarget = bloomBrush.candidates[batchSize];
  state.bloom.hoveredIndex = nextTarget?.index ?? -1;
  state.hoverPointer.pending = Boolean(nextTarget);
  setStageData("bloomHover", nextTarget ? "true" : "false");
  if (query.get("qa") === "1") {
    setStageData("qaBloomBrushCount", String(candidateCount));
    setStageData("qaBloomBrushRadius", brushRadius.toFixed(2));
  }
  return true;
}

function pickBloomAt(clientX, clientY) {
  if (!state.growth?.complete) return false;
  const rect = state.viewport;
  if (rect.width <= 0 || rect.height <= 0) return false;
  bloomPicker.pointer.set(
    (clientX - rect.left) / rect.width * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1,
  );
  bloomPicker.raycaster.setFromCamera(bloomPicker.pointer, state.camera);
  bloomPicker.resultIndex = -1;
  bloomPicker.resultRadius = 0;
  let selectedDistance = Infinity;

  for (const mesh of state.coreMeshes) {
    for (let instanceId = 0; instanceId < mesh.count; instanceId += 1) {
      mesh.getMatrixAt(instanceId, bloomPicker.instanceMatrix);
      bloomPicker.worldMatrix.multiplyMatrices(mesh.matrixWorld, bloomPicker.instanceMatrix);
      bloomPicker.worldMatrix.decompose(
        bloomPicker.worldPosition,
        bloomPicker.worldQuaternion,
        bloomPicker.worldScale,
      );
      const hitShape = mesh.userData.hitShapes?.[instanceId];
      const hitRadius = hitShape?.radial
        ?? mesh.userData.hitRadii?.[instanceId]
        ?? bloomPicker.worldScale.x * 1.48;
      bloomPicker.hitAxis.copy(Y_AXIS).applyQuaternion(bloomPicker.worldQuaternion).normalize();
      bloomPicker.hitCenter.copy(bloomPicker.worldPosition).addScaledVector(
        bloomPicker.hitAxis,
        hitShape?.centerOffset ?? 0,
      );
      bloomPicker.worldScale.set(hitRadius, hitShape?.axial ?? hitRadius, hitRadius);
      bloomPicker.hitMatrix.compose(
        bloomPicker.hitCenter,
        bloomPicker.worldQuaternion,
        bloomPicker.worldScale,
      );
      bloomPicker.inverseHitMatrix.copy(bloomPicker.hitMatrix).invert();
      bloomPicker.localOrigin.copy(bloomPicker.raycaster.ray.origin)
        .applyMatrix4(bloomPicker.inverseHitMatrix);
      bloomPicker.localEnd.copy(bloomPicker.raycaster.ray.origin)
        .add(bloomPicker.raycaster.ray.direction)
        .applyMatrix4(bloomPicker.inverseHitMatrix);
      bloomPicker.localDirection.copy(bloomPicker.localEnd)
        .sub(bloomPicker.localOrigin)
        .normalize();
      bloomPicker.localRay.set(bloomPicker.localOrigin, bloomPicker.localDirection);
      if (!bloomPicker.localRay.intersectSphere(bloomPicker.unitSphere, bloomPicker.localHit)) continue;
      bloomPicker.worldHit.copy(bloomPicker.localHit).applyMatrix4(bloomPicker.hitMatrix);
      const distanceFromCamera = bloomPicker.worldHit.distanceTo(bloomPicker.raycaster.ray.origin);
      if (distanceFromCamera < selectedDistance) {
        selectedDistance = distanceFromCamera;
        bloomPicker.resultPosition.copy(bloomPicker.worldHit);
        bloomPicker.inverseMeshMatrix.copy(mesh.matrixWorld).invert();
        bloomPicker.localOrigin.copy(bloomPicker.hitCenter)
          .applyMatrix4(bloomPicker.inverseMeshMatrix);
        bloomPicker.localEnd.copy(bloomPicker.worldHit)
          .applyMatrix4(bloomPicker.inverseMeshMatrix);
        bloomPicker.resultNormal.copy(bloomPicker.localEnd)
          .sub(bloomPicker.localOrigin)
          .normalize();
        bloomPicker.resultRadius = hitRadius;
        bloomPicker.resultIndex = mesh.userData.bloomIndices?.[instanceId] ?? -1;
      }
    }
  }

  return bloomPicker.resultIndex >= 0;
}

function findBloomWorldPosition(index, target = bloomPicker.resultPosition) {
  for (const mesh of state.coreMeshes) {
    const instanceId = mesh.userData.bloomIndices?.indexOf(index) ?? -1;
    if (instanceId < 0) continue;
    mesh.getMatrixAt(instanceId, bloomPicker.instanceMatrix);
    bloomPicker.worldMatrix.multiplyMatrices(mesh.matrixWorld, bloomPicker.instanceMatrix);
    target.setFromMatrixPosition(bloomPicker.worldMatrix);
    return true;
  }
  return false;
}

function activateBloomAtIndex(
  index,
  worldPosition = null,
  announce = true,
  delay = 0,
  originNormal = null,
) {
  if (!state.growth?.complete) return false;
  const head = state.bloom?.heads[index];
  if (!head) return false;
  if (headOpen(head)) {
    if (announce) setStatus("That flower is already open.", 1100);
    return false;
  }
  const now = performance.now();
  updateBloomAnimation(now);
  const fallbackNormal = state.data.all.blooms[index]?.faceNormal;
  head.originNormal.copy(originNormal ?? fallbackNormal ?? Y_AXIS).normalize();
  head.delayRevision += 1;
  beginBloomActivation(head, now, delay);
  state.selectedBloomIndex = index;
  if (worldPosition) {
    state.selectionLight.position.copy(worldPosition);
  } else if (findBloomWorldPosition(index)) {
    state.selectionLight.position.copy(bloomPicker.resultPosition);
  }
  if (announce) {
    const remaining = state.bloom.heads.filter((item) => !headOpen(item)).length;
    setStatus(
      remaining > 0
        ? `Flower opening. ${remaining} buds remain.`
        : "Flower opening. This is the final bud.",
      bloomUnfurlDuration() + 400,
    );
  }
  invalidate();
  return true;
}

function triggerBouquetBloom(announce = true, animateFinale = false) {
  if (!state.bloom) return false;
  if (!state.growth?.complete) return completeTreeGrowth(announce);
  const remaining = state.bloom.heads.filter((head) => !headOpen(head));
  if (remaining.length === 0) {
    if (announce) setStatus("All flowers are already open.", 1200);
    return false;
  }

  clearBloomHover(performance.now());
  state.selectedBloomIndex = -1;
  const dirty = [];
  for (const head of remaining) {
    head.committedOpen = true;
    head.ownValue = 1;
    head.ownTimeline = 1;
    head.value = 1;
    head.timeline = 1;
    head.timelineFrom = 1;
    head.from = 1;
    head.target = 1;
    head.mode = "open";
    dirty.push(head.index);
  }
  applyBloomEffects(dirty);
  state.bloom.activeCount = 0;
  state.bloom.openCount = state.bloom.heads.length;
  state.bloom.progress = 1;
  state.bloom.maxProgress = 1;
  state.bloom.maxTimeline = 1;
  state.bloom.cascadeActive = false;
  state.bloom.cascadeEndsAt = 0;
  state.selectionLight.intensity = 0;
  syncCultivation();
  if (announce) setStatus("All remaining buds opened.", 1500);
  notifyFinale(animateFinale && !reduceBloomMotion(), !animateFinale);
  invalidate();
  return true;
}

function findQaHeroBloomIndex() {
  const candidates = state.data.all.blooms.filter((bloom) => bloom.archetype === "hero");
  const source = candidates.length > 0 ? candidates : state.data.all.blooms;
  source.sort((a, b) => {
    const nearestA = Math.min(...state.data.all.blooms
      .filter((bloom) => bloom.index !== a.index)
      .map((bloom) => bloom.position.distanceTo(a.position)));
    const nearestB = Math.min(...state.data.all.blooms
      .filter((bloom) => bloom.index !== b.index)
      .map((bloom) => bloom.position.distanceTo(b.position)));
    const scoreA = a.radius * 0.7 + a.position.z * 0.55 + nearestA * 0.28
      + Math.max(0, a.faceNormal?.dot(Z_AXIS) ?? 0) * 0.24;
    const scoreB = b.radius * 0.7 + b.position.z * 0.55 + nearestB * 0.28
      + Math.max(0, b.faceNormal?.dot(Z_AXIS) ?? 0) * 0.24;
    return scoreB - scoreA;
  });
  return source[0]?.index ?? 0;
}

function findQaPhyllodeIndex() {
  let bestIndex = 0;
  let bestScore = -Infinity;
  state.data.all.leaves.forEach((leaf, index) => {
    const score = leaf.length + leaf.position.z * 0.06 - Math.abs(leaf.position.x) * 0.025;
    if (score > bestScore) {
      bestIndex = index;
      bestScore = score;
    }
  });
  return bestIndex;
}

function focusQaTarget(target, distance, radius, authoredViewDirection = null) {
  state.qaCameraLock = true;
  const viewDirection = authoredViewDirection?.clone().normalize()
    ?? state.camera.position.clone().sub(state.controls.target).normalize();
  state.controls.target.copy(target);
  state.camera.position.copy(target).addScaledVector(viewDirection, distance);
  state.camera.near = Math.max(0.01, distance - radius * 3.2);
  state.camera.far = Math.max(state.defaultView?.far ?? 20, distance + radius * 12);
  state.camera.updateProjectionMatrix();
  state.controls.minDistance = Math.max(0.18, radius * 2.1);
  state.controls.maxDistance = Math.max(distance * 2.4, state.controls.minDistance * 1.2);
  state.controls.update();
  state.userMoved = true;
  invalidate();
}

function focusBloomForQa(index, view = "face") {
  const bloom = state.data.all.blooms.find((item) => item.index === index)
    ?? state.data.all.blooms[findQaHeroBloomIndex()];
  if (!bloom) return -1;
  const faceNormal = bloom.faceNormal ?? Z_AXIS;
  const basisU = bloom.basisU ?? X_AXIS;
  const viewDirections = {
    face: faceNormal,
    rear: faceNormal.clone().negate(),
    profile: basisU,
    oblique: faceNormal.clone().multiplyScalar(0.72).addScaledVector(basisU, 0.69).normalize(),
  };
  const viewDirection = viewDirections[view] ?? viewDirections.face;
  const visualCenter = bloom.position.clone();
  focusQaTarget(
    visualCenter,
    Math.max(0.94, bloom.radius * 7.2),
    bloom.radius,
    viewDirection,
  );
  return bloom.index;
}

function focusLeafForQa(index) {
  const leaf = state.data.all.leaves[index] ?? state.data.all.leaves[findQaPhyllodeIndex()];
  if (!leaf) return -1;
  const matrix = composeLeafMatrix(leaf, new THREE.Matrix4());
  const target = new THREE.Vector3(0, 0.58, 0.12).applyMatrix4(matrix);
  focusQaTarget(target, Math.max(0.74, leaf.length * 2.65), leaf.length * 0.7);
  return state.data.all.leaves.indexOf(leaf);
}

function projectBloomPointForQa(index, uRatio = 0, vRatio = 0, axialRatio = 0) {
  const bloom = state.data.all.blooms.find((item) => item.index === index);
  if (!bloom) return null;
  const worldPoint = bloom.position.clone()
    .addScaledVector(bloom.basisU ?? X_AXIS, bloom.radius * uRatio)
    .addScaledVector(bloom.basisV ?? Z_AXIS, bloom.radius * vRatio)
    .addScaledVector(bloom.faceNormal ?? Y_AXIS, bloom.radius * axialRatio);
  const projected = worldPoint.project(state.camera);
  const rect = state.viewport;
  return {
    x: rect.left + (projected.x + 1) * 0.5 * rect.width,
    y: rect.top + (1 - projected.y) * 0.5 * rect.height,
    ndc: [projected.x, projected.y, projected.z],
  };
}

function includeInstanceEnvelope(matrixArray, index, geometryRadius, center, target, key) {
  const offset = index * 16;
  const x = matrixArray[offset + 12] - center.x;
  const y = matrixArray[offset + 13] - center.y;
  const z = matrixArray[offset + 14] - center.z;
  const scaleX = Math.hypot(
    matrixArray[offset],
    matrixArray[offset + 1],
    matrixArray[offset + 2],
  );
  const scaleY = Math.hypot(
    matrixArray[offset + 4],
    matrixArray[offset + 5],
    matrixArray[offset + 6],
  );
  const scaleZ = Math.hypot(
    matrixArray[offset + 8],
    matrixArray[offset + 9],
    matrixArray[offset + 10],
  );
  const reach = Math.hypot(x, y, z) + geometryRadius * Math.max(scaleX, scaleY, scaleZ);
  target[key] = Math.max(target[key], reach);
  return reach;
}

function sampleBloomGeometryForQa(index = findQaHeroBloomIndex()) {
  const head = state.bloom?.heads[index];
  const bloom = state.data?.all.blooms[index];
  if (!head || !bloom) return null;

  const center = bloom.position.clone().sub(GATHER_POINT);
  const envelope = {
    core: 0,
    capsule: 0,
    cup: 0,
    petal: 0,
    filament: 0,
    pollen: 0,
  };
  const visible = {
    capsules: 0,
    cups: 0,
    petals: 0,
    innerFilaments: 0,
    outerFilaments: 0,
    budPores: 0,
    anthers: 0,
    pollen: 0,
  };
  let minimumSurfaceOwnership = 1;
  let maximumDormantVisibility = 0;
  let maximumAntherSourceGap = 0;
  let minimumSiteDelay = 1;
  let maximumSiteDelay = 0;
  let targetEnvelope = 0;

  for (const renderable of state.bloom.renderables.caps) {
    const range = renderable.ranges[index];
    if (!range) continue;
    renderable.mesh.geometry.computeBoundingSphere();
    const radius = renderable.mesh.geometry.boundingSphere?.radius ?? 1;
    for (let instance = range.start; instance < range.start + range.count; instance += 1) {
      const amount = renderable.visibilityAttribute.array[instance];
      if (amount <= 0.001) continue;
      visible.capsules += 1;
      includeInstanceEnvelope(
        renderable.mesh.instanceMatrix.array,
        instance,
        radius,
        center,
        envelope,
        "capsule",
      );
    }
  }

  for (const renderable of state.bloom.renderables.cups) {
    const range = renderable.ranges[index];
    if (!range) continue;
    renderable.mesh.geometry.computeBoundingSphere();
    const radius = renderable.mesh.geometry.boundingSphere?.radius ?? 1;
    for (let instance = range.start; instance < range.start + range.count; instance += 1) {
      const amount = renderable.visibilityAttribute.array[instance];
      if (amount <= 0.001) continue;
      visible.cups += 1;
      includeInstanceEnvelope(
        renderable.mesh.instanceMatrix.array,
        instance,
        radius,
        center,
        envelope,
        "cup",
      );
    }
  }

  for (const renderable of state.bloom.renderables.florets) {
    const range = renderable.ranges[index];
    if (!range) continue;
    renderable.mesh.geometry.computeBoundingSphere();
    const radius = renderable.mesh.geometry.boundingSphere?.radius ?? 1;
    for (let instance = range.start; instance < range.start + range.count; instance += 1) {
      const item = renderable.items[instance];
      const siteDelay = bloomSiteDelay(head, item);
      const stages = siteBloomProgress(head.timeline, siteDelay, {});
      const handoff = bloomVisibilityHandoff(stages, {});
      minimumSiteDelay = Math.min(minimumSiteDelay, siteDelay);
      maximumSiteDelay = Math.max(maximumSiteDelay, siteDelay);
      minimumSurfaceOwnership = Math.min(
        minimumSurfaceOwnership,
        Math.max(handoff.capsule, handoff.cup, handoff.petal),
      );
      targetEnvelope = Math.max(targetEnvelope, bloomEnvelopeTarget(stages));
      const amount = renderable.visibilityAttribute.array[instance];
      if (amount <= 0.001) continue;
      visible.petals += 1;
      includeInstanceEnvelope(
        renderable.mesh.instanceMatrix.array,
        instance,
        radius,
        center,
        envelope,
        "petal",
      );
    }
  }

  for (const renderable of state.bloom.renderables.filaments) {
    const range = renderable.ranges[index];
    if (!range) continue;
    const positions = renderable.positionBuffer.array;
    const lineVisibility = renderable.visibilityAttribute.array;
    for (let instance = range.start; instance < range.start + range.count; instance += 1) {
      const item = renderable.items[instance];
      const amount = Math.max(
        lineVisibility[instance * 2],
        lineVisibility[instance * 2 + 1],
      );
      if (amount <= 0.001) continue;
      const stages = siteBloomProgress(head.timeline, bloomSiteDelay(head, item), {});
      const isOuter = item.role === "outer";
      if (isOuter) visible.outerFilaments += 1;
      else visible.innerFilaments += 1;
      if ((isOuter && stages.petal <= 0.6) || (!isOuter && stages.petal <= 0.35)) {
        maximumDormantVisibility = Math.max(maximumDormantVisibility, amount);
      }
      const offset = instance * 12;
      for (let vertex = 0; vertex < 4; vertex += 1) {
        const vertexOffset = offset + vertex * 3;
        const reach = Math.hypot(
          positions[vertexOffset] - center.x,
          positions[vertexOffset + 1] - center.y,
          positions[vertexOffset + 2] - center.z,
        );
        envelope.filament = Math.max(envelope.filament, reach);
      }
    }
  }

  for (const renderable of state.bloom.renderables.tips) {
    const range = renderable.ranges[index];
    if (!range) continue;
    const positions = renderable.points.geometry.attributes.position.array;
    const sizes = renderable.points.geometry.attributes.aSize.array;
    const pointVisibility = renderable.visibilityAttribute.array;
    for (let point = range.start; point < range.start + range.count; point += 1) {
      const amount = pointVisibility[point];
      if (amount <= 0.001) continue;
      const item = renderable.items[point];
      if (item.role === "bud-pore") visible.budPores += 1;
      else if (item.role === "floret-anther") visible.anthers += 1;
      else visible.pollen += 1;
      const offset = point * 3;
      const reach = Math.hypot(
        positions[offset] - center.x,
        positions[offset + 1] - center.y,
        positions[offset + 2] - center.z,
      ) + sizes[point] * 0.5;
      envelope.pollen = Math.max(envelope.pollen, reach);
      const source = Number.isInteger(item.sourceFilamentId)
        ? state.bloom.filamentLookup[item.sourceFilamentId]
        : null;
      if (source) {
        const sourceOffset = source.index * 12 + 9;
        const sourcePositions = source.renderable.positionBuffer.array;
        maximumAntherSourceGap = Math.max(
          maximumAntherSourceGap,
          Math.hypot(
            positions[offset] - sourcePositions[sourceOffset],
            positions[offset + 1] - sourcePositions[sourceOffset + 1],
            positions[offset + 2] - sourcePositions[sourceOffset + 2],
          ),
        );
      }
    }
  }

  for (const renderable of state.bloom.renderables.fuzz) {
    const range = renderable.ranges[index];
    if (!range) continue;
    const positions = renderable.points.geometry.attributes.position.array;
    const origins = renderable.points.geometry.attributes.aOrigin.array;
    const sizes = renderable.points.geometry.attributes.aSize.array;
    const progressValues = renderable.progressAttribute.array;
    const pointVisibility = renderable.visibilityAttribute.array;
    for (let point = range.start; point < range.start + range.count; point += 1) {
      if (pointVisibility[point] <= 0.001) continue;
      visible.pollen += 1;
      const offset = point * 3;
      const progress = progressValues[point];
      const x = THREE.MathUtils.lerp(origins[offset], positions[offset], progress);
      const y = THREE.MathUtils.lerp(origins[offset + 1], positions[offset + 1], progress);
      const z = THREE.MathUtils.lerp(origins[offset + 2], positions[offset + 2], progress);
      const size = sizes[point] * THREE.MathUtils.lerp(BUD_TIP_SCALE, 1, progress);
      const reach = Math.hypot(
        x - center.x,
        y - center.y,
        z - center.z,
      ) + size * 0.5;
      envelope.pollen = Math.max(envelope.pollen, reach);
    }
  }

  const actualEnvelope = Math.max(...Object.values(envelope));
  const normalizedComponents = Object.fromEntries(
    Object.entries(envelope).map(([name, value]) => [name, value / bloom.radius]),
  );
  return {
    index,
    timeline: head.timeline,
    durationMs: bloomUnfurlDuration(),
    maximumSiteDelay: BLOOM_MAX_SITE_DELAY,
    siteDelayRange: [minimumSiteDelay, maximumSiteDelay],
    targetEnvelope,
    actualEnvelope: actualEnvelope / bloom.radius,
    componentEnvelope: normalizedComponents,
    minimumSurfaceOwnership,
    maximumDormantVisibility,
    maximumAntherSourceGap,
    visible,
  };
}

function writeQaBloomDataset(metrics) {
  if (query.get("qa") !== "1" || !metrics) return;
  setStageData("qaBloomSelected", String(metrics.index));
  setStageData("qaBloomSelectedProgress", metrics.timeline.toFixed(4));
  setStageData("qaBloomSelectedTimeline", metrics.timeline.toFixed(4));
  setStageData("qaMorphCheckpoint", metrics.timeline.toFixed(4));
  setStageData("qaMorphActualEnvelope", metrics.actualEnvelope.toFixed(6));
  setStageData("qaMorphTargetEnvelope", metrics.targetEnvelope.toFixed(6));
  setStageData("qaMorphOwnership", metrics.minimumSurfaceOwnership.toFixed(6));
  setStageData("qaMorphDormantVisibility", metrics.maximumDormantVisibility.toFixed(6));
  setStageData("qaMorphAntherGap", metrics.maximumAntherSourceGap.toFixed(8));
  setStageData("qaMorphMetrics", JSON.stringify(metrics));
}

function setQaMorphIsolation(enabled) {
  if (!state.bouquet) return;
  const contextualObjects = new Set([
    "Branch_Primary_Axis_Segments",
    "Branch_Lateral_Axis_Segments",
    "Narrow_Lanceolate_Phyllodes",
  ]);
  state.bouquet.traverse((object) => {
    if (contextualObjects.has(object.name)) object.visible = !enabled;
  });
}

function setBloomCheckpointForQa(index, timeline, isolate = true) {
  const head = state.bloom?.heads[index];
  if (!head) return null;
  const checkpoint = THREE.MathUtils.clamp(Number(timeline), 0, 1);
  state.qaIsolatedBloomIndex = isolate ? index : -1;
  setQaMorphIsolation(isolate);
  state.selectedBloomIndex = index;
  head.ownValue = checkpoint;
  head.ownTimeline = checkpoint;
  head.scroll = 0;
  head.value = checkpoint;
  head.from = checkpoint;
  head.timeline = checkpoint;
  head.timelineFrom = checkpoint;
  head.target = checkpoint;
  head.startAt = 0;
  head.duration = 0;
  head.committedOpen = checkpoint >= 1;
  head.mode = checkpoint <= 0 ? "bud" : checkpoint >= 1 ? "open" : "checkpoint";
  state.bloom.activeCount = 0;
  state.bloom.openCount = state.bloom.heads.filter((item) => headOpen(item)).length;
  state.bloom.maxProgress = Math.max(...state.bloom.heads.map((item) => item.value));
  state.bloom.maxTimeline = Math.max(...state.bloom.heads.map((item) => item.timeline));
  state.selectionLight.intensity = 0;
  applyBloomEffects(state.bloom.heads.map((item) => item.index));
  const metrics = sampleBloomGeometryForQa(index);
  writeQaBloomDataset(metrics);
  invalidate();
  return metrics;
}

function applyQaMorphQuery() {
  if (query.get("qa") !== "1" || !query.has("qaTimeline")) return false;
  const heroIndex = findQaHeroBloomIndex();
  const requestedIndex = query.has("qaBloom") ? Number(query.get("qaBloom")) : Number.NaN;
  const index = Number.isInteger(requestedIndex) && state.bloom.heads[requestedIndex]
    ? requestedIndex
    : heroIndex;
  const isolateValue = query.get("qaIsolate");
  const isolate = isolateValue !== "0" && isolateValue !== "off";
  setBloomCheckpointForQa(index, Number(query.get("qaTimeline")), isolate);
  focusBloomForQa(index, query.get("qaView") || "face");
  return true;
}

function bouquetWithinFrustum() {
  const projectionView = new THREE.Matrix4().multiplyMatrices(
    state.camera.projectionMatrix,
    state.camera.matrixWorldInverse,
  );
  const frustum = new THREE.Frustum().setFromProjectionMatrix(projectionView);
  const { min, max } = state.data.bounds;
  const corners = [
    new THREE.Vector3(min.x, min.y, min.z),
    new THREE.Vector3(min.x, min.y, max.z),
    new THREE.Vector3(min.x, max.y, min.z),
    new THREE.Vector3(min.x, max.y, max.z),
    new THREE.Vector3(max.x, min.y, min.z),
    new THREE.Vector3(max.x, min.y, max.z),
    new THREE.Vector3(max.x, max.y, min.z),
    new THREE.Vector3(max.x, max.y, max.z),
  ];
  return corners.every((corner) => frustum.containsPoint(corner));
}

function disposeObject(object) {
  const geometries = new Set();
  const materials = new Set();
  object.traverse((child) => {
    if (child.geometry) geometries.add(child.geometry);
    if (Array.isArray(child.material)) {
      for (const material of child.material) materials.add(material);
    } else if (child.material) {
      materials.add(child.material);
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}

function appendColor(target, colorValue) {
  const color = new THREE.Color(colorValue);
  target.push(color.r, color.g, color.b);
}

function choose(values, random) {
  return values[Math.floor(random() * values.length) % values.length];
}

function mixColor(start, end, amount) {
  return new THREE.Color(start).lerp(new THREE.Color(end), amount).getHex();
}

function signed(random) {
  return random() * 2 - 1;
}

function fibonacciSphereDirection(index, count, phase, jitter, random) {
  const y = 1 - 2 * ((index + 0.5) / count);
  const ring = Math.sqrt(Math.max(0, 1 - y * y));
  const angle = index * GOLDEN_ANGLE + phase;
  const direction = new THREE.Vector3(Math.cos(angle) * ring, y, Math.sin(angle) * ring);
  if (jitter > 0) {
    const tangent = randomUnitVector(random);
    tangent.addScaledVector(direction, -tangent.dot(direction));
    if (tangent.lengthSq() > 0.0001) {
      direction.addScaledVector(tangent.normalize(), signed(random) * jitter).normalize();
    }
  }
  return direction;
}

function measureSphericalPacking(points, center, radius) {
  const normalized = [];
  const distances = [];
  const centroid = new THREE.Vector3();
  let nonFiniteSamples = 0;

  for (const point of points) {
    const offset = point.clone().sub(center);
    const distance = offset.length();
    if (!Number.isFinite(distance) || distance <= 0) {
      nonFiniteSamples += 1;
      continue;
    }
    distances.push(distance);
    normalized.push(offset.clone().multiplyScalar(1 / distance));
    centroid.add(offset);
  }

  if (distances.length === 0) {
    return {
      centroidOffsetRatio: Infinity,
      axisExtentRatio: Infinity,
      radialCv: Infinity,
      nearestNeighborSpread: Infinity,
      hemisphereBalanceViolations: 3,
      nonFiniteSamples,
    };
  }

  centroid.multiplyScalar(1 / distances.length);
  const meanDistance = distances.reduce((sum, value) => sum + value, 0) / distances.length;
  const radialVariance = distances.reduce(
    (sum, value) => sum + (value - meanDistance) ** 2,
    0,
  ) / distances.length;
  const axisExtents = [0, 1, 2].map((axis) => {
    let min = Infinity;
    let max = -Infinity;
    for (const direction of normalized) {
      const value = direction.getComponent(axis);
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    return max - min;
  });
  const nearest = normalized.map((direction, index) => {
    let nearestDistance = Infinity;
    for (let otherIndex = 0; otherIndex < normalized.length; otherIndex += 1) {
      if (index === otherIndex) continue;
      nearestDistance = Math.min(nearestDistance, direction.distanceTo(normalized[otherIndex]));
    }
    return nearestDistance;
  });
  const hemisphereBalanceViolations = [0, 1, 2].filter((axis) => {
    const positiveFraction = normalized.filter((direction) => direction.getComponent(axis) >= 0).length
      / normalized.length;
    return positiveFraction < 0.35 || positiveFraction > 0.65;
  }).length;

  return {
    centroidOffsetRatio: centroid.length() / Math.max(radius, 0.0001),
    axisExtentRatio: Math.max(...axisExtents) / Math.max(0.0001, Math.min(...axisExtents)),
    radialCv: Math.sqrt(radialVariance) / Math.max(meanDistance, 0.0001),
    nearestNeighborSpread: Math.max(...nearest) / Math.max(0.0001, Math.min(...nearest)),
    hemisphereBalanceViolations,
    nonFiniteSamples,
  };
}

function measureRosettePacking(samples, bloom) {
  const valid = [];
  let nonFiniteSamples = 0;

  for (const sample of samples) {
    const values = [
      ...sample.surfacePoint.toArray(),
      ...sample.terminal.toArray(),
      ...sample.normal.toArray(),
      sample.radialT,
      sample.layer,
      sample.motifScale,
      sample.heightScale,
      sample.side,
      sample.pairIndex,
    ];
    if (values.some((value) => !Number.isFinite(value))) {
      nonFiniteSamples += 1;
      continue;
    }
    const offset = sample.surfacePoint.clone().sub(bloom.position);
    const terminalOffset = sample.terminal.clone().sub(bloom.position);
    const u = offset.dot(bloom.basisU);
    const v = offset.dot(bloom.basisV);
    const axial = offset.dot(bloom.faceNormal);
    const side = sample.side ?? (axial >= 0 ? 1 : -1);
    valid.push({
      ...sample,
      side,
      u,
      v,
      axial,
      absoluteAxial: Math.abs(axial),
      terminalAxial: terminalOffset.dot(bloom.faceNormal),
      rho: Math.hypot(u, v),
      normalizedRho: Math.hypot(u, v) / Math.max(0.0001, bloom.rosetteRadius),
      petalReach: sample.motifScale * 0.82,
      angle: Math.atan2(v, u),
      /* A lens could be asked to face the viewer. A ball cannot — its
         equatorial florets point sideways, and that is what makes it round.
         The invariant that survives the change is stronger: every floret
         points away from the centre of its own head. */
      outwardDot: sample.normal.dot(offset.clone().normalize()),
    });
  }

  if (valid.length === 0) {
    return {
      model: "mirrored-golden-angle-spherical-rosette",
      planarCentroidOffsetRatio: Infinity,
      axialCentroidOffsetRatio: Infinity,
      surfaceDepthToDiameterRatio: Infinity,
      renderedEnvelopeDepthToDiameterRatio: Infinity,
      planCircularity: Infinity,
      renderedPlanCircularity: Infinity,
      sideBalanceRatio: 0,
      frontBackReachRatio: Infinity,
      mirrorPairErrorRatio: Infinity,
      centerToRimLiftRatio: -Infinity,
      radialBandCount: 0,
      angularSectorCount: 0,
      largestShellGapRatio: Infinity,
      nearestNeighborP90P10: Infinity,
      nearestNeighborCv: Infinity,
      outerEdgeRadiusCv: Infinity,
      renderedOuterEdgeRadiusCv: Infinity,
      radialReachRatio: 0,
      minOutwardDot: -1,
      layerCount: 0,
      domeInversions: 4,
      supportDepthToDiameter: Infinity,
      supportDiameterToHeadDiameter: Infinity,
      supportDiameterToRenderedHeadDiameter: Infinity,
      nonFiniteSamples,
    };
  }

  const faceRadius = Math.max(0.0001, bloom.rosetteRadius);
  const faceDiameter = faceRadius * 2;
  const uValues = valid.map((item) => item.u);
  const vValues = valid.map((item) => item.v);
  const axialValues = valid.map((item) => item.axial);
  const radialValues = valid.map((item) => item.rho);
  const uExtent = Math.max(...uValues) - Math.min(...uValues);
  const vExtent = Math.max(...vValues) - Math.min(...vValues);
  const centroidU = uValues.reduce((sum, value) => sum + value, 0) / valid.length;
  const centroidV = vValues.reduce((sum, value) => sum + value, 0) / valid.length;
  const centroidAxial = axialValues.reduce((sum, value) => sum + value, 0) / valid.length;
  const zones = [
    valid.filter((item) => item.normalizedRho <= 0.25),
    valid.filter((item) => item.normalizedRho > 0.25 && item.normalizedRho <= 0.5),
    valid.filter((item) => item.normalizedRho > 0.5 && item.normalizedRho <= 0.75),
    valid.filter((item) => item.normalizedRho > 0.75),
  ];
  const zoneMeans = zones.map((zone) => zone.length > 0
    ? zone.reduce((sum, item) => sum + item.absoluteAxial, 0) / zone.length
    : NaN);
  let domeInversions = 0;
  for (let index = 1; index < zoneMeans.length; index += 1) {
    if (Number.isFinite(zoneMeans[index - 1])
      && Number.isFinite(zoneMeans[index])
      && zoneMeans[index] > zoneMeans[index - 1] + faceDiameter * 0.035) {
      domeInversions += 1;
    }
  }

  const sectors = new Set(valid.map((item) => {
    const normalizedAngle = (item.angle + FULL_TURN) % FULL_TURN;
    return Math.floor(normalizedAngle / FULL_TURN * 12) % 12;
  }));
  /* Coverage has to be judged in the coordinate that is linear in area. On a
     disc that is radius; on a shell it is cos(theta) — the axial height. Judged
     by radius, the small polar cap of a perfectly even ball reads as a hole. */
  const sortedShell = valid
    .map((item) => item.absoluteAxial / faceRadius)
    .sort((a, b) => a - b);
  let largestShellGapRatio = sortedShell[0] ?? 0;
  for (let index = 1; index < sortedShell.length; index += 1) {
    largestShellGapRatio = Math.max(
      largestShellGapRatio,
      sortedShell[index] - sortedShell[index - 1],
    );
  }

  /* Measured on the shell, not in its shadow. Equal spacing on a sphere
     projects to crowding near the equator, so the old planar hypot would
     report a perfectly even ball as badly packed. */
  const nearest = valid.map((item, index) => {
    let nearestDistance = Infinity;
    for (let otherIndex = 0; otherIndex < valid.length; otherIndex += 1) {
      if (index === otherIndex) continue;
      const other = valid[otherIndex];
      if (item.side !== other.side) continue;
      nearestDistance = Math.min(
        nearestDistance,
        item.surfacePoint.distanceTo(other.surfacePoint),
      );
    }
    return nearestDistance / faceRadius;
  }).filter(Number.isFinite);
  const nearestMean = nearest.reduce((sum, value) => sum + value, 0) / nearest.length;
  const nearestVariance = nearest.reduce(
    (sum, value) => sum + (value - nearestMean) ** 2,
    0,
  ) / nearest.length;
  const outerSamples = valid.filter((item) => item.normalizedRho > 0.72);
  const outerRadii = outerSamples.map((item) => item.rho);
  const outerMean = outerRadii.reduce((sum, value) => sum + value, 0)
    / Math.max(1, outerRadii.length);
  const outerVariance = outerRadii.reduce(
    (sum, value) => sum + (value - outerMean) ** 2,
    0,
  ) / Math.max(1, outerRadii.length);
  const supportScale = bloom.coreScale3 ?? new THREE.Vector3(BLOOM_CORE_SCALE, BLOOM_CORE_SCALE, BLOOM_CORE_SCALE);
  const renderedOuterRadii = outerSamples.map((item) => item.rho + item.petalReach);
  const renderedOuterMean = renderedOuterRadii.reduce((sum, value) => sum + value, 0)
    / Math.max(1, renderedOuterRadii.length);
  const renderedOuterVariance = renderedOuterRadii.reduce(
    (sum, value) => sum + (value - renderedOuterMean) ** 2,
    0,
  ) / Math.max(1, renderedOuterRadii.length);
  const renderedRadii = valid.map((item) => item.rho + item.petalReach);
  const renderedFaceRadius = Math.max(0.0001, percentile(renderedRadii, 0.95));
  const renderedFaceDiameter = renderedFaceRadius * 2;
  const renderedUExtent = Math.max(...valid.map((item) => item.u + item.petalReach))
    - Math.min(...valid.map((item) => item.u - item.petalReach));
  const renderedVExtent = Math.max(...valid.map((item) => item.v + item.petalReach))
    - Math.min(...valid.map((item) => item.v - item.petalReach));
  const frontSamples = valid.filter((item) => item.side > 0);
  const rearSamples = valid.filter((item) => item.side < 0);
  const frontReach = Math.max(...frontSamples.map((item) => item.axial), 0.0001);
  const rearReach = Math.max(...rearSamples.map((item) => -item.axial), 0.0001);
  /* Extremes on both axes, deliberately. A ninety-fifth percentile is fine on
     a disc, where every direction holds a similar number of florets, but on a
     shell the polar cap holds very few — so a percentile clips the poles while
     the crowded equator sets the width, and reports a perfectly round head as
     oblate. Same error as measuring spacing in the projection. */
  const renderedFrontAxial = Math.max(...frontSamples.map(
    (item) => item.terminalAxial + item.motifScale * 0.08,
  ), 0.0001);
  const renderedRearAxial = Math.max(...rearSamples.map(
    (item) => -item.terminalAxial + item.motifScale * 0.08,
  ), 0.0001);
  const pairGroups = new Map();
  for (const item of valid) {
    if (!pairGroups.has(item.pairIndex)) pairGroups.set(item.pairIndex, []);
    pairGroups.get(item.pairIndex).push(item);
  }
  const mirrorErrors = [...pairGroups.values()].filter((pair) => pair.length === 2).map((pair) => {
    const front = pair.find((item) => item.side > 0);
    const rear = pair.find((item) => item.side < 0);
    if (!front || !rear) return Infinity;
    return Math.hypot(
      front.u - rear.u,
      front.v - rear.v,
      front.axial + rear.axial,
    ) / faceRadius;
  });
  const sideBalanceRatio = Math.min(frontSamples.length, rearSamples.length)
    / Math.max(1, Math.max(frontSamples.length, rearSamples.length));

  return {
    model: "mirrored-golden-angle-spherical-rosette",
    planarCentroidOffsetRatio: Math.hypot(centroidU, centroidV) / faceRadius,
    axialCentroidOffsetRatio: Math.abs(centroidAxial) / faceRadius,
    surfaceDepthToDiameterRatio: (
      percentile(axialValues, 0.95) - percentile(axialValues, 0.05)
    ) / faceDiameter,
    renderedEnvelopeDepthToDiameterRatio: (
      renderedFrontAxial + renderedRearAxial
    ) / Math.max(0.0001, (renderedUExtent + renderedVExtent) / 2),
    planCircularity: Math.max(uExtent, vExtent) / Math.max(0.0001, Math.min(uExtent, vExtent)),
    renderedPlanCircularity: Math.max(renderedUExtent, renderedVExtent)
      / Math.max(0.0001, Math.min(renderedUExtent, renderedVExtent)),
    sideBalanceRatio,
    frontBackReachRatio: Math.max(frontReach, rearReach) / Math.max(0.0001, Math.min(frontReach, rearReach)),
    mirrorPairErrorRatio: Math.max(...mirrorErrors, 0),
    centerToRimLiftRatio: (zoneMeans[0] - zoneMeans[3]) / faceDiameter,
    radialBandCount: zones.filter((zone) => zone.length > 0).length,
    angularSectorCount: sectors.size,
    largestShellGapRatio,
    nearestNeighborP90P10: percentile(nearest, 0.9) / Math.max(0.0001, percentile(nearest, 0.1)),
    nearestNeighborCv: Math.sqrt(nearestVariance) / Math.max(0.0001, nearestMean),
    outerEdgeRadiusCv: Math.sqrt(outerVariance) / Math.max(0.0001, outerMean),
    renderedOuterEdgeRadiusCv: Math.sqrt(renderedOuterVariance)
      / Math.max(0.0001, renderedOuterMean),
    radialReachRatio: percentile(radialValues, 0.95) / faceRadius,
    minOutwardDot: Math.min(...valid.map((item) => item.outwardDot)),
    layerCount: new Set(valid.map((item) => item.layer)).size,
    domeInversions,
    supportDepthToDiameter: supportScale.y / Math.max(0.0001, bloom.rosetteRadius / bloom.radius),
    supportDiameterToHeadDiameter: supportScale.x / Math.max(0.0001, bloom.rosetteRadius / bloom.radius),
    supportDiameterToRenderedHeadDiameter: supportScale.x * bloom.radius / renderedFaceRadius,
    nonFiniteSamples,
  };
}

function percentile(values, fraction) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = THREE.MathUtils.clamp((sorted.length - 1) * fraction, 0, sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return THREE.MathUtils.lerp(sorted[lower], sorted[upper], index - lower);
}

function computeSemanticMetrics(data) {
  const packedHeads = data.all.blooms.filter((bloom) => bloom.packing);
  const sampledHeads = packedHeads.filter((bloom) => bloom.archetype !== "bud");
  const openFloretCounts = data.all.blooms
    .filter((bloom) => bloom.archetype === "open")
    .map((bloom) => bloom.surfaceFloretCount);
  const packingSource = sampledHeads.length > 0 ? sampledHeads : packedHeads;
  const packingValues = (field) => packingSource.map((bloom) => bloom.packing[field]);
  const headPacking = {
    model: "mirrored-golden-angle-spherical-rosette",
    sampledHeads: sampledHeads.length,
    minFloretsPerOpenHead: openFloretCounts.length > 0 ? Math.min(...openFloretCounts) : 0,
    maxFloretsPerHead: Math.max(...packedHeads.map((bloom) => bloom.surfaceFloretCount)),
    worstPlanarCentroidOffsetRatio: Math.max(...packingValues("planarCentroidOffsetRatio")),
    worstAxialCentroidOffsetRatio: Math.max(...packingValues("axialCentroidOffsetRatio")),
    minSurfaceDepthToDiameterRatio: Math.min(...packingValues("surfaceDepthToDiameterRatio")),
    worstSurfaceDepthToDiameterRatio: Math.max(...packingValues("surfaceDepthToDiameterRatio")),
    minRenderedEnvelopeDepthToDiameterRatio: Math.min(
      ...packingValues("renderedEnvelopeDepthToDiameterRatio"),
    ),
    worstRenderedEnvelopeDepthToDiameterRatio: Math.max(
      ...packingValues("renderedEnvelopeDepthToDiameterRatio"),
    ),
    worstPlanCircularity: Math.max(...packingValues("planCircularity")),
    worstRenderedPlanCircularity: Math.max(...packingValues("renderedPlanCircularity")),
    worstSideBalanceRatio: Math.min(...packingValues("sideBalanceRatio")),
    worstFrontBackReachRatio: Math.max(...packingValues("frontBackReachRatio")),
    worstMirrorPairErrorRatio: Math.max(...packingValues("mirrorPairErrorRatio")),
    minCenterToRimLiftRatio: Math.min(...packingValues("centerToRimLiftRatio")),
    maxCenterToRimLiftRatio: Math.max(...packingValues("centerToRimLiftRatio")),
    minRadialReachRatio: Math.min(...packingValues("radialReachRatio")),
    worstLargestShellGapRatio: Math.max(...packingValues("largestShellGapRatio")),
    worstNearestNeighborP90P10: Math.max(...packingValues("nearestNeighborP90P10")),
    worstNearestNeighborCv: Math.max(...packingValues("nearestNeighborCv")),
    worstOuterEdgeRadiusCv: Math.max(...packingValues("outerEdgeRadiusCv")),
    minRenderedOuterEdgeRadiusCv: Math.min(...packingValues("renderedOuterEdgeRadiusCv")),
    worstRenderedOuterEdgeRadiusCv: Math.max(...packingValues("renderedOuterEdgeRadiusCv")),
    worstSupportDiameterToRenderedHeadDiameter: Math.max(
      ...packingValues("supportDiameterToRenderedHeadDiameter"),
    ),
    minOutwardDot: Math.min(...packingValues("minOutwardDot")),
    centroidViolations: packingSource.filter(
      (bloom) => bloom.packing.planarCentroidOffsetRatio > 0.045,
    ).length,
    axialBalanceViolations: packingSource.filter(
      (bloom) => bloom.packing.axialCentroidOffsetRatio > 0.025,
    ).length,
    /* These two bands are the whole difference between a lens and a ball, and
       they are the reason the heads read flat for as long as they did: 0.26 to
       0.5 is a band that only a disc can satisfy. A pom-pom is as deep as it
       is wide. */
    scaffoldDepthViolations: packingSource.filter((bloom) => (
      bloom.packing.surfaceDepthToDiameterRatio < 0.78
      || bloom.packing.surfaceDepthToDiameterRatio > 1.04
    )).length,
    renderedDepthViolations: packingSource.filter((bloom) => (
      bloom.packing.renderedEnvelopeDepthToDiameterRatio < 0.84
      || bloom.packing.renderedEnvelopeDepthToDiameterRatio > 1.12
    )).length,
    planCircularityViolations: packingSource.filter((bloom) => (
      bloom.packing.planCircularity > 1.22
      || bloom.packing.renderedPlanCircularity > 1.18
    )).length,
    sideBalanceViolations: packingSource.filter(
      (bloom) => bloom.packing.sideBalanceRatio < 0.98,
    ).length,
    frontBackReachViolations: packingSource.filter(
      (bloom) => bloom.packing.frontBackReachRatio > 1.04,
    ).length,
    mirrorSymmetryViolations: packingSource.filter(
      (bloom) => bloom.packing.mirrorPairErrorRatio > 0.025,
    ).length,
    centerLiftViolations: packingSource.filter((bloom) => (
      bloom.packing.centerToRimLiftRatio < 0.24
      || bloom.packing.centerToRimLiftRatio > 0.40
    )).length,
    radialReachViolations: packingSource.filter(
      (bloom) => bloom.packing.radialReachRatio < 0.88,
    ).length,
    shellGapViolations: packingSource.filter(
      (bloom) => bloom.packing.largestShellGapRatio > 0.14,
    ).length,
    nearestNeighborViolations: packingSource.filter((bloom) => (
      bloom.packing.nearestNeighborP90P10 > 1.75
      || bloom.packing.nearestNeighborCv > 0.32
    )).length,
    outwardFacingViolations: packingSource.filter(
      (bloom) => bloom.packing.minOutwardDot < 0.99,
    ).length,
    renderedBoundaryViolations: packingSource.filter((bloom) => (
      bloom.packing.renderedOuterEdgeRadiusCv < 0.04
      || bloom.packing.renderedOuterEdgeRadiusCv > 0.22
    )).length,
    radialBandViolations: packingSource.filter((bloom) => bloom.packing.radialBandCount < 4).length,
    angularSectorViolations: packingSource.filter(
      (bloom) => bloom.packing.angularSectorCount < (state.profile.id === "high" ? 10 : 9),
    ).length,
    layerCountViolations: packingSource.filter((bloom) => bloom.packing.layerCount < 3).length,
    domeProgressionViolations: packingSource.filter((bloom) => bloom.packing.domeInversions > 1).length,
    supportShapeViolations: packingSource.filter((bloom) => (
      bloom.packing.supportDepthToDiameter > 0.55
      || bloom.packing.supportDiameterToHeadDiameter > 0.74
      || bloom.packing.supportDiameterToRenderedHeadDiameter > 0.52
    )).length,
    nonFiniteSamples: packedHeads.reduce(
      (sum, bloom) => sum + bloom.packing.nonFiniteSamples,
      0,
    ),
  };
  headPacking.shapeViolations = [
    "centroidViolations",
    "axialBalanceViolations",
    "scaffoldDepthViolations",
    "renderedDepthViolations",
    "planCircularityViolations",
    "sideBalanceViolations",
    "frontBackReachViolations",
    "mirrorSymmetryViolations",
    "centerLiftViolations",
    "radialReachViolations",
    "shellGapViolations",
    "nearestNeighborViolations",
    "outwardFacingViolations",
    "renderedBoundaryViolations",
    "radialBandViolations",
    "angularSectorViolations",
    "layerCountViolations",
    "domeProgressionViolations",
    "supportShapeViolations",
    "nonFiniteSamples",
  ].reduce((sum, field) => sum + headPacking[field], 0);

  const outwardFacingViolations = data.all.florets.filter((floret) => {
    const outward = Y_AXIS.clone().applyQuaternion(floret.quaternion).normalize();
    return outward.dot(floret.normal) < 0.999;
  }).length;
  const nonFiniteTransforms = data.all.florets.filter((floret) => {
    const values = [
      ...floret.position.toArray(),
      ...floret.quaternion.toArray(),
      floret.scale,
      floret.heightScale,
    ];
    return values.some((value) => !Number.isFinite(value)) || floret.scale <= 0 || floret.heightScale <= 0;
  }).length;
  const antherParts = new Map();
  for (const tip of data.all.tips) {
    if (tip.role !== "floret-anther") continue;
    const key = `${tip.headIndex}:${tip.siteIndex}`;
    const parts = antherParts.get(key) ?? [];
    parts.push(tip.partIndex);
    antherParts.set(key, parts);
  }
  const antherPartViolations = data.all.florets.filter((floret) => {
    const parts = antherParts.get(`${floret.headIndex}:${floret.siteIndex}`) ?? [];
    return parts.length !== STAMEN_BUNDLES_PER_FLORET
      || new Set(parts).size !== STAMEN_BUNDLES_PER_FLORET
      || parts.some((part) => !Number.isInteger(part) || part < 0 || part >= STAMEN_BUNDLES_PER_FLORET);
  }).length;

  const undulations = data.all.leaves
    .map((leaf) => leaf.undulation)
    .sort((a, b) => a - b);
  const undulationMedian = undulations[Math.floor(undulations.length * 0.5)] || 0;

  return {
    florets: {
      motifs: data.all.florets.length,
      centers: data.all.florets.length,
      petalInstances: data.all.florets.length * FLORET_PARTS,
      petalsPerFloret: FLORET_PARTS,
      fivePartViolations: data.all.florets.filter((floret) => floret.petalCount !== FLORET_PARTS).length,
      renderedStamenBundlesPerFloret: STAMEN_BUNDLES_PER_FLORET,
      stamenModel: "representative bundles for numerous biological stamens",
      antherPartViolations,
      outwardFacingViolations,
      nonFiniteTransforms,
    },
    headPacking,
    phyllodes: {
      form: "long narrow lanceolate phyllodes",
      wingedLeaves: 0,
      lanceolateLeaves: data.all.leaves.filter((leaf) => leaf.form === "narrow-lanceolate-phyllode").length,
      continuousWithStem: data.all.leaves.filter((leaf) => leaf.continuousWithStem).length,
      twoSidedWings: 0,
      veinedLeaves: data.all.leaves.filter((leaf) => leaf.veinCount === PHYLLODE_VEIN_COUNT).length,
      veinsPerLeaf: PHYLLODE_VEIN_COUNT,
      veinSegments: data.all.leaves.length * PHYLLODE_VEIN_COUNT * PHYLLODE_VEIN_SEGMENTS,
      minUndulation: undulations[0] || 0,
      medianUndulation: undulationMedian,
      maxUndulation: undulations[undulations.length - 1] || 0,
      taperViolations: data.all.leaves.filter((leaf) => !leaf.tapersBothEnds).length,
    },
  };
}

function randomUnitVector(random) {
  const z = signed(random);
  const angle = random() * Math.PI * 2;
  const radius = Math.sqrt(Math.max(0, 1 - z * z));
  return new THREE.Vector3(Math.cos(angle) * radius, z, Math.sin(angle) * radius);
}

function mulberry32(seed) {
  let value = seed >>> 0;
  return function random() {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ result >>> 15, result | 1);
    result ^= result + Math.imul(result ^ result >>> 7, result | 61);
    return ((result ^ result >>> 14) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ API */

function bloomFallbackNormal(index) {
  return state.data?.all.blooms[index]?.faceNormal ?? Y_AXIS;
}

/* Heads open bottom-up, the way a wattle raceme does, blended with the
   L-system's own developmental order so neighbouring heads on one string do
   not fire at once. */
function assignWaveRanks() {
  const heads = state.bloom.heads;
  const blooms = state.data.all.blooms;
  const minY = state.bloom.minY;
  const spanY = Math.max(0.0001, state.bloom.maxY - minY);
  const births = blooms.map((bloom) => bloom.birth ?? 0.8);
  const minBirth = Math.min(...births);
  const spanBirth = Math.max(0.0001, Math.max(...births) - minBirth);
  const ranked = heads.map((head) => {
    const bloom = blooms[head.index];
    const y = (bloom.position.y - minY) / spanY;
    const birth = ((bloom.birth ?? 0.8) - minBirth) / spanBirth;
    return { head, rank: y * 0.62 + birth * 0.38 };
  }).sort((a, b) => a.rank - b.rank);
  const last = Math.max(1, ranked.length - 1);
  ranked.forEach(({ head }, order) => {
    head.waveStart = WAVE.start + WAVE.spread * (order / last);
  });
}

function setScrollBloom(progress) {
  if (!state.bloom) return;
  const t = THREE.MathUtils.clamp(progress, 0, 1);
  state.scrollBloom = t;
  const spatialAllowed = !reduceBloomMotion();
  for (const head of state.bloom.heads) {
    const local = spatialAllowed
      ? THREE.MathUtils.clamp((t - head.waveStart) / WAVE.span, 0, 1)
      : t >= head.waveStart ? 1 : 0;
    head.scroll = local;
  }
}

function densestRacemeCentroid(target = new THREE.Vector3()) {
  const blooms = state.data?.all.blooms ?? [];
  if (blooms.length === 0) return target.set(0, 0, 0);
  let best = null;
  let bestScore = -Infinity;
  for (const bloom of blooms) {
    let score = 0;
    for (const other of blooms) {
      const d = bloom.position.distanceTo(other.position);
      score += Math.exp(-d * d * 6);
    }
    if (score > bestScore) {
      bestScore = score;
      best = bloom;
    }
  }
  target.set(0, 0, 0);
  let count = 0;
  for (const other of blooms) {
    if (other.position.distanceTo(best.position) < 0.55) {
      target.add(other.position);
      count += 1;
    }
  }
  return target.divideScalar(Math.max(1, count));
}

function buildControlsShim() {
  return {
    target: new THREE.Vector3(0, -0.35, 0),
    minDistance: 0.1,
    maxDistance: 100,
    minPolarAngle: 0.58,
    maxPolarAngle: 2.38,
    enableDamping: true,
    update() {
      return false;
    },
    dispose() {},
  };
}

let activeEngine = null;
let activeKey = "";

/* One engine per document. React StrictMode double-invokes memo initialisers
   and effect cleanups in development; the botany functions above close over
   one module-level `state`, so the second creation must return the same
   engine rather than wipe the first one's scene out from under it. Hooks are
   rebound on every call so the newest React callbacks receive the reports. */
export function createWattleEngine(config, engineHooks) {
  const seedValue = Number.isFinite(config.seed) ? config.seed >>> 0 : DEFAULT_SEED;
  const key = `${config.profile?.id ?? "high"}:${seedValue}:${config.qa ? 1 : 0}:${config.poster ? 1 : 0}`;
  if (activeEngine && !activeEngine.disposed && activeKey === key) {
    hooks = engineHooks ?? {};
    if (config.camera) state.camera = config.camera;
    state.reduced = Boolean(config.reduced);
    state.finePointer = Boolean(config.finePointer);
    return activeEngine;
  }
  if (activeEngine && !activeEngine.disposed) activeEngine.dispose();
  hooks = engineHooks ?? {};
  state = freshState();
  Object.assign(options, {
    poster: Boolean(config.poster),
    query: config.query ?? {},
  });
  state.qa = Boolean(config.qa);
  state.reduced = Boolean(config.reduced);
  state.finePointer = Boolean(config.finePointer);
  state.qaMotionOff = state.qa || query.get("motion") === "off" || options.poster;
  state.profile = config.profile ?? HIGH_PROFILE;
  state.camera = config.camera ?? new THREE.PerspectiveCamera(DEFAULT_CAMERA_FOV, 1, 0.04, 40);
  state.controls = buildControlsShim();
  state.scene = new THREE.Group();
  state.scene.name = "WATL_Scene";

  state.lights = new THREE.Group();
  state.lights.name = "WATL_Lights";
  addLighting(state.lights);

  const seed = seedValue;
  state.data = generateBouquetData(state.profile, seed);
  state.bloom = createBloomController(state.data);
  assignWaveRanks();
  const initialGrowth = THREE.MathUtils.clamp(
    Number.isFinite(config.initialGrowth) ? config.initialGrowth : 0,
    0,
    1,
  );
  state.growth = createTreeGrowthController(initialGrowth);

  const built = buildBouquet(state.data);
  state.bouquet = built.root;
  state.swayGroups = built.swayGroups;
  state.coreMeshes = built.coreMeshes;
  state.pointsMaterial = built.pointsMaterial;
  state.fuzzMaterial = built.fuzzMaterial;
  state.pompomMassMaterial = built.pompomMassMaterial;
  state.petalMaterial = built.petalMaterial;
  state.growth.trunks = built.growthTrunks;
  state.growth.canopies = built.growthCanopies;
  state.growth.leaves = built.growthLeaves;
  state.growth.materials = built.growthMaterials;
  applyBloomEffects(state.bloom.heads.map((head) => head.index));
  applyTreeGrowth(state.growth.progress, true);
  const universe = buildUniverse(state.data.bounds, state.data.seed, state.profile);
  state.universe = universe.root;
  state.universeMaterial = universe.material;
  state.scene.add(state.lights, state.universe, state.bouquet);
  state.ready = true;
  state.rendererState = "ready";
  syncCultivation();

  const focusTarget = densestRacemeCentroid();

  const engine = {
    disposed: false,
    get state() {
      return state;
    },
    get scene() {
      return state.scene;
    },
    get bouquet() {
      return state.bouquet;
    },
    get universe() {
      return state.universe;
    },
    get universeMaterial() {
      return state.universeMaterial;
    },
    get selectionLight() {
      return state.selectionLight;
    },
    get data() {
      return state.data;
    },
    get bounds() {
      return state.data?.bounds;
    },
    get profile() {
      return state.profile;
    },
    seed,
    focusTarget,
    get headCount() {
      return state.bloom?.heads.length ?? 0;
    },

    attach({ camera, renderer }) {
      if (camera) state.camera = camera;
      if (renderer) state.renderer = renderer;
    },

    /* Called by the canvas on every size or pixel-ratio change. */
    resize(width, height, pixelRatio, viewport) {
      if (viewport) state.viewport = viewport;
      if (state.pointsMaterial) state.pointsMaterial.uniforms.uPixelRatio.value = pixelRatio;
      if (state.fuzzMaterial) state.fuzzMaterial.uniforms.uPixelRatio.value = pixelRatio;
      if (state.pompomMassMaterial) state.pompomMassMaterial.uniforms.uPixelRatio.value = pixelRatio;
      if (state.universeMaterial) state.universeMaterial.uniforms.uPixelRatio.value = pixelRatio;
      if (width > 0 && height > 0 && state.camera) {
        state.camera.aspect = width / height;
        state.camera.updateProjectionMatrix();
        fitView();
      }
      return state.defaultView;
    },

    fitView() {
      fitView();
      return state.defaultView;
    },

    get defaultView() {
      return state.defaultView;
    },

    setViewport(viewport) {
      state.viewport = viewport;
    },

    setGrowth(progress) {
      applyTreeGrowth(progress);
      return state.growth.complete;
    },

    completeGrowth(announce = false) {
      return completeTreeGrowth(announce);
    },

    setScrollBloom,

    /* Runs the interactive channels for one frame. `autonomous` gates the
       sway and the celestial drift; scroll and pointer work are applied
       regardless because they are direct responses to input. */
    update(now, deltaSeconds, { autonomous = true } = {}) {
      if (autonomous && !state.reduced && !state.qaMotionOff && !state.motionPaused) {
        state.motionTime += deltaSeconds;
        updateSway(state.motionTime);
        updateUniverse(state.motionTime);
      }
      updateHoverPicking(now);
      const bloomAnimating = updateBloomAnimation(now);
      state.renderedFrames += 1;
      return {
        animating: bloomAnimating || state.hoverPointer.pending,
        autonomous: autonomous && !state.reduced && !state.qaMotionOff && !state.motionPaused,
      };
    },

    setHoverPointer(clientX, clientY, viewport) {
      state.hoverPointer.x = clientX;
      state.hoverPointer.y = clientY;
      if (viewport) state.viewport = viewport;
      if (!state.finePointer || state.controlsActive || state.press) return false;
      if (state.qa && query.get("qaHover") === "off") return false;
      state.hoverPointer.pending = true;
      invalidate();
      return true;
    },

    clearHover() {
      state.hoverPointer.pending = false;
      clearBloomHover(performance.now());
    },

    setControlsActive(active) {
      state.controlsActive = active;
      if (active) {
        state.userMoved = true;
        clearBloomHover(performance.now());
      } else {
        state.hoverPointer.pending = false;
      }
    },

    setPress(press) {
      state.press = press;
      if (press) {
        state.pointerDragged = false;
        state.hoverPointer.pending = false;
        clearBloomHover(performance.now());
      }
    },

    markDragged() {
      state.pointerDragged = true;
      clearBloomHover(performance.now());
    },

    get pointerDragged() {
      return state.pointerDragged;
    },

    pickAt(clientX, clientY, viewport) {
      if (viewport) state.viewport = viewport;
      if (!pickBloomAt(clientX, clientY)) return -1;
      return bloomPicker.resultIndex;
    },

    /* Click. Returns true when a head began opening. */
    activateAt(clientX, clientY, viewport) {
      if (viewport) state.viewport = viewport;
      if (!state.growth?.complete) {
        setStatus("The shoot is still growing. Buds form when the branch reaches maturity.", 1700);
        return false;
      }
      if (state.qa) {
        setStageData("qaClickX", clientX.toFixed(2));
        setStageData("qaClickY", clientY.toFixed(2));
      }
      if (!pickBloomAt(clientX, clientY)) {
        state.selectedBloomIndex = -1;
        return false;
      }
      return activateBloomAtIndex(
        bloomPicker.resultIndex,
        bloomPicker.resultPosition,
        true,
        0,
        bloomPicker.resultNormal,
      );
    },

    activateHead(index, announce = false) {
      return activateBloomAtIndex(index, null, announce, 0, bloomFallbackNormal(index));
    },

    openAll(announce = true) {
      return triggerBouquetBloom(announce, false);
    },

    resetBloom() {
      resetBloomState();
    },

    setReduced(reduced) {
      state.reduced = Boolean(reduced);
      state.controls.enableDamping = !state.reduced;
      resetBloomState();
      if (state.reduced) {
        completeTreeGrowth(false);
        resetSwayPose();
        resetUniversePose();
      }
      invalidate();
    },

    setFinePointer(fine) {
      state.finePointer = Boolean(fine);
      if (!state.finePointer) {
        state.hoverPointer.pending = false;
        clearBloomHover(performance.now());
      }
      state.cultivationKey = "";
      syncCultivation();
    },

    setHidden(hidden) {
      state.hidden = Boolean(hidden);
    },

    setInViewport(inViewport) {
      state.inViewport = Boolean(inViewport);
    },

    setThreadsVisible(visible) {
      const threads = state.universe?.userData?.threads;
      if (!threads || threads.visible === visible) return;
      threads.visible = visible;
      invalidate();
    },

    setBreeze(strength) {
      state.breeze = strength;
    },

    /* Selective bloom by construction: only the flower layers are written
       above 1.0 in linear light, so a bloom pass thresholded at 1.0 lifts
       the pom-poms and nothing else. */
    setEmissiveGain(gain) {
      const value = Math.max(0, gain);
      for (const material of [state.pointsMaterial, state.fuzzMaterial, state.pompomMassMaterial]) {
        if (material?.uniforms?.uEmissiveGain) material.uniforms.uEmissiveGain.value = value;
      }
      const materials = state.growth?.materials;
      if (state.petalMaterial) {
        state.petalMaterial.emissive.setHex(0xffd400);
        state.petalMaterial.emissiveIntensity = 0.2 * value;
      }
      if (materials?.cupMaterial) {
        materials.cupMaterial.emissive.setHex(0xf2c400);
        materials.cupMaterial.emissiveIntensity = 0.12 * value;
      }
      invalidate();
    },

    resetSway() {
      resetSwayPose();
      resetUniversePose();
    },

    get growth() {
      return state.growth;
    },

    get bloom() {
      return state.bloom;
    },

    get cultivation() {
      return state.lastCultivation;
    },

    get heads() {
      return state.bloom.heads;
    },

    findHeadWorldPosition(index, target) {
      return findBloomWorldPosition(index, target) ? target : null;
    },

    qa: {
      applyQuery() {
        return applyQaMorphQuery();
      },
      heroBloomIndex() {
        return findQaHeroBloomIndex();
      },
      focusBloom(index, view = "face") {
        return focusBloomForQa(index ?? findQaHeroBloomIndex(), view);
      },
      focusLeaf(index) {
        return focusLeafForQa(index ?? findQaPhyllodeIndex());
      },
      projectBloomPoint(index, uRatio = 0, vRatio = 0, axialRatio = 0) {
        return projectBloomPointForQa(index, uRatio, vRatio, axialRatio);
      },
      activateBloom(index) {
        return activateBloomAtIndex(index ?? findQaHeroBloomIndex(), null, false);
      },
      activateBouquet() {
        return triggerBouquetBloom(false);
      },
      setBloomCheckpoint(index, timeline = 0, isolate = true) {
        return setBloomCheckpointForQa(index ?? findQaHeroBloomIndex(), timeline, isolate);
      },
      sampleBloomGeometry(index) {
        return sampleBloomGeometryForQa(index ?? findQaHeroBloomIndex());
      },
      releaseCamera() {
        state.qaCameraLock = false;
      },
      snapshot() {
        const offset = state.camera.position.clone().sub(state.controls.target);
        const spherical = new THREE.Spherical().setFromVector3(offset);
        return {
          state: state.rendererState,
          seed: state.data.seed,
          qualityTier: state.profile.id,
          universe: {
            starCount: state.universe?.userData?.starCount ?? 0,
            threadCount: state.universe?.userData?.threadCount ?? 0,
            time: state.universeMaterial?.uniforms.uTime.value ?? 0,
          },
          scene: {
            flowerHeads: state.data.all.blooms.length,
            racemeAxes: state.data.grammar?.racemeCount ?? 0,
            branchClusters: state.swayGroups.length,
            leaves: state.data.all.leaves.length,
            florets: state.data.metrics.florets,
            phyllodes: state.data.metrics.phyllodes,
            filamentInstances: state.data.all.filaments.length,
            pollenPoints: state.data.all.tips.length,
            bouquetWithinInitialFrustum: bouquetWithinFrustum(),
          },
          camera: {
            azimuth: spherical.theta,
            polar: spherical.phi,
            distance: spherical.radius,
            authoredAzimuth: state.defaultView?.azimuth ?? 0,
            authoredElevation: state.defaultView?.elevation ?? 0,
            authoredCompositionOffset: state.defaultView?.compositionOffset ?? 0,
          },
          motion: {
            reduced: state.reduced,
            bloomReduced: reduceBloomMotion(),
            breeze: state.breeze,
            treeGrowth: {
              progress: state.growth?.progress ?? 1,
              stage: state.stageData.treeStage ?? "shoot",
              mature: state.growth?.complete ?? true,
            },
            scrollBloom: state.scrollBloom,
          },
          lod: {
            profile: state.profile.id,
            dprCap: state.profile.dprCap,
            floretCount: state.data.all.florets.length,
            displayPoints: state.data.all.tips.length,
            gpuMorphedFuzzPoints: state.bloom.renderables.fuzz.reduce(
              (count, renderable) => count + renderable.count,
              0,
            ),
          },
          interaction: {
            selectedBloomIndex: state.selectedBloomIndex,
            hoveredBloomIndex: state.bloom.hoveredIndex,
            activeBloomCount: state.bloom.activeCount,
            openBloomCount: state.bloom.openCount,
            closedBloomCount: state.bloom.heads.length - state.bloom.openCount,
            maxBloomProgress: state.bloom.maxProgress,
            maxBloomTimeline: state.bloom.maxTimeline,
            finaleShown: state.finaleShown,
            userMoved: state.userMoved,
          },
          bloomUpload: { ...state.bloom.uploadStats },
        };
      },
    },

    dispose() {
      if (engine.disposed) return;
      engine.disposed = true;
      window.clearTimeout(state.statusTimer);
      if (state.bouquet) disposeObject(state.bouquet);
      if (state.universe) disposeObject(state.universe);
      if (activeEngine === engine) {
        activeEngine = null;
        activeKey = "";
        state = freshState();
        hooks = {};
      }
    },
  };

  activeEngine = engine;
  activeKey = key;
  return engine;
}
