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

import { DESK, NOW, NoSuchFunction, Refusal, addDeskPerson, addMember, expectFitsPhone, openApp, secondPhone, signIn, startOnlineGym } from './support.mjs';

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

const TALK_FNS = ['owner_talk_count', 'owner_talk_list', 'owner_talk_reply', 'owner_talk_done'];
const T0 = NOW.getTime();

/** The 0069 calls on the pretend server. `talk.on` false: PGRST202, like the live server today. */
function installTalk(server) {
  const talk = { on: false, threads: [], gone: new Set() };
  const base = server.answer.bind(server);
  const view = (t) => ({
    id: t.id,
    kind: t.kind,
    anonymous: t.anonymous,
    appId: t.anonymous ? null : `app-${t.id}`,
    memberId: t.anonymous ? null : t.memberId,
    name: t.anonymous ? null : t.name,
    phone: t.anonymous ? null : t.phone,
    createdAt: t.lines[0].at,
    lastAt: t.lines[t.lines.length - 1].at,
    lastFrom: t.lines[t.lines.length - 1].fromGym ? 'gym' : 'member',
    waiting: !t.doneAt && !t.lines[t.lines.length - 1].fromGym,
    done: Boolean(t.doneAt),
    doneAt: t.doneAt ?? null,
    doneBy: t.doneBy ?? null,
    readByMember: false,
    messages: t.lines,
  });
  const visible = (p, t) => p.role === 'owner' || t.kind !== 'complaint';
  const find = (p, id) => {
    const t = talk.threads.find((x) => x.id === id);
    if (!t || !visible(p, t) || talk.gone.has(id)) throw new Refusal('NOT_FOUND');
    return t;
  };
  server.answer = (fn, args) => {
    if (!TALK_FNS.includes(fn)) return base(fn, args);
    server.calls.push(fn);
    server.log.push({ fn, args });
    if (!talk.on) throw new NoSuchFunction(`Could not find the function public.${fn} in the schema cache`);
    const p = server.anyone(args.p_key);
    const mine = talk.threads.filter((t) => visible(p, t) && !talk.gone.has(t.id));
    const waiting = mine.filter((t) => view(t).waiting).length;
    if (fn === 'owner_talk_count') return { ok: true, waiting };
    if (fn === 'owner_talk_list') return { ok: true, role: p.role === 'owner' ? 'owner' : 'staff', waiting, threads: mine.map(view) };
    const t = find(p, args.p_thread);
    if (fn === 'owner_talk_reply') {
      const text = String(args.p_text ?? '').trim();
      if (!text) throw new Refusal('INVALID');
      t.lines.push({ id: `${t.id}-${t.lines.length}`, fromGym: true, who: p.name, text, at: T0 + t.lines.length * 1000 });
      return { ok: true, thread: view(t) };
    }
    if (args.p_done) {
      t.doneAt = T0 + 5000;
      t.doneBy = p.name;
    } else {
      t.doneAt = null;
      t.doneBy = null;
    }
    return { ok: true, thread: view(t) };
  };
  return talk;
}

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
  await shot(page, 'phone-member-messages-2-more-row');
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
  await expect(page.getByRole('link', { name: /^More\s*\d*$/ })).toHaveText(/^More\s*1$/);
  await expectFitsPhone(page, 'after a gone message');
  await shot(page, 'phone-member-messages-8-gone');
});
