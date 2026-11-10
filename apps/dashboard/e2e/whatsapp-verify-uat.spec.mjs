// "Verify with WhatsApp" (8 Nov 2026), UAT on a phone (375 x 812) and a computer (1280 x 900). The person sends
// ONE WhatsApp message "MettleUp code 482913" TO the MettleUp number; the Worker sees it and answers "verified"
// with a proof. Every step taps the real screen; pictures go to e2e/.results/uat (CI: "dashboard-uat-pictures").
// The MettleUp Worker's /api/phone-code/* is FAKED here (nothing reaches WhatsApp; deploy/panel/
// phoneInbound.test.mjs tests the real one), and so is wa.me (the page WhatsApp would open). The gym server is
// support.mjs FakeServer + 0061's staff_reset_pin_with_proof. Fake numbers only (+91 90000 0000x, +91 90000 99999).
//
// 1. Phone, Forgot PIN: a bad number; the green button opens WhatsApp with the message; waiting + countdown;
//    no internet; sent from a different number; the message was changed; verified -> new PIN -> signed in.
// 2. Phone: the code runs out (10 minutes on the clock) -> "Verify with WhatsApp" again; too many tries;
//    "Use a different number".
// 3. Computer, Forgot PIN: a QR code instead of opening WhatsApp, then verified.
// 4. Phone and computer, Set up a new gym: verify first, then "Create my gym" carries the proof.
import { mkdirSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { closeGymReady, expectFitsPhone, fillNewPin, open, openApp, sheet, startOnlineGym, wait } from './support.mjs';

const DIR = 'e2e/.results/uat';
mkdirSync(DIR, { recursive: true });

const OWNER_PHONE = '90000 00001';
const OWNER_TEN = '9000000001';
const CODE = '482913';
const WA_NUMBER = '919000099999';
const WA_LINK = `https://wa.me/${WA_NUMBER}?text=MettleUp%20code%20${CODE}`;

async function shot(page, name) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: true });
}

/**
 * A pretend MettleUp Worker in "inbound" mode. `w.state` / `w.hint` is what the next status answer says (the
 * test plays Meta's webhook by changing it); `w.offline` makes status calls fail; `w.startError` refuses the
 * next start once. `on: false` = the WhatsApp way is off (to make a gym before it is switched on).
 */
async function fakeWorker(page, { on = true } = {}) {
  const w = { on, starts: [], polls: 0, state: 'waiting', hint: null, offline: false, startError: null };
  await page.route('**/api/phone-code/**', async (route) => {
    const url = new URL(route.request().url());
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname.endsWith('/phone-code/status')) return json(200, w.on ? { available: true, mode: 'inbound' } : { available: false });
    if (!w.on) return json(503, { error: 'NOT_AVAILABLE' });
    if (url.pathname.endsWith('/inbound/start')) {
      const body = route.request().postDataJSON() ?? {};
      w.starts.push(body);
      if (w.startError) {
        const e = w.startError;
        w.startError = null;
        return json(e.status, e.body);
      }
      w.state = 'waiting';
      w.hint = null;
      // The page's own clock (openApp fixes it), so the countdown and the expiry line up.
      const now = await page.evaluate(() => Date.now());
      return json(200, { ok: true, id: `0b8c1c1e-1111-4222-8333-${String(w.starts.length).padStart(12, '0')}`, code: CODE, waNumber: WA_NUMBER, waText: `MettleUp code ${CODE}`, expiresAt: now + 10 * 60_000 });
    }
    if (url.pathname.endsWith('/inbound/status')) {
      w.polls++;
      if (w.offline) return route.abort('internetdisconnected');
      const last = w.starts.at(-1) ?? {};
      if (w.state === 'verified') {
        return json(200, { ok: true, state: 'verified', proof: `v1.${last.purpose}.${last.phone}.1793000000.${'a'.repeat(32)}.${'f'.repeat(64)}`, expiresAt: 1793000000000 });
      }
      return json(200, { ok: true, state: w.state, ...(w.hint ? { hint: w.hint } : {}) });
    }
    return json(404, { error: 'NOT_FOUND' });
  });
  // What WhatsApp's link would open: a stand-in page, so nothing leaves the test.
  await page.context().route('https://wa.me/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<p>WhatsApp</p>' }));
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
  await page.getByRole('button', { name: 'Sign out of this device' }).click();
  await sheet(page, 'Sign out of this device?').getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByText('You are signed out of this device.')).toBeVisible();
}

/** A gym made while the WhatsApp way was off; then signed out, with "Verify with WhatsApp" switched on. */
async function signedOutOwner(page) {
  const w = await fakeWorker(page, { on: false });
  const server = await openApp(page);
  server.pinServer = true;
  const resets = await fakeResetPin(page, server);
  await startOnlineGym(page, { phone: OWNER_PHONE });
  w.on = true;
  await signOutHere(page);
  return { w, server, resets };
}

async function openForgot(page) {
  await page.getByRole('button', { name: 'Forgot your PIN?', exact: true }).click();
  const forgot = page.getByRole('form', { name: 'Forgot your PIN?' });
  await expect(forgot).toContainText('First we check that this mobile number is yours. You send us one WhatsApp message. It is free.');
  return forgot;
}

test.use({ viewport: { width: 375, height: 812 } });

test('Verify with WhatsApp, phone: Forgot PIN from the message to a new PIN', async ({ page }) => {
  const { w, server, resets } = await signedOutOwner(page);
  // The old "Get a code on WhatsApp" button is not shown while inbound is on.
  await expect(page.getByRole('button', { name: /Get a code on WhatsApp/ })).toHaveCount(0);
  const forgot = await openForgot(page);
  await expect(forgot).toContainText('What happens');
  await expect(forgot).toContainText('2. Tap Send. Do not change the message.');
  await expect(forgot).toContainText('Send it from the WhatsApp on this number. A message from another number does not work.');
  await shot(page, 'verify-phone-main');
  await expectFitsPhone(page, 'on Forgot PIN, Verify with WhatsApp');
  const alert = forgot.getByRole('alert');

  // Negative: not an Indian mobile: caught here, the Worker never asked.
  await forgot.getByLabel('Your mobile number').fill('12345');
  await forgot.getByRole('button', { name: 'Verify with WhatsApp' }).click();
  await expect(alert).toHaveText('Type a 10-digit mobile number, like 98290 12345.');
  expect(w.starts).toEqual([]);

  // The green button: the code is made and WhatsApp opens with the message typed in.
  await forgot.getByLabel('Your mobile number').fill(OWNER_PHONE);
  const popup = page.waitForEvent('popup');
  await forgot.getByRole('button', { name: 'Verify with WhatsApp' }).click();
  expect((await popup).url()).toBe(WA_LINK);
  expect(w.starts).toEqual([{ phone: OWNER_TEN, purpose: 'pin', website: '' }]);
  await expect(forgot.getByRole('heading', { name: 'Send the message in WhatsApp' })).toBeVisible();
  await expect(forgot).toContainText('Send it from +91 90000 00001 to the MettleUp number. Then come back here.');
  await expect(forgot).toContainText(`MettleUp code ${CODE}`);
  await expect(forgot).toContainText('To: MettleUp, +91 90000 99999');
  await expect(forgot.getByRole('status')).toContainText('Waiting for your message');
  await expect(forgot.getByRole('status')).toContainText(/This code works for (10:00|9:\d\d) more minutes\./);
  const again = forgot.getByRole('link', { name: 'Open WhatsApp again' });
  await expect(again).toHaveAttribute('href', WA_LINK);
  await expect(forgot).toContainText('WhatsApp did not open? Send the message above to +91 90000 99999 yourself. Type it exactly.');
  await expect(alert).toHaveCount(0);
  await expect.poll(() => w.polls, { timeout: 10_000 }).toBeGreaterThan(0);
  await shot(page, 'verify-phone-waiting');
  await expectFitsPhone(page, 'while waiting for the WhatsApp message');

  // Interruption: no internet. It keeps asking, and says so.
  w.offline = true;
  await expect(alert).toHaveText('Can’t reach the internet. We keep checking when it is back.', { timeout: 10_000 });
  w.offline = false;
  await expect(alert).toHaveCount(0, { timeout: 10_000 });

  // Sent from another number: plain words, still waiting.
  w.state = 'wrong_number';
  await expect(alert).toHaveText('We got your message from a different number. Send it from the WhatsApp on +91 90000 00001.', { timeout: 10_000 });
  await shot(page, 'verify-phone-wrong-number');
  // The message was changed (sent from the right number, but no code in it).
  w.state = 'waiting';
  w.hint = 'no_code';
  await expect(alert).toHaveText('We could not find the code in your message. Tap "Open WhatsApp again" and send it without changes.', { timeout: 10_000 });
  await shot(page, 'verify-phone-changed-message');
  expect(resets).toEqual([]);

  // The message arrives: "Number checked", then the new PIN.
  w.hint = null;
  w.state = 'verified';
  await expect(forgot.getByRole('status')).toContainText('Number checked', { timeout: 10_000 });
  await expect(forgot.getByRole('status')).toContainText('+91 90000 00001 is yours.');
  await expect(forgot.getByRole('heading', { name: 'Send the message in WhatsApp' })).toHaveCount(0);
  const pollsAtDone = w.polls;
  await shot(page, 'verify-phone-checked');
  // Negative: an easy PIN is caught here, nothing sent.
  await forgot.getByLabel('Choose a new 6-digit PIN').fill('123456');
  await forgot.getByLabel('Type the PIN again').fill('123456');
  await forgot.getByRole('button', { name: 'Save new PIN' }).click();
  await expect(alert).toHaveText('Don’t use digits in order, like 123456 or 654321. Pick a PIN that is hard to guess.');
  expect(resets).toEqual([]);
  await forgot.getByLabel('Choose a new 6-digit PIN').fill('314159');
  await forgot.getByLabel('Type the PIN again').fill('314159');
  await forgot.getByRole('button', { name: 'Save new PIN' }).click();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible({ timeout: 15_000 });
  expect(resets).toHaveLength(1);
  expect(resets[0].p_pin).toBe('314159');
  expect(resets[0].p_proof).toMatch(/^v1\.pin\.9000000001\./);
  expect(server.people.get(OWNER_TEN).pin).toBe('314159');
  // Asking stopped once the number was checked.
  await page.waitForTimeout(3000);
  expect(w.polls).toBe(pollsAtDone);
});

test('Verify with WhatsApp, phone: the code runs out, too many tries, a different number', async ({ page }) => {
  const { w, resets } = await signedOutOwner(page);
  const forgot = await openForgot(page);
  const alert = forgot.getByRole('alert');

  // Too many tries: the Worker's limit, in plain words; nothing waits.
  w.startError = { status: 429, body: { error: 'TOO_MANY' } };
  await forgot.getByLabel('Your mobile number').fill(OWNER_PHONE);
  await forgot.getByRole('button', { name: 'Verify with WhatsApp' }).click();
  await expect(alert).toHaveText('Too many tries for this number. Wait an hour, then try again.');
  await expect(forgot.getByRole('heading', { name: 'Send the message in WhatsApp' })).toHaveCount(0);
  w.startError = { status: 429, body: { error: 'TOO_SOON', retryAfter: 42 } };
  await forgot.getByRole('button', { name: 'Verify with WhatsApp' }).click();
  await expect(alert).toHaveText('You tapped "Verify with WhatsApp" a moment ago. Wait 42 seconds, then try again.');

  // Start; then 10 minutes pass with no message: the code has run out, on the page's own clock.
  await forgot.getByRole('button', { name: 'Verify with WhatsApp' }).click();
  await expect(forgot.getByRole('heading', { name: 'Send the message in WhatsApp' })).toBeVisible();
  await wait(page, 10 * 60_000 + 3000);
  await expect(alert).toHaveText('This code has run out. Tap "Verify with WhatsApp" to get a new one.', { timeout: 10_000 });
  await expect(forgot.getByRole('link', { name: /Open WhatsApp/ })).toHaveCount(0);
  await shot(page, 'verify-phone-expired');
  const pollsAtEnd = w.polls;
  await page.waitForTimeout(3000);
  expect(w.polls, 'no asking after the code ran out').toBe(pollsAtEnd);
  // Get a new one: same number, a new start.
  const starts = w.starts.length;
  await forgot.getByRole('button', { name: 'Verify with WhatsApp' }).click();
  await expect.poll(() => w.starts.length).toBe(starts + 1);
  await expect(forgot.getByRole('heading', { name: 'Send the message in WhatsApp' })).toBeVisible();
  await expect(alert).toHaveCount(0);

  // The Worker says expired too (a replaced or cleaned-up code).
  w.state = 'expired';
  await expect(alert).toHaveText('This code has run out. Tap "Verify with WhatsApp" to get a new one.', { timeout: 10_000 });

  // Too many messages from other numbers.
  await forgot.getByRole('button', { name: 'Verify with WhatsApp' }).click();
  await expect(forgot.getByRole('heading', { name: 'Send the message in WhatsApp' })).toBeVisible();
  w.state = 'too_many';
  await expect(alert).toHaveText('Too many tries for this number. Wait an hour, then try again.', { timeout: 10_000 });
  await shot(page, 'verify-phone-too-many');

  // "Use a different number": back to the number box, the typed number kept.
  await forgot.getByRole('button', { name: 'Use a different number' }).click();
  await expect(forgot.getByLabel('Your mobile number')).toHaveValue(OWNER_PHONE);
  await expect(forgot.getByRole('button', { name: 'Verify with WhatsApp' })).toBeVisible();
  await forgot.getByRole('button', { name: 'Back to sign in' }).click();
  await expect(page.getByRole('form', { name: 'Forgot your PIN?' })).toHaveCount(0);
  expect(resets).toEqual([]);
});

test('Verify with WhatsApp, computer: a QR code to scan with the phone, then the new PIN', async ({ page }) => {
  const { w, resets } = await signedOutOwner(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  const forgot = await openForgot(page);
  let popups = 0;
  page.on('popup', () => popups++);
  await forgot.getByLabel('Your mobile number').fill(OWNER_PHONE);
  await forgot.getByRole('button', { name: 'Verify with WhatsApp' }).click();
  await expect(forgot.getByRole('img', { name: 'QR code that opens WhatsApp with the message ready' })).toBeVisible();
  await expect(forgot.getByRole('heading', { name: 'Scan with the phone that has +91 90000 00001' })).toBeVisible();
  await expect(forgot).toContainText('1. Open the camera on that phone and point it at the code.');
  await expect(forgot).toContainText('3. This page turns green by itself.');
  await expect(forgot.getByRole('status')).toContainText(/Waiting for your message\. The code works for (10:00|9:\d\d) more minutes\./);
  await expect(forgot).toContainText(`No camera? Send "MettleUp code ${CODE}" to +91 90000 99999 on WhatsApp.`);
  await shot(page, 'verify-computer-qr');
  expect(popups, 'a computer shows the QR code; it does not open WhatsApp').toBe(0);

  w.state = 'verified';
  await expect(forgot.getByRole('status')).toContainText('Number checked', { timeout: 10_000 });
  await expect(forgot.getByRole('img', { name: 'QR code that opens WhatsApp with the message ready' })).toHaveCount(0);
  await forgot.getByLabel('Choose a new 6-digit PIN').fill('314159');
  await forgot.getByLabel('Type the PIN again').fill('314159');
  await shot(page, 'verify-computer-checked');
  await forgot.getByRole('button', { name: 'Save new PIN' }).click();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible({ timeout: 15_000 });
  expect(resets[0].p_proof).toMatch(/^v1\.pin\.9000000001\./);
});

for (const size of ['phone', 'computer']) {
  test(`Verify with WhatsApp, ${size}: Set up a new gym checks the number first`, async ({ page }) => {
    if (size === 'computer') await page.setViewportSize({ width: 1280, height: 900 });
    const w = await fakeWorker(page);
    const server = await openApp(page);
    server.pinServer = true;
    await page.getByRole('button', { name: 'Set up a new gym', exact: true }).click();
    const start = page.locator('form').filter({ has: page.getByRole('checkbox') });
    await start.getByLabel('Gym name').fill('Shakti Gym');
    await start.getByLabel('Your name').fill('Ramesh Sharma');
    await start.getByLabel('Your mobile number').fill(OWNER_PHONE);
    await expect(start).toContainText('You sign in with this number. You check it by sending us one WhatsApp message. It is free.');
    await fillNewPin(start, '271828');
    await expect(start.getByRole('button', { name: 'Create my gym' })).toHaveCount(0);
    // Negative: the terms box first; the Worker is not asked.
    await start.getByRole('button', { name: 'Verify with WhatsApp' }).click();
    await expect(start.getByRole('alert')).toHaveText('Tick the box to agree to the terms. Then tap “Verify with WhatsApp”.');
    expect(w.starts).toEqual([]);
    await start.getByRole('checkbox', { name: /I agree to the MettleUp terms and the data agreement/ }).check();

    const popup = size === 'phone' ? page.waitForEvent('popup') : null;
    await start.getByRole('button', { name: 'Verify with WhatsApp' }).click();
    if (popup) expect((await popup).url()).toBe(WA_LINK);
    expect(w.starts).toEqual([{ phone: OWNER_TEN, purpose: 'signup', website: '' }]);
    if (size === 'phone') await expect(start.getByRole('heading', { name: 'Send the message in WhatsApp' })).toBeVisible();
    else await expect(start.getByRole('img', { name: 'QR code that opens WhatsApp with the message ready' })).toBeVisible();
    expect(server.calls).not.toContain('gym_create_online');
    await shot(page, `verify-${size}-signup-waiting`);
    if (size === 'phone') await expectFitsPhone(page, 'on Set up a new gym while waiting for the message');

    w.state = 'verified';
    await expect(start.getByRole('status')).toContainText('+91 90000 00001 is yours.', { timeout: 10_000 });
    await shot(page, `verify-${size}-signup-checked`);
    expect(server.calls).not.toContain('gym_create_online');
    await start.getByRole('button', { name: 'Create my gym' }).click();
    await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible({ timeout: 15_000 });
    await closeGymReady(page);
    const made = server.log.filter((c) => c.fn === 'gym_create_online').at(-1);
    expect(made.args.p_phone).toBe(OWNER_TEN);
    expect(made.args.p_phone_proof).toMatch(/^v1\.signup\.9000000001\./);
    expect(w.starts).toHaveLength(1);
  });
}
