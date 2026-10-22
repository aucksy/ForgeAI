/**
 * R-58: the Up next tip's rules — the routine day that is a group's home, one new group a week,
 * "Not now" (4 weeks, twice = quiet) and "I skip this on purpose".
 */
import { describe, expect, it } from 'vitest';

import { DEFAULT_PICKS, fitsDay, groupForDay, musclesOfGroup } from '@/tracker/services/muscleTips';
import { muscleTipsLoaded, putAwayGroups, quietGroups, useMuscleTips } from '@/tracker/store/muscleTipsStore';
import { CATALOG } from '@/tracker/catalog/exerciseCatalog';
import { BALANCE_ORDER } from '@/tracker/engine/muscleBalance';

useMuscleTips.persist.setOptions({ storage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined } });

const TODAY = '2026-10-22';

describe('R-58: where and when the tip shows', () => {
  it('a group shows only on its home day', () => {
    expect(fitsDay('hamstrings', 'legs')).toBe(true);
    expect(fitsDay('hamstrings', 'push')).toBe(false);
    expect(fitsDay('rear_shoulders', 'pull')).toBe(true);
    expect(fitsDay('side_shoulders', 'upper')).toBe(true);
    expect(fitsDay('calves', 'push')).toBe(true);
    expect(fitsDay('legs', 'full')).toBe(true);
    expect(fitsDay('core', 'rest')).toBe(false);
  });

  it('one group at a time: the shown one stays; a new one only after a week', () => {
    expect(groupForDay(['hamstrings', 'calves'], 'legs', null, TODAY)).toBe('hamstrings');
    // Calves were shown 3 days ago and are still missing: they stay, even on a legs day.
    expect(groupForDay(['hamstrings', 'calves'], 'legs', { group: 'calves', sinceISO: '2026-10-19' }, TODAY)).toBe('calves');
    // The shown group does not fit today's day: nothing new until a week has passed.
    expect(groupForDay(['hamstrings', 'rear_shoulders'], 'legs', { group: 'rear_shoulders', sinceISO: '2026-10-19' }, TODAY)).toBeNull();
    expect(groupForDay(['hamstrings', 'rear_shoulders'], 'legs', { group: 'rear_shoulders', sinceISO: '2026-10-14' }, TODAY)).toBe('hamstrings');
    // The shown group is no longer missing: the next one may show.
    expect(groupForDay(['hamstrings'], 'legs', { group: 'calves', sinceISO: '2026-10-21' }, TODAY)).toBe('hamstrings');
    expect(groupForDay([], 'legs', null, TODAY)).toBeNull();
  });

  it('"Not now" waits 4 weeks; a second one means quiet; "skip on purpose" is quiet until turned back on', () => {
    const s = useMuscleTips.getState();
    s.snooze('calves', TODAY);
    expect(quietGroups(useMuscleTips.getState(), TODAY).has('calves')).toBe(true);
    expect(quietGroups(useMuscleTips.getState(), '2026-11-19').has('calves')).toBe(false);
    useMuscleTips.getState().snooze('calves', '2026-11-19');
    expect(useMuscleTips.getState().muted).toContain('calves');
    useMuscleTips.getState().mute('legs');
    expect(quietGroups(useMuscleTips.getState(), '2027-06-01').has('legs')).toBe(true);
    useMuscleTips.getState().unmute('legs');
    expect(quietGroups(useMuscleTips.getState(), '2027-06-01').has('legs')).toBe(false);
  });

  it('every default pick is in the library and works the group as its main muscle', () => {
    for (const [group, keys] of Object.entries(DEFAULT_PICKS)) {
      const want = new Set(musclesOfGroup(group as keyof typeof DEFAULT_PICKS));
      const entry = CATALOG.find((e) => e.key === keys[0]);
      expect(entry, `${group}: ${keys[0]}`).toBeDefined();
      expect(entry!.primary.some((m) => want.has(m)), `${group}: ${keys[0]} main muscle`).toBe(true);
    }
  });
});

describe('R-58 review fixes', () => {
  it('"Not now" keeps the once-a-week clock: the next group never shows the same day', () => {
    useMuscleTips.setState({ muted: [], snoozedUntil: {}, notNow: {}, shown: null });
    useMuscleTips.getState().markShown('back', TODAY);
    useMuscleTips.getState().snooze('back', TODAY);
    const st = useMuscleTips.getState();
    expect(st.shown).toEqual({ group: 'back', sinceISO: TODAY });
    const quiet = quietGroups(st, TODAY);
    // Back is put away, core is still missing: nothing more this week, core a week later.
    expect(groupForDay(['core'], 'full', st.shown, TODAY, quiet)).toBeNull();
    expect(groupForDay(['core'], 'full', st.shown, '2026-10-29', quietGroups(st, '2026-10-29'))).toBe('core');
  });

  it('Settings lists the put-away groups and brings them all back', () => {
    useMuscleTips.setState({ muted: ['calves'], snoozedUntil: { back: '2026-11-19', core: '2026-10-01' }, notNow: { back: 1 } });
    expect(putAwayGroups(useMuscleTips.getState(), TODAY)).toEqual(BALANCE_ORDER.filter((g) => g === 'back' || g === 'calves'));
    useMuscleTips.getState().unmuteAll();
    expect(putAwayGroups(useMuscleTips.getState(), TODAY)).toEqual([]);
    expect(useMuscleTips.getState().notNow).toEqual({});
  });

  it('waiting for the saved choices never hangs', async () => {
    await expect(muscleTipsLoaded(50)).resolves.toBeUndefined();
  });
});

