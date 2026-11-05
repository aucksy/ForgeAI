/**
 * R-358 (owner, 5 Nov 2026): records compare only sets logged with the SAME counting.
 *
 * Dumbbell Preacher Curl, last done 22 Oct "weight as typed": 10 kg × 12, 15, 15, 15, 11.
 * On 5 Nov he switched Counting to "One side at a time" and ticked 10 kg × 13 per side: the
 * pop-up said "New record · Most lifted in one set · 10 kg × 13", because 10 × 13 × 2 sides
 * = 260 kg beat 10 × 15 = 150 kg. Not a record: he had done more reps at 10 kg already.
 *
 * Changing Counting stamps the OLD counting on every older set (`setExerciseLoadMode`), so the
 * history below carries `loadMode: 'one'` and the exercise is now 'side'.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { LoadMode, LogType } from '@/tracker/engine/logTypes';
import { exerciseRecords, setCounting, type RecordSession, type RecordSet } from '@/tracker/engine/records';
import { liveRecordHits, toastHit, type PriorBests } from '@/tracker/services/liveRecords';
import { priorBestsFrom } from '@/tracker/services/recordsService';
import type { DraftSet } from '@/tracker/store/activeWorkoutStore';

const rule = (loadMode: LoadMode) => ({ logType: 'weight_reps' as LogType, loadMode, bwShare: 0 });

let n = 0;
const session = (dateISO: string, sets: RecordSet[]): RecordSession => {
  n += 1;
  return { sessionId: `s${n}`, dateISO, startedAt: n, sets };
};
const sets = (mode: LoadMode | null, kg: number, reps: number[]): RecordSet[] => reps.map((r) => ({ weightKg: kg, reps: r, ...(mode ? { loadMode: mode } : {}) }));
const tick = (weightKg: number, reps: number): DraftSet => {
  n += 1;
  return { key: `k${n}`, weightKg, reps, isWarmup: false, done: true };
};
const card = (bests: PriorBests | null, loadMode: LoadMode, ticks: DraftSet[]) => ({
  key: 'c',
  exerciseId: 'preacher',
  bests,
  sets: ticks,
  logType: 'weight_reps' as LogType,
  loadMode,
});
const bestsFor = (history: RecordSession[], mode: LoadMode): PriorBests | null =>
  priorBestsFrom(exerciseRecords(history, rule(mode), []), { bwShare: 0, loadMode: mode }, [], '2026-11-05');

/** 22 Oct, Pull 1, "weight as typed" (stamped 'one' when he switched). */
const oct22 = (): RecordSession => session('2026-10-22', sets('one', 10, [12, 15, 15, 15, 11]));

describe('R-358: the reported case — "one side at a time" after "weight as typed"', () => {
  it('a set\'s counting is its own, else the exercise\'s', () => {
    expect(setCounting({ loadMode: 'one' }, rule('side'))).toBe('one');
    expect(setCounting({}, rule('side'))).toBe('side');
    expect(setCounting({ loadMode: null }, rule('both'))).toBe('both');
  });

  it('10 kg × 13 per side after 10 kg × 15 as typed: no pop-up (bests read after the switch)', () => {
    const bests = bestsFor([oct22()], 'side');
    // No set has been logged "one side at a time" yet: nothing to beat, nothing announced.
    expect(bests).toBeNull();
    const s = tick(10, 13);
    expect(toastHit([card(bests, 'side', [s])], 'c', s.key)).toBeNull();
  });

  it('10 kg × 13 per side: no pop-up when the switch happens mid-workout (bests read as typed)', () => {
    // The card's bests were read at the start, under "weight as typed": 150 kg best set.
    const bests = bestsFor([oct22()], 'one')!;
    expect(bests.by?.best_set).toBe(150);
    expect(bests.mode).toBe('one');
    const s = tick(10, 13);
    expect(liveRecordHits(card(bests, 'side', [s])).size).toBe(0);
    expect(toastHit([card(bests, 'side', [s])], 'c', s.key)).toBeNull();
  });

  it('the saved workout shows no record either (finish screen, history badges, records list)', () => {
    const today = session('2026-11-05', sets(null, 10, [13, 13, 12]));
    const r = exerciseRecords([oct22(), today], rule('side'), []);
    expect(r.events.filter((e) => e.sessionId === today.sessionId)).toEqual([]);
    // The records list shows the current counting's bests: 10 × 13 per side = 260 kg.
    expect(r.bests.find((b) => b.kind === 'best_set')?.value).toBe(260);
  });
});

describe('R-358: a real record within one counting still fires', () => {
  it('"one side at a time" 10 × 13, then 10 × 14: "Most lifted in one set"', () => {
    const history = [oct22(), session('2026-11-05', sets(null, 10, [13]))];
    const bests = bestsFor(history, 'side')!;
    expect(bests.by?.best_set).toBe(260);
    const s = tick(10, 14);
    const hit = toastHit([card(bests, 'side', [s])], 'c', s.key);
    expect(hit?.kind === 'best_set' || hit?.all?.some((h) => h.kind === 'best_set')).toBe(true);
    expect((hit?.all ?? [hit]).find((h) => h?.kind === 'best_set')?.value).toBe(280);
  });

  it('the saved workout records it too', () => {
    const history = [oct22(), session('2026-11-05', sets(null, 10, [13]))];
    const later = session('2026-11-08', sets(null, 10, [14]));
    const r = exerciseRecords([...history, later], rule('side'), []);
    expect(r.events.filter((e) => e.sessionId === later.sessionId && e.kind === 'best_set').map((e) => [e.value, e.previous])).toEqual([[280, 260]]);
  });
});

describe('R-358: switching back compares with the old sets of that counting', () => {
  const back = (): RecordSession[] => [oct22(), session('2026-11-05', sets('side', 10, [13, 13, 12]))];

  it('back to "weight as typed": the bests are the 22 Oct ones (150 kg), not the per-side 260', () => {
    const bests = bestsFor(back(), 'one')!;
    expect(bests.by?.best_set).toBe(150);
    expect(bests.by?.best_session).toBe(680);
  });

  it('10 kg × 14 as typed is no record; 10 kg × 16 is', () => {
    const bests = bestsFor(back(), 'one')!;
    const low = tick(10, 14);
    expect(toastHit([card(bests, 'one', [low])], 'c', low.key)).toBeNull();
    const high = tick(10, 16);
    const hit = toastHit([card(bests, 'one', [high])], 'c', high.key);
    expect((hit?.all ?? [hit]).find((h) => h?.kind === 'best_set')?.value).toBe(160);
  });

  it('the history list agrees: only the as-typed workout that beat 22 Oct is a record', () => {
    const history = back();
    const later = session('2026-11-12', sets(null, 10, [16]));
    const r = exerciseRecords([...history, later], rule('one'), []);
    const news = r.events.filter((e) => e.kind === 'best_set').map((e) => [e.sessionId, e.value, e.previous]);
    expect(news).toEqual([[later.sessionId, 160, 150]]);
  });
});

describe('R-358: "Most lifted in one workout" follows the same rule', () => {
  it('three per-side sets (780 kg) after a 680 kg as-typed workout: no pop-up, no saved record', () => {
    const bests = bestsFor([oct22()], 'one')!;
    const ticks = [tick(10, 13), tick(10, 13), tick(10, 13)];
    const hits = liveRecordHits(card(bests, 'side', ticks));
    expect([...hits.values()].flatMap((h) => h.all ?? [h]).map((h) => h.kind)).not.toContain('best_session');
    const today = session('2026-11-05', sets(null, 10, [13, 13, 13]));
    const r = exerciseRecords([oct22(), today], rule('side'), []);
    expect(r.events.filter((e) => e.kind === 'best_session')).toEqual([]);
  });

  it('a bigger per-side workout after a per-side one is announced', () => {
    const history = [oct22(), session('2026-11-05', sets(null, 10, [13, 13]))];
    const bests = bestsFor(history, 'side')!;
    expect(bests.by?.best_session).toBe(520);
    const ticks = [tick(10, 13), tick(10, 13), tick(10, 1)];
    const hits = liveRecordHits(card(bests, 'side', ticks));
    expect(hits.get(ticks[2].key)?.all?.map((h) => [h.kind, h.value])).toContainEqual(['best_session', 540]);
  });

  it('"weight as typed" back after per-side: compared with the as-typed workouts only', () => {
    const history = [oct22(), session('2026-11-05', sets('side', 10, [13, 13, 13]))];
    const r = exerciseRecords([...history, session('2026-11-12', sets(null, 10, [15, 15, 15, 15, 12]))], rule('one'), []);
    expect(r.events.filter((e) => e.kind === 'best_session').map((e) => [e.value, e.previous])).toEqual([[720, 680]]);
  });
});

describe('R-358: the second false pop-up (owner, 12:48) — "Most lifted in one workout · 1,020 kg"', () => {
  it('10 × 18, 10 × 18, 10 × 15 per side after a 680 kg as-typed workout: no pop-up, no medal', () => {
    for (const bests of [bestsFor([oct22()], 'one'), bestsFor([oct22()], 'side')]) {
      const ticks = [tick(10, 18), tick(10, 18), tick(10, 15)];
      const c = card(bests, 'side', ticks);
      expect(liveRecordHits(c).size).toBe(0);
      for (const s of ticks) expect(toastHit([c], 'c', s.key)).toBeNull();
    }
  });
});

describe('R-362: at most one record pop-up per exercise per workout', () => {
  it('a later record of the same exercise keeps its medal but does not pop up', () => {
    const bests = bestsFor([oct22()], 'one')!;
    const a = tick(10, 16);
    const b = tick(10, 17);
    expect(toastHit([card(bests, 'one', [a])], 'c', a.key)).not.toBeNull();
    const c = card(bests, 'one', [a, b]);
    // afterTick marks the exercise once its pop-up showed.
    const shown = { ...c, recordToasted: true };
    expect(liveRecordHits(shown).get(b.key)).toBeTruthy(); // the medal
    expect(toastHit([shown], 'c', b.key)).toBeNull(); // no second pop-up
    // ... nor on the same exercise's other card, nor for an untick + retick of the first set.
    const other = { ...card(bests, 'one', [tick(10, 20)]), key: 'c2' };
    expect(toastHit([shown, other], 'c2', other.sets[0].key)).toBeNull();
    expect(toastHit([shown], 'c', a.key)).toBeNull();
  });

  it('editing a ticked set (13 → 18) never pops up: typing does not run the tick follow-up', () => {
    const src = readFileSync(join(__dirname, '..', '..', 'src', 'tracker', 'services', 'tickFollowUp.ts'), 'utf8');
    expect(src).toMatch(/showRecord\([^)]*\)[^;]*;\s*\/\/[^\n]*\n\s*st\.markRecordToasted\(ex\.exerciseId\)/);
    const store = readFileSync(join(__dirname, '..', '..', 'src', 'tracker', 'store', 'activeWorkoutStore.ts'), 'utf8');
    const update = store.slice(store.indexOf('    updateSet: '), store.indexOf('\n    },', store.indexOf('    updateSet: ')));
    expect(update.length).toBeGreaterThan(0);
    expect(update).not.toMatch(/afterTick|toastHit|showRecord/);
  });

  it('another exercise still gets its own pop-up', () => {
    const bests = bestsFor([oct22()], 'one')!;
    const a = tick(10, 16);
    const shown = { ...card(bests, 'one', [a]), recordToasted: true };
    const b = tick(10, 16);
    const bench = { ...card(bests, 'one', [b]), key: 'b', exerciseId: 'bench' };
    expect(toastHit([shown, bench], 'b', b.key)).not.toBeNull();
  });
});

describe('R-358: one counting all along is unchanged', () => {
  it('an older draft (bests without a counting) judges every set as before', () => {
    const old = { ...bestsFor([oct22()], 'one')! };
    delete old.mode;
    const s = tick(10, 16);
    expect(liveRecordHits(card(old, 'one', [s])).get(s.key)).toBeTruthy();
  });
});

describe('R-358 UAT flow c, exactly: 10 × 19 per side after a 360 kg per-side best must pop up', () => {
  // Flow a: "Weight as typed" 10 × 15, 10 × 12 (stamped 'one' when flow b switched). Flow b: "One side
  // at a time" 10 × 18 (13 edited to 18), 10 × 18, 10 × 15. Flow c, later (after midnight): 10 × 19.
  const flowA = (): RecordSession => session('2026-11-05', sets('one', 10, [15, 12]));
  const flowB = (mode: LoadMode | null): RecordSession => session('2026-11-05', sets(mode, 10, [18, 18, 15]));

  for (const stamped of [null, 'side'] as const) {
    it(`fires with flow b's sets saved as ${stamped ?? 'the exercise counting'}`, () => {
      const bests = bestsFor([flowA(), flowB(stamped)], 'side')!;
      expect(bests.mode).toBe('side');
      expect(bests.by?.best_set).toBe(360);
      const s = tick(10, 19);
      // The card also holds the two rows not yet done (pre-filled from last time).
      const open = [{ ...tick(10, 18), done: false }, { ...tick(10, 15), done: false }];
      const hit = toastHit([card(bests, 'side', [s, ...open])], 'c', s.key);
      expect(hit).not.toBeNull();
      expect((hit?.all ?? [hit]).find((h) => h?.kind === 'best_set')?.value).toBe(380);
      // R-362: then 10 × 20 keeps its medal but no second pop-up.
      const s2 = tick(10, 20);
      const shown = { ...card(bests, 'side', [s, s2]), recordToasted: true };
      expect(liveRecordHits(shown).get(s2.key)).toBeTruthy();
      expect(toastHit([shown], 'c', s2.key)).toBeNull();
    });
  }
});
