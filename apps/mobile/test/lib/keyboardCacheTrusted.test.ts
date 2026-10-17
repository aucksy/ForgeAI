/**
 * UAT U-M6: after the app was away, React Native's "keyboard is open" is not believed until the
 * keyboard really shows again (the tab bar hid itself for a keyboard Android had already closed).
 */
import { describe, expect, it } from 'vitest';

import { keyboardCacheTrusted } from '@/lib/keyboardRoom';

describe('keyboardCacheTrusted', () => {
  it('going to the background drops the belief; the next real keyboard brings it back', () => {
    let t = true;
    t = keyboardCacheTrusted(t, 'background');
    expect(t).toBe(false);
    t = keyboardCacheTrusted(t, 'hide');
    expect(t).toBe(false);
    t = keyboardCacheTrusted(t, 'show');
    expect(t).toBe(true);
  });

  it('a hide while trusted changes nothing', () => {
    expect(keyboardCacheTrusted(true, 'hide')).toBe(true);
  });
});
