/**
 * R-483 (owner, 13 Nov 2026: "A) keep only the new Up next tip"): swap advice lives in ONE place, the
 * muscle tip on the Workout tab's Up next card. The Charts page "Balance check" (F52) keeps its numbers
 * and "Not now", and never again suggests a swap: no "See a swap", no swap sheet, no "Swap for 8 weeks",
 * no "Best for this muscle" list. A focus block started before R-483 still finishes ("Keep it" / "Go back").
 * The card is a React Native screen (not renderable in this pure-TS lane), so its source is read.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { weakLine } from '@/tracker/engine/balanceBlock';

const card = readFileSync(path.resolve(__dirname, '../../src/components/analytics/BalanceCard.tsx'), 'utf8');
const service = readFileSync(path.resolve(__dirname, '../../src/tracker/services/balanceCheck.ts'), 'utf8');

describe('Balance check gives no swap advice (R-483)', () => {
  it('the card has no swap words, sheet or buttons', () => {
    for (const gone of ['See a swap', 'Swap for', 'Take out', 'Put in', 'Best for this muscle', '<Sheet', 'startBlock', 'sheetTitle', 'heavyLine']) {
      expect(card, gone).not.toContain(gone);
    }
  });

  it('the card keeps its numbers, its plain words and "Not now"', () => {
    expect(card).toContain('Balance check');
    expect(card).toContain('weakLine(spot)');
    expect(card).toContain('These numbers come from your last 4 weeks of workouts.');
    expect(card).toContain('label="Not now"');
    expect(card).toContain('snoozeMuscle(spot.muscle)');
  });

  it('a focus block started before still finishes', () => {
    expect(card).toContain('label="Keep it"');
    expect(card).toContain('label="Go back"');
  });

  it('the service no longer works out a swap or starts a block', () => {
    expect(service).toContain("{ kind: 'weak'; spot: WeakSpot }");
    for (const gone of ['pickSwapOut', 'bestFor', 'export async function startBlock', 'swapContextFor']) {
      expect(service, gone).not.toContain(gone);
    }
  });

  it('the member line is plain numbers', () => {
    expect(weakLine({ muscle: 'rear_delts', sets: 2, typical: 10 }).endsWith(': 2 sets a week (most muscles get 10)')).toBe(true);
  });
});
