import { describe, expect, it } from 'vitest';

import { IN_USE_WORDS, cleanInUseChoices, inUseAutoOn, inUseBeatLine, inUseDefault, inUseHasOpenWorkingSet, machineName } from '@/tracker/lib/inUse';

describe('Machine in use (backlog, 21 Oct)', () => {
  it('names the machine, not the set', () => {
    expect(machineName('Bench Press, set 3')).toBe('Bench Press');
    expect(machineName('Leg Press')).toBe('Leg Press');
    expect(machineName(null)).toBeNull();
    expect(machineName('  ')).toBeNull();
  });
  it('member words never say volume, PR or session', () => {
    for (const w of Object.values(IN_USE_WORDS)) expect(w).not.toMatch(/\b(volume|PR|session)\b/i);
  });
});

describe('R-70 / R-304: "In use" after every set (owner, 22 Oct and 3 Nov 2026)', () => {
  it('the master switch is on by default; a saved choice is kept; anything else is the default', async () => {
    const { useTrackerPrefs } = await import('@/tracker/store/trackerPrefsStore');
    useTrackerPrefs.persist.setOptions({ storage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined } });
    expect(useTrackerPrefs.getInitialState().inUseAfterSet).toBe(true);
    expect(useTrackerPrefs.getInitialState().inUseByExercise).toEqual({});
    const merge = useTrackerPrefs.persist.getOptions().merge!;
    const now = { ...useTrackerPrefs.getInitialState() };
    expect(merge({ inUseAfterSet: false }, now).inUseAfterSet).toBe(false);
    expect(merge({ inUseAfterSet: 'yes' }, now).inUseAfterSet).toBe(true);
    expect(merge({}, now).inUseAfterSet).toBe(true);
    expect(merge({ inUseByExercise: { a: true, b: false, c: 'yes', '': true } }, now).inUseByExercise).toEqual({ a: true, b: false });
    expect(merge({ inUseByExercise: [true] }, now).inUseByExercise).toEqual({});
    useTrackerPrefs.getState().setInUseAfterSet(false);
    expect(useTrackerPrefs.getState().inUseAfterSet).toBe(false);
  });
  it('a choice for one exercise is remembered for that exercise only', async () => {
    const { useTrackerPrefs } = await import('@/tracker/store/trackerPrefsStore');
    useTrackerPrefs.getState().setInUseFor('ex-1', false);
    useTrackerPrefs.getState().setInUseFor('ex-2', true);
    useTrackerPrefs.getState().setInUseFor('ex-1', true);
    useTrackerPrefs.getState().setInUseFor('', true);
    expect(useTrackerPrefs.getState().inUseByExercise).toEqual({ 'ex-1': true, 'ex-2': true });
  });
  it('the screen says the member is resting, and the tick says what it does', () => {
    expect(IN_USE_WORDS.back).toBe('Resting · back in');
    expect(IN_USE_WORDS.auto).toBe('Show after every set of this exercise');
    expect(IN_USE_WORDS.tapHint).toBe('Tap: In use');
  });
});

describe('R-304 / R-307: In use by equipment', () => {
  const on = (name: string, equipment: string, key?: string) => inUseDefault({ name, equipment, key });
  it('machines, cables and barbells are on', () => {
    expect(on('Pec Deck Fly', 'machine', 'pec_deck_fly')).toBe(true);
    expect(on('Leg Press', 'machine')).toBe(true);
    expect(on('Cable Fly', 'cable', 'cable_fly')).toBe(true);
    expect(on('Barbell Squat', 'barbell', 'barbell_squat')).toBe(true);
  });
  it('a dumbbell move on a bench is on; other dumbbell moves are off', () => {
    expect(on('Incline Dumbbell Press', 'dumbbell', 'incline_dumbbell_press')).toBe(true);
    expect(on('Dumbbell Bench Press', 'dumbbell')).toBe(true);
    expect(on('Seated Dumbbell Shoulder Press', 'dumbbell')).toBe(true);
    expect(on('Chest-Supported Dumbbell Row', 'dumbbell')).toBe(true);
    expect(on('Chest Supported Row', 'dumbbell')).toBe(true);
    expect(on('Dumbbell Preacher Curl', 'dumbbell')).toBe(true);
    expect(on('Row', 'dumbbell', 'decline_db_row')).toBe(true);
    expect(on('Lateral Raise', 'dumbbell', 'lateral_raise')).toBe(false);
    expect(on('Dumbbell Curl', 'dumbbell')).toBe(false);
  });
  it('bodyweight and other are off unless the name says bench, rack or station', () => {
    expect(on('Push-Up', 'bodyweight', 'push_up')).toBe(false);
    expect(on('Decline Sit-Up', 'bodyweight')).toBe(false);
    expect(on('Kettlebell Swing', 'other')).toBe(false);
    expect(on('Band Pull-Apart', 'other')).toBe(false);
    expect(on('Bench Dip', 'bodyweight')).toBe(true);
    expect(on('Dip Station Leg Raise', 'bodyweight')).toBe(true);
    expect(on('Rack Pull', 'other')).toBe(true);
    // "Stationary" is not "station".
    expect(on('Stationary Lunge', 'bodyweight')).toBe(false);
    expect(on('Mystery Move', 'unknown')).toBe(false);
  });
  it("the master switch off means never; the member's own choice beats the default", () => {
    const press = { name: 'Incline Dumbbell Press', equipment: 'dumbbell' };
    const raise = { name: 'Lateral Raise', equipment: 'dumbbell' };
    expect(inUseAutoOn(true, undefined, press)).toBe(true);
    expect(inUseAutoOn(true, undefined, raise)).toBe(false);
    expect(inUseAutoOn(true, false, press)).toBe(false);
    expect(inUseAutoOn(true, true, raise)).toBe(true);
    expect(inUseAutoOn(false, true, raise)).toBe(false);
    expect(inUseAutoOn(false, undefined, press)).toBe(false);
    expect(inUseAutoOn(true, true, null)).toBe(false);
  });
  it('cleans a saved choice map', () => {
    expect(cleanInUseChoices({ a: true, b: 0 })).toEqual({ a: true });
    expect(cleanInUseChoices(null)).toEqual({});
    expect(cleanInUseChoices('x')).toEqual({});
  });
});

describe('R-305 inUseBeatLine', () => {
  it('says how much more beats the previous total', () => {
    expect(inUseBeatLine({ left: 300, reps: false, unit: 'kg', each: false })).toBe('300 kg more to beat the previous total');
    expect(inUseBeatLine({ left: 1234.4, reps: false, unit: 'kg', each: false })).toMatch(/^1.?234 kg more to beat the previous total$/);
    expect(inUseBeatLine({ left: 80, reps: false, unit: 'kg', each: true })).toBe('80 kg more per hand to beat the previous total');
    expect(inUseBeatLine({ left: 1, reps: true, unit: 'kg', each: false })).toBe('1 more rep to beat the previous total');
    expect(inUseBeatLine({ left: 6, reps: true, unit: 'kg', each: false })).toBe('6 more reps to beat the previous total');
  });
  it('says beaten at zero, nothing without a total', () => {
    expect(inUseBeatLine({ left: 0, reps: false, unit: 'kg', each: false })).toBe('Previous total beaten ✓');
    expect(inUseBeatLine({ left: 0.3, reps: false, unit: 'lb', each: false })).toBe('1 lb more to beat the previous total');
    expect(inUseBeatLine({ left: -20, reps: false, unit: 'kg', each: false })).toBe('Previous total beaten ✓');
    expect(inUseBeatLine(null)).toBeNull();
  });
});

describe('owner decision (3 Nov 2026): no In use by itself after the last set of an exercise', () => {
  const set = (done: boolean, extra: { isWarmup?: boolean; setType?: 'normal' | 'drop' | 'failure' } = {}) => ({ done, isWarmup: extra.isWarmup ?? false, setType: extra.setType });
  it('a working set still open: it opens', () => {
    expect(inUseHasOpenWorkingSet([set(true), set(false)])).toBe(true);
    expect(inUseHasOpenWorkingSet([set(true), set(false, { setType: 'failure' })])).toBe(true);
  });
  it('the last working set ticked: it stays closed (open warm-ups and drop sets do not count)', () => {
    expect(inUseHasOpenWorkingSet([set(true), set(true)])).toBe(false);
    expect(inUseHasOpenWorkingSet([set(false, { isWarmup: true }), set(true), set(true)])).toBe(false);
    expect(inUseHasOpenWorkingSet([set(true), set(true), set(false, { setType: 'drop' })])).toBe(false);
    expect(inUseHasOpenWorkingSet([])).toBe(false);
    expect(inUseHasOpenWorkingSet(undefined)).toBe(false);
  });
});
