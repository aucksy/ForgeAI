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

/**
 * The Gym tab's own tabs (owner, 30 Oct 2026, R-225): "Shop" first and opened first when the gym's
 * shop is on, then "My gym" (plan, hours, check in, diet, offer), then "Ranking". PURE.
 * UAT A-02 (30 Oct 2026): "Leaderboard" broke mid-word at large text; "Ranking" fits.
 */
export type GymSection = 'shop' | 'gym' | 'board';
export const GYM_SECTION_LABELS: Record<GymSection, string> = { shop: 'Shop', gym: 'My gym', board: 'Ranking' };

export function gymSections(shopOn: boolean): GymSection[] {
  return shopOn ? ['shop', 'gym', 'board'] : ['gym', 'board'];
}

/** The tab to show: the member's pick while it exists, else the first. PURE. */
export function gymSectionShown(picked: GymSection | null, shopOn: boolean): GymSection {
  const all = gymSections(shopOn);
  return picked && all.includes(picked) ? picked : all[0];
}
