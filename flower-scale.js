/**
 * Canonical flower-size contract shared by architecture and bloom motion.
 *
 * Resize factors are relative to the previously approved render. The bud is
 * intentionally reduced more than the mature flower so the transformation
 * reads as biological expansion instead of a texture swap at one fixed size.
 */
export const BLOOM_MATURE_RESIZE_FACTOR = 0.8;
export const BLOOM_BUD_RESIZE_FACTOR = 0.5;
export const BLOOM_BUD_TO_MATURE_SCALE = (
  BLOOM_BUD_RESIZE_FACTOR / BLOOM_MATURE_RESIZE_FACTOR
);

/* The previous architecture multiplier was 1.5. A direct 1.2 token avoids
   floating-point noise while encoding the requested 20% mature reduction. */
export const WATTLE_FLOWER_SCALE = 1.2;
