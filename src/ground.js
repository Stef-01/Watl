/**
 * The living ground.
 *
 * A single full-screen triangle running a fragment shader that paints the same
 * soft violet mesh the CSS fallback paints — four blobs over a linear base —
 * except the blobs drift, and grain is computed per pixel rather than tiled.
 * Above it, a thin field of gold pollen rises.
 *
 * Everything here is progressive enhancement: the CSS gradient underneath is
 * the real background. If WebGL is missing, or the visitor asked for reduced
 * motion, we either never start or we render exactly one still frame.
 */
import {
  Scene, OrthographicCamera, WebGLRenderer, Mesh, Points,
  PlaneGeometry, BufferGeometry, BufferAttribute,
  ShaderMaterial, AdditiveBlending, Color, Vector2, Clock,
} from "three";

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;

  varying vec2 vUv;
  uniform float uTime;
  uniform float uScroll;
  uniform vec2  uAspect;
  uniform vec3  uBase;
  uniform vec3  uDeep;
  uniform vec3  uBlobA;
  uniform vec3  uBlobB;
  uniform vec3  uBlobC;
  uniform float uGrain;

  // Cheap hash for film grain. Deterministic per pixel per frame.
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  // A soft radial blob. Smoothstep rather than a hard falloff, so the edges
  // stay as diffuse as an out-of-focus photograph.
  float blob(vec2 uv, vec2 at, float radius) {
    float d = length((uv - at) * uAspect);
    return smoothstep(radius, 0.0, d);
  }

  void main() {
    // GL puts v=0 at the bottom; the palette and blob positions below are
    // written in CSS terms, so flip once here and think top-down after.
    vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
    float t = uTime;

    // Base: a diagonal wash from light to deep, pushed further as you scroll.
    float wash = clamp(uv.y * 0.72 + uv.x * 0.28 + uScroll * 0.18, 0.0, 1.0);
    vec3 col = mix(uBase, uDeep, wash);

    // Three drifting blobs on slow, mutually prime orbits so the loop is
    // long enough not to read as a loop.
    vec2 a = vec2(0.18 + sin(t * 0.061) * 0.05, 0.20 + cos(t * 0.043) * 0.04);
    vec2 b = vec2(0.82 + cos(t * 0.037) * 0.06, 0.12 + sin(t * 0.052) * 0.05);
    vec2 c = vec2(0.62 + sin(t * 0.029) * 0.07, 0.94 + cos(t * 0.034) * 0.05);

    col = mix(col, uBlobA, blob(uv, a, 0.62) * 0.85);
    col = mix(col, uBlobB, blob(uv, b, 0.54) * 0.70);
    col = mix(col, uBlobC, blob(uv, c, 0.78) * 0.90);

    // Grain last, so it sits on top of the gradient and kills the banding
    // that wide violet washes always show on 8-bit displays.
    float g = (hash(gl_FragCoord.xy + fract(t) * 100.0) - 0.5) * uGrain;
    col += g;

    gl_FragColor = vec4(col, 1.0);
  }
`;

const POLLEN_VERT = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  uniform float uTime;
  uniform float uPixelRatio;
  varying float vFade;

  void main() {
    vec3 p = position;
    // Rise, wrapping at the top; sway on a per-particle phase.
    p.y = mod(p.y + uTime * 0.018 + aPhase, 2.0) - 1.0;
    p.x += sin(uTime * 0.35 + aPhase * 8.0) * 0.02;

    // Fade in at the bottom and out at the top so nothing pops.
    vFade = smoothstep(-1.0, -0.5, p.y) * (1.0 - smoothstep(0.5, 1.0, p.y));

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = aSize * uPixelRatio;
    gl_Position = projectionMatrix * mv;
  }
`;

const POLLEN_FRAG = /* glsl */ `
  precision mediump float;
  uniform vec3 uColor;
  varying float vFade;

  void main() {
    // Round the square point sprite and soften its edge.
    vec2 d = gl_PointCoord - 0.5;
    float mask = smoothstep(0.5, 0.1, length(d));
    if (mask <= 0.001) discard;
    gl_FragColor = vec4(uColor, mask * vFade * 0.5);
  }
`;

const PALETTE = {
  light: { base: "#c9bce4", deep: "#5c4b88", a: "#ded2f2", b: "#e6dcf6", c: "#4a3b73" },
  dark:  { base: "#4b3f70", deep: "#1d1830", a: "#6b5a9c", b: "#7d6bb0", c: "#171226" },
};

export function createGround(canvas) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let renderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "low-power" });
  } catch {
    return null; // no WebGL — the CSS gradient underneath stands in
  }
  if (!renderer.getContext()) return null;

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));

  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const clock = new Clock();

  const theme = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
  const p = PALETTE[theme];

  const uniforms = {
    uTime:   { value: 0 },
    uScroll: { value: 0 },
    uAspect: { value: new Vector2(1, 1) },
    uBase:   { value: new Color(p.base) },
    uDeep:   { value: new Color(p.deep) },
    uBlobA:  { value: new Color(p.a) },
    uBlobB:  { value: new Color(p.b) },
    uBlobC:  { value: new Color(p.c) },
    uGrain:  { value: 0.028 },
  };

  scene.add(new Mesh(
    new PlaneGeometry(2, 2),
    new ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, depthTest: false })
  ));

  // --- pollen ---------------------------------------------------------
  const COUNT = reduced ? 0 : 160;
  const pollenUniforms = {
    uTime: { value: 0 },
    uPixelRatio: { value: renderer.getPixelRatio() },
    uColor: { value: new Color("#e9b44c") },
  };

  if (COUNT) {
    const pos = new Float32Array(COUNT * 3);
    const size = new Float32Array(COUNT);
    const phase = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      pos[i * 3] = Math.random() * 2 - 1;
      pos[i * 3 + 1] = Math.random() * 2 - 1;
      pos[i * 3 + 2] = 0;
      size[i] = 1.2 + Math.random() * 3.4;
      phase[i] = Math.random() * 2;
    }
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(pos, 3));
    geo.setAttribute("aSize", new BufferAttribute(size, 1));
    geo.setAttribute("aPhase", new BufferAttribute(phase, 1));

    scene.add(new Points(geo, new ShaderMaterial({
      vertexShader: POLLEN_VERT,
      fragmentShader: POLLEN_FRAG,
      uniforms: pollenUniforms,
      transparent: true,
      depthTest: false,
      blending: AdditiveBlending,
    })));
  }

  // --- sizing ----------------------------------------------------------
  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    uniforms.uAspect.value.set(Math.max(1, w / h), 1);
    pollenUniforms.uPixelRatio.value = renderer.getPixelRatio();
  }
  resize();
  window.addEventListener("resize", resize, { passive: true });

  // --- theme -----------------------------------------------------------
  function applyTheme(mode) {
    const q = PALETTE[mode === "dark" ? "dark" : "light"];
    uniforms.uBase.value.set(q.base);
    uniforms.uDeep.value.set(q.deep);
    uniforms.uBlobA.value.set(q.a);
    uniforms.uBlobB.value.set(q.b);
    uniforms.uBlobC.value.set(q.c);
    if (reduced) render();
  }

  function render() {
    renderer.render(scene, camera);
  }

  // --- loop, paused whenever the panel is off-screen or the tab is hidden
  let running = false;
  let raf = 0;

  function frame() {
    uniforms.uTime.value = clock.getElapsedTime();
    pollenUniforms.uTime.value = uniforms.uTime.value;
    render();
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (running || reduced) return;
    running = true;
    clock.start();
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  if (reduced) {
    render(); // one still frame, and nothing further
  } else {
    const io = new IntersectionObserver(
      ([e]) => (e.isIntersecting ? start() : stop()),
      { threshold: 0.01 }
    );
    io.observe(canvas);
    document.addEventListener("visibilitychange", () =>
      document.hidden ? stop() : start()
    );
  }

  return {
    setScroll: (v) => { uniforms.uScroll.value = v; if (reduced) render(); },
    setTheme: applyTheme,
    reduced,
  };
}
