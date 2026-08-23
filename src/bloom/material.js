/**
 * The gild.
 *
 * The reference is not a photograph of a metal figure, so a physically based
 * material is the wrong tool — MeshStandardMaterial spends its budget on
 * energy conservation, and what this needs is control. So the lighting model
 * is written by hand and stays deliberately illustrative:
 *
 *   · one soft key from above-front, wide enough that nothing goes black
 *   · a warm bounce from below, because the figure stands in a field of gold
 *   · a rim term, which is what actually separates the body from the haze
 *   · low-frequency mottle, so the gradients read as beaten leaf
 *   · aerial perspective, which is the trick the poster leans on hardest:
 *     everything dissolves toward the background as it recedes
 *
 * On top of that sits the motif channel: a masked emissive layer whose glow
 * climbs from the root of the vine to its tip as `uReveal` goes 0 → 1. That
 * is the one piece of the entity that is *narrative* rather than decorative,
 * so it gets its own uniform and is driven from the interaction layer.
 */
import { ShaderMaterial, Color, Vector2, DoubleSide, FrontSide } from "three";

const VERT = /* glsl */ `
  uniform float uTime;
  uniform float uBreath;

  varying vec2  vUv;
  varying vec3  vNormal;
  varying vec3  vView;
  varying float vHeight;

  void main() {
    vUv = uv;

    // A breath: the whole body lifts and settles a hair. Scaled by height so
    // the feet stay planted and the head carries the movement — the same way
    // a standing figure actually breathes.
    vec3 p = position;
    float up = clamp(p.y * 0.28 + 0.5, 0.0, 1.0);
    p.y += sin(uTime * 0.62) * 0.014 * up * uBreath;
    p.x += sin(uTime * 0.41 + p.y * 0.7) * 0.005 * up * uBreath;

    vHeight = p.y;
    vNormal = normalize(normalMatrix * normal);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vView = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  precision highp float;

  uniform vec3  uShadow;
  uniform vec3  uBase;
  uniform vec3  uLit;
  uniform vec3  uRim;
  uniform vec3  uBounce;
  uniform vec3  uAtmos;

  uniform sampler2D uGild;
  uniform float uGildScale;
  uniform float uGildAmount;

  uniform sampler2D uMotif;
  uniform vec2  uMotifScale;
  uniform float uHasMotif;
  uniform vec3  uMotifInk;
  uniform float uMotifGlow;
  uniform float uPodGlow;
  uniform float uReveal;
  uniform float uMotifOpaque;

  uniform float uHaze;
  uniform float uHazeNear;
  uniform float uHazeFar;
  uniform float uRimPower;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uHeat;

  varying vec2  vUv;
  varying vec3  vNormal;
  varying vec3  vView;
  varying float vHeight;

  void main() {
    // Double-sided geometry hands us back-facing normals on the inside of the
    // pod; flip them so the interior is lit rather than crushed.
    vec3 N = normalize(vNormal);
    if (!gl_FrontFacing) N = -N;
    vec3 V = normalize(-vView);

    // Key from above, slightly front-left. Half-lambert, because a hard
    // terminator would fight the flatness of the reference.
    vec3  L   = normalize(vec3(-0.42, 0.86, 0.62));
    float ndl = dot(N, L) * 0.5 + 0.5;
    ndl = pow(ndl, 1.35);

    vec3 col = mix(uShadow, uBase, ndl);
    col = mix(col, uLit, smoothstep(0.66, 1.0, ndl) * 0.72);

    // Bounce off the field. Only the downward-facing surfaces get it, and it
    // is warm — this is the light that keeps the underside of the jaw alive.
    float up = clamp(-N.y, 0.0, 1.0);
    col = mix(col, uBounce, up * 0.34);

    // Rim. The single most load-bearing term in the whole material: it draws
    // the contour that the haze would otherwise eat.
    float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), uRimPower);
    col += uRim * fres * 0.34;

    // Mottle.
    float mott = texture2D(uGild, vUv * uGildScale).r - 0.5;
    col *= 1.0 + mott * uGildAmount;

    // The motif. Its mask is the alpha of the drawn line-work; the glow runs
    // root-to-tip so the vine can be lit like a fuse.
    if (uHasMotif > 0.5) {
      vec4 m = texture2D(uMotif, vUv * uMotifScale);

      // Opaque motifs (the pod's fern) simply replace the surface colour.
      col = mix(col, m.rgb, uMotifOpaque * m.a);

      // And then, on a long press, they light from the root the way the vine
      // does. There is no alpha mask to work from here, so the ink is found
      // by luminance: the darker the leaf, the more gold it takes.
      if (uMotifOpaque > 0.5 && uPodGlow > 0.001) {
        float ink = 1.0 - dot(m.rgb, vec3(0.299, 0.587, 0.114));
        float behind = 1.0 - smoothstep(uReveal - 0.20, uReveal + 0.05, vUv.y);
        float crest = exp(-pow((vUv.y - uReveal) / 0.06, 2.0));
        float lit = behind * 0.85 + crest * 1.6;

        // Adding gold to dark leaves on a cream field only walks them toward
        // the field, and the fern reads as vanishing. So the field falls away
        // as the leaves come up: the seed lighting from the inside.
        //
        // The field falls toward the warm bounce, not toward the gild's own
        // shadow — mixing cream into a dark brown lands on a cold grey, and
        // the seed looked dirty rather than lit.
        col = mix(col, uBounce, uPodGlow * (1.0 - ink) * 0.70 * lit);
        col += uMotifInk * ink * uPodGlow * lit * 1.8;
      }

      // Emissive motifs (the vine on the chest) add light where the ink is.
      float front = smoothstep(uReveal - 0.22, uReveal + 0.06, vUv.y);
      float lit = m.a * (1.0 - uMotifOpaque) * uMotifGlow * (1.0 - front);
      // A travelling crest at the wavefront, so the reveal has an edge to it.
      lit += m.a * (1.0 - uMotifOpaque) * uMotifGlow * 1.9
             * exp(-pow((vUv.y - uReveal) / 0.055, 2.0));
      col += uMotifInk * lit;
    }

    // Heat: the whole body warms toward gold on hover and on the pulse.
    col = mix(col, uRim, uHeat * 0.22 * (0.35 + fres));

    // Aerial perspective. Distance is measured along the view axis, so a
    // figure that turns away from camera loses its far shoulder into the
    // haze exactly as the reference does.
    float d = -vView.z;
    float fade = smoothstep(uHazeNear, uHazeFar, d) * uHaze;
    col = mix(col, uAtmos, fade);

    gl_FragColor = vec4(col, uOpacity);
  }
`;

/**
 * Palettes live here rather than in the scene because every one of these
 * values is a *material* decision — which bronze, which gold on the rim, what
 * the haze dissolves into.
 */
export const GILD = {
  light: {
    shadow: "#2E1C05",
    base:   "#6A470C",
    lit:    "#A2761A",
    rim:    "#F9E7B6",
    bounce: "#8E6A1E",
    atmos:  "#F2E3AE",
  },
  dark: {
    shadow: "#2A1C06",
    base:   "#644614",
    lit:    "#9C7220",
    rim:    "#FFEEBE",
    bounce: "#7A5818",
    atmos:  "#2A2236",
  },
};

/**
 * @param {object} o
 * @param {import('three').Texture} o.gild   the mottle map, shared by every part
 * @param {import('three').Texture} [o.motif]
 * @param {'light'|'dark'} [o.theme]
 */
export function gildedMaterial({
  gild,
  motif = null,
  motifOpaque = false,
  motifScale = [1, 1],
  motifInk = "#FFF3D2",
  motifGlow = 0.0,
  theme = "light",
  gildScale = 3.0,
  gildAmount = 0.20,
  haze = 1.0,
  hazeNear = 11.4,
  hazeFar = 21.0,
  rimPower = 2.4,
  opacity = 1.0,
  doubleSide = false,
} = {}) {
  const p = GILD[theme] || GILD.light;

  const material = new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: doubleSide ? DoubleSide : FrontSide,
    transparent: opacity < 1,
    uniforms: {
      uShadow: { value: new Color(p.shadow) },
      uBase:   { value: new Color(p.base) },
      uLit:    { value: new Color(p.lit) },
      uRim:    { value: new Color(p.rim) },
      uBounce: { value: new Color(p.bounce) },
      uAtmos:  { value: new Color(p.atmos) },

      uGild:       { value: gild },
      uGildScale:  { value: gildScale },
      uGildAmount: { value: gildAmount },

      uMotif:       { value: motif },
      uMotifScale:  { value: new Vector2(motifScale[0], motifScale[1]) },
      uHasMotif:    { value: motif ? 1 : 0 },
      uMotifInk:    { value: new Color(motifInk) },
      uMotifGlow:   { value: motifGlow },
      uPodGlow:     { value: 0 },
      uMotifOpaque: { value: motifOpaque ? 1 : 0 },
      uReveal:      { value: 0 },

      uHaze:     { value: haze },
      uHazeNear: { value: hazeNear },
      uHazeFar:  { value: hazeFar },
      uRimPower: { value: rimPower },
      uOpacity:  { value: opacity },
      uHeat:     { value: 0 },
      uTime:     { value: 0 },
      uBreath:   { value: 1 },
    },
  });

  // Every gilded material in the scene is retuned together — theme flips and
  // the per-frame clock both need to reach all of them — so they are tracked
  // on a shared list rather than hunted for by traversing the graph.
  GILDED.push(material);
  return material;
}

/** Every material this module has handed out, in creation order. */
export const GILDED = [];

/** Retint the whole entity for a theme flip. */
export function retintGild(theme) {
  const p = GILD[theme === "dark" ? "dark" : "light"];
  for (const m of GILDED) {
    m.uniforms.uShadow.value.set(p.shadow);
    m.uniforms.uBase.value.set(p.base);
    m.uniforms.uLit.value.set(p.lit);
    m.uniforms.uRim.value.set(p.rim);
    m.uniforms.uBounce.value.set(p.bounce);
    m.uniforms.uAtmos.value.set(p.atmos);
  }
}

/** Advance the clock, and with it the breath, on every gilded material. */
export function tickGild(t) {
  for (const m of GILDED) m.uniforms.uTime.value = t;
}

/** Set one uniform across the entity. Used for reveal, heat and breath. */
export function setGild(name, value) {
  for (const m of GILDED) {
    const u = m.uniforms[name];
    if (u) u.value = value;
  }
}
