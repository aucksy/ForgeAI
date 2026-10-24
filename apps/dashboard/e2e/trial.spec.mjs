// R-97 (24 Oct 2026): the free-trial line on the owner's Today screen (migration 0030), the direct
// sign-up link /start, and "install the admin app" offered only once signed in. Pretend server:
// support.mjs (its clock: Saturday 17 Oct 2026, 10:00 India time).
import { expect, test } from '@playwright/test';

import { expectFitsPhone, open, openApp, startOnlineGym } from './support.mjs';

const trial = (endsAt, extra = {}) => ({ startsAt: '2026-10-17T04:30:00Z', endsAt, plan: null, billing: null, paidUntil: null, ...extra });

/** Leave Today and come back, so its free-trial line asks the server again. */
async function backToToday(page) {
  await open(page, 'Members');
  await open(page, 'Today');
}

test('J97a the owner sees how long the free trial has left; nothing before the server has it', async ({ page }) => {
  const server = await openApp(page);
  await startOnlineGym(page);
  const main = page.getByRole('main');
  // A server before 0030: no line at all.
  await expect(main.getByText('Free trial', { exact: false })).toHaveCount(0);

  server.hqTrial = trial('2026-11-27T04:30:00Z');
  await backToToday(page);
  await expect(main.getByText('Free trial: 41 days left (ends 27 Nov 2026)')).toBeVisible();
  await expect(main.getByRole('link', { name: 'See prices' })).toHaveCount(0);
  await expectFitsPhone(page, 'on Today with the free-trial line');

  // The last 14 days: stronger, with the price list in a new tab.
  server.hqTrial = trial('2026-10-24T04:30:00Z');
  await backToToday(page);
  await expect(main.getByText('Free trial: 7 days left (ends 24 Oct 2026). Pick a ForgeAI pack to keep going after that.')).toBeVisible();
  const plans = main.getByRole('link', { name: 'See prices' });
  await expect(plans).toHaveAttribute('href', 'https://forgeai.aakashpahuja.in/home/#pricing');
  await expect(plans).toHaveAttribute('target', '_blank');

  // After the end: words only, nothing locked.
  server.hqTrial = trial('2026-10-10T04:30:00Z');
  await backToToday(page);
  await expect(main.getByText('Your free trial ended on 10 Oct 2026. Pick a ForgeAI pack to keep going. Your members’ app keeps working.')).toBeVisible();
  await open(page, 'Members');
  await expect(page.getByRole('button', { name: '+ Add member' }).first()).toBeEnabled();

  // A gym with a plan: no line.
  server.hqTrial = trial('2026-10-10T04:30:00Z', { plan: 'pro', billing: 'yearly', paidUntil: '2027-10-17T04:30:00Z' });
  await open(page, 'Today');
  await expect(main.getByText('Free trial', { exact: false })).toHaveCount(0);
  await expect(main.getByText('free trial ended', { exact: false })).toHaveCount(0);
});

test('J97b the sign-up link /start opens "Start my gym" first, and lands on the gym', async ({ page }) => {
  await openApp(page);
  await page.goto('./start');
  const first = page.getByRole('heading', { level: 2 }).first();
  await expect(first).toHaveText('Start your gym');
  await expect(page.getByText('Free for 3 months. No card. Your members’ app is free, always.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Already use ForgeAI? Sign in' })).toBeVisible();
  await expectFitsPhone(page, 'on the sign-up link');
  await startOnlineGym(page);
  expect(new URL(page.url()).pathname, 'the address is the app’s own after sign-up').toBe('/');
});

test('J97c "Install the admin app" is offered only once signed in (no manifest on the sign-in page)', async ({ page }) => {
  await openApp(page);
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(0);
  await startOnlineGym(page);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
});
