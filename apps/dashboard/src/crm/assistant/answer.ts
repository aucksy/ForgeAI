/**
 * F201 (03-design §2 A): the "ask" tools, answered HERE in the browser from the gym's own records. The AI only
 * picks the report and its filters; every number below comes from the function the rest of the panel already
 * uses for it (the same Dues list, the same "Losing the habit" rule, the same week numbers), so the assistant
 * can never disagree with a page. Free: no credit, no server. PURE.
 */
import type { CrmSnapshot } from '../data/adapter';
import { activeBatches, inBatch, listBatches } from '../logic/batches';
import { activeOn, countedTerms, endingsIn } from '../logic/businessGrowth';
import { collectionSummary, paymentsInRange } from '../logic/collections';
import { addDays, diffDays, endOfMonth, formatDay, formatDayShort, isValidDateISO, monthKey, startOfMonth, type DateISO } from '../logic/dates';
import { bucketCounts, filterEnquiries } from '../logic/enquiries';
import { categoryLabel, monthSummary, totalsByCategory } from '../logic/expenses';
import { inTile, isBirthdayToday } from '../logic/homeTiles';
import { attendanceSummary, hourLabel, registerFor } from '../logic/attendance';
import { audienceMembers, endedRecently, endingSoon, hasApp } from '../logic/audience';
import { formatINR, sumPaise, type Paise } from '../logic/money';
import { methodLabel } from '../logic/payments';
import { busyHours, newMembers, owedListOn, stoppedComingOn } from '../logic/ownerNumbers';
import { isPassMember } from '../logic/passMembers';
import { cleanTrainer, ptLeft, runningPtPacks } from '../logic/pt';
import { lastWeek, weekNumbers } from '../logic/weekSummary';
import type { MemberView, Membership } from '../types';
import { line, pagePath, type Line, type Period, type ToolInputs, type ToolName } from './catalogue';
import { bestMatch, matchMember } from './match';

export type AskTool =
  | 'list_members'
  | 'who_owes'
  | 'money_summary'
  | 'attendance_summary'
  | 'growth_summary'
  | 'member_lookup'
  | 'week_summary'
  | 'gym_numbers'
  | 'how_to';

export const ASK_TOOLS: readonly AskTool[] = [
  'list_members', 'who_owes', 'money_summary', 'attendance_summary', 'growth_summary', 'member_lookup',
  'week_summary', 'gym_numbers', 'how_to',
];

export const isAskTool = (name: string): name is AskTool => (ASK_TOOLS as readonly string[]).includes(name);

/** Everything an answer may read. `views`: members not archived; `allViews`: with the archived. */
export interface AnswerData {
  snapshot: CrmSnapshot;
  views: readonly MemberView[];
  allViews: readonly MemberView[];
  today: DateISO;
  /** Epoch ms, for "who is inside now". */
  now: number;
  /** The mobile numbers of the gym's app members (audience.ts appPhones); null = not known (offline). */
  appPhones: ReadonlySet<string> | null;
  /** False for desk staff: money totals stay with the owner, as on the pages (owner-only pages). */
  seeTotals: boolean;
}

export interface AnswerRow {
  key: string;
  label: string;
  /** A short second line ("Ends 14 Nov", "₹1,500"). */
  detail: Line | null;
  /** Set when the row is a member: the screen links it to their page. */
  memberId?: string;
}

export type FollowUp =
  /** Sends this sentence to the assistant, as if typed. */
  | { label: Line; request: string }
  /** Opens this page. */
  | { label: Line; path: string };

export interface AnswerCard {
  tool: AskTool;
  headline: Line;
  /** The one big number ("14", "₹42,500"), or null when the answer is a list only. */
  number: string | null;
  /** At most ROWS_MAX rows; `total` says how many there are in all. */
  rows: AnswerRow[];
  total: number;
  seeAll: { path: string } | null;
  followUps: FollowUp[];
}

export type AnswerResult =
  | { kind: 'card'; card: AnswerCard }
  /** The name fits more than one member: he picks one, and the same question runs again with `chosenId`. */
  | { kind: 'choose'; typed: string; options: AnswerRow[] }
  /** Nobody by that name. */
  | { kind: 'not_found'; typed: string; followUps: FollowUp[] }
  /** "How do I ...": answered by the help assistant (/api/help), not from the records. */
  | { kind: 'help'; question: string };

export const ROWS_MAX = 8;

// ------------------------------------------------------------------ periods

export interface DayRange {
  from: DateISO;
  to: DateISO;
}

/** Monday of the week `day` is in (India weeks start on Monday, like the week summary). */
function mondayOf(day: DateISO): DateISO {
  return addDays(lastWeek(day).to, 1);
}

/** The days a period covers, up to today. A bad or missing custom range reads as this month. */
export function periodRange(period: Period, from: string, to: string, today: DateISO): DayRange {
  switch (period) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday': {
      const y = addDays(today, -1);
      return { from: y, to: y };
    }
    case 'this_week':
      return { from: mondayOf(today), to: today };
    case 'last_week':
      return lastWeek(today);
    case 'last_month': {
      const end = addDays(startOfMonth(today), -1);
      return { from: startOfMonth(end), to: end };
    }
    case 'last_30_days':
      return { from: addDays(today, -29), to: today };
    case 'this_year':
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    case 'custom':
      if (isValidDateISO(from) && isValidDateISO(to)) {
        const [a, b] = from <= to ? [from, to] : [to, from];
        return { from: a, to: b > today ? today : b };
      }
      return { from: startOfMonth(today), to: today };
    case 'this_month':
    default:
      return { from: startOfMonth(today), to: today };
  }
}

/** "1 Nov – 12 Nov", or one day. */
export function rangeWords(r: DayRange): string {
  return r.from === r.to ? formatDay(r.from) : `${formatDay(r.from)} – ${formatDay(r.to)}`;
}

// ------------------------------------------------------------------ small helpers

const running = (v: MemberView) => v.state === 'active' || v.state === 'expiring';

function memberRow(v: MemberView, detail: Line | null): AnswerRow {
  return { key: v.member.id, label: v.member.fullName, detail, memberId: v.member.id };
}

function plainRow(key: string, label: string, detail: Line | null): AnswerRow {
  return { key, label, detail };
}

function card(
  tool: AskTool,
  headline: Line,
  number: string | null,
  all: readonly AnswerRow[],
  seeAll: string | null,
  followUps: FollowUp[] = [],
): AnswerResult {
  return {
    kind: 'card',
    card: { tool, headline, number, rows: all.slice(0, ROWS_MAX), total: all.length, seeAll: seeAll ? { path: seeAll } : null, followUps },
  };
}

const page = (id: string, param?: string): string | null => pagePath(id, param);

function ownerOnly(tool: AskTool): AnswerResult {
  return card(tool, line('Only the gym owner can see money totals.'), null, [], null);
}

/** A birthday on one of the 7 days from today. */
function birthdayThisWeek(dob: string | null, today: DateISO): boolean {
  for (let i = 0; i < 7; i += 1) if (isBirthdayToday(dob, addDays(today, i))) return true;
  return false;
}

function membershipsByMember(memberships: readonly Membership[]): Map<string, Membership[]> {
  const out = new Map<string, Membership[]>();
  for (const m of memberships) {
    const list = out.get(m.memberId);
    if (list) list.push(m);
    else out.set(m.memberId, [m]);
  }
  return out;
}

/** Trainer first names, compared the way names are typed ("Rohit sir" = "rohit"). */
function sameTrainer(raw: string | null | undefined, said: string): boolean {
  const name = cleanTrainer(raw);
  return name !== null && bestMatch(said, [name], (n) => n).kind === 'one';
}

function endsDetail(v: MemberView, today: DateISO): Line | null {
  if (!v.coversUntil) return v.current ? line('Ended {day}', { day: formatDay(v.current.endsOn) }) : null;
  const left = diffDays(today, v.coversUntil);
  if (left < 0) return line('Ended {day}', { day: formatDay(v.coversUntil) });
  if (left === 0) return line('Ends today');
  return line('Ends {day}', { day: formatDay(v.coversUntil) });
}

function visitDetail(v: MemberView): Line {
  return v.daysSinceVisit === null ? line('Never came') : line('Last came {days} days ago', { days: v.daysSinceVisit });
}

// ------------------------------------------------------------------ list_members

export const DEFAULT_DAYS = { ending: 7, ended: 30, away: 10, new_joins: 30 } as const;

interface Listed {
  kind: 'list';
  group: MemberView[];
  headline: Line;
  detail: (v: MemberView) => Line | null;
  seeAll: string | null;
  followUps: FollowUp[];
}

/** The members of a group (list_members' filters), or the card that says why there is no list. */
function listGroup(input: ToolInputs['list_members'], d: AnswerData): Listed | AnswerResult {
  const { snapshot: s, today } = d;
  const views = d.views;
  const aud = { views, members: s.members, memberships: s.memberships, visits: s.visits, today };
  const days = input.days > 0 ? Math.min(Math.round(input.days), 366) : 0;
  let group: MemberView[] = [];
  let headline: Line;
  let detail: (v: MemberView) => Line | null = (v) => endsDetail(v, today);
  let seeAll: string | null = page('members');
  let followUps: FollowUp[] = [];

  switch (input.group) {
    case 'everyone':
      group = [...views];
      headline = line('Members on your list');
      break;
    case 'active':
      group = audienceMembers({ type: 'active' }, aud);
      headline = line('Members with a running plan');
      break;
    case 'ending': {
      const within = days || DEFAULT_DAYS.ending;
      group = views.filter((v) => endingSoon(v, within)).sort((a, b) => (a.coversUntil ?? '').localeCompare(b.coversUntil ?? ''));
      headline = line('Plans ending in the next {days} days', { days: within });
      seeAll = page('renewals-due');
      followUps = [{ label: line('Send them a renewal reminder'), request: `Send a renewal reminder to members whose plan ends in the next ${within} days` }];
      break;
    }
    case 'ended': {
      const within = days || DEFAULT_DAYS.ended;
      group = views.filter((v) => endedRecently(v, within)).sort((a, b) => (b.coversUntil ?? '').localeCompare(a.coversUntil ?? ''));
      headline = line('Plans that ended in the last {days} days', { days: within });
      followUps = [{ label: line('Send them a come-back offer'), request: `Send a come-back offer to members whose plan ended in the last ${within} days` }];
      break;
    }
    case 'away': {
      if (days > 0) {
        // "10 din se nahi aaye": a plain count of days, for a running plan (the page's rule needs no number).
        group = views
          .filter((v) => running(v) && !isPassMember(v.member) && (v.daysSinceVisit === null || v.daysSinceVisit >= days))
          .sort((a, b) => (b.daysSinceVisit ?? 9999) - (a.daysSinceVisit ?? 9999));
        headline = line('Running plan, no visit in {days} days', { days });
      } else {
        // The same list as Visits -> Losing the habit.
        const ids = stoppedComingOn(s.members, s.memberships, s.visits, today).map((r) => r.member.id);
        const byId = new Map(views.map((v) => [v.member.id, v]));
        group = ids.map((id) => byId.get(id)).filter((v): v is MemberView => v !== undefined);
        headline = line('Members who stopped coming');
      }
      detail = visitDetail;
      seeAll = page('losing-habit');
      followUps = [{ label: line('Send them a “we miss you” message'), request: 'Send a we miss you message to members who stopped coming' }];
      break;
    }
    case 'birthday_today':
      group = views.filter((v) => isBirthdayToday(v.member.dateOfBirth, today));
      headline = line('Birthdays today');
      detail = () => null;
      followUps = [{ label: line('Send birthday wishes'), request: 'Send birthday wishes to members whose birthday is today' }];
      break;
    case 'birthday_week':
      group = views.filter((v) => birthdayThisWeek(v.member.dateOfBirth, today));
      headline = line('Birthdays in the next 7 days');
      detail = (v) => (v.member.dateOfBirth ? line('Birthday {day}', { day: formatDayShort(v.member.dateOfBirth) }) : null);
      break;
    case 'new_joins': {
      const within = days || DEFAULT_DAYS.new_joins;
      const ids = newMembers(s.members, { from: addDays(today, -(within - 1)), to: today }).map((m) => m.id);
      const byId = new Map(views.map((v) => [v.member.id, v]));
      group = ids.map((id) => byId.get(id)).filter((v): v is MemberView => v !== undefined);
      headline = line('Joined in the last {days} days', { days: within });
      detail = (v) => line('Joined {day}', { day: formatDay(v.member.joinedOn) });
      seeAll = page('new-members');
      break;
    }
    case 'plan': {
      const m = bestMatch(input.plan, s.plans.filter((p) => p.active), (p) => p.name);
      if (m.kind !== 'one') return card('list_members', line('No plan called “{name}”.', { name: input.plan }), null, [], page('plans'));
      group = audienceMembers({ type: 'plan', planId: m.item.id }, aud);
      headline = line('On the {plan} plan now', { plan: m.item.name });
      break;
    }
    case 'batch': {
      const batches = activeBatches(s.members);
      const m = bestMatch(input.batch, batches, (b) => b.name);
      if (m.kind !== 'one') return card('list_members', line('No batch called “{name}”.', { name: input.batch }), null, [], page('members'));
      group = views.filter((v) => inBatch(v.member, m.item.key));
      headline = line('In the {batch} batch', { batch: m.item.name });
      break;
    }
    case 'trainer': {
      const byMember = membershipsByMember(s.memberships);
      group = views.filter((v) => runningPtPacks(byMember.get(v.member.id) ?? [], today).some((p) => sameTrainer(p.trainer, input.trainer)));
      headline = line('Training with {trainer} now', { trainer: input.trainer });
      detail = (v) => {
        const pack = runningPtPacks(byMember.get(v.member.id) ?? [], today).find((p) => sameTrainer(p.trainer, input.trainer));
        return pack ? line('{n} sessions left', { n: ptLeft(pack) }) : null;
      };
      seeAll = page('trainers');
      break;
    }
    case 'owes': {
      if (!d.seeTotals) return ownerOnly('list_members');
      const byId = new Map(d.allViews.map((v) => [v.member.id, v]));
      group = owedListOn(s.members, s.memberships, s.payments, today)
        .map((r) => byId.get(r.member.id))
        .filter((v): v is MemberView => v !== undefined);
      headline = line('Members who owe fees');
      detail = (v) => line('{amount}', { amount: formatINR(v.outstandingP) });
      seeAll = page('dues');
      break;
    }
    case 'no_app': {
      if (!d.appPhones) return card('list_members', line('The app list could not load. Check the internet and try again.'), null, [], page('members-app'));
      const phones = d.appPhones;
      group = views.filter((v) => !hasApp(v, phones));
      headline = line('Members without the app');
      seeAll = page('members-app');
      followUps = [{ label: line('Invite them to the app'), path: page('invite') ?? '/messages' }];
      break;
    }
    case 'visited_today':
      group = views.filter((v) => inTile(v, 'visited-today', today));
      headline = line('Came in today');
      detail = () => null;
      seeAll = page('visits');
      break;
    case 'no_plan':
      // Never bought a plan, or none running and none ended in the last 30 days.
      group = views.filter((v) => !isPassMember(v.member) && (v.state === 'never' || (!running(v) && v.state !== 'upcoming' && !endedRecently(v, DEFAULT_DAYS.ended))));
      headline = line('Members with no plan');
      followUps = [{ label: line('Send them an offer'), request: 'Send an offer to members with no plan' }];
      break;
    default:
      group = [];
      headline = line('Members on your list');
  }

  if (input.gender) group = group.filter((v) => v.member.gender === input.gender);
  return { kind: 'list', group, headline, detail, seeAll, followUps };
}

function listMembers(input: ToolInputs['list_members'], d: AnswerData): AnswerResult {
  // "Who owes" as a list is the Dues card, with its total.
  if (input.group === 'owes') return whoOwes({ member: '' }, d);
  const l = listGroup(input, d);
  if (l.kind !== 'list') return l;
  const rows = l.group.map((v) => memberRow(v, l.detail(v)));
  return card('list_members', l.headline, String(rows.length), rows, l.seeAll, rows.length > 0 ? l.followUps : []);
}

/**
 * The members of a group, for a message (plan.ts): the same lists the answers show. Null when the group
 * cannot be listed (an unknown plan or batch, money for desk staff, the app list not loaded).
 */
export function membersInGroup(input: ToolInputs['list_members'], d: AnswerData): MemberView[] | null {
  const l = listGroup(input, d);
  return l.kind === 'list' ? l.group : null;
}

// ------------------------------------------------------------------ members by name

export type Picked = { kind: 'one'; view: MemberView } | Exclude<AnswerResult, { kind: 'card' } | { kind: 'help' }>;

/** The member named in the request, or the one he picked from the choices (`chosenId`). */
export function pickMember(typed: string, views: readonly MemberView[], chosenId?: string | null): Picked {
  if (chosenId) {
    const v = views.find((x) => x.member.id === chosenId);
    if (v) return { kind: 'one', view: v };
  }
  const m = matchMember(typed, views);
  if (m.kind === 'one') return { kind: 'one', view: m.item };
  if (m.kind === 'choose') {
    return {
      kind: 'choose',
      typed,
      options: m.items.map((v) => memberRow(v, v.current ? line('{plan}', { plan: v.current.planName }) : null)),
    };
  }
  return {
    kind: 'not_found',
    typed,
    followUps: [{ label: line('Add {name} as a new member', { name: typed }), request: `Add ${typed} as a new member` }],
  };
}

// ------------------------------------------------------------------ who_owes

function whoOwes(input: ToolInputs['who_owes'], d: AnswerData, chosenId?: string | null): AnswerResult {
  const { snapshot: s, today } = d;
  const dues = owedListOn(s.members, s.memberships, s.payments, today);
  if (!input.member.trim() && !chosenId) {
    if (!d.seeTotals) return ownerOnly('who_owes');
    const total: Paise = sumPaise(dues.map((r) => r.totalP));
    const rows = dues.map((r) => ({
      key: r.member.id,
      label: r.member.fullName,
      detail: line('{amount} · owed for {days} days', { amount: formatINR(r.totalP), days: r.oldestAgeDays }),
      memberId: r.member.id,
    }));
    return card('who_owes', line('Fees due: {n} members', { n: dues.length }), formatINR(total), rows, page('dues'), rows.length > 0
      ? [{ label: line('Send them a fee reminder'), request: 'Send a fee reminder to members who owe money' }]
      : []);
  }
  const p = pickMember(input.member, d.allViews, chosenId);
  if (p.kind !== 'one') return p;
  const v = p.view;
  const mine = dues.find((r) => r.member.id === v.member.id);
  if (!mine || mine.totalP <= 0) {
    return card('who_owes', line('{name} owes nothing.', { name: v.member.fullName }), formatINR(0), [], page('member-profile', v.member.id));
  }
  const rows = mine.terms.map((t) => plainRow(t.membership.id, t.membership.planName, line('{amount} · from {day}', { amount: formatINR(t.unpaidP), day: formatDay(t.membership.startsOn) })));
  return card('who_owes', line('{name} owes', { name: v.member.fullName }), formatINR(mine.totalP), rows, page('member-profile', v.member.id), [
    { label: line('Record a payment'), request: `${v.member.fullName} paid ${Math.round(mine.totalP / 100)}` },
  ]);
}

// ------------------------------------------------------------------ money_summary

function moneySummary(input: ToolInputs['money_summary'], d: AnswerData): AnswerResult {
  if (!d.seeTotals) return ownerOnly('money_summary');
  const { snapshot: s, today } = d;
  const r = periodRange(input.period, input.from, input.to, today);
  const when = rangeWords(r);
  const sum = collectionSummary(s.payments, r);
  switch (input.breakdown) {
    case 'by_plan': {
      const planOf = new Map(s.memberships.map((m) => [m.id, m.planName]));
      const byPlan = new Map<string, Paise[]>();
      for (const p of paymentsInRange(s.payments, r)) {
        if (p.voided) continue;
        const name = (p.membershipId && planOf.get(p.membershipId)) || '—';
        byPlan.set(name, [...(byPlan.get(name) ?? []), p.amountP]);
      }
      const rows = [...byPlan.entries()]
        .map(([name, list]) => ({ name, total: sumPaise(list), n: list.length }))
        .sort((a, b) => b.total - a.total)
        .map((x) => plainRow(x.name, x.name, line('{amount} · {n} receipts', { amount: formatINR(x.total), n: x.n })));
      return card('money_summary', line('Collected {when}, by plan', { when }), formatINR(sum.netP), rows, page('money'));
    }
    case 'expenses': {
      const spent = s.expenses.filter((e) => e.spentOn >= r.from && e.spentOn <= r.to);
      const rows = totalsByCategory(spent).map((c) => plainRow(c.category, categoryLabel(c.category), line('{amount}', { amount: formatINR(c.totalP) })));
      return card('money_summary', line('Spent {when}', { when }), formatINR(sumPaise(spent.map((e) => e.amountP))), rows, page('expenses'));
    }
    case 'profit': {
      // A whole calendar month: the Expenses page's own month summary. Any other days: fees in minus spent.
      const wholeMonth = r.from === startOfMonth(r.from) && (r.to === endOfMonth(r.from) || r.to === today) && monthKey(r.from) === monthKey(r.to);
      const spentP = sumPaise(s.expenses.filter((e) => e.spentOn >= r.from && e.spentOn <= r.to).map((e) => e.amountP));
      const m = wholeMonth ? monthSummary(s.payments, s.expenses, monthKey(r.from)) : { collectedP: sum.netP, spentP, profitP: sum.netP - spentP };
      const rows = [
        plainRow('in', 'Collected', line('{amount}', { amount: formatINR(m.collectedP) })),
        plainRow('out', 'Spent', line('{amount}', { amount: formatINR(m.spentP) })),
      ];
      return card('money_summary', m.profitP >= 0 ? line('Profit {when}', { when }) : line('Loss {when}', { when }), formatINR(Math.abs(m.profitP)), rows, page('expenses'));
    }
    case 'by_method':
    case 'total':
    default: {
      const rows = sum.byMethod
        .filter((x) => x.amountP > 0)
        .map((x) => plainRow(x.method, methodLabel(x.method), line('{amount} · {n} receipts', { amount: formatINR(x.amountP), n: x.countN })));
      return card('money_summary', line('Collected {when}', { when }), formatINR(sum.netP), rows, page(r.from === today && r.to === today ? 'money-today' : 'money'));
    }
  }
}

// ------------------------------------------------------------------ attendance_summary

/** Treated as "inside now": checked in within this many minutes (a check-in has no check-out). */
export const INSIDE_MINUTES = 90;

function attendance(input: ToolInputs['attendance_summary'], d: AnswerData): AnswerResult {
  const { snapshot: s, today } = d;
  const r = periodRange(input.period, input.from, input.to, today);
  const when = rangeWords(r);
  switch (input.focus) {
    case 'peak_hours': {
      const b = busyHours(s.visits, r);
      const rows = [...b.hours]
        .filter((h) => h.visitsN > 0)
        .sort((a, c) => c.visitsN - a.visitsN || a.hour - c.hour)
        .map((h) => plainRow(String(h.hour), hourLabel(h.hour), line('{n} check-ins', { n: h.visitsN })));
      return card('attendance_summary', line('Busiest hour {when}', { when }), b.busiest === null ? null : hourLabel(b.busiest), rows, page('busy-hours'));
    }
    case 'inside_now': {
      const since = d.now - INSIDE_MINUTES * 60_000;
      const rows = registerFor(s.visits, s.members, today)
        .filter((x) => x.visit.checkedInAt >= since)
        .map((x) => ({ key: x.visit.id, label: x.member?.fullName ?? '—', detail: null, memberId: x.member?.id }));
      return card('attendance_summary', line('Checked in during the last {minutes} minutes', { minutes: INSIDE_MINUTES }), String(rows.length), rows, page('visits'));
    }
    case 'who_came': {
      const byMember = new Map<string, number>();
      for (const x of s.visits) if (x.visitedOn >= r.from && x.visitedOn <= r.to) byMember.set(x.memberId, (byMember.get(x.memberId) ?? 0) + 1);
      const people = new Map(s.members.map((m) => [m.id, m]));
      const oneDay = r.from === r.to;
      const rows = oneDay
        ? registerFor(s.visits, s.members, r.from).map((x) => ({ key: x.visit.id, label: x.member?.fullName ?? '—', detail: null, memberId: x.member?.id }))
        : [...byMember.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([id, n]) => ({ key: id, label: people.get(id)?.fullName ?? '—', detail: line('{n} visits', { n }), memberId: id }));
      return card('attendance_summary', line('Members who came {when}', { when }), String(byMember.size), rows, page('visits'));
    }
    case 'count':
    default: {
      const a = attendanceSummary(s.visits, r.from, r.to);
      const rows = [plainRow('members', 'Different members', line('{n}', { n: a.membersN }))];
      if (r.from !== r.to) rows.push(plainRow('per-day', 'On an average day', line('{n}', { n: Math.round(a.perDay) })));
      if (a.busiest && r.from !== r.to) rows.push(plainRow('busiest', 'Busiest day', line('{day} · {n}', { day: formatDay(a.busiest.day), n: a.busiest.countN })));
      if (a.busiestHour !== null) rows.push(plainRow('hour', 'Busiest hour', line('{hour}', { hour: hourLabel(a.busiestHour) })));
      return card('attendance_summary', line('Check-ins {when}', { when }), String(a.visitsN), rows, page('visits'));
    }
  }
}

// ------------------------------------------------------------------ growth_summary

function growth(input: ToolInputs['growth_summary'], d: AnswerData): AnswerResult {
  const { snapshot: s, today } = d;
  const r = periodRange(input.period, input.from, input.to, today);
  const terms = countedTerms(s.memberships);
  const before = activeOn(terms, addDays(r.from, -1));
  const after = activeOn(terms, r.to);
  const ends = endingsIn(terms, r.from, r.to, today);
  const joined = newMembers(s.members, r).length;
  const change = after - before;
  const rows = [
    plainRow('joined', 'New members', line('{n}', { n: joined })),
    plainRow('renewed', 'Renewed', line('{n}', { n: ends.renewed })),
    plainRow('lost', 'Did not renew', line('{n}', { n: ends.lost })),
    plainRow('waiting', 'Plan ended, may still renew', line('{n}', { n: ends.waiting })),
    plainRow('change', 'Change in members with a plan', line('{n}', { n: change > 0 ? `+${change}` : String(change) })),
  ];
  return card('growth_summary', line('Members with a plan on {day}', { day: formatDay(r.to) }), String(after), rows, page('growth'));
}

// ------------------------------------------------------------------ member_lookup

function memberLookup(input: ToolInputs['member_lookup'], d: AnswerData, chosenId?: string | null): AnswerResult {
  const p = pickMember(input.member, d.allViews, chosenId);
  if (p.kind !== 'one') return p;
  const v = p.view;
  const { snapshot: s, today } = d;
  const rows: AnswerRow[] = [];
  if (v.current) rows.push(plainRow('plan', 'Plan', line('{plan}', { plan: v.current.planName })));
  const ends = endsDetail(v, today);
  if (ends) rows.push(plainRow('ends', 'Plan', ends));
  if (d.seeTotals || v.outstandingP > 0) rows.push(plainRow('owes', 'Owes', line('{amount}', { amount: formatINR(v.outstandingP) })));
  rows.push(plainRow('visit', 'Visits', visitDetail(v)));
  const pack = runningPtPacks(s.memberships.filter((m) => m.memberId === v.member.id), today)[0];
  if (pack) rows.push(plainRow('pt', 'Personal training', line('{n} sessions left', { n: ptLeft(pack) })));
  const batch = listBatches([v.member])[0];
  if (batch) rows.push(plainRow('batch', 'Batch', line('{batch}', { batch: batch.name })));
  rows.push(plainRow('phone', 'Mobile', line('{phone}', { phone: v.member.phone })));
  const name = v.member.fullName;
  const followUps: FollowUp[] = [{ label: line('Renew {name}', { name }), request: `Renew ${name}` }];
  if (v.outstandingP > 0) followUps.push({ label: line('Record a payment'), request: `${name} paid ${Math.round(v.outstandingP / 100)}` });
  followUps.push({ label: line('Open their page'), path: page('member-profile', v.member.id) ?? '/members' });
  return card('member_lookup', line('{name}', { name }), null, rows, page('member-profile', v.member.id), followUps);
}

// ------------------------------------------------------------------ week_summary

function weekSummary(input: ToolInputs['week_summary'], d: AnswerData): AnswerResult {
  const { snapshot: s, today, allViews } = d;
  const now = weekNumbers(s, allViews, today);
  // This week: the same numbers, read for the week after last (Monday to today), with today's dues.
  const n = input.week === 'this_week' ? { ...weekNumbers(s, allViews, addDays(today, 7)), to: today, duesP: now.duesP, duesPeople: now.duesPeople, endingThisWeek: now.endingThisWeek } : now;
  const rows = [
    plainRow('new', 'New members', line('{n}', { n: n.newMembers })),
    plainRow('sold', 'Plans sold', line('{n}', { n: n.plansSold })),
    plainRow('visits', 'Check-ins', line('{n}', { n: n.checkIns })),
    plainRow('enquiries', 'Enquiries', line('{n}', { n: n.enquiries })),
    plainRow('ending', 'Plans ending this week', line('{n}', { n: n.endingThisWeek })),
  ];
  if (d.seeTotals) rows.splice(0, 0, plainRow('collected', 'Collected', line('{amount}', { amount: formatINR(n.collectedP) })), plainRow('dues', 'Fees due today', line('{amount} · {n} members', { amount: formatINR(n.duesP), n: n.duesPeople })));
  const headline = input.week === 'this_week' ? line('This week, {when}', { when: rangeWords(n) }) : line('Last week, {when}', { when: rangeWords(n) });
  return card('week_summary', headline, d.seeTotals ? formatINR(n.collectedP) : String(n.checkIns), rows, null, [
    { label: line('Send this to my WhatsApp'), request: 'Send me the week summary on WhatsApp' },
  ]);
}

// ------------------------------------------------------------------ gym_numbers

function countBy<T>(items: readonly T[], keyOf: (x: T) => string): { key: string; n: number }[] {
  const m = new Map<string, number>();
  for (const x of items) m.set(keyOf(x), (m.get(keyOf(x)) ?? 0) + 1);
  return [...m.entries()].map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n || a.key.localeCompare(b.key));
}

const GENDER_WORD: Record<string, string> = { male: 'Men', female: 'Women', other: 'Other', '': 'Not filled' };

function gymNumbers(input: ToolInputs['gym_numbers'], d: AnswerData): AnswerResult {
  const { snapshot: s, today } = d;
  const live = d.views.filter(running);
  switch (input.topic) {
    case 'members_by_plan': {
      const rows = countBy(live, (v) => v.current?.planName ?? '—').map((x) => plainRow(x.key, x.key, line('{n}', { n: x.n })));
      return card('gym_numbers', line('Members with a running plan, by plan'), String(live.length), rows, page('plans'));
    }
    case 'members_by_gender': {
      const rows = countBy(live, (v) => v.member.gender ?? '').map((x) => plainRow(x.key || 'none', GENDER_WORD[x.key] ?? x.key, line('{n}', { n: x.n })));
      return card('gym_numbers', line('Members with a running plan, men and women'), String(live.length), rows, page('members'));
    }
    case 'members_by_batch': {
      const rows = listBatches(live.map((v) => v.member)).map((b) => plainRow(b.key, b.name, line('{n}', { n: b.countN })));
      return card('gym_numbers', line('Members with a running plan, by batch'), String(rows.length), rows, page('members'));
    }
    case 'plans_and_prices': {
      const plans = s.plans.filter((p) => p.active).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
      const rows = plans.map((p) =>
        plainRow(p.id, p.name, line('{price} · {count} {unit}', { price: formatINR(p.priceP), count: p.durationCount, unit: p.durationUnit === 'month' ? 'months' : 'days' })),
      );
      return card('gym_numbers', line('Your plans and prices'), String(plans.length), rows, page('plans'));
    }
    case 'enquiries': {
      const c = bucketCounts(s.enquiries ?? [], today);
      const rows = [
        plainRow('overdue', 'Follow-up overdue', line('{n}', { n: c.overdue })),
        plainRow('today', 'Follow up today', line('{n}', { n: c.today })),
        plainRow('later', 'Follow up later', line('{n}', { n: c.later })),
        plainRow('joined', 'Joined', line('{n}', { n: c.joined })),
        plainRow('lost', 'Did not join', line('{n}', { n: c.lost })),
      ];
      return card('gym_numbers', line('Enquiries still open'), String(c.overdue + c.today + c.later), rows, page('enquiries'));
    }
    case 'followups_today': {
      const due = filterEnquiries(s.enquiries ?? [], 'due', today);
      const rows = due.map((e) => plainRow(e.id, e.name, e.interest ? line('{interest}', { interest: e.interest }) : null));
      return card('gym_numbers', line('Enquiries to call today'), String(due.length), rows, page('enquiries'));
    }
    case 'trainers': {
      const packs = runningPtPacks(s.memberships, today);
      const rows = countBy(packs, (p) => cleanTrainer(p.trainer)?.split(' ')[0] ?? '—').map((x) => plainRow(x.key, x.key, line('{n} members in personal training', { n: x.n })));
      return card('gym_numbers', line('Personal training running now, by trainer'), String(packs.length), rows, page('trainers'));
    }
    case 'without_app':
      return listMembers({ group: 'no_app', days: 0, plan: '', batch: '', trainer: '', gender: '' }, d);
    case 'birthdays_week':
    default:
      return listMembers({ group: 'birthday_week', days: 0, plan: '', batch: '', trainer: '', gender: '' }, d);
  }
}

// ------------------------------------------------------------------ the one way in

/**
 * The answer to one "ask" action. `chosenId`: the member he picked after a "which one?" (the same action again).
 * Never throws: a broken input gives an empty card, not a crash in the chat.
 */
export function answerAsk<K extends AskTool>(tool: K, input: ToolInputs[K], d: AnswerData, chosenId?: string | null): AnswerResult {
  switch (tool as AskTool) {
    case 'list_members':
      return listMembers(input as ToolInputs['list_members'], d);
    case 'who_owes':
      return whoOwes(input as ToolInputs['who_owes'], d, chosenId);
    case 'money_summary':
      return moneySummary(input as ToolInputs['money_summary'], d);
    case 'attendance_summary':
      return attendance(input as ToolInputs['attendance_summary'], d);
    case 'growth_summary':
      return growth(input as ToolInputs['growth_summary'], d);
    case 'member_lookup':
      return memberLookup(input as ToolInputs['member_lookup'], d, chosenId);
    case 'week_summary':
      return weekSummary(input as ToolInputs['week_summary'], d);
    case 'gym_numbers':
      return gymNumbers(input as ToolInputs['gym_numbers'], d);
    case 'how_to':
    default:
      return { kind: 'help', question: String((input as Partial<ToolInputs['how_to']>)?.question ?? '') };
  }
}

/** For callers holding a plain action: the answer, or null when the tool is not an "ask" tool. */
export function answerAction(action: { tool: ToolName; input: unknown }, d: AnswerData, chosenId?: string | null): AnswerResult | null {
  if (!isAskTool(action.tool)) return null;
  return answerAsk(action.tool, action.input as ToolInputs[AskTool], d, chosenId);
}
