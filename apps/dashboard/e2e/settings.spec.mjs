// UAT WP5 journey 10: Settings. The Dark/Light switch, and the data actions that wipe or replace
// records (U-A3): Load demo gym, Erase and start fresh, Start over with a new demo gym.
import { expect, test } from '@playwright/test';

import { addMember, expectFitsPhone, open, openApp, sheet, startDemo } from './support.mjs';

/** The page's own background colour, as the browser paints it. */
const background = (page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test('J10a Dark/Light: the colours change, and the choice is kept after a reload', async ({ page }) => {
  await openApp(page);
  await startDemo(page);
  const colours = page.getByRole('radiogroup', { name: 'Screen colours' }).first();
  await expect(colours.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');
  const dark = await background(page);

  await colours.getByRole('radio', { name: 'Light' }).tap();
  await expect(colours.getByRole('radio', { name: 'Light' })).toHaveAttribute('aria-checked', 'true');
  const light = await background(page);
  expect(light).not.toBe(dark);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await expect(colours.getByRole('radio', { name: 'Light' })).toHaveAttribute('aria-checked', 'true');
  expect(await background(page)).toBe(light);

  // And back to Dark, from Settings.
  await open(page, 'Settings');
  await colours.getByRole('radio', { name: 'Dark' }).tap();
  expect(await background(page)).toBe(dark);
  await page.reload();
  await expect(colours.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');
  expect(await background(page)).toBe(dark);
});

test('J10b Load demo gym and Erase and start fresh: say what they replace, then do exactly that (U-A3)', async ({ page }) => {
  await openApp(page);
  await startDemo(page);
  await open(page, 'Settings');
  const main = page.getByRole('main');
  // The demo gym of 17 Oct 2026 (a fixed seed: the same gym every time).
  const dataLine = main.getByText(/^\d+ members · \d+ memberships · \d+ payments · \d+ check-ins\./);
  await expect(dataLine).toContainText('128 members');
  const demoLine = (await dataLine.textContent()) ?? '';
  const [, payments, visits] = /(\d+) payments · (\d+) check-ins/.exec(demoLine) ?? [];

  // A real record next to the demo: one new member.
  await addMember(page, { name: 'Real Person', phone: '98290 80808' });
  await open(page, 'Settings');
  await expect(dataLine).toContainText('129 members');

  // Load demo gym: the warning names what goes. Cancel first: nothing changes.
  await page.getByRole('button', { name: 'Load demo gym' }).tap();
  const load = sheet(page, 'Load the demo gym?');
  await expect(load.getByRole('alert')).toHaveText(
    `This replaces everything in this browser: 129 members, ${payments} payments and ${visits} check-ins. You can’t undo this.`,
  );
  await expect(load).toContainText('This makes a sample gym with about 128 members');
  await load.getByRole('button', { name: 'Cancel' }).tap();
  await expect(load).toBeHidden();
  await expect(dataLine).toContainText('129 members');

  // Now confirm: back to exactly the demo gym; the real member is gone.
  await page.getByRole('button', { name: 'Load demo gym' }).tap();
  await load.getByRole('button', { name: 'Load demo gym' }).tap();
  await expect(page.getByText('Demo gym loaded.')).toBeVisible();
  await expect(dataLine).toHaveText(demoLine);
  await open(page, 'Members');
  await page.getByRole('searchbox').or(page.getByLabel('Search name or mobile number')).first().fill('Real Person');
  await expect(page.getByText('Nobody matches that')).toBeVisible();

  // Erase and start fresh: the warning, then an empty gym that keeps its name.
  await open(page, 'Settings');
  await page.getByRole('button', { name: 'Erase and start fresh' }).tap();
  const erase = sheet(page, 'Erase everything?');
  await expect(erase.getByRole('alert')).toHaveText(
    `This replaces everything in this browser: 128 members, ${payments} payments and ${visits} check-ins. You can’t undo this.`,
  );
  await expect(erase).toContainText('You will be left with an empty gym: no members, no plans, no payments.');
  await erase.getByRole('button', { name: 'Erase everything' }).tap();
  await expect(page.getByText('Started fresh.')).toBeVisible();
  await expect(dataLine).toHaveText(/^0 members · 0 memberships · 0 payments · 0 check-ins\./);
  await expect(page.getByRole('banner')).toContainText('Iron Temple Fitness');
  await open(page, 'Members');
  await expect(page.getByText('No members yet')).toBeVisible();
  await open(page, 'Plans');
  await expect(page.getByText('No plans yet')).toBeVisible();

  // After a reload it is still empty (nothing came back from storage).
  await page.reload();
  await open(page, 'Settings');
  await expect(dataLine).toHaveText(/^0 members · 0 memberships · 0 payments · 0 check-ins\./);
});

test('J10c Start over with a new demo gym: back to the first screen', async ({ page }) => {
  await openApp(page);
  await startDemo(page);
  await open(page, 'Settings');
  await page.getByRole('button', { name: 'Start over with a new demo gym' }).tap();
  const over = sheet(page, 'Start over with a new demo gym?');
  await expect(over).toContainText('gym code QA0001');
  await over.getByRole('button', { name: 'Start over' }).tap();
  await expect(page.getByRole('button', { name: 'Start demo' })).toBeVisible();
  // Nothing of the old demo is left: after a reload, still the first screen.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Start demo' })).toBeVisible();
});

test('J10d no internet at Start demo: the demo opens without the shop, in this browser only', async ({ page }) => {
  const server = await openApp(page, { offline: ['demo_start_gym'] });
  await page.getByRole('button', { name: 'Start demo' }).tap();
  await expect(page.getByRole('alert')).toContainText('internet');
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  // U-A9: the long "without the shop" button wraps; the screen stays as wide as the phone.
  await expectFitsPhone(page, 'on Welcome after a failed demo start');
  await page.getByRole('button', { name: 'Open the demo without the shop (works without internet)' }).tap();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  expect(server.calls).toContain('demo_start_gym (offline)');

  // A browser-only gym: the data actions are there, but no shop to start over or disconnect.
  await open(page, 'Settings');
  await expect(page.getByRole('main')).toContainText('128 members');
  await expect(page.getByRole('button', { name: 'Load demo gym' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Erase and start fresh' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start over with a new demo gym' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Disconnect the shop' })).toHaveCount(0);
});
