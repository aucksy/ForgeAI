// F79 Online payments (R-328, 4 Nov 2026), UAT on a phone (375 x 812) and a computer (1280 x 900). Every
// step taps the real screen; pictures go to e2e/.results/uat (CI uploads them as "dashboard-uat-pictures").
//
//  1. Settings -> Payments before the server part is live: the UPI ID line, "Online payments are not
//     switched on yet." and no connect buttons.
//  2. With the server on (test mode): the "Test mode" label, Razorpay's paste-keys form (the key field shows
//     only while typed), Test and connect -> "Connected with the key ending 3456." (no key comes back).
//  3. Collect payment for the ₹1,000 still due: "Show UPI QR for ₹1,000" -> the QR, "Pay ₹1,000 to <gym>",
//     the UPI ID, and "Paid by" switches to UPI.
//  4. "Make a payment link": the link's QR, "Test mode: no real money moves.", "Waiting for the payment…";
//     the company says paid -> the receipt is saved by itself for ₹1,000, with the company's payment id.
// The pretend MettleUp server for /api/pay is in this file (route); the real one is tested in
// deploy/panel/pay.test.mjs.
import { mkdirSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { OWNER, addMember, addPlan, expectFitsPhone, openApp, sell, sheet, startOnlineGym } from './support.mjs';

const DIR = 'e2e/.results/uat';
mkdirSync(DIR, { recursive: true });

async function shot(page, name, fullPage = true) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage });
}

const FIELDS = {
  razorpay: [
    { name: 'keyId', label: 'Key Id', secret: false, placeholder: 'rzp_test_…' },
    { name: 'keySecret', label: 'Key Secret', secret: true, placeholder: '' },
  ],
  cashfree: [
    { name: 'appId', label: 'App ID', secret: false, placeholder: '' },
    { name: 'secretKey', label: 'Secret Key', secret: true, placeholder: '' },
  ],
  // The real server offers all four (deploy/panel/payProviders.js PROVIDER_ORDER): the pictures show all four.
  payu: [
    { name: 'key', label: 'Merchant key', secret: false, placeholder: '' },
    { name: 'salt', label: 'Salt', secret: true, placeholder: '' },
  ],
  phonepe: [
    { name: 'clientId', label: 'Client ID', secret: false, placeholder: '' },
    { name: 'clientVersion', label: 'Client version', secret: false, placeholder: '1' },
    { name: 'clientSecret', label: 'Client secret', secret: true, placeholder: '' },
  ],
};

/** A pretend /api/pay that answers like deploy/panel/pay.js in test mode. */
async function payServer(page) {
  const state = { connected: null, request: null, paid: false, recorded: null, sent: [] };
  const conn = () =>
    state.connected
      ? { provider: 'razorpay', mode: 'test', testMode: true, via: 'keys', hint: '3456', on: true, offReason: '', connectedAt: '2026-11-04T10:00:00.000Z' }
      : null;
  const view = () => ({
    ...state.request,
    status: state.paid ? 'paid' : 'open',
    paidP: state.paid ? state.request.amountP : 0,
    method: state.paid ? 'upi' : null,
    paymentId: state.paid ? 'pay_TEST123' : null,
    paidAt: state.paid ? '2026-11-04T10:05:00.000Z' : null,
    recorded: Boolean(state.recorded),
    receiptNo: state.recorded,
  });
  await page.route('**/api/pay/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/pay/', '');
    const body = route.request().postDataJSON() ?? {};
    state.sent.push({ path, body });
    const json = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (path === 'desk') {
      return json({
        connectOn: true,
        testMode: true,
        canManage: true,
        providers: [
          { id: 'razorpay', name: 'Razorpay', fields: FIELDS.razorpay, oauth: false, connection: conn() },
          { id: 'cashfree', name: 'Cashfree', fields: FIELDS.cashfree, oauth: false, connection: null },
          { id: 'payu', name: 'PayU', fields: FIELDS.payu, oauth: false, connection: null },
          { id: 'phonepe', name: 'PhonePe', fields: FIELDS.phonepe, oauth: false, connection: null },
        ],
      });
    }
    if (path === 'connect') {
      state.connected = true;
      return json({ connection: conn() });
    }
    if (path === 'request') {
      state.request = {
        id: 'pr_0123456789abcdef0123',
        kind: 'fee',
        memberId: body.memberId,
        ref: body.ref,
        amountP: body.amountP,
        label: body.label,
        note: body.note,
        upiId: body.upiId,
        payee: body.payee,
        provider: 'razorpay',
        providerName: 'Razorpay',
        testMode: true,
        url: 'https://rzp.io/i/mettleuptest',
        failed: false,
        late: false,
        createdAt: '2026-11-04T10:00:00.000Z',
        expiresAt: null,
      };
      return json({ request: view() });
    }
    if (path === 'check') return json({ request: view() });
    if (path === 'claim') return json({ token: 'lease123', request: view() });
    if (path === 'recorded') {
      state.recorded = body.receiptNo || 'saved';
      return json({ request: view() });
    }
    if (path === 'paid') return json({ paid: [], shopPaid: [] });
    return json({ on: false, why: 'NOT_READY' });
  });
  return state;
}

for (const size of ['phone', 'computer']) {
  test.describe(`online payments on a ${size}`, () => {
    // The gym is set up at phone size (the shared helpers tap the phone's bottom bar); the computer run
    // then turns the window to 1280 x 900 and goes on by address, like a desk computer would.
    test.use({ viewport: { width: 375, height: 812 } });

    test(`F79 ${size}: Settings -> Payments, the UPI QR, a test-mode payment link and its receipt`, async ({ page }) => {
      const server = await openApp(page);
      await startOnlineGym(page);
      await addPlan(page, { name: 'Monthly', price: '1500', months: '1' });
      await addMember(page, { name: 'Asha Verma', phone: '98290 11111' });
      await sell(page, { received: '500' });
      const main = page.getByRole('main');
      if (size === 'computer') await page.setViewportSize({ width: 1280, height: 900 });
      const go = (path) => page.evaluate((p) => {
        window.location.hash = p;
      }, path);

      // The gym's UPI ID (Settings -> Gym details).
      await go('/settings');
      await expect(page.getByLabel('Gym UPI ID (optional)')).toBeVisible();
      await page.getByLabel('Gym UPI ID (optional)').fill('shaktigym@okhdfc');
      await page.getByRole('button', { name: 'Save details' }).tap();
      await expect(page.getByText('Saved.')).toBeVisible();

      // 1. Settings -> Payments, server part not live: says so, no connect buttons.
      await main.getByRole('button', { name: 'Open payments' }).tap();
      await expect(page.getByRole('heading', { name: 'Payments', exact: true })).toBeVisible();
      await expect(main).toContainText('Your UPI ID shaktigym@okhdfc is ready.');
      await expect(main.getByRole('status').filter({ hasText: 'Online payments are not switched on yet.' })).toBeVisible();
      await expect(main.getByRole('button', { name: 'Paste keys' })).toHaveCount(0);
      await expectFitsPhone(page, 'on Settings -> Payments (off)');
      await shot(page, `${size}-pay-1-settings-off`);

      // 2. Server on, test mode: connect Razorpay by pasting keys.
      const pay = await payServer(page);
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Payments', exact: true })).toBeVisible();
      await expect(main.getByText('Test mode', { exact: true }).first()).toBeVisible({ timeout: 15_000 });
      await expect(main).toContainText('Test mode: no real money moves. Use your test keys.');
      await expect(main).toContainText('MettleUp takes no fee.');
      const rzp = main.locator('div').filter({ has: page.getByText('Razorpay', { exact: true }) }).filter({ has: page.getByRole('button', { name: 'Paste keys' }) }).last();
      await rzp.getByRole('button', { name: 'Paste keys' }).tap();
      await page.getByLabel('Key Id').fill('rzp_test_FAKE00000003456');
      await page.getByLabel('Key Secret').fill('fakeSecretForTheTestOnly');
      await expect(main).toContainText('Shown only while you type. After you connect, only its last 4 letters show.');
      await shot(page, `${size}-pay-2-paste-keys`);
      await page.getByRole('button', { name: 'Test and connect' }).tap();
      await expect(main.getByText('Connected with the key ending 3456.')).toBeVisible();
      await expect(page.getByLabel('Key Secret')).toHaveCount(0);
      await expect(main).not.toContainText('fakeSecretForTheTestOnly');
      expect(pay.sent.find((s) => s.path === 'connect')?.body?.provider).toBe('razorpay');
      await expectFitsPhone(page, 'on Settings -> Payments (connected)');
      await shot(page, `${size}-pay-3-connected`);

      // 3. Collect payment for the ₹1,000 due: the UPI QR first.
      await go('/members');
      await main.getByRole('link', { name: /Asha Verma/ }).first().click();
      await expect(page.getByRole('heading', { name: 'Asha Verma', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Collect payment' }).tap();
      const c = sheet(page, 'Collect payment');
      await expect(c).toBeVisible();
      await c.getByRole('button', { name: 'Show UPI QR for ₹1,000' }).tap();
      await expect(c.getByRole('img', { name: 'UPI QR code to pay ₹1,000' })).toBeVisible();
      await expect(c).toContainText(`Pay ₹1,000 to ${OWNER.gym}`);
      await expect(c).toContainText('shaktigym@okhdfc');
      await expect(c).toContainText('Scan with any UPI app: Google Pay, PhonePe, Paytm or BHIM.');
      await expect(c.getByLabel('Paid by')).toHaveValue('upi');
      await expectFitsPhone(page, 'in Collect payment with the UPI QR');
      await shot(page, `${size}-pay-4-upi-qr`, false);

      // 4. A payment link (test mode); the company says paid; the receipt is saved by itself.
      await c.getByRole('button', { name: 'Hide QR' }).tap();
      await c.getByRole('button', { name: 'Make a payment link' }).tap();
      await expect(c.getByRole('img', { name: 'QR code of the payment link for ₹1,000' })).toBeVisible();
      await expect(c).toContainText('Test mode: no real money moves.');
      await expect(c.getByRole('status').filter({ hasText: 'Waiting for the payment…' })).toBeVisible();
      const asked = pay.sent.find((s) => s.path === 'request')?.body;
      expect(asked?.amountP).toBe(100000);
      expect(asked?.note).toMatch(/^Receipt /);
      await expectFitsPhone(page, 'in Collect payment with a payment link');
      await shot(page, `${size}-pay-5-link`, false);

      pay.paid = true;
      await page.clock.runFor(5000);
      await expect(c).toBeHidden({ timeout: 15_000 });
      await expect.poll(() => pay.recorded, { timeout: 15_000 }).toBeTruthy();
      const saved = [...server.records.values()].filter((r) => r.k === 'payment' && !r.x).map((r) => r.d);
      const online = saved.find((p) => p.reference === 'Razorpay pay_TEST123');
      expect(online?.amountP).toBe(100000);
      expect(online?.method).toBe('upi');
      expect(online?.note).toBe('Paid online (test mode)');
      await shot(page, `${size}-pay-6-receipt-saved`);
    });
  });
}
