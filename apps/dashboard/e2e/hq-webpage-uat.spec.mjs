// R-563 (owner, 15 Nov 2026): HQ's "Web page" switch for one gym, driven like a person on a phone (390 x 844) with
// computer pictures (1280 x 900), light and dark. The HQ page is the real one (apps/hq/public, served as files); only
// its Worker (/api/*) is pretend, answering the way deploy/hq/api.js answers (hq_gym_page / hq_set_gym_page, 0090,
// and the panel's GYM_PAGES as `pagesLive`). Pictures: e2e/.results/uat/hq-webpage-*.png.
//
//  1. Gym web pages still off for every gym: the card says why, and the gym's own switch is On (the default).
//  2. Switch it off (asks first, with a note): the card says Off and what that means; the log line says it.
//  3. Switch it back on.
//  4. Pages open for every gym: no "switched off for every gym" line.
//  5. Before 0090: the card says the database update waits for his yes, and offers no button.
import { mkdirSync, readFileSync } from 'node:fs';
import { extname } from 'node:path';

import { expect, test } from '@playwright/test';

const DIR = 'e2e/.results/uat';
mkdirSync(DIR, { recursive: true });
const HQ = 'http://hq.test';
const PUBLIC = new URL('../../hq/public/', import.meta.url);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const NOW = new Date('2026-11-15T10:00:00Z');
const GYM_ID = '11111111-2222-4333-8444-555555555555';

async function shot(page, name, fullPage = true) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/hq-webpage-${name}.png`, fullPage });
}

async function computerShot(page, name) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await shot(page, `computer-${name}`);
  await page.setViewportSize({ width: 390, height: 844 });
}

/** HQ's Worker with 0090 (or without it: `has0090` false) and the panel's GYM_PAGES as `pagesLive`. */
class FakeHq {
  constructor({ has0090 = true, pagesLive = false } = {}) {
    this.has0090 = has0090;
    this.pagesLive = pagesLive;
    this.page = { pageOn: true, slug: 'test-fitness-sector-12', published: true, hiddenByHq: false };
    this.sets = [];
    this.gym = {
      gymId: GYM_ID, name: 'Test Fitness', joinCode: 'TEST01', status: 'active', createdAt: '2026-10-10T05:00:00Z',
      trialStartsAt: '2026-10-10T05:00:00Z', trialEndsAt: '2027-01-10T18:29:59Z', plan: null, billing: null, paidUntil: null,
      membersRegister: 40, membersApp: 12, checkins7: 30, checkins30: 90, moneyThisMonthP: 4500000, moneyLastMonthP: 0,
      receiptsCancelledThisMonth: 0, orders30: 0, staff: 2, liveDevices: 2, failedSignins24h: 0, lastDeskActivity: '2026-11-15T09:00:00Z',
      owners: [{ staffId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', name: 'Test Owner', phone: '9000000000' }],
      deleteRequest: null, supportUntil: null, supportOpenedBy: null, recentHq: [],
    };
  }

  answer(method, path, body) {
    if (path === '/api/me') return [200, { email: 'hq@test.example' }];
    if (path === '/api/needs') return [200, { leadsNew: 0, feedbackNew: 0, helpNeedsReply: 0, gymsNew: 0, paymentsWaiting: 0, paymentsToCheck: null }];
    if (path === '/api/gym') {
      return [200, { gym: { ...this.gym }, aiLimit: null, aiDays: [], normalAiLimit: 50, plansReady: true, webPage: this.has0090 ? { ...this.page } : null, pagesLive: this.pagesLive }];
    }
    if (path === '/api/gym/web-page' && method === 'POST') {
      if (!this.has0090) return [503, { error: 'PAGE_NOT_READY' }];
      this.sets.push(body);
      this.page.pageOn = body.on;
      this.gym.recentHq = [{ at: NOW.toISOString(), action: body.on ? 'gym_page_on' : 'gym_page_off', reason: body.reason || null }, ...this.gym.recentHq];
      return [200, { ok: true, pageOn: body.on }];
    }
    if (path === '/api/gyms') return [200, { gyms: [{ ...this.gym }], groups: [] }];
    return [404, { error: 'NOT_FOUND' }];
  }

  async attach(page) {
    await page.route(`${HQ}/**`, async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.startsWith('/api/')) {
        let body = {};
        try {
          body = route.request().postDataJSON() ?? {};
        } catch {
          body = {};
        }
        const [status, json] = this.answer(route.request().method(), url.pathname, body);
        await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) });
        return;
      }
      const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      if (!/^[a-z0-9./_-]+$/i.test(file) || file.includes('..')) {
        await route.fulfill({ status: 404, body: '' });
        return;
      }
      try {
        const data = readFileSync(new URL(file, PUBLIC));
        await route.fulfill({ status: 200, contentType: TYPES[extname(file)] ?? 'application/octet-stream', body: data });
      } catch {
        await route.fulfill({ status: 404, body: '' });
      }
    });
  }
}

test.use({ serviceWorkers: 'block' });

for (const scheme of ['light', 'dark']) {
  test(`R-563 HQ web page switch (${scheme}): pages off for every gym, this gym on by default, off, on again`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    const hq = new FakeHq({ pagesLive: false });
    await hq.attach(page);
    const asked = [];
    page.on('dialog', (d) => {
      asked.push(d.message());
      void d.accept();
    });
    await page.clock.install({ time: NOW });
    await page.goto(`${HQ}/#gym/${GYM_ID}`);
    const card = page.locator('#web-page-card');
    await expect(card.getByRole('heading', { name: 'Web page' })).toBeVisible();
    // 1. Why no gym has a page yet, and this gym's own switch (on by default).
    await expect(card).toContainText('Gym web pages are switched off for every gym until you approve the page words.');
    await expect(card).toContainText('On. Test Fitness can make its free web page, and it is a step in Set up your gym.');
    await expect(card).toContainText('Published at join.mettleup.fit/test-fitness-sector-12.');
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width, 'nothing wider than the phone').toBeLessThanOrEqual(390);
    await card.scrollIntoViewIfNeeded();
    await shot(page, `1-on-pages-off-${scheme}`, false);
    if (scheme === 'light') await computerShot(page, '1-on-pages-off');

    // 2. Off, with a note; it asks first.
    await card.getByLabel('Note').fill('Owner asked to stop the page for now');
    await card.getByRole('button', { name: 'Switch the web page off' }).click();
    await expect(page.locator('#main')).toContainText('The web page of Test Fitness is switched off.');
    expect(asked.at(-1)).toBe('Switch off the web page of Test Fitness? Visitors will not see it, and the owner will not see “Your web page”. The join link still works.');
    expect(hq.sets.at(-1)).toEqual({ gymId: GYM_ID, on: false, reason: 'Owner asked to stop the page for now' });
    await expect(card).toContainText('Off. Test Fitness’s web page does not open, and the owner does not see “Your web page”. The join link still works.');
    await expect(card.getByRole('button', { name: 'Switch the web page on' })).toBeVisible();
    await expect(page.locator('#main')).toContainText('Switched a gym’s web page off · Owner asked to stop the page for now');
    await card.scrollIntoViewIfNeeded();
    await shot(page, `2-off-${scheme}`, false);
    if (scheme === 'light') await computerShot(page, '2-off');

    // 3. On again: no question, no note.
    await card.getByRole('button', { name: 'Switch the web page on' }).click();
    await expect(page.locator('#main')).toContainText('The web page of Test Fitness is switched on.');
    expect(hq.sets.at(-1)).toEqual({ gymId: GYM_ID, on: true, reason: '' });
    await expect(card).toContainText('On. Test Fitness can make its free web page');
    await shot(page, `3-on-again-${scheme}`, false);
  });
}

test('R-563 HQ web page switch: once pages are open for every gym the line goes; before 0090 it says the update waits', async ({ page }) => {
  const open = new FakeHq({ pagesLive: true });
  await open.attach(page);
  await page.clock.install({ time: NOW });
  await page.goto(`${HQ}/#gym/${GYM_ID}`);
  const card = page.locator('#web-page-card');
  await expect(card).toContainText('On. Test Fitness can make its free web page');
  await expect(card).not.toContainText('switched off for every gym');
  await card.scrollIntoViewIfNeeded();
  await shot(page, '4-pages-open', false);

  await page.unroute(`${HQ}/**`);
  const old = new FakeHq({ has0090: false, pagesLive: false });
  await old.attach(page);
  await page.reload();
  await expect(card).toContainText('The web page switch for one gym needs the database update 0090 (waiting for your yes).');
  await expect(card.getByRole('button')).toHaveCount(0);
  await card.scrollIntoViewIfNeeded();
  await shot(page, '5-before-0090', false);
});
