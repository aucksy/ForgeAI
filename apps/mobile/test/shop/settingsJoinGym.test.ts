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

  it('Release A (A2): a member in no gym joins on the Gym tab; Settings → Your gym goes there', () => {
    const page = read('src/app/settings/gym.tsx');
    expect(page).toMatch(/if \(hydrated && !link\) return <Redirect href="\/shop" \/>/);
    expect(page).not.toMatch(/<JoinGymCard|<GymCard/);
    const shop = read('src/shop/ShopScreen.tsx');
    expect(shop).toMatch(/\{notice \? <DemoNote text=\{notice\} \/> : null\}\s*<JoinGymCard scan \/>/);
    // The settings list's no-gym row opens the Gym tab.
    expect(read('src/components/settings/settingsLines.ts')).toMatch(/title: 'Join your gym', href: '\/shop'/);
  });

  it('the card also offers the poster scan (MettleUp’s own QR scanner, R-228)', () => {
    const card = read('src/components/settings/JoinGymCard.tsx');
    expect(card).toMatch(/label="Scan the poster"/);
    // UAT B-05: the scan comes before the typed code.
    expect(card.indexOf('label="Scan the poster"')).toBeLessThan(card.indexOf('<TextInput'));
    expect(card).toMatch(/router\.push\('\/scan'\)/);
    expect(read('src/app/scan.tsx')).toMatch(/ScanPosterScreen/);
    expect(read('src/shop/ShopScreen.tsx')).toMatch(/router\.push\('\/scan'\)/);
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
