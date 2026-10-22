/**
 * R-78 (owner, 22 Oct 2026): "those nice fluid animations when someone switches from one tab to
 * another ... That highlighted color ... is visible moving towards the right hand side."
 *
 * One highlight for the whole tab bar, drawn as its two edges. On a switch the edge in front (the
 * side it travels to) springs fast and the edge behind follows on a softer spring: the pill
 * stretches toward the new tab, then the back catches up and it settles to its own size — the
 * "liquid" tab bars of Material 3 / iOS apps, without any library beyond Reanimated. PURE.
 */

/** The highlight's size: as the per-tab pill it replaces (a 54 × 30 box, 4 in from each side). */
export const PILL_W = 46;
export const PILL_H = 30;
/** Never thinner than this while a spring overshoots. */
export const PILL_MIN_W = 30;

export interface SpringCfg {
  damping: number;
  stiffness: number;
  mass: number;
}

/** The front edge: quick, a touch of bounce. */
export const LEAD_SPRING: SpringCfg = { damping: 17, stiffness: 320, mass: 0.6 };
/** The back edge: softer, so it lags and the pill stretches. */
export const TRAIL_SPRING: SpringCfg = { damping: 20, stiffness: 150, mass: 0.8 };

/** The highlight's edges centred on a tab whose centre is `center`. PURE. */
export function pillEdges(center: number): { left: number; right: number } {
  return { left: center - PILL_W / 2, right: center + PILL_W / 2 };
}

/** Which spring each edge gets for a move from `fromLeft` to `toLeft`. PURE. */
export function edgeSprings(fromLeft: number, toLeft: number): { left: SpringCfg; right: SpringCfg } {
  const right = toLeft >= fromLeft;
  return right ? { left: TRAIL_SPRING, right: LEAD_SPRING } : { left: LEAD_SPRING, right: TRAIL_SPRING };
}

/** The drawn width at a moment (edges mid-spring), never below PILL_MIN_W. PURE. */
export function pillWidth(left: number, right: number): number {
  'worklet';
  return Math.max(PILL_MIN_W, right - left);
}
