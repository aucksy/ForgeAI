// T79 "Pay MettleUp" (6 Nov 2026), UAT of Settings -> Pay MettleUp and the free-trial line's link, on a phone
// (375 x 812) with one computer picture (1280 x 900). Every step taps the real screen; pictures go to
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
import { mkdirSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { expectFitsPhone, open, openApp, openSettings, startOnlineGym } from './support.mjs';

const DIR = 'e2e/.results/uat';
mkdirSync(DIR, { recursive: true });

async function shot(page, name, fullPage = true) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage });
}

const go = (page, path) =>
  page.evaluate((p) => {
    window.location.hash = p;
  }, path);

const FAKE = { upiId: 'test@upi', payeeName: 'Test Payee', accountName: 'Test Account', accountNumber: '000000000000', ifsc: 'TEST0000000', bankName: 'Test Bank' };

test.use({ viewport: { width: 375, height: 812 } });

test('T79: Pay MettleUp, not ready, not available, pay by UPI or bank, waiting, confirmed, not confirmed', async ({ page }) => {
  const server = await openApp(page);
  await startOnlineGym(page);
  const main = page.getByRole('main');
  const code = server.gym.joinCode;

  // 1. No 0060 on the server: the card is there; the screen says so; no QR code.
  await openSettings(page);
  const card = main.locator('div').filter({ has: page.getByText('Your MettleUp plan', { exact: true }) }).filter({ has: page.getByRole('button', { name: 'Pay MettleUp' }) }).last();
  await expect(card).toContainText('Pay for MettleUp by UPI or bank transfer');
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
  await expect(main.getByTestId('pay-amount')).toContainText('₹1,499');
  await main.getByRole('group', { name: 'Pay for' }).getByRole('button', { name: '1 year' }).tap();
  await expect(main.getByTestId('pay-amount')).toContainText('₹14,990');
  await main.getByRole('group', { name: 'Plan' }).getByRole('button', { name: 'Starter' }).tap();
  await expect(main.getByTestId('pay-amount')).toContainText('₹9,990');
  await main.getByRole('group', { name: 'Pay for' }).getByRole('button', { name: '1 month' }).tap();
  await expect(main.getByTestId('pay-amount')).toContainText('₹999');
  await expect(main.getByTestId('pay-qr').getByRole('img')).toHaveAttribute('aria-label', 'UPI QR code to pay ₹999 to MettleUp');
  await expect(main.getByTestId('pay-upi-link')).toHaveAttribute('href', `upi://pay?pa=test@upi&pn=Test%20Payee&am=999.00&cu=INR&tn=MettleUp%20${code}`);
  const bank = main.getByTestId('pay-bank');
  for (const v of ['Test Account', '000000000000', 'TEST0000000', 'Test Bank']) await expect(bank).toContainText(v);
  await expect(main).not.toContainText(/GST invoice/i);
  await expectFitsPhone(page, 'on Pay MettleUp with the QR code');
  await shot(page, 'phone-pay-3-qr-and-bank');

  // 4. I have paid.
  await expect(main.getByLabel('Amount paid')).toHaveValue('999');
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
  await expect(status).toContainText('₹999 for Starter, monthly, reference 123456789012');
  expect(server.mettlePayments[0]).toMatchObject({ plan: 'starter', billing: 'monthly', amountPaise: 99900, reference: '123456789012', method: 'upi' });
  await shot(page, 'phone-pay-5-waiting');
  // The same reference again.
  await main.getByLabel('Reference number (UTR)').fill('123456789012');
  await main.getByRole('button', { name: 'Send for confirmation' }).tap();
  await expect(main).toContainText('This reference number was already sent.');
  expect(server.mettlePayments).toHaveLength(1);

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
});
