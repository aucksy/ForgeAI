// R-593 (owner, 15 Nov 2026): "this today section is basically showing the new messages that came and what we replied.
// But I marked those conversations as done. I did it myself as the admin user. So why should I be looking at this
// history? ... Anything that user has already completed manually themselves doesn't have to be sitting here in the
// today section unnecessarily."
// UAT on a phone (390 x 844), owner, the way he did it: members' messages arrive -> they show on Today's "Latest from
// your members" and in the bell's number -> he replies to one and marks the others done on Member messages -> back on
// Today they are gone, the bell's number agrees, and the bell still lists them marked "Done". News (a member joined)
// shows once and is gone on the next visit. A new line in a done conversation brings it back (it needs him again).
// Pictures: e2e/.results/uat/today-handled-*.png (CI "dashboard-uat-pictures"). Saturday 17 Oct 2026, from 10 am IST.
import { mkdirSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { expectFitsPhone, expectNothingPastScreen, installAlertsList, installTalk, openApp, pickInTopBar, startOnlineGym, themeByEvents, wait } from './support.mjs';

const DIR = 'e2e/.results/uat';
mkdirSync(DIR, { recursive: true });

async function shot(page, name, fullPage = true) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/today-handled-${name}.png`, fullPage });
}

const go = (page, path) =>
  page.evaluate((p) => {
    window.location.hash = p;
  }, path);
const pageNow = (page) => page.evaluate(() => Date.now());
const MIN = 60_000;

test.use({ viewport: { width: 390, height: 844 } });

test('R-593 Today: a message he replied to or marked done leaves Today and the bell number; news shows once', async ({ page }) => {
  test.setTimeout(150_000);
  const server = await openApp(page);
  const alerts = installAlertsList(server);
  const talk = installTalk(server);
  talk.on = true;
  alerts.on = true;
  await startOnlineGym(page);
  const main = page.getByRole('main');
  const card = main.getByTestId('latest-alerts');
  const lines = card.getByRole('button');
  const bell = page.getByRole('button', { name: /^Notifications/ });
  // A fresh browser has no unread "What's new" (it remembers the first one it meets), so the bell counts alerts only.
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();

  // 1. Three messages and a join come in (his screen on 15 Nov: a question, a reply, feedback without a name, a join).
  const t = await pageNow(page);
  const member = (id, kind, name, text, at, anonymous = false) => ({
    id, kind, anonymous, memberId: null, name, phone: '98290 1000' + id.length, lines: [{ id: `${id}-0`, fromGym: false, who: null, text, at }],
  });
  talk.threads.push(
    member('q1', 'question', 'Arjun Mehta', 'Is the gym open on Sunday evening?', t - 9 * MIN),
    member('c1', 'complaint', 'Ravi Kumar', 'The shower on the left is broken.', t - 6 * MIN),
    member('f1', 'feedback', 'Neha Joshi', 'Please add one more squat rack.', t - 4 * MIN, true),
  );
  alerts.list.push(
    { id: 'aq1', kind: 'member_question', line: 'Arjun sent your gym a question. Open Member messages to reply.', route: '/member-messages', urgent: false, at: t - 9 * MIN },
    { id: 'ac1', kind: 'member_complaint', line: 'Ravi sent your gym a complaint. Open Member messages to read it.', route: '/member-messages', urgent: true, at: t - 6 * MIN },
    { id: 'af1', kind: 'member_feedback', line: 'A member sent your gym feedback without their name. Open Member messages to read it.', route: '/member-messages', urgent: false, at: t - 4 * MIN },
    { id: 'aj1', kind: 'member_joined', line: 'Vikram joined your gym in the MettleUp app. See them in Members using the app.', route: '/members/app', urgent: false, at: t - 2 * MIN },
  );
  await page.reload();
  await expect(lines).toHaveCount(4, { timeout: 15_000 });
  await expect(card).toContainText('Arjun sent your gym a question.');
  await expect(card).toContainText('Vikram joined your gym');
  await expect(bell).toHaveAccessibleName('Notifications, 4 new');
  await expect(main).toContainText('3 member messages to reply to');
  await expectFitsPhone(page, 'on Today with four alerts');
  await expectNothingPastScreen(page, 'on Today with four alerts');
  await shot(page, '1-four-waiting');

  // 2. Member messages: he replies to Arjun and marks Neha's feedback done (the complaint still waits).
  await go(page, '/member-messages');
  await expect(page.getByRole('heading', { name: 'Member messages', exact: true })).toBeVisible();
  const msgs = main.getByTestId('member-message');
  await expect(msgs).toHaveCount(3, { timeout: 15_000 });
  const arjun = msgs.filter({ hasText: 'Arjun Mehta' });
  await arjun.getByLabel('Your reply').fill('Yes, 5 pm to 10 pm on Sunday.');
  await arjun.getByRole('button', { name: 'Send reply' }).click();
  await expect(arjun).toContainText('Reply sent.');
  await msgs.filter({ hasText: 'squat rack' }).getByRole('button', { name: 'Mark as done' }).click();
  await expect(main.getByRole('region', { name: 'Done' })).toContainText('squat rack');

  // 3. Back on Today: only the complaint is left. The join was on screen in the last visit: it is gone too.
  await go(page, '/');
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await expect(lines).toHaveCount(1, { timeout: 10_000 });
  await expect(lines.first()).toContainText('Ravi sent your gym a complaint.');
  await expect(card).not.toContainText('Arjun');
  await expect(card).not.toContainText('without their name');
  await expect(card).not.toContainText('Vikram');
  await expect(bell).toHaveAccessibleName('Notifications, 1 new');
  await expect(main).toContainText('1 member message to reply to');
  await shot(page, '2-one-left');

  // 4. The complaint marked done: nothing is left, so the card is gone (no empty card), and the bell has no number.
  await go(page, '/member-messages');
  await expect(msgs).toHaveCount(3, { timeout: 15_000 });
  await msgs.filter({ hasText: 'shower' }).getByRole('button', { name: 'Mark as done' }).click();
  await expect(main.getByRole('region', { name: 'Done' })).toContainText('shower');
  await go(page, '/');
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await expect(main.getByRole('heading', { name: 'Latest from your members' })).toHaveCount(0, { timeout: 10_000 });
  await expect(card).toHaveCount(0);
  await expect(bell).toHaveAccessibleName('Notifications');
  await expect(main).not.toContainText('member message to reply to');
  await expectNothingPastScreen(page, 'on Today with nothing left');
  await shot(page, '3-nothing-left');

  // The bell still keeps the history: four lines, the three handled ones say Done, the news does not.
  await bell.click();
  const history = page.getByTestId('bell-gym-alerts').getByRole('button');
  await expect(history).toHaveCount(4);
  await expect(page.getByTestId('bell-gym-alerts').locator('[data-done-tag]')).toHaveCount(3);
  await expect(history.filter({ hasText: 'Vikram joined' }).locator('[data-done-tag]')).toHaveCount(0);
  await expectNothingPastScreen(page, 'with the bell open');
  await shot(page, '4-bell-history', false);
  await bell.click();

  // 5. Regression: after a reload it stays gone (the panel remembers what Member messages said; nothing waits).
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await wait(page, 3_000);
  await expect(main.getByRole('heading', { name: 'Latest from your members' })).toHaveCount(0);
  await expect(bell).toHaveAccessibleName('Notifications');

  // 6. Ravi writes again in the done conversation: it needs him again, so it is back on Today and in the number.
  const t2 = await pageNow(page);
  const ravi = talk.threads.find((x) => x.id === 'c1');
  ravi.lines.push({ id: 'c1-9', fromGym: false, who: null, text: 'Still broken today.', at: t2 });
  ravi.doneAt = null;
  ravi.doneBy = null;
  alerts.list.push({ id: 'ac2', kind: 'member_complaint', line: 'Ravi replied in Member messages. Open it to read the reply.', route: '/member-messages', urgent: true, at: t2 });
  await wait(page, 61_000);
  await expect(lines).toHaveCount(1, { timeout: 15_000 });
  await expect(lines.first()).toContainText('Ravi replied in Member messages.');
  await expect(bell).toHaveAccessibleName('Notifications, 1 new');

  // 7. The same screen in Hinglish, light and dark, still inside the phone.
  await pickInTopBar(page, 'Hinglish');
  for (const mode of ['dark', 'light']) {
    await themeByEvents(page, mode);
    await expectNothingPastScreen(page, `on Today in Hinglish, ${mode}`);
    await shot(page, `5-back-again-hinglish-${mode}`);
  }
  expect(server.log.filter((c) => c.fn === 'owner_talk_done').length).toBe(2);
});
