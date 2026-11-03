import { describe, expect, it } from 'vitest';

import { IN_USE_WORDS, inUseBeatLine, machineName } from '@/tracker/lib/inUse';

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

describe('R-70: "In use" after every set (owner, 22 Oct 2026)', () => {
  it('off by default; a saved yes is kept; anything else is no', async () => {
    const { useTrackerPrefs } = await import('@/tracker/store/trackerPrefsStore');
    useTrackerPrefs.persist.setOptions({ storage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined } });
    expect(useTrackerPrefs.getInitialState().inUseAfterSet).toBe(false);
    const merge = useTrackerPrefs.persist.getOptions().merge!;
    const now = { ...useTrackerPrefs.getInitialState() };
    expect(merge({ inUseAfterSet: true }, now).inUseAfterSet).toBe(true);
    expect(merge({ inUseAfterSet: 'yes' }, now).inUseAfterSet).toBe(false);
    expect(merge({}, now).inUseAfterSet).toBe(false);
    useTrackerPrefs.getState().setInUseAfterSet(true);
    expect(useTrackerPrefs.getState().inUseAfterSet).toBe(true);
  });
  it('the screen says the member is resting, and the tick says what it does', () => {
    expect(IN_USE_WORDS.back).toBe('Resting · back in');
    expect(IN_USE_WORDS.auto).toBe('Show after every set');
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
