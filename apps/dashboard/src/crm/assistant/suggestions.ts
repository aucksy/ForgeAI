/**
 * F201 "Today for you" (03-design §5): at most four things worth doing today, worked out here from the gym's
 * own lists, so it costs nothing and needs no AI. Each card carries the sentence it puts in the box when
 * tapped ("Send a renewal reminder to ..."); the owner still reads the draft and confirms it. A card with
 * nobody in it is never shown. PURE.
 */
import { diffDays, isValidDateISO } from '../logic/dates';
import { formatINR, sumPaise } from '../logic/money';
import { owedListOn } from '../logic/ownerNumbers';
import { isMonday } from '../logic/weekSummary';
import { awayDays, membersInGroup, type AnswerData } from './answer';
import { line, type Line, type ToolInputs } from './catalogue';
import type { MemberView, Membership } from '../types';
import { festivalsWithin } from './festivals';

export type SuggestionId = 'birthdays' | 'festival' | 'ending' | 'dues' | 'away' | 'winback' | 'week';

export interface Suggestion {
  id: SuggestionId;
  /** How many members it is about (a festival or the week summary: 1). */
  count: number;
  words: Line;
  /** The button's words (review, 13 Nov: never a bare "Make it"). */
  action: Line;
  /** The sentence it puts in the box. */
  request: string;
  /**
   * R-593 (owner, 16 Nov 2026: "both are good"): who it is about. 1-3 members by name (stopped coming: with their days);
   * more: two names and how many more. Empty for a festival, the fees and the week.
   */
  who: Line[];
  /**
   * R-593: "See who": the same list behind the number, shown on the assistant's screen by our own code (no AI, free,
   * works offline). Null when there is no member list to show.
   */
  show: { tool: 'list_members'; input: ToolInputs['list_members'] } | null;
}

/** A group's list for "See who" (the defaults of list_members' other filters). */
type MemberGroup = 'ending' | 'away' | 'birthday_today' | 'ended';
const listOf = (group: MemberGroup, days: number): NonNullable<Suggestion['show']> => ({
  tool: 'list_members',
  input: { group, days, plan: '', batch: '', trainer: '', gender: '' },
});

/** How many names an idea shows before "and N more". */
export const WHO_NAMED = 3;

/** First names, or the full name where two shown share a first name. */
function shortNames(group: readonly MemberView[]): string[] {
  const first = group.map((v) => v.member.fullName.trim().split(/\s+/)[0] || v.member.fullName);
  return group.map((v, i) => (first.filter((f) => f === first[i]).length > 1 ? v.member.fullName.trim() : first[i]));
}

/** R-593: the names on an idea. `detail` (stopped coming) gives each one's own line when 1-3 are named. PURE. */
export function whoLines(group: readonly MemberView[], detail?: (v: MemberView, name: string) => Line): Line[] {
  if (group.length === 0) return [];
  const names = shortNames(group);
  if (group.length <= WHO_NAMED) return detail ? group.map((v, i) => detail(v, names[i])) : [line('{names}', { names: names.join(', ') })];
  return [line('{names} and {n} more', { names: names.slice(0, 2).join(', '), n: group.length - 2 })];
}

export const SUGGESTIONS_MAX = 4;
/** "Stopped coming": no visit for this many days, with a running plan. */
export const AWAY_DAYS = 10;
/** Win-back: plans that ended within this many days. */
export const WINBACK_DAYS = 30;
/** Festivals this close come before the member lists (a greeting has a deadline). */
const FESTIVAL_URGENT_DAYS = 2;

const groupOf = (d: AnswerData, group: MemberGroup, days: number): MemberView[] => membersInGroup(listOf(group, days).input, d) ?? [];

function termsOf(d: AnswerData): Map<string, Membership[]> {
  const out = new Map<string, Membership[]>();
  for (const m of d.snapshot.memberships) {
    const list = out.get(m.memberId);
    if (list) list.push(m);
    else out.set(m.memberId, [m]);
  }
  return out;
}

/** Today's suggestions, most useful first, at most SUGGESTIONS_MAX; empty ones left out. */
export function todaySuggestions(d: AnswerData): Suggestion[] {
  const ranked: { rank: number; s: Suggestion }[] = [];
  const add = (rank: number, s: Suggestion) => {
    if (s.count > 0) ranked.push({ rank, s });
  };

  const birthdays = groupOf(d, 'birthday_today', 0);
  add(10, {
    id: 'birthdays',
    count: birthdays.length,
    words: line('Birthdays today: {n}', { n: birthdays.length }),
    action: line('Write birthday wishes'),
    request: 'Send birthday wishes to members whose birthday is today',
    who: whoLines(birthdays),
    show: listOf('birthday_today', 0),
  });

  const fest = festivalsWithin(d.today)[0];
  if (fest) {
    // 15 Nov 2026: a moon-dated day (Eid) is never stated as certain, and one day is "tomorrow", not "1 days".
    const words = fest.tentative
      ? fest.inDays === 0
        ? line('{festival} is expected today (the moon decides the day)', { festival: fest.name })
        : fest.inDays === 1
          ? line('{festival} is expected tomorrow (the moon decides the day)', { festival: fest.name })
          : line('{festival} is around {days} days away', { festival: fest.name, days: fest.inDays })
      : fest.inDays === 0
        ? line('{festival} is today', { festival: fest.name })
        : fest.inDays === 1
          ? line('{festival} is tomorrow', { festival: fest.name })
          : line('{festival} is in {days} days', { festival: fest.name, days: fest.inDays });
    add(fest.inDays <= FESTIVAL_URGENT_DAYS ? 20 : 60, { id: 'festival', count: 1, words, action: line('Write a {festival} greeting', { festival: fest.name }), request: `Send a ${fest.name} greeting to everyone`, who: [], show: null });
  }

  const ending = groupOf(d, 'ending', 7);
  add(30, {
    id: 'ending',
    count: ending.length,
    words: line('Plans ending this week: {n}', { n: ending.length }),
    action: line('Write a renewal reminder'),
    request: 'Send a renewal reminder to members whose plan ends this week',
    who: whoLines(ending),
    show: listOf('ending', 7),
  });

  if (d.seeTotals) {
    const dues = owedListOn(d.snapshot.members, d.snapshot.memberships, d.snapshot.payments, d.today);
    add(40, {
      id: 'dues',
      count: dues.length,
      words: line('Fees due: {n} members, {amount}', { n: dues.length, amount: formatINR(sumPaise(dues.map((r) => r.totalP))) }),
      action: line('Write a fee reminder'),
      request: 'Send a fee reminder to members who owe money',
      who: [],
      show: null,
    });
  }

  const away = groupOf(d, 'away', AWAY_DAYS);
  const terms = away.length > 0 && away.length <= WHO_NAMED ? termsOf(d) : null;
  add(50, {
    id: 'away',
    count: away.length,
    words: line('Not seen for {days}+ days: {n}', { days: AWAY_DAYS, n: away.length }),
    action: line('Write a we miss you message'),
    request: `Send a we miss you message to members who have not come for ${AWAY_DAYS} days`,
    who: whoLines(away, (v, name) => {
      if (v.daysSinceVisit !== null) return line('{name}: no visit in {days} days', { name, days: v.daysSinceVisit });
      // R-600 (fresh eyes, 16 Nov 2026): "joined N days ago" is counted from the real joining day. A member who rejoined
      // has a later plan run start (the counting rule, awayDays in membersInGroup, still needs both 10+ days old).
      const days = isValidDateISO(v.member.joinedOn)
        ? Math.max(0, diffDays(v.member.joinedOn, d.today))
        : (awayDays(v, terms?.get(v.member.id) ?? [], d.today) ?? AWAY_DAYS);
      return line('{name}: joined {days} days ago, no visit yet', { name, days });
    }),
    show: listOf('away', AWAY_DAYS),
  });

  const ended = groupOf(d, 'ended', WINBACK_DAYS);
  add(70, {
    id: 'winback',
    count: ended.length,
    words: line('Plans ended in the last {days} days: {n}', { days: WINBACK_DAYS, n: ended.length }),
    action: line('Write a come-back offer'),
    request: `Send a come-back offer to members whose plan ended in the last ${WINBACK_DAYS} days`,
    who: whoLines(ended),
    show: listOf('ended', WINBACK_DAYS),
  });

  if (isMonday(d.today)) add(80, { id: 'week', count: 1, words: line('Your week in numbers'), action: line('Show the summary'), request: 'Show last week’s summary', who: [], show: null });

  return ranked.sort((a, b) => a.rank - b.rank).slice(0, SUGGESTIONS_MAX).map((r) => r.s);
}
