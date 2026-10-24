// #41 (24 Oct 2026): a gym with branches, driven the way an owner and a front desk use it, on a phone.
// The server is e2e/branchNet.mjs: one pretend gym per branch, as 0031 keeps them.
//
// J80: the owner adds a branch in Settings (plans copied), opens it, sells a plan there (its receipt
//      numbers start B2/), switches between branches at the top, and sees both on "All branches".
// J81: a member whose plan covers every branch checks in at the OTHER branch's desk; the visit shows
//      at home with "At <branch>", and at the branch under "From other branches today".
// J82: one branch only: no switch at the top, no "All branches", the member form has no branch box.
// J83: one sheet for every branch: a Branch column sends each member to their branch; a name that
//      matches no branch is asked about once; the rest goes in.
import { writeFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

import { BranchNetwork } from './branchNet.mjs';
import { NOW, addMember, addPlan, chooseFile, expectFitsPhone, open, openMember, sell, sheet, startOnlineGym, tile } from './support.mjs';

async function openBranchApp(page) {
  const net = new BranchNetwork();
  await net.attach(page.context());
  await page.clock.install({ time: NOW });
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Start demo' })).toBeVisible();
  await startOnlineGym(page, { gym: 'Shakti Gym' });
  return net;
}

function branchPick(page) {
  return page.getByRole('banner').getByRole('combobox', { name: 'Branch' });
}

/** Settings -> Branches -> Add a branch -> name -> Add branch. */
async function addBranch(page, name, { copyPlans = true } = {}) {
  await open(page, 'Settings');
  const card = page.getByRole('main').locator('div').filter({ has: page.getByRole('heading', { name: 'Branches' }) }).filter({ has: page.getByRole('button', { name: 'Add a branch' }) }).last();
  await card.getByRole('button', { name: 'Add a branch' }).tap();
  const s = sheet(page, 'Add a branch');
  await expect(s).toBeVisible();
  await expectFitsPhone(page, 'in Add a branch');
  await s.getByLabel('Branch name').fill(name);
  if (!copyPlans) await s.getByRole('checkbox', { name: 'Copy this branch’s plans to the new branch' }).uncheck();
  await s.getByRole('button', { name: 'Add branch' }).tap();
  await expect(s).toBeHidden();
  return card;
}

test('J80 add a branch, sell there with its own receipt numbers, switch, and see All branches', async ({ page }) => {
  const net = await openBranchApp(page);
  // One branch so far: no switch at the top.
  await expect(branchPick(page)).toHaveCount(0);
  await addPlan(page, { name: 'Monthly', price: '1500' });
  await addMember(page, { name: 'Asha Verma', phone: '98290 11111' });
  expect(await sell(page, { received: '1500' })).toBe('Membership saved. Receipt 2026-27/0001.');

  const card = await addBranch(page, 'Shakti Gym, Vaishali');
  await expect(card).toContainText('Shakti Gym, Vaishali is added. 1 plans were copied to it. Next: open it and add its front-desk staff.');
  await expect(card).toContainText('receipts start B2/2026-27/0001');
  expect(net.servers).toHaveLength(2);

  // Open it: the panel is now the new branch's (Staff & sign-in first, to add its desk).
  await card.getByRole('button', { name: 'Open Shakti Gym, Vaishali' }).tap();
  await expect(page.getByRole('heading', { name: 'Staff & sign-in', exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(branchPick(page)).toHaveValue('g-branch-2');
  await expect(page.getByRole('main')).toContainText('Owners are owners of every branch.');

  // The new branch has the copied plan and none of the first branch's members.
  await open(page, 'Members');
  await expect(page.getByRole('main').getByRole('link', { name: /Asha Verma/ })).toHaveCount(0);
  await addMember(page, { name: 'Chand Rao', phone: '98290 22222' });
  expect(await sell(page, { received: '1500' })).toBe('Membership saved. Receipt B2/2026-27/0001.');
  expect(net.servers[1].rows('payment').map((p) => p.receiptNo)).toEqual(['B2/2026-27/0001']);
  expect(net.servers[0].rows('payment').map((p) => p.receiptNo)).toEqual(['2026-27/0001']);

  // All branches: both branches, added up.
  await branchPick(page).selectOption({ label: 'All branches' });
  await expect(page.getByRole('heading', { name: 'All branches', exact: true })).toBeVisible();
  await expect(tile(page, 'Active members')).toContainText('2');
  await expect(tile(page, 'Money in this month')).toContainText('3,000');
  await expect(page.getByRole('main')).toContainText('Shakti Gym · 2 branches');
  await expectFitsPhone(page, 'on All branches');
  await page.getByRole('main').getByPlaceholder('Name or mobile number').fill('asha');
  await expect(page.getByRole('main')).toContainText('Shakti Gym · +91 98290 11111');

  // Back to the first branch with the switch: its own members again.
  await branchPick(page).selectOption({ label: 'Shakti Gym' });
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(branchPick(page)).toHaveValue('g-online');
  await open(page, 'Members');
  await expect(page.getByRole('main').getByRole('link', { name: /Asha Verma/ })).toBeVisible();
  await expect(page.getByRole('main').getByRole('link', { name: /Chand Rao/ })).toHaveCount(0);
  // The keys were kept: switching back did not make a new sign-in for the branch.
  expect(net.log.filter((c) => c.fn === 'owner_open_branch')).toHaveLength(0);
});

test('J81 a member of every branch checks in at the other branch', async ({ page }) => {
  const net = await openBranchApp(page);
  await addPlan(page, { name: 'Monthly', price: '1500' });
  await addMember(page, { name: 'Asha Verma', phone: '98290 11111' });
  await sell(page, { received: '1500' });
  await addBranch(page, 'Shakti Gym, Vaishali');

  // Back at the first branch, the owner lets Asha train at every branch.
  await openMember(page, 'Asha Verma');
  await page.getByRole('button', { name: 'Edit' }).tap();
  const edit = sheet(page, 'Edit member');
  await edit.getByRole('checkbox', { name: 'Can train at every branch' }).check();
  await edit.getByRole('button', { name: 'Save changes' }).tap();
  await expect(edit).toBeHidden();
  await expect(page.getByRole('main')).toContainText('Every branch');
  expect(net.servers[0].rows('member')[0].allBranches).toBe(true);

  // At the other branch's desk.
  await branchPick(page).selectOption({ label: 'Shakti Gym, Vaishali' });
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible({ timeout: 15_000 });
  await open(page, 'Visits');
  const visitor = page.getByRole('main').locator('div').filter({ has: page.getByRole('heading', { name: 'Member from another branch' }) }).filter({ has: page.getByLabel('Their mobile number') }).last();
  await visitor.getByLabel('Their mobile number').fill('98290 11111');
  await visitor.getByRole('button', { name: 'Find' }).tap();
  await expect(visitor).toContainText('Asha is a member of Shakti Gym. Their plan covers every branch.');
  await visitor.getByRole('button', { name: 'Check in Asha from Shakti Gym' }).tap();
  await expect(page.getByText('Asha (Shakti Gym) checked in.')).toBeVisible();
  await expect(visitor).toContainText('From other branches today');
  await expectFitsPhone(page, 'on Visits with a visitor');
  // Kept at home, saying where.
  const visit = net.servers[0].rows('visit')[0];
  expect(visit).toMatchObject({ memberId: net.servers[0].rows('member')[0].id, atGymId: 'g-branch-2', atGymName: 'Shakti Gym, Vaishali', source: 'desk' });

  // At home the register shows where she trained.
  await branchPick(page).selectOption({ label: 'Shakti Gym' });
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible({ timeout: 15_000 });
  await open(page, 'Visits');
  await expect(page.getByRole('main')).toContainText('At Shakti Gym, Vaishali');

  // A member whose plan is for one branch only is told so, with no check-in button.
  await addMember(page, { name: 'Bilal Khan', phone: '98290 33333' });
  await branchPick(page).selectOption({ label: 'Shakti Gym, Vaishali' });
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible({ timeout: 15_000 });
  await open(page, 'Visits');
  const again = page.getByRole('main').locator('div').filter({ has: page.getByRole('heading', { name: 'Member from another branch' }) }).filter({ has: page.getByLabel('Their mobile number') }).last();
  await again.getByLabel('Their mobile number').fill('98290 33333');
  await again.getByRole('button', { name: 'Find' }).tap();
  await expect(again).toContainText('Bilal is a member of Shakti Gym. Their plan is for that branch only.');
  await expect(again.getByRole('button', { name: /^Check in/ })).toHaveCount(0);
});

test('J82 one branch: nothing about branches shows but the Settings card', async ({ page }) => {
  await openBranchApp(page);
  await expect(branchPick(page)).toHaveCount(0);
  await addMember(page, { name: 'Asha Verma', phone: '98290 11111' });
  await page.getByRole('button', { name: 'Edit' }).tap();
  const edit = sheet(page, 'Edit member');
  await expect(edit.getByLabel('Full name')).toBeVisible();
  await expect(edit.getByRole('checkbox', { name: 'Can train at every branch' })).toHaveCount(0);
  await edit.getByRole('button', { name: 'Cancel' }).tap();
  await expect(edit).toBeHidden();
  await open(page, 'Visits');
  await expect(page.getByRole('heading', { name: 'Member from another branch' })).toHaveCount(0);
  await open(page, 'Settings');
  await expect(page.getByRole('main')).toContainText('Have more than one gym? Add each branch here.');
});

test('J83 one sheet for every branch: each member lands in their branch; an unknown name is asked about', async ({ page }, testInfo) => {
  const net = await openBranchApp(page);
  await addBranch(page, 'Shakti Gym, Vaishali', { copyPlans: false });
  const csv = testInfo.outputPath('all-branches.csv');
  await writeFile(
    csv,
    [
      'Name,Mobile,Branch,Joining date',
      'Asha Verma,9829011111,Shakti Gym,01/10/2026',
      'Chand Rao,9829022222,vaishali,02/10/2026',
      'Dev Mehta,9829044444,VAISHALI ,03/10/2026',
      'Esha Jain,9829055555,Jaipur Central,04/10/2026',
      '',
    ].join('\n'),
  );
  await chooseFile(page, csv);
  const main = page.getByRole('main');
  const names = main.locator('div').filter({ has: page.getByRole('heading', { name: 'Branches in your file' }) }).filter({ has: page.getByRole('combobox') }).last();
  await expect(names).toContainText('1 name matches none of your branches.');
  await expectFitsPhone(page, 'on the import review with branches');
  // The owner says where "Jaipur Central" goes: the Vaishali branch.
  await names.getByRole('combobox', { name: /Jaipur Central/ }).selectOption({ label: 'Shakti Gym, Vaishali' });
  await expect(names).not.toContainText('matches none of your branches');
  await page.getByRole('button', { name: /^Add \d+ members?$/ }).tap();
  await expect(main).toContainText(/4 added/, { timeout: 15_000 });
  expect(net.servers[0].rows('member').map((m) => m.fullName).sort()).toEqual(['Asha Verma']);
  expect(net.servers[1].rows('member').map((m) => m.fullName).sort()).toEqual(['Chand Rao', 'Dev Mehta', 'Esha Jain']);
});
