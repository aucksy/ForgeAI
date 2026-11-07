// F105 (7 Nov 2026), UAT of More -> Trainers: trainer pages and personal-training bookings, on a phone (375 x 812)
// with computer pictures (1280 x 900). Every step taps the real screen; pictures go to e2e/.results/uat (CI uploads
// them as "dashboard-uat-pictures"). The gym's server is the pretend one (support.mjs). Today is Saturday
// 17 Oct 2026, 10:00 am India time.
//
//  1. A server without 0065 (the live server today): the page says plainly "Trainer pages are not ready for your
//     gym yet" and offers nothing to press; nothing is sent.
//  2. With 0065 but no one ticked "Trainer": "No trainers yet", with the way to Staff & sign-in.
//  3. Two trainers: their cards, the week, today's grid.
//  4. Rohit's page: Edit (a wrong shift, then Mon-Sat 6-10 am and 5-9 pm, what he teaches); his members with
//     personal-training classes left.
//  5. Book Asha with Rohit at 5 pm (from the grid). Clashes: Asha again with Meena (member busy), Bilal with Rohit
//     at 5:30 (trainer busy), Ravi (no classes left), Bilal at 11 am (outside hours: warned, then "Book anyway").
//  6. Cancel a booking.
//  7. The front desk on a second phone: sees the trainers and the week, can book, cannot edit a trainer's page.
import { mkdirSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { DESK, addDeskPerson, addMember, addPlan, expectFitsPhone, open, openApp, secondPhone, sell, sheet, signIn, startOnlineGym } from './support.mjs';

const DIR = 'e2e/.results/uat';
mkdirSync(DIR, { recursive: true });

async function shot(page, name, fullPage = true) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage });
}

function rosterIdOf(server, fullName) {
  const r = [...server.records.values()].find((x) => x.k === 'member' && !x.x && x.d.fullName === fullName);
  if (!r) throw new Error(`no member ${fullName}`);
  return r.id;
}

/** A personal-training pack sold earlier (a new record version, like the server after another desk's sale). */
function ptPack(server, memberName, { classes, used, trainer }) {
  const base = [...server.records.values()].find((x) => x.k === 'membership' && !x.x);
  if (!base) throw new Error('no membership to copy');
  const memberId = rosterIdOf(server, memberName);
  const id = `ms-pt-${memberId}`;
  server.version += 1;
  server.records.set(`membership:${id}`, {
    k: 'membership',
    id,
    x: false,
    ver: server.version,
    d: {
      ...base.d, id, memberId, planName: 'Personal training 10', startsOn: '2026-10-01', endsOn: '2026-11-30',
      ptSessions: classes, ptLog: Array.from({ length: used }, () => '2026-10-10'), trainer, cancelled: false,
    },
  });
}

const go = (page, path) =>
  page.evaluate((p) => {
    window.location.hash = p;
  }, path);

test.use({ viewport: { width: 375, height: 812 } });

test('F105: trainers, not ready, profiles, the week, booking clashes, cancel, the desk', async ({ page, browser }) => {
  const server = await openApp(page);
  await startOnlineGym(page);
  await addPlan(page, { name: 'Monthly', price: '1500', months: '1' });
  await addMember(page, { name: 'Asha Verma', phone: '98290 11111' });
  await sell(page, { received: '1500' });
  await addMember(page, { name: 'Bilal Khan', phone: '98290 33333' });
  await addMember(page, { name: 'Ravi Kumar', phone: '98290 22222' });
  ptPack(server, 'Asha Verma', { classes: 10, used: 4, trainer: 'Rohit' });
  ptPack(server, 'Bilal Khan', { classes: 5, used: 0, trainer: null });
  const main = page.getByRole('main');
  const booked = () => server.ptBookings.filter((b) => !b.cancelled);

  // 1. The live server today has no 0065: the page says so, nothing to press, nothing sent.
  await open(page, 'Trainers');
  await expect(page.getByRole('heading', { name: 'Trainers', exact: true })).toBeVisible();
  await expect(main.getByTestId('trainers-not-ready')).toContainText('Trainer pages are not ready for your gym yet');
  await expect(main.getByTestId('trainers-not-ready')).toContainText('Nothing you do here is saved.');
  await expect(main.getByRole('button', { name: 'Book personal training' })).toHaveCount(0);
  await expect(main.getByTestId('trainer-card')).toHaveCount(0);
  await expectFitsPhone(page, 'on Trainers, not ready');
  await shot(page, 'phone-trainers-1-not-ready');
  expect(server.log.filter((c) => ['owner_book_pt', 'owner_save_trainer_profile', 'owner_cancel_pt'].includes(c.fn))).toHaveLength(0);

  // 2. With 0065, nobody ticked yet.
  server.scheduleServer = true;
  await page.reload();
  await go(page, '/trainers');
  await expect(main.getByTestId('trainers-empty')).toContainText('No trainers yet');
  await expect(main.getByTestId('trainers-empty')).toContainText('tick "Trainer" next to each trainer');
  await expect(main.getByRole('button', { name: 'Open Staff & sign-in' })).toBeVisible();
  await shot(page, 'phone-trainers-2-no-trainers');

  // 3. Two trainers.
  server.ptTrainers = [{ id: 'st-rohit', name: 'Rohit Sharma' }, { id: 'st-meena', name: 'Meena' }];
  server.ptAssigned = { [rosterIdOf(server, 'Bilal Khan')]: 'st-meena' };
  await page.reload();
  await go(page, '/trainers');
  const rohitCard = main.getByTestId('trainer-card').filter({ hasText: 'Rohit Sharma' });
  await expect(rohitCard).toContainText('What they teach is not added yet');
  await expect(rohitCard).toContainText('Today: Working hours not set');
  await expect(rohitCard).toContainText('1 personal-training member');
  await expect(main.getByTestId('trainer-card').filter({ hasText: 'Meena' })).toContainText('1 personal-training member');
  await expect(main.getByText('Personal training this week')).toBeVisible();
  await expect(main.getByTestId('pt-grid')).toBeVisible();
  // Before 10 am today is over: no free slot at 9:30 am, free from 10:30.
  await expect(main.getByRole('button', { name: 'Book Rohit Sharma at 9:30 am' })).toHaveCount(0);
  await expect(main.getByRole('button', { name: 'Book Rohit Sharma at 10:30 am' })).toBeVisible();
  await expectFitsPhone(page, 'on Trainers with two trainers');
  await shot(page, 'phone-trainers-3-list-and-week');

  // 4. Rohit's page: Edit.
  await rohitCard.getByRole('button', { name: 'Open Rohit Sharma’s page' }).tap();
  await expect(page.getByRole('heading', { name: 'Rohit Sharma', exact: true })).toBeVisible();
  await expect(main.getByTestId('trainer-members')).toContainText('Asha Verma');
  await expect(main.getByTestId('trainer-members')).toContainText('6 personal-training classes left');
  await expect(main.getByTestId('trainer-members')).not.toContainText('session');
  await main.getByRole('button', { name: 'Edit page' }).tap();
  const edit = sheet(page, 'Edit Rohit Sharma’s page');
  await edit.getByLabel('What they teach').fill('Strength and weight loss');
  for (const d of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']) await edit.getByRole('button', { name: d, exact: true }).tap();
  await edit.getByLabel('Shift starts', { exact: true }).fill('10:00');
  await edit.getByLabel('Shift ends', { exact: true }).fill('06:00');
  await edit.getByRole('button', { name: 'Save page' }).tap();
  await expect(edit.getByTestId('edit-problem')).toContainText('Each shift must end after it starts.');
  await expectFitsPhone(page, 'in Edit trainer page');
  await shot(page, 'phone-trainers-4-edit-error', false);
  expect(server.log.filter((c) => c.fn === 'owner_save_trainer_profile')).toHaveLength(0);
  await edit.getByLabel('Shift starts', { exact: true }).fill('06:00');
  await edit.getByLabel('Shift ends', { exact: true }).fill('10:00');
  await edit.getByLabel('Second shift starts').fill('17:00');
  await edit.getByLabel('Second shift ends').fill('21:00');
  await edit.getByRole('button', { name: 'Save page' }).tap();
  await expect(edit).toBeHidden();
  await expect(page.getByText('Saved Rohit Sharma’s page.')).toBeVisible();
  await expect(page.getByRole('main').getByTestId('trainer-profile')).toContainText('Teaches: Strength and weight loss');
  const hours = main.getByTestId('trainer-hours');
  await expect(hours).toContainText('Saturday6:00 am to 10:00 am, 5:00 pm to 9:00 pm');
  await expect(hours).toContainText('SundayDay off');
  await shot(page, 'phone-trainers-5-rohit-page');

  // 5. Book Asha with Rohit at 5 pm today, from the grid.
  await go(page, '/trainers');
  await main.getByRole('button', { name: 'Book Rohit Sharma at 5:00 pm' }).tap();
  let book = sheet(page, 'Book personal training');
  await expect(book).toContainText('Rohit Sharma, Saturday: 6:00 am to 10:00 am, 5:00 pm to 9:00 pm');
  // Members with classes left are listed first; Ravi (none) is not, until searched.
  await expect(book.getByRole('button', { name: /^Asha Verma/ })).toContainText('6 personal-training classes left');
  await expect(book.getByRole('button', { name: /^Ravi Kumar/ })).toHaveCount(0);
  await book.getByRole('button', { name: /^Asha Verma/ }).tap();
  await expectFitsPhone(page, 'in Book personal training');
  await shot(page, 'phone-trainers-6-book-sheet', false);
  await book.getByRole('button', { name: 'Book', exact: true }).tap();
  await expect(book).toBeHidden();
  await expect(page.getByText('Booked: Asha Verma with Rohit Sharma, Sat 17 Oct, 5:00 pm to 6:00 pm.')).toBeVisible();
  expect(booked()).toHaveLength(1);
  await expect(main.getByRole('button', { name: 'Asha Verma with Rohit Sharma, 5:00 pm to 6:00 pm' })).toBeVisible();

  // Member busy: Asha with Meena at 5 pm.
  await main.getByRole('button', { name: 'Book Meena at 5:00 pm' }).tap();
  book = sheet(page, 'Book personal training');
  await book.getByRole('button', { name: /^Asha Verma/ }).tap();
  await book.getByRole('button', { name: 'Book', exact: true }).tap();
  await expect(book.getByTestId('book-problem')).toContainText('Asha Verma is already booked at 5:00 pm that day. Pick another time.');
  await shot(page, 'phone-trainers-7-member-busy', false);
  // Trainer busy: Bilal with Rohit at 5:30 pm.
  await book.getByRole('button', { name: 'Change member' }).tap();
  await book.getByRole('button', { name: /^Bilal Khan/ }).tap();
  await book.getByLabel('Trainer').selectOption({ label: 'Rohit Sharma' });
  await book.getByLabel('Start time').selectOption({ label: '5:30 pm' });
  await book.getByRole('button', { name: 'Book', exact: true }).tap();
  await expect(book.getByTestId('book-problem')).toContainText('Rohit Sharma already has Asha Verma at 5:00 pm. Pick another time.');
  // No classes left: Ravi.
  await book.getByRole('button', { name: 'Change member' }).tap();
  await book.getByRole('searchbox', { name: 'Search member name' }).fill('Ravi');
  await expect(book.getByRole('button', { name: /^Ravi Kumar/ })).toContainText('No personal-training classes left');
  await book.getByRole('button', { name: /^Ravi Kumar/ }).tap();
  await book.getByLabel('Start time').selectOption({ label: '7:00 pm' });
  await book.getByRole('button', { name: 'Book', exact: true }).tap();
  await expect(book.getByTestId('book-problem')).toContainText('Ravi Kumar has no personal-training classes left. Sell a personal-training plan first.');
  await shot(page, 'phone-trainers-8-no-classes', false);
  expect(booked()).toHaveLength(1);
  // Outside hours: Bilal with Rohit at 11 am: warned, then booked with "Book anyway".
  await book.getByRole('button', { name: 'Change member' }).tap();
  await book.getByRole('searchbox', { name: 'Search member name' }).fill('Bilal');
  await book.getByRole('button', { name: /^Bilal Khan/ }).tap();
  await book.getByLabel('Start time').selectOption({ label: '11:00 am' });
  await book.getByRole('button', { name: 'Book', exact: true }).tap();
  await expect(book.getByTestId('book-outside')).toContainText('This is outside Rohit Sharma’s working hours.');
  await shot(page, 'phone-trainers-9-outside-hours', false);
  expect(booked()).toHaveLength(1);
  await book.getByRole('button', { name: 'Book anyway' }).tap();
  await expect(book).toBeHidden();
  expect(booked()).toHaveLength(2);
  expect(booked()[1]).toMatchObject({ trainerId: 'st-rohit', start: 660, length: 60 });
  await expect(main.getByRole('button', { name: 'Bilal Khan with Rohit Sharma, 11:00 am to 12:00 pm' })).toBeVisible();
  await expectFitsPhone(page, 'on Trainers with bookings');
  await shot(page, 'phone-trainers-10-week-with-bookings');
  await page.setViewportSize({ width: 1280, height: 900 });
  await shot(page, 'computer-trainers-10-week-with-bookings');
  await page.setViewportSize({ width: 375, height: 812 });

  // 6. Cancel Bilal's booking.
  await main.getByRole('button', { name: 'Bilal Khan with Rohit Sharma, 11:00 am to 12:00 pm' }).tap();
  const detail = sheet(page, 'Bilal Khan with Rohit Sharma');
  await expect(detail).toContainText('Sat 17 Oct, 11:00 am to 12:00 pm');
  await expect(detail).toContainText('5 personal-training classes left');
  await shot(page, 'phone-trainers-11-booking', false);
  await detail.getByRole('button', { name: 'Cancel booking' }).tap();
  await expect(detail).toBeHidden();
  await expect(page.getByText('Booking cancelled.')).toBeVisible();
  expect(booked()).toHaveLength(1);
  await expect(main.getByRole('button', { name: 'Bilal Khan with Rohit Sharma, 11:00 am to 12:00 pm' })).toHaveCount(0);

  // Rohit's page shows the booking and Asha's classes booked.
  await go(page, `/trainers/st-rohit`);
  await expect(main.getByTestId('trainer-bookings')).toContainText('Sat 17 Oct, 5:00 pm to 6:00 pm');
  await expect(main.getByTestId('trainer-members')).toContainText('6 personal-training classes left · 1 booked');
  await page.setViewportSize({ width: 1280, height: 900 });
  await shot(page, 'computer-trainers-12-rohit-page');
  await page.setViewportSize({ width: 375, height: 812 });

  // 7. The front desk on a second phone: reads and books; no Edit on a trainer's page.
  await addDeskPerson(page);
  const desk = await secondPhone(browser, server);
  await signIn(desk, DESK.phone);
  await open(desk, 'Trainers');
  const deskMain = desk.getByRole('main');
  await expect(deskMain.getByTestId('trainer-card')).toHaveCount(2);
  await expect(deskMain.getByRole('button', { name: 'Asha Verma with Rohit Sharma, 5:00 pm to 6:00 pm' })).toBeVisible();
  await deskMain.getByRole('button', { name: 'Open Rohit Sharma’s page' }).tap();
  await expect(desk.getByRole('heading', { name: 'Rohit Sharma', exact: true })).toBeVisible();
  await expect(deskMain.getByRole('button', { name: 'Edit page' })).toHaveCount(0);
  await expect(deskMain.getByRole('button', { name: 'Book with Rohit Sharma' })).toBeVisible();
  await expectFitsPhone(desk, 'on the desk’s trainer page');
  await shot(desk, 'phone-trainers-13-desk-trainer-page');
  await desk.context().close();
});
