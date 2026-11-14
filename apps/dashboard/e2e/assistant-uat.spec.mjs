// F201 (12 Nov 2026, R-471; plan writer and R-473 13 Nov): UAT of the AI Assistant for gym owners, on a phone
// (390 x 844) and a computer (1280 x 900), in the dark and the light screen colours. Every step taps the real screen; pictures go to
// e2e/.results/uat (CI uploads them as "dashboard-uat-pictures"; the read ones are kept in docs/f201-ai-assistant/shots).
// The gym's server is the pretend one (support.mjs). The AI calls (supabase 0071) are answered here by the rules of
// docs/f201-ai-assistant/04-server-status.md, and the panel worker's /api/assist, /api/assist/rewrite,
// /api/assist/plan and /api/assist/voice are answered by page routes. Nothing reaches a real AI. Today is Saturday 17 Oct 2026, 10 am IST.
//
//  1. A server without 0071 (the live server today): no button, no menu row, no Today card; /assistant goes to Today.
//  2. With 0071: the button on the phone; Today's card; the full screen with "Today for you" and "Try saying".
//  3. A question: the Answer card, free (no credit spent).
//  4. One request that makes two things (R-471): two cards, each with its own button and price, each its own task.
//     Save the expense: 1 credit, the balance goes 84 -> 83, the message card is still waiting with its own button.
//  5. Send the message: "Send now to 2 members · 1 credit"; the members without the app get the WhatsApp button.
//  6. AskBack, "Where to do it" (open_page), Cannot.
//  6b. The AI plan writer (R-471): goal, level and days from the request, "Write the plan" (free, the gym's exercise
//     list, no member data), the builder opens with the plan for that member, Save = 3 credits. A diet plan: "not
//     yet", no price.
//  7. No credits left: the draft still shows; its button says "Ask MettleUp for credits" (no pack prices while buying
//     is not built) and opens the credits sheet. The credits
//     sheet shows the plan's monthly free credits from the wallet (R-473), never a typed number.
//  8. The voice screen: "Listening…", then "What I heard (you can fix it)" and "Send to AI Assistant".
//  9. A computer: the button bottom right, the 420 px side panel beside the page (the page still works), History.
// 10. The front desk never sees any of it. 503 {reason:'off'} hides everything.
// A second test photographs every card, the plan writer, voice, Today and "no credits" at computer width.
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

/** One picture in the dark colours and one in the light, then back to dark. `focus`: the card to show, scrolled to the top. */
async function shots(page, name, fullPage = false, focus = null) {
  const size = (page.viewportSize()?.width ?? 390) > 860 ? 'computer' : 'phone';
  if (focus) {
    await focus.evaluate((el) => {
      el.scrollIntoView({ block: 'start' });
      window.scrollBy(0, -96);
    });
    await page.waitForTimeout(400);
  }
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
    title_hi: '', body_hi: '', send_at: '', offer: '', day: '2026-10-18',
  },
};
// R-514 (owner, 14 Nov 2026): he said in Hindi "the gym will be closed, message all members". The AI wrote a Hindi
// closure with no day. `day`: the closed day the AI heard ('' = he did not say); `send_at`: only when he said when to send.
const hindiClosure = (day, sendAt = '') => ({
  tool: 'draft_message',
  input: {
    audience: everyone, kind: 'closed', lang: 'hi', title_en: 'Gym closed', body_en: 'Please note that the gym will be closed.',
    title_hi: 'जिम बंद', body_hi: 'कृपया ध्यान दें कि जिम बंद रहेगा।', send_at: sendAt, offer: '', day,
  },
});
// R-501: the greeting the owner asked for, written by the AI in English only (no Hindi words), and its Hindi.
const chhathGreeting = {
  tool: 'draft_message',
  input: {
    audience: everyone, kind: 'announcement', lang: 'en', title_en: 'Happy Chhath Puja', body_en: 'Happy Chhath Puja to you and your family. The gym is open as usual.',
    title_hi: '', body_hi: '', send_at: '', offer: '',
  },
};
const CHHATH_HI = { title_hi: 'छठ पूजा की शुभकामनाएं', body_hi: 'आपको और आपके परिवार को छठ पूजा की शुभकामनाएं। जिम रोज़ की तरह खुला है।' };
const billExpense = { tool: 'add_expense', input: { amount: 3200, category: 'electricity', date: '', method: 'cash', note: 'Electricity bill' } };

/** What the pretend AI answers for each sentence (the real one is deploy/panel/assist.js). */
function aiAnswer(text) {
  if (/who are my members/i.test(text)) return { actions: [{ tool: 'list_members', input: { group: 'everyone', days: 0, plan: '', batch: '', trainer: '', gender: '' } }], note: '' };
  if (/bijli/i.test(text)) return { actions: [closedMessage, billExpense], note: 'Two things: a message and an expense.' };
  if (/^message everyone/i.test(text)) return { actions: [closedMessage], note: '' };
  if (/^parso gym band/i.test(text)) return { actions: [hindiClosure('2026-10-19', '2026-10-18T08:00')], note: '' };
  if (/^kal gym band/i.test(text)) return { actions: [hindiClosure('2026-10-18')], note: '' };
  if (/^gym band/i.test(text)) return { actions: [hindiClosure('')], note: '' };
  if (/chhath/i.test(text)) return { actions: [chhathGreeting], note: '' };
  if (/^ravi ko/i.test(text)) return { actions: [{ tool: 'ask_back', input: { question: 'Which message should Ravi get?', options: ['Fee reminder', 'Birthday wishes'] } }], note: '' };
  if (/price/i.test(text)) {
    return { actions: [{ tool: 'open_page', input: { page: 'plans', steps: ['Tap the plan', 'Change the price', 'Tap Save'], why: 'Plan prices are changed on the Plans page.' } }], note: '' };
  }
  if (/call/i.test(text)) return { actions: [{ tool: 'cannot_do', input: { reason: 'I cannot make phone calls.' } }], note: '' };
  if (/diet/i.test(text)) return { actions: [{ tool: 'draft_diet_plan', input: { member: 'Asha', goal: 'fat_loss', food: 'veg', notes: '' } }], note: '' };
  if (/workout/i.test(text)) {
    return { actions: [{ tool: 'draft_workout_plan', input: { member: 'Asha', goal: 'fat_loss', days_per_week: 3, level: 'beginner', notes: 'Knee pain, no running' } }], note: '' };
  }
  return { actions: [{ tool: 'cannot_do', input: { reason: 'I did not understand that.' } }], note: '' };
}

/** The panel worker's assistant routes, answered on this page. `worker.off`: 503 {reason:'off'}. */
async function installWorker(page) {
  const worker = { asked: [], rewrites: [], plans: [], voice: 0, off: false, rewriteFails: false };
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
    // R-501: "Add the same message in Hindi" keeps the English and adds the Hindi; `rewriteFails` = the AI is down.
    if (worker.rewriteFails) return route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'The AI did not answer. Try again, or say it another way.' }) });
    if (/Hindi/.test(String(body.how))) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ title_en: body.title_en, body_en: body.body_en, ...CHHATH_HI, left: 39 }) });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ title_en: 'Gym closed tomorrow', body_en: 'Closed tomorrow, Sunday. Open Monday 6 am.', title_hi: '', body_hi: '', left: 39 }),
    });
  });
  // The plan writer (deploy/panel/assistPlan.js): a plan made only of exercises from the list the browser sent.
  await page.route('**/api/assist/plan', async (route) => {
    const body = route.request().postDataJSON();
    worker.plans.push(body);
    const lib = body.exercises.filter((e) => !e.custom && e.kind === 'weight_reps');
    const ex = (e) => ({ name: e.name, catalogKey: e.key, logType: e.kind, sets: 3, repMin: 10, repMax: 12, primary: e.primary, restSec: 60, note: null });
    const routines = Array.from({ length: body.days_per_week }, (_, i) => ({ name: `Day ${i + 1} · Full body`, dayType: 'full', exercises: lib.slice(i * 4, i * 4 + 4).map(ex) }));
    const n = routines.reduce((k, r) => k + r.exercises.length, 0);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        plan: { name: `Fat loss · ${body.days_per_week} days · Beginner`, note: 'Warm up for 10 minutes first.', routines, assign: { memberIds: [], planIds: [] } },
        summary: `A ${body.days_per_week}-day fat loss plan for a beginner: ${n} exercises. The trainer adds the weights.`,
        left: 38,
        dropped: 0,
      }),
    });
  });
  await page.route('**/api/assist/voice', async (route) => {
    worker.voice += 1;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: 'Who are my members?', provider: 'sarvam' }) });
  });
  return worker;
}

/**
 * R-471: the plan writer card for "Asha ke liye workout plan banao": the choices the AI heard, "Write the plan" (free:
 * the gym's exercise list goes, never Asha), the builder with the plan for Asha, Save = 3 credits, then the saved card.
 * `scope` holds the cards (the page on a phone, the side panel on a computer); `size` only names the pictures.
 */
async function planWriter(page, scope, worker, server, pill, size) {
  const click = (loc) => (size === 'phone' ? loc.tap() : loc.click());
  const spends = () => server.log.filter((c) => c.fn === 'owner_ai_spend');
  const before = spends().length;
  const asked = worker.plans.length;
  await askIn(page, scope, 'Asha ke liye workout plan banao, ghutne mein dard hai');
  const writer = scope.getByRole('article', { name: 'Workout plan' }).last();
  await expect(writer).toContainText('Asha Verma');
  await expect(writer.getByLabel('Goal')).toHaveValue('fat_loss');
  await expect(writer.getByLabel('Level')).toHaveValue('beginner');
  await expect(writer.getByLabel('Days a week')).toHaveValue('3');
  await expect(writer.getByLabel('Anything to keep in mind (optional)')).toHaveValue('Knee pain, no running');
  await expect(writer).toContainText('Writing the plan is free. Saving it uses 3 credits.');
  await expect(writer).not.toContainText(/cannot write|not yet/i);
  await writer.getByLabel('Days a week').selectOption('4');
  await shots(page, '09-plan-writer-card', false, writer);
  await click(writer.getByRole('button', { name: 'Write the plan' }));

  const builder = page.getByRole('dialog', { name: 'Workout plan by the AI' });
  await expect(builder).toBeVisible();
  await expect(builder.getByLabel('Plan name')).toHaveValue('Fat loss · 4 days · Beginner · Asha Verma');
  await expect(builder).toContainText('A 4-day fat loss plan for a beginner: 16 exercises.');
  await expect(builder).toContainText('Nothing goes to members before you save.');
  await expect(builder).toContainText('Asha Verma sees it in the MettleUp app after one check-in at the gym.');
  await expect(builder.getByLabel('Note for Asha Verma (optional)')).toHaveValue('Warm up for 10 minutes first.');
  await expect(builder.getByRole('button', { name: /Day 1 · Full body · 4 exercises/ })).toBeVisible();
  await expect(builder.getByRole('button', { name: 'Save plan · 3 credits' })).toBeVisible();
  expect(worker.plans).toHaveLength(asked + 1);
  const body = worker.plans.at(-1);
  expect(body).toMatchObject({ what: 'workout', goal: 'fat_loss', level: 'beginner', days_per_week: 4, focus: 'Knee pain, no running', lang: 'en' });
  expect(body.exercises.length).toBeGreaterThan(100);
  expect(JSON.stringify(body)).not.toMatch(/Asha|Verma|98290/);
  // Writing is free.
  expect(spends()).toHaveLength(before);
  await shots(page, '10-plan-builder');
  await click(builder.getByRole('button', { name: 'Save plan · 3 credits' }));
  await expect(builder).toHaveCount(0);
  await expect(writer).toContainText('Workout plan saved for Asha Verma. It is in Workout plans.');
  expect(spends()).toHaveLength(before + 1);
  expect(spends().at(-1).args.p_credits).toBe(3);
  const task = server.log.filter((c) => c.fn === 'owner_ai_task_save').at(-1);
  expect(task.args.p_id).toBe(spends().at(-1).args.p_task_id);
  expect(task.args.p_actions[0].tool).toBe('draft_workout_plan');
  await shots(page, '11-plan-saved', false, writer);
}

async function askIn(page, scope, words) {
  await scope.getByLabel('Ask or give a task', { exact: true }).last().fill(words);
  await scope.getByRole('button', { name: 'Ask the AI Assistant' }).last().click();
}

async function ask(page, words) {
  const box = page.getByLabel('Ask or give a task', { exact: true }).last();
  await box.fill(words);
  await page.getByRole('button', { name: 'Ask the AI Assistant' }).last().click();
}

test('AI Assistant: hidden without 0071; the button, cards, credits, voice, the computer panel; never for the desk', async ({ page, browser }) => {
  test.setTimeout(180_000);
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
  await expect(main).toContainText('Asking is free. A task uses credits only when you send or save it.');
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
  await shots(page, '03-answer-card', false, answer);

  // 4. One request, two things: two cards, two buttons, two prices, two tasks.
  await ask(page, 'Kal gym band hai sabko batao, aur bijli ka bill 3200 cash diya');
  const message = main.getByRole('article', { name: 'Message to your members' }).last();
  const expense = main.getByRole('article', { name: 'Save an expense' }).last();
  await expect(message).toBeVisible();
  await expect(expense).toBeVisible();
  await expect(message.getByRole('button', { name: 'Send now to 1 member · 1 credit' })).toBeVisible();
  await expect(expense.getByRole('button', { name: 'Save expense · 1 credit' })).toBeVisible();
  await expect(message).toContainText('Everyone · 2 members');
  await expect(message).toContainText('1 has the app');
  await expect(expense).toContainText('₹3,200');
  const saved = server.log.filter((c) => c.fn === 'owner_ai_task_save');
  expect(new Set(saved.map((c) => c.args.p_id)).size).toBe(2);
  expect(saved.map((c) => c.args.p_actions.length)).toEqual([1, 1]);
  await shots(page, '04-message-card', false, message);
  await shots(page, '05-change-card', false, expense);
  await expense.getByRole('button', { name: 'Save expense · 1 credit' }).tap();
  await expect(expense).toContainText('Expense saved.');
  await expect(main.getByRole('button', { name: /AI credits\. Open AI credits\./ }).first()).toContainText('83 credits');
  const spends = server.log.filter((c) => c.fn === 'owner_ai_spend');
  expect(spends).toHaveLength(1);
  expect(spends[0].args.p_credits).toBe(1);
  expect(spends[0].args.p_task_id).toBe(saved.find((c) => c.args.p_actions[0].tool === 'add_expense').args.p_id);
  await expect(message.getByRole('button', { name: 'Send now to 1 member · 1 credit' })).toBeVisible();

  // 5. "Shorter", then send the message.
  await message.getByRole('button', { name: 'Shorter' }).tap();
  await expect(message).toContainText('Closed tomorrow, Sunday. Open Monday 6 am.');
  expect(worker.rewrites).toHaveLength(1);
  await message.getByRole('button', { name: 'Send now to 1 member · 1 credit' }).tap();
  await expect(message).toContainText('Sent to 1 in the app. 1 member without the app is ready on WhatsApp.');
  await expect(message.getByRole('button', { name: '1 without the app: send on WhatsApp' })).toBeVisible();
  expect(server.messages[0]).toMatchObject({ kind: 'closed', title: 'Gym closed tomorrow' });
  await expect(main.getByRole('button', { name: /AI credits\. Open AI credits\./ }).first()).toContainText('82 credits');

  // 6. AskBack, where to do it, cannot, a plan.
  await ask(page, 'Ravi ko message bhejo');
  await expect(main.getByRole('article', { name: 'A question back' }).last()).toContainText('Which message should Ravi get?');
  await shots(page, '06-askback-card', false, main.getByRole('article', { name: 'A question back' }).last());
  await ask(page, 'Gold plan ka price badlo');
  const where = main.getByRole('article', { name: 'Where to do it' }).last();
  await expect(where).not.toContainText('Where:');
  await expect(where.getByRole('button', { name: 'Open Plans' })).toBeVisible();
  await shots(page, '07-open-page-card', false, where);
  await ask(page, 'Asha ko call karo');
  const cannot = main.getByRole('article', { name: 'Something the assistant cannot do' }).last();
  await expect(cannot).toContainText('I cannot make phone calls.');
  await expect(cannot.getByRole('button', { name: 'Open Help and feedback' })).toBeVisible();
  await shots(page, '08-cannot-card', false, cannot);
  // 6b. The plan writer (R-471).
  const pill = main.getByRole('button', { name: /AI credits\. Open AI credits\./ }).first();
  await planWriter(page, main, worker, server, pill, 'phone');
  await expect(pill).toContainText('79 credits');
  await ask(page, 'Asha ke liye diet plan banao');
  const diet = main.getByRole('article', { name: 'Diet plans' }).last();
  await expect(diet).toContainText('The AI Assistant cannot write diet plans yet.');
  await expect(diet).not.toContainText(/credit/i);
  await expect(diet.getByRole('button', { name: 'Open Diet plans' })).toBeVisible();
  await shots(page, '12-diet-not-yet-card', false, diet);

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
  await expect(broke.getByRole('button', { name: 'Ask MettleUp for credits' })).toBeVisible();
  await shots(page, '13-no-credits-card', false, broke);
  await broke.getByRole('button', { name: 'Ask MettleUp for credits' }).tap();
  await expect(credits).toBeVisible();
  await expect(credits).toContainText('Get more credits');
  // Buying in the panel is not built: no prices it cannot sell.
  await expect(credits).not.toContainText(/₹(149|399|999)/);
  await expect(credits.getByRole('button', { name: 'Ask MettleUp for credits' })).toBeVisible();
  // Each spend says what that task did (one request made a message and an expense).
  await expect(credits).toContainText('Message: Gym closed tomorrow');
  await expect(credits).toContainText('Expense ₹3,200');
  await expect(credits).toContainText('Workout plan saved');
  // R-473: the wallet's own number (monthly_free), never one typed into the screen.
  await expect(credits).toContainText('Your plan gets 100 free credits every month.');
  await expect(credits).toContainText('You have no credits left. Questions stay free.');
  await shots(page, '14-credits-sheet');
  await credits.getByRole('button', { name: 'Close' }).tap();
  expect(server.log.filter((c) => c.fn === 'owner_ai_spend')).toHaveLength(3);
  // Back to what the owner really has after 5 credits of tasks (84 - 5), so the later pictures add up.
  ai.balance = 79;
  ai.freeLeft = 29;
  // The credits sheet reads the wallet again: the pill shows 79 for the pictures that follow.
  await pill.tap();
  await expect(credits).toContainText('79');
  await credits.getByRole('button', { name: 'Close' }).tap();

  // 8. The voice screen.
  await page.getByRole('button', { name: 'Speak a request' }).tap();
  const voice = page.getByRole('dialog', { name: 'AI Assistant' });
  await expect(voice).toContainText('Listening… speak in Hindi, English or both');
  await expect(voice).toContainText('Up to 30 seconds');
  await page.waitForTimeout(1600);
  await shots(page, '15-voice-listening');
  await voice.getByRole('button', { name: 'Done' }).tap();
  await expect(voice).toContainText('What I heard (you can fix it)');
  await expect(voice.getByRole('textbox')).toHaveValue('Who are my members?');
  await shots(page, '16-voice-heard');
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
  await shots(page, '17-button');
  await fab.click();
  const panel = page.getByRole('complementary', { name: 'AI Assistant' });
  await expect(panel).toBeVisible();
  const p = await panel.boundingBox();
  expect(Math.round(p.width)).toBe(420);
  // The page behind still works: its search box takes typing while the panel is open.
  await page.getByRole('main').getByPlaceholder('Search name or mobile number').fill('Asha');
  await expect(page.getByRole('main')).toContainText('Asha Verma');
  // Fresh eyes (14 Nov 2026): with the panel open the number broke over 3 lines ("+91 / 98290 / 11111"). One line now.
  const number = page.getByRole('main').getByText('+91 98290 11111', { exact: true });
  await expect(number).toBeVisible();
  const lineHeight = await number.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize) * 1.5);
  expect((await number.boundingBox()).height, 'the phone number stays on one line').toBeLessThanOrEqual(lineHeight + 1);
  await shots(page, '18-side-panel');
  await panel.getByRole('tab', { name: 'History' }).click();
  await expect(panel).toContainText('Bijli', { ignoreCase: true });
  await expect(panel).toContainText('Done · 1 credit');
  await expect(panel).toContainText('Expense ₹3,200 ·');
  await expect(panel).toContainText('Message: Gym closed tomorrow ·');
  await shots(page, '19-history');
  await panel.getByRole('tab', { name: 'Ask' }).click();
  await panel.getByRole('button', { name: /AI credits\. Open AI credits\./ }).click();
  await expect(page.getByRole('dialog', { name: 'AI credits' })).toBeVisible();
  await shots(page, '20-credits-sheet');
  await page.getByRole('dialog', { name: 'AI credits' }).getByRole('button', { name: 'Close' }).click();
  await panel.getByRole('button', { name: 'Close the AI Assistant' }).click();
  await expect(panel).toHaveCount(0);
  await go(page, '/assistant');
  await expect(page.getByRole('heading', { level: 1, name: 'AI Assistant' })).toBeVisible();
  await shots(page, '21-page', true);
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

test('AI Assistant on a computer: Today, the side panel, every card, the plan writer, no credits, voice (pictures)', async ({ page }) => {
  test.setTimeout(180_000);
  const server = await openApp(page);
  const ai = installAi(server);
  const worker = await installWorker(page);
  await startOnlineGym(page);
  await addMember(page, { name: 'Asha Verma', phone: '98290 11111' });
  await addMember(page, { name: 'Ravi Kumar', phone: '98290 22222' });
  server.appMembers = [{ member_id: 'app-1', name: 'Asha Verma', phone: '+919829011111', joined_at: '2026-10-01T10:00:00Z', last_seen: '2026-10-16T10:00:00Z', orders: 0, spent_p: 0 }];
  ai.on = true;
  await page.setViewportSize({ width: 1280, height: 900 });
  await go(page, '/');
  await page.reload();
  const main = page.getByRole('main');
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();

  // Today: the assistant's card ("Today for you") and the button bottom right.
  const today = main.getByRole('region', { name: 'AI Assistant' });
  await expect(today).toContainText('84 credits');
  const fab = page.getByRole('button', { name: 'Open the AI Assistant' });
  await expect(fab).toBeVisible();
  await shots(page, '01-button-today');

  // The side panel: Today for you, Try saying.
  await fab.click();
  const panel = page.getByRole('complementary', { name: 'AI Assistant' });
  await expect(panel).toContainText('Try saying');
  await expect(panel).not.toContainText(/Diwali|Holi|Eid|Christmas/);
  await shots(page, '02-home');
  const pill = panel.getByRole('button', { name: /AI credits\. Open AI credits\./ });

  // Every card, in the panel.
  await askIn(page, panel, 'Who are my members?');
  const answer = panel.getByRole('article').last();
  await expect(answer).toContainText('Asha Verma');
  await shots(page, '03-answer-card', false, answer);
  await askIn(page, panel, 'Kal gym band hai sabko batao, aur bijli ka bill 3200 cash diya');
  const message = panel.getByRole('article', { name: 'Message to your members' }).last();
  const expense = panel.getByRole('article', { name: 'Save an expense' }).last();
  await expect(message.getByRole('button', { name: 'Send now to 1 member · 1 credit' })).toBeVisible();
  await expect(expense.getByRole('button', { name: 'Save expense · 1 credit' })).toBeVisible();
  await shots(page, '04-message-card', false, message);
  await shots(page, '05-change-card', false, expense);
  await askIn(page, panel, 'Ravi ko message bhejo');
  const back = panel.getByRole('article', { name: 'A question back' }).last();
  await expect(back).toContainText('Which message should Ravi get?');
  await shots(page, '06-askback-card', false, back);
  await askIn(page, panel, 'Gold plan ka price badlo');
  const where = panel.getByRole('article', { name: 'Where to do it' }).last();
  await expect(where.getByRole('button', { name: 'Open Plans' })).toBeVisible();
  await shots(page, '07-open-page-card', false, where);
  await askIn(page, panel, 'Asha ko call karo');
  const cannot = panel.getByRole('article', { name: 'Something the assistant cannot do' }).last();
  await expect(cannot).toContainText('I cannot make phone calls.');
  await shots(page, '08-cannot-card', false, cannot);

  // The plan writer, in the panel; the builder opens over the page.
  await planWriter(page, panel, worker, server, pill, 'computer');
  await expect(pill).toContainText('81 credits');
  await askIn(page, panel, 'Asha ke liye diet plan banao');
  const diet = panel.getByRole('article', { name: 'Diet plans' }).last();
  await expect(diet).toContainText('The AI Assistant cannot write diet plans yet.');
  await expect(diet).not.toContainText(/credit/i);
  await shots(page, '12-diet-not-yet-card', false, diet);

  // No credits: the draft still shows; its button opens the packs.
  ai.balance = 0;
  ai.freeLeft = 0;
  await pill.click();
  const credits = page.getByRole('dialog', { name: 'AI credits' });
  await expect(credits).toContainText('Your plan gets 100 free credits every month.');
  await credits.getByRole('button', { name: 'Close' }).click();
  await askIn(page, panel, 'Message everyone that the gym is closed tomorrow');
  const broke = panel.getByRole('article', { name: 'Message to your members' }).last();
  await expect(broke.getByRole('button', { name: 'Ask MettleUp for credits' })).toBeVisible();
  await shots(page, '13-no-credits-card', false, broke);
  await broke.getByRole('button', { name: 'Ask MettleUp for credits' }).click();
  await expect(credits).toContainText('Get more credits');
  await expect(credits).not.toContainText(/₹(149|399|999)/);
  await shots(page, '14-credits-sheet');
  await credits.getByRole('button', { name: 'Close' }).click();
  ai.balance = 81;
  ai.freeLeft = 31;

  // Voice, from the panel.
  await panel.getByRole('button', { name: 'Speak a request' }).click();
  const voice = page.getByRole('dialog', { name: 'AI Assistant' });
  await expect(voice).toContainText('Up to 30 seconds');
  await page.waitForTimeout(1600);
  await shots(page, '15-voice-listening');
  await voice.getByRole('button', { name: 'Done' }).click();
  await expect(voice).toContainText('What I heard (you can fix it)');
  await shots(page, '16-voice-heard');
  await voice.getByRole('button', { name: 'Send to AI Assistant' }).click();
  await expect(voice).toHaveCount(0);
  expect(worker.voice).toBe(1);
});

// R-501 (owner, 14 Nov 2026): he asked for a Chhath Puja greeting; the AI wrote English; he picked "Both"; the words did
// not change and it went out in English only. Now Hindi or Both writes the Hindi words first (free, the "Add Hindi"
// rewrite), the chip moves only when they are there, the preview shows them before Send, and a failure says so.
test('AI Assistant R-501: Both on an English greeting writes the Hindi first; a failure keeps English and says so', async ({ page }) => {
  test.setTimeout(150_000);
  const server = await openApp(page);
  const ai = installAi(server);
  const worker = await installWorker(page);
  await startOnlineGym(page);
  await addMember(page, { name: 'Asha Verma', phone: '98290 11111' });
  server.appMembers = [{ member_id: 'app-1', name: 'Asha Verma', phone: '+919829011111', joined_at: '2026-10-01T10:00:00Z', last_seen: '2026-10-16T10:00:00Z', orders: 0, spent_p: 0 }];
  ai.on = true;
  await go(page, '/');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open the AI Assistant' }).tap();
  await expect(page.getByRole('heading', { level: 1, name: 'AI Assistant' })).toBeVisible();
  const main = page.getByRole('main');

  await ask(page, 'Chhath Puja ki badhai likho');
  const card = main.getByRole('article', { name: 'Message to your members' }).last();
  await expect(card).toContainText('Happy Chhath Puja to you and your family.');
  const langs = card.getByRole('group', { name: 'Language' });
  const chip = (name) => langs.getByRole('button', { name, exact: true });
  await expect(chip('English')).toHaveAttribute('aria-pressed', 'true');
  await expect(card).toContainText('To send it in Hindi, tap Hindi or Both. The AI writes the Hindi words first, for free.');

  // Negative: the AI is down. The chip stays on English, the words stay English, and the card says so.
  // Fresh eyes (14 Nov 2026): the line said "Try again" with no button. It now says Send goes in English only, and
  // "Try Hindi again" sits right under it (the small "Add Hindi" chip goes, so there is one Hindi button).
  worker.rewriteFails = true;
  await chip('Both').tap();
  const failLine = card.getByRole('alert').filter({ hasText: 'The Hindi words could not be written.' });
  await expect(failLine).toHaveText('The Hindi words could not be written. The message will go in English only, unless you try again.');
  const retry = card.getByRole('button', { name: 'Try Hindi again', exact: true });
  await expect(retry).toBeVisible();
  // The button is right under the line, above "When".
  const lineBox = await failLine.boundingBox();
  const retryBox = await retry.boundingBox();
  expect(retryBox.y, 'Try Hindi again sits under the red line').toBeGreaterThanOrEqual(lineBox.y + lineBox.height - 1);
  expect(retryBox.y - (lineBox.y + lineBox.height), 'and close to it').toBeLessThan(24);
  expect(retryBox.height, 'a button big enough to tap').toBeGreaterThanOrEqual(40);
  await expect(card.getByRole('button', { name: 'Add Hindi', exact: true })).toHaveCount(0);
  await expect(chip('English')).toHaveAttribute('aria-pressed', 'true');
  await expect(chip('Both')).toHaveAttribute('aria-pressed', 'false');
  await expect(card).not.toContainText(CHHATH_HI.body_hi);
  await expectFitsPhone(page, 'with the Hindi failure line and its button');
  await shots(page, '17-both-failed', false, card);

  // Happy path: "Try Hindi again". The Hindi is written with the "Add Hindi" rewrite, for Both (what he asked for),
  // then shown under the English; the failure line and its button go.
  worker.rewriteFails = false;
  await retry.tap();
  await expect(card).toContainText(CHHATH_HI.body_hi);
  await expect(chip('Both')).toHaveAttribute('aria-pressed', 'true');
  await expect(card).toContainText('Happy Chhath Puja to you and your family.');
  await expect(retry).toHaveCount(0);
  await expect(failLine).toHaveCount(0);
  expect(worker.rewrites.at(-1).how).toBe('Add the same message in Hindi');
  expect(worker.rewrites.at(-1).body_en).toBe('Happy Chhath Puja to you and your family. The gym is open as usual.');
  // Fresh eyes (14 Nov 2026): the title carries the Hindi too ("English / हिन्दी", as the Messages templates do).
  const bothTitle = `Happy Chhath Puja / ${CHHATH_HI.title_hi}`;
  await expect(card.getByText(bothTitle, { exact: true })).toBeVisible();
  await expectFitsPhone(page, 'with the Hindi written');

  // Fresh eyes (14 Nov 2026): Send sat under the "Ask or give a task" box. When the words come back, the card brings
  // Send up, fully above the box. (No scrolling by the test: this is where the screen left it.)
  const send = card.getByRole('button', { name: 'Send now to 1 member · 1 credit' });
  const askForm = page.locator('form').filter({ has: page.getByLabel('Ask or give a task', { exact: true }) });
  const clearOfAskBox = async () => {
    const s = await send.boundingBox();
    const a = await askForm.boundingBox();
    return s && a ? Math.round(a.y - (s.y + s.height)) : -999;
  };
  await expect.poll(clearOfAskBox, { message: 'Send is fully above the ask box after the Hindi came', timeout: 5_000 }).toBeGreaterThanOrEqual(4);
  expect((await send.boundingBox()).y, 'and below the top bar').toBeGreaterThan(60);
  await shots(page, '18b-send-clear');
  await shots(page, '18-both-written', false, card);

  // The page always has room for Send above the box: scrolled to the very end on a 390 px and a 360 px phone.
  for (const width of [390, 360]) {
    await page.setViewportSize({ width, height: 740 });
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(300);
    await expect.poll(clearOfAskBox, { message: `${width} px: Send scrolls fully above the ask box` }).toBeGreaterThanOrEqual(4);
    const cancel = await card.getByRole('button', { name: 'Cancel', exact: true }).boundingBox();
    const box = await askForm.boundingBox();
    expect(cancel.y + cancel.height, `${width} px: even the card's last button clears the ask box at the end`).toBeLessThanOrEqual(box.y);
    await expectFitsPhone(page, `${width} px, scrolled to the end`);
    await shots(page, `18c-end-${width}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });

  // Hindi alone: the words are there now, so it switches at once (no new rewrite).
  const rewrites = worker.rewrites.length;
  await chip('Hindi').tap();
  await expect(chip('Hindi')).toHaveAttribute('aria-pressed', 'true');
  await expect(card).not.toContainText('Happy Chhath Puja to you and your family.');
  expect(worker.rewrites).toHaveLength(rewrites);
  await chip('Both').tap();
  await expect(chip('Both')).toHaveAttribute('aria-pressed', 'true');

  // Send: what the members get is what the card showed, English and Hindi.
  await card.getByRole('button', { name: 'Send now to 1 member · 1 credit' }).tap();
  await expect(card).toContainText('Sent to 1 in the app.');
  expect(server.messages[0].body).toContain('Happy Chhath Puja to you and your family.');
  expect(server.messages[0].body).toContain(CHHATH_HI.body_hi);
  expect(server.messages[0].title).toBe(bothTitle);
});

test('AI Assistant R-514: a closure message names its day; with no day it asks; it sends now unless he said when', async ({ page }) => {
  test.setTimeout(150_000);
  const server = await openApp(page);
  const ai = installAi(server);
  await installWorker(page);
  await startOnlineGym(page);
  await addMember(page, { name: 'Asha Verma', phone: '98290 11111' });
  server.appMembers = [{ member_id: 'app-1', name: 'Asha Verma', phone: '+919829011111', joined_at: '2026-10-01T10:00:00Z', last_seen: '2026-10-16T10:00:00Z', orders: 0, spent_p: 0 }];
  ai.on = true;
  await go(page, '/');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open the AI Assistant' }).tap();
  await expect(page.getByRole('heading', { level: 1, name: 'AI Assistant' })).toBeVisible();
  const main = page.getByRole('main');
  const askForm = page.locator('form').filter({ has: page.getByLabel('Ask or give a task', { exact: true }) });
  /** Scrolled to the end, the card's Send sits fully above the ask box (it never hides under it). */
  const sendClearAtEnd = async (send, what) => {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(300);
    const s = await send.boundingBox();
    const a = await askForm.boundingBox();
    expect(Math.round(a.y - (s.y + s.height)), `${what}: Send is fully above the ask box`).toBeGreaterThanOrEqual(4);
  };

  // (a) He said the day ("kal" = tomorrow, Sunday 18 Oct; today is Saturday 17 Oct). The Hindi message names it with
  // its date, the card shows "Closed on" with that day, and it sends NOW (the closed day is not the send time).
  await ask(page, 'kal gym band rahega, sab members ko message bhejo');
  let card = main.getByRole('article', { name: 'Message to your members' }).last();
  await expect(card).toContainText('जिम बंद: कल, रविवार 18 अक्टूबर।');
  await expect(card).toContainText('कृपया ध्यान दें कि जिम बंद रहेगा।');
  await expect(card.getByLabel('Closed on', { exact: true })).toHaveValue('2026-10-18');
  await expect(card.getByRole('button', { name: 'Now', exact: true })).toHaveAttribute('aria-pressed', 'true');
  let send = card.getByRole('button', { name: 'Send now to 1 member · 1 credit' });
  await expect(send).toBeEnabled();
  await expectFitsPhone(page, 'R-514 a closure with its day');
  await sendClearAtEnd(send, 'a day given');
  await shots(page, '19a-closed-day');
  await shots(page, '19a-closed-day-card', false, card);
  await send.tap();
  await expect(card).toContainText('Sent to 1 in the app.');
  expect(server.messages[0].body).toBe(['जिम बंद: कल, रविवार 18 अक्टूबर।', 'कृपया ध्यान दें कि जिम बंद रहेगा।'].join(String.fromCharCode(10)));
  expect(server.messages[0].sendAt).toBeNull();

  // (b) No day said (his real sentence lost "kal"): the date is empty, the card asks in plain words, Send is off.
  // He picks the day: the words name it, and Send works.
  await ask(page, 'gym band rahega sare members ko message bhejo');
  card = main.getByRole('article', { name: 'Message to your members' }).last();
  await expect(card).toContainText('कृपया ध्यान दें कि जिम बंद रहेगा।');
  const day = card.getByLabel('Closed on', { exact: true });
  await expect(day).toHaveValue('');
  const askForDay = card.getByRole('alert').filter({ hasText: 'Pick the day the gym is closed.' });
  await expect(askForDay).toHaveCount(1);
  send = card.getByRole('button', { name: 'Send now to 1 member · 1 credit' });
  await expect(send).toBeDisabled();
  await expect(card).not.toContainText('जिम बंद: ');
  await expectFitsPhone(page, 'R-514 no day');
  await day.scrollIntoViewIfNeeded();
  await shots(page, '19b-no-day');
  await shots(page, '19b-no-day-card', false, card);
  await day.fill('2026-10-18');
  await expect(askForDay).toHaveCount(0);
  await expect(card).toContainText('जिम बंद: कल, रविवार 18 अक्टूबर।');
  await expect(send).toBeEnabled();
  await sendClearAtEnd(send, 'the day picked');
  await shots(page, '19b-day-picked');
  await shots(page, '19b-day-picked-card', false, card);

  // (c) "Closed the day after tomorrow, send it tomorrow at 8": Later is on with that time, the closed day stays
  // Monday 19 Oct, and the button says when it goes.
  await ask(page, 'parso gym band, kal subah 8 baje bhejo');
  card = main.getByRole('article', { name: 'Message to your members' }).last();
  await expect(card).toContainText('जिम बंद: सोमवार 19 अक्टूबर।');
  await expect(card.getByLabel('Closed on', { exact: true })).toHaveValue('2026-10-19');
  await expect(card.getByRole('button', { name: 'Later', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(card.getByLabel('Send on', { exact: true })).toHaveValue('2026-10-18T08:00');
  send = card.getByRole('button', { name: 'Send on 18 Oct, 8:00 am to 1 member · 1 credit' });
  await expect(send).toBeEnabled();
  await expectFitsPhone(page, 'R-514 send later');
  await sendClearAtEnd(send, 'send later');
  await shots(page, '19c-send-later');
  await shots(page, '19c-send-later-card', false, card);
  // (d) Back to Now: the button says so at once; then Later again with his time.
  await card.getByRole('button', { name: 'Now', exact: true }).tap();
  await expect(card.getByRole('button', { name: 'Send now to 1 member · 1 credit' })).toBeVisible();
  await card.getByRole('button', { name: 'Later', exact: true }).tap();
  await card.getByLabel('Send on', { exact: true }).fill('2026-10-18T08:00');
  await send.tap();
  await expect.poll(() => server.messages.length).toBe(2);
  expect(server.messages[0].sendAt).toBe('2026-10-18T02:30:00.000Z');
  expect(server.messages[0].body).toContain('जिम बंद: सोमवार 19 अक्टूबर।');
});
