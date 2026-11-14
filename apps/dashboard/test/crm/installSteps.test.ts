// R-446 (owner, 10 Nov 2026): the iPhone install steps must match iOS 26 Safari (Share sits behind •••) and
// name the extra sign-in, since a home-screen web app on iPhone does not share Safari's sign-in.
import { describe, expect, it } from 'vitest';

import { installSteps, platformOf } from '../../src/crm/install';

const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1';
const CHROME_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/142.0 Mobile/15E148 Safari/604.1';

describe('install steps', () => {
  it('iPhone Safari: dots then Share in one step, Add to Home Screen, then sign in once more', () => {
    const s = installSteps(platformOf(SAFARI), SAFARI);
    expect(s[0]).toContain('•••');
    // Fresh-eyes (R-446): Share is in the same step, so someone who tapped the Share square never meets a lone
    // "Tap Share" step they cannot find; the bar's place is not named (it can be at the top).
    expect(s[0]).toContain('“Share”');
    expect(s.filter((x) => x.includes('Share'))).toHaveLength(1);
    expect(s.join(' ')).not.toContain('bottom');
    expect(s.join(' ')).toContain('If you see “Open as Web App”');
    expect(s.join(' ')).toContain('Add to Home Screen');
    expect(s[s.length - 1]).toContain('Sign in once more');
  });
  it('iPhone Chrome: the Share icon is in the address bar, no dots step', () => {
    const s = installSteps(platformOf(CHROME_IOS), CHROME_IOS);
    expect(s[0]).toContain('Share icon');
    expect(s.join(' ')).not.toContain('•••');
  });
  it('fresh eyes (14 Nov 2026): a phone-sized touch screen that says it is a computer is a phone; a touch laptop is a computer', () => {
    const DESKTOP = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0 Safari/537.36';
    // Chrome's "Desktop site" on an Android phone: a computer's name, a touch screen 412 px wide.
    expect(platformOf(DESKTOP, 5, 412)).toBe('android');
    expect(platformOf(DESKTOP, 1, 360)).toBe('android');
    // A touch laptop, a computer without touch, and a caller that does not know the screen.
    expect(platformOf(DESKTOP, 10, 1280)).toBe('computer');
    expect(platformOf(DESKTOP, 0, 390)).toBe('computer');
    expect(platformOf(DESKTOP, 5)).toBe('computer');
  });
  it('Android and computer keep their own steps', () => {
    expect(installSteps('android', 'android').join(' ')).toContain('Install app');
    expect(installSteps('computer', '').join(' ')).toContain('install icon');
  });
});
