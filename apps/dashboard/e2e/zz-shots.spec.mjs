// Pictures of the real admin app (demo gym, phone size) for the landing page (launch I2).
// Only with SHOTS=1:  SHOTS=1 npx playwright test zz-shots  ->  public/home/*.png. The page ships two webp
// crops of them, made with PIL (quality 80). 30 Oct 2026 boxes (Today now opens with the shop card):
// tiles.webp = today.png box (20, 708, 760, 1198), the four "Ending" tiles; dues-list.webp = dues.png
// box (61, 300, 719, 773), two fees-due rows. Check the boxes against the new .png before cropping.
// Delete the .png files afterwards; the page loads only the two crops.
import { test } from '@playwright/test';

import { open, openApp, startDemo } from './support.mjs';

test.skip(!process.env.SHOTS, 'landing-page pictures only on request (SHOTS=1)');

test('landing page pictures', async ({ page }) => {
  await openApp(page);
  await startDemo(page);
  const hide = page.getByRole('button', { name: 'Hide this list' });
  if (await hide.isVisible()) await hide.tap();
  const shot = async (name) => {
    await page.waitForTimeout(400);
    await page.screenshot({ path: `public/home/${name}.png` });
  };
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator('text=Ending in 1-3 days').first().scrollIntoViewIfNeeded().catch(() => undefined);
  await shot('today');
  await open(page, 'Money');
  await page.goto('./#/money/dues');
  await page.getByRole('heading', { level: 1 }).waitFor();
  await shot('dues');
  await open(page, 'Members');
  await shot('members');
});
