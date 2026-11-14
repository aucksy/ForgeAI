// R-528 Pay online when joining (14 Nov 2026), UAT. Every step taps the real screen; pictures go to e2e/.results/uat
// (CI uploads them as "dashboard-uat-pictures").
//
// The person's side (public/join-online.html, phone 390 x 844), with /api/self-join and its pay-info / pay-check /
// pay-said answered here the way deploy/panel/joinPay.js answers (the real one is tested in joinPay.test.mjs):
//   online on (a payment company, test mode) -> "Pay now", the test-mode payment step, paid;
//   a payment that fails -> said plainly, then "Pay at the desk instead";
//   a gym with only a UPI ID -> the UPI app link and "I have paid";
//   online off (the switch off, no account, or before the server part is live) -> pay at the desk, as before;
//   online chosen but the payment could not start -> pay at the desk.
// The gym's side (phone 390): Today's "Joined online" with "Paid online" and one-tap Approve (member + plan + receipt),
// a UPI payment to check in the bank, a failed one ("Not paid"); Settings -> Payments, the owner's two switches on,
// off, and greyed with no payment account.
import { mkdirSync, readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { NOW, TODAY, addPlan, expectFitsPhone, openApp, startOnlineGym } from './support.mjs';

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
  plans: [{ id: 'plan-month', name: 'Monthly', durationUnit: 'month', durationCount: 1, priceP: 150000, joiningFeeP: 50000, totalP: 200000 }],
};
const PAY_ID = 'pr_0123456789abcdef0123';

function linkPay(o = {}) {
  return {
    id: PAY_ID, how: 'link', amountP: 200000, label: 'Joining Shakti Gym: Monthly', payee: 'Shakti Gym', upiId: null,
    url: 'https://rzp.io/i/mettleupjointest', providerName: 'Razorpay', testMode: true, status: 'open', failed: false, paidP: 0, said: false, ...o,
  };
}
function upiPay(o = {}) {
  return {
    id: PAY_ID, how: 'upi', amountP: 200000, label: 'Joining Shakti Gym: Monthly', payee: 'Shakti Gym', upiId: 'shaktigym@okhdfc',
    url: null, providerName: null, testMode: false, status: 'open', failed: false, paidP: 0, said: false, ...o,
  };
}

/**
 * app.mettleup.fit/m/<code> as the Worker serves it. `info`: /api/self-join/pay-info's answer (null = an older server
 * with no such route: 404). `pay`: the payment /api/self-join starts (null + `payWhy` = it could not). `state.pay` is
 * what pay-check answers; a test changes it to say the company was paid, or that it failed.
 */
async function servePage(page, { info = null, pay = null, payWhy = '' } = {}) {
  const state = { sent: [], checks: 0, said: 0, pay };
  let polls = 0;
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  // The payment company's own page (opened in a new tab): never the real one.
  await page.context().route('https://rzp.io/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<p>Test payment page</p>' }));
  await page.route(/^https:\/\/app\.mettleup\.fit\//, async (route) => {
    const url = new URL(route.request().url());
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/api/phone-code/inbound/start') {
      polls = 0;
      return json(200, { ok: true, id: '0b7c6f0e-1111-4222-8333-944455556666', code: '123456', waNumber: '919000000000', waText: 'MettleUp code 123456.', expiresAt: Date.now() + 600000 });
    }
    if (url.pathname === '/api/phone-code/inbound/status') {
      polls += 1;
      return polls > 1 ? json(200, { ok: true, state: 'verified', proof: PROOF, expiresAt: Date.now() + 15 * 60000 }) : json(200, { ok: true, state: 'waiting', expiresAt: Date.now() + 600000 });
    }
    if (url.pathname === '/api/self-join') {
      const b = route.request().postDataJSON();
      state.sent.push(b);
      const body = { ok: true, gymName: 'Shakti Gym', planName: 'Monthly', startsOn: '2026-11-20', totalP: 200000, linked: false };
      if (b.pay === 'online') {
        if (state.pay) body.pay = state.pay;
        else body.payWhy = payWhy || 'TRY_AGAIN';
      }
      return json(201, body);
    }
    if (url.pathname === '/api/self-join/pay-info') return info ? json(200, info) : json(404, { error: 'NOT_FOUND' });
    if (url.pathname === '/api/self-join/pay-check') {
      state.checks += 1;
      return json(200, { pay: state.pay });
    }
    if (url.pathname === '/api/self-join/pay-said') {
      state.said += 1;
      state.pay = { ...state.pay, said: true };
      return json(200, { pay: state.pay });
    }
    if (/^\/m\/[A-Za-z0-9]{6}$/.test(url.pathname)) {
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: readFileSync(new URL('join-online.html', PUB)) });
    }
    if (url.pathname === '/privacy') return route.fulfill({ status: 200, contentType: 'text/html', body: '<p>Privacy</p>' });
    return route.fulfill({ status: 404, body: 'Not found' });
  });
  await page.addInitScript((g) => {
    window.__GYM__ = g;
  }, GYM);
  return state;
}

/** Steps 1 and 2 done (checked number, the Monthly plan from 20 Nov), on step 3 with both boxes ticked. */
async function toStep3(page) {
  await page.goto('https://app.mettleup.fit/m/QA0002');
  await expect(page.locator('#title')).toHaveText('Shakti Gym');
  await page.locator('#name').fill('Ravi Kumar');
  await page.locator('#phone').fill('90000 77001');
  await page.locator('#verify').click();
  await expect(page.locator('#checked')).toBeVisible({ timeout: 15_000 });
  await page.locator('#next1').click();
  await page.locator('input[name=plan][value=plan-month]').check();
  await page.locator('#start').fill('2026-11-20');
  await page.locator('#next2').click();
  await expect(page.locator('#step3')).toBeVisible();
  await page.locator('#adult').check();
  await page.locator('#health').check();
}

test.describe('the person pays on the join page', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('R-528 page: online on (test mode) -> Pay now, the payment step, paid', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const server = await servePage(page, { info: { online: true, how: 'link', testMode: true }, pay: linkPay() });
    await page.goto('https://app.mettleup.fit/m/QA0002');
    await expect(page.locator('#sub')).toHaveText('Join in 3 short steps. Pay online or at the gym desk.');
    await toStep3(page);
    await expect(page.locator('#to-pay')).toHaveText('To pay');
    await expect(page.locator('#pay-online-opt')).toBeVisible();
    await expect(page.locator('input[name=pay][value=online]')).toBeChecked();
    await expect(page.locator('#pay-online-words')).toHaveText('Pay now (UPI or card)');
    await expect(page.locator('#pay-note')).toHaveText('You send your details first. Then you pay Shakti Gym on the next screen. The money goes straight to the gym.');
    await expect(page.locator('#pay-test')).toHaveText('Test mode: this gym is trying out online payments. No real money moves.');
    await expect(page.locator('#send')).toHaveText('Send and pay');
    await noSideways(page);
    await shot(page, 'joinpay-page-1-online-on-phone');

    await page.locator('#send').click();
    expect(server.sent[0].pay).toBe('online');
    await expect(page.locator('#paybox')).toBeVisible();
    await expect(page.locator('#done-pay')).toHaveText('Now pay ₹2,000. The money goes straight to Shakti Gym.');
    await expect(page.locator('#paybox-test')).toBeVisible();
    await expect(page.locator('#pay-open')).toHaveText('Pay ₹2,000 now');
    await expect(page.locator('#pay-open')).toHaveAttribute('href', 'https://rzp.io/i/mettleupjointest');
    await expect(page.locator('#pay-said')).toBeHidden();
    await expect(page.locator('#done-close')).toBeHidden();
    await noSideways(page);
    await shot(page, 'joinpay-page-2-test-mode-payment-step-phone');

    // They pay on the company's page (a new tab), come back: the page has asked and says paid.
    const popup = page.waitForEvent('popup');
    await page.locator('#pay-open').click();
    await (await popup).close();
    await expect(page.locator('#pay-wait')).toBeVisible();
    server.pay = linkPay({ status: 'paid', paidP: 200000, url: null });
    await expect(page.locator('#done-pay')).toHaveText('Paid ₹2,000. Shakti Gym will approve your request soon, and then you are a member.', { timeout: 15_000 });
    await expect(page.locator('#paybox')).toBeHidden();
    await expect(page.locator('#done-close')).toBeVisible();
    await shot(page, 'joinpay-page-3-paid-phone');
    // A reload still says paid; Hindi too.
    await page.reload();
    await expect(page.locator('#done-pay')).toContainText('Paid ₹2,000.');
    await page.locator('#lang').click();
    await expect(page.locator('#done-pay')).toHaveText('₹2,000 मिल गए। Shakti Gym जल्द ही आपकी रिक्वेस्ट मंज़ूर करेगा, फिर आप मेंबर बन जाएँगे।');
    await shot(page, 'joinpay-page-3b-paid-phone-hi');
    expect(errors).toEqual([]);
  });

  test('R-528 page: a payment that fails, then Pay at the desk instead', async ({ page }) => {
    const server = await servePage(page, { info: { online: true, how: 'link', testMode: true }, pay: linkPay() });
    await toStep3(page);
    await page.locator('#send').click();
    await expect(page.locator('#paybox')).toBeVisible();
    const popup = page.waitForEvent('popup');
    await page.locator('#pay-open').click();
    await (await popup).close();
    server.pay = linkPay({ failed: true });
    await expect(page.locator('#pay-err')).toHaveText('The payment did not go through. If money was taken, it comes back to you. Try again, or pay at the desk.', { timeout: 15_000 });
    // Still open: they can try again.
    await expect(page.locator('#pay-open')).toBeVisible();
    await noSideways(page);
    await shot(page, 'joinpay-page-4-failed-phone');

    await page.locator('#pay-desk').click();
    await expect(page.locator('#paybox')).toBeHidden();
    await expect(page.locator('#done-pay')).toHaveText('Pay ₹2,000 at the gym desk on your first visit. The gym then makes you a member.');
    await expect(page.locator('#done-pay')).not.toHaveClass(/paid/);
    await shot(page, 'joinpay-page-5-desk-after-failed-phone');
    // The page stops asking once they chose the desk.
    const asked = server.checks;
    await page.waitForTimeout(6000);
    expect(server.checks).toBe(asked);
  });

  test('R-528 page: a gym with only a UPI ID -> the UPI app link, then "I have paid"', async ({ page }) => {
    const server = await servePage(page, { info: { online: true, how: 'upi', testMode: false }, pay: upiPay() });
    await toStep3(page);
    await expect(page.locator('#pay-online-words')).toHaveText('Pay now by UPI');
    await expect(page.locator('#pay-test')).toBeHidden();
    await page.locator('#send').click();
    await expect(page.locator('#paybox')).toBeVisible();
    await expect(page.locator('#pay-open')).toHaveText('Pay ₹2,000 in a UPI app');
    await expect(page.locator('#pay-open')).toHaveAttribute('href', 'upi://pay?pa=shaktigym@okhdfc&pn=Shakti%20Gym&am=2000.00&cu=INR&tn=Joining%20Shakti%20Gym%20Monthly');
    await expect(page.locator('#pay-upi')).toHaveText('Or pay to the UPI ID shaktigym@okhdfc from any UPI app.');
    await expect(page.locator('#paybox-test')).toBeHidden();
    await noSideways(page);
    await shot(page, 'joinpay-page-6-upi-phone');
    await page.locator('#pay-said').click();
    await expect(page.locator('#done-pay')).toHaveText('Thank you. Shakti Gym checks the payment in its bank, then makes you a member.');
    expect(server.said).toBe(1);
    await expect(page.locator('#paybox')).toBeHidden();
    await shot(page, 'joinpay-page-7-upi-said-phone');
  });

  test('R-528 page: online off -> pay at the desk as before; chosen desk; a payment that could not start', async ({ page }) => {
    // Off (the owner's switch, no account, or the server part not live yet): exactly the desk page.
    const server = await servePage(page, { info: { online: false } });
    await toStep3(page);
    await expect(page.locator('#sub')).toHaveText('Join in 3 short steps. You pay at the gym desk.');
    await expect(page.locator('#pay-online-opt')).toBeHidden();
    await expect(page.locator('input[name=pay][value=desk]')).toBeChecked();
    await expect(page.locator('#pay-note')).toHaveText('You pay when you come to the gym. Nothing is paid on this page.');
    await expect(page.locator('#send')).toHaveText('Send to the gym');
    await expect(page.locator('#summary')).toContainText('To pay at the desk');
    await shot(page, 'joinpay-page-8-desk-only-phone');
    await page.locator('#send').click();
    expect(server.sent[0].pay).toBe('desk');
    await expect(page.locator('#done-pay')).toHaveText('Pay ₹2,000 at the gym desk on your first visit. The gym then makes you a member.');

    // Online on, but they pick the desk.
    const p2 = await page.context().newPage();
    const s2 = await servePage(p2, { info: { online: true, how: 'link', testMode: true }, pay: linkPay() });
    await p2.setViewportSize({ width: 390, height: 844 });
    await toStep3(p2);
    await p2.locator('input[name=pay][value=desk]').check();
    await expect(p2.locator('#send')).toHaveText('Send to the gym');
    await expect(p2.locator('#pay-test')).toBeHidden();
    await shot(p2, 'joinpay-page-9-chose-desk-phone');
    await p2.locator('#send').click();
    expect(s2.sent[0].pay).toBe('desk');
    await expect(p2.locator('#paybox')).toBeHidden();
    await expect(p2.locator('#done-pay')).toContainText('at the gym desk');

    // Online chosen, but the payment could not start: pay at the desk, said plainly.
    const p3 = await page.context().newPage();
    await servePage(p3, { info: { online: true, how: 'link', testMode: true }, pay: null, payWhy: 'LINK_FAILED' });
    await p3.setViewportSize({ width: 390, height: 844 });
    await toStep3(p3);
    await p3.locator('#send').click();
    await expect(p3.locator('#done-pay')).toHaveText('Online payment is not working right now. Pay ₹2,000 at the gym desk on your first visit.');
    await expect(p3.locator('#paybox')).toBeHidden();
    await shot(p3, 'joinpay-page-10-could-not-start-phone');
  });

  test('R-528 page: before the server part is live (no pay-info) it is the desk page', async ({ page }) => {
    const server = await servePage(page, { info: null });
    await toStep3(page);
    await expect(page.locator('#pay-online-opt')).toBeHidden();
    await page.locator('#send').click();
    expect(server.sent[0].pay).toBe('desk');
    await expect(page.locator('#done')).toBeVisible();
  });
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

/** What 0077/0081 self_join_send writes (the block always says 'desk': the payment itself is kept by the panel). */
function personSendsTheForm(server, { id, name, phone, gender = 'female' }) {
  server.version += 1;
  const block = {
    v: 1, name, gender, planId: planIdOf(server, 'Monthly'), planName: 'Monthly', durationUnit: 'month', durationCount: 1,
    priceP: 150000, joiningFeeP: 50000, totalP: 200000, startsOn: '2026-10-20', pay: 'desk', paid: false,
    phoneChecked: true, lang: 'en', consents: { adultAt: NOW.getTime(), healthAt: NOW.getTime(), wording: '2026-11-14' }, at: NOW.getTime(),
  };
  const d = {
    id, gymId: server.gym.gymId, name, phone, interest: 'Joined online: Monthly, starts 20 Oct.', followUpOn: TODAY,
    status: 'open', memberId: null, source: null, selfJoin: block, createdAt: NOW.getTime(), updatedAt: NOW.getTime(),
  };
  server.records.set(`enquiry:${d.id}`, { k: 'enquiry', id: d.id, x: false, ver: server.version, d });
}

const FIELDS = [
  { name: 'keyId', label: 'Key Id', secret: false, placeholder: '' },
  { name: 'keySecret', label: 'Key Secret', secret: true, placeholder: '' },
];

/** A pretend /api/pay (deploy/panel/pay.js in test mode) with the owner's switches and the join payments. */
async function payServer(page, { connected = true, switches = { ready: true, app: true, web: true }, joins = [], paid = [], paidOnCancel = [], refunded = [] } = {}) {
  // paidOnCancel: ids the company finds paid when the desk closes them (Make member); refunded: ids it says were
  // refunded when asked just before Approve (review round 2, R-542).
  const state = { switches, joins, paid, sent: [], recorded: [], cancelled: [] };
  await page.route('**/api/pay/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/pay/', '');
    const body = route.request().postDataJSON() ?? {};
    state.sent.push({ path, body });
    const json = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    const conn = connected
      ? { provider: 'razorpay', mode: 'test', testMode: true, via: 'keys', hint: '3456', on: true, offReason: '', connectedAt: '2026-10-17T04:00:00.000Z' }
      : null;
    if (path === 'desk') {
      return json({
        connectOn: true,
        testMode: true,
        canManage: true,
        providers: [{ id: 'razorpay', name: 'Razorpay', fields: FIELDS, oauth: false, connection: conn }],
        ...(state.switches ? { switches: state.switches } : {}),
      });
    }
    if (path === 'switches') {
      state.switches = { ready: true, app: typeof body.app === 'boolean' ? body.app : state.switches.app, web: typeof body.web === 'boolean' ? body.web : state.switches.web };
      return json({ switches: state.switches });
    }
    if (path === 'joins') return json({ joins: state.joins });
    const row = state.joins.find((j) => j.id === body.id);
    if (path === 'check') return json(body.beforeApprove ? { request: row, refunded: refunded.includes(body.id) } : { request: row });
    if (path === 'cancel') {
      state.cancelled.push(body.id);
      if (row && row.status === 'open') Object.assign(row, paidOnCancel.includes(body.id) ? { status: 'paid', paidP: row.amountP, method: 'upi', paymentId: 'pay_JUSTNOW' } : { status: 'cancelled' });
      return json({ request: row });
    }
    if (path === 'claim') return json({ token: 'lease-join', request: row });
    if (path === 'recorded') {
      state.recorded.push(body);
      if (row) Object.assign(row, { recorded: true, receiptNo: body.receiptNo, status: 'paid' });
      return json({ request: row });
    }
    if (path === 'paid') return json({ paid: state.paid.filter((r) => !r.recorded), shopPaid: [] });
    return json({ on: false, why: 'NOT_READY' });
  });
  return state;
}

function joinRow(o) {
  return {
    kind: 'join', memberId: null, amountP: 200000, label: 'Joining: Monthly', note: '', upiId: null, payee: 'Iron Temple Fitness',
    provider: 'razorpay', providerName: 'Razorpay', testMode: true, url: null, status: 'open', failed: false, paidP: 0, method: null,
    paymentId: null, paidAt: null, late: false, receiptNo: null, recorded: false, createdAt: '2026-10-17T04:00:00.000Z', expiresAt: null, said: false, ...o,
  };
}

test.describe('the gym side', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('R-528 phone: "Paid online" on Today, one tap Approve -> member, plan and receipt', async ({ page }) => {
    const server = await openApp(page);
    await startOnlineGym(page);
    await addPlan(page, { name: 'Monthly', price: '1500', joining: '500', months: '1' });
    const eid = 'join-0a1b2c3d4e5f60718293a4b5c6d7e8f9';
    personSendsTheForm(server, { id: eid, name: 'Neha Singh', phone: '+919000077005' });
    // A LIVE payment (real money): only a live payment ever becomes a receipt (payment sweep R-542).
    const pay = await payServer(page, {
      joins: [joinRow({ id: 'pr_aaaaaaaaaaaaaaaaaaaa', ref: eid, status: 'paid', paidP: 200000, method: 'upi', paymentId: 'pay_TEST777', paidAt: '2026-10-17T04:30:00.000Z', testMode: false })],
    });
    await page.evaluate(() => {
      window.location.hash = '/';
    });
    await page.reload();
    const card = page.locator('#needs-online-joins');
    await expect(card).toContainText('Neha Singh', { timeout: 15_000 });
    await expect(card).toContainText('₹2,000 paid online', { timeout: 15_000 });
    await expect(card).not.toContainText('test mode');
    await expect(card).toContainText('Approve makes them a member, with their plan and receipt.');
    await expect(card.getByRole('button', { name: 'Make Neha Singh a member' })).toHaveCount(0);
    await card.scrollIntoViewIfNeeded();
    await expectFitsPhone(page, 'on Today with a paid online join');
    await shot(page, 'phone-joinpay-panel-1-today-paid');

    await card.getByRole('button', { name: 'Approve Neha Singh' }).tap();
    await expect(page.getByRole('heading', { name: 'Neha Singh', exact: true })).toBeVisible({ timeout: 15_000 });
    await shot(page, 'phone-joinpay-panel-2-approved-member-page');
    const memberId = rosterIdOf(server, 'Neha Singh');
    await expect.poll(() => server.records.get(`enquiry:${eid}`)?.d?.status, { timeout: 15_000 }).toBe('joined');
    expect(server.records.get(`enquiry:${eid}`)?.d?.memberId).toBe(memberId);
    const sold = [...server.records.values()].filter((r) => r.k === 'membership' && !r.x && r.d.memberId === memberId);
    expect(sold.map((r) => r.d.startsOn)).toEqual(['2026-10-20']);
    const paid = [...server.records.values()].filter((r) => r.k === 'payment' && !r.x && r.d.memberId === memberId).map((r) => r.d);
    expect(paid).toHaveLength(1);
    expect(paid[0].amountP).toBe(200000);
    expect(paid[0].reference).toBe('Razorpay pay_TEST777');
    expect(pay.recorded).toHaveLength(1);
    expect(pay.recorded[0].token).toBe('lease-join');
    await page.evaluate(() => {
      window.location.hash = '/';
    });
    await expect(page.locator('#needs-online-joins')).toBeAttached({ timeout: 15_000 });
    await expect(page.locator('#needs-online-joins')).not.toContainText('Neha Singh');
  });

  test('R-528 phone: a UPI payment to check in the bank, and a failed one stays "Not paid"', async ({ page }) => {
    const server = await openApp(page);
    await startOnlineGym(page);
    await addPlan(page, { name: 'Monthly', price: '1500', joining: '500', months: '1' });
    const upiId = 'join-1a1b2c3d4e5f60718293a4b5c6d7e8f9';
    const failedId = 'join-2a1b2c3d4e5f60718293a4b5c6d7e8f9';
    personSendsTheForm(server, { id: upiId, name: 'Kavya Rao', phone: '+919000077006' });
    personSendsTheForm(server, { id: failedId, name: 'Arjun Mehta', phone: '+919000077007', gender: 'male' });
    const pay = await payServer(page, {
      joins: [
        joinRow({ id: 'pr_bbbbbbbbbbbbbbbbbbbb', ref: upiId, provider: null, providerName: null, testMode: false, upiId: 'irontemple@okhdfc', said: true }),
        joinRow({ id: 'pr_cccccccccccccccccccc', ref: failedId, failed: true, url: 'https://rzp.io/i/x' }),
      ],
    });
    await page.evaluate(() => {
      window.location.hash = '/';
    });
    await page.reload();
    const card = page.locator('#needs-online-joins');
    await expect(card).toContainText('₹2,000 paid by UPI, they say · Check your bank before approving', { timeout: 15_000 });
    await expect(card).toContainText('₹2,000 · The online payment did not go through · Not paid');
    await expect(card.getByRole('button', { name: 'Approve Kavya Rao' })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Make Arjun Mehta a member' })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Approve Arjun Mehta' })).toHaveCount(0);
    await card.scrollIntoViewIfNeeded();
    await expectFitsPhone(page, 'on Today with a UPI payment and a failed one');
    await shot(page, 'phone-joinpay-panel-3-upi-check-and-failed');

    // Hinglish.
    await page.evaluate(() => localStorage.setItem('forgeai.lang.v1', 'hinglish'));
    await page.reload();
    await expect(card).toContainText('Approve se pehle apna bank check karo', { timeout: 15_000 });
    await card.scrollIntoViewIfNeeded();
    await shot(page, 'phone-joinpay-panel-3b-hinglish');
    await page.evaluate(() => localStorage.setItem('forgeai.lang.v1', 'en'));
    await page.reload();

    // Payment sweep (R-542, matrix D-02): "I have paid" is only their word. Approve asks first; "Cancel" saves nothing.
    const asked = [];
    const answer = (yes) => (d) => {
      asked.push(d.message());
      void (yes ? d.accept() : d.dismiss());
    };
    page.once('dialog', answer(false));
    await card.getByRole('button', { name: 'Approve Kavya Rao' }).tap({ timeout: 15_000 });
    await expect.poll(() => asked.length, { timeout: 15_000 }).toBe(1);
    expect(asked[0]).toBe('Can you see ₹2,000 from Kavya Rao in your bank or UPI app? Approve saves it as paid.');
    await page.waitForTimeout(500);
    expect(pay.recorded).toHaveLength(0);
    expect([...server.records.values()].some((r) => r.k === 'member' && !r.x && r.d.fullName === 'Kavya Rao')).toBe(false);
    await expect(card).toContainText('Kavya Rao');

    // Approve after checking the bank: the receipt is the UPI payment, and the server is told it was paid by UPI.
    page.once('dialog', answer(true));
    await card.getByRole('button', { name: 'Approve Kavya Rao' }).tap({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Kavya Rao', exact: true })).toBeVisible({ timeout: 15_000 });
    expect(pay.recorded[0]).toMatchObject({ id: 'pr_bbbbbbbbbbbbbbbbbbbb', method: 'upi', amountP: 200000 });
    // The failed one was never made a member.
    expect([...server.records.values()].some((r) => r.k === 'member' && !r.x && r.d.fullName === 'Arjun Mehta')).toBe(false);
    expect(server.records.get(`enquiry:${failedId}`)?.d?.status).toBe('open');
  });

  // Payment sweep (R-542, matrix D-01 and D-05). A test card (or the test page's "Success" button) is not money, and a
  // join payment nobody approved must never sit unseen.
  test('R-542 phone: a TEST-mode payment approved -> member and plan, nothing saved as paid; a paid join nobody approved is shown', async ({ page }) => {
    const server = await openApp(page);
    await startOnlineGym(page);
    await addPlan(page, { name: 'Monthly', price: '1500', joining: '500', months: '1' });
    const eid = 'join-3a1b2c3d4e5f60718293a4b5c6d7e8f9';
    personSendsTheForm(server, { id: eid, name: 'Rohan Das', phone: '+919000077008', gender: 'male' });
    const pay = await payServer(page, {
      joins: [joinRow({ id: 'pr_dddddddddddddddddddd', ref: eid, status: 'paid', paidP: 200000, method: 'card', paymentId: 'pay_TESTCARD', paidAt: '2026-10-17T04:30:00.000Z' })],
      paid: [
        joinRow({ id: 'pr_eeeeeeeeeeeeeeeeeeee', ref: 'join-9999999999999999999999999999999f', status: 'paid', paidP: 150000, method: 'upi', paymentId: 'pay_LIVE1', paidAt: '2026-10-17T04:30:00.000Z', testMode: false }),
      ],
    });
    await page.evaluate(() => {
      window.location.hash = '/';
    });
    await page.reload();
    const card = page.locator('#needs-online-joins');
    await expect(card).toContainText('₹2,000 paid in test mode · No real money came in · Collect it at the desk', { timeout: 15_000 });
    await expect(card).toContainText('Approve makes them a member with their plan. Nothing is saved as paid.');
    // The payment nobody approved (its request was closed another way): the gym holds ₹1,500 with no receipt.
    const stuck = page.locator('div').filter({ hasText: 'Paid online, receipt not made' }).filter({ hasText: 'I saved it' }).last();
    await expect(stuck).toContainText('A member paid ₹1,500 online', { timeout: 15_000 });
    await expect(stuck).toContainText('They paid on your join page, but were made a member without Approve. They may have paid twice: check, and refund one if so. If not, save this payment on their member page.');
    await expect(stuck).toContainText('Razorpay pay_LIVE1');
    await card.scrollIntoViewIfNeeded();
    await expectFitsPhone(page, 'on Today with a test-mode join payment');
    await shot(page, 'phone-joinpay-panel-4-test-mode-and-unapproved');

    await card.getByRole('button', { name: 'Approve Rohan Das' }).tap();
    await expect(page.getByRole('heading', { name: 'Rohan Das', exact: true })).toBeVisible({ timeout: 15_000 });
    const memberId = rosterIdOf(server, 'Rohan Das');
    const sold = [...server.records.values()].filter((r) => r.k === 'membership' && !r.x && r.d.memberId === memberId);
    expect(sold).toHaveLength(1);
    const paidRows = [...server.records.values()].filter((r) => r.k === 'payment' && !r.x && r.d.memberId === memberId);
    expect(paidRows, 'a test payment never becomes a receipt').toHaveLength(0);
    expect(pay.recorded).toHaveLength(1);
    expect(pay.recorded[0]).toMatchObject({ id: 'pr_dddddddddddddddddddd', receiptNo: '' });
    await shot(page, 'phone-joinpay-panel-5-test-mode-approved-nothing-paid');
  });

  test('R-542 round 2 phone: Make member closes the open online payment first; one paid a moment ago says Approve; one refunded is never saved', async ({ page }) => {
    const server = await openApp(page);
    await startOnlineGym(page);
    await addPlan(page, { name: 'Monthly', price: '1500', joining: '500', months: '1' });
    const e1 = 'join-4a1b2c3d4e5f60718293a4b5c6d7e8f9'; // Sameer: started paying online, then pays at the desk
    const e2 = 'join-5a1b2c3d4e5f60718293a4b5c6d7e8f9'; // Pooja: paid online a moment ago; Today has not seen it yet
    const e3 = 'join-6a1b2c3d4e5f60718293a4b5c6d7e8f9'; // Imran: paid, then refunded before Approve
    personSendsTheForm(server, { id: e1, name: 'Sameer Khan', phone: '+919000077011' });
    personSendsTheForm(server, { id: e2, name: 'Pooja Iyer', phone: '+919000077012' });
    personSendsTheForm(server, { id: e3, name: 'Imran Ali', phone: '+919000077013' });
    const pay = await payServer(page, {
      joins: [
        joinRow({ id: 'pr_ffffffffffffffffff01', ref: e1, testMode: false }),
        joinRow({ id: 'pr_ffffffffffffffffff02', ref: e2, testMode: false }),
        joinRow({ id: 'pr_ffffffffffffffffff03', ref: e3, status: 'paid', paidP: 200000, method: 'upi', paymentId: 'pay_REFUNDED', paidAt: '2026-10-17T04:30:00.000Z', testMode: false }),
      ],
      paidOnCancel: ['pr_ffffffffffffffffff02'],
      refunded: ['pr_ffffffffffffffffff03'],
    });
    await page.evaluate(() => {
      window.location.hash = '/';
    });
    await page.reload();
    const card = page.locator('#needs-online-joins');
    await expect(card).toContainText('Imran Ali', { timeout: 15_000 });

    // Pooja: Make member closes her open payment first; the company says she has just paid -> Approve, no form.
    await card.getByRole('button', { name: 'Make Pooja Iyer a member' }).tap({ timeout: 15_000 });
    await expect(card).toContainText('Pooja Iyer has just paid online. Tap Approve instead.', { timeout: 15_000 });
    expect(pay.cancelled).toEqual(['pr_ffffffffffffffffff02']);
    await expect(card.getByRole('button', { name: 'Approve Pooja Iyer' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByLabel('Full name')).toHaveCount(0);
    await card.scrollIntoViewIfNeeded();
    await expectFitsPhone(page, 'on Today after a payment found while making a member');
    await shot(page, 'phone-joinpay-panel-6-paid-while-making-member');

    // Imran: Approve asks the company once more; refunded -> nothing saved, no member, no receipt.
    await card.getByRole('button', { name: 'Approve Imran Ali' }).tap();
    await expect(card).toContainText('This online payment was refunded, so nothing was saved. Ask them how they will pay.', { timeout: 15_000 });
    expect(pay.sent.some((s) => s.path === 'check' && s.body.beforeApprove === true && s.body.id === 'pr_ffffffffffffffffff03')).toBe(true);
    expect(pay.recorded).toHaveLength(0);
    expect(pay.sent.some((s) => s.path === 'claim')).toBe(false);
    expect([...server.records.values()].filter((r) => r.k === 'member' && !r.x && r.d.fullName === 'Imran Ali')).toHaveLength(0);
    await shot(page, 'phone-joinpay-panel-7-refunded-before-approve');

    // Sameer: his open payment is closed (at the company too), then the usual Add member form opens.
    await card.getByRole('button', { name: 'Make Sameer Khan a member' }).tap();
    await expect(page.getByLabel('Full name')).toHaveValue('Sameer Khan', { timeout: 15_000 });
    expect(pay.cancelled).toEqual(['pr_ffffffffffffffffff02', 'pr_ffffffffffffffffff01']);
  });

  test('R-528 phone: Settings -> Payments, the two switches on, off, and greyed with no payment account', async ({ page }) => {
    await openApp(page);
    await startOnlineGym(page);
    const main = page.getByRole('main');
    const go = (path) => page.evaluate((p) => {
      window.location.hash = p;
    }, path);
    const app = main.getByRole('checkbox', { name: /^Take payments in the member app/ });
    const web = main.getByRole('checkbox', { name: /^Take payments when people join online/ });

    // No payment account (no UPI ID, nothing connected): both off and greyed, with the reason.
    const off = await payServer(page, { connected: false });
    await go('/settings/payments');
    await expect(main).toContainText('Where members can pay online', { timeout: 15_000 });
    await expect(app).not.toBeChecked();
    await expect(app).toBeDisabled();
    await expect(web).toBeDisabled();
    await expect(main.getByRole('status').filter({ hasText: 'Add your UPI ID or connect a payment company first.' })).toBeVisible();
    await main.getByText('Where members can pay online').scrollIntoViewIfNeeded();
    await expectFitsPhone(page, 'on Settings -> Payments with no account');
    await shot(page, 'phone-joinpay-switches-1-no-account');
    expect(off.sent.some((s) => s.path === 'switches')).toBe(false);
    await page.unroute('**/api/pay/**');

    // Connected: both on by default; the owner turns each off, then the web one on again.
    const on = await payServer(page, { connected: true });
    await page.reload();
    await expect(app).toBeChecked({ timeout: 15_000 });
    await expect(web).toBeChecked();
    await expect(app).toBeEnabled();
    await main.getByText('Where members can pay online').scrollIntoViewIfNeeded();
    await shot(page, 'phone-joinpay-switches-2-on');
    await app.uncheck();
    await expect(app).not.toBeChecked();
    await web.uncheck();
    await expect(web).not.toBeChecked();
    expect(on.switches).toEqual({ ready: true, app: false, web: false });
    expect(on.sent.filter((s) => s.path === 'switches').map((s) => [s.body.app, s.body.web])).toEqual([[false, undefined], [undefined, false]]);
    await main.getByText('Where members can pay online').scrollIntoViewIfNeeded();
    await shot(page, 'phone-joinpay-switches-3-off');
    await web.check();
    await expect(web).toBeChecked();
    await page.unroute('**/api/pay/**');

    // Before the server part is live: greyed, said plainly.
    await payServer(page, { connected: true, switches: { ready: false, app: true, web: true } });
    await page.reload();
    await expect(main.getByRole('status').filter({ hasText: 'These switches are not switched on yet.' })).toBeVisible({ timeout: 15_000 });
    await expect(app).toBeDisabled();
    await main.getByText('Where members can pay online').scrollIntoViewIfNeeded();
    await shot(page, 'phone-joinpay-switches-4-not-ready');
  });
});
