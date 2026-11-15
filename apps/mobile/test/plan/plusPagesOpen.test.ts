/**
 * F217 (0.78.0 review, R-560): with MettleUp Plus switched off, a link (mettleup://plus, mettleup://find-gym) must
 * not open the Plus page (prices, Buy) or the "Find my gym" page ("every feature free"). QA builds keep both open
 * for the cloud phone test (uat-rel-r461-plus.yaml opens the Plus page with the switch off, then on).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-constants', () => ({ default: { expoConfig: { extra: {} } } }));
vi.mock('expo-modules-core', () => ({ requireOptionalNativeModule: () => null }));

import { MEMBER_PLAN_GATE_ON } from '@forgeai/theme';

import { plusPagesOpen } from '@/plan/memberPlan';

describe('F217: the Plus and Find my gym pages follow the Plus switch', () => {
  it('store build, switched off (as shipped): both pages stay closed', () => {
    expect(MEMBER_PLAN_GATE_ON).toBe(false);
    expect(plusPagesOpen(false)).toBe(false);
    expect(plusPagesOpen(false, false)).toBe(false);
  });

  it('store build, switched on: both pages open', () => {
    expect(plusPagesOpen(false, true)).toBe(true);
  });

  it('QA build with the plan stand-in: open with the switch off and on, for the tests', () => {
    expect(plusPagesOpen(true)).toBe(true);
    expect(plusPagesOpen(true, false)).toBe(true);
    expect(plusPagesOpen(true, true)).toBe(true);
  });

  it('both routes are wrapped in the gate (a link lands on the route file itself)', () => {
    for (const file of ['plus.tsx', 'find-gym.tsx']) {
      const src = readFileSync(resolve(__dirname, '../../src/app', file), 'utf8');
      const def = src.match(/export default function (\w+)\(\) \{\s*return \(\s*<PlusPageGate page="[^"]+">/);
      expect(def, file).not.toBeNull();
    }
  });
});
