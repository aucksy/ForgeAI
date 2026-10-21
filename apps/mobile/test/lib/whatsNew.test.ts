import { describe, expect, it } from 'vitest';

import { WHATS_NEW, whatsNewToShow } from '@/lib/whatsNew';

describe("What's new after an update", () => {
  const v = '0.50.0';
  it('after an update the news shows once', () => {
    expect(whatsNewToShow(v, '0.49.0')).toEqual(WHATS_NEW[v]);
    expect(whatsNewToShow(v, v)).toBeNull(); // "Got it" pressed, or already remembered
  });
  it('the first version an install meets is not announced (fresh installs, the cloud phone tests)', () => {
    expect(whatsNewToShow(v, null)).toBeNull();
  });
  it('a version with no lines, or no version: nothing', () => {
    expect(whatsNewToShow('9.9.9', '0.49.0')).toBeNull();
    expect(whatsNewToShow(undefined, '0.49.0')).toBeNull();
  });
  it('member words never say volume, PR or session', () => {
    for (const lines of Object.values(WHATS_NEW)) for (const l of lines) expect(l).not.toMatch(/\b(volume|PR|session)\b/i);
  });
});
