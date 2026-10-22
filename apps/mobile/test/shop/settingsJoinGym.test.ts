/**
 * Owner report, 17 Oct 2026: Settings → Your gym gave a member in no gym no way to join (the code
 * box was only on the Shop tab). The page now has "Join your gym" with the code box; Next opens the
 * invite screen, which shows the gym and asks before joining.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { joinPathFromSettings } from '@/shop/gym';

const read = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8');

describe('Settings → Your gym: join with a code', () => {
  it('a 6-letter code opens its invite screen, in capitals', () => {
    expect(joinPathFromSettings('rams01')).toBe('/j/RAMS01');
    expect(joinPathFromSettings(' RAM S01 ')).toBe('/j/RAMS01');
  });

  it('the gym link pasted from WhatsApp gives its code', () => {
    expect(joinPathFromSettings('Join us https://forgeai.aakashpahuja.in/j/RAMS01')).toBe('/j/RAMS01');
  });

  it('a short code, another link or nothing opens nothing', () => {
    expect(joinPathFromSettings('RAMS')).toBeNull();
    expect(joinPathFromSettings('https://example.com/x')).toBeNull();
    expect(joinPathFromSettings('')).toBeNull();
  });

  it('the page shows the join card only to a member in no gym', () => {
    const page = read('src/app/settings/gym.tsx');
    expect(page).toMatch(/link \? \(\s*<JoinedGymCard link=\{link\} \/>\s*\) : \(\s*<>\s*\{notice \? <DemoNote text=\{notice\} \/> : null\}\s*<GymCard \/>\s*<JoinGymCard \/>/);
  });

  it('the card goes through the invite screen (it asks before joining), never joins by itself', () => {
    const card = read('src/components/settings/JoinGymCard.tsx');
    expect(card).toMatch(/joinPathFromSettings\(code\)/);
    expect(card).toMatch(/router\.push\(path\)/);
    expect(card).not.toMatch(/joinFromInvite|apiJoin/);
    expect(card).toMatch(/accessibilityLabel="Gym code"/);
    // Member words: no "session", "volume" or "PR".
    expect(card).not.toMatch(/\b(session|volume|PR)\b/);
  });
});
