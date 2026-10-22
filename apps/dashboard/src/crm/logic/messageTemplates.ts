/**
 * Ready messages for the owner to send members (Messages & offers step 1, 22 Oct 2026). PURE.
 * The words are the research's (docs/overhaul/research/R-offers-notices.md §7), in English and
 * Hindi, already length-checked there; test/crm/messageTemplates.test.ts checks them again filled in.
 *
 * The blanks are BOXES, not [brackets] to type into: a day (a date, said with its weekday), a date,
 * a time, a festival from a list, a reason, an amount, a discount, a number of days, a plan of the
 * gym's own. Each box knows how to say its value in each language ("Sunday 8 Nov" / "रविवार 8
 * नवंबर", "6 am" / "सुबह 6 बजे"). A box left empty stays in the words as "[Its label]", so the
 * existing check ("Fill in the words in [brackets] first", shop/messages.ts) still stops a send.
 *
 * Four groups: Gym news, Offers, Events (sent in the app and on WhatsApp) and Personal (WhatsApp
 * only, each member's own words from logic/whatsapp.ts). The research's "workout offer" (template
 * 15) is left out until members can join an offer in the app (step 2): sending it now would point
 * members at an Offers screen that does not exist yet.
 *
 * "Both" = the Hindi under the English: the body is English, a blank line, Hindi; the title carries
 * both when they fit in 60 letters together, else the English (the Hindi body says it all).
 */

import type { AudienceType } from './audience';
import { formatINR } from './money';
import { daysWords, dayMonth, letterCount, timeWords, weekdayDayMonth, type MessageLang } from './messageWords';
import { planWord, type MessageKind as WhatsAppKind } from './whatsapp';
import type { MessageKind as ServerKind } from '../shop/messages';

export type TemplateGroup = 'news' | 'offers' | 'events' | 'personal';

export const TEMPLATE_GROUPS: readonly { value: TemplateGroup; label: string }[] = [
  { value: 'news', label: 'Gym news' },
  { value: 'offers', label: 'Offers' },
  { value: 'events', label: 'Events' },
  { value: 'personal', label: 'Personal' },
];

/** What a box holds and how its value is said. */
export type SlotKind = 'day' | 'date' | 'time' | 'choice' | 'amount' | 'discount' | 'days' | 'number' | 'plan' | 'text';

export interface ChoiceOption {
  id: string;
  en: string;
  hi: string;
}

export interface Slot {
  key: string;
  /** The box's label on screen, plain English. */
  label: string;
  kind: SlotKind;
  placeholder?: string;
  /** For `choice`: the list ("Other" with a box of its own is always offered after it). */
  options?: readonly ChoiceOption[];
  /** Left empty, the sentence holding it (marked << >> in the words) is dropped. */
  optional?: boolean;
}

export interface Words {
  title: string;
  body: string;
}

/** A message for every app member (and WhatsApp to a group): Gym news, Offers, Events. */
export interface BroadcastTemplate {
  id: string;
  group: Exclude<TemplateGroup, 'personal'>;
  label: string;
  /** The server's message type (0008): offers and events count toward 1 a day, 3 a week. */
  kind: ServerKind;
  /** Who it goes to unless the owner picks another group (R-offers-notices §2). */
  audience: AudienceType;
  slots: readonly Slot[];
  en: Words;
  hi: Words;
}

/** WhatsApp only, each member's own words (logic/whatsapp.ts), to a fixed group. */
export interface PersonalTemplate {
  id: string;
  group: 'personal';
  label: string;
  waKind: WhatsAppKind;
  audience: AudienceType;
}

export type Template = BroadcastTemplate | PersonalTemplate;

export function isPersonal(t: Template): t is PersonalTemplate {
  return t.group === 'personal';
}

// ---------------------------------------------------------------- lists for the boxes

/** Festival names only: the owner picks the date, because festival dates move every year. */
export const FESTIVALS: readonly ChoiceOption[] = [
  { id: 'diwali', en: 'Diwali', hi: 'दिवाली' },
  { id: 'holi', en: 'Holi', hi: 'होली' },
  { id: 'eid', en: 'Eid', hi: 'ईद' },
  { id: 'christmas', en: 'Christmas', hi: 'क्रिसमस' },
  // "नए साल" (not "नया साल"): it is always followed by के / की / पर / ऑफ़र here.
  { id: 'new-year', en: 'New Year', hi: 'नए साल' },
  { id: 'sankranti', en: 'Makar Sankranti', hi: 'मकर संक्रांति' },
  { id: 'rakhi', en: 'Raksha Bandhan', hi: 'रक्षाबंधन' },
  { id: 'navratri', en: 'Navratri', hi: 'नवरात्रि' },
  { id: 'independence', en: 'Independence Day', hi: 'स्वतंत्रता दिवस' },
  { id: 'republic', en: 'Republic Day', hi: 'गणतंत्र दिवस' },
  { id: 'womens-day', en: 'Women’s Day', hi: 'महिला दिवस' },
  { id: 'yoga-day', en: 'Yoga Day', hi: 'योग दिवस' },
];

const CLOSED_REASONS: readonly ChoiceOption[] = [
  { id: 'power', en: 'a power cut', hi: 'बिजली कटौती' },
  { id: 'water', en: 'a water problem', hi: 'पानी की समस्या' },
  { id: 'repair', en: 'repair work', hi: 'मरम्मत के काम' },
  { id: 'election', en: 'election day', hi: 'चुनाव' },
];

const RULES: readonly ChoiceOption[] = [
  { id: 'weights', en: 'put the weights back after use', hi: 'इस्तेमाल के बाद वज़न वापस रखें' },
  { id: 'shoes', en: 'wear clean shoes inside the gym', hi: 'जिम के अंदर साफ़ जूते पहनें' },
  { id: 'towel', en: 'bring a towel and wipe the bench after use', hi: 'तौलिया साथ लाएँ और इस्तेमाल के बाद बेंच पोंछें' },
];

const OTHER = 'other';

// ---------------------------------------------------------------- the templates

const day = (key: string, label: string): Slot => ({ key, label, kind: 'day' });
const date = (key: string, label: string): Slot => ({ key, label, kind: 'date' });
const time = (key: string, label: string, optional = false): Slot => ({ key, label, kind: 'time', optional });
const text = (key: string, label: string, placeholder: string): Slot => ({ key, label, kind: 'text', placeholder });
const festival: Slot = { key: 'festival', label: 'Festival', kind: 'choice', options: FESTIVALS };
const discount: Slot = { key: 'discount', label: 'Discount', kind: 'discount' };
const plan: Slot = { key: 'plan', label: 'Plan', kind: 'plan' };

export const BROADCAST_TEMPLATES: readonly BroadcastTemplate[] = [
  // ------------------------------------------------ Gym news
  {
    id: 'closed-festival',
    group: 'news',
    label: 'Closed for a festival',
    kind: 'closed',
    audience: 'everyone',
    slots: [day('closedOn', 'Closed on'), festival, day('openOn', 'Open again on'), time('openAt', 'Open again at')],
    en: {
      title: 'Gym closed on {closedOn}',
      body: 'The gym is closed on {closedOn} for {festival}. We open again on {openOn} at {openAt}. Happy {festival}!',
    },
    hi: {
      title: '{closedOn} को जिम बंद रहेगा',
      body: '{festival} के कारण {closedOn} को जिम बंद रहेगा। {openOn} को {openAt} से फिर खुलेगा। {festival} की शुभकामनाएँ!',
    },
  },
  {
    id: 'closed-today',
    group: 'news',
    label: 'Closed today',
    kind: 'closed',
    audience: 'everyone',
    slots: [{ key: 'reason', label: 'Why', kind: 'choice', options: CLOSED_REASONS }, day('openOn', 'Open again on'), time('openAt', 'Open again at')],
    en: {
      title: 'Gym closed today',
      body: 'Sorry, the gym is closed today because of {reason}. We open again on {openOn} at {openAt}.',
    },
    hi: {
      title: 'आज जिम बंद है',
      body: 'माफ़ कीजिए, {reason} के कारण आज जिम बंद है। {openOn} को {openAt} से फिर खुलेगा।',
    },
  },
  {
    id: 'new-timings',
    group: 'news',
    label: 'New timings',
    kind: 'timing',
    audience: 'everyone',
    slots: [
      date('from', 'From'),
      time('opens', 'Opens at'),
      time('closes', 'Closes at'),
      time('sunOpens', 'Sunday opens at (optional)', true),
      time('sunCloses', 'Sunday closes at (optional)', true),
    ],
    en: {
      title: 'New gym timings from {from}',
      body: 'From {from} the gym is open {opens} to {closes}.<< Sunday: {sunOpens} to {sunCloses}.>>',
    },
    hi: {
      title: '{from} से जिम का नया समय',
      body: '{from} से जिम {opens} से {closes} तक खुलेगा।<< रविवार: {sunOpens} से {sunCloses} तक।>>',
    },
  },
  {
    id: 'festival-timings',
    group: 'news',
    label: 'Festival timings',
    kind: 'timing',
    audience: 'everyone',
    slots: [festival, day('on', 'On'), time('opens', 'Opens at'), time('closes', 'Closes at')],
    en: { title: '{festival} timings', body: 'On {on} the gym is open only {opens} to {closes}.' },
    hi: { title: '{festival} पर जिम का समय', body: '{on} को जिम सिर्फ़ {opens} से {closes} तक खुला रहेगा।' },
  },
  {
    id: 'repair',
    group: 'news',
    label: 'Machine under repair',
    kind: 'announcement',
    audience: 'everyone',
    slots: [text('machine', 'Machine', 'treadmill'), date('till', 'Till')],
    en: {
      title: '{machine} under repair',
      body: 'The {machine} is under repair till {till}. Sorry for the trouble. Ask a trainer for another exercise.',
    },
    hi: {
      title: '{machine} की मरम्मत चल रही है',
      body: '{till} तक {machine} की मरम्मत चल रही है। असुविधा के लिए माफ़ी। ट्रेनर से दूसरी एक्सरसाइज़ पूछें।',
    },
  },
  {
    id: 'new-batch',
    group: 'news',
    label: 'New batch',
    kind: 'announcement',
    audience: 'everyone',
    slots: [text('batch', 'Batch', 'Zumba'), date('starts', 'Starts on'), time('from', 'From'), time('to', 'To')],
    en: { title: 'New {batch} batch', body: 'A new {batch} batch starts on {starts}, {from} to {to}. Ask at the desk to join.' },
    hi: { title: 'नया {batch} बैच', body: '{starts} से नया {batch} बैच शुरू, {from} से {to} तक। जुड़ने के लिए डेस्क पर पूछें।' },
  },
  {
    id: 'new-trainer',
    group: 'news',
    label: 'New trainer',
    kind: 'announcement',
    audience: 'everyone',
    slots: [text('name', 'Trainer’s name', 'Rohit'), date('from', 'Starts on'), text('what', 'Trains', 'strength and fat loss')],
    en: { title: 'Meet our new trainer, {name}', body: '{name} joins us from {from} and trains {what}. Say hello at the gym!' },
    hi: { title: 'हमारे नए ट्रेनर {name}', body: '{from} से {name} हमारे साथ हैं। वे {what} सिखाते हैं। जिम में मिलिए!' },
  },
  {
    id: 'request',
    group: 'news',
    label: 'A request to everyone',
    kind: 'announcement',
    audience: 'everyone',
    slots: [{ key: 'rule', label: 'The request', kind: 'choice', options: RULES }],
    en: { title: 'A request to everyone', body: 'Please {rule}. It keeps the gym clean and safe for all. Thank you!' },
    hi: { title: 'सबसे एक निवेदन', body: 'कृपया {rule}। इससे जिम सबके लिए साफ़ और सुरक्षित रहता है। धन्यवाद!' },
  },
  // ------------------------------------------------ Offers (each counts toward 1 a day, 3 a week)
  {
    id: 'festival-offer',
    group: 'offers',
    label: 'Festival offer',
    kind: 'offer',
    audience: 'everyone',
    slots: [festival, discount, plan, date('by', 'Join or renew by')],
    en: {
      title: '{festival} offer: {discount} off',
      body: 'Join or renew by {by} and get {discount} off the {plan} plan. Ask at the desk.',
    },
    hi: {
      title: '{festival} ऑफ़र: {discount} की छूट',
      body: '{by} तक जॉइन या रिन्यू करें और {plan} प्लान पर {discount} की छूट पाएँ। डेस्क पर पूछें।',
    },
  },
  {
    id: 'renew-early',
    group: 'offers',
    label: 'Renew early',
    kind: 'offer',
    audience: 'ending7',
    slots: [{ key: 'days', label: 'Free days', kind: 'days' }, date('till', 'Offer till')],
    en: {
      title: 'Renew early, get {days} free',
      body: 'Renew before your plan ends and get {days} extra free. Offer till {till}.',
    },
    hi: {
      title: 'जल्दी रिन्यू करें, {days} मुफ़्त',
      body: 'प्लान ख़त्म होने से पहले रिन्यू करें और {days} मुफ़्त पाएँ। ऑफ़र {till} तक।',
    },
  },
  {
    id: 'bring-friend',
    group: 'offers',
    label: 'Bring a friend',
    kind: 'offer',
    audience: 'active',
    slots: [{ key: 'days', label: 'Free days for the member', kind: 'days' }, { ...discount, label: 'Discount for the friend' }, date('till', 'Till')],
    en: {
      title: 'Bring a friend, get {days} free',
      body: 'When a friend joins and names you, you get {days} extra and your friend gets {discount} off. Till {till}.',
    },
    hi: {
      title: 'दोस्त को लाएँ, {days} मुफ़्त',
      body: 'आपका नाम लेकर दोस्त जॉइन करे तो आपको {days} ज़्यादा और दोस्त को {discount} की छूट। {till} तक।',
    },
  },
  {
    id: 'family',
    group: 'offers',
    label: 'Couple and family',
    kind: 'offer',
    audience: 'everyone',
    slots: [discount, date('till', 'Till')],
    en: {
      title: 'Couple and family offer',
      body: 'Join together and save: {discount} off each for 2 or more family members, any plan. Till {till}.',
    },
    hi: {
      title: 'कपल और फ़ैमिली ऑफ़र',
      body: 'साथ जॉइन करें: परिवार के 2 या ज़्यादा लोगों में हर सदस्य को किसी भी प्लान पर {discount} की छूट। {till} तक।',
    },
  },
  {
    id: 'student',
    group: 'offers',
    label: 'Student offer',
    kind: 'offer',
    audience: 'everyone',
    slots: [plan, { key: 'price', label: 'Price a month (₹)', kind: 'amount' }],
    en: {
      title: 'Student offer: {price} a month',
      body: 'Students get the {plan} plan for {price} a month. Show your college ID at the desk.',
    },
    hi: {
      title: 'स्टूडेंट ऑफ़र: {price} प्रति महीना',
      body: 'स्टूडेंट्स को {plan} प्लान {price} प्रति महीना। डेस्क पर कॉलेज आईडी दिखाएँ।',
    },
  },
  {
    id: 'longer-plan',
    group: 'offers',
    label: 'Longer plan saves money',
    kind: 'offer',
    audience: 'plan',
    slots: [
      { key: 'months', label: 'Months', kind: 'number' },
      { key: 'price', label: 'Price (₹)', kind: 'amount' },
      { key: 'saving', label: 'Saving (₹)', kind: 'amount' },
      date('till', 'Till'),
    ],
    en: {
      title: 'Save with a {months}-month plan',
      body: 'Take the {months}-month plan for {price} and save {saving} over paying monthly. Till {till}.',
    },
    hi: {
      title: '{months} महीने के प्लान पर बचत',
      // "के मुक़ाबले": the research's "फ़ीस देने से" read as "by paying monthly you save".
      body: '{months} महीने का प्लान {price} में लें। हर महीने फ़ीस देने के मुक़ाबले {saving} की बचत। {till} तक।',
    },
  },
  // ------------------------------------------------ Events
  {
    id: 'event',
    group: 'events',
    label: 'Event',
    kind: 'event',
    audience: 'everyone',
    slots: [text('event', 'Event', 'Deadlift day'), date('on', 'On'), time('at', 'At')],
    en: { title: '{event} on {on}', body: 'Join us for {event} on {on} at {at}. Free for members. Bring a friend!' },
    hi: { title: '{on} को {event}', body: '{on} को {at} {event} में आइए। मेंबर्स के लिए मुफ़्त। दोस्त को भी लाएँ!' },
  },
  {
    id: 'challenge',
    group: 'events',
    label: 'Challenge',
    kind: 'event',
    audience: 'active',
    slots: [text('challenge', 'Challenge', '30-day challenge'), date('starts', 'Starts on'), text('prize', 'Prize', 'a free month')],
    en: { title: '{challenge} starts on {starts}', body: 'Our {challenge} starts on {starts}. Sign up at the desk. Prize: {prize}.' },
    hi: { title: '{starts} से {challenge} शुरू', body: '{starts} से हमारा {challenge} शुरू। डेस्क पर नाम लिखवाएँ। इनाम: {prize}।' },
  },
];

/** WhatsApp only: the existing one-to-one messages, sent down a list (R-offers-notices §7, 19-23). */
export const PERSONAL_TEMPLATES: readonly PersonalTemplate[] = [
  { id: 'ending', group: 'personal', label: 'Plan ending', waKind: 'ending', audience: 'ending7' },
  { id: 'ended', group: 'personal', label: 'Plan ended', waKind: 'ended', audience: 'ended30' },
  { id: 'birthday', group: 'personal', label: 'Birthday wish', waKind: 'birthday', audience: 'birthday' },
  { id: 'away', group: 'personal', label: 'Haven’t seen you', waKind: 'away', audience: 'away' },
];

export const TEMPLATES: readonly Template[] = [...BROADCAST_TEMPLATES, ...PERSONAL_TEMPLATES];

export function templateById(id: string | null | undefined): Template | null {
  return TEMPLATES.find((t) => t.id === id) ?? null;
}

export function templatesIn(group: TemplateGroup): Template[] {
  return TEMPLATES.filter((t) => t.group === group);
}

// ---------------------------------------------------------------- filling the blanks

/** What the boxes hold, by slot key. A choice's own words sit under `<key>.other`; a discount's unit under `<key>.unit`. */
export type SlotValues = Readonly<Record<string, string | undefined>>;

const WHOLE = /^\d{1,7}$/;

function wholeIn(raw: string | undefined, min: number, max: number): number | null {
  const t = (raw ?? '').trim();
  if (!WHOLE.test(t)) return null;
  const n = Number(t);
  return n >= min && n <= max ? n : null;
}

/** One box's value in words, or null while it is empty (or not a real date, time or number). */
export function slotWords(slot: Slot, values: SlotValues, lang: 'en' | 'hi'): string | null {
  const raw = (values[slot.key] ?? '').trim();
  switch (slot.kind) {
    case 'day':
      return raw ? weekdayDayMonth(raw, lang) : null;
    case 'date':
      return raw ? dayMonth(raw, lang) : null;
    case 'time':
      return raw ? timeWords(raw, lang) : null;
    case 'choice': {
      if (raw === OTHER) return clean(values[`${slot.key}.other`]);
      const hit = slot.options?.find((o) => o.id === raw);
      return hit ? (lang === 'hi' ? hit.hi : hit.en) : null;
    }
    case 'amount': {
      const n = wholeIn(raw, 1, 10_00_000);
      return n === null ? null : formatINR(n * 100);
    }
    case 'discount': {
      const unit = values[`${slot.key}.unit`] === '₹' ? '₹' : '%';
      const n = wholeIn(raw, 1, unit === '%' ? 100 : 10_00_000);
      if (n === null) return null;
      return unit === '%' ? `${n}%` : formatINR(n * 100);
    }
    case 'days': {
      const n = wholeIn(raw, 1, 365);
      return n === null ? null : daysWords(n, lang);
    }
    case 'number': {
      const n = wholeIn(raw, 1, 120);
      return n === null ? null : String(n);
    }
    case 'plan':
      return raw ? planWord(raw) : null;
    case 'text':
      return clean(raw);
  }
}

function clean(raw: string | undefined): string | null {
  const t = (raw ?? '').trim().replace(/\s+/g, ' ');
  return t ? t : null;
}

/** The boxes still empty that the words need (an optional box never counts). */
export function missingSlots(t: BroadcastTemplate, values: SlotValues): Slot[] {
  return t.slots.filter((s) => !s.optional && slotWords(s, values, 'en') === null);
}

const SEGMENT = /<<([^<>]*)>>/g;
const PLACE = /\{(\w+)\}/g;

/**
 * Fill one text. An optional sentence (<< >>) goes when any box in it is empty; a required box still
 * empty stays as "[Label]". English titles start with a capital ("Treadmill under repair").
 */
export function fillWords(words: string, slots: readonly Slot[], values: SlotValues, lang: 'en' | 'hi'): string {
  const byKey = new Map(slots.map((s) => [s.key, s]));
  const say = (key: string) => {
    const slot = byKey.get(key);
    return slot ? slotWords(slot, values, lang) : null;
  };
  const kept = words.replace(SEGMENT, (_, inner: string) => {
    const keys = [...inner.matchAll(PLACE)].map((m) => m[1]!);
    return keys.every((k) => say(k) !== null) ? inner : '';
  });
  return kept.replace(PLACE, (_, key: string) => say(key) ?? `[${byKey.get(key)?.label ?? key}]`).trim();
}

function capitalise(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}

export const TITLE_LIMIT = 60;

/** The title for "Both": "English / हिन्दी" when that fits in 60 letters, else the English. */
export function bothTitle(en: string, hi: string, max = TITLE_LIMIT): string {
  const joined = `${en} / ${hi}`;
  return letterCount(joined) <= max ? joined : en;
}

export function wordsIn(t: BroadcastTemplate, values: SlotValues, lang: 'en' | 'hi'): Words {
  const w = lang === 'hi' ? t.hi : t.en;
  const title = fillWords(w.title, t.slots, values, lang);
  return { title: lang === 'en' ? capitalise(title) : title, body: fillWords(w.body, t.slots, values, lang) };
}

/** The title and message to send, in the language picked. */
export function composeWords(t: BroadcastTemplate, values: SlotValues, lang: MessageLang): Words {
  if (lang !== 'both') return wordsIn(t, values, lang);
  const en = wordsIn(t, values, 'en');
  const hi = wordsIn(t, values, 'hi');
  return { title: bothTitle(en.title, hi.title), body: `${en.body}\n\n${hi.body}` };
}

/**
 * The words as a WhatsApp message: the title in bold (WhatsApp's *stars*), the message, and the
 * gym's name as the last line (logic/whatsapp.ts `signLine`).
 */
export function whatsAppWords(words: Words, sign: string): string {
  const title = words.title.trim();
  const body = words.body.trim();
  return [title ? `*${title}*` : '', body, sign].filter(Boolean).join('\n');
}
