/**
 * Petals that stay.
 *
 * Every other interaction in this scene is instantaneous and reversible: you
 * touch the figure, it blooms, and a second later the frame is exactly as it
 * was. Nothing the visitor does leaves a mark, which is the difference between
 * a toy and a place.
 *
 * So each pulse sows a few petals. They fall on an arc, settle into the pool
 * at the figure's feet, and stay there — by the fifth bloom the ground has a
 * history. After a couple of minutes they fade back into the field, and the
 * slots are a ring buffer, so nothing accumulates without bound and nothing is
 * allocated at click time.
 *
 * The whole lifecycle lives in the vertex shader, driven by one float per
 * instance: the clock time it was sown. JS writes that float and nothing else.
 */
import {
  Mesh, PlaneGeometry, InstancedBufferGeometry, InstancedBufferAttribute,
  ShaderMaterial, Color, Vector3,
} from "three";

const VERT = /* glsl */ `
  attribute float aBorn;    // clock time it was sown; negative means unused
  attribute vec3  aRest;    // where in the pool it comes to rest
  attribute float aSize;
  attribute float aSpin;
  attribute float aSway;

  uniform float uTime;
  uniform vec3  uOrigin;
  uniform float uFall;      // seconds from sown to settled
  uniform float uLife;      // seconds at rest before it fades
  uniform float uFade;

  varying vec2  vUv;
  varying float vAlpha;
  varying float vTint;

  void main() {
    vUv = uv;

    if (aBorn < 0.0) {
      // Unused slot. Collapse it rather than branching in the fragment stage.
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      vAlpha = 0.0;
      return;
    }

    float age = uTime - aBorn;
    float t = clamp(age / uFall, 0.0, 1.0);

    // Out fast, down slow: the horizontal throw eases out while the fall
    // accelerates, which is what a petal caught by air actually does.
    float outward = 1.0 - pow(1.0 - t, 2.6);
    float down = t * t * (3.0 - 2.0 * t);

    vec3 from = uOrigin;
    vec3 p = vec3(
      mix(from.x, aRest.x, outward),
      mix(from.y, aRest.y, down),
      mix(from.z, aRest.z, outward)
    );

    // A flutter that dies as it lands, so nothing keeps twitching on the floor.
    float flutter = (1.0 - t) * aSway;
    p.x += sin(uTime * 2.2 + aSpin * 7.0) * 0.09 * flutter;
    p.z += cos(uTime * 1.7 + aSpin * 5.0) * 0.06 * flutter;

    // At rest, a barely-there drift: petals on the ground still move in air.
    p.x += sin(uTime * 0.35 + aSpin * 3.0) * 0.014 * t;

    vAlpha = smoothstep(0.0, 0.12, t)
           * (1.0 - smoothstep(uLife, uLife + uFade, age));
    // Half the petals sit lighter than the ground and half darker. On a pale
    // gold field a carpet of pale petals is invisible; the range is what reads.
    vTint = fract(aSpin * 1.7);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);

    // Petals lie flatter as they settle: a tumbling quad becomes a resting one.
    float a = aSpin + (1.0 - t) * 4.0;
    float lay = mix(1.0, 0.42, t);
    vec2 q = vec2(position.x, position.y * lay);
    q = vec2(q.x * cos(a) - q.y * sin(a), q.x * sin(a) + q.y * cos(a));
    mv.xy += q * aSize;

    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  precision mediump float;
  uniform sampler2D uMap;
  uniform vec3 uPale;
  uniform vec3 uWarm;
  varying vec2  vUv;
  varying float vAlpha;
  varying float vTint;

  void main() {
    if (vAlpha < 0.004) discard;
    float m = texture2D(uMap, vUv).a;
    if (m < 0.01) discard;
    gl_FragColor = vec4(mix(uPale, uWarm, vTint), m * vAlpha * 0.92);
  }
`;

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * @param {object} o
 * @param {import('three').Texture} o.map    the petal sprite
 * @param {Vector3} o.origin                 where petals are thrown from
 * @param {Vector3} o.pool                   centre of the pool they land in
 */
export function buildSettle({
  map, theme = "light", slots = 40, seed = 61,
  origin = new Vector3(-0.74, 0.15, 0.22),
  pool = new Vector3(-0.74, -2.24, 0.35),
} = {}) {
  const rand = rng(seed);

  const base = new PlaneGeometry(2, 2);
  const geo = new InstancedBufferGeometry();
  geo.index = base.index;
  geo.attributes.position = base.attributes.position;
  geo.attributes.uv = base.attributes.uv;
  geo.instanceCount = slots;

  const born = new Float32Array(slots).fill(-1);
  const rest = new Float32Array(slots * 3);
  const size = new Float32Array(slots);
  const spin = new Float32Array(slots);
  const sway = new Float32Array(slots);

  for (let i = 0; i < slots; i++) {
    // Resting places scatter across the pool, wider than deep, and a little
    // in front of the feet so they read as lying on the ground.
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand());
    rest[i * 3]     = pool.x + Math.cos(a) * r * 1.35;
    rest[i * 3 + 1] = pool.y + rand() * 0.06;
    rest[i * 3 + 2] = pool.z + Math.sin(a) * r * 0.55;
    size[i] = 0.048 + Math.pow(rand(), 1.8) * 0.105;
    spin[i] = rand() * Math.PI * 2;
    sway[i] = 0.6 + rand() * 0.8;
  }

  const aBorn = new InstancedBufferAttribute(born, 1);
  aBorn.setUsage(35048); // DynamicDrawUsage — rewritten on every pulse
  geo.setAttribute("aBorn", aBorn);
  geo.setAttribute("aRest", new InstancedBufferAttribute(rest, 3));
  geo.setAttribute("aSize", new InstancedBufferAttribute(size, 1));
  geo.setAttribute("aSpin", new InstancedBufferAttribute(spin, 1));
  geo.setAttribute("aSway", new InstancedBufferAttribute(sway, 1));

  const uniforms = {
    uMap:    { value: map },
    uTime:   { value: 0 },
    uOrigin: { value: origin.clone() },
    uFall:   { value: 3.4 },
    uLife:   { value: 95 },
    uFade:   { value: 14 },
    uPale:   { value: new Color(theme === "dark" ? "#FFEDBA" : "#FFFAEA") },
    uWarm:   { value: new Color(theme === "dark" ? "#8A6520" : "#A6791F") },
  };

  const mesh = new Mesh(geo, new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms,
    transparent: true,
    depthWrite: false,
  }));
  mesh.frustumCulled = false;
  mesh.renderOrder = 30;

  // Ring buffer over the slots: the oldest petal is the one that gets reused,
  // so a visitor who keeps pressing gets a steady carpet rather than an
  // unbounded one.
  let next = 0;

  return {
    mesh,
    uniforms,
    /** Sow `count` petals at the current clock time. */
    sow(now, count = 7) {
      for (let i = 0; i < count; i++) {
        born[next] = now + i * 0.06;   // a short stagger, so they do not land as one
        next = (next + 1) % slots;
      }
      aBorn.needsUpdate = true;
    },
    retint(theme) {
      uniforms.uPale.value.set(theme === "dark" ? "#FFEDBA" : "#FFFAEA");
      uniforms.uWarm.value.set(theme === "dark" ? "#8A6520" : "#A6791F");
    },
  };
}
