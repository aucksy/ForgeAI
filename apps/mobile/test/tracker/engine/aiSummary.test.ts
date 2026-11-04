/**
 * F61 "Ask your own AI": the shared text — best sets and how they go, the few-set muscles, the
 * question; never a name, a phone number, body weight or a banned word.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { BANNED_MEMBER_WORDS } from '@/lib/words';
import { setDisplayUnits } from '@/lib/units';
import type { Muscle } from '@/tracker/catalog/muscles';
import { AI_QUESTION, aiSummaryText, setScore, type SummaryWorkout } from '@/tracker/engine/aiSummary';

const bench = { primary: ['chest'] as Muscle[], secondary: ['triceps', 'front_delts'] as Muscle[] };
const pull = { primary: ['lats'] as Muscle[], secondary: ['biceps'] as Muscle[] };
const plank = { primary: ['abs'] as Muscle[], secondary: [] as Muscle[] };

const w = (id: string, dateISO: string, exercises: SummaryWorkout['exercises']): SummaryWorkout => ({ id, dateISO, exercises });
const BENCH = (sets: [number, number][]) => ({ exerciseId: 'b', name: 'Bench Press', logType: 'weight_reps' as const, muscles: bench, sets: sets.map(([weightKg, reps]) => ({ weightKg, reps })) });
const PULLUP = (reps: number[]) => ({ exerciseId: 'p', name: 'Pull Up', logType: 'reps' as const, muscles: pull, sets: reps.map((r) => ({ weightKg: 0, reps: r })) });
const PLANK = (sec: number) => ({ exerciseId: 'k', name: 'Plank', logType: 'time' as const, muscles: plank, sets: [{ weightKg: 0, reps: 0, durationSec: sec }] });

const WORKOUTS: SummaryWorkout[] = [
  w('3', '2026-11-03', [BENCH([[70, 8], [70, 7]]), PULLUP([12, 10])]),
  w('1', '2026-10-14', [BENCH([[65, 8], [60, 10]]), PULLUP([9, 8]), PLANK(60)]),
  w('2', '2026-10-24', [BENCH([[67.5, 8]]), PLANK(90)]),
];

afterEach(() => setDisplayUnits('metric'));

describe('aiSummaryText', () => {
  it('lists each exercise with its best set, first and latest, and the trend; then the few-set muscles and the question', () => {
    setDisplayUnits('metric');
    const text = aiSummaryText(WORKOUTS, '2026-11-04');
    const lines = text.split('\n');
    expect(lines[0]).toBe('My gym workouts from the last 4 weeks (14 Oct to 4 Nov).');
    expect(lines[1]).toBe('3 workouts in 4 weeks, about 0.8 a week.');
    expect(text).toContain('- Bench Press: 3 workouts. Best set 70 kg × 8 (3 Nov). First: 65 kg × 8. Latest: 70 kg × 8. Going up.');
    expect(text).toContain('- Pull Up: 2 workouts. Best set 12 reps (3 Nov). First: 9 reps. Latest: 12 reps. Going up.');
    expect(text).toContain('- Plank: 2 workouts. Best set 1:30 (24 Oct). First: 1:00. Latest: 1:30. Going up.');
    expect(text).toMatch(/Muscles with under 4 sets in these 4 weeks: .*Quads.*\./);
    expect(text).not.toMatch(/Chest,/);
    expect(lines[lines.length - 1]).toBe(AI_QUESTION);
  });

  it('pounds for a member who uses pounds', () => {
    setDisplayUnits('imperial');
    expect(aiSummaryText(WORKOUTS, '2026-11-04')).toContain('Best set 154.3 lb × 8');
  });

  it('going down and about the same', () => {
    setDisplayUnits('metric');
    const down = aiSummaryText([w('a', '2026-10-20', [BENCH([[80, 5]])]), w('b', '2026-11-01', [BENCH([[70, 5]])])], '2026-11-04');
    expect(down).toContain('Going down.');
    const same = aiSummaryText([w('a', '2026-10-20', [BENCH([[80, 5]])]), w('b', '2026-11-01', [BENCH([[80, 5]])])], '2026-11-04');
    expect(same).toContain('About the same.');
  });

  it('no workouts: says so, still asks', () => {
    expect(aiSummaryText([], '2026-11-04')).toBe(`I logged no workouts in the last 4 weeks.\n\n${AI_QUESTION}`);
  });

  it('carries no name, phone, body weight or banned word', () => {
    const text = aiSummaryText(WORKOUTS, '2026-11-04');
    expect(text).not.toMatch(/\b\d{10}\b|\+91|body ?weight|weigh|name/i);
    for (const b of BANNED_MEMBER_WORDS) expect(text).not.toMatch(b.re);
  });

  it('scores: weight by estimated 1-rep max, body-weight moves by added weight then reps, times by length', () => {
    expect(setScore({ weightKg: 100, reps: 5 }, 'weight_reps')).toBeGreaterThan(setScore({ weightKg: 105, reps: 1 }, 'weight_reps'));
    expect(setScore({ weightKg: 10, reps: 5 }, 'weighted')).toBeGreaterThan(setScore({ weightKg: 0, reps: 15 }, 'weighted'));
    expect(setScore({ weightKg: -10, reps: 8 }, 'assisted')).toBeGreaterThan(setScore({ weightKg: -20, reps: 12 }, 'assisted'));
    expect(setScore({ weightKg: 0, reps: 0, durationSec: 90 }, 'time')).toBe(90);
  });
});

describe('best set when the estimate ties (UAT run 41903972952: 35 kg x 12 beat 35 kg x 14)', () => {
  it('more reps at the same weight is the better set', () => {
    expect(setScore({ weightKg: 35, reps: 14 }, 'weight_reps')).toBeGreaterThan(setScore({ weightKg: 35, reps: 12 }, 'weight_reps'));
  });
  it('the line names the 14-rep set as best', () => {
    const text = aiSummaryText(
      [w('1', '2026-10-28', [BENCH([[35, 12]])]), w('2', '2026-11-03', [BENCH([[35, 14]])])],
      '2026-11-04',
    );
    expect(text).toMatch(/Best set 35 kg × 14 \(3 Nov\)/);
  });
});
