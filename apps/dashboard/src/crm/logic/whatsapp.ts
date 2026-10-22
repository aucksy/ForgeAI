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
 *
 * Messages & offers step 1 (22 Oct 2026, R-offers-notices.md §7 items 18-24): every message also in
 * Hindi (Devanagari, natural spoken Hindi: "नमस्ते Rahul जी, ..."), or both with the Hindi under the
 * English, and two new ones: "Haven't seen you" (the Away list; never an offer in it, the research
 * found an unasked offer made members leave more) and "Years with us" (the joining anniversary).
 * The receipt message stays English: the printed receipt is the record.
 */

import { formatDay, partsOf, type DateISO } from './dates';
import { isBirthdayToday } from './homeTiles';
import { formatDayHi, type MessageLang } from './messageWords';
import { formatINR } from './money';
import { methodLabel } from './payments';
import type { MemberView, Payment } from '../types';

export type MessageKind = 'fees' | 'ending' | 'ended' | 'birthday' | 'welcome' | 'away' | 'anniversary';

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
export function gymName(gym: GymWords): string | null {
  const name = gym.name.trim();
  return name && name.toLowerCase() !== 'my gym' ? name : null;
}

function hello(fullName: string): string {
  const n = greetingName(fullName);
  return n ? `Hi ${n},` : 'Hi,';
}

function helloHi(fullName: string): string {
  const n = greetingName(fullName);
  return n ? `नमस्ते ${n} जी,` : 'नमस्ते जी,';
}

/** The last line of every message: "– Iron Temple" (or "– Your gym" while it has no name). */
export function signLine(gym: GymWords, lang: 'en' | 'hi' = 'en'): string {
  return `– ${gymName(gym) ?? (lang === 'hi' ? 'आपका जिम' : 'Your gym')}`;
}

/**
 * Whole years since joining when today is the joining day's anniversary (a 29 Feb joiner is
 * remembered on 28 Feb in other years, as birthdays are), else null. Never 0: the day they joined
 * is not an anniversary. PURE.
 */
export function yearsWithGym(joinedOn: string | null | undefined, today: DateISO): number | null {
  if (!joinedOn || !isBirthdayToday(joinedOn, today)) return null;
  const years = partsOf(today).year - partsOf(joinedOn).year;
  return years >= 1 ? years : null;
}

/** The messages that fit this member today, most useful first. */
export function messageKindsFor(
  v: MemberView,
  birthday: boolean,
  more: { away?: boolean; yearsWithGym?: number | null } = {},
): MessageKind[] {
  const kinds: MessageKind[] = [];
  if (v.outstandingP > 0) kinds.push('fees');
  if (v.coversUntil && v.daysRemaining !== null && v.daysRemaining >= 0 && v.daysRemaining <= 15) kinds.push('ending');
  if (v.state === 'expired') kinds.push('ended');
  if (more.away) kinds.push('away');
  if (birthday) kinds.push('birthday');
  if (more.yearsWithGym) kinds.push('anniversary');
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
    case 'away':
      return 'Haven’t seen you';
    case 'anniversary':
      return 'Years with us';
  }
}

function englishLines(kind: MessageKind, v: MemberView, gym: GymWords, today: DateISO): string[] {
  const hi = hello(v.member.fullName);
  const plan = v.current?.planName ? planWord(v.current.planName) : 'membership';
  const sign = signLine(gym, 'en');
  switch (kind) {
    case 'fees':
      return [`${hi} ${formatINR(v.outstandingP)} of your fees is due. Please pay at the front desk or on UPI.`, sign];
    case 'ending': {
      const end = v.coversUntil ?? today;
      const when = v.daysRemaining === 0 ? 'today' : `on ${formatDay(end)}`;
      return [`${hi} your ${plan} plan ends ${when}. Renew at the desk to keep training without a break.`, sign];
    }
    case 'ended': {
      const ended = v.current?.endsOn ? formatDay(v.current.endsOn) : '';
      const words = ended
        ? `your ${plan} plan ended on ${ended}. We miss you at the gym. Renew and come back any day.`
        : 'we miss you at the gym. Renew and come back any day.';
      return [`${hi} ${words}`, sign];
    }
    case 'birthday': {
      const n = greetingName(v.member.fullName);
      const wish = n
        ? `Happy birthday, ${n}! Wishing you a great year and great workouts.`
        : 'Happy birthday! Wishing you a great year and great workouts.';
      return [wish, sign];
    }
    case 'welcome': {
      const name = gymName(gym);
      const welcome = name ? `welcome to ${name}!` : 'welcome to the gym!';
      const runs = v.coversUntil ? ` Your ${plan} plan runs till ${formatDay(v.coversUntil)}.` : '';
      return [`${hi} ${welcome}${runs}`, 'See you at the gym.', sign];
    }
    case 'away': {
      // About training only, never money or an offer (R-offers-notices §2, frequency rules).
      const n = v.daysSinceVisit;
      const since = n === null ? 'we haven’t seen you at the gym yet.' : `we haven’t seen you in ${n === 1 ? '1 day' : `${n} days`}.`;
      const runs = v.coversUntil ? ` Your plan runs till ${formatDay(v.coversUntil)}.` : '';
      return [`${hi} ${since} All well?${runs} See you soon.`, sign];
    }
    case 'anniversary': {
      const years = yearsWithGym(v.member.joinedOn, today) ?? 1;
      const span = years === 1 ? '1 year' : `${years} years`;
      const name = gymName(gym);
      const where = name ? `with ${name}` : 'at the gym';
      return [`${hi} today you complete ${span} ${where}. Thank you for training with us!`, sign];
    }
  }
}

function hindiLines(kind: MessageKind, v: MemberView, gym: GymWords, today: DateISO): string[] {
  const hi = helloHi(v.member.fullName);
  const plan = v.current?.planName ? `आपका ${planWord(v.current.planName)} प्लान` : 'आपका प्लान';
  const sign = signLine(gym, 'hi');
  switch (kind) {
    case 'fees':
      return [`${hi} आपकी ${formatINR(v.outstandingP)} फ़ीस बाक़ी है। कृपया डेस्क पर या UPI से जमा करें।`, sign];
    case 'ending': {
      const end = v.coversUntil ?? today;
      const when = v.daysRemaining === 0 ? 'आज' : `${formatDayHi(end)} को`;
      return [`${hi} ${plan} ${when} ख़त्म हो रहा है। बिना ब्रेक ट्रेनिंग जारी रखने के लिए डेस्क पर रिन्यू करें।`, sign];
    }
    case 'ended': {
      const words = v.current?.endsOn
        ? `${plan} ${formatDayHi(v.current.endsOn)} को ख़त्म हो गया। जिम में आपकी कमी महसूस हो रही है। कभी भी रिन्यू करके वापस आइए।`
        : 'जिम में आपकी कमी महसूस हो रही है। कभी भी रिन्यू करके वापस आइए।';
      return [`${hi} ${words}`, sign];
    }
    case 'birthday': {
      const n = greetingName(v.member.fullName);
      const wish = n
        ? `जन्मदिन की बहुत-बहुत शुभकामनाएँ, ${n} जी! आपका साल शानदार रहे।`
        : 'जन्मदिन की बहुत-बहुत शुभकामनाएँ! आपका साल शानदार रहे।';
      return [wish, sign];
    }
    case 'welcome': {
      const name = gymName(gym);
      const runs = v.coversUntil ? ` ${plan} ${formatDayHi(v.coversUntil)} तक है।` : '';
      return [`${hi} ${name ?? 'जिम'} में आपका स्वागत है!${runs}`, 'जिम में मिलते हैं।', sign];
    }
    case 'away': {
      const n = v.daysSinceVisit;
      const since = n === null ? 'आप अभी तक जिम नहीं आए।' : `${n} दिन से आप जिम नहीं आए।`;
      const runs = v.coversUntil ? ` आपका प्लान ${formatDayHi(v.coversUntil)} तक है।` : '';
      return [`${hi} ${since} सब ठीक है?${runs} जल्द मिलते हैं।`, sign];
    }
    case 'anniversary': {
      const years = yearsWithGym(v.member.joinedOn, today) ?? 1;
      const span = years === 1 ? 'आपका 1 साल पूरा हुआ' : `आपके ${years} साल पूरे हुए`;
      const name = gymName(gym);
      const where = name ? `${name} के साथ` : 'जिम में';
      return [`${hi} आज ${where} ${span}। हमारे साथ ट्रेनिंग के लिए शुक्रिया!`, sign];
    }
  }
}

/**
 * One member's message. `lang` "both" is the English, a blank line, then the Hindi, signed once at
 * the end.
 */
export function buildMessage(kind: MessageKind, v: MemberView, gym: GymWords, today: DateISO, lang: MessageLang = 'en'): string {
  if (lang === 'hi') return hindiLines(kind, v, gym, today).join('\n');
  const en = englishLines(kind, v, gym, today);
  if (lang === 'en') return en.join('\n');
  return `${en.slice(0, -1).join('\n')}\n\n${hindiLines(kind, v, gym, today).join('\n')}`;
}

/** A receipt as a WhatsApp message (the printed receipt stays the record). */
export function receiptMessage(
  p: Pick<Payment, 'amountP' | 'paidOn' | 'method' | 'receiptNo'> & Partial<Pick<Payment, 'collectedByName'>>,
  memberName: string,
  gym: GymWords,
): string {
  // UAT U-A1: who took the money, when the receipt has a name (an old one may not).
  const taker = p.collectedByName?.trim();
  return [
    `${hello(memberName)} we received your ${formatINR(p.amountP)} on ${formatDay(p.paidOn)} (${methodLabel(p.method)}). Receipt no. ${p.receiptNo}.${taker ? ` Received by ${taker}.` : ''} Thank you!`,
    signLine(gym),
  ].join('\n');
}
