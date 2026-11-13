/**
 * Balance check and focus block (F52, R-201): reads and writes for the Charts page card. The rules
 * are `engine/balanceBlock` (pure, tested). Saved state: one `meta` row (`balance_check`, carried
 * by backups so a restored phone can still go back to the old routine).
 *
 * R-483 (owner, 13 Nov 2026: "A) keep only the new Up next tip"): swap advice lives in ONE place, the
 * muscle tip on the Workout tab's Up next card (services/muscleTips). This card keeps its numbers (a
 * muscle trained much less than the rest, from the last 4 weeks) and "Not now", and no longer offers a
 * swap. A focus block a member started before keeps running to its end ("Keep it" / "Go back").
 */
import { getDb, getMeta, setMeta } from '@/db';
import { enqueueWrite } from '@/db/writeQueue';
import { addDays, daysBetween, todayISO } from '@/lib/date';

import type { Muscle } from '../catalog/muscles';
import { addExerciseToRoutine, getRoutine, reorderRoutineExercises, replaceRoutineExercise } from '../db/routineRepo';
import {
  AFTER_BLOCK_DAYS,
  BALANCE_WEEKS,
  BLOCK_DAYS,
  blockDue,
  blockWeek,
  enoughHistory,
  parseBalanceState,
  quietMuscles,
  restoreOrder,
  SNOOZE_DAYS,
  weakSpot,
  weeklyFromShares,
  withSnooze,
  type BalanceBlock,
  type BalanceState,
  type WeakSpot,
} from '../engine/balanceBlock';
import { getBalanceSets } from './volumeService';

export const BALANCE_KEY = 'balance_check';

export type BalanceCard =
  | { kind: 'none' }
  | { kind: 'weak'; spot: WeakSpot }
  | { kind: 'running'; block: BalanceBlock; week: number; now: number | null }
  | { kind: 'due'; block: BalanceBlock; now: number | null };

async function readState(): Promise<BalanceState> {
  return parseBalanceState(await getMeta(BALANCE_KEY));
}

function writeState(state: BalanceState): Promise<void> {
  return enqueueWrite(() => setMeta(BALANCE_KEY, JSON.stringify(state)));
}

/** The weak muscle's sets a week since the block started (null before a whole week). */
async function setsSince(block: BalanceBlock, today: string): Promise<number | null> {
  const days = daysBetween(block.startISO, today);
  if (days < 7) return null;
  const weeks = Math.min(days, BLOCK_DAYS) / 7;
  const { sets } = await getBalanceSets(block.startISO, addDays(block.startISO, Math.min(days, BLOCK_DAYS) - 1));
  return weeklyFromShares(sets, weeks).get(block.muscle) ?? 0;
}

/** What the card shows today. Never throws (a failure reads as "nothing to show", logged). */
export async function getBalanceCard(today: string = todayISO()): Promise<BalanceCard> {
  try {
    let state = await readState();
    if (state.block) {
      const routine = await getRoutine(state.block.routineId);
      if (routine) {
        const now = await setsSince(state.block, today).catch((e: unknown) => {
          console.warn('[ForgeErr] balance check: block sets not read', e);
          return null;
        });
        if (blockDue(state.block, today)) return { kind: 'due', block: state.block, now };
        return { kind: 'running', block: state.block, week: blockWeek(state.block, today), now };
      }
      // The routine was deleted: nothing to keep or go back to.
      state = { ...state, block: null };
      await writeState(state);
    }

    const first = await getDb().getFirstAsync<{ d: string | null }>("SELECT MIN(date_iso) AS d FROM workout_sessions WHERE source != 'seed'");
    const { sets, workouts } = await getBalanceSets(addDays(today, -BALANCE_WEEKS * 7), addDays(today, -1));
    if (!enoughHistory(first?.d ?? null, today, workouts)) return { kind: 'none' };
    const weekly = weeklyFromShares(sets);
    const spot = weakSpot(weekly, quietMuscles(state, today));
    if (!spot) return { kind: 'none' };
    return { kind: 'weak', spot };
  } catch (e) {
    console.warn('[ForgeErr] balance check could not be worked out', e);
    return { kind: 'none' };
  }
}

/** "Keep it": the swap stays for good. */
export async function keepBlock(): Promise<void> {
  const state = await readState();
  await writeState({ ...state, block: null });
}

/**
 * "Go back": the old exercise returns to its place. If the member has changed that row since, the
 * old exercise is added back at its old place (unless the routine already has it); their other
 * changes stay. The muscle then stays quiet for 8 weeks.
 */
export async function undoBlock(today: string = todayISO()): Promise<void> {
  const state = await readState();
  const b = state.block;
  if (!b) return;
  const routine = await getRoutine(b.routineId);
  if (routine) {
    const row = routine.exercises.find((x) => x.id === b.peId);
    if (row && row.exerciseId === b.newExerciseId) {
      await replaceRoutineExercise(row.id, b.oldExerciseId);
    } else if (!routine.exercises.some((x) => x.exerciseId === b.oldExerciseId)) {
      const peId = await addExerciseToRoutine(b.routineId, b.oldExerciseId, { targetSets: b.oldSets, repRangeMin: b.oldRepMin, repRangeMax: b.oldRepMax });
      await reorderRoutineExercises(b.routineId, restoreOrder([...routine.exercises.map((x) => x.id), peId], peId, b.oldIndex));
    }
  }
  await writeState(withSnooze({ ...state, block: null }, b.muscle, addDays(today, AFTER_BLOCK_DAYS)));
}

/** "Not now": this muscle stays quiet for 4 weeks. */
export async function snoozeMuscle(muscle: Muscle, today: string = todayISO()): Promise<void> {
  const state = await readState();
  await writeState(withSnooze(state, muscle, addDays(today, SNOOZE_DAYS)));
}
