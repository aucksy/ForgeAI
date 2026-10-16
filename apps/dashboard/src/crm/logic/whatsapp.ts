/**
 * Ready-typed WhatsApp messages the owner sends from their OWN WhatsApp (Gym Panel step 4,
 * 15 Oct 2026). Rival apps sell SMS credits for this; a wa.me link with the words typed in costs
 * nothing and arrives from the gym's own number, which members already know.
 *
 * Plain, short English. The owner can edit them before sending. PURE (no screen code).
 *
 * Review fixes (15 Oct 2026): the greeting and the first sentence share one line ("Hi Rahul, your
 * plan…"), as the enquiry follow-up does, so no line starts with a small letter; "Gold Plan" is
 * "your Gold plan", not "your Gold Plan plan"; "Mr. Rahul Sharma" is greeted as Rahul; and a gym
 * still called "My Gym" (never named) is left out of the words instead of being quoted.
 */

import { formatDay, type DateISO } from './dates';
import { formatINR } from './money';
import { methodLabel } from './payments';
import type { MemberView, Payment } from '../types';

export type MessageKind = 'fees' | 'ending' | 'ended' | 'birthday' | 'welcome';

export interface GymWords {
  name: string;
}

const HONORIFIC = /^(mr|mrs|ms|dr|shri|smt|sri)\.?$/i;

/** The name a member is greeted by: the first word that is not a title (Mr, Smt, Dr…). PURE. */
export function greetingName(fullName: string | null | undefined): string {
  const words = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  return words.find((w) => !HONORIFIC.test(w)) ?? '';
}

/** "Gold Plan" -> "Gold", so the words read "your Gold plan". A name that is only "Plan" stays. */
export function planWord(planName: string): string {
  const name = planName.trim();
  const short = name.replace(/\s+plan$/i, '').trim();
  return short || name;
}

/** The gym's name, or null while it is still the placeholder the panel starts with. */
function gymName(gym: GymWords): string | null {
  const name = gym.name.trim();
  return name && name.toLowerCase() !== 'my gym' ? name : null;
}

function hello(fullName: string): string {
  const n = greetingName(fullName);
  return n ? `Hi ${n},` : 'Hi,';
}

function sign(gym: GymWords): string {
  return `– ${gymName(gym) ?? 'Your gym'}`;
}

/** The messages that fit this member today, most useful first. */
export function messageKindsFor(v: MemberView, birthday: boolean): MessageKind[] {
  const kinds: MessageKind[] = [];
  if (v.outstandingP > 0) kinds.push('fees');
  if (v.coversUntil && v.daysRemaining !== null && v.daysRemaining >= 0 && v.daysRemaining <= 15) kinds.push('ending');
  if (v.state === 'expired') kinds.push('ended');
  if (birthday) kinds.push('birthday');
  kinds.push('welcome');
  return kinds;
}

export function kindLabel(kind: MessageKind): string {
  switch (kind) {
    case 'fees':
      return 'Fees reminder';
    case 'ending':
      return 'Plan ending';
    case 'ended':
      return 'Plan ended';
    case 'birthday':
      return 'Birthday wish';
    case 'welcome':
      return 'Welcome';
  }
}

export function buildMessage(kind: MessageKind, v: MemberView, gym: GymWords, today: DateISO): string {
  const hi = hello(v.member.fullName);
  const plan = v.current?.planName ? planWord(v.current.planName) : 'membership';
  switch (kind) {
    case 'fees':
      return [
        `${hi} ${`a reminder that ${formatINR(v.outstandingP)} of your fees is pending. Please pay at the front desk or on UPI.`}`,
        sign(gym),
      ].join('\n');
    case 'ending': {
      const end = v.coversUntil ?? today;
      const when =
        v.daysRemaining === 0
          ? 'today'
          : `on ${formatDay(end)}`;
      return [
        `${hi} ${`your ${plan} plan ends ${when}. Renew at the desk to keep training without a break.`}`,
        sign(gym),
      ].join('\n');
    }
    case 'ended': {
      const ended = v.current?.endsOn ? formatDay(v.current.endsOn) : '';
      const words = ended
        ? `your ${plan} plan ended on ${ended}. We miss you at the gym. Renew and come back any day.`
        : 'we miss you at the gym. Renew and come back any day.';
      return [`${hi} ${words}`, sign(gym)].join('\n');
    }
    case 'birthday': {
      const n = greetingName(v.member.fullName);
      const wish = n
        ? `Happy birthday, ${n}! Wishing you a great year and great workouts.`
        : 'Happy birthday! Wishing you a great year and great workouts.';
      return [wish, sign(gym)].join('\n');
    }
    case 'welcome': {
      const name = gymName(gym);
      const welcome = name
        ? `welcome to ${name}!`
        : 'welcome to the gym!';
      const runs = v.coversUntil
        ? ` Your ${plan} plan runs till ${formatDay(v.coversUntil)}.`
        : '';
      return [`${hi} ${welcome}${runs}`, 'See you at the gym.', sign(gym)].join('\n');
    }
  }
}

/** A receipt as a WhatsApp message (the printed receipt stays the record). */
export function receiptMessage(
  p: Pick<Payment, 'amountP' | 'paidOn' | 'method' | 'receiptNo'>,
  memberName: string,
  gym: GymWords,
): string {
  return [
    `${hello(memberName)} ${`we received your ${formatINR(p.amountP)} on ${formatDay(p.paidOn)} (${methodLabel(p.method)}). Receipt no. ${p.receiptNo}. Thank you!`}`,
    sign(gym),
  ].join('\n');
}
