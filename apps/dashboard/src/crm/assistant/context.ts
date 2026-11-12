/**
 * F201 (03-design §4 and §7): the SMALL context sent with every /api/assist request, so the AI can name a plan,
 * a batch or a trainer and work out "kal" or "is hafte". It never holds the member list, phone numbers, dues
 * or visits: the AI only picks a report, and our own code fills it (answer.ts). PURE.
 */
import { activeBatches } from '../logic/batches';
import { addDays, type DateISO } from '../logic/dates';
import { paiseToRupees } from '../logic/money';
import { cleanTrainer, isPtPlan } from '../logic/pt';
import type { MessageLang } from '../logic/messageWords';
import type { CrmSnapshot } from '../data/adapter';

export interface AssistPlan {
  name: string;
  /** Rupees. */
  price: number;
  /** Whole months; 0 for a plan sold in days (a day pass, a 15-day plan). */
  months: number;
}

export interface AssistContext {
  gym: string;
  /** India's today, YYYY-MM-DD. */
  today: DateISO;
  /** "Thursday": lets the AI turn "Monday" or "kal" into a date. */
  weekday: string;
  plans: AssistPlan[];
  batches: string[];
  trainers: string[];
  messageLang: MessageLang;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** Caps that keep the request small whatever the gym holds. */
export const CONTEXT_MAX = { plans: 30, batches: 20, trainers: 20, name: 40 } as const;

const short = (s: string) => s.trim().replace(/\s+/g, ' ').slice(0, CONTEXT_MAX.name);

/** Day of the week of an India date (noon UTC, so no time zone can move the day). */
export function weekdayName(day: DateISO): string {
  return WEEKDAYS[new Date(`${day}T12:00:00Z`).getUTCDay()];
}

/** Trainers' first names, from the PT plans and the PT packs sold in the last year (a trainer list of names only). */
export function trainerNames(s: Pick<CrmSnapshot, 'plans' | 'memberships'>, today: DateISO, extra: readonly string[] = []): string[] {
  const since = addDays(today, -365);
  const raw = [
    ...extra,
    ...s.plans.filter((p) => p.active).map((p) => p.trainer),
    ...s.memberships.filter((m) => !m.cancelled && m.endsOn >= since).map((m) => m.trainer),
  ];
  const out = new Map<string, string>();
  for (const r of raw) {
    const first = cleanTrainer(r)?.split(' ')[0];
    if (first && !out.has(first.toLowerCase())) out.set(first.toLowerCase(), short(first));
  }
  return [...out.values()].slice(0, CONTEXT_MAX.trainers);
}

/**
 * The context for one request. `extraTrainers`: names from the Trainers page when the gym's server has it.
 * Nothing here comes from a member's record except the batch names the gym typed.
 */
export function buildAssistContext(
  s: Pick<CrmSnapshot, 'gym' | 'plans' | 'memberships' | 'members'>,
  today: DateISO,
  messageLang: MessageLang,
  extraTrainers: readonly string[] = [],
): AssistContext {
  const plans = s.plans
    .filter((p) => p.active)
    .sort((a, b) => Number(isPtPlan(a)) - Number(isPtPlan(b)) || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .slice(0, CONTEXT_MAX.plans)
    .map((p) => ({
      name: short(p.name),
      price: paiseToRupees(p.priceP),
      months: p.durationUnit === 'month' ? p.durationCount : 0,
    }));
  return {
    gym: short(s.gym.name),
    today,
    weekday: weekdayName(today),
    plans,
    batches: activeBatches(s.members)
      .slice(0, CONTEXT_MAX.batches)
      .map((b) => short(b.name)),
    trainers: trainerNames(s, today, extraTrainers),
    messageLang,
  };
}
