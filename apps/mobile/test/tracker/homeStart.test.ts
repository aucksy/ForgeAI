/**
 * Audit Phase 7 review — Home's Start (and the Today page's) never opens an edit silently.
 *
 * Before: with a past workout's edit open, Home's card said "Next: Pull 1 · Start" and Start
 * opened the editor without a word. Now Start asks the same question as every other Start
 * ("Resume editing" / "Discard changes and start new"); a live workout still simply resumes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  confirmAnswer: false as boolean,
  asked: [] as { title: string; confirmLabel: string; cancelLabel?: string }[],
}));

vi.mock('@/db', () => ({
  getDb: () => ({
    runAsync: async () => undefined,
    getFirstAsync: async () => null,
    getAllAsync: async () => [],
    withTransactionAsync: async (fn: () => Promise<void>) => fn(),
  }),
  getMeta: async () => null,
  setMeta: async () => undefined,
}));
vi.mock('@/tracker/db/exerciseHistory', () => ({ getBoundedExerciseHistory: async () => [] }));
vi.mock('@/tracker/db/exercisePrefs', () => ({
  getCarriedNote: async () => null,
  getExerciseRestSec: async () => null,
  getPriorBests: async () => null,
  setExerciseRestSec: async () => undefined,
}));
vi.mock('@/tracker/db/exerciseInfo', () => ({
  getTrackerExercise: async () => null,
  getTrackerExercisesByIds: async () => new Map(),
  setExerciseLoadMode: async () => undefined,
}));
vi.mock('@/components/ui/confirmStore', () => ({
  askConfirm: async (o: { title: string; confirmLabel: string; cancelLabel?: string }) => {
    h.asked.push(o);
    return h.confirmAnswer;
  },
}));

const { useActiveWorkout } = await import('@/tracker/store/activeWorkoutStore');
const { startMode, startShownWorkout } = await import('@/tracker/services/todayStart');
const { openWorkout } = await import('@/tracker/lib/homeAnswer');
type DraftExercise = import('@/tracker/store/activeWorkoutStore').DraftExercise;

const card = (key: string): DraftExercise =>
  ({
    key,
    exerciseId: `id-${key}`,
    name: key,
    muscleGroup: 'chest',
    equipment: 'barbell',
    previousSets: [],
    sets: [{ key: `${key}-1`, weightKg: 60, reps: 8, isWarmup: false, done: true }],
  }) as unknown as DraftExercise;

const open = (extra: Record<string, unknown>) =>
  useActiveWorkout.setState({
    active: true,
    hydrated: true,
    committing: false,
    editingSessionId: null,
    pastLog: false,
    startedAt: Date.parse('2026-10-10T07:00:00'),
    dayType: 'push',
    planDayId: 'day-1',
    easyWeek: false,
    lastDeleted: null,
    exercises: [card('bench')],
    ...extra,
  });

const nav = { push: () => undefined, replace: () => undefined };

beforeEach(() => {
  h.confirmAnswer = false;
  h.asked = [];
});

describe('startMode — what a Start does with the workout already open (PURE)', () => {
  it('nothing open → start; a live workout → resume; an edit or a past log → ask', () => {
    expect(startMode({ active: false, editingSessionId: null, pastLog: false })).toBe('start');
    expect(startMode({ active: true, editingSessionId: null, pastLog: false })).toBe('resume');
    expect(startMode({ active: true, editingSessionId: 's1', pastLog: false })).toBe('ask');
    expect(startMode({ active: true, editingSessionId: null, pastLog: true })).toBe('ask');
  });

  it('Home and the Today page agree: "resume" exactly when Home counts the workout as open', () => {
    const cases = [
      { active: false, editingSessionId: null, pastLog: false },
      { active: true, editingSessionId: null, pastLog: false },
      { active: true, editingSessionId: 's1', pastLog: false },
      { active: true, editingSessionId: null, pastLog: true },
    ];
    for (const c of cases) {
      const homeOpen = openWorkout({ ...c, exercises: [] }) != null;
      expect(startMode(c) === 'resume').toBe(homeOpen);
    }
  });
});

describe('startShownWorkout — Home’s Start with an edit left open', () => {
  it('asks "Resume editing" / "Discard changes and start new"; Resume opens the edit untouched', async () => {
    open({ editingSessionId: 'past-1' });
    let shown = 0;
    await startShownWorkout(nav, null, () => void shown++);
    expect(h.asked).toHaveLength(1);
    expect(h.asked[0].cancelLabel).toBe('Resume editing');
    expect(h.asked[0].confirmLabel).toBe('Discard changes and start new');
    expect(useActiveWorkout.getState().editingSessionId).toBe('past-1');
    expect(shown).toBe(1);
  });

  it('Discard changes starts the new workout', async () => {
    open({ editingSessionId: 'past-1' });
    h.confirmAnswer = true;
    let shown = 0;
    await startShownWorkout(nav, null, () => void shown++);
    const s = useActiveWorkout.getState();
    expect(s.active).toBe(true);
    expect(s.editingSessionId).toBeNull();
    expect(s.exercises).toHaveLength(0);
    expect(shown).toBe(1);
  });

  it('a live workout resumes without a question (Home shows "Continue" for it anyway)', async () => {
    open({});
    let shown = 0;
    await startShownWorkout(nav, null, () => void shown++);
    expect(h.asked).toHaveLength(0);
    expect(useActiveWorkout.getState().exercises).toHaveLength(1);
    expect(shown).toBe(1);
  });
});
