/**
 * The field.
 *
 * Most of the reference's surface area is not the figure — it is the wall of
 * out-of-focus gold it stands in. Get that wrong and no amount of care on the
 * entity rescues the image, so the field is built with the same seriousness:
 *
 *   ground   a warm wash with a pool of light at the figure's feet
 *   far      soft blooms behind everything, dissolving into the wash
 *   near     enormous blooms *in front* of the entity, which is the single
 *            detail that makes the depth read — a poster crops them, we can
 *            actually put them between the camera and the body
 *   pollen   fine gold motes rising
 *   sprigs   flowering stems along the bottom edge
 *   burst    the petals thrown outward when the entity is touched
 *
 * The one non-obvious decision: the blooms carry a *tint* from white through
 * gold to deep amber, not just white at varying alpha. The reference's field
 * has genuine shadows in it. A field of highlights alone reads as fog.
 */
import {
  Mesh, Points, Group,
  PlaneGeometry, InstancedBufferGeometry, InstancedBufferAttribute,
  BufferGeometry, BufferAttribute,
  ShaderMaterial, Color, AdditiveBlending, Vector2, Vector3,
} from "three";

/* ------------------------------------------------------------------ */

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/* ================================================================== *
 * Ground
 * ================================================================== */

const GROUND_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.9999, 1.0);
  }
`;

const GROUND_FRAG = /* glsl */ `
  precision highp float;

  varying vec2 vUv;
  uniform float uTime;
  uniform vec2  uAspect;
  uniform vec3  uHigh;
  uniform vec3  uMid;
  uniform vec3  uLow;
  uniform vec3  uGlow;
  uniform vec2  uPool;
  uniform float uPoolAmount;
  uniform float uVignette;
  uniform float uGrain;
  uniform float uDrift;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float bloom(vec2 uv, vec2 at, float r) {
    return smoothstep(r, 0.0, length((uv - at) * uAspect));
  }

  void main() {
    vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
    float t = uTime * uDrift;

    // Base wash. The light in the reference sits *behind the figure's head*,
    // not above the frame — so brightness is a bell peaked in the upper third
    // and the top edge falls away again. Getting this backwards is what made
    // the first pass read as an overexposed sky.
    float v = uv.y;
    float lift = exp(-pow((v - 0.44) / 0.27, 2.0));
    vec3 col = mix(uMid, uHigh, lift);
    col = mix(col, uLow, smoothstep(0.58, 1.02, v));

    // Three slow washes so the ground is never a flat ramp.
    col = mix(col, uHigh, bloom(uv, vec2(0.24 + sin(t * 0.09) * 0.04, 0.30), 0.62) * 0.34);
    col = mix(col, uLow,  bloom(uv, vec2(0.86 + cos(t * 0.07) * 0.05, 0.16), 0.50) * 0.26);
    col = mix(col, uMid,  bloom(uv, vec2(0.58 + sin(t * 0.05) * 0.06, 0.92), 0.70) * 0.30);

    // The pool the figure stands in.
    col = mix(col, uGlow, bloom(uv, uPool, 0.44) * uPoolAmount);

    // Vignette, measured from a point above centre so the top corners fall
    // away faster than the bottom — it frames the head.
    float d = length((uv - vec2(0.5, 0.42)) * vec2(1.05, 0.92));
    col *= 1.0 - smoothstep(0.34, 0.98, d) * uVignette;

    // Grain last. Wide warm gradients band badly on 8-bit panels.
    col += (hash(gl_FragCoord.xy + fract(uTime) * 91.0) - 0.5) * uGrain;

    gl_FragColor = vec4(col, 1.0);
  }
`;

const GROUND = {
  light: { high: "#FFF4B8", mid: "#F3D269", low: "#C4941F", glow: "#FFFBE4", vignette: 0.24 },
  dark:  { high: "#453750", mid: "#291F3C", low: "#12101F", glow: "#5E4A1C", vignette: 0.40 },
};

function buildGround({ theme }) {
  const p = GROUND[theme === "dark" ? "dark" : "light"];
  const uniforms = {
    uTime:       { value: 0 },
    uAspect:     { value: new Vector2(1, 1) },
    uHigh:       { value: new Color(p.high) },
    uMid:        { value: new Color(p.mid) },
    uLow:        { value: new Color(p.low) },
    uGlow:       { value: new Color(p.glow) },
    uPool:       { value: new Vector2(0.33, 0.86) },
    uPoolAmount: { value: theme === "dark" ? 0.18 : 0.34 },
    uVignette:   { value: p.vignette },
    uGrain:      { value: 0.024 },
    uDrift:      { value: 1 },
  };
  const mesh = new Mesh(
    new PlaneGeometry(2, 2),
    new ShaderMaterial({
      vertexShader: GROUND_VERT,
      fragmentShader: GROUND_FRAG,
      uniforms,
      depthTest: false,
      depthWrite: false,
    })
  );
  mesh.frustumCulled = false;
  mesh.renderOrder = -100;
  return { mesh, uniforms };
}

/* ================================================================== *
 * Blooms — instanced, billboarded, tinted
 * ================================================================== */

const BLOOM_VERT = /* glsl */ `
  attribute vec3  aOffset;
  attribute float aSize;
  attribute float aAlpha;
  attribute float aTint;
  attribute float aPhase;
  attribute float aSpin;

  uniform float uTime;
  uniform float uSway;
  uniform float uGrowth;
  uniform float uParallax;

  varying vec2  vUv;
  varying float vAlpha;
  varying float vTint;
  varying float vPhase;

  void main() {
    vUv = uv;
    vAlpha = aAlpha;
    vTint = aTint;
    vPhase = aPhase;

    // Drift in view space, scaled by the bloom's own size: a big near bloom
    // has to move further to read as moving at all.
    vec4 mv = modelViewMatrix * vec4(aOffset, 1.0);
    mv.x += sin(uTime * 0.058 + aPhase * 6.28) * aSize * 0.05 * uSway;
    mv.y += cos(uTime * 0.047 + aPhase * 4.11) * aSize * 0.04 * uSway;

    // Billboard: the quad is built in view space, so it always faces camera
    // regardless of where the parallax has swung the lens.
    float s = aSize * uGrowth;
    float c = cos(aSpin + uTime * 0.02);
    float n = sin(aSpin + uTime * 0.02);
    vec2 q = vec2(position.x * c - position.y * n, position.x * n + position.y * c);
    mv.xy += q * s;

    gl_Position = projectionMatrix * mv;
  }
`;

const BLOOM_FRAG = /* glsl */ `
  precision highp float;

  uniform sampler2D uMap;
  uniform vec3  uWhite;
  uniform vec3  uGold;
  uniform vec3  uAmber;
  uniform float uOpacity;
  uniform float uHeat;
  uniform float uTime;

  varying vec2  vUv;
  varying float vAlpha;
  varying float vTint;
  varying float vPhase;

  void main() {
    float m = texture2D(uMap, vUv).a;
    if (m < 0.004) discard;

    // Three-stop ramp: highlight → gold → shadow. The shadows are what give
    // the field depth; a field of highlights alone is fog.
    vec3 col = vTint < 0.5
      ? mix(uWhite, uGold,  vTint * 2.0)
      : mix(uGold,  uAmber, (vTint - 0.5) * 2.0);

    // Each bloom breathes on its own phase, so the field never pulses as one.
    float breathe = 0.90 + 0.10 * sin(uTime * 0.5 + vPhase * 12.0);

    col += uWhite * uHeat * 0.30 * m;

    gl_FragColor = vec4(col, m * vAlpha * uOpacity * breathe);
  }
`;

/**
 * @param {object} o
 * @param {number} o.count
 * @param {[number,number]} o.z      depth range
 * @param {[number,number]} o.size   world-unit radius range
 * @param {[number,number]} o.alpha
 */
function buildBlooms({
  map, theme, count, z, size, alpha, spread = [7, 5], seed = 1,
  tintBias = 0.35, sway = 1, opacity = 1,
}) {
  const rand = rng(seed);

  const base = new PlaneGeometry(2, 2);
  const geo = new InstancedBufferGeometry();
  geo.index = base.index;
  geo.attributes.position = base.attributes.position;
  geo.attributes.uv = base.attributes.uv;
  geo.instanceCount = count;

  const off = new Float32Array(count * 3);
  const sz = new Float32Array(count);
  const al = new Float32Array(count);
  const ti = new Float32Array(count);
  const ph = new Float32Array(count);
  const sp = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    off[i * 3]     = (rand() * 2 - 1) * spread[0];
    off[i * 3 + 1] = (rand() * 2 - 1) * spread[1];
    off[i * 3 + 2] = z[0] + rand() * (z[1] - z[0]);
    // Skew toward the small end: a few giants, many middlings.
    const k = Math.pow(rand(), 2.6);
    sz[i] = size[0] + k * (size[1] - size[0]);
    al[i] = alpha[0] + rand() * (alpha[1] - alpha[0]);
    ti[i] = Math.min(1, Math.pow(rand(), 1.3) + (rand() - 0.5) * tintBias);
    ph[i] = rand();
    sp[i] = rand() * Math.PI * 2;
  }

  geo.setAttribute("aOffset", new InstancedBufferAttribute(off, 3));
  geo.setAttribute("aSize",   new InstancedBufferAttribute(sz, 1));
  geo.setAttribute("aAlpha",  new InstancedBufferAttribute(al, 1));
  geo.setAttribute("aTint",   new InstancedBufferAttribute(ti, 1));
  geo.setAttribute("aPhase",  new InstancedBufferAttribute(ph, 1));
  geo.setAttribute("aSpin",   new InstancedBufferAttribute(sp, 1));

  const p = theme === "dark"
    ? { white: "#FFF1C4", gold: "#C99A34", amber: "#3B2E1A" }
    : { white: "#FFF8DE", gold: "#F3CF64", amber: "#8E5F0C" };

  const uniforms = {
    uMap:     { value: map },
    uWhite:   { value: new Color(p.white) },
    uGold:    { value: new Color(p.gold) },
    uAmber:   { value: new Color(p.amber) },
    uOpacity: { value: opacity },
    uHeat:    { value: 0 },
    uTime:    { value: 0 },
    uSway:    { value: sway },
    uGrowth:  { value: 1 },
    uParallax:{ value: 0 },
  };

  const mesh = new Mesh(geo, new ShaderMaterial({
    vertexShader: BLOOM_VERT,
    fragmentShader: BLOOM_FRAG,
    uniforms,
    transparent: true,
    depthWrite: false,
  }));
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}

/* ================================================================== *
 * Pollen
 * ================================================================== */

const POLLEN_VERT = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  uniform float uTime;
  uniform float uDpr;
  uniform float uRise;
  uniform vec3  uDraw;      // world point the motes lean toward
  uniform float uPull;
  varying float vFade;

  void main() {
    vec3 p = position;
    // Rise and wrap. The wrap span is the field height, so a mote leaving the
    // top re-enters at the bottom without a visible seam.
    p.y = mod(p.y + uTime * 0.10 * uRise + aPhase * 11.0, 11.0) - 5.5;
    p.x += sin(uTime * 0.42 + aPhase * 21.0) * 0.10;

    vFade = smoothstep(-5.5, -3.2, p.y) * (1.0 - smoothstep(3.0, 5.5, p.y));

    // The cursor draws nearby motes toward it, and only nearby ones: the pull
    // falls off over about a unit and a half, so the effect reads as air
    // moving around a hand rather than as a magnet.
    vec3 toward = uDraw - p;
    float near = 1.0 - smoothstep(0.0, 1.6, length(toward));
    p += normalize(toward + vec3(0.0001)) * near * near * uPull * 0.42;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    // Perspective-correct point size, so near motes are genuinely bigger.
    gl_PointSize = aSize * uDpr * (7.0 / max(0.6, -mv.z)) * (1.0 + near * uPull * 0.8);
    gl_Position = projectionMatrix * mv;
  }
`;

const POLLEN_FRAG = /* glsl */ `
  precision mediump float;
  uniform vec3  uColor;
  uniform float uOpacity;
  varying float vFade;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float m = smoothstep(0.5, 0.06, length(d));
    if (m <= 0.002) discard;
    gl_FragColor = vec4(uColor, m * vFade * uOpacity);
  }
`;

function buildPollen({ theme, count = 300, seed = 41 }) {
  const rand = rng(seed);
  const pos = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const phase = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    pos[i * 3]     = (rand() * 2 - 1) * 9.0;
    pos[i * 3 + 1] = (rand() * 2 - 1) * 5.5;
    pos[i * 3 + 2] = -6 + rand() * 10;
    size[i] = 0.9 + Math.pow(rand(), 2) * 5.2;
    phase[i] = rand();
  }

  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(pos, 3));
  geo.setAttribute("aSize", new BufferAttribute(size, 1));
  geo.setAttribute("aPhase", new BufferAttribute(phase, 1));

  const uniforms = {
    uTime:    { value: 0 },
    uDpr:     { value: 1 },
    uRise:    { value: 1 },
    uDraw:    { value: new Vector3(0, 0, 0) },
    uPull:    { value: 0 },
    uColor:   { value: new Color(theme === "dark" ? "#FFDE94" : "#FFF3CE") },
    uOpacity: { value: theme === "dark" ? 0.40 : 0.44 },
  };

  const points = new Points(geo, new ShaderMaterial({
    vertexShader: POLLEN_VERT,
    fragmentShader: POLLEN_FRAG,
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  }));
  points.frustumCulled = false;
  return { points, uniforms };
}

/* ================================================================== *
 * The burst
 *
 * Touch the entity and the field throws petals. One instanced quad set that
 * lives at zero scale until `uBurst` is driven 0 → 1, then flies outward on
 * per-instance directions and fades. No pooling, no allocation at click time.
 * ================================================================== */

const BURST_VERT = /* glsl */ `
  attribute vec3  aDir;
  attribute float aSize;
  attribute float aPhase;
  attribute float aSpin;

  uniform float uTime;
  uniform float uBurst;
  uniform vec3  uOrigin;

  varying vec2  vUv;
  varying float vFade;

  void main() {
    vUv = uv;

    // Ease out hard: petals leave fast and coast. Stagger by phase so the
    // ring is a scatter, not a hoop.
    float t = clamp(uBurst * 1.35 - aPhase * 0.35, 0.0, 1.0);
    float e = 1.0 - pow(1.0 - t, 2.6);
    vFade = t * (1.0 - t) * 4.0;             // in and out over the flight

    vec3 at = uOrigin + aDir * e * (1.9 + aPhase * 2.2);
    vec4 mv = modelViewMatrix * vec4(at, 1.0);

    float s = aSize * (0.35 + e * 1.5);
    float a = aSpin + e * 3.0;
    vec2 q = vec2(position.x * cos(a) - position.y * sin(a),
                  position.x * sin(a) + position.y * cos(a));
    mv.xy += q * s;

    gl_Position = projectionMatrix * mv;
  }
`;

const BURST_FRAG = /* glsl */ `
  precision mediump float;
  uniform sampler2D uMap;
  uniform vec3 uColor;
  varying vec2  vUv;
  varying float vFade;
  void main() {
    float m = texture2D(uMap, vUv).a;
    if (m * vFade < 0.004) discard;
    gl_FragColor = vec4(uColor, m * vFade * 0.85);
  }
`;

function buildBurst({ map, theme, count = 58, seed = 77 }) {
  const rand = rng(seed);
  const base = new PlaneGeometry(2, 2);
  const geo = new InstancedBufferGeometry();
  geo.index = base.index;
  geo.attributes.position = base.attributes.position;
  geo.attributes.uv = base.attributes.uv;
  geo.instanceCount = count;

  const dir = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const phase = new Float32Array(count);
  const spin = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    // Biased toward the horizontal, and forward of the chest — the petals
    // should come at the viewer, not spray evenly like a firework.
    const a = rand() * Math.PI * 2;
    const el = (rand() - 0.42) * 1.5;
    dir[i * 3]     = Math.cos(a);
    dir[i * 3 + 1] = el;
    dir[i * 3 + 2] = Math.sin(a) * 0.55 + 0.35;
    size[i] = 0.05 + Math.pow(rand(), 1.8) * 0.30;
    phase[i] = rand();
    spin[i] = rand() * Math.PI * 2;
  }

  geo.setAttribute("aDir",   new InstancedBufferAttribute(dir, 3));
  geo.setAttribute("aSize",  new InstancedBufferAttribute(size, 1));
  geo.setAttribute("aPhase", new InstancedBufferAttribute(phase, 1));
  geo.setAttribute("aSpin",  new InstancedBufferAttribute(spin, 1));

  const uniforms = {
    uMap:    { value: map },
    uColor:  { value: new Color(theme === "dark" ? "#FFE9AE" : "#FFFCEE") },
    uBurst:  { value: 0 },
    uOrigin: { value: new Vector3(-0.74, 0.15, 0.22) },
    uTime:   { value: 0 },
  };

  const mesh = new Mesh(geo, new ShaderMaterial({
    vertexShader: BURST_VERT,
    fragmentShader: BURST_FRAG,
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  }));
  mesh.frustumCulled = false;
  mesh.visible = false;
  return { mesh, uniforms };
}

/* ================================================================== *
 * Sprigs
 * ================================================================== */

function buildSprigs({ map, theme }) {
  const g = new Group();
  for (const [z, scale, opacity, y] of [[-3.4, 1.9, 0.50, -3.60], [-0.6, 1.5, 0.62, -3.42], [1.4, 1.15, 0.72, -3.20]]) {
    const mesh = new Mesh(
      new PlaneGeometry(11 * scale, 4.0 * scale),
      new ShaderMaterial({
        uniforms: {
          uMap: { value: map },
          uOpacity: { value: opacity * (theme === "dark" ? 0.6 : 1) },
          uTime: { value: 0 },
          uSway: { value: 1 },
        },
        vertexShader: /* glsl */ `
          uniform float uTime;
          uniform float uSway;
          varying vec2 vUv;
          void main() {
            vUv = uv;
            // Sway from the root: the sprigs bend, they do not slide.
            vec3 p = position;
            p.x += sin(uTime * 0.5 + p.y * 0.6) * 0.06 * uSway * smoothstep(-2.1, 2.1, p.y);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          precision mediump float;
          uniform sampler2D uMap;
          uniform float uOpacity;
          varying vec2 vUv;
          void main() {
            vec4 c = texture2D(uMap, vUv);
            if (c.a < 0.004) discard;
            gl_FragColor = vec4(c.rgb, c.a * uOpacity);
          }
        `,
        transparent: true,
        depthWrite: false,
      })
    );
    mesh.position.set(0.4, y, z);
    g.add(mesh);
  }
  return g;
}

/* ================================================================== *
 * Assembly
 * ================================================================== */

export function buildField({ bokeh, petal, sprig, theme, tier = "high" }) {
  const g = new Group();

  const ground = buildGround({ theme });
  g.add(ground.mesh);

  // Counts are the only thing the quality tier changes. The composition is
  // identical on a phone; there is simply less of it.
  const n = tier === "low" ? 0.42 : tier === "mid" ? 0.7 : 1;

  const far = buildBlooms({
    map: bokeh, theme, seed: 101,
    count: Math.round(70 * n), z: [-15, -5.5], size: [0.34, 3.4],
    alpha: [0.08, 0.28], spread: [13, 8.5], tintBias: 0.70, sway: 1.2,
  });
  g.add(far.mesh);

  const mid = buildBlooms({
    map: bokeh, theme, seed: 202,
    count: Math.round(34 * n), z: [-5.0, -1.2], size: [0.22, 1.5],
    alpha: [0.09, 0.30], spread: [10.5, 7], tintBias: 0.55, sway: 1,
  });
  g.add(mid.mesh);

  const pollen = buildPollen({ theme, count: Math.round(300 * n) });
  g.add(pollen.points);

  const sprigs = buildSprigs({ map: sprig, theme });
  g.add(sprigs);

  // The near field renders last and largest — these are the blooms that pass
  // in front of the figure and give the whole image its depth of field.
  const near = buildBlooms({
    map: petal || bokeh, theme, seed: 303,
    count: Math.round(15 * n), z: [2.6, 6.4], size: [1.5, 5.2],
    alpha: [0.11, 0.34], spread: [8.5, 6], tintBias: 0.90, sway: 1.5,
  });
  near.mesh.renderOrder = 40;
  g.add(near.mesh);

  const burst = buildBurst({ map: petal || bokeh, theme });
  burst.mesh.renderOrder = 45;
  g.add(burst.mesh);

  return { group: g, ground, far, mid, near, pollen, burst, sprigs: [sprigs] };
}
