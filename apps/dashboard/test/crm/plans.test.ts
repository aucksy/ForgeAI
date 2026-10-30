// T66 (#30, option A): which admin-app pages are Pro, and the words a Starter gym sees.
import { describe, expect, it } from 'vitest';

import { PRO_FEATURES, hasFeature } from '@forgeai/theme';

import { PRO_HOW, PRO_LINE, PRO_PAGE_TITLE, PRO_TITLE, packFromRow, proFeatureOfPage } from '../../src/crm/plan/pack';

describe('Pro pages', () => {
  it('maps each Pro page to its feature', () => {
    expect(proFeatureOfPage('shop', undefined)).toBe('shop');
    expect(proFeatureOfPage('challenges', undefined)).toBe('challenge');
    expect(proFeatureOfPage('workouts', undefined)).toBe('trainerPlans');
    expect(proFeatureOfPage('diet', undefined)).toBe('trainerPlans');
    expect(proFeatureOfPage('numbers', undefined)).toBe('yourNumbers');
    expect(proFeatureOfPage('settings', 'branding')).toBe('branding');
  });

  it('leaves Starter pages alone', () => {
    for (const head of ['today', 'members', 'fees', 'checkins', 'messages', 'staff']) expect(proFeatureOfPage(head, undefined)).toBeNull();
    expect(proFeatureOfPage('settings', undefined)).toBeNull();
  });

  it('a Starter gym is only stopped once the switch is on', () => {
    expect(hasFeature({ plan: 'starter' }, 'shop')).toBe(true);
    expect(hasFeature({ plan: 'starter' }, 'shop', true)).toBe(false);
    expect(hasFeature({ plan: packFromRow({ pack: null }) }, 'shop', true)).toBe(true);
    expect(hasFeature({ plan: packFromRow(null) }, 'shop', true)).toBe(true);
  });
});

describe('the words', () => {
  const all = [PRO_TITLE, PRO_HOW, ...Object.values(PRO_LINE), ...Object.values(PRO_PAGE_TITLE)];

  it('has a line for every Pro feature', () => {
    for (const f of PRO_FEATURES) expect(PRO_LINE[f]).toMatch(/Pro pack\.$/);
  });

  it('never uses the banned member words, a price or a promise', () => {
    for (const w of all) {
      expect(w).not.toMatch(/\bvolume\b|\bPRs?\b|\bsessions?\b/i);
      expect(w).not.toMatch(/₹|Rs\.?\s?\d|\bfree\b|\bguarantee/i);
    }
  });
});
