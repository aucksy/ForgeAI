/**
 * Ready-typed WhatsApp messages the owner sends from their OWN WhatsApp (Gym Panel step 4,
 * 15 Oct 2026). Rival apps sell SMS credits for this; a wa.me link with the words typed in costs
 * nothing and arrives from the gym's own number, which members already know.
 *
 * The words follow the panel's language (English, or Hinglish with the polite "aap" — RESEARCH.md
 * §5.2 rule 8). The owner can edit them before sending. PURE (no screen code).
 */

import { tr } from '../i18n';
import { formatDay, type DateISO } from './dates';
import { firstName } from '../shop/invite';
import { formatINR } from './money';
import { methodLabel } from './payments';
import type { MemberView, Payment } from '../types';

export type MessageKind = 'fees' | 'ending' | 'ended' | 'birthday' | 'welcome';

export interface GymWords {
  name: string;
}

function hello(fullName: string): string {
  const n = firstName(fullName);
  return n ? tr(`Hi ${n},`, `Namaste ${n} ji,`) : tr('Hi,', 'Namaste,');
}

function sign(gym: GymWords): string {
  return `– ${gym.name.trim() || tr('Your gym', 'Aapka gym')}`;
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
      return tr('Fees reminder', 'Fees reminder');
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
  const plan = v.current?.planName ?? tr('membership', 'membership');
  switch (kind) {
    case 'fees':
      return [
        hi,
        tr(
          `a reminder that ${formatINR(v.outstandingP)} of your fees is pending. Please pay at the front desk or on UPI.`,
          `aapki ${formatINR(v.outstandingP)} fees baaki hai. Kripya front desk par ya UPI se jama karein.`,
        ),
        sign(gym),
      ].join('\n');
    case 'ending': {
      const end = v.coversUntil ?? today;
      const when =
        v.daysRemaining === 0
          ? tr('today', 'aaj')
          : tr(`on ${formatDay(end)}`, `${formatDay(end)} ko`);
      return [
        hi,
        tr(
          `your ${plan} plan ends ${when}. Renew at the desk to keep training without a break.`,
          `aapka ${plan} plan ${when} khatam ho raha hai. Bina break ke training ke liye Renew karwa lein.`,
        ),
        sign(gym),
      ].join('\n');
    }
    case 'ended': {
      const ended = v.current?.endsOn ? formatDay(v.current.endsOn) : '';
      return [
        hi,
        ended
          ? tr(
              `your ${plan} plan ended on ${ended}. We miss you at the gym. Renew and come back any day.`,
              `aapka ${plan} plan ${ended} ko khatam ho gaya. Gym mein aapki kami hai. Renew karwa ke kabhi bhi aaiye.`,
            )
          : tr('we miss you at the gym. Renew and come back any day.', 'gym mein aapki kami hai. Renew karwa ke kabhi bhi aaiye.'),
        sign(gym),
      ].join('\n');
    }
    case 'birthday':
      return [
        firstName(v.member.fullName)
          ? tr(`Happy birthday, ${firstName(v.member.fullName)}!`, `Happy birthday ${firstName(v.member.fullName)} ji!`)
          : tr('Happy birthday!', 'Happy birthday!'),
        tr('Wishing you a great year and great workouts.', 'Aapko saal bhar khushiyan aur achhi workout ki shubhkamnayein.'),
        sign(gym),
      ].join('\n');
    case 'welcome':
      return [
        hi,
        v.coversUntil
          ? tr(
              `welcome to ${gym.name}! Your ${plan} plan runs till ${formatDay(v.coversUntil)}.`,
              `${gym.name} mein aapka swagat hai! Aapka ${plan} plan ${formatDay(v.coversUntil)} tak hai.`,
            )
          : tr(`welcome to ${gym.name}!`, `${gym.name} mein aapka swagat hai!`),
        tr('See you at the gym.', 'Gym mein milte hain.'),
        sign(gym),
      ].join('\n');
  }
}

/** A receipt as a WhatsApp message (the printed receipt stays the record). */
export function receiptMessage(
  p: Pick<Payment, 'amountP' | 'paidOn' | 'method' | 'receiptNo'>,
  memberName: string,
  gym: GymWords,
): string {
  return [
    hello(memberName),
    tr(
      `received ${formatINR(p.amountP)} on ${formatDay(p.paidOn)} (${methodLabel(p.method)}). Receipt no. ${p.receiptNo}. Thank you!`,
      `${formatDay(p.paidOn)} ko ${formatINR(p.amountP)} mile (${methodLabel(p.method)}). Raseed no. ${p.receiptNo}. Dhanyavaad!`,
    ),
    sign(gym),
  ].join('\n');
}
