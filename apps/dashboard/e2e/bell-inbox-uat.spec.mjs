// R-604 (owner, 16 Nov 2026, "yes alerts fix"): UAT of the bell as each person's to-do list, with the server's truth
// (supabase/migrations/0098_alerts_done_and_read.sql, answered here by support.mjs installAlertInbox by its rules).
// His words: opening the panel reads it, "but it probably should not go away until the user has acted on it"; "anything
// that they have done should go away"; the cards "do not look like they can be clicked". Pictures go to
// e2e/.results/uat (CI: "dashboard-uat-pictures"), named bell-*.
//
//  1. Owner, phone 390: the number (action items not done + news not read), "New" marks, History folded at the top,
//     cards that look tappable (chevron, our own pressed look, a 44 px X); opening reads them on the server; the X
//     with "Removed from your list." and Undo; the X never makes a thing done (its page and Today still show it); news
//     leaves when opened; nothing moves while the panel is open (a thing done meanwhile gets "Done" in place); a
//     reload keeps it all (the server's truth); 8 days later, news nobody opened is in History as "Older than 7 days".
//  2. Desk at 360 and a trainer: each their own list (the desk's X leaves the owner's bell as it was); the desk never
//     sees the owner's complaint or the trainer's question; the trainer's real answer is done for everyone.
//  3. A computer: nothing waiting ("Nothing is waiting for you."), then 120 at once (the server sends 100), hover,
//     the keyboard's focus ring, the light theme.
//  4. A server without 0098 (the live server today): the bell as before (no X, no History); after 0098 the new bell.
import { mkdirSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import {
  DESK,
  PHONE,
  addDeskPerson,
  expectFitsPhone,
  installAlertInbox,
  installAlertsList,
  installQuestions,
  installTalk,
  openApp,
  signIn,
  startOnlineGym,
  wait,
} from './support.mjs';

const DIR = 'e2e/.results/uat';
mkdirSync(DIR, { recursive: true });

async function shot(page, name, fullPage = false) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage });
}

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const pageNow = (page) => page.evaluate(() => Date.now());
const go = (page, path) =>
  page.evaluate((p) => {
    window.location.hash = p;
  }, path);
const hash = (page) => page.evaluate(() => window.location.hash);

const bellOf = (page) => page.getByRole('button', { name: /^Notifications/ });
const panelOf = (page) => page.getByRole('dialog', { name: 'Notifications' });
const cardsOf = (page) => panelOf(page).getByTestId('bell-gym-alerts').locator('li');
const historyOf = (page) => panelOf(page).getByRole('button', { name: /^History/ });
const removedCalls = (server) => server.log.filter((c) => c.fn === 'owner_alert_remove').map((c) => [c.args.p_alert, c.args.p_remove]);

/** A server with 0098, Member messages (0069) and the trainer questions (0050/0053). */
function gymServer(server) {
  const qs = installQuestions(server);
  const talk = installTalk(server);
  // Installed last: it sees the replies and answers the others answer, the way 0098's triggers see them.
  const box = installAlertInbox(server);
  qs.on = true;
  talk.on = true;
  box.on = true;
  return { qs, talk, box };
}

async function phone(browser, server, width) {
  const context = await browser.newContext({ ...PHONE, viewport: { width, height: 780 }, baseURL: test.info().project.use.baseURL });
  const page = await context.newPage();
  await openApp(page, { server });
  return page;
}

test('Owner on a phone: the bell keeps what is not done, news until opened, X with Undo, History at the top', async ({ page }) => {
  const server = await openApp(page);
  const { qs, talk, box } = gymServer(server);
  await startOnlineGym(page);
  const main = page.getByRole('main');
  const t = await pageNow(page);
  talk.threads.push({
    id: 'c1', kind: 'question', anonymous: false, memberId: null, name: 'Asha Verma', phone: '98290 11111',
    lines: [{ id: 'c1-0', fromGym: false, who: null, text: 'Is the gym open on Diwali?', at: t - 10 * MIN }],
  });
  qs.list.push({ id: 'q1', name: 'Ravi Kumar', question: 'Is the 6 am batch full tomorrow?', askedAt: t - 20 * MIN });
  box.list.push(
    { id: 'a1', kind: 'member_question', ref: 'c1', line: 'Asha sent your gym a question. Open Member messages to reply.', route: '/member-messages', at: t - 10 * MIN },
    { id: 'a2', kind: 'trainer_question', ref: 'q1', line: 'Ravi asked a trainer a question. Open Questions to reply.', route: '/questions', at: t - 20 * MIN },
    { id: 'i1', kind: 'member_joined', line: 'Vikram joined your gym in the MettleUp app. See them in Members using the app.', route: '/members/app', at: t - 30 * MIN },
    { id: 'i2', kind: 'paid_online', line: 'Neha paid online for Monthly. See it on Money.', route: '/money', at: t - 40 * MIN },
    // Answered an hour ago by the desk: History, "Done by Sunita Verma".
    { id: 'd1', kind: 'member_question', line: 'Bilal sent your gym a question. Open Member messages to reply.', route: '/member-messages', at: t - 90 * MIN, handledAt: t - 60 * MIN, handledBy: DESK.name },
  );
  await page.reload();
  const bell = bellOf(page);
  const panel = panelOf(page);
  const cards = cardsOf(page);
  const history = historyOf(page);

  // The number: 2 questions not answered + 2 news not seen.
  await expect(bell).toHaveAttribute('aria-label', 'Notifications, 4 waiting for you', { timeout: 15_000 });
  await bell.tap();
  await expect(cards).toHaveCount(4);
  await expect(panel.getByText('New', { exact: true })).toHaveCount(4);
  // History: one row at the top, folded, with its count.
  await expect(history).toHaveAttribute('aria-expanded', 'false');
  await expect(history).toContainText('1');
  expect((await history.boundingBox()).y).toBeLessThan((await cards.first().boundingBox()).y);
  // Looks like something to tap: a chevron on each card, no grey browser cover, a real 44 px X.
  await expect(cards.first().locator('.tap-chevron')).toHaveCount(1);
  const openBtn = cards.first().locator('button.tap-row');
  expect(await openBtn.evaluate((el) => getComputedStyle(el).webkitTapHighlightColor)).toBe('rgba(0, 0, 0, 0)');
  const x = await cards.first().locator('[data-remove]').boundingBox();
  expect(x.width).toBeGreaterThanOrEqual(44);
  expect(x.height).toBeGreaterThanOrEqual(44);
  await expectFitsPhone(page, 'with the bell open');
  await shot(page, 'bell-1-phone-open');
  // Opening it read the four, on the server, for this person (never done).
  await expect.poll(() => server.log.filter((c) => c.fn === 'owner_alerts_read').flatMap((c) => c.args.p_ids).sort()).toEqual(['a1', 'a2', 'i1', 'i2']);
  expect(box.list.filter((a) => a.handledAt).map((a) => a.id)).toEqual(['d1']);

  // Closed: the news no longer counts; the two questions still do (not answered yet). Open again: all four still
  // there, none "New".
  await bell.tap();
  await expect(bell).toHaveAttribute('aria-label', 'Notifications, 2 waiting for you');
  await bell.tap();
  await expect(cards).toHaveCount(4);
  await expect(panel.getByText('New', { exact: true })).toHaveCount(0);
  await shot(page, 'bell-2-phone-read');

  // The X on Ravi's question: off the list at once, into History, "Removed from your list." with Undo.
  await panel.getByRole('button', { name: /^Remove from your list: Ravi/ }).tap();
  await expect(cards).toHaveCount(3);
  await expect(history).toContainText('2');
  const undoBar = page.getByRole('status').filter({ hasText: 'Removed from your list.' });
  await expect(undoBar).toBeVisible();
  // One line, not wrapped into half the screen (fresh eyes on the first pictures).
  expect((await undoBar.boundingBox()).height).toBeLessThan(64);
  await expect(panel).toBeVisible();
  await shot(page, 'bell-3-phone-removed-undo');
  // Undo: back in its place, History as it was. The panel stays open (the Undo is part of the bell).
  await page.getByRole('button', { name: /^Undo: put back Ravi/ }).tap();
  await expect(cards).toHaveCount(4);
  await expect(cards.nth(1)).toContainText('Ravi');
  await expect(history).toContainText('1');
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: /^Remove from your list: Ravi/ }).tap();
  await expect(cards).toHaveCount(3);
  await expect.poll(() => removedCalls(server)).toEqual([
    ['a2', true],
    ['a2', false],
    ['a2', true],
  ]);
  // The X never makes it done.
  expect(box.list.find((a) => a.id === 'a2').handledAt).toBeUndefined();

  // History, unfolded: Ravi's question "Removed · Not done yet"; Bilal's "Done", by Sunita.
  await history.tap();
  await expect(history).toHaveAttribute('aria-expanded', 'true');
  const hist = panel.getByTestId('bell-history-list').locator('li');
  await expect(hist).toHaveCount(2);
  await expect(hist.nth(0)).toContainText('Ravi');
  await expect(hist.nth(0)).toContainText('Removed · Not done yet');
  await expect(hist.nth(1)).toContainText('Bilal');
  await expect(hist.nth(1)).toContainText('Done');
  await expect(hist.nth(1)).toContainText(`Done by ${DESK.name}`);
  await shot(page, 'bell-4-phone-history');
  // Every History line still opens its page.
  await hist.nth(0).getByRole('button').tap();
  await expect.poll(() => hash(page)).toBe('#/questions');
  await expect(panel).toHaveCount(0);
  // Removed is not done: the question still waits on its page, and on Today.
  await expect(main).toContainText('Is the 6 am batch full tomorrow?', { timeout: 15_000 });
  await expect(main.getByRole('textbox', { name: 'Your reply' })).toBeVisible();
  await go(page, '/');
  await expect(main.getByTestId('latest-alerts')).toContainText('Ravi', { timeout: 15_000 });
  // The bell: Asha's question only (the news is read; Ravi's is off this person's list).
  await expect(bell).toHaveAttribute('aria-label', 'Notifications, 1 waiting for you');

  // News leaves when it is opened: Vikram's line opens Members using the app, then sits in History as Opened.
  await bell.tap();
  await cards.filter({ hasText: 'Vikram' }).locator('button.tap-row').tap();
  await expect.poll(() => hash(page)).toBe('#/members/app');
  await expect.poll(() => server.log.filter((c) => c.fn === 'owner_alert_opened').map((c) => c.args.p_alert)).toContain('i1');
  await bell.tap();
  await expect(cards).toHaveCount(2);
  await expect(cards.filter({ hasText: 'Vikram' })).toHaveCount(0);
  await history.tap();
  await expect(panel.getByTestId('bell-history-list').locator('li').filter({ hasText: 'Vikram' })).toContainText('Opened');
  await bell.tap();

  // Nothing moves while the panel is open: Asha's question is answered on another phone meanwhile; the next look
  // (a minute) marks it Done where it is. Closed and opened again, it is in History.
  await bell.tap();
  await expect(cards).toHaveCount(2);
  box.list.find((a) => a.id === 'a1').handledAt = t + MIN;
  box.list.find((a) => a.id === 'a1').handledBy = DESK.name;
  await wait(page, 61_000);
  await expect(cards.filter({ hasText: 'Asha' })).toContainText('Done', { timeout: 15_000 });
  await expect(cards).toHaveCount(2);
  await shot(page, 'bell-5-phone-done-while-open');
  await bell.tap();
  await expect(bell).toHaveAttribute('aria-label', 'Notifications');
  await bell.tap();
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText('Neha');

  // A reload (a new tab, the next morning): the same list, from the server. (The page is still Members using the app.)
  await go(page, '/');
  await page.reload();
  await expect(main.getByTestId('latest-alerts')).toContainText('Ravi', { timeout: 15_000 });
  await bell.tap();
  await expect(cards).toHaveCount(1);
  await expect(history).toContainText('4');
  await bell.tap();

  // A week later: news nobody opened is in History as "Older than 7 days"; nothing is waiting.
  box.now = t + 7 * DAY + 2 * MIN;
  await page.reload();
  await bell.tap();
  await expect(panel.getByTestId('bell-all-done')).toContainText('Nothing is waiting for you.', { timeout: 15_000 });
  await history.tap();
  await expect(panel.getByTestId('bell-history-list').locator('li').filter({ hasText: 'Neha' })).toContainText('Older than 7 days');
  await shot(page, 'bell-6-phone-week-later');
});

test('Desk at 360 and a trainer: each their own bell; the X never marks done; the trainer’s answer is done for all', async ({ page, browser }) => {
  const server = await openApp(page);
  const { qs, talk, box } = gymServer(server);
  await startOnlineGym(page);
  const TRAINER = { name: 'Tara Singh', phone: '98290 77777' };
  qs.trainers.add(TRAINER.name);
  talk.trainers.add(TRAINER.name);
  await addDeskPerson(page);
  await addDeskPerson(page, TRAINER);
  const t = await pageNow(page);
  talk.threads.push({
    id: 'c1', kind: 'question', anonymous: false, memberId: null, name: 'Asha Verma', phone: '98290 11111',
    lines: [{ id: 'c1-0', fromGym: false, who: null, text: 'Is the gym open on Diwali?', at: t - 10 * MIN }],
  });
  qs.list.push({ id: 'q1', name: 'Ravi Kumar', question: 'Is the 6 am batch full tomorrow?', askedAt: t - 20 * MIN });
  box.list.push(
    { id: 'a1', kind: 'member_question', ref: 'c1', line: 'Asha sent your gym a question. Open Member messages to reply.', route: '/member-messages', at: t - 10 * MIN },
    { id: 'a2', kind: 'trainer_question', ref: 'q1', onlyFor: TRAINER.name, line: 'Ravi asked a trainer a question. Open Questions to reply.', route: '/questions', at: t - 20 * MIN },
    { id: 'k1', kind: 'member_complaint', line: 'Mohit sent your gym a complaint. Open Member messages to read it.', route: '/member-messages', urgent: true, at: t - 30 * MIN },
    { id: 'i1', kind: 'member_joined', line: 'Vikram joined your gym in the MettleUp app. See them in Members using the app.', route: '/members/app', at: t - 40 * MIN },
  );

  // The desk, on a small phone: Asha's question and Vikram; never the complaint (the owner's) or Ravi's question
  // (Tara's).
  const desk = await phone(browser, server, 360);
  await signIn(desk, DESK.phone);
  await expect(bellOf(desk)).toHaveAttribute('aria-label', 'Notifications, 2 waiting for you', { timeout: 15_000 });
  await bellOf(desk).tap();
  await expect(cardsOf(desk)).toHaveCount(2);
  await expect(panelOf(desk)).not.toContainText('complaint');
  await expect(panelOf(desk)).not.toContainText('Ravi');
  await expectFitsPhone(desk, 'the desk’s bell at 360');
  await shot(desk, 'bell-7-desk-360');
  // The desk removes Asha's question from their own list.
  await panelOf(desk).getByRole('button', { name: /^Remove from your list: Asha/ }).tap();
  await expect(cardsOf(desk)).toHaveCount(1);
  await shot(desk, 'bell-8-desk-360-removed');
  await bellOf(desk).tap();
  await expect(bellOf(desk)).toHaveAttribute('aria-label', 'Notifications');

  // The owner's bell is as it was: all four, all new (the desk's read and X are the desk's own).
  await page.reload();
  await expect(bellOf(page)).toHaveAttribute('aria-label', 'Notifications, 4 waiting for you', { timeout: 15_000 });
  await bellOf(page).tap();
  await expect(cardsOf(page)).toHaveCount(4);
  await expect(panelOf(page).getByText('New', { exact: true })).toHaveCount(4);
  await bellOf(page).tap();

  // The trainer: Ravi's question (theirs), Asha's (questions are for everyone) and Vikram. Never the complaint.
  const trainer = await phone(browser, server, 390);
  await signIn(trainer, TRAINER.phone);
  await expect(bellOf(trainer)).toHaveAttribute('aria-label', 'Notifications, 3 waiting for you', { timeout: 15_000 });
  await bellOf(trainer).tap();
  await expect(cardsOf(trainer)).toHaveCount(3);
  await expect(panelOf(trainer)).not.toContainText('complaint');
  await shot(trainer, 'bell-9-trainer-open');
  // A tap opens Member questions; the trainer answers for real.
  await cardsOf(trainer).filter({ hasText: 'Ravi' }).locator('button.tap-row').tap();
  await expect.poll(() => hash(trainer)).toBe('#/questions');
  const tmain = trainer.getByRole('main');
  await tmain.getByRole('textbox', { name: 'Your reply' }).fill('Yes, 2 places left at 6 am.');
  await tmain.getByRole('button', { name: 'Send reply' }).tap();
  await expect.poll(() => box.list.find((a) => a.id === 'a2').handledBy).toBe(TRAINER.name);
  // Soon after (a few seconds; at the latest the minute's look) the trainer's bell has it in History, "Done by Tara Singh".
  await wait(trainer, 61_000);
  await expect(bellOf(trainer)).toHaveAttribute('aria-label', 'Notifications, 1 waiting for you', { timeout: 15_000 });
  await bellOf(trainer).tap();
  await expect(cardsOf(trainer).filter({ hasText: 'Ravi' })).toHaveCount(0);
  await historyOf(trainer).tap();
  await expect(panelOf(trainer).getByTestId('bell-history-list').locator('li').filter({ hasText: 'Ravi' })).toContainText(`Done by ${TRAINER.name}`);
  await shot(trainer, 'bell-10-trainer-answered');

  // Done is the same for everyone: the owner sees it in History too, and the desk's X made nothing done.
  await page.reload();
  await bellOf(page).tap();
  await expect(cardsOf(page)).toHaveCount(3, { timeout: 15_000 });
  await historyOf(page).tap();
  await expect(panelOf(page).getByTestId('bell-history-list')).toContainText(`Done by ${TRAINER.name}`);
  expect(box.list.find((a) => a.id === 'a1').handledAt).toBeUndefined();
  await shot(page, 'bell-11-owner-sees-trainer-done');
  await desk.context().close();
  await trainer.context().close();
});

test('A computer: nothing waiting, then 120 at once; hover, the keyboard, the light theme', async ({ browser }) => {
  // A computer with a mouse (and touch, as the shared sign-up steps tap).
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, hasTouch: true, isMobile: false, deviceScaleFactor: 1, locale: 'en-IN', timezoneId: 'Asia/Kolkata', baseURL: test.info().project.use.baseURL });
  const page = await context.newPage();
  const server = await openApp(page);
  const { box } = gymServer(server);
  await startOnlineGym(page);
  const bell = bellOf(page);
  const panel = panelOf(page);
  const cards = cardsOf(page);

  // Nothing at all: the panel says so; History is there with 0.
  await expect(bell).toHaveAttribute('aria-label', 'Notifications');
  await bell.click();
  await expect(panel.getByTestId('bell-all-done')).toHaveText('Nothing is waiting for you. New messages and requests from your members will show here.', { timeout: 15_000 });
  await expect(historyOf(page)).toContainText('0');
  await historyOf(page).click();
  await expect(panel.getByTestId('bell-history-hint')).toContainText('Nothing here yet.');
  await shot(page, 'bell-12-computer-nothing');
  await bell.click();

  // 120 at once (a busy morning): the server sends the newest 100; the number says 100.
  const t = await pageNow(page);
  for (let i = 0; i < 120; i += 1) {
    box.list.push({ id: `m${String(i).padStart(3, '0')}`, kind: 'member_question', line: `Member ${i + 1} sent your gym a question. Open Member messages to reply.`, route: '/member-messages', at: t - (i + 1) * MIN });
  }
  await page.reload();
  await expect(bell).toHaveAttribute('aria-label', 'Notifications, 100 waiting for you', { timeout: 15_000 });
  await expect(bell).toContainText('99+');
  await shot(page, 'bell-13-computer-badge-100');
  await bell.click();
  await expect(cards).toHaveCount(100);
  // Hover: the card's border firms up and its chevron nudges.
  await cards.nth(1).hover();
  await shot(page, 'bell-14-computer-hover');
  // The keyboard: Tab reaches the cards; the ring is drawn inside the card.
  await page.keyboard.press('Escape');
  await bell.focus();
  await page.keyboard.press('Enter');
  await expect(panel).toBeVisible();
  let onCard = false;
  for (let i = 0; i < 10 && !onCard; i += 1) {
    await page.keyboard.press('Tab');
    onCard = await page.evaluate(() => Boolean(document.activeElement?.closest('[data-alert-card]')));
  }
  expect(onCard, 'Tab reaches a card').toBe(true);
  expect(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle)).toBe('solid');
  await shot(page, 'bell-15-computer-keyboard');
  await page.keyboard.press('Escape');

  // The light theme.
  await page.getByRole('radio', { name: 'Light' }).first().click();
  await bell.click();
  await expect(cards).toHaveCount(100);
  await shot(page, 'bell-16-computer-light');
  await context.close();
});

test('A server without 0098: the bell as before; after 0098 arrives, the new bell', async ({ page }) => {
  const server = await openApp(page);
  const alerts = installAlertsList(server);
  const { box } = gymServer(server);
  box.on = false;
  alerts.on = true;
  await startOnlineGym(page);
  const t = await pageNow(page);
  alerts.list.push({ id: 'o1', kind: 'member_joined', line: 'Vikram joined your gym in the MettleUp app. See them in Members using the app.', route: '/members/app', urgent: false, at: t - 5 * MIN });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await bellOf(page).tap();
  await expect(panelOf(page).getByTestId('bell-gym-alerts')).toContainText('Vikram', { timeout: 15_000 });
  await expect(panelOf(page).locator('[data-remove]')).toHaveCount(0);
  await expect(historyOf(page)).toHaveCount(0);
  await shot(page, 'bell-17-phone-old-server');
  await bellOf(page).tap();

  // 0098 is applied: the next load is the new bell (this person has not read it yet: it counts).
  box.on = true;
  box.list.push({ id: 'o1', kind: 'member_joined', line: 'Vikram joined your gym in the MettleUp app. See them in Members using the app.', route: '/members/app', at: t - 5 * MIN });
  await page.reload();
  await expect(bellOf(page)).toHaveAttribute('aria-label', 'Notifications, 1 waiting for you', { timeout: 15_000 });
  await bellOf(page).tap();
  await expect(cardsOf(page)).toHaveCount(1);
  await expect(panelOf(page).locator('[data-remove]')).toHaveCount(1);
  await expect(historyOf(page)).toHaveCount(1);
  await shot(page, 'bell-18-phone-after-0098');
});
