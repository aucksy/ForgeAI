/**
 * "Previous values" (13 Oct 2026) — the scope rule, PURE (tracker/db/historyScope.ts):
 *  - a workout of one of the scope's routines is in;
 *  - a workout with no known routine (NULL) or a routine that is gone is in by its name (title,
 *    else the first line of its notes), case and spaces ignored — the rule "Today" uses;
 *  - an empty workout ('') is never in; another folder's routine is out even with a matching name;
 *  - the setting is kept, and a stored value this version does not know falls back to "Any workout".
 */
import { describe, expect, it } from 'vitest';

import { historyScopeSql, inHistoryScope, PREVIOUS_FROM_CHOICES, scopeKey, type HistoryScope } from '@/tracker/db/historyScope';
import { nameKey, workoutNameKey } from '@/tracker/plans/todayPlan';
import { historyRoutineOf } from '@/tracker/store/activeWorkoutStore';
import { isPreviousFrom, useTrackerPrefs } from '@/tracker/store/trackerPrefsStore';

// The setting is persisted; here it is kept in memory (the phone's storage is not in a unit test).
useTrackerPrefs.persist.setOptions({ storage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined } });

/** Folder A's routines: Push 1A and Push 1B. */
const FOLDER_A: HistoryScope = { routineIds: ['a1', 'a2'], names: ['push 1a', 'push 1b'] };

describe('the scope rule', () => {
  it('no scope = every workout (Any workout, an empty workout)', () => {
    expect(inHistoryScope(null, { routineId: '', title: null })).toBe(true);
    expect(inHistoryScope(null, { routineId: 'b1', title: 'Gym B' })).toBe(true);
    expect(historyScopeSql('ws', null)).toEqual({ sql: '', params: [] });
    expect(scopeKey(null)).toBe('');
  });

  it('a workout of one of its routines is in; another folder’s routine is out, whatever its name', () => {
    expect(inHistoryScope(FOLDER_A, { routineId: 'a1', title: null })).toBe(true);
    expect(inHistoryScope(FOLDER_A, { routineId: 'a2', title: 'Anything' })).toBe(true);
    expect(inHistoryScope(FOLDER_A, { routineId: 'b1', title: 'Push 1A' })).toBe(false);
  });

  it('an empty workout is never in a routine or folder scope, even with a matching name', () => {
    expect(inHistoryScope(FOLDER_A, { routineId: '', title: 'Push 1A' })).toBe(false);
  });

  it('no known routine (older / imported) or a routine that is gone: by its name, case and spaces ignored', () => {
    expect(inHistoryScope(FOLDER_A, { routineId: null, title: '  PUSH   1a ' })).toBe(true);
    expect(inHistoryScope(FOLDER_A, { routineId: 'old-id', routineGone: true, title: 'Push\t1B' })).toBe(true);
    expect(inHistoryScope(FOLDER_A, { routineId: null, title: 'Push 2' })).toBe(false);
    expect(inHistoryScope(FOLDER_A, { routineId: null, title: null })).toBe(false);
    // An old import with no title: the first line of its notes.
    expect(inHistoryScope(FOLDER_A, { routineId: null, title: null, notes: 'Push 1A\nfelt strong' })).toBe(true);
    expect(inHistoryScope(FOLDER_A, { routineId: null, title: '', notes: 'Legs\nPush 1A' })).toBe(false);
  });

  it('uses the same name normalisation as "Today"', () => {
    expect(workoutNameKey('  Push \n 1A ', 'ignored')).toBe('push 1a');
    expect(workoutNameKey(null, ' Hevy  Title \nmore')).toBe('hevy title');
    expect(nameKey('Push  1A')).toBe('push 1a');
  });

  it('the SQL condition carries ids then names, and a scope key is order-free', () => {
    const q = historyScopeSql('w2', FOLDER_A);
    expect(q.params).toEqual(['a1', 'a2', 'push 1a', 'push 1b']);
    expect(q.sql).toMatch(/^AND \(w2\.routine_id IN \(\?, \?\) OR /);
    expect(q.sql).toContain("w2.routine_id <> ''");
    expect(scopeKey(FOLDER_A)).toBe(scopeKey({ routineIds: ['a2', 'a1'], names: ['push 1b', 'push 1a'] }));
    expect(scopeKey(FOLDER_A)).not.toBe(scopeKey({ routineIds: ['a1'], names: ['push 1a'] }));
  });
});

describe('the workout’s routine and the setting', () => {
  it('started from a routine: that one; else the routine it counts as; an empty workout: none', () => {
    expect(historyRoutineOf({ planDayId: 'a1', routineId: '' })).toBe('a1');
    expect(historyRoutineOf({ planDayId: null, routineId: 'a2' })).toBe('a2');
    expect(historyRoutineOf({ planDayId: null, routineId: '' })).toBeNull();
    expect(historyRoutineOf({ planDayId: null, routineId: null })).toBeNull();
  });

  it('Any workout by default; only the three choices are kept', () => {
    expect(useTrackerPrefs.getState().previousFrom).toBe('any');
    useTrackerPrefs.getState().setPreviousFrom('folder');
    expect(useTrackerPrefs.getState().previousFrom).toBe('folder');
    useTrackerPrefs.getState().setPreviousFrom('gym' as never);
    expect(useTrackerPrefs.getState().previousFrom).toBe('any');
    expect(['any', 'routine', 'folder'].every(isPreviousFrom)).toBe(true);
    expect(isPreviousFrom('same')).toBe(false);
  });

  it('a saved blob from before keeps Any workout; an unknown saved value falls back to it', () => {
    const merge = useTrackerPrefs.persist.getOptions().merge!;
    const now = { ...useTrackerPrefs.getInitialState() };
    expect(merge({ sounds: false }, now).previousFrom).toBe('any');
    expect(merge({ previousFrom: 'routine' }, now).previousFrom).toBe('routine');
    expect(merge({ previousFrom: 'gym' }, now).previousFrom).toBe('any');
  });

  it('two choices, each with one plain line (R-61: "Same folder" is retired)', () => {
    expect(PREVIOUS_FROM_CHOICES.map((c) => c.label)).toEqual(['Any workout', 'Same routine']);
    for (const c of PREVIOUS_FROM_CHOICES) expect(c.line).toMatch(/^Previous, Target and notes come from the last time you did/);
    // C3-3 + R-61: heavy and light days of one folder keep their own Target.
    expect(PREVIOUS_FROM_CHOICES[0].line).toContain('in any folder');
    expect(PREVIOUS_FROM_CHOICES[0].line).toContain('Heavy and light days in one folder keep their own Target.');
  });
});
