// F147 Bring a friend (4 Nov 2026), UAT on a phone (375 x 812) and a computer (1280 x 900). Every step taps
// the real screen; pictures go to e2e/.results/uat (CI uploads them as "dashboard-uat-pictures").
//
// The gym's side (an online gym on the pretend server):
//  1. Before the gym's server has 0056 the Settings card is not there at all.
//  2. With 0056: Settings -> Member app -> "Bring a friend": the owner sets 7 free days (saved on the gym record).
//  3. Ravi fills Asha's invite page: the enquiry arrives through the normal sync, "Referred by Asha Verma".
//  4. Add as member -> "Thank Asha Verma" -> one tap gives 7 free days (phone), or "Not now" and later from
//     the joined row (computer). Asha's plan moves from 16 Nov to 23 Nov 2026; the row says it was given.
// The friend's page (public/friend.html at /f/<code>, as the Worker serves it): the gym's name, the member's
// first name, the privacy line, the checks, a refusal from the server, and "Sent".
import { mkdirSync, readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { NOW, TODAY, addMember, addPlan, expectFitsPhone, open, openApp, openMember, openSettings, sell, sheet, startOnlineGym } from './support.mjs';

const DIR = 'e2e/.results/uat';
mkdirSync(DIR, { recursive: true });

async function shot(page, name, fullPage = true) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage });
}

function rosterIdOf(server, fullName) {
  const r = [...server.records.values()].find((x) => x.k === 'member' && !x.x && x.d.fullName === fullName);
  if (!r) throw new Error(`no member ${fullName}`);
  return r.id;
}

/** What 0056 friend_invite_send writes when Ravi fills Asha's page (a new record version, like the server). */
function friendFillsThePage(server) {
  server.version += 1;
  const id = 'friend-0a1b2c3d4e5f60718293a4b5c6d7e8f9';
  server.records.set(`enquiry:${id}`, {
    k: 'enquiry',
    id,
    x: false,
    ver: server.version,
    d: {
      id,
      gymId: server.gym.gymId,
      name: 'Ravi Kumar',
      phone: '+919829044444',
      interest: 'Best time to train: Evening',
      followUpOn: TODAY,
      status: 'open',
      memberId: null,
      source: 'friend',
      referral: { by: 'Asha Verma', memberId: rosterIdOf(server, 'Asha Verma'), time: 'evening' },
      createdAt: NOW.getTime(),
      updatedAt: NOW.getTime(),
    },
  });
}

const statusChip = (page, label) => page.getByRole('group', { name: 'Show enquiries' }).getByRole('button', { name: new RegExp(`^${label}`) });

for (const size of ['phone', 'computer']) {
  test.describe(`bring a friend on a ${size}`, () => {
    // The gym is set up at phone size (the shared helpers tap the phone's bottom bar); the computer run then
    // turns the window to 1280 x 900 and goes on by address, the way the payments UAT does.
    test.use({ viewport: { width: 375, height: 812 } });

    test(`F147 ${size}: free days in Settings, the referred enquiry, the owner's one-tap thank-you`, async ({ page }) => {
      const server = await openApp(page);
      await startOnlineGym(page);
      await addPlan(page, { name: 'Monthly', price: '1500', months: '1' });
      await addMember(page, { name: 'Asha Verma', phone: '98290 11111' });
      await sell(page, { received: '1500' });
      const main = page.getByRole('main');
      if (size === 'computer') await page.setViewportSize({ width: 1280, height: 900 });
      const phone = size === 'phone';
      const go = (path) =>
        page.evaluate((p) => {
          window.location.hash = p;
        }, path);
      const toSettingsApp = async () => {
        if (phone) await openSettings(page, 'Member app');
        else await go('/settings/app');
      };
      const toEnquiries = async () => {
        if (phone) await open(page, 'Enquiries');
        else await go('/enquiries');
        await expect(page.getByRole('heading', { name: 'Enquiries', exact: true })).toBeVisible();
      };
      const toAsha = async () => {
        if (phone) return openMember(page, 'Asha Verma');
        await go('/members');
        await main.getByRole('link', { name: /Asha Verma/ }).first().click();
        await expect(page.getByRole('heading', { name: 'Asha Verma', exact: true })).toBeVisible();
      };

      // 1. A server without 0056: no card.
      await toSettingsApp();
      await expect(main.getByText('Busy machines', { exact: true }).or(main.getByText('Challenges', { exact: true })).first()).toBeVisible();
      await expect(main.getByText('Bring a friend', { exact: true })).toHaveCount(0);

      // 2. With 0056: the card, empty (off) by default; the owner sets 7.
      server.friendServer = true;
      await page.reload();
      await toSettingsApp();
      const card = main.locator('section, div').filter({ has: page.getByText('Bring a friend', { exact: true }) }).filter({ has: page.getByLabel('Free days for each friend who joins') }).last();
      await expect(card).toBeVisible({ timeout: 15_000 });
      const days = page.getByLabel('Free days for each friend who joins');
      await expect(days).toHaveValue('');
      await expect(card).toContainText('Members can send a friend a link from the MettleUp app.');
      await expect(card).toContainText('Friends who left their number: 0 · Friends who joined: 0');
      await days.fill('90');
      await page.getByRole('button', { name: 'Save free days' }).tap();
      await expect(page.getByText('Type a whole number of days from 1 to 60, or leave it empty.')).toBeVisible();
      await days.fill('7');
      await page.getByRole('button', { name: 'Save free days' }).tap();
      await expect(page.getByText('Saved. A member gets 7 free days for each friend who joins.')).toBeVisible();
      await expect.poll(() => server.records.get('gym:gym')?.d?.friendRewardDays, { timeout: 15_000 }).toBe(7);
      await card.scrollIntoViewIfNeeded();
      await expectFitsPhone(page, 'on Settings with Bring a friend');
      await shot(page, `${size}-friend-1-settings`);

      // 3. Ravi fills Asha's invite page: the enquiry comes in with the usual sync.
      friendFillsThePage(server);
      await page.reload();
      await toEnquiries();
      const row = main.locator('div').filter({ has: page.getByText('Ravi Kumar', { exact: true }) }).filter({ has: page.getByRole('button', { name: 'Make Ravi Kumar a member' }) }).last();
      await expect(row).toBeVisible({ timeout: 15_000 });
      await expect(row).toContainText('Referred by Asha Verma');
      await expect(row).toContainText('Best time to train: Evening');
      await expect(row).toContainText('Heard about us: Friend');
      await expectFitsPhone(page, 'on Enquiries with a referred friend');
      await shot(page, `${size}-friend-2-enquiry`);

      // 4. Ravi joins: the thank-you opens.
      await row.getByRole('button', { name: 'Make Ravi Kumar a member' }).tap();
      const add = sheet(page, 'Add member');
      await expect(add.getByLabel('Full name')).toHaveValue('Ravi Kumar');
      await add.getByRole('button', { name: 'Add member' }).tap();
      const thank = sheet(page, 'Thank Asha Verma');
      await expect(thank).toBeVisible({ timeout: 15_000 });
      await expect(thank).toContainText('Ravi Kumar joined. Asha Verma invited them from the MettleUp app.');
      await expect(thank).toContainText('Asha Verma’s plan ends on 16 Nov 2026. With 7 free days it ends on 23 Nov 2026.');
      await expect(thank).toContainText('You set these free days in Settings → Member app.');
      await expectFitsPhone(page, 'in Thank Asha Verma');
      await shot(page, `${size}-friend-3-thank`, false);

      if (size === 'phone') {
        // One tap, straight away.
        await thank.getByRole('button', { name: 'Give 7 free days' }).tap();
      } else {
        // Later: "Not now" opens Ravi; the joined row keeps the offer.
        await thank.getByRole('button', { name: 'Not now' }).tap();
        await expect(page.getByRole('heading', { name: 'Ravi Kumar', exact: true })).toBeVisible();
        await toEnquiries();
        await statusChip(page, 'Joined').tap();
        const joined = main.locator('div').filter({ has: page.getByText('Ravi Kumar', { exact: true }) }).filter({ has: page.getByRole('button', { name: 'Give Asha Verma free days for bringing Ravi Kumar' }) }).last();
        await expect(joined).toContainText('Referred by Asha Verma');
        await shot(page, `${size}-friend-3b-joined-row-offer`);
        await joined.getByRole('button', { name: 'Give Asha Verma free days for bringing Ravi Kumar' }).tap();
        await sheet(page, 'Thank Asha Verma').getByRole('button', { name: 'Give 7 free days' }).tap();
      }
      const done = sheet(page, 'Free days added');
      await expect(done).toContainText('Asha Verma got 7 free days. Their plan now ends on 23 Nov 2026.');
      await shot(page, `${size}-friend-4-given`, false);
      await done.getByRole('button', { name: size === 'phone' ? 'Open Ravi Kumar' : 'Close' }).tap();
      await expect(done).toBeHidden();
      if (size === 'phone') await expect(page.getByRole('heading', { name: 'Ravi Kumar', exact: true })).toBeVisible();

      // Asha's plan carries the days, with the friend named in its history.
      await toAsha();
      await expect(main).toContainText('23 Nov 2026');
      await expect(main).toContainText('Reward - Bring a friend: Ravi Kumar');
      await shot(page, `${size}-friend-5-asha-plan`);

      // The joined row says it was given and offers nothing more.
      await toEnquiries();
      await statusChip(page, 'Joined').tap();
      await expect(main.getByText('Asha Verma got 7 free days for this friend.')).toBeVisible();
      await expect(main.getByRole('button', { name: /^Give Asha Verma free days/ })).toHaveCount(0);
      await expectFitsPhone(page, 'on a joined referred friend');
      await shot(page, `${size}-friend-6-joined-row`);

      // The Settings count.
      await toSettingsApp();
      await expect(main.getByTestId('friend-summary')).toHaveText('Friends who left their number: 1 · Friends who joined: 1');
    });
  });
}

// ---------------------------------------------------------------- the friend's page

const PUB = new URL('../public/', import.meta.url);

/** app.mettleup.fit/f/<code> the way the Worker serves it: friend.html with the gym written in, no CSP (_headers). */
async function serveFriendPage(page, gym, answers) {
  const sent = [];
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route(/^https:\/\/app\.mettleup\.fit\//, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/friend') {
      sent.push(route.request().postDataJSON());
      const [status, body] = answers.shift() ?? [201, { ok: true }];
      return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    }
    if (/^\/f\/[A-Za-z0-9]{8}$/.test(url.pathname)) {
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: readFileSync(new URL('friend.html', PUB)) });
    }
    return route.fulfill({ status: 404, body: 'Not found' });
  });
  // The Worker writes the gym into the page (joinPage); the same value, set before the page's script runs.
  await page.addInitScript((g) => {
    window.__GYM__ = g;
  }, gym);
  return sent;
}

async function noSideways(page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over).toBeLessThanOrEqual(1);
}

for (const [name, size] of [['phone', { width: 375, height: 812 }], ['computer', { width: 1280, height: 900 }]]) {
  test(`F147 friend page, ${name}: the gym, the checks, a refusal, then sent`, async ({ page }) => {
    await page.setViewportSize(size);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const sent = await serveFriendPage(page, { gymName: 'Shakti Gym', code: 'ABCD2345', inviter: 'Asha', brand: { accent: '#0E7C66' } }, [
      [429, { error: 'TOO_MANY' }],
      [201, { ok: true }],
    ]);
    await page.goto('https://app.mettleup.fit/f/ABCD2345');
    await expect(page.locator('#title')).toHaveText('Shakti Gym');
    await expect(page.locator('#sub')).toContainText('Asha invited you to train here.');
    await expect(page.locator('#privacy')).toContainText('Only Shakti Gym sees your number. Asha does not.');
    await expect(page).toHaveTitle('Asha invites you to Shakti Gym');
    await noSideways(page);
    await shot(page, `friend-page-1-form-${name}`);

    // Nothing typed: both boxes say what is missing, and nothing is sent.
    await page.getByRole('button', { name: /Send to the gym/ }).click();
    await expect(page.locator('#name-err')).toContainText('Type your name.');
    await expect(page.locator('#phone-err')).toContainText('Type a 10-digit mobile number.');
    expect(sent).toHaveLength(0);

    await page.getByLabel(/Your name/).fill('Ravi Kumar');
    await page.getByLabel(/Mobile number/).fill('98290 4444');
    await page.getByRole('button', { name: /Send to the gym/ }).click();
    await expect(page.locator('#phone-err')).toContainText('Type a 10-digit mobile number.');
    await expect(page.locator('#name-err')).toBeHidden();
    await page.getByLabel(/Mobile number/).fill('98290 44444');
    await page.getByRole('radio', { name: /Evening/ }).check();

    // The server's daily cap.
    await page.getByRole('button', { name: /Send to the gym/ }).click();
    await expect(page.locator('#form-err')).toContainText('Too many requests from this link today. Please try again tomorrow.');
    await shot(page, `friend-page-2-refused-${name}`);

    await page.getByRole('button', { name: /Send to the gym/ }).click();
    await expect(page.locator('#done')).toBeVisible();
    await expect(page.locator('#done-title')).toContainText('Sent. Shakti Gym will call you soon.');
    await expect(page.locator('#form')).toBeHidden();
    expect(sent[1]).toEqual({ code: 'ABCD2345', name: 'Ravi Kumar', phone: '9829044444', time: 'evening', website: '' });
    await noSideways(page);
    await shot(page, `friend-page-3-sent-${name}`);
    expect(errors).toEqual([]);
  });

  test(`F147 friend page, ${name}: a link that stopped working`, async ({ page }) => {
    await page.setViewportSize(size);
    await serveFriendPage(page, null, []);
    await page.goto('https://app.mettleup.fit/f/ZZZZ2345');
    await expect(page.locator('#none')).toBeVisible();
    await expect(page.locator('#none')).toContainText('This invite link does not work any more');
    await expect(page.locator('#form')).toBeHidden();
    await shot(page, `friend-page-4-stopped-${name}`);
  });
}
