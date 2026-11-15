/**
 * F201 "Today for you" (03-design §5): an Indian festival in the next few days is a good day for a gym
 * message ("Happy Diwali, the gym is open 6 to 10"). Dated by hand for 2026-2028, because the lunar
 * festivals move every year and no calendar code can work them out. PURE.
 *
 * Every date re-checked on 15 Nov 2026 (owner, 15 Nov: "I don't want you suggesting festivals on days which
 * are incorrect"), each against at least two of these (dates in India, New Delhi where a city matters):
 * - Drik Panchang, New Delhi: drikpanchang.com/festivals/month/festivals-<month>.html?year=<year>, and
 *   drikpanchang.com/sankranti/makar-sankranti-date-time.html?year=2027 (read 15 Nov 2026).
 * - Government of India, DoPT O.M. F.No.12/2/2023-JCA: 2026 list dated 03.07.2025, 2027 list dated 16.07.2026
 *   (gazetted + restricted holidays, Delhi), as reproduced at staffnews.in/2025/07/list-of-holidays-2026-*.html
 *   and staffnews.in/2026/07/list-of-*holidays-for-the-year-2027*.html (read 15 Nov 2026). There is no 2028 list yet.
 * - DoPT O.M. dated 22.05.2026 moving Bakrid 2026 from 27 to 28 May (peoplematters.in, read 15 Nov 2026); Eid
 *   ul-Fitr 2026 was 21 Mar in India (Delhi Jama Masjid announcement, deccanherald.com, read 15 Nov 2026).
 * - truecalendar.com/public-holidays/india/<year> (read 15 Nov 2026); for Lohri, panchang.astrosage.com
 *   (New Delhi); for Baisakhi 2028, publicholidays.in/vaisakh (read 15 Nov 2026). timeanddate.com blocks robots.
 * Which day counts: Diwali = Lakshmi Puja day; Navratri = the first day (Ghatasthapana); Holi = the colours day
 * (Dhulandi), not Holika Dahan; Onam = Thiruvonam; Chhath = the main evening offering (Sandhya Arghya, Shashthi);
 * Janmashtami = the Smarta / gazetted day. Lohri, Makar Sankranti and Pongal: the day North and West India keep.
 * Known splits: Makar Sankranti 2027 is 15 Jan (the sun moves at 9:14 pm on 14 Jan, so the holy day is the
 * 15th; DoPT's restricted list says 14 Jan). Holi 2027 is 22 Mar (Drik Panchang, truecalendar; Holika Dahan
 * is the evening of 21 Mar); DoPT closes offices on 23 Mar.
 * Eid moves with the moon sighting: every Eid not yet seen (2027, 2028) is `tentative` and the card says
 * "around". 2026's Eids are the days India really kept.
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
  ['pongal', 'Pongal', null, '01-14', '01-15', '01-15'],
  ['republic', 'Republic Day', 'republic', '01-26', '01-26', '01-26'],
  ['shivratri', 'Mahashivratri', null, '02-15', '03-06', '02-23'],
  ['womens-day', 'Women’s Day', 'womens-day', '03-08', '03-08', '03-08'],
  ['holi', 'Holi', 'holi', '03-04', '03-22', '03-11'],
  ['gudi-padwa', 'Gudi Padwa', null, '03-19', '04-07', '03-27'],
  ['eid', 'Eid ul-Fitr', 'eid', '03-21', '03-10?', '02-27?'],
  ['baisakhi', 'Baisakhi', null, '04-14', '04-14', '04-13'],
  ['bakrid', 'Eid al-Adha', 'eid', '05-28', '05-17?', '05-06?'],
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
