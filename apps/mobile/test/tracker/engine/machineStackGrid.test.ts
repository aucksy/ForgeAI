import { describe, expect, it } from 'vitest';

import { buildLadder, downRungKg, stackGrid, upRungsKg } from '@/tracker/engine/weightLadder';

// R-310 (owner, 3 Nov 2026): Pec Deck Fly suggested 38 kg after 40 kg. "Weight increments should
// only be 2.5 or 5 kg. For this machine I only have 5 kg increments."
describe('R-310 machine and cable weights stay on the stack grid', () => {
  it('pec deck (catalogue 5 kg): an odd 38 kg in the history is never suggested', () => {
    const l = buildLadder([45, 45, 45, 40, 38, 25, 50], 'own', { catalogStepKg: 5, units: 'metric' });
    expect(l.rungs).not.toContain(38);
    expect(downRungKg(40, l, 0.05)).toBe(35);
    expect(upRungsKg(40, 1, l)[0]).toBe(45);
  });

  it('a learned 2 kg jump on a 5 kg stack becomes 5 kg', () => {
    const l = buildLadder([40, 40, 45], 'own', { catalogStepKg: 5, learnedStepKg: 2, units: 'metric' });
    expect(l.step).toBe(5);
  });

  it('a cable (catalogue 2.5 kg) keeps 2.5 kg steps and drops 21 kg', () => {
    const l = buildLadder([20, 22.5, 25, 27.5, 21], 'own', { catalogStepKg: 2.5, units: 'metric' });
    expect(l.rungs).not.toContain(21);
    expect(l.rungs).toContain(22.5);
  });

  it('a 5 kg catalogue machine used in 2.5 kg steps keeps 2.5', () => {
    expect(stackGrid([40, 42.5, 45, 47.5], 5)).toBe(2.5);
    expect(stackGrid([40, 45, 50, 55, 38], 5)).toBe(5);
    expect(stackGrid([], 5)).toBe(5);
    expect(stackGrid([40, 45], 2.5)).toBe(2.5);
  });
});

describe('R-310 an odd stack keeps its own weights', () => {
  it('a 7 kg cable stack (12/19/26/33/40) is not forced onto 2.5 kg', () => {
    expect(stackGrid([12, 19, 26, 33, 40], 2.5)).toBeNull();
  });
});
