// R-449 (11 Nov 2026) UAT, at a 375 px phone and a 1366x768 computer. Pictures go to e2e/.results/uat (CI uploads
// them as "dashboard-uat-pictures"), named r449-*.png. The four R-447 fresh-eyes leftovers:
//  1. "Install the admin app" is on Settings' first tab, Gym (was under "Sign-in & data"); "MettleUp access" is on
//     Help and feedback (was under "Sign-in & data"), and Sign-in & data says where it went.
//  2. "Your gym’s records": "0 members · 0 memberships" is now "0 members · 0 plans sold (new and renewals)".
//  3. The demo card no longer says "You get a real gym code".
//  4. Hinglish says "6-digit PIN" (was "6 number ka PIN"), the same on every line.
//  Also: "You are signed out of this device." has Hinglish.
// The gym server is support.mjs FakeServer. Fake numbers only.
//
// UAT types: happy path (each moved card where it now is, the new lines), negative (the cards gone from the old tab,
// the old words gone, no Hinglish "6 number"), regression (MettleUp access still opens and closes support access;
// the install steps still open), setting change (Hinglish), edge (375 px, a big demo gym, a computer), interruption
// (signed out of this device, then the sign-in page in both languages).
import { mkdirSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { expectFitsPhone, open, openApp, openSettings, sheet, startDemo, startOnlineGym } from './support.mjs';

const DIR = 'e2e/.results/uat';
mkdirSync(DIR, { recursive: true });

async function shot(page, name, fullPage = false) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/r449-${name}.png`, fullPage });
}

const PHONE = { width: 375, height: 812 };
const COMPUTER = { width: 1366, height: 768 };
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';

const PHONE_INSTALL = 'Put the admin app on your phone';
const COMPUTER_INSTALL = 'Install the admin app on this computer';
const POINTER = 'MettleUp support can look at your records only if you let them. To let them, or to see when they looked: Help and feedback → MettleUp access.';
const DEMO_NEW =
  'Opens a sample gym with made-up members, payments and a shop. To try the member side too, join this gym from the MettleUp app on a phone and order something. The order shows up here.';
const DEMO_NEW_HI =
  'Ek sample gym khulta hai, jismein nakli members, payments aur shop hain. Member wala hissa bhi dekhna hai? Phone par MettleUp app se is gym ko join karo aur kuch order karo. Order yahan dikhega.';
const RECORDS = /^\d+ members? · \d+ plans? sold \(new and renewals\) · \d+ payments? · \d+ check-ins?\. Set up /;

const tabButton = (page, name) => page.getByRole('group', { name: 'Settings view' }).getByRole('button', { name });
const heading = (page, name) => page.getByRole('heading', { name, exact: true });
const top = async (loc) => (await loc.boundingBox()).y;

async function signOutHere(page) {
  await open(page, 'Staff & sign-in');
  await page.getByRole('button', { name: 'Sign out of this device' }).click();
  await sheet(page, 'Sign out of this device?').getByRole('button', { name: 'Sign out' }).click();
}

// ------------------------------------------------------------------ phone

test.describe('R449 phone (375 px, Android Chrome)', () => {
  test.use({ viewport: PHONE, userAgent: ANDROID_CHROME });

  test('1+2 Settings: install card on Gym; Sign-in & data has the plain records line and a pointer; MettleUp access on Help', async ({ page }) => {
    await openApp(page);
    await startOnlineGym(page);

    // Gym tab (Settings opens on it): the install card, right under the language card and above the gym details.
    await openSettings(page, 'Gym');
    await expect(page.getByText('Gym details, opening times, screen language and the admin app', { exact: true })).toBeVisible();
    const install = heading(page, PHONE_INSTALL);
    await expect(install).toBeVisible();
    expect(await top(install)).toBeGreaterThan(await top(heading(page, 'Language')));
    expect(await top(install)).toBeLessThan(await top(heading(page, 'Gym details')));
    // Regression: the steps still open from here.
    await page.getByRole('button', { name: 'Show me how' }).click();
    await expect(page.getByText('In Chrome, tap ⋮ at the top right.')).toBeVisible();
    await expectFitsPhone(page, 'on Settings → Gym with the install card');
    await shot(page, 'phone-settings-gym');
    await shot(page, 'phone-settings-gym-full', true);

    // Sign-in & data: no install card, no MettleUp access card; the records line in plain words; the pointer.
    await tabButton(page, 'Sign-in & data').click();
    await expect(page.getByText('Going online, staff sign-in, backups and your gym’s records', { exact: true })).toBeVisible();
    await expect(heading(page, 'Your gym’s records')).toBeVisible();
    await expect(heading(page, PHONE_INSTALL)).toHaveCount(0);
    await expect(heading(page, 'MettleUp access')).toHaveCount(0);
    await expect(page.getByRole('main').getByText(RECORDS)).toBeVisible();
    await expect(page.getByRole('main')).not.toContainText('membership');
    await expect(page.getByText(POINTER, { exact: true })).toBeVisible();
    await expectFitsPhone(page, 'on Settings → Sign-in & data');
    await heading(page, 'Your gym’s records').scrollIntoViewIfNeeded();
    await shot(page, 'phone-settings-data-records');
    await shot(page, 'phone-settings-data-full', true);

    // Help and feedback: the message box first, then Your questions, then MettleUp access.
    await open(page, 'Help and feedback');
    const access = heading(page, 'MettleUp access');
    await expect(access).toBeVisible();
    expect(await top(access)).toBeGreaterThan(await top(page.getByRole('button', { name: 'Send', exact: true })));
    await expect(page.getByText('MettleUp has never opened your records.')).toBeVisible();
    // Regression: letting support look and closing it still work from here.
    await page.getByRole('button', { name: 'Let MettleUp support look (1 hour)' }).click();
    await sheet(page, 'Let MettleUp support look?').getByRole('button', { name: 'Yes, for 1 hour' }).click();
    await expect(page.getByRole('button', { name: 'Close it now' })).toBeVisible();
    await access.scrollIntoViewIfNeeded();
    await expectFitsPhone(page, 'on Help and feedback with MettleUp access');
    await shot(page, 'phone-help-access-open');
    await page.getByRole('button', { name: 'Close it now' }).click();
    await expect(page.getByRole('button', { name: 'Let MettleUp support look (1 hour)' })).toBeVisible();
    await shot(page, 'phone-help-full', true);
  });

  test('2 the demo gym: the records line with real numbers says "plans sold"', async ({ page }) => {
    await openApp(page);
    await startDemo(page);
    await openSettings(page, 'Sign-in & data');
    const line = page.getByRole('main').getByText(RECORDS);
    await expect(line).toContainText('128 members · ');
    await expect(line).toContainText(' plans sold (new and renewals) · ');
    // Negative: a demo gym is never online, so no pointer to MettleUp access (that needs an online gym).
    await expect(page.getByText(POINTER, { exact: true })).toHaveCount(0);
    await heading(page, 'Your gym’s records').scrollIntoViewIfNeeded();
    await shot(page, 'phone-demo-records');
  });

  test('3+4 sign-in page: the demo card words; Hinglish "6-digit PIN" on sign in and set up', async ({ page }) => {
    await openApp(page);
    const demo = page.getByText(DEMO_NEW, { exact: true });
    await expect(demo).toBeVisible();
    await expect(page.getByText('real gym code', { exact: false })).toHaveCount(0);
    await expectFitsPhone(page, 'on the sign-in page');
    await demo.scrollIntoViewIfNeeded();
    await shot(page, 'phone-welcome-demo');
    await shot(page, 'phone-welcome-full', true);

    await page.getByRole('radio', { name: 'Hinglish' }).click();
    await expect(page.getByText('Apne mobile number aur 6-digit PIN se sign in karo.', { exact: true })).toBeVisible();
    await expect(page.getByLabel('PIN (6 digit)')).toBeVisible();
    await expect(page.getByText(DEMO_NEW_HI, { exact: true })).toBeVisible();
    await expect(page.locator('body')).not.toContainText('6 number');
    await expectFitsPhone(page, 'on the sign-in page in Hinglish');
    await shot(page, 'phone-welcome-hinglish-full', true);

    // Set up a new gym, in Hinglish: "6-digit PIN chuno"; a PIN of one digit six times says so in Hinglish.
    await page.getByRole('button', { name: 'Naya gym banao' }).click();
    await expect(page.getByLabel('6-digit PIN chuno')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('6 number');
    await shot(page, 'phone-setup-hinglish-full', true);
  });

  test('5 signed out of this device: the line in English, then Hinglish', async ({ page }) => {
    const server = await openApp(page);
    server.pinServer = true;
    await startOnlineGym(page);
    await signOutHere(page);
    const status = page.getByRole('status').filter({ hasText: 'You are signed out of this device.' });
    await expect(status).toBeVisible();
    await shot(page, 'phone-signed-out');
    await page.getByRole('radio', { name: 'Hinglish' }).click();
    await expect(page.getByText('Aap is device se sign out ho gaye ho.', { exact: true })).toBeVisible();
    await expect(page.getByText('You are signed out of this device.')).toHaveCount(0);
    await expectFitsPhone(page, 'signed out, in Hinglish');
    await shot(page, 'phone-signed-out-hinglish');
  });
});

// ------------------------------------------------------------------ computer

test.describe('R449 computer (1366x768)', () => {
  test('1+2 Settings Gym and Sign-in & data, and Help and feedback, on a computer', async ({ page }) => {
    await openApp(page);
    // Create the gym on the phone-size page (support.mjs reads the phone's top bar), then the computer width.
    await startOnlineGym(page);
    await page.setViewportSize(COMPUTER);
    const nav = page.getByRole('navigation', { name: 'Main' });
    await nav.getByRole('link', { name: 'Settings', exact: true }).click();
    await expect(heading(page, COMPUTER_INSTALL)).toBeVisible();
    await expect(heading(page, PHONE_INSTALL)).toHaveCount(0);
    await shot(page, 'computer-settings-gym');
    await shot(page, 'computer-settings-gym-full', true);

    await tabButton(page, 'Sign-in & data').click();
    await expect(heading(page, COMPUTER_INSTALL)).toHaveCount(0);
    await expect(heading(page, 'MettleUp access')).toHaveCount(0);
    await expect(page.getByRole('main').getByText(RECORDS)).toBeVisible();
    await expect(page.getByText(POINTER, { exact: true })).toBeVisible();
    await shot(page, 'computer-settings-data-full', true);

    await nav.getByRole('link', { name: 'Help and feedback', exact: true }).click();
    await expect(heading(page, 'MettleUp access')).toBeVisible();
    await shot(page, 'computer-help-full', true);
  });

  test('3 the sign-in page on a computer', async ({ page }) => {
    await page.setViewportSize(COMPUTER);
    await openApp(page);
    await expect(page.getByText(DEMO_NEW, { exact: true })).toBeVisible();
    await shot(page, 'computer-welcome-full', true);
  });
});
