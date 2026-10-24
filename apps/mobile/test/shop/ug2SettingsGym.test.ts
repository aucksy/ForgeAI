/**
 * UAT U-G2: Settings → Your gym showed the gym name the member TYPED at onboarding, not the gym
 * they actually joined, and had no way to Leave. Now, when joined, the page (and the Settings row)
 * name the joined gym and link to the Shop tab, where Leave is; a solo member sees what they did.
 *
 * UAT U-M1: Settings → AI coach opened EMPTY from a direct link while the coach is off. It now
 * goes to Settings, as the coach tab goes to Workout.
 *
 * The pages are React screens (no renderer in this lane): their wiring is read from the source;
 * the choice of name is a pure function.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { settingsGymName } from '@/shop/gym';

const read = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8');
const LINK = { gymName: 'ForgeAI Test Gym' };

describe('U-G2: the gym Settings names', () => {
  it('joined: the joined gym, whatever was typed at onboarding', () => {
    expect(settingsGymName(LINK, 'Gold Gym Andheri')).toBe('ForgeAI Test Gym');
    expect(settingsGymName(LINK, '')).toBe('ForgeAI Test Gym');
  });

  it('not joined: what the member typed, or nothing', () => {
    expect(settingsGymName(null, '  Gold Gym Andheri ')).toBe('Gold Gym Andheri');
    expect(settingsGymName(null, '   ')).toBeNull();
    expect(settingsGymName(null, undefined)).toBeNull();
  });

  it('the Your gym page: joined → the joined gym and "Leave <gym>" on its own row (R-77, Release A A4)', () => {
    const page = read('src/app/settings/gym.tsx');
    expect(page).toMatch(/useGymShop\(/);
    expect(page).not.toMatch(/title="Shop and leave"/);
    expect(page).toMatch(/link\.gymName/);
    expect(page).toMatch(/<JoinedGymRows link=\{link\} \/>/);
    // A4: My membership lives on the Gym tab only; the gym's reminders on the one Reminders page.
    expect(page).not.toMatch(/<MembershipCard|GymRemindersSwitch/);
    const rows = read('src/components/settings/GymSettings.tsx');
    expect(rows).toMatch(/title=\{`Leave \$\{link\.gymName\}`\}/);
    expect(rows).toMatch(/askAndLeaveGym\(branded\)/);
    expect(read('src/app/settings/notifications.tsx')).toMatch(/<GymRemindersSwitch gymName=\{gymName\} \/>/);
  });

  it('the Settings list names the joined gym in its "Your gym" group (Leave <gym>)', () => {
    const list = read('src/app/settings/index.tsx');
    expect(list).toMatch(/gymName: link\?\.gymName \?\? null/);
    expect(list).toMatch(/<JoinedGymRows link=\{link\}/);
    expect(list).toMatch(/useGymShop\(/);
  });
});

describe('U-M1: Settings → AI coach with the coach off', () => {
  it('a direct link goes to Settings instead of opening an empty page', () => {
    const page = read('src/app/settings/coach.tsx');
    expect(page).toMatch(/<Redirect href="\/settings" \/>/);
    // The same test the Settings list uses to show the row.
    expect(page).toMatch(/PARTS\.has\('aiCoach'\) \|\| PARTS\.has\('voice'\)/);
  });
});
