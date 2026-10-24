// MettleUp's new address (R-105, 24 Oct 2026): the admin app on the old address moves a desk to
// app.mettleup.fit only when it is safe, and carries the sign-in. Both addresses are played by this
// laptop's preview server (Playwright answers https://forgeai.aakashpahuja.in and
// https://app.mettleup.fit from it); the hand-over answer is the real Worker code (deploy/panel/hosts.js).
import { copyFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { expect, test } from '@playwright/test';


/** The Worker's own hand-over code (an ES module without a package.json, so loaded by its URL). */
let hosts;
async function handleMove(request) {
  if (!hosts) {
    // Copied as .mjs, so this runner reads it as a module (deploy/panel has no package.json).
    const copy = join(mkdtempSync(join(tmpdir(), 'hosts-')), 'hosts.mjs');
    copyFileSync(new URL('../../../deploy/panel/hosts.js', import.meta.url), copy);
    hosts = await import(pathToFileURL(copy).href);
  }
  return hosts.handleMove(request);
}

const LOCAL = 'http://localhost:4181';
const OLD = 'https://forgeai.aakashpahuja.in';
const NEW = 'https://app.mettleup.fit';

test.use({ serviceWorkers: 'block' });

/** Both addresses served from the preview server; the old one's /api/moved says `move`. */
async function twoAddresses(page, { move }) {
  const state = { move, posts: [] };
  // A request still in flight when the page moves to the other address is dropped by the browser:
  // answering it then fails, and that is expected, not a test failure.
  const passOn = async (route, u) => {
    try {
      await route.fulfill({ response: await route.fetch({ url: `${LOCAL}${u.pathname}${u.search}` }) });
    } catch (e) {
      if (!/closed|disposed|already handled/i.test(String(e))) throw e;
    }
  };
  await page.route(/^https:\/\/forgeai\.aakashpahuja\.in\//, async (route) => {
    const u = new URL(route.request().url());
    if (u.pathname === '/api/moved') return route.fulfill({ json: { move: state.move, to: NEW } });
    if (u.pathname.startsWith('/sb')) return route.fulfill({ status: 503, body: 'down' });
    return passOn(route, u);
  });
  await page.route(/^https:\/\/app\.mettleup\.fit\//, async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    if (u.pathname === '/api/move') {
      state.posts.push(req.postData());
      const res = await handleMove(
        new Request(req.url(), { method: req.method(), headers: { Origin: req.headers().origin ?? '', 'Content-Type': req.headers()['content-type'] ?? '' }, body: req.postData() }),
      );
      return route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: await res.text() });
    }
    if (u.pathname.startsWith('/sb')) return route.fulfill({ status: 503, body: 'down' });
    return passOn(route, u);
  });
  return state;
}

const SESSION = JSON.stringify({
  gymId: 'g-move',
  ownerKey: 'k'.repeat(40),
  joinCode: 'MOVE01',
  name: 'Shakti Gym',
  demo: false,
  online: true,
  person: { staffId: 's1', name: 'Ramesh Sharma', phone: '9829012345', role: 'owner' },
});

test('J105a nobody signed in, nothing waiting: the old address opens the same page on app.mettleup.fit', async ({ page }) => {
  await twoAddresses(page, { move: true });
  await page.goto(`${OLD}/start`);
  // Generous waits: the whole suite runs 4 at once on a slow laptop.
  await page.waitForURL(`${NEW}/start`, { timeout: 30_000 });
  await expect(page.getByText('Start your gym')).toBeVisible({ timeout: 20_000 });
});

test('J105b something saved offline still waits: the desk stays and is told why, nothing moves', async ({ page }) => {
  const state = await twoAddresses(page, { move: false });
  await page.goto(`${OLD}/`);
  await expect(page.getByText(/MettleUp is moving/)).toHaveCount(0);
  // One payment kept on this device for gym g-move, not sent yet (data/outbox.ts).
  await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('forgeai-outbox', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('gyms');
        req.onsuccess = () => {
          const t = req.result.transaction('gyms', 'readwrite');
          t.objectStore('gyms').put({ v: 1, gymId: 'g-move', items: [{ id: 'i1', kind: 'payment', at: 1, memberId: 'm1', records: [] }], desk: null, notes: [], seq: {} }, 'g-move');
          t.oncomplete = () => resolve(true);
          t.onerror = () => reject(t.error);
        };
      }),
  );
  state.move = true;
  await page.reload();
  await expect(page.getByText('MettleUp is moving to app.mettleup.fit. Sign in here first, so the 1 item saved on this device can be sent.', { exact: false })).toBeVisible();
  await page.waitForTimeout(6_000);
  expect(new URL(page.url()).origin).toBe(OLD);
  expect(state.posts).toEqual([]);
});

test('J105c signed in, nothing waiting: the sign-in goes along and the desk lands signed in on app.mettleup.fit', async ({ page }) => {
  const state = await twoAddresses(page, { move: false });
  await page.goto(`${OLD}/`);
  await page.evaluate((s) => {
    localStorage.setItem('forgeai.cloudGym.v1', s);
    localStorage.setItem('forgeai.theme.v1', 'light');
    localStorage.setItem('forgeai-crm-v1-before-online-1', '{"stays":"here"}');
  }, SESSION);
  state.move = true;
  await page.goto(`${OLD}/members`);
  await page.waitForURL(`${NEW}/members`, { timeout: 30_000 });
  // Sent as a form (never in the address), from the old address.
  expect(state.posts).toHaveLength(1);
  expect(state.posts[0]).toMatch(/^m=[A-Za-z0-9_-]+&to=%2Fmembers$/);
  const kept = await page.evaluate(() => ({
    gym: localStorage.getItem('forgeai.cloudGym.v1'),
    theme: localStorage.getItem('forgeai.theme.v1'),
    other: localStorage.getItem('forgeai-crm-v1-before-online-1'),
  }));
  expect(kept).toEqual({ gym: SESSION, theme: 'light', other: null });
  await expect(page.getByText('MettleUp is now at app.mettleup.fit. Save this address.', { exact: false })).toBeVisible();
});

test('J105d a hand-over from any other site is refused', async ({ page }) => {
  const res = await handleMove(
    new Request(`${NEW}/api/move`, { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'm=abc' }),
  );
  expect(res.status).toBe(403);
  void page;
});
