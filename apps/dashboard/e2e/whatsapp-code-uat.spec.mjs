// F187 sign-in codes by WhatsApp (R-383, 6 Nov 2026), UAT on a phone (375 x 812) and a computer (1280 x 900).
// Every step taps the real screen; pictures go to e2e/.results/uat (CI uploads them as "dashboard-uat-pictures").
// The MettleUp Worker's /api/phone-code/* is FAKED here (no WhatsApp message is ever sent; deploy/panel/
// phoneCode.test.mjs tests the real one), and so is the gym server (support.mjs FakeServer + 0061's
// staff_reset_pin_with_proof). Fake numbers only (+91 90000 0000x).
//
// 1. Switched off (no token yet, the default): Sign in and Set up a new gym look and work exactly as before.
// 2. Forgot PIN: the WhatsApp button, a bad number, the same answer for a number with no account, "wait N
//    seconds", a wrong code, an easy PIN, then the right code -> new PIN -> signed in on Today.
// 3. Set up a new gym: "Get code on WhatsApp", the code box, a wrong code, the server refusing the check once
//    (ask again), then the right code -> the gym is made with the proof.
import { mkdirSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { closeGymReady, expectFitsPhone, fillNewPin, open, openApp, sheet, startOnlineGym } from './support.mjs';

const DIR = 'e2e/.results/uat';
mkdirSync(DIR, { recursive: true });

const OWNER_PHONE = '90000 00001';
const OWNER_TEN = '9000000001';
const NOBODY_TEN = '9000000009';
const RIGHT = '135790';
// auth/signin.ts FORGOT_PIN_WORDS: the words Sign in has shown since UAT 1 Nov 2026.
const FORGOT_PIN_WORDS =
  'Forgot your PIN? Ask your gym owner for a sign-in code. If you are the owner and no other phone or computer is signed in, email contact@mettleup.fit for help.';

async function shot(page, name) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: true });
}

/**
 * A pretend MettleUp Worker. `on` = the WhatsApp code is switched on. Real numbers in `accounts` "get" the
 * code RIGHT; every other number gets the same answer and no message. Records every call.
 */
async function fakeWorker(page, { on = true, accounts = [] } = {}) {
  const w = { on, accounts: new Set(accounts), sends: [], whatsApps: [], verifies: [], tooSoonOnce: false, tries: new Map() };
  await page.route('**/api/phone-code/**', async (route) => {
    const url = new URL(route.request().url());
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname.endsWith('/status')) return json(200, { available: w.on });
    const body = route.request().postDataJSON() ?? {};
    if (!w.on) return json(503, { error: 'NOT_AVAILABLE' });
    if (url.pathname.endsWith('/send')) {
      w.sends.push(body);
      if (!/^[6-9]\d{9}$/.test(body.phone)) return json(400, { error: 'BAD_PHONE' });
      if (w.tooSoonOnce) {
        w.tooSoonOnce = false;
        return json(429, { error: 'TOO_SOON', retryAfter: 42 });
      }
      w.tries.set(`${body.purpose}:${body.phone}`, 5);
      if (body.purpose === 'signup' || w.accounts.has(body.phone)) w.whatsApps.push(body.phone);
      return json(200, { ok: true });
    }
    if (url.pathname.endsWith('/verify')) {
      w.verifies.push(body);
      const key = `${body.purpose}:${body.phone}`;
      const left = w.tries.get(key) ?? 0;
      const real = body.purpose === 'signup' || w.accounts.has(body.phone);
      if (left > 0 && real && body.code === RIGHT) {
        w.tries.delete(key);
        return json(200, { ok: true, proof: `v1.${body.purpose}.${body.phone}.1793000000.${'a'.repeat(32)}.${'f'.repeat(64)}`, expiresAt: 1793000000000 });
      }
      w.tries.set(key, Math.max(0, left - 1));
      return json(400, { error: 'WRONG_CODE', triesLeft: Math.max(0, left - 1) });
    }
    return json(404, { error: 'NOT_FOUND' });
  });
  return w;
}

/** 0061 staff_reset_pin_with_proof on the pretend gym server: the proof's number gets the new PIN. */
async function fakeResetPin(page, server) {
  const calls = [];
  await page.route('**/rest/v1/rpc/staff_reset_pin_with_proof', async (route) => {
    const args = route.request().postDataJSON() ?? {};
    calls.push(args);
    const phone = String(args.p_proof ?? '').split('.')[2];
    const p = server.people.get(phone);
    const bad = server.pinProblem(args.p_pin, phone);
    const body = !p ? { error: 'NO_PERSON' } : bad ? { error: bad } : (Object.assign(p, { pin: args.p_pin, pinTries: 0, pinLocked: false }), { ok: true, people: 1 });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return calls;
}

async function signOutHere(page) {
  await open(page, 'Staff & sign-in');
  await page.getByRole('button', { name: 'Sign out of this device' }).tap();
  await sheet(page, 'Sign out of this device?').getByRole('button', { name: 'Sign out' }).tap();
  await expect(page.getByText('You are signed out of this device.')).toBeVisible();
}

test.use({ viewport: { width: 375, height: 812 } });

test('F187 switched off: Sign in and Set up a new gym are exactly as before', async ({ page }) => {
  const w = await fakeWorker(page, { on: false });
  const server = await openApp(page);
  server.pinServer = true;
  const signInForm = page.locator('form').filter({ has: page.getByRole('button', { name: 'Sign in' }) });
  await expect(signInForm).toContainText(FORGOT_PIN_WORDS);
  await expect(page.getByRole('button', { name: /Get a code on WhatsApp/ })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Set up a new gym' }).click();
  const start = page.locator('form').filter({ has: page.getByRole('button', { name: 'Create my gym' }) });
  await expect(start).toContainText('You sign in with this number on any phone or computer.');
  await expect(page.getByRole('button', { name: 'Get code on WhatsApp' })).toHaveCount(0);
  await shot(page, 'f187-off-start');
  await page.getByRole('tab', { name: 'Sign in' }).click();
  await startOnlineGym(page, { phone: OWNER_PHONE });
  expect(w.sends).toEqual([]);
  expect('p_phone_proof' in server.log.find((c) => c.fn === 'gym_create_online').args).toBe(false);
});

for (const size of ['phone', 'computer']) {
  test(`F187 ${size}: Forgot PIN by WhatsApp code`, async ({ page }) => {
    // The gym was made before the WhatsApp code was switched on; Welcome asks again after the sign-out.
    const w = await fakeWorker(page, { on: false, accounts: [OWNER_TEN] });
    const server = await openApp(page);
    server.pinServer = true;
    const resets = await fakeResetPin(page, server);
    await startOnlineGym(page, { phone: OWNER_PHONE });
    w.on = true;
    await signOutHere(page);
    if (size === 'computer') await page.setViewportSize({ width: 1280, height: 900 });

    // The old "email us" line gives way to a button.
    const signInForm = page.locator('form').filter({ has: page.getByRole('button', { name: 'Sign in' }) });
    await expect(signInForm).not.toContainText(FORGOT_PIN_WORDS);
    await shot(page, `f187-${size}-signin`);
    await page.getByRole('button', { name: 'Forgot your PIN? Get a code on WhatsApp' }).tap();
    const forgot = page.getByRole('form', { name: 'Forgot your PIN?' });
    await expect(forgot).toContainText('We send a 6-digit code to your mobile number on WhatsApp. Then you choose a new PIN.');
    const alert = forgot.getByRole('alert');

    // Negative: a number that is not an Indian mobile never reaches the Worker.
    await forgot.getByLabel('Your mobile number').fill('12345');
    await forgot.getByRole('button', { name: 'Send code on WhatsApp' }).tap();
    await expect(alert).toHaveText('Type a 10-digit mobile number, like 98290 12345.');
    expect(w.sends).toEqual([]);

    // A number with no account: the same words as for a real one, and no WhatsApp goes out.
    await forgot.getByLabel('Your mobile number').fill('90000 00009');
    await forgot.getByRole('button', { name: 'Send code on WhatsApp' }).tap();
    await expect(forgot.getByRole('status')).toHaveText('If +91 90000 00009 has an account, a code is on its way on WhatsApp. It works for 10 minutes.');
    expect(w.sends.at(-1)).toEqual({ phone: NOBODY_TEN, purpose: 'pin', website: '' });
    expect(w.whatsApps).toEqual([]);
    await forgot.getByRole('button', { name: 'Back to sign in' }).tap();
    await expect(page.getByRole('form', { name: 'Forgot your PIN?' })).toHaveCount(0);

    // The owner's own number.
    await page.getByRole('button', { name: 'Forgot your PIN? Get a code on WhatsApp' }).tap();
    await forgot.getByLabel('Your mobile number').fill(OWNER_PHONE);
    await forgot.getByRole('button', { name: 'Send code on WhatsApp' }).tap();
    await expect(forgot.getByRole('status')).toHaveText('If +91 90000 00001 has an account, a code is on its way on WhatsApp. It works for 10 minutes.');
    expect(w.whatsApps).toEqual([OWNER_TEN]);
    await shot(page, `f187-${size}-forgot-code`);
    if (size === 'phone') await expectFitsPhone(page, 'on Forgot PIN');

    // "Send a new code" too soon: the Worker's limit, in plain words.
    w.tooSoonOnce = true;
    await forgot.getByRole('button', { name: 'Send a new code' }).tap();
    await expect(alert).toHaveText('A code was sent a moment ago. Wait 42 seconds, then ask again.');

    // A missing code, an easy PIN (caught here, no call), a wrong code (the Worker counts it).
    await fillNewPin(forgot, '314159');
    await forgot.getByRole('button', { name: 'Set new PIN and sign in' }).tap();
    await expect(alert).toHaveText('Type the 6-digit code from WhatsApp.');
    await forgot.getByLabel('Code from WhatsApp').fill('000000');
    await fillNewPin(forgot, '123456');
    await forgot.getByRole('button', { name: 'Set new PIN and sign in' }).tap();
    await expect(alert).toHaveText('Don’t use digits in order, like 123456 or 654321. Pick a PIN that is hard to guess.');
    expect(w.verifies).toEqual([]);
    await fillNewPin(forgot, '314159');
    await forgot.getByRole('button', { name: 'Set new PIN and sign in' }).tap();
    await expect(alert).toHaveText('That code is wrong. 4 tries left.');
    expect(resets).toEqual([]);
    await shot(page, `f187-${size}-forgot-wrong`);

    // The right code: the proof sets the PIN on the server, and the normal sign-in runs with it.
    await forgot.getByLabel('Code from WhatsApp').fill(RIGHT);
    await forgot.getByRole('button', { name: 'Set new PIN and sign in' }).tap();
    await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible({ timeout: 15_000 });
    expect(resets).toHaveLength(1);
    expect(resets[0].p_pin).toBe('314159');
    expect(resets[0].p_proof).toMatch(/^v1\.pin\.9000000001\./);
    expect(server.people.get(OWNER_TEN).pin).toBe('314159');
    expect(server.log.filter((c) => c.fn === 'staff_sign_in').at(-1).args).toMatchObject({ p_phone: OWNER_TEN, p_code: '314159' });
    await shot(page, `f187-${size}-forgot-done`);
  });

  test(`F187 ${size}: Set up a new gym checks the number with a WhatsApp code`, async ({ page }) => {
    if (size === 'computer') await page.setViewportSize({ width: 1280, height: 900 });
    const w = await fakeWorker(page);
    const server = await openApp(page);
    server.pinServer = true;
    // The gym server refuses the first check once (an old or used proof): the screen asks for a new code.
    let refuseOnce = true;
    await page.route('**/rest/v1/rpc/gym_create_online', async (route) => {
      if (!refuseOnce) return route.fallback();
      refuseOnce = false;
      await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'PHONE_CHECK', code: 'P0001', details: null, hint: null }) });
    });
    await page.getByRole('tab', { name: 'Set up a new gym' }).click();
    const start = page.locator('form').filter({ has: page.getByRole('checkbox') });
    await start.getByLabel('Gym name').fill('Shakti Gym');
    await start.getByLabel('Your name').fill('Ramesh Sharma');
    await start.getByLabel('Your mobile number').fill(OWNER_PHONE);
    await expect(start).toContainText('You sign in with this number. We check it with a code on WhatsApp.');
    await fillNewPin(start, '271828');
    await start.getByRole('checkbox', { name: /I agree to the MettleUp terms and the data agreement/ }).check();
    const alert = start.getByRole('alert');

    // First tap sends the code; nothing is made yet.
    await start.getByRole('button', { name: 'Get code on WhatsApp' }).tap();
    await expect(start.getByRole('status')).toHaveText('We sent a 6-digit code to +91 90000 00001 on WhatsApp. It works for 10 minutes.');
    expect(w.sends).toEqual([{ phone: OWNER_TEN, purpose: 'signup', website: '' }]);
    expect(server.calls).not.toContain('gym_create_online');
    await shot(page, `f187-${size}-signup-code`);
    if (size === 'phone') await expectFitsPhone(page, 'on Set up a new gym with the code box');

    await start.getByRole('button', { name: 'Create my gym' }).tap();
    await expect(alert).toHaveText('Type the 6-digit code from WhatsApp.');
    await start.getByLabel('Code from WhatsApp').fill('000000');
    await start.getByRole('button', { name: 'Create my gym' }).tap();
    await expect(alert).toHaveText('That code is wrong. 4 tries left.');

    // Right code, but the server does not take the check: plain words, and the code is asked again.
    await start.getByLabel('Code from WhatsApp').fill(RIGHT);
    await start.getByRole('button', { name: 'Create my gym' }).tap();
    await expect(alert).toHaveText('We could not check your mobile number. Ask for a new code on WhatsApp and try again.');
    await start.getByRole('button', { name: 'Get code on WhatsApp' }).tap();
    await expect(start.getByLabel('Code from WhatsApp')).toHaveValue('');
    await start.getByLabel('Code from WhatsApp').fill(RIGHT);
    await start.getByRole('button', { name: 'Create my gym' }).tap();
    await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible({ timeout: 15_000 });
    await closeGymReady(page);
    const made = server.log.filter((c) => c.fn === 'gym_create_online').at(-1);
    expect(made.args.p_phone).toBe(OWNER_TEN);
    expect(made.args.p_pin).toBe('271828');
    expect(made.args.p_phone_proof).toMatch(/^v1\.signup\.9000000001\./);
    expect(w.sends).toHaveLength(2);
    await shot(page, `f187-${size}-signup-done`);
  });
}
