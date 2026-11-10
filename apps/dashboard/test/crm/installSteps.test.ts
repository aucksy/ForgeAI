// R-446 (owner, 10 Nov 2026): the iPhone install steps must match iOS 26 Safari (Share sits behind •••) and
// name the extra sign-in, since a home-screen web app on iPhone does not share Safari's sign-in.
import { describe, expect, it } from 'vitest';

import { installSteps, platformOf } from '../../src/crm/install';

const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1';
const CHROME_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/142.0 Mobile/15E148 Safari/604.1';

describe('install steps', () => {
  it('iPhone Safari: dots, Share, Add to Home Screen, then sign in once more', () => {
    const s = installSteps(platformOf(SAFARI), SAFARI);
    expect(s[0]).toContain('•••');
    expect(s[1]).toContain('Share');
    expect(s.join(' ')).toContain('Add to Home Screen');
    expect(s[s.length - 1]).toContain('Sign in once more');
  });
  it('iPhone Chrome: the Share icon is in the address bar, no dots step', () => {
    const s = installSteps(platformOf(CHROME_IOS), CHROME_IOS);
    expect(s[0]).toContain('Share icon');
    expect(s.join(' ')).not.toContain('•••');
  });
  it('Android and computer keep their own steps', () => {
    expect(installSteps('android', 'android').join(' ')).toContain('Install app');
    expect(installSteps('computer', '').join(' ')).toContain('install icon');
  });
});
