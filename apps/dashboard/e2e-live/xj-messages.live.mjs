// UAT WP6 journey 3, the owner's steps (admin app, live server, gym slot A).
//   XJ3a  Messages & offers (its own menu item since offers step 1, 22 Oct 2026; it was Shop ->
//         Messages): "Write my own", then Send in the app to the one app member
//   XJ3b  after the member opened it: "Seen by 1 of 1"; then the owner takes it back
import { expect, test } from '@playwright/test';

import { blockWith, open, openAsOwner, shot, waitFor } from './support.mjs';

export const TITLE = 'QA journeys: closed on Monday';
const BODY = 'The gym is closed on Monday for repairs. Sent by the journey test.';

/** The Sent list's row for the message. */
function sentRow(page) {
  return blockWith(page, page.getByText(TITLE, { exact: true }), /Seen by|No app members/);
}

/** Messages & offers -> "Write my own" (a plain announcement, typed). */
async function openMessages(page) {
  await open(page, 'Messages & offers');
  await expect(page.getByRole('heading', { name: 'Messages & offers', exact: true })).toBeVisible();
}

test('XJ3a owner sends a message to the members', async ({ page }, testInfo) => {
  await openAsOwner(page, 'A');
  await openMessages(page);
  await expect(page.getByText('Nothing sent yet')).toBeVisible();
  await page.getByRole('group', { name: 'Kind of message' }).getByRole('button', { name: 'Write my own' }).tap();
  await page.getByLabel('Title', { exact: true }).fill(TITLE);
  await page.getByLabel('Message', { exact: true }).fill(BODY);
  await page.getByRole('button', { name: 'Send in the app', exact: true }).tap();
  // Asks once more, with the number of members it goes to: the phone that joined.
  await expect(page.getByText('Goes to 1 member in the app. Send now?')).toBeVisible();
  await shot(page, testInfo, 'xj3a-send-question');
  await page.getByRole('button', { name: 'Yes, send' }).tap();
  await expect(page.getByText('Sent to 1 member in the app.')).toBeVisible();
  await expect(sentRow(page)).toContainText('Seen by 0 of 1');
  await shot(page, testInfo, 'xj3a-sent');
});

test('XJ3b owner sees the member opened it, then takes it back', async ({ page }, testInfo) => {
  await openAsOwner(page, 'A');
  await openMessages(page);
  // The Sent list refreshes itself every 30 s; a reload between looks.
  await waitFor(page, async () => (await sentRow(page).textContent().catch(() => ''))?.includes('Seen by 1 of 1') ?? false, {
    what: '"Seen by 1 of 1"',
    reopen: () => openMessages(page),
  });
  await shot(page, testInfo, 'xj3b-seen');
  page.once('dialog', (d) => {
    expect(d.message()).toBe(`Take back “${TITLE}”? It is removed from every member’s inbox.`);
    void d.accept();
  });
  await page.getByRole('button', { name: `Take back ${TITLE}` }).tap();
  await expect(sentRow(page)).toContainText('Taken back');
  await expect(page.getByRole('button', { name: `Take back ${TITLE}` })).toHaveCount(0);
  await shot(page, testInfo, 'xj3b-taken-back');
});
