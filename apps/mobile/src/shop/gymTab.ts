/**
 * R-77 (owner, 22 Oct 2026): "the shop shouldn't be there if there is no gym active, and as soon as
 * the gym is active ... and the gym owner has a shop activated ... then it starts showing up."
 * The third tab:
 *  - no gym joined: none (Workout and Profile only; join from Settings → Your gym or the gym's link);
 *  - a gym joined, its shop not on (it lists nothing): "Gym" — My membership, the gym's messages,
 *    the workout code, Leave;
 *  - a gym joined with its shop on (it lists at least one product): "Shop" — the same, plus the shop.
 * PURE.
 */
export type GymTab = 'none' | 'gym' | 'shop';

export function gymTabFor(joined: boolean, productCount: number): GymTab {
  if (!joined) return 'none';
  return productCount > 0 ? 'shop' : 'gym';
}

export const GYM_TAB_LABEL: Record<Exclude<GymTab, 'none'>, string> = { gym: 'Gym', shop: 'Shop' };
