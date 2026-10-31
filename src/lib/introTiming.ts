/**
 * Single speed factor for the welcome sequence.
 *
 * The original intro ran 16.2 s from first frame to the category handoff
 * (7.5 s of footage + an 8.7 s brand sequence) plus ~1.3 s of fade-in. Every
 * clock in the sequence runs at this multiple of its original speed, so the
 * choreography, easing and relative timing are unchanged and the whole intro
 * (including the arrival of the category screen) lands in about 10 s:
 *
 *   (7.5 + 8.7 + 1.33) / INTRO_SPEED = 10.0 s
 *
 * What it drives:
 *  - the footage's playbackRate (and the morph's time-dilation of it),
 *  - the morph timeline clock in BlackHoleLogoMorph,
 *  - the CSS transitions of the lockup and intro UI (via --intro-speed),
 *  - the brand-hold timer that hands over to the category screen.
 */
export const INTRO_SPEED = 1.8;

/** Original brand hold: handoff → category screen, in ms at 1× speed. */
export const BRAND_HOLD_MS = 8700;
