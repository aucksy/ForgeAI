// F201 (12 Nov 2026, R-471): UAT of the AI Assistant for gym owners, on a phone (390 x 844) and a computer
// (1280 x 900), in the dark and the light screen colours. Every step taps the real screen; pictures go to
// e2e/.results/uat (CI uploads them as "dashboard-uat-pictures"; the read ones are kept in docs/f201-ai-assistant/shots).
// The gym's server is the pretend one (support.mjs). The AI calls (supabase 0071) are answered here by the rules of
// docs/f201-ai-assistant/04-server-status.md, and the panel worker's /api/assist, /api/assist/rewrite and
// /api/assist/voice are answered by page routes. Nothing reaches a real AI. Today is Saturday 17 Oct 2026, 10 am IST.
//
//  1. A server without 0071 (the live server today): no button, no menu row, no Today card; /assistant goes to Today.
//  2. With 0071: the button on the phone; Today's card; the full screen with "Today for you" and "Try saying".
//  3. A question: the Answer card, free (no credit spent).
//  4. One request that makes two things (R-471): two cards, each with its own button and price, each its own task.
//     Save the expense: 1 credit, the balance goes 84 -> 83, the message card is still waiting with its own button.
//  5. Send the message: "Send to 2 members · 1 credit"; the members without the app get the WhatsApp button.
//  6. AskBack, "Where to do it" (open_page), Cannot, and a workout plan ("cannot write plans yet", no price).
//  7. No credits left: the draft still shows; its button says "Get credits to send" and opens the packs.
//  8. The voice screen: "Listening…", then "What I heard (you can fix it)" and "Send to AI Assistant".
//  9. A computer: the button bottom right, the 420 px side panel beside the page (the page still works), History.
// 10. The front desk never sees any of it. 503 {reason:'off'} hides everything.
import { mkdirSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { DESK, NOW, NoSuchFunction, Refusal, addDeskPerson, addMember, expectFitsPhone, openApp, secondPhone, signIn, startOnlineGym } from './support.mjs';

const DIR = 'e2e/.results/uat';
mkdirSync(DIR, { recursive: true });

// A pretend microphone (Chromium's fake device: a steady tone), allowed without a prompt.
test.use({
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] },
  permissions: ['microphone'],
});

const go = (page, path) =>
  page.evaluate((p) => {
    window.location.hash = p;
  }, path);

/** The screen colours, switched the way the owner does it (the Dark | Light switch), even under an open sheet. */
async function colours(page, mode) {
  const radio = page.getByRole('radiogroup', { name: 'Screen colours' }).first().getByRole('radio', { name: mode === 'light' ? 'Light' : 'Dark' });
  await radio.dispatchEvent('click');
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe(mode);
}

/** One picture in the dark colours and one in the light, then back to dark. */
async function shots(page, name, fullPage = false) {
  const size = (page.viewportSize()?.width ?? 390) > 860 ? 'computer' : 'phone';
  await colours(page, 'dark');
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${DIR}/assistant-${name}-${size}-dark.png`, fullPage });
  await colours(page, 'light');
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${DIR}/assistant-${name}-${size}-light.png`, fullPage });
  await colours(page, 'dark');
}

const AI_FNS = ['owner_ai_wallet', 'owner_ai_task_save', 'owner_ai_spend', 'owner_ai_refund', 'owner_ai_tasks', 'owner_ai_status'];
const T0 = NOW.getTime();

/** The 0071 calls on the pretend server. `ai.on` false: PGRST202, like the live server today. */
function installAi(server) {
  const ai = { on: false, balance: 84, freeLeft: 34, tasks: new Map(), recent: [] };
  const base = server.answer.bind(server);
  server.answer = (fn, args) => {
    if (!AI_FNS.includes(fn)) return base(fn, args);
    server.calls.push(fn);
    server.log.push({ fn, args });
    if (!ai.on) throw new NoSuchFunction(`Could not find the function public.${fn} in the schema cache`);
    const p = server.anyone(args.p_key);
    if (p.role !== 'owner') throw new Refusal('OWNER_ONLY');
    switch (fn) {
      case 'owner_ai_wallet':
        return {
          ok: true, balance: ai.balance, free_left: Math.min(ai.freeLeft, ai.balance), monthly_free: 100, plan: 'pro', billing: 'yearly', trial: false,
          month: '2026-10', low_at: 5, packs: [{ credits: 50, inr: 149 }, { credits: 150, inr: 399, popular: true }, { credits: 500, inr: 999 }],
          recent: ai.recent,
        };
      case 'owner_ai_task_save': {
        const t = ai.tasks.get(args.p_id);
        if (t && t.status === 'done') throw new Refusal('ALREADY_DONE');
        ai.tasks.set(args.p_id, { id: args.p_id, at: T0, request: args.p_request, spoken: args.p_spoken === true, actions: args.p_actions, status: 'drafted', credits: 0 });
        return { ok: true, id: args.p_id, status: 'drafted' };
      }
      case 'owner_ai_spend': {
        const t = ai.tasks.get(args.p_task_id);
        if (!t) throw new Refusal('NOT_FOUND');
        if (t.credits > 0) throw new Refusal('ALREADY_SPENT');
        if (ai.balance < args.p_credits) throw new Refusal('NO_CREDITS');
        ai.balance -= args.p_credits;
        ai.freeLeft = Math.max(0, ai.freeLeft - args.p_credits);
        t.credits = args.p_credits;
        t.status = 'done';
        ai.recent.unshift({ at: T0, delta: -args.p_credits, reason: 'spend', note: String(t.request).slice(0, 120), task_id: t.id });
        return { ok: true, task_id: t.id, credits: args.p_credits, balance: ai.balance, free_left: ai.freeLeft };
      }
      case 'owner_ai_refund':
        throw new Refusal('NOT_FOUND');
      case 'owner_ai_tasks':
        return { ok: true, tasks: [...ai.tasks.values()].reverse() };
      default:
        return { ok: true, paid: true, trial: false };
    }
  };
  return ai;
}

const everyone = { group: 'everyone', days: 0, plan: '', batch: '', trainer: '', names: [] };
const closedMessage = {
  tool: 'draft_message',
  input: {
    audience: everyone, kind: 'closed', lang: 'en', title_en: 'Gym closed tomorrow', body_en: 'The gym is closed tomorrow, Sunday 18 Oct. See you on Monday at 6 am.',
    title_hi: '', body_hi: '', send_at: '', offer: '',
  },
};
const billExpense = { tool: 'add_expense', input: { amount: 3200, category: 'electricity', date: '', method: 'cash', note: 'Electricity bill' } };

/** What the pretend AI answers for each sentence (the real one is deploy/panel/assist.js). */
function aiAnswer(text) {
  if (/who are my members/i.test(text)) return { actions: [{ tool: 'list_members', input: { group: 'everyone', days: 0, plan: '', batch: '', trainer: '', gender: '' } }], note: '' };
  if (/bijli/i.test(text)) return { actions: [closedMessage, billExpense], note: 'Two things: a message and an expense.' };
  if (/^message everyone/i.test(text)) return { actions: [closedMessage], note: '' };
  if (/rahul/i.test(text)) return { actions: [{ tool: 'ask_back', input: { question: 'Which message should Rahul get?', options: ['Fee reminder', 'Birthday wishes'] } }], note: '' };
  if (/price/i.test(text)) {
    return { actions: [{ tool: 'open_page', input: { page: 'plans', steps: ['Tap the plan', 'Change the price', 'Tap Save'], why: 'Plan prices are changed on the Plans page.' } }], note: '' };
  }
  if (/call/i.test(text)) return { actions: [{ tool: 'cannot_do', input: { reason: 'I cannot make phone calls. Call Asha from her member page.' } }], note: '' };
  if (/workout/i.test(text)) return { actions: [{ tool: 'draft_workout_plan', input: {} }], note: '' };
  return { actions: [{ tool: 'cannot_do', input: { reason: 'I did not understand that.' } }], note: '' };
}

/** The panel worker's assistant routes, answered on this page. `worker.off`: 503 {reason:'off'}. */
async function installWorker(page) {
  const worker = { asked: [], rewrites: [], voice: 0, off: false };
  await page.route('**/api/assist', async (route) => {
    const body = route.request().postDataJSON();
    worker.asked.push(body);
    if (worker.off) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'The AI Assistant is switched off.', reason: 'off' }) });
    const a = aiAnswer(String(body.text ?? ''));
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...a, left: 40, masked: 0 }) });
  });
  await page.route('**/api/assist/rewrite', async (route) => {
    const body = route.request().postDataJSON();
    worker.rewrites.push(body);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ title_en: 'Gym closed tomorrow', body_en: 'Closed tomorrow, Sunday. Open Monday 6 am.', title_hi: '', body_hi: '', left: 39 }),
    });
  });
  await page.route('**/api/assist/voice', async (route) => {
    worker.voice += 1;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: 'Who are my members?', provider: 'sarvam' }) });
  });
  return worker;
}

async function ask(page, words) {
  const box = page.getByLabel('Ask or give a task', { exact: true }).last();
  await box.fill(words);
  await page.getByRole('button', { name: 'Ask the AI Assistant' }).last().click();
}

test('AI Assistant: hidden without 0071; the button, cards, credits, voice, the computer panel; never for the desk', async ({ page, browser }) => {
  const server = await openApp(page);
  const ai = installAi(server);
  const worker = await installWorker(page);
  await startOnlineGym(page);
  await addMember(page, { name: 'Asha Verma', phone: '98290 11111' });
  await addMember(page, { name: 'Ravi Kumar', phone: '98290 22222' });
  // One of the two has the MettleUp app.
  server.appMembers = [{ member_id: 'app-1', name: 'Asha Verma', phone: '+919829011111', joined_at: '2026-10-01T10:00:00Z', last_seen: '2026-10-16T10:00:00Z', orders: 0, spent_p: 0 }];
  const main = page.getByRole('main');
  const fab = page.getByRole('button', { name: 'Open the AI Assistant' });

  // 1. No 0071: nothing anywhere, and an old link goes back to Today.
  await go(page, '/');
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await expect(fab).toHaveCount(0);
  await expect(main.getByRole('region', { name: 'AI Assistant' })).toHaveCount(0);
  await go(page, '/more');
  await expect(page.getByRole('heading', { name: 'More', exact: true })).toBeVisible();
  await expect(main.getByRole('link', { name: /^AI Assistant/ })).toHaveCount(0);
  await go(page, '/assistant');
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  expect(worker.asked).toHaveLength(0);

  // 2. With 0071: the button above the bottom bar, Today's card, the More row.
  ai.on = true;
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await expect(fab).toBeVisible();
  await expect(fab).toHaveText('AI Assistant');
  const box = await fab.boundingBox();
  expect(Math.round(390 - (box.x + box.width))).toBe(16);
  const card = main.getByRole('region', { name: 'AI Assistant' });
  await expect(card).toContainText('84 credits');
  await expect(card).toContainText('Ask or give a task, in Hindi or English');
  await expectFitsPhone(page, 'on Today with the assistant');
  await shots(page, '01-button-today');
  await go(page, '/more');
  await expect(main.getByRole('link', { name: /^AI Assistant/ })).toContainText('Ask a question or give a task, in Hindi or English');
  await go(page, '/');
  await fab.tap();
  await expect(page.getByRole('heading', { level: 1, name: 'AI Assistant' })).toBeVisible();
  await expect(fab).toHaveCount(0);
  await expect(main).toContainText('Try saying');
  await expect(main).toContainText('Kisne paise nahi diye?');
  await expect(main).toContainText('Asking is free. A task uses 1 credit only when you send or save it.');
  await expect(main).not.toContainText(/Diwali|Holi|Eid|Christmas/);
  await expectFitsPhone(page, 'on the assistant');
  await shots(page, '02-home');
  await main.getByRole('button', { name: /^See all \d+ things it can do$/ }).tap();
  await expect(page.getByRole('dialog', { name: 'What the AI Assistant can do' })).toBeVisible();
  await page.getByRole('dialog', { name: 'What the AI Assistant can do' }).getByRole('button', { name: 'Close' }).tap();

  // 3. A question: free.
  await ask(page, 'Who are my members?');
  const answer = main.getByRole('article').last();
  await expect(answer).toContainText('Asha Verma');
  await expect(answer).toContainText('Free. Questions never use credits.');
  expect(server.log.filter((c) => c.fn === 'owner_ai_spend')).toHaveLength(0);
  await shots(page, '03-answer-card');

  // 4. One request, two things: two cards, two buttons, two prices, two tasks.
  await ask(page, 'Kal gym band hai sabko batao, aur bijli ka bill 3200 cash diya');
  const message = main.getByRole('article', { name: 'Message to your members' }).last();
  const expense = main.getByRole('article', { name: 'Save an expense' }).last();
  await expect(message).toBeVisible();
  await expect(expense).toBeVisible();
  await expect(message.getByRole('button', { name: 'Send to 1 member · 1 credit' })).toBeVisible();
  await expect(expense.getByRole('button', { name: 'Save expense · 1 credit' })).toBeVisible();
  await expect(message).toContainText('Everyone · 2 members');
  await expect(message).toContainText('1 has the app');
  await expect(expense).toContainText('₹3,200');
  const saved = server.log.filter((c) => c.fn === 'owner_ai_task_save');
  expect(new Set(saved.map((c) => c.args.p_id)).size).toBe(2);
  expect(saved.map((c) => c.args.p_actions.length)).toEqual([1, 1]);
  await message.scrollIntoViewIfNeeded();
  await shots(page, '04-message-card');
  await expense.scrollIntoViewIfNeeded();
  await shots(page, '05-change-card');
  await expense.getByRole('button', { name: 'Save expense · 1 credit' }).tap();
  await expect(expense).toContainText('Expense saved.');
  await expect(main.getByRole('button', { name: /AI credits\. Open AI credits\./ }).first()).toContainText('83 credits');
  const spends = server.log.filter((c) => c.fn === 'owner_ai_spend');
  expect(spends).toHaveLength(1);
  expect(spends[0].args.p_credits).toBe(1);
  expect(spends[0].args.p_task_id).toBe(saved.find((c) => c.args.p_actions[0].tool === 'add_expense').args.p_id);
  await expect(message.getByRole('button', { name: 'Send to 1 member · 1 credit' })).toBeVisible();

  // 5. "Shorter", then send the message.
  await message.getByRole('button', { name: 'Shorter' }).tap();
  await expect(message).toContainText('Closed tomorrow, Sunday. Open Monday 6 am.');
  expect(worker.rewrites).toHaveLength(1);
  await message.getByRole('button', { name: 'Send to 1 member · 1 credit' }).tap();
  await expect(message).toContainText('Sent to 1 in the app. 1 without the app are ready on WhatsApp.');
  await expect(message.getByRole('button', { name: '1 without the app: send on WhatsApp' })).toBeVisible();
  expect(server.messages[0]).toMatchObject({ kind: 'closed', title: 'Gym closed tomorrow' });
  await expect(main.getByRole('button', { name: /AI credits\. Open AI credits\./ }).first()).toContainText('82 credits');

  // 6. AskBack, where to do it, cannot, a plan.
  await ask(page, 'Rahul ko message bhejo');
  await expect(main.getByRole('article', { name: 'A question back' }).last()).toContainText('Which message should Rahul get?');
  await shots(page, '06-askback-card');
  await ask(page, 'Gold plan ka price badlo');
  const where = main.getByRole('article', { name: 'Where to do it' }).last();
  await expect(where).toContainText('Where: /plans');
  await expect(where.getByRole('button', { name: 'Open Plans' })).toBeVisible();
  await shots(page, '07-open-page-card');
  await ask(page, 'Asha ko call karo');
  const cannot = main.getByRole('article', { name: 'Something the assistant cannot do' }).last();
  await expect(cannot).toContainText('I cannot make phone calls.');
  await expect(cannot.getByRole('button', { name: 'Open Help and feedback' })).toBeVisible();
  await shots(page, '08-cannot-card');
  await ask(page, 'Asha ke liye workout plan banao');
  const plan = main.getByRole('article', { name: 'Workout plans' }).last();
  await expect(plan).toContainText('The AI Assistant cannot write workout plans yet.');
  await expect(plan).not.toContainText(/credit/);
  await shots(page, '09-plan-not-ready-card');

  // 7. No credits: the draft still shows; the button opens the packs.
  ai.balance = 0;
  ai.freeLeft = 0;
  await main.getByRole('button', { name: /AI credits\. Open AI credits\./ }).first().tap();
  const credits = page.getByRole('dialog', { name: 'AI credits' });
  await expect(credits).toContainText('You have');
  await expect(credits).toContainText('0');
  await credits.getByRole('button', { name: 'Close' }).tap();
  await ask(page, 'Message everyone that the gym is closed tomorrow');
  const broke = main.getByRole('article', { name: 'Message to your members' }).last();
  await expect(broke).toContainText('Gym closed tomorrow');
  await broke.getByRole('button', { name: 'Get credits to send' }).tap();
  await expect(credits).toBeVisible();
  await expect(credits).toContainText('Get more · they never expire');
  await expect(credits).toContainText('₹399');
  await expect(credits).toContainText('Popular');
  await expect(credits).not.toContainText('Workout or diet plan saved');
  await credits.getByRole('button', { name: /^150/ }).tap();
  await expect(credits).toContainText('Buying credits here is not ready yet.');
  await shots(page, '10-credits-sheet');
  await credits.getByRole('button', { name: 'Close' }).tap();
  expect(server.log.filter((c) => c.fn === 'owner_ai_spend')).toHaveLength(2);
  ai.balance = 84;

  // 8. The voice screen.
  await page.getByRole('button', { name: 'Speak a request' }).tap();
  const voice = page.getByRole('dialog', { name: 'AI Assistant' });
  await expect(voice).toContainText('Listening… speak in Hindi, English or both');
  await expect(voice).toContainText('Up to 30 seconds');
  await page.waitForTimeout(1600);
  await shots(page, '11-voice-listening');
  await voice.getByRole('button', { name: 'Done' }).tap();
  await expect(voice).toContainText('What I heard (you can fix it)');
  await expect(voice.getByRole('textbox')).toHaveValue('Who are my members?');
  await shots(page, '12-voice-heard');
  await voice.getByRole('button', { name: 'Send to AI Assistant' }).tap();
  await expect(voice).toHaveCount(0);
  await expect(main.getByRole('article').last()).toContainText('Ravi Kumar');
  expect(worker.voice).toBe(1);
  expect(worker.asked.at(-1)).toMatchObject({ text: 'Who are my members?', spoken: true });

  // 9. A computer: the button bottom right, the side panel beside the page, History.
  await page.setViewportSize({ width: 1280, height: 900 });
  await go(page, '/members');
  await expect(page.getByRole('heading', { name: 'Members', exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'AI Assistant' })).toBeVisible();
  await expect(fab).toBeVisible();
  const desk = await fab.boundingBox();
  expect(Math.round(1280 - (desk.x + desk.width))).toBe(28);
  await shots(page, '13-button');
  await fab.click();
  const panel = page.getByRole('complementary', { name: 'AI Assistant' });
  await expect(panel).toBeVisible();
  const p = await panel.boundingBox();
  expect(Math.round(p.width)).toBe(420);
  // The page behind still works: its search box takes typing while the panel is open.
  await page.getByRole('main').getByPlaceholder('Search name or mobile number').fill('Asha');
  await expect(page.getByRole('main')).toContainText('Asha Verma');
  await shots(page, '14-side-panel');
  await panel.getByRole('tab', { name: 'History' }).click();
  await expect(panel).toContainText('Bijli', { ignoreCase: true });
  await expect(panel).toContainText('Done · 1 credit');
  await shots(page, '15-history');
  await panel.getByRole('tab', { name: 'Ask' }).click();
  await panel.getByRole('button', { name: /AI credits\. Open AI credits\./ }).click();
  await expect(page.getByRole('dialog', { name: 'AI credits' })).toBeVisible();
  await shots(page, '16-credits-sheet');
  await page.getByRole('dialog', { name: 'AI credits' }).getByRole('button', { name: 'Close' }).click();
  await panel.getByRole('button', { name: 'Close the AI Assistant' }).click();
  await expect(panel).toHaveCount(0);
  await go(page, '/assistant');
  await expect(page.getByRole('heading', { level: 1, name: 'AI Assistant' })).toBeVisible();
  await shots(page, '17-page', true);
  await page.setViewportSize({ width: 390, height: 844 });

  // 10. The front desk sees none of it; 503 'off' hides it for the owner too.
  await go(page, '/');
  await addDeskPerson(page);
  const deskPhone = await secondPhone(browser, server);
  await signIn(deskPhone, DESK.phone);
  await expect(deskPhone.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await expect(deskPhone.getByRole('button', { name: 'Open the AI Assistant' })).toHaveCount(0);
  await deskPhone.evaluate(() => {
    window.location.hash = '/assistant';
  });
  await expect(deskPhone.getByRole('heading', { level: 1, name: 'AI Assistant' })).toHaveCount(0);
  // Every AI call so far came from the owner's device: the desk's panel never asks.
  expect(server.log.filter((c) => c.fn.startsWith('owner_ai_')).every((c) => server.anyone(c.args.p_key).role === 'owner')).toBe(true);

  worker.off = true;
  await go(page, '/assistant');
  await ask(page, 'Who are my members?');
  await expect(page.getByRole('heading', { level: 1, name: 'AI Assistant' })).toHaveCount(0);
  await expect(fab).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
});
