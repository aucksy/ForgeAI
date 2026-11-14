// R-513 Join online, phase 1 (14 Nov 2026), UAT. Every step taps the real screen; pictures go to e2e/.results/uat
// (CI uploads them as "dashboard-uat-pictures").
//
// The person's side: public/join-online.html at app.mettleup.fit/m/<code>, served the way the Worker serves it (the
// gym and its plans written in as window.__GYM__, no CSP), with the WhatsApp check and /api/self-join answered here.
// A phone (390 x 844) and a computer (1280 x 900), English and Hindi, light and dark. The cases: happy path, wrong
// code, already a member, an open enquiry (linked), a paused gym, a reload half-way, under 18, the WhatsApp check
// not done (and a message from the wrong number).
// The gym's side: the request on Today ("Joined online": plan, start day, total, "Not paid yet"), "Make member" ->
// Add member filled in -> Sell membership on their plan and day, nothing collected -> their page; on a computer a
// friend a member invited, linked to that member's enquiry, then the F147 thank-you.
import { mkdirSync, readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { NOW, TODAY, addMember, addPlan, expectFitsPhone, openApp, sell, sheet, startOnlineGym } from './support.mjs';

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

// ---------------------------------------------------------------- the person's page

const PUB = new URL('../public/', import.meta.url);
const PROOF = `v1.join.9000077001.1999999999.${'a'.repeat(32)}.${'b'.repeat(64)}`;
const GYM = {
  gymName: 'Shakti Gym',
  joinCode: 'QA0002',
  brand: { accent: '#0E7C66' },
  closed: false,
  today: '2026-11-14',
  lastDay: '2026-12-14',
  plans: [
    { id: 'plan-month', name: 'Monthly', durationUnit: 'month', durationCount: 1, priceP: 150000, joiningFeeP: 50000, totalP: 200000 },
    { id: 'plan-quarter', name: 'Quarterly', durationUnit: 'month', durationCount: 3, priceP: 400000, joiningFeeP: 0, totalP: 400000 },
  ],
};
const SENT_OK = [201, { ok: true, gymName: 'Shakti Gym', planName: 'Monthly', startsOn: '2026-11-20', totalP: 200000, linked: false }];

/**
 * app.mettleup.fit/m/<code> (and /j/<code>) the way the Worker serves them. `checks`: the WhatsApp check's status
 * answers in order (the last one repeats; a test may push more); `sends`: /api/self-join's answers in order.
 */
async function servePage(page, gym, { checks = ['waiting', 'waiting', 'verified'], sends = [SENT_OK] } = {}) {
  const sent = [];
  const started = [];
  let polls = 0;
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route(/^https:\/\/app\.mettleup\.fit\//, async (route) => {
    const url = new URL(route.request().url());
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/api/phone-code/inbound/start') {
      const b = route.request().postDataJSON();
      started.push(b);
      polls = 0;
      return json(200, { ok: true, id: '0b7c6f0e-1111-4222-8333-944455556666', code: '123456', waNumber: '919000000000', waText: 'MettleUp code 123456. After you send this, go back to the MettleUp page.', expiresAt: Date.now() + 600000 });
    }
    if (url.pathname === '/api/phone-code/inbound/status') {
      const state = checks[Math.min(polls, checks.length - 1)];
      polls += 1;
      if (state === 'verified') return json(200, { ok: true, state, proof: PROOF, expiresAt: Date.now() + 15 * 60000 });
      return json(200, { ok: true, state, expiresAt: Date.now() + 600000 });
    }
    if (url.pathname === '/api/self-join') {
      sent.push(route.request().postDataJSON());
      const [status, body] = sends.shift() ?? SENT_OK;
      return json(status, body);
    }
    if (/^\/m\/[A-Za-z0-9]{6}$/.test(url.pathname)) {
      return route.fulfill({ status: gym ? 200 : 404, contentType: 'text/html; charset=utf-8', body: readFileSync(new URL('join-online.html', PUB)) });
    }
    if (/^\/j\/[A-Za-z0-9]{6}$/.test(url.pathname)) {
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: readFileSync(new URL('join.html', PUB)) });
    }
    if (url.pathname === '/privacy') return route.fulfill({ status: 200, contentType: 'text/html', body: '<p>Privacy</p>' });
    return route.fulfill({ status: 404, body: 'Not found' });
  });
  // The Worker writes the gym into the page (joinPage); the same value, set before the page's script runs.
  await page.addInitScript((g) => {
    window.__GYM__ = g;
  }, gym);
  return { sent, started };
}

const SIZES = { phone: { width: 390, height: 844 }, computer: { width: 1280, height: 900 } };

/** Step 1 done: name, number, the WhatsApp check (waiting, then verified), gender. */
async function aboutYou(page, { name = 'Ravi Kumar', phone = '90000 77001' } = {}) {
  await page.locator('#name').fill(name);
  await page.locator('#phone').fill(phone);
  await page.locator('#verify').click();
  await expect(page.locator('#wa')).toBeVisible();
  await expect(page.locator('#wa-open')).toHaveAttribute('href', /^https:\/\/wa\.me\/919000000000\?text=MettleUp%20code%20123456/);
  await expect(page.locator('#checked')).toBeVisible({ timeout: 15_000 });
  await page.locator('input[name=gender][value=male]').check();
}

// The happy path in each look: phone light English, phone dark Hindi, computer light Hindi, computer dark English.
for (const [size, scheme, lang] of [
  ['phone', 'light', 'en'],
  ['phone', 'dark', 'hi'],
  ['computer', 'light', 'hi'],
  ['computer', 'dark', 'en'],
]) {
  test(`R-513 page, ${size} ${scheme} ${lang}: the 3 steps, the total before the last step, sent`, async ({ page }) => {
    await page.setViewportSize(SIZES[size]);
    await page.emulateMedia({ colorScheme: scheme });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const { sent, started } = await servePage(page, GYM);
    await page.goto('https://app.mettleup.fit/m/QA0002');
    await expect(page.locator('#title')).toHaveText('Shakti Gym');
    if (lang === 'hi') {
      await page.locator('#lang').click();
      await expect(page.locator('#lang')).toHaveText('English');
      await expect(page.locator('#sub')).toHaveText('3 छोटे स्टेप में मेंबर बनें। पैसे जिम के काउंटर पर देने हैं।');
      await expect(page.locator('#verify')).toHaveText('WhatsApp से वेरिफ़ाई करें');
      await expect(page).toHaveTitle('Shakti Gym के मेंबर बनें');
    } else {
      await expect(page.locator('#sub')).toHaveText('Join in 3 short steps. You pay at the gym desk.');
      await expect(page).toHaveTitle('Become a member of Shakti Gym');
    }
    await noSideways(page);
    const tag = `${size}-${scheme}-${lang}`;
    await shot(page, `selfjoin-page-1-about-you-${tag}`);

    await page.locator('#name').fill('Ravi Kumar');
    await page.locator('#phone').fill('90000 77001');
    await page.locator('#verify').click();
    await expect(page.locator('#wa')).toBeVisible();
    await expect(page.locator('#wa-manual')).toContainText('MettleUp code 123456');
    await shot(page, `selfjoin-page-2-whatsapp-waiting-${tag}`);
    await expect(page.locator('#checked')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#checked-line')).toContainText('+91 90000 77001');
    expect(started[0]).toEqual({ phone: '9000077001', purpose: 'join', lang: lang === 'hi' ? 'hinglish' : 'en', website: '' });
    await page.locator('input[name=gender][value=male]').check();
    await shot(page, `selfjoin-page-3-number-checked-${tag}`);
    await page.locator('#next1').click();

    // Step 2: the gym's own plans and prices; the total shows before the last step.
    await expect(page.locator('#step2')).toBeVisible();
    await expect(page.locator('#plans label')).toHaveCount(2);
    await expect(page.locator('#plans')).toContainText('₹1,500');
    await expect(page.locator('#plans')).toContainText('₹4,000');
    await expect(page.locator('#start')).toHaveValue('2026-11-14');
    await page.locator('input[name=plan][value=plan-month]').check();
    await expect(page.locator('#total')).toHaveText('₹2,000');
    await expect(page.locator('#total-parts')).toHaveText(lang === 'hi' ? 'प्लान ₹1,500 + जॉइनिंग फ़ीस ₹500' : 'Plan ₹1,500 + joining fee ₹500');
    await page.locator('#start').fill('2026-11-20');
    await noSideways(page);
    await shot(page, `selfjoin-page-4-plan-${tag}`);
    await page.locator('#next2').click();

    // Step 3: what they send, the two unticked boxes, pay at the desk only.
    await expect(page.locator('#step3')).toBeVisible();
    await expect(page.locator('#adult')).not.toBeChecked();
    await expect(page.locator('#health')).not.toBeChecked();
    await expect(page.locator('input[name=pay]')).toHaveCount(1);
    await expect(page.locator('#summary')).toContainText('Ravi Kumar');
    await expect(page.locator('#summary')).toContainText('₹2,000');
    await expect(page.locator('#summary')).toContainText(lang === 'hi' ? '20 नवंबर 2026' : '20 Nov 2026');
    await page.locator('#adult').check();
    await page.locator('#health').check();
    await noSideways(page);
    await shot(page, `selfjoin-page-5-agree-${tag}`);
    await page.locator('#send').click();

    await expect(page.locator('#done')).toBeVisible();
    await expect(page.locator('#done-title')).toHaveText(lang === 'hi' ? 'Shakti Gym को भेज दिया' : 'Sent to Shakti Gym');
    await expect(page.locator('#done-pay')).toContainText('₹2,000');
    await expect(page.locator('#form')).toBeHidden();
    // Only the checked values go: never a price, a fee or a total (the gym server reads those itself).
    expect(sent).toEqual([{ code: 'QA0002', name: 'Ravi Kumar', proof: PROOF, gender: 'male', plan: 'plan-month', start: '2026-11-20', adult: true, health: true, lang, website: '' }]);
    await noSideways(page);
    await shot(page, `selfjoin-page-6-sent-${tag}`);
    expect(errors).toEqual([]);
  });
}

test('R-513 page, phone: the WhatsApp check not done, a message from the wrong number, then under 18', async ({ page }) => {
  const checks = ['waiting', 'wrong_number'];
  const { sent } = await servePage(page, GYM, { checks });
  await page.goto('https://app.mettleup.fit/m/QA0002');
  // Next with no check: refused here, nothing sent.
  await page.locator('#next1').click();
  await expect(page.locator('#name-err')).toHaveText('Type your full name.');
  await page.locator('#name').fill('Ravi Kumar');
  await page.locator('#phone').fill('90000 77001');
  await page.locator('#next1').click();
  await expect(page.locator('#phone-err')).toHaveText('Check your number with WhatsApp first.');
  await expect(page.locator('#step2')).toBeHidden();
  await shot(page, 'selfjoin-page-uat-whatsapp-not-done-phone');
  // The message came from another WhatsApp number: said plainly, still waiting; then the right one.
  await page.locator('#verify').click();
  await expect(page.locator('#phone-err')).toHaveText('That message came from a different WhatsApp number. Send it from the WhatsApp on +91 90000 77001.', { timeout: 15_000 });
  await expect(page.locator('#wa-open')).toHaveText('Open WhatsApp again');
  await shot(page, 'selfjoin-page-uat-wrong-number-phone');
  checks.push('verified');
  await expect(page.locator('#checked')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#phone-err')).toBeHidden();
  await page.locator('#next1').click();
  await page.locator('#next2').click();
  await expect(page.locator('#plan-err')).toHaveText('Pick a plan.');
  await page.locator('input[name=plan][value=plan-quarter]').check();
  await expect(page.locator('#total')).toHaveText('₹4,000');
  await expect(page.locator('#total-parts')).toHaveText('');
  await page.locator('#next2').click();
  // Under 18: the first box stays unticked; the page says to join at the desk with a parent. Nothing sent.
  await expect(page.locator('#step3')).toContainText('Under 18? Please join at the gym desk with a parent or guardian.');
  await page.locator('#health').check();
  await page.locator('#send').click();
  await expect(page.locator('#send-err')).toHaveText('To join online, you must be 18 or older. If you are under 18, please join at the gym desk with a parent or guardian.');
  expect(sent).toHaveLength(0);
  await shot(page, 'selfjoin-page-uat-under-18-phone');
  // Hindi follows on the error already shown.
  await page.locator('#lang').click();
  await expect(page.locator('#send-err')).toContainText('ऑनलाइन जॉइन करने के लिए उम्र 18 साल');
  await shot(page, 'selfjoin-page-uat-under-18-phone-hi');
});

test('R-513 page, phone: a reload half-way keeps the steps done; an open enquiry is linked', async ({ page }) => {
  const { sent } = await servePage(page, GYM, { sends: [[201, { ok: true, gymName: 'Shakti Gym', planName: 'Monthly', startsOn: '2026-11-14', totalP: 200000, linked: true }]] });
  await page.goto('https://app.mettleup.fit/m/QA0002');
  await aboutYou(page);
  await page.locator('#next1').click();
  await page.locator('input[name=plan][value=plan-month]').check();
  await page.reload();
  await expect(page.locator('#step2')).toBeVisible();
  await expect(page.locator('input[name=plan][value=plan-month]')).toBeChecked();
  await expect(page.locator('#total')).toHaveText('₹2,000');
  await shot(page, 'selfjoin-page-uat-reload-halfway-phone');
  await page.locator('#back2').click();
  await expect(page.locator('#name')).toHaveValue('Ravi Kumar');
  await expect(page.locator('#checked')).toBeVisible();
  await page.locator('#next1').click();
  await page.locator('#next2').click();
  await page.locator('#adult').check();
  await page.locator('#health').check();
  await page.locator('#send').click();
  await expect(page.locator('#done')).toBeVisible();
  await expect(page.locator('#done-plan')).toHaveText('Your plan: Monthly, starting 14 Nov 2026.');
  expect(sent).toHaveLength(1);
  // A reload after sending still says it was sent.
  await page.reload();
  await expect(page.locator('#done')).toBeVisible();
  await shot(page, 'selfjoin-page-uat-open-enquiry-sent-phone');
});

test('R-513 page, phone: already a member here, renew instead', async ({ page }) => {
  await servePage(page, GYM, { sends: [[409, { error: 'MEMBER' }]] });
  await page.goto('https://app.mettleup.fit/m/QA0002');
  await aboutYou(page, { name: 'Asha Verma', phone: '90000 77002' });
  await page.locator('#next1').click();
  await page.locator('input[name=plan][value=plan-month]').check();
  await page.locator('#next2').click();
  await page.locator('#adult').check();
  await page.locator('#health').check();
  await page.locator('#send').click();
  await expect(page.locator('#member')).toBeVisible();
  await expect(page.locator('#member')).toContainText('This number is already a member here. Renew instead?');
  await expect(page.locator('#member')).toContainText('Renew at the gym desk, or in the MettleUp app: Gym → "My gym" → "Renew my plan".');
  await shot(page, 'selfjoin-page-uat-already-member-phone');
  await page.locator('#lang').click();
  await expect(page.locator('#member h2')).toHaveText('यह नंबर पहले से यहाँ का मेंबर है। प्लान रिन्यू करना है?');
  await shot(page, 'selfjoin-page-uat-already-member-phone-hi');
  await page.locator('#lang').click();
  await page.locator('#other-number').click();
  await expect(page.locator('#step1')).toBeVisible();
  await expect(page.locator('#phone')).toHaveValue('');
  await expect(page.locator('#verify')).toBeVisible();
});

test('R-513 page, phone and computer: a paused gym, and a wrong code', async ({ page }) => {
  await servePage(page, { gymName: 'Shakti Gym', joinCode: 'QA0002', brand: {}, closed: true });
  await page.goto('https://app.mettleup.fit/m/QA0002');
  await expect(page.locator('#closed')).toBeVisible();
  await expect(page.locator('#closed-title')).toHaveText('Shakti Gym is not taking sign-ups online right now');
  await expect(page.locator('#form')).toBeHidden();
  await shot(page, 'selfjoin-page-uat-paused-gym-phone');
  await page.setViewportSize(SIZES.computer);
  await page.emulateMedia({ colorScheme: 'dark' });
  await shot(page, 'selfjoin-page-uat-paused-gym-computer-dark');

  const other = await page.context().newPage();
  await servePage(other, null);
  await other.goto('https://app.mettleup.fit/m/ZZZZ99');
  await expect(other.locator('#none')).toBeVisible();
  await expect(other.locator('#title')).toHaveText('This gym link does not work');
  await expect(other.locator('#form')).toBeHidden();
  await shot(other, 'selfjoin-page-uat-wrong-code-phone');
});

test('R-513 invite page /j/: "Become a member" opens the join page', async ({ page }) => {
  await servePage(page, { gymName: 'Shakti Gym', joinCode: 'QA0002', brand: {} });
  await page.goto('https://app.mettleup.fit/j/QA0002');
  await expect(page.locator('#become')).toHaveAttribute('href', '/m/QA0002');
  await expect(page.locator('#become-card')).toContainText('Not a member yet?');
  await page.locator('#become-card').scrollIntoViewIfNeeded();
  await shot(page, 'selfjoin-invite-page-become-member-phone');
});

// ---------------------------------------------------------------- the gym's side

function rosterIdOf(server, fullName) {
  const r = [...server.records.values()].find((x) => x.k === 'member' && !x.x && x.d.fullName === fullName);
  if (!r) throw new Error(`no member ${fullName}`);
  return r.id;
}

function planIdOf(server, name) {
  const r = [...server.records.values()].find((x) => x.k === 'plan' && !x.x && x.d.name === name);
  if (!r) throw new Error(`no plan ${name}`);
  return r.id;
}

/** What 0077 self_join_send writes (a new record version, like the server). `prior` = an open enquiry it joins. */
function personSendsTheForm(server, { id, name, phone, gender = 'female', prior = null }) {
  server.version += 1;
  const planId = planIdOf(server, 'Monthly');
  const block = {
    v: 1, name, gender, planId, planName: 'Monthly', durationUnit: 'month', durationCount: 1,
    priceP: 150000, joiningFeeP: 50000, totalP: 200000, startsOn: '2026-10-20', pay: 'desk', paid: false,
    phoneChecked: true, lang: 'en', consents: { adultAt: NOW.getTime(), healthAt: NOW.getTime(), wording: '2026-11-14' }, at: NOW.getTime(),
  };
  const d = prior
    ? { ...prior, selfJoin: block, followUpOn: TODAY, updatedAt: NOW.getTime() }
    : {
        id, gymId: server.gym.gymId, name, phone, interest: 'Joined online: Monthly, starts 20 Oct. Pays at the desk.', followUpOn: TODAY,
        status: 'open', memberId: null, source: null, selfJoin: block, createdAt: NOW.getTime(), updatedAt: NOW.getTime(),
      };
  server.records.set(`enquiry:${d.id}`, { k: 'enquiry', id: d.id, x: false, ver: server.version, d });
}

async function confirmSale(page) {
  const s = sheet(page, 'Sell membership');
  // Nothing typed in "Received now": the membership is saved with the whole amount still to pay.
  await s.getByRole('button', { name: 'Confirm' }).tap();
  await expect(s).toBeHidden({ timeout: 15_000 });
}

test.describe('the gym side', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('R-513 phone: "Joined online" on Today, then Make member -> Add member -> Sell membership, nothing collected', async ({ page }) => {
    const server = await openApp(page);
    await startOnlineGym(page);
    await addPlan(page, { name: 'Monthly', price: '1500', joining: '500', months: '1' });
    personSendsTheForm(server, { id: 'join-0a1b2c3d4e5f60718293a4b5c6d7e8f9', name: 'Neha Singh', phone: '+919000077005', gender: 'female' });
    await page.evaluate(() => {
      window.location.hash = '/';
    });
    await page.reload();
    const card = page.locator('#needs-online-joins');
    await expect(card).toContainText('Joined online', { timeout: 15_000 });
    await expect(card).toContainText('Neha Singh');
    await expect(card).toContainText('Monthly · starts 20 Oct 2026');
    await expect(card).toContainText('₹2,000 to pay at the desk · Not paid yet');
    await card.scrollIntoViewIfNeeded();
    await expectFitsPhone(page, 'on Today with Joined online');
    await shot(page, 'phone-selfjoin-panel-1-today-card');

    // Hinglish.
    await page.evaluate(() => localStorage.setItem('forgeai.lang.v1', 'hinglish'));
    await page.reload();
    await expect(card).toContainText('Online join kiya', { timeout: 15_000 });
    await expect(card).toContainText('Desk par ₹2,000 dene hain · Abhi pay nahi kiya');
    await card.scrollIntoViewIfNeeded();
    await shot(page, 'phone-selfjoin-panel-1b-today-card-hinglish');
    await page.evaluate(() => localStorage.setItem('forgeai.lang.v1', 'en'));
    await page.reload();

    await card.getByRole('button', { name: 'Make Neha Singh a member' }).tap({ timeout: 15_000 });
    const add = sheet(page, 'Add member');
    await expect(add.getByLabel('Full name')).toHaveValue('Neha Singh');
    await expect(add.getByLabel('Mobile number')).toHaveValue(/90000\s?77005/);
    await expect(add.getByLabel('Gender (optional)')).toHaveValue('female');
    await expectFitsPhone(page, 'in Add member from Joined online');
    await shot(page, 'phone-selfjoin-panel-2-add-member', false);
    await add.getByRole('button', { name: 'Add member' }).tap();

    const sellSheet = sheet(page, 'Sell membership');
    await expect(sellSheet).toBeVisible({ timeout: 15_000 });
    await expect(sellSheet.getByLabel('Plan')).toHaveValue(planIdOf(server, 'Monthly'));
    await expect(sellSheet.getByLabel('Starts on')).toHaveValue('2026-10-20');
    await expect(sellSheet.getByLabel('Received now')).toHaveValue('');
    await expectFitsPhone(page, 'in Sell membership from Joined online');
    await shot(page, 'phone-selfjoin-panel-3-sell-on-their-plan', false);
    await confirmSale(page);
    await expect(page.getByRole('heading', { name: 'Neha Singh', exact: true })).toBeVisible();
    await shot(page, 'phone-selfjoin-panel-4-member-page');

    // The request is done: the enquiry is joined and linked, and the card has gone.
    const joinId = 'enquiry:join-0a1b2c3d4e5f60718293a4b5c6d7e8f9';
    await expect.poll(() => server.records.get(joinId)?.d?.status, { timeout: 15_000 }).toBe('joined');
    expect(server.records.get(joinId)?.d?.memberId).toBe(rosterIdOf(server, 'Neha Singh'));
    const sold = [...server.records.values()].filter((r) => r.k === 'membership' && !r.x && r.d.memberId === rosterIdOf(server, 'Neha Singh'));
    expect(sold.map((r) => r.d.startsOn)).toEqual(['2026-10-20']);
    expect(sold[0].d.planId).toBe(planIdOf(server, 'Monthly'));
    await page.evaluate(() => {
      window.location.hash = '/';
    });
    await expect(page.locator('#needs-online-joins')).toBeAttached({ timeout: 15_000 });
    await expect(page.locator('#needs-online-joins')).not.toContainText('Joined online');
  });

  test('R-513 computer: a friend a member invited asks to join online; linked, made a member, the thank-you', async ({ page }) => {
    const server = await openApp(page);
    await startOnlineGym(page);
    await addPlan(page, { name: 'Monthly', price: '1500', joining: '500', months: '1' });
    await addMember(page, { name: 'Asha Verma', phone: '98290 11111' });
    await sell(page, { received: '1500' });
    // The owner's free days for a friend (Settings -> Member app, as in friend-uat), then Ravi's earlier
    // "bring a friend" enquiry.
    server.friendServer = true;
    await page.reload();
    await page.evaluate(() => {
      window.location.hash = '/settings/app';
    });
    const days = page.getByLabel('Free days for each friend who joins');
    await expect(days).toBeVisible({ timeout: 15_000 });
    await days.fill('7');
    await page.getByRole('button', { name: 'Save free days' }).tap();
    await expect.poll(() => server.records.get('gym:gym')?.d?.friendRewardDays, { timeout: 15_000 }).toBe(7);
    const prior = {
      id: 'friend-0a1b2c3d4e5f60718293a4b5c6d7e8f9', gymId: server.gym.gymId, name: 'Ravi Kumar', phone: '+919000077004',
      interest: 'Best time to train: Evening', followUpOn: TODAY, status: 'open', memberId: null, source: 'friend',
      referral: { by: 'Asha Verma', memberId: rosterIdOf(server, 'Asha Verma'), time: 'evening' }, createdAt: NOW.getTime(), updatedAt: NOW.getTime(),
    };
    personSendsTheForm(server, { prior, name: 'Ravi Kumar', phone: '+919000077004', gender: 'male' });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => localStorage.setItem('forgeai.theme.v1', 'light'));
    await page.evaluate(() => {
      window.location.hash = '/';
    });
    await page.reload();
    const card = page.locator('#needs-online-joins');
    await expect(card).toContainText('Ravi Kumar', { timeout: 15_000 });
    await card.scrollIntoViewIfNeeded();
    await shot(page, 'computer-selfjoin-panel-1-today-card-light');

    // Enquiries shows the same request on the friend's row, with the referral kept.
    await page.evaluate(() => {
      window.location.hash = '/enquiries';
    });
    const row = page.getByRole('main').locator('div').filter({ has: page.getByText('Ravi Kumar', { exact: true }) }).filter({ has: page.getByRole('button', { name: 'Make Ravi Kumar a member' }) }).last();
    await expect(row).toContainText('Referred by Asha Verma', { timeout: 15_000 });
    await expect(row).toContainText('Asked to join online: Monthly, from 20 Oct 2026, ₹2,000. Not paid yet.');
    await shot(page, 'computer-selfjoin-panel-2-enquiry-row-light');

    await page.evaluate(() => {
      window.location.hash = '/';
    });
    await card.getByRole('button', { name: 'Make Ravi Kumar a member' }).click({ timeout: 15_000 });
    const add = sheet(page, 'Add member');
    await expect(add.getByLabel('Full name')).toHaveValue('Ravi Kumar');
    await add.getByRole('button', { name: 'Add member' }).click();
    await expect(sheet(page, 'Sell membership')).toBeVisible({ timeout: 15_000 });
    await confirmSale(page);
    const thank = sheet(page, 'Thank Asha Verma');
    await expect(thank).toBeVisible({ timeout: 15_000 });
    await expect(thank).toContainText('Ravi Kumar joined. Asha Verma invited them from the MettleUp app.');
    await shot(page, 'computer-selfjoin-panel-3-thank-light', false);
    await thank.getByRole('button', { name: 'Not now' }).click();
    await expect(page.getByRole('heading', { name: 'Ravi Kumar', exact: true })).toBeVisible();
    await expect.poll(() => server.records.get(`enquiry:${prior.id}`)?.d?.status, { timeout: 15_000 }).toBe('joined');
    // One enquiry for Ravi, not two.
    expect([...server.records.values()].filter((r) => r.k === 'enquiry' && r.d.name === 'Ravi Kumar')).toHaveLength(1);
    await shot(page, 'computer-selfjoin-panel-4-member-page-light');
  });
});
