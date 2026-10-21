// Launch H7 (21 Oct 2026): the owner writes to ForgeAI from More → Send feedback. The feedback box
// (/api/feedback, the panel Worker) is answered here; the real one is tested in deploy/panel.
import { expect, test } from '@playwright/test';

import { open, openApp, startDemo } from './support.mjs';

test('J30 Send feedback: written, sent, thanked; offline keeps the message', async ({ page }) => {
  const sent = [];
  let up = false;
  await page.route('**/api/feedback', async (route) => {
    if (!up) return route.abort('internetdisconnected');
    sent.push(route.request().postDataJSON());
    return route.fulfill({ status: 201, contentType: 'application/json', body: '{"ok":true}' });
  });
  await openApp(page);
  await startDemo(page);
  await open(page, 'Send feedback');
  const box = page.getByLabel('Your message');
  const send = page.getByRole('button', { name: 'Send', exact: true });
  await expect(send).toBeDisabled();
  await box.fill('Receipt print button is hard to find');

  await send.tap();
  await expect(page.getByRole('status').filter({ hasText: "Couldn't send" })).toBeVisible();
  await expect(box).toHaveValue('Receipt print button is hard to find');

  up = true;
  await send.tap();
  await expect(page.getByRole('status').filter({ hasText: 'Thanks! We read every message.' })).toBeVisible();
  await expect(box).toHaveValue('');
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({ source: 'admin', text: 'Receipt print button is hard to find' });
});
