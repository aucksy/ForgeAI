// UAT WP5b journeys 20-22 (INVENTORY O-04, O-55): a gym kept only in this browser goes online.
//
// J20: "Put gym online" works first time: the records go up and the owner is signed in.
// J21: the shop was turned on first (an old owner key). The copy stops half-way (no internet); the
//      words say nothing was lost; "Finish going online" carries on with the SAME online gym, nothing
//      is copied twice, and the old owner key stops working.
// J22: "Turn on the shop": no internet first (says so), then the gym code and the 12 sample products.
import { expect, test } from '@playwright/test';

import { OWNER, addMember, browserOnlyGym, eraseAndStartFresh, chooseFile, expectFitsPhone, membersFile, open, openApp, openSettings } from './support.mjs';

/** Settings -> "Put your gym online" card. */
function putOnlineCard(page) {
  return page
    .getByRole('main')
    .locator('div')
    .filter({ has: page.getByRole('heading', { name: 'Put your gym online' }) })
    .filter({ has: page.getByRole('button', { name: /^(Put gym online|Finish going online)$/ }) })
    .last();
}

test('J20 put the browser gym online: the records go up and the owner is signed in', async ({ page }) => {
  const server = await browserOnlyGym(page);
  await addMember(page, { name: 'Asha Verma', phone: '98290 11111' });
  await openSettings(page, 'Sign-in & data');
  await expect(page.getByRole('main')).toContainText('Saved in this browser only.');
  const card = putOnlineCard(page);
  await expect(card).toContainText('Right now your members and payments are only in this browser.');
  await card.getByLabel('Your name').fill(OWNER.name);
  await card.getByLabel('Your mobile number').fill(OWNER.phone);
  await card.getByRole('button', { name: 'Put gym online' }).tap();

  // Lands on Staff & sign-in, signed in as the owner.
  await expect(page.getByRole('heading', { name: 'Staff & sign-in', exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('main')).toContainText(OWNER.name);
  await expect(page.getByRole('main')).toContainText('+91 98290 12345');
  await expectFitsPhone(page, 'on Staff & sign-in after going online');
  expect(server.calls.filter((c) => c === 'gym_create_online')).toHaveLength(1);
  expect(server.rows('member').map((m) => m.fullName)).toEqual(['Asha Verma']);

  // Settings now says online; the member is read back from the server.
  await openSettings(page, 'Sign-in & data');
  await expect(page.getByRole('main')).toContainText('Saved online. Safe if a phone or computer breaks.');
  await expect(page.getByRole('main')).toContainText('1 member · 0 memberships · 0 payments · 0 check-ins.');
  await expect(page.getByRole('button', { name: 'Erase and start fresh' })).toHaveCount(0);
  await page.reload();
  await open(page, 'Members');
  await expect(page.getByRole('main').getByRole('link', { name: /Asha Verma/ })).toBeVisible();
});

test('J20b the demo opened without internet is made up: it is never offered to go online (U-A12)', async ({ page }) => {
  const server = await openApp(page, { offline: ['demo_start_gym'] });
  await page.getByRole('button', { name: 'Start demo' }).tap();
  await page.getByRole('button', { name: 'Open the demo without the shop (works without internet)' }).tap();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  server.reconnect();
  await openSettings(page, 'Sign-in & data');
  const main = page.getByRole('main');
  await expect(main).toContainText('This is the demo gym');
  await expect(main).toContainText(
    'Its members are made up, and they are kept only in this browser. They can’t be put online. To set up your real gym, tap “Erase and start fresh” at the bottom of this page. Then add your members and put your gym online.',
  );
  await expect(page.getByRole('button', { name: 'Put gym online' })).toHaveCount(0);
  await expectFitsPhone(page, 'on Settings for the demo kept in this browser');
  // Erased, it is the owner's own gym: now it may go online.
  await eraseAndStartFresh(page);
  await expect(page.getByRole('button', { name: 'Put gym online' })).toBeVisible();
  await expect(main).not.toContainText('This is the demo gym');
});

test('J21 going online stops half-way: nothing lost; "Finish going online" ends it, nothing twice, old key retired', async ({ page }, testInfo) => {
  const server = await browserOnlyGym(page);

  // The shop was turned on earlier: this gym has a code and an old owner key.
  await openSettings(page, 'Member app');
  await page.getByRole('button', { name: 'Turn on the shop' }).tap();
  await expect(page.getByLabel('Gym code Q A 0 0 0 1')).toBeVisible();
  const oldKey = [...server.ownerKeys][0];
  expect(oldKey).toBeTruthy();

  // 420 members: more than one copy step (400 records a step), so the copy can stop in the middle.
  await chooseFile(page, await membersFile(testInfo, 'members-420.csv', 420));
  await page.getByRole('button', { name: 'Add 420 members' }).tap();
  await expect(page.getByText('420 added, 0 skipped')).toBeVisible();

  // Put it online. The first step goes up, then the internet drops.
  await openSettings(page, 'Sign-in & data');
  const card = putOnlineCard(page);
  await card.getByLabel('Your name').fill(OWNER.name);
  await card.getByLabel('Your mobile number').fill(OWNER.phone);
  server.dropAfterCalls('crm_push', 1);
  await card.getByRole('button', { name: 'Put gym online' }).tap();
  await expect(card.getByRole('alert')).toHaveText(
    'Can’t reach the internet. Check the connection and try again. Nothing in this browser was lost. Tap the button again to continue.',
    { timeout: 15_000 },
  );
  // Still this browser's gym, all 420 here; the button now finishes the same move.
  await expect(page.getByRole('main')).toContainText('420 members · 0 memberships');
  await expect(page.getByRole('main')).toContainText('Saved in this browser only.');
  await expect(card.getByLabel('Your name')).toHaveCount(0);
  await expectFitsPhone(page, 'after going online stopped');
  expect(server.rows('member').length).toBeLessThan(420);

  // The internet is back: Finish going online.
  server.reconnect();
  await card.getByRole('button', { name: 'Finish going online' }).tap();
  await expect(page.getByRole('heading', { name: 'Staff & sign-in', exact: true })).toBeVisible({ timeout: 15_000 });

  // One online gym (the shop's, never a second one), every member once.
  expect(server.calls.filter((c) => c === 'owner_go_online')).toHaveLength(1);
  expect(server.calls.filter((c) => c === 'gym_create_online')).toHaveLength(0);
  const phones = server.rows('member').map((m) => m.phone);
  expect(phones).toHaveLength(420);
  expect(new Set(phones).size).toBe(420);
  // The old owner key no longer opens the gym.
  expect(server.retiredKeys.has(oldKey)).toBe(true);
  expect(() => server.checkKey(oldKey)).toThrow('BAD_KEY');

  await open(page, 'Members');
  await expect(page.getByText('420 members', { exact: true })).toBeVisible();
  await openSettings(page, 'Sign-in & data');
  await expect(page.getByRole('main')).toContainText('Saved online.');
  // The gym code stays the same for members.
  await page.getByRole('group', { name: 'Settings view' }).getByRole('button', { name: 'Member app' }).tap();
  await expect(page.getByLabel('Gym code Q A 0 0 0 1')).toBeVisible();
});

test('J22 turn on the shop: no internet says so; then the gym code and the 12 sample products', async ({ page }) => {
  const server = await browserOnlyGym(page);
  await openSettings(page, 'Member app');
  const turnOn = page.getByRole('button', { name: 'Turn on the shop' });
  await expect(page.getByRole('main')).toContainText('Turn on the shop to get your gym code. It comes with 12 sample products you can change or delete.');

  // No internet: the words say so, and nothing changes.
  server.offline.add('demo_start_gym');
  await turnOn.tap();
  await expect(page.getByRole('main').getByRole('alert')).toHaveText('Can’t reach the internet. Check the connection and try again.');
  await expect(turnOn).toBeVisible();
  await expectFitsPhone(page, 'after the shop failed to turn on');

  // Back online.
  server.reconnect();
  await turnOn.tap();
  await expect(page.getByLabel('Gym code Q A 0 0 0 1')).toBeVisible();
  await expect(page.getByRole('main')).toContainText('Members join in the MettleUp app with gym code');
  await expect(page.getByRole('button', { name: 'Turn on the shop' })).toHaveCount(0);
  // The shop is this gym's own: named after it.
  expect(server.log.filter((c) => c.fn === 'demo_start_gym').at(-1)?.args.p_name).toBe('Iron Temple Fitness');

  // Shop -> Products: the 12 samples, all shown in the app.
  await open(page, 'Shop');
  await page.getByRole('group', { name: 'Shop section' }).getByRole('button', { name: 'Products' }).tap();
  await expect(page.getByRole('main')).toContainText('12 products · 12 shown in the app');
  for (const name of ['Whey protein 1 kg', 'Shaker bottle 700 ml', 'Black coffee, cold brew']) {
    await expect(page.getByRole('main').getByText(name, { exact: true })).toBeVisible();
  }
  await expectFitsPhone(page, 'on Shop products');

  // Today shows the code too.
  await open(page, 'Today');
  await expect(page.getByLabel('Gym code Q A 0 0 0 1')).toBeVisible();
});
