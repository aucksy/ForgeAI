// UAT WP6 journeys 4, 5 and 6, the owner's steps (admin app, live server).
//   XJ4a  (gym A) Plans: Monthly; Members: add Kiran Desk with a mobile; sell her the Monthly plan
//   XJ4c  (gym A) Today -> "Numbers to confirm": yes, the typed mobile is Kiran's (0048; passes when
//         nothing is waiting: 0048 not live yet)
//   XJ4b  (gym A) Visits: the member's check-in from the poster is there, tagged App
//   XJ6a  (gym B) Settings -> Branding: the brand colour, saved (before the member joins gym B)
//   XJ5a  (gym B) Members -> Import from Excel: a 2-row CSV, one row with the member's mobile
//   XJ5c  (gym B) Today -> "Numbers to confirm": yes, the typed mobile is Meera's (as XJ4c)
//   XJ5b  (gym B) Visits: the imported member's check-in from the poster, tagged App
import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

import { addMember, addPlan, blockWith, gymState, open, openAsOwner, sell, shot, tile, waitFor } from './support.mjs';

// The phone types these mobiles at the check-in (apps/mobile/qa/xj-4-checkin.yaml, xj-5-checkin.yaml).
const DESK_MEMBER = { name: 'Kiran Desk', phone: '98765 00011' };
const IMPORTED = { name: 'Meera Import', phone: '9876500021' };
const OTHER_ROW = { name: 'Nikhil Other', phone: '9876500022' };
/** The brand colour the owner sets; xj-6-brand.yaml and the pixel check look for it on the phone. */
const BRAND = process.env.XJ_BRAND || '#FF5CA8';

/** The register row for `name` on the Attendance page. */
function registerRow(page, name) {
  return blockWith(page, page.getByRole('link', { name, exact: true }), 'Undo');
}

async function expectAppVisit(page, name, testInfo, shotName) {
  await open(page, 'Visits');
  await expect(page.getByRole('heading', { name: 'Visits', exact: true })).toBeVisible();
  // The admin app reads new check-ins every 15 s; a reload between looks.
  await waitFor(page, () => registerRow(page, name).isVisible(), {
    what: `${name}'s check-in under "In today"`,
    reopen: () => open(page, 'Visits'),
  });
  const row = registerRow(page, name);
  await expect(row.getByText('App', { exact: true })).toBeVisible();
  await expect(row.getByTitle('Checked in with the MettleUp app')).toBeVisible();
  await expect(tile(page, 'Check-ins today')).toContainText('1');
  await shot(page, testInfo, shotName);
  return row;
}

/**
 * 0048: the gym's typed check-in numbers, read the way the card reads them (owner_phone_links), with
 * the run's own owner key and the publishable key the member app ships with. null = the server has no
 * owner_phone_links yet (0048 not live). The key is never printed.
 */
async function typedNumbers(slot) {
  const extra = JSON.parse(readFileSync(new URL('../../mobile/app.json', import.meta.url), 'utf8')).expo.extra;
  const res = await fetch(`${extra.supabaseUrl.replace(/\/+$/, '')}/rest/v1/rpc/owner_phone_links`, {
    method: 'POST',
    headers: { apikey: extra.supabasePublishableKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_key: gymState(slot).key }),
  });
  const text = await res.text();
  if (res.status === 404 && /PGRST202/.test(text)) return null;
  if (!res.ok) throw new Error(`owner_phone_links answered ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

/**
 * The desk's yes in "Numbers to confirm" on Today for the number `member` typed at the poster, when
 * one is waiting. Nothing waiting (0048 not live: the phone went straight in) passes as it is.
 */
async function confirmTypedNumber(page, slot, member, testInfo, shotName) {
  const before = await typedNumbers(slot);
  const waiting = (before ?? []).filter((r) => r.status === 'pending' && r.memberName === member.name);
  if (waiting.length === 0) {
    console.log(`CHECK OK ${slot} numbers to confirm: nothing waiting for ${member.name} (${before === null ? '0048 not on this server' : 'none pending'})`);
    return;
  }
  await openAsOwner(page, slot);
  const card = page.getByRole('region', { name: 'Numbers to confirm' });
  await waitFor(page, () => card.isVisible(), { what: 'the "Numbers to confirm" card on Today', timeoutMs: 60_000 });
  await expect(card).toContainText(member.name);
  await expect(card).toContainText('typed this number at check-in. Is it their number?');
  const yes = card.getByRole('button', { name: new RegExp(`^Yes, it.s theirs: ${member.name} · `) });
  await expect(yes).toHaveCount(1);
  await card.scrollIntoViewIfNeeded();
  await shot(page, testInfo, `${shotName}-asked`);
  await yes.tap();
  await expect(yes).toHaveCount(0, { timeout: 30_000 });
  const after = (await typedNumbers(slot)) ?? [];
  expect(after.filter((r) => r.status === 'pending' && r.memberName === member.name)).toEqual([]);
  expect(after.some((r) => r.status === 'approved' && r.memberName === member.name)).toBe(true);
  await shot(page, testInfo, `${shotName}-done`);
  console.log(`CHECK OK ${slot} numbers to confirm: ${member.name}'s number approved in the admin app`);
}

test('XJ4a owner adds a member with a mobile and sells a Monthly plan', async ({ page }, testInfo) => {
  await openAsOwner(page, 'A');
  await addPlan(page, { name: 'Monthly', price: '1500', joining: '0', months: '1' });
  await addMember(page, DESK_MEMBER);
  const said = await sell(page, { received: '1500' });
  expect(said).toMatch(/^Membership saved\. Receipt /);
  // Her page now says the plan is running.
  await expect(page.getByRole('main')).toContainText('Monthly');
  await shot(page, testInfo, 'xj4a-member-sold');
});

test('XJ4c desk confirms the typed mobile in Numbers to confirm', async ({ page }, testInfo) => {
  await confirmTypedNumber(page, 'A', DESK_MEMBER, testInfo, 'xj4c-number');
});

test('XJ4b owner sees the app check-in under Visits, tagged App', async ({ page }, testInfo) => {
  await openAsOwner(page, 'A');
  const row = await expectAppVisit(page, DESK_MEMBER.name, testInfo, 'xj4b-visit-app');
  // Her plan is active: no plan warning on the row.
  await expect(row).not.toContainText(/Ended|No plan|Expired/);
});

test('XJ6a owner sets the brand colour', async ({ page }, testInfo) => {
  await openAsOwner(page, 'B');
  await open(page, 'Settings');
  // R-247: branding sits on the Settings "Member app" tab.
  await page.getByRole('group', { name: 'Settings view' }).getByRole('button', { name: 'Member app' }).tap();
  await page.getByRole('button', { name: 'Open branding' }).tap();
  await expect(page.getByRole('heading', { name: 'Branding', exact: true })).toBeVisible();
  const hex = page.getByLabel('Your brand colour', { exact: true });
  await hex.fill(BRAND);
  await hex.blur();
  // The colour needs no change to be readable: members see exactly this one.
  await expect(page.getByText('Members see the changed colour, so it is easy to read.', { exact: false })).toHaveCount(0);
  await page.getByRole('button', { name: 'Save', exact: true }).tap();
  await expect(page.getByText(/^Saved\. New members see it at once\./)).toBeVisible();
  await shot(page, testInfo, 'xj6a-brand-saved');
});

test('XJ5a owner imports a 2-row CSV', async ({ page }, testInfo) => {
  await openAsOwner(page, 'B');
  const csv = testInfo.outputPath('xj5-members.csv');
  await writeFile(csv, ['Name,Mobile', `${IMPORTED.name},${IMPORTED.phone}`, `${OTHER_ROW.name},${OTHER_ROW.phone}`, ''].join('\n'));
  await open(page, 'Members');
  await page.getByRole('button', { name: 'Import from Excel' }).first().tap();
  await expect(page.getByRole('heading', { name: 'Import members from Excel', exact: true })).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose file' }).tap();
  await (await chooser).setFiles(csv);
  const add = page.getByRole('button', { name: 'Add 2 members' });
  await expect(add).toBeVisible({ timeout: 30_000 });
  await shot(page, testInfo, 'xj5a-import-review');
  await add.tap();
  await expect(page.getByText('2 added, 0 skipped')).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Open members' }).tap();
  await expect(page.getByText('2 members', { exact: true })).toBeVisible();
  for (const m of [IMPORTED, OTHER_ROW]) {
    await expect(page.getByRole('main').getByRole('link', { name: new RegExp(m.name) })).toBeVisible();
  }
  await shot(page, testInfo, 'xj5a-imported');
});

test('XJ5c desk confirms the typed mobile in Numbers to confirm', async ({ page }, testInfo) => {
  await confirmTypedNumber(page, 'B', IMPORTED, testInfo, 'xj5c-number');
});

test('XJ5b owner sees the imported member checked in, tagged App', async ({ page }, testInfo) => {
  await openAsOwner(page, 'B');
  await expectAppVisit(page, IMPORTED.name, testInfo, 'xj5b-visit-app');
  await expect(registerRow(page, OTHER_ROW.name)).toHaveCount(0);
});
