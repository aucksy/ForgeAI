// R-586 (owner, 15 Nov 2026): "It should be GYM Onwer or the name of the trainers added in Admin Panel..user can select
// any. For feedback / complaint, they can select GYM Owner or GYM Admin (gym admin will send to both owner and staff,
// any type)". UAT of Member messages with a recipient (0096), on phones (375 x 812) and a computer (1280 x 900). The
// gym's server is the pretend one (support.mjs installTalk), with the same rule as
// supabase/migrations/0096_message_recipient.sql. Pictures go to e2e/.results/uat ("dashboard-uat-pictures").
//
//  1. The owner sees every message, each saying who it went to: "To: Tara Singh", "To: Gym admin", "To: Gym owner";
//     a message from an older app says nothing.
//  2. The front desk sees only what is for the desk: the "Gym admin" complaint (with a Complaints button) and the old
//     question; never the trainer's question or anything sent to the owner only. The note says why.
//  3. Trainer Tara sees her own question and the old question only; never the "Gym admin" complaint (it is about a
//     trainer), never feedback. She replies; the owner sees her reply.
//  4. The computer picture of the owner's list.
import { mkdirSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { NOW, addDeskPerson, expectFitsPhone, installTalk, openApp, secondPhone, signIn, startOnlineGym } from './support.mjs';

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

const T0 = NOW.getTime();
const TARA = { name: 'Tara Singh', phone: '98290 67890' };
const DESK = { name: 'Sunita Verma', phone: '98290 54321' };

const one = (id, kind, name, text, minutesAgo, to = undefined, toName = undefined) => ({
  id,
  kind,
  anonymous: false,
  memberId: null,
  name,
  phone: null,
  to,
  toName,
  lines: [{ id: `${id}-0`, fromGym: false, who: null, text, at: T0 - minutesAgo * 60_000 }],
});

test.use({ viewport: { width: 375, height: 812 } });

test('R-586: each person sees only the messages sent to them, and each card says who it went to', async ({ page, browser }) => {
  const server = await openApp(page);
  const talk = installTalk(server);
  talk.on = true;
  talk.trainers.add(TARA.name);
  talk.threads.push(
    one('qt', 'question', 'Asha Verma', 'How do I stop my knees hurting on squats?', 300, 'trainer', TARA.name),
    one('qo', 'question', 'Bilal Khan', 'Can I pay my fee in two parts this month?', 240, 'owner'),
    one('cd', 'complaint', 'Ravi Kumar', 'The trainer came 30 minutes late to my 7 am session twice this week.', 180, 'desk'),
    one('co', 'complaint', 'Neha Joshi', 'Someone at the desk was rude to me on Monday.', 120, 'owner'),
    one('fo', 'feedback', 'Kiran Rao', 'Please play softer music in the morning.', 90, 'owner'),
    one('oq', 'question', 'Mohit Jain', 'Is the gym open on Diwali?', 60),
  );
  await startOnlineGym(page);
  await addDeskPerson(page, DESK);
  await addDeskPerson(page, TARA);
  const main = page.getByRole('main');

  // 1. The owner: all six, each saying who it went to.
  await go(page, '/member-messages');
  await expect(page.getByRole('heading', { name: 'Member messages', exact: true })).toBeVisible();
  const cards = main.getByTestId('member-message');
  await expect(cards).toHaveCount(6);
  await expect(cards.filter({ hasText: 'Asha Verma' }).getByTestId('member-message-to')).toHaveText('To: Tara Singh');
  await expect(cards.filter({ hasText: 'Bilal Khan' }).getByTestId('member-message-to')).toHaveText('To: Gym owner');
  await expect(cards.filter({ hasText: 'Ravi Kumar' }).getByTestId('member-message-to')).toHaveText('To: Gym admin');
  await expect(cards.filter({ hasText: 'Neha Joshi' }).getByTestId('member-message-to')).toHaveText('To: Gym owner');
  await expect(cards.filter({ hasText: 'Kiran Rao' }).getByTestId('member-message-to')).toHaveText('To: Gym owner');
  // A message from an older app: no "To" line.
  await expect(cards.filter({ hasText: 'Mohit Jain' }).getByTestId('member-message-to')).toHaveCount(0);
  await expectFitsPhone(page, 'on the owner’s Member messages with recipients');
  await shot(page, 'phone-r586-1-owner-list');
  await cards.filter({ hasText: 'Asha Verma' }).scrollIntoViewIfNeeded();
  await shot(page, 'phone-r586-1b-owner-trainer-card', false);

  // 2. The front desk: the "Gym admin" complaint and the old question only.
  const desk = await secondPhone(browser, server);
  await signIn(desk, DESK.phone);
  await go(desk, '/member-messages');
  const deskMain = desk.getByRole('main');
  const deskCards = deskMain.getByTestId('member-message');
  await expect(deskCards).toHaveCount(2);
  await expect(deskMain).toContainText('The trainer came 30 minutes late');
  await expect(deskMain).toContainText('Is the gym open on Diwali?');
  for (const hidden of ['knees hurting', 'two parts', 'rude to me', 'softer music']) await expect(deskMain).not.toContainText(hidden);
  await expect(deskMain).toContainText('Messages a member sent only to the owner or to a trainer are not shown here. Complaints show here only when the member picked "Gym admin".');
  await expect(deskMain.getByRole('group', { name: 'Show' }).getByRole('button', { name: /^Complaints/ })).toHaveCount(1);
  await expect(deskCards.filter({ hasText: 'Ravi Kumar' }).getByTestId('member-message-to')).toHaveText('To: Gym admin');
  await expectFitsPhone(desk, 'on the desk’s Member messages with recipients');
  await shot(desk, 'phone-r586-2-desk-list');
  await desk.context().close();

  // 3. Trainer Tara: her own question and the old question; never the complaint about a trainer, never feedback.
  const tara = await secondPhone(browser, server);
  await signIn(tara, TARA.phone);
  await go(tara, '/member-messages');
  const taraMain = tara.getByRole('main');
  const taraCards = taraMain.getByTestId('member-message');
  await expect(taraCards).toHaveCount(2);
  await expect(taraMain).toContainText('How do I stop my knees hurting on squats?');
  await expect(taraMain).toContainText('Is the gym open on Diwali?');
  for (const hidden of ['30 minutes late', 'two parts', 'rude to me', 'softer music']) await expect(taraMain).not.toContainText(hidden);
  await expect(taraMain).toContainText('Feedback goes to the owner and front desk, and complaints go to the owner only, so they are not shown here.');
  await expect(taraMain.getByRole('group', { name: 'Show' }).getByRole('button', { name: /^(Feedback|Complaints)/ })).toHaveCount(0);
  const asha = taraCards.filter({ hasText: 'Asha Verma' });
  await expect(asha.getByTestId('member-message-to')).toHaveText('To: Tara Singh');
  await asha.getByLabel('Your reply').fill('Keep your knees over your toes and go lighter for a week.');
  await asha.getByRole('button', { name: 'Send reply' }).tap();
  await expect(asha).toContainText('Reply sent.');
  await expect(asha).toContainText('Tara Singh replied · Today');
  expect(server.log.filter((c) => c.fn === 'owner_talk_reply').map((c) => c.args)).toEqual([expect.objectContaining({ p_thread: 'qt' })]);
  await expectFitsPhone(tara, 'on the trainer’s Member messages');
  await shot(tara, 'phone-r586-3-trainer-replied');
  await tara.context().close();

  // The owner sees Tara's reply (the owner can read a question sent to a trainer).
  await go(page, '/more');
  await go(page, '/member-messages');
  await expect(cards.filter({ hasText: 'Asha Verma' })).toContainText('Tara Singh replied · Today');

  // 4. The computer picture.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(300);
  await shot(page, 'computer-r586-4-owner-list');
});
