import { describe, expect, it } from 'vitest';

import { IN_USE_WORDS, machineName } from '@/tracker/lib/inUse';

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
