// R-120 (24 Oct 2026): measurements taken by the trainer, and diet plans from the trainer, on a
// server that has 0035 (the pretend server's `bodyServer`). The owner measures a member at the desk
// (two days, change vs last time, a same-day refusal, a fix, a delete), writes a diet plan from a
// sample, sends it to the member and withdraws it. A server before 0035 says so in one line. On a
// 360px phone.
import { expect, test } from '@playwright/test';

import { addMember, expectFitsPhone, open, openApp, openMember, sheet, startOnlineGym, toast } from './support.mjs';

test.use({ viewport: { width: 360, height: 780 } });

const ASHA = { name: 'Asha Verma', phone: '98290 11111' };

/** A section of the member's page by its name. */
function card(page, name) {
  return page.getByRole('main').getByRole('region', { name, exact: true });
}

test('J60 body measurements: the trainer measures a member at the desk, sees the change since last time, fixes and deletes', async ({ page }) => {
  const server = await openApp(page);
  server.bodyServer = true;
  await startOnlineGym(page);
  await addMember(page, ASHA);
  const memberId = server.rows('member').find((m) => m.fullName === ASHA.name)?.id;
  expect(memberId).toBeTruthy();

  const body = card(page, 'Body measurements');
  await expect(body).toContainText('No measurements yet');

  // ---- A month ago: weight, waist and a body fat typed wrong first.
  await body.getByRole('button', { name: 'Add measurements' }).tap();
  let s = sheet(page, 'Add measurements');
  await expect(s).toBeVisible();
  await expectFitsPhone(page, 'in Add measurements');
  await s.getByLabel('Day measured').fill('2026-09-17');
  await s.getByLabel('Body weight (kg)').fill('74.2');
  await s.getByLabel('Body fat (%)').fill('abc');
  await s.getByLabel('Waist').fill('86');
  await s.getByRole('button', { name: 'Save' }).tap();
  await expect(s.getByText('Body fat: a number from 2 to 75 %.')).toBeVisible();
  await s.getByLabel('Body fat (%)').fill('25');
  await s.getByRole('button', { name: 'Save' }).tap();
  await expect(s).toBeHidden();
  await expect(toast(page)).toContainText('Measurements saved. Asha Verma sees them in the MettleUp app.');
  await expect(body).toContainText('17 Sep 2026');
  await expect(body).toContainText('Measured by Ramesh Sharma');

  // ---- Today (the form opens on today): the change since last time shows in brackets.
  await body.getByRole('button', { name: '+ Add' }).tap();
  s = sheet(page, 'Add measurements');
  await expect(s).toContainText('last time was 17 Sep');
  await s.getByLabel('Body weight (kg)').fill('73');
  await s.getByLabel('Waist').fill('84.5');
  await s.getByRole('button', { name: 'Save' }).tap();
  await expect(s).toBeHidden();
  const today = body.getByRole('list', { name: 'Measurements of 17 Oct 2026' });
  await expect(today).toContainText('Body weight 73 kg (−1.2)');
  await expect(today).toContainText('Waist 84.5 cm (−1.5)');

  // ---- The same day twice is refused in plain words.
  await body.getByRole('button', { name: '+ Add' }).tap();
  s = sheet(page, 'Add measurements');
  await s.getByLabel('Body weight (kg)').fill('72.9');
  await s.getByRole('button', { name: 'Save' }).tap();
  await expect(s.getByText('This member already has measurements on that day. Edit that entry instead.')).toBeVisible();
  await s.getByRole('button', { name: 'Cancel' }).tap();
  await expect(s).toBeHidden();

  // ---- Fix the old entry: the change today follows it.
  await body.getByRole('button', { name: 'Fix the measurements of 17 Sep 2026' }).tap();
  s = sheet(page, 'Fix measurements');
  await expect(s.getByLabel('Body weight (kg)')).toHaveValue('74.2');
  await s.getByLabel('Body weight (kg)').fill('74.5');
  await s.getByRole('button', { name: 'Save' }).tap();
  await expect(s).toBeHidden();
  await expect(toast(page)).toContainText('Measurements updated.');
  await expect(today).toContainText('Body weight 73 kg (−1.5)');

  const saves = server.log.filter((c) => c.fn === 'owner_save_measurement');
  expect(saves).toHaveLength(4);
  expect(saves[0].args).toMatchObject({ p_member: memberId, p_entry: { date: '2026-09-17', weightKg: 74.2, bodyFat: 25, tape: { waist: 86 }, note: null } });

  // ---- Delete today's: asked first; one entry left.
  await body.getByRole('button', { name: 'Fix the measurements of 17 Oct 2026' }).tap();
  await sheet(page, 'Fix measurements').getByRole('button', { name: 'Delete' }).tap();
  const confirm = sheet(page, 'Delete these measurements?');
  await expect(confirm).toContainText('go from your list and from Asha Verma’s app');
  await confirm.getByRole('button', { name: 'Delete' }).tap();
  await expect(confirm).toBeHidden();
  await expect(toast(page)).toContainText('Measurements deleted.');
  await expect(body.getByRole('list', { name: 'Measurements of 17 Oct 2026' })).toHaveCount(0);
  expect(server.measures).toHaveLength(1);
  await expectFitsPhone(page, 'after the measurements');
});

test('J61 diet plans: the trainer copies a sample, sends it to a member, sees it on their page and withdraws it', async ({ page }) => {
  const server = await openApp(page);
  server.bodyServer = true;
  await startOnlineGym(page);
  await addMember(page, ASHA);

  await open(page, 'Diet plans');
  const main = page.getByRole('main');
  await expect(main).toContainText('No diet plans yet');
  await expect(main).toContainText('Members see their plan in the MettleUp app (Gym → Diet plan) after they check in at the gym once.');

  // ---- A plan with no food is refused.
  await page.getByRole('button', { name: '+ New plan' }).first().tap();
  await sheet(page, 'New diet plan').getByRole('button', { name: /^Start empty/ }).tap();
  let s = sheet(page, 'New diet plan');
  await s.getByLabel('Plan name').fill('Quick one');
  await s.getByRole('button', { name: 'Save plan' }).tap();
  await expect(s.getByText('Add the food for at least one meal (one food per line).')).toBeVisible();
  await s.getByRole('button', { name: 'Cancel' }).tap();
  await expect(s).toBeHidden();

  // ---- From the sample, sent to Asha.
  await page.getByRole('button', { name: '+ New plan' }).first().tap();
  await sheet(page, 'New diet plan').getByRole('button', { name: /^Fat loss veg · 1,600 kcal/ }).tap();
  s = sheet(page, 'New diet plan');
  await expect(s.getByLabel('Plan name')).toHaveValue('Fat loss veg · 1,600 kcal');
  await expect(s.getByLabel('Calories a day (optional)')).toHaveValue('1600');
  await expect(s.getByLabel('Notes for the member (optional)')).toHaveValue(/Talk to a doctor if you have a health condition\./);
  await expectFitsPhone(page, 'in the diet plan builder');
  await s.getByLabel('Search members by name or mobile').fill('Asha');
  await s.getByRole('checkbox', { name: /Asha Verma/ }).check();
  await s.getByRole('button', { name: 'Save plan' }).tap();
  await expect(s).toBeHidden();
  await expect(toast(page)).toContainText('“Fat loss veg · 1,600 kcal” saved and sent.');
  await expect(main).toContainText('Sent to 1 member');
  await expect(main).toContainText('6 meals · 1,600 kcal · 90 g protein');

  const memberId = server.rows('member').find((m) => m.fullName === ASHA.name)?.id;
  expect(server.diets).toHaveLength(1);
  expect(server.diets[0]).toMatchObject({ title: 'Fat loss veg · 1,600 kcal', kcal: 1600, proteinG: 90, assign: { memberIds: [memberId], planIds: [] } });
  expect(server.diets[0].meals[1]).toEqual({ name: 'Breakfast', time: '8:30 am', items: ['2 moong dal chilla with mint chutney', '1 cup low-fat curd'] });

  // ---- On her page: she gets it; "Send a diet plan" says it is already sent.
  await openMember(page, ASHA.name);
  const diet = card(page, 'Diet plan');
  await expect(diet).toContainText('Fat loss veg · 1,600 kcal');
  await diet.getByRole('button', { name: 'Send a diet plan' }).tap();
  const send = sheet(page, `Send a diet plan to ${ASHA.name}`);
  await expect(send.getByRole('button', { name: 'Fat loss veg · 1,600 kcal: already sent' })).toBeDisabled();
  await send.getByRole('button', { name: 'Cancel' }).tap();

  // ---- Stop sending it to her from her page, then send it again in one tap.
  await diet.getByRole('button', { name: `Stop sending Fat loss veg · 1,600 kcal to ${ASHA.name}` }).tap();
  await expect(toast(page)).toContainText('Asha Verma no longer gets “Fat loss veg · 1,600 kcal”.');
  await expect(diet).toContainText('No diet plan sent yet.');
  await diet.getByRole('button', { name: 'Send a diet plan' }).tap();
  await sheet(page, `Send a diet plan to ${ASHA.name}`).getByRole('button', { name: `Send Fat loss veg · 1,600 kcal to ${ASHA.name}` }).tap();
  await expect(toast(page)).toContainText('“Fat loss veg · 1,600 kcal” sent to Asha Verma.');
  await expect(diet).toContainText('Fat loss veg · 1,600 kcal');

  // ---- Withdraw: asked first; folded away under Withdrawn plans.
  await open(page, 'Diet plans');
  await page.getByRole('button', { name: 'Withdraw Fat loss veg · 1,600 kcal' }).tap();
  const w = sheet(page, 'Withdraw this plan?');
  await w.getByRole('button', { name: 'Withdraw' }).tap();
  await expect(toast(page)).toContainText('Plan withdrawn.');
  await expect(main).toContainText('Withdrawn plans (1)');
  await expect(main).toContainText('No diet plans yet');
  expect(server.diets[0].withdrawn).toBe(true);
  await expectFitsPhone(page, 'on Diet plans');
});

test('J62 a server before 0035 says measurements and diet plans are not switched on yet', async ({ page }) => {
  await openApp(page);
  await startOnlineGym(page);
  await addMember(page, ASHA);
  await expect(card(page, 'Body measurements')).toContainText('Measurements are not switched on for your gym yet.');
  await expect(card(page, 'Diet plan')).toContainText('Diet plans are not switched on for your gym yet.');
  await open(page, 'Diet plans');
  await expect(page.getByRole('main')).toContainText('Diet plans are not switched on for your gym yet');
  await expect(page.getByRole('button', { name: '+ New plan' })).toHaveCount(0);
});
