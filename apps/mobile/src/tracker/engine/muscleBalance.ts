/**
 * Missing-muscle suggestions (R-58, owner 22 Oct 2026; design: docs/overhaul/research/R-muscle-balance.md).
 * PURE: the one shared check of which muscle group a member's week leaves out.
 *
 * Rules against FOMO (research section 5), owner: "I do not want people to experience FOMO":
 *  - judge a whole week (the planned week, or 3 logged weeks averaged), never one routine or one day;
 *  - "missing" is close to zero only: under 2 counted sets a week AND no set where the group is the
 *    main muscle. Never "below ideal" (10 sets is a goal for size, not a bar);
 *  - one suggestion at a time, in a fixed order; related gaps merge into one ("Legs", not three);
 *  - beginners see the big groups only; muted and snoozed groups never show.
 * Counting is the app's usual one (`setShares`): a working set counts 1 for each main muscle and 0.5
 * for each helper.
 */
import type { Muscle } from '../catalog/muscles';

/** The groups that can be suggested (front shoulders, traps, lower back, forearms, inner and outer hips never are). */
export type BalanceGroup =
  | 'legs'
  | 'back'
  | 'chest'
  | 'hamstrings'
  | 'glutes'
  | 'quads'
  | 'core'
  | 'shoulders'
  | 'rear_shoulders'
  | 'side_shoulders'
  | 'calves'
  | 'triceps'
  | 'biceps';

/** The muscles each judged group is built from ("legs" is only ever a merge of the three below). */
export const GROUP_MUSCLES: Readonly<Record<Exclude<BalanceGroup, 'legs'>, readonly Muscle[]>> = {
  chest: ['chest'],
  back: ['lats', 'upper_back'],
  shoulders: ['front_delts', 'side_delts', 'rear_delts'],
  quads: ['quads'],
  hamstrings: ['hamstrings'],
  glutes: ['glutes'],
  core: ['abs', 'obliques'],
  rear_shoulders: ['rear_delts'],
  side_shoulders: ['side_delts'],
  calves: ['calves'],
  triceps: ['triceps'],
  biceps: ['biceps'],
};

/** The 7 big groups (ACSM / CDC "all major muscle groups"); "legs" counts as big. */
export const BIG_GROUPS: readonly BalanceGroup[] = ['legs', 'chest', 'back', 'shoulders', 'quads', 'hamstrings', 'glutes', 'core'];

/** Which one shows when several are missing (research section 6). */
export const BALANCE_ORDER: readonly BalanceGroup[] = [
  'legs',
  'back',
  'chest',
  'hamstrings',
  'glutes',
  'quads',
  'core',
  'shoulders',
  'rear_shoulders',
  'side_shoulders',
  'calves',
  'triceps',
  'biceps',
];

/** How a group reads in a sentence ("for your rear shoulders", "no hamstring work"). */
export const GROUP_WORDS: Readonly<Record<BalanceGroup, { your: string; work: string }>> = {
  legs: { your: 'legs', work: 'leg' },
  back: { your: 'back', work: 'back' },
  chest: { your: 'chest', work: 'chest' },
  hamstrings: { your: 'hamstrings', work: 'hamstring' },
  glutes: { your: 'glutes', work: 'glute' },
  quads: { your: 'quads', work: 'quad' },
  core: { your: 'core', work: 'core' },
  shoulders: { your: 'shoulders', work: 'shoulder' },
  rear_shoulders: { your: 'rear shoulders', work: 'rear shoulder' },
  side_shoulders: { your: 'side shoulders', work: 'side shoulder' },
  calves: { your: 'calves', work: 'calf' },
  triceps: { your: 'triceps', work: 'triceps' },
  biceps: { your: 'biceps', work: 'biceps' },
};

/** Under this many counted sets a week (and no main-muscle set) a group is "close to zero". */
export const NEAR_ZERO_SETS = 2;

export interface WeekSets {
  /** Counted sets a week per muscle (1 main, 0.5 helper), averaged over the weeks judged. */
  counted: ReadonlyMap<Muscle, number>;
  /** Sets a week where the muscle was a MAIN muscle. */
  main: ReadonlyMap<Muscle, number>;
}

export interface BalanceOptions {
  /** Beginners see the big groups only. */
  beginner?: boolean;
  /** Groups the member muted ("I skip this on purpose") or snoozed ("Not now", 4 weeks). */
  quiet?: ReadonlySet<BalanceGroup>;
}

/** Is this group close to zero this week? PURE. */
export function groupMissing(group: Exclude<BalanceGroup, 'legs'>, week: WeekSets): boolean {
  const muscles = GROUP_MUSCLES[group];
  const counted = muscles.reduce((a, m) => a + (week.counted.get(m) ?? 0), 0);
  const main = muscles.reduce((a, m) => a + (week.main.get(m) ?? 0), 0);
  return counted < NEAR_ZERO_SETS - 1e-9 && main <= 1e-9;
}

/**
 * The groups to suggest, most important first (usually one is shown). Quads, hamstrings and glutes
 * all missing become "legs"; a missing back covers its rear shoulders and biceps; a missing chest
 * covers its triceps and side shoulders. PURE.
 */
export function missingGroups(week: WeekSets, opts: BalanceOptions = {}): BalanceGroup[] {
  const raw = new Set<BalanceGroup>(
    (Object.keys(GROUP_MUSCLES) as Exclude<BalanceGroup, 'legs'>[]).filter((g) => groupMissing(g, week)),
  );
  if (raw.has('quads') && raw.has('hamstrings') && raw.has('glutes')) {
    raw.delete('quads');
    raw.delete('hamstrings');
    raw.delete('glutes');
    raw.add('legs');
  }
  if (raw.has('back')) {
    raw.delete('rear_shoulders');
    raw.delete('biceps');
  }
  if (raw.has('chest')) {
    raw.delete('triceps');
    raw.delete('side_shoulders');
  }
  // A missing "shoulders" already says the side and rear are.
  if (raw.has('shoulders')) {
    raw.delete('side_shoulders');
    raw.delete('rear_shoulders');
  }
  return BALANCE_ORDER.filter(
    (g) => raw.has(g) && !(opts.quiet?.has(g) ?? false) && (!opts.beginner || BIG_GROUPS.includes(g)),
  );
}

/** One logged workout's working sets, as the check counts them. */
export interface CountedSet {
  /** The day of the workout (YYYY-MM-DD). */
  dateISO: string;
  /** How much the set counts for each muscle (`setShares`: 1 main, 0.5 helper). */
  shares: ReadonlyMap<Muscle, number>;
}

/** The logged sets averaged into a week (`weeks` weeks judged). PURE. */
export function weekFromLogged(sets: readonly CountedSet[], weeks: number): WeekSets {
  const counted = new Map<Muscle, number>();
  const main = new Map<Muscle, number>();
  const n = Math.max(1, weeks);
  for (const s of sets) {
    for (const [m, share] of s.shares) {
      counted.set(m, (counted.get(m) ?? 0) + share / n);
      if (share >= 1) main.set(m, (main.get(m) ?? 0) + 1 / n);
    }
  }
  return { counted, main };
}

/** Plan list line: "Your week has no hamstring work. Lying Leg Curl on Legs day covers it." PURE. */
export function planLine(group: BalanceGroup, exercise: string, routine: string): string {
  return `Your week has no ${GROUP_WORDS[group].work} work. ${exercise} on ${routine} covers it.`;
}

/** Up next line: "Easy add today: 2 sets of Face Pull for your rear shoulders." PURE. */
export function todayLine(group: BalanceGroup, exercise: string, sets: number): string {
  return `Easy add today: ${sets} ${sets === 1 ? 'set' : 'sets'} of ${exercise} for your ${GROUP_WORDS[group].your}.`;
}
