// R-571 UAT (owner, 15 Nov 2026): ONE set-up journey. "can we still keep that in the setup steps so the gym owner knows
// that they can do it? They can choose to enable or disable it, and the whole setup will tell them about the page as
// well as the payments they can enable ... It should be like one journey to set this up."
// And the join form on a computer: a QR code of the same WhatsApp link ("Scan this QR code ...").
// Pictures: e2e/.results/uat/journey-*.png (CI keeps them as dashboard-uat-pictures).
//
//  JOURNEY-1 gym web pages off (today): the step "Let people join your gym online": the join link and poster, how
//            people pay (desk, UPI, nothing online); sharing the link ticks the step. Phone, computer, dark, Hinglish.
//  JOURNEY-2 pages on, no page yet: three parts; "Make my page" opens the editor with "Back to" the journey; "Not now"
//            plus sharing the link ticks the step. Phone light and dark, computer, Hinglish.
//  JOURNEY-3 pages on, page published, paying online on (JOIN_PAY): the step is done; "Turn off my page" asks first,
//            saves the page unpublished, and the one link becomes the join link; the online payment row shows.
//  JOURNEY-4 the join form: on a computer the QR code and its line show next to "Open WhatsApp"; on a phone they do not.
import { mkdirSync, readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { TODAY, addPlan, expectFitsPhone, openApp, sheet, startOnlineGym } from './support.mjs';

const DIR = 'e2e/.results/uat';
mkdirSync(DIR, { recursive: true });
const PUB = new URL('../public/', import.meta.url);
const SIZES = { phone: { width: 390, height: 844 }, computer: { width: 1280, height: 900 } };
const SLUG = 'shakti-gym-sector-12';
const TITLE_PAGE = 'Let people find and join your gym online';
const TITLE_JOIN = 'Let people join your gym online';

async function shot(page, name, fullPage = true) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/journey-${name}.png`, fullPage });
}

async function switches(page, s) {
  await page.context().route('**/api/switches', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ gymPages: false, joinPay: false, aiCharge: false, ...s }) }),
  );
}

const PUBLISHED = {
  slug: SLUG, published: true, indexable: false, hiddenByHq: false, hqNote: null, area: 'Sector 12', city: 'Jaipur',
  about: 'A friendly gym near the market.', highlights: ['ac'], photos: [], mapsUrl: '', lat: null, lng: null,
  showPhone: false, whatsapp: false, aiHelper: true, termsAt: 1, updatedAt: 1,
};

/** owner_gym_page and owner_save_gym_page (0080) on the pretend server; `box.page` is what it holds. */
function webPageOnServer(server, start) {
  const box = { page: start, saves: [] };
  const base = server.answer.bind(server);
  server.answer = (fn, args) => {
    if (fn === 'owner_gym_page') {
      server.calls.push(fn);
      return { canEdit: server.anyone(args.p_key).role === 'owner', page: box.page };
    }
    if (fn === 'owner_save_gym_page') {
      server.calls.push(fn);
      box.saves.push(args.p_page);
      const pg = args.p_page;
      box.page = {
        slug: pg.slug, published: pg.published, indexable: pg.indexable, hiddenByHq: false, hqNote: null, area: pg.area, city: pg.city,
        about: pg.about, highlights: pg.highlights, photos: pg.photos, mapsUrl: pg.mapsUrl, lat: pg.lat, lng: pg.lng, showPhone: pg.showPhone,
        whatsapp: pg.whatsapp, aiHelper: pg.aiHelper, termsAt: 1, updatedAt: 2,
      };
      return { ok: true, page: box.page };
    }
    return base(fn, args);
  };
  return box;
}

async function joinOnlineReady(page, server) {
  await page.route(/\/rest\/v1\/rpc\/self_join_preview/, (route) => {
    const plans = [...server.records.values()]
      .filter((r) => r.k === 'plan' && !r.x && r.d.active !== false)
      .map((r) => ({ id: r.id, name: r.d.name, durationUnit: 'month', durationCount: 1, priceP: r.d.priceP, joiningFeeP: r.d.joiningFeeP ?? 0, totalP: r.d.priceP + (r.d.joiningFeeP ?? 0) }));
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ gymName: server.gym.name || 'Shakti Gym', joinCode: server.gym.joinCode, brand: {}, closed: false, today: TODAY, lastDay: '2026-11-16', plans }) });
  });
}

async function keepOpened(page) {
  await page.addInitScript(() => {
    window.__opened = [];
    window.open = (u) => {
      window.__opened.push(String(u));
      return null;
    };
  });
}

async function gymReady(page, { sw, webPage }) {
  await switches(page, sw);
  await keepOpened(page);
  const server = await openApp(page);
  const box = webPage !== undefined ? webPageOnServer(server, webPage) : null;
  await startOnlineGym(page);
  await addPlan(page, { name: 'Monthly', price: '1500', joining: '500', months: '1' });
  await joinOnlineReady(page, server);
  return { server, box };
}

async function openJourney(page, title, heading = title) {
  await page.goto('./#/setup');
  const main = page.getByRole('main');
  await main.getByRole('button', { name: new RegExp(`^${title}`) }).tap();
  await expect(page).toHaveURL(/#\/setup\/online$/);
  await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible({ timeout: 15_000 });
  return main;
}

test('JOURNEY-1 pages off: "Let people join your gym online": join link, poster, how people pay; sharing ticks it', async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize(SIZES.phone);
  const { server } = await gymReady(page, { sw: {} });
  await page.reload();
  const main = await openJourney(page, TITLE_JOIN);
  await expect(main.getByText(TITLE_PAGE)).toHaveCount(0);
  await expect(main).toContainText('Two parts, in order: your join link and QR poster, and how people pay.');
  await expect(main.getByRole('heading', { name: 'Your join link and QR poster' })).toBeVisible();
  await expect(main.getByRole('heading', { name: 'Your free web page' })).toHaveCount(0);
  await expect(main).toContainText('https://app.mettleup.fit/m/QA0002');
  await expect(main).toContainText('This is your gym’s one link. People open it on a phone or a computer, pick a plan and send you their details.');
  await expect(main.getByRole('img', { name: 'QR code for https://app.mettleup.fit/m/QA0002' })).toBeVisible();
  await expect(main).toContainText('Put this link on your gym’s Google Maps listing.');
  // How people pay: only what is on.
  await expect(main.getByRole('heading', { name: 'Pay at the gym desk' })).toBeVisible();
  await expect(main).toContainText('People who ask to join online pay at your desk on their first visit. Then you make them a member on Today.');
  await expect(main).toContainText('Add your gym’s UPI ID in Settings, under Gym details.');
  await expect(main.getByRole('heading', { name: 'Pay online when they join' })).toHaveCount(0);
  await expect(main).not.toContainText(/Razorpay|Cashfree|coming soon/i);
  expect(server.calls).not.toContain('owner_gym_page');
  await expectFitsPhone(page, 'on the journey, pages off');
  await shot(page, '1-off-phone-light');

  // Share on WhatsApp: the same link; the step ticks itself.
  await main.getByRole('button', { name: 'Send on WhatsApp' }).tap();
  const u = await page.evaluate(() => window.__opened.at(-1));
  expect(decodeURIComponent(new URL(u).searchParams.get('text') ?? '')).toContain('https://app.mettleup.fit/m/QA0002');
  await expect(main.getByText('You have shared your link.')).toBeVisible();
  await expect(main.getByText('This step is done. You can come back here at any time.')).toBeVisible();
  await page.goto('./#/setup');
  await expect(main.getByRole('button', { name: `${TITLE_JOIN} (done). Open` })).toBeVisible();

  await page.setViewportSize(SIZES.computer);
  await page.emulateMedia({ colorScheme: 'dark' });
  await openJourney(page, TITLE_JOIN);
  await shot(page, '1-off-computer-dark');

  await page.setViewportSize(SIZES.phone);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.evaluate(() => localStorage.setItem('forgeai.lang.v1', 'hinglish'));
  await page.reload();
  await openJourney(page, 'Logon ko online aapke gym mein join karne do');
  await expect(main).toContainText('Log paise kaise denge');
  await expect(main).toContainText('Gym ke desk par paise dena');
  await expectFitsPhone(page, 'on the journey, Hinglish');
  await shot(page, '1-off-phone-hinglish');
});

for (const [size, scheme] of [
  ['phone', 'light'],
  ['phone', 'dark'],
  ['computer', 'light'],
]) {
  test(`JOURNEY-2 pages on, no page yet (${size} ${scheme}): three parts, "Make my page" and back, "Not now" + share ticks it`, async ({ page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize(SIZES.phone);
    await page.emulateMedia({ colorScheme: scheme });
    await gymReady(page, { sw: { gymPages: true }, webPage: null });
    await page.setViewportSize(SIZES[size]);
    await page.reload();
    const main = await openJourney(page, TITLE_PAGE);
    await expect(main).toContainText('Three parts, in order: your free web page, your one link and QR poster, and how people pay.');
    await expect(main.getByRole('heading', { name: 'Your free web page' })).toBeVisible();
    await expect(main).toContainText('MettleUp makes a free web page for your gym at join.mettleup.fit.');
    await expect(main).toContainText('Your page is not made yet. Add a few lines about your gym, what it has and some photos, then publish it.');
    await expect(main).toContainText('It is your choice. You can turn your page on or off here at any time.');
    await expect(main).toContainText('Once your page is on, this link and the poster show your page instead. A poster you print now keeps working.');
    if (size === 'phone') await expectFitsPhone(page, 'on the journey, no page yet');
    await shot(page, `2-no-page-${size}-${scheme}`);
    if (size !== 'phone' || scheme !== 'light') return;

    // Make my page: the editor, with the way back to the journey.
    await main.getByRole('button', { name: 'Make my page' }).tap();
    await expect(page.getByRole('heading', { name: 'Your web page', level: 1 })).toBeVisible({ timeout: 15_000 });
    const back = page.getByRole('navigation', { name: 'Set up your gym' }).getByRole('button', { name: `‹ Back to “${TITLE_PAGE}”` });
    await expect(back).toBeVisible();
    await shot(page, '2-editor-with-back', false);
    await back.tap();
    await expect(page).toHaveURL(/#\/setup\/online$/);

    // Not now: the owner's choice. Not done until the link is shared too.
    await main.getByRole('button', { name: 'Not now' }).tap();
    await expect(main).toContainText('Your web page is off. Your one link below opens the join form instead.');
    await expect(main.getByRole('button', { name: 'Turn my page on' })).toBeVisible();
    await expect(main.getByText('This step is done. You can come back here at any time.')).toHaveCount(0);
    await main.getByRole('button', { name: 'Copy link' }).tap();
    await expect(main.getByText('This step is done. You can come back here at any time.')).toBeVisible();
    await shot(page, '2-not-now-shared-phone');

    await page.evaluate(() => localStorage.setItem('forgeai.lang.v1', 'hinglish'));
    await page.reload();
    await openJourney(page, 'Logon ko online aapka gym dhoondhne aur join karne do');
    await expect(main).toContainText('Aapka web page band hai.');
    await expectFitsPhone(page, 'on the journey, Hinglish, page off');
    await shot(page, '2-not-now-phone-hinglish');
  });
}

test('JOURNEY-3 pages on, page published, JOIN_PAY on: done; "Turn off my page" asks, saves it off, the link becomes the join link', async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize(SIZES.phone);
  const { box } = await gymReady(page, { sw: { gymPages: true, joinPay: true }, webPage: PUBLISHED });
  await page.reload();
  await page.goto('./#/setup');
  const main = page.getByRole('main');
  await expect(main.getByRole('button', { name: `${TITLE_PAGE} (done). Open` })).toBeVisible({ timeout: 15_000 });
  await main.getByRole('button', { name: `${TITLE_PAGE} (done). Open` }).tap();
  await expect(main).toContainText(`Your page is on. People can open it at join.mettleup.fit/${SLUG}.`);
  await expect(main.getByRole('heading', { name: 'Your one link and QR poster' })).toBeVisible();
  await expect(main).toContainText(`https://join.mettleup.fit/${SLUG}`);
  await expect(main.getByRole('heading', { name: 'Pay online when they join' })).toBeVisible();
  await expect(main).toContainText('Connect your Razorpay or Cashfree account in Payments, then switch on “Take payments when people join online”.');
  await expectFitsPhone(page, 'on the journey, page on');
  await shot(page, '3-page-on-phone');

  await main.getByRole('button', { name: 'Turn off my page' }).tap();
  const ask = sheet(page, 'Turn off your web page?');
  await expect(ask).toContainText('links or posters with your page address stop working until you turn it on again');
  await shot(page, '3-turn-off-ask', false);
  await ask.getByRole('button', { name: 'Keep it on' }).tap();
  expect(box.saves).toHaveLength(0);
  await main.getByRole('button', { name: 'Turn off my page' }).tap();
  await sheet(page, 'Turn off your web page?').getByRole('button', { name: 'Turn off my page' }).tap();
  await expect(main).toContainText('Your web page is off. Your one link below opens the join form instead.');
  expect(box.saves).toHaveLength(1);
  expect(box.saves[0]).toMatchObject({ slug: SLUG, published: false });
  await expect(main).toContainText('https://app.mettleup.fit/m/QA0002');
  await shot(page, '3-page-off-phone');
});

// ---------------------------------------------------------------- the join form's WhatsApp check

const JOIN_GYM = {
  gymName: 'Shakti Gym', joinCode: 'QA0002', brand: { accent: '#e8590c' }, closed: false, today: '2026-11-15', lastDay: '2026-12-15',
  plans: [{ id: 'm', name: 'Monthly', durationUnit: 'month', durationCount: 1, priceP: 150000, joiningFeeP: 50000, totalP: 200000 }],
};

async function serveJoin(page) {
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('https://hdxzqbdiokjklnypfisq.supabase.co/rest/v1/rpc/self_join_preview', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(JOIN_GYM) }));
  await page.route(/^https:\/\/join\.mettleup\.fit\//, (route) => {
    const url = new URL(route.request().url());
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/api/phone-code/inbound/start') {
      return json({ ok: true, id: '0b7c6f0e-1111-4222-8333-944455556666', code: '123456', waNumber: '919000000000', waText: 'MettleUp code 123456. After you send this, go back to the MettleUp page.', expiresAt: Date.now() + 600000 });
    }
    if (url.pathname === '/api/phone-code/inbound/status') return json({ ok: true, state: 'waiting', expiresAt: Date.now() + 600000 });
    if (url.pathname === '/vendor/qrcode-generator-2.0.4.js') return route.fulfill({ status: 200, contentType: 'text/javascript', body: readFileSync(new URL('vendor/qrcode-generator-2.0.4.js', PUB)) });
    if (/^\/m\/[A-Za-z0-9]{6}$/.test(url.pathname)) return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: readFileSync(new URL('join-online.html', PUB)) });
    return route.fulfill({ status: 404, body: 'Not found' });
  });
  await page.addInitScript((g) => {
    window.__GYM__ = g;
  }, JOIN_GYM);
}

const COMPUTER_LINE = 'Scan this QR code with the phone that has WhatsApp for this number. WhatsApp opens with a message to MettleUp ready. Send the message, and your number is checked.';

for (const [size, scheme, lang] of [
  ['computer', 'light', 'en'],
  ['computer', 'dark', 'hi'],
  ['phone', 'light', 'en'],
]) {
  test.describe(`JOURNEY-4 ${size}`, () => {
  // A computer: a mouse, no touch screen (the project's default is a phone with a finger, even at 1280 wide).
  if (size === 'computer') test.use({ viewport: SIZES.computer, isMobile: false, hasTouch: false });
  test(`JOURNEY-4 join form (${size} ${scheme} ${lang}): the WhatsApp QR code shows on a computer only`, async ({ page }) => {
    await page.setViewportSize(SIZES[size]);
    await page.emulateMedia({ colorScheme: scheme });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await serveJoin(page);
    await page.goto('https://join.mettleup.fit/m/QA0002');
    await expect(page.locator('#title')).toHaveText('Shakti Gym', { timeout: 15_000 });
    if (lang === 'hi') await page.locator('#lang').click();
    await page.locator('#name').fill('Ravi Kumar');
    await page.locator('#phone').fill('90000 77001');
    await page.locator('#verify').click();
    await expect(page.locator('#wa')).toBeVisible();
    const href = await page.locator('#wa-open').evaluate((a) => a.href);
    expect(href).toMatch(/^https:\/\/wa\.me\/919000000000\?text=MettleUp%20code%20123456/);
    // The old typed-message line stays everywhere.
    await expect(page.locator('#wa-manual')).toContainText(lang === 'hi' ? 'को "MettleUp code 123456" भेजें' : 'Or send "MettleUp code 123456" to');
    const qr = page.locator('#wa-qr-box');
    if (size === 'computer') {
      await expect(qr).toBeVisible();
      await expect(page.locator('#wa-qr svg path')).toHaveCount(1);
      await expect(page.locator('#wa-qr')).toHaveAttribute('data-link', href);
      await expect(qr).toContainText(lang === 'hi' ? 'जिस फ़ोन में इस नंबर का WhatsApp है, उससे यह QR कोड स्कैन करें।' : COMPUTER_LINE);
      await expect(page.locator('#wa-open')).toBeVisible();
    } else {
      await expect(qr).toBeHidden();
      await expect(page.getByText(COMPUTER_LINE)).toBeHidden();
      await expectFitsPhone(page, 'on the join form, waiting for WhatsApp');
    }
    await page.locator('#wa').scrollIntoViewIfNeeded();
    await shot(page, `4-join-wa-${size}-${scheme}-${lang}`, false);
    expect(errors).toEqual([]);
  });
  });
}
