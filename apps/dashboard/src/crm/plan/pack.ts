/**
 * T66 (#30 A): which admin-app pages and parts are Pro, and the words a Starter gym reads in their
 * place. The pack map and the switch are shared with the member app: packages/theme/src/plans.ts
 * (hasFeature, PLAN_GATE_ON — OFF until the owner says yes). PURE.
 */
import { packOf, type GymPack, type ProFeature } from '@forgeai/theme';

/** owner_gym_pack's answer (0046) read; null for anything else. PURE. */
export function packFromRow(raw: unknown): GymPack | null {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? packOf((raw as { pack?: unknown }).pack) : null;
}

/** The Pro feature a page belongs to (route segments, as the router gives them), or null. PURE. */
export function proFeatureOfPage(head: string | undefined, id: string | undefined): ProFeature | null {
  if (head === 'shop') return 'shop';
  if (head === 'challenges') return 'challenge';
  if (head === 'workouts' || head === 'diet') return 'trainerPlans';
  if (head === 'numbers' || head === 'growth') return 'yourNumbers';
  if (head === 'settings' && id === 'branding') return 'branding';
  // Not here: the workout offer is a section of Messages & offers, closed inside that page
  // (ui/screens/Messages.tsx), so its Messages and Reminders tabs stay reachable.
  return null;
}

/** The page title on a closed page. */
export const PRO_PAGE_TITLE: Readonly<Record<ProFeature, string>> = {
  branding: 'Branding',
  shop: 'Shop',
  challenge: 'Challenges',
  workoutOffer: 'Workout offer',
  trainerPlans: 'Workout and diet plans',
  yourNumbers: 'Your numbers',
};

/** One short line: what the feature does for the gym, and that it comes with Pro. */
export const PRO_LINE: Readonly<Record<ProFeature, string>> = {
  branding: 'Your logo and colours in the member app come with the Pro pack.',
  shop: "Selling your gym's products in the member app comes with the Pro pack.",
  challenge: 'A monthly challenge with a leaderboard in the member app comes with the Pro pack.',
  workoutOffer: 'Giving extra membership days to members who work out often comes with the Pro pack.',
  trainerPlans: "Sending workout plans, diet plans and body measurements to members' phones comes with the Pro pack.",
  yourNumbers: 'Your numbers (fees collected, new members, busiest hours) come with the Pro pack.',
};

/** The second line, the same on every closed part: where the gym is, and what to do. */
export const PRO_HOW = 'Your gym is on Starter. To move to Pro, open Send feedback in the menu and write: Move us to Pro.';

/** The heading on a closed page or part. */
export const PRO_TITLE = 'Part of the Pro pack';
