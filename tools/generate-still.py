# -*- coding: utf-8 -*-
"""
Generate the still.

The still is what a visitor sees before WebGL answers, and all a visitor sees
if it never does. So it cannot be a sketch of the artwork — it has to be the
same composition, from the same numbers.

Those numbers live in src/bloom/entity.js and src/bloom/scene.js, and they are
restated here with the projection worked out longhand:

    camera 11.8 units back, 30 degrees vertical field
    -> visible half-height = tan(15) * 11.8 = 3.16
    -> at 16:10, visible half-width = 3.16 * 1.6 = 5.06
    aim (0.02, 0.30)

which gives the world window below, and a single scale of ~158 px per unit.
Change a body proportion in entity.js and this file has to be re-run; that is
the cost of having a still that actually matches.
"""
import io, math, os

W, H = 1600, 1000
HALF_H = math.tan(math.radians(15)) * 11.8          # 3.162
HALF_W = HALF_H * (W / H)                            # 5.059
AIM_X, AIM_Y = 0.02, 0.30

X0, X1 = AIM_X - HALF_W, AIM_X + HALF_W
Y0, Y1 = AIM_Y - HALF_H, AIM_Y + HALF_H
SX = W / (X1 - X0)
SY = H / (Y1 - Y0)

def x(u):  return round((u - X0) * SX, 1)
def y(v):  return round((Y1 - v) * SY, 1)
def s(d):  return round(d * SX, 1)          # a length, x-scaled

# ---- the body, from entity.js BODY ----------------------------------------
FOOT, HIP, CHEST, JAW = -2.30, -1.28, 0.77, 1.38
HEAD = 0.96
SHOULDER, WAIST = 0.355, 0.250
FIG_X = -0.74
ARM_X = SHOULDER + 0.046
LEG_X = 0.148

# ---- the pod -------------------------------------------------------------
POD_X, POD_Y = 0.82, -0.86
POD_W, POD_H = 0.60, 1.66

# ---- the moon ------------------------------------------------------------
HALO_X, HALO_Y = FIG_X - 0.02, 1.90
HALO_R = 3.85 / 2

fx = lambda u: x(FIG_X + u)


def mandorla(cx, cy, hw, hh, tip=0.56):
    """The same two-mirrored-cubics seed the 3D pod is extruded from."""
    w, h = s(hw), s(hh) * (SY / SX)
    belly = -0.06 * h
    return (
        f"M{cx} {cy + h} "
        f"C{cx + w * tip} {cy + h * 0.72} {cx + w} {cy + belly + h * 0.34} {cx + w} {cy + belly} "
        f"C{cx + w} {cy + belly - h * 0.40} {cx + w * tip} {cy - h * 0.74} {cx} {cy - h} "
        f"C{cx - w * tip} {cy - h * 0.74} {cx - w} {cy + belly - h * 0.40} {cx - w} {cy + belly} "
        f"C{cx - w} {cy + belly + h * 0.34} {cx - w * tip} {cy + h * 0.72} {cx} {cy + h}Z"
    )


def leaf(cx, cy, length, width, lean, fill, dots=0, dotfill="#FFF"):
    """One lanceolate leaf, mirrored into a pair by the caller."""
    out = []
    for d in (-1, 1):
        deg = math.degrees(lean) * d
        out.append(
            f'<g transform="translate({cx} {cy}) rotate({deg:.1f})">'
            f'<path d="M0 0 C{width} {-length * 0.20} {width * 0.80} {-length * 0.68} 0 {-length} '
            f'C{-width * 0.80} {-length * 0.68} {-width} {-length * 0.20} 0 0Z" fill="{fill}"/>'
            + "".join(
                f'<circle cx="0" cy="{-length * at:.1f}" r="{max(1.0, length * 0.05):.1f}" fill="{dotfill}"/>'
                for at in ([0.34, 0.56][:dots])
            )
            + "</g>"
        )
    return "".join(out)


# --------------------------------------------------------------------------
head_top, head_bot = y(JAW + HEAD), y(JAW)
head_w = s(0.304 * HEAD)
neck_w = s(0.086)
eye_y = y(JAW + HEAD * 0.50)
eye_dx = s(0.148)

parts = []

# The vine, twelve pairs climbing the chest.
vine_lo, vine_hi = HIP + 0.26, CHEST - 0.22
for i in range(12):
    t = i / 11
    v = vine_lo + (vine_hi - vine_lo) * t
    ln = s(0.132 - t * 0.044) * 1.6
    # 0.66: the vine plane is 0.58 world units wide over 320 texture pixels
    # but 1.76 tall over 640, so the live leaves are narrower than square.
    parts.append(leaf(fx(0), y(v), ln, ln * 0.33 * 0.66, 1.02 + t * 0.12, "#FFF3D2"))
vine = (f'<rect x="{fx(0) - 2}" y="{y(vine_hi) - 4}" width="4" '
        f'height="{y(vine_lo) - y(vine_hi) + 8}" fill="#FFF3D2"/>' + "".join(parts))

# The fern inside the pod, ten pairs.
fern = []
fern_lo, fern_hi = POD_Y - POD_H * 0.70, POD_Y + POD_H * 0.70
for i in range(10):
    t = i / 9
    v = fern_lo + (fern_hi - fern_lo) * t
    ln = s(0.162 - t * 0.052) * 1.55
    fern.append(leaf(x(POD_X), y(v), ln, ln * 0.35 * 0.64, 1.04 + t * 0.12, "#2E2007", 2, "#FFF8DE"))
fern = (f'<rect x="{x(POD_X) - 2.5}" y="{y(fern_hi) - 6}" width="5" '
        f'height="{y(fern_lo) - y(fern_hi) + 12}" fill="#2E2007"/>' + "".join(fern))

# Thorn hands: four spikes per side, angles measured from straight up.
thorns = []
for d in (-1, 1):
    for ln, rot in ((0.48, 1.57), (0.37, 2.05), (0.29, 1.18), (0.22, 2.52)):
        tipx = fx(d * ARM_X) + d * math.sin(rot) * s(ln)
        tipy = y(HIP) + math.cos(rot) * s(ln) * -1
        thorns.append(
            f'<path d="M{fx(d * ARM_X)} {y(HIP) - 7} L{tipx:.1f} {tipy:.1f} '
            f'L{fx(d * ARM_X)} {y(HIP) + 7}Z" fill="url(#gild)"/>'
        )

# Sprigs: a deterministic scatter, so the still never changes between builds.
_seed = 20260823
def _rand():
    global _seed
    _seed = (_seed * 1103515245 + 12345) & 0x7FFFFFFF
    return _seed / 0x7FFFFFFF

sprig_rows = []
for i in range(46):
    sx = _rand() * W
    tall = 110 + _rand() * 210
    bend = (_rand() - 0.5) * 70
    sprig_rows.append(
        f'    <path d="M{sx:.0f} {H} Q{sx + bend * 0.5:.0f} {H - tall * 0.55:.0f} '
        f'{sx + bend:.0f} {H - tall:.0f}" fill="none" stroke-width="{1.2 + _rand() * 1.3:.1f}"/>'
    )
    for b in range(9 + int(_rand() * 9)):
        t = 0.24 + (b / 12) * 0.78
        sprig_rows.append(
            f'    <circle cx="{sx + bend * t + (_rand() - 0.5) * 11:.0f}" '
            f'cy="{H - tall * t:.0f}" r="{2.0 + _rand() * 3.4:.1f}"/>'
        )
sprigs = chr(10).join(sprig_rows)

svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img"
     aria-label="Bloom of Remembrance - a gilded figure and a seed pod standing in a field of wattle">
  <title>Bloom of Remembrance</title>
  <!--
    Generated. The still has to be the same composition as the live scene, not
    a sketch of it, so every coordinate here comes from the body proportions in
    src/bloom/entity.js projected through the lens in src/bloom/scene.js:
    11.8 units back at a 30-degree vertical field, aimed at (0.02, 0.30).
    Roughly {SX:.0f} pixels per world unit. Re-run the generator if either moves.
  -->
  <defs>
    <radialGradient id="field" cx="46%" cy="42%" r="82%">
      <stop offset="0%"   stop-color="#FFF7C8"/>
      <stop offset="44%"  stop-color="#F3D269"/>
      <stop offset="100%" stop-color="#C4941F"/>
    </radialGradient>
    <radialGradient id="moon">
      <stop offset="0%"   stop-color="#FFFFFF"/>
      <stop offset="38%"  stop-color="#FFFFFF"/>
      <stop offset="52%"  stop-color="#FFF6DC"/>
      <stop offset="66%"  stop-color="#FCF0CA" stop-opacity=".66"/>
      <stop offset="84%"  stop-color="#F5D68C" stop-opacity=".26"/>
      <stop offset="100%" stop-color="#E9B44C" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="petal">
      <stop offset="0%"   stop-color="#FFF8DE" stop-opacity=".50"/>
      <stop offset="72%"  stop-color="#FFF8DE" stop-opacity=".34"/>
      <stop offset="86%"  stop-color="#FFFFFF" stop-opacity=".46"/>
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="shade">
      <stop offset="0%"   stop-color="#8E5F0C" stop-opacity=".30"/>
      <stop offset="82%"  stop-color="#8E5F0C" stop-opacity=".12"/>
      <stop offset="100%" stop-color="#8E5F0C" stop-opacity="0"/>
    </radialGradient>
    <!-- The gild, flattened: key from above-front-left, warm bounce below. -->
    <linearGradient id="gild" x1=".18" y1="0" x2=".82" y2="1">
      <stop offset="0%"   stop-color="#A2761A"/>
      <stop offset="46%"  stop-color="#6A470C"/>
      <stop offset="100%" stop-color="#2E1C05"/>
    </linearGradient>
    <linearGradient id="gildLit" x1=".1" y1="0" x2=".9" y2=".9">
      <stop offset="0%"   stop-color="#B98A24"/>
      <stop offset="42%"  stop-color="#7A5310"/>
      <stop offset="100%" stop-color="#341F05"/>
    </linearGradient>
    <filter id="blur"  x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="34"/></filter>
    <filter id="blur2" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="66"/></filter>
    <clipPath id="podClip"><path d="{mandorla(x(POD_X), y(POD_Y), POD_W * 0.775, POD_H * 0.882, 0.62)}"/></clipPath>
  </defs>

  <rect width="{W}" height="{H}" fill="url(#field)"/>

  <!-- The field, behind. -->
  <g filter="url(#blur2)">
    <circle cx="150"  cy="180" r="200" fill="url(#petal)"/>
    <circle cx="1420" cy="120" r="150" fill="url(#petal)"/>
    <circle cx="1540" cy="560" r="210" fill="url(#shade)"/>
    <circle cx="70"   cy="700" r="180" fill="url(#petal)"/>
    <circle cx="1240" cy="960" r="230" fill="url(#shade)"/>
    <circle cx="420"  cy="980" r="190" fill="url(#petal)"/>
    <circle cx="820"  cy="90"  r="130" fill="url(#shade)"/>
  </g>

  <!-- The moon. -->
  <circle cx="{x(HALO_X)}" cy="{y(HALO_Y)}" r="{s(HALO_R)}" fill="url(#moon)"/>

  <!-- The pool at the feet. -->
  <ellipse cx="{fx(0)}" cy="{y(FOOT) + 26}" rx="{s(1.5)}" ry="{s(0.34)}"
           fill="#FFFBE4" opacity=".46" filter="url(#blur)"/>

  <!-- The pod: frame, field, fern. -->
  <path d="{mandorla(x(POD_X), y(POD_Y), POD_W, POD_H)}" fill="url(#gild)"/>
  <g clip-path="url(#podClip)">
    <rect x="{x(POD_X) - s(POD_W) - 4}" y="{y(POD_Y) - s(POD_H) * (SY / SX) - 4}"
          width="{s(POD_W) * 2 + 8}" height="{s(POD_H) * (SY / SX) * 2 + 8}" fill="#FFF8DE"/>
    {fern}
  </g>
  <path d="{mandorla(x(POD_X), y(POD_Y), POD_W * 0.775, POD_H * 0.882, 0.62)}"
        fill="none" stroke="#3D2A08" stroke-opacity=".28" stroke-width="2"/>

  <!-- The figure. -->
  <g>
    <path d="M{fx(-LEG_X) - s(0.100)} {y(FOOT)} L{fx(-LEG_X) - s(0.082)} {y(HIP)}
             L{fx(-LEG_X) + s(0.082)} {y(HIP)} L{fx(-LEG_X) + s(0.100)} {y(FOOT)}Z" fill="#5C3F0D"/>
    <path d="M{fx(LEG_X) - s(0.100)} {y(FOOT)} L{fx(LEG_X) - s(0.082)} {y(HIP)}
             L{fx(LEG_X) + s(0.082)} {y(HIP)} L{fx(LEG_X) + s(0.100)} {y(FOOT)}Z" fill="#715012"/>

    <path d="M{fx(-ARM_X) - s(0.058)} {y(CHEST)} L{fx(-ARM_X) - s(0.040)} {y(HIP)}
             L{fx(-ARM_X) + s(0.040)} {y(HIP)} L{fx(-ARM_X) + s(0.058)} {y(CHEST)}Z" fill="url(#gild)"/>
    <path d="M{fx(ARM_X) - s(0.058)} {y(CHEST)} L{fx(ARM_X) - s(0.040)} {y(HIP)}
             L{fx(ARM_X) + s(0.040)} {y(HIP)} L{fx(ARM_X) + s(0.058)} {y(CHEST)}Z" fill="url(#gild)"/>
    <circle cx="{fx(-ARM_X)}" cy="{y(CHEST - 0.03)}" r="{s(0.070)}" fill="url(#gildLit)"/>
    <circle cx="{fx(ARM_X)}"  cy="{y(CHEST - 0.03)}" r="{s(0.070)}" fill="url(#gildLit)"/>
    {''.join(thorns)}

    <path d="M{fx(-WAIST)} {y(HIP)}
             C{fx(-WAIST * 1.04)} {y(HIP + (CHEST - HIP) * 0.34)}
              {fx(-SHOULDER * 0.96)} {y(HIP + (CHEST - HIP) * 0.62)}
              {fx(-SHOULDER)} {y(HIP + (CHEST - HIP) * 0.90)}
             Q{fx(-SHOULDER)} {y(CHEST)} {fx(-SHOULDER * 0.72)} {y(CHEST)}
             L{fx(SHOULDER * 0.72)} {y(CHEST)}
             Q{fx(SHOULDER)} {y(CHEST)} {fx(SHOULDER)} {y(HIP + (CHEST - HIP) * 0.90)}
             C{fx(SHOULDER * 0.96)} {y(HIP + (CHEST - HIP) * 0.62)}
              {fx(WAIST * 1.04)} {y(HIP + (CHEST - HIP) * 0.34)}
              {fx(WAIST)} {y(HIP)}Z" fill="url(#gildLit)"/>
    {vine}

    <path d="M{fx(0) - neck_w * 0.72} {y(JAW)} L{fx(0) - neck_w} {y(CHEST)}
             L{fx(0) + neck_w} {y(CHEST)} L{fx(0) + neck_w * 0.72} {y(JAW)}Z" fill="url(#gild)"/>

    <!-- The head: the lathe profile, flattened to one path. -->
    <path d="M{fx(0)} {head_bot}
             C{fx(0.20)} {head_bot - (head_bot - head_top) * 0.10}
              {fx(0.304)} {head_bot - (head_bot - head_top) * 0.34}
              {fx(0.304)} {head_bot - (head_bot - head_top) * 0.58}
             C{fx(0.304)} {head_bot - (head_bot - head_top) * 0.82}
              {fx(0.17)} {head_top} {fx(0)} {head_top}
             C{fx(-0.17)} {head_top}
              {fx(-0.304)} {head_bot - (head_bot - head_top) * 0.82}
              {fx(-0.304)} {head_bot - (head_bot - head_top) * 0.58}
             C{fx(-0.304)} {head_bot - (head_bot - head_top) * 0.34}
              {fx(-0.20)} {head_bot - (head_bot - head_top) * 0.10}
              {fx(0)} {head_bot}Z" fill="url(#gildLit)"/>

    <path d="M{fx(0)} {eye_y + 6} L{fx(-0.024)} {head_bot - 14} L{fx(0.024)} {head_bot - 14}Z"
          fill="#8C6516" opacity=".5"/>

    <g fill="#FFFDF2">
      <ellipse cx="{fx(-0.148)}" cy="{eye_y}" rx="{s(0.062)}" ry="{s(0.062) * 0.58}"/>
      <ellipse cx="{fx(0.148)}"  cy="{eye_y}" rx="{s(0.062)}" ry="{s(0.062) * 0.58}"/>
    </g>
    <g fill="none" stroke="#FFFDF2" stroke-width="1.8" opacity=".8">
      <ellipse cx="{fx(-0.148)}" cy="{eye_y}" rx="{s(0.086)}" ry="{s(0.086) * 0.58}"/>
      <ellipse cx="{fx(0.148)}"  cy="{eye_y}" rx="{s(0.086)}" ry="{s(0.086) * 0.58}"/>
    </g>
  </g>

  <!-- Sprigs along the bottom edge. -->
  <g stroke="#D5AE55" fill="#D5AE55" opacity=".42">
{sprigs}
  </g>

  <!-- The field, in front. This is what makes the depth read. -->
  <g filter="url(#blur2)">
    <circle cx="180"  cy="880" r="250" fill="url(#petal)"/>
    <circle cx="1460" cy="700" r="200" fill="url(#petal)"/>
    <circle cx="700"  cy="1010" r="190" fill="url(#petal)"/>
    <circle cx="40"   cy="380" r="150" fill="url(#petal)"/>
  </g>
</svg>
"""

path = os.path.join(r"C:\Users\stefa\Desktop\Watl", "public", "assets", "bloom-still.svg")
io.open(path, "w", encoding="utf-8", newline="\n").write(svg)
print("wrote", path, len(svg), "bytes  scale=%.1f px/unit" % SX)
