/**
 * R-124: the member app's side of the gym's hours (src/shop/gymTimings.ts): reading member_gym_timings'
 * answer and the kept copy, and the Gym tab row's words.
 */
import { describe, expect, it } from 'vitest';

import { HOURS_PRESETS, type GymHours } from '@forgeai/theme';

import { gymHoursFromRow, gymHoursRowWords, parseGymHoursCopy } from '@/shop/gymTimings';

const at = (s: string) => new Date(`${s.replace(' ', 'T')}:00+05:30`).getTime();
const split = (): GymHours => HOURS_PRESETS.find((p) => p.key === 'split')!.hours();

describe('the server answer', () => {
  it('a gym with hours', () => {
    const a = gymHoursFromRow({ ok: true, gymId: 'g1', gymName: 'Shakti Gym', hours: split(), updatedAt: 1 });
    expect(a?.gymName).toBe('Shakti Gym');
    expect(a?.hours?.week.sun.ranges[0]?.open).toBe('06:00');
  });
  it('a gym with no hours yet: nothing to show', () => {
    expect(gymHoursFromRow({ ok: true, gymId: 'g1', gymName: 'Shakti Gym', hours: null })?.hours).toBeNull();
  });
  it('hours the app cannot read: nothing to show, not wrong hours', () => {
    expect(gymHoursFromRow({ ok: true, gymId: 'g1', gymName: 'X', hours: { week: { mon: { kind: 'open' } } } })?.hours).toBeNull();
  });
  it('not an answer', () => {
    expect(gymHoursFromRow(null)).toBeNull();
    expect(gymHoursFromRow({ error: 'BAD_KEY' })).toBeNull();
  });
  it('the kept copy reads back', () => {
    const c = parseGymHoursCopy(JSON.stringify({ gymId: 'g1', gymName: 'Shakti Gym', hours: split(), at: 5 }));
    expect(c?.at).toBe(5);
    expect(c?.hours?.week.mon.ranges).toHaveLength(2);
    expect(parseGymHoursCopy('not json')).toBeNull();
    expect(parseGymHoursCopy(null)).toBeNull();
  });
});

describe('the Gym tab row', () => {
  it('open now, with today’s hours under it', () => {
    expect(gymHoursRowWords(split(), at('2026-10-26 18:00'))).toMatchObject({
      status: { line: 'Open now · closes 10:00 pm' },
      sub: 'Today 5:00 am to 11:00 am, 4:00 pm to 10:00 pm',
    });
  });
  it('a holiday this week shows by itself, days before', () => {
    const h = split();
    h.special = [{ date: '2026-11-08', kind: 'closed', ranges: [], note: 'Diwali' }];
    expect(gymHoursRowWords(h, at('2026-11-03 07:00')).sub).toBe('Closed Sun 8 Nov · Diwali');
    expect(gymHoursRowWords(h, at('2026-10-31 07:00')).sub).toBe('Today 5:00 am to 11:00 am, 4:00 pm to 10:00 pm');
    const onTheDay = gymHoursRowWords(h, at('2026-11-08 07:00'));
    expect(onTheDay.status.line).toBe('Closed today · opens 5:00 am tomorrow');
    expect(onTheDay.sub).toBe('Closed today · Diwali');
  });
  it('24 hours: the gym’s note, else a pointer to the week', () => {
    const h = HOURS_PRESETS.find((p) => p.key === 'allDay')!.hours();
    expect(gymHoursRowWords(h, at('2026-10-26 03:00'))).toMatchObject({ status: { line: 'Open 24 hours' }, sub: 'Tap for the week' });
    expect(gymHoursRowWords({ ...h, note: 'Desk 7 am to 10 pm' }, at('2026-10-26 03:00')).sub).toBe('Desk 7 am to 10 pm');
  });
});
