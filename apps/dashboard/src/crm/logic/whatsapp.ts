/**
 * Ready-typed WhatsApp messages the owner sends from their OWN WhatsApp (Gym Panel step 4,
 * 15 Oct 2026). Rival apps sell SMS credits for this; a wa.me link with the words typed in costs
 * nothing and arrives from the gym's own number, which members already know.
 *
 * The words follow the panel's language (English, or Hinglish with the polite "aap" — RESEARCH.md
 * §5.2 rule 8). The owner can edit them before sending. PURE (no screen code).
 *
 * Review fixes (15 Oct 2026): the greeting and the first sentence share one line ("Hi Rahul, your
 * plan…"), as the enquiry follow-up does, so no line starts with a small letter; "Gold Plan" is
 * "your Gold plan", not "your Gold Plan plan"; "Mr. Rahul Sharma" is greeted as Rahul; and a gym
 * still called "My Gym" (never named) is left out of the words instead of being quoted.
 */

import { tr } from '../i18n';
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
  return n ? tr(`Hi ${n},`, `Namaste ${n} ji,`) : tr('Hi,', 'Namaste,');
}

function sign(gym: GymWords): string {
  return `– ${gymName(gym) ?? tr('Your gym', 'Aapka gym')}`;
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
      return tr('Fees reminder', 'Fees ki yaad');
    case 'ending':
      return tr('Plan ending', 'Plan khatam hone wala');
    case 'ended':
      return tr('Plan ended', 'Plan khatam ho gaya');
    case 'birthday':
      return tr('Birthday wish', 'Birthday ki badhai');
    case 'welcome':
      return tr('Welcome', 'Swagat');
  }
}

export function buildMessage(kind: MessageKind, v: MemberView, gym: GymWords, today: DateISO): string {
  const hi = hello(v.member.fullName);
  const plan = v.current?.planName ? planWord(v.current.planName) : tr('membership', 'membership');
  switch (kind) {
    case 'fees':
      return [
        `${hi} ${tr(
          `a reminder that ${formatINR(v.outstandingP)} of your fees is pending. Please pay at the front desk or on UPI.`,
          `aapki ${formatINR(v.outstandingP)} fees baaki hai. Kripya front desk par ya UPI se jama karein.`,
        )}`,
        sign(gym),
      ].join('\n');
    case 'ending': {
      const end = v.coversUntil ?? today;
      const when =
        v.daysRemaining === 0
          ? tr('today', 'aaj')
          : tr(`on ${formatDay(end)}`, `${formatDay(end)} ko`);
      return [
        `${hi} ${tr(
          `your ${plan} plan ends ${when}. Renew at the desk to keep training without a break.`,
          `aapka ${plan} plan ${when} khatam ho raha hai. Bina break ke training ke liye Renew karwa lein.`,
        )}`,
        sign(gym),
      ].join('\n');
    }
    case 'ended': {
      const ended = v.current?.endsOn ? formatDay(v.current.endsOn) : '';
      const words = ended
        ? tr(
            `your ${plan} plan ended on ${ended}. We miss you at the gym. Renew and come back any day.`,
            `aapka ${plan} plan ${ended} ko khatam ho gaya. Hum aapko gym mein miss kar rahe hain. Renew karwa ke kabhi bhi aaiye.`,
          )
        : tr(
            'we miss you at the gym. Renew and come back any day.',
            'hum aapko gym mein miss kar rahe hain. Renew karwa ke kabhi bhi aaiye.',
          );
      return [`${hi} ${words}`, sign(gym)].join('\n');
    }
    case 'birthday': {
      const n = greetingName(v.member.fullName);
      const wish = n
        ? tr(
            `Happy birthday, ${n}! Wishing you a great year and great workouts.`,
            `Namaste ${n} ji! Janamdin ki dher saari shubhkamnayein! Aapka saal khushiyon aur fitness se bhara rahe.`,
          )
        : tr(
            'Happy birthday! Wishing you a great year and great workouts.',
            'Janamdin ki dher saari shubhkamnayein! Aapka saal khushiyon aur fitness se bhara rahe.',
          );
      return [wish, sign(gym)].join('\n');
    }
    case 'welcome': {
      const name = gymName(gym);
      const welcome = name
        ? tr(`welcome to ${name}!`, `${name} mein aapka swagat hai!`)
        : tr('welcome to the gym!', 'gym mein aapka swagat hai!');
      const runs = v.coversUntil
        ? tr(` Your ${plan} plan runs till ${formatDay(v.coversUntil)}.`, ` Aapka ${plan} plan ${formatDay(v.coversUntil)} tak hai.`)
        : '';
      return [`${hi} ${welcome}${runs}`, tr('See you at the gym.', 'Gym mein milte hain.'), sign(gym)].join('\n');
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
    `${hello(memberName)} ${tr(
      `we received your ${formatINR(p.amountP)} on ${formatDay(p.paidOn)} (${methodLabel(p.method)}). Receipt no. ${p.receiptNo}. Thank you!`,
      `humein aapke ${formatINR(p.amountP)} mil gaye (${formatDay(p.paidOn)}, ${methodLabel(p.method)}). Raseed no. ${p.receiptNo}. Dhanyavaad!`,
    )}`,
    sign(gym),
  ].join('\n');
}
