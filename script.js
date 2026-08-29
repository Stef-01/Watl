import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const DEFAULT_SEED = 0x57a771e;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const FULL_TURN = Math.PI * 2;
const FLORET_PARTS = 5;
const PHYLLODE_VEIN_COUNT = 5;
const PHYLLODE_VEIN_SEGMENTS = 8;
const PHYLLODE_CURVATURE_RATIO = 0.08;
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const GATHER_POINT = new THREE.Vector3(0, -2.04, 0);
const BLOOM_CORE_SCALE = 0.36;
const BLOOM_DRAG_SLOP = 7;
const BLOOM_PREVIEW_STRENGTH = 0.18;
const BLOOM_CASCADE_STRENGTH = 0.65;
const BLOOM_RADIAL_SPREAD = 0.035;
const BLOOM_FLORET_SCALE = 0.02;
const BLOOM_POINT_SCALE = 0.24;
const BLOOM_OPEN_MS = 180;
const BLOOM_HOLD_MS = 80;
const BLOOM_SETTLE_MS = 360;
const BLOOM_HOVER_IN_MS = 140;
const BLOOM_HOVER_OUT_MS = 180;
const BLOOM_REDUCED_IN_MS = 100;
const BLOOM_REDUCED_OUT_MS = 180;
const BLOOM_CASCADE_SPAN_MS = 280;
const BLOOM_HOVER_RESUME_MS = 80;
const BLOOM_PICK_INTERVAL_MS = 1000 / 30;
const BLOOM_LIGHT_INTENSITY = 3.6;

/* Floret counts are unchanged from the flat version, and deliberately so: a
   real Acacia pycnantha head carries forty to eighty florets, so the original
   numbers were already botanically right, and raising them to cover the
   shell's larger area would have been botany bent around an implementation
   detail. The hexagonal spacing widens by root two instead, which fills the
   ball with the florets the species actually has — and costs nothing. */

/* How much of each hemisphere the mirrored pairs cover, measured in cos(theta)
   rather than in radius. One would be a closed hemisphere per side and would
   put both florets of the equatorial pair in the same place; this stops just
   short of the equator and leaves them a gap to occupy. */
const SHELL_COS_SPAN = 0.94;

const STEM_COLORS = [0x165c30, 0x276f36, 0x477d3b, 0x8b782b];
const YOUNG_STEM_COLORS = [0x8f5520, 0xa76624, 0xb9782e];
const LEAF_COLORS = [0x075f2b, 0x0b7b32, 0x15923a, 0x2ba84a];
const CORE_COLORS = [0xe99500, 0xf2a600, 0xf8b609, 0xffc318];
const CORE_SUPPORT_COLORS = [0xf2a600, 0xf7b309, 0xfbc018, 0xffc927];
const FILAMENT_COLORS = [0xf6a900, 0xffb900, 0xffc715, 0xffd525];
const PETAL_COLORS = [0xffad03, 0xffba08, 0xffc615, 0xffd127];
const TIP_COLORS = [0xffc20a, 0xffd311, 0xffdf25, 0xffe83c];
// Warmed toward bone and ochre, so the field reads as dust and distance over
// country rather than as stars over space.
const UNIVERSE_COLORS = [0xf2ebda, 0xd8c9b4, 0xe8d8bd, 0xf4c323];

const HIGH_PROFILE = Object.freeze({
  id: "high",
  branchCount: 11,
  mainSegments: 9,
  mainLeaves: 11,
  twigSegments: 4,
  heroFlorets: 88,
  openFlorets: 60,
  budFlorets: 21,
  innerFibersPerBloom: 34,
  exportInnerFibers: 8,
  interiorSpecks: 28,
  exportCenterSpecks: 4,
  dprCap: 1.65,
});

const LOW_PROFILE = Object.freeze({
  id: "low",
  branchCount: 8,
  mainSegments: 7,
  mainLeaves: 8,
  twigSegments: 3,
  heroFlorets: 60,
  openFlorets: 40,
  budFlorets: 13,
  innerFibersPerBloom: 18,
  exportInnerFibers: 4,
  interiorSpecks: 16,
  exportCenterSpecks: 3,
  dprCap: 1.25,
});

/* Read by the watchdog in index.html. If the imports above fail this line is
   never reached, which is exactly what the watchdog needs to know. */
window.__WATTLE_BOOTED__ = true;

const query = new URLSearchParams(window.location.search);
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const coarsePointer = window.matchMedia("(pointer: coarse)");
const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");

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
  localOrigin: new THREE.Vector3(),
  localEnd: new THREE.Vector3(),
  localDirection: new THREE.Vector3(),
  localHit: new THREE.Vector3(),
  worldHit: new THREE.Vector3(),
  localRay: new THREE.Ray(),
  unitSphere: new THREE.Sphere(new THREE.Vector3(), 1),
  resultPosition: new THREE.Vector3(),
  resultIndex: -1,
  resultRadius: 0,
};

/* The sway the bouquet is authored at. This was the drift slider's default
   position; with the slider gone it is just the number the artwork breathes
   at, and the only thing that still overrides it is prefers-reduced-motion. */
const AUTHORED_DRIFT = 0.42;

const posterMode = query.get("poster") === "1";

if (posterMode) {
  document.documentElement.classList.add("poster-mode");
}

const ui = Object.freeze({
  body: document.body,
  stage: document.querySelector("#wattle-stage"),
  canvas: document.querySelector("#wattle-canvas"),
  loader: document.querySelector("#scene-loading"),
  fallback: document.querySelector("#scene-fallback"),
  error: document.querySelector("#scene-error"),
  retry: document.querySelector("#retry-button"),
  status: document.querySelector("#stage-status"),
  instructions: document.querySelector("#scene-instructions"),
});

const state = {
  ready: false,
  rendererState: "loading",
  profile: null,
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
  petalMaterial: null,
  selectionLight: null,
  resizeObserver: null,
  intersectionObserver: null,
  reduced: reducedMotion.matches,
  qaMotionOff: query.get("qa") === "1" || query.get("motion") === "off" || query.get("poster") === "1",
  motionPaused: false,
  inViewport: true,
  userMoved: false,
  breeze: AUTHORED_DRIFT,
  motionTime: 0,
  raf: 0,
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
    lastPickAt: -Infinity,
    resumeAt: 0,
  },
  selectedBloomIndex: -1,
};

init().catch(showFailure);

async function init() {
  await nextFrame();

  if (query.get("qaFail") === "renderer" || query.get("qaRenderer") === "fallback") {
    throw new Error("The renderer was disabled by the QA query.");
  }

  const rect = ui.stage.getBoundingClientRect();
  state.profile = chooseProfile(rect.width);
  state.renderer = createRenderer(state.profile);
  state.scene = new THREE.Scene();
  state.camera = new THREE.PerspectiveCamera(36, 1, 0.08, 40);
  state.controls = createControls(state.camera, state.renderer.domElement);

  addLighting(state.scene);
  state.data = generateBouquetData(state.profile, readSeed());
  state.bloom = createBloomController(state.data);

  const built = buildBouquet(state.data);
  state.bouquet = built.root;
  state.swayGroups = built.swayGroups;
  state.coreMeshes = built.coreMeshes;
  state.pointsMaterial = built.pointsMaterial;
  state.petalMaterial = built.petalMaterial;
  const universe = buildUniverse(state.data.bounds, state.data.seed, state.profile);
  state.universe = universe.root;
  state.universeMaterial = universe.material;
  state.scene.add(state.universe, state.bouquet);

  setupEvents();
  resizeScene(true);
  resetSwayPose();
  state.renderer.render(state.scene, state.camera);
  state.renderedFrames += 1;

  const qaDelay = THREE.MathUtils.clamp(Number(query.get("qaDelay") || 0), 0, 3000);
  if (qaDelay) await delay(qaDelay);

  state.ready = true;
  state.rendererState = "ready";
  ui.stage.setAttribute("aria-busy", "false");
  ui.stage.dataset.state = "ready";
  ui.body.classList.add("is-ready");
  setStatus("The 3D bouquet is ready.");
  performance.mark("wattle-scene-ready");
  exposeQaSnapshot();
  invalidate();
}

function chooseProfile(width) {
  const requested = query.get("quality");
  if (requested === "high") return HIGH_PROFILE;
  if (requested === "low") return LOW_PROFILE;

  const memory = Number(navigator.deviceMemory || 8);
  const cores = Number(navigator.hardwareConcurrency || 8);
  const constrained = coarsePointer.matches || width < 680 || memory <= 4 || cores <= 4;
  return constrained ? LOW_PROFILE : HIGH_PROFILE;
}

function readSeed() {
  const value = query.get("seed");
  if (!value) return DEFAULT_SEED;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed >>> 0 : DEFAULT_SEED;
}

function reduceBloomMotion() {
  return state.reduced || query.get("motion") === "off" || posterMode;
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
    maxProgress: 0,
    dirtyHeads: [],
    renderables: {
      cores: [],
      florets: [],
      filaments: [],
      tips: [],
    },
    heads: data.all.blooms.map((bloom) => ({
      index: bloom.index,
      value: 0,
      appliedValue: 0,
      from: 0,
      target: 0,
      peak: 1,
      startAt: 0,
      duration: 0,
      mode: "idle",
      easing: "out",
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

function transitionBloomHead(head, target, now, duration, easing, mode) {
  head.from = head.value;
  head.target = target;
  head.startAt = now;
  head.duration = Math.max(1, duration);
  head.easing = easing;
  head.mode = mode;
}

function beginBloomActivation(head, now, peak, delay = 0) {
  const effectiveDelay = head.value > 0.001 ? 0 : delay;
  head.from = head.value;
  head.target = peak;
  head.peak = peak;
  head.startAt = now + effectiveDelay;
  head.duration = reduceBloomMotion() ? BLOOM_REDUCED_IN_MS : BLOOM_OPEN_MS;
  head.easing = "out";
  head.mode = effectiveDelay > 0 ? "scheduled" : "opening";
}

function transitionHoverHead(head, target, now) {
  if (["scheduled", "opening", "holding", "settling"].includes(head.mode)) return;
  const entering = target > head.value;
  head.peak = Math.max(target, BLOOM_PREVIEW_STRENGTH);
  transitionBloomHead(
    head,
    target,
    now,
    entering ? BLOOM_HOVER_IN_MS : BLOOM_HOVER_OUT_MS,
    "out",
    target > 0 ? "hovering-in" : "hovering-out",
  );
}

function updateBloomHead(head, now) {
  if (head.mode === "idle" || head.mode === "preview") return false;

  if (head.mode === "scheduled") {
    if (now < head.startAt) return true;
    head.mode = "opening";
  }

  if (head.mode === "holding") {
    if (now < head.startAt) return true;
    transitionBloomHead(
      head,
      0,
      now,
      reduceBloomMotion() ? BLOOM_REDUCED_OUT_MS : BLOOM_SETTLE_MS,
      reduceBloomMotion() ? "out" : "in-out",
      "settling",
    );
  }

  const progress = THREE.MathUtils.clamp((now - head.startAt) / head.duration, 0, 1);
  head.value = THREE.MathUtils.lerp(head.from, head.target, easeBloom(progress, head.easing));

  if (progress < 1) return true;

  head.value = head.target;
  if (head.mode === "opening") {
    if (reduceBloomMotion() || BLOOM_HOLD_MS === 0) {
      transitionBloomHead(
        head,
        0,
        now,
        reduceBloomMotion() ? BLOOM_REDUCED_OUT_MS : BLOOM_SETTLE_MS,
        reduceBloomMotion() ? "out" : "in-out",
        "settling",
      );
    } else {
      head.mode = "holding";
      head.startAt = now + BLOOM_HOLD_MS;
    }
    return true;
  }

  if (head.mode === "settling") {
    head.mode = "idle";
    if (state.bloom.hoveredIndex === head.index) {
      transitionHoverHead(head, BLOOM_PREVIEW_STRENGTH, now);
      return true;
    }
    return false;
  }

  if (head.mode === "hovering-in") {
    head.mode = "preview";
    return false;
  }

  head.mode = "idle";
  return false;
}

function itemBloomProgress(head, phase = 0) {
  if (head.mode === "preview" || head.mode.startsWith("hovering")) return head.value;
  const peak = Math.max(0.0001, head.peak);
  const normalized = THREE.MathUtils.clamp(head.value / peak, 0, 1);
  const delay = THREE.MathUtils.clamp(phase, 0, 1) * (80 / BLOOM_OPEN_MS);
  const local = THREE.MathUtils.clamp((normalized - delay) / Math.max(0.0001, 1 - delay), 0, 1);
  const staggered = local * local * (3 - 2 * local);
  return staggered * peak;
}

function updateBloomAnimation(now) {
  if (!state.bloom) return false;
  const dirty = state.bloom.dirtyHeads;
  dirty.length = 0;
  let activeCount = 0;
  let maxProgress = 0;

  for (const head of state.bloom.heads) {
    const was = head.value;
    const active = updateBloomHead(head, now);
    if (active) activeCount += 1;
    maxProgress = Math.max(maxProgress, head.value);
    if (Math.abs(was - head.value) > 0.00001) dirty.push(head.index);
  }

  if (dirty.length > 0) applyBloomEffects(dirty);

  state.bloom.activeCount = activeCount;
  state.bloom.maxProgress = maxProgress;
  state.bloom.cascadeActive = now < state.bloom.cascadeEndsAt;

  if (query.get("qa") === "1") {
    ui.stage.dataset.qaBloomActive = String(activeCount);
    ui.stage.dataset.qaBloomProgress = maxProgress.toFixed(4);
    ui.stage.dataset.qaBloomCascade = String(state.bloom.cascadeActive);
    ui.stage.dataset.qaBloomSelected = String(state.selectedBloomIndex);
  }

  if (state.selectedBloomIndex >= 0) {
    const selected = state.bloom.heads[state.selectedBloomIndex];
    state.selectionLight.intensity = selected
      ? selected.value * (reduceBloomMotion() ? 2.6 : BLOOM_LIGHT_INTENSITY)
      : 0;
  } else {
    state.selectionLight.intensity = 0;
  }

  return activeCount > 0;
}

function resetBloomState() {
  if (!state.bloom) return;
  state.bloom.hoveredIndex = -1;
  state.bloom.cascadeActive = false;
  state.bloom.cascadeEndsAt = 0;
  ui.stage.dataset.bloomHover = "false";
  const dirty = [];
  for (const head of state.bloom.heads) {
    head.value = 0;
    head.from = 0;
    head.target = 0;
    head.mode = "idle";
    dirty.push(head.index);
  }
  applyBloomEffects(dirty);
  state.bloom.activeCount = 0;
  state.bloom.maxProgress = 0;
  state.selectionLight.intensity = 0;
}

function createRenderer(profile) {
  const renderer = new THREE.WebGLRenderer({
    canvas: ui.canvas,
    antialias: profile.id === "high",
    alpha: true,
    powerPreference: "high-performance",
    /* Poster mode exists to export the still, and reading a canvas back is the
       one thing you cannot do once the drawing buffer has been composited away.
       It costs a little performance, so it is on for that one query string and
       off for every visitor. */
    preserveDrawingBuffer: posterMode,
  });

  /* Cleared to nothing rather than to a colour. The canvas used to paint an
     opaque near-black over the whole viewport, which meant any ground built in
     CSS was rendered and then hidden. Transparent, and the earth behind it is
     part of the picture. */
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  return renderer;
}

function createControls(camera, canvas) {
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = !state.reduced;
  controls.dampingFactor = 0.065;
  controls.enablePan = false;
  controls.minPolarAngle = 0.58;
  controls.maxPolarAngle = 2.38;
  controls.rotateSpeed = 0.58;
  controls.zoomSpeed = 0.72;
  controls.autoRotate = false;
  controls.target.set(0, -0.35, 0);
  return controls;
}

function addLighting(scene) {
  const hemisphere = new THREE.HemisphereLight(0xffefb8, 0x102a19, 1.18);
  scene.add(hemisphere);

  const key = new THREE.DirectionalLight(0xffe4a0, 2.45);
  key.position.set(-4.2, 6.5, 5.2);
  scene.add(key);

  const rim = new THREE.DirectionalLight(0xffad18, 1.28);
  rim.position.set(4.8, 2.6, -4.4);
  scene.add(rim);

  const fill = new THREE.DirectionalLight(0x83bd75, 0.72);
  fill.position.set(0, -2, 4);
  scene.add(fill);

  state.selectionLight = new THREE.PointLight(0xffd23f, 0, 2.2, 2);
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
  root.userData = { starCount: count, threadCount, innerRadius, outerRadius };
  root.add(threads, points);
  return { root, material };
}

function generateBouquetData(profile, seed) {
  const random = mulberry32(seed);
  const makeBucket = () => ({
    segments: [],
    leaves: [],
    blooms: [],
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

  const addSegment = (start, end, radius, color, cluster) => {
    push("segments", { start: start.clone(), end: end.clone(), radius, color }, cluster);
  };

  const addLeaf = (position, direction, length, width, roll, color, cluster) => {
    const quaternion = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, direction.clone().normalize());
    const handedness = random() < 0.5 ? -1 : 1;
    quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(
      Y_AXIS,
      roll + (handedness < 0 ? Math.PI : 0),
    ));
    push("leaves", {
      position: position.clone(),
      quaternion,
      length,
      width,
      color,
      falcate: true,
      veinCount: PHYLLODE_VEIN_COUNT,
      tapersBothEnds: true,
      curvatureRatio: PHYLLODE_CURVATURE_RATIO,
      curve: 0.86 + random() * 0.28,
      handedness,
    }, cluster);
  };

  const addBloom = (
    position,
    baseRadius,
    cluster,
    prominence = "primary",
    pedicelAxis = Y_AXIS,
  ) => {
    const bloomOrdinal = data.all.blooms.length;
    const archetypeRandom = mulberry32(
      (seed ^ Math.imul(bloomOrdinal + 1, 0x9e3779b9)) >>> 0,
    );
    const archetypeRoll = archetypeRandom();
    const budThreshold = prominence === "companion" ? 0.16 : 0.08;
    const heroThreshold = prominence === "terminal" ? 0.66 : prominence === "primary" ? 0.71 : 0.82;
    const archetype = archetypeRoll < budThreshold
      ? "bud"
      : archetypeRoll > heroThreshold
        ? "hero"
        : "open";
    const radiusScale = archetype === "bud"
      ? 0.58 + random() * 0.14
      : archetype === "hero"
        ? 1.34 + random() * 0.2
        : 0.9 + random() * 0.18;
    const radius = baseRadius * radiusScale;
    const maturity = archetype === "bud"
      ? 0.44 + random() * 0.12
      : archetype === "hero"
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
    const faceNormal = archetype === "bud"
      ? normalizedPedicel
      : normalizedPedicel.multiplyScalar(1 - presentationWeight)
        .addScaledVector(displayNormal, presentationWeight)
        .normalize();
    const faceQuaternion = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, faceNormal);
    faceQuaternion.multiply(new THREE.Quaternion().setFromAxisAngle(Y_AXIS, phase * 0.31));
    const basisU = X_AXIS.clone().applyQuaternion(faceQuaternion).normalize();
    const basisV = Z_AXIS.clone().applyQuaternion(faceQuaternion).normalize();
    const headForm = archetype === "bud" ? "globular-bud" : "spherical-rosette";
    const rosetteRadius = radius * (
      archetype === "bud" ? 0.59 : archetype === "hero" ? 0.9 : 0.87
    );
    // The receptacle used to be flattened to sit inside a lens. Inside a ball
    // it has to be a ball, or the flanks show a disc through the florets.
    const coreScale3 = archetype === "bud"
      ? new THREE.Vector3(0.48, 0.48, 0.48)
      : archetype === "hero"
        ? new THREE.Vector3(0.4, 0.37, 0.4)
        : new THREE.Vector3(0.42, 0.39, 0.42);
    const coreOffset = 0;
    const coreColor = archetype === "bud"
      ? choose(CORE_SUPPORT_COLORS, random)
      : choose(CORE_COLORS, random);
    const surfaceFloretCount = archetype === "hero"
      ? profile.heroFlorets
      : archetype === "bud"
        ? profile.budFlorets
        : profile.openFlorets;
    const rawInnerCount = Math.max(7, Math.round(profile.innerFibersPerBloom * (
      archetype === "hero" ? 1.7 : archetype === "bud" ? 0.55 : 1
    )));
    const innerCount = archetype === "bud" ? rawInnerCount : Math.ceil(rawInnerCount / 2) * 2;
    const rawCenterSpeckCount = Math.max(10, Math.round(profile.interiorSpecks * (
      archetype === "hero" ? 1.9 : archetype === "bud" ? 0.82 : 1.08
    )));
    const centerSpeckCount = archetype === "bud"
      ? rawCenterSpeckCount
      : Math.ceil(rawCenterSpeckCount / 2) * 2;
    const exportInnerCount = Math.min(innerCount, Math.max(3, Math.round(
      profile.exportInnerFibers * (archetype === "hero" ? 1 : archetype === "bud" ? 0.45 : 0.65),
    )));
    const exportCenterCount = Math.min(centerSpeckCount, Math.max(2, Math.round(
      profile.exportCenterSpecks * (archetype === "hero" ? 1 : 0.7),
    )));
    const bloom = {
      index: bloomOrdinal,
      position: position.clone(),
      radius,
      color: coreColor,
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
      layerCount: archetype === "bud" ? 2 : 3,
      surfaceFloretCount,
      packing: null,
    };
    push("blooms", bloom, cluster);

    const addCurvedFiber = (start, end, startColor, endColor, lineRadius, role, exportable) => {
      const axis = end.clone().sub(start).normalize();
      const bendDirection = randomUnitVector(random);
      bendDirection.addScaledVector(axis, -bendDirection.dot(axis));
      if (bendDirection.lengthSq() < 0.01) bendDirection.crossVectors(axis, Y_AXIS);
      if (bendDirection.lengthSq() < 0.01) bendDirection.crossVectors(axis, X_AXIS);
      bendDirection.normalize();
      const expressiveBend = role === "outer" && random() < 0.12 ? 0.035 + random() * 0.045 : 0;
      const bendAmount = role === "inner"
        ? radius * (0.075 + random() * 0.115)
        : start.distanceTo(end) * (0.08 + random() * 0.12 + expressiveBend);
      const bend = start.clone().lerp(end, 0.4 + random() * 0.2)
        .addScaledVector(bendDirection, bendAmount);
      const midColor = choose(FILAMENT_COLORS, random);

      push("filaments", {
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
        bloomPhase: THREE.MathUtils.clamp(
          end.distanceTo(position) / Math.max(radius, 0.0001),
          0,
          1,
        ),
      }, cluster);
    };

    const surfacePositions = [];
    const rosetteSamples = [];
    for (let index = 0; index < surfaceFloretCount; index += 1) {
      let normal;
      let heightScale;
      let motifScale;
      let floretAnchor;
      let terminal;
      let filamentStart;
      let layer = 0;
      let radialT = 0;

      if (archetype === "bud") {
        normal = fibonacciSphereDirection(
          index,
          surfaceFloretCount,
          phase,
          0,
          random,
        );
        const angularStep = Math.sqrt(4 * Math.PI / surfaceFloretCount);
        heightScale = 0.62;
        const shellRadius = rosetteRadius;
        const packingFill = 1.02;
        const petalReach = 0.82;
        const antherHeight = 0.66 * heightScale;
        motifScale = packingFill * shellRadius * angularStep
          / (2 * petalReach + packingFill * antherHeight * angularStep)
          * (0.97 + random() * 0.06);
        const antherTangentRadius = motifScale * 0.3;
        const anchorDistance = Math.sqrt(Math.max(
          0,
          shellRadius ** 2 - antherTangentRadius ** 2,
        )) - motifScale * antherHeight;
        floretAnchor = position.clone().addScaledVector(normal, anchorDistance);
        terminal = position.clone().addScaledVector(normal, anchorDistance + motifScale * antherHeight);
        surfacePositions.push(terminal.clone());
      } else {
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
        terminal = floretAnchor.clone().addScaledVector(normal, motifScale * 0.66 * heightScale);
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
      }

      const quaternion = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, normal);
      quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(
        Y_AXIS,
        Math.floor(index / (archetype === "bud" ? 1 : 2)) * GOLDEN_ANGLE * 0.5
          + (archetype === "bud" ? 0 : index % 2 * Math.PI / FLORET_PARTS)
          + signed(random) * 0.08,
      ));

      push("florets", {
        position: floretAnchor,
        quaternion,
        normal: normal.clone(),
        scale: motifScale,
        heightScale,
        color: choose(PETAL_COLORS, random),
        headIndex: bloomOrdinal,
        siteIndex: index,
        headForm,
        layer,
        radialT,
        bloomPhase: archetype === "bud"
          ? index / Math.max(1, surfaceFloretCount - 1)
          : radialT,
        petalCount: FLORET_PARTS,
        exportable: true,
      }, cluster);

      const floretMatrix = new THREE.Matrix4().compose(
        floretAnchor,
        quaternion,
        new THREE.Vector3(motifScale, motifScale * heightScale, motifScale),
      );
      for (let part = 0; part < FLORET_PARTS; part += 1) {
        const angle = part / FLORET_PARTS * FULL_TURN;
        const antherPosition = new THREE.Vector3(
          Math.cos(angle) * 0.3,
          0.66,
          Math.sin(angle) * 0.3,
        ).applyMatrix4(floretMatrix);
        push("tips", {
          position: antherPosition,
          size: motifScale * (0.28 + random() * 0.08),
          color: choose(TIP_COLORS, random),
          role: "floret-anther",
          headIndex: bloomOrdinal,
          siteIndex: index,
          partIndex: part,
          bloomPhase: archetype === "bud"
            ? index / Math.max(1, surfaceFloretCount - 1)
            : radialT,
          exportable: true,
        }, cluster);
      }

      if (archetype !== "bud") {
        const startColor = choose(FILAMENT_COLORS, random);
        const endColor = choose(TIP_COLORS, random);

        addCurvedFiber(
          filamentStart,
          terminal,
          startColor,
          endColor,
          radius * (0.013 + random() * 0.005),
          "outer",
          true,
        );
      }

    }
    bloom.packing = archetype === "bud"
      ? measureSphericalPacking(surfacePositions, position, radius)
      : measureRosettePacking(rosetteSamples, bloom);

    for (let index = 0; index < innerCount; index += 1) {
      let start;
      let end;
      if (archetype === "bud") {
        const startDirection = randomUnitVector(random);
        const direction = randomUnitVector(random);
        start = position.clone().addScaledVector(
          startDirection,
          radius * (0.03 + random() * 0.12),
        );
        end = position.clone().addScaledVector(
          direction,
          radius * (0.3 + random() * 0.18),
        );
      } else {
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
        start = position.clone()
          .addScaledVector(radialDirection, rosetteRadius * radialT * 0.12)
          .addScaledVector(faceNormal, side * radius * (0.035 + pairRandom() * 0.045));
        end = position.clone()
          .addScaledVector(radialDirection, rosetteRadius * radialT * (0.44 + pairRandom() * 0.17))
          .addScaledVector(faceNormal, side * radius * (
            0.17 + 0.18 * (1 - radialT * radialT) + pairRandom() * 0.09
          ));
      }
      const startColor = choose(CORE_COLORS, random);
      const endColor = choose(TIP_COLORS, random);
      addCurvedFiber(
        start,
        end,
        startColor,
        endColor,
        radius * (0.014 + random() * 0.007),
        "inner",
        index < exportInnerCount,
      );
      push("tips", {
        position: end.clone(),
        size: radius * (
          archetype === "bud" ? 0.1 + random() * 0.085 : 0.078 + random() * 0.072
        ),
        color: endColor,
        role: "center",
        headIndex: bloomOrdinal,
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
      let speckPosition;
      if (archetype === "bud") {
        const direction = fibonacciSphereDirection(
          index,
          centerSpeckCount,
          centerPhase,
          0.03,
          random,
        );
        const distance = radius * (0.31 + random() * 0.2);
        speckPosition = position.clone().addScaledVector(direction, distance);
      } else {
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
        speckPosition = position.clone()
          .addScaledVector(radialDirection, rosetteRadius * radialT)
          .addScaledVector(faceNormal, side * radius * (
            0.12 + 0.24 * (1 - radialT * radialT) + pairRandom() * 0.05
          ));
      }
      push("tips", {
        position: speckPosition,
        size: radius * (
          archetype === "bud"
            ? 0.12 + random() * 0.09
            : archetype === "hero"
              ? 0.1 + random() * 0.08
              : 0.085 + random() * 0.075
        ),
        color: choose(TIP_COLORS, random),
        role: "center",
        headIndex: bloomOrdinal,
        bloomPhase: THREE.MathUtils.clamp(
          speckPosition.distanceTo(position) / Math.max(radius, 0.0001),
          0,
          1,
        ),
        exportable: index < exportCenterCount,
      }, cluster);
    }
  };

  for (let branchIndex = 0; branchIndex < profile.branchCount; branchIndex += 1) {
    const fan = branchIndex / Math.max(1, profile.branchCount - 1) - 0.5;
    const cluster = fan < -0.12 ? 0 : fan > 0.12 ? 2 : 1;
    const base = GATHER_POINT.clone().add(new THREE.Vector3(
      fan * 0.12 + signed(random) * 0.045,
      signed(random) * 0.035,
      signed(random) * 0.085,
    ));
    const bottom = new THREE.Vector3(
      fan * 0.25 + signed(random) * 0.075,
      -3.03 + signed(random) * 0.09,
      signed(random) * 0.16,
    );
    const matureStemColor = choose(STEM_COLORS.slice(0, 3), random);
    const youngStemColor = choose(YOUNG_STEM_COLORS, random);

    addSegment(bottom, base, 0.045 + random() * 0.012, matureStemColor, cluster);

    const outside = Math.abs(fan) * 2;
    const end = new THREE.Vector3(
      fan * 4.25 + signed(random) * 0.18,
      1.63 + (1 - outside) * 0.72 + signed(random) * 0.14,
      signed(random) * 0.86,
    );
    const controlOne = base.clone().lerp(end, 0.32).add(new THREE.Vector3(
      -fan * 0.13,
      0.34 + random() * 0.18,
      signed(random) * 0.15,
    ));
    const controlTwo = base.clone().lerp(end, 0.68).add(new THREE.Vector3(
      fan * 0.15,
      0.2 + random() * 0.18,
      signed(random) * 0.2,
    ));
    const branchCurve = new THREE.CatmullRomCurve3([base, controlOne, controlTwo, end]);

    let previous = branchCurve.getPointAt(0);
    for (let segmentIndex = 1; segmentIndex <= profile.mainSegments; segmentIndex += 1) {
      const t = segmentIndex / profile.mainSegments;
      const next = branchCurve.getPointAt(t);
      const radius = THREE.MathUtils.lerp(0.045, 0.019, Math.pow(t, 0.82));
      addSegment(previous, next, radius, mixColor(matureStemColor, youngStemColor, t * 0.48), cluster);
      previous = next;
    }

    const branchPhase = random() * Math.PI * 2;
    for (let leafIndex = 0; leafIndex < profile.mainLeaves; leafIndex += 1) {
      const t = 0.12 + (leafIndex / Math.max(1, profile.mainLeaves - 1)) * 0.61 + signed(random) * 0.012;
      const position = branchCurve.getPointAt(t);
      const tangent = branchCurve.getTangentAt(t).normalize();
      const angle = branchPhase + leafIndex * 2.17;
      const direction = new THREE.Vector3(
        Math.cos(angle) * 0.78,
        0.13 + random() * 0.2,
        Math.sin(angle) * 0.78,
      ).addScaledVector(tangent, 0.33).normalize();

      addLeaf(
        position,
        direction,
        0.5 + random() * 0.26,
        0.86 + random() * 0.3,
        signed(random) * 0.38,
        choose(LEAF_COLORS, random),
        cluster,
      );
    }

    const twigCount = 3 + (profile.id === "high" && branchIndex % 3 === 1 ? 1 : 0);
    for (let twigIndex = 0; twigIndex < twigCount; twigIndex += 1) {
      const t = 0.37 + (twigIndex / Math.max(1, twigCount - 1)) * 0.46 + signed(random) * 0.018;
      const start = branchCurve.getPointAt(t);
      const tangent = branchCurve.getTangentAt(t).normalize();
      const sign = (branchIndex + twigIndex) % 2 === 0 ? -1 : 1;
      const lateral = new THREE.Vector3().crossVectors(tangent, Z_AXIS);
      if (lateral.lengthSq() < 0.01) lateral.crossVectors(tangent, X_AXIS);
      lateral.normalize().multiplyScalar(sign);
      const depth = new THREE.Vector3().crossVectors(tangent, lateral).normalize();
      const direction = tangent.clone().multiplyScalar(0.4)
        .addScaledVector(lateral, 0.74 + random() * 0.22)
        .addScaledVector(depth, signed(random) * 0.25)
        .addScaledVector(Y_AXIS, 0.16 + random() * 0.12)
        .normalize();
      const twigLength = 0.68 + random() * 0.42;
      const twigEnd = start.clone().addScaledVector(direction, twigLength);
      const middle = start.clone()
        .addScaledVector(tangent, twigLength * 0.24)
        .addScaledVector(direction, twigLength * 0.5)
        .addScaledVector(Y_AXIS, 0.05 + random() * 0.08);
      const twigCurve = new THREE.QuadraticBezierCurve3(start, middle, twigEnd);

      let twigPrevious = twigCurve.getPoint(0);
      for (let segmentIndex = 1; segmentIndex <= profile.twigSegments; segmentIndex += 1) {
        const segmentT = segmentIndex / profile.twigSegments;
        const next = twigCurve.getPoint(segmentT);
        addSegment(
          twigPrevious,
          next,
          THREE.MathUtils.lerp(0.021, 0.009, segmentT),
          mixColor(matureStemColor, youngStemColor, 0.5 + segmentT * 0.5),
          cluster,
        );
        twigPrevious = next;
      }

      for (let leafIndex = 0; leafIndex < 2; leafIndex += 1) {
        const leafT = 0.22 + leafIndex * 0.29;
        const position = twigCurve.getPoint(leafT);
        const twigTangent = twigCurve.getTangent(leafT).normalize();
        const leafDirection = lateral.clone().multiplyScalar(leafIndex === 0 ? -0.55 : 0.55)
          .addScaledVector(depth, signed(random) * 0.48)
          .addScaledVector(twigTangent, 0.52)
          .addScaledVector(Y_AXIS, 0.2)
          .normalize();
        addLeaf(
          position,
          leafDirection,
          0.36 + random() * 0.2,
          0.88 + random() * 0.28,
          signed(random) * 0.42,
          choose(LEAF_COLORS, random),
          cluster,
        );
      }

      const bloomBaseRadius = 0.187 + random() * 0.058;
      const bloomRadius = bloomBaseRadius * (random() < 0.18
        ? 1.1 + random() * 0.06
        : 0.95 + random() * 0.07);
      addBloom(
        twigEnd.clone().addScaledVector(direction, bloomRadius * 0.08),
        bloomRadius,
        cluster,
        "primary",
        direction,
      );

      const addCompanionBloom = profile.id === "high" || (branchIndex + twigIndex) % 2 === 0;
      if (addCompanionBloom) {
        const secondaryT = 0.64 + random() * 0.09;
        const secondaryAnchor = twigCurve.getPoint(secondaryT);
        const secondaryDirection = lateral.clone().multiplyScalar(-0.3)
          .addScaledVector(depth, (branchIndex + twigIndex) % 2 === 0 ? 0.58 : -0.58)
          .addScaledVector(tangent, 0.34)
          .addScaledVector(Y_AXIS, 0.4)
          .normalize();
        const secondaryLength = 0.25 + random() * 0.13;
        const secondaryRadius = bloomRadius * (0.72 + random() * 0.22);
        const secondaryPosition = secondaryAnchor.clone().addScaledVector(secondaryDirection, secondaryLength);
        const pedicelEnd = secondaryPosition.clone().addScaledVector(secondaryDirection, -secondaryRadius * 0.1);
        addSegment(
          secondaryAnchor,
          pedicelEnd,
          0.0075 + random() * 0.0025,
          youngStemColor,
          cluster,
        );
        addBloom(
          secondaryPosition,
          secondaryRadius,
          cluster,
          "companion",
          secondaryDirection,
        );
      }
    }

    const tipTangent = branchCurve.getTangentAt(1).normalize();
    addBloom(
      end.clone().addScaledVector(tipTangent, 0.035),
      0.205 + random() * 0.055,
      cluster,
      "terminal",
      tipTangent,
    );
  }

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
    const padding = new THREE.Vector3(leaf.length, leaf.length, leaf.length).multiplyScalar(1.24);
    box.expandByPoint(leaf.position.clone().sub(padding));
    box.expandByPoint(leaf.position.clone().add(padding));
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
  root.name = "Golden_Wattle_Bouquet";
  root.userData = {
    species: "Acacia pycnantha",
    seed: data.seed,
    description: "Procedural hand-tied golden wattle bouquet",
    headForm: "spherical rosettes with globular buds",
    floretMerosity: FLORET_PARTS,
    floretPacking: "mirrored golden-angle Fermat rosettes for mature heads; spherical Fibonacci for buds",
    phyllodeForm: "falcate with parallel-convergent longitudinal veins",
  };

  const stemGeometry = new THREE.CylinderGeometry(
    0.7,
    1,
    1,
    state.profile.id === "high" ? 8 : 6,
    1,
    true,
  );
  stemGeometry.name = "Stem_Segment_Geometry";
  const leafGeometry = createLeafGeometry();
  const floretGeometry = createFivePartFloretGeometry();
  const coreGeometry = createBloomSupportGeometry();

  const stemMaterial = new THREE.MeshStandardMaterial({
    color: 0xfffffe,
    roughness: 0.92,
    metalness: 0,
  });
  stemMaterial.name = "Stem_Material";
  const leafMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xfffffe,
    roughness: 0.66,
    metalness: 0,
    clearcoat: 0.08,
    clearcoatRoughness: 0.78,
    vertexColors: true,
    side: THREE.DoubleSide,
  });
  leafMaterial.name = "Phyllode_Material";
  const coreMaterial = new THREE.MeshStandardMaterial({
    color: 0xfffffe,
    roughness: 0.84,
    metalness: 0,
    emissive: 0x5d3500,
    emissiveIntensity: 0.08,
    flatShading: true,
  });
  coreMaterial.name = "Bloom_Core_Material";
  const petalMaterial = new THREE.MeshStandardMaterial({
    color: 0xfffffe,
    roughness: 0.72,
    metalness: 0,
    emissive: 0x633700,
    emissiveIntensity: 0.11,
    vertexColors: true,
    side: THREE.DoubleSide,
  });
  petalMaterial.name = "Five_Part_Floret_Material";
  const lineMaterial = new LineMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    linewidth: state.profile.id === "high" ? 2.08 : 1.78,
    worldUnits: false,
    alphaToCoverage: true,
  });
  lineMaterial.name = "Soft_Stamen_Material";
  const pointsMaterial = createPointsMaterial();
  const swayGroups = [];
  const coreMeshes = [];

  data.clusters.forEach((bucket, clusterIndex) => {
    const group = new THREE.Group();
    group.name = ["Left_Wattle_Cluster", "Center_Wattle_Cluster", "Right_Wattle_Cluster"][clusterIndex];
    group.position.copy(GATHER_POINT);
    group.userData.sway = {
      phase: 0.7 + clusterIndex * 1.93,
      frequency: 0.34 + clusterIndex * 0.035,
      amplitude: [0.011, 0.007, 0.013][clusterIndex],
    };

    const stems = createStemInstances(bucket.segments, stemGeometry, stemMaterial);
    const leaves = createLeafInstances(bucket.leaves, leafGeometry, leafMaterial);
    const cores = createCoreInstances(bucket.blooms, coreGeometry, coreMaterial);
    const florets = createFloretInstances(bucket.florets, floretGeometry, petalMaterial);
    const filaments = createFilamentLines(bucket.filaments, lineMaterial);
    const tips = createTipPoints(bucket.tips, pointsMaterial);

    group.add(stems, leaves, cores, florets, filaments, tips);
    root.add(group);
    swayGroups.push(group);
    coreMeshes.push(cores);
  });

  root.add(createTie());
  return { root, swayGroups, coreMeshes, pointsMaterial, petalMaterial };
}

function createLeafGeometry() {
  const stationCount = 9;
  const columnCount = 11;
  const positions = [];
  const colors = [];
  const uvs = [];
  const indices = [];

  for (let row = 0; row < stationCount; row += 1) {
    const y = row / (stationCount - 1);
    const widthEnvelope = Math.pow(Math.max(0, Math.sin(Math.PI * y)), 0.72);
    const halfWidth = Math.max(0.002, 0.13 * widthEnvelope * (0.88 + 0.12 * y));
    const centerCurve = 0.3 * (1 - Math.cos(Math.PI * y * 0.5));
    const lengthEnvelope = Math.sin(Math.PI * y);

    for (let column = 0; column < columnCount; column += 1) {
      const across = column / (columnCount - 1) * 2 - 1;
      const isVein = column % 2 === 1;
      const camber = (1 - across * across) * lengthEnvelope * 0.014;
      const veinRelief = isVein ? lengthEnvelope * 0.0065 : -lengthEnvelope * 0.0015;
      positions.push(across * halfWidth, y, centerCurve + camber + veinRelief);
      uvs.push((across + 1) * 0.5, y);
      const tone = isVein ? 1.04 : column === 0 || column === columnCount - 1 ? 0.72 : 0.82;
      colors.push(tone, tone, tone);
    }
  }

  for (let row = 0; row < stationCount - 1; row += 1) {
    for (let column = 0; column < columnCount - 1; column += 1) {
      const current = row * columnCount + column;
      const next = current + columnCount;
      indices.push(current, next, next + 1, current, next + 1, current + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.name = "Falcate_Five_Vein_Phyllode";
  return geometry;
}

function createFivePartFloretGeometry() {
  const positions = [];
  const colors = [];
  const indices = [];
  const appendVertex = (x, y, z, tone) => {
    positions.push(x, y, z);
    colors.push(tone, tone, tone);
    return positions.length / 3 - 1;
  };

  const center = appendVertex(0, 0.035, 0, 0.9);
  const roots = [];
  for (let part = 0; part < FLORET_PARTS; part += 1) {
    const angle = part / FLORET_PARTS * FULL_TURN;
    roots.push(appendVertex(Math.cos(angle) * 0.15, 0.015, Math.sin(angle) * 0.15, 0.92));
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
      cos * 0.52 + tangentX * 0.21,
      0.045,
      sin * 0.52 + tangentZ * 0.21,
      0.99,
    );
    const tipLeft = appendVertex(
      cos * 0.79 + tangentX * 0.115,
      0.085,
      sin * 0.79 + tangentZ * 0.115,
      1.08,
    );
    const tipRight = appendVertex(
      cos * 0.79 - tangentX * 0.115,
      0.085,
      sin * 0.79 - tangentZ * 0.115,
      1.08,
    );
    const shoulderRight = appendVertex(
      cos * 0.52 - tangentX * 0.21,
      0.045,
      sin * 0.52 - tangentZ * 0.21,
      0.99,
    );
    const petalCrown = appendVertex(cos * 0.56, 0.17, sin * 0.56, 1.04);
    indices.push(
      root, shoulderLeft, petalCrown,
      shoulderLeft, tipLeft, petalCrown,
      tipLeft, tipRight, petalCrown,
      tipRight, shoulderRight, petalCrown,
      shoulderRight, root, petalCrown,
    );

    const stamenLeft = appendVertex(
      cos * 0.3 + tangentX * 0.055,
      0.56,
      sin * 0.3 + tangentZ * 0.055,
      1.02,
    );
    const stamenRight = appendVertex(
      cos * 0.3 - tangentX * 0.055,
      0.56,
      sin * 0.3 - tangentZ * 0.055,
      1.02,
    );
    const anther = appendVertex(cos * 0.3, 0.66, sin * 0.3, 1.13);
    indices.push(root, stamenRight, stamenLeft, stamenLeft, stamenRight, anther);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.name = "Actinomorphic_Five_Part_Floret";
  return geometry;
}

function createBloomSupportGeometry() {
  const sphere = new THREE.SphereGeometry(1, 12, 8);
  const geometry = sphere.toNonIndexed();
  sphere.dispose();
  const positions = geometry.getAttribute("position");

  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const z = positions.getZ(index);
    const angle = Math.atan2(z, x);
    const radial = Math.hypot(x, z);
    const scallop = 1 + 0.075 * Math.sin(angle * 5 + 0.62) * Math.pow(radial, 1.4);
    const rearTaper = y < 0 ? THREE.MathUtils.lerp(0.84, 1, y + 1) : 1;
    positions.setXYZ(
      index,
      x * scallop * rearTaper,
      y < 0 ? y * 1.04 : y * 0.94,
      z * scallop * rearTaper,
    );
  }

  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.name = "Scalloped_Botanical_Receptacle";
  return geometry;
}

function createStemInstances(items, geometry, material) {
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
    mesh.setColorAt(index, new THREE.Color(item.color));
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

function createLeafInstances(items, geometry, material) {
  const mesh = new THREE.InstancedMesh(geometry, material, items.length);
  mesh.name = "Falcate_Veined_Phyllodes";
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

function createFloretInstances(items, geometry, material) {
  const mesh = new THREE.InstancedMesh(geometry, material, items.length);
  mesh.name = "Five_Part_Floret_Rosettes";
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  const matrix = new THREE.Matrix4();

  items.forEach((item, index) => {
    composeFloretMatrix(item, matrix, GATHER_POINT);
    mesh.setMatrixAt(index, matrix);
    mesh.setColorAt(index, new THREE.Color(item.color));
  });

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) {
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor.needsUpdate = true;
  }
  state.bloom.renderables.florets.push({
    mesh,
    items,
    ranges: buildHeadRanges(items),
    baseMatrices: mesh.instanceMatrix.array.slice(),
    baseColors: mesh.instanceColor?.array.slice() ?? null,
  });
  return mesh;
}

function createCoreInstances(items, geometry, material) {
  const mesh = new THREE.InstancedMesh(geometry, material, items.length);
  mesh.name = "Biconvex_Rosette_Supports_And_Bud_Cores";
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  const matrix = new THREE.Matrix4();

  items.forEach((item, index) => {
    composeBloomCoreMatrix(item, matrix, GATHER_POINT);
    mesh.setMatrixAt(index, matrix);
    mesh.setColorAt(index, new THREE.Color(item.color));
  });

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) {
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor.needsUpdate = true;
  }
  mesh.userData.hitRadii = items.map((item) => item.radius * 1.18);
  mesh.userData.bloomIndices = items.map((item) => item.index);
  mesh.userData.hitShapes = items.map((item) => ({
    radial: item.radius * 1.16,
    axial: item.radius * 1.16,
    centerOffset: -(item.coreOffset ?? 0),
  }));
  state.bloom.renderables.cores.push({
    mesh,
    items,
    ranges: buildHeadRanges(items),
    baseMatrices: mesh.instanceMatrix.array.slice(),
    baseColors: mesh.instanceColor?.array.slice() ?? null,
  });
  return mesh;
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
  geometry.computeBoundingSphere();
  geometry.name = "Curved_Stamen_Lines";
  const positionBuffer = geometry.attributes.instanceStart.data;
  const colorBuffer = geometry.attributes.instanceColorStart.data;
  positionBuffer.setUsage(THREE.DynamicDrawUsage);
  colorBuffer.setUsage(THREE.DynamicDrawUsage);
  const lines = new LineSegments2(geometry, material);
  lines.name = "Curved_Stamens";
  lines.frustumCulled = false;
  state.bloom.renderables.filaments.push({
    lines,
    items,
    ranges: buildHeadRanges(items),
    positionBuffer,
    colorBuffer,
    basePositions: positionBuffer.array.slice(),
    baseColors: colorBuffer.array.slice(),
  });
  return lines;
}

function createTipPoints(items, material) {
  const positions = [];
  const colors = [];
  const sizes = [];

  for (const item of items) {
    const position = item.position.clone().sub(GATHER_POINT);
    positions.push(position.x, position.y, position.z);
    appendColor(colors, item.color);
    sizes.push(item.size);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("aSize", new THREE.Float32BufferAttribute(sizes, 1));
  geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
  geometry.attributes.color.setUsage(THREE.DynamicDrawUsage);
  geometry.attributes.aSize.setUsage(THREE.DynamicDrawUsage);
  geometry.computeBoundingSphere();
  geometry.name = "Pollen_Tip_Points";
  const points = new THREE.Points(geometry, material);
  points.name = "Pollen_Tips";
  points.frustumCulled = false;
  state.bloom.renderables.tips.push({
    points,
    items,
    ranges: buildHeadRanges(items),
    basePositions: geometry.attributes.position.array.slice(),
    baseColors: geometry.attributes.color.array.slice(),
    baseSizes: geometry.attributes.aSize.array.slice(),
  });
  return points;
}

function createPointsMaterial() {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: 1 },
      uPointScale: { value: 1020 },
    },
    vertexShader: `
      attribute float aSize;
      attribute vec3 color;
      varying vec3 vColor;
      uniform float uPixelRatio;
      uniform float uPointScale;

      void main() {
        vColor = color;
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        float attenuation = uPointScale / max(0.4, -viewPosition.z);
        gl_PointSize = max(1.0, aSize * attenuation * uPixelRatio);
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;

      void main() {
        vec2 point = gl_PointCoord * 2.0 - 1.0;
        float radiusSquared = dot(point, point);
        if (radiusSquared > 1.0) discard;
        float edgeWidth = max(fwidth(radiusSquared) * 1.4, 0.012);
        float alpha = 1.0 - smoothstep(1.0 - edgeWidth, 1.0, radiusSquared);
        float sphereDepth = sqrt(max(0.0, 1.0 - radiusSquared));
        vec3 normal = normalize(vec3(point.x, -point.y, sphereDepth));
        vec3 lightDirection = normalize(vec3(-0.35, 0.45, 1.0));
        float diffuse = max(0.0, dot(normal, lightDirection));
        float highlight = pow(diffuse, 6.0);
        vec3 color = vColor * (0.86 + diffuse * 0.18 + highlight * 0.055);
        gl_FragColor = vec4(color, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthTest: true,
    depthWrite: false,
  });
  material.name = "Spherical_Pollen_Tip_Material";
  return material;
}

function applyBloomEffects(dirtyHeads) {
  if (!state.bloom || dirtyHeads.length === 0) return;
  const spatialAllowed = !reduceBloomMotion();
  const centers = state.bloom.centers;

  for (const renderable of state.bloom.renderables.florets) {
    const matrixAttribute = renderable.mesh.instanceMatrix;
    const matrices = matrixAttribute.array;
    const colorAttribute = renderable.mesh.instanceColor;
    const colors = colorAttribute?.array;
    matrixAttribute.clearUpdateRanges();
    colorAttribute?.clearUpdateRanges();
    let changed = false;

    for (const headIndex of dirtyHeads) {
      const range = renderable.ranges[headIndex];
      if (!range) continue;
      const head = state.bloom.heads[headIndex];
      const centerOffset = headIndex * 3;
      const centerX = centers[centerOffset];
      const centerY = centers[centerOffset + 1];
      const centerZ = centers[centerOffset + 2];

      for (let index = range.start; index < range.start + range.count; index += 1) {
        const effect = itemBloomProgress(head, renderable.items[index].bloomPhase);
        const spatial = spatialAllowed ? effect : 0;
        const scale = 1 + BLOOM_FLORET_SCALE * spatial;
        const matrixOffset = index * 16;
        const base = renderable.baseMatrices;

        matrices[matrixOffset] = base[matrixOffset] * scale;
        matrices[matrixOffset + 1] = base[matrixOffset + 1] * scale;
        matrices[matrixOffset + 2] = base[matrixOffset + 2] * scale;
        matrices[matrixOffset + 4] = base[matrixOffset + 4] * scale;
        matrices[matrixOffset + 5] = base[matrixOffset + 5] * scale;
        matrices[matrixOffset + 6] = base[matrixOffset + 6] * scale;
        matrices[matrixOffset + 8] = base[matrixOffset + 8] * scale;
        matrices[matrixOffset + 9] = base[matrixOffset + 9] * scale;
        matrices[matrixOffset + 10] = base[matrixOffset + 10] * scale;
        matrices[matrixOffset + 12] = base[matrixOffset + 12]
          + (base[matrixOffset + 12] - centerX) * BLOOM_RADIAL_SPREAD * spatial;
        matrices[matrixOffset + 13] = base[matrixOffset + 13]
          + (base[matrixOffset + 13] - centerY) * BLOOM_RADIAL_SPREAD * spatial;
        matrices[matrixOffset + 14] = base[matrixOffset + 14]
          + (base[matrixOffset + 14] - centerZ) * BLOOM_RADIAL_SPREAD * spatial;

        if (colors && renderable.baseColors) {
          const colorOffset = index * 3;
          const warmth = 1 + effect * 0.1;
          colors[colorOffset] = renderable.baseColors[colorOffset] * warmth;
          colors[colorOffset + 1] = renderable.baseColors[colorOffset + 1] * warmth;
          colors[colorOffset + 2] = renderable.baseColors[colorOffset + 2] * warmth;
        }
      }

      matrixAttribute.addUpdateRange(range.start * 16, range.count * 16);
      colorAttribute?.addUpdateRange(range.start * 3, range.count * 3);
      changed = true;
    }

    if (changed) {
      matrixAttribute.needsUpdate = true;
      if (colorAttribute) colorAttribute.needsUpdate = true;
    }
  }

  for (const renderable of state.bloom.renderables.cores) {
    const matrixAttribute = renderable.mesh.instanceMatrix;
    const matrices = matrixAttribute.array;
    const colorAttribute = renderable.mesh.instanceColor;
    const colors = colorAttribute?.array;
    matrixAttribute.clearUpdateRanges();
    colorAttribute?.clearUpdateRanges();
    let changed = false;

    for (const headIndex of dirtyHeads) {
      const range = renderable.ranges[headIndex];
      if (!range) continue;
      const head = state.bloom.heads[headIndex];

      for (let index = range.start; index < range.start + range.count; index += 1) {
        const effect = head.value;
        const spatial = spatialAllowed ? effect : 0;
        const scale = 1 + spatial * 0.006;
        const matrixOffset = index * 16;
        const base = renderable.baseMatrices;
        matrices[matrixOffset] = base[matrixOffset] * scale;
        matrices[matrixOffset + 1] = base[matrixOffset + 1] * scale;
        matrices[matrixOffset + 2] = base[matrixOffset + 2] * scale;
        matrices[matrixOffset + 4] = base[matrixOffset + 4] * scale;
        matrices[matrixOffset + 5] = base[matrixOffset + 5] * scale;
        matrices[matrixOffset + 6] = base[matrixOffset + 6] * scale;
        matrices[matrixOffset + 8] = base[matrixOffset + 8] * scale;
        matrices[matrixOffset + 9] = base[matrixOffset + 9] * scale;
        matrices[matrixOffset + 10] = base[matrixOffset + 10] * scale;

        if (colors && renderable.baseColors) {
          const colorOffset = index * 3;
          const warmth = 1 + effect * 0.08;
          colors[colorOffset] = renderable.baseColors[colorOffset] * warmth;
          colors[colorOffset + 1] = renderable.baseColors[colorOffset + 1] * warmth;
          colors[colorOffset + 2] = renderable.baseColors[colorOffset + 2] * warmth;
        }
      }

      matrixAttribute.addUpdateRange(range.start * 16, range.count * 16);
      colorAttribute?.addUpdateRange(range.start * 3, range.count * 3);
      changed = true;
    }

    if (changed) {
      matrixAttribute.needsUpdate = true;
      if (colorAttribute) colorAttribute.needsUpdate = true;
    }
  }

  for (const renderable of state.bloom.renderables.filaments) {
    const positions = renderable.positionBuffer.array;
    const colors = renderable.colorBuffer.array;
    renderable.positionBuffer.clearUpdateRanges();
    renderable.colorBuffer.clearUpdateRanges();
    let changed = false;

    for (const headIndex of dirtyHeads) {
      const range = renderable.ranges[headIndex];
      if (!range) continue;
      const head = state.bloom.heads[headIndex];
      const centerOffset = headIndex * 3;
      const centerX = centers[centerOffset];
      const centerY = centers[centerOffset + 1];
      const centerZ = centers[centerOffset + 2];

      for (let index = range.start; index < range.start + range.count; index += 1) {
        const effect = itemBloomProgress(head, renderable.items[index].bloomPhase);
        const spatial = spatialAllowed ? effect : 0;
        const expansion = 1 + BLOOM_RADIAL_SPREAD * spatial;
        const warmth = 1 + effect * 0.1;
        const itemOffset = index * 12;

        for (let vertexOffset = 0; vertexOffset < 12; vertexOffset += 3) {
          const offset = itemOffset + vertexOffset;
          positions[offset] = centerX + (renderable.basePositions[offset] - centerX) * expansion;
          positions[offset + 1] = centerY + (renderable.basePositions[offset + 1] - centerY) * expansion;
          positions[offset + 2] = centerZ + (renderable.basePositions[offset + 2] - centerZ) * expansion;
          colors[offset] = renderable.baseColors[offset] * warmth;
          colors[offset + 1] = renderable.baseColors[offset + 1] * warmth;
          colors[offset + 2] = renderable.baseColors[offset + 2] * warmth;
        }
      }

      renderable.positionBuffer.addUpdateRange(range.start * 12, range.count * 12);
      renderable.colorBuffer.addUpdateRange(range.start * 12, range.count * 12);
      changed = true;
    }

    if (changed) {
      renderable.positionBuffer.needsUpdate = true;
      renderable.colorBuffer.needsUpdate = true;
    }
  }

  for (const renderable of state.bloom.renderables.tips) {
    const positionAttribute = renderable.points.geometry.attributes.position;
    const colorAttribute = renderable.points.geometry.attributes.color;
    const sizeAttribute = renderable.points.geometry.attributes.aSize;
    const positions = positionAttribute.array;
    const colors = colorAttribute.array;
    const sizes = sizeAttribute.array;
    positionAttribute.clearUpdateRanges();
    colorAttribute.clearUpdateRanges();
    sizeAttribute.clearUpdateRanges();
    let changed = false;

    for (const headIndex of dirtyHeads) {
      const range = renderable.ranges[headIndex];
      if (!range) continue;
      const head = state.bloom.heads[headIndex];
      const centerOffset = headIndex * 3;
      const centerX = centers[centerOffset];
      const centerY = centers[centerOffset + 1];
      const centerZ = centers[centerOffset + 2];

      for (let index = range.start; index < range.start + range.count; index += 1) {
        const effect = itemBloomProgress(head, renderable.items[index].bloomPhase);
        const spatial = spatialAllowed ? effect : 0;
        const expansion = 1 + BLOOM_RADIAL_SPREAD * spatial;
        const warmth = 1 + effect * 0.1;
        const offset = index * 3;
        positions[offset] = centerX + (renderable.basePositions[offset] - centerX) * expansion;
        positions[offset + 1] = centerY + (renderable.basePositions[offset + 1] - centerY) * expansion;
        positions[offset + 2] = centerZ + (renderable.basePositions[offset + 2] - centerZ) * expansion;
        sizes[index] = renderable.baseSizes[index] * (1 + BLOOM_POINT_SCALE * spatial);
        colors[offset] = renderable.baseColors[offset] * warmth;
        colors[offset + 1] = renderable.baseColors[offset + 1] * warmth;
        colors[offset + 2] = renderable.baseColors[offset + 2] * warmth;
      }

      positionAttribute.addUpdateRange(range.start * 3, range.count * 3);
      colorAttribute.addUpdateRange(range.start * 3, range.count * 3);
      sizeAttribute.addUpdateRange(range.start, range.count);
      changed = true;
    }

    if (changed) {
      positionAttribute.needsUpdate = true;
      colorAttribute.needsUpdate = true;
      sizeAttribute.needsUpdate = true;
    }
  }
}

function createTie() {
  const group = new THREE.Group();
  group.name = "Hand_Tie";
  const material = new THREE.MeshStandardMaterial({
    color: 0xa77724,
    roughness: 0.92,
    metalness: 0,
  });
  material.name = "Natural_Twine_Material";

  for (let index = 0; index < 3; index += 1) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.017, 5, 28), material);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, GATHER_POINT.y - 0.08 + index * 0.038, 0);
    ring.name = `Twine_Ring_${index + 1}`;
    group.add(ring);
  }

  const knot = new THREE.Mesh(new THREE.IcosahedronGeometry(0.064, 1), material);
  knot.position.set(0.19, GATHER_POINT.y - 0.04, 0.035);
  knot.scale.set(1.25, 0.9, 0.9);
  knot.name = "Twine_Knot";
  group.add(knot);
  return group;
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
    scale3.multiplyScalar(item.radius),
  );
  return target;
}

function setupEvents() {
  state.controls.addEventListener("start", () => {
    state.userMoved = true;
    state.controlsActive = true;
    clearBloomHover(performance.now());
    invalidate();
  });
  state.controls.addEventListener("change", invalidate);
  state.controls.addEventListener("end", () => {
    state.controlsActive = false;
    state.hoverPointer.resumeAt = performance.now() + BLOOM_HOVER_RESUME_MS;
    state.hoverPointer.pending = finePointer.matches;
    invalidate();
  });

  ui.canvas.addEventListener("pointerdown", onPointerDown, { capture: true });
  ui.canvas.addEventListener("pointermove", onPointerMove);
  ui.canvas.addEventListener("pointerup", onPointerUp, { capture: true });
  ui.canvas.addEventListener("pointercancel", clearPress);
  ui.canvas.addEventListener("lostpointercapture", clearPress);
  ui.canvas.addEventListener("pointerleave", onCanvasPointerLeave);
  ui.canvas.addEventListener("click", onCanvasClick);

  ui.stage.addEventListener("keydown", onStageKeydown);
  ui.retry.addEventListener("click", () => window.location.reload());

  state.resizeObserver = new ResizeObserver(() => resizeScene(false));
  state.resizeObserver.observe(ui.stage);

  state.intersectionObserver = new IntersectionObserver((entries) => {
    state.inViewport = entries[0]?.isIntersecting ?? true;
    if (state.inViewport) {
      state.lastFrame = 0;
      invalidate();
    } else {
      stopLoop();
    }
  }, { threshold: 0.01 });
  state.intersectionObserver.observe(ui.stage);

  reducedMotion.addEventListener("change", onReducedMotionChange);
  finePointer.addEventListener("change", onFinePointerChange);
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("beforeunload", dispose, { once: true });

  ui.canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    state.rendererState = "error";
    stopLoop();
    setStatus("The 3D renderer paused.");
    ui.error.hidden = false;
  });
}

function resizeScene(forceFit) {
  if (!state.renderer || !state.camera) return;
  const { width, height } = ui.stage.getBoundingClientRect();
  if (width <= 0 || height <= 0) return;

  const pixelRatio = Math.min(window.devicePixelRatio || 1, state.profile.dprCap);
  state.renderer.setPixelRatio(pixelRatio);
  state.renderer.setSize(width, height, false);
  state.camera.aspect = width / height;
  state.camera.updateProjectionMatrix();
  if (state.pointsMaterial) state.pointsMaterial.uniforms.uPixelRatio.value = pixelRatio;
  if (state.universeMaterial) state.universeMaterial.uniforms.uPixelRatio.value = pixelRatio;

  if (forceFit || !state.userMoved) {
    fitView();
  } else {
    const distance = state.camera.position.distanceTo(state.controls.target);
    if (distance < state.controls.minDistance || distance > state.controls.maxDistance) {
      resetView(false);
    }
  }
  invalidate();
}

function fitView() {
  const size = state.data.bounds.getSize(new THREE.Vector3());
  const center = state.data.bounds.getCenter(new THREE.Vector3());
  const verticalFov = THREE.MathUtils.degToRad(state.camera.fov);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * state.camera.aspect);
  const verticalDistance = size.y * 0.5 / Math.tan(verticalFov / 2);
  const horizontalDistance = size.x * 0.5 / Math.tan(horizontalFov / 2);
  const portrait = state.camera.aspect < 0.82;
  const margin = portrait ? 1.1 : 1.12;
  const distance = (Math.max(verticalDistance, horizontalDistance) + size.z * 0.52) * margin;

  center.x -= state.camera.aspect > 1.25 ? 0.24 : 0;
  center.y -= portrait ? 0.05 : 0;
  state.camera.position.set(center.x, center.y + 0.035, center.z + distance);
  state.camera.near = Math.max(0.06, distance - size.z * 2.6 - size.y);
  const universeReach = state.universe?.userData?.outerRadius ?? 0;
  state.camera.far = Math.max(distance + size.y * 3.6, distance + universeReach * 1.08);
  state.camera.updateProjectionMatrix();
  state.controls.target.copy(center);
  state.controls.minDistance = distance * 0.58;
  state.controls.maxDistance = distance * 1.62;
  state.controls.update();

  state.defaultView = {
    position: state.camera.position.clone(),
    target: state.controls.target.clone(),
    near: state.camera.near,
    far: state.camera.far,
    minDistance: state.controls.minDistance,
    maxDistance: state.controls.maxDistance,
  };
}

function resetView(announce) {
  if (!state.defaultView) {
    fitView();
  } else {
    state.camera.position.copy(state.defaultView.position);
    state.controls.target.copy(state.defaultView.target);
    state.camera.near = state.defaultView.near;
    state.camera.far = state.defaultView.far;
    state.camera.updateProjectionMatrix();
    state.controls.minDistance = state.defaultView.minDistance;
    state.controls.maxDistance = state.defaultView.maxDistance;
    state.controls.update();
  }
  state.userMoved = false;
  if (announce) setStatus("View reset.", 1200);
  invalidate();
}

function invalidate() {
  if (!state.renderer || state.raf || document.hidden || !state.inViewport) return;
  state.raf = window.requestAnimationFrame(renderFrame);
}

function renderFrame(timestamp) {
  state.raf = 0;
  const delta = state.lastFrame ? Math.min(0.05, (timestamp - state.lastFrame) / 1000) : 0;
  state.lastFrame = timestamp;

  const autonomous = shouldAnimateAutonomously();
  if (autonomous) {
    state.motionTime += delta;
    updateSway(state.motionTime);
    updateUniverse(state.motionTime);
  }

  const controlsChanged = state.controls.update();
  updateHoverPicking(timestamp);
  const bloomAnimating = updateBloomAnimation(timestamp);
  state.renderer.render(state.scene, state.camera);
  state.renderedFrames += 1;
  if (delta > 0) {
    state.frameTimes.push(delta * 1000);
    if (state.frameTimes.length > 240) state.frameTimes.shift();
  }
  if (query.get("qa") === "1" && state.frameTimes.length >= 12 && state.renderedFrames % 20 === 0) {
    const sortedFrameTimes = [...state.frameTimes].sort((a, b) => a - b);
    const p95Index = Math.max(0, Math.ceil(sortedFrameTimes.length * 0.95) - 1);
    ui.stage.dataset.qaFrameP95 = sortedFrameTimes[p95Index].toFixed(2);
  }

  if (autonomous || bloomAnimating || state.hoverPointer.pending || controlsChanged) invalidate();
}

function shouldAnimateAutonomously() {
  return state.ready
    && !state.reduced
    && !state.qaMotionOff
    && !state.motionPaused
    && state.inViewport
    && !document.hidden;
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

function stopLoop() {
  if (state.raf) window.cancelAnimationFrame(state.raf);
  state.raf = 0;
  state.lastFrame = 0;
}

function onPointerDown(event) {
  ui.stage.focus({ preventScroll: true });
  state.pointerDragged = false;
  state.hoverPointer.pending = false;
  clearBloomHover(performance.now());
  state.press = {
    pointerId: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    moved: false,
    startedAt: performance.now(),
  };
}

function onPointerMove(event) {
  state.hoverPointer.x = event.clientX;
  state.hoverPointer.y = event.clientY;

  if (state.press && state.press.pointerId === event.pointerId) {
    const distance = Math.hypot(event.clientX - state.press.x, event.clientY - state.press.y);
    if (distance > BLOOM_DRAG_SLOP) {
      state.press.moved = true;
      state.pointerDragged = true;
      clearBloomHover(performance.now());
    }
    return;
  }

  if (!finePointer.matches || state.controlsActive) return;
  state.hoverPointer.pending = true;
  invalidate();
}

function onPointerUp(event) {
  if (!state.press || state.press.pointerId !== event.pointerId) return;
  clearPress();
}

function onCanvasClick(event) {
  if (state.pointerDragged) return;
  if (query.get("qa") === "1") {
    ui.stage.dataset.qaClickX = event.clientX.toFixed(2);
    ui.stage.dataset.qaClickY = event.clientY.toFixed(2);
  }
  if (!pickBloomAt(event.clientX, event.clientY)) {
    state.selectedBloomIndex = -1;
    return;
  }
  activateBloomAtIndex(bloomPicker.resultIndex, bloomPicker.resultPosition, true);
}

function clearPress() {
  state.press = null;
}

function onCanvasPointerLeave() {
  state.hoverPointer.pending = false;
  clearBloomHover(performance.now());
}

function onFinePointerChange() {
  if (!finePointer.matches) {
    state.hoverPointer.pending = false;
    clearBloomHover(performance.now());
  }
}

function clearBloomHover(now = performance.now()) {
  if (!state.bloom || state.bloom.hoveredIndex < 0) {
    ui.stage.dataset.bloomHover = "false";
    return;
  }
  const previous = state.bloom.heads[state.bloom.hoveredIndex];
  state.bloom.hoveredIndex = -1;
  ui.stage.dataset.bloomHover = "false";
  transitionHoverHead(previous, 0, now);
  invalidate();
}

function setBloomHover(index, now) {
  if (!state.bloom || state.bloom.hoveredIndex === index) return;
  const previousIndex = state.bloom.hoveredIndex;
  state.bloom.hoveredIndex = index;
  ui.stage.dataset.bloomHover = index >= 0 ? "true" : "false";

  if (previousIndex >= 0) {
    transitionHoverHead(state.bloom.heads[previousIndex], 0, now);
  }
  if (index >= 0) {
    transitionHoverHead(state.bloom.heads[index], BLOOM_PREVIEW_STRENGTH, now);
  }
  invalidate();
}

function updateHoverPicking(now) {
  if (!state.hoverPointer.pending || !finePointer.matches || state.controlsActive || state.press) return;
  if (now < state.hoverPointer.resumeAt) return;
  if (now - state.hoverPointer.lastPickAt < BLOOM_PICK_INTERVAL_MS) return;

  state.hoverPointer.pending = false;
  state.hoverPointer.lastPickAt = now;
  const found = pickBloomAt(state.hoverPointer.x, state.hoverPointer.y);
  setBloomHover(found ? bloomPicker.resultIndex : -1, now);
}

function pickBloomAt(clientX, clientY) {
  const rect = ui.canvas.getBoundingClientRect();
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
        bloomPicker.resultPosition.copy(bloomPicker.hitCenter);
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

function activateBloomAtIndex(index, worldPosition = null, announce = true) {
  const head = state.bloom?.heads[index];
  if (!head) return false;
  const now = performance.now();
  updateBloomAnimation(now);
  beginBloomActivation(head, now, 1);
  state.selectedBloomIndex = index;
  if (worldPosition) {
    state.selectionLight.position.copy(worldPosition);
  } else if (findBloomWorldPosition(index)) {
    state.selectionLight.position.copy(bloomPicker.resultPosition);
  }
  if (announce) setStatus("Flower bloomed.", 1300);
  invalidate();
  return true;
}

function triggerBouquetBloom(announce = true) {
  if (!state.bloom) return false;
  const now = performance.now();
  updateBloomAnimation(now);
  clearBloomHover(now);
  state.selectedBloomIndex = -1;
  const height = Math.max(0.0001, state.bloom.maxY - state.bloom.minY);
  const cascadeSpan = reduceBloomMotion() ? 0 : BLOOM_CASCADE_SPAN_MS;

  for (const bloom of state.data.all.blooms) {
    const normalizedY = (bloom.position.y - state.bloom.minY) / height;
    beginBloomActivation(
      state.bloom.heads[bloom.index],
      now,
      BLOOM_CASCADE_STRENGTH,
      normalizedY * cascadeSpan,
    );
  }

  const openDuration = reduceBloomMotion() ? BLOOM_REDUCED_IN_MS : BLOOM_OPEN_MS;
  const holdDuration = reduceBloomMotion() ? 0 : BLOOM_HOLD_MS;
  const settleDuration = reduceBloomMotion() ? BLOOM_REDUCED_OUT_MS : BLOOM_SETTLE_MS;
  state.bloom.cascadeEndsAt = now + cascadeSpan + openDuration + holdDuration + settleDuration;
  state.bloom.cascadeActive = true;
  if (announce) setStatus("Bouquet bloomed from stem to crown.", 1500);
  invalidate();
  return true;
}

function onStageKeydown(event) {
  if (!state.ready) return;
  const spherical = new THREE.Spherical().setFromVector3(
    state.camera.position.clone().sub(state.controls.target),
  );
  let changed = false;

  switch (event.key) {
    case "ArrowLeft":
      spherical.theta -= 0.11;
      changed = true;
      break;
    case "ArrowRight":
      spherical.theta += 0.11;
      changed = true;
      break;
    case "ArrowUp":
      spherical.phi -= 0.08;
      changed = true;
      break;
    case "ArrowDown":
      spherical.phi += 0.08;
      changed = true;
      break;
    case "+":
    case "=":
      spherical.radius *= 0.9;
      changed = true;
      break;
    case "-":
    case "_":
      spherical.radius *= 1.1;
      changed = true;
      break;
    case "Enter":
    case " ":
      event.preventDefault();
      triggerBouquetBloom();
      return;
    case "Home":
    case "0":
      event.preventDefault();
      resetView(true);
      return;
    default:
      return;
  }

  if (!changed) return;
  event.preventDefault();
  spherical.phi = THREE.MathUtils.clamp(
    spherical.phi,
    state.controls.minPolarAngle,
    state.controls.maxPolarAngle,
  );
  spherical.radius = THREE.MathUtils.clamp(
    spherical.radius,
    state.controls.minDistance,
    state.controls.maxDistance,
  );
  state.camera.position.copy(state.controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
  state.camera.lookAt(state.controls.target);
  state.controls.update();
  state.userMoved = true;
  invalidate();
}

function onReducedMotionChange() {
  state.reduced = reducedMotion.matches;
  state.controls.enableDamping = !state.reduced;
  if (state.reduced) {
    resetBloomState();
    resetSwayPose();
    resetUniversePose();
  }
  invalidate();
}

function onVisibilityChange() {
  if (document.hidden) {
    stopLoop();
  } else {
    state.lastFrame = 0;
    invalidate();
  }
}

function setStatus(message, resetAfter = 0) {
  window.clearTimeout(state.statusTimer);
  ui.status.textContent = message;
  if (resetAfter) {
    state.statusTimer = window.setTimeout(() => {
      ui.status.textContent = state.ready ? "The 3D bouquet is ready." : "Building the 3D bouquet.";
    }, resetAfter);
  }
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
  const rect = ui.canvas.getBoundingClientRect();
  return {
    x: rect.left + (projected.x + 1) * 0.5 * rect.width,
    y: rect.top + (1 - projected.y) * 0.5 * rect.height,
    ndc: [projected.x, projected.y, projected.z],
  };
}

function exposeQaSnapshot() {
  const heroBloomIndex = findQaHeroBloomIndex();
  const phyllodeIndex = findQaPhyllodeIndex();
  const heroBloomPoint = projectBloomPointForQa(heroBloomIndex);
  if (heroBloomPoint) {
    ui.stage.dataset.qaHeroBloomIndex = String(heroBloomIndex);
    ui.stage.dataset.qaHeroBloomX = heroBloomPoint.x.toFixed(2);
    ui.stage.dataset.qaHeroBloomY = heroBloomPoint.y.toFixed(2);
  }
  window.__WATTLE_QA__ = Object.freeze({
    targets: Object.freeze({ heroBloomIndex, phyllodeIndex }),
    focusBloom(index = heroBloomIndex, view = "face") {
      return focusBloomForQa(index, view);
    },
    focusLeaf(index = phyllodeIndex) {
      return focusLeafForQa(index);
    },
    projectBloomPoint(index, uRatio = 0, vRatio = 0, axialRatio = 0) {
      return projectBloomPointForQa(index, uRatio, vRatio, axialRatio);
    },
    activateBloom(index = heroBloomIndex) {
      return activateBloomAtIndex(index, null, false);
    },
    activateBouquet() {
      return triggerBouquetBloom(false);
    },
    resetView() {
      resetView(false);
    },
    snapshot() {
      const offset = state.camera.position.clone().sub(state.controls.target);
      const spherical = new THREE.Spherical().setFromVector3(offset);
      const sortedTimes = [...state.frameTimes].sort((a, b) => a - b);
      const p95Index = Math.max(0, Math.ceil(sortedTimes.length * 0.95) - 1);
      return {
        state: state.rendererState,
        renderer: "webgl2",
        seed: state.data.seed,
        qualityTier: state.profile.id,
        universe: {
          spatial: true,
          starCount: state.universe?.userData?.starCount ?? 0,
          threadCount: state.universe?.userData?.threadCount ?? 0,
          innerRadius: state.universe?.userData?.innerRadius ?? 0,
          outerRadius: state.universe?.userData?.outerRadius ?? 0,
          drifting: shouldAnimateAutonomously(),
          rotation: state.universe?.rotation.toArray() ?? [0, 0, 0, "XYZ"],
          time: state.universeMaterial?.uniforms.uTime.value ?? 0,
        },
        scene: {
          flowerHeads: state.data.all.blooms.length,
          branchClusters: state.swayGroups.length,
          leaves: state.data.all.leaves.length,
          florets: state.data.metrics.florets,
          rosettePacking: state.data.metrics.headPacking,
          headPacking: state.data.metrics.headPacking,
          phyllodes: state.data.metrics.phyllodes,
          filamentInstances: state.data.all.filaments.length,
          curveSegments: state.data.all.filaments.length * 2,
          outerStamens: state.data.all.filaments.filter((item) => item.role === "outer").length,
          innerFibers: state.data.all.filaments.filter((item) => item.role === "inner").length,
          pollenPoints: state.data.all.tips.length,
          exportableTips: state.data.all.tips.filter((item) => item.exportable !== false).length,
          bloomArchetypes: {
            buds: state.data.all.blooms.filter((item) => item.archetype === "bud").length,
            open: state.data.all.blooms.filter((item) => item.archetype === "open").length,
            heroes: state.data.all.blooms.filter((item) => item.archetype === "hero").length,
          },
          headForms: {
            symmetricBiconvexRosettes: state.data.all.blooms.filter((item) => item.archetype !== "bud").length,
            globularBuds: state.data.all.blooms.filter((item) => item.archetype === "bud").length,
          },
          bouquetWithinInitialFrustum: bouquetWithinFrustum(),
        },
        camera: {
          azimuth: spherical.theta,
          polar: spherical.phi,
          distance: spherical.radius,
          minDistance: state.controls.minDistance,
          maxDistance: state.controls.maxDistance,
        },
        motion: {
          reduced: state.reduced,
          bloomReduced: reduceBloomMotion(),
          paused: state.motionPaused,
          breeze: state.breeze,
          autonomous: shouldAnimateAutonomously(),
        },
        lod: {
          profile: state.profile.id,
          dprCap: state.profile.dprCap,
          actualPixelRatio: state.renderer.getPixelRatio(),
          floretCount: state.data.all.florets.length,
          floretPetalCount: state.data.metrics.florets.petalInstances,
          veinSegmentCount: state.data.metrics.phyllodes.veinSegments,
          curveSegmentCount: state.data.all.filaments.length * 2,
          displayPoints: state.data.all.tips.length,
        },
        interaction: {
          selectedBloomIndex: state.selectedBloomIndex,
          selectedBloomPhase: state.selectedBloomIndex >= 0
            ? state.bloom.heads[state.selectedBloomIndex]?.mode ?? "idle"
            : "idle",
          selectedBloomProgress: state.selectedBloomIndex >= 0
            ? state.bloom.heads[state.selectedBloomIndex]?.value ?? 0
            : 0,
          hoveredBloomIndex: state.bloom.hoveredIndex,
          activeBloomCount: state.bloom.activeCount,
          maxBloomProgress: state.bloom.maxProgress,
          cascadeActive: state.bloom.cascadeActive,
          pulseActive: state.bloom.activeCount > 0,
          pulsePeak: state.bloom.maxProgress,
          userMoved: state.userMoved,
        },
        rendererInfo: {
          drawCalls: state.renderer.info.render.calls,
          triangles: state.renderer.info.render.triangles,
          lines: state.renderer.info.render.lines,
          points: state.renderer.info.render.points,
          geometries: state.renderer.info.memory.geometries,
          textures: state.renderer.info.memory.textures,
          outputColorSpace: state.renderer.outputColorSpace,
          toneMapping: "NeutralToneMapping",
          exposure: state.renderer.toneMappingExposure,
        },
        frameMetrics: {
          renderedFrames: state.renderedFrames,
          p95FrameMs: sortedTimes[p95Index] || 0,
        },
      };
    },
  });
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

function showFailure(error) {
  console.error("Wattle 3D initialization failed", error);
  state.rendererState = "error";
  state.ready = false;
  stopLoop();
  ui.body.classList.add("has-error", "is-ready");
  ui.stage.setAttribute("aria-busy", "false");
  ui.stage.dataset.state = "error";
  ui.fallback.hidden = false;
  ui.error.hidden = false;
  /* This lives in the markup only as a status target; guard it so the failure
     path can never itself fail on a missing node. */
  if (ui.instructions) {
    ui.instructions.textContent = "A still view of the complete golden wattle bouquet.";
  }
  setStatus("The interactive 3D bouquet could not open. A still bouquet is shown.");
  window.__WATTLE_QA__ = Object.freeze({
    snapshot: () => ({ state: "error", renderer: "fallback" }),
  });
}

function dispose() {
  stopLoop();
  reducedMotion.removeEventListener("change", onReducedMotionChange);
  finePointer.removeEventListener("change", onFinePointerChange);
  state.resizeObserver?.disconnect();
  state.intersectionObserver?.disconnect();
  state.controls?.dispose();
  if (state.bouquet) disposeObject(state.bouquet);
  if (state.universe) disposeObject(state.universe);
  state.renderer?.dispose();
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
    return parts.length !== FLORET_PARTS
      || new Set(parts).size !== FLORET_PARTS
      || parts.some((part) => !Number.isInteger(part) || part < 0 || part >= FLORET_PARTS);
  }).length;

  const curvatures = data.all.leaves
    .map((leaf) => leaf.curvatureRatio * leaf.curve)
    .sort((a, b) => a - b);
  const curvatureMedian = curvatures[Math.floor(curvatures.length * 0.5)] || 0;

  return {
    florets: {
      motifs: data.all.florets.length,
      centers: data.all.florets.length,
      petalInstances: data.all.florets.length * FLORET_PARTS,
      petalsPerFloret: FLORET_PARTS,
      fivePartViolations: data.all.florets.filter((floret) => floret.petalCount !== FLORET_PARTS).length,
      anthersPerFloret: FLORET_PARTS,
      antherPartViolations,
      outwardFacingViolations,
      nonFiniteTransforms,
    },
    headPacking,
    phyllodes: {
      falcateLeaves: data.all.leaves.filter((leaf) => leaf.falcate).length,
      veinedLeaves: data.all.leaves.filter((leaf) => leaf.veinCount === PHYLLODE_VEIN_COUNT).length,
      veinsPerLeaf: PHYLLODE_VEIN_COUNT,
      veinSegments: data.all.leaves.length * PHYLLODE_VEIN_COUNT * PHYLLODE_VEIN_SEGMENTS,
      minCurvatureRatio: curvatures[0] || 0,
      medianCurvatureRatio: curvatureMedian,
      maxCurvatureRatio: curvatures[curvatures.length - 1] || 0,
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

function nextFrame() {
  return new Promise((resolve) => window.requestAnimationFrame(resolve));
}

function delay(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}
