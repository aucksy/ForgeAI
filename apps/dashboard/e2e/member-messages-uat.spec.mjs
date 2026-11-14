// Owner request, 12 Nov 2026: UAT of "Member messages" (members' "Message your gym": questions, feedback,
// complaints), on a phone (375 x 812) with computer pictures (1280 x 900). Every step taps the real screen; pictures
// go to e2e/.results/uat (CI uploads them as "dashboard-uat-pictures"). The gym's server is the pretend one
// (support.mjs); the 0069 calls are answered here, by the same rules as supabase/migrations/0069_member_messages.sql:
// the owner sees everything, the desk sees questions and feedback but never complaints, and feedback sent without
// the name comes with no name, phone or member id. Today is Saturday 17 Oct 2026, 10:00 am India time.
//
//  1. A server without 0069 (the live server today): no menu item; an old link says "not switched on". Nothing sent.
//  2. With 0069: the menu item with 3 waiting; the page with the three, the nameless feedback without a name.
//  3. Type buttons: Complaints shows only the complaint.
//  4. Reply to Asha (empty reply cannot be sent): "Reply sent.", she moves to Replied, the badge goes to 2.
//  5. Mark the feedback as done, then open it again.
//  6. The front desk on a second phone: questions and feedback only, no Complaints button, the note says why.
//  7. A message that is gone (the member left): plain words, the list comes again.
import { mkdirSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { DESK, NOW, addDeskPerson, addMember, expectFitsPhone, installQuestions, installTalk, openApp, secondPhone, signIn, startOnlineGym } from './support.mjs';

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

function rosterIdOf(server, fullName) {
  const r = [...server.records.values()].find((x) => x.k === 'member' && !x.x && x.d.fullName === fullName);
  if (!r) throw new Error(`no member ${fullName}`);
  return r.id;
}

test.use({ viewport: { width: 375, height: 812 } });

test('Member messages: not ready, the list, types, reply, done, the desk, a gone message', async ({ page, browser }) => {
  const server = await openApp(page);
  const talk = installTalk(server);
  await startOnlineGym(page);
  await addMember(page, { name: 'Asha Verma', phone: '98290 11111' });
  const main = page.getByRole('main');

  // 1. No 0069: no menu item, and an old link says plainly it is not switched on.
  await go(page, '/more');
  await expect(page.getByRole('heading', { name: 'More', exact: true })).toBeVisible();
  await expect(main.getByRole('link', { name: /^Member messages/ })).toHaveCount(0);
  await go(page, '/member-messages');
  await expect(main.getByTestId('member-messages-not-ready')).toContainText('Member messages are not switched on for your gym yet.');
  await expect(main.getByRole('button', { name: 'Send reply' })).toHaveCount(0);
  await expectFitsPhone(page, 'on Member messages, not ready');
  await shot(page, 'phone-member-messages-1-not-ready');
  expect(server.log.filter((c) => ['owner_talk_reply', 'owner_talk_done'].includes(c.fn))).toHaveLength(0);

  // 2. With 0069: three waiting.
  talk.on = true;
  talk.threads.push(
    {
      id: 'q1', kind: 'question', anonymous: false, memberId: rosterIdOf(server, 'Asha Verma'), name: 'Asha Verma', phone: '98290 11111',
      lines: [{ id: 'q1-0', fromGym: false, who: null, text: 'Is the gym open on Diwali?', at: T0 - 3 * 3600_000 }],
    },
    {
      id: 'f1', kind: 'feedback', anonymous: true, memberId: null, name: 'Bilal Khan', phone: '98290 33333',
      lines: [{ id: 'f1-0', fromGym: false, who: null, text: 'Please add a second squat rack. The evening queue is long.', at: T0 - 2 * 3600_000 }],
    },
    {
      id: 'c1', kind: 'complaint', anonymous: false, memberId: null, name: 'Ravi Kumar', phone: '98290 22222',
      lines: [{ id: 'c1-0', fromGym: false, who: null, text: 'The AC in the cardio room has not worked for a week.', at: T0 - 3600_000 }],
    },
  );
  await page.reload();
  await go(page, '/more');
  const row = main.getByRole('link', { name: /^Member messages/ });
  await expect(row).toContainText('Questions, feedback and complaints from members');
  await expect(row).toContainText('3');
  // Fresh eyes (14 Nov 2026): the full-page picture drew the bottom bar over this row (a fixed bar in a stitched
  // picture). On the real screen, scrolled to it, the row sits whole above the bar; the picture is the screen itself.
  // The page also scrolls far enough that its very last row clears the bar.
  const barBox = await page.getByRole('navigation', { name: 'Main' }).boundingBox();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(300);
  const lastBox = await main.getByRole('link').last().boundingBox();
  expect(lastBox.y + lastBox.height, 'scrolled to the end, the last row on More ends above the bottom bar').toBeLessThanOrEqual(barBox.y + 1);
  await row.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(300);
  const rowBox = await row.boundingBox();
  expect(rowBox.y + rowBox.height, 'the Member messages row ends above the bottom bar').toBeLessThanOrEqual(barBox.y + 1);
  await shot(page, 'phone-member-messages-2-more-row', false);
  await row.tap();
  await expect(page.getByRole('heading', { name: 'Member messages', exact: true })).toBeVisible();
  const cards = main.getByTestId('member-message');
  await expect(cards).toHaveCount(3);
  await expect(main.getByRole('region', { name: 'Waiting for a reply' })).toContainText('Waiting for a reply (3)');
  // The longest wait on top.
  await expect(cards.first()).toContainText('Asha Verma');
  const anon = cards.filter({ hasText: 'A member (name hidden)' });
  await expect(anon).toContainText('The member sent this without their name. You can still reply here.');
  await expect(anon).not.toContainText('Bilal');
  await expect(anon).not.toContainText('98290 33333');
  await expect(anon.getByRole('link')).toHaveCount(0);
  await expect(cards.filter({ hasText: 'Asha Verma' }).getByRole('link', { name: 'Asha Verma' })).toBeVisible();
  await expectFitsPhone(page, 'on Member messages with three');
  await shot(page, 'phone-member-messages-3-list');

  // 3. Type buttons.
  const types = main.getByRole('group', { name: 'Show' });
  // Fresh eyes (14 Nov 2026): "All 3" read as three cards or three waiting; the buttons now say it in words.
  await expect(types.getByRole('button')).toHaveText(['All · 3 waiting', 'Questions · 1 waiting', 'Feedback · 1 waiting', 'Complaints · 1 waiting']);
  await types.getByRole('button', { name: /^Complaints/ }).tap();
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText('The AC in the cardio room has not worked for a week.');
  await expect(cards.first()).toContainText('Complaint');
  await shot(page, 'phone-member-messages-4-complaints');
  await types.getByRole('button', { name: /^All/ }).tap();
  await expect(cards).toHaveCount(3);

  // 4. Reply to Asha. An empty reply cannot be sent.
  const asha = cards.filter({ hasText: 'Asha Verma' });
  await expect(asha.getByRole('button', { name: 'Send reply' })).toBeDisabled();
  await asha.getByLabel('Your reply').fill('Yes, 6 am to 12 noon on Diwali.');
  await expect(asha).toContainText('31 of 1000 letters');
  await asha.getByRole('button', { name: 'Send reply' }).tap();
  await expect(asha).toContainText('Reply sent.');
  await expect(asha).toContainText('Ramesh Sharma replied · Today');
  await expect(asha).toContainText('The member has not opened your reply yet.');
  await expect(main.getByRole('region', { name: 'Replied' })).toContainText('Asha Verma');
  await expect(main.getByRole('region', { name: 'Waiting for a reply' })).toContainText('Waiting for a reply (2)');
  expect(server.log.filter((c) => c.fn === 'owner_talk_reply').map((c) => c.args)).toEqual([
    expect.objectContaining({ p_thread: 'q1', p_text: 'Yes, 6 am to 12 noon on Diwali.' }),
  ]);
  await shot(page, 'phone-member-messages-5-replied');
  await expect(types.getByRole('button', { name: /^All/ })).toHaveText('All · 2 waiting');
  await expect(types.getByRole('button', { name: /^Questions/ })).toHaveText('Questions');
  // Fresh eyes (14 Nov 2026): Today's "Needs you" still said 3 after the reply (it read its own count once a minute).
  // Now it follows at once, with no minute passing.
  await go(page, '/');
  await expect(main.getByRole('heading', { name: 'Needs you', exact: true })).toBeVisible();
  await expect(main).toContainText('2 member messages to reply to', { timeout: 5_000 });
  await expect(main).not.toContainText('3 member messages');
  await shot(page, 'phone-member-messages-5b-today-after-reply');
  await go(page, '/member-messages');
  await expect(main.getByRole('region', { name: 'Replied' })).toContainText('Asha Verma');

  // 5. Mark the feedback as done, then open it again.
  await anon.getByRole('button', { name: 'Mark as done' }).tap();
  await expect(main.getByRole('region', { name: 'Done' })).toContainText('A member (name hidden)');
  await expect(main.getByRole('region', { name: 'Done' })).toContainText('Marked as done by Ramesh Sharma');
  await shot(page, 'phone-member-messages-6-done');
  await page.setViewportSize({ width: 1280, height: 900 });
  await shot(page, 'computer-member-messages-6-done');
  await page.setViewportSize({ width: 375, height: 812 });
  await main.getByRole('region', { name: 'Done' }).getByRole('button', { name: 'Mark as not done' }).tap();
  await expect(main.getByRole('region', { name: 'Waiting for a reply' })).toContainText('A member (name hidden)');
  await expect(main.getByRole('region', { name: 'Done' })).toHaveCount(0);

  // 6. The front desk: no complaints.
  await addDeskPerson(page);
  const desk = await secondPhone(browser, server);
  await signIn(desk, DESK.phone);
  await go(desk, '/more');
  await expect(desk.getByRole('main').getByRole('link', { name: /^Member messages/ })).toBeVisible();
  await go(desk, '/member-messages');
  const deskMain = desk.getByRole('main');
  await expect(deskMain.getByTestId('member-message')).toHaveCount(2);
  await expect(deskMain).not.toContainText('cardio room');
  await expect(deskMain).toContainText('Complaints go to the owner only, so they are not shown here.');
  await expect(deskMain.getByRole('group', { name: 'Show' }).getByRole('button', { name: /^Complaints/ })).toHaveCount(0);
  await expectFitsPhone(desk, 'on the desk’s Member messages');
  await shot(desk, 'phone-member-messages-7-desk');
  await desk.context().close();

  // 7. A message that is gone (the member left the gym): plain words, then the list again without it.
  // (Adding the desk person left the owner on Staff & sign-in: back to the page first, then Ravi leaves.)
  await go(page, '/member-messages');
  const ravi = cards.filter({ hasText: 'Ravi Kumar' });
  await expect(ravi).toBeVisible();
  talk.gone.add('c1');
  await ravi.getByLabel('Your reply').fill('Sorry, fixed tomorrow.');
  await ravi.getByRole('button', { name: 'Send reply' }).tap();
  await expect(main.getByText('This message is no longer here, so nothing was sent or changed. The member may have left the gym.')).toBeVisible();
  await expect(cards.filter({ hasText: 'Ravi Kumar' })).toHaveCount(0);
  // The menu badge drops with it (it read 2 here before the fix: only the anonymous feedback waits).
  // R-526: an owner's More may also carry the Set up your gym ring, whose words follow the number.
  await expect(page.getByRole('link', { name: /^More\b/ })).toHaveText(/^More\s*1(?!\d)/);
  await expectFitsPhone(page, 'after a gone message');
  await shot(page, 'phone-member-messages-8-gone');
  // And Today's "Needs you" with it.
  await go(page, '/');
  await expect(main).toContainText('1 member message to reply to', { timeout: 5_000 });
});

// Fresh eyes (14 Nov 2026): two pages were both called "Questions" (members' questions to a trainer, and the Questions
// type inside Member messages), and neither was in the computer's menu picture (that gym had no 0050/0053/0069). With
// all three on the server, the menu has both, each with its own clear name, and each opens its own page.
test('the computer menu: "Questions for trainers" and "Member messages", each opens its page', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const server = await openApp(page);
  const talk = installTalk(server);
  const qs = installQuestions(server);
  talk.on = true;
  qs.on = true;
  talk.threads.push({
    id: 'f9', kind: 'feedback', anonymous: false, memberId: null, name: 'Neha Joshi', phone: '98290 44444',
    lines: [{ id: 'f9-0', fromGym: false, who: null, text: 'The new playlist is great.', at: T0 - 3600_000 }],
  });
  qs.list.push({ id: 'q9', name: 'Asha Verma', question: 'Is the 6 am batch full tomorrow?', askedAt: T0 - 2 * 3600_000 });
  await startOnlineGym(page);
  const nav = page.getByRole('navigation', { name: 'Main' });
  const questions = nav.getByRole('link', { name: /^Questions for trainers/ });
  const messages = nav.getByRole('link', { name: /^Member messages/ });
  await expect(questions).toBeVisible({ timeout: 15_000 });
  await expect(messages).toBeVisible();
  await expect(questions).toContainText('1');
  await expect(messages).toContainText('1');
  // No menu row is called just "Questions" any more.
  await expect(nav.getByRole('link', { name: /^Questions\s*\d*$/ })).toHaveCount(0);
  await questions.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await nav.screenshot({ path: `${DIR}/computer-menu-questions-and-messages.png` });

  await questions.click();
  await expect(page.getByRole('heading', { name: 'Questions for trainers', exact: true })).toBeVisible();
  await expect(page.getByRole('main')).toContainText('Is the 6 am batch full tomorrow?');
  await messages.click();
  await expect(page.getByRole('heading', { name: 'Member messages', exact: true })).toBeVisible();
  await expect(page.getByRole('main')).toContainText('The new playlist is great.');
  await shot(page, 'computer-member-messages-from-menu', false);
});
