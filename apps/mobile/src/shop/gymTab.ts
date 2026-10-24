/**
 * The gym's tab. Release A, A1 (docs/ux/MEMBER-APP-MAP.md, 24 Oct 2026): the tab is ALWAYS shown and
 * ALWAYS called "Gym". With no gym it is one "Join your gym" screen (ShopScreen's JoinGymDoor); with a
 * gym it is the gym's home, and the gym's shop, once the gym lists something, is a part of it.
 * (Before Release A the tab was missing without a gym and turned into "Shop" with products, R-77.)
 * The route stays `shop`, so `/shop` links from notifications, What's new and older builds still open it.
 * PURE.
 */
export const GYM_TAB_LABEL = 'Gym';

/** The shop part of the Gym tab shows once the gym lists at least one product. PURE. */
export function gymShopOn(joined: boolean, productCount: number): boolean {
  return joined && productCount > 0;
}
