/**
 * KNOWN DEFECTS — each test below states the behaviour a member SHOULD get, and is marked
 * `it.fails(...)` because today the app does NOT do it. The finding ID from the 10 Oct 2026
 * audit (D:\Apps\ForgeAI\Audit) is in every test name.
 *
 * How this works:
 *   - `it.fails` PASSES while the assertion inside it fails, so CI stays green while the
 *     defect is open.
 *   - The day a fix lands, the assertion starts passing, `it.fails` turns RED, and CI fails
 *     on purpose. The person who fixed it must then switch that test from `it.fails(` to
 *     `it(` (and drop "known defect" from its name) in the same commit. That way a fix can
 *     never land silently, and a fixed defect can never quietly come back.
 *   - Do NOT "fix" a red known-defect test by editing the assertion. Red here means the
 *     defect is fixed (or the code moved) — promote the test, do not weaken it.
 */
import { describe, expect, it } from 'vitest';

import { CATALOG } from '@/tracker/catalog/exerciseCatalog';
import { filterExercises } from '@/tracker/services/exerciseSearch';
import { fillForSet } from '@/tracker/store/activeWorkoutStore';
import type { DraftExercise, DraftSet } from '@/tracker/store/activeWorkoutStore';
import { parseTyped } from '@/tracker/components/unitText';
import { computeEditedTiming } from '@/tracker/services/sessionTiming';
import { setRecordValue } from '@/tracker/engine/records';
import { biggestGain } from '@/tracker/engine/reports';
import { isEasyWeek, planWeek, takeEasyNow } from '@/tracker/plans/easyWeek';
import { addDays, relativeDay, todayISO } from '@/lib/date';

const LIBRARY = CATALOG.map((e) => ({
  name: e.name,
  aliases: [...e.aliases],
  equipment: e.equipment,
  muscles: { primary: [...e.primary], secondary: [...e.secondary] },
})) as unknown as Parameters<typeof filterExercises>[0];

const search = (q: string) => filterExercises(LIBRARY, { query: q, muscle: null, equipment: null });

describe('EX-01 search finds everyday spellings (else the member is offered "Create" and makes a duplicate)', () => {
  for (const q of ['bicep curls', 'dumbell curl', 'calf raises', 'hammer curls', 'skull crushers', 'benchpress']) {
    it.fails(`EX-01 known defect: "${q}" finds at least one library exercise`, () => {
      expect(search(q).length).toBeGreaterThan(0);
    });
  }

  it.fails('EX-01 known defect: every Hevy title the library knows (linkNames) finds its own exercise', () => {
    const misses: string[] = [];
    for (const e of CATALOG) {
      for (const title of e.linkNames ?? []) {
        if (!search(title).some((r) => r.name === e.name)) misses.push(title);
      }
    }
    // Today: most Hevy titles ("Squat (Barbell)", "Lateral Raise (Cable)") return nothing.
    expect(misses, `${misses.length} Hevy titles not found, e.g. ${misses.slice(0, 5).join(' | ')}`).toEqual([]);
  });
});

let n = 0;
function set(patch: Partial<DraftSet> = {}): DraftSet {
  n += 1;
  return { key: `s${n}`, weightKg: null, reps: null, isWarmup: false, done: false, ...patch } as DraftSet;
}
function card(patch: Partial<DraftExercise>): DraftExercise {
  n += 1;
  return {
    key: `e${n}`, exerciseId: `x${n}`, name: `Lift ${n}`, muscleGroup: 'chest', equipment: 'barbell',
    previousSets: [], sets: [], ...patch,
  } as DraftExercise;
}

describe('LW-04 the grey hint follows the weight just lifted (no Target on the card)', () => {
  it.fails('LW-04 known defect: set 1 ticked at 75 kg (last time 72.5) → set 2 hints 75, not last time\'s 72.5', () => {
    const s1 = set({ weightKg: 75, reps: 5, done: true });
    const s2 = set();
    const c = card({
      previousSets: [{ weightKg: 72.5, reps: 8 }, { weightKg: 72.5, reps: 8 }],
      sets: [s1, s2],
    } as Partial<DraftExercise>);
    expect(fillForSet(c, s2.key)?.weightKg).toBe(75);
  });
});

describe('LW-06 a minus sign typed by mistake is not kept (a negative weight is dropped at save)', () => {
  it.fails('LW-06 known defect: parseTyped("-60") never yields a negative weight', () => {
    const v = parseTyped('-60');
    expect(v == null || v >= 0).toBe(true);
  });
});

describe('HI-05 moving a workout onto today keeps its length', () => {
  it.fails('HI-05 known defect: yesterday 18:00–19:00 moved to today at 09:00 still lasts 60 minutes', () => {
    const today = new Date(2026, 9, 10, 9, 0, 0, 0).getTime();
    const start = new Date(2026, 9, 9, 18, 0, 0, 0).getTime();
    const t = computeEditedTiming({
      originalDateISO: '2026-10-09', dateISO: '2026-10-10', startedAt: start, endedAt: start + 3_600_000, now: today,
    });
    expect((t.endedAt ?? 0) - t.startedAt).toBe(3_600_000);
  });
});

describe('HI-10 a true single is its own 1-rep max', () => {
  it.fails('HI-10 known defect: 100 kg × 1 → best 1-rep max 100 kg (not 103.3)', () => {
    const v = setRecordValue('e1rm', { weightKg: 100, reps: 1 }, { logType: 'weight_reps', loadMode: 'total', bwShare: 0 } as never, null);
    expect(v).toBe(100);
  });
});

describe('HI-20 a workout dated "tomorrow" after flying west never reads "-1 days ago"', () => {
  it.fails('HI-20 known defect: relativeDay(tomorrow) has no negative number', () => {
    expect(relativeDay(addDays(todayISO(), 1))).not.toMatch(/-\d/);
  });
});

describe('PG-02 one mistyped set cannot become the year\'s "biggest gain"', () => {
  it.fails('PG-02 known defect: bench 79→85 kg over 3 months with one 350 kg typo reports about +8%, not +342%', () => {
    const e1 = [79, 80, 80, 81, 82, 83, 350, 84, 85];
    const pts = e1.map((v, i) => ({ exerciseId: 'bench', name: 'Barbell Bench Press', dateISO: addDays('2026-01-05', i * 10), e1rm: v }));
    const g = biggestGain(pts);
    expect(g?.pct ?? 0).toBeLessThan(20);
  });
});

describe('RP-04 "Take an easy week now" gives seven easy days from the tap', () => {
  it.fails('RP-04 known defect: plan started on a Wednesday, easy week taken on a Monday → Mon..Sun are all easy', () => {
    const start = '2026-09-02'; // a Wednesday
    const tap = '2026-10-05'; // a Monday
    const week = planWeek(start, tap);
    const s = takeEasyNow({ every: 6, base: 0 } as never, week);
    const easyDays = [0, 1, 2, 3, 4, 5, 6].filter((d) => isEasyWeek(s, planWeek(start, addDays(tap, d))));
    expect(easyDays.length).toBe(7);
  });
});
