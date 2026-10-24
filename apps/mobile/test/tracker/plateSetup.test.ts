/**
 * Oct 2026 — "your gym's plates and bars" (Hevy: Settings → Workouts → Plate Calculator,
 * "Available Equipment → Manage"). The pure maths with custom plate sets.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { KG_PER_LB } from '@/lib/units';
import {
  addPlate,
  allPlates,
  chooseBar,
  cleanPlateSetup,
  computePlates,
  EMPTY_SETUP,
  gymBarChoicesKg,
  gymBarKg,
  gymPlatesKg,
  isExtraPlate,
  plateOn,
  plateSetupLine,
  platesKg,
  removePlate,
  togglePlate,
  type PlateSetup,
} from '@/tracker/services/plateMath';
import { showW } from '@/tracker/components/unitText';

const lb = (n: number): number => n * KG_PER_LB;
const ok = (r: PlateSetup | string): PlateSetup => {
  if (typeof r === 'string') throw new Error(r);
  return r;
};

describe('nothing changed = the calculator as before', () => {
  it('kg: every standard plate, the 20 kg bar', () => {
    expect(gymPlatesKg(EMPTY_SETUP, 'metric')).toEqual([...platesKg('metric')]);
    expect(gymBarKg(EMPTY_SETUP, 'metric')).toBe(20);
    expect(gymBarChoicesKg(EMPTY_SETUP, 'metric')).toEqual([20, 15, 10]);
    expect(plateSetupLine(EMPTY_SETUP, 'metric')).toBe('20 kg bar · 7 plate sizes');
  });

  it('lb: every pound plate, the 45 lb bar', () => {
    expect(gymPlatesKg(EMPTY_SETUP, 'imperial')).toEqual([...platesKg('imperial')]);
    expect(showW(gymBarKg(EMPTY_SETUP, 'imperial'), 'imperial')).toBe('45');
    expect(plateSetupLine(EMPTY_SETUP, 'imperial')).toBe('45 lb bar · 6 plate sizes');
  });

  it('the old answers stay the same on the full set', () => {
    expect(computePlates(100).perSide).toEqual([25, 15]);
    expect(computePlates(72.5).perSide).toEqual([25, 1.25]);
    expect(computePlates(lb(225), lb(45), platesKg('imperial')).perSide.map((p) => showW(p, 'imperial'))).toEqual(['45', '45']);
  });
});

describe('a gym without 2.5 kg plates', () => {
  const setup = togglePlate(EMPTY_SETUP, 2.5, false);

  it('leaves 2.5 out and says so in the line', () => {
    expect(plateOn(setup, 2.5)).toBe(false);
    expect(gymPlatesKg(setup, 'metric')).toEqual([25, 20, 15, 10, 5, 1.25]);
    expect(plateSetupLine(setup, 'metric')).toBe('20 kg bar · 6 plate sizes');
  });

  it('makes 2.5 a side from two 1.25s', () => {
    const r = computePlates(65, 20, gymPlatesKg(setup, 'metric')); // 22.5 a side
    expect(r.exact).toBe(true);
    expect(r.perSide).toEqual([20, 1.25, 1.25]);
    expect(r.perSide).not.toContain(2.5);
  });

  it('switching it back on restores the full set', () => {
    expect(gymPlatesKg(togglePlate(setup, 2.5, true), 'metric')).toEqual([...platesKg('metric')]);
  });
});

describe('only plates the gym has; nearest below AND above', () => {
  it('a target the plates cannot make gives the nearest lower and higher loads', () => {
    const plates = gymPlatesKg(togglePlate(togglePlate(EMPTY_SETUP, 1.25, false), 2.5, false), 'metric'); // smallest is 5
    const r = computePlates(67, 20, plates); // 23.5 a side
    expect(r.exact).toBe(false);
    expect(r.achievableKg).toBe(60); // 20 a side
    expect(r.perSide).toEqual([20]);
    expect(r.higherKg).toBe(70); // 25 a side
    expect(r.higherPerSide).toEqual([25]);
  });

  it('the old 101 kg case: 100 below, 102.5 above', () => {
    const r = computePlates(101);
    expect(r.achievableKg).toBe(100);
    expect(r.higherKg).toBe(102.5);
    expect(r.higherPerSide).toEqual([25, 15, 1.25]);
  });

  it('exact targets have no "next up"', () => {
    const r = computePlates(100);
    expect(r.higherKg).toBeNull();
    expect(r.higherPerSide).toBeNull();
  });

  it('finds an exact load greedy missed (only 15 and 10 kg plates)', () => {
    const r = computePlates(60, 20, [15, 10]); // 20 a side = 10 + 10, not 15 + nothing
    expect(r.exact).toBe(true);
    expect(r.perSide).toEqual([10, 10]);
  });

  it('no plates on: just the bar, nothing above', () => {
    const r = computePlates(60, 20, []);
    expect(r.perSide).toEqual([]);
    expect(r.achievableKg).toBe(20);
    expect(r.exact).toBe(false);
    expect(r.higherKg).toBeNull();
    const none = standardOff();
    expect(gymPlatesKg(none, 'metric')).toEqual([]);
    expect(plateSetupLine(none, 'metric')).toBe('20 kg bar · no plates on');
  });

  it('never uses a plate that is off', () => {
    const plates = gymPlatesKg(togglePlate(EMPTY_SETUP, 25, false), 'metric');
    for (const t of [60, 100, 140, 182.5]) expect(computePlates(t, 20, plates).perSide).not.toContain(25);
  });

  it('a huge target with tiny plates stays quick and still answers', () => {
    const t0 = Date.now();
    const r = computePlates(2000, 20, [25, 0.1]);
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(r.achievableKg).toBeLessThanOrEqual(2000);
    expect(r.perSide.length).toBeGreaterThan(0);
  });
});

describe('review fix: standard sets show the same stacks as the old greedy fill', () => {
  /** The calculator before Oct 2026, copied verbatim (heaviest-first greedy). */
  function oldGreedy(targetKg: number, barKg: number, plates: readonly number[]): { perSide: number[]; achievableKg: number } {
    if (!(targetKg > barKg)) return { perSide: [], achievableKg: barKg };
    let remaining = (targetKg - barKg) / 2;
    const perSide: number[] = [];
    for (const p of plates) {
      while (remaining + 1e-6 >= p) {
        perSide.push(p);
        remaining -= p;
      }
    }
    return { perSide, achievableKg: barKg + 2 * perSide.reduce((a, b) => a + b, 0) };
  }

  it('lb: 50 to 600 lb in 5 lb steps, identical stacks (165 lb = 45 + 10 + 5, not 35 + 25)', () => {
    const plates = gymPlatesKg(EMPTY_SETUP, 'imperial');
    const bar = gymBarKg(EMPTY_SETUP, 'imperial');
    for (let t = 50; t <= 600; t += 5) {
      const now = computePlates(lb(t), bar, plates);
      const old = oldGreedy(lb(t), bar, plates);
      expect(now.perSide, `${t} lb`).toEqual(old.perSide);
      expect(now.achievableKg, `${t} lb`).toBeCloseTo(old.achievableKg, 6);
    }
    expect(computePlates(lb(165), bar, plates).perSide.map((p) => showW(p, 'imperial'))).toEqual(['45', '10', '5']);
    expect(computePlates(lb(255), bar, plates).perSide.map((p) => showW(p, 'imperial'))).toEqual(['45', '45', '10', '5']);
  });

  it('kg: 20 to 400 kg in 2.5 kg steps, identical stacks', () => {
    const plates = gymPlatesKg(EMPTY_SETUP, 'metric');
    for (let i = 0; i <= (400 - 20) / 2.5; i++) {
      const t = 20 + i * 2.5;
      const now = computePlates(t, 20, plates);
      const old = oldGreedy(t, 20, plates);
      expect(now.perSide, `${t} kg`).toEqual(old.perSide);
      expect(now.achievableKg, `${t} kg`).toBeCloseTo(old.achievableKg, 6);
    }
  });
});

function standardOff(): PlateSetup {
  return [25, 20, 15, 10, 5, 2.5, 1.25].reduce((s, n) => togglePlate(s, n, false), EMPTY_SETUP);
}

describe('extra plates the member adds', () => {
  it('a 0.5 kg plate joins the set, heaviest first, and can be removed', () => {
    const s = ok(addPlate(EMPTY_SETUP, 0.5, 'metric'));
    expect(allPlates(s, 'metric')).toEqual([25, 20, 15, 10, 5, 2.5, 1.25, 0.5]);
    expect(isExtraPlate(s, 0.5, 'metric')).toBe(true);
    expect(isExtraPlate(s, 1.25, 'metric')).toBe(false);
    const r = computePlates(21, 20, gymPlatesKg(s, 'metric')); // 0.5 a side
    expect(r.exact).toBe(true);
    expect(r.perSide).toEqual([0.5]);
    expect(gymPlatesKg(removePlate(s, 0.5), 'metric')).toEqual([...platesKg('metric')]);
  });

  it('a 1.25 kg plate in a gym that had it switched off just switches it on', () => {
    const off = togglePlate(EMPTY_SETUP, 1.25, false);
    const s = ok(addPlate(off, 1.25, 'metric'));
    expect(plateOn(s, 1.25)).toBe(true);
    expect(s.extra).toEqual([]);
  });

  it('says plainly why a plate was not added', () => {
    expect(addPlate(EMPTY_SETUP, null, 'metric')).toBe('Type a plate weight, like 1.25.');
    expect(addPlate(EMPTY_SETUP, 0, 'metric')).toBe('Type a plate weight, like 1.25.');
    expect(addPlate(EMPTY_SETUP, 0.01, 'metric')).toMatch(/Too light/);
    expect(addPlate(EMPTY_SETUP, 80, 'metric')).toMatch(/Too heavy/);
    expect(addPlate(EMPTY_SETUP, 20, 'metric')).toBe('20 kg plates are already on the list.');
  });

  it('lb: an extra 1.25 lb plate makes 137.5 lb exact', () => {
    const s = ok(addPlate(EMPTY_SETUP, 1.25, 'imperial'));
    const before = computePlates(lb(137.5), lb(45), gymPlatesKg(EMPTY_SETUP, 'imperial'));
    expect(before.exact).toBe(false);
    expect(showW(before.achievableKg, 'imperial')).toBe('135');
    expect(showW(before.higherKg as number, 'imperial')).toBe('140');
    const r = computePlates(lb(137.5), gymBarKg(s, 'imperial'), gymPlatesKg(s, 'imperial'));
    expect(r.exact).toBe(true);
    expect(r.perSide.map((p) => showW(p, 'imperial', 2))).toEqual(['45', '1.25']);
  });
});

describe('the bar', () => {
  it("a 15 kg women's bar: chosen, used, and the 20 kg bar saved as the standard", () => {
    const s = ok(chooseBar(EMPTY_SETUP, 15, 'metric'));
    expect(gymBarKg(s, 'metric')).toBe(15);
    expect(plateSetupLine(s, 'metric')).toBe('15 kg bar · 7 plate sizes');
    const r = computePlates(55, gymBarKg(s, 'metric'), gymPlatesKg(s, 'metric')); // 20 a side
    expect(r.barKg).toBe(15);
    expect(r.perSide).toEqual([20]);
    expect(ok(chooseBar(s, 20, 'metric')).bar).toBeNull();
  });

  it('a custom 12 kg bar shows as its own chip', () => {
    const s = ok(chooseBar(EMPTY_SETUP, 12, 'metric'));
    expect(gymBarChoicesKg(s, 'metric')).toEqual([20, 15, 12, 10]);
    expect(computePlates(32, 12, gymPlatesKg(s, 'metric')).perSide).toEqual([10]);
  });

  it('lb: a 25 lb EZ bar', () => {
    const s = ok(chooseBar(EMPTY_SETUP, 25, 'imperial'));
    expect(gymBarChoicesKg(s, 'imperial').map((b) => showW(b, 'imperial'))).toEqual(['45', '35', '25', '15']);
    const r = computePlates(lb(75), gymBarKg(s, 'imperial'), gymPlatesKg(s, 'imperial'));
    expect(r.exact).toBe(true);
    expect(r.perSide.map((p) => showW(p, 'imperial'))).toEqual(['25']);
  });

  it('refuses a bar that is not a bar, in plain words', () => {
    expect(chooseBar(EMPTY_SETUP, null, 'metric')).toBe('Type the bar weight, like 15.');
    expect(chooseBar(EMPTY_SETUP, 0.5, 'metric')).toMatch(/Too light/);
    expect(chooseBar(EMPTY_SETUP, 500, 'imperial')).toMatch(/Too heavy for a bar. Use 150 lb or less./);
  });
});

describe('saved setups', () => {
  it('a damaged or missing blob falls back to the standard set', () => {
    expect(cleanPlateSetup(undefined)).toEqual(EMPTY_SETUP);
    expect(cleanPlateSetup('x')).toEqual(EMPTY_SETUP);
    expect(cleanPlateSetup({ off: [2.5, 'a', -1, 2.5], extra: [0.5, NaN], bar: 'big' })).toEqual({ off: [2.5], extra: [0.5], bar: null });
    expect(cleanPlateSetup({ off: [], extra: [], bar: 15 }).bar).toBe(15);
  });
});

describe('[source-text check] the screens use the gym setup', () => {
  const src = (p: string): string => readFileSync(resolve(__dirname, '../../src', p), 'utf8');
  it('the calculator reads the member’s plates and bar and links to the page', () => {
    const sheet = src('tracker/components/PlateCalcSheet.tsx');
    expect(sheet).toContain('gymPlatesKg(setup, units)');
    expect(sheet).toContain('gymBarKg(setup, units)');
    expect(sheet).toContain('Change plates');
    expect(sheet).toContain("'/settings/plates'");
    expect(sheet).toContain('[ForgeErr]');
    // Release A: a row of the Settings page's Workouts group.
    expect(src('components/settings/settingsLines.ts')).toContain("title: 'Plates and bars', href: '/settings/plates'");
    expect(src('app/settings/plates.tsx')).toContain('<PlateSetupCard />');
  });
});
