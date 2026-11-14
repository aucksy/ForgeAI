// F210 Free trial when joining online (R-521; supabase 0088 NOT live until the owner's yes), UAT. Every step taps the
// real screen; pictures go to e2e/.results/uat (CI uploads them as "dashboard-uat-pictures").
//
// The gym's side: the owner turns the trial on in Settings -> Member app and picks 3 days (then Off, then 3 again);
// Today's "Joined online" shows the trial with the last day the desk lets them in (and one that has ended);
// "Make member" -> Add member -> Sell membership (the gym's first plan, today; the desk picks) -> their page. Hidden: a server without 0088
// (the preview has no `trial` key) and a server without Join online at all (PGRST202) show no trial setting.
// The visitor's side: public/join-online.html as the Worker serves it, with the trial in the preview: "Try free for
// 3 days", nothing to pay, "Start my free trial", sent as plan "_trial"; English and Hindi, phone and computer,
// light and dark; the number that already had a trial; trials off = no trial on the page.
import { mkdirSync, readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { NOW, TODAY, addPlan, expectFitsPhone, openApp, sheet, startOnlineGym } from './support.mjs';

const DIR = 'e2e/.results/uat';
mkdirSync(DIR, { recursive: true });

async function shot(page, name, fullPage = true) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage });
}

async function noSideways(page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over).toBeLessThanOrEqual(1);
}

const SIZES = { phone: { width: 390, height: 844 }, computer: { width: 1280, height: 900 } };

// ---------------------------------------------------------------- the gym's side

/**
 * The gym server's self_join_preview as the admin app asks it. `has`: '0088' (the trial key, from the gym's details
 * record as 0088 reads it), '0077' (no trial key: the live server today) or 'none' (no Join online: PGRST202).
 */
async function previewFromServer(page, server, has) {
  await page.route(/\/rest\/v1\/rpc\/self_join_preview/, (route) => {
    if (has === 'none') {
      return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST202', message: 'Could not find the function public.self_join_preview' }) });
    }
    const plans = [...server.records.values()]
      .filter((r) => r.k === 'plan' && !r.x && r.d.active !== false)
      .map((r) => ({ id: r.id, name: r.d.name, durationUnit: r.d.durationUnit ?? 'month', durationCount: r.d.durationCount ?? 1, priceP: r.d.priceP, joiningFeeP: r.d.joiningFeeP ?? 0, totalP: r.d.priceP + (r.d.joiningFeeP ?? 0) }));
    const body = { gymName: server.gym.name || 'Shakti Gym', joinCode: server.gym.joinCode, brand: {}, closed: false, today: TODAY, lastDay: '2026-11-16', plans };
    if (has === '0088') {
      const days = server.records.get('gym:gym')?.d?.joinTrialDays;
      body.trial = [1, 3, 7].includes(days) ? { days, feeP: 0 } : null;
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

/** What 0088 self_join_send writes for a free trial (a new record version, like the server). */
function personStartsTrial(server, { id, name, phone, startsOn = TODAY, endsOn = '2026-10-19', days = 3, at = NOW.getTime() }) {
  server.version += 1;
  const block = {
    v: 1, name, gender: 'female', planId: '', planName: '', durationUnit: 'day', durationCount: days,
    priceP: 0, joiningFeeP: 0, totalP: 0, startsOn, pay: 'desk', paid: false, phoneChecked: true, lang: 'en',
    consents: { adultAt: at, healthAt: at, wording: '2026-11-14' }, at, trial: { days, endsOn, feeP: 0 },
  };
  const d = {
    id, gymId: server.gym.gymId, name, phone, interest: `Free trial online: ${days} days, ${startsOn} to ${endsOn}. Not a member yet.`,
    followUpOn: TODAY, status: 'open', memberId: null, source: null, selfJoin: block, createdAt: at, updatedAt: at,
  };
  server.records.set(`enquiry:${id}`, { k: 'enquiry', id, x: false, ver: server.version, d });
}

async function openSettingsApp(page) {
  await page.evaluate(() => {
    window.location.hash = '/settings/app';
  });
  await expect(page.getByRole('main')).toBeVisible({ timeout: 15_000 });
}

const trialCard = (page) => page.getByTestId('join-trial-card');
const lengthChip = (page, name) => page.getByRole('group', { name: 'Free trial length' }).getByRole('button', { name, exact: true });

test.describe('the gym side', () => {
  test.use({ viewport: SIZES.phone });

  test('F210 phone: the owner turns the free trial on and picks 3 days; Off removes it; Hinglish', async ({ page }) => {
    const server = await openApp(page);
    await startOnlineGym(page);
    await addPlan(page, { name: 'Monthly', price: '1500', joining: '500', months: '1' });
    await previewFromServer(page, server, '0088');
    await page.reload();
    await openSettingsApp(page);

    const card = trialCard(page);
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card).toContainText('Free trial for new people');
    await expect(card).toContainText('People who open your "Become a member" link can try your gym free before they pick a plan.');
    await expect(lengthChip(page, 'Off')).toHaveAttribute('aria-pressed', 'true');
    // Off: no extra lines.
    await expect(card).not.toContainText('Each mobile number gets one free trial at your gym.');
    await card.scrollIntoViewIfNeeded();
    await expectFitsPhone(page, 'in Settings with the free trial off');
    await shot(page, 'phone-jointrial-1-settings-off', false);

    await lengthChip(page, '3 days').tap();
    await expect.poll(() => server.records.get('gym:gym')?.d?.joinTrialDays, { timeout: 15_000 }).toBe(3);
    await expect(page.getByRole('status').filter({ hasText: 'Saved. New people can try your gym free for 3 days.' })).toBeVisible();
    await expect(lengthChip(page, '3 days')).toHaveAttribute('aria-pressed', 'true');
    await expect(card).toContainText('Each mobile number gets one free trial at your gym.');
    await expect(card).toContainText('A person on a free trial is not a member yet. They cannot check in with the app or a card, so let them in at the desk until the day shown on Today.');
    await card.scrollIntoViewIfNeeded();
    await expectFitsPhone(page, 'in Settings with a 3-day trial');
    await shot(page, 'phone-jointrial-2-settings-3-days', false);

    // Off again: the key leaves the gym's record (0088 then reads it as off).
    await lengthChip(page, 'Off').tap();
    await expect.poll(() => 'joinTrialDays' in (server.records.get('gym:gym')?.d ?? {}), { timeout: 15_000 }).toBe(false);
    await expect(page.getByRole('status').filter({ hasText: 'Saved. Free trials are off.' })).toBeVisible();
    await lengthChip(page, '7 days').tap();
    await expect.poll(() => server.records.get('gym:gym')?.d?.joinTrialDays, { timeout: 15_000 }).toBe(7);
    await lengthChip(page, '3 days').tap();
    await expect.poll(() => server.records.get('gym:gym')?.d?.joinTrialDays, { timeout: 15_000 }).toBe(3);

    // After a reload the choice is still there.
    await page.reload();
    await openSettingsApp(page);
    await expect(lengthChip(page, '3 days')).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });

    // Hinglish.
    await page.evaluate(() => localStorage.setItem('forgeai.lang.v1', 'hinglish'));
    await page.reload();
    await openSettingsApp(page);
    await expect(card).toContainText('Naye logon ke liye free trial', { timeout: 15_000 });
    await expect(lengthChip(page, 'Band')).toBeVisible();
    await expect(lengthChip(page, '3 din')).toHaveAttribute('aria-pressed', 'true');
    await card.scrollIntoViewIfNeeded();
    await expectFitsPhone(page, 'in Settings, Hinglish');
    await shot(page, 'phone-jointrial-2b-settings-hinglish', false);
  });

  test('F210 phone: Today shows the trial and the last day; one that ended; the desk makes them a member', async ({ page }) => {
    const server = await openApp(page);
    await startOnlineGym(page);
    await addPlan(page, { name: 'Monthly', price: '1500', joining: '500', months: '1' });
    personStartsTrial(server, { id: 'join-0a1b2c3d4e5f60718293a4b5c6d7e8f9', name: 'Neha Singh', phone: '+919000088005', at: NOW.getTime() });
    personStartsTrial(server, { id: 'join-1a1b2c3d4e5f60718293a4b5c6d7e8f9', name: 'Kavya Rao', phone: '+919000088006', startsOn: '2026-10-10', endsOn: '2026-10-16', days: 7, at: NOW.getTime() - 86400000 });
    await page.evaluate(() => {
      window.location.hash = '/';
    });
    await page.reload();
    const card = page.locator('#needs-online-joins');
    await expect(card).toContainText('Joined online', { timeout: 15_000 });
    await expect(card).toContainText('People on a free trial may visit until the day shown. Make them members when they join.');
    await expect(card).toContainText('Free trial, 3 days · 17 Oct to 19 Oct 2026');
    await expect(card).toContainText('Let them in until 19 Oct 2026 · Nothing paid');
    await expect(card).toContainText('Free trial, 7 days · 10 Oct to 16 Oct 2026');
    await expect(card).toContainText('Trial ended on 16 Oct 2026 · Not a member yet');
    // A trial has no money line and never an Approve.
    await expect(card).not.toContainText('to pay at the desk');
    await expect(card.getByRole('button', { name: /^Approve/ })).toHaveCount(0);
    await card.scrollIntoViewIfNeeded();
    await expectFitsPhone(page, 'on Today with a free trial');
    await shot(page, 'phone-jointrial-3-today-card');

    // Hinglish.
    await page.evaluate(() => localStorage.setItem('forgeai.lang.v1', 'hinglish'));
    await page.reload();
    await expect(card).toContainText('Free trial, 3 din · 17 Oct se 19 Oct 2026 tak', { timeout: 15_000 });
    await expect(card).toContainText('19 Oct 2026 tak andar aane do · Kuch pay nahi kiya');
    await expect(card).toContainText('Trial 16 Oct 2026 ko khatam hua · Abhi member nahi hain');
    await card.scrollIntoViewIfNeeded();
    await shot(page, 'phone-jointrial-3b-today-card-hinglish');
    await page.evaluate(() => localStorage.setItem('forgeai.lang.v1', 'en'));
    await page.reload();

    // Enquiries shows the same request with its trial line (not the server's older copy).
    await page.evaluate(() => {
      window.location.hash = '/enquiries';
    });
    await expect(page.getByRole('main')).toContainText('Free trial online: 3 days, 17 Oct 2026 to 19 Oct 2026. Nothing paid.', { timeout: 15_000 });
    await expect(page.getByRole('main')).not.toContainText('Not a member yet.');
    await shot(page, 'phone-jointrial-4-enquiries-row');

    await page.evaluate(() => {
      window.location.hash = '/';
    });
    await card.getByRole('button', { name: 'Make Neha Singh a member' }).tap({ timeout: 15_000 });
    const add = sheet(page, 'Add member');
    await expect(add.getByLabel('Full name')).toHaveValue('Neha Singh');
    await expect(add.getByLabel('Mobile number')).toHaveValue(/90000\s?88005/);
    await expect(add.getByLabel('Gender (optional)')).toHaveValue('female');
    await add.getByRole('button', { name: 'Add member' }).tap();

    // Sell membership opens on the gym's plan and today's date: the desk picks; nothing is collected by itself.
    const sellSheet = sheet(page, 'Sell membership');
    await expect(sellSheet).toBeVisible({ timeout: 15_000 });
    await expect(sellSheet.getByLabel('Starts on')).toHaveValue(TODAY);
    await expect(sellSheet.getByLabel('Received now')).toHaveValue('');
    await expectFitsPhone(page, 'in Sell membership after a free trial');
    await shot(page, 'phone-jointrial-5-sell-after-trial', false);
    await sellSheet.getByRole('button', { name: 'Confirm' }).tap();
    await expect(sellSheet).toBeHidden({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Neha Singh', exact: true })).toBeVisible();
    await shot(page, 'phone-jointrial-6-member-page');

    const joinId = 'enquiry:join-0a1b2c3d4e5f60718293a4b5c6d7e8f9';
    await expect.poll(() => server.records.get(joinId)?.d?.status, { timeout: 15_000 }).toBe('joined');
    const member = [...server.records.values()].find((r) => r.k === 'member' && !r.x && r.d.fullName === 'Neha Singh');
    expect(server.records.get(joinId)?.d?.memberId).toBe(member?.id);
    const sold = [...server.records.values()].filter((r) => r.k === 'membership' && !r.x && r.d.memberId === member?.id);
    expect(sold.map((r) => r.d.startsOn)).toEqual([TODAY]);
    // Kavya's ended trial is still waiting on Today.
    await page.evaluate(() => {
      window.location.hash = '/';
    });
    await expect(card).toContainText('Kavya Rao', { timeout: 15_000 });
    await expect(card).not.toContainText('Neha Singh');
  });

  test('F210 computer dark: the setting and the Today card', async ({ page }) => {
    await page.setViewportSize(SIZES.computer);
    const server = await openApp(page);
    await startOnlineGym(page);
    await addPlan(page, { name: 'Monthly', price: '1500', joining: '500', months: '1' });
    await previewFromServer(page, server, '0088');
    await page.evaluate(() => localStorage.setItem('forgeai.theme.v1', 'dark'));
    await page.reload();
    await openSettingsApp(page);
    await lengthChip(page, '7 days').click({ timeout: 15_000 });
    await expect.poll(() => server.records.get('gym:gym')?.d?.joinTrialDays, { timeout: 15_000 }).toBe(7);
    await trialCard(page).scrollIntoViewIfNeeded();
    await shot(page, 'computer-jointrial-1-settings-dark', false);
    personStartsTrial(server, { id: 'join-2a1b2c3d4e5f60718293a4b5c6d7e8f9', name: 'Ravi Kumar', phone: '+919000088007', endsOn: '2026-10-23', days: 7 });
    await page.evaluate(() => {
      window.location.hash = '/';
    });
    await page.reload();
    const card = page.locator('#needs-online-joins');
    await expect(card).toContainText('Free trial, 7 days · 17 Oct to 23 Oct 2026', { timeout: 15_000 });
    await card.scrollIntoViewIfNeeded();
    await shot(page, 'computer-jointrial-2-today-card-dark');
  });

  test('F210 phone: a server without 0088, or without Join online, shows no trial setting anywhere', async ({ page }) => {
    const server = await openApp(page);
    await startOnlineGym(page);
    await addPlan(page, { name: 'Monthly', price: '1500', joining: '500', months: '1' });
    await previewFromServer(page, server, '0077');
    await page.reload();
    await openSettingsApp(page);
    // The page around it has drawn (the other Member app cards), and there is no trial card.
    await expect(page.getByText('Your look in the app')).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1000);
    await expect(trialCard(page)).toHaveCount(0);
    await expect(page.getByText('Free trial for new people')).toHaveCount(0);
    await shot(page, 'phone-jointrial-7-settings-before-0088');

    await page.unroute(/\/rest\/v1\/rpc\/self_join_preview/);
    await previewFromServer(page, server, 'none');
    await page.reload();
    await openSettingsApp(page);
    await expect(page.getByText('Your look in the app')).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1000);
    await expect(trialCard(page)).toHaveCount(0);
  });
});

// ---------------------------------------------------------------- the visitor's page

const PUB = new URL('../public/', import.meta.url);
const PROOF = `v1.join.9000088001.1999999999.${'a'.repeat(32)}.${'b'.repeat(64)}`;
const GYM = {
  gymName: 'Shakti Gym',
  joinCode: 'QA0002',
  brand: { accent: '#0E7C66' },
  closed: false,
  today: '2026-11-14',
  lastDay: '2026-12-14',
  plans: [{ id: 'plan-month', name: 'Monthly', durationUnit: 'month', durationCount: 1, priceP: 150000, joiningFeeP: 50000, totalP: 200000 }],
  trial: { days: 3, feeP: 0 },
};
const TRIAL_SENT = [201, { ok: true, gymName: 'Shakti Gym', startsOn: '2026-11-14', totalP: 0, linked: false, trial: { days: 3, endsOn: '2026-11-16' } }];

/** app.mettleup.fit/m/<code> the way the Worker serves it, with the WhatsApp check and /api/self-join answered here. */
async function servePage(page, gym, { sends = [TRIAL_SENT], payInfo = { online: false } } = {}) {
  const sent = [];
  let polls = 0;
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route(/^https:\/\/app\.mettleup\.fit\//, async (route) => {
    const url = new URL(route.request().url());
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/api/phone-code/inbound/start') {
      polls = 0;
      return json(200, { ok: true, id: '0b7c6f0e-1111-4222-8333-944455556666', code: '123456', waNumber: '919000000000', waText: 'MettleUp code 123456. After you send this, go back to the MettleUp page.', expiresAt: Date.now() + 600000 });
    }
    if (url.pathname === '/api/phone-code/inbound/status') {
      polls += 1;
      if (polls >= 2) return json(200, { ok: true, state: 'verified', proof: PROOF, expiresAt: Date.now() + 15 * 60000 });
      return json(200, { ok: true, state: 'waiting', expiresAt: Date.now() + 600000 });
    }
    if (url.pathname === '/api/self-join/pay-info') return json(200, payInfo);
    if (url.pathname === '/api/self-join') {
      sent.push(route.request().postDataJSON());
      const [status, body] = sends.shift() ?? TRIAL_SENT;
      return json(status, body);
    }
    if (/^\/m\/[A-Za-z0-9]{6}$/.test(url.pathname)) {
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: readFileSync(new URL('join-online.html', PUB)) });
    }
    if (url.pathname === '/privacy') return route.fulfill({ status: 200, contentType: 'text/html', body: '<p>Privacy</p>' });
    return route.fulfill({ status: 404, body: 'Not found' });
  });
  await page.addInitScript((g) => {
    window.__GYM__ = g;
  }, gym);
  return { sent };
}

/** Step 1 done: name, number, the WhatsApp check, gender. */
async function aboutYou(page) {
  await page.locator('#name').fill('Ravi Kumar');
  await page.locator('#phone').fill('90000 88001');
  await page.locator('#verify').click();
  await expect(page.locator('#checked')).toBeVisible({ timeout: 15_000 });
  await page.locator('input[name=gender][value=male]').check();
  await page.locator('#next1').click();
  await expect(page.locator('#step2')).toBeVisible();
}

for (const [size, scheme, lang] of [
  ['phone', 'light', 'en'],
  ['phone', 'dark', 'hi'],
  ['computer', 'light', 'en'],
]) {
  test(`F210 page, ${size} ${scheme} ${lang}: "Try free for 3 days", nothing to pay, sent as a trial`, async ({ page }) => {
    await page.setViewportSize(SIZES[size]);
    await page.emulateMedia({ colorScheme: scheme });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const { sent } = await servePage(page, GYM, { payInfo: { online: true, how: 'upi', testMode: false } });
    await page.goto('https://app.mettleup.fit/m/QA0002');
    await expect(page.locator('#title')).toHaveText('Shakti Gym');
    const hi = lang === 'hi';
    if (hi) await page.locator('#lang').click();
    const tag = `${size}-${scheme}-${lang}`;
    await aboutYou(page);

    // Step 2: the trial above the gym's plans, free; then the dates of the trial instead of a total.
    const trial = page.locator('label.plan.trial');
    await expect(trial).toContainText(hi ? '3 दिन मुफ़्त आज़माएँ' : 'Try free for 3 days');
    await expect(trial).toContainText(hi ? 'मुफ़्त' : 'Free');
    await expect(trial).toContainText(hi ? 'कोई पैसा नहीं।' : 'No payment. Visit the gym for 3 days, then pick a plan at the desk if you want to join.');
    await expect(page.locator('#plans .or')).toHaveText(hi ? 'या कोई प्लान चुनें' : 'or pick a plan');
    await expect(page.locator('#plans label')).toHaveCount(2);
    await page.locator('input[name=plan][value=_trial]').check();
    await expect(page.locator('#start-label')).toHaveText(hi ? 'ट्रायल शुरू होने की तारीख' : 'Trial starts on');
    await expect(page.locator('#total')).toHaveText('₹0');
    await expect(page.locator('#total-parts')).toHaveText(hi ? 'आपका फ़्री ट्रायल: 14 नवंबर 2026 से 16 नवंबर 2026 तक।' : 'Your free trial: 14 Nov 2026 to 16 Nov 2026.');
    await noSideways(page);
    await shot(page, `jointrial-page-1-pick-trial-${tag}`);
    // A later start moves the last day with it.
    await page.locator('#start').fill('2026-11-20');
    await page.locator('#start').dispatchEvent('change');
    await expect(page.locator('#total-parts')).toHaveText(hi ? 'आपका फ़्री ट्रायल: 20 नवंबर 2026 से 22 नवंबर 2026 तक।' : 'Your free trial: 20 Nov 2026 to 22 Nov 2026.');
    await page.locator('#start').fill('2026-11-14');
    await page.locator('#start').dispatchEvent('change');
    await page.locator('#next2').click();

    // Step 3: no "How you pay" (even though this gym takes UPI online), the trial's days, nothing to pay.
    await expect(page.locator('#step3')).toBeVisible();
    await expect(page.locator('#pay-opts')).toBeHidden();
    await expect(page.locator('#pay-legend')).toBeHidden();
    await expect(page.locator('#pay-note')).toHaveText(hi ? 'फ़्री ट्रायल का कोई पैसा नहीं लगता। इस पेज पर कोई पैसा नहीं लिया जाता।' : 'A free trial costs nothing. Nothing is paid on this page.');
    await expect(page.locator('#summary')).toContainText(hi ? 'फ़्री ट्रायल (3 दिन)' : 'Free trial (3 days)');
    await expect(page.locator('#summary')).toContainText(hi ? '16 नवंबर 2026' : '16 Nov 2026');
    await expect(page.locator('#send')).toHaveText(hi ? 'मेरा फ़्री ट्रायल शुरू करें' : 'Start my free trial');
    await page.locator('#adult').check();
    await page.locator('#health').check();
    await noSideways(page);
    await shot(page, `jointrial-page-2-agree-${tag}`);
    await page.locator('#send').click();

    await expect(page.locator('#done')).toBeVisible();
    await expect(page.locator('#done-title')).toHaveText(hi ? 'Shakti Gym को भेज दिया' : 'Sent to Shakti Gym');
    await expect(page.locator('#done-plan')).toHaveText(hi ? 'आपका फ़्री ट्रायल: 14 नवंबर 2026 से 16 नवंबर 2026 तक।' : 'Your free trial: 14 Nov 2026 to 16 Nov 2026.');
    await expect(page.locator('#done-pay')).toHaveText(
      hi
        ? 'पहली बार आने पर जिम के काउंटर पर अपना नाम बताएँ। ट्रायल के बाद भी आना हो, तो काउंटर पर प्लान चुनें।'
        : 'On your first visit, tell the gym desk your name. To keep training after the trial, pick a plan at the desk.',
    );
    await expect(page.locator('#paybox')).toBeHidden();
    // The plan is "_trial", paid at the desk (nothing); never a price, a fee or a total.
    expect(sent).toEqual([{ code: 'QA0002', name: 'Ravi Kumar', proof: PROOF, gender: 'male', plan: '_trial', start: '2026-11-14', adult: true, health: true, lang, pay: 'desk', website: '' }]);
    await noSideways(page);
    await shot(page, `jointrial-page-3-sent-${tag}`);
    // A reload after sending still says it.
    await page.reload();
    await expect(page.locator('#done-plan')).toContainText(hi ? 'आपका फ़्री ट्रायल' : 'Your free trial');
    expect(errors).toEqual([]);
  });
}

test('F210 page, phone: this number already had a trial here; it picks a plan instead', async ({ page }) => {
  const { sent } = await servePage(page, GYM, { sends: [[409, { error: 'TRIAL_USED' }], [201, { ok: true, gymName: 'Shakti Gym', planName: 'Monthly', startsOn: '2026-11-14', totalP: 200000, linked: true }]] });
  await page.goto('https://app.mettleup.fit/m/QA0002');
  await aboutYou(page);
  await page.locator('input[name=plan][value=_trial]').check();
  await page.locator('#next2').click();
  await page.locator('#adult').check();
  await page.locator('#health').check();
  await page.locator('#send').click();
  await expect(page.locator('#step2')).toBeVisible();
  await expect(page.locator('#plan-err')).toHaveText('This number has already had a free trial at this gym. Please pick a plan instead.');
  await expect(page.locator('input[name=plan][value=_trial]')).not.toBeChecked();
  await shot(page, 'jointrial-page-uat-trial-used-phone');
  await page.locator('#lang').click();
  await expect(page.locator('#plan-err')).toHaveText('इस नंबर से इस जिम में पहले ही फ़्री ट्रायल लिया जा चुका है। कृपया कोई प्लान चुनें।');
  await page.locator('#lang').click();
  await page.locator('input[name=plan][value=plan-month]').check();
  await expect(page.locator('#total')).toHaveText('₹2,000');
  await expect(page.locator('#start-label')).toHaveText('Start date');
  await page.locator('#next2').click();
  await expect(page.locator('#pay-opts')).toBeVisible();
  await expect(page.locator('#send')).toHaveText('Send to the gym');
  await page.locator('#send').click();
  await expect(page.locator('#done-plan')).toHaveText('Your plan: Monthly, starting 14 Nov 2026.');
  expect(sent.map((b) => b.plan)).toEqual(['_trial', 'plan-month']);
});

test('F210 page, phone: trials off (or a server without 0088) = no trial anywhere on the page', async ({ page }) => {
  for (const [name, gym] of [
    ['off', { ...GYM, trial: null }],
    ['before-0088', (({ trial, ...rest }) => rest)(GYM)],
  ]) {
    const p = await page.context().newPage();
    await servePage(p, gym);
    await p.goto('https://app.mettleup.fit/m/QA0002');
    await expect(p.locator('#sub')).toHaveText('Join in 3 short steps. You pay at the gym desk.');
    await aboutYou(p);
    await expect(p.locator('#plans label')).toHaveCount(1);
    await expect(p.locator('label.plan.trial')).toHaveCount(0);
    await expect(p.locator('#plans .or')).toHaveCount(0);
    await expect(p.locator('#plans')).not.toContainText(/free|trial/i);
    await shot(p, `jointrial-page-uat-no-trial-${name}-phone`);
    await p.close();
  }
});

test('F210 page, phone: the owner switched trials off while the page was open', async ({ page }) => {
  await page.route('https://hdxzqbdiokjklnypfisq.supabase.co/rest/v1/rpc/self_join_preview', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...GYM, trial: null }) }),
  );
  await servePage(page, GYM, { sends: [[409, { error: 'TRIAL_OFF' }]] });
  await page.goto('https://app.mettleup.fit/m/QA0002');
  await expect(page.locator('#sub')).toHaveText('Join in 3 short steps, or try the gym free for 3 days.');
  await aboutYou(page);
  await page.locator('input[name=plan][value=_trial]').check();
  await page.locator('#next2').click();
  await page.locator('#adult').check();
  await page.locator('#health').check();
  await page.locator('#send').click();
  await expect(page.locator('#plan-err')).toHaveText('This gym is not giving free trials right now. Please pick a plan.');
  await expect(page.locator('label.plan.trial')).toHaveCount(0);
  await expect(page.locator('#sub')).toHaveText('Join in 3 short steps. You pay at the gym desk.');
  await shot(page, 'jointrial-page-uat-trial-switched-off-phone');
});
