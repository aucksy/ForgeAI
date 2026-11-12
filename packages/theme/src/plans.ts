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
 *  - 'ai': the retired third pack (on the website as "Coming", never sold). F201 (12 Nov 2026) replaced it
 *    with the AI Assistant, sold as AI credits on EVERY plan (AI_CREDITS below). The word stays valid
 *    because old rows and old migrations use it; a gym on 'ai' is treated, named and shown as Pro.
 *    Nothing shows or sells it any more (apps/dashboard/test/crm/retiredAiPack.test.ts checks that).
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

/**
 * The words gyms.plan may hold (0030's check constraint). 'ai' is the retired third pack: still a valid
 * word (old rows, old migrations), treated as Pro, never shown or sold. Show a pack with packName().
 */
export type GymPack = 'starter' | 'pro' | 'ai';
export const GYM_PACKS: readonly GymPack[] = ['starter', 'pro', 'ai'];

/** The packs that exist for a gym owner today: the website, Pay MettleUp and HQ's plan picker. */
export type SoldPack = 'starter' | 'pro';

/** The features only Pro (and up) has. Everything else is in every pack and is never gated. */
export type ProFeature = 'branding' | 'shop' | 'challenge' | 'workoutOffer' | 'trainerPlans' | 'yourNumbers';
export const PRO_FEATURES: readonly ProFeature[] = ['branding', 'shop', 'challenge', 'workoutOffer', 'trainerPlans', 'yourNumbers'];

/** What each pack has, of the Pro features. */
export const PACK_FEATURES: Readonly<Record<GymPack, readonly ProFeature[]>> = {
  starter: [],
  pro: PRO_FEATURES,
  // The retired 'ai' pack: exactly Pro.
  ai: PRO_FEATURES,
};

/** The pack word as the server or a saved copy has it; null for none or one this app does not know. PURE. */
export function packOf(raw: unknown): GymPack | null {
  if (typeof raw !== 'string') return null;
  const w = raw.trim().toLowerCase();
  return (GYM_PACKS as readonly string[]).includes(w) ? (w as GymPack) : null;
}

/** The pack a gym is shown as: the retired 'ai' is Pro; null for none or an unknown word. PURE. */
export function shownPack(raw: unknown): SoldPack | null {
  const p = packOf(raw);
  return p === 'ai' ? 'pro' : p;
}

/** A pack's name as owners read it: "Starter" or "Pro" (the retired 'ai' is "Pro"); '' for none. PURE. */
export function packName(raw: unknown): string {
  const p = shownPack(raw);
  return p === 'starter' ? 'Starter' : p === 'pro' ? 'Pro' : '';
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

/** The approved prices (OWNER-INBOX #30 A, 30 Oct 2026), per branch, in rupees. The retired 'ai' pack has none. */
export const PACK_PRICES: Readonly<Record<SoldPack, PackPrice>> = {
  starter: { monthly: 999, yearly: 9_990 },
  pro: { monthly: 1_499, yearly: 14_990 },
};

/** The packs a gym can pay for today. */
export const PACKS_FOR_SALE: readonly SoldPack[] = ['starter', 'pro'];

/**
 * THE AI ASSISTANT'S CREDITS (F201, docs/f201-ai-assistant/03-design.md section 3; R-470, 12 Nov 2026), on
 * every plan; they replaced the retired 'ai' pack. Asking is free. 1 credit when a message is sent or a member,
 * payment, enquiry or expense is saved; 3 credits for a workout or diet plan the AI writes. Free credits: 20
 * once in the free trial, none on a monthly plan; every month on a yearly plan: 50 on Starter, 100 on Pro (owner,
 * 12 Nov 2026, R-473: the dearer plan gets more); the founding lifetime offer is Pro, so 100. Packs never expire. The server keeps the same numbers (0071 owner_ai_wallet) and the website shows
 * them (apps/dashboard/public/home/index.html); pricesOneSource.test.ts checks that all three agree.
 */
export const AI_CREDITS = {
  perTask: 1,
  perPlan: 3,
  trialFree: 20,
  monthlyFree: 0,
  yearlyFreeEachMonth: { starter: 50, pro: 100 },
  packs: [
    { credits: 50, rupees: 149, popular: false },
    { credits: 150, rupees: 399, popular: true },
    { credits: 500, rupees: 999, popular: false },
  ],
} as const;

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

/**
 * THE APP'S SWITCH for online buying on Today: while false, Today never asks the server about the plan
 * end (no call to a function that is not on the server yet). Pay MettleUp asks anyway and follows the
 * server's own switch (0063 app_config 'billing_checkout'). Billing step 4 turns both on with his yes.
 */
export const BILLING_ONLINE_ON = false;

/** The plan-end reminders, in days before the plan ends (in the app; messages later). */
export const RENEW_REMINDER_DAYS: readonly number[] = [7, 3, 1];

/** The words every MettleUp receipt carries (MettleUp is not registered under GST). */
export const RECEIPT_GST_LINE = 'Not registered under GST; no GST charged.';
