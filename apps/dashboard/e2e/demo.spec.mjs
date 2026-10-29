// R-119 (24 Oct 2026). Owner: "'Open Demo GYM' is opening the latest GYM I created." The landing page's
// demo button now goes to app.mettleup.fit/demo, which always opens the made-up gym and never touches
// the gym this device is signed in to. Here: a real-looking signed-in session sits in the browser's
// storage; the demo opens beside it, is used, reloaded and left, and the session is byte-for-byte
// the same, and nothing ever went to the gym server.
import { expect, test } from '@playwright/test';

import { addMember, bottomBar, expectFitsPhone } from './support.mjs';

const REAL_SESSION = {
  gymId: '6f1c2d9e-3b7a-4c58-9a10-5d2e8b0c7f41',
  ownerKey: 'Qm7vX2pL9aTz4RwN8cJd5HfYb3KeUg6s0aD1',
  joinCode: 'RM4829',
  name: 'Shakti Gym Jaipur',
  demo: false,
  online: true,
  person: { staffId: 's-1', name: 'Ramesh Sharma', phone: '9829012345', role: 'owner' },
};

/** Everything this browser keeps, as one comparable string. */
async function storageDump(page) {
  return page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)])));
}

/** Plant the signed-in session once per browser tab; the demo's reloads cannot be "restored" by this script. */
async function signedInDevice(page) {
  await page.addInitScript((session) => {
    if (sessionStorage.getItem('e2e-seeded') === '1') return;
    sessionStorage.setItem('e2e-seeded', '1');
    localStorage.setItem('forgeai.cloudGym.v1', JSON.stringify(session));
    localStorage.setItem('forgeai.branchKeys.v1', JSON.stringify({ 9829012345: { [session.gymId]: session.ownerKey } }));
  }, REAL_SESSION);
}

/** Every request that goes to the gym server or the Worker's API. */
function watchServerCalls(page) {
  const calls = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (/^\/(sb|api)\//.test(u.pathname) || /supabase\.co$/.test(u.hostname)) calls.push(`${r.method()} ${r.url()}`);
  });
  return calls;
}

test('J-DEMO the demo link opens the made-up gym, never the signed-in one, and leaves that gym untouched', async ({ page }) => {
  await signedInDevice(page);
  const calls = watchServerCalls(page);

  // Plant the session on a plain page of this site (opening the real app would call the server).
  await page.goto('./privacy.html');
  const before = await storageDump(page);
  expect(before).toContain('Shakti Gym Jaipur');

  await page.goto('./demo');
  // The made-up gym, with the banner and the way back to the gym of this device.
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible({ timeout: 15_000 });
  const banner = page.getByRole('region', { name: 'Demo gym' });
  await expect(banner).toContainText('Demo gym: made-up data. Nothing you do here is saved.');
  await expect(banner.getByRole('link', { name: 'Back to my gym' })).toHaveAttribute('href', '/');
  await expect(page.getByRole('banner')).toContainText('Iron Temple Fitness');
  await expect(page.getByText('Shakti Gym Jaipur')).toHaveCount(0);
  await expectFitsPhone(page, 'in the demo');
  // The way out is a 44 px tap target.
  const link = await banner.getByRole('link').boundingBox();
  expect(link.height).toBeGreaterThanOrEqual(44);

  // Things the screens remember on a device (a "Get started" tick) are remembered in the page only.
  await page.getByRole('button', { name: 'Mark "Add your desk staff" as done' }).tap();
  await expect(page.getByText('4 of 6 done')).toBeVisible();

  // Used like the real app: members are there, a member can be added.
  await addMember(page, { name: 'Demo Visitor', phone: '98290 11111' });
  await expect(banner).toBeVisible();

  // A page that needs a real gym says so (Branding is the owner's own item in the menu).
  await bottomBar(page).getByRole('link', { name: /^More/ }).tap();
  await page.getByRole('main').getByRole('link', { name: /^Branding/ }).tap();
  await expect(page.getByRole('heading', { name: 'Branding', exact: true })).toBeVisible();
  await expect(page.getByText('This works in your own gym')).toBeVisible();
  await expectFitsPhone(page, 'on the demo Branding page');

  // Whatever a screen tried, nothing may leave the page for the gym server.
  const refused = await page.evaluate(async () => {
    const out = [];
    for (const [url, init] of [['/sb/rest/v1/rpc/owner_gym', { method: 'POST', body: '{}' }], ['/api/feedback', {}], ['https://example.com/', {}]]) {
      try {
        await fetch(url, init);
        out.push('reached');
      } catch {
        out.push('refused');
      }
    }
    return out;
  });
  expect(refused).toEqual(['refused', 'refused', 'refused']);

  // Reload: the demo starts over (nothing was saved), and the device's own gym is exactly as it was.
  await page.reload();
  await expect(page.getByRole('region', { name: 'Demo gym' })).toBeVisible({ timeout: 15_000 });
  await bottomBar(page).getByRole('link', { name: /^Members/ }).tap();
  await expect(page.getByText('Demo Visitor')).toHaveCount(0);

  // Read it from an ordinary page of this site (the demo page itself is not shown the gym's keys).
  const other = await page.context().newPage();
  await other.goto('./privacy.html');
  expect(await storageDump(other)).toBe(before);
  expect(calls, 'the demo must never call the gym server').toEqual([]);
});

test('J-DEMO-b a device with no gym of its own: the way out is the landing page; ?demo=1 works too', async ({ page }) => {
  const calls = watchServerCalls(page);
  await page.goto('./demo');
  const banner = page.getByRole('region', { name: 'Demo gym' });
  await expect(banner.getByRole('link', { name: 'Leave the demo' })).toHaveAttribute('href', 'https://mettleup.fit/');
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible({ timeout: 15_000 });
  // Nothing was written to this browser for the demo, apart from the dark/light choice if made.
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k !== 'forgeai.theme.v1'))).toEqual([]);

  await page.goto('./?demo=1');
  await expect(page.getByRole('region', { name: 'Demo gym' })).toBeVisible();
  expect(calls).toEqual([]);
});

test('J-DEMO-c Branding has its own place: the sidebar on a computer, More on a phone', async ({ page }) => {
  await page.goto('./demo');
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible({ timeout: 15_000 });
  // Phone: under More.
  await bottomBar(page).getByRole('link', { name: /^More/ }).tap();
  await expect(page.getByRole('main').getByRole('link', { name: /^Branding/ })).toBeVisible();
  // A computer: its own sidebar item, lit on its page, with Settings beside it.
  await page.setViewportSize({ width: 1280, height: 800 });
  const side = page.getByRole('navigation', { name: 'Main' });
  const branding = side.getByRole('link', { name: /^Branding/ });
  await expect(branding).toBeVisible();
  await branding.click();
  await expect(branding.locator('span').first()).toHaveAttribute('aria-current', 'page');
  await expect(side.getByRole('link', { name: /^Settings/ }).locator('span').first()).not.toHaveAttribute('aria-current', 'page');
});
