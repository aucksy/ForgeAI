/**
 * "Save my measurements" (Hevy's "Export measurements"): the CSV encoder (units, empty days,
 * escaping, order, rounding), the card's words, and — against a REAL in-memory SQLite — that a
 * member's own entries are read and the sample member's never are.
 */
import { describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 30_000 });
vi.mock('expo-sharing', () => ({ isAvailableAsync: async () => false, shareAsync: async () => undefined }));

import type { OnboardingInput } from '@/onboarding/form';
import {
  csvField,
  measurementColumns,
  measurementsCsv,
  measurementsNote,
  type MeasurementDay,
} from '@/tracker/services/measurementsExport';

import { bootRealApp } from '../helpers/realDb';

const lines = (text: string): string[] => text.split('\n');

describe('measurementColumns', () => {
  it('metric: kg and cm, Hevy order, only what we store', () => {
    expect(measurementColumns('metric').join(',')).toBe(
      'date,weight_kg,fat_percent,neck_cm,shoulder_cm,chest_cm,bicep_cm,forearm_cm,waist_cm,hips_cm,thigh_cm,calf_cm',
    );
  });
  it('imperial: lbs and inches; body fat stays a percentage', () => {
    expect(measurementColumns('imperial').join(',')).toBe(
      'date,weight_lbs,fat_percent,neck_in,shoulder_in,chest_in,bicep_in,forearm_in,waist_in,hips_in,thigh_in,calf_in',
    );
  });
});

describe('measurementsCsv', () => {
  const days: MeasurementDay[] = [
    { dateISO: '2026-10-02', weightKg: 78.04, values: { waist: 81.26, body_fat: 15.24 } },
    { dateISO: '2026-09-01', weightKg: 77.5, values: {} },
    { dateISO: '2026-09-15', values: { arm: 35.6, chest: 100 } },
  ];

  it('one row per day, oldest first, blanks where nothing was logged, up to 1 decimal', () => {
    const { text, days: n } = measurementsCsv(days, 'metric');
    expect(n).toBe(3);
    expect(lines(text)).toEqual([
      measurementColumns('metric').join(','),
      '2026-09-01,77.5,,,,,,,,,,',
      '2026-09-15,,,,,100,35.6,,,,,',
      '2026-10-02,78,15.2,,,,,,81.3,,,',
      '',
    ]);
  });

  it('imperial: weight in lb and lengths in inches, body fat unchanged', () => {
    const { text } = measurementsCsv(
      [{ dateISO: '2026-10-02', weightKg: 80, values: { waist: 81.28, body_fat: 15.2, calf: 38 } }],
      'imperial',
    );
    // 80 kg = 176.37 lb; 81.28 cm = 32.0 in; 38 cm = 14.96 in.
    expect(lines(text)[1]).toBe('2026-10-02,176.4,15.2,,,,,,32,,,15');
  });

  it('leaves out days with no usable value (empty, zero, not a number)', () => {
    const { text, days: n } = measurementsCsv(
      [
        { dateISO: '2026-01-01', values: {} },
        { dateISO: '2026-01-02', weightKg: 0, values: { neck: Number.NaN } },
        { dateISO: '2026-01-03', values: { neck: 38 } },
      ],
      'metric',
    );
    expect(n).toBe(1);
    expect(lines(text)).toEqual([measurementColumns('metric').join(','), '2026-01-03,,,38,,,,,,,,', '']);
  });

  it('nothing logged → only the header, 0 days', () => {
    const { text, days: n } = measurementsCsv([], 'metric');
    expect(n).toBe(0);
    expect(text).toBe(`${measurementColumns('metric').join(',')}\n`);
  });

  it('merges two entries for the same day into one row', () => {
    const { text, days: n } = measurementsCsv(
      [
        { dateISO: '2026-03-03', weightKg: 70, values: {} },
        { dateISO: '2026-03-03', values: { hips: 95 } },
      ],
      'metric',
    );
    expect(n).toBe(1);
    expect(lines(text)[1]).toBe('2026-03-03,70,,,,,,,,95,,');
  });
});

describe('csvField (escaping)', () => {
  it('leaves plain values alone', () => {
    expect(csvField('2026-10-02')).toBe('2026-10-02');
    expect(csvField('81.3')).toBe('81.3');
    expect(csvField('')).toBe('');
  });
  it('quotes commas, quotes and line breaks, doubling quotes', () => {
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('two\nlines')).toBe('"two\nlines"');
    expect(csvField('cr\rhere')).toBe('"cr\rhere"');
  });
});

describe('measurementsNote (the card line)', () => {
  it('says something plain for every outcome except a good share', () => {
    expect(measurementsNote({ kind: 'saved', shared: true, days: 3, uri: 'x' })).toBeNull();
    expect(measurementsNote({ kind: 'saved', shared: false, days: 3, uri: 'x' })?.tone).toBe('error');
    expect(measurementsNote({ kind: 'empty' })?.text).toMatch(/Nothing to save yet/);
    expect(measurementsNote({ kind: 'demo' })?.text).toMatch(/sample member/);
    expect(measurementsNote({ kind: 'error', message: 'Couldn’t save your measurements. Please try again.' })).toEqual({
      text: 'Couldn’t save your measurements. Please try again.',
      tone: 'error',
    });
  });
});

const MEMBER: OnboardingInput = {
  name: 'Test Member',
  phoneE164: '+919876543210',
  goal: 'muscle',
  experience: 'beginner',
  age: 30,
  heightCm: 175,
  gymName: 'Test Gym',
  bodyWeightKg: 78,
  targets: { calorieTarget: 2700, proteinTargetG: 135, carbsTargetG: 370, fatTargetG: 75 },
};

describe('measurementsFileText (real database)', () => {
  it('reads the member’s own weigh-ins and measurements into one row per day', async () => {
    await bootRealApp();
    const { completeOnboarding } = await import('@/onboarding/db/dataActions');
    await completeOnboarding(MEMBER);
    const { logMeasurements } = await import('@/tracker/db/measurementRepo');
    await logMeasurements('2026-10-01', { waist: 82, arm: 36.04 });
    const { measurementsFileText } = await import('@/tracker/services/measurementsExport');
    const res = await measurementsFileText('metric');
    expect(res.kind).toBe('ready');
    if (res.kind !== 'ready') return;
    const rows = lines(res.text);
    expect(rows[0]).toBe(measurementColumns('metric').join(','));
    expect(rows).toContain('2026-10-01,,,,,,36,,82,,,');
    // The weigh-in onboarding saved (78 kg) is in the file too.
    expect(rows.some((r) => /^\d{4}-\d{2}-\d{2},78,/.test(r))).toBe(true);
  });

  it('never exports the sample member', async () => {
    await bootRealApp();
    const { loadDemoData } = await import('@/onboarding/db/dataActions');
    await loadDemoData();
    const { measurementsFileText } = await import('@/tracker/services/measurementsExport');
    expect(await measurementsFileText('metric')).toEqual({ kind: 'demo' });
  });
});
