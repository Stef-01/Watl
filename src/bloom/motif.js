/**
 * The vine's own material.
 *
 * The vine is not a surface — it is light lying on one. So it gets a plane of
 * its own, a whisker in front of the chest, and a material that contributes
 * nothing but the ink: transparent where the drawing is not, additive where
 * it is.
 *
 * What earns the separate file is `uReveal`. The mask has clean 0→1 UVs
 * running root to tip, so a single float can walk a wavefront up the vine and
 * light it like a fuse — dim behind the front, hot at it, dark ahead of it.
 * That is the entity's one piece of storytelling, and it is driven from the
 * scroll and from the pulse.
 */
import { ShaderMaterial, Color, AdditiveBlending, DoubleSide } from "three";

const VERT = /* glsl */ `
  uniform float uTime;
  uniform float uBreath;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    // Ride the same breath the body does, or the vine detaches from the chest.
    vec3 p = position;
    float up = clamp(p.y * 0.28 + 0.5, 0.0, 1.0);
    p.y += sin(uTime * 0.62) * 0.014 * up * uBreath;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;

  uniform sampler2D uMap;
  uniform vec3  uInk;
  uniform vec3  uCrest;
  uniform float uReveal;
  uniform float uRest;
  uniform float uHeat;
  uniform float uTime;
  uniform float uOpacity;

  varying vec2 vUv;

  void main() {
    vec4 m = texture2D(uMap, vUv);
    if (m.a < 0.01) discard;

    // Behind the wavefront the vine holds a low ember; ahead of it, nothing.
    float behind = 1.0 - smoothstep(uReveal - 0.18, uReveal + 0.04, vUv.y);
    float ember  = mix(uRest, 1.0, behind);

    // The wavefront itself: a narrow hot band that travels with uReveal.
    float crest = exp(-pow((vUv.y - uReveal) / 0.05, 2.0));

    // A slow shimmer along the stem so a resting vine is never quite still.
    float shimmer = 0.86 + 0.14 * sin(uTime * 1.6 - vUv.y * 9.0);

    vec3 col = uInk * ember * shimmer + uCrest * crest * 1.5;
    col += uInk * uHeat * 0.5 * behind;

    float a = m.a * uOpacity * clamp(ember + crest * 1.2 + uHeat * 0.25, 0.0, 1.6);
    gl_FragColor = vec4(col, a);
  }
`;

const INK = {
  light: { ink: "#FFF4D6", crest: "#FFFFFF", rest: 0.30 },
  dark:  { ink: "#FFE7A8", crest: "#FFFDF0", rest: 0.24 },
};

/** Every vine material handed out, so a theme flip and the clock reach them all. */
export const MOTIFS = [];

export function motifMaterial({ map, theme = "light", opacity = 1 } = {}) {
  const p = INK[theme === "dark" ? "dark" : "light"];
  const material = new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    uniforms: {
      uMap:     { value: map },
      uInk:     { value: new Color(p.ink) },
      uCrest:   { value: new Color(p.crest) },
      uRest:    { value: p.rest },
      uReveal:  { value: 0 },
      uHeat:    { value: 0 },
      uTime:    { value: 0 },
      uBreath:  { value: 1 },
      uOpacity: { value: opacity },
    },
  });
  MOTIFS.push(material);
  return material;
}

export function retintMotifs(theme) {
  const p = INK[theme === "dark" ? "dark" : "light"];
  for (const m of MOTIFS) {
    m.uniforms.uInk.value.set(p.ink);
    m.uniforms.uCrest.value.set(p.crest);
    m.uniforms.uRest.value = p.rest;
  }
}

export function setMotif(name, value) {
  for (const m of MOTIFS) {
    const u = m.uniforms[name];
    if (u) u.value = value;
  }
}
