// 25 Oct 2026, the owner: "I submitted this query on the website for demo, the name and the phone
// number, but on my HQ app I don't see that". The landing page (public/home: index.html + home.js,
// under its real security policy from public/_headers) is opened as https://mettleup.fit/ on a phone,
// and its "free demo" forms are filled by real taps. Each POST /api/lead goes to the REAL website
// Worker code (deploy/panel/leads.js) writing into a real SQLite copy of D1 `forgeai-web` (built from
// its migrations), and HQ's own read (deploy/hq/web.js listLeads) must then show the lead.
// The cause found: the top form ("Or we call you") has only a number box. With the coloured gym-name
// box empty it refused, jumped up to that box (the refusal stayed below the screen) and nothing was
// sent; pressing Go in that box sends nothing either. Now the number alone is enough.
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

import { handleLead } from '../../../deploy/panel/leads.js';
import { sqliteD1 } from '../../../deploy/panel/sqliteD1.mjs';
import { listLeads } from '../../../deploy/hq/web.js';

const PUB = new URL('../public/', import.meta.url);
const CSP = /Content-Security-Policy: (.*)/.exec(readFileSync(new URL('_headers', PUB), 'utf8'))[1];
const TYPES = { js: 'text/javascript', html: 'text/html; charset=utf-8', svg: 'image/svg+xml', png: 'image/png', webp: 'image/webp', css: 'text/css' };

/** The landing page at https://mettleup.fit/, its /api/lead answered by the real Worker code. */
async function openSite(page, { server = 'up' } = {}) {
  const WEB = sqliteD1();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('https://mettleup.fit/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.pathname === '/api/lead') {
      if (server === 'down') return route.abort('internetdisconnected');
      const res = await handleLead(
        new Request(url, { method: req.method(), body: req.postData(), headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.9' } }),
        { WEB, FEEDBACK_SALT: 'salt' },
      );
      return route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: await res.text() });
    }
    const path = url.pathname === '/' ? 'home/index.html' : url.pathname.slice(1);
    let body;
    try {
      body = readFileSync(new URL(path, PUB));
    } catch {
      return route.fulfill({ status: 404, body: 'Not found' });
    }
    return route.fulfill({ status: 200, body, headers: { 'Content-Type': TYPES[path.split('.').pop()] || 'application/octet-stream', 'Content-Security-Policy': CSP } });
  });
  await page.goto('https://mettleup.fit/');
  return { WEB, errors, hq: () => listLeads(WEB) };
}

test('L1 top form, gym-name box left empty: the number is sent, thanked on screen, and shows in HQ', async ({ page }) => {
  const site = await openSite(page);
  const top = page.locator('form.callme');
  await expect(page.locator('#gymname')).toHaveValue('');
  await top.getByPlaceholder('Your WhatsApp number').fill('98290 12345');
  await top.getByRole('button', { name: 'Call me for a free demo' }).tap();
  await expect(top.getByRole('status')).toHaveText('Thank you! We will call you soon.');
  await expect(top.getByRole('status')).toBeInViewport();
  const rows = await site.hq();
  expect(rows.map((r) => [r.phone, r.gym, r.status])).toEqual([['9829012345', '', 'new']]);
  expect(site.errors).toEqual([]);
});

test('L2 top form with the gym name typed in the coloured box: both reach HQ', async ({ page }) => {
  const site = await openSite(page);
  await page.locator('#gymname').fill('  Shakti   Gym ');
  const top = page.locator('form.callme');
  await top.getByPlaceholder('Your WhatsApp number').fill('+91 98290 12346');
  await top.getByRole('button', { name: 'Call me for a free demo' }).tap();
  await expect(top.getByRole('status')).toHaveText('Thank you! We will call you soon.');
  expect((await site.hq()).map((r) => [r.phone, r.gym])).toEqual([['9829012346', 'Shakti Gym']]);
});

test('L3 Start form: a missing gym name is said on screen; filled in, every answer reaches HQ', async ({ page }) => {
  const site = await openSite(page);
  const form = page.locator('#demo');
  await form.getByLabel('WhatsApp number').fill('98290 12347');
  await form.getByRole('button', { name: 'Call me' }).tap();
  await expect(form.getByRole('status')).toHaveText('Type your gym’s name.');
  await expect(form.getByRole('status')).toBeInViewport();
  expect(await site.hq()).toEqual([]);
  await form.getByLabel('Gym name').fill('Iron Temple');
  await form.getByLabel('Members, roughly').selectOption('100-300');
  await form.getByLabel('How do you run the gym today?').selectOption('software');
  await form.getByRole('button', { name: 'Call me' }).tap();
  await expect(form.getByRole('status')).toHaveText('Thank you! We will call you soon.');
  const rows = await site.hq();
  expect(rows.map((r) => [r.phone, r.gym, r.city, r.size, r.today])).toEqual([['9829012347', 'Iron Temple', 'Jaipur', '100-300', 'software']]);
});

test('L4 every failure is said on screen: a short number, no internet', async ({ page }) => {
  const site = await openSite(page, { server: 'down' });
  const top = page.locator('form.callme');
  const box = top.getByPlaceholder('Your WhatsApp number');
  await box.fill('12345');
  await top.getByRole('button', { name: 'Call me for a free demo' }).tap();
  await expect(top.getByRole('status')).toHaveText('Type a 10-digit mobile number.');
  await expect(top.getByRole('status')).toBeInViewport();
  await box.fill('98290 12348');
  await top.getByRole('button', { name: 'Call me for a free demo' }).tap();
  await expect(top.getByRole('status')).toHaveText('Could not send. Check your internet and try again.');
  await expect(top.getByRole('status')).toBeInViewport();
  await expect(box).toHaveValue('98290 12348'); // kept, to try again
  expect(await site.hq()).toEqual([]);
});

test('L5 the sixth try in a day from one address is told to come back tomorrow (and the five are in HQ)', async ({ page }) => {
  const site = await openSite(page);
  const top = page.locator('form.callme');
  for (let i = 0; i < 6; i++) {
    await top.getByPlaceholder('Your WhatsApp number').fill(`9829012${String(350 + i)}`);
    await top.getByRole('button', { name: 'Call me for a free demo' }).tap();
    await expect(top.getByRole('status')).not.toHaveText('Sending…');
  }
  await expect(top.getByRole('status')).toHaveText('You have sent too many demo requests today. Please try again tomorrow.');
  expect(await site.hq()).toHaveLength(5);
});
