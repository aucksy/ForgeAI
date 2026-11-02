import { describe, expect, it } from 'vitest';

import { BUSY_UNITS_MAX, READY_EXERCISE_NAMES, READY_MACHINES, machineCounts, readyMachine, type GymHours } from '@forgeai/theme';
import { CATALOG } from '@/tracker/catalog/catalogData';
import {
  MACHINE_PUSH_EVERY_MS,
  MACHINE_READ_EVERY_MS,
  PUSH_MAX,
  TIP_SOURCE,
  dayOf,
  findTip,
  hiddenFrom,
  machineBusyFromRow,
  machinePushDue,
  machineReadDue,
  openAtHour,
  pushPayload,
  tipBody,
  tipTitle,
  withSnoozed,
  type BusyMachine,
  type WorkoutStart,
} from '@/shop/machineBusy';

const quietWeek = () => ({ mon: Array(24).fill(0), tue: Array(24).fill(0), wed: Array(24).fill(0), thu: Array(24).fill(0), fri: Array(24).fill(0), sat: Array(24).fill(0), sun: Array(24).fill(0) });

function legPress(level: (day: string, hour: number) => number): BusyMachine {
  const week = quietWeek();
  for (const d of Object.keys(week) as (keyof typeof week)[]) for (let h = 0; h < 24; h++) week[d][h] = level(d, h);
  return { id: 'leg_press', name: 'Leg press', ex: ['leg_press'], week };
}

// 2026-11-02 is a Monday.
const MONDAYS = ['2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02'];
const legDay = (dateISO: string, hour = 19, routineId: string | null = 'r-legs'): WorkoutStart => ({ dateISO, hour, routineId, name: 'Leg day', keys: ['leg_press', 'barbell_back_squat'] });

describe('the ready list of machines (shared with the admin app and the server)', () => {
  const byKey = new Map(CATALOG.map((e) => [e.key, e]));

  it('every exercise key is in the member app library, with the same name', () => {
    for (const m of READY_MACHINES) {
      for (const k of m.ex) {
        expect(byKey.get(k)?.name, `${m.id}: ${k}`).toBeDefined();
        expect(READY_EXERCISE_NAMES[k], k).toBe(byKey.get(k)!.name);
      }
    }
    expect(Object.keys(READY_EXERCISE_NAMES).sort()).toEqual(READY_MACHINES.flatMap((m) => m.ex).sort());
  });

  it('ids and keys are unique and in the server format; each key sits on one machine', () => {
    const ids = READY_MACHINES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    const keys = READY_MACHINES.flatMap((m) => m.ex);
    expect(new Set(keys).size).toBe(keys.length);
    for (const m of READY_MACHINES) {
      expect(m.id).toMatch(/^[a-z0-9_]{1,40}$/);
      expect(m.name.length).toBeLessThanOrEqual(40);
      expect(m.ex.length).toBeGreaterThan(0);
      expect(m.ex.length).toBeLessThanOrEqual(40);
      for (const k of m.ex) expect(k).toMatch(/^[a-z0-9_]{1,60}$/);
    }
    expect(READY_MACHINES.length).toBeGreaterThanOrEqual(40);
  });

  it('has the common machines the owner named, and only 1-2 units with exercises count', () => {
    for (const id of ['squat_rack', 'leg_press', 'flat_bench_press', 'cable_station', 'smith_machine', 'hack_squat', 'chest_supported_row', 'lat_pulldown']) {
      expect(readyMachine(id), id).not.toBeNull();
    }
    expect(BUSY_UNITS_MAX).toBe(2);
    expect(machineCounts({ units: 1, ex: ['leg_press'] })).toBe(true);
    expect(machineCounts({ units: 2, ex: ['leg_press'] })).toBe(true);
    expect(machineCounts({ units: 3, ex: ['leg_press'] })).toBe(false);
    expect(machineCounts({ units: 1, ex: [] })).toBe(false);
  });
});

describe('machineBusyFromRow', () => {
  it('off: nothing to send or show', () => {
    expect(machineBusyFromRow({ ok: true, on: false, keys: ['leg_press'], machines: [] })).toEqual({ on: false, keys: [], machines: [] });
  });

  it('on: keeps good keys and whole machines only', () => {
    const good = { id: 'leg_press', name: ' Leg press ', units: 1, ex: ['leg_press', 'Bad Key'], week: quietWeek() };
    const short = { ...good, id: 'x', week: { ...quietWeek(), mon: [0, 1] } };
    const badLevel = { ...good, id: 'y', week: { ...quietWeek(), tue: Array(24).fill(3) } };
    const a = machineBusyFromRow([{ ok: true, on: true, keys: ['leg_press', 'DROP me', 7], machines: [good, short, badLevel, null] }]);
    expect(a?.keys).toEqual(['leg_press']);
    expect(a?.machines.map((m) => [m.id, m.name, m.ex])).toEqual([['leg_press', 'Leg press', ['leg_press']]]);
  });

  it('not an answer: null', () => {
    expect(machineBusyFromRow(null)).toBeNull();
    expect(machineBusyFromRow({ ok: false })).toBeNull();
    expect(machineBusyFromRow({ ok: true })).toBeNull();
  });
});

describe('pushPayload: only what the gym needs', () => {
  const today = '2026-11-02';

  it('keeps only the gym keys, the last 35 days, day and hour; drops workouts with none', () => {
    const out = pushPayload(
      [
        { dateISO: '2026-11-02', hour: 19, routineId: 'r', name: 'Secret name', keys: ['leg_press', 'pec_deck_fly', 'leg_press'] },
        { dateISO: '2026-11-01', hour: 7, routineId: null, name: 'x', keys: ['pec_deck_fly'] },
        { dateISO: '2026-09-27', hour: 7, routineId: null, name: 'x', keys: ['leg_press'] },
        { dateISO: '2026-09-28', hour: 6, routineId: null, name: 'x', keys: ['leg_press'] },
        { dateISO: '2026-11-03', hour: 6, routineId: null, name: 'x', keys: ['leg_press'] },
      ],
      ['leg_press'],
      today,
    );
    expect(out).toEqual([
      { d: '2026-09-28', h: 6, x: ['leg_press'] },
      { d: '2026-11-02', h: 19, x: ['leg_press'] },
    ]);
    expect(JSON.stringify(out)).not.toContain('Secret');
  });

  it('sends the newest 80 at most', () => {
    const many = Array.from({ length: 100 }, (_, i) => ({ dateISO: '2026-11-01', hour: i % 24, routineId: null, name: '', keys: ['leg_press'] }));
    expect(pushPayload(many, ['leg_press'], today)).toHaveLength(PUSH_MAX);
  });
});

describe('findTip', () => {
  const today = '2026-11-02';
  const busyMonday7pm = legPress((d, h) => (d === 'mon' && h === 19 ? 2 : 0));

  it('a routine usually done when its machine is busy, with a quiet day next to it', () => {
    const tip = findTip(MONDAYS.map((d) => legDay(d)), [busyMonday7pm], today);
    expect(tip).toEqual({ id: 'r-legs|mon|19|tue', routine: 'Leg day', machine: 'Leg press', usualDay: 'mon', hour: 19, quietDay: 'tue' });
    expect(tipTitle(tip!)).toBe('Leg day is quieter on Tuesday');
    expect(tipBody(tip!)).toBe('You usually do it on Monday at 7 pm, when the Leg press is usually busy. On Tuesday at 7 pm it is usually quiet.');
    expect(`${tipTitle(tip!)} ${tipBody(tip!)} ${TIP_SOURCE}`).not.toMatch(/\b(volume|PR|session)\b/i);
  });

  it('skips a quieter day that is not quiet, or closed, and tries the next nearest', () => {
    const m = legPress((d, h) => (h !== 19 ? 0 : d === 'mon' ? 2 : d === 'tue' ? 1 : 0));
    expect(findTip(MONDAYS.map((d) => legDay(d)), [m], today)?.quietDay).toBe('sun');
    expect(findTip(MONDAYS.map((d) => legDay(d)), [m], today, (d) => d !== 'sun')?.quietDay).toBe('wed');
  });

  it('nothing when the usual hour is not busy, the machine is not used, or the habit is not clear', () => {
    expect(findTip(MONDAYS.map((d) => legDay(d, 7)), [busyMonday7pm], today)).toBeNull();
    expect(findTip(MONDAYS.map((d) => ({ ...legDay(d), keys: ['pec_deck_fly'] })), [busyMonday7pm], today)).toBeNull();
    // Two workouts only.
    expect(findTip(MONDAYS.slice(2).map((d) => legDay(d)), [busyMonday7pm], today)).toBeNull();
    // Spread over the week: no usual day.
    expect(findTip(['2026-10-27', '2026-10-28', '2026-10-30', '2026-11-02'].map((d) => legDay(d)), [busyMonday7pm], today)).toBeNull();
    // Not started from a routine.
    expect(findTip(MONDAYS.map((d) => legDay(d, 19, null)), [busyMonday7pm], today)).toBeNull();
    // Older than 6 weeks.
    expect(findTip(['2026-09-07', '2026-09-14', '2026-09-21'].map((d) => legDay(d)), [busyMonday7pm], today)).toBeNull();
    // No proven machine.
    expect(findTip(MONDAYS.map((d) => legDay(d)), [], today)).toBeNull();
  });

  it('every machine the routine uses must be quiet on the other day', () => {
    const rack: BusyMachine = { ...legPress((d, h) => (d === 'tue' && h === 19 ? 1 : 0)), id: 'squat_rack', name: 'Squat rack', ex: ['barbell_back_squat'] };
    expect(findTip(MONDAYS.map((d) => legDay(d)), [busyMonday7pm, rack], today)?.quietDay).toBe('sun');
  });
});

describe('Not now, the timers and the gym hours', () => {
  it('hides a tip for 30 days, then forgets it', () => {
    const h = withSnoozed({}, 'a', '2026-11-02');
    expect(h).toEqual({ a: '2026-12-02' });
    expect(hiddenFrom(JSON.stringify(h), '2026-11-20')).toEqual({ a: '2026-12-02' });
    expect(hiddenFrom(JSON.stringify(h), '2026-12-02')).toEqual({});
    expect(hiddenFrom('not json', '2026-11-02')).toEqual({});
    expect(hiddenFrom(null, '2026-11-02')).toEqual({});
  });

  it('asks every 30 minutes and sends every 6 hours, at once after a workout', () => {
    expect(machineReadDue('focus', null, 0)).toBe(true);
    expect(machineReadDue('focus', 0, MACHINE_READ_EVERY_MS - 1)).toBe(false);
    expect(machineReadDue('focus', 0, MACHINE_READ_EVERY_MS)).toBe(true);
    expect(machineReadDue('workout', 0, 1)).toBe(true);
    expect(machinePushDue('start', 0, MACHINE_PUSH_EVERY_MS - 1)).toBe(false);
    expect(machinePushDue('start', 0, MACHINE_PUSH_EVERY_MS)).toBe(true);
    expect(machinePushDue('workout', 0, 1)).toBe(true);
  });

  it('weekday of a day', () => {
    expect(dayOf('2026-11-02')).toBe('mon');
    expect(dayOf('2026-11-08')).toBe('sun');
  });

  it('open for any part of the hour by the weekly hours', () => {
    const closed = { kind: 'closed' as const, ranges: [] };
    const hours = {
      week: {
        mon: { kind: 'hours' as const, ranges: [{ open: '05:30', close: '11:00' }, { open: '17:00', close: '22:00' }] },
        tue: closed, wed: { kind: 'allDay' as const, ranges: [] }, thu: closed, fri: closed, sat: closed, sun: closed,
      },
      special: [],
    } as unknown as GymHours;
    expect(openAtHour(hours, 'mon', 5)).toBe(true);
    expect(openAtHour(hours, 'mon', 11)).toBe(false);
    expect(openAtHour(hours, 'mon', 21)).toBe(true);
    expect(openAtHour(hours, 'mon', 22)).toBe(false);
    expect(openAtHour(hours, 'tue', 19)).toBe(false);
    expect(openAtHour(hours, 'wed', 3)).toBe(true);
    expect(openAtHour(null, 'tue', 19)).toBe(true);
  });
});
