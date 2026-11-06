// T79 "Pay MettleUp", HQ's side (6 Nov 2026): HQ -> Payments, driven like a person on a phone (390 x 844) with
// computer pictures (1280 x 900). The HQ page is the real one (apps/hq/public, served as files); only its
// Worker (/api/*) is pretend, answering the way deploy/hq/api.js answers with ONLY 0060 on the gym server
// and online buying switched off (no var BILLING): "Online payments to check" is not ready, so its card must
// not show. Every name, reference and payment detail is an obviously fake test value.
//
//  1. Needs you: "2 payments to confirm" (and nothing about online payments to check).
//  2. Payments: both waiting payments, with plan, amount, method, reference and what Confirm will set;
//     a wrong amount shows the real price next to it. No "Online payments to check" card.
//  3. Confirm (asks first): the gym's plan and paid-until move on, the list empties of it, the Confirmed list
//     says "paid until", the gym's page says the new plan.
//  4. Not confirmed with no reason: refused in words, nothing sent. With a reason: the Not confirmed list
//     shows it. Confirming it again: refused ("already confirmed or not confirmed").
//  5. Your payment details: the (fake) saved details, never real ones.
import { mkdirSync, readFileSync } from 'node:fs';
import { extname } from 'node:path';

import { expect, test } from '@playwright/test';

const DIR = 'e2e/.results/uat';
mkdirSync(DIR, { recursive: true });
const HQ = 'http://hq.test';
const PUBLIC = new URL('../../hq/public/', import.meta.url);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };

// 17 Oct 2026, 15:30 India time (the admin app journeys' day).
const NOW = new Date('2026-10-17T10:00:00Z');
const GYM_ID = '11111111-2222-4333-8444-555555555555';
const PAY_UPI = '22222222-3333-4444-8555-666666666666';
const PAY_BANK = '33333333-4444-4555-8666-777777777777';
const FAKE_DETAILS = { upiId: 'test@upi', payeeName: 'Test Payee', accountName: 'Test Account', accountNumber: '000000000000', ifsc: 'TEST0000000', bankName: 'Test Bank' };
// What 0060's _mettleup_extend gives on 17 Oct 2026 with no paid-until: 1 month / 12 months on, end of the India day.
const MONTH_ON = '2026-11-17T18:29:59.000Z';
const YEAR_ON = '2027-10-17T18:29:59.000Z';

async function shot(page, name, fullPage = true) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage });
}

async function computerShot(page, name) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await shot(page, name);
  await page.setViewportSize({ width: 390, height: 844 });
}

/** HQ's Worker as it answers with only 0060 live and online buying off. */
class FakeHq {
  constructor() {
    this.gym = {
      gymId: GYM_ID, name: 'Test Fitness', joinCode: 'TEST01', status: 'active', createdAt: '2026-10-10T05:00:00Z',
      trialStartsAt: '2026-10-10T05:00:00Z', trialEndsAt: '2027-01-10T18:29:59Z', plan: null, billing: null, paidUntil: null,
      membersRegister: 40, membersApp: 12, checkins7: 30, checkins30: 90, moneyThisMonthP: 4500000, moneyLastMonthP: 0,
      receiptsCancelledThisMonth: 0, orders30: 0, staff: 2, liveDevices: 2, failedSignins24h: 0, lastDeskActivity: '2026-10-17T09:00:00Z',
      owners: [{ staffId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', name: 'Test Owner', phone: '9000000000' }],
      deleteRequest: null, supportUntil: null, supportOpenedBy: null, recentHq: [],
    };
    const base = { gymId: GYM_ID, gymName: 'Test Fitness', gymCode: 'TEST01', gymPlan: null, gymBilling: null, gymPaidUntil: null, decidedAt: null, rejectReason: null, paidUntil: null };
    this.payments = [
      { ...base, id: PAY_UPI, plan: 'pro', billing: 'monthly', pricePaise: 149900, amountPaise: 149900, reference: '123456789012', method: 'upi', status: 'pending', reportedAt: '2026-10-16T06:00:00Z', extendsTo: MONTH_ON },
      { ...base, id: PAY_BANK, plan: 'starter', billing: 'yearly', pricePaise: 999000, amountPaise: 500000, reference: 'UTRBANK000000000001', method: 'bank', status: 'pending', reportedAt: '2026-10-17T04:00:00Z', extendsTo: YEAR_ON },
    ];
    this.calls = [];
  }

  answer(method, path, q, body) {
    this.calls.push(`${method} ${path}`);
    const pending = () => this.payments.filter((p) => p.status === 'pending').length;
    if (path === '/api/me') return [200, { email: 'hq@test.example' }];
    if (path === '/api/needs') return [200, { leadsNew: 0, feedbackNew: 0, helpNeedsReply: 0, gymsNew: 0, paymentsWaiting: pending(), paymentsToCheck: null }];
    if (path === '/api/payments' && method === 'GET') {
      const status = ['pending', 'confirmed', 'rejected', 'all'].includes(q.get('status')) ? q.get('status') : 'pending';
      const rows = this.payments.filter((p) => status === 'all' || p.status === status).map((p) => ({ ...p, gymPlan: this.gym.plan, gymBilling: this.gym.billing, gymPaidUntil: this.gym.paidUntil }));
      return [200, { status, rows }];
    }
    // Switched off (no var BILLING): the Worker answers this without asking the database.
    if (path === '/api/billing-checks') return [503, { error: 'CHECKS_NOT_READY' }];
    if (path === '/api/pay-details' && method === 'GET') return [200, { details: FAKE_DETAILS, updatedAt: '2026-11-06T06:00:00Z' }];
    if (path === '/api/payments/confirm' || path === '/api/payments/reject') {
      const p = this.payments.find((x) => x.id === body.paymentId);
      if (!p) return [404, { error: 'GONE' }];
      if (p.status !== 'pending') return [409, { error: 'NOT_PENDING' }];
      if (path.endsWith('reject')) {
        if (String(body.reason || '').trim().length < 3) return [400, { error: 'NEED_REASON' }];
        Object.assign(p, { status: 'rejected', decidedAt: NOW.toISOString(), rejectReason: String(body.reason).trim(), extendsTo: null });
        return [200, p];
      }
      Object.assign(p, { status: 'confirmed', decidedAt: NOW.toISOString(), paidUntil: p.extendsTo, extendsTo: null });
      Object.assign(this.gym, { plan: p.plan, billing: p.billing, paidUntil: p.paidUntil });
      this.gym.recentHq = [{ at: NOW.toISOString(), action: 'confirm_payment', reason: null }];
      return [200, p];
    }
    if (path === '/api/gym') return [200, { gym: { ...this.gym }, aiLimit: null, aiDays: [], normalAiLimit: 50, plansReady: true }];
    if (path === '/api/gyms') return [200, { gyms: [{ ...this.gym }], groups: [] }];
    return [404, { error: 'NOT_FOUND' }];
  }

  async attach(page) {
    await page.route(`${HQ}/**`, async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.startsWith('/api/')) {
        let body = {};
        try {
          body = route.request().postDataJSON() ?? {};
        } catch {
          body = {};
        }
        const [status, json] = this.answer(route.request().method(), url.pathname, url.searchParams, body);
        await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) });
        return;
      }
      const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      if (!/^[a-z0-9./_-]+$/i.test(file) || file.includes('..')) {
        await route.fulfill({ status: 404, body: '' });
        return;
      }
      try {
        const data = readFileSync(new URL(file, PUBLIC));
        await route.fulfill({ status: 200, contentType: TYPES[extname(file)] ?? 'application/octet-stream', body: data });
      } catch {
        await route.fulfill({ status: 404, body: '' });
      }
    });
  }
}

test.use({ serviceWorkers: 'block' });

test('T79 HQ: payments waiting, confirm (plan + paid until move on), not confirmed with a reason, refusals', async ({ page }) => {
  const hq = new FakeHq();
  await hq.attach(page);
  const asked = [];
  page.on('dialog', (d) => {
    asked.push(d.message());
    void d.accept();
  });
  await page.clock.install({ time: NOW });
  const main = page.locator('#main');

  // 1. Needs you.
  await page.goto(`${HQ}/#needs`);
  await expect(page.getByRole('heading', { name: 'Needs you' })).toBeVisible();
  await expect(main).toContainText('2 payments to confirm');
  await expect(main).not.toContainText('online payment');
  await expect(page.locator('#needs-badge')).toHaveText('2');
  await shot(page, 'hq-pay-1-needs-you');

  // 2. Payments: the waiting list.
  await main.getByRole('link', { name: '2 payments to confirm' }).click();
  await expect(page.getByRole('heading', { name: 'Payments', exact: true })).toBeVisible();
  const cards = main.locator('.card').filter({ hasText: 'Test Fitness' });
  await expect(cards).toHaveCount(2);
  const upi = cards.filter({ hasText: '123456789012' });
  const bank = cards.filter({ hasText: 'UTRBANK000000000001' });
  await expect(upi).toContainText('Pro, monthly · ₹1,499 by UPI · reference 123456789012 · sent 16 Oct 2026');
  await expect(upi).toContainText('Confirm sets Pro, monthly, paid until 17 Nov 2026.');
  await expect(bank).toContainText('Starter, yearly · ₹5,000 by bank transfer (the price is ₹9,990) · reference UTRBANK000000000001 · sent 17 Oct 2026');
  await expect(bank).toContainText('Confirm sets Starter, yearly, paid until 17 Oct 2027.');
  // Online buying is off: its card does not show at all.
  await expect(main).not.toContainText('Online payments to check');
  await expect(main).not.toContainText('0064');
  await expect(main.getByRole('heading', { name: 'Your payment details' })).toBeVisible();
  await expect(main.getByLabel('UPI ID')).toHaveValue('test@upi');
  await expect(main.getByLabel('Account number')).toHaveValue('000000000000');
  await expect(main.getByLabel('IFSC')).toHaveValue('TEST0000000');
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width, 'nothing wider than the phone').toBeLessThanOrEqual(390);
  await shot(page, 'hq-pay-2-waiting');
  await computerShot(page, 'computer-hq-pay-2-waiting');

  // 3. Confirm the UPI one.
  await upi.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(cards).toHaveCount(1);
  expect(asked.at(-1)).toBe('Confirm sets Pro, monthly, paid until 17 Nov 2026. Only confirm when the money is in the bank. Go ahead?');
  expect(hq.gym).toMatchObject({ plan: 'pro', billing: 'monthly', paidUntil: MONTH_ON });
  await main.getByLabel('Show').first().selectOption('confirmed');
  await expect(main.locator('.card').filter({ hasText: '123456789012' })).toContainText('Confirmed 17 Oct 2026: paid until 17 Nov 2026.');
  await shot(page, 'hq-pay-3-confirmed');
  // The gym's own page shows the new plan.
  await main.locator('.card').filter({ hasText: '123456789012' }).getByRole('link', { name: 'Open gym' }).click();
  await expect(page.getByRole('heading', { name: 'Test Fitness' })).toBeVisible();
  await expect(main).toContainText('Plan: Pro, monthly, paid until 17 Nov 2026.');
  await shot(page, 'hq-pay-4-gym-plan');

  // 4. Not confirmed: first with no reason (refused), then with one.
  await page.goto(`${HQ}/#payments`);
  const left = main.locator('.card').filter({ hasText: 'UTRBANK000000000001' });
  await expect(left).toHaveCount(1);
  const before = hq.calls.filter((c) => c === 'POST /api/payments/reject').length;
  await left.getByRole('button', { name: 'Not confirmed' }).click();
  await expect(left).toContainText('Write a reason (at least a few words).');
  expect(hq.payments.find((p) => p.id === PAY_BANK).status).toBe('pending');
  expect(hq.calls.filter((c) => c === 'POST /api/payments/reject').length).toBe(before + 1);
  await shot(page, 'hq-pay-5-reason-needed', false);
  await left.getByPlaceholder(/Why not/).fill('Only ₹5,000 arrived; Starter yearly is ₹9,990');
  await left.getByRole('button', { name: 'Not confirmed' }).click();
  await expect(main).toContainText('No payments waiting.');
  expect(asked.at(-1)).toBe('Tell the gym owner this payment is not confirmed, with your reason?');
  expect(hq.gym).toMatchObject({ plan: 'pro', billing: 'monthly', paidUntil: MONTH_ON });
  await main.getByLabel('Show').first().selectOption('rejected');
  await expect(main.locator('.card').filter({ hasText: 'UTRBANK000000000001' })).toContainText('Not confirmed 17 Oct 2026. Reason: Only ₹5,000 arrived; Starter yearly is ₹9,990');
  await shot(page, 'hq-pay-6-not-confirmed');
  await computerShot(page, 'computer-hq-pay-6-not-confirmed');

  // A second tab still showing it as waiting: Confirm is refused, nothing changes.
  const stale = await page.evaluate(async (id) => {
    const r = await fetch('/api/payments/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paymentId: id }) });
    return { status: r.status, body: await r.json() };
  }, PAY_BANK);
  expect(stale).toEqual({ status: 409, body: { error: 'NOT_PENDING' } });
  expect(hq.payments.find((p) => p.id === PAY_BANK).status).toBe('rejected');

  // Online buying is off: the page never asked for anything of it beyond the one "not ready" answer.
  expect(hq.calls.filter((c) => c.includes('/api/billing-checks/done'))).toEqual([]);
});
