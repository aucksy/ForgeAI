/**
 * Seeded coach conversation (last ~3 days) showing off the AI OS:
 * a hinglish workout log -> 'workout_logged' card + PR congratulation,
 * a meal log -> 'meal_logged' card, and yesterday's 'workout_plan' card.
 * Payload shapes match the MessageKind conventions in types/models.ts
 * (SessionDetail / Meal / TodaysWorkout / PersonalRecord[] + names).
 */
import { addDays, fromISO } from '@/lib/date';
import { fmtInt, trimNum } from '@/lib/format';
import { uuid } from '@/lib/uuid';
import type {
  Exercise,
  MessageKind,
  MessageRole,
  Meal,
  OverloadTarget,
  PersonalRecord,
  SessionDetail,
  SetEntry,
  TodaysWorkout,
} from '@/types/models';

import { specOf, type ExerciseKey } from './exercises';
import type { GeneratedHistory, GeneratedSession, GeneratedSet } from './history';
import type { GeneratedMeal } from './meals';
import { PLAN_DAYS } from './plan';
import { SEED_PROFILE } from './profile';

export interface GeneratedChatMessage {
  id: string;
  role: MessageRole;
  kind: MessageKind;
  text: string;
  payload: unknown | null;
  createdAt: number;
}

export interface GeneratedChat {
  messages: GeneratedChatMessage[];
  /** Sessions the story says came in through the coach -> source 'chat'. */
  chatSessionIds: Set<string>;
  /** Meal the story says came in through the coach -> source 'text'. */
  chatMealIds: Set<string>;
}

interface ChatInput {
  today: string;
  history: GeneratedHistory;
  meals: GeneratedMeal[];
  exerciseIds: Record<ExerciseKey, string>;
  planDayIds: readonly string[];
}

export function generateChat(input: ChatInput): GeneratedChat {
  const { today, history, meals, exerciseIds, planDayIds } = input;
  const sessions = history.sessions;
  const messages: GeneratedChatMessage[] = [];
  const chatSessionIds = new Set<string>();
  const chatMealIds = new Set<string>();
  if (sessions.length === 0) return { messages, chatSessionIds, chatMealIds };

  const toExercise = (key: ExerciseKey): Exercise => ({ id: exerciseIds[key], ...stripKey(key) });
  const toSetEntry = (sessionId: string, s: GeneratedSet): SetEntry => ({
    id: s.id,
    sessionId,
    exerciseId: exerciseIds[s.exerciseKey],
    setNumber: s.setNumber,
    weightKg: s.weightKg,
    reps: s.reps,
    isWarmup: s.isWarmup,
  });

  const workingSets = (session: GeneratedSession, key: ExerciseKey): GeneratedSet[] =>
    session.sets.filter((s) => s.exerciseKey === key && !s.isWarmup);

  const summarize = (list: GeneratedSet[]): { topW: number; topReps: number } => {
    let topW = list[0].weightKg;
    let topReps = list[0].reps;
    for (const s of list) {
      if (s.weightKg > topW || (s.weightKg === topW && s.reps > topReps)) {
        topW = s.weightKg;
        topReps = s.reps;
      }
    }
    return { topW, topReps };
  };

  const prsBySession = new Map<string, GeneratedHistory['prs']>();
  for (const pr of history.prs) {
    const list = prsBySession.get(pr.sessionId) ?? [];
    list.push(pr);
    prsBySession.set(pr.sessionId, list);
  }

  // ---------------------------------------------- 1) workout log exchange
  const cutoff = addDays(today, -2);
  const eligible = sessions.filter((s) => s.dateISO <= cutoff);
  const logSession =
    [...eligible].reverse().find((s) => prsBySession.has(s.id)) ??
    (eligible.length > 0 ? eligible[eligible.length - 1] : sessions[sessions.length - 1]);
  chatSessionIds.add(logSession.id);

  const dayExercises = PLAN_DAYS[logSession.planDayIndex].exercises;
  const lead = dayExercises[0];
  const second = dayExercises[1];
  const leadSets = workingSets(logSession, lead.key);
  const secondSets = workingSets(logSession, second.key);
  const leadTop = summarize(leadSets);
  const secondTop = summarize(secondSets);

  const detail = buildSessionDetail(logSession, dayExercises.map((pe) => pe.key), toExercise, toSetEntry, workingSets);

  const t1 = logSession.endedAt + 8 * 60_000;
  messages.push({
    id: uuid(),
    role: 'user',
    kind: 'text',
    text:
      `Aaj ka ${logSession.planDayName} done — ${specOf(lead.key).name} ${trimNum(leadTop.topW)} kg pe ` +
      `${leadSets.map((s) => s.reps).join('-')}, ${specOf(second.key).name} ${trimNum(secondTop.topW)} kg pe ` +
      `${secondSets.map((s) => s.reps).join('-')}. Log kar do coach!`,
    payload: null,
    createdAt: t1,
  });
  messages.push({
    id: uuid(),
    role: 'coach',
    kind: 'workout_logged',
    text:
      `Logged — ${logSession.planDayName}: ${detail.exercises.length} exercises, ` +
      `${fmtInt(detail.totalVolumeKg)} kg total volume. ${specOf(lead.key).name} at ` +
      `${trimNum(leadTop.topW)} kg was the highlight. Solid session.`,
    payload: detail,
    createdAt: t1 + 70_000,
  });

  // ---------------------------------------------- 2) PR congratulation
  const sessionPrs = (prsBySession.get(logSession.id) ?? [])
    .slice()
    .sort((a, b) => b.value - a.value)
    .slice(0, 4);
  if (sessionPrs.length > 0) {
    const star = sessionPrs.find((p) => p.kind === 'e1rm') ?? sessionPrs[0];
    const monthAgo = addDays(today, -30);
    const monthWeightPrs = history.prs.filter((p) => p.kind === 'weight' && p.dateISO >= monthAgo).length;
    const payload: (PersonalRecord & { exerciseName: string })[] = sessionPrs.map((p) => ({
      id: p.id,
      exerciseId: exerciseIds[p.exerciseKey],
      kind: p.kind,
      value: p.value,
      weightKg: p.weightKg,
      reps: p.reps,
      dateISO: p.dateISO,
      sessionId: p.sessionId,
      exerciseName: specOf(p.exerciseKey).name,
    }));
    messages.push({
      id: uuid(),
      role: 'coach',
      kind: 'pr_list',
      text:
        `New PR — ${specOf(star.exerciseKey).name} ${star.kind === 'e1rm' ? 'e1RM ' : ''}` +
        `${trimNum(star.value)} kg. That makes ${monthWeightPrs} weight PRs in the last month. ` +
        `Progressive overload is doing its job.`,
      payload,
      createdAt: t1 + 120_000,
    });
  }

  // ---------------------------------------------- 3) meal log exchange
  const mealDay = addDays(today, -2);
  const dayMeals = meals.filter((m) => m.dateISO === mealDay);
  const lunch = dayMeals.find((m) => m.slot === 'lunch');
  const breakfast = dayMeals.find((m) => m.slot === 'breakfast');
  if (lunch) {
    chatMealIds.add(lunch.id);
    const soFar = (breakfast?.proteinG ?? 0) + lunch.proteinG;
    const remaining = Math.max(0, SEED_PROFILE.proteinTargetG - soFar);
    const mealPayload: Meal = {
      id: lunch.id,
      dateISO: lunch.dateISO,
      loggedAt: lunch.loggedAt,
      description: lunch.description,
      calories: lunch.calories,
      proteinG: lunch.proteinG,
      carbsG: lunch.carbsG,
      fatG: lunch.fatG,
      source: 'text',
      photoUri: null,
    };
    messages.push({
      id: uuid(),
      role: 'user',
      kind: 'text',
      text: `Lunch mein ${lunch.description.toLowerCase()} tha — log kar dena.`,
      payload: null,
      createdAt: lunch.loggedAt + 150_000,
    });
    messages.push({
      id: uuid(),
      role: 'coach',
      kind: 'meal_logged',
      text:
        `Logged: ${lunch.description} — ${fmtInt(lunch.calories)} kcal, ${lunch.proteinG} g protein. ` +
        `You're at ${soFar} g protein so far, ${remaining} g to go today.`,
      payload: mealPayload,
      createdAt: lunch.loggedAt + 210_000,
    });
  }

  // ---------------------------------------------- 4) yesterday's plan card
  const ySession = sessions[sessions.length - 1];
  chatSessionIds.add(ySession.id);
  const yDayIdx = ySession.planDayIndex;
  const yDay = PLAN_DAYS[yDayIdx];
  const targets: OverloadTarget[] = yDay.exercises.map((pe) => {
    const spec = specOf(pe.key);
    const ySets = workingSets(ySession, pe.key);
    const yTop = ySets.length > 0 ? summarize(ySets) : null;
    const prev = [...sessions]
      .reverse()
      .find((s) => s.id !== ySession.id && s.dateISO < ySession.dateISO && workingSets(s, pe.key).length > 0);
    const prevSets = prev ? workingSets(prev, pe.key) : [];
    const prevTop = prev ? summarize(prevSets) : null;
    const targetWeightKg = yTop?.topW ?? prevTop?.topW ?? 0;

    let action: OverloadTarget['action'];
    let reason: string;
    let targetRepsMin = pe.repMin;
    if (!prev || !prevTop) {
      action = 'start';
      reason = `First tracked session on ${spec.name} — start controlled and own every rep.`;
    } else if (targetWeightKg > prevTop.topW) {
      action = 'increase';
      reason = `You hit ${prevSets.map((s) => s.reps).join(', ')} at ${trimNum(prevTop.topW)} kg — time to move up.`;
    } else {
      action = 'hold';
      const chase = Math.min(prevTop.topReps + 1, pe.repMax);
      targetRepsMin = Math.max(pe.repMin, chase);
      reason = `Solid ${trimNum(prevTop.topW)} kg × ${prevTop.topReps} last time — same weight, push for ${chase} today.`;
    }
    return {
      exerciseId: exerciseIds[pe.key],
      exerciseName: spec.name,
      muscleGroup: spec.muscleGroup,
      last: prev && prevTop
        ? { weightKg: prevTop.topW, topReps: prevTop.topReps, sets: prevSets.length, dateISO: prev.dateISO }
        : null,
      targetWeightKg,
      targetRepsMin,
      targetRepsMax: pe.repMax,
      targetSets: pe.sets,
      reason,
      action,
    };
  });

  const muscles: string[] = [];
  for (const t of targets) if (!muscles.includes(t.muscleGroup)) muscles.push(t.muscleGroup);
  const planPayload: TodaysWorkout = {
    dayType: yDay.dayType,
    dayName: yDay.name,
    planDayId: planDayIds[yDayIdx] ?? null,
    targets,
    headline: `${yDay.name} today — ${joinList(muscles.slice(0, 3))} on the menu. Let's move some iron.`,
  };
  const leadTarget = targets[0];
  const askAt = fromISO(ySession.dateISO).getTime() + (8 * 60 + 4) * 60_000;
  messages.push({
    id: uuid(),
    role: 'user',
    kind: 'text',
    text: 'Aaj legs hai na? Kitna weight lagana chahiye?',
    payload: null,
    createdAt: askAt,
  });
  messages.push({
    id: uuid(),
    role: 'coach',
    kind: 'workout_plan',
    text:
      `${yDay.name} today. ${leadTarget.exerciseName} ${trimNum(leadTarget.targetWeightKg)} kg × ` +
      `${leadTarget.targetRepsMin}–${leadTarget.targetRepsMax} — ${leadTarget.reason} Full targets on the card.`,
    payload: planPayload,
    createdAt: askAt + 55_000,
  });

  // ---------------------------------------------- 5) evening nudge (yesterday)
  const nextDayIdx = (yDayIdx + 1) % PLAN_DAYS.length;
  const nextDay = PLAN_DAYS[nextDayIdx];
  const nextLead = nextDay.exercises[0];
  const lastLeadSession = [...sessions].reverse().find((s) => workingSets(s, nextLead.key).length > 0);
  const lastLeadTop = lastLeadSession ? summarize(workingSets(lastLeadSession, nextLead.key)).topW : 0;
  const nextTarget = lastLeadTop + specOf(nextLead.key).incrementKg;
  messages.push({
    id: uuid(),
    role: 'coach',
    kind: 'text',
    text:
      `${yDay.name} banked — that closes the rotation for the week. Tomorrow is ${nextDay.name}: ` +
      `${specOf(nextLead.key).name} is primed for ${trimNum(nextTarget)} kg if you take every set to ` +
      `${nextLead.repMax}. Recover well.`,
    payload: null,
    createdAt: ySession.endedAt + 105 * 60_000,
  });

  messages.sort((a, b) => a.createdAt - b.createdAt);
  return { messages, chatSessionIds, chatMealIds };
}

// ------------------------------------------------------------------ helpers

function stripKey(key: ExerciseKey): Omit<Exercise, 'id'> {
  const { key: _key, ...rest } = specOf(key);
  return rest;
}

function buildSessionDetail(
  session: GeneratedSession,
  keys: readonly ExerciseKey[],
  toExercise: (key: ExerciseKey) => Exercise,
  toSetEntry: (sessionId: string, s: GeneratedSet) => SetEntry,
  workingSets: (session: GeneratedSession, key: ExerciseKey) => GeneratedSet[],
): SessionDetail {
  const exercises = keys
    .filter((key) => session.sets.some((s) => s.exerciseKey === key))
    .map((key) => {
      const all = session.sets.filter((s) => s.exerciseKey === key);
      const volumeKg = workingSets(session, key).reduce((sum, s) => sum + s.weightKg * s.reps, 0);
      return { exercise: toExercise(key), sets: all.map((s) => toSetEntry(session.id, s)), volumeKg };
    });
  return {
    id: session.id,
    dateISO: session.dateISO,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    dayType: session.dayType,
    notes: session.notes,
    source: 'chat',
    exercises,
    totalVolumeKg: exercises.reduce((sum, e) => sum + e.volumeKg, 0),
  };
}

function joinList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
