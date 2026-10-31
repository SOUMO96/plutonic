/**
 * Responsive framing for the black-hole plate.
 *
 * The footage is one 16:9 shot. On every device it is cover-fitted to the
 * viewport and magnified by a single uniform factor; the animation itself
 * (timeline, camera move, morph) never changes. Only that factor adapts so the
 * black hole's shadow stays inside the frame on narrow screens.
 */

/** Magnification used on wide screens: the original desktop composition. */
export const PLATE_WIDE_SCALE = 1.38;

/** Shadow diameter as a fraction of the cover-fitted footage width at the handoff. */
const SHADOW_PER_FOOTAGE_WIDTH = 0.17;

/** How much of the viewport width the shadow may occupy before the plate is pulled back. */
const SHADOW_MAX_VIEWPORT_WIDTH = 0.8;

const FOOTAGE_ASPECT = 16 / 9;
const MIN_SCALE = 0.5;

export function computePlateScale(vw: number, vh: number): number {
  if (vw <= 0 || vh <= 0) return PLATE_WIDE_SCALE;
  const coverWidth = Math.max(vw, vh * FOOTAGE_ASPECT);
  const fit = (SHADOW_MAX_VIEWPORT_WIDTH * vw) / (SHADOW_PER_FOOTAGE_WIDTH * coverWidth);
  return Math.min(PLATE_WIDE_SCALE, Math.max(MIN_SCALE, fit));
}
