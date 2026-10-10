import { describe, expect, it } from 'vitest';

import { fontsSettled } from '@/theme/fontGate';

describe('SH-02: fonts never hold the splash forever', () => {
  it('waits while fonts are still loading', () => {
    expect(fontsSettled(false, null)).toBe(false);
    expect(fontsSettled(false, undefined)).toBe(false);
  });
  it('goes on when fonts loaded', () => {
    expect(fontsSettled(true, null)).toBe(true);
  });
  it('goes on with the phone font when loading failed', () => {
    expect(fontsSettled(false, new Error('font file missing'))).toBe(true);
  });
});
