/**
 * Which MettleUp pack a gym is on, and what each pack has (tracker T66, owner decision #30 option A,
 * 30 Oct 2026). ONE map shared by the admin app (apps/dashboard) and the member app (apps/mobile), so
 * both close exactly the same things. The spec is the pack table on mettleup.fit
 * (apps/dashboard/public/home/index.html, "Pro adds") and docs/overhaul/research/R-pricing-jaipur.md.
 *
 *  - Starter: the whole desk, the free member app with the gym's name, everything not listed below.
 *  - Pro adds: the gym's logo and colours in the member app, the shop, the monthly challenge with its
 *    leaderboard, the workout offer (extra plan days for members who work out often), trainer plans +
 *    diet plans + body measurements in members' phones, and "Your numbers" (fees collected, new
 *    members, busiest hours; with the "Your growth" page they open).
 *  - Pro + AI: not sold yet; treated as Pro until its AI parts exist.
 *  - Founding gym ("Pro for life", the website) and "Own it" ("Pro for one branch", the research
 *    note) are not packs of their own: HQ writes them as pack 'pro' with billing 'lifetime' / 'yearly'
 *    (hq_set_plan, 0030). So they are Pro.
 *
 * WHERE THE PACK IS KEPT: gyms.plan, made by 0030 (live since 24 Oct 2026): 'starter' | 'pro' | 'ai',
 * or null while the gym is on its free trial with nothing picked. Only HQ writes it (HQ_ONLY trigger).
 * The apps read it through 0046_gym_pack.sql (owner_gym_pack / member_gym_pack; NOT live yet).
 *
 * SAFE BY DEFAULT: a gym with no pack (null: the free trial), an unknown word, or a server without
 * 0046 gets EVERY feature, exactly as today. And the whole gate is behind PLAN_GATE_ON below.
 */

/**
 * THE SWITCH. While false, `hasFeature` answers true for every gym and neither app even asks the
 * server which pack a gym is on: nothing changes for anyone.
 *
 * Turning it on needs the OWNER'S YES (tracker #30 / T66), and in this order: (1) apply
 * 0046_gym_pack.sql to the live gym server, (2) check in HQ which gyms already have a pack written
 * ('starter' there closes the Pro features at once), (3) set this to true, ship the member app and
 * deploy the admin app. Turned on before step 1, the apps just see no pack (every feature on).
 */
export const PLAN_GATE_ON = false;

/** The packs a gym can be on: the words HQ keeps in gyms.plan (0030's check constraint). */
export type GymPack = 'starter' | 'pro' | 'ai';
export const GYM_PACKS: readonly GymPack[] = ['starter', 'pro', 'ai'];

/** The features only Pro (and up) has. Everything else is in every pack and is never gated. */
export type ProFeature = 'branding' | 'shop' | 'challenge' | 'workoutOffer' | 'trainerPlans' | 'yourNumbers';
export const PRO_FEATURES: readonly ProFeature[] = ['branding', 'shop', 'challenge', 'workoutOffer', 'trainerPlans', 'yourNumbers'];

/** What each pack has, of the Pro features. */
export const PACK_FEATURES: Readonly<Record<GymPack, readonly ProFeature[]>> = {
  starter: [],
  pro: PRO_FEATURES,
  // Pro + AI: not sold until its AI parts are built (#30); until then exactly Pro.
  ai: PRO_FEATURES,
};

/** The pack word as the server or a saved copy has it; null for none or one this app does not know. PURE. */
export function packOf(raw: unknown): GymPack | null {
  if (typeof raw !== 'string') return null;
  const w = raw.trim().toLowerCase();
  return (GYM_PACKS as readonly string[]).includes(w) ? (w as GymPack) : null;
}

/**
 * Does this gym have this feature? `gym` is anything with an optional `plan` (the pack word); null or
 * undefined when the app does not know the gym's pack yet. True whenever the switch is off, the pack
 * is missing or unknown, or the pack lists the feature. `gateOn` is for tests only. PURE.
 */
export function hasFeature(gym: { plan?: unknown } | null | undefined, feature: ProFeature, gateOn: boolean = PLAN_GATE_ON): boolean {
  if (!gateOn) return true;
  const pack = packOf(gym?.plan);
  if (!pack) return true;
  return PACK_FEATURES[pack].includes(feature);
}

/** The Pro features this gym does NOT have (empty when it has them all). PURE. */
export function lockedFeatures(gym: { plan?: unknown } | null | undefined, gateOn: boolean = PLAN_GATE_ON): ProFeature[] {
  return PRO_FEATURES.filter((f) => !hasFeature(gym, f, gateOn));
}
