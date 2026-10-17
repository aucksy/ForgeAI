/**
 * Audit C9-34: on the invite and check-in screens the gym's name is the heading; the buttons say
 * "Join this gym" / "Switch to this gym" / "Open the shop" and never repeat the name, so a long
 * name ("RAM'S FITNESS CLUB IMPACT") never wraps a button at the owner's text size.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const src = (f: string): string => readFileSync(join(__dirname, '../../src/shop', f), 'utf8');
/** Every `label=` given to a PrimaryButton / GhostButton in the file. */
const buttonLabels = (text: string): string[] =>
  [...text.matchAll(/<(?:Primary|Ghost)Button[^>]*?\slabel=(\{[^}]*\}|"[^"]*")/g)].map((m) => m[1]);

describe('C9-34: shop buttons never carry the gym name', () => {
  it('invite screen: Join / Switch to / Open the shop', () => {
    const t = src('InviteScreen.tsx');
    expect(t).toContain("'Join this gym'");
    expect(t).toContain("'Switch to this gym'");
    expect(t).toContain('label="Open the shop"');
    // The name is still on screen, as the heading.
    expect(t).toMatch(/accessibilityRole="header"[^>]*>\s*\{gym\.gymName\}/);
    for (const l of buttonLabels(t)) expect(l).not.toMatch(/gymName/);
  });

  it('check-in screen: Join this gym, under the "Check in at <gym>" heading', () => {
    const t = src('CheckInScreen.tsx');
    expect(t).toContain('label="Join this gym"');
    expect(t).toContain('checkInTitle(look.gym.gymName)');
    for (const l of buttonLabels(t)) expect(l).not.toMatch(/gymName/);
  });
});
