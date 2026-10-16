// UAT WP5 journeys 6-9: enquiries, expenses, check-in and import, driven on a phone by the owner.
import { writeFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

import {
  MEMBERS,
  addMember,
  expectFitsPhone,
  freshGym,
  gymWithMonthlyPlan,
  open,
  openMember,
  sell,
  sheet,
  tile,
} from './support.mjs';

/** One enquiry row: name, number, follow-up line, buttons. */
function enquiryRow(page, name) {
  return page
    .getByRole('main')
    .locator('div')
    .filter({ has: page.getByRole('link', { name: `Call ${name}` }) })
    .filter({ hasText: name })
    .last()
    .locator('xpath=..');
}

async function addEnquiry(page, { name, phone, interest, followUpOn }) {
  await page.getByRole('button', { name: '+ Add enquiry' }).first().tap();
  const s = sheet(page, 'Add enquiry');
  await expect(s).toBeVisible();
  await expectFitsPhone(page, 'in Add enquiry');
  await s.getByLabel('Name').fill(name);
  await s.getByLabel('Mobile number').fill(phone);
  if (interest) await s.getByLabel('Interested in (optional)').fill(interest);
  if (followUpOn) await s.getByLabel('Follow-up date').fill(followUpOn);
  await s.getByRole('button', { name: 'Save enquiry' }).tap();
  await expect(s).toBeHidden();
}

/** A filter chip on Enquiries ("Follow up today 1", "Later 1", ...). */
function chip(page, label) {
  return page.getByRole('group', { name: 'Show enquiries' }).getByRole('button', { name: new RegExp(`^${label}`) });
}

test('J6 enquiry -> member; another marked not interested, then reopened', async ({ page }) => {
  await freshGym(page);
  await open(page, 'Enquiries');
  await expect(page.getByRole('heading', { name: 'Enquiries', exact: true })).toBeVisible();

  // Deepak: call back today. Esha: the form's own default, tomorrow.
  await addEnquiry(page, { name: 'Deepak Meena', phone: '98290 44444', interest: '3 months, evening', followUpOn: '2026-10-17' });
  await addEnquiry(page, { name: 'Esha Jain', phone: '98290 55555' });

  await expect(chip(page, 'Follow up today')).toHaveText(/1/);
  const deepak = enquiryRow(page, 'Deepak Meena');
  await expect(deepak).toContainText('Call back 17 Oct 2026 · today');
  await expect(deepak).toContainText('3 months, evening');
  await chip(page, 'Later').tap();
  const esha = enquiryRow(page, 'Esha Jain');
  await expect(esha).toContainText('Call back 18 Oct 2026 · tomorrow');

  // Today counts the call due today.
  await open(page, 'Today');
  await expect(tile(page, 'Enquiries to call')).toContainText('1');

  // Make Deepak a member: the Add member form opens with his name and number filled in.
  await open(page, 'Enquiries');
  await page.getByRole('button', { name: 'Make Deepak Meena a member' }).tap();
  const add = sheet(page, 'Add member');
  await expect(add.getByLabel('Full name')).toHaveValue('Deepak Meena');
  await expect(add.getByLabel('Mobile number')).toHaveValue(/98290\s?44444/);
  await add.getByRole('button', { name: 'Add member' }).tap();
  await expect(page.getByRole('heading', { name: 'Deepak Meena', exact: true })).toBeVisible();
  await expect(page.getByRole('main')).toContainText('No membership yet.');

  // The enquiry is closed as Joined, linked to the member.
  await open(page, 'Enquiries');
  await expect(chip(page, 'Follow up today')).toHaveText(/0/);
  await chip(page, 'Joined').tap();
  await expect(enquiryRow(page, 'Deepak Meena')).toContainText('Joined');
  await enquiryRow(page, 'Deepak Meena').getByRole('button', { name: 'Open member' }).tap();
  await expect(page.getByRole('heading', { name: 'Deepak Meena', exact: true })).toBeVisible();
  await open(page, 'Members');
  await expect(page.getByText('1 member', { exact: true })).toBeVisible();

  // Esha is not interested: an Undo bar, and she moves to "Not interested".
  await open(page, 'Enquiries');
  await chip(page, 'Later').tap();
  await page.getByRole('button', { name: 'Esha Jain is not interested' }).tap();
  await expect(page.getByText('Esha Jain: marked not interested.')).toBeVisible();
  await expect(chip(page, 'Later')).toHaveText(/0/);
  await chip(page, 'Not interested').tap();
  await expect(enquiryRow(page, 'Esha Jain')).toContainText('Not interested');

  // Reopen her: back under Later, with her call-back day.
  await page.getByRole('button', { name: 'Reopen Esha Jain' }).tap();
  await expect(chip(page, 'Not interested')).toHaveText(/0/);
  await chip(page, 'Later').tap();
  await expect(enquiryRow(page, 'Esha Jain')).toContainText('Call back 18 Oct 2026 · tomorrow');

  // And the Undo bar does the same: not interested, then Undo.
  await page.getByRole('button', { name: 'Esha Jain is not interested' }).tap();
  await page.getByRole('status').filter({ hasText: 'marked not interested' }).getByRole('button', { name: 'Undo' }).tap();
  await expect(chip(page, 'Later')).toHaveText(/1/);
});

test('J6b enquiry from an archived member\'s number brings the member back', async ({ page }) => {
  await freshGym(page);
  await addMember(page, { name: 'Farhan Ali', phone: '98290 66666' });
  await page.getByRole('button', { name: 'Archive member' }).tap();
  await expect(page.getByText('Member archived.')).toBeVisible();

  await open(page, 'Enquiries');
  await page.getByRole('button', { name: '+ Add enquiry' }).first().tap();
  const s = sheet(page, 'Add enquiry');
  await s.getByLabel('Name').fill('Farhan A');
  await s.getByLabel('Mobile number').fill('98290 66666');
  await expect(s.getByRole('status')).toHaveText('Farhan Ali is already a member with this number.');
  await s.getByLabel('Follow-up date').fill('2026-10-17');
  await s.getByRole('button', { name: 'Save enquiry' }).tap();

  await page.getByRole('button', { name: 'Make Farhan A a member' }).tap();
  const back = sheet(page, 'Already a member (archived)');
  await expect(back).toContainText('Farhan Ali already has');
  await back.getByRole('button', { name: 'Bring back and mark joined' }).tap();
  await expect(page.getByRole('heading', { name: 'Farhan Ali', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Archive member' })).toBeVisible();
  await open(page, 'Members');
  await expect(page.getByText('1 member', { exact: true })).toBeVisible();
  await open(page, 'Enquiries');
  await chip(page, 'Joined').tap();
  await expect(enquiryRow(page, 'Farhan A')).toContainText('Joined');
});

test('J7 expenses: add one, remove one; the month\'s profit follows', async ({ page }) => {
  await gymWithMonthlyPlan(page);
  await addMember(page, MEMBERS.full);
  await sell(page, { received: '2000' });

  await open(page, 'Expenses');
  await expect(page.getByRole('heading', { name: 'Expenses', exact: true })).toBeVisible();
  await expect(page.getByText('No expenses this month')).toBeVisible();
  await expect(tile(page, 'Profit')).toContainText('₹2,000');

  const addExpense = async (amount, what, note) => {
    await page.getByRole('button', { name: '+ Add expense' }).first().tap();
    const s = sheet(page, 'Add expense');
    await expect(s).toBeVisible();
    await expectFitsPhone(page, 'in Add expense');
    await s.getByLabel('Amount').fill(amount);
    await s.getByLabel('What for').selectOption({ label: what });
    await expect(s.getByLabel('Date')).toHaveValue('2026-10-17');
    if (note) await s.getByLabel('Note (optional)').fill(note);
    await s.getByRole('button', { name: 'Save expense' }).tap();
    await expect(s).toBeHidden();
    await expect(page.getByText('Expense added.')).toBeVisible();
  };

  // Rent of Rs 1,25,000: lakh grouping, and a month that spent more than it collected.
  await addExpense('125000', 'Rent', 'October rent');
  await expect(tile(page, 'Collected')).toContainText('₹2,000');
  await expect(tile(page, 'Expenses')).toContainText('₹1,25,000');
  await expect(tile(page, 'Profit')).toContainText('-₹1,23,000');
  await expect(tile(page, 'Profit')).toContainText('Spent more than collected');
  await expect(page.getByRole('main')).toContainText('17 Oct 2026 · October rent');

  // A day that has not come yet is refused.
  await page.getByRole('button', { name: '+ Add expense' }).first().tap();
  const future = sheet(page, 'Add expense');
  await future.getByLabel('Amount').fill('300');
  await future.getByLabel('Date').fill('2026-10-18');
  await future.getByRole('button', { name: 'Save expense' }).tap();
  await expect(future.getByRole('alert')).toHaveText('The expense date can’t be in the future.');
  await future.getByRole('button', { name: 'Cancel' }).tap();
  await expect(tile(page, 'Expenses')).toContainText('₹1,25,000');

  await addExpense('800', 'Electricity');
  await expect(tile(page, 'Expenses')).toContainText('₹1,25,800');
  await expect(tile(page, 'Profit')).toContainText('-₹1,23,800');

  // Remove the rent (it was typed twice by mistake): asks first, then the profit is Rs 1,200.
  await page.getByRole('button', { name: 'Remove Rent ₹1,25,000 on 17 Oct 2026' }).tap();
  const r = sheet(page, 'Remove this expense?');
  await expect(r).toContainText('₹1,25,000 · Rent (17 Oct 2026) will be removed for good.');
  await r.getByRole('button', { name: 'Remove' }).tap();
  await expect(page.getByText('Expense removed.')).toBeVisible();
  await expect(tile(page, 'Expenses')).toContainText('₹800');
  await expect(tile(page, 'Profit')).toContainText('₹1,200');
  await expect(tile(page, 'Profit')).not.toContainText('Spent more');
  await expect(page.getByRole('button', { name: /^Remove Rent/ })).toHaveCount(0);
});

test('J8 check in by hand, undo it; a back-dated check-in; a future day is refused', async ({ page }) => {
  await gymWithMonthlyPlan(page);
  await addMember(page, MEMBERS.full);
  await sell(page, { received: '2000' });

  await open(page, 'Visits');
  await expect(page.getByRole('heading', { name: 'Attendance', exact: true })).toBeVisible();
  const search = page.getByRole('searchbox', { name: 'Type a name or the last 4 digits of a mobile' })
    .or(page.getByLabel('Type a name or the last 4 digits of a mobile'));

  // Today, by name.
  await search.fill('Asha');
  await page.getByRole('main').getByRole('button', { name: 'Check in', exact: true }).tap();
  await expect(page.getByText('Asha Verma checked in.')).toBeVisible();
  await expect(tile(page, 'Check-ins today')).toContainText('1');
  await expect(page.getByRole('button', { name: 'Undo check-in for Asha Verma' })).toBeVisible();
  // The same person again today: already in.
  await search.fill('1111');
  await expect(page.getByRole('main').getByText('✓ Already in')).toBeVisible();
  await search.fill('');
  // The member page agrees.
  await openMember(page, MEMBERS.full.name);
  await expect(page.getByRole('button', { name: 'Checked in today' })).toBeDisabled();
  await expect(tile(page, 'Total visits')).toContainText('1');

  // Undo it.
  await open(page, 'Visits');
  await page.getByRole('button', { name: 'Undo check-in for Asha Verma' }).tap();
  await expect(page.getByText('Check-in removed for Asha Verma.')).toBeVisible();
  await expect(tile(page, 'Check-ins today')).toContainText('0');
  await expect(page.getByText('Nobody yet')).toBeVisible();

  // Another day: 15 Oct, which the desk missed.
  const day = page.getByRole('group', { name: 'Day' });
  await day.getByRole('button', { name: 'Another day' }).tap();
  await page.getByLabel('Register date').fill('2026-10-15');
  await expect(page.getByRole('main')).toContainText('Adding check-ins for 15 Oct 2026, not today.');
  await expectFitsPhone(page, 'on the register for another day');
  await search.fill('Asha');
  await page.getByRole('main').getByRole('button', { name: 'Check in', exact: true }).tap();
  await expect(page.getByText('Asha Verma checked in.')).toBeVisible();
  await expect(tile(page, 'Check-ins on 15 Oct')).toContainText('1');
  await expect(page.getByRole('main')).toContainText('In on 15 Oct 2026');

  // A future day is refused: the box to check people in goes away.
  await page.getByLabel('Register date').fill('2026-10-20');
  await expect(page.getByText('That day hasn’t happened yet.')).toBeVisible();
  await expect(page.getByText('Pick a day first')).toBeVisible();
  await expect(search).toHaveCount(0);

  // Today is still empty; the back-dated visit is on her page.
  await day.getByRole('button', { name: 'Today' }).tap();
  await expect(tile(page, 'Check-ins today')).toContainText('0');
  await openMember(page, MEMBERS.full.name);
  await expect(tile(page, 'Last visit')).toContainText('15 Oct 2026');
  await expect(tile(page, 'Total visits')).toContainText('1');
});

test('J9 import members from a CSV, then "Undo this import"', async ({ page }, testInfo) => {
  await freshGym(page);
  await addMember(page, { name: 'Already Here', phone: '98290 77770' });

  const csv = testInfo.outputPath('members.csv');
  await writeFile(
    csv,
    [
      'Name,Mobile',
      'Gaurav Sharma,9829077771',
      'Hema Joshi,9829077772',
      'Irfan Khan,9829077773',
      'Already Here,9829077770',
      'Bad Number,12345',
      '',
    ].join('\n'),
  );

  await open(page, 'Members');
  await page.getByRole('button', { name: 'Import from Excel' }).first().tap();
  await expect(page.getByRole('heading', { name: 'Import members from Excel', exact: true })).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose file' }).tap();
  await (await chooser).setFiles(csv);

  // The review: three new, one already a member, one with a mobile number that is not one.
  const add = page.getByRole('button', { name: 'Add 3 members' });
  await expect(add).toBeVisible();
  await expectFitsPhone(page, 'on the import review');
  await expect(page.getByRole('button', { name: /^Will be added/ })).toHaveText(/3/);
  await expect(page.getByRole('button', { name: /^Already members/ })).toHaveText(/1/);
  await expect(page.getByRole('button', { name: /^Problems/ })).toHaveText(/1/);
  await add.tap();
  await expect(page.getByText('3 added, 2 skipped')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download 2 skipped rows' })).toBeVisible();

  await page.getByRole('button', { name: 'Open members' }).tap();
  await expect(page.getByText('4 members')).toBeVisible();
  for (const name of ['Gaurav Sharma', 'Hema Joshi', 'Irfan Khan']) {
    await expect(page.getByRole('main').getByRole('link', { name: new RegExp(name) })).toBeVisible();
  }

  // Undo this import: asks first, says what goes; the member added by hand stays.
  await page.getByRole('button', { name: 'Import from Excel' }).first().tap();
  await page.getByRole('button', { name: /^Undo the import of/ }).tap();
  await expect(page.getByRole('main')).toContainText('This removes what this file added: 3 members, 0 plans with dates, 0 receipts and 0 plan names from Plans.');
  await page.getByRole('button', { name: 'Yes, undo it' }).tap();
  await expect(page.getByRole('main')).toContainText('Import undone: 3 members, 0 plans with dates, 0 receipts and 0 plan names removed.');
  await open(page, 'Members');
  await expect(page.getByText('1 member', { exact: true })).toBeVisible();
  await expect(page.getByRole('main').getByRole('link', { name: /Already Here/ })).toBeVisible();
  await expect(page.getByRole('main').getByRole('link', { name: /Gaurav Sharma/ })).toHaveCount(0);
});
