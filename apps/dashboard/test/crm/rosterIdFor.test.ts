import { describe, expect, it } from 'vitest';

import { rosterIdFor } from '../../src/crm/shop/logic';

// R-85 (owner, 23 Oct 2026): a member who joined in the app opens their own page in the member list.
describe('rosterIdFor', () => {
  const members = [
    { id: 'a', phone: '+919876543210', archived: false },
    { id: 'b', phone: '+919811111111', archived: true },
    { id: 'c', phone: '+919811111111', archived: false },
  ];

  it('matches the same mobile written with or without +91', () => {
    expect(rosterIdFor('9876543210', members)).toBe('a');
    expect(rosterIdFor('+91 98765 43210', members)).toBe('a');
  });

  it('prefers a current member over an old record with the same mobile', () => {
    expect(rosterIdFor('9811111111', members)).toBe('c');
    expect(rosterIdFor('9811111111', [members[1]])).toBe('b');
  });

  it('gives null when nobody matches or the number is missing or short', () => {
    expect(rosterIdFor('9000000000', members)).toBeNull();
    expect(rosterIdFor(null, members)).toBeNull();
    expect(rosterIdFor('12345', members)).toBeNull();
  });
});
