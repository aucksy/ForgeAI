/**
 * Member-facing single writes on the FROZEN repos, routed through the one app-wide write queue.
 *
 * Every statement shares one SQLite connection. A plain `runAsync` issued while a queued job
 * holds a transaction open (a history import still running after Back) runs INSIDE that
 * transaction — and when the import fails and rolls back, the member's delete or body weight
 * is rolled back with it, silently. Queuing makes the write wait for the import to finish.
 *
 * The repos stay untouched (they are frozen contracts, and the import calls `deleteSession`
 * inside its own queued job — a queued twin there would deadlock). Screens call these instead.
 * NEVER call one of these from inside an `enqueueWrite` job: it would wait for itself forever.
 */
import { deleteMeal as deleteMealRow, logMeal as logMealRow } from '@/db/repos/nutritionRepo';
import { logBodyWeight as logBodyWeightRow, updateProfile as updateProfileRow } from '@/db/repos/userRepo';
import { deleteSession as deleteSessionRow } from '@/db/repos/workoutRepo';
import { enqueueWrite } from '@/db/writeQueue';

export function logBodyWeight(...args: Parameters<typeof logBodyWeightRow>): ReturnType<typeof logBodyWeightRow> {
  return enqueueWrite(() => logBodyWeightRow(...args));
}

export function logMeal(...args: Parameters<typeof logMealRow>): ReturnType<typeof logMealRow> {
  return enqueueWrite(() => logMealRow(...args));
}

export function deleteMeal(...args: Parameters<typeof deleteMealRow>): ReturnType<typeof deleteMealRow> {
  return enqueueWrite(() => deleteMealRow(...args));
}

export function updateProfile(...args: Parameters<typeof updateProfileRow>): ReturnType<typeof updateProfileRow> {
  return enqueueWrite(() => updateProfileRow(...args));
}

/** A workout's delete (its records go with it; its sets cascade). */
export function deleteSession(...args: Parameters<typeof deleteSessionRow>): ReturnType<typeof deleteSessionRow> {
  return enqueueWrite(() => deleteSessionRow(...args));
}
