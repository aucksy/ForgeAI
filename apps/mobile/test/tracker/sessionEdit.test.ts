/**
 * Phase W4 — saving a correction to a logged workout.
 *
 * The dangerous parts are ORDER (the session row must be updated before PR
 * detection re-runs, or a moved workout is judged against the wrong history) and
 * PR CLEANUP (a lowered lift must not leave a record row claiming the old number).
 * Driven against a recording fake `@/db`, so these assert the statements issued and
 * their sequence, not SQLite behaviour.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  state: {
    calls: [] as { sql: string; params?: unknown[] }[],
    sessionExists: true,
    /** Exercises with working sets currently stored against the session. */
    existingExerciseIds: [] as string[],
    addSetsAt: -1,
    reconcileAt: -1,
    reconciledWith: null as string[] | null,
  },
}));

vi.mock('@/db', () => ({
  getDb: () => ({
    runAsync: async (sql: string, params?: unknown[]) => {
      h.state.calls.push({ sql, params });
    },
    getFirstAsync: async (sql: string) =>
      sql.includes('FROM workout_sessions') && h.state.sessionExists ? { id: 'sess-1' } : null,
    getAllAsync: async () => h.state.existingExerciseIds.map((id) => ({ exercise_id: id })),
    withTransactionAsync: async (fn: () => Promise<void>) => {
      h.state.calls.push({ sql: 'BEGIN' });
      await fn();
      h.state.calls.push({ sql: 'COMMIT' });
    },
  }),
}));

vi.mock('@/tracker/db/trackerSets', () => ({
  addSetsWithMeta: vi.fn(async () => {
    h.state.addSetsAt = h.state.calls.length;
    h.state.calls.push({ sql: 'addSetsWithMeta' });
    return [];
  }),
}));

vi.mock('@/tracker/services/prRebuild', () => ({
  reconcilePrsForExercises: vi.fn(async (ids: string[]) => {
    h.state.reconcileAt = h.state.calls.length;
    h.state.reconciledWith = ids;
  }),
}));

import { addSetsWithMeta } from '@/tracker/db/trackerSets';
import type { RichSet } from '@/tracker/db/trackerSets';
import { reconcilePrsForExercises } from '@/tracker/services/prRebuild';
import { SessionGoneError, saveSessionEdits } from '@/tracker/db/sessionEdit';
import type { SessionEdits } from '@/tracker/db/sessionEdit';

function row(exerciseId: string, patch: Partial<RichSet> = {}): RichSet {
  return { exerciseId, weightKg: 80, reps: 5, isWarmup: false, ...patch };
}

function edits(patch: Partial<SessionEdits> = {}): SessionEdits {
  return {
    dateISO: '2026-07-20',
    dayType: 'push',
    notes: null,
    startedAt: 1_753_000_000_000,
    endedAt: 1_753_003_600_000,
    sets: [row('ex-bench')],
    ...patch,
  };
}

function sqls(): string[] {
  return h.state.calls.map((c) => c.sql);
}

function indexOfMatch(fragment: string): number {
  return sqls().findIndex((s) => s.includes(fragment));
}

beforeEach(() => {
  h.state.calls = [];
  h.state.sessionExists = true;
  h.state.existingExerciseIds = [];
  h.state.addSetsAt = -1;
  h.state.reconcileAt = -1;
  h.state.reconciledWith = null;
  vi.mocked(addSetsWithMeta).mockClear();
  vi.mocked(reconcilePrsForExercises).mockClear();
});

describe('saveSessionEdits', () => {
  it('refuses to resurrect a workout deleted while the editor was open', async () => {
    h.state.sessionExists = false;
    await expect(saveSessionEdits('sess-1', edits())).rejects.toBeInstanceOf(SessionGoneError);
    expect(sqls()).toHaveLength(0); // nothing written at all
    expect(addSetsWithMeta).not.toHaveBeenCalled();
  });

  it('replaces the sets and the session row inside ONE transaction', async () => {
    await saveSessionEdits('sess-1', edits());
    const all = sqls();
    expect(all.filter((s) => s === 'BEGIN')).toHaveLength(1);
    const begin = all.indexOf('BEGIN');
    const commit = all.indexOf('COMMIT');
    for (const fragment of ['UPDATE workout_sessions', 'DELETE FROM set_entries', 'addSetsWithMeta']) {
      const at = indexOfMatch(fragment);
      expect(at, fragment).toBeGreaterThan(begin);
      expect(at, fragment).toBeLessThan(commit);
    }
  });

  it('updates the session BEFORE re-adding sets, so a moved date is in effect for PR detection', async () => {
    await saveSessionEdits('sess-1', edits({ dateISO: '2026-07-14', startedAt: 1_752_000_000_000 }));
    expect(indexOfMatch('UPDATE workout_sessions')).toBeLessThan(indexOfMatch('addSetsWithMeta'));
    const update = h.state.calls[indexOfMatch('UPDATE workout_sessions')];
    expect(update.params).toEqual([
      '2026-07-14',
      'push',
      null,
      1_752_000_000_000,
      1_753_003_600_000,
      'sess-1',
    ]);
  });

  it('drops the old personal-record rows — a corrected weight must not leave a stale PR', async () => {
    await saveSessionEdits('sess-1', edits());
    const at = indexOfMatch('DELETE FROM personal_records');
    expect(at).toBeGreaterThan(-1);
    expect(h.state.calls[at].params).toEqual(['sess-1']);
    // …and re-detection happens after the wipe, not before.
    expect(at).toBeLessThan(indexOfMatch('addSetsWithMeta'));
  });

  it('writes the exact new set list through the frozen path', async () => {
    const sets = [row('ex-bench'), row('ex-row', { weightKg: 70, reps: 10 })];
    await saveSessionEdits('sess-1', edits({ sets }));
    expect(addSetsWithMeta).toHaveBeenCalledWith('sess-1', sets);
  });

  it('reconciles records for exercises the edit REMOVED as well as those it kept', async () => {
    // Bench was dropped from the workout entirely; row was added.
    h.state.existingExerciseIds = ['ex-bench', 'ex-squat'];
    await saveSessionEdits('sess-1', edits({ sets: [row('ex-squat'), row('ex-row')] }));
    expect(h.state.reconciledWith?.sort()).toEqual(['ex-bench', 'ex-row', 'ex-squat']);
  });

  it('ignores warm-ups when deciding which exercises to reconcile (they never set records)', async () => {
    await saveSessionEdits('sess-1', edits({ sets: [row('ex-bench'), row('ex-curl', { isWarmup: true })] }));
    expect(h.state.reconciledWith).toEqual(['ex-bench']);
  });

  it('reconciles AFTER the transaction commits', async () => {
    await saveSessionEdits('sess-1', edits());
    // Reconciliation re-runs PR detection on OTHER sessions; keeping it outside the
    // transaction means a failure there can be retried without rolling back the edit.
    expect(h.state.reconcileAt).toBeGreaterThan(sqls().indexOf('COMMIT'));
  });

  it('persists an empty note as NULL, not an empty string', async () => {
    await saveSessionEdits('sess-1', edits({ notes: null }));
    expect(h.state.calls[indexOfMatch('UPDATE workout_sessions')].params?.[2]).toBeNull();
  });

  it('reports success when everything worked', async () => {
    await expect(saveSessionEdits('sess-1', edits())).resolves.toEqual({ reconciled: true });
  });

  it('a reconcile failure does NOT fail the save — the edit already committed', async () => {
    // Throwing here would tell the member "the workout is unchanged" over a
    // workout that IS changed, and invite them to save it a second time.
    vi.mocked(reconcilePrsForExercises).mockRejectedValueOnce(new Error('db busy'));
    await expect(saveSessionEdits('sess-1', edits())).resolves.toEqual({ reconciled: false });
    expect(sqls()).toContain('COMMIT');
  });

  it('reconciles nothing when the session held and still holds only warm-ups', async () => {
    h.state.existingExerciseIds = [];
    await saveSessionEdits('sess-1', edits({ sets: [row('ex-curl', { isWarmup: true })] }));
    expect(h.state.reconciledWith).toEqual([]);
  });

  it('still reconciles the exercises an edit emptied out entirely', async () => {
    h.state.existingExerciseIds = ['ex-bench', 'ex-row'];
    await saveSessionEdits('sess-1', edits({ sets: [row('ex-curl', { isWarmup: true })] }));
    expect(h.state.reconciledWith?.sort()).toEqual(['ex-bench', 'ex-row']);
  });

  it('does not list an exercise twice when it appears in several sets', async () => {
    h.state.existingExerciseIds = ['ex-bench'];
    await saveSessionEdits('sess-1', edits({ sets: [row('ex-bench'), row('ex-bench', { reps: 4 })] }));
    expect(h.state.reconciledWith).toEqual(['ex-bench']);
  });
});
