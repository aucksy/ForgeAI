/**
 * F201 "Today for you" (03-design §5): at most four things worth doing today, worked out here from the gym's
 * own lists, so it costs nothing and needs no AI. Each card carries the sentence it puts in the box when
 * tapped ("Send a renewal reminder to ..."); the owner still reads the draft and confirms it. A card with
 * nobody in it is never shown. PURE.
 */
import { formatINR, sumPaise } from '../logic/money';
import { owedListOn } from '../logic/ownerNumbers';
import { isMonday } from '../logic/weekSummary';
import { membersInGroup, type AnswerData } from './answer';
import { line, type Line } from './catalogue';
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
}

export const SUGGESTIONS_MAX = 4;
/** "Stopped coming": no visit for this many days, with a running plan. */
export const AWAY_DAYS = 10;
/** Win-back: plans that ended within this many days. */
export const WINBACK_DAYS = 30;
/** Festivals this close come before the member lists (a greeting has a deadline). */
const FESTIVAL_URGENT_DAYS = 2;

const groupSize = (d: AnswerData, group: 'ending' | 'away' | 'birthday_today' | 'ended', days: number): number =>
  membersInGroup({ group, days, plan: '', batch: '', trainer: '', gender: '' }, d)?.length ?? 0;

/** Today's suggestions, most useful first, at most SUGGESTIONS_MAX; empty ones left out. */
export function todaySuggestions(d: AnswerData): Suggestion[] {
  const ranked: { rank: number; s: Suggestion }[] = [];
  const add = (rank: number, s: Suggestion) => {
    if (s.count > 0) ranked.push({ rank, s });
  };

  const birthdays = groupSize(d, 'birthday_today', 0);
  add(10, { id: 'birthdays', count: birthdays, words: line('Birthdays today: {n}', { n: birthdays }), action: line('Write birthday wishes'), request: 'Send birthday wishes to members whose birthday is today' });

  const fest = festivalsWithin(d.today)[0];
  if (fest) {
    const words = fest.inDays === 0
      ? line('{festival} is today', { festival: fest.name })
      : fest.tentative
        ? line('{festival} is around {days} days away', { festival: fest.name, days: fest.inDays })
        : line('{festival} is in {days} days', { festival: fest.name, days: fest.inDays });
    add(fest.inDays <= FESTIVAL_URGENT_DAYS ? 20 : 60, { id: 'festival', count: 1, words, action: line('Write a {festival} greeting', { festival: fest.name }), request: `Send a ${fest.name} greeting to everyone` });
  }

  const ending = groupSize(d, 'ending', 7);
  add(30, { id: 'ending', count: ending, words: line('Plans ending this week: {n}', { n: ending }), action: line('Write a renewal reminder'), request: 'Send a renewal reminder to members whose plan ends this week' });

  if (d.seeTotals) {
    const dues = owedListOn(d.snapshot.members, d.snapshot.memberships, d.snapshot.payments, d.today);
    add(40, {
      id: 'dues',
      count: dues.length,
      words: line('Fees due: {n} members, {amount}', { n: dues.length, amount: formatINR(sumPaise(dues.map((r) => r.totalP))) }),
      action: line('Write a fee reminder'),
      request: 'Send a fee reminder to members who owe money',
    });
  }

  const away = groupSize(d, 'away', AWAY_DAYS);
  add(50, { id: 'away', count: away, words: line('Not seen for {days}+ days: {n}', { days: AWAY_DAYS, n: away }), action: line('Write a we miss you message'), request: `Send a we miss you message to members who have not come for ${AWAY_DAYS} days` });

  const ended = groupSize(d, 'ended', WINBACK_DAYS);
  add(70, { id: 'winback', count: ended, words: line('Plans ended in the last {days} days: {n}', { days: WINBACK_DAYS, n: ended }), action: line('Write a come-back offer'), request: `Send a come-back offer to members whose plan ended in the last ${WINBACK_DAYS} days` });

  if (isMonday(d.today)) add(80, { id: 'week', count: 1, words: line('Your week in numbers'), action: line('Show the summary'), request: 'Show last week’s summary' });

  return ranked.sort((a, b) => a.rank - b.rank).slice(0, SUGGESTIONS_MAX).map((r) => r.s);
}
