// Launch audit 3 Nov 2026, gym owner side: UAT of the launch fixes the way an owner meets them, on a
// phone (390 x 844) and on a computer (1280 x 900). Every step taps the real screen; pictures of each
// screen go to e2e/.results/uat (CI uploads them as "dashboard-uat-pictures" so a person can read them).
//
//  1. Today on a phone: the gym code card is gone once members use the app; "Talk to these members"
//     and "Money to collect" come right under the tiles; on a Monday, last week's summary for WhatsApp.
//  2. Settings: Gym UPI ID (checked), and fee / renewal / receipt messages carry it with a pay link.
//  3. Today: "Came in today with an ended plan or fees due", with the ready WhatsApp message.
//  4. Enquiries: where they heard about us, why they did not join, joined out of asked per source.
//  5. Settings -> Sign-in & data: "Download a backup" (R-447; was "Keep a copy of your data") on its own, with the last download day.
//  6. The sign-in screen: MettleUp's support email.
import { mkdirSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import {
  addMember,
  expectFitsPhone,
  gymWithMonthlyPlan,
  MEMBERS,
  open,
  openApp,
  openSettings,
  sell,
  sheet,
  startDemo,
} from './support.mjs';

const DIR = 'e2e/.results/uat';
mkdirSync(DIR, { recursive: true });

async function shot(page, name, fullPage = true) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage });
}

/** WhatsApp is never opened from a test: window.open is caught and kept. */
async function catchOpen(page) {
  await page.evaluate(() => {
    window.__opened = [];
    window.open = (u) => {
      window.__opened.push(String(u));
      return null;
    };
  });
}

/** y of a section heading on Today. */
async function topOf(page, name) {
  const box = await page.getByRole('heading', { name, exact: true }).boundingBox();
  expect(box, `${name} is on the page`).not.toBeNull();
  return box.y;
}

const MONDAY = new Date('2026-11-02T10:00:00+05:30');

for (const size of ['phone', 'computer']) {
  test.describe(`launch fixes on a ${size}`, () => {
    if (size === 'computer') test.use({ viewport: { width: 1280, height: 900 }, isMobile: false });

    test(`U1 ${size}: Today puts people to act on first; Monday's summary goes to WhatsApp`, async ({ page }) => {
      await openApp(page, { time: MONDAY });
      // 6. The sign-in screen names MettleUp's support email.
      await expect(page.getByText('Need help? Email MettleUp at')).toBeVisible();
      await expect(page.getByRole('link', { name: 'contact@mettleup.fit' })).toHaveAttribute('href', 'mailto:contact@mettleup.fit');
      await shot(page, `${size}-0-welcome`);

      await startDemo(page);
      const talk = await topOf(page, 'Talk to these members');
      const money = await topOf(page, 'Money to collect');
      const habit = await topOf(page, 'Losing the habit');
      if (size === 'phone') {
        expect(talk).toBeLessThan(money);
        expect(money).toBeLessThan(habit);
        // The demo's members use the app: the gym code card has done its job on Today.
        await expect(page.getByText('Members join in the MettleUp app with this gym code:')).toHaveCount(0);
      } else {
        // Side by side on a computer, people first.
        expect(talk).toBeLessThanOrEqual(money);
      }
      await expect(page.getByRole('heading', { name: 'Last week at your gym' })).toBeVisible();
      await shot(page, `${size}-1-today`);

      await catchOpen(page);
      await page.getByRole('button', { name: 'Share on WhatsApp' }).tap();
      const opened = await page.evaluate(() => window.__opened);
      expect(opened).toHaveLength(1);
      expect(opened[0]).toMatch(/^https:\/\/wa\.me\/\?text=/);
      const text = decodeURIComponent(opened[0].split('?text=')[1]);
      expect(text).toContain('last week (26 Oct to 1 Nov)');
      expect(text).toContain('Money collected: ₹');
      expect(text).toContain('Plans ending this week:');
      await expectFitsPhone(page, 'on Today');

      // 5. The download is its own card, never under Danger zone.
      // A phone goes through More; a computer has no bottom bar, so it opens the address.
      if (size === 'phone') await openSettings(page, 'Sign-in & data');
      else await page.goto('./#/settings/data');
      // R-447: renamed from "Keep a copy of your data" and "Your data" (too alike).
      await expect(page.getByRole('heading', { name: 'Download a backup', exact: true })).toBeVisible();
      await expect(page.getByText('Not downloaded from this browser yet.')).toBeVisible();
      const copyTop = await topOf(page, 'Download a backup');
      expect(copyTop).toBeLessThan(await topOf(page, 'Your gym’s records'));
      await expect(page.getByRole('heading', { name: 'Keep a copy of your data' })).toHaveCount(0);
      await expect(page.getByRole('heading', { name: 'Your data', exact: true })).toHaveCount(0);
      await page.getByRole('button', { name: 'Download all your gym’s data' }).tap();
      await expect(page.getByText('Last downloaded on 2 Nov 2026 from this browser.')).toBeVisible();
      await shot(page, `${size}-2-settings-data`);
    });
  });
}

test('U2 phone: UPI ID in Settings; fee, renewal and receipt messages carry the pay link', async ({ page }) => {
  await gymWithMonthlyPlan(page);

  // The UPI ID is checked before it is kept.
  await openSettings(page, 'Gym');
  const upi = page.getByLabel('Gym UPI ID (optional)');
  await upi.fill('irontemple');
  await page.getByRole('button', { name: 'Save details' }).tap();
  await expect(page.getByText('A UPI ID has an @ in it, like irontemple@okhdfc.')).toBeVisible();
  await upi.fill('IronTemple@okhdfc');
  await page.getByRole('button', { name: 'Save details' }).tap();
  await expect(page.getByText('Saved.')).toBeVisible();
  await shot(page, 'phone-3-settings-upi');

  // Bharat pays ₹1,000 of ₹2,000: his receipt says ₹1,000 is still due, with the pay link.
  await addMember(page, MEMBERS.part);
  await sell(page, { received: '1000' });
  await page.getByRole('button', { name: 'WhatsApp', exact: true }).tap();
  const wa = sheet(page, 'WhatsApp Bharat Singh');
  const box = wa.getByLabel('Message (you can change it)');
  await expect(box).toHaveValue(/Pay ₹1,000 on UPI to irontemple@okhdfc\. Or tap this link to pay:/);
  await expect(box).toHaveValue(/upi:\/\/pay\?pa=irontemple@okhdfc&pn=[^&]+&am=1000\.00&cu=INR/);
  await expectFitsPhone(page, 'in the WhatsApp sheet');
  await shot(page, 'phone-4-fee-message', false);
  await page.getByRole('button', { name: 'Close' }).first().tap();
  await expect(wa).toBeHidden();

  // 3. A month and more later Asha's plan has ended; both come in today.
  await addMember(page, MEMBERS.full);
  await sell(page, { received: '2000' });
  // Jump the clock (setSystemTime: fastForward refused this jump in CI), then run the app's
  // one-minute check so Today becomes 26 Nov.
  await page.clock.setSystemTime(new Date('2026-11-26T10:00:00+05:30'));
  await page.clock.runFor(61_000);
  await open(page, 'Visits');
  const search = page.getByLabel('Type a name or the last 4 digits of a mobile');
  for (const who of ['Asha', 'Bharat']) {
    await search.fill(who);
    await page.getByRole('main').getByRole('button', { name: 'Check in', exact: true }).tap();
    await expect(page.getByText(new RegExp(`${who} \\w+ checked in\\.`)).first()).toBeVisible();
  }
  await open(page, 'Today');
  const card = page.getByRole('heading', { name: 'Came in today with an ended plan or fees due' }).locator('xpath=../..');
  await expect(card).toContainText('Asha Verma');
  await expect(card).toContainText('Plan ended 16 Nov 2026');
  await expect(card).toContainText('Bharat Singh');
  await expect(card).toContainText('₹1,000 due');
  await shot(page, 'phone-5-today-came-in');
  await card.getByRole('button', { name: 'Message: Asha Verma' }).tap();
  const ended = sheet(page, 'WhatsApp Asha Verma');
  await expect(ended.getByLabel('Message (you can change it)')).toHaveValue(/plan ended on 16 Nov 2026/);
  await expect(ended.getByLabel('Message (you can change it)')).toHaveValue(/Pay ₹1,500 on UPI to irontemple@okhdfc/);
  await shot(page, 'phone-6-renewal-message', false);
});

test('U3 phone: an enquiry says where they heard about us, and why they did not join', async ({ page }) => {
  await gymWithMonthlyPlan(page);
  await open(page, 'Enquiries');
  await page.getByRole('button', { name: '+ Add enquiry' }).first().tap();
  const s = sheet(page, 'Add enquiry');
  await s.getByLabel('Name').fill('Esha Jain');
  await s.getByLabel('Mobile number').fill('98290 55555');
  await s.getByLabel('Where did they hear about us? (optional)').selectOption('instagram');
  await expectFitsPhone(page, 'in Add enquiry');
  await shot(page, 'phone-7-add-enquiry', false);
  await s.getByRole('button', { name: 'Save enquiry' }).tap();
  await expect(s).toBeHidden();

  await expect(page.getByText('Instagram: 0 of 1 joined (0%)')).toBeVisible();
  await page.getByRole('group', { name: 'Show enquiries' }).getByRole('button', { name: /^Later/ }).tap();
  await expect(page.getByText('Heard about us: Instagram')).toBeVisible();
  await page.getByRole('button', { name: 'Esha Jain is not interested' }).tap();
  await page.getByRole('group', { name: 'Show enquiries' }).getByRole('button', { name: /^Not interested/ }).tap();
  const why = page.getByLabel('Why did Esha Jain not join? (optional)');
  await why.selectOption('price');
  await expect(why).toHaveValue('price');
  await expectFitsPhone(page, 'on Enquiries');
  await shot(page, 'phone-8-enquiry-lost');
});
