/**
 * F123 (4 Nov 2026): pass members. Someone who trains here on a pass bought from another company
 * (FITPASS, cultpass and the like) pays that company, not the gym. The company pays the gym for each
 * visit. So the desk adds them as a "Pass member": no plan, no dues, never on the renewal list, and
 * every check-in (at the desk, or the gym's QR in the MettleUp app) is a pass visit. Once a month the
 * owner matches the company's payment against the count here.
 *
 * Neither FITPASS nor cultpass gives other apps a check-in link (checked 29 Oct 2026), so the count is
 * our own register. Nothing is ever sent to a pass company.
 *
 * Stored inside the member (`passCompany`, `passSince`) and the visit (`passCompany`): no gym-database
 * change for the panel. PURE: no storage, no clock.
 */

import { formatDay, type DateISO } from './dates';
import type { Member, Visit } from '../types';

/** The pass companies offered as one tap on the member form; any other name can be typed. */
export const PASS_COMPANIES: readonly string[] = ['FITPASS', 'cultpass'];

/** The longest company name kept. */
export const PASS_COMPANY_MAX = 40;

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * A typed company name, tidied: spaces trimmed and squeezed, cut to 40 letters, and a known
 * company in its own spelling ("fit pass" -> "FITPASS", "Cult Pass" -> "cultpass"). Null when
 * nothing is left. PURE.
 */
export function normalizePassCompany(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const clean = raw.replace(/\s+/g, ' ').trim().slice(0, PASS_COMPANY_MAX).trim();
  if (!clean) return null;
  const known = PASS_COMPANIES.find((c) => squash(c) === squash(clean));
  return known ?? clean;
}

/** The same company however it was typed ("Fitpass", "FITPASS"). PURE. */
export function passCompanyKey(name: string): string {
  return squash(name) || name.trim().toLowerCase();
}

/** The member's pass company, or null for someone who pays the gym. PURE. */
export function passCompanyOf(m: Pick<Member, 'passCompany'>): string | null {
  return normalizePassCompany(m.passCompany);
}

export function isPassMember(m: Pick<Member, 'passCompany'>): boolean {
  return passCompanyOf(m) !== null;
}

/**
 * The company a visit counts for, or null when it is not a pass visit. A visit the desk made says so
 * itself; a QR check-in (written by the server) counts for the member's company from the day they
 * became a pass member. PURE.
 */
export function passCompanyOfVisit(
  visit: Pick<Visit, 'visitedOn' | 'passCompany'>,
  member: Pick<Member, 'passCompany' | 'passSince'> | undefined,
): string | null {
  const own = normalizePassCompany(visit.passCompany);
  if (own) return own;
  if (!member) return null;
  const company = passCompanyOf(member);
  if (!company) return null;
  if (member.passSince && visit.visitedOn < member.passSince) return null;
  return company;
}

/**
 * The companies to offer as chips on the member form: FITPASS and cultpass, then every other company
 * this gym's members already use, most used first. PURE.
 */
export function passCompanyChoices(members: readonly Pick<Member, 'passCompany'>[]): string[] {
  const used = new Map<string, { name: string; n: number }>();
  for (const m of members) {
    const c = passCompanyOf(m);
    if (!c) continue;
    const k = passCompanyKey(c);
    const row = used.get(k) ?? { name: c, n: 0 };
    row.n += 1;
    used.set(k, row);
  }
  const known = new Set(PASS_COMPANIES.map(passCompanyKey));
  const others = [...used.entries()]
    .filter(([k]) => !known.has(k))
    .sort((a, b) => b[1].n - a[1].n || a[1].name.localeCompare(b[1].name))
    .map(([, v]) => v.name);
  return [...PASS_COMPANIES, ...others];
}

/**
 * What the member form saves for the pass part. Ticking it keeps the first day (or starts it
 * today); unticking clears both. PURE.
 */
export function passFields(
  on: boolean,
  company: string,
  before: Pick<Member, 'passCompany' | 'passSince'> | undefined,
  today: DateISO,
): { passCompany: string | null; passSince: DateISO | null } {
  const name = on ? normalizePassCompany(company) : null;
  if (!name) return { passCompany: null, passSince: null };
  const wasPass = before ? isPassMember(before) : false;
  return { passCompany: name, passSince: wasPass && before?.passSince ? before.passSince : today };
}

// ---------------------------------------------------------------- the monthly count

/** 'YYYY-MM' of a day. */
export const monthOfDay = (day: DateISO): string => day.slice(0, 7);

/** 'Nov 2026'. */
export function passMonthLabel(month: string): string {
  return formatDay(`${month}-01`).replace(/^1 /, '');
}

/** One pass visit, joined to its member. */
export interface PassVisitLine {
  visit: Visit;
  member: Member | null;
  company: string;
}

/** Every pass visit, newest first. Visits of a member no longer on the list still count. PURE. */
export function passVisitLines(members: readonly Member[], visits: readonly Visit[]): PassVisitLine[] {
  const byId = new Map(members.map((m) => [m.id, m]));
  const out: PassVisitLine[] = [];
  for (const v of visits) {
    const member = byId.get(v.memberId) ?? null;
    const company = passCompanyOfVisit(v, member ?? undefined);
    if (company) out.push({ visit: v, member, company });
  }
  return out.sort(
    (a, b) => b.visit.visitedOn.localeCompare(a.visit.visitedOn) || b.visit.checkedInAt - a.visit.checkedInAt,
  );
}

/** One line of the monthly table: a company in a month. */
export interface PassMonthRow {
  month: string;
  company: string;
  /** Pass visits: one per person per day, the same rule as the register. */
  visits: number;
  /** Different people who came on that company's pass. */
  people: number;
}

/** The monthly count per company, newest month first, then by most visits. PURE. */
export function passMonthRows(lines: readonly PassVisitLine[]): PassMonthRow[] {
  const rows = new Map<string, PassMonthRow & { who: Set<string> }>();
  for (const l of lines) {
    const month = monthOfDay(l.visit.visitedOn);
    const key = `${month}|${passCompanyKey(l.company)}`;
    const row = rows.get(key) ?? { month, company: l.company, visits: 0, people: 0, who: new Set<string>() };
    row.visits += 1;
    row.who.add(l.visit.memberId);
    rows.set(key, row);
  }
  return [...rows.values()]
    .map(({ who, ...r }) => ({ ...r, people: who.size }))
    .sort((a, b) => b.month.localeCompare(a.month) || b.visits - a.visits || a.company.localeCompare(b.company));
}

/** The months to choose from: this month first, then every earlier month with a pass visit. PURE. */
export function passMonths(rows: readonly PassMonthRow[], today: DateISO): string[] {
  const set = new Set<string>([monthOfDay(today), ...rows.map((r) => r.month)]);
  return [...set].sort((a, b) => b.localeCompare(a));
}

/** One person's pass visits in a month, for the list under the table. */
export interface PassPersonRow {
  memberId: string;
  name: string;
  company: string;
  visits: number;
  lastOn: DateISO;
}

/** Who came on a pass in `month`, most visits first. PURE. */
export function passPeopleInMonth(lines: readonly PassVisitLine[], month: string): PassPersonRow[] {
  const rows = new Map<string, PassPersonRow>();
  for (const l of lines) {
    if (monthOfDay(l.visit.visitedOn) !== month) continue;
    const key = `${l.visit.memberId}|${passCompanyKey(l.company)}`;
    const row = rows.get(key) ?? {
      memberId: l.visit.memberId,
      name: l.member?.fullName ?? 'A removed member',
      company: l.company,
      visits: 0,
      lastOn: l.visit.visitedOn,
    };
    row.visits += 1;
    if (l.visit.visitedOn > row.lastOn) row.lastOn = l.visit.visitedOn;
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => b.visits - a.visits || a.name.localeCompare(b.name));
}

/** The Excel file for one month: one line per pass visit, oldest first, to tick off against the company's statement. */
export const PASS_EXPORT_HEADERS = ['Date', 'Pass company', 'Member', 'Mobile', 'Checked in by'] as const;

export function passExportRows(
  lines: readonly PassVisitLine[],
  month: string,
  phone: (e164: string) => string,
): string[][] {
  return lines
    .filter((l) => monthOfDay(l.visit.visitedOn) === month)
    .slice()
    .sort((a, b) => a.visit.visitedOn.localeCompare(b.visit.visitedOn) || a.company.localeCompare(b.company))
    .map((l) => [
      l.visit.visitedOn,
      l.company,
      l.member?.fullName ?? 'A removed member',
      l.member ? phone(l.member.phone) : '',
      l.visit.source === 'app' ? 'MettleUp app QR' : l.visit.source === 'import' ? 'Imported' : 'Front desk',
    ]);
}
