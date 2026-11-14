// R-534 (owner, 14 Nov 2026, with a picture of Training progress): "Why give WhatsApp option here... should be BAU in
// app notification". UAT on a phone (375 x 812) with computer pictures (1280 x 900). Every step taps the real screen;
// pictures go to e2e/.results/uat (CI uploads them as "dashboard-uat-pictures"). The gym's server is the pretend one
// (support.mjs, owner_send_message by 0025/0042's rules). Today is Saturday 17 Oct 2026, 10:00 am India time.
//
//  1. Happy path: no WhatsApp anywhere on the page; "Send: Well done" goes as a gym message to Asha only (her app
//     member id, kind announcement, title "Well done!", her ready words), and the card says "Sent".
//  2. "Send: How's it going?" for the quiet member (no workout for 9 days): the check-in words; "Sent".
//  3. Edge: the gym already sent 2 messages today, so the 3rd has no phone notification (0042): the card says so.
//  4. Negative: the member left the app (NO_ONE): plain words, nothing sent.
//  5. Negative: the gym's 10 messages for the day are used (TOO_MANY): plain words.
//  6. Setting change: Hinglish. The buttons and "Sent" read in Hinglish.
//  7. A trainer on a second phone: no buttons (owner_send_message is the owner's), one line saying so.
//  8. The computer size.
import { mkdirSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { DESK, NOW, addDeskPerson, expectFitsPhone, installQuestions, openApp, secondPhone, signIn, startOnlineGym } from './support.mjs';

const DIR = 'e2e/.results/uat';
mkdirSync(DIR, { recursive: true });

async function shot(page, name, fullPage = true) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage });
}

const go = (page, path) =>
  page.evaluate((p) => {
    window.location.hash = p;
  }, path);

const summary = (n, last) => ({ weeks: [{ w: '2026-10-12', n, kg: 9000 }], best: [], records: [], last });
const member = (appId, name, s) => ({ appId, memberId: null, name, phone: null, trainerId: null, trainerName: null, summary: s, updatedAt: NOW.getTime(), helpAt: null });
const app = (id, name) => ({ member_id: id, name, phone: null, joined_at: '2026-10-01T10:00:00Z', last_seen: '2026-10-16T10:00:00Z', orders: 0, spent_p: 0 });

function card(page, name) {
  return page.getByRole('main').locator('div', { has: page.getByRole('link', { name }).or(page.getByText(name, { exact: true })) }).filter({ has: page.getByRole('button') }).last();
}

const sends = (server) => server.log.filter((l) => l.fn === 'owner_send_message').map((l) => l.args);

test.use({ viewport: { width: 375, height: 812 } });

test('Training progress: "Well done" and "How\'s it going?" go in the app, never WhatsApp', async ({ page, browser }) => {
  const server = await openApp(page);
  const qs = installQuestions(server);
  qs.on = true;
  qs.members = [member('app-asha', 'Asha Verma', summary(3, '2026-10-16')), member('app-chand', 'Chand Mehta', summary(0, '2026-10-08'))];
  server.appMembers = [app('app-asha', 'Asha Verma'), app('app-chand', 'Chand Mehta')];
  await startOnlineGym(page);
  await go(page, '/trainer');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Training progress', exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(main.getByText('Asha Verma', { exact: true })).toBeVisible();

  // 1. No WhatsApp anywhere; the hint says where it goes.
  await expect(main).not.toContainText('WhatsApp');
  await expect(main.getByRole('link', { name: /WhatsApp/ })).toHaveCount(0);
  await expect(main.getByText('Goes to their MettleUp app, with a notification on their phone.').first()).toBeVisible();
  await expectFitsPhone(page, 'on Training progress');
  await shot(page, 'r534-01-training-progress-phone');
  const asha = card(page, 'Asha Verma');
  await asha.getByRole('button', { name: 'Send: Well done' }).tap();
  await expect(asha.getByRole('status')).toHaveText('Sent. It is in their app now.');
  let s = sends(server);
  expect(s).toHaveLength(1);
  expect(s[0].p_to).toEqual(['app-asha']);
  expect(s[0].p_kind).toBe('announcement');
  expect(s[0].p_title).toBe('Well done!');
  expect(s[0].p_body).toMatch(/^Hi Asha, well done/);
  expect(server.messages[0].toGroup).toBe(true);
  expect(server.messages[0].recipients).toBe(1);
  await asha.scrollIntoViewIfNeeded();
  await shot(page, 'r534-02-well-done-sent', false);

  // 2. The quiet member gets the check-in words.
  const chand = card(page, 'Chand Mehta');
  await chand.getByRole('button', { name: 'Send: How’s it going?' }).tap();
  await expect(chand.getByRole('status')).toHaveText('Sent. It is in their app now.');
  s = sends(server);
  expect(s).toHaveLength(2);
  expect(s[1].p_to).toEqual(['app-chand']);
  expect(s[1].p_title).toBe('How’s it going?');
  expect(s[1].p_body).toMatch(/^Hi Chand, how's it going\?/);

  // 3. The 3rd message of the day: in the app, no phone notification, and the card says so.
  await asha.getByRole('button', { name: 'Send: How’s it going?' }).tap();
  await expect(asha.getByRole('status')).toHaveText('Sent to their app. No phone notification this time: your gym already sent 2 messages today.');
  await asha.scrollIntoViewIfNeeded();
  await shot(page, 'r534-03-sent-quiet', false);

  // 4. A member who left the app: plain words, nothing new sent.
  server.appMembers = [app('app-asha', 'Asha Verma')];
  const before = server.messages.length;
  await chand.getByRole('button', { name: 'Send: Well done' }).tap();
  await expect(chand.getByRole('status')).toHaveText('This member is not on the MettleUp app any more.');
  expect(server.messages.length).toBe(before);
  await chand.scrollIntoViewIfNeeded();
  await shot(page, 'r534-04-not-on-app', false);

  // 5. The day's 10 messages are used.
  while (server.messages.length < 10) server.messages.unshift({ ...server.messages[0], id: `msg-x${server.messages.length}` });
  await asha.getByRole('button', { name: 'Send: Well done' }).tap();
  await expect(asha.getByRole('status')).toContainText('That is the most for one day.');

  // 6. Hinglish.
  await page.evaluate(() => localStorage.setItem('forgeai.lang.v1', 'hinglish'));
  await page.reload();
  await go(page, '/trainer');
  const ashaHi = card(page, 'Asha Verma');
  await expect(ashaHi.getByRole('button', { name: 'Bhejo: Well done' })).toBeVisible({ timeout: 15_000 });
  await expect(ashaHi.getByText('Unke MettleUp app mein jayega, phone par notification ke saath.')).toBeVisible();
  await shot(page, 'r534-05-hinglish');
  await page.evaluate(() => localStorage.setItem('forgeai.lang.v1', 'en'));
  await page.reload();

  // 8. The computer size (before the second phone, on the owner's page).
  await page.setViewportSize({ width: 1280, height: 900 });
  await go(page, '/trainer');
  await expect(page.getByRole('main').getByRole('button', { name: 'Send: Well done' }).first()).toBeVisible({ timeout: 15_000 });
  await shot(page, 'r534-06-training-progress-computer');
  await page.setViewportSize({ width: 375, height: 812 });

  // 7. A trainer: no buttons, one line.
  await addDeskPerson(page);
  qs.trainers.add(DESK.name);
  const desk = await secondPhone(browser, server);
  await signIn(desk, DESK.phone);
  await go(desk, '/trainer');
  const deskMain = desk.getByRole('main');
  await expect(deskMain.getByText('Asha Verma', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(deskMain.getByRole('button', { name: /^Send:/ })).toHaveCount(0);
  await expect(deskMain.getByText('Only the gym owner can send these from here for now.').first()).toBeVisible();
  await expect(deskMain).not.toContainText('WhatsApp');
  await expectFitsPhone(desk, 'on Training progress for a trainer');
  await desk.screenshot({ path: `${DIR}/r534-07-trainer-no-buttons.png`, fullPage: true });
});
