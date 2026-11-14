/**
 * R-517 (owner, 14 Nov 2026): on the Gym tab the gym's logo and name are bigger, and the logo can be
 * tapped to see it full size. The sizes and words of that header (src/shop/GymHeaderMark.tsx), kept
 * here so they can be tested without drawing anything.
 *
 * The logo keeps its own shape (D14, as the small header mark on Workout and Profile): shown whole,
 * 56 dp high, as wide as its shape needs from a square up to 2:1 (a wider wordmark is shown whole
 * inside a 2:1 box). Capped at 2:1 so a 360 dp phone still has room for the gym's name next to it.
 */

/** The Gym tab's logo height (dp). Today's small mark on Workout and Profile stays 28. */
export const GYM_HEADER_LOGO = 56;

/** What TalkBack says on the logo, and the Maestro handle for tapping it. */
export const GYM_LOGO_TAP_LABEL = 'Gym logo, tap to see it bigger';

/** The full-size view's close button. */
export const GYM_LOGO_CLOSE_LABEL = 'Close the logo';

/** The logo's box width on the Gym tab for a picture of `w` x `h`: its own shape, 1:1 to 2:1. PURE. */
export function gymHeaderLogoWidth(w: number | null | undefined, h: number | null | undefined): number {
  if (!w || !h || w <= 0 || h <= 0) return GYM_HEADER_LOGO;
  return Math.round(GYM_HEADER_LOGO * Math.min(2, Math.max(1, w / h)));
}

/**
 * The full-size logo's box: as large as fits on a `screenW` x `screenH` screen (24 dp each side, at
 * most 60% of the height so the gym's name fits under it), in the picture's own shape. An unknown
 * size (still loading) is drawn square; the picture inside is shown whole either way. PURE.
 */
export function bigLogoBox(
  w: number | null | undefined,
  h: number | null | undefined,
  screenW: number,
  screenH: number,
): { width: number; height: number } {
  const ratio = w && h && w > 0 && h > 0 ? w / h : 1;
  const maxW = Math.max(1, screenW - 48);
  const maxH = Math.max(1, screenH * 0.6);
  const width = Math.min(maxW, maxH * ratio);
  return { width: Math.round(width), height: Math.round(width / ratio) };
}
