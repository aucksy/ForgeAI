/**
 * Coach service — today's workout via plan rotation + progressive-overload targets.
 */
import { getActivePlan } from '@/db/repos/planRepo';
import { getExerciseHistory, getRecentSessionDetails } from '@/db/repos/workoutRepo';
import { computeOverloadTarget } from '@/engine/overload';
import { todayISO } from '@/lib/date';
import type {
  DayType,
  Exercise,
  MuscleGroup,
  OverloadTarget,
  PlanDay,
  PlanExercise,
  SessionDetail,
  TodaysWorkout,
} from '@/types/models';

type PlanDayFull = PlanDay & { exercises: (PlanExercise & { exercise: Exercise })[] };

const DAY_LABEL: Record<DayType, string> = {
  push: 'Push Day',
  pull: 'Pull Day',
  legs: 'Leg Day',
  upper: 'Upper Body',
  lower: 'Lower Body',
  full: 'Full Body',
  rest: 'Rest Day',
};

export async function getTodaysWorkout(dateISO?: string): Promise<TodaysWorkout> {
  const today = dateISO ?? todayISO();
  const [active, recentAll] = await Promise.all([getActivePlan(), getRecentSessionDetails(10)]);
  const recent = recentAll.filter((s) => s.dateISO <= today); // newest first

  if (!active || active.days.length === 0) {
    return {
      dayType: 'rest',
      dayName: 'Rest Day',
      planDayId: null,
      targets: [],
      headline: 'No active plan yet — tell me your split and we will build one.',
    };
  }

  const days = active.days; // ordered by day_order
  const lastSession = recent.length > 0 ? recent[0] : null;

  let day: PlanDayFull | null;
  let trainedToday = false;

  if (lastSession && lastSession.dateISO === today) {
    trainedToday = true;
    const idx = matchPlanDay(days, lastSession);
    if (idx === null) {
      // Trained today outside the plan — acknowledge it as done.
      const name = DAY_LABEL[lastSession.dayType];
      return {
        dayType: lastSession.dayType,
        dayName: name,
        planDayId: null,
        targets: [],
        headline: `${name} is already in the books — recovery mode: eat, hydrate, sleep.`,
      };
    }
    day = days[idx];
  } else {
    // Rotation: the day after the plan-day of the most recent PLAN-MATCHING
    // session. Anchoring on the newest session that maps to a plan day means an
    // ad-hoc off-plan log (e.g. an 'upper' chat log absent from a PPL plan)
    // doesn't silently reset the A/B cycle back to day 0.
    let lastIdx: number | null = null;
    for (const s of recent) {
      const idx = matchPlanDay(days, s);
      if (idx !== null) {
        lastIdx = idx;
        break;
      }
    }
    day = nextTrainingDay(days, lastIdx);
  }

  if (!day) {
    return {
      dayType: 'rest',
      dayName: 'Rest Day',
      planDayId: null,
      targets: [],
      headline: 'Nothing but rest days on this plan — enjoy the recovery.',
    };
  }

  const targets = await Promise.all(
    day.exercises.map(async (pe) => {
      const raw = await getExerciseHistory(pe.exerciseId, 5);
      // Prescribe from sessions completed BEFORE today so targets stay stable all day.
      const history = raw
        .filter((h) => h.dateISO < today)
        .slice(0, 4)
        .map((h) => ({
          dateISO: h.dateISO,
          sets: h.sets.map((s) => ({ weightKg: s.weightKg, reps: s.reps })),
        }));
      return computeOverloadTarget({
        exercise: pe.exercise,
        target: { targetSets: pe.targetSets, repRangeMin: pe.repRangeMin, repRangeMax: pe.repRangeMax },
        history,
      });
    }),
  );

  return {
    dayType: day.dayType,
    dayName: day.name,
    planDayId: day.id,
    targets,
    headline: buildHeadline(day.name, targets, trainedToday),
  };
}

/**
 * Locate the plan day a session belongs to. Day type narrows candidates;
 * exercise overlap disambiguates A/B variants of the same day type.
 */
function matchPlanDay(days: PlanDayFull[], session: SessionDetail): number | null {
  const sessionExIds = new Set(session.exercises.map((e) => e.exercise.id));
  let bestIdx: number | null = null;
  let bestOverlap = -1;
  for (let i = 0; i < days.length; i++) {
    const d = days[i];
    if (d.dayType !== session.dayType) continue;
    const overlap = d.exercises.reduce((n, pe) => n + (sessionExIds.has(pe.exerciseId) ? 1 : 0), 0);
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function nextTrainingDay(days: PlanDayFull[], lastIdx: number | null): PlanDayFull | null {
  const n = days.length;
  const start = lastIdx === null ? 0 : lastIdx + 1;
  for (let step = 0; step < n; step++) {
    const d = days[(start + step) % n];
    if (d.dayType !== 'rest') return d;
  }
  return null;
}

function buildHeadline(dayName: string, targets: OverloadTarget[], done: boolean): string {
  const muscles: MuscleGroup[] = [];
  for (const t of targets) {
    if (!muscles.includes(t.muscleGroup)) muscles.push(t.muscleGroup);
  }
  const list = joinList(muscles.slice(0, 3));
  if (done) {
    return list
      ? `${dayName} is in the books — ${list} got their work today. Now go eat.`
      : `${dayName} is in the books — great work today.`;
  }
  return list
    ? `${dayName} today — ${list} on the menu. Let's move some iron.`
    : `${dayName} today — log your lifts as you go and I'll track the rest.`;
}

function joinList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
