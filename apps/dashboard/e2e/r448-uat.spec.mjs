// R-448 (10 Nov 2026) UAT, at a 375 px phone and a 1366x768 computer. Pictures go to e2e/.results/uat (CI uploads
// them as "dashboard-uat-pictures"), named r448-*.png.
//  1. Settings -> Sign-in & data: "Clear this device's saved data" (under Danger zone) is now its own block
//     "Offline copy on this device": what it does, what it does NOT delete, when to use it; button "Clear offline
//     copy"; a calm confirm "Yes, clear it" / "Keep it"; the action is the same. "Danger zone" keeps only the delete.
//  2. Forgot your PIN: WhatsApp first; under it "Can’t use WhatsApp? Other ways back in" (a code made on another
//     signed-in phone, computer or browser; another owner; MettleUp after a call). With WhatsApp off, "Forgot your
//     PIN?" opens the same ways. The backup way end to end: a code made on the owner's other phone, then
//     "Choose a new PIN?" right after signing in with it (no old PIN needed); "Keep my old PIN" keeps it.
//  3. The WhatsApp check page: coming back from WhatsApp says "Checking your message…"; after 20 seconds with no
//     message, a calm line on what to do.
// The MettleUp Worker's /api/phone-code/* is faked (as in whatsapp-verify-uat.spec.mjs); the gym server is
// support.mjs FakeServer. Fake numbers only.
//
// UAT types: happy path (each card, the backup way in), negative (old words gone; no "Choose a new PIN?" after a
// PIN sign-in; "Keep my old PIN" changes nothing; the slow line does not show before 20 s or while a problem shows),
// interruption (leaving the page for WhatsApp and coming back), setting change (Hinglish), edge (375 px, computer),
// time (the 20-second clock).
import { mkdirSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import {
  OWNER,
  SIGN_IN_CODE,
  expectFitsPhone,
  open,
  openApp,
  openSettings,
  personCard,
  secondPhone,
  sheet,
  startOnlineGym,
  typeSignIn,
  wait,
} from './support.mjs';

const DIR = 'e2e/.results/uat';
mkdirSync(DIR, { recursive: true });

async function shot(page, name, fullPage = false) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/r448-${name}.png`, fullPage });
}

const PHONE = { width: 375, height: 812 };
const COMPUTER = { width: 1366, height: 768 };
const OWNER_TEN = OWNER.phone.replace(/\D/g, '');
const CODE = '482913';
const WA_NUMBER = '919000099999';

const OTHER = {
  device:
    '1. Signed in on another phone, computer or browser? There, open Staff & sign-in (on a phone: More; on a computer: Settings → Sign-in & data). Next to your name, tap “Make sign-in code”. Then type that code on Sign in, in the PIN box.',
  owner: '2. Another owner of your gym can make a code for you the same way. Front desk staff: ask your gym owner for a code.',
  email: '3. Not signed in anywhere? Email contact@mettleup.fit with your gym name and mobile number. We call you to check it is you, then give you a sign-in code.',
  after: 'After you sign in with a code, you can choose a new PIN straight away.',
};

/** A pretend MettleUp Worker ("inbound" mode while `on`), as in whatsapp-verify-uat.spec.mjs. */
async function fakeWorker(page, { on = true } = {}) {
  const w = { on, starts: [], polls: 0, state: 'waiting', hint: null };
  await page.route('**/api/phone-code/**', async (route) => {
    const url = new URL(route.request().url());
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname.endsWith('/phone-code/status')) return json(200, w.on ? { available: true, mode: 'inbound' } : { available: false });
    if (!w.on) return json(503, { error: 'NOT_AVAILABLE' });
    if (url.pathname.endsWith('/inbound/start')) {
      const body = route.request().postDataJSON() ?? {};
      w.starts.push(body);
      w.state = 'waiting';
      w.hint = null;
      const now = await page.evaluate(() => Date.now());
      // The Worker's R-448 message: the code first, then what to do after Send.
      const next = body.lang === 'hinglish' ? 'Yeh bhejne ke baad MettleUp page par wapas jao.' : 'After you send this, go back to the MettleUp page.';
      return json(200, { ok: true, id: `0b8c1c1e-1111-4222-8333-${String(w.starts.length).padStart(12, '0')}`, code: CODE, waNumber: WA_NUMBER, waText: `MettleUp code ${CODE}. ${next}`, expiresAt: now + 10 * 60_000 });
    }
    if (url.pathname.endsWith('/inbound/status')) {
      w.polls++;
      if (w.state === 'verified') return json(200, { ok: true, state: 'verified', proof: `v1.pin.${OWNER_TEN}.1793000000.${'a'.repeat(32)}.${'f'.repeat(64)}`, expiresAt: 1793000000000 });
      return json(200, { ok: true, state: w.state, ...(w.hint ? { hint: w.hint } : {}) });
    }
    return json(404, { error: 'NOT_FOUND' });
  });
  await page.context().route('https://wa.me/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<p>WhatsApp</p>' }));
  return w;
}

/** The page goes out of sight (WhatsApp, or the phone's camera) and comes back. */
async function leaveAndComeBack(page) {
  await page.evaluate(() => {
    const set = (hidden) => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
      document.dispatchEvent(new Event('visibilitychange'));
    };
    set(true);
    set(false);
  });
}

async function signOutHere(page) {
  await open(page, 'Staff & sign-in');
  await page.getByRole('button', { name: 'Sign out of this device' }).click();
  await sheet(page, 'Sign out of this device?').getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByText('You are signed out of this device.')).toBeVisible();
}

/** An owner with a PIN, signed out of this device; WhatsApp checking on or off. */
async function signedOutOwner(page, { whatsApp = true } = {}) {
  const w = await fakeWorker(page, { on: false });
  const server = await openApp(page);
  server.pinServer = true;
  await startOnlineGym(page);
  w.on = whatsApp;
  await signOutHere(page);
  return { w, server };
}

const forgotButton = (page) => page.getByRole('button', { name: 'Forgot your PIN?', exact: true });
const otherWays = (page) => page.getByRole('region', { name: 'Other ways back in' });

async function expectOtherWays(page) {
  const box = otherWays(page);
  await expect(box).toBeVisible();
  await expect(box.getByRole('heading', { name: 'Other ways back in' })).toBeVisible();
  for (const line of Object.values(OTHER)) await expect(box).toContainText(line);
  await expect(box.getByRole('link', { name: 'contact@mettleup.fit' })).toHaveAttribute('href', 'mailto:contact@mettleup.fit');
}

// ------------------------------------------------------------------ 1. the offline copy card

test.describe('R448-1 Settings: the offline copy on this device', () => {
  test.use({ viewport: PHONE });

  test('phone: plain words, a calm confirm, cleared; the gym is untouched; computer picture', async ({ page }) => {
    const server = await openApp(page);
    await startOnlineGym(page);
    await openSettings(page, 'Sign-in & data');
    const card = page.getByRole('region', { name: 'Offline copy on this device' });
    await expect(card).toContainText(
      'This phone or computer keeps a copy of your gym, so the desk still works when the internet is down. Clearing it deletes only that copy. Your gym’s records online stay safe, and a fresh copy downloads the next time this device is online.',
    );
    await expect(card).toContainText('Use it only while the internet is working, and only if this device shows old details that do not update, or if MettleUp support asks you to.');
    // Negative: the old name is gone, and the card is not under "Danger zone" any more.
    await expect(page.getByText('Clear this device', { exact: false })).toHaveCount(0);
    await expect(page.getByText('Danger zone: this can’t be undone', { exact: true })).toBeVisible();
    const dangerY = (await page.getByText('Danger zone: this can’t be undone', { exact: true }).boundingBox()).y;
    expect((await card.boundingBox()).y, 'the offline copy sits above Danger zone, not inside it').toBeLessThan(dangerY);
    await card.scrollIntoViewIfNeeded();
    await expectFitsPhone(page, 'on Sign-in & data with the offline copy card');
    await shot(page, 'phone-offline-copy');
    await shot(page, 'phone-settings-data-full', true);

    await card.getByRole('button', { name: 'Clear offline copy' }).click();
    const ask = card.getByRole('group', { name: 'Clear offline copy?' });
    await expect(ask).toContainText('Clear the offline copy on this device? Nothing is deleted from your gym’s records online.');
    await expect(ask.getByRole('button')).toHaveText(['Yes, clear it', 'Keep it']);
    await shot(page, 'phone-offline-copy-confirm');
    // "Keep it": nothing happens.
    await ask.getByRole('button', { name: 'Keep it' }).click();
    await expect(ask).toHaveCount(0);
    await card.getByRole('button', { name: 'Clear offline copy' }).click();
    await card.getByRole('button', { name: 'Yes, clear it' }).click();
    await expect(card.getByRole('status')).toHaveText('Offline copy cleared. Your gym’s records online are safe. A fresh copy downloads while this device is online.');
    await shot(page, 'phone-offline-copy-cleared');
    // The gym on the server is untouched and still opens.
    expect(server.log.some((c) => /delete|erase|remove/i.test(String(c.fn)))).toBe(false);
    await open(page, 'Today');
    await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();

    // The same card on a computer.
    await page.setViewportSize(COMPUTER);
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Settings', exact: true }).click();
    await page.getByRole('group', { name: 'Settings view' }).getByRole('button', { name: 'Sign-in & data' }).click();
    await page.getByRole('region', { name: 'Offline copy on this device' }).scrollIntoViewIfNeeded();
    await shot(page, 'computer-offline-copy');
  });
});

// ------------------------------------------------------------------ 2. Forgot your PIN

test.describe('R448-2 Forgot your PIN: WhatsApp first, then the other ways', () => {
  test.use({ viewport: PHONE });

  test('phone, WhatsApp on: the WhatsApp card first; "Can’t use WhatsApp?" opens the other ways; Hinglish', async ({ page }) => {
    await signedOutOwner(page);
    await shot(page, 'phone-signin');
    await forgotButton(page).click();
    const forgot = page.getByRole('form', { name: 'Forgot your PIN?' });
    await expect(forgot.getByRole('button', { name: 'Verify with WhatsApp' })).toBeVisible();
    await expect(otherWays(page)).toHaveCount(0);
    const toggle = forgot.getByRole('button', { name: 'Can’t use WhatsApp? Other ways back in' });
    // WhatsApp comes first: the toggle is under it.
    expect((await toggle.boundingBox()).y).toBeGreaterThan((await forgot.getByRole('button', { name: 'Verify with WhatsApp' }).boundingBox()).y);
    await shot(page, 'phone-forgot-whatsapp', true);
    await toggle.click();
    await expectOtherWays(page);
    await otherWays(page).scrollIntoViewIfNeeded();
    await expectFitsPhone(page, 'on Forgot your PIN with the other ways open');
    await shot(page, 'phone-forgot-other-ways');
    await shot(page, 'phone-forgot-other-ways-full', true);
    await toggle.click();
    await expect(otherWays(page)).toHaveCount(0);

    // Hinglish.
    await forgot.getByRole('button', { name: 'Back to sign in' }).click();
    await page.getByRole('radio', { name: 'Hinglish' }).click();
    await page.getByRole('button', { name: 'PIN bhool gaye?', exact: true }).click();
    await page.getByRole('button', { name: 'WhatsApp nahi chal raha? Wapas aane ke aur tareeke' }).click();
    const hi = page.getByRole('region', { name: 'Wapas aane ke aur tareeke' });
    await expect(hi).toContainText('1. Kisi aur phone, computer ya browser par sign in ho?');
    await expect(hi).toContainText('contact@mettleup.fit');
    await hi.scrollIntoViewIfNeeded();
    await shot(page, 'phone-forgot-other-ways-hinglish');
    await page.getByRole('radio', { name: 'English' }).click().catch(() => {});
  });

  test('phone, WhatsApp off: "Forgot your PIN?" opens the other ways (was one grey line)', async ({ page }) => {
    await signedOutOwner(page, { whatsApp: false });
    await expect(page.getByText('If you are the owner and no other phone or computer is signed in', { exact: false })).toHaveCount(0);
    await forgotButton(page).click();
    const card = page.getByRole('region', { name: 'Forgot your PIN?' });
    await expect(card.getByRole('heading', { name: 'Forgot your PIN?' })).toBeVisible();
    await expectOtherWays(page);
    await expect(page.getByRole('button', { name: 'Verify with WhatsApp' })).toHaveCount(0);
    await expectFitsPhone(page, 'on Forgot your PIN with WhatsApp off');
    await shot(page, 'phone-forgot-off', true);
    await card.getByRole('button', { name: 'Back to sign in' }).click();
    await expect(page.getByLabel('PIN (6 digits)')).toBeVisible();
  });

  test('computer: the other ways under the WhatsApp card', async ({ page }) => {
    await signedOutOwner(page);
    await page.setViewportSize(COMPUTER);
    await forgotButton(page).click();
    await page.getByRole('button', { name: 'Can’t use WhatsApp? Other ways back in' }).click();
    await expectOtherWays(page);
    await shot(page, 'computer-forgot-other-ways', true);
  });

  test('the backup way end to end: a code from the other phone, then "Choose a new PIN?"', async ({ page, browser }) => {
    // Phone A: the owner, signed in (he set a PIN at Create my gym). WhatsApp checking off: not needed here.
    const w = await fakeWorker(page, { on: false });
    const server = await openApp(page);
    server.pinServer = true;
    await startOnlineGym(page);
    expect(server.people.get(OWNER_TEN).pin).toBe(OWNER.pin);
    void w;

    // Phone B: forgot the PIN. A wrong PIN first.
    const b = await secondPhone(browser, server);
    await typeSignIn(b, OWNER.phone, '135790');
    await expect(b.getByRole('alert')).toContainText('That PIN or code is wrong');

    // Phone A: Staff & sign-in -> his own row -> Make sign-in code.
    await open(page, 'Staff & sign-in');
    await personCard(page, OWNER.name).getByRole('button', { name: 'Make sign-in code' }).click();
    const codeSheet = sheet(page, 'Your sign-in code');
    await expect(codeSheet.getByLabel(`Code ${SIGN_IN_CODE.split('').join(' ')}`)).toBeVisible();
    await shot(page, 'phone-own-code');
    await codeSheet.getByRole('button', { name: 'Done' }).click();

    // Phone B: the code in the PIN box -> Today, and "Choose a new PIN?" at once.
    await typeSignIn(b, OWNER.phone, SIGN_IN_CODE);
    await expect(b.getByRole('heading', { name: 'Today', exact: true })).toBeVisible({ timeout: 15_000 });
    const choose = sheet(b, 'Choose a new PIN?');
    await expect(choose).toContainText('You signed in with a one-time code. If you forgot your PIN, choose a new one now.');
    await expect(choose.getByLabel('Your current PIN')).toHaveCount(0);
    await expect(choose.getByRole('button', { name: 'Keep my old PIN' })).toBeVisible();
    await expectFitsPhone(b, 'in Choose a new PIN?');
    await shot(b, 'phone-choose-new-pin');
    // Negative: an easy PIN is refused here.
    await choose.getByLabel('Choose a 6-digit PIN').fill('123456');
    await choose.getByLabel('Type the PIN again').fill('123456');
    await choose.getByRole('button', { name: 'Save my PIN' }).click();
    await expect(choose.getByRole('alert')).toHaveText('Don’t use digits in order, like 123456 or 654321. Pick a PIN that is hard to guess.');
    await choose.getByLabel('Choose a 6-digit PIN').fill('314159');
    await choose.getByLabel('Type the PIN again').fill('314159');
    await choose.getByRole('button', { name: 'Save my PIN' }).click();
    await expect(choose).toBeHidden();
    await expect(b.getByText('New PIN saved. Next time, sign in with your mobile number and this PIN.')).toBeVisible();
    await shot(b, 'phone-new-pin-saved');
    expect(server.people.get(OWNER_TEN).pin).toBe('314159');
    // Once only: a reload does not ask again.
    await b.reload();
    await expect(b.getByRole('heading', { name: 'Today', exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(sheet(b, 'Choose a new PIN?')).toHaveCount(0);
    await b.context().close();

    // "Keep my old PIN" on a third phone: the PIN stays as it is.
    await personCard(page, OWNER.name).getByRole('button', { name: 'Make sign-in code' }).click();
    await sheet(page, 'Your sign-in code').getByRole('button', { name: 'Done' }).click();
    const c = await secondPhone(browser, server);
    await typeSignIn(c, OWNER.phone, SIGN_IN_CODE);
    await expect(c.getByRole('heading', { name: 'Today', exact: true })).toBeVisible({ timeout: 15_000 });
    await sheet(c, 'Choose a new PIN?').getByRole('button', { name: 'Keep my old PIN' }).click();
    await expect(sheet(c, 'Choose a new PIN?')).toHaveCount(0);
    expect(server.people.get(OWNER_TEN).pin).toBe('314159');
    await c.context().close();

    // Negative: a sign-in with the PIN never asks.
    const d = await secondPhone(browser, server);
    await typeSignIn(d, OWNER.phone, '314159');
    await expect(d.getByRole('heading', { name: 'Today', exact: true })).toBeVisible({ timeout: 15_000 });
    await d.waitForTimeout(800);
    await expect(sheet(d, 'Choose a new PIN?')).toHaveCount(0);
    await expect(sheet(d, 'Set your own PIN')).toHaveCount(0);
    await d.context().close();
  });
});

// ------------------------------------------------------------------ 3. the WhatsApp check page

test.describe('R448-3 Verify with WhatsApp: coming back to the page', () => {
  test.use({ viewport: PHONE });

  test('phone: the message says to come back; back on the page "Checking your message…"; 20 s later what to do', async ({ page }) => {
    const { w } = await signedOutOwner(page);
    await forgotButton(page).click();
    const forgot = page.getByRole('form', { name: 'Forgot your PIN?' });
    await forgot.getByLabel('Your mobile number').fill(OWNER.phone);
    const popup = page.waitForEvent('popup');
    await forgot.getByRole('button', { name: 'Verify with WhatsApp' }).click();
    const wa = await popup;
    expect(decodeURIComponent(new URL(wa.url()).searchParams.get('text'))).toBe(`MettleUp code ${CODE}. After you send this, go back to the MettleUp page.`);
    await wa.close();
    await page.bringToFront();
    await expect(forgot).toContainText(`MettleUp code ${CODE}. After you send this, go back to the MettleUp page.`);
    await expect(forgot).toContainText(`WhatsApp did not open? Send "MettleUp code ${CODE}" to +91 90000 99999 yourself.`);
    const status = forgot.getByRole('status');
    await expect(status).toContainText(/Waiting for your message|Checking your message…/);
    await shot(page, 'phone-verify-before', true);

    // Back from WhatsApp.
    await leaveAndComeBack(page);
    await expect(status).toContainText('Checking your message…');
    await expect(forgot.getByRole('note')).toHaveCount(0);
    await shot(page, 'phone-verify-checking');
    // Negative: nothing calm-but-worried before 20 seconds.
    await wait(page, 15_000);
    await expect(forgot.getByRole('note')).toHaveCount(0);
    await wait(page, 6_000);
    const note = forgot.getByRole('note');
    await expect(note).toHaveText('We have not got your message yet. In WhatsApp, check that the message to MettleUp was sent. If it was not, tap “Open WhatsApp again” and tap Send.');
    await expect(status).toContainText('Waiting for your message');
    await expect(forgot.getByRole('alert')).toHaveCount(0);
    await expectFitsPhone(page, 'with the no-message-yet line');
    // Fresh-eyes finding: a way out stays on screen while we wait.
    await forgot.getByRole('button', { name: 'Can’t use WhatsApp? Other ways back in' }).click();
    await expect(otherWays(page)).toBeVisible();
    await shot(page, 'phone-verify-still-nothing', true);
    await forgot.getByRole('button', { name: 'Can’t use WhatsApp? Other ways back in' }).click();
    await expect(otherWays(page)).toHaveCount(0);
    // A real problem replaces the calm line.
    w.hint = 'no_code';
    await expect(forgot.getByRole('alert')).toHaveText('We could not find the code in your message. Tap "Open WhatsApp again" and send it without changes.', { timeout: 10_000 });
    await expect(note).toHaveCount(0);
    // Then the message arrives.
    w.hint = null;
    w.state = 'verified';
    await leaveAndComeBack(page);
    await expect(forgot.getByRole('status')).toContainText('Number checked', { timeout: 10_000 });
    await expect(forgot.getByRole('button', { name: 'Can’t use WhatsApp? Other ways back in' })).toHaveCount(0);
    await shot(page, 'phone-verify-checked');
  });

  test('phone, Hinglish: the message and the checking line in Hinglish', async ({ page }) => {
    const { w } = await signedOutOwner(page);
    await page.getByRole('radio', { name: 'Hinglish' }).click();
    await page.getByRole('button', { name: 'PIN bhool gaye?', exact: true }).click();
    await page.getByLabel('Aapka mobile number').fill(OWNER.phone);
    const popup = page.waitForEvent('popup');
    await page.getByRole('button', { name: /WhatsApp/ }).first().click();
    await (await popup).close();
    await page.bringToFront();
    expect(w.starts.at(-1).lang).toBe('hinglish');
    await expect(page.getByText(`MettleUp code ${CODE}. Yeh bhejne ke baad MettleUp page par wapas jao.`)).toBeVisible();
    await leaveAndComeBack(page);
    const hiForm = page.getByRole('form', { name: 'PIN bhool gaye?' });
    await expect(hiForm.getByRole('status')).toContainText('Aapka message check ho raha hai…');
    await shot(page, 'phone-verify-checking-hinglish');
    await wait(page, 21_000);
    await expect(hiForm.getByRole('note')).toContainText('Aapka message abhi tak nahi mila.');
    await shot(page, 'phone-verify-still-nothing-hinglish', true);
  });

  test('computer: QR code; back on the page "Checking your message…", then what to do', async ({ page }) => {
    await signedOutOwner(page);
    await page.setViewportSize(COMPUTER);
    await forgotButton(page).click();
    const forgot = page.getByRole('form', { name: 'Forgot your PIN?' });
    await forgot.getByLabel('Your mobile number').fill(OWNER.phone);
    await forgot.getByRole('button', { name: 'Verify with WhatsApp' }).click();
    await expect(forgot.getByRole('img', { name: 'QR code that opens WhatsApp with the message ready' })).toBeVisible();
    await expect(forgot).toContainText(`No camera? Send "MettleUp code ${CODE}" to +91 90000 99999 on WhatsApp.`);
    const status = forgot.getByRole('status');
    await expect(status).toContainText(/Waiting for your message\. The code works for (10:00|9:\d\d) more minutes\./);
    await shot(page, 'computer-verify-before', true);
    await leaveAndComeBack(page);
    await expect(status).toContainText(/Checking your message… The code works for (10:00|9:\d\d) more minutes\./);
    await shot(page, 'computer-verify-checking', true);
    await wait(page, 21_000);
    await expect(forgot.getByRole('note')).toHaveText(
      'We have not got your message yet. On your phone, check that the message to MettleUp was sent in WhatsApp. If it was not, scan the code again and tap Send.',
    );
    await shot(page, 'computer-verify-still-nothing', true);
  });
});
