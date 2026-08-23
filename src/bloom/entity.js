/**
 * The entity.
 *
 * Two bodies stand in the field: a figure, and the pod beside it. Neither is
 * a model file — every form here is described by a handful of numbers, which
 * is the point. A poster is a fixed crop of one moment; this has to hold up
 * while a visitor swings the camera twelve degrees and scrolls three
 * viewports, so the silhouette needs to be real geometry with real bevels
 * catching a real rim light, not a plane with a picture on it.
 *
 * The anatomy, part by part:
 *
 *   figure  head (lathed ovoid, chin-first) · eyes · nose ridge · neck ·
 *           torso (extruded tapered slab) · the vine climbing it ·
 *           shoulders · arms · thorn hands · legs
 *   pod     a mandorla built as a frame with a hole, a face carrying the
 *           fern, and a back so you cannot see through it
 *   halo    the moon, billboarded behind the head
 *   serpents two lace ribbons weaving the two bodies together
 */
import {
  Group, Mesh, BufferGeometry, BufferAttribute,
  LatheGeometry, CylinderGeometry, ConeGeometry, SphereGeometry,
  ExtrudeGeometry, ShapeGeometry, PlaneGeometry, RingGeometry, CircleGeometry,
  Shape, Vector2, Vector3, CatmullRomCurve3,
  MeshBasicMaterial, AdditiveBlending, DoubleSide,
} from "three";
import { gildedMaterial } from "./material.js";
import { motifMaterial } from "./motif.js";

/* ================================================================== *
 * Geometry helpers
 * ================================================================== */

/**
 * ExtrudeGeometry and ShapeGeometry both emit UVs in *world* units, which is
 * useless for a texture that wants 0→1 across the form. Every flat face here
 * gets remapped from its own bounding box instead.
 */
function normalizeUV(geometry, { flipY = false } = {}) {
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox;
  const w = max.x - min.x || 1;
  const h = max.y - min.y || 1;
  const uv = geometry.attributes.uv;
  const pos = geometry.attributes.position;
  for (let i = 0; i < uv.count; i++) {
    const u = (pos.getX(i) - min.x) / w;
    const v = (pos.getY(i) - min.y) / h;
    uv.setXY(i, u, flipY ? 1 - v : v);
  }
  uv.needsUpdate = true;
  return geometry;
}

/**
 * A flat ribbon along a curve.
 *
 * TubeGeometry would give a macaroni; the reference's serpents are painted
 * bands. Width runs along tangent × viewward, so the band lies open to the
 * camera the way an illustrated ribbon does, and UVs run 0→1 along the
 * length — which is what lets the lace tile down it and the reveal travel
 * along it.
 */
function ribbonGeometry(curve, { segments = 220, width = 0.13, taper = true } = {}) {
  const viewward = new Vector3(0, 0, 1);
  const pos = new Float32Array((segments + 1) * 2 * 3);
  const uv = new Float32Array((segments + 1) * 2 * 2);
  const nor = new Float32Array((segments + 1) * 2 * 3);
  const idx = [];

  const p = new Vector3();
  const t = new Vector3();
  const side = new Vector3();

  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    curve.getPointAt(u, p);
    curve.getTangentAt(u, t);

    side.crossVectors(t, viewward);
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize();

    // Taper both ends to nothing, so the ribbon enters and leaves the frame
    // as a stroke rather than as a cut-off rectangle.
    const w = width * (taper ? Math.sin(Math.PI * u) ** 0.42 : 1) * 0.5;

    for (let s = 0; s < 2; s++) {
      const sign = s === 0 ? -1 : 1;
      const k = (i * 2 + s) * 3;
      pos[k]     = p.x + side.x * w * sign;
      pos[k + 1] = p.y + side.y * w * sign;
      pos[k + 2] = p.z + side.z * w * sign;
      nor[k] = 0; nor[k + 1] = 0; nor[k + 2] = 1;

      const j = (i * 2 + s) * 2;
      uv[j] = u;
      uv[j + 1] = s;
    }

    if (i < segments) {
      const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
      idx.push(a, b, c, b, d, c);
    }
  }

  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(pos, 3));
  geo.setAttribute("normal", new BufferAttribute(nor, 3));
  geo.setAttribute("uv", new BufferAttribute(uv, 2));
  geo.setIndex(idx);
  return geo;
}

/**
 * The mandorla — the pointed oval the pod is cut from, and the same curve the
 * leaf motif uses. Two mirrored cubics from tip to tip, with the widest point
 * pushed a little below centre so it sits like a seed rather than a lens.
 */
function mandorla(halfWidth, halfHeight, { belly = -0.06, tip = 0.56 } = {}) {
  const w = halfWidth;
  const h = halfHeight;
  const y = belly * h;
  const s = new Shape();
  s.moveTo(0, -h);
  s.bezierCurveTo(w * tip, -h * 0.72, w, y - h * 0.34, w, y);
  s.bezierCurveTo(w, y + h * 0.40, w * tip, h * 0.74, 0, h);
  s.bezierCurveTo(-w * tip, h * 0.74, -w, y + h * 0.40, -w, y);
  s.bezierCurveTo(-w, y - h * 0.34, -w * tip, -h * 0.72, 0, -h);
  return s;
}

/** A slab with soft shoulders and a narrower hip — the figure's torso. */
function torsoShape(shoulder, hip, height) {
  const s = new Shape();
  s.moveTo(-hip, 0);
  s.bezierCurveTo(-hip * 1.04, height * 0.34, -shoulder * 0.96, height * 0.62, -shoulder, height * 0.90);
  s.quadraticCurveTo(-shoulder, height, -shoulder * 0.72, height);
  s.lineTo(shoulder * 0.72, height);
  s.quadraticCurveTo(shoulder, height, shoulder, height * 0.90);
  s.bezierCurveTo(shoulder * 0.96, height * 0.62, hip * 1.04, height * 0.34, hip, 0);
  s.quadraticCurveTo(0, -height * 0.055, -hip, 0);
  return s;
}

/** The head's silhouette, revolved: round crown, soft chin. */
const HEAD_PROFILE = [
  [0.000, 0.000], [0.086, 0.030], [0.158, 0.098], [0.222, 0.198],
  [0.268, 0.312], [0.296, 0.446], [0.304, 0.578], [0.294, 0.700],
  [0.260, 0.810], [0.198, 0.900], [0.110, 0.963], [0.000, 1.000],
];

/* ================================================================== *
 * The figure
 * ================================================================== */

/*
 * Proportion is the whole ballgame here, and it is not human. Measured off the
 * reference, as a fraction of the figure's full height:
 *
 *   head 21%   ·   neck 13%   ·   torso 45%   ·   legs 22%
 *
 * A long torso over short legs under a long neck and a large head. Get those
 * four numbers wrong and no amount of shading rescues it — the first pass had
 * human legs and a stub torso, and read as a lamp.
 */
const BODY = {
  foot:   -2.30,
  hip:    -1.28,   // legs 1.02
  chest:   0.77,   // torso 2.05
  jaw:     1.38,   // neck 0.61
  head:    0.96,   // crown at 2.34
  shoulder: 0.355, // half-widths
  waist:    0.250,
};

function buildFigure({ gild, vine, theme }) {
  const g = new Group();
  const skin = () => gildedMaterial({ gild, theme, gildScale: 2.2, gildAmount: 0.22 });

  const TORSO_H = BODY.chest - BODY.hip;

  // --- head ------------------------------------------------------------
  const headGeo = new LatheGeometry(
    HEAD_PROFILE.map(([x, y]) => new Vector2(x * BODY.head, y * BODY.head)),
    56
  );
  const head = new Mesh(headGeo, skin());
  head.position.y = BODY.jaw;      // the profile starts at the chin
  head.scale.z = 0.68;             // pressed flat, as illustrated
  g.add(head);

  // --- face ------------------------------------------------------------
  // The eyes are the only part of the entity that emits its own light, so
  // they are drawn as geometry with a plain bright material rather than
  // painted into a texture the gild would then shade down.
  const eyeInk = new MeshBasicMaterial({ color: theme === "dark" ? 0xfff6dc : 0xfffdf2 });
  const face = new Group();
  face.position.y = BODY.jaw + BODY.head * 0.50;
  g.add(face);

  // The head is a lathe scaled to 0.68 in z, so at the eye height its surface
  // sits at z = 0.68 * sqrt(r^2 - x^2) ≈ 0.162. The first pass put the eyes at
  // 0.152 — inside the skull, which is why the face read as blank.
  const EYE_X = 0.148;
  const EYE_Z = 0.190;
  for (const dir of [-1, 1]) {
    // A filled almond, with a concentric line outside it. A ring plus a
    // separate pupil left a dark gap between the two and read as a fried egg.
    const eye = new Mesh(new CircleGeometry(0.062, 28), eyeInk);
    eye.position.set(dir * EYE_X, 0, EYE_Z);
    eye.rotation.y = dir * 0.24;
    eye.scale.y = 0.58;
    face.add(eye);

    const ring = new Mesh(new RingGeometry(0.080, 0.091, 36), eyeInk);
    ring.position.set(dir * EYE_X, 0, EYE_Z - 0.004);
    ring.rotation.y = dir * 0.24;
    ring.scale.y = 0.58;
    face.add(ring);
  }

  // The ridge from between the eyes to the chin. It exists so the face
  // catches the key light and stops reading as a flat mask.
  const ridge = new Mesh(new CylinderGeometry(0.024, 0.010, 0.34, 12, 1), skin());
  ridge.position.set(0, BODY.jaw + BODY.head * 0.36, 0.130);
  ridge.scale.z = 0.5;
  g.add(ridge);

  // --- neck ------------------------------------------------------------
  const neckH = BODY.jaw - BODY.chest;
  const neck = new Mesh(new CylinderGeometry(0.074, 0.098, neckH + 0.10, 20, 1), skin());
  neck.position.y = BODY.chest + neckH / 2;
  neck.scale.z = 0.86;
  g.add(neck);

  // --- torso -----------------------------------------------------------
  const torsoGeo = new ExtrudeGeometry(torsoShape(BODY.shoulder, BODY.waist, TORSO_H), {
    depth: 0.17, bevelEnabled: true, bevelThickness: 0.042,
    bevelSize: 0.042, bevelSegments: 4, curveSegments: 26,
  });
  torsoGeo.center();
  const torso = new Mesh(torsoGeo, gildedMaterial({ gild, theme, gildScale: 1.4, gildAmount: 0.24 }));
  torso.position.y = BODY.hip + TORSO_H / 2;
  g.add(torso);

  torsoGeo.computeBoundingBox();
  const torsoFrontZ = torsoGeo.boundingBox.max.z;

  // --- the vine ---------------------------------------------------------
  // Its own plane, a whisker in front of the torso's flat face. Keeping it
  // separate is what makes the root-to-tip reveal possible: the mask has
  // clean 0→1 UVs to travel along.
  const vineMat = motifMaterial({ map: vine, theme });
  const vinePlane = new Mesh(new PlaneGeometry(0.58, TORSO_H * 0.86), vineMat);
  vinePlane.position.set(0, BODY.hip + TORSO_H * 0.48, torsoFrontZ + 0.012);
  g.add(vinePlane);

  // --- shoulders, arms, hands --------------------------------------------
  const ARM_X = BODY.shoulder + 0.046;
  const arms = new Group();
  g.add(arms);

  for (const dir of [-1, 1]) {
    // The cap sits at the top of the arm, not on the torso: it is what turns
    // a stick butted against a slab into a shoulder.
    const cap = new Mesh(new SphereGeometry(0.070, 20, 14), skin());
    cap.position.set(dir * ARM_X, BODY.chest - 0.03, 0);
    cap.scale.z = 0.78;
    arms.add(cap);

    const armLen = BODY.chest - BODY.hip - 0.06;
    const arm = new Mesh(new CylinderGeometry(0.058, 0.038, armLen, 16, 1), skin());
    arm.position.set(dir * ARM_X, BODY.hip + armLen / 2 + 0.02, 0);
    arm.rotation.z = dir * -0.038;
    arm.scale.z = 0.84;
    arms.add(arm);

    // Thorn hand. The reference's hands are not hands — they are the plant's
    // defence, four spikes fanning outward from the wrist.
    const hand = new Group();
    hand.position.set(dir * (ARM_X + 0.02), BODY.hip + 0.02, 0);
    arms.add(hand);

    // Angles run from straight up, so anything past a right angle falls
    // below the horizontal — which is where most of the fan wants to be.
    const spikes = [
      { len: 0.48, rot: 1.57, z:  0.00 },
      { len: 0.37, rot: 2.05, z: -0.04 },
      { len: 0.29, rot: 1.18, z:  0.05 },
      { len: 0.22, rot: 2.52, z:  0.02 },
    ];
    for (const sp of spikes) {
      const spike = new Mesh(new ConeGeometry(0.048, sp.len, 10, 1), skin());
      // A cone points +y about its own centre. Rotating by −dir·rot swings the
      // axis to (dir·sin rot, cos rot), so pushing the centre half a length
      // along that axis leaves the base at the wrist and the tip outboard.
      spike.rotation.z = -dir * sp.rot;
      spike.position.set(
        dir * Math.sin(sp.rot) * sp.len * 0.5,
        Math.cos(sp.rot) * sp.len * 0.5,
        sp.z
      );
      spike.scale.z = 0.7;
      hand.add(spike);
    }
  }

  // --- legs -------------------------------------------------------------
  const legLen = BODY.hip - BODY.foot;
  for (const dir of [-1, 1]) {
    const leg = new Mesh(new CylinderGeometry(0.100, 0.076, legLen + 0.06, 18, 1), skin());
    leg.position.set(dir * 0.148, BODY.foot + legLen / 2, 0);
    leg.rotation.z = dir * -0.016;
    leg.scale.z = 0.88;
    g.add(leg);
  }

  return { group: g, head, face, torso, arms, vine: vinePlane, vineMat };
}

/* ================================================================== *
 * The pod
 * ================================================================== */

function buildPod({ gild, fern, lace, theme }) {
  const g = new Group();

  // Measured against the figure: two thirds its height, wider than its torso,
  // and hung low enough that its point drops below the figure's feet.
  const HALF_W = 0.60;
  const HALF_H = 1.66;
  const DEPTH = 0.28;

  // Frame: the outer seed with the inner field cut out of it, so the rim has
  // real thickness and a bevel to catch light on both edges.
  const outer = mandorla(HALF_W, HALF_H);
  outer.holes.push(mandorla(HALF_W * 0.76, HALF_H * 0.87, { tip: 0.62 }));

  const rimGeo = new ExtrudeGeometry(outer, {
    depth: DEPTH, bevelEnabled: true, bevelThickness: 0.042,
    bevelSize: 0.042, bevelSegments: 4, curveSegments: 48,
  });
  normalizeUV(rimGeo);
  const rim = new Mesh(rimGeo, gildedMaterial({
    gild, theme, motif: lace, motifInk: "#FBE8B6", motifGlow: 0.045,
    motifScale: [5, 34],
    gildScale: 2.4, gildAmount: 0.26, doubleSide: true,
  }));
  g.add(rim);

  rimGeo.computeBoundingBox();
  const front = rimGeo.boundingBox.max.z;
  const back = rimGeo.boundingBox.min.z;

  // Face: the field the fern is drawn on, sunk behind the rim so the frame
  // casts its own edge over it.
  const faceGeo = new ShapeGeometry(mandorla(HALF_W * 0.775, HALF_H * 0.882, { tip: 0.62 }), 48);
  normalizeUV(faceGeo);
  // The face is lit flatter and brighter than the frame around it. In the
  // reference the field inside the seed is the lightest thing in the picture
  // after the moon; matching the rim's shading would lose the whole read.
  const face = new Mesh(faceGeo, gildedMaterial({
    gild, theme, motif: fern, motifOpaque: true,
    gildScale: 3.4, gildAmount: 0.10, rimPower: 3.6, haze: 0.55,
  }));
  face.position.z = front - DEPTH * 0.44;
  g.add(face);

  // Back: without this the field is a window onto the sky behind.
  const backGeo = new ShapeGeometry(mandorla(HALF_W, HALF_H), 48);
  normalizeUV(backGeo);
  const backPlate = new Mesh(backGeo, gildedMaterial({
    gild, theme, gildScale: 2.0, gildAmount: 0.18,
  }));
  backPlate.position.z = back + 0.01;
  backPlate.rotation.y = Math.PI;
  g.add(backPlate);

  return { group: g, rim, face, half: { w: HALF_W, h: HALF_H } };
}

/* ================================================================== *
 * The halo
 * ================================================================== */

function buildHalo({ moon }) {
  const mesh = new Mesh(
    new PlaneGeometry(1, 1),
    new MeshBasicMaterial({
      map: moon, transparent: true, depthWrite: false,
      opacity: 1.0, side: DoubleSide,
    })
  );
  // The plane is larger than the visible disc: the texture fades to nothing
  // well before its edge, which is what keeps the glow from having a seam.
  mesh.scale.setScalar(3.85);
  return mesh;
}

/* ================================================================== *
 * The serpents
 * ================================================================== */

function buildSerpents({ lace, theme }) {
  const g = new Group();

  // Hand-placed control points, all of them well behind the two bodies. The
  // first pass ran them across the frame at full brightness and they read as
  // searchlights; here they loop through the upper left and lower right and
  // never cross in front of anything.
  const paths = [
    [
      [-4.9, 1.55, -2.6], [-3.2, 2.55, -2.2], [-1.4, 2.05, -1.9],
      [0.4, 2.60, -1.8], [2.1, 2.10, -2.0], [3.1, 1.20, -2.5],
      [2.6, 0.35, -3.0], [1.2, 0.72, -3.3], [-0.5, 1.25, -3.4],
      [-2.4, 0.80, -3.6], [-4.0, 0.15, -3.9],
    ],
    [
      [4.9, -1.45, -2.7], [3.1, -2.25, -2.2], [1.4, -1.75, -1.9],
      [-0.3, -2.40, -1.9], [-2.0, -1.90, -2.2], [-3.3, -2.65, -2.7],
      [-4.6, -2.10, -3.2],
    ],
  ];

  const meshes = paths.map((pts, i) => {
    const curve = new CatmullRomCurve3(
      pts.map(([x, y, z]) => new Vector3(x, y, z)), false, "catmullrom", 0.42
    );
    const geo = ribbonGeometry(curve, { segments: 260, width: i === 0 ? 0.36 : 0.28 });
    const map = lace.clone();
    map.repeat.set(i === 0 ? 20 : 15, 1);
    map.needsUpdate = true;

    const mesh = new Mesh(geo, new MeshBasicMaterial({
      map,
      transparent: true,
      opacity: theme === "dark" ? 0.09 : 0.30,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
    }));
    g.add(mesh);
    return mesh;
  });

  return { group: g, meshes };
}

/* ================================================================== *
 * Assembly
 * ================================================================== */

export function buildEntity({ gild, vine, fern, lace, moon, theme = "light" }) {
  const root = new Group();

  const figure = buildFigure({ gild, vine, theme });
  figure.group.position.set(-0.74, 0, 0);
  figure.group.rotation.y = 0.09;   // see FIG_REST_Y in scene.js
  root.add(figure.group);

  const pod = buildPod({ gild, fern, lace, theme });
  pod.group.position.set(0.82, -0.86, -0.20);
  pod.group.rotation.y = -0.13;     // see POD_REST_Y in scene.js
  root.add(pod.group);

  const halo = buildHalo({ moon });
  halo.position.set(-0.76, 1.90, -0.90);
  root.add(halo);

  const serpents = buildSerpents({ lace, theme });
  root.add(serpents.group);

  return { root, figure, pod, halo, serpents };
}
