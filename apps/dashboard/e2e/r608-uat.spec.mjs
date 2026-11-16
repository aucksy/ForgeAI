// R-608 (owner, 16 Nov 2026: "the birthdays are set to be automated but the AI assistant is still suggesting that"):
// his gym switched ON the automatic birthday wish (Messages & offers > Automatic reminders), yet the AI Assistant's idea
// still said "Birthdays today: N · Write birthday wishes". The wish is shown by the member's own phone app at 9:30 am,
// and only when that app is linked to their record (appUserId). Now, with the switch on, the idea, its "See who" list
// and Today's "Messages to send" count only the birthday members WITHOUT a linked app. Switch off: every birthday.
// Two members have a birthday today: Asha (app linked) and Ravi (no app). Phone 390 and 360, and a computer.
// Pictures: e2e/.results/uat/r608-*.png (CI "dashboard-uat-pictures").
import { mkdirSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { addMember, addPlan, expectFitsPhone, expectNothingPastScreen, openApp, sell, startOnlineGym } from './support.mjs';

const DIR = 'e2e/.results/uat';
mkdirSync(DIR, { recursive: true });

const DAY = '2027-02-10'; // a Wednesday, 10 am India time
const go = (page, path) =>
  page.evaluate((p) => {
    window.location.hash = p;
  }, path);

/** The AI wallet (0071) on the pretend server: the assistant shows for the owner. */
function installWallet(server) {
  const base = server.answer.bind(server);
  server.answer = (fn, args) => {
    if (fn !== 'owner_ai_wallet') return base(fn, args);
    server.calls.push(fn);
    server.log.push({ fn, args });
    server.anyone(args.p_key);
    return {
      ok: true, balance: 84, free_left: 34, monthly_free: 100, plan: 'pro', billing: 'yearly', trial: false, month: '2027-02', low_at: 5,
      packs: [{ credits: 50, inr: 149 }], recent: [],
    };
  };
}

/** The birthday switch as saved on the pretend server (0029). */
function birthdaySwitch(server, on) {
  server.reminderServer = true;
  server.autoReminders = { settings: { birthday: { on } }, updatedAt: `${DAY}T04:00:00.000Z`, updatedByName: 'Owner' };
}

/** Asha (app linked to her record) and Ravi (no app), both born on this day; the panel reloads to read them. */
async function gymWithBirthdays(page, on) {
  const server = await openApp(page, { time: new Date(`${DAY}T10:00:00+05:30`) });
  installWallet(server);
  birthdaySwitch(server, on);
  await startOnlineGym(page);
  await addPlan(page, { name: 'Yearly', price: '12000', joining: '0', months: '12' });
  await addMember(page, { name: 'Asha Verma', phone: '98290 11111' });
  await sell(page, { received: '12000' });
  await addMember(page, { name: 'Ravi Kumar', phone: '98290 22222' });
  await sell(page, { received: '12000' });
  const live = (test) => [...server.records.values()].find((r) => r.k === 'member' && !r.x && test(r.d));
  await expect.poll(() => Boolean(live((d) => d.fullName === 'Asha Verma') && live((d) => d.fullName === 'Ravi Kumar')), {
    message: 'the members reached the server',
    timeout: 15_000,
  }).toBe(true);
  const asha = live((d) => d.fullName === 'Asha Verma');
  const ravi = live((d) => d.fullName === 'Ravi Kumar');
  server.version += 1;
  server.records.set(`member:${asha.id}`, { ...asha, ver: server.version, d: { ...asha.d, dateOfBirth: '1994-02-10', appUserId: '0b8c1c1e-5790-4222-8333-000000000608' } });
  server.version += 1;
  server.records.set(`member:${ravi.id}`, { ...ravi, ver: server.version, d: { ...ravi.d, dateOfBirth: '1990-02-10' } });
  await go(page, '/');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible({ timeout: 15_000 });
  return server;
}

const aiCard = (page) => page.getByRole('main').getByRole('region', { name: 'AI Assistant', exact: true });
const birthdayIdea = (page) => aiCard(page).locator('[data-idea-row]').filter({ hasText: /Birthdays today/ });

/** Switch on: the idea says 1 and names only Ravi; Today's "Messages to send" says the same. */
async function expectOnlyRavi(page, where) {
  const idea = birthdayIdea(page);
  await expect(idea).toHaveCount(1, { timeout: 15_000 });
  await expect(idea).toContainText('Birthdays today, not in the app: 1');
  await expect(idea).toContainText('Ravi');
  await expect(idea).not.toContainText('Asha');
  await expect(idea.getByRole('button', { name: 'Write birthday wishes' })).toBeVisible();
  await expect(aiCard(page)).not.toContainText('Birthdays today: 2');
  await expect(page.getByRole('main')).toContainText('1 member not in the app has a birthday today');
  await expect(page.getByRole('main')).not.toContainText('2 birthdays today');
  await expectFitsPhone(page, where);
  await expectNothingPastScreen(page, where);
}

async function shot(page, name) {
  await aiCard(page).evaluate((el) => {
    el.scrollIntoView({ block: 'start' });
    window.scrollBy(0, -80);
  });
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${DIR}/r608-${name}.png` });
}

/** Where "See who" shows its list: the AI Assistant screen on a phone, the side panel on a computer. */
async function seeWhoScope(page, desktop) {
  if (desktop) return page.locator('[data-assistant-panel]');
  await expect(page.getByRole('heading', { level: 1, name: /AI Assistant/ })).toBeVisible({ timeout: 10_000 });
  return page.getByRole('main');
}

/** "See who" lists the same person the idea counts. */
async function seeWhoOnlyRavi(page, where, desktop = false) {
  await birthdayIdea(page).getByRole('button', { name: 'See who' }).click();
  const scope = await seeWhoScope(page, desktop);
  await expect(scope.getByText('Birthdays today, not in the app', { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(scope.getByRole('button', { name: /Ravi Kumar/ })).toHaveCount(1);
  await expect(scope.getByRole('button', { name: /Asha Verma/ })).toHaveCount(0);
  await expectNothingPastScreen(page, `after See who ${where}`);
}

test.use({ viewport: { width: 390, height: 844 } });

test('R-608 switch ON: the birthday idea counts and names only the member without the app (390 and 360)', async ({ page }) => {
  test.setTimeout(180_000);
  await gymWithBirthdays(page, true);
  for (const width of [390, 360]) {
    await page.setViewportSize({ width, height: 844 });
    await go(page, '/');
    await expectOnlyRavi(page, `on Today at ${width}px`);
    await shot(page, `on-today-${width}`);
  }
  // The AI Assistant page's "Today for you" says the same.
  await go(page, '/assistant');
  await expect(page.getByRole('heading', { level: 1, name: /AI Assistant/ })).toBeVisible();
  const main = page.getByRole('main');
  await expect(main).toContainText('Birthdays today, not in the app: 1');
  await expect(main.locator('[data-idea-row]').filter({ hasText: /Birthdays today/ })).not.toContainText('Asha');
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${DIR}/r608-on-assistant-360.png` });
  // See who, from Today, at 390.
  await page.setViewportSize({ width: 390, height: 844 });
  await go(page, '/');
  await expect(birthdayIdea(page)).toHaveCount(1, { timeout: 15_000 });
  await seeWhoOnlyRavi(page, 'at 390px');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/r608-on-see-who-390.png` });
});

test('R-608 switch OFF: every birthday, as before (both members)', async ({ page }) => {
  test.setTimeout(180_000);
  await gymWithBirthdays(page, false);
  for (const width of [390, 360]) {
    await page.setViewportSize({ width, height: 844 });
    await go(page, '/');
    const idea = birthdayIdea(page);
    await expect(idea).toHaveCount(1, { timeout: 15_000 });
    await expect(idea).toContainText('Birthdays today: 2');
    await expect(idea).toContainText('Asha');
    await expect(idea).toContainText('Ravi');
    await expect(aiCard(page)).not.toContainText('not in the app');
    await expect(page.getByRole('main')).toContainText('2 birthdays today');
    await expectNothingPastScreen(page, `switch off at ${width}px`);
    await shot(page, `off-today-${width}`);
  }
  await birthdayIdea(page).getByRole('button', { name: 'See who' }).click();
  const scope = await seeWhoScope(page, false);
  await expect(scope.getByText('Birthdays today', { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(scope.getByRole('button', { name: /Asha Verma/ })).toHaveCount(1);
  await expect(scope.getByRole('button', { name: /Ravi Kumar/ })).toHaveCount(1);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/r608-off-see-who-360.png` });
});

test('R-608 switch ON and both members use the app: no birthday idea, no birthday row in Messages to send', async ({ page }) => {
  test.setTimeout(150_000);
  const server = await gymWithBirthdays(page, true);
  const ravi = [...server.records.values()].find((r) => r.k === 'member' && !r.x && r.d.fullName === 'Ravi Kumar');
  server.version += 1;
  server.records.set(`member:${ravi.id}`, { ...ravi, ver: server.version, d: { ...ravi.d, appUserId: '0b8c1c1e-5790-4222-8333-000000000609' } });
  await page.reload();
  await expect(aiCard(page)).toBeVisible({ timeout: 15_000 });
  await expect(birthdayIdea(page)).toHaveCount(0);
  await expect(page.getByRole('main')).not.toContainText(/birthday today|birthdays today/);
  await shot(page, 'on-all-app-390');
});

// A computer: the gym is set up on the phone (the shared sign-up steps are phone-shaped), then the window widens to
// 1280 px, as r579-uat does; "See who" then opens the side panel.
test('R-608 switch ON at desktop width: idea, Messages to send and See who show only the member without the app', async ({ page }) => {
  test.setTimeout(180_000);
  await gymWithBirthdays(page, true);
  await page.setViewportSize({ width: 1280, height: 900 });
  await go(page, '/');
  await expectOnlyRavi(page, 'on Today at 1280px');
  await shot(page, 'on-today-desktop');
  await seeWhoOnlyRavi(page, 'at 1280px', true);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/r608-on-see-who-desktop.png` });
});
