/**
 * v0.47.0 release review fixes (FINDINGS U-M7, U-M8, U-G6), the parts that are pure or read from
 * the source (no React renderer in this lane). U-G6's flow runs against a fake gym server in
 * test/shop/ug1LeaveWithOrders.test.ts.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { switchReachWords } from '@/shop/gym';
import { shouldPlayTickPop, TICK_POP_FRESH_MS } from '@/tracker/lib/rpeTick';
import { useWorkoutUi } from '@/tracker/store/workoutUiStore';

const read = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8');

describe('U-M7: the ✓ pop plays once, right after the tick', () => {
  it('a fresh pop on a ticked set plays', () => {
    expect(shouldPlayTickPop({ at: 1000 }, true, 1000 + 400)).toBe(true);
  });
  it('an old pop (the row drawn again after a drag or a reopen) never plays late', () => {
    expect(shouldPlayTickPop({ at: 1000 }, true, 1000 + TICK_POP_FRESH_MS + 1)).toBe(false);
  });
  it('a set unticked since never pops; no pop, nothing', () => {
    expect(shouldPlayTickPop({ at: 1000 }, false, 1100)).toBe(false);
    expect(shouldPlayTickPop(null, true, 1100)).toBe(false);
  });
  it('the store clears a pop once seen, and only that pop', () => {
    const ui = useWorkoutUi.getState();
    ui.popTick('ex1', 's1');
    const first = useWorkoutUi.getState().tickPop!;
    expect(first.at).toBeGreaterThan(0);
    ui.popTick('ex1', 's2');
    ui.clearTickPop(first.id); // an older id: the newer pop stays
    expect(useWorkoutUi.getState().tickPop?.setKey).toBe('s2');
    ui.clearTickPop(useWorkoutUi.getState().tickPop!.id);
    expect(useWorkoutUi.getState().tickPop).toBeNull();
  });
  it('SetRow clears the pop when it sees it and plays only when shouldPlayTickPop says so', () => {
    const src = read('src/tracker/components/SetRow.tsx');
    expect(src).toMatch(/shouldPlayTickPop\(tickPop, set\.done, Date\.now\(\)\)/);
    expect(src).toMatch(/clearTickPop\(tickPop\.id\)/);
  });
});

describe('U-M8: the RPE tick fills from the set as it is when the tick fires', () => {
  it('the fill is worked out inside the timer, from the store, not captured at the RPE pick', () => {
    const src = read('src/tracker/components/ExerciseLogCard.tsx');
    expect(src).not.toMatch(/const fill = row\?\.fill/);
    expect(src).toMatch(/toggleDone\(exKey, setKey, fillForSet\(ex, setKey, fillTargetRef\.current\)\)/);
  });
});

describe('U-G6: switching gyms asks the new gym first', () => {
  it('the new gym answered: go on', () => {
    expect(switchReachWords({ ok: true, data: { gymName: 'RAMS', joinCode: 'RAMS01', brand: null } }, 'Old Gym')).toBeNull();
  });
  it('no internet: says so, and that nothing was cancelled', () => {
    const w = switchReachWords({ ok: false, error: { kind: 'offline' } as never }, 'Old Gym');
    expect(w).toMatch(/Nothing was cancelled: you are still in Old Gym\./);
  });
  it('no gym has that code any more: says so', () => {
    expect(switchReachWords({ ok: true, data: null }, 'Old Gym')).toMatch(/not in use any more.*Nothing was cancelled/);
  });
});
