// UAT WP5b journey 25 (INVENTORY O-03): the owner signs in on a new device with his mobile and a
// code he makes on the phone already signed in. Wrong codes are refused in plain words, with the
// tries left; after five, even the right code waits until a new code is made (the server's rule,
// 0011, copied by the pretend server).
import { expect, test } from '@playwright/test';

import {
  OWNER,
  SIGN_IN_CODE,
  addMember,
  expectFitsPhone,
  open,
  openApp,
  personCard,
  secondPhone,
  sheet,
  startOnlineGym,
  tile,
  typeSignIn,
} from './support.mjs';

const WRONG = 'That code is wrong or too old. Check it, or ask your gym owner for a new code.';

test('J25 owner signs in on a new device with mobile + code; wrong codes get clear words', async ({ page, browser }) => {
  const server = await openApp(page);
  await startOnlineGym(page);
  await addMember(page, { name: 'Asha Verma', phone: '98290 11111' });

  // On the phone already signed in: his own row, Make sign-in code.
  await open(page, 'Staff & sign-in');
  await personCard(page, OWNER.name).getByRole('button', { name: 'Make sign-in code' }).tap();
  const mine = sheet(page, 'Your sign-in code');
  await expect(mine).toContainText('On your new phone or computer, open forgeai.aakashpahuja.in, tap Sign in, and type +91 98290 12345 and this code.');
  await expect(mine.getByLabel(`Code ${SIGN_IN_CODE.split('').join(' ')}`)).toBeVisible();
  await mine.getByRole('button', { name: 'Done' }).tap();

  // The new device.
  const laptop = await secondPhone(browser, server);
  const alert = laptop.getByRole('alert');
  // A number that is not a mobile, and a short code, are caught before anything is sent.
  await typeSignIn(laptop, '12345', SIGN_IN_CODE);
  await expect(alert).toHaveText('Type a 10-digit mobile number, like 98290 12345.');
  await typeSignIn(laptop, OWNER.phone, '4829');
  await expect(alert).toHaveText('Type the 6-digit code your gym owner gave you.');
  expect(server.calls.filter((c) => c === 'staff_sign_in')).toHaveLength(0);

  // Wrong codes: refused, with the tries left.
  await typeSignIn(laptop, OWNER.phone, '111111');
  await expect(alert).toHaveText(`${WRONG} (4 tries left)`);
  await expectFitsPhone(laptop, 'with a wrong sign-in code');
  for (const left of ['3 tries left', '2 tries left', '1 try left']) {
    await typeSignIn(laptop, OWNER.phone, '111111');
    await expect(alert).toHaveText(`${WRONG} (${left})`);
  }
  await typeSignIn(laptop, OWNER.phone, '111111');
  await expect(alert).toHaveText('That code is wrong. Too many tries. Wait 15 minutes, or ask your gym owner for a new code.');
  // Now even the right code waits.
  await typeSignIn(laptop, OWNER.phone, SIGN_IN_CODE);
  await expect(alert).toHaveText('Too many tries for this number. Wait 15 minutes, or ask your gym owner for a new code.');
  await expect(laptop.getByRole('heading', { name: 'Today', exact: true })).toHaveCount(0);

  // A new code clears the tries: he is in, as the owner, with his gym's records.
  await personCard(page, OWNER.name).getByRole('button', { name: 'Make sign-in code' }).tap();
  await sheet(page, 'Your sign-in code').getByRole('button', { name: 'Done' }).tap();
  await typeSignIn(laptop, OWNER.phone, SIGN_IN_CODE);
  await expect(laptop.getByRole('heading', { name: 'Today', exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(laptop.getByRole('banner')).toContainText(OWNER.gym);
  await expect(tile(laptop, "Today's collection")).toBeVisible();
  await expect(tile(laptop, 'Active members')).toBeVisible();
  await open(laptop, 'Members');
  await expect(laptop.getByRole('main').getByRole('link', { name: /Asha Verma/ })).toBeVisible();

  // The first phone's list: the owner is signed in on two devices, and can sign the other out.
  await open(page, 'Settings');
  await open(page, 'Staff & sign-in');
  await expect(personCard(page, OWNER.name)).toContainText('Signed in on 2 devices');
  await expect(personCard(page, OWNER.name).getByRole('button', { name: 'Sign out other devices' })).toBeVisible();
  await laptop.context().close();
});
