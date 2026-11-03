/**
 * F109 "Trainers see their members' progress" (OWNER-INBOX #46; server supabase/migrations/0050_trainer_view.sql).
 * PURE: the server's answers read defensively, the one plain line per member ("New best: Leg press 120 kg × 10",
 * "No workout for 9 days"), the order of the list (who to talk to first), and the two ready WhatsApp messages.
 *
 * What a member's phone sends is only a weekly summary: workouts and kg lifted per week (12 weeks), the best set
 * of their 5 most-done exercises, new heaviest weights of the last 30 days, and the day of the last workout.
 * Never body weight, photos, notes or food. Every word here is shown to the owner or a trainer, and the WhatsApp
 * texts go to members: each still needs the owner's yes before it goes live.
 */

import { addDays, diffDays, formatDayShort, type DateISO } from './dates';
import { greetingName } from './whatsapp';

export interface TrainerWeek {
  w: DateISO;
  n: number;
  kg: number;
}

export interface TrainerSet {
  n: string;
  w: number;
  r: number;
}

export interface TrainerSummary {
  weeks: TrainerWeek[];
  best: (TrainerSet & { t: number })[];
  records: (TrainerSet & { d: DateISO })[];
  last: DateISO | null;
}

export interface TrainerMember {
  /** The app member (always there). */
  appId: string;
  /** The gym's list id, or null when the app member is not matched to the list yet. */
  memberId: string | null;
  name: string;
  phone: string | null;
  trainerId: string | null;
  trainerName: string | null;
  summary: TrainerSummary;
  updatedAt: number;
  helpAt: number | null;
}

export interface TrainerMembers {
  role: 'owner' | 'trainer';
  members: TrainerMember[];
}

export interface TrainerPerson {
  id: string;
  name: string;
  role: 'owner' | 'staff';
  trainer: boolean;
}

export interface TrainerSetup {
  people: TrainerPerson[];
  /** List member id -> trainer (staff) id. */
  assigned: Record<string, string>;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const num = (v: unknown): number | null => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const day = (v: unknown): DateISO | null => (typeof v === 'string' && DAY.test(v) ? (v as DateISO) : null);

function setFrom(v: unknown): TrainerSet | null {
  if (!isObj(v)) return null;
  const n = str(v.n).slice(0, 40);
  const w = num(v.w);
  const r = num(v.r);
  return n && w != null && r != null ? { n, w, r } : null;
}

/** One summary as the server keeps it; anything unreadable becomes empty, never an error. PURE. */
export function summaryFrom(v: unknown): TrainerSummary {
  const o = isObj(v) ? v : {};
  const weeks: TrainerWeek[] = [];
  for (const x of Array.isArray(o.weeks) ? o.weeks.slice(0, 12) : []) {
    const w = isObj(x) ? day(x.w) : null;
    if (w && isObj(x)) weeks.push({ w, n: Math.max(0, num(x.n) ?? 0), kg: Math.max(0, num(x.kg) ?? 0) });
  }
  weeks.sort((a, b) => (a.w < b.w ? 1 : a.w > b.w ? -1 : 0));
  const best: TrainerSummary['best'] = [];
  for (const x of Array.isArray(o.best) ? o.best.slice(0, 5) : []) {
    const s = setFrom(x);
    if (s && isObj(x)) best.push({ ...s, t: Math.max(0, num(x.t) ?? 0) });
  }
  const records: TrainerSummary['records'] = [];
  for (const x of Array.isArray(o.records) ? o.records.slice(0, 5) : []) {
    const s = setFrom(x);
    const d = isObj(x) ? day(x.d) : null;
    if (s && d) records.push({ ...s, d });
  }
  records.sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0));
  return { weeks, best, records, last: day(o.last) };
}

/** owner_trainer_members' answer; null when it is not one. PURE. */
export function trainerMembersFrom(raw: unknown): TrainerMembers | null {
  const r = Array.isArray(raw) ? raw[0] : raw;
  if (!isObj(r) || r.ok !== true || !Array.isArray(r.members)) return null;
  const members: TrainerMember[] = [];
  for (const m of r.members) {
    if (!isObj(m)) continue;
    const appId = str(m.appId);
    if (!appId) continue;
    members.push({
      appId,
      memberId: str(m.memberId) || null,
      name: str(m.name).slice(0, 60) || 'A member',
      phone: str(m.phone) || null,
      trainerId: str(m.trainerId) || null,
      trainerName: str(m.trainerName) || null,
      summary: summaryFrom(m.summary),
      updatedAt: num(m.updatedAt) ?? 0,
      helpAt: num(m.helpAt),
    });
  }
  return { role: r.role === 'trainer' ? 'trainer' : 'owner', members };
}

/** owner_trainer_setup's (and the two saves') answer. PURE. */
export function trainerSetupFrom(raw: unknown): TrainerSetup {
  const r = (Array.isArray(raw) ? raw[0] : raw) as unknown;
  const o = isObj(r) ? r : {};
  const people: TrainerPerson[] = [];
  for (const p of Array.isArray(o.people) ? o.people : []) {
    if (!isObj(p) || !str(p.id)) continue;
    people.push({ id: str(p.id), name: str(p.name) || 'Someone', role: p.role === 'owner' ? 'owner' : 'staff', trainer: p.trainer === true });
  }
  const assigned: Record<string, string> = {};
  for (const a of Array.isArray(o.assigned) ? o.assigned : []) {
    if (isObj(a) && str(a.memberId) && str(a.trainerId)) assigned[str(a.memberId)] = str(a.trainerId);
  }
  return { people, assigned };
}

// ---------------------------------------------------------------- the one line

/** Days with no workout before a member's line says so. */
export const QUIET_DAYS = 7;
/** A help request shows for a week. */
export const HELP_DAYS = 7;
/** A new best is news for two weeks. */
export const NEWS_DAYS = 14;

export type LineKind = 'help' | 'quiet' | 'best' | 'steady' | 'none';

const kgText = (w: number): string => `${Number.isInteger(w) ? w : w.toFixed(1)} kg`;

/** "Leg press 120 kg × 10" (a body-weight move: "Pull-up × 12"). PURE. */
export function setText(s: TrainerSet): string {
  return s.w > 0 ? `${s.n} ${kgText(s.w)} × ${s.r}` : `${s.n} × ${s.r}`;
}

function helpDay(m: Pick<TrainerMember, 'helpAt'>, today: DateISO): DateISO | null {
  if (m.helpAt == null) return null;
  const d = new Date(m.helpAt + 5.5 * 3600 * 1000).toISOString().slice(0, 10) as DateISO;
  return diffDays(d, today) <= HELP_DAYS - 1 && diffDays(d, today) >= 0 ? d : null;
}

/** Workouts in the current week (the summary's newest week when it is this week). PURE. */
export function thisWeek(s: TrainerSummary, today: DateISO): TrainerWeek | null {
  const w = s.weeks[0];
  return w && diffDays(w.w, today) >= 0 && diffDays(w.w, today) < 7 ? w : null;
}

/** The one plain line for a member, and what kind of line it is. PURE. */
export function memberLine(m: Pick<TrainerMember, 'summary' | 'helpAt'>, today: DateISO): { kind: LineKind; text: string } {
  const s = m.summary;
  const help = helpDay(m, today);
  // words: owner approves before live (#46)
  if (help) return { kind: 'help', text: help === today ? 'Asked for help today' : `Asked for help on ${formatDayShort(help)}` };
  // words: owner approves before live (#46)
  if (!s.last) return { kind: 'none', text: 'No workouts logged yet' };
  const quiet = diffDays(s.last, today);
  // words: owner approves before live (#46)
  if (quiet >= QUIET_DAYS) return { kind: 'quiet', text: `No workout for ${quiet} days` };
  const rec = s.records[0];
  // words: owner approves before live (#46)
  if (rec && diffDays(rec.d, today) < NEWS_DAYS) return { kind: 'best', text: `New best: ${setText(rec)}` };
  const w = thisWeek(s, today)?.n ?? 0;
  // words: owner approves before live (#46)
  return { kind: 'steady', text: w === 1 ? '1 workout this week' : `${w} workouts this week` };
}

const RANK: Record<LineKind, number> = { help: 0, quiet: 1, best: 2, none: 3, steady: 4 };

/** Who to talk to first: help, then the longest quiet, then new bests, then the rest by name. PURE. */
export function sortMembers<T extends Pick<TrainerMember, 'summary' | 'helpAt' | 'name'>>(list: readonly T[], today: DateISO): T[] {
  return [...list].sort((a, b) => {
    const la = memberLine(a, today);
    const lb = memberLine(b, today);
    if (RANK[la.kind] !== RANK[lb.kind]) return RANK[la.kind] - RANK[lb.kind];
    if (la.kind === 'quiet' && a.summary.last && b.summary.last && a.summary.last !== b.summary.last) return a.summary.last < b.summary.last ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

/** "This week: 3 workouts · 12,480 kg". PURE. */
export function weekLine(s: TrainerSummary, today: DateISO): string {
  const w = thisWeek(s, today);
  const n = w?.n ?? 0;
  const kg = Math.round(w?.kg ?? 0).toLocaleString('en-IN');
  // words: owner approves before live (#46)
  return `This week: ${n} ${n === 1 ? 'workout' : 'workouts'} · ${kg} kg lifted`;
}

/** Workouts a week, oldest first, for a small bar row (the 12 weeks, gaps as 0). PURE. */
export function weekBars(s: TrainerSummary, today: DateISO): number[] {
  const byWeek = new Map(s.weeks.map((w) => [w.w, w.n]));
  const start = addDays(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7));
  const out: number[] = [];
  for (let i = 11; i >= 0; i--) out.push(byWeek.get(addDays(start, -7 * i)) ?? 0);
  return out;
}

// ---------------------------------------------------------------- WhatsApp

/** "Well done": names the new best when there is one. Sent to the member. PURE. */
export function wellDoneMessage(m: Pick<TrainerMember, 'name' | 'summary'>, today: DateISO, from: string | null): string {
  const hi = greetingName(m.name);
  const rec = m.summary.records[0];
  const w = thisWeek(m.summary, today)?.n ?? 0;
  const sign = from ? `\n– ${from}` : '';
  // words: owner approves before live (#46)
  if (rec && diffDays(rec.d, today) < NEWS_DAYS) return `Hi ${hi}, well done on your new best: ${setText(rec)}! Keep it up.${sign}`;
  // words: owner approves before live (#46)
  if (w > 0) return `Hi ${hi}, well done on ${w === 1 ? 'your workout' : `your ${w} workouts`} this week! Keep it up.${sign}`;
  // words: owner approves before live (#46)
  return `Hi ${hi}, well done on keeping at it! Keep it up.${sign}`;
}

/** "How's it going?": a friendly check-in, never about money or renewal. Sent to the member. PURE. */
export function howIsItGoingMessage(m: Pick<TrainerMember, 'name' | 'summary'>, today: DateISO, from: string | null): string {
  const hi = greetingName(m.name);
  const sign = from ? `\n– ${from}` : '';
  const quiet = m.summary.last ? diffDays(m.summary.last, today) : null;
  // words: owner approves before live (#46)
  if (quiet != null && quiet >= QUIET_DAYS) return `Hi ${hi}, how's it going? Haven't seen a workout from you for ${quiet} days. Can I help with your plan?${sign}`;
  // words: owner approves before live (#46)
  return `Hi ${hi}, how's it going? Anything I can help you with?${sign}`;
}

/** Plain words for a refused call, or null when it is not one of these. PURE. */
export function trainerErrorWords(e: unknown): string | null {
  const t = e instanceof Error ? e.message : isObj(e) && typeof e.message === 'string' ? e.message : String(e ?? '');
  if (/\bOWNER_ONLY\b/.test(t)) return 'Only the owner can change this.';
  if (/\bTRAINER_ONLY\b/.test(t)) return 'Only trainers and the owner can see this. Ask the owner to tick you as a trainer.';
  if (/\bNOT_TRAINER\b/.test(t)) return 'That person is not ticked as a trainer any more.';
  if (/\bNO_MEMBER\b/.test(t)) return 'This member is not on your list any more.';
  if (/\bNOT_FOUND\b/.test(t)) return 'That person is not on your staff list any more.';
  if (/\bSUSPENDED\b/.test(t)) return 'Your gym is paused, so this cannot be changed now.';
  return null;
}
