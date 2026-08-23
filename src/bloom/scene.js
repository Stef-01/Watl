/**
 * The stage.
 *
 * Renderer, lens, post chain, and every hand on the entity. Three decisions
 * shape this file:
 *
 * 1. There are no Three.js lights. The gild computes its own illumination, so
 *    the scene graph carries geometry and nothing else.
 *
 * 2. Timing is Motion's, not ours. Every transition the entity makes — the
 *    pulse, the heat, the reveal, the settle after a click — runs through
 *    `animate()` from Motion, the same library that choreographs the DOM
 *    above the canvas. One vocabulary for both layers means a spring tuned in
 *    the type is the same spring felt in the geometry.
 *
 * 3. Quality is one dial, decided once. `tier` picks instance counts, pixel
 *    ratio and whether the post chain exists at all. Nothing else in the
 *    codebase branches on device.
 */
import {
  Scene, PerspectiveCamera, WebGLRenderer, Vector2, Vector3, Color, Clock,
  NeutralToneMapping, SRGBColorSpace,
} from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { animate } from "motion";

import { vineTexture, fernTexture, laceTexture, moonTexture, bokehTexture, sprigTexture, gildTexture } from "./textures.js";
import { buildEntity } from "./entity.js";
import { buildField } from "./field.js";
import { buildSettle } from "./settle.js";
import { retintGild, tickGild, setGild, GILDED } from "./material.js";
import { retintMotifs, setMotif } from "./motif.js";

/* ------------------------------------------------------------------ *
 * Final pass — grain, vignette, and a whisper of warmth in the lift
 * ------------------------------------------------------------------ */
const FinalShader = {
  uniforms: {
    tDiffuse:  { value: null },
    uTime:     { value: 0 },
    uGrain:    { value: 0.010 },
    uVignette: { value: 0.55 },
    uLift:     { value: 0.0 },
    uFade:     { value: 1.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uGrain;
    uniform float uVignette;
    uniform float uLift;
    uniform float uFade;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;

      // Vignette, offset upward so it frames the head rather than the middle.
      // The band matters as much as the strength: opening at 0.36 left the top
      // edge untouched, and the cream type up there had nothing to sit on.
      float d = length((vUv - vec2(0.5, 0.56)) * vec2(1.04, 0.94));
      c *= 1.0 - smoothstep(0.18, 0.88, d) * uVignette;

      // Warm the lift a touch. Film does this; a linear renderer does not.
      c += vec3(0.020, 0.013, 0.004) * uLift;

      // Grain over everything, including the bloom's smooth falloffs, which
      // is where banding would otherwise show first.
      c += (hash(vUv * 1024.0 + fract(uTime) * 71.0) - 0.5) * uGrain;

      gl_FragColor = vec4(c * uFade, 1.0);
    }
  `,
};

/* ------------------------------------------------------------------ *
 * Quality
 * ------------------------------------------------------------------ */
function pickTier() {
  const cores = navigator.hardwareConcurrency || 4;
  const narrow = Math.min(window.innerWidth, window.innerHeight);
  const coarse = window.matchMedia("(pointer: coarse)").matches;

  if (coarse && (narrow < 420 || cores <= 4)) return "low";
  if (coarse || cores <= 6 || narrow < 720) return "mid";
  return "high";
}

/* ------------------------------------------------------------------ *
 * The lens
 *
 * Framing is spherical around a target that climbs from the chest to the
 * head as the visitor scrolls. Portrait viewports get pushed back and the
 * target recentred, because the composition is landscape by construction and
 * cropping it would cut the pod off.
 * ------------------------------------------------------------------ */
/*
 * The entity stands 4.6 units from sole to crown. At a 30° vertical field the
 * visible height is 0.536·d, so holding it at ~78% of frame wants d ≈ 11.2 —
 * not the 7.4 the first pass used, which cut the head clean off. Both targets
 * are derived from the body, not guessed: the chest for the resting frame, the
 * crown for the end of the scroll.
 */
const CHEST = new Vector3(0.02, 0.30, 0.0);
const CROWN = new Vector3(-0.48, 1.72, 0.0);
const REST_RADIUS = 11.8;
const CLIMB_RADIUS = 9.4;

/** Resting yaw of each body, kept here because the scroll turn is relative. */
const POD_REST_Y = -0.13;
const FIG_REST_Y = 0.09;

/**
 * The skies.
 *
 * The light theme is not one sky but three, chosen from the visitor's own
 * clock: a cool bright morning, the flat gold of the middle of the day, and a
 * deep amber dusk. The dark theme is night. Nobody sees the same bloom twice
 * in a day, and the crossfade the theme toggle already uses carries the
 * difference for nothing.
 */
const SKY = {
  morning: { high: "#FFFAD6", mid: "#F6DE8E", low: "#CFA53A", glow: "#FFFDF0", vig: 0.20, pool: 0.30 },
  day:     { high: "#FFF4B8", mid: "#F3D269", low: "#C4941F", glow: "#FFFBE4", vig: 0.24, pool: 0.34 },
  dusk:    { high: "#FFE7A4", mid: "#EDBB58", low: "#A96D14", glow: "#FFF3D0", vig: 0.34, pool: 0.42 },
  night:   { high: "#453750", mid: "#291F3C", low: "#12101F", glow: "#5E4A1C", vig: 0.40, pool: 0.16 },
};

/** Which of the three daylight skies the clock is asking for. */
function skyNow() {
  const h = new Date().getHours();
  if (h >= 5 && h < 10) return "morning";
  if (h >= 16 && h < 20) return "dusk";
  return "day";
}

/** A theme is light or dark; a sky is one of four. This is the mapping. */
function skyFor(theme) {
  return theme === "dark" ? "night" : skyNow();
}

// Scratch colours for the dusk crossfade, so it allocates nothing per frame.
const scratch = new Color();
const scratch2 = new Color();

export function createBloom(canvas, { theme = "light" } = {}) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const tier = pickTier();

  let renderer;
  try {
    renderer = new WebGLRenderer({
      canvas,
      antialias: tier === "high",
      alpha: false,
      powerPreference: tier === "low" ? "low-power" : "high-performance",
      stencil: false,
    });
  } catch {
    return null;
  }
  if (!renderer.getContext()) return null;

  const maxDpr = tier === "high" ? 1.7 : tier === "mid" ? 1.4 : 1.15;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
  renderer.outputColorSpace = SRGBColorSpace;
  // ACES was the first choice and it was wrong for this. Its RRT crushes dark
  // saturated colours hard — a bronze at 21% linear came out the far side at
  // 2% and the figure read as a paper cut-out no matter what the palette said.
  // Khronos PBR Neutral holds midtones and hue and only rolls off the top,
  // which is what an illustration wants.
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 1, 0.1, 60);
  const clock = new Clock();

  /* --- the artwork ---------------------------------------------------- */
  const lean = tier === "low";
  const tex = {
    gild:  gildTexture({ size: 256 }),
    vine:  vineTexture({ size: lean ? 384 : 640 }),
    fern:  fernTexture({ size: lean ? 512 : 1024 }),
    lace:  laceTexture({ size: 512 }),
    moon:  moonTexture({ size: lean ? 256 : 512 }),
    bokeh: bokehTexture({ size: lean ? 128 : 256 }),
    petal: bokehTexture({ size: lean ? 160 : 320, wobble: 0.125 }),
    sprig: sprigTexture({ w: lean ? 512 : 1024 }),
  };

  const field = buildField({ bokeh: tex.bokeh, petal: tex.petal, sprig: tex.sprig, theme, tier });
  scene.add(field.group);

  const entity = buildEntity({
    gild: tex.gild, vine: tex.vine, fern: tex.fern,
    lace: tex.lace, moon: tex.moon, theme,
  });
  scene.add(entity.root);

  // Petals that stay. Added after the entity so they draw over the feet.
  const settle = buildSettle({ map: tex.petal, theme, slots: lean ? 24 : 40 });
  scene.add(settle.mesh);

  /* --- post ----------------------------------------------------------- *
   * The chain always exists, even on the cheapest tier, and the reason is a
   * bug worth recording. Every material in this scene is a custom
   * ShaderMaterial, and custom shaders do not get three's `tonemapping_fragment`
   * or `colorspace_fragment` includes. So the composer's last pass was writing
   * *linear* values straight into an sRGB canvas: every colour came out as its
   * own square. A bronze at 23% luminance landed at 5%, which is why the
   * figure read as a paper cut-out no matter what the palette said.
   *
   * OutputPass is the fix, and it has to be the terminal pass on every tier —
   * it is the only thing applying tone mapping and the sRGB encode. One extra
   * fullscreen blit on a phone is a fair price for colour that is correct.
   * ------------------------------------------------------------------- */
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  let finalPass = null;
  let bloomPass = null;

  if (tier !== "low") {
    bloomPass = new UnrealBloomPass(
      new Vector2(1, 1),
      theme === "dark" ? 0.34 : 0.22,   // strength
      0.55,                             // radius
      theme === "dark" ? 0.80 : 0.90    // threshold
    );
    composer.addPass(bloomPass);

    // Grain and vignette, in linear, before the output encode.
    finalPass = new ShaderPass(FinalShader);
    composer.addPass(finalPass);
  }

  composer.addPass(new OutputPass());

  /* --- state ---------------------------------------------------------- */
  const state = {
    scroll: 0,
    pointer: new Vector2(0, 0),   // −1…1, already smoothed by the caller
    heat: 0,
    reveal: 0,
    burst: 0,
    /** Accumulated drag, in radians. Hover parallax is a glance; this is a
     *  deliberate turn, and it persists until the visitor lets it spring back. */
    spin: 0,
    /** Eyelid. 0 open, 1 shut. Driven by the idle blink. */
    lid: 0,
    /** How brightly the pod's fern is lit. Only the long press raises it. */
    podGlow: 0,
    /** Where the cursor is in the world, for the pollen to lean toward. */
    draw: new Vector3(0, 0, 0),
    pull: 0,
    theme,
  };

  const target = new Vector3();
  const dir = new Vector3();
  const draw = new Vector3();

  function frame() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    const aspect = w / h;

    // Portrait: step back hard, and pull the target toward centre. The pair
    // spans 2.6 units horizontally, which a 0.46 aspect will not hold at the
    // landscape distance — so the lens retreats rather than the art cropping.
    const portrait = Math.max(0, Math.min(1, (1.05 - aspect) / 0.65));
    const pull = 1 + portrait * 0.34;
    const shift = portrait * -0.13;

    target.copy(CHEST).lerp(CROWN, state.scroll * 0.9);
    target.x += shift;

    const radius = (REST_RADIUS - state.scroll * (REST_RADIUS - CLIMB_RADIUS)) * pull;
    const yaw = state.pointer.x * 0.115 + state.spin + 0.02;
    const pitch = 0.025 - state.pointer.y * 0.055 + state.scroll * 0.10;

    dir.set(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(yaw) * Math.cos(pitch)
    );
    camera.position.copy(target).addScaledVector(dir, radius);
    camera.lookAt(target);

    // The haze band starts just behind the bodies and runs well past them, so
    // only the field recedes — never the figure.
    setGild("uHazeNear", radius - 0.4);
    setGild("uHazeFar", radius + 9.5);

    // The entity counter-rotates a fraction of the lens swing. Without it the
    // parallax reads as the camera moving; with it, the figure feels present.
    entity.root.rotation.y = -state.pointer.x * 0.045;
    entity.root.position.x = state.pointer.x * 0.035;

    // And the pair turns toward each other as the lens climbs. At rest they
    // face out, as the poster does; by the top of the runway the pod has
    // swung open far enough to show its edge and the figure has turned to
    // meet it. It gives the scroll something to be *for*.
    const turn = state.scroll * state.scroll;   // late, so the rest pose holds
    entity.pod.group.rotation.y = POD_REST_Y - turn * 0.62;
    entity.figure.group.rotation.y = FIG_REST_Y + turn * 0.30;
    entity.figure.group.position.z = turn * 0.22;

    // The moon always faces us.
    entity.halo.quaternion.copy(camera.quaternion);

    // Unproject the cursor onto the plane the bodies stand in, so the pollen
    // leans toward where the hand actually is in the scene rather than toward
    // a screen-space guess.
    draw.set(state.pointer.x, -state.pointer.y, 0.5).unproject(camera);
    draw.sub(camera.position).normalize();
    const t = camera.position.z / -draw.z;
    field.pollen.uniforms.uDraw.value.copy(camera.position).addScaledVector(draw, t);
    field.pollen.uniforms.uPull.value = state.pull;
  }

  /* --- per-frame ------------------------------------------------------ */
  function tick() {
    const t = clock.getElapsedTime();

    tickGild(t);
    setMotif("uTime", t);

    field.ground.uniforms.uTime.value = t;
    for (const layer of [field.far, field.mid, field.near]) {
      layer.uniforms.uTime.value = t;
      layer.uniforms.uHeat.value = state.heat;
    }
    field.pollen.uniforms.uTime.value = t;
    field.pollen.uniforms.uDpr.value = renderer.getPixelRatio();
    field.pollen.uniforms.uRise.value = 1 + state.heat * 2.2;
    for (const g of field.sprigs) {
      for (const child of g.children) child.material.uniforms.uTime.value = t;
    }

    settle.uniforms.uTime.value = t;
    field.burst.uniforms.uBurst.value = state.burst;
    field.burst.mesh.visible = state.burst > 0.001 && state.burst < 0.999;

    setGild("uHeat", state.heat);
    setGild("uReveal", state.reveal);
    setGild("uPodGlow", state.podGlow);
    setMotif("uReveal", state.reveal);
    setMotif("uHeat", state.heat);

    // The eyes are the entity's only tell, so they carry the blink. Scaling in
    // y rather than fading keeps it reading as a lid and not as a dimmer.
    entity.figure.face.scale.y = Math.max(0.02, 1 - state.lid);

    // The halo answers the pulse, and drifts on the breath.
    const halo = 2.55 + Math.sin(t * 0.5) * 0.035 + state.heat * 0.20;
    entity.halo.scale.setScalar(halo);
    entity.halo.material.opacity = 0.9 + state.heat * 0.10;

    // The serpents crawl. Offsetting the lace rather than moving the geometry
    // keeps this free.
    for (let i = 0; i < entity.serpents.meshes.length; i++) {
      const m = entity.serpents.meshes[i].material.map;
      if (m) m.offset.x = t * (i === 0 ? -0.010 : 0.008);
    }

    frame();

    if (finalPass) {
      finalPass.uniforms.uTime.value = t;
      finalPass.uniforms.uLift.value = state.heat;
    }
    composer.render();
  }

  /* --- sizing --------------------------------------------------------- */
  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    field.ground.uniforms.uAspect.value.set(Math.max(1, w / h), 1);
    composer.setSize(w, h);
    bloomPass?.resolution.set(w, h);
    if (reduced) tick();
  }
  resize();
  window.addEventListener("resize", resize, { passive: true });

  /* --- the loop, paused whenever nobody is looking --------------------- */
  let running = false;
  let raf = 0;

  /* Device capability was picked from pointer type, core count and viewport,
   * which is a proxy. This watches the first three seconds of real frames and
   * steps the cost down if the proxy was wrong: pixel ratio first, then the
   * glow pass. Both are safe to change at runtime; instance counts are not. */
  let probe = { frames: 0, slow: 0, last: 0, done: tier === "low" };

  function measure(now) {
    if (probe.done) return;
    if (probe.last) {
      const dt = now - probe.last;
      probe.frames += 1;
      if (dt > 22) probe.slow += 1;
      // Ignore the first handful: shader compiles and texture uploads land there.
      if (probe.frames > 180) {
        probe.done = true;
        const ratio = probe.slow / probe.frames;
        if (ratio > 0.35) {
          renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.1));
          if (bloomPass) bloomPass.enabled = false;
          resize();
          document.documentElement.setAttribute("data-bloom-tier", tier + "-eased");
        }
      }
    }
    probe.last = now;
  }

  function loop(now) {
    measure(now || 0);
    tick();
    raf = requestAnimationFrame(loop);
  }
  function start() {
    if (running || reduced) return;
    running = true;
    raf = requestAnimationFrame(loop);
  }
  function stop() {
    if (!running) return;
    running = false;
    cancelAnimationFrame(raf);
  }

  if (reduced) {
    // One frame, held. Reduced motion means the artwork is a still — not that
    // it is absent.
    state.reveal = 1;
    tick();
  } else {
    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? start() : stop()), { threshold: 0.01 });
    io.observe(canvas);
    document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
  }

  /* --- the pulse ------------------------------------------------------ *
   * One gesture, four things answering it on their own curves: petals fly
   * on an ease-out, the body's heat spikes and decays, the vine relights
   * from the root, and the lens takes a small breath in.
   * ------------------------------------------------------------------- */
  let pulsing = [];

  function pulse({ reveal = true, deep = false } = {}) {
    if (reduced) return Promise.resolve();
    for (const a of pulsing) a.stop();

    // A few of the thrown petals do not go back where they came from.
    settle.sow(clock.getElapsedTime(), deep ? 12 : 6);

    state.burst = 0;
    // Motion animates the state object in place; nothing here has to know
    // about requestAnimationFrame, and the curves are the same ones the type
    // above the canvas is using.
    const acts = [
      animate(state, { burst: 1 }, { duration: 1.55, ease: [0.16, 1, 0.3, 1] }),
      animate(state, { heat: [0, 1, 0] }, { duration: 1.9, times: [0, 0.1, 1], ease: "easeOut" }),
    ];
    if (reveal) {
      state.reveal = 0;
      acts.push(animate(state, { reveal: 1 }, { duration: 1.45, ease: [0.22, 1, 0.36, 1] }));
    }
    if (deep) {
      // The pod answers a held press, on a slower curve than the vine, so the
      // two motifs light in sequence rather than together.
      state.podGlow = 0;
      acts.push(animate(state, { podGlow: [0, 1, 0.34] },
        { duration: 3.0, times: [0, 0.42, 1], ease: "easeOut" }));
    }
    pulsing = acts;
    return Promise.all(acts.map((a) => a.then(() => {}))).then(() => { state.burst = 0; });
  }

  /* --- theme ---------------------------------------------------------- */
  /* Crossfading the palettes rather than swapping them is the difference
   * between a settings change and dusk falling. Colour uniforms are lerped;
   * the discrete things — bloom thresholds, opacities — flip at the midpoint,
   * where nothing is looking at them. */
  let dusk = null;

  function setTheme(mode, { animated = true } = {}) {
    const next = mode === "dark" ? "dark" : "light";
    if (next === state.theme) return;
    const from = state.theme;
    state.theme = next;

    if (!animated || reduced) {
      applyTheme(next);
      return;
    }
    dusk?.stop();
    const A = SKY[skyFor(from)];
    const B = SKY[skyFor(next)];
    let flipped = false;
    dusk = animate(0, 1, {
      duration: 1.15,
      ease: [0.4, 0, 0.2, 1],
      onUpdate: (t) => {
        const u = field.ground.uniforms;
        u.uHigh.value.lerpColors(scratch.set(A.high), scratch2.set(B.high), t);
        u.uMid.value.lerpColors(scratch.set(A.mid), scratch2.set(B.mid), t);
        u.uLow.value.lerpColors(scratch.set(A.low), scratch2.set(B.low), t);
        u.uGlow.value.lerpColors(scratch.set(A.glow), scratch2.set(B.glow), t);
        u.uVignette.value = A.vig + (B.vig - A.vig) * t;
        u.uPoolAmount.value = A.pool + (B.pool - A.pool) * t;
        // Anything that cannot be interpolated flips at the midpoint, where
        // the crossfade is busiest and nobody is reading it.
        if (!flipped && t > 0.5) { flipped = true; applyDiscrete(next); }
      },
      onComplete: () => applyTheme(next),
    });
  }

  function applyTheme(next) {
    const g = SKY[skyFor(next)];
    const u = field.ground.uniforms;
    u.uHigh.value.set(g.high);
    u.uMid.value.set(g.mid);
    u.uLow.value.set(g.low);
    u.uGlow.value.set(g.glow);
    u.uVignette.value = g.vig;
    u.uPoolAmount.value = g.pool;
    applyDiscrete(next);
  }

  function applyDiscrete(next) {
    retintGild(next);
    retintMotifs(next);

    // These must match buildBlooms' own table, or the first toggle silently
    // restyles the field.
    const b = next === "dark"
      ? { white: "#FFF1C4", gold: "#C99A34", amber: "#3B2E1A" }
      : { white: "#FFF8DE", gold: "#F3CF64", amber: "#8E5F0C" };
    for (const layer of [field.far, field.mid, field.near]) {
      layer.uniforms.uWhite.value.set(b.white);
      layer.uniforms.uGold.value.set(b.gold);
      layer.uniforms.uAmber.value.set(b.amber);
    }
    settle.retint(next);
    field.pollen.uniforms.uColor.value.set(next === "dark" ? "#FFDE94" : "#FFF3CE");
    field.burst.uniforms.uColor.value.set(next === "dark" ? "#FFE9AE" : "#FFFCEE");

    for (const m of entity.serpents.meshes) {
      m.material.opacity = next === "dark" ? 0.16 : 0.44;
    }
    if (bloomPass) {
      bloomPass.strength = next === "dark" ? 0.34 : 0.22;
      bloomPass.threshold = next === "dark" ? 0.80 : 0.90;
    }
    if (reduced) tick();
  }

  // Apply the ground palette once, so the light theme gets the softened bone
  // values above rather than the module defaults.
  state.theme = theme === "dark" ? "light" : "dark";
  setTheme(theme, { animated: false });

  /* --- public --------------------------------------------------------- */
  const api = {
    reduced,
    tier,
    /** Where the entity's heart projects to, for hit-testing in the DOM. */
    project() {
      const v = new Vector3(-0.74, 0.05, 0.20).project(camera);
      return { x: v.x, y: v.y };
    },
    setScroll(p) { state.scroll = Math.max(0, Math.min(1, p)); if (reduced) tick(); },
    setPointer(x, y) { state.pointer.set(x, y); },
    setHeat(v) { state.heat = Math.max(0, Math.min(1, v)); },
    /** Accumulated drag, in radians, clamped to a turn that stays composed. */
    setSpin(r) { state.spin = Math.max(-0.62, Math.min(0.62, r)); },
    getSpin() { return state.spin; },
    /** 0 open, 1 shut. */
    setLid(v) { state.lid = Math.max(0, Math.min(1, v)); if (reduced) tick(); },
    /** How strongly the cursor draws the pollen, 0–1. */
    setPull(v) { state.pull = Math.max(0, Math.min(1, v)); },
    setReveal(v) { state.reveal = Math.max(0, Math.min(1, v)); if (reduced) tick(); },
    pulse,
    setTheme,
    dispose() {
      stop();
      window.removeEventListener("resize", resize);
      renderer.dispose();
    },
  };

  // A tuning handle, development only — Vite drops the whole block from the
  // production bundle. Every value in this scene was arrived at by measuring
  // the render, and that is only practical if the parts can be isolated and
  // the palettes pushed around without a rebuild.
  if (import.meta.env.DEV) {
    api.debug = {
      scene, camera, renderer, composer, entity, field, tex,
      /** Show or hide a named layer, to see what is actually tinting what. */
      layer(name, on) {
        const map = {
          ground: field.ground.mesh, far: field.far.mesh, mid: field.mid.mesh,
          near: field.near.mesh, pollen: field.pollen.points,
          serpents: entity.serpents.group, halo: entity.halo,
          figure: entity.figure.group, pod: entity.pod.group,
        };
        if (map[name]) map[name].visible = on;
        if (reduced) tick();
      },
      /** Set one gild colour across the entity and re-render. */
      gild(key, hex) {
        for (const m of GILDED) {
          const u = m.uniforms["u" + key[0].toUpperCase() + key.slice(1)];
          if (u) u.value.set(hex);
        }
      },
      bloom(strength, threshold, radius) {
        if (!bloomPass) return;
        if (strength !== undefined) bloomPass.strength = strength;
        if (threshold !== undefined) bloomPass.threshold = threshold;
        if (radius !== undefined) bloomPass.radius = radius;
      },
      exposure(v) { renderer.toneMappingExposure = v; },
      final(name, v) { if (finalPass) finalPass.uniforms[name].value = v; },
    };
  }

  return api;
}
