// Messages & offers step 1 (22 Oct 2026; docs/overhaul/research/R-offers-notices.md §8): the owner
// sends a ready message to a group — the blanks filled with boxes, in English and Hindi — on
// WhatsApp one by one (remembered after a reload, started again when the words change), and in the
// app. On a 360px phone, the narrowest a front desk is likely to use.
import { expect, test } from '@playwright/test';

import { expectFitsPhone, open, openApp, sheet, startDemo } from './support.mjs';

test.use({ viewport: { width: 360, height: 780 } });

test('J35c R-195: from the 3rd app message of the day a calm line shows above "Send in the app"; sending still works', async ({ page }, testInfo) => {
  const server = await openApp(page);
  server.appMembers = [
    { member_id: 'app-1', name: 'App One', phone: '+919000000001', joined_at: '2026-10-01T10:00:00Z', last_seen: '2026-10-16T10:00:00Z', orders: 0, spent_p: 0 },
  ];
  // One message already sent today (07:00 India time), with the server's quiet mark (0042 live).
  const earlier = (n, hour) => ({
    id: `old-${n}`, kind: 'announcement', title: `Earlier news ${n}`, body: '', createdAt: `2026-10-17T0${hour}:00:00+05:30`,
    recipients: 1, seen: 0, withdrawn: false, sendAt: null, toGroup: false, quiet: false,
  });
  server.messages = [earlier(1, 7)];
  await startDemo(page);
  await open(page, 'Messages & offers');
  await page.getByRole('group', { name: 'Kind of message' }).getByRole('button', { name: 'Write my own' }).tap();
  await page.getByLabel('Title', { exact: true }).fill('Water cooler fixed');
  const send = page.getByRole('button', { name: 'Send in the app' });
  await expect(send).toBeEnabled();
  // The 2nd message of the day: no line.
  await expect(page.getByTestId('message-nudge')).toHaveCount(0);

  // A 2nd one already went (one taken back does not count): this is the 3rd.
  server.messages = [earlier(2, 8), { ...earlier(3, 9), withdrawn: true }, earlier(1, 7)];
  await page.reload();
  await open(page, 'Messages & offers');
  await page.getByRole('group', { name: 'Kind of message' }).getByRole('button', { name: 'Write my own' }).tap();
  await page.getByLabel('Title', { exact: true }).fill('Water cooler fixed');
  const line = page.getByTestId('message-nudge');
  await expect(line).toHaveText(
    'This is your 3rd message today, so members get it in the app without a phone pop-up. Members who get many messages start to ignore them.',
  );
  await expect(send).toBeEnabled();
  await line.scrollIntoViewIfNeeded();
  await expectFitsPhone(page, 'with the calm line');
  const shot = process.env.NUDGE_SHOT || testInfo.outputPath('message-nudge-phone.png');
  await page.screenshot({ path: shot });

  // Sending is still allowed; the Sent list marks it "No phone pop-up".
  await send.tap();
  await page.getByRole('button', { name: 'Yes, send' }).tap();
  await expect(page.getByText('Sent to 1 member in the app.')).toBeVisible();
  await expect(page.getByTestId('message-nudge')).toHaveCount(0);
  expect(server.messages[0].quiet).toBe(true);
  await expect(page.getByText('No phone pop-up', { exact: true })).toHaveCount(1);
});

/** The "Closed for a festival" boxes, filled the way an owner would. */
async function fillClosedForDiwali(page, openAt = '06:00') {
  await page.getByLabel('Closed on', { exact: true }).fill('2026-11-08');
  await page.getByLabel('Festival', { exact: true }).selectOption('diwali');
  await page.getByLabel('Open again on', { exact: true }).fill('2026-11-09');
  await page.getByLabel('Open again at', { exact: true }).fill(openAt);
}

test('J35 messages & offers: a ready message in English and Hindi, to a group, on WhatsApp one by one and in the app', async ({ page }) => {
  const context = page.context();
  // WhatsApp itself is never opened from a test: its address answers with an empty page.
  const opened = [];
  await context.route(/^https:\/\/wa\.me\//, async (route) => {
    opened.push(decodeURIComponent(route.request().url()));
    await route.fulfill({ status: 200, contentType: 'text/html', body: '<p>WhatsApp</p>' });
  });
  const server = await openApp(page);
  // Two members joined in the app (not on the gym's list): the app message reaches them.
  server.appMembers = [
    { member_id: 'app-1', name: 'App One', phone: '+919000000001', joined_at: '2026-10-01T10:00:00Z', last_seen: '2026-10-16T10:00:00Z', orders: 0, spent_p: 0 },
    { member_id: 'app-2', name: 'App Two', phone: '+919000000002', joined_at: '2026-10-02T10:00:00Z', last_seen: '2026-10-16T10:00:00Z', orders: 0, spent_p: 0 },
  ];
  await startDemo(page);

  // ---- Today's nudge opens the ready message with its group picked.
  const nudge = page.getByRole('button', { name: /^Remind them: \d+ plans? ends? this week$/ });
  await expect(nudge).toBeVisible();
  const ending = Number(/(\d+)/.exec((await nudge.getAttribute('aria-label')) ?? '')?.[1]);
  expect(ending).toBeGreaterThan(1);
  await nudge.tap();
  await expect(page.getByRole('heading', { name: 'Messages & offers', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Plan ending', pressed: true })).toBeVisible();
  await expect(page.getByRole('main')).toContainText(`Plans ending within 7 days: ${ending} members.`);
  await expectFitsPhone(page, 'on a personal message');

  // ---- The old Shop -> Messages address still lands here; the page is in More.
  await page.goto('./#/shop/messages');
  await expect(page.getByRole('heading', { name: 'Messages & offers', exact: true })).toBeVisible();
  await open(page, 'Messages & offers');

  // ---- Pick a ready message and fill its boxes (no [brackets] to type into).
  await page.getByRole('group', { name: 'Kind of message' }).getByRole('button', { name: 'Gym news' }).tap();
  await page.getByRole('button', { name: 'Closed for a festival' }).tap();
  await page.getByRole('group', { name: 'Language of the message' }).getByRole('button', { name: 'Both' }).tap();
  await page.getByLabel('Closed on', { exact: true }).fill('2026-11-08');
  await page.getByLabel('Festival', { exact: true }).selectOption('diwali');
  await expect(page.getByText('Fill in: Open again on, Open again at.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send in the app' })).toBeDisabled();
  await page.getByLabel('Open again on', { exact: true }).fill('2026-11-09');
  await page.getByLabel('Open again at', { exact: true }).fill('06:00');
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Gym closed on Sunday 8 Nov / रविवार 8 नवंबर को जिम बंद रहेगा');
  await expect(page.getByLabel('Message', { exact: true })).toHaveValue(
    'The gym is closed on Sunday 8 Nov for Diwali. We open again on Monday 9 Nov at 6 am. Happy Diwali!\n\n' +
      'दिवाली के कारण रविवार 8 नवंबर को जिम बंद रहेगा। सोमवार 9 नवंबर को सुबह 6 बजे से फिर खुलेगा। दिवाली की शुभकामनाएँ!',
  );
  // The letter count warns near the server's 60: this title is exactly 60.
  await expect(page.getByText('60 of 60 letters · 0 left')).toBeVisible();
  await expectFitsPhone(page, 'with the boxes filled');

  // ---- Who gets it: a smaller group. The app message would still reach everyone: said plainly.
  await page.getByLabel('Group', { exact: true }).selectOption('ending7');
  await expect(page.getByText('In the app this goes to everyone; for just this group, use WhatsApp.')).toBeVisible();
  await expect(page.getByRole('main')).toContainText(`In this group: ${ending} members.`);
  // Everyone with a plan running today: a long list for the WhatsApp queue.
  await page.getByLabel('Group', { exact: true }).selectOption('active');
  await expect(page.getByText('In the app this goes to everyone; for just this group, use WhatsApp.')).toBeVisible();

  // ---- WhatsApp one by one, A to Z: open, then skip, then close.
  const waButton = page.getByRole('button', { name: /^WhatsApp one by one \(\d+\)$/ });
  const total = Number(/\((\d+)\)/.exec((await waButton.textContent()) ?? '')?.[1]);
  expect(total).toBeGreaterThan(3);
  await waButton.tap();
  const queue = sheet(page, 'WhatsApp one by one');
  await expect(queue.getByText(new RegExp(`^1 of ${total}: `))).toBeVisible();
  await expectFitsPhone(page, 'in the WhatsApp list');
  const link = queue.getByRole('link', { name: /^Open WhatsApp for / });
  const first = ((await link.getAttribute('aria-label')) ?? '').replace('Open WhatsApp for ', '');
  const href = decodeURIComponent((await link.getAttribute('href')) ?? '');
  expect(href).toMatch(/^https:\/\/wa\.me\/91\d{10}\?text=/);
  expect(href).toContain('*Gym closed on Sunday 8 Nov / रविवार 8 नवंबर को जिम बंद रहेगा*');
  expect(href).toContain('दिवाली की शुभकामनाएँ!\n– Iron Temple Fitness');
  const popup = context.waitForEvent('page');
  await link.tap();
  await (await popup).close();
  expect(opened).toHaveLength(1);
  expect(opened[0]).toBe(href); // the member shown, never the next one
  await expect(queue.getByText(new RegExp(`^2 of ${total}: `))).toBeVisible();
  await expect(queue.getByText(/^1 done so far/)).toBeVisible();
  await queue.getByRole('button', { name: /^Skip / }).tap();
  await expect(queue.getByText(new RegExp(`^3 of ${total}: `))).toBeVisible();
  await queue.getByRole('button', { name: 'Done', exact: true }).tap();
  await expect(queue).toBeHidden();
  await expect(page.getByText(`1 of ${total} done on WhatsApp for this message.`)).toBeVisible();

  // ---- A reload keeps who was done for the same words (and the language picked).
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Messages & offers', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Closed for a festival' }).tap();
  await expect(page.getByRole('group', { name: 'Language of the message' }).getByRole('button', { name: 'Both' })).toHaveAttribute('aria-pressed', 'true');
  await fillClosedForDiwali(page);
  await page.getByLabel('Group', { exact: true }).selectOption('active');
  await expect(page.getByText(`1 of ${total} done on WhatsApp for this message.`)).toBeVisible();
  await waButton.tap();
  // It opens at the first one not done: the one skipped.
  await expect(queue.getByText(new RegExp(`^2 of ${total}: `))).toBeVisible();
  await expect(queue.getByText(/^1 done so far/)).toBeVisible();
  await queue.getByRole('button', { name: 'Back' }).tap();
  await expect(queue.getByText(`1 of ${total}: ${first} · done`)).toBeVisible();
  await queue.getByRole('button', { name: 'Done', exact: true }).tap();

  // ---- New words start the list again.
  await page.getByLabel('Open again at', { exact: true }).fill('07:00');
  await expect(page.getByText('Opens your own WhatsApp with the words typed in. It costs nothing.')).toBeVisible();
  await waButton.tap();
  await expect(queue.getByText(new RegExp(`^1 of ${total}: ${first}$`))).toBeVisible();
  await expect(queue.getByText(/^0 done so far/)).toBeVisible();
  await queue.getByRole('button', { name: 'Done', exact: true }).tap();

  // ---- In the app: to everyone; "In the app: 2 members", then sent and listed.
  await page.getByLabel('Group', { exact: true }).selectOption('everyone');
  await expect(page.getByText('In the app this goes to everyone; for just this group, use WhatsApp.')).toBeHidden();
  await expect(page.getByRole('main')).toContainText(/In the app: \d+ members\. Not in the app: \d+\./);
  await page.getByRole('button', { name: 'Send in the app' }).tap();
  await expect(page.getByText('Goes to 2 members in the app. Send now?')).toBeVisible();
  await page.getByRole('button', { name: 'Yes, send' }).tap();
  await expect(page.getByText('Sent to 2 members in the app.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send in the app' })).toBeHidden();
  const sent = server.log.filter((c) => c.fn === 'owner_send_message');
  expect(sent).toHaveLength(1);
  expect(sent[0].args.p_kind).toBe('closed');
  expect(sent[0].args.p_title).toBe('Gym closed on Sunday 8 Nov / रविवार 8 नवंबर को जिम बंद रहेगा');
  expect(sent[0].args.p_body).toContain('सुबह 7 बजे से फिर खुलेगा।');
  await expect(page.getByRole('button', { name: 'Take back Gym closed on Sunday 8 Nov / रविवार 8 नवंबर को जिम बंद रहेगा' })).toBeVisible();
  await expectFitsPhone(page, 'after sending');
});
