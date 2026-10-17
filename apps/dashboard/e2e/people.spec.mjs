// UAT WP5b journey 13 (INVENTORY O-64 / X-12, F-32): the owner signs a front-desk person out of
// every device, lets them back in with a new code, then removes them. Two phones on one pretend
// server: the owner's, and the desk's. The desk's phone finds out by itself, on its next refresh.
import { expect, test } from '@playwright/test';

import {
  DESK,
  addDeskPerson,
  expectFitsPhone,
  open,
  openApp,
  personCard,
  secondPhone,
  sheet,
  signIn,
  startOnlineGym,
  typeSignIn,
  wait,
} from './support.mjs';

const SIGNED_OUT_WORDS = 'You were signed out of this gym. Ask your gym owner for a new sign-in code.';

/** Staff & sign-in, opened again so the list is read fresh from the server. */
async function reopenPeople(page) {
  await open(page, 'Settings');
  await open(page, 'Staff & sign-in');
  await expect(page.getByText('Loading…')).toHaveCount(0);
}

test('J13 owner signs a desk person out everywhere, lets them back in, then removes them', async ({ page, browser }) => {
  const server = await openApp(page);
  await startOnlineGym(page);
  await addDeskPerson(page);

  // Sunita signs in on the desk phone.
  const desk = await secondPhone(browser, server);
  await signIn(desk, DESK.phone);
  await expect(desk.getByRole('banner')).toContainText('Shakti Gym');

  // The owner's list shows her signed in on one device.
  await reopenPeople(page);
  const sunita = personCard(page, DESK.name);
  await expect(sunita).toContainText('Signed in on 1 device');

  // Sign out everywhere: asks first, says she can come back with a new code.
  await sunita.getByRole('button', { name: 'Sign out everywhere' }).tap();
  const out = sheet(page, `Sign ${DESK.name} out everywhere?`);
  await expect(out).toContainText(`${DESK.name} is signed out of every phone and computer. They can sign in again with a new code.`);
  await expectFitsPhone(page, 'in Sign out everywhere');
  await out.getByRole('button', { name: 'Sign out' }).tap();
  await expect(out).toBeHidden();
  await expect(page.getByText('Signed out.', { exact: true })).toBeVisible();
  await expect(sunita).toContainText('Signed out');
  await expect(sunita).not.toContainText('Signed in on');
  await expect(sunita.getByRole('button', { name: 'Sign out everywhere' })).toHaveCount(0);

  // The desk phone, on its next refresh: back at the sign-in door, told why and what to do.
  await wait(desk, 16_000);
  await expect(desk.getByRole('status').filter({ hasText: SIGNED_OUT_WORDS })).toBeVisible();
  await expect(desk.getByRole('button', { name: 'Sign in' })).toBeVisible();
  await expect(desk.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
  await expectFitsPhone(desk, 'on Welcome after being signed out');

  // A new code lets her back in.
  await personCard(page, DESK.name).getByRole('button', { name: 'Make sign-in code' }).tap();
  await sheet(page, `Sign-in code for ${DESK.name}`).getByRole('button', { name: 'Done' }).tap();
  await signIn(desk, DESK.phone);
  await reopenPeople(page);
  await expect(personCard(page, DESK.name)).toContainText('Signed in on 1 device');

  // Remove her: asks first, says she can't come back, and that members and payments stay.
  await personCard(page, DESK.name).getByRole('button', { name: 'Remove' }).tap();
  const remove = sheet(page, `Remove ${DESK.name}?`);
  await expect(remove).toContainText(
    `${DESK.name} is signed out of every phone and computer. They can’t sign in again. Your members and payments stay as they are.`,
  );
  await remove.getByRole('button', { name: 'Remove' }).tap();
  await expect(remove).toBeHidden();
  await expect(page.getByText(`${DESK.name} removed.`)).toBeVisible();
  await expect(page.getByRole('main').getByText(DESK.name, { exact: true })).toHaveCount(0);
  // Only the owner is left on the list.
  await expect(page.getByRole('main').getByRole('button', { name: 'Make sign-in code' })).toHaveCount(1);
  expect([...server.people.values()].map((p) => p.name)).toEqual(['Ramesh Sharma']);

  // The desk phone is signed out on its next refresh, and her old code no longer works.
  await wait(desk, 16_000);
  await expect(desk.getByRole('status').filter({ hasText: SIGNED_OUT_WORDS })).toBeVisible();
  await typeSignIn(desk, DESK.phone, '482913');
  await expect(desk.getByRole('alert')).toContainText('That code is wrong or too old. Check it, or ask your gym owner for a new code.');
  await expect(desk.getByRole('heading', { name: 'Today', exact: true })).toHaveCount(0);
  await desk.context().close();
});
