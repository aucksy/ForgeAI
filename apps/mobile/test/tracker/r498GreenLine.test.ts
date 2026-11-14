/**
 * R-496/R-497/R-498 (owner, 14 Nov 2026): the green finished line on an exercise card "should say beaten
 * and celebrate", in short, with "Previous" (the card header already says "Previous: <date>"). Line 1 is
 * the shout, big and bold; line 2 names both totals, small:
 *   kilos, beaten   "Previous set volume beaten! +200 kg" / "Done 1,650 kg · Previous 1,450 kg"
 *   reps, beaten    "Previous reps beaten! +3"            / "Done 46 reps · Previous 43 reps"
 *   equal           "Previous set volume matched"         / "Done 1,450 kg · Previous 1,450 kg"
 *                   ("Previous reps matched" on a reps-only move)
 * First time ("1,650 kg done · First time") and every line that is not green are unchanged. "+200 kg"
 * never splits over two lines (a no-break space). "volume" is his exception to the banned member words
 * for this line only (test/lib/memberWords.test.ts).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { GREEN_LINE_BREAK, kgBeaten, kgLiveLine, kgProgress, lineGreen, repLiveLine, type KgPlan, type KgRow } from '@/tracker/lib/kgTarget';

const NBSP = String.fromCharCode(160);
const total = (kg: number) => `${Math.round(kg).toLocaleString('en-US')} kg`;
const totalLb = (kg: number) => `${Math.round(kg * 2.20462).toLocaleString('en-US')} lb`;
const weight = (kg: number) => `${kg} kg`;
const done = (weightKg: number, reps: number): KgRow => ({ weightKg, reps, done: true, isWarmup: false });
const open = (weightKg: number, reps: number): KgRow => ({ weightKg: null, reps: null, done: false, isWarmup: false, hintKg: weightKg, hintReps: reps });
const r = (n: number): KgRow => ({ weightKg: null, reps: n, done: true, isWarmup: false });
const ro = (n: number): KgRow => ({ weightKg: null, reps: null, done: false, isWarmup: false, hintKg: 0, hintReps: n });

// The mock he chose (P1): Barbell Bench Press, last time 4 x 72.5 x 5 = 1,450 kg; today's plan 4 x 75 x 5 = 1,500 kg.
const bench: KgPlan = { sets: [5, 5, 5, 5].map((reps) => ({ weightKg: 75, reps, asLast: false })), total: 1500, last: 1450, pct: 50 / 1450 };
// A reps-only move: last time 15, 15, 13 = 43; today's plan 15, 15, 14 = 44.
const dips: KgPlan = { reps: true, sets: [15, 15, 14].map((n) => ({ weightKg: 1, reps: n, asLast: false })), total: 44, last: 43, pct: 1 / 43 };

const lines = (s: string) => s.split(GREEN_LINE_BREAK);

describe('R-498: kilos, beaten', () => {
  it('his mock P1: 75 x 5, 5, 6, 6 = 1,650 after 1,450 -> the shout, then both totals', () => {
    const g = kgProgress(bench, [done(75, 5), done(75, 5), done(75, 6), done(75, 6)]);
    expect(lineGreen(bench, g)).toBe(true);
    const line = kgLiveLine(bench, g, total, weight);
    expect(line).toBe(`Previous set volume beaten! +200${NBSP}kg\nDone 1,650 kg · Previous 1,450 kg`);
    expect(lines(line)).toHaveLength(2);
    // "+200" and "kg" never break apart; the totals keep the thousands commas.
    expect(lines(line)[0]).toContain(`+200${NBSP}kg`);
    expect(lines(line)[0]).not.toContain('+200 kg');
    // Never the old words, never "last time".
    expect(line).not.toMatch(/kg done|Previous:|same as last time|last time/);
    // R-499 (owner, 14 Nov 2026): the word "Today" never shows; line 2 starts "Done".
    expect(line).not.toMatch(/today/i);
  });
  it('pounds: "+441 lb" kept together too', () => {
    const g = kgProgress(bench, [done(75, 5), done(75, 5), done(75, 6), done(75, 6)]);
    expect(kgLiveLine(bench, g, totalLb, weight)).toBe(`Previous set volume beaten! +441${NBSP}lb\nDone 3,638 lb · Previous 3,197 lb`);
  });
  it('a different number of sets keeps its note on line 2', () => {
    const plus: KgPlan = { ...bench, setDiff: 1, compared: 4 };
    const g = kgProgress(plus, [done(75, 5), done(75, 5), done(75, 6), done(75, 6), done(75, 5)]);
    expect(lineGreen(plus, g)).toBe(true);
    expect(lines(kgLiveLine(plus, g, total, weight))[1]).toBe('Done 2,025 kg · Previous 1,450 kg · +1 set');
  });
});

describe('R-498: equal', () => {
  it('exactly last time\'s 1,450 kg: green, "Previous set volume matched"', () => {
    const g = kgProgress(bench, [done(72.5, 5), done(72.5, 5), done(72.5, 5), done(72.5, 5)]);
    expect(lineGreen(bench, g)).toBe(true);
    expect(kgLiveLine(bench, g, total, weight)).toBe('Previous set volume matched\nDone 1,450 kg · Previous 1,450 kg');
  });
  it('reps-only, exactly last time\'s 43: "Previous reps matched"', () => {
    const g = kgProgress(dips, [r(15), r(15), r(13)]);
    expect(lineGreen(dips, g)).toBe(true);
    expect(repLiveLine(dips, g)).toBe('Previous reps matched\nDone 43 reps · Previous 43 reps');
  });
});

describe('R-498: reps-only, beaten', () => {
  it('16, 15, 15 = 46 after 43: "Previous reps beaten! +3" / "Done 46 reps · Previous 43 reps"', () => {
    const g = kgProgress(dips, [r(16), r(15), r(15)]);
    expect(lineGreen(dips, g)).toBe(true);
    expect(repLiveLine(dips, g)).toBe('Previous reps beaten! +3\nDone 46 reps · Previous 43 reps');
    expect(repLiveLine(dips, g)).not.toMatch(/volume|kg/);
  });
});

describe('R-498: first time is unchanged', () => {
  it('kilos and reps: "<done> done · First time", one line', () => {
    const first: KgPlan = { ...bench, last: null, pct: null };
    const g = kgProgress(first, [done(75, 5), done(75, 5), done(75, 6), done(75, 6)]);
    expect(lineGreen(first, g)).toBe(true);
    expect(kgLiveLine(first, g, total, weight)).toBe('1,650 kg done · First time');
    const firstReps: KgPlan = { ...dips, last: null, pct: null };
    expect(repLiveLine(firstReps, kgProgress(firstReps, [r(15), r(15), r(14)]))).toBe('44 reps done · First time');
  });
});

describe('R-498: not green is unchanged', () => {
  it('sets still open: the "Next set" line', () => {
    const g = kgProgress(bench, [done(75, 5), done(75, 5), open(75, 5), open(75, 5)]);
    expect(lineGreen(bench, g)).toBe(false);
    expect(kgLiveLine(bench, g, total, weight)).toBe("Next set: 75 kg × 5 · Done: 750 of today's 1,500 kg");
    expect(repLiveLine(dips, kgProgress(dips, [r(15), ro(15), ro(14)]))).toBe("Next sets: 15, 14 reps · Done: 15 of today's 44 reps");
  });
  it('the plan reached with a set still open: not green, the old one-line words', () => {
    const g = kgProgress(bench, [done(75, 8), done(75, 7), done(75, 6), open(75, 5)]);
    expect(kgBeaten(g)).toBe(true);
    expect(lineGreen(bench, g)).toBe(false);
    const line = kgLiveLine(bench, g, total, weight);
    expect(line).toBe('1,575 kg done · Previous: 1,450 kg · +125 kg');
    expect(line).not.toContain(GREEN_LINE_BREAK);
    expect(line).not.toMatch(/volume|beaten|matched/);
  });
  it('every set done but under last time: not green, the short line', () => {
    const g = kgProgress(bench, [done(70, 5), done(70, 5), done(70, 5), done(70, 5)]);
    expect(lineGreen(bench, g)).toBe(false);
    expect(kgLiveLine(bench, g, total, weight)).toBe('Done: 1,400 of 1,500 kg · 100 kg short, fine for today');
  });
});

describe('R-498: the card draws two lines, the info button stays', () => {
  const card = readFileSync(join(__dirname, '../../src/tracker/components/ExerciseLogCard.tsx'), 'utf8');
  it('line 1 big and bold from the theme tokens, line 2 small; both spans of the one text the phone test reads', () => {
    expect(card).toMatch(/fontFamily: type\.bodyBold, fontSize: type\.size\.h3 \}\}>\{greenHead\}/);
    expect(card).toMatch(/fontFamily: type\.bodyMedium, fontSize: type\.size\.sub, color: faded\(color\.goodText\) \}\}>\{greenSub\}/);
    expect(card).toContain('testID={`target-line-${exercise.name}`}');
  });
  it('the (i) and its tap are unchanged; a screen reader hears the two lines as two sentences', () => {
    expect(card).toContain('onPress={() => setShowWhy((v) => !v)}');
    expect(card).toContain('<Glyph name="info" size={16} color={showWhy ? color.accent : color.inkMuted} />');
    expect(card).toContain("kgLine.text.split(GREEN_LINE_BREAK).join('. ')");
  });
});
