#!/usr/bin/env python3
"""Regenerate assets/ground-contours.svg — the topographic contour field that
sits behind the bouquet.

The vocabulary is cartographic on purpose: open section lines spanning the full
width, reading as one landform seen in elevation. Nothing here is drawn from
Aboriginal visual language, which encodes particular Country and story and is
not a free pattern library.

Run from the repository root:  python tools/generate-ground.py
"""

import io
import math

WIDTH, HEIGHT = 1600, 1000
STEPS = 56

# Uneven band positions: contours bunch where ground is steep and open out
# where it flattens. Even spacing would read as a UI texture, not as terrain.
BASES = [86, 158, 196, 262, 372, 430, 468, 574, 690, 742, 776, 868, 940]


def contour(index, base):
    """One contour line: three incommensurable waves so no line repeats
    another's shape, plus a slow arch so the field reads as a single form."""
    a1 = 26 + 9 * math.sin(index * 1.7)
    k1 = 1.6 + 0.22 * math.sin(index * 0.9)
    a2 = 13 + 6 * math.cos(index * 2.3)
    k2 = 3.1 + 0.4 * math.cos(index * 1.3)
    points = []
    for step in range(STEPS + 1):
        t = step / STEPS
        y = (
            base
            + a1 * math.sin(k1 * math.tau * t + index * 0.83)
            + a2 * math.sin(k2 * math.tau * t + index * 1.61)
            + 6.5 * math.sin(5.7 * math.tau * t + index * 2.4)
            - 34 * math.sin(math.pi * t) * math.sin(index * 0.55)
        )
        points.append(f"{t * WIDTH:.1f} {y:.1f}")
    return "M" + " L".join(points)


def main():
    paths = []
    for index, base in enumerate(BASES):
        # Fainter and thinner toward the top, so the ground has weight low down.
        # Kept this low at source rather than dimmed by a scrim in CSS: a scrim
        # over the whole ground takes the warmth out with the linework.
        opacity = 0.085 + 0.165 * (base / HEIGHT)
        width = 1.0 if index % 4 else 1.6
        paths.append(
            f'<path d="{contour(index, base)}" fill="none" stroke="#c07a36" '
            f'stroke-opacity="{opacity:.3f}" stroke-width="{width}" '
            'stroke-linecap="round"/>'
        )

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {WIDTH} {HEIGHT}" '
        f'width="{WIDTH}" height="{HEIGHT}" preserveAspectRatio="xMidYMid slice">\n'
        "<!-- Topographic contours for the WATL ground. Cartographic vocabulary on\n"
        "     purpose: open section lines across the full width, reading as one\n"
        "     landform seen in elevation. Regenerate with tools/generate-ground.py. -->\n"
        + "\n".join(paths)
        + "\n</svg>\n"
    )
    io.open("assets/ground-contours.svg", "w", encoding="utf-8", newline="\n").write(svg)
    print(f"wrote assets/ground-contours.svg ({len(svg) / 1024:.1f} KB, {len(BASES)} contours)")


if __name__ == "__main__":
    main()
