// R-526 UAT (owner, 14 Nov 2026): Get started out of Today into its own page "Set up your gym", with a progress ring
// that looks unlike the orange number badges and new-feature dots; and the side menu in five small groups that fold.
// Pictures for a person to read: e2e/.results/uat/r526-*.png (CI keeps them as dashboard-uat-pictures).
import { mkdirSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { DESK, PHONE, addDeskPerson, bottomBar, expectFitsPhone, open, openApp, signIn, startDemo, startOnlineGym } from './support.mjs';

const DIR = 'e2e/.results/uat';
mkdirSync(DIR, { recursive: true });

async function shot(page, name, opts = {}) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/r526-${name}.png`, ...opts });
}

const GROUPS = ['Members', 'Money', 'Training', 'Reach members', 'Your gym'];
const COMPUTER = { viewport: { width: 1280, height: 900 }, isMobile: false };
const menuOf = (page) => page.getByRole('navigation', { name: 'Main' });
/** The side menu's rows, in order, as their first line of text. */
async function menuRows(page) {
  const links = menuOf(page).locator('[data-sidebar-rows]').getByRole('link');
  return (await links.allInnerTexts()).map((t) => t.split('\n')[0].trim());
}
const menuShot = (page, name) => shot(page, name, { clip: { x: 0, y: 0, width: 260, height: page.viewportSize().height } });

test.describe('R526 on a computer', () => {
  test.use(COMPUTER);

  test('R526-1 owner: Today without the list; Set up your gym under Today with its ring; five groups that fold', async ({ page }) => {
    await openApp(page);
    await startOnlineGym(page);
    const main = page.getByRole('main');
    const menu = menuOf(page);

    // Today: today's numbers and to-dos only.
    await expect(main.getByText(/^\d+ of \d+ done$/)).toHaveCount(0);
    await expect(main.getByRole('button', { name: 'Add your plans. Open' })).toHaveCount(0);
    await shot(page, 'computer-today');

    // The menu: Today, then Set up your gym with its ring and "0/7"-style count, then the groups.
    const rows = await menuRows(page);
    expect(rows.slice(0, 2)).toEqual(['Today', 'Set up your gym']);
    const setupLink = menu.getByRole('link', { name: /^Set up your gym/ });
    await expect(setupLink.locator('[data-setup-mark]')).toBeVisible();
    await expect(setupLink.locator('[data-setup-mark]')).toContainText(/^\d+\/\d+/);
    await expect(setupLink).toHaveAccessibleName(/steps done/);
    // Unlike a to-do number: no orange badge and no new-feature dot on it.
    await expect(setupLink.locator('[data-new-dot]')).toHaveCount(0);
    for (const g of GROUPS) await expect(menu.getByRole('button', { name: g, exact: true })).toHaveAttribute('aria-expanded', 'true');
    // Every row and every condition as before: the owner still has all of these.
    for (const r of ['Members', 'Visits', 'Enquiries', 'Invite members', 'Money', 'Plans', 'Shop', 'Expenses', 'Your growth', 'Trainers', 'Workout plans', 'Diet plans', 'Challenges', 'Messages & offers', 'Branding', 'Gym timings', 'Settings', 'Help and feedback']) {
      expect(rows, `the owner's menu has ${r}`).toContain(r);
    }
    console.log(`[r526] owner menu: ${rows.join(', ')}`);
    await menuShot(page, 'computer-menu-owner');

    // Fold Training: its rows go, the heading stays; kept after a reload; opens again.
    const training = menu.getByRole('button', { name: 'Training', exact: true });
    await training.click();
    await expect(training).toHaveAttribute('aria-expanded', 'false');
    await expect(menu.getByRole('link', { name: 'Workout plans' })).toHaveCount(0);
    await expect(menu.getByRole('link', { name: 'Challenges' })).toHaveCount(0);
    await menuShot(page, 'computer-menu-training-folded');
    await page.reload();
    await expect(menu.getByRole('button', { name: 'Training', exact: true })).toHaveAttribute('aria-expanded', 'false');
    await expect(menu.getByRole('link', { name: 'Workout plans' })).toHaveCount(0);
    await menu.getByRole('button', { name: 'Training', exact: true }).click();
    await expect(menu.getByRole('link', { name: 'Workout plans' })).toBeVisible();

    // A folded group still shows the page that is open.
    await menu.getByRole('link', { name: 'Plans', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Plans', level: 1 })).toBeVisible();
    await menu.getByRole('button', { name: 'Money', exact: true }).click();
    await expect(menu.getByRole('link', { name: 'Plans', exact: true })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Shop', exact: true })).toHaveCount(0);
    await menu.getByRole('button', { name: 'Money', exact: true }).click();

    // The page itself.
    await setupLink.click();
    await expect(page.getByRole('heading', { name: 'Set up your gym', level: 1 })).toBeVisible();
    await expect(main.getByText('Finish these and your gym is ready for members.')).toBeVisible();
    await expect(main.getByRole('button', { name: 'Add your plans. Open' })).toBeVisible();
    await expect(menu.locator('[aria-current="page"]')).toContainText('Set up your gym');
    await shot(page, 'computer-setup', { fullPage: true });
  });

  test('R526-2 the demo gym: a part-filled ring, a folded group adds up its numbers, then every step done', async ({ page }) => {
    await openApp(page);
    await startDemo(page);
    const menu = menuOf(page);
    const setupLink = menu.getByRole('link', { name: /^Set up your gym/ });
    await expect(setupLink.locator('[data-setup-mark]')).toBeVisible();
    await menuShot(page, 'computer-menu-pending');

    // Folding Members shows the sum of its rows' numbers on the heading.
    const membersHead = menu.getByRole('button', { name: 'Members', exact: true });
    const rowBadges = await menu.getByRole('group', { name: 'Members' }).getByRole('link').evaluateAll((links) =>
      links.map((a) => Number((a.textContent ?? '').match(/(\d+)\+?$/)?.[1] ?? 0)),
    );
    const sum = rowBadges.reduce((a, b) => a + b, 0);
    await membersHead.click();
    await expect(membersHead).toHaveAttribute('aria-expanded', 'false');
    if (sum > 0) await expect(membersHead).toContainText(String(Math.min(sum, 99)));
    console.log(`[r526] Members folded: rows ${rowBadges.join('+')} = ${sum}`);
    await menuShot(page, 'computer-menu-members-folded');
    await membersHead.click();

    // Every step done: the row moves to the bottom (Your gym), with no ring.
    await page.evaluate(() => {
      localStorage.setItem('forgeai.getStarted.gym_demo', JSON.stringify({ ticked: ['brand', 'staff', 'timings', 'poster'], hidden: false }));
      window.dispatchEvent(new Event('forgeai:getstarted'));
    });
    await expect(menu.locator('[data-setup-mark]')).toHaveCount(0);
    const rows = await menuRows(page);
    expect(rows[1], 'Set up your gym left the top').not.toBe('Set up your gym');
    await expect(menu.getByRole('group', { name: 'Your gym' }).getByRole('link', { name: 'Set up your gym' })).toBeVisible();
    console.log(`[r526] all done menu: ${rows.join(', ')}`);
    await menuShot(page, 'computer-menu-all-done');
    await menu.getByRole('link', { name: 'Set up your gym' }).click();
    await expect(page.getByText('All done. Your gym is ready for members.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Move this page to the bottom of the menu' })).toHaveCount(0);
    await shot(page, 'computer-setup-all-done', { fullPage: true });
  });

  test('R526-3 front desk on a computer: the same groups, no Set up your gym, nothing they cannot open', async ({ page, browser }) => {
    // The owner adds the desk person on a phone.
    const ownerContext = await browser.newContext({ ...PHONE, baseURL: test.info().project.use.baseURL });
    const owner = await ownerContext.newPage();
    const server = await openApp(owner);
    await startOnlineGym(owner);
    await addDeskPerson(owner);

    await openApp(page, { server });
    await signIn(page, DESK.phone);
    const menu = menuOf(page);
    const rows = await menuRows(page);
    console.log(`[r526] desk menu: ${rows.join(', ')}`);
    expect(rows).not.toContain('Set up your gym');
    for (const hidden of ['Expenses', 'Your growth', 'Messages & offers', 'Branding']) expect(rows, `the desk has no ${hidden}`).not.toContain(hidden);
    for (const kept of ['Today', 'Members', 'Visits', 'Money', 'Plans', 'Shop', 'Workout offer', 'Gym timings', 'Settings']) expect(rows, `the desk has ${kept}`).toContain(kept);
    for (const g of GROUPS) await expect(menu.getByRole('button', { name: g, exact: true })).toBeVisible();
    await menuShot(page, 'computer-menu-desk');
    // A typed address is refused plainly.
    await page.goto('./#/setup');
    await expect(page.getByText('Only an owner can see this')).toBeVisible();
    await ownerContext.close();
  });
});

test('R526-4 phone: the bottom bar stays, the ring on More, More in the same groups, the page fits 390 px', async ({ page }) => {
  await openApp(page);
  await startOnlineGym(page);
  const main = page.getByRole('main');
  const bar = bottomBar(page);
  await expect(bar.getByRole('link')).toHaveText([/^Today/, /^Members/, /^Money/, /^Visits/, /^More/]);
  await expect(bar.getByRole('link', { name: /^More/ }).locator('[data-setup-mark]')).toBeVisible();
  await expect(main.getByText(/^\d+ of \d+ done$/)).toHaveCount(0);
  await shot(page, 'phone-today');
  await shot(page, 'phone-bottom-bar', { clip: { x: 0, y: 844 - 90, width: 390, height: 90 } });

  await open(page, 'More');
  const headings = await main.locator('section > h2').allTextContents();
  expect(headings).toEqual(GROUPS);
  const setupRow = main.getByRole('link', { name: /^Set up your gym/ });
  await expect(setupRow.locator('[data-setup-mark]')).toContainText(/\d+ of \d+/);
  // Set up your gym is the first row, above every group.
  const firstRow = (await main.getByRole('link').first().innerText()).split('\n')[0].trim();
  expect(firstRow).toBe('Set up your gym');
  await expectFitsPhone(page, 'on More');
  await shot(page, 'phone-more', { fullPage: true });

  await setupRow.tap();
  await expect(page.getByRole('heading', { name: 'Set up your gym', level: 1 })).toBeVisible();
  await expectFitsPhone(page, 'on Set up your gym');
  await shot(page, 'phone-setup', { fullPage: true });
});
