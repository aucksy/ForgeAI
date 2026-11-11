// R-450 (11 Nov 2026) UAT, at a 375 px phone and a 1366x768 computer. Pictures go to e2e/.results/uat (CI uploads
// them as "dashboard-uat-pictures"), named r450-*.png. The five R-449 fresh-eyes leftovers:
//  1. The sign-in PIN hint said "(Settings → Staff & sign-in)", a page staff cannot open (only an owner makes codes):
//     now "No PIN yet? Ask your gym owner for a sign-in code, and type it here."
//  2. The set-up form's terms tick line has Hinglish (legal wording, a translation only; the owner said yes to the
//     words on 11 Nov 2026). The two links keep their words; the gym can be made from the Hinglish form.
//  3. Hinglish talks to the owner one way: "aap ... karenge / hain" (was "karoge", "sakte ho", "naye ho?").
//  4. "Import from Excel" on Members: at the top and in the empty list (it was already there; pictured, and the
//     button opens the same import as Settings).
//  5. Money → Dues tiles and rows: "3 memberships not fully paid" (was "3 memberships"). Fresh eyes: the age chips
//     now count the people the list shows (they counted memberships: "All 26" over 24 rows); "Due since" → "Due for".
// The gym server is support.mjs FakeServer. Fake numbers only.
//
// UAT types: happy path (each new line where it shows), negative (the old words gone: no "Settings →" in the hint,
// no "karoge", no bare "N memberships"), regression (the tick box still ticks and lets the gym be made; the staff
// code sign-in still works; Import opens; collecting still drops the tile), setting change (English ↔ Hinglish),
// edge (375 px, a big demo gym, a computer), interruption (a desk phone signing in on its own device).
import { mkdirSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import {
  DESK,
  SIGN_IN_CODE,
  addDeskPerson,
  addMember,
  bottomBar,
  expectFitsPhone,
  freshGym,
  gymWithMonthlyPlan,
  open,
  openApp,
  openSettings,
  secondPhone,
  sheet,
  startDemo,
  startOnlineGym,
  tile,
  typeSignIn,
} from './support.mjs';

const DIR = 'e2e/.results/uat';
mkdirSync(DIR, { recursive: true });

async function shot(page, name, fullPage = false) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/r450-${name}.png`, fullPage });
}

const PHONE = { width: 375, height: 812 };
const COMPUTER = { width: 1366, height: 768 };
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';

const HINT = 'No PIN yet? Ask your gym owner for a sign-in code, and type it here.';
const HINT_HI = 'Abhi PIN nahi hai? Gym owner se sign-in code maango aur yahan daalo.';
const TERMS_EN = 'I agree to the MettleUp terms and the data agreement.';
const TERMS_HI = 'Main MettleUp ke terms aur data agreement se sehmat hoon.';
const CASUAL = /\b[a-z]+oge\b|\bsakte ho\b|\bnaye ho\?|\bkarte ho\?/i;
const BARE_COUNT = /^\d+ memberships?$/;

const heading = (page, name) => page.getByRole('heading', { name, exact: true });
const setUpForm = (page) => page.locator('form').filter({ has: page.getByRole('button', { name: /^(Create my gym|Gym banao)$/ }) });
/** Scroll a line to the middle of the screen (clear of the phone's bottom bar) before a picture. */
const centre = (loc) => loc.evaluate((el) => el.scrollIntoView({ block: 'center' }));

const ageChip = (page, label) =>
  page.getByRole('group', { name: 'Filter by how long it is due' }).getByRole('button', { name: new RegExp(`^${label}`) });

/** R-450 fresh eyes: every age chip's number is the number of people it lists, and "All" matches "Total due". */
async function chipsCountPeople(page) {
  const collect = page.getByRole('main').getByRole('button', { name: 'Collect', exact: true });
  const everyone = await collect.count();
  expect(everyone).toBeGreaterThan(0);
  const countOn = async (label) => Number(((await ageChip(page, label).textContent()) ?? '').match(/(\d+)\s*$/)?.[1] ?? -1);
  expect(await countOn('All')).toBe(everyone);
  await expect(tile(page, 'Total due')).toContainText(everyone === 1 ? '1 member' : `${everyone} members`);
  for (const group of ['Up to 30 days', '31–60 days', 'Over 60 days']) {
    const n = await countOn(group);
    await ageChip(page, group).click();
    await expect(collect).toHaveCount(n);
  }
  await ageChip(page, 'All').click();
  await expect(collect).toHaveCount(everyone);
}

/** One person's row in Money -> Dues (phone layout). */
function duesRow(page, name) {
  return page
    .getByRole('main')
    .locator('div')
    .filter({ has: page.getByRole('link', { name }) })
    .filter({ has: page.getByRole('button', { name: 'Collect' }) })
    .last();
}

const OWE = [
  { name: 'Komal Saini', phone: '98290 31010', startsOn: '2026-10-07', group: 'Up to 30 days' },
  { name: 'Lalit Bansal', phone: '98290 31040', startsOn: '2026-09-07', group: '31–60 days' },
];

// ------------------------------------------------------------------ phone

test.describe('R450 phone (375 px, Android Chrome)', () => {
  test.use({ viewport: PHONE, userAgent: ANDROID_CHROME });

  test('1+2+3 sign-in page and set-up form: the PIN hint, the Hinglish terms line, "aap ... karenge"', async ({ page }) => {
    await openApp(page);
    // 1. English: who to ask, and no page named.
    const hint = page.getByText(HINT, { exact: true });
    await expect(hint).toBeVisible();
    await expect(page.getByText('Settings → Staff & sign-in', { exact: false })).toHaveCount(0);
    await expect(page.getByText('one-time code your gym owner gives you', { exact: false })).toHaveCount(0);
    await centre(hint);
    await shot(page, 'phone-signin-hint');

    // Hinglish: the hint, and "MettleUp pe naye hain?" (was "naye ho?").
    await page.getByRole('radio', { name: 'Hinglish' }).click();
    await expect(page.getByText(HINT_HI, { exact: true })).toBeVisible();
    await expect(page.getByText('MettleUp pe naye hain?', { exact: true })).toBeVisible();
    await expect(page.locator('body')).not.toContainText(CASUAL);
    await expectFitsPhone(page, 'on the sign-in page in Hinglish');
    await centre(page.getByText(HINT_HI, { exact: true }));
    await shot(page, 'phone-signin-hint-hinglish');
    await shot(page, 'phone-signin-hinglish-full', true);

    // 2+3. Set up a new gym, in Hinglish: the tick line in Hinglish (the owner's approved words) with both links;
    // the "karenge" lines.
    await page.getByRole('button', { name: 'Naya gym banao' }).click();
    const form = setUpForm(page);
    const box = form.getByRole('checkbox', { name: TERMS_HI });
    await expect(box).toBeVisible();
    await expect(form.getByRole('link', { name: 'terms', exact: true })).toHaveAttribute('href', /terms/);
    await expect(form.getByRole('link', { name: 'data agreement', exact: true })).toHaveAttribute('href', /data-agreement/);
    await expect(form).not.toContainText('I agree to');
    await expect(page.getByText('Aap mobile number aur is PIN se sign in karenge. Ise kisi ko mat batao.', { exact: true })).toBeVisible();
    await expect(page.getByText('Pehle se MettleUp use karte hain?', { exact: true })).toBeVisible();
    await expect(page.locator('body')).not.toContainText(CASUAL);
    // Regression: the box still ticks on the Hinglish page.
    await box.check();
    await expect(box).toBeChecked();
    await expectFitsPhone(page, 'on the set-up form in Hinglish');
    await centre(box);
    await shot(page, 'phone-setup-terms-hinglish');
    await shot(page, 'phone-setup-hinglish-full', true);

    // English again: the English tick line, as before (the gate card for older gyms says the same).
    await page.getByRole('radio', { name: 'English' }).click();
    await expect(setUpForm(page).getByRole('checkbox', { name: TERMS_EN })).toBeVisible();
    await centre(setUpForm(page).getByRole('checkbox', { name: TERMS_EN }));
    await shot(page, 'phone-setup-terms-english');
  });

  test('2 regression: a gym is made from the Hinglish set-up form after ticking the Hinglish line', async ({ page }) => {
    await openApp(page);
    await page.getByRole('radio', { name: 'Hinglish' }).click();
    await page.getByRole('button', { name: 'Naya gym banao' }).click();
    const form = setUpForm(page);
    await form.getByLabel('Gym ka naam').fill('Shakti Gym');
    await form.getByLabel('Aapka naam').fill('Ramesh Sharma');
    await form.getByLabel('Aapka mobile number').fill('98290 12345');
    await form.getByLabel('6-digit PIN chuno').fill('271828');
    await form.getByLabel('PIN dobara daalo').fill('271828');
    // Negative first: without the tick the gym is not made, and the Hinglish error says so.
    await form.getByRole('button', { name: 'Gym banao' }).tap();
    await expect(page.getByText('Terms maanne ke liye box par tick karo. Phir “Gym banao” dobara dabao.', { exact: true })).toBeVisible();
    await form.getByRole('checkbox', { name: TERMS_HI }).check();
    await form.getByRole('button', { name: 'Gym banao' }).tap();
    await expect(sheet(page, 'Aapka gym taiyaar hai')).toBeVisible({ timeout: 15_000 });
    await shot(page, 'phone-hinglish-gym-made');
  });

  test('1 a desk phone: the hint, the code from the owner, then Staff & sign-in says only an owner makes codes', async ({ page, browser }) => {
    const server = await openApp(page);
    server.pinServer = true;
    await startOnlineGym(page);
    await addDeskPerson(page);

    const desk = await secondPhone(browser, server);
    await desk.setViewportSize(PHONE);
    await expect(desk.getByText(HINT, { exact: true })).toBeVisible();
    await shot(desk, 'phone-desk-signin');
    // Regression: the code the owner made still signs the desk in.
    await typeSignIn(desk, DESK.phone, SIGN_IN_CODE);
    const ask = sheet(desk, 'Set your own PIN');
    await expect(ask).toBeVisible({ timeout: 15_000 });
    await ask.getByRole('button', { name: 'Not now' }).tap();
    await expect(desk.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
    // What the hint points to: the owner. A desk person's Staff & sign-in says the same.
    await open(desk, 'Staff & sign-in');
    await expect(desk.getByText('Only an owner can add people or make sign-in codes. Ask your gym owner.', { exact: true })).toBeVisible();
    await expect(desk.getByRole('button', { name: 'Make sign-in code' })).toHaveCount(0);
    await shot(desk, 'phone-desk-staff-signin');
    await desk.context().close();
  });

  test('4 a new gym: Members has Import from Excel at the top and in the empty list; then the same in Hinglish', async ({ page }) => {
    await freshGym(page);
    await open(page, 'Members');
    const main = page.getByRole('main');
    await expect(main.getByText('No members yet', { exact: true })).toBeVisible();
    await expect(main.getByRole('button', { name: 'Import from Excel' })).toHaveCount(2);
    await expect(main.getByRole('button', { name: '+ Add member' })).toHaveCount(2);
    await expectFitsPhone(page, 'on an empty Members');
    await shot(page, 'phone-members-empty');
    // The top one opens the import, the same screen as Settings' "Import members from Excel".
    await main.getByRole('button', { name: 'Import from Excel' }).first().tap();
    await expect(heading(page, 'Import members from Excel')).toBeVisible();
    await shot(page, 'phone-import');

    // Hinglish: Members and Plans with the "aap ... sakte hain / bechte hain" lines.
    await openSettings(page, 'Gym');
    await page.getByRole('radio', { name: 'Hinglish' }).click();
    await bottomBar(page).getByRole('link', { name: /^Members/ }).tap();
    await expect(main.getByRole('button', { name: 'Excel se laao' }).first()).toBeVisible();
    await expect(main.getByText('Apna pehla member jodo. Phir aap unhe membership de sakte hain.', { exact: true })).toBeVisible();
    await expect(page.locator('body')).not.toContainText(CASUAL);
    await expectFitsPhone(page, 'on an empty Members in Hinglish');
    await shot(page, 'phone-members-empty-hinglish');
    await bottomBar(page).getByRole('link', { name: /^Aur/ }).tap();
    await main.getByRole('link', { name: /^Plans/ }).tap();
    await expect(page.getByText('Aap kya bechte hain, aur kitne mein', { exact: true })).toBeVisible();
    await expect(page.locator('body')).not.toContainText(CASUAL);
    await shot(page, 'phone-plans-hinglish');
  });

  test('5 Money → Dues: tiles and rows say "memberships not fully paid"; collecting drops the tile', async ({ page }) => {
    await gymWithMonthlyPlan(page);
    for (const m of OWE) {
      await addMember(page, m);
      await page.getByRole('button', { name: 'Sell membership' }).first().tap();
      const s = sheet(page, 'Sell membership');
      await s.getByLabel('Starts on').fill(m.startsOn);
      await s.getByRole('button', { name: 'Confirm' }).tap();
      await expect(s).toBeHidden();
    }
    await open(page, 'Money');
    await page.getByRole('button', { name: 'Dues' }).tap();
    await expect(tile(page, 'Total due')).toContainText('2 members');
    for (const m of OWE) {
      await expect(tile(page, m.group)).toContainText('1 membership not fully paid');
      await expect(duesRow(page, m.name)).toContainText('1 membership not fully paid · ');
    }
    await expect(tile(page, 'Over 60 days')).toContainText('0 memberships not fully paid');
    await expect(tile(page, 'Not started yet')).toContainText('0 memberships not fully paid');
    // Negative: no bare "N memberships" anywhere on the page.
    await expect(page.getByRole('main').getByText(BARE_COUNT)).toHaveCount(0);
    await expectFitsPhone(page, 'on Money → Dues');
    await shot(page, 'phone-dues');
    await shot(page, 'phone-dues-full', true);
    // Regression: collecting from the list drops that tile to 0.
    await duesRow(page, 'Lalit Bansal').getByRole('button', { name: 'Collect' }).tap();
    const c = sheet(page, 'Collect payment');
    await c.getByLabel('Paid by').selectOption({ label: 'UPI' });
    await c.getByRole('button', { name: 'Save payment' }).tap();
    await expect(c).toBeHidden();
    await expect(tile(page, '31–60 days')).toContainText('0 memberships not fully paid');
    await expect(tile(page, 'Total due')).toContainText('1 member');
    await shot(page, 'phone-dues-after-collect');
  });

  test('5 the demo gym: Dues tiles with real numbers', async ({ page }) => {
    await openApp(page);
    await startDemo(page);
    await open(page, 'Money');
    await page.getByRole('button', { name: 'Dues' }).tap();
    await expect(tile(page, 'Up to 30 days')).toContainText(/\d+ memberships? not fully paid/);
    await expect(page.getByRole('main').getByText(BARE_COUNT)).toHaveCount(0);
    await chipsCountPeople(page);
    await expectFitsPhone(page, 'on the demo Dues');
    await shot(page, 'phone-demo-dues');

    // What's new tells owners why the filter numbers changed; its button opens Dues.
    await open(page, "What's new");
    const line = page.getByText(/^Money → Dues: each filter \("Up to 30 days" and the others\) now shows how many people it lists/);
    await expect(line).toBeVisible();
    await centre(line);
    await shot(page, 'phone-whats-new');
    await page.getByRole('button', { name: 'Open Dues ›' }).first().tap();
    await expect(page).toHaveURL(/#\/money\/dues$/);
  });
});

// ------------------------------------------------------------------ computer

test.describe('R450 computer (1366x768)', () => {
  test('1+2 sign-in page and set-up form on a computer, English and Hinglish', async ({ page }) => {
    await page.setViewportSize(COMPUTER);
    await openApp(page);
    await expect(page.getByText(HINT, { exact: true })).toBeVisible();
    await shot(page, 'computer-signin');
    await page.getByRole('radio', { name: 'Hinglish' }).click();
    await page.getByRole('button', { name: 'Naya gym banao' }).click();
    await expect(setUpForm(page).getByRole('checkbox', { name: TERMS_HI })).toBeVisible();
    await shot(page, 'computer-setup-hinglish-full', true);
  });

  test('4 Members (empty) on a computer', async ({ page }) => {
    await freshGym(page);
    await page.setViewportSize(COMPUTER);
    const nav = page.getByRole('navigation', { name: 'Main' });
    await nav.getByRole('link', { name: /^Members\b/ }).first().click();
    await expect(heading(page, 'Members')).toBeVisible();
    await expect(page.getByRole('main').getByRole('button', { name: 'Import from Excel' })).toHaveCount(2);
    await shot(page, 'computer-members-empty');
  });

  test('5 the demo Dues on a computer', async ({ page }) => {
    await openApp(page);
    await startDemo(page);
    await page.setViewportSize(COMPUTER);
    const nav = page.getByRole('navigation', { name: 'Main' });
    await nav.getByRole('link', { name: /^Money/ }).first().click();
    await page.getByRole('button', { name: 'Dues' }).click();
    await expect(tile(page, 'Up to 30 days')).toContainText(/\d+ memberships? not fully paid/);
    await expect(page.getByRole('main').getByText(BARE_COUNT)).toHaveCount(0);
    await expect(page.getByRole('columnheader', { name: /^due for$/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /^due since$/i })).toHaveCount(0);
    await chipsCountPeople(page);
    await shot(page, 'computer-demo-dues');
    await shot(page, 'computer-demo-dues-full', true);
  });
});
