import { describe, expect, it } from 'vitest';

import { countOf } from '../../src/crm/logic/plural';

describe('countOf (U-A8: "1 members")', () => {
  it('says one thing in the singular', () => {
    expect(countOf(1, 'member')).toBe('1 member');
    expect(countOf(1, 'check-in')).toBe('1 check-in');
  });

  it('says none and many in the plural', () => {
    expect(countOf(0, 'member')).toBe('0 members');
    expect(countOf(128, 'payment')).toBe('128 payments');
  });

  it('takes an irregular plural', () => {
    expect(countOf(2, 'person', 'people')).toBe('2 people');
    expect(countOf(1, 'person', 'people')).toBe('1 person');
  });
});
