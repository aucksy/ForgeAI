/**
 * F121 "Send your report to the gym?": the server's answers read safely, the words, and - on real
 * SQLite - the report the phone makes holds ONLY the workouts on or after the member's join date at
 * that gym (a workout that began the evening before does not slip in), in the same format as
 * Settings -> Save as a spreadsheet. Every workout here is made up.
 */
import { describe, expect, it, vi } from 'vitest';

import type { OnboardingInput } from '@/onboarding/form';
import {
  GYM_REPORT_WORDS,
  REPORT_MAX_CHARS,
  reportAnswerFromRow,
  reportAskLine,
  reportRefusedWords,
  reportRequestsFromRow,
  reportTooBig,
  requestToAsk,
} from '@/shop/gymReport';
import { bootRealApp } from '../helpers/realDb';

vi.setConfig({ testTimeout: 60_000 });
vi.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  documentDirectory: 'file:///docs/',
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
  readDirectoryAsync: async () => [],
  deleteAsync: async () => undefined,
  writeAsStringAsync: async () => {
    throw new Error('the gym report must never be written to a file');
  },
}));
vi.mock('expo-sharing', () => ({
  isAvailableAsync: async () => true,
  shareAsync: async () => {
    throw new Error('the gym report must never open the share sheet');
  },
}));

const MEMBER: OnboardingInput = {
  name: 'Test Member',
  phoneE164: '+919876543210',
  goal: 'muscle',
  experience: 'intermediate',
  age: 30,
  heightCm: 175,
  gymName: 'Test Gym',
  bodyWeightKg: 78,
  targets: { calorieTarget: 2700, proteinTargetG: 135, carbsTargetG: 370, fatTargetG: 75 },
};

const REQ = { id: 'r1', status: 'pending', fromDay: '2026-03-10', agreed: false, createdAt: 1, expiresAt: 2 };

describe('reading the server (0045)', () => {
  it('a waiting request, the day, and junk left out', () => {
    const a = reportRequestsFromRow({ ok: true, day: '2026-03-20', requests: [REQ, { id: '', status: 'pending', fromDay: '2026-03-10' }, { id: 'x', status: 'odd', fromDay: '2026-03-10' }, 'junk'] });
    expect(a).toEqual({ ok: true, day: '2026-03-20', requests: [{ id: 'r1', status: 'pending', fromDay: '2026-03-10', agreed: false }] });
    expect(requestToAsk(a)).toEqual({ id: 'r1', status: 'pending', fromDay: '2026-03-10', agreed: false });
  });

  it('nothing waiting, an identity problem, or an answer it cannot read: nothing to ask', () => {
    expect(requestToAsk(reportRequestsFromRow({ ok: true, day: '2026-03-20', requests: [] }))).toBeNull();
    expect(reportRequestsFromRow({ error: 'NOT_ON_LIST' })).toEqual({ ok: false, problem: 'NOT_ON_LIST' });
    expect(requestToAsk(reportRequestsFromRow({ error: 'NOT_ON_LIST' }))).toBeNull();
    expect(reportRequestsFromRow(null)).toBeNull();
    expect(reportRequestsFromRow({ ok: true, day: 'today', requests: [] })).toBeNull();
    expect(requestToAsk(null)).toBeNull();
    // A request already sent or declined is never asked again.
    expect(requestToAsk(reportRequestsFromRow({ ok: true, day: '2026-03-20', requests: [{ ...REQ, status: 'sent' }] }))).toBeNull();
  });

  it('yes / send answers and refusals', () => {
    expect(reportAnswerFromRow({ ok: true, request: { ...REQ, agreed: true } })).toEqual({ ok: true, request: { id: 'r1', status: 'pending', fromDay: '2026-03-10', agreed: true } });
    expect(reportAnswerFromRow([{ error: 'GONE' }])).toEqual({ ok: false, refused: 'GONE' });
    expect(reportAnswerFromRow({ ok: true })).toBeNull();
  });
});

describe('the words', () => {
  it('plain, and never "volume", "PR" or "session"', () => {
    const all = [
      ...Object.values(GYM_REPORT_WORDS),
      reportAskLine('Iron Den', '2026-03-10', '2026-03-20'),
      ...['GONE', 'TOO_BIG', 'SUSPENDED', 'NOT_AGREED', 'TOO_EARLY', 'BAD_FILE'].map(reportRefusedWords),
    ];
    for (const w of all) {
      expect(w).not.toMatch(/volume|\bPRs?\b|session/i);
      expect(w.length).toBeLessThan(200);
    }
    expect(reportAskLine('Iron Den', '2026-03-10', '2026-03-20')).toContain('Iron Den wants a copy of your workouts');
    expect(reportAskLine('Iron Den', '2026-03-10', '2026-03-20')).toContain('10 Mar');
    expect(reportAskLine('  ', '2026-03-10', '2026-03-20')).toMatch(/^Your gym wants a copy/);
    expect(reportRefusedWords('SOMETHING_NEW')).toBe(GYM_REPORT_WORDS.failed);
  });

  it('the size limit matches the server', () => {
    expect(REPORT_MAX_CHARS).toBe(3_000_000);
    expect(reportTooBig('x'.repeat(3_000_000))).toBe(false);
    expect(reportTooBig('x'.repeat(3_000_001))).toBe(true);
  });
});

/** The server's own day reader (0045 `_report_csv_days`), in JS: every whole-cell "7 Jul 2026, 14:24". */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function serverDays(csv: string): string[] {
  const out: string[] = [];
  for (const m of csv.matchAll(/"([0-9]{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) ([0-9]{4}), [0-9]{2}:[0-9]{2}"/g)) {
    out.push(`${m[3]}-${String(MONTHS.indexOf(m[2]) + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`);
  }
  return out;
}

describe('the report the phone makes (real SQLite)', () => {
  it('holds only the workouts from the join date on; the full save still holds them all', async () => {
    const db = await bootRealApp();
    const { completeOnboarding } = await import('@/onboarding/db/dataActions');
    await completeOnboarding(MEMBER);
    const { createSession } = await import('@/db/repos/workoutRepo');
    const { addSetsWithMeta } = await import('@/tracker/db/trackerSets');
    const bench = db.all<{ id: string }>("SELECT id FROM exercises WHERE name = 'Barbell Bench Press'")[0].id;
    const at = (y: number, mo: number, d: number, h: number, mi = 0): number => new Date(y, mo - 1, d, h, mi).getTime();
    const log = async (dateISO: string, start: number, note: string): Promise<void> => {
      const s = await createSession({ dateISO, dayType: 'push', notes: note, source: 'manual', startedAt: start, endedAt: start + 3_600_000 });
      await addSetsWithMeta(s.id, [{ exerciseId: bench, weightKg: 80, reps: 5 }, { exerciseId: bench, weightKg: 85, reps: 3 }]);
    };
    await log('2026-01-05', at(2026, 1, 5, 7), 'before-jan');
    await log('2026-03-09', at(2026, 3, 9, 18), 'day-before');
    // Filed under the join day, but it began the evening before (23:30): stays out.
    await log('2026-03-10', at(2026, 3, 9, 23, 30), 'evening-before');
    await log('2026-03-10', at(2026, 3, 10, 6, 15), 'join-day');
    await log('2026-04-02', at(2026, 4, 2, 19), 'april');

    const { makeGymReport } = await import('@/shop/gymReportMake');
    const r = await makeGymReport('metric', '2026-03-10');
    expect(r.workouts).toBe(2);
    expect(r.sets).toBe(4);
    expect(r.csv.startsWith('"title","start_time"')).toBe(true);
    expect(r.csv).toContain('join-day');
    expect(r.csv).toContain('april');
    for (const gone of ['before-jan', 'day-before', 'evening-before']) expect(r.csv).not.toContain(gone);
    // What the server reads off the file: nothing before the join date (no TOO_EARLY).
    const days = serverDays(r.csv);
    expect(days.length).toBeGreaterThan(0);
    expect(days.every((d) => d >= '2026-03-10')).toBe(true);

    // Same format as Settings -> Save as a spreadsheet: those two workouts' lines, byte for byte.
    const exp = await import('@/tracker/services/historyExport');
    const all = await exp.readHistoryRows();
    expect(r.csv).toBe(exp.hevyCsvFromRows(exp.rowsFromDay(all, '2026-03-10'), 'metric'));
    // R-220: the member's own full save is untouched - all five workouts.
    expect(new Set(all.map((x) => x.session_id)).size).toBe(5);
    const whole: string[] = [];
    await exp.writeHistoryCsv('metric', async (c) => {
      whole.push(c);
    });
    for (const note of ['before-jan', 'day-before', 'evening-before', 'join-day', 'april']) expect(whole.join('')).toContain(note);

    // A join date after every workout: just the header, which the server takes as an empty report.
    const none = await makeGymReport('imperial', '2027-01-01');
    expect(none).toEqual({ csv: `${exp.hevyCsvEncoder('imperial').header}\n`, workouts: 0, sets: 0 });
  });
});
