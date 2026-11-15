// R-563 UAT (owner, 15 Nov 2026): ONE link per gym, on a phone or a computer. "I just want this to be simple that the
// gym will have their webpage under our domain they can use that to be published on their Google Maps or they can
// share it with anyone users go to that page read the information and then join from there".
// Pictures: e2e/.results/uat/onelink-*.png (CI keeps them as dashboard-uat-pictures).
//
//  ONELINK-1 gym web pages off (today): Invite members shows "Your gym’s join link", works on a phone or a computer,
//            no "on your phone" anywhere; its WhatsApp message and poster carry the same link. Phone, computer,
//            light, dark, English, Hinglish.
//  ONELINK-2 pages on, the page published: the same card is "Your gym’s web page": the page is the one link for
//            WhatsApp, the poster and Google Maps.
//  ONELINK-3 pages on, no page yet: still the join link, with the way to make the page; the set-up step shows.
//  ONELINK-4 the visitor: the gym's page (the real renderGymPage) -> "Become a member" -> the same join form on the
//            same address, with "Back to the page of <gym>", phone and computer, light and dark, English and Hindi.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { TODAY, addPlan, expectFitsPhone, openApp, startOnlineGym } from './support.mjs';

const DIR = 'e2e/.results/uat';
mkdirSync(DIR, { recursive: true });
const PUB = new URL('../public/', import.meta.url);
const SIZES = { phone: { width: 390, height: 844 }, computer: { width: 1280, height: 900 } };
const SLUG = 'shakti-gym-sector-12';

async function shot(page, name, fullPage = true) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/onelink-${name}.png`, fullPage });
}

/** The Worker's GYM_PAGES switch as GET /api/switches says it (the panel asks when it opens). */
async function pagesSwitch(page, on) {
  await page.context().route('**/api/switches', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ gymPages: on, joinPay: false, aiCharge: false }) }),
  );
}

/** owner_gym_page (0080) on the pretend server: `page` null = not made yet. */
function webPageOnServer(server, page) {
  const base = server.answer.bind(server);
  server.answer = (fn, args) => {
    if (fn !== 'owner_gym_page') return base(fn, args);
    server.calls.push(fn);
    const p = server.anyone(args.p_key);
    return { canEdit: p.role === 'owner', page };
  };
}

const PUBLISHED = {
  slug: SLUG, published: true, indexable: false, hiddenByHq: false, hqNote: null, area: 'Sector 12', city: 'Jaipur',
  about: 'A friendly gym near the market.', highlights: ['ac'], photos: [], mapsUrl: '', lat: null, lng: null,
  showPhone: false, whatsapp: false, aiHelper: true, termsAt: 1, updatedAt: 1,
};

/** "Become a member" works for this gym (0077), with the gym's own plans. */
async function joinOnlineReady(page, server) {
  await page.route(/\/rest\/v1\/rpc\/self_join_preview/, (route) => {
    const plans = [...server.records.values()]
      .filter((r) => r.k === 'plan' && !r.x && r.d.active !== false)
      .map((r) => ({ id: r.id, name: r.d.name, durationUnit: 'month', durationCount: 1, priceP: r.d.priceP, joiningFeeP: r.d.joiningFeeP ?? 0, totalP: r.d.priceP + (r.d.joiningFeeP ?? 0) }));
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ gymName: server.gym.name || 'Shakti Gym', joinCode: server.gym.joinCode, brand: {}, closed: false, today: TODAY, lastDay: '2026-11-16', plans }) });
  });
}

/** WhatsApp is not opened: the address it would open is kept. */
async function keepOpened(page) {
  await page.addInitScript(() => {
    window.__opened = [];
    window.open = (u) => {
      window.__opened.push(String(u));
      return null;
    };
  });
}
const lastWhatsApp = async (page) => {
  const u = await page.evaluate(() => window.__opened.at(-1));
  return decodeURIComponent(new URL(u).searchParams.get('text') ?? '');
};

async function gymReady(page, { pagesOn, webPage }) {
  await pagesSwitch(page, pagesOn);
  await keepOpened(page);
  const server = await openApp(page);
  if (webPage !== undefined) webPageOnServer(server, webPage);
  await startOnlineGym(page);
  await addPlan(page, { name: 'Monthly', price: '1500', joining: '500', months: '1' });
  await joinOnlineReady(page, server);
  return server;
}

async function openInvite(page, title = 'Invite members') {
  await page.goto('./#/settings/invite');
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible({ timeout: 15_000 });
}

/** The one-link card: the smallest box with its heading and its WhatsApp button. */
const linkCard = (page) =>
  page
    .getByRole('main')
    .locator('div')
    .filter({ has: page.getByRole('heading', { name: /^(Your gym’s join link|Your gym’s web page|Aapke gym ka (join link|web page))$/ }) })
    .filter({ has: page.getByRole('button', { name: /WhatsApp/ }) })
    .last();

test('ONELINK-1 pages off: "Your gym’s join link" on a phone or a computer, one link for WhatsApp and the poster; Hinglish', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize(SIZES.phone);
  const server = await gymReady(page, { pagesOn: false });
  await page.reload();
  await openInvite(page);
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Your gym’s join link' })).toBeVisible({ timeout: 15_000 });
  const card = linkCard(page);
  await expect(card).toContainText('https://app.mettleup.fit/m/QA0002');
  await expect(card).toContainText('People can open this link on a phone or a computer to ask to join your gym.');
  // Only phone words that are true for a computer too: nothing says "on your phone" / "own phone".
  await expect(main).not.toContainText(/on your phone|own phone|Join on your phone/);
  // No web page words while pages are off.
  await expect(card).not.toContainText(/Google Maps|web page/);
  expect(server.calls).not.toContain('owner_gym_page');
  // The poster: the same link under its QR.
  await expect(card.getByRole('img', { name: 'QR code for https://app.mettleup.fit/m/QA0002' })).toBeVisible();
  await expect(card).toContainText('Become a member');
  await expect(card).toContainText('No app needed. On a computer, type the link below. Ask at the desk if you need help.');
  // WhatsApp: the same link, last line.
  await card.getByRole('button', { name: 'Send join link on WhatsApp' }).tap();
  const msg = await lastWhatsApp(page);
  expect(msg.split('\n')).toEqual(['Hi!', 'Become a member of Shakti Gym online. Pick a plan and send your details. You pay at the gym desk.', '', 'Open this link to join:', 'https://app.mettleup.fit/m/QA0002']);
  await card.scrollIntoViewIfNeeded();
  await expectFitsPhone(page, 'on Invite members, pages off');
  await shot(page, '1-off-phone-light');

  // Settings -> Member app's small card says the same.
  await page.goto('./#/settings/app');
  await expect(main.getByText('Your gym’s join link', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(main.getByText('People pick a plan on a phone or a computer and send it to you. They pay at the desk.')).toBeVisible();
  await expect(main).not.toContainText(/Join on your phone|own phone/);
  await main.getByText('Your gym’s join link', { exact: true }).scrollIntoViewIfNeeded();
  await shot(page, '1-off-settings-card-phone', false);

  // A computer, dark.
  await page.setViewportSize(SIZES.computer);
  await page.emulateMedia({ colorScheme: 'dark' });
  await openInvite(page);
  await expect(main.getByRole('heading', { name: 'Your gym’s join link' })).toBeVisible({ timeout: 15_000 });
  await shot(page, '1-off-computer-dark');

  // Hinglish, phone.
  await page.setViewportSize(SIZES.phone);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.evaluate(() => localStorage.setItem('forgeai.lang.v1', 'hinglish'));
  await page.reload();
  await openInvite(page, 'Members ko bulao');
  await expect(main.getByRole('heading', { name: 'Aapke gym ka join link' })).toBeVisible({ timeout: 15_000 });
  await expect(main).toContainText('Log yeh link phone ya computer par kholkar aapke gym mein join karne ke liye pooch sakte hain.');
  await expect(main.getByRole('button', { name: 'Join link WhatsApp par bhejo' })).toBeVisible();
  await linkCard(page).scrollIntoViewIfNeeded();
  await expectFitsPhone(page, 'on Invite members, Hinglish');
  await shot(page, '1-off-phone-hinglish', false);
});

for (const [size, scheme] of [
  ['phone', 'light'],
  ['phone', 'dark'],
  ['computer', 'light'],
]) {
  test(`ONELINK-2 pages on, page published (${size} ${scheme}): "Your gym’s web page" is the one link for WhatsApp, the poster and Google Maps`, async ({ page }) => {
    test.setTimeout(120_000);
    // The gym is set up on a phone (support.mjs walks the phone's bottom bar), then looked at in this size.
    await page.setViewportSize(SIZES.phone);
    await page.emulateMedia({ colorScheme: scheme });
    await gymReady(page, { pagesOn: true, webPage: PUBLISHED });
    await page.setViewportSize(SIZES[size]);
    await page.reload();
    await openInvite(page);
    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { name: 'Your gym’s web page' })).toBeVisible({ timeout: 15_000 });
    const card = linkCard(page);
    await expect(card).toContainText(`https://join.mettleup.fit/${SLUG}`);
    await expect(card).toContainText('This is your gym’s one link. People can open it on a phone or a computer, see your fees, timings and photos, and tap “Become a member” to ask to join.');
    await expect(card).toContainText('Put this link on your gym’s Google Maps listing. In Google Business Profile, open Edit profile and paste it as your website.');
    await expect(card).not.toContainText('/m/QA0002');
    await expect(card.getByRole('img', { name: `QR code for https://join.mettleup.fit/${SLUG}` })).toBeVisible();
    await expect(card).toContainText('See our fees and become a member');
    await expect(card).toContainText('Tap “Become a member”');
    await card.getByRole('button', { name: 'Send your page on WhatsApp' }).tap();
    const msg = await lastWhatsApp(page);
    expect(msg.split('\n')).toEqual(['Hi!', 'See the fees, timings and photos of Shakti Gym, and become a member online. You pay at the gym desk.', '', 'Open our page:', `https://join.mettleup.fit/${SLUG}`]);
    await expect(main).not.toContainText(/on your phone|own phone/);
    if (size === 'phone') await expectFitsPhone(page, 'on Invite members, page published');
    await card.scrollIntoViewIfNeeded();
    await shot(page, `2-page-${size}-${scheme}`);
    if (size === 'phone' && scheme === 'light') {
      await page.evaluate(() => localStorage.setItem('forgeai.lang.v1', 'hinglish'));
      await page.reload();
      await openInvite(page, 'Members ko bulao');
      await expect(main.getByRole('heading', { name: 'Aapke gym ka web page' })).toBeVisible({ timeout: 15_000 });
      await expect(main).toContainText('Yeh link apne gym ki Google Maps listing par daalo.');
      await expect(main.getByRole('button', { name: 'Apna page WhatsApp par bhejo' })).toBeVisible();
      await linkCard(page).scrollIntoViewIfNeeded();
      await expectFitsPhone(page, 'on Invite members, page, Hinglish');
      await shot(page, '2-page-phone-hinglish', false);
    }
  });
}

test('ONELINK-3 pages on, no page yet: still the join link, with the way to make the page; the set-up step shows', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize(SIZES.phone);
  await gymReady(page, { pagesOn: true, webPage: null });
  await page.reload();
  await openInvite(page);
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Your gym’s join link' })).toBeVisible({ timeout: 15_000 });
  const card = linkCard(page);
  await expect(card).toContainText('https://app.mettleup.fit/m/QA0002');
  await expect(card).toContainText('Make your free gym web page, and this card will share it instead.');
  await card.scrollIntoViewIfNeeded();
  await shot(page, '3-no-page-yet-phone', false);
  await card.getByRole('link', { name: 'Make your web page' }).tap();
  await expect(page.getByRole('heading', { name: 'Your web page', level: 1 })).toBeVisible({ timeout: 15_000 });
  // The set-up step is there while pages are on (WEBPAGE-0 proves it hides while they are off).
  await page.goto('./#/setup');
  await expect(main.getByText('Let people find and join your gym online')).toBeVisible({ timeout: 15_000 });
  await main.getByText('Let people find and join your gym online').scrollIntoViewIfNeeded();
  await shot(page, '3-setup-step-pages-on', false);
});

// ---------------------------------------------------------------- the visitor

const HOURS = { week: Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, { kind: 'hours', ranges: [{ open: '05:30', close: '22:00' }] }])), special: [], note: '' };
const PUBLIC_RAW = {
  slug: SLUG, gymName: 'Shakti Gym', area: 'Sector 12', city: 'Jaipur', joinCode: 'QA0002', brand: { accent: '#e8590c' },
  about: 'A friendly gym near the market. Ladies batch every morning.', highlights: ['ac', 'women'], photos: [],
  plans: [{ id: 'm', name: 'Monthly', durationUnit: 'month', durationCount: 1, priceP: 150000, joiningFeeP: 50000 }],
  hours: HOURS, address: 'Plot 4, Sector 12, Jaipur', contact: { phone: null, whatsapp: false }, joinOnline: true, indexable: false,
};
/**
 * The real page (deploy/panel/gymPage.js renderGymPage), drawn by plain node: gymPage.js imports a .ts file that node
 * reads but Playwright's loader does not (importing it here stopped every spec, CI run 43689330990).
 */
function gymPageHtml(nowMs) {
  const mod = new URL('../../../deploy/panel/gymPage.js', import.meta.url).href;
  const code = `const m = await import(${JSON.stringify(mod)}); process.stdout.write(m.renderGymPage(m.pageFrom(${JSON.stringify(PUBLIC_RAW)}), { nowMs: ${nowMs} }));`;
  return execFileSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}
const JOIN_GYM = {
  gymName: 'Shakti Gym', joinCode: 'QA0002', brand: { accent: '#e8590c' }, closed: false, today: '2026-11-15', lastDay: '2026-12-15',
  plans: [{ id: 'm', name: 'Monthly', durationUnit: 'month', durationCount: 1, priceP: 150000, joiningFeeP: 50000, totalP: 200000 }],
};

/** join.mettleup.fit as the Worker serves it once pages are on: the gym's page and, on the same address, /m/<CODE>. */
async function serveJoinHost(page) {
  const html = gymPageHtml(Date.parse('2026-11-15T18:00:00+05:30'));
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('https://fonts.gstatic.com/**', (r) => r.fulfill({ status: 404, body: '' }));
  await page.route('https://hdxzqbdiokjklnypfisq.supabase.co/rest/v1/rpc/self_join_preview', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(JOIN_GYM) }));
  await page.route(/^https:\/\/join\.mettleup\.fit\//, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === `/${SLUG}`) return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
    if (url.pathname === '/vendor/qrcode-generator-2.0.4.js') return route.fulfill({ status: 200, contentType: 'text/javascript', body: readFileSync(new URL('vendor/qrcode-generator-2.0.4.js', PUB)) });
    if (url.pathname === '/gym-page/page.js') return route.fulfill({ status: 200, contentType: 'text/javascript', body: readFileSync(new URL('gym-page/page.js', PUB)) });
    if (/^\/m\/[A-Za-z0-9]{6}$/.test(url.pathname)) return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: readFileSync(new URL('join-online.html', PUB)) });
    return route.fulfill({ status: 404, body: 'Not found' });
  });
  await page.addInitScript((g) => {
    window.__GYM__ = g;
  }, JOIN_GYM);
}

for (const [size, scheme, lang] of [
  ['phone', 'light', 'en'],
  ['phone', 'dark', 'hi'],
  ['computer', 'light', 'en'],
  ['computer', 'dark', 'hi'],
]) {
  test(`ONELINK-4 visitor (${size} ${scheme} ${lang}): the gym's page, "Become a member", the same join form on the same address, and back`, async ({ page }) => {
    await page.setViewportSize(SIZES[size]);
    await page.emulateMedia({ colorScheme: scheme });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await serveJoinHost(page);
    await page.goto(`https://join.mettleup.fit/${SLUG}`);
    const become = page.getByRole('link', { name: /^Become a member/ }).first();
    await expect(become).toHaveAttribute('href', `https://join.mettleup.fit/m/QA0002?page=${SLUG}`);
    await expect(page.locator('body')).not.toContainText(/on your phone/);
    if (size === 'phone') await expectFitsPhone(page, 'on the gym page');
    await shot(page, `4-gym-page-${size}-${scheme}`, false);

    await become.click();
    await expect(page).toHaveURL(`https://join.mettleup.fit/m/QA0002?page=${SLUG}`);
    await expect(page.locator('#title')).toHaveText('Shakti Gym', { timeout: 15_000 });
    await expect(page.locator('#form')).toBeVisible();
    const back = page.locator('#back');
    await expect(back).toBeVisible();
    await expect(back).toHaveAttribute('href', `https://join.mettleup.fit/${SLUG}`);
    await expect(back).toContainText('Back to the page of Shakti Gym');
    if (lang === 'hi') {
      await page.locator('#lang').click();
      await expect(back).toContainText('Shakti Gym के पेज पर वापस जाएँ');
    }
    if (size === 'phone') await expectFitsPhone(page, 'on the join form');
    if (size === 'computer') {
      // On a computer the form is one readable column in the middle, not stretched across the screen.
      const box = await page.locator('main').boundingBox();
      expect(box.width).toBeLessThanOrEqual(480);
      expect(Math.abs(box.x + box.width / 2 - 640)).toBeLessThan(20);
    }
    await shot(page, `4-join-form-${size}-${scheme}-${lang}`, false);

    await back.click();
    await expect(page).toHaveURL(`https://join.mettleup.fit/${SLUG}`);
    await expect(page.getByRole('link', { name: /^Become a member/ }).first()).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('ONELINK-4b the join link on its own (an old poster, WhatsApp): no back link; a made-up ?page= is ignored', async ({ page }) => {
  await page.setViewportSize(SIZES.phone);
  await serveJoinHost(page);
  await page.goto('https://join.mettleup.fit/m/QA0002');
  await expect(page.locator('#title')).toHaveText('Shakti Gym', { timeout: 15_000 });
  await expect(page.locator('#back')).toBeHidden();
  await page.goto('https://join.mettleup.fit/m/QA0002?page=%22%3E%3Cscript%3E');
  await expect(page.locator('#title')).toHaveText('Shakti Gym', { timeout: 15_000 });
  await expect(page.locator('#back')).toBeHidden();
  await page.goto('https://join.mettleup.fit/m/QA0002?page=evil.example');
  await expect(page.locator('#back')).toBeHidden();
});
