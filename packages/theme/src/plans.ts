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
 *
 * The SERVER has the same check behind its own switch (0062_plan_features.sql: app_config 'plan_gate',
 * gym_has_feature, gym_state), also OFF. Billing step 4 turns both on together (BILLING-DESIGN.md).
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

// ---------------------------------------------------------------------------------------------------
// PRICES: THE ONE LIST (billing step 1, docs/overhaul/BILLING-DESIGN.md, R-385, 6 Nov 2026).
// Every other place that shows or charges a price must agree with this list, and a test fails when one
// does not (apps/dashboard/test/crm/pricesOneSource.test.ts): the website's price cards
// (apps/dashboard/public/home/index.html), the admin app's Pay MettleUp (it imports this list), HQ's
// branch prices (apps/hq/public/logic.js) and the server's price function (_mettleup_price, 0060).
// Changing a price = change it here, then in those places, and the test says when they agree again.

/** One pack's price for ONE branch, in whole rupees. */
export interface PackPrice {
  monthly: number;
  yearly: number;
}

/** The approved prices (OWNER-INBOX #30 A, 30 Oct 2026), per branch, in rupees. */
export const PACK_PRICES: Readonly<Record<GymPack, PackPrice>> = {
  starter: { monthly: 999, yearly: 9_990 },
  pro: { monthly: 1_499, yearly: 14_990 },
  // Pro + AI: shown on the website as "Coming"; nobody can buy it until its AI parts exist.
  ai: { monthly: 2_499, yearly: 24_990 },
};

/** The packs a gym can pay for today (Pro + AI is "Coming"). */
export const PACKS_FOR_SALE: readonly GymPack[] = ['starter', 'pro'];

/** The founding offer: Pro for life for one branch, one payment, first 25 gyms, until 31 Mar 2027. */
export const FOUNDING_OFFER = { rupees: 29_999, gyms: 25, lastDay: '2027-03-31' } as const;

// ---------------------------------------------------------------------------------------------------
// WHEN A GYM STOPS PAYING (DECIDED 6 Nov 2026, R-384). The server decides (gym_state, 0062); the
// admin app only shows it. Data is never deleted; paying reopens everything at once.
//   active    -> paid (or on the free trial)
//   grace     -> 7 extra days after the paid-until date (or the trial end), everything on
//   basic     -> the next 30 days: the desk keeps check-in, fee entry and the member list; no new
//                members; Pro extras off
//   read_only -> after that: look and download only

export type GymState = 'active' | 'grace' | 'basic' | 'read_only';
export const PLAN_GRACE_DAYS = 7;
export const PLAN_BASIC_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The gym's state from its dates, exactly as the server's gym_state (0062) works it out. PURE. */
export function gymStateAt(
  gym: { billing?: string | null; paidUntil?: string | null; trialEndsAt?: string | null },
  nowMs: number,
): GymState {
  if (gym.billing === 'lifetime') return 'active';
  const ends = [gym.paidUntil, gym.trialEndsAt].map((d) => (d ? Date.parse(d) : NaN)).filter((n) => !Number.isNaN(n));
  if (ends.length === 0) return 'active';
  const end = Math.max(...ends);
  if (nowMs <= end) return 'active';
  if (nowMs <= end + PLAN_GRACE_DAYS * DAY_MS) return 'grace';
  if (nowMs <= end + (PLAN_GRACE_DAYS + PLAN_BASIC_DAYS) * DAY_MS) return 'basic';
  return 'read_only';
}

// ---------------------------------------------------------------------------------------------------
// BUYING ONLINE (billing step 3, BILLING-DESIGN.md). The SERVER decides every amount (0063
// hq_billing_checkout_start); these copies only let the admin app show the same number before the tap,
// and tests keep the two in step (apps/dashboard/test/crm/billingMaths.test.ts and
// supabase/tests/0063_gym_checkout.sql use the same cases).

/** Days in one paid period, for working out an upgrade's price per day. */
export const PERIOD_DAYS: Readonly<Record<'monthly' | 'yearly', number>> = { monthly: 30, yearly: 365 };

const IST_MS = 330 * 60 * 1000;
/** The India calendar day of a moment, as a day number (days since 1 Jan 1970). PURE. */
export function indiaDayNumber(ms: number): number {
  return Math.floor((ms + IST_MS) / DAY_MS);
}

/**
 * Days left to pay the difference for when Starter moves up to Pro: the India days from today to the
 * paid-until day, both counted (a plan ending tonight has 1 day left). 0 when the paid time is over
 * (then it is a new purchase, not an upgrade). PURE.
 */
export function upgradeDaysLeft(paidUntilIso: string | null | undefined, nowMs: number): number {
  const pu = paidUntilIso ? Date.parse(paidUntilIso) : NaN;
  if (Number.isNaN(pu) || pu < nowMs) return 0;
  return indiaDayNumber(pu) - indiaDayNumber(nowMs) + 1;
}

/**
 * What moving from Starter up to Pro costs now, in paise: the price difference per day for the days
 * left, rounded UP to a whole rupee, never under Rs 1. null when there are no days left. PURE.
 * Same sum as the server's _upgrade_paise (0063).
 */
export function upgradePaise(billing: 'monthly' | 'yearly', paidUntilIso: string | null | undefined, nowMs: number): number | null {
  const days = upgradeDaysLeft(paidUntilIso, nowMs);
  if (days <= 0) return null;
  const diffPaise = (PACK_PRICES.pro[billing] - PACK_PRICES.starter[billing]) * 100;
  // One division of two whole numbers: exact when the answer is whole, so ceil never adds a rupee by mistake.
  const rupees = Math.ceil((diffPaise * days) / (PERIOD_DAYS[billing] * 100));
  return Math.max(1, rupees) * 100;
}

/**
 * Is the founding offer still open: on or before its last India day, and fewer than its gyms taken
 * (gyms already paid for life + founding payments in progress). PURE. Same rule as the server's.
 */
export function foundingOpen(nowMs: number, taken: number): boolean {
  const lastDay = indiaDayNumber(Date.parse(`${FOUNDING_OFFER.lastDay}T00:00:00+05:30`));
  return indiaDayNumber(nowMs) <= lastDay && taken < FOUNDING_OFFER.gyms;
}

/** The plan-end reminders, in days before the plan ends (in the app; messages later). */
export const RENEW_REMINDER_DAYS: readonly number[] = [7, 3, 1];

/** The words every MettleUp receipt carries (MettleUp is not registered under GST). */
export const RECEIPT_GST_LINE = 'Not registered under GST; no GST charged.';
