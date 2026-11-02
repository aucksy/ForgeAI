/**
 * Balance check and focus block (F52, R-201): reads and writes for the Charts page card. The rules
 * are `engine/balanceBlock` (pure, tested). Saved state: one `meta` row (`balance_check`, carried
 * by backups so a restored phone can still go back to the old routine).
 *
 * Routines considered for a swap: the member's own (not a plan from the gym's trainer, not a ready
 * program — their design is respected, as the muscle tips do).
 */
import { getDb, getMeta, setMeta } from '@/db';
import { enqueueWrite } from '@/db/writeQueue';
import { addDays, daysBetween, todayISO } from '@/lib/date';

import type { Muscle } from '../catalog/muscles';
import { getTrackerExercisesByIds } from '../db/exerciseInfo';
import { exerciseIdsForKeys, listFolders } from '../db/folderRepo';
import { addExerciseToRoutine, getRoutine, reorderRoutineExercises, replaceRoutineExercise } from '../db/routineRepo';
import {
  AFTER_BLOCK_DAYS,
  BALANCE_WEEKS,
  BLOCK_DAYS,
  bestFor,
  blockDue,
  blockWeek,
  enoughHistory,
  parseBalanceState,
  pickSwapOut,
  quietMuscles,
  restoreOrder,
  SNOOZE_DAYS,
  typicalSets,
  weakSpot,
  weeklyFromShares,
  withSnooze,
  type BalanceBlock,
  type BalanceState,
  type BestPick,
  type RoutineIn,
  type SwapOut,
  type WeakSpot,
} from '../engine/balanceBlock';
import { swapContextFor } from './plansService';
import { getBalanceSets } from './volumeService';

export const BALANCE_KEY = 'balance_check';

export type BalanceCard =
  | { kind: 'none' }
  | { kind: 'weak'; spot: WeakSpot; swap: SwapOut | null; best: BestPick[] }
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

/** The member's own routines with each row's muscles, for `pickSwapOut`. */
async function ownRoutines(): Promise<RoutineIn[]> {
  const folders = (await listFolders()).filter((f) => !f.settings.fromGym && !f.settings.program);
  const ids = [...new Set(folders.flatMap((f) => f.routines.flatMap((r) => r.exercises.map((x) => x.exerciseId))))];
  const infos = await getTrackerExercisesByIds(ids);
  return folders.flatMap((f) =>
    f.routines.map((r) => ({
      id: r.id,
      name: r.name,
      dayType: r.dayType,
      following: f.following,
      rows: r.exercises.map((x) => {
        const info = infos.get(x.exerciseId);
        return {
          peId: x.id,
          exerciseId: x.exerciseId,
          name: info?.name ?? x.exercise.name,
          primary: info?.muscles.primary ?? [],
          secondary: info?.muscles.secondary ?? [],
          compound: info?.isCompound ?? x.exercise.isCompound,
          catalogKey: info?.catalogKey ?? null,
        };
      }),
    })),
  );
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

    const routines = await ownRoutines();
    const swap = pickSwapOut(routines, weekly, typicalSets(weekly), spot.muscle);
    const ctx = await swapContextFor(swap?.routineId ?? null);
    const exclude = swap ? (routines.find((r) => r.id === swap.routineId)?.rows ?? []).flatMap((x) => (x.catalogKey ? [x.catalogKey] : [])) : [];
    const best = bestFor(spot.muscle, ctx.level, ctx, exclude);
    if (best.length === 0) return { kind: 'none' };
    return { kind: 'weak', spot, swap, best };
  } catch (e) {
    console.warn('[ForgeErr] balance check could not be worked out', e);
    return { kind: 'none' };
  }
}

/** "Swap for 8 weeks": the pick takes the old exercise's place (same sets and reps). */
export async function startBlock(spot: WeakSpot, swap: SwapOut, pick: BestPick, today: string = todayISO()): Promise<void> {
  const routine = await getRoutine(swap.routineId);
  const row = routine?.exercises.find((x) => x.id === swap.peId);
  if (!routine || !row || row.exerciseId !== swap.exerciseId) throw new Error('the routine changed');
  const newId = (await exerciseIdsForKeys([pick.key])).get(pick.key);
  if (!newId) throw new Error('not in the library');
  const block: BalanceBlock = {
    muscle: spot.muscle,
    routineId: routine.id,
    routineName: routine.name,
    peId: row.id,
    oldExerciseId: row.exerciseId,
    oldName: swap.name,
    oldIndex: Math.max(0, routine.exercises.findIndex((x) => x.id === row.id)),
    oldSets: row.targetSets,
    oldRepMin: row.repRangeMin,
    oldRepMax: row.repRangeMax,
    oldList: routine.exercises.map((x) => x.exerciseId),
    newExerciseId: newId,
    newName: pick.name,
    startISO: today,
    endISO: addDays(today, BLOCK_DAYS),
    before: spot.sets,
  };
  await replaceRoutineExercise(row.id, newId);
  const state = await readState();
  await writeState({ ...state, block });
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
