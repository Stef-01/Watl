/**
 * A compact parametric, stochastic L-system for a flowering Golden Wattle branch.
 *
 * The grammar follows the developmental model described by Prusinkiewicz and
 * Lindenmayer: every apical module is rewritten in parallel, brackets preserve
 * turtle state for lateral axes, and parameters carry vigor, branch order and
 * developmental age through the derivation. Geometry is deliberately kept out
 * of this module so the grammar remains deterministic and testable.
 */

export const WATTLE_GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
export const WATTLE_BUD_BIRTH = 0.72;

const TAU = Math.PI * 2;
const WORLD_UP = Object.freeze([0, 1, 0]);

const QUALITY = Object.freeze({
  low: Object.freeze({
    iterations: 5,
    maxOrder: 3,
    lateralChance: 0.74,
    forkChance: 0.18,
    maxBuds: 44,
  }),
  high: Object.freeze({
    iterations: 6,
    maxOrder: 3,
    lateralChance: 0.82,
    forkChance: 0.24,
    maxBuds: 72,
  }),
});

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function hash32(value) {
  let x = value >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

function childSeed(parent, salt) {
  return hash32(parent ^ Math.imul(salt + 1, 0x9e3779b9));
}

function unitRandom(seed) {
  return hash32(seed) / 4294967296;
}

function signedRandom(seed) {
  return unitRandom(seed) * 2 - 1;
}

function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scale(vector, amount) {
  return [vector[0] * amount, vector[1] * amount, vector[2] * amount];
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalize(vector) {
  const length = Math.hypot(vector[0], vector[1], vector[2]) || 1;
  return scale(vector, 1 / length);
}

function rotateAround(vector, axis, angle) {
  const normalizedAxis = normalize(axis);
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return add(
    add(scale(vector, cosine), scale(cross(normalizedAxis, vector), sine)),
    scale(normalizedAxis, dot(normalizedAxis, vector) * (1 - cosine)),
  );
}

function cloneState(state) {
  return {
    position: [...state.position],
    heading: [...state.heading],
    left: [...state.left],
    up: [...state.up],
  };
}

function orthonormalize(state) {
  state.heading = normalize(state.heading);
  state.left = normalize(cross(state.up, state.heading));
  state.up = normalize(cross(state.heading, state.left));
}

function turnPitch(state, angle) {
  state.heading = rotateAround(state.heading, state.left, angle);
  state.up = rotateAround(state.up, state.left, angle);
  orthonormalize(state);
}

function turnRoll(state, angle) {
  state.left = rotateAround(state.left, state.heading, angle);
  state.up = rotateAround(state.up, state.heading, angle);
  orthonormalize(state);
}

function developmentalWindow(generation, iterations, order) {
  const generationT = generation / Math.max(1, iterations - 1);
  const orderLag = order * 0.035;
  const start = generation === 0 && order === 0
    ? 0
    : Math.min(0.665, clamp01(0.035 + generationT * 0.56 + orderLag));
  return [start, Math.min(0.7, start + 0.11 + order * 0.015)];
}

function apex(params) {
  return { symbol: "A", ...params };
}

function rewriteApex(module, generation, config) {
  const seed = module.seed;
  const [birth, mature] = developmentalWindow(generation, config.iterations, module.order);
  const lengthNoise = 1 + signedRandom(childSeed(seed, 1)) * 0.11;
  const length = module.length * lengthNoise;
  const segment = {
    symbol: "F",
    order: module.order,
    length,
    radius: module.radius,
    birth,
    mature,
    seed: childSeed(seed, 2),
  };
  const result = [segment];

  const juvenile = module.order === 0 && generation === 0;
  const leafBearing = juvenile || generation >= 1;
  if (leafBearing) {
    const phyllodeSeed = childSeed(seed, 18);
    const leafBirth = Math.min(0.7, mature + 0.025 + module.order * 0.012);
    /* The supplied Golden Wattle references carry one long, narrow, leathery
       phyllode at each node. They alternate around the axis and taper to an
       acute point; they are not compound fern sprays or continuous stem wings. */
    result.push({
      symbol: "L",
      order: module.order,
      phase: module.azimuth
        + ((generation + module.order) % 2) * Math.PI * 0.5
        + signedRandom(childSeed(seed, 10)) * 0.16,
      length: length * (1.52 + unitRandom(childSeed(seed, 11)) * 0.48),
      width: (juvenile ? 0.115 : 0.135)
        + unitRandom(childSeed(seed, 14)) * (juvenile ? 0.03 : 0.045),
      birth: leafBirth,
      mature: Math.min(0.82, leafBirth + 0.14),
      continuousWithStem: false,
      wingSides: 0,
      freeTipRatio: 0.82 + unitRandom(childSeed(seed, 15)) * 0.12,
      flowerEligible: !juvenile && generation >= 2,
      seed: phyllodeSeed,
    });
  }

  const canBranch = module.order < config.maxOrder && generation < config.iterations - 1;
  const branchRoll = unitRandom(childSeed(seed, 21));
  const branchChance = module.order === 0
    ? 1
    : config.lateralChance - module.order * 0.09;

  if (canBranch && branchRoll < branchChance) {
    const branchSeed = childSeed(seed, 22);
    const inclination = (module.order === 0 ? 0.58 : 0.48)
      + signedRandom(childSeed(seed, 23)) * (module.order === 0 ? 0.16 : 0.19);
    const roll = module.azimuth + signedRandom(childSeed(seed, 24)) * 0.2;
    const branchVigor = module.vigor * (module.order === 0 ? 0.88 : 0.76)
      * (0.92 + unitRandom(childSeed(seed, 25)) * 0.16);
    result.push(
      { symbol: "[" },
      { symbol: "/", angle: roll },
      { symbol: "&", angle: inclination },
      apex({
        order: module.order + 1,
        vigor: branchVigor,
        length: module.length * (module.order === 0 ? 1.08 : 0.82),
        radius: module.radius * (module.order === 0 ? 0.42 : 0.5),
        azimuth: WATTLE_GOLDEN_ANGLE * (1 + unitRandom(childSeed(seed, 26)) * 0.18),
        seed: branchSeed,
      }),
      { symbol: "]" },
    );

    if (module.order > 0 && unitRandom(childSeed(seed, 27)) < config.forkChance) {
      result.push(
        { symbol: "[" },
        { symbol: "/", angle: roll + Math.PI * (0.74 + unitRandom(childSeed(seed, 28)) * 0.2) },
        { symbol: "&", angle: inclination * (0.82 + unitRandom(childSeed(seed, 29)) * 0.16) },
        apex({
          order: module.order + 1,
          vigor: branchVigor * 0.82,
          length: module.length * 0.66,
          radius: module.radius * 0.5,
          azimuth: WATTLE_GOLDEN_ANGLE,
          seed: childSeed(seed, 30),
        }),
        { symbol: "]" },
      );
    }
  }

  const continuationVigor = module.vigor * (module.order === 0 ? 0.93 : 0.8);
  const continuationLength = module.length * (module.order === 0 ? 1.015 : 0.84);
  if (continuationVigor > 0.2 && generation < config.iterations - 1) {
    result.push(
      { symbol: "/", angle: WATTLE_GOLDEN_ANGLE + signedRandom(childSeed(seed, 31)) * 0.12 },
      apex({
        order: module.order,
        vigor: continuationVigor,
        length: continuationLength,
        radius: module.radius * (module.order === 0 ? 0.83 : 0.75),
        azimuth: module.azimuth + WATTLE_GOLDEN_ANGLE,
        seed: childSeed(seed, 32),
      }),
    );
  } else {
    result.push({
      symbol: "K",
      order: module.order,
      vigor: module.vigor,
      birth: WATTLE_BUD_BIRTH + unitRandom(childSeed(seed, 33)) * 0.11,
      seed: childSeed(seed, 34),
    });
  }

  return result;
}

export function deriveWattleSentence(seed, quality = "high") {
  const config = QUALITY[quality] ?? QUALITY.high;
  let sentence = [apex({
    order: 0,
    vigor: 1,
    length: 0.82,
    radius: 0.065,
    azimuth: unitRandom(seed) * TAU,
    seed: hash32(seed),
  })];

  for (let generation = 0; generation < config.iterations; generation += 1) {
    const next = [];
    for (const module of sentence) {
      if (module.symbol === "A") next.push(...rewriteApex(module, generation, config));
      else next.push(module);
    }
    sentence = next;
  }

  for (let index = 0; index < sentence.length; index += 1) {
    const module = sentence[index];
    if (module.symbol !== "A") continue;
    sentence[index] = {
      symbol: "K",
      order: module.order,
      vigor: module.vigor,
      birth: WATTLE_BUD_BIRTH + unitRandom(childSeed(module.seed, 41)) * 0.11,
      seed: childSeed(module.seed, 42),
    };
  }

  return sentence;
}

export function interpretWattleSentence(sentence, quality = "high") {
  const config = QUALITY[quality] ?? QUALITY.high;
  const segments = [];
  const leaves = [];
  const buds = [];
  const stack = [];
  const state = {
    position: [0, 0, 0],
    /* The cut end is below. The primary axis rises with a restrained leftward
       lean, so it reads as one upright branch rather than a miniature tree or
       a perfectly vertical diagram. */
    heading: normalize([-0.26, 1, -0.025]),
    left: normalize([0, 0.025, 1]),
    up: normalize([1, 0.18, -0.004]),
  };
  const budsByOrder = [0, 0, 0, 0];
  const orderBudLimits = quality === "high"
    ? [16, 20, 18, 18]
    : [8, 12, 12, 12];

  const addAxillaryRaceme = (module, terminal = false) => {
    const orderIndex = Math.min(orderBudLimits.length - 1, Math.max(0, module.order));
    const remaining = Math.min(
      config.maxBuds - buds.length,
      orderBudLimits[orderIndex] - budsByOrder[orderIndex],
    );
    if (remaining <= 0) return;

    const racemeId = `axil-${module.seed.toString(16)}`;
    const phase = Number.isFinite(module.phase)
      ? module.phase + Math.PI * 0.5
      : unitRandom(childSeed(module.seed, 51)) * TAU;
    const radial = normalize(add(
      scale(state.left, Math.cos(phase)),
      scale(state.up, Math.sin(phase)),
    ));
    const racemeDirection = normalize(add(
      add(scale(radial, terminal ? 0.68 : 0.76), scale(state.heading, terminal ? 0.26 : 0.18)),
      scale(WORLD_UP, terminal ? -0.2 : -0.38),
    ));
    const racemeStart = [...state.position];
    const racemeLength = (terminal ? 0.34 : 0.4)
      + unitRandom(childSeed(module.seed, 70)) * (terminal ? 0.16 : 0.2);
    const racemeEnd = add(racemeStart, scale(racemeDirection, racemeLength));
    const axisBirth = 0.655 + unitRandom(childSeed(module.seed, 53)) * 0.035;
    segments.push({
      start: racemeStart,
      end: racemeEnd,
      direction: racemeDirection,
      radius: 0.0065 + (module.vigor ?? 0.55) * 0.002,
      order: module.order + 1,
      kind: "flower-raceme",
      racemeId,
      racemePosition: 0,
      birth: axisBirth,
      mature: Math.min(0.735, axisBirth + 0.06),
      seed: childSeed(module.seed, 80),
    });
    const requestedHeads = 3
      + Math.floor(unitRandom(childSeed(module.seed, 81)) * (terminal ? 3 : 4));
    const headCount = Math.min(remaining, requestedHeads);
    const lateral = normalize(cross(racemeDirection, state.heading));
    const radialB = normalize(cross(racemeDirection, lateral));
    const budBirth = Math.max(WATTLE_BUD_BIRTH, Math.min(0.88, module.birth ?? WATTLE_BUD_BIRTH));

    for (let index = 0; index < headCount; index += 1) {
      const headSeed = childSeed(module.seed, 90 + index * 7);
      const t = (index + 0.65) / Math.max(1, headCount + 0.05);
      const axisPoint = add(racemeStart, scale(racemeDirection, racemeLength * t));
      const headAngle = index * WATTLE_GOLDEN_ANGLE + phase * 0.37;
      const headRadial = normalize(add(
        scale(lateral, Math.cos(headAngle)),
        scale(radialB, Math.sin(headAngle)),
      ));
      const pedicelDirection = normalize(add(
        add(scale(headRadial, 0.84 + unitRandom(childSeed(headSeed, 1)) * 0.14), scale(racemeDirection, 0.18)),
        scale(WORLD_UP, -0.08 + signedRandom(childSeed(headSeed, 2)) * 0.08),
      ));
      const pedicelLength = 0.08 + unitRandom(childSeed(headSeed, 3)) * 0.075;
      const headPosition = add(axisPoint, scale(pedicelDirection, pedicelLength));
      segments.push({
        start: axisPoint,
        end: headPosition,
        direction: pedicelDirection,
        radius: 0.0048 + (module.vigor ?? 0.55) * 0.0014,
        order: module.order + 2,
        kind: "flower-pedicel",
        racemeId,
        racemePosition: t,
        birth: Math.min(0.78, axisBirth + 0.012 + t * 0.035),
        mature: Math.min(0.82, axisBirth + 0.07 + t * 0.045),
        seed: childSeed(headSeed, 4),
      });
      buds.push({
        position: headPosition,
        direction: pedicelDirection,
        radius: 0.155 + (module.vigor ?? 0.55) * 0.042
          + unitRandom(childSeed(headSeed, 5)) * 0.017,
        order: module.order,
        racemeId,
        racemePosition: t,
        racemeHeadIndex: index,
        racemeHeadCount: headCount,
        axillary: !terminal,
        birth: Math.min(0.94, budBirth + t * 0.045),
        mature: Math.min(0.99, budBirth + 0.14 + t * 0.055),
        seed: childSeed(headSeed, 6),
      });
      budsByOrder[orderIndex] += 1;
    }
  };

  for (const module of sentence) {
    if (module.symbol === "[") {
      stack.push(cloneState(state));
    } else if (module.symbol === "]") {
      const restored = stack.pop();
      if (!restored) throw new Error("Unbalanced wattle L-system branch stack");
      Object.assign(state, restored);
    } else if (module.symbol === "/") {
      turnRoll(state, module.angle);
    } else if (module.symbol === "&") {
      turnPitch(state, module.angle);
    } else if (module.symbol === "F") {
      const upwardTropism = module.order === 0 ? 0.024 : Math.max(0.005, 0.02 - module.order * 0.004);
      const peripheralSag = module.order >= 1 ? 0.026 * module.order : 0;
      state.heading = normalize(add(
        state.heading,
        scale(WORLD_UP, upwardTropism - peripheralSag),
      ));
      orthonormalize(state);
      const start = [...state.position];
      const end = add(start, scale(state.heading, module.length));
      segments.push({
        start,
        end,
        direction: [...state.heading],
        radius: module.radius,
        order: module.order,
        birth: module.birth,
        mature: module.mature,
        seed: module.seed,
      });
      state.position = end;
    } else if (module.symbol === "L") {
      const phase = module.phase + signedRandom(childSeed(module.seed, 120)) * 0.12;
      const radial = normalize(add(
        scale(state.left, Math.cos(phase)),
        scale(state.up, Math.sin(phase)),
      ));
      const direction = normalize(add(
        add(scale(radial, 0.78), scale(state.heading, 0.34)),
        scale(WORLD_UP, module.order >= 2 ? -0.08 : 0.06),
      ));
      const position = add(state.position, scale(state.heading, -0.035));
      leaves.push({
        position,
        direction,
        length: module.length,
        width: module.width,
        roll: module.phase,
        order: module.order,
        form: "narrow-lanceolate-phyllode",
        continuousWithStem: module.continuousWithStem,
        wingSides: module.wingSides,
        freeTipRatio: module.freeTipRatio,
        birth: module.birth,
        mature: module.mature,
        seed: module.seed,
      });
      const flowerThreshold = module.order === 0
        ? 0.12
        : module.order === 1
          ? 0.38
          : quality === "high"
            ? 0.74
            : 0.8;
      if (
        module.flowerEligible
        && unitRandom(childSeed(module.seed, 111)) > flowerThreshold
      ) {
        addAxillaryRaceme(module, false);
      }
    } else if (module.symbol === "K") {
      addAxillaryRaceme(module, true);
    }
  }

  if (stack.length) throw new Error("Unclosed wattle L-system branch stack");

  buds.sort((a, b) => a.birth - b.birth || Number(a.axillary) - Number(b.axillary) || a.seed - b.seed);

  return { segments, leaves, buds };
}

export function generateWattleArchitecture({ seed, quality = "high" }) {
  const sentence = deriveWattleSentence(seed, quality);
  return {
    sentence,
    ...interpretWattleSentence(sentence, quality),
  };
}
