/**
 * Every word the member sees for the gym's workout offer (OWNER-INBOX #49 step 2), in ONE file so
 * the owner can read and approve them in one place: the Offers card on the Gym tab, the consent
 * screen before "Join the offer", and the answers to Join / Leave. PURE, tested (offerWords.test.ts).
 *
 * Member words: "workouts", "gym days", "check in", "extra days", "membership". Never "volume",
 * "PR" or "session"; no "hurry", "last chance", "don't miss" or "you'll lose".
 *
 * The consent screen's words (R-offers-notices §4.5) are versioned: OFFER_NOTICE_VERSION goes to the
 * gym with "Join the offer" (member_join_offer's p_notice), so the gym can prove which words the
 * member agreed to. Change the words -> change the version.
 */

export const OFFER_NOTICE_VERSION = 'offer-consent-v1';

/** The offer's numbers, as the gym set them (member_offers). */
export interface OfferNumbers {
  gym: string;
  /** Workouts needed. */
  n: number;
  /** Window in days, from joining. */
  w: number;
  /** Extra days given. */
  d: number;
  /** Minimum minutes and working sets of a workout that counts. */
  min: number;
  sets: number;
}

const days = (k: number): string => (k === 1 ? '1 day' : `${k} days`);
const workouts = (k: number): string => (k === 1 ? '1 workout' : `${k} workouts`);

/** The consent screen ("Join the offer" / "Not now"). */
export function consentWords(o: OfferNumbers): { title: string; paragraphs: string[]; join: string; notNow: string; noChange: string } {
  return {
    title: `Join: ${workouts(o.n)}, ${o.d} extra ${o.d === 1 ? 'day' : 'days'}`,
    paragraphs: [
      `How it works: on a day you check in at ${o.gym}, log a workout of at least ${o.min} minutes with ${o.sets} or more sets in ForgeAI. Log ${o.n} of them within ${o.w} days of joining, and ${days(o.d)} are added to your membership.`,
      'What the gym gets: only the dates of those workouts. Never your exercises, weights, sets, body weight or photos.',
      `Who sees it: the owner and front desk of ${o.gym}.`,
      'Stop any time: Gym tab → Workout offer → Leave the offer. The dates are deleted and nothing more is sent.',
      `Questions or complaints: ask at ${o.gym}'s front desk. If it is not solved, you can complain to the Data Protection Board of India.`,
    ],
    join: 'Join the offer',
    notNow: 'Not now',
    noChange: 'Not joining changes nothing about your membership.',
  };
}

export const OFFER_WORDS = {
  eyebrow: (gym: string) => `From ${gym} · Offer`,
  joinedEyebrow: 'Workout offer',
  title: (o: OfferNumbers) => `Train ${o.n} times in ${o.w} days, get ${o.d} extra ${o.d === 1 ? 'day' : 'days'}`,
  how: (o: OfferNumbers) => `Check in at the gym and log a workout of ${o.min}+ minutes with ${o.sets}+ sets.`,
  joinButton: 'Join the offer',
  // Why the member cannot join (yet).
  noPhone: "Check in once with the gym's QR poster to join.",
  noPlan: 'You can join while your plan is running. Ask at the desk.',
  askDesk: 'Ask at the desk to join this offer.',
  // After joining.
  progress: (c: number, n: number) => `${c} of ${workouts(n)}`,
  until: (date: string) => `Until ${date}`,
  counts: 'Counts on days you check in at the gym.',
  leaveButton: 'Leave the offer',
  earned: (n: number, d: number) => `${n} of ${n}. The desk will add ${days(d)} to your membership.`,
  earnedOnly: (n: number) => `${n} of ${workouts(n)}.`,
  given: (date: string) => `Added: your plan now ends on ${date}.`,
  ended: (c: number, n: number, w: number) => `The offer ended at ${c} of ${n}. You came ${c} ${c === 1 ? 'time' : 'times'} in ${w} days. Nice work.`,
  // Leave the offer: a short question first.
  leaveTitle: 'Leave the offer?',
  leaveBody: 'Your workout dates are deleted from the gym, and nothing more is sent. Your membership does not change.',
  leaveConfirm: 'Leave the offer',
  leaveCancel: 'Stay in',
  // Join could not be done (shown in the consent screen only, after the member pressed Join).
  joinClosed: 'This offer has closed. Ask at the desk.',
  joinOffline: "No internet. Try again when you're online.",
  joinFailed: "Couldn't join just now. Try again.",
} as const;

/** The words for a Join the gym refused (member_join_offer's {error}). PURE. */
export function joinErrorWords(code: string | null, offline: boolean): string {
  if (offline) return OFFER_WORDS.joinOffline;
  if (code === 'CLOSED') return OFFER_WORDS.joinClosed;
  if (code === 'NO_PLAN') return OFFER_WORDS.noPlan;
  if (code === 'NO_PHONE') return OFFER_WORDS.noPhone;
  if (code === 'NAME_MISMATCH' || code === 'SHARED_NUMBER' || code === 'NOT_ON_ROSTER' || code === 'GYM_NOT_ONLINE') return OFFER_WORDS.askDesk;
  return OFFER_WORDS.joinFailed;
}
