// R-117 (24 Oct 2026, migration 0034): each person's own lasting 6-digit PIN. The owner's words: "When I
// create a new gym ... later I have no code to sign in." Against a pretend server WITH 0034
// (server.pinServer); every other journey runs against a server before it.
//
// J80: Create my gym asks for a PIN (typed twice; weak ones refused), and the owner signs in with it later.
// J81: a desk person signs in with a one-time code, is offered a PIN once ("Not now"), and sets it later.
// J82: changing a PIN needs the current one; five wrong tries lock it; "Sign out everywhere" clears it.
import { expect, test } from '@playwright/test';

import {
  DESK,
  OWNER,
  SIGN_IN_CODE,
  addDeskPerson,
  expectFitsPhone,
  fillNewPin,
  open,
  openApp,
  personCard,
  secondPhone,
  sheet,
  signIn,
  startOnlineGym,
  typeSignIn,
} from './support.mjs';

const OWNER_TEN = '9829012345';
const DESK_TEN = '9829054321';

async function signOutHere(page) {
  await open(page, 'Staff & sign-in');
  await page.getByRole('button', { name: 'Sign out of this device' }).tap();
  await sheet(page, 'Sign out of this device?').getByRole('button', { name: 'Sign out' }).tap();
  await expect(page.getByText('You are signed out of this device.')).toBeVisible();
}

async function reopenPeople(page) {
  await open(page, 'Settings');
  await open(page, 'Staff & sign-in');
  await expect(page.getByText('Loading…')).toHaveCount(0);
}

test('J80 Create my gym: the owner chooses a PIN, then signs in with mobile + PIN', async ({ page }) => {
  const server = await openApp(page);
  server.pinServer = true;
  const start = page.locator('form').filter({ has: page.getByRole('button', { name: 'Create my gym' }) });
  await start.getByLabel('Gym name').fill(OWNER.gym);
  await start.getByLabel('Your name').fill(OWNER.name);
  await start.getByLabel('Your mobile number').fill(OWNER.phone);
  await expect(start).toContainText('You sign in with your mobile number and this PIN. Keep it private.');
  await start.getByRole('checkbox', { name: /I agree to the MettleUp terms and the data agreement/ }).check();
  const alert = start.getByRole('alert');

  // Weak or mistyped PINs are caught on the phone, before anything is sent.
  await start.getByRole('button', { name: 'Create my gym' }).tap();
  await expect(alert).toHaveText('Your PIN must be 6 digits.');
  await fillNewPin(start, '123456');
  await start.getByRole('button', { name: 'Create my gym' }).tap();
  await expect(alert).toHaveText('Don’t use digits in order, like 123456 or 654321. Pick a PIN that is hard to guess.');
  await fillNewPin(start, '777777');
  await start.getByRole('button', { name: 'Create my gym' }).tap();
  await expect(alert).toHaveText('Don’t use the same digit six times. Pick a PIN that is hard to guess.');
  await fillNewPin(start, OWNER.pin, '271829');
  await start.getByRole('button', { name: 'Create my gym' }).tap();
  await expect(alert).toHaveText('The two PINs are not the same. Type the same PIN in both boxes.');
  await expectFitsPhone(page, 'with the PIN boxes');
  expect(server.calls).not.toContain('gym_create_online');

  await fillNewPin(start, OWNER.pin);
  await start.getByRole('button', { name: 'Create my gym' }).tap();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible({ timeout: 15_000 });
  expect(server.log.find((c) => c.fn === 'gym_create_online').args.p_pin).toBe(OWNER.pin);
  // He chose it himself: nothing more to ask.
  await expect(sheet(page, 'Set your own PIN')).toHaveCount(0);

  // Staff & sign-in says how he signs in, and offers to change it.
  await open(page, 'Staff & sign-in');
  await expect(page.getByRole('main')).toContainText('You sign in with your mobile number and your own PIN');
  await expect(page.getByRole('button', { name: 'Change my PIN' })).toBeVisible();
  await expect(personCard(page, OWNER.name)).toContainText('PIN set');

  // Later, on this phone or any other: mobile number + PIN, no code from anyone.
  await page.getByRole('button', { name: 'Sign out of this device' }).tap();
  await sheet(page, 'Sign out of this device?').getByRole('button', { name: 'Sign out' }).tap();
  await expect(page.getByText('You are signed out of this device.')).toBeVisible();
  await signIn(page, OWNER.phone, OWNER.pin);
  await expect(page.getByRole('banner')).toContainText(OWNER.gym);
  await expect(sheet(page, 'Set your own PIN')).toHaveCount(0);
});

test('J81 a desk person signs in with a code, is offered a PIN once, and sets it later', async ({ page, browser }) => {
  const server = await openApp(page);
  server.pinServer = true;
  await startOnlineGym(page);
  await addDeskPerson(page);
  await expect(personCard(page, DESK.name)).toContainText('No PIN yet');

  // First sign-in with the owner's one-time code: asked once.
  const desk = await secondPhone(browser, server);
  await typeSignIn(desk, DESK.phone, SIGN_IN_CODE);
  const ask = sheet(desk, 'Set your own PIN');
  await expect(ask).toBeVisible({ timeout: 15_000 });
  await expect(ask).toContainText('You sign in with your mobile number and this PIN. Keep it private.');
  await expectFitsPhone(desk, 'in Set your own PIN');
  await ask.getByRole('button', { name: 'Not now' }).tap();
  await expect(ask).toBeHidden();
  await expect(desk.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  // Never asked twice.
  await desk.reload();
  await expect(desk.getByRole('heading', { name: 'Today', exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(sheet(desk, 'Set your own PIN')).toHaveCount(0);

  // Later: Staff & sign-in -> Set my PIN.
  await open(desk, 'Staff & sign-in');
  await expect(desk.getByRole('main')).toContainText('You have no PIN yet.');
  await desk.getByRole('button', { name: 'Set my PIN' }).tap();
  const set = sheet(desk, 'Set my PIN');
  await fillNewPin(set, '111111');
  await set.getByRole('button', { name: 'Save my PIN' }).tap();
  await expect(set.getByRole('alert')).toHaveText('Don’t use the same digit six times. Pick a PIN that is hard to guess.');
  await fillNewPin(set, '424242');
  await set.getByRole('button', { name: 'Save my PIN' }).tap();
  await expect(set).toBeHidden();
  await expect(desk.getByText('PIN saved. Sign in with your mobile number and this PIN.')).toBeVisible();
  expect(server.people.get(DESK_TEN).pin).toBe('424242');

  // The owner's list says so.
  await reopenPeople(page);
  await expect(personCard(page, DESK.name)).toContainText('PIN set');

  // And the desk signs in with it next time.
  await signOutHere(desk);
  await signIn(desk, DESK.phone, '424242');
  await expect(sheet(desk, 'Set your own PIN')).toHaveCount(0);
  await desk.context().close();
});

test('J82 changing a PIN needs the current one; wrong tries lock it; Sign out everywhere clears it', async ({ page, browser }) => {
  const server = await openApp(page);
  server.pinServer = true;
  await startOnlineGym(page);

  // Change my PIN: the current one first.
  await open(page, 'Staff & sign-in');
  await page.getByRole('button', { name: 'Change my PIN' }).tap();
  const change = sheet(page, 'Change my PIN');
  await expect(change).toContainText('Forgot it? Make yourself a sign-in code in the list below');
  await change.getByLabel('Your new PIN (6 digits)').fill('314159');
  await change.getByLabel('Type the PIN again').fill('314159');
  await change.getByRole('button', { name: 'Save my PIN' }).tap();
  await expect(change.getByRole('alert')).toHaveText('Type your current PIN first.');
  await change.getByLabel('Your current PIN').fill('000001');
  await change.getByRole('button', { name: 'Save my PIN' }).tap();
  await expect(change.getByRole('alert')).toHaveText('That is not your current PIN. (4 tries left)');
  await expectFitsPhone(page, 'in Change my PIN');
  await change.getByLabel('Your current PIN').fill(OWNER.pin);
  await change.getByRole('button', { name: 'Save my PIN' }).tap();
  await expect(change).toBeHidden();
  expect(server.people.get(OWNER_TEN).pin).toBe('314159');

  // Someone guessing on another phone: five wrong tries, then even the right PIN waits.
  const laptop = await secondPhone(browser, server);
  const alert = laptop.getByRole('alert');
  for (const left of ['4 tries left', '3 tries left', '2 tries left', '1 try left']) {
    await typeSignIn(laptop, OWNER.phone, '999990');
    await expect(alert).toContainText(left);
  }
  await typeSignIn(laptop, OWNER.phone, '999990');
  await expect(alert).toHaveText('That PIN or code is wrong. Too many tries. Wait 15 minutes, or get a new code.');
  await typeSignIn(laptop, OWNER.phone, '314159');
  await expect(alert).toHaveText('Too many tries for this number. Wait 15 minutes, or get a new code.');
  await expect(laptop.getByRole('heading', { name: 'Today', exact: true })).toHaveCount(0);
  await laptop.context().close();

  // A desk person with a PIN who is signed in nowhere: the owner can still clear it.
  await addDeskPerson(page);
  server.people.get(DESK_TEN).pin = '424242';
  await reopenPeople(page);
  const sunita = personCard(page, DESK.name);
  await expect(sunita).toContainText('PIN set');
  await sunita.getByRole('button', { name: 'Sign out everywhere' }).tap();
  const out = sheet(page, `Sign ${DESK.name} out everywhere?`);
  await expect(out).toContainText('Their PIN stops working too. To get back in, they need a new code; then they set a new PIN.');
  await out.getByRole('button', { name: 'Sign out' }).tap();
  await expect(out).toBeHidden();
  await expect(sunita).toContainText('No PIN yet');
  expect(server.people.get(DESK_TEN).pin).toBeNull();
});
