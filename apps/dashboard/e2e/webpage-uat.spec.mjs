// F207 / R-529 UAT (14 Nov 2026): the owner's "Your web page" screen. Pictures for a person to read:
// e2e/.results/uat/webpage-*.png (CI keeps them as dashboard-uat-pictures).
//
// The pretend server answers 0080 (owner_gym_page, owner_save_gym_page) and 0082 (owner_gym_page_photo_slot) the way
// the migrations do, and the private photo bucket's upload and download. Neither is live yet: the real server answers
// "no such function", and then the screen and its menu row stay away (the other journeys show that).
//
// The owner's hard rule "show a feature only when it is on" (coordinator, 14 Nov 2026): every web page part of the
// admin app waits for the Worker's GYM_PAGES switch, read from GET /api/switches (gympage/pagesOpen.ts). The other
// journeys get no answer there, so the parts stay hidden for them. WEBPAGE-0 proves each part hidden while it is off
// and shown, all together and with no reload, once it is on; WEBPAGE-1 to 3 run with it on.
import { mkdirSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { DESK, NOW, TODAY, addDeskPerson, addPlan, bottomBar, expectFitsPhone, open, openApp, secondPhone, sheet, signIn, startOnlineGym, toast } from './support.mjs';

const DIR = 'e2e/.results/uat';
mkdirSync(DIR, { recursive: true });

async function shot(page, name, fullPage = true) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/webpage-${name}.png`, fullPage });
}

const GYM_UUID = '5e1f0c2a-7b3d-4e8f-9a01-23456789abcd';
const TAKEN = new Set(['iron-temple-gym']);

/** The page row and calls on the pretend server, as 0080 and 0082 keep them. */
function installWebPage(server, { page = null } = {}) {
  const state = { page, saves: [], slots: 0 };
  const base = server.answer.bind(server);
  server.answer = (fn, args) => {
    if (!['owner_gym_page', 'owner_save_gym_page', 'owner_gym_page_photo_slot'].includes(fn)) return base(fn, args);
    server.calls.push(fn);
    server.log.push({ fn, args });
    if (fn === 'owner_gym_page') {
      const p = server.anyone(args.p_key);
      return { canEdit: p.role === 'owner', page: state.page };
    }
    if (fn === 'owner_gym_page_photo_slot') {
      server.ownerOnly(args.p_key);
      state.slots += 1;
      const id = String(state.slots).padStart(32, '0');
      return { ok: true, gymId: GYM_UUID, photoId: id, path: `${GYM_UUID}/${id}.webp`, url: `https://join.mettleup.fit/p/${GYM_UUID}/${id}.webp` };
    }
    server.ownerOnly(args.p_key);
    const pg = args.p_page;
    state.saves.push(pg);
    if (!/^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/.test(pg.slug) || pg.slug.includes('--')) return { error: 'BAD_SLUG' };
    if (TAKEN.has(pg.slug)) return { error: 'SLUG_TAKEN' };
    const termsAt = state.page?.termsAt ?? (pg.published && pg.termsAgreed ? NOW.getTime() : null);
    if (pg.published && termsAt === null) return { error: 'NEEDS_TERMS' };
    state.page = {
      slug: pg.slug, published: pg.published, indexable: pg.indexable, hiddenByHq: state.page?.hiddenByHq ?? false, hqNote: state.page?.hqNote ?? null,
      area: pg.area, city: pg.city, about: pg.about, highlights: pg.highlights, photos: pg.photos, mapsUrl: pg.mapsUrl, lat: pg.lat, lng: pg.lng,
      showPhone: pg.showPhone, whatsapp: pg.whatsapp, aiHelper: pg.aiHelper, termsAt, updatedAt: NOW.getTime(),
    };
    return { ok: true, page: state.page };
  };
  return state;
}

/**
 * The Worker's GYM_PAGES switch as GET /api/switches says it. Call before openApp (the panel asks when it opens), then
 * `follow(server)` so a second phone gets the same answer. `sw.on` can change while the panel is open.
 */
async function pagesSwitch(page, on) {
  const sw = { on, asked: 0 };
  const add = (context) =>
    context.route('**/api/switches', (route) => {
      sw.asked += 1;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ gymPages: sw.on }) });
    });
  await add(page.context());
  sw.follow = (server) => {
    const attach = server.attach.bind(server);
    server.attach = async (context) => {
      await attach(context);
      await add(context);
    };
  };
  return sw;
}

/** An enquiry asked on the web page, as 0080's gym_page_ask_send keeps it. */
function pageQuestion(server) {
  server.version += 1;
  const id = 'page-0001';
  const d = {
    id, gymId: server.gym.gymId, name: 'Pooja Meena', phone: '+919829077777', interest: 'Asked on your web page: Is there a ladies batch in the evening?',
    followUpOn: TODAY, status: 'open', memberId: null, source: null,
    pageAsk: { v: 1, name: 'Pooja Meena', question: 'Is there a ladies batch in the evening?', at: NOW.getTime() },
    createdAt: NOW.getTime(), updatedAt: NOW.getTime(),
  };
  server.records.set(`enquiry:${id}`, { k: 'enquiry', id, x: false, ver: server.version, d });
}

/** The private photo bucket: uploads are kept; a download gives the photo back. */
async function photoBucket(context, png) {
  const kept = [];
  await context.route(/\/storage\/v1\/object\/(authenticated\/)?gym-page-photos\//, async (route) => {
    const req = route.request();
    if (req.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'image/png', body: png, headers: { 'access-control-allow-origin': '*' } });
      return;
    }
    kept.push({ url: req.url(), type: req.headers()['content-type'] ?? '' });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ Key: 'gym-page-photos/x', Id: 'x' }) });
  });
  return kept;
}

/** A gym photo drawn in the browser (a big one, so it is shrunk). */
async function gymPhoto(page, fill, words) {
  const b64 = await page.evaluate(
    ({ fill, words }) => {
      const c = document.createElement('canvas');
      c.width = 2400;
      c.height = 1600;
      const g = c.getContext('2d');
      g.fillStyle = fill;
      g.fillRect(0, 0, 2400, 1600);
      g.fillStyle = '#ffffff';
      g.font = 'bold 160px sans-serif';
      g.fillText(words, 160, 860);
      return c.toDataURL('image/png').split(',')[1];
    },
    { fill, words },
  );
  return Buffer.from(b64, 'base64');
}

/** Settings -> Gym details: the phone and address the page shows, typed the way the owner does. */
async function gymDetails(page) {
  await page.goto('./#/settings');
  const main = page.getByRole('main');
  await main.getByLabel('Phone', { exact: true }).fill('98290 12345');
  await main.getByLabel('Address', { exact: true }).fill('Plot 4, near Durga Mandir, Sector 12, Jaipur');
  await main.getByRole('button', { name: 'Save details' }).tap();
  await expect(toast(page)).toBeVisible();
}

const editor = (page) => page.getByRole('main');

async function openWebPage(page) {
  await open(page, 'Your web page');
  await expect(page.getByRole('heading', { name: 'Your web page', level: 1 })).toBeVisible();
}

test('WEBPAGE-0 every web page part is hidden while gym web pages are off, and all show once they are on, with no reload', async ({ page }) => {
  const sw = await pagesSwitch(page, false);
  const server = await openApp(page);
  installWebPage(server);
  await startOnlineGym(page);
  pageQuestion(server);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible({ timeout: 15_000 });
  expect(sw.asked).toBeGreaterThan(0);
  const main = page.getByRole('main');

  // OFF. More: no "Your web page" row (Gym timings is there, so the group is drawn).
  await bottomBar(page).getByRole('link', { name: /^More/ }).tap();
  await expect(main.getByRole('link', { name: /^Gym timings/ })).toBeVisible();
  await expect(main.getByRole('link', { name: /^Your web page/ })).toHaveCount(0);
  await shot(page, 'off-more');
  // Set up your gym: no web page step.
  await page.goto('./#/setup');
  await expect(main.getByText('Add your plans', { exact: false }).first()).toBeVisible();
  await expect(main.getByText('Make your free gym web page')).toHaveCount(0);
  await shot(page, 'off-setup');
  // Enquiries: the person is there, but no "Asked on your web page" (nor the server's copy of it for older apps).
  await page.goto('./#/enquiries');
  await expect(main.getByText('Pooja Meena').first()).toBeVisible({ timeout: 15_000 });
  await expect(main.getByText(/Asked on your web page/)).toHaveCount(0);
  await shot(page, 'off-enquiry');
  // A typed address goes to Settings; the gym's page was never asked for.
  await page.goto('./#/settings/web-page');
  await expect(page).toHaveURL(/#\/settings$/);
  expect(server.calls).not.toContain('owner_gym_page');

  // ON: the Worker says so; the panel hears it when it comes back to the front. No reload.
  sw.on = true;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.goto('./#/enquiries');
  await expect(main.getByText('Asked on your web page', { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(main.getByText('“Is there a ladies batch in the evening?”')).toBeVisible();
  await shot(page, 'on-enquiry');
  await page.goto('./#/setup');
  await expect(main.getByText('Make your free gym web page')).toBeVisible({ timeout: 10_000 });
  await shot(page, 'on-setup');
  await bottomBar(page).getByRole('link', { name: /^More/ }).tap();
  await expect(main.getByRole('link', { name: /^Your web page/ })).toBeVisible({ timeout: 10_000 });
  await shot(page, 'on-more');
  await main.getByRole('link', { name: /^Your web page/ }).tap();
  await expect(page.getByRole('heading', { name: 'Your web page', level: 1 })).toBeVisible();
  await expect(main.getByText('Not made yet. Fill in the parts below, then publish.')).toBeVisible();

  // OFF again (MettleUp closes pages): everything goes away together, again with no reload.
  sw.on = false;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page).toHaveURL(/#\/settings$/, { timeout: 10_000 });
  await bottomBar(page).getByRole('link', { name: /^More/ }).tap();
  await expect(main.getByRole('link', { name: /^Gym timings/ })).toBeVisible();
  await expect(main.getByRole('link', { name: /^Your web page/ })).toHaveCount(0);
});

test('WEBPAGE-1 owner on a phone: empty, every error, refused without the tick, photos, published and locked', async ({ page }) => {
  await pagesSwitch(page, true);
  const server = await openApp(page);
  const web = installWebPage(server);
  await startOnlineGym(page);
  const png1 = await gymPhoto(page, '#7a2e1d', 'Weights floor');
  const png2 = await gymPhoto(page, '#1d4f7a', 'Cardio');
  const kept = await photoBucket(page.context(), png1);
  await addPlan(page, { name: 'Monthly', price: '1500', joining: '500', months: '1' });
  await addPlan(page, { name: 'Quarterly', price: '4000', joining: '500', months: '3' });
  await gymDetails(page);

  // Set up your gym shows the step, not done yet.
  await page.goto('./#/setup');
  const step = page.getByRole('main').getByText('Make your free gym web page');
  await expect(step).toBeVisible();
  await shot(page, 'setup-step-not-done');

  // Empty: a suggested address, nothing published.
  await openWebPage(page);
  const main = editor(page);
  await expect(main.getByText('Not made yet. Fill in the parts below, then publish.')).toBeVisible();
  // Shown only while pages are open, so it never says "not open yet".
  await expect(main.getByText(/not open to visitors yet/)).toHaveCount(0);
  const slug = main.getByLabel('Page address');
  await expect(slug).toHaveValue(/^shakti-gym/);
  await expect(main.getByText(/Your page: join\.mettleup\.fit\/shakti-gym/)).toBeVisible();
  await expectFitsPhone(page, 'on Your web page (empty)');
  await shot(page, 'phone-empty');

  // The area changes the suggested address.
  await main.getByLabel('Area').fill('Sector 12');
  await expect(slug).toHaveValue(/sector-12/);
  await main.getByLabel('City').fill('Jaipur');

  // Every error at once: a bad address, a web address in About, a link that is not Google Maps.
  await slug.fill('ab');
  await main.getByLabel('A few lines for people who may join').fill('Best gym in town, see www.shaktigym.com for offers');
  await main.getByLabel('Google Maps link (optional)').fill('https://example.com/where');
  await main.getByRole('button', { name: 'Save', exact: true }).tap();
  await expect(main.getByText('Fix the parts marked in red, then save again.')).toBeVisible();
  await expect(main.getByText(/Use 3 to 48 small letters/)).toBeVisible();
  await expect(main.getByText(/Take out the web address/)).toBeVisible();
  await expect(main.getByText(/Paste the link from Google Maps/)).toBeVisible();
  expect(web.saves).toHaveLength(0);
  await shot(page, 'phone-errors');

  // An address another gym has: the server says so on the field.
  await slug.fill('Iron Temple Gym');
  await expect(slug).toHaveValue('iron-temple-gym');
  await main.getByLabel('A few lines for people who may join').fill('A friendly gym near the market. Ladies batch every morning, 7 to 8. Trainers on the floor all day.');
  await main.getByLabel('Google Maps link (optional)').fill('https://maps.app.goo.gl/AbCdEf123');
  await main.getByRole('button', { name: 'Save', exact: true }).tap();
  await expect(main.getByText(/Another gym already has this address/).first()).toBeVisible();
  await shot(page, 'phone-slug-taken', false);
  await slug.fill('shakti-gym-sector-12');

  // Facilities, phone, WhatsApp.
  for (const h of ['Air conditioned', 'Trainers on the floor', 'Women-only batch', 'Cardio machines', 'Free weights']) {
    await main.getByRole('button', { name: h }).tap();
    await expect(main.getByRole('button', { name: h })).toHaveAttribute('aria-pressed', 'true');
  }
  const phone = main.getByRole('checkbox', { name: /Show my gym.s phone number/ });
  await expect(phone).toBeEnabled();
  await phone.check();
  await main.getByRole('checkbox', { name: /Add a WhatsApp button/ }).check();

  // Two photos: shrunk to WebP here, sent to the private bucket.
  const chooser = page.waitForEvent('filechooser');
  await main.getByRole('button', { name: '+ Add photos' }).tap();
  await (await chooser).setFiles([
    { name: 'floor.png', mimeType: 'image/png', buffer: png1 },
    { name: 'cardio.png', mimeType: 'image/png', buffer: png2 },
  ]);
  await expect(main.getByLabel('Photo 2: what it shows (optional)')).toBeVisible({ timeout: 15_000 });
  await expect(main.getByRole('img', { name: 'Photo 1' })).toBeVisible();
  expect(kept).toHaveLength(2);
  expect(kept[0].url).toContain(`/gym-page-photos/${GYM_UUID}/`);
  await main.getByLabel('Photo 1: what it shows (optional)').fill('The weights floor');
  await main.getByLabel('Photo 2: what it shows (optional)').fill('Cardio corner');
  await main.getByRole('button', { name: 'Make photo 2 the first' }).tap();
  await expect(main.getByLabel('Photo 1: what it shows (optional)')).toHaveValue('Cardio corner');
  await expectFitsPhone(page, 'on Your web page (filled)');
  await shot(page, 'phone-filled');

  // Publish without the terms tick: refused here, nothing sent.
  await main.getByRole('checkbox', { name: 'Show my page to visitors' }).check();
  const terms = main.getByRole('checkbox', { name: /These fees, photos and words are my gym.s own/ });
  await expect(terms).toBeVisible();
  const before = web.saves.length;
  await main.getByRole('button', { name: 'Save and publish' }).tap();
  await expect(main.getByText('Tick this box to publish your page.').first()).toBeVisible();
  expect(web.saves.length).toBe(before);
  await shot(page, 'phone-refused-no-tick');

  // See your page: the real page, drawn here.
  await main.getByRole('button', { name: 'See your page' }).tap();
  const preview = sheet(page, 'Your page, as visitors see it');
  const frame = preview.frameLocator('iframe[title="Preview of your web page"]');
  await expect(frame.getByText('Shakti Gym').first()).toBeVisible({ timeout: 10_000 });
  await expect(frame.getByText('Monthly').first()).toBeVisible();
  await expect(frame.getByText('A friendly gym near the market.', { exact: false })).toBeVisible();
  await shot(page, 'phone-preview', false);
  await preview.getByRole('button', { name: 'Close' }).last().tap();
  await expect(preview).toBeHidden();

  // With the tick: published, and the address is locked.
  await terms.check();
  await main.getByRole('button', { name: 'Save and publish' }).tap();
  await expect(toast(page)).toContainText('Published. Your page is ready.');
  const sent = web.saves.at(-1);
  expect(sent).toMatchObject({ slug: 'shakti-gym-sector-12', published: true, termsAgreed: true, showPhone: true, whatsapp: true, area: 'Sector 12', city: 'Jaipur' });
  expect(sent.photos.map((p) => p.alt)).toEqual(['Cardio corner', 'The weights floor']);
  await expect(main.getByText(/^Published\. People can open your page\.$/)).toBeVisible();
  await expect(main.getByLabel('Page address')).toHaveCount(0);
  await expect(main.getByText(/To change your address, write to MettleUp from/)).toBeVisible();
  await expect(main.getByRole('link', { name: 'Help and feedback' })).toHaveAttribute('href', '#/feedback');
  await expect(main.getByText('All changes saved.')).toBeVisible();
  await expect(main.getByRole('checkbox', { name: /These fees, photos and words/ })).toHaveCount(0);
  await expectFitsPhone(page, 'on Your web page (published)');
  await shot(page, 'phone-published-locked');

  // Set up your gym: the step ticked itself.
  await page.goto('./#/setup');
  await expect(page.getByRole('main').getByText('Make your free gym web page')).toBeVisible();
  await shot(page, 'setup-step-done');

  // After a reload: the saved photos come back from the bucket.
  await page.goto('./#/settings/web-page');
  await page.reload();
  await expect(main.getByRole('img', { name: 'Cardio corner' })).toBeVisible({ timeout: 15_000 });
});

test('WEBPAGE-2 owner on a computer, the front desk reading it, and a page MettleUp took down', async ({ browser, page }) => {
  const sw = await pagesSwitch(page, true);
  const server = await openApp(page);
  sw.follow(server);
  const web = installWebPage(server, {
    page: {
      slug: 'shakti-gym-sector-12', published: true, indexable: true, hiddenByHq: true, hqNote: 'The fees on your page do not match the fees at the desk.',
      area: 'Sector 12', city: 'Jaipur', about: 'A friendly gym near the market.', highlights: ['ac', 'trainers', 'women'], photos: [], mapsUrl: '',
      lat: null, lng: null, showPhone: false, whatsapp: false, aiHelper: true, termsAt: NOW.getTime() - 86_400_000, updatedAt: NOW.getTime() - 86_400_000,
    },
  });
  await startOnlineGym(page);

  // Taken down, on a phone.
  await openWebPage(page);
  const main = editor(page);
  await expect(main.getByText('Taken down by MettleUp.')).toBeVisible();
  await expect(main.getByText(/MettleUp has taken your page down/)).toContainText('The fees on your page do not match the fees at the desk.');
  await expect(main.getByText(/To change your address, write to MettleUp/)).toBeVisible();
  await shot(page, 'phone-taken-down');

  // The same screen on a computer, back up.
  web.page = { ...web.page, hiddenByHq: false, hqNote: null };
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your web page', level: 1 })).toBeVisible();
  await expect(main.getByText(/^Published\./)).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Your web page' })).toBeVisible();
  await shot(page, 'computer-published');
  await page.setViewportSize({ width: 390, height: 844 });

  // The front desk: sees it, cannot change it.
  await addDeskPerson(page);
  const desk = await secondPhone(browser, server);
  await signIn(desk, DESK.phone);
  await open(desk, 'Your web page');
  const deskMain = desk.getByRole('main');
  await expect(deskMain.getByText('Only the owner can change the web page.')).toBeVisible();
  await expect(deskMain.getByText('join.mettleup.fit/shakti-gym-sector-12')).toBeVisible();
  await expect(deskMain.getByRole('button', { name: /^Save/ })).toHaveCount(0);
  await expect(deskMain.getByLabel('Page address')).toHaveCount(0);
  await expectFitsPhone(desk, 'on Your web page (front desk)');
  await shot(desk, 'phone-desk-view');
  await desk.context().close();
});

test('WEBPAGE-3 a question asked on the web page shows in Enquiries', async ({ page }) => {
  await pagesSwitch(page, true);
  const server = await openApp(page);
  installWebPage(server);
  await startOnlineGym(page);
  pageQuestion(server);
  await page.reload();
  await open(page, 'Enquiries');
  const main = page.getByRole('main');
  await expect(main.getByText('Pooja Meena').first()).toBeVisible({ timeout: 15_000 });
  await expect(main.getByText('Asked on your web page', { exact: true })).toBeVisible();
  await expect(main.getByText('“Is there a ladies batch in the evening?”')).toBeVisible();
  // The server's copy for older apps is not shown twice.
  await expect(main.getByText('Asked on your web page: Is there a ladies batch in the evening?')).toHaveCount(0);
  await expectFitsPhone(page, 'on Enquiries');
  await shot(page, 'phone-enquiry');
});
