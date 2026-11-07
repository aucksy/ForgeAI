// T79 "Pay MettleUp" (6 Nov 2026), UAT of Settings -> Pay MettleUp and the free-trial line's link, on a phone
// (390 x 844, the config's phone) with computer pictures (1280 x 900) of the main steps. Every step taps the real screen; pictures go to
// e2e/.results/uat (CI uploads them as "dashboard-uat-pictures"). The gym's server is the pretend one
// (support.mjs); every payment detail is an obviously fake test value.
//
//  1. A server without 0060 (the live server today): the Settings card is there, the screen says plainly that
//     paying here is not ready, and shows no QR code.
//  2. With 0060 but no payment details saved: "Payment is not available yet", no QR code, no form.
//  3. With (fake) details: the price follows the plan and the period; the QR code and "Pay with a UPI app"
//     carry the exact amount and "MettleUp <gym code>"; the bank details show.
//  4. "I have paid": an empty and a wrong reference are refused in words; a good one is sent; the screen says
//     "Waiting for confirmation"; the same reference again is refused.
//  5. Confirmed (paid until a date) and not confirmed (with the reason) as the owner reads them.
//  6. The free-trial line on Today links to Pay MettleUp; the desk cannot open it.
//  7. First deploy (live server: 0060 only): nothing switched off (0061-0064: online buying, receipts, plan
//     gate, lapse banners) shows or asks the server; the line before paying says the paid time starts the
//     day MettleUp confirms it (0060), never "when the free trial ends" (0063).
// Prices are read from packages/theme/src/plans.ts (the one list), never typed here.
import { mkdirSync, readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { DESK, addDeskPerson, expectFitsPhone, open, openApp, openSettings, secondPhone, signIn, startOnlineGym } from './support.mjs';

const DIR = 'e2e/.results/uat';
mkdirSync(DIR, { recursive: true });

async function shot(page, name, fullPage = true) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage });
}

/** The same screen on a computer (1280 x 900), then back to the phone. */
async function computerShot(page, name) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await shot(page, name);
  await page.setViewportSize({ width: 390, height: 844 });
}

// The one price list (plans.ts), read as text: "starter: { monthly: 999, yearly: 9_990 }".
const PLANS_TS = readFileSync(new URL('../../../packages/theme/src/plans.ts', import.meta.url), 'utf8');
function planPrice(plan, billing) {
  const m = new RegExp(`\\b${plan}:\\s*\\{\\s*monthly:\\s*([\\d_]+),\\s*yearly:\\s*([\\d_]+)`).exec(PLANS_TS);
  if (!m) throw new Error(`no ${plan} price in plans.ts`);
  return Number((billing === 'yearly' ? m[2] : m[1]).replace(/_/g, ''));
}
const inr = (rupees) => `₹${rupees.toLocaleString('en-IN')}`;
const PRICE = {
  proMonth: planPrice('pro', 'monthly'),
  proYear: planPrice('pro', 'yearly'),
  starterMonth: planPrice('starter', 'monthly'),
  starterYear: planPrice('starter', 'yearly'),
};

// Server functions of 0061-0064 (NOT live): the deployed build must never ask for them.
const NOT_LIVE_FNS = ['owner_billing', 'owner_receipt', 'owner_gym_state', 'gym_has_feature', 'gym_state', 'phone_code_has_account', 'staff_reset_pin_with_proof'];

const go = (page, path) =>
  page.evaluate((p) => {
    window.location.hash = p;
  }, path);

const FAKE = { upiId: 'test@upi', payeeName: 'Test Payee', accountName: 'Test Account', accountNumber: '000000000000', ifsc: 'TEST0000000', bankName: 'Test Bank' };

test('T79: Pay MettleUp, not ready, not available, pay by UPI or bank, waiting, confirmed, not confirmed', async ({ page }) => {
  const server = await openApp(page);
  await startOnlineGym(page);
  const main = page.getByRole('main');
  const code = server.gym.joinCode;

  // 1. No 0060 on the server: the card is there; the screen says so; no QR code.
  await openSettings(page);
  const card = main.locator('div').filter({ has: page.getByText('Your MettleUp plan', { exact: true }) }).filter({ has: page.getByRole('button', { name: 'Pay MettleUp' }) }).last();
  await expect(card).toContainText('Pay for MettleUp by UPI or bank transfer');
  await card.scrollIntoViewIfNeeded();
  await shot(page, 'phone-pay-0-settings-card', false);
  await card.getByRole('button', { name: 'Pay MettleUp' }).tap();
  await expect(page.getByRole('heading', { name: 'Pay MettleUp', exact: true })).toBeVisible();
  await expect(main.getByTestId('pay-not-ready')).toContainText('Paying MettleUp here is not ready yet');
  await expect(main.getByTestId('pay-qr')).toHaveCount(0);
  await expectFitsPhone(page, 'on Pay MettleUp, not ready');
  await shot(page, 'phone-pay-1-not-ready');

  // 2. 0060, no details saved yet.
  server.payServer = true;
  await page.reload();
  await go(page, '/settings/mettleup');
  await expect(main.getByTestId('pay-not-available')).toContainText('Payment is not available yet');
  await expect(main.getByTestId('pay-plan-now')).toContainText('You are on the free trial until 17 Jan 2027. You can pay now or later.');
  await expect(main.getByTestId('pay-qr')).toHaveCount(0);
  await expect(main.getByRole('button', { name: 'Send for confirmation' })).toHaveCount(0);
  await shot(page, 'phone-pay-2-not-available');

  // 3. Fake details saved: the price, the QR code, the UPI app link and the bank details.
  server.payTo = FAKE;
  await page.reload();
  await go(page, '/settings/mettleup');
  await expect(main.getByTestId('pay-amount')).toContainText(inr(PRICE.proMonth));
  // 0063 is live (7 Nov 2026): a payment during the free trial keeps every free day.
  await expect(main.getByTestId('pay-trial-start')).toHaveText(
    'Your paid plan starts when your free trial ends on 17 Jan 2027 and runs until 17 Feb 2027.',
  );
  await expect(main).not.toContainText('starts on the day MettleUp confirms');
  await expect(main.getByTestId('pay-online')).toHaveCount(0);
  await expect(main.getByTestId('pay-receipts')).toHaveCount(0);
  await main.getByRole('group', { name: 'Pay for' }).getByRole('button', { name: '1 year' }).tap();
  await expect(main.getByTestId('pay-amount')).toContainText(inr(PRICE.proYear));
  await expect(main.getByTestId('pay-trial-start')).toHaveText('Your paid plan starts when your free trial ends on 17 Jan 2027 and runs until 17 Jan 2028.');
  await main.getByRole('group', { name: 'Plan' }).getByRole('button', { name: 'Starter' }).tap();
  await expect(main.getByTestId('pay-amount')).toContainText(inr(PRICE.starterYear));
  await main.getByRole('group', { name: 'Pay for' }).getByRole('button', { name: '1 month' }).tap();
  await expect(main.getByTestId('pay-amount')).toContainText(inr(PRICE.starterMonth));
  await expect(main.getByText(`2. Pay ${inr(PRICE.starterMonth)}`, { exact: true })).toBeVisible();
  await expect(main.getByTestId('pay-qr').getByRole('img')).toHaveAttribute('aria-label', `UPI QR code to pay ${inr(PRICE.starterMonth)} to MettleUp`);
  await expect(main.getByTestId('pay-upi-link')).toHaveAttribute('href', `upi://pay?pa=test@upi&pn=Test%20Payee&am=${PRICE.starterMonth}.00&cu=INR&tn=MettleUp%20${code}`);
  const bank = main.getByTestId('pay-bank');
  for (const v of ['Test Account', '000000000000', 'TEST0000000', 'Test Bank']) await expect(bank).toContainText(v);
  await expect(main).not.toContainText(/GST invoice/i);
  await expectFitsPhone(page, 'on Pay MettleUp with the QR code');
  await expect(main).toContainText(`In the payment note, write your gym code ${code} so we know it is you.`);
  await shot(page, 'phone-pay-3-qr-and-bank');
  await computerShot(page, 'computer-pay-3-qr-and-bank');

  // 4. I have paid.
  await expect(main.getByLabel('Amount paid')).toHaveValue(String(PRICE.starterMonth));
  await main.getByRole('button', { name: 'Send for confirmation' }).tap();
  await expect(main).toContainText('Type the UPI reference number (UTR) from your UPI app.');
  await main.getByLabel('Reference number (UTR)').fill('12#4');
  await main.getByRole('button', { name: 'Send for confirmation' }).tap();
  await expect(main).toContainText('A reference number has only letters and numbers.');
  await shot(page, 'phone-pay-4-wrong-reference', false);
  expect(server.mettlePayments).toHaveLength(0);
  await main.getByLabel('Reference number (UTR)').fill('1234 5678 9012');
  await main.getByRole('button', { name: 'Send for confirmation' }).tap();
  await expect(page.getByText('Sent. MettleUp will check the payment and confirm it here.')).toBeVisible();
  const status = main.getByTestId('pay-status').first();
  await expect(status).toContainText('Waiting for confirmation');
  await expect(status).toBeInViewport();
  await expect(status).toContainText(`${inr(PRICE.starterMonth)} for Starter, monthly, reference 123456789012`);
  expect(server.mettlePayments[0]).toMatchObject({ plan: 'starter', billing: 'monthly', amountPaise: PRICE.starterMonth * 100, reference: '123456789012', method: 'upi' });
  await shot(page, 'phone-pay-5-waiting');
  await computerShot(page, 'computer-pay-5-waiting');
  // The same reference again.
  await main.getByLabel('Reference number (UTR)').fill('123456789012');
  await main.getByRole('button', { name: 'Send for confirmation' }).tap();
  await expect(main).toContainText('This reference number was already sent.');
  expect(server.mettlePayments).toHaveLength(1);
  await shot(page, 'phone-pay-5b-double-report', false);

  // 5. Confirmed and not confirmed, as HQ would leave them.
  server.mettlePayments[0] = { ...server.mettlePayments[0], status: 'confirmed', decidedAt: '2026-10-18T05:00:00Z', paidUntil: '2026-11-17T18:29:59Z' };
  server.mettlePayments.unshift({ ...server.mettlePayments[0], id: 'pay-2', reference: 'UTRBANK000000000001', method: 'bank', status: 'rejected', paidUntil: null, rejectReason: 'No payment with this reference arrived' });
  await page.reload();
  await go(page, '/settings/mettleup');
  await expect(main.getByTestId('pay-status').nth(0)).toContainText('Not confirmed');
  await expect(main.getByTestId('pay-status').nth(0)).toContainText('Reason: No payment with this reference arrived.');
  await expect(main.getByTestId('pay-status').nth(1)).toContainText('Confirmed: paid until 17 Nov 2026');
  await expectFitsPhone(page, 'on Pay MettleUp with payments');
  await shot(page, 'phone-pay-6-confirmed-and-not');
  await page.setViewportSize({ width: 1280, height: 900 });
  await shot(page, 'computer-pay-6-confirmed-and-not');
  await page.setViewportSize({ width: 375, height: 812 });

  // 6. The free-trial line links here.
  server.hqTrial = { startsAt: '2026-10-01T04:30:00Z', endsAt: '2026-10-24T04:30:00Z', plan: null, billing: null, paidUntil: null };
  await open(page, 'Members');
  await open(page, 'Today');
  const payLink = main.getByRole('link', { name: 'Pay MettleUp' });
  await expect(payLink).toBeVisible();
  await expect(main.getByRole('link', { name: 'See prices' })).toBeVisible();
  await shot(page, 'phone-pay-7-trial-line', false);
  await payLink.tap();
  await expect(page.getByRole('heading', { name: 'Pay MettleUp', exact: true })).toBeVisible();

  // 7. Switched off: a receipt address shows nothing of 0063, and no 0061-0064 function was ever asked for.
  await go(page, '/settings/mettleup/receipt/MU-2026-0001');
  await expect(page.getByRole('heading', { name: 'Pay MettleUp', exact: true })).toBeVisible();
  await expect(main).not.toContainText(/receipt/i);
  await expect(main.getByTestId('renew-reminder')).toHaveCount(0);
  const asked = server.calls.filter((c) => NOT_LIVE_FNS.some((fn) => c === fn || c.startsWith(`${fn} `)));
  expect(asked, 'the build must not ask the live server for a 0061-0064 function').toEqual([]);
});

test('T79: the front desk has no way into Pay MettleUp', async ({ page, browser }) => {
  const server = await openApp(page);
  await startOnlineGym(page);
  server.payServer = true;
  server.payTo = FAKE;
  await addDeskPerson(page);
  const desk = await secondPhone(browser, server);
  await signIn(desk, DESK.phone);
  const main = desk.getByRole('main');
  const before = server.calls.filter((c) => c.startsWith('owner_pay_mettleup')).length;
  // No card on the desk's Settings.
  await openSettings(desk);
  await expect(main.getByRole('button', { name: 'Pay MettleUp' })).toHaveCount(0);
  await expect(main.getByText('Your MettleUp plan', { exact: true })).toHaveCount(0);
  // Typing the address: the owner-only page, no QR code, no bank details, no form.
  await go(desk, '/settings/mettleup');
  await expect(main).toContainText('Only an owner can see this');
  await expect(main.getByTestId('pay-qr')).toHaveCount(0);
  await expect(main.getByTestId('pay-bank')).toHaveCount(0);
  await expect(main.getByRole('button', { name: 'Send for confirmation' })).toHaveCount(0);
  await expect(main).not.toContainText('test@upi');
  await expectFitsPhone(desk, 'desk on the Pay MettleUp address');
  await shot(desk, 'phone-pay-8-desk-blocked', false);
  expect(server.calls.filter((c) => c.startsWith('owner_pay_mettleup')).length, 'the desk never asks for the payment details').toBe(before);
  await desk.context().close();
});
