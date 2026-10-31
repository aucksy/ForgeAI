// #38 (24 Oct 2026): the MettleUp terms and the data agreement, accepted online.
//
// J70: "Create my gym" needs the tick box; the version ticked is kept with the gym, and Settings ->
//      Your data says when and which version.
// J71: an existing gym's owner is asked once at sign-in ("Before you go on"); after "Agree and
//      continue" the panel opens and is never asked again. The front desk is never asked.
// J72: a server without 0033 asks nothing (the older journeys' world).
// J74: the data agreement link opens its own page (#59).
import { expect, test } from '@playwright/test';

import { SIGN_IN_CODE, expectFitsPhone, fillNewPin, open, openApp, typeSignIn, openSettings } from './support.mjs';

const BOX = /I agree to the MettleUp terms and the data agreement/;

test('J70 Create my gym: the terms box must be ticked, and the acceptance is kept', async ({ page }) => {
  const server = await openApp(page);
  server.termsServer = true;
  await page.getByRole('tab', { name: 'Set up a new gym' }).click(); // UAT B-11: one form at a time
  const start = page.locator('form').filter({ has: page.getByRole('button', { name: 'Create my gym' }) });
  await start.getByLabel('Gym name').fill('Shakti Gym');
  await start.getByLabel('Your name').fill('Ramesh Sharma');
  await start.getByLabel('Your mobile number').fill('98290 12345');
  await fillNewPin(start, '271828');
  // Both links open the real pages, in a new tab (the form is not lost).
  await expect(start.getByRole('link', { name: 'terms' })).toHaveAttribute('href', '/terms.html');
  await expect(start.getByRole('link', { name: 'data agreement' })).toHaveAttribute('href', '/data-agreement.html');
  await expect(start.getByRole('link', { name: 'terms' })).toHaveAttribute('target', '_blank');
  await start.getByRole('button', { name: 'Create my gym' }).tap();
  await expect(start.getByRole('alert')).toHaveText('Tick the box to agree to the terms. Then tap “Create my gym” again.');
  expect(server.calls).not.toContain('gym_create_online');
  await expectFitsPhone(page, 'with the terms box');

  await start.getByRole('checkbox', { name: BOX }).check();
  await start.getByRole('button', { name: 'Create my gym' }).tap();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible({ timeout: 15_000 });
  const made = server.log.find((c) => c.fn === 'gym_create_online');
  expect(made.args.p_terms_version).toBe('2026-10-24');
  // Not asked again: the box at "Create my gym" was the acceptance.
  await expect(page.getByText('Before you go on')).toHaveCount(0);

  await openSettings(page, 'Sign-in & data');
  await expect(page.getByRole('main')).toContainText('You accepted the terms on 17 Oct 2026 (version 2026-10-24).');
});

test('J71 an existing gym: the owner is asked once at sign-in; the desk never', async ({ page }) => {
  const server = await openApp(page);
  server.termsServer = true;
  server.gym.name = 'Shakti Gym';
  server.addPerson({ name: 'Ramesh Sharma', phone: '9829012345', role: 'owner', code: SIGN_IN_CODE });
  await typeSignIn(page, '98290 12345', SIGN_IN_CODE);

  await expect(page.getByRole('heading', { name: 'Before you go on' })).toBeVisible({ timeout: 15_000 });
  await expectFitsPhone(page, 'on Before you go on');
  await page.getByRole('button', { name: 'Agree and continue' }).tap();
  await expect(page.getByRole('alert')).toHaveText('Tick the box first. Then tap “Agree and continue”.');
  expect(server.calls).not.toContain('owner_accept_terms');
  await page.getByRole('checkbox', { name: BOX }).check();
  await page.getByRole('button', { name: 'Agree and continue' }).tap();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  expect(server.terms).toMatchObject({ version: '2026-10-24', by: 'Ramesh Sharma', how: 'sign_in' });

  // Opening the app again: not asked again.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Before you go on')).toHaveCount(0);
  await openSettings(page, 'Sign-in & data');
  await expect(page.getByRole('main')).toContainText('You accepted the terms on 17 Oct 2026 (version 2026-10-24).');
});

test('J71b the front desk is never asked, even before the owner accepted', async ({ page }) => {
  const server = await openApp(page);
  server.termsServer = true;
  server.gym.name = 'Shakti Gym';
  server.addPerson({ name: 'Sunita Verma', phone: '9829054321', role: 'staff', code: SIGN_IN_CODE });
  await typeSignIn(page, '98290 54321', SIGN_IN_CODE);
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Before you go on')).toHaveCount(0);
  expect(server.calls).not.toContain('owner_accept_terms');
});

test('J72 a server without the terms update asks nothing', async ({ page }) => {
  const server = await openApp(page);
  server.gym.name = 'Shakti Gym';
  server.addPerson({ name: 'Ramesh Sharma', phone: '9829012345', role: 'owner', code: SIGN_IN_CODE });
  await typeSignIn(page, '98290 12345', SIGN_IN_CODE);
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Before you go on')).toHaveCount(0);
  await openSettings(page, 'Sign-in & data');
  await expect(page.getByRole('main')).not.toContainText('You accepted the terms');
});

test('J73 the check can’t reach the server: the desk still opens; the owner is asked the next time', async ({ page }) => {
  const server = await openApp(page, { offline: ['owner_terms'] });
  server.termsServer = true;
  server.gym.name = 'Shakti Gym';
  server.addPerson({ name: 'Ramesh Sharma', phone: '9829012345', role: 'owner', code: SIGN_IN_CODE });
  await typeSignIn(page, '98290 12345', SIGN_IN_CODE);
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Before you go on')).toHaveCount(0);
  server.reconnect();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Before you go on' })).toBeVisible({ timeout: 15_000 });
});

// #59 (24 Oct 2026): "the data agreement" opens its own page under the site's security policy, with
// the version the tick box records, readable on a phone (no sideways scroll), never the admin app.
test('J74 the data agreement link opens its own page with the version the box records', async ({ page }) => {
  const errors = [];
  // The browser asks every page for /favicon.ico, which this static page does not name: not a fault.
  page.on('response', (r) => {
    if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) errors.push(`${r.status()} ${r.url()}`);
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  const res = await page.goto('/data-agreement.html');
  expect(res?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('MettleUp data agreement for gyms');
  await expect(page.locator('main')).toContainText('Version 2026-10-24.');
  await expect(page.locator('#root')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Privacy notice' })).toHaveAttribute('href', '/privacy.html');
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(wide).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});
