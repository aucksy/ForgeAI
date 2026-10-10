/**
 * Delete one saved workout and report what really happened (Phase 1 — HI-12).
 *
 * Before: one promise covered the delete AND the follow-ups (record reconcile, Health Connect,
 * widgets), so a reconcile error AFTER the delete committed showed "Delete failed" over a
 * workout that was gone. Now:
 *   - only the delete itself can fail the action — and even then, if the workout is in fact
 *     gone (the error came after the commit), it counts as deleted;
 *   - Health Connect and the widgets are told right after the delete, before the records;
 *   - a record reconcile that fails is "deleted, records catch up" (the next edit or delete
 *     reconciles them), never "failed".
 */
import { getDb } from '@/db';
// Queued (DS-04): an unqueued delete issued while an import's transaction is open joins it and
// is rolled back with it when the import fails — the workout would quietly come back.
import { deleteSession } from '@/db/queuedWrites';
import { enqueueWrite } from '@/db/writeQueue';
import { phoneAfterDelete } from '@/tracker/phone/phoneSync';

import { reconcilePrsForExercises } from './prRebuild';

export interface DeleteDeps {
  exerciseIds: (sessionId: string) => Promise<string[]>;
  deleteSession: (sessionId: string) => Promise<void>;
  stillThere: (sessionId: string) => Promise<boolean>;
  afterDelete: (sessionId: string) => Promise<void>;
  reconcile: (exerciseIds: string[]) => Promise<void>;
}

export type DeleteOutcome = { deleted: true; recordsCatchUp: boolean } | { deleted: false };

const realDeps: DeleteDeps = {
  exerciseIds: async (sessionId) =>
    (
      await getDb().getAllAsync<{ exercise_id: string }>(
        'SELECT DISTINCT exercise_id FROM set_entries WHERE session_id = ? AND is_warmup = 0',
        [sessionId],
      )
    ).map((r) => r.exercise_id),
  deleteSession: async (sessionId) => {
    await deleteSession(sessionId);
  },
  stillThere: async (sessionId) =>
    (await getDb().getFirstAsync<{ id: string }>('SELECT id FROM workout_sessions WHERE id = ?', [sessionId])) != null,
  afterDelete: phoneAfterDelete,
  // Record rows are writes too: queued for the same reason as the delete.
  reconcile: (exerciseIds) => enqueueWrite(() => reconcilePrsForExercises(exerciseIds)),
};

export async function deleteWorkout(sessionId: string, deps: DeleteDeps = realDeps): Promise<DeleteOutcome> {
  const exerciseIds = await deps.exerciseIds(sessionId).catch(() => [] as string[]);
  try {
    await deps.deleteSession(sessionId);
  } catch {
    // Did the delete land anyway? Only a workout still there is a failed delete.
    const there = await deps.stillThere(sessionId).catch(() => true);
    if (there) return { deleted: false };
  }
  void deps.afterDelete(sessionId).catch(() => undefined);
  try {
    await deps.reconcile(exerciseIds);
    return { deleted: true, recordsCatchUp: false };
  } catch {
    return { deleted: true, recordsCatchUp: true };
  }
}
