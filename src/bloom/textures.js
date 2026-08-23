/**
 * Every motif in the poster is line-work: a vine climbing the figure's chest,
 * a fern held inside the pod, lace scales running along the serpents, craters
 * in the moon. None of it wants to be a shipped PNG — it is all describable,
 * it all needs to be crisp at whatever DPR the visitor has, and it all needs
 * to recolour when the theme flips.
 *
 * So it is drawn once into an offscreen canvas at load and handed to Three as
 * a texture. Two upsides beyond weight: the drawing code *is* the artwork, so
 * a leaf can be retuned by changing a number; and each motif is deterministic
 * from a seed, so the same page never renders two different vines.
 */
import { CanvasTexture, RepeatWrapping, SRGBColorSpace, LinearFilter } from "three";

/** A tiny seeded PRNG — the motifs must be identical on every reload. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function surface(w, h) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  return { canvas, ctx };
}

function finish(canvas, { repeat = false, srgb = true } = {}) {
  const tex = new CanvasTexture(canvas);
  if (srgb) tex.colorSpace = SRGBColorSpace;
  if (repeat) {
    tex.wrapS = tex.wrapT = RepeatWrapping;
  }
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/* ------------------------------------------------------------------ *
 * 1. The leaf
 *
 * One primitive, used at four scales across the piece.
 *
 * The first version put its widest point at 34% of the length with a blunt
 * tip, and mirrored pairs of it read as tulips — or, at small sizes, as
 * bats. A leaf is lanceolate: widest around 40%, and drawn out to an actual
 * point. Cubics rather than quadratics, so the shoulder and the tip can be
 * shaped independently.
 * ------------------------------------------------------------------ */
function leafPath(ctx, len, width, curl) {
  const c = curl * len;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(width, -len * 0.20 + c, width * 0.80, -len * 0.68, 0, -len);
  ctx.bezierCurveTo(-width * 0.80, -len * 0.68, -width, -len * 0.20 - c, 0, 0);
  ctx.closePath();
}

/* ------------------------------------------------------------------ *
 * 2. The climbing vine — the motif on the figure's chest
 *
 * A straight stem with leaves in alternating pairs, each pair rotated a
 * little further out than the last, tapering as it climbs. Drawn light on
 * transparent so it can be used as an emissive mask: where the vine is,
 * the figure glows.
 * ------------------------------------------------------------------ */
export function vineTexture({
  size = 512,
  pairs = 12,
  ink = "#FFF6DC",
  stroke = 3.4,
  seed = 7,
  dots = true,
} = {}) {
  const w = size >> 1;
  const h = size;
  const { canvas, ctx } = surface(w, h);
  const rand = rng(seed);
  const cx = w / 2;

  // Stem: bottom to top, with a barely-there sway so it is not a ruler line.
  ctx.strokeStyle = ink;
  ctx.lineWidth = stroke;
  ctx.beginPath();
  ctx.moveTo(cx, h * 0.97);
  for (let i = 1; i <= 24; i++) {
    const t = i / 24;
    ctx.lineTo(cx + Math.sin(t * 5.4 + seed) * w * 0.012, h * (0.97 - t * 0.9));
  }
  ctx.stroke();

  const top = h * 0.075;
  const bottom = h * 0.9;

  for (let i = 0; i < pairs; i++) {
    const t = i / (pairs - 1);
    const y = bottom - (bottom - top) * t;
    // Leaves shrink as the vine climbs — a real plant's habit, and it also
    // reads as perspective on a flat chest.
    const len = h * (0.132 - t * 0.044) * (0.94 + rand() * 0.12);
    const wide = len * 0.33;
    const lean = 1.02 + t * 0.12;

    for (const dir of [-1, 1]) {
      ctx.save();
      ctx.translate(cx + dir * stroke * 0.4, y);
      ctx.rotate(dir * lean);
      leafPath(ctx, len, wide, 0.06 * dir);
      ctx.fillStyle = ink;
      ctx.globalAlpha = 0.92;
      ctx.fill();
      ctx.globalAlpha = 1;

      if (dots) {
        // The seed inside each leaf. Punched out rather than painted, so it
        // reads as an absence of glow. Kept small and low — high and large,
        // it notched the tip and the pair turned into a butterfly.
        ctx.beginPath();
        ctx.arc(0, -len * 0.42, Math.max(1.0, len * 0.045), 0, Math.PI * 2);
        ctx.globalCompositeOperation = "destination-out";
        ctx.fill();
        ctx.globalCompositeOperation = "source-over";
      }
      ctx.restore();
    }
  }

  return finish(canvas);
}

/* ------------------------------------------------------------------ *
 * 3. The fern inside the pod
 *
 * Same anatomy, inverted tonally: dark leaves on a light field, larger and
 * fewer, each holding two seeds. This one is opaque — it is the pod's face,
 * not a glow.
 * ------------------------------------------------------------------ */
export function fernTexture({
  size = 1024,
  pairs = 10,
  field = "#FDF2CC",
  ink = "#2E2007",
  seed = 19,
} = {}) {
  const w = size >> 1;
  const h = size;
  const { canvas, ctx } = surface(w, h);
  const rand = rng(seed);
  const cx = w / 2;

  ctx.fillStyle = field;
  ctx.fillRect(0, 0, w, h);

  // A whisper of curl-work behind the fern, so the field is never flat.
  ctx.strokeStyle = "rgba(140, 100, 20, 0.20)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 26; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const r = 8 + rand() * 26;
    ctx.beginPath();
    ctx.arc(x, y, r, rand() * 6, rand() * 6 + 2.4);
    ctx.stroke();
  }

  ctx.strokeStyle = ink;
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.moveTo(cx, h * 0.95);
  ctx.lineTo(cx, h * 0.06);
  ctx.stroke();

  const top = h * 0.1;
  const bottom = h * 0.88;

  for (let i = 0; i < pairs; i++) {
    const t = i / (pairs - 1);
    const y = bottom - (bottom - top) * t;
    const len = h * (0.162 - t * 0.052) * (0.95 + rand() * 0.10);
    const wide = len * 0.35;
    const lean = 1.04 + t * 0.12;

    for (const dir of [-1, 1]) {
      ctx.save();
      ctx.translate(cx, y);
      ctx.rotate(dir * lean);
      leafPath(ctx, len, wide, 0.08 * dir);
      ctx.fillStyle = ink;
      ctx.fill();

      ctx.fillStyle = field;
      for (const at of [0.34, 0.56]) {
        ctx.beginPath();
        ctx.arc(dir * len * 0.03, -len * at, Math.max(1.1, len * 0.036), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  return finish(canvas);
}

/* ------------------------------------------------------------------ *
 * 4. Lace — the scale pattern on the serpents and the pod's rim
 *
 * A tiling band of interlocking cells, each with a dot. Tiles on x so it can
 * run the length of any tube; it is the one texture here that repeats.
 * ------------------------------------------------------------------ */
export function laceTexture({ size = 512, rows = 3, cols = 10, ink = "#FFFFFF", seed = 3 } = {}) {
  const { canvas, ctx } = surface(size, size >> 2);
  const w = canvas.width;
  const h = canvas.height;
  const rand = rng(seed);

  ctx.strokeStyle = ink;
  ctx.lineWidth = 2.4;

  const cw = w / cols;
  const ch = h / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Offset alternate rows so the cells interlock rather than grid up.
      const x = c * cw + (r % 2 ? cw * 0.5 : 0);
      const y = r * ch;
      const pad = cw * 0.14;
      const rad = ch * 0.42;

      ctx.beginPath();
      ctx.roundRect(x + pad, y + pad * 0.7, cw - pad * 2, ch - pad * 1.4, rad);
      ctx.stroke();

      if (rand() > 0.35) {
        ctx.beginPath();
        ctx.arc(x + cw / 2, y + ch / 2, Math.max(1.2, ch * 0.1), 0, Math.PI * 2);
        ctx.fillStyle = ink;
        ctx.fill();
      }
    }
  }

  // Rails top and bottom — the serpent has an outline, not just an infill.
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 1.5); ctx.lineTo(w, 1.5);
  ctx.moveTo(0, h - 1.5); ctx.lineTo(w, h - 1.5);
  ctx.stroke();

  return finish(canvas, { repeat: true });
}

/* ------------------------------------------------------------------ *
 * 5. The moon
 *
 * A bright disc that has to survive being looked at directly: a hot core, a
 * long soft shoulder, and enough crater mottling that it reads as a body and
 * not as a lens flare.
 * ------------------------------------------------------------------ */
export function moonTexture({ size = 512, seed = 11, warm = "#FFFFFF", edge = "#FFF6DC" } = {}) {
  const { canvas, ctx } = surface(size, size);
  const rand = rng(seed);
  const c = size / 2;

  const g = ctx.createRadialGradient(c, c * 0.92, 0, c, c, c);
  // A long shoulder, and a core that is bright rather than white-hot. The
  // first pass put the full-strength stop at 52% and the disc read as a sun
  // with a bloom ring around it.
  g.addColorStop(0.00, warm);
  g.addColorStop(0.38, warm);
  g.addColorStop(0.52, edge);
  g.addColorStop(0.66, "rgba(252,240,202,0.66)");
  g.addColorStop(0.84, "rgba(245,214,140,0.26)");
  g.addColorStop(1.00, "rgba(233,180,76,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(c, c, c, 0, Math.PI * 2);
  ctx.fill();

  // Craters, clipped to the disc and kept inside the bright zone so the
  // soft shoulder stays clean.
  ctx.save();
  ctx.beginPath();
  ctx.arc(c, c, c * 0.86, 0, Math.PI * 2);
  ctx.clip();
  for (let i = 0; i < 54; i++) {
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * c * 0.74;
    const r = 10 + rand() * 34;
    ctx.beginPath();
    ctx.arc(c + Math.cos(a) * d, c + Math.sin(a) * d, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(226,196,132,${0.03 + rand() * 0.05})`;
    ctx.fill();
  }
  ctx.restore();

  return finish(canvas);
}

/* ------------------------------------------------------------------ *
 * 6. Bokeh — one out-of-focus bloom, reused a hundred times
 *
 * Not a plain radial: real defocused highlights are brightest just inside
 * their rim, and a wattle head is a ball of anthers, so a faint five-lobe
 * modulation goes in too. Both details are what stop an instanced field of
 * these from reading as dots.
 * ------------------------------------------------------------------ */
export function bokehTexture({ size = 256, lobes = 5, wobble = 0.028 } = {}) {
  const { canvas, ctx } = surface(size, size);
  const c = size / 2;
  const img = ctx.createImageData(size, size);
  const d = img.data;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - c) / c;
      const dy = (y - c) / c;
      const r = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx);

      // Petal modulation: a gentle wobble of the outer radius.
      // A wattle head is a ball of anthers, so the outline gets a five-lobe
      // wobble. The far field takes a whisper of it (any more and it renders
      // as pentagons); the near field, drawn at three times the size, takes
      // enough to read as an actual flower.
      const rim = 1 + Math.cos(a * lobes) * wobble;
      const t = Math.min(1, r / rim);

      // A filled soft body with a slightly brighter rim. Both extremes were
      // wrong: no rim at all and every instance is a featureless smudge; rim
      // without body and the field turns into a wall of soap bubbles.
      let v = Math.pow(Math.max(0, 1 - t), 1.45) * 0.92;
      v += Math.exp(-Math.pow((t - 0.84) / 0.19, 2)) * 0.22;
      v = Math.min(1, v) * (t < 1 ? 1 : 0);

      const i = (y * size + x) * 4;
      d[i] = 255;
      d[i + 1] = 250;
      d[i + 2] = 232;
      d[i + 3] = Math.round(v * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return finish(canvas, { srgb: false });
}

/* ------------------------------------------------------------------ *
 * 7. Sprigs — the thin flowering stems along the bottom edge
 * ------------------------------------------------------------------ */
export function sprigTexture({ w = 1024, h = 384, stems = 44, seed = 23, ink = "#D5AE55" } = {}) {
  const { canvas, ctx } = surface(w, h);
  const rand = rng(seed);

  for (let s = 0; s < stems; s++) {
    const x0 = rand() * w;
    const tall = h * (0.35 + rand() * 0.6);
    const bend = (rand() - 0.5) * w * 0.05;
    const alpha = 0.24 + rand() * 0.4;

    ctx.strokeStyle = ink;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 1.2 + rand() * 1.4;
    ctx.beginPath();
    ctx.moveTo(x0, h);
    ctx.quadraticCurveTo(x0 + bend * 0.5, h - tall * 0.55, x0 + bend, h - tall);
    ctx.stroke();

    // Buds: small circles clustered toward the tip, thinning downward.
    const buds = 12 + Math.floor(rand() * 14);
    ctx.fillStyle = ink;
    for (let b = 0; b < buds; b++) {
      const t = 0.22 + (b / buds) * 0.78 + (rand() - 0.5) * 0.06;
      const bx = x0 + bend * t + (rand() - 0.5) * 8;
      const by = h - tall * t;
      ctx.globalAlpha = alpha * (0.5 + rand() * 0.6);
      ctx.beginPath();
      ctx.arc(bx, by, 1.6 + rand() * 3.0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  return finish(canvas);
}

/* ------------------------------------------------------------------ *
 * 8. The gild — the metal the whole entity is cast in
 *
 * Slow low-frequency mottle. Its job is to break up the shader's smooth
 * gradients so the figure reads as beaten leaf rather than as plastic.
 * ------------------------------------------------------------------ */
export function gildTexture({ size = 256, seed = 5 } = {}) {
  const { canvas, ctx } = surface(size, size);
  const rand = rng(seed);

  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, size, size);

  // Layered soft blobs at three frequencies — cheap value noise with the
  // blur already baked in by the gradient falloff.
  for (const [count, radius, amp] of [[18, 0.55, 0.16], [46, 0.24, 0.12], [120, 0.09, 0.09]]) {
    for (let i = 0; i < count; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const r = radius * size * (0.5 + rand() * 0.8);
      const up = rand() > 0.5;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const v = up ? 255 : 0;
      g.addColorStop(0, `rgba(${v},${v},${v},${amp})`);
      g.addColorStop(1, `rgba(${v},${v},${v},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  return finish(canvas, { repeat: true, srgb: false });
}
