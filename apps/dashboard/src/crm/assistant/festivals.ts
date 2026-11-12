/**
 * F201 "Today for you" (03-design §5): an Indian festival in the next few days is a good day for a gym
 * message ("Happy Diwali, the gym is open 6 to 10"). Dated by hand for 2026-2028, because the lunar
 * festivals move every year and no calendar code can work them out. PURE.
 *
 * Sources (read 12 Nov 2026):
 * - 2026 and 2027: officeholidays.com/countries/india/2026 and /2027 (gazetted and restricted holidays).
 * - Every year, the lunar dates checked against drikpanchang.com/festivals/month/festivals-<month>.html?year=<year>
 *   (Drik Panchang, New Delhi); where the two differed by a day, Drik Panchang's date for North India is used.
 * - Chhath 2027: Drik Panchang's November 2027 page gives two days; 4 Nov (Diwali + 6, as officeholidays) is used.
 * - Eid 2028: drikpanchang.com eid-al-fitr page, bankbazaar.com and publicholidays.in. Eid moves with the moon
 *   sighting, so 2028's two Eids are marked `tentative` and the card says "around".
 * A year after 2028 has no festivals until this list is extended (the card simply never shows one).
 */
import { addDays, diffDays, type DateISO } from '../logic/dates';

export interface Festival {
  /** Stable id; the message template's festival id when the Messages page has one (logic/messageTemplates.ts). */
  id: string;
  name: string;
  /** The day it falls on in India. */
  on: DateISO;
  /** True when the date waits on the moon (Eid): shown as "around". */
  tentative?: boolean;
  /** The Messages page's festival template id, when there is one. */
  template?: string;
}

type Row = [id: string, name: string, template: string | null, y2026: string, y2027: string, y2028: string];

/** id, name, template, then the date in 2026, 2027 and 2028 ("MM-DD"). A trailing "?" = tentative. */
const ROWS: readonly Row[] = [
  ['new-year', 'New Year', 'new-year', '01-01', '01-01', '01-01'],
  ['lohri', 'Lohri', null, '01-13', '01-14', '01-14'],
  ['sankranti', 'Makar Sankranti', 'sankranti', '01-14', '01-15', '01-15'],
  ['pongal', 'Pongal', null, '01-15', '01-15', '01-15'],
  ['republic', 'Republic Day', 'republic', '01-26', '01-26', '01-26'],
  ['shivratri', 'Mahashivratri', null, '02-15', '03-06', '02-23'],
  ['womens-day', 'Women’s Day', 'womens-day', '03-08', '03-08', '03-08'],
  ['holi', 'Holi', 'holi', '03-04', '03-22', '03-11'],
  ['gudi-padwa', 'Gudi Padwa', null, '03-19', '04-07', '03-27'],
  ['eid', 'Eid ul-Fitr', 'eid', '03-21', '03-09', '02-27?'],
  ['baisakhi', 'Baisakhi', null, '04-14', '04-14', '04-13'],
  ['bakrid', 'Eid al-Adha', 'eid', '05-27', '05-17', '05-05?'],
  ['yoga-day', 'Yoga Day', 'yoga-day', '06-21', '06-21', '06-21'],
  ['independence', 'Independence Day', 'independence', '08-15', '08-15', '08-15'],
  ['onam', 'Onam', null, '08-26', '09-12', '09-01'],
  ['rakhi', 'Raksha Bandhan', 'rakhi', '08-28', '08-17', '08-05'],
  ['janmashtami', 'Janmashtami', null, '09-04', '08-25', '08-13'],
  ['ganesh', 'Ganesh Chaturthi', null, '09-14', '09-04', '08-23'],
  ['navratri', 'Navratri', 'navratri', '10-11', '09-30', '09-19'],
  ['dussehra', 'Dussehra', null, '10-20', '10-09', '09-27'],
  ['karva-chauth', 'Karva Chauth', null, '10-29', '10-18', '10-07'],
  ['diwali', 'Diwali', 'diwali', '11-08', '10-29', '10-17'],
  ['chhath', 'Chhath Puja', null, '11-15', '11-04', '10-23'],
  ['christmas', 'Christmas', 'christmas', '12-25', '12-25', '12-25'],
];

export const FESTIVAL_YEARS = [2026, 2027, 2028] as const;

/** Every dated festival, in date order. */
export const FESTIVAL_DATES: readonly Festival[] = ROWS.flatMap(([id, name, template, ...days]) =>
  days.map((d, i) => {
    const tentative = d.endsWith('?');
    const f: Festival = { id, name, on: `${FESTIVAL_YEARS[i]}-${d.replace('?', '')}` };
    if (tentative) f.tentative = true;
    if (template) f.template = template;
    return f;
  }),
).sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : a.name.localeCompare(b.name)));

/** How far ahead "Today for you" looks for a festival. */
export const FESTIVAL_AHEAD_DAYS = 5;

/** The festivals from today up to `days` ahead (today included), soonest first, with days to go. */
export function festivalsWithin(today: DateISO, days: number = FESTIVAL_AHEAD_DAYS): (Festival & { inDays: number })[] {
  const last = addDays(today, days);
  return FESTIVAL_DATES.filter((f) => f.on >= today && f.on <= last).map((f) => ({ ...f, inDays: diffDays(today, f.on) }));
}

/** The next festival on or after today, within `days`, or null. */
export function nextFestival(today: DateISO, days: number = FESTIVAL_AHEAD_DAYS): (Festival & { inDays: number }) | null {
  return festivalsWithin(today, days)[0] ?? null;
}
