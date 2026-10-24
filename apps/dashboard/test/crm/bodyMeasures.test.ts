/**
 * Measurements taken by the trainer (R-120): the form's checks (the server's _measure_clean in
 * supabase/migrations/0035_trainer_measurements_diet.sql, in plain words), reading the server's rows,
 * and "change vs last time" in the history.
 */
import { describe, expect, it } from 'vitest';

import {
  draftOfMeasure,
  emptyMeasureDraft,
  measureErrorWords,
  measureFromRow,
  measureLines,
  measurePayload,
  measuresFromRows,
  parseBox,
  signed,
  TAPE_KINDS,
  valueText,
} from '../../src/crm/logic/bodyMeasures';

const TODAY = '2026-10-24';

describe('the nine tape measurements', () => {
  it('are the member app’s list (apps/mobile/src/tracker/engine/measurements.ts, without body fat)', () => {
    expect([...TAPE_KINDS].sort()).toEqual(['arm', 'calf', 'chest', 'forearm', 'hips', 'neck', 'shoulders', 'thigh', 'waist']);
  });
});

describe('measurePayload', () => {
  it('sends only what was typed, rounded to 0.1, a comma working as the point', () => {
    const d = { ...emptyMeasureDraft(TODAY), weightKg: '72,46', tape: { waist: '84', arm: ' 31.25 ', chest: '' }, note: '  after   Diwali ' };
    const { payload, problems } = measurePayload(d, TODAY);
    expect(problems).toEqual({});
    expect(payload).toEqual({ date: TODAY, weightKg: 72.5, bodyFat: null, tape: { waist: 84, arm: 31.3 }, note: 'after Diwali' });
  });

  it('names each box that is outside what a body can be, with its range', () => {
    const d = { ...emptyMeasureDraft(TODAY), weightKg: '500', bodyFat: 'abc', tape: { waist: '2' } };
    const { payload, problems } = measurePayload(d, TODAY);
    expect(payload).toBeNull();
    expect(problems.weightKg).toBe('Body weight: a number from 20 to 350 kg.');
    expect(problems.bodyFat).toBe('Body fat: a number from 2 to 75 %.');
    expect(problems.waist).toBe('Waist: a number from 5 to 300 cm.');
  });

  it('refuses an empty form and a day in the future', () => {
    expect(measurePayload(emptyMeasureDraft(TODAY), TODAY).problems).toEqual({ empty: 'Type at least one measurement.' });
    expect(measurePayload({ ...emptyMeasureDraft('2026-10-25'), weightKg: '70' }, TODAY).problems.date).toBe('The day can’t be in the future.');
  });

  it('keeps the id when fixing a saved entry', () => {
    const saved = measureFromRow({ id: 'e1', memberId: 'm1', date: '2026-10-01', weightKg: 72.8, bodyFat: null, tape: { waist: 84 }, note: null, byName: 'Ravi', updatedAt: 1 });
    expect(saved).not.toBeNull();
    const d = draftOfMeasure(saved!);
    expect(d).toMatchObject({ id: 'e1', date: '2026-10-01', weightKg: '72.8', bodyFat: '', tape: { waist: '84' } });
    expect(measurePayload(d, TODAY).payload).toMatchObject({ id: 'e1', weightKg: 72.8, tape: { waist: 84 } });
  });

  it('parseBox: blank is null, words are NaN', () => {
    expect(parseBox('')).toBeNull();
    expect(Number.isNaN(parseBox('12a') as number)).toBe(true);
    expect(parseBox('81.')).toBe(81);
  });
});

describe('the server rows', () => {
  it('reads numbers, drops unknown tape keys and unreadable rows, newest day first', () => {
    const list = measuresFromRows([
      { id: 'a', date: '2026-09-01', weightKg: 74, tape: { waist: 86, wrist: 17 } },
      { id: 'b', date: '2026-10-01', weightKg: '73.5', tape: null },
      { id: '', date: '2026-10-02' },
      'junk',
    ]);
    expect(list.map((m) => m.id)).toEqual(['b', 'a']);
    expect(list[0].weightKg).toBe(73.5);
    expect(list[1].tape).toEqual({ waist: 86 });
  });
});

describe('measureLines: change vs last time', () => {
  it('compares each measurement with the last entry that had it', () => {
    const list = measuresFromRows([
      { id: 'c', date: '2026-10-20', weightKg: 71.2, tape: { waist: 81.5 } },
      { id: 'b', date: '2026-10-01', bodyFat: 23, tape: { arm: 32 } },
      { id: 'a', date: '2026-09-01', weightKg: 72.7, bodyFat: 24, tape: { waist: 84 } },
    ]);
    const out = measureLines(list);
    expect(out.map((x) => x.entry.id)).toEqual(['c', 'b', 'a']);
    expect(out[0].lines.map((l) => [l.label, l.change])).toEqual([
      ['Body weight', -1.5],
      ['Waist', -2.5],
    ]);
    expect(out[1].lines.map((l) => [l.label, l.change])).toEqual([
      ['Body fat', -1],
      ['Arm', null],
    ]);
    expect(out[2].lines.every((l) => l.change === null)).toBe(true);
    expect(signed(-1.5)).toBe('−1.5');
    expect(signed(0.4)).toBe('+0.4');
    expect(signed(0)).toBe('0');
    expect(valueText(out[1].lines[0])).toBe('23 %');
    expect(valueText(out[0].lines[0])).toBe('71.2 kg');
  });
});

describe('measureErrorWords', () => {
  it('says each refusal plainly', () => {
    expect(measureErrorWords(new Error('DAY_TAKEN'))).toBe('This member already has measurements on that day. Edit that entry instead.');
    expect(measureErrorWords({ message: 'NO_MEMBER' })).toBe('This member is not on your gym’s list any more.');
    expect(measureErrorWords(new Error('timed out'))).toBeNull();
  });
});
