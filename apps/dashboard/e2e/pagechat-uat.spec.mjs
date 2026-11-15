// F208 UAT (R-538, 15 Nov 2026): the AI helper on the gym web page; every chat lands in Enquiries.
// Pictures for a person to read: e2e/.results/uat/pagechat-*.png (CI keeps them as dashboard-uat-pictures).
//
// Nothing here is live: the Worker's PAGE_AI is "off" and the gym server's 0094 waits for the owner's yes. The pretend
// server keeps three chats on enquiries exactly as 0094's page_chat_ask / reply / contact write them.
//
//  PAGECHAT-1 owner, phone and computer: PAGE_AI off -> no chat, no status, no switch; on (no reload) -> "Needs you"
//             and "Wants a call" first, "AI answered" last, the whole chat newest last with what happened to each
//             question, "No number left yet" and no Call or WhatsApp for a visitor who only chatted, "Mark as done"
//             saves and moves the chat down. The owner's "AI helper on your page" switch on Your web page.
//  PAGECHAT-2 visitor, phone and computer, light and dark: the gym's real page (renderGymPage with the chat box), an
//             answer from the page, "I will ask the gym", the name and number box once, sent; the privacy line.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { NOW, TODAY, expectFitsPhone, openApp, startOnlineGym } from './support.mjs';

const DIR = 'e2e/.results/uat';
mkdirSync(DIR, { recursive: true });
const PUB = new URL('../public/', import.meta.url);
const SIZES = { phone: { width: 390, height: 844 }, computer: { width: 1280, height: 900 } };

async function shot(page, name, fullPage = true) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/pagechat-${name}.png`, fullPage });
}

/** GET /api/switches: gym pages on, the AI helper chat as `sw.ai` says (it can change while the panel is open). */
async function chatSwitch(page, ai) {
  const sw = { ai, asked: 0 };
  await page.context().route('**/api/switches', (route) => {
    sw.asked += 1;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ gymPages: true, joinPay: false, aiCharge: true, pageAi: sw.ai }) });
  });
  return sw;
}

const T = NOW.getTime();
const vq = (id, text, state, at) => ({ id, from: 'visitor', text, at, state });
const aq = (id, text, at) => ({ id, from: 'ai', text, at });

/** One enquiry per chat, as 0094 keeps it. */
function chats(server) {
  const put = (id, d) => {
    server.version += 1;
    server.records.set(`enquiry:${id}`, { k: 'enquiry', id, x: false, ver: server.version, d: { id, gymId: server.gym.gymId, followUpOn: TODAY, status: 'open', memberId: null, source: null, createdAt: T, updatedAt: T, ...d } });
  };
  put('chat-answered', {
    name: 'Web page visitor', phone: '', interest: 'Chat on your web page: Is there parking?',
    pageChat: { v: 1, status: 'answered', wants: null, startedAt: T - 9e5, lastAt: T - 9e5, messages: [vq('m000000000001', 'Is there parking?', 'answered', T - 9e5), aq('a000000000001', 'Yes, there is parking at the gym.', T - 9e5)] },
  });
  put('chat-call', {
    name: 'Pooja Meena', phone: '+919000093001', interest: 'Chat on your web page: What are the evening timings?',
    pageChat: { v: 1, status: 'wants_call', wants: 'call', startedAt: T - 6e5, lastAt: T - 5e5, needAt: T - 5e5, messages: [
      vq('m000000000002', 'What are the evening timings?', 'answered', T - 6e5), aq('a000000000002', 'In the evening the gym is open from 4:00 pm to 10:00 pm.', T - 6e5),
    ] },
  });
  put('chat-needs', {
    name: 'Web page visitor', phone: '', interest: 'Chat on your web page: Is there a steam room?',
    pageChat: { v: 1, status: 'needs_you', wants: null, startedAt: T - 3e5, lastAt: T - 2e5, needAt: T - 2e5, messages: [
      vq('m000000000003', 'How much is the monthly plan?', 'answered', T - 3e5), aq('a000000000003', 'The Monthly plan is ₹1,500. Please confirm the fee at the desk.', T - 3e5),
      vq('m000000000004', 'Is there a steam room?', 'unknown', T - 2e5), aq('a000000000004', 'This page does not have that answer, so I have saved your question for the gym.', T - 2e5),
      vq('m000000000005', 'Do you have a diet plan for diabetes?', 'limit', T - 1e5),
    ] },
  });
}

/** The row of the enquiry whose chat holds `text`. */
const rowOf = (main, text) => main.locator('[data-testid="page-chat"]').filter({ hasText: text });

for (const size of ['phone', 'computer']) {
  test(`PAGECHAT-1 owner (${size}): chats in Enquiries, off then on, "Needs you" and "Wants a call" first, the whole chat, Mark as done`, async ({ page }) => {
    await page.setViewportSize(SIZES[size]);
    const sw = await chatSwitch(page, false);
    const server = await openApp(page);
    await startOnlineGym(page);
    chats(server);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible({ timeout: 15_000 });
    await page.goto('./#/enquiries');
    const main = page.getByRole('main');

    // OFF: the people are there (the server's line for older apps), no chat, no status words.
    await expect(main.getByText('Pooja Meena').first()).toBeVisible({ timeout: 15_000 });
    await expect(main.locator('[data-testid="page-chat"]')).toHaveCount(0);
    await expect(main.getByText('Needs you: the AI could not answer')).toHaveCount(0);
    // A visitor who only chatted has no number: no Call button for them, even with the chat off.
    await expect(main.getByText('No number left yet').first()).toBeVisible();
    await expect(main.getByRole('link', { name: 'Call Web page visitor' })).toHaveCount(0);
    await expect(main.getByRole('link', { name: 'Call Pooja Meena' })).toBeVisible();
    await shot(page, `1-off-${size}`);

    // ON, with no reload.
    sw.ai = true;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(main.locator('[data-testid="page-chat"]')).toHaveCount(3, { timeout: 10_000 });
    const order = await main.locator('[data-testid="page-chat"]').evaluateAll((els) => els.map((e) => e.textContent));
    expect(order[0]).toContain('Needs you: the AI could not answer');
    expect(order[1]).toContain('Wants a call');
    expect(order[2]).toContain('AI answered');
    // The whole chat, newest last, with what happened to each question.
    const needs = rowOf(main, 'steam room');
    await expect(needs.getByRole('listitem')).toHaveCount(5);
    await expect(needs.getByRole('listitem').last()).toContainText('Do you have a diet plan for diabetes?');
    await expect(needs.getByText('The AI could not answer this from your page.')).toBeVisible();
    await expect(needs.getByText('Not sent to the AI: a daily limit or no AI credits left.')).toBeVisible();
    // The server's copy of the first question is not shown twice.
    await expect(main.getByText('Chat on your web page: Is there a steam room?')).toHaveCount(0);
    if (size === 'phone') await expectFitsPhone(page, 'on Enquiries with web page chats');
    await shot(page, `1-on-${size}`);

    // Mark as done: saved on the enquiry, the chat moves down and says Done.
    const pushesBefore = server.calls.filter((c) => c === 'crm_push').length;
    await main.getByRole('button', { name: 'Mark the web page chat with Web page visitor as done' }).click();
    await expect.poll(() => server.calls.filter((c) => c === 'crm_push').length, { timeout: 10_000 }).toBeGreaterThan(pushesBefore);
    await expect.poll(() => server.records.get('enquiry:chat-needs')?.d?.pageChat?.doneAt ?? null, { timeout: 10_000 }).not.toBeNull();
    expect(server.records.get('enquiry:chat-needs').d.pageChat.messages).toHaveLength(5);
    await expect(rowOf(main, 'steam room')).toContainText('Needs you: the AI could not answer · Done');
    const after = await main.locator('[data-testid="page-chat"]').evaluateAll((els) => els.map((e) => e.textContent));
    expect(after[0]).toContain('Wants a call');
    await shot(page, `1-done-${size}`);
  });
}

// ------------------------------------------------------------------ the visitor

const SLUG = 'shakti-gym-sector-12';
const PUBLIC_RAW = {
  v: 1, slug: SLUG, gymName: 'Shakti Gym', area: 'Sector 12', city: 'Jaipur', joinCode: 'QA0002', brand: { accent: '#e8590c' },
  about: 'A friendly gym near the market.', highlights: ['ac', 'parking'], photos: [],
  plans: [{ id: 'm', name: 'Monthly', durationUnit: 'month', durationCount: 1, priceP: 150000, joiningFeeP: 50000 }],
  hours: { week: { mon: { kind: 'hours', ranges: [{ open: '05:30', close: '22:00' }] } }, special: [], note: '' },
  address: '12 Example Road, Sector 12', mapsUrl: null, contact: { phone: null, whatsapp: false }, joinOnline: true, indexable: false, aiHelper: true,
};

/** The real page with the chat box (deploy/panel/gymPage.js renderGymPage), drawn by plain node (see onelink-uat). */
function gymPageHtml(nowMs) {
  const mod = new URL('../../../deploy/panel/gymPage.js', import.meta.url).href;
  const code = `const m = await import(${JSON.stringify(mod)}); process.stdout.write(m.renderGymPage(m.pageFrom(${JSON.stringify(PUBLIC_RAW)}), { nowMs: ${nowMs}, chat: true }));`;
  return execFileSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

const UNKNOWN = 'This page does not have that answer, so I have saved your question for the gym. To get an answer, write your name and number below. The gym will call you or send you a WhatsApp message on that number.';

/** join.mettleup.fit as the Worker serves it with PAGE_AI live; the chat answers as pageChat.js would. */
async function serveChatPage(page) {
  const html = gymPageHtml(Date.parse('2026-11-15T18:00:00+05:30'));
  const sent = { chat: [], contact: [] };
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('https://fonts.gstatic.com/**', (r) => r.fulfill({ status: 404, body: '' }));
  await page.route(/^https:\/\/join\.mettleup\.fit\//, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === `/${SLUG}`) return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
    if (url.pathname === '/gym-page/page.js') return route.fulfill({ status: 200, contentType: 'text/javascript', body: readFileSync(new URL('gym-page/page.js', PUB)) });
    if (url.pathname === '/api/gym-page/chat') {
      const b = JSON.parse(route.request().postData() || '{}');
      sent.chat.push(b);
      const known = /parking/i.test(b.question);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(known
        ? { ok: true, state: 'answered', answer: 'Yes, there is parking at Shakti Gym.', askNumber: false }
        : { ok: true, state: 'unknown', answer: UNKNOWN, askNumber: true }) });
    }
    if (url.pathname === '/api/gym-page/chat-contact') {
      sent.contact.push(JSON.parse(route.request().postData() || '{}'));
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    }
    return route.fulfill({ status: 404, body: 'Not found' });
  });
  return sent;
}

for (const [size, scheme] of [['phone', 'light'], ['phone', 'dark'], ['computer', 'light']]) {
  test(`PAGECHAT-2 visitor (${size} ${scheme}): an answer from the page, "I will ask the gym", the number box once`, async ({ page }) => {
    await page.setViewportSize(SIZES[size]);
    await page.emulateMedia({ colorScheme: scheme });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const sent = await serveChatPage(page);
    await page.goto(`https://join.mettleup.fit/${SLUG}`);
    const chat = page.locator('#chat');
    await expect(chat.getByRole('heading', { name: 'Ask the AI helper' })).toBeVisible();
    await expect(chat.getByText('Your chat is saved and seen by Shakti Gym.')).toBeVisible();
    await expect(page.locator('#chat-contact')).toBeHidden();

    await chat.getByLabel('Your question').fill('Is there parking?');
    await chat.getByRole('button', { name: 'Ask', exact: true }).click();
    await expect(page.locator('#chat-log li.ai').last()).toContainText('Yes, there is parking at Shakti Gym.');
    await expect(page.locator('#chat-contact')).toBeHidden();
    expect(sent.chat[0]).toMatchObject({ slug: SLUG, question: 'Is there parking?' });
    expect(sent.chat[0].visitor).toMatch(/^[A-Za-z0-9_-]{16,64}$/);

    await chat.getByLabel('Your question').fill('Is there a steam room?');
    await chat.getByRole('button', { name: 'Ask', exact: true }).click();
    await expect(page.locator('#chat-log li.ai').last()).toContainText('saved your question for the gym');
    // The same visitor id for the whole chat.
    expect(sent.chat[1].visitor).toBe(sent.chat[0].visitor);
    const box = page.locator('#chat-contact');
    await expect(box).toBeVisible();
    await expect(box.getByText('Shakti Gym will call you or send you a WhatsApp message on this number.')).toBeVisible();
    if (size === 'phone') await expectFitsPhone(page, 'on the gym page chat');
    await chat.scrollIntoViewIfNeeded();
    await shot(page, `2-chat-${size}-${scheme}`, false);

    // Checked before sending: the tick.
    await box.getByLabel('Your name').fill('Pooja Meena');
    await box.getByLabel('Mobile number').fill('90000 93001');
    await box.getByRole('button', { name: 'Ask the gym to call me' }).click();
    await expect(page.locator('#chat-contact-msg')).toHaveText('Please tick the box so the gym can call you.');
    expect(sent.contact).toHaveLength(0);
    await box.getByRole('checkbox').check();
    await box.getByRole('button', { name: 'I want to join' }).click();
    await expect(page.locator('#chat-contact-msg')).toHaveText('Your number is sent to Shakti Gym. They will call you or send you a WhatsApp message on 90XXXXXX01.');
    expect(sent.contact[0]).toMatchObject({ slug: SLUG, visitor: sent.chat[0].visitor, name: 'Pooja Meena', phone: '9000093001', consent: true, wants: 'join' });
    await shot(page, `2-sent-${size}-${scheme}`, false);

    // A reload shows the chat again and never asks for the number twice.
    await page.reload();
    await expect(page.locator('#chat-log li')).toHaveCount(4);
    await expect(page.locator('#chat-contact')).toBeHidden();
    expect(errors).toEqual([]);
  });
}

// ------------------------------------------------------------------ the owner's switch on Your web page

const SAVED_PAGE = {
  slug: SLUG, published: true, indexable: false, hiddenByHq: false, hqNote: null, area: 'Sector 12', city: 'Jaipur',
  about: 'A friendly gym near the market.', highlights: ['ac'], photos: [], mapsUrl: '', lat: null, lng: null,
  showPhone: false, whatsapp: false, aiHelper: true, termsAt: 1, updatedAt: 1,
};

test('PAGECHAT-3 owner: the "AI helper on your page" switch shows only with the chat on, ON by default, and is saved', async ({ page }) => {
  const sw = await chatSwitch(page, false);
  const server = await openApp(page);
  const saves = [];
  let saved = { ...SAVED_PAGE };
  const base = server.answer.bind(server);
  server.answer = (fn, args) => {
    if (fn === 'owner_gym_page') return { canEdit: true, page: saved };
    if (fn === 'owner_save_gym_page') {
      saves.push(args.p_page);
      saved = { ...saved, ...args.p_page, termsAt: 1 };
      return { ok: true, page: saved };
    }
    return base(fn, args);
  };
  await startOnlineGym(page);
  await page.goto('./#/settings/web-page');
  const main = page.getByRole('main');
  await expect(page.getByRole('heading', { name: 'Your web page', level: 1 })).toBeVisible({ timeout: 15_000 });
  await expect(main.getByText('Phone and WhatsApp')).toBeVisible();
  await expect(main.getByText('AI helper on your page')).toHaveCount(0);

  sw.ai = true;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  const tick = main.getByRole('checkbox', { name: /Let the AI helper answer visitors/ });
  await expect(tick).toBeVisible({ timeout: 10_000 });
  await expect(tick).toBeChecked();
  await expect(main.getByText(/answers visitors only from what is on your page/)).toBeVisible();
  await tick.scrollIntoViewIfNeeded();
  await shot(page, '3-switch-on', false);
  await expectFitsPhone(page, 'on Your web page');

  await tick.uncheck();
  await main.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(() => saves.length, { timeout: 10_000 }).toBe(1);
  expect(saves[0].aiHelper).toBe(false);
  expect(saves[0].slug).toBe(SLUG);
});
