// F209 (owner 14 Nov 2026, R-519): UAT of AI questions paid from the gym's AI credits (20 questions = 1 credit,
// supabase/migrations/0078_ai_questions.sql), on a phone (390 x 844) and a computer (1280 x 900), dark and light.
// Every step taps the real screen; pictures go to e2e/.results/uat (CI uploads them as "dashboard-uat-pictures").
// The gym's server is the pretend one (support.mjs) with the 0071 wallet answered here, and owner_ai_questions (0078)
// switched on and off like the live server. The panel worker's /api/assist and /api/help are answered by page routes
// the way deploy/panel answers them (assistCredits.test.mjs, helpCredits.test.mjs). Saturday 17 Oct 2026, 10 am IST.
//
//  1. Before 0078 (the live server today): the AI Assistant and the credits sheet read exactly as before.
//  2. With 0078: "Every 20 AI questions use 1 credit"; the credits sheet: what questions cost, who asked this month
//     (you, staff, members), the low line at 8 credits, and a block of 20 questions in the history.
//  3. No credit left for a question: the plain line, and the credits sheet opens by itself.
//  4. Help and feedback (owner): the question goes with the sign-in key; the help pages' answer and "Open AI Assistant".
//  5. Help and feedback (the front desk, on a second phone): the help pages' answer, "Ask your gym owner".
//  6. The owner's "credits low" alert on Today.
import { mkdirSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { DESK, NOW, NoSuchFunction, Refusal, addDeskPerson, expectFitsPhone, open, openApp, secondPhone, signIn, startOnlineGym } from './support.mjs';

const DIR = 'e2e/.results/uat';
mkdirSync(DIR, { recursive: true });

const T0 = NOW.getTime();
const go = (page, path) =>
  page.evaluate((p) => {
    window.location.hash = p;
  }, path);

async function colours(page, mode) {
  const radio = page.getByRole('radiogroup', { name: 'Screen colours' }).first().getByRole('radio', { name: mode === 'light' ? 'Light' : 'Dark' });
  await radio.dispatchEvent('click');
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe(mode);
}

/** One picture in the dark colours and one in the light, then back to dark. */
async function shots(page, name, fullPage = false) {
  const size = (page.viewportSize()?.width ?? 390) > 860 ? 'computer' : 'phone';
  await colours(page, 'dark');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/aiq-${name}-${size}-dark.png`, fullPage });
  await colours(page, 'light');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/aiq-${name}-${size}-light.png`, fullPage });
  await colours(page, 'dark');
}

const AI_FNS = ['owner_ai_wallet', 'owner_ai_task_save', 'owner_ai_spend', 'owner_ai_refund', 'owner_ai_tasks', 'owner_ai_status', 'owner_ai_questions', 'owner_alerts'];

/** 0071 (on) and 0078 (`ai.questions` false: PGRST202, like the live server today) on the pretend server. */
function installAi(server) {
  const ai = { questions: false, balance: 8, alerts: [] };
  const base = server.answer.bind(server);
  server.answer = (fn, args) => {
    if (!AI_FNS.includes(fn)) return base(fn, args);
    server.calls.push(fn);
    server.log.push({ fn, args });
    if (fn === 'owner_alerts') {
      server.anyone(args.p_key);
      return { ok: true, alerts: ai.alerts };
    }
    if (fn === 'owner_ai_questions' && !ai.questions) throw new NoSuchFunction(`Could not find the function public.${fn} in the schema cache`);
    const p = server.anyone(args.p_key);
    if (p.role !== 'owner') throw new Refusal('OWNER_ONLY');
    switch (fn) {
      case 'owner_ai_wallet':
        return {
          ok: true, balance: ai.balance, free_left: 0, monthly_free: 0, plan: 'pro', billing: 'monthly', trial: false, month: '2026-10', low_at: 5,
          packs: [],
          recent: ai.questions
            ? [
                { at: T0 - 60_000, delta: -1, reason: 'questions', note: '20 AI questions', task_id: null },
                { at: T0 - 3_600_000, delta: -1, reason: 'questions', note: '20 AI questions', task_id: null },
                { at: T0 - 86_400_000, delta: 10, reason: 'purchase', note: '', task_id: null },
              ]
            : [{ at: T0 - 86_400_000, delta: 10, reason: 'purchase', note: '', task_id: null }],
        };
      case 'owner_ai_questions':
        return { ok: true, month: '2026-10', per_credit: 20, member_day: 10, visitor_day: 3, low_at: 10, owner: 3, staff: 1, members: 36, visitors: 0, credits: 2, slots: 20 };
      case 'owner_ai_tasks':
        return { ok: true, tasks: [] };
      case 'owner_ai_status':
        return { ok: true, paid: true, trial: false };
      default:
        throw new Refusal('NOT_FOUND');
    }
  };
  return ai;
}

/** /api/assist answers like deploy/panel/assist.js when the gym has no credit for the question (402). */
async function installWorker(page, state) {
  await page.route('**/api/assist', async (route) => {
    if (state.noCredit) {
      return route.fulfill({ status: 402, contentType: 'application/json', body: JSON.stringify({ reason: 'no_credits', error: 'Your gym has no AI credits left. Tap your credits at the top to get more.' }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ actions: [{ tool: 'who_owes', input: {} }], note: '', left: 40, masked: 0 }) });
  });
}

// The help pages' answers deploy/panel/helpPages.js writes for "How do I add a new member?" (owner / staff).
const PAGE = 'Add a new member, or find one\n1. Tap Members, then tap "Add member".\n2. Type the name and mobile number, pick the plan, and tap Save.';
const OWNER_ANSWER = `Your gym has no AI credits left, so this answer is from the help pages. To get more, open AI Assistant and tap your credits at the top.\n\nThis help page may answer your question:\n\n${PAGE}\n\nWe read every message and reply as soon as we can.`;
const STAFF_ANSWER = `Your gym has no AI credits left, so this answer is from the help pages. Ask your gym owner to get more AI credits.\n\nThis help page may answer your question:\n\n${PAGE}\n\nWe read every message and reply as soon as we can.`;

/** /api/help: a question with a sign-in key is counted; this gym has no credit, so the help pages answer. */
async function installHelp(page, sent, answer) {
  await page.route('**/api/help', async (route) => {
    const key = route.request().headers()['x-forge-key'] ?? '';
    sent.push({ key, body: route.request().postDataJSON() });
    if (!key) return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true, id: 1, answer: 'Tap Members.', ai: true }) });
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true, id: 2, answer, covered: false, ai: false, credits: 'no_credits' }) });
  });
}

test('AI questions on the credits: as before until 0078, then the price, who asked, no-credit lines, help pages, the alert', async ({ page, browser }) => {
  test.setTimeout(180_000);
  const server = await openApp(page);
  const ai = installAi(server);
  const state = { noCredit: false };
  await installWorker(page, state);
  const sent = [];
  await installHelp(page, sent, OWNER_ANSWER);
  await startOnlineGym(page);
  const main = page.getByRole('main');
  const credits = page.getByRole('dialog', { name: 'AI credits' });

  // 1. Before 0078: the old words, no "who asked".
  await go(page, '/assistant');
  await expect(page.getByRole('heading', { level: 1, name: 'AI Assistant' })).toBeVisible();
  await expect(main).toContainText('Asking is free. A task uses credits only when you send or save it.');
  await main.getByRole('button', { name: /AI credits\. Open AI credits\./ }).first().tap();
  await expect(credits).toContainText('Questions, voice, drafts');
  await expect(credits).not.toContainText('AI questions this month');
  await expect(credits).not.toContainText('help pages');
  await credits.getByRole('button', { name: 'Close' }).tap();

  // 2. With 0078.
  ai.questions = true;
  await page.reload();
  await go(page, '/assistant');
  await expect(main).toContainText('Every 20 AI questions use 1 credit. A task uses credits when you send or save it.');
  await expect(main).not.toContainText('Asking is free');
  await expectFitsPhone(page, 'on the assistant with questions counted');
  await shots(page, '01-assistant-home');
  await main.getByRole('button', { name: /AI credits\. Open AI credits\./ }).first().tap();
  await expect(credits).toContainText('8');
  // 8 is under the alert's 10: the warning says what members get when credits run out.
  await expect(credits).toContainText('Your credits are running low. When they run out, members get help pages instead of AI answers.');
  await expect(credits).toContainText('AI questions and drafts');
  await expect(credits).toContainText('20 for 1 credit');
  await expect(credits).toContainText('Speaking instead of typing');
  await expect(credits).not.toContainText('Questions, voice, drafts');
  const asked = credits.getByRole('region', { name: 'AI questions this month' });
  await expect(asked).toContainText('You');
  await expect(asked).toContainText('Your staff');
  await expect(asked).toContainText('Members36');
  await expect(asked).not.toContainText('Gym page visitors');
  await expect(asked).toContainText('These questions used 2 credits. Each member can ask the AI 10 questions a day.');
  await expect(credits.getByRole('region', { name: 'Recently used' })).toContainText('20 AI questions');
  await shots(page, '02-credits-sheet');
  await asked.scrollIntoViewIfNeeded();
  await shots(page, '03-credits-who-asked');
  await credits.getByRole('button', { name: 'Close' }).tap();

  // 3. No credit for a question: the plain line, and the credits sheet opens by itself.
  state.noCredit = true;
  await page.getByLabel('Ask or give a task', { exact: true }).last().fill('Kisne paise nahi diye?');
  await page.getByRole('button', { name: 'Ask the AI Assistant' }).last().tap();
  await expect(credits).toBeVisible();
  await shots(page, '04-ask-no-credit-sheet');
  await credits.getByRole('button', { name: 'Close' }).tap();
  await expect(main).toContainText('Your gym has no AI credits left. Tap your credits at the top to get more.');
  await shots(page, '05-ask-no-credit-line');

  // 4. Help and feedback (owner): sent with the sign-in key; the help pages' answer; the way to credits.
  await open(page, 'Help and feedback');
  await page.getByLabel('Your message').fill('How do I add a new member?');
  await page.getByRole('button', { name: 'Send', exact: true }).tap();
  const reply = main.getByRole('status').filter({ hasText: 'This help page may answer your question' });
  await expect(reply).toContainText('To get more, open AI Assistant and tap your credits at the top.');
  await expect(reply).toContainText('Add a new member, or find one');
  await expect(reply).not.toContainText('Answer written by AI');
  await expect(reply.getByRole('button', { name: 'Open AI Assistant' })).toBeVisible();
  expect(sent.at(-1).key.length).toBeGreaterThan(15);
  expect(sent.at(-1).body).toMatchObject({ source: 'admin', text: 'How do I add a new member?' });
  await expectFitsPhone(page, 'on Help with the help pages answer');
  await shots(page, '06-help-owner', true);
  await reply.getByRole('button', { name: 'Open AI Assistant' }).tap();
  await expect(page.getByRole('heading', { level: 1, name: 'AI Assistant' })).toBeVisible();

  // 6. The "credits low" alert (0075's list; written by 0078 when a spend takes the balance to 10 or below).
  const pageNow = await page.evaluate(() => Date.now());
  ai.alerts = [
    { id: 'c1', kind: 'ai_credits_low', line: 'Your gym has 8 AI credits left. To get more, open AI Assistant and tap your credits at the top, so members keep getting AI answers.', route: '/assistant', urgent: false, at: pageNow - 2 * 60_000 },
  ];
  await go(page, '/');
  await page.reload();
  const latest = main.getByTestId('latest-alerts');
  await expect(latest).toContainText('Your gym has 8 AI credits left.', { timeout: 15_000 });
  await latest.scrollIntoViewIfNeeded();
  await shots(page, '07-today-credits-low');
  await latest.getByRole('button').filter({ hasText: 'AI credits left' }).tap();
  await expect(page.getByRole('heading', { level: 1, name: 'AI Assistant' })).toBeVisible();

  // 5. The front desk on a second phone: no AI Assistant; Help answers from the help pages and says who gets credits.
  await addDeskPerson(page);
  const desk = await secondPhone(browser, server);
  const deskSent = [];
  await installHelp(desk, deskSent, STAFF_ANSWER);
  await signIn(desk, DESK.phone);
  await open(desk, 'Help and feedback');
  await desk.getByLabel('Your message').fill('How do I add a new member?');
  await desk.getByRole('button', { name: 'Send', exact: true }).tap();
  const deskReply = desk.getByRole('main').getByRole('status').filter({ hasText: 'This help page may answer your question' });
  await expect(deskReply).toContainText('Ask your gym owner to get more AI credits.');
  await expect(deskReply.getByRole('button', { name: 'Open AI Assistant' })).toHaveCount(0);
  expect(deskSent.at(-1).key.length).toBeGreaterThan(15);
  await shots(desk, '08-help-desk', true);
  await desk.context().close();
});

test('AI questions on the credits: the computer', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  const server = await openApp(page);
  const ai = installAi(server);
  ai.questions = true;
  await installWorker(page, { noCredit: false });
  await installHelp(page, [], OWNER_ANSWER);
  await startOnlineGym(page);
  await go(page, '/assistant');
  const main = page.getByRole('main');
  await expect(main).toContainText('Every 20 AI questions use 1 credit.');
  await main.getByRole('button', { name: /AI credits\. Open AI credits\./ }).first().click();
  const credits = page.getByRole('dialog', { name: 'AI credits' });
  await expect(credits.getByRole('region', { name: 'AI questions this month' })).toContainText('These questions used 2 credits.');
  await shots(page, '02-credits-sheet');
  await credits.getByRole('button', { name: 'Close' }).click();
  await go(page, '/feedback');
  await page.getByLabel('Your message').fill('How do I add a new member?');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(main.getByRole('status').filter({ hasText: 'This help page may answer your question' })).toBeVisible();
  await shots(page, '06-help-owner', true);
});
