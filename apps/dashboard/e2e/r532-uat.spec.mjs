// R-532 UAT (owner, 14 Nov 2026): the diet plans were "samples"; now six ready-made plans, each goal in Veg and
// Non-veg, with every weight written out and safe numbers (logic/dietPlans.ts, docs/diet-plans/SOURCES.md).
// Driven like the owner: Diet plans -> "+ New plan" -> the picker (two groups), then a veg plan and a non-veg
// plan opened in the builder, and a member's "Send a diet plan". Phone (390 x 844) and computer (1280 x 900).
// Pictures for a person to read: e2e/.results/uat/r532-*.png (CI keeps them as dashboard-uat-pictures).
import { mkdirSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { addMember, expectFitsPhone, open, openApp, openMember, sheet, startOnlineGym } from './support.mjs';

const DIR = 'e2e/.results/uat';
mkdirSync(DIR, { recursive: true });

// Touch stays on (as in r526): the shared set-up taps. A computer still gets mouse clicks below.
const COMPUTER = { viewport: { width: 1280, height: 900 }, isMobile: false };
const ASHA = { name: 'Asha Verma', phone: '98290 11111' };
const VEG = ['Fat loss veg · 1,600 kcal', 'Muscle gain veg · 2,600 kcal', 'Maintenance veg · 2,200 kcal'];
const NON_VEG = ['Fat loss non-veg · 1,600 kcal', 'Muscle gain non-veg · 2,600 kcal', 'Maintenance non-veg · 2,200 kcal'];
const CHECK_FIRST = 'Show this plan to a doctor before you start if you are under 18, pregnant or breastfeeding, or have diabetes, high BP, kidney disease or a food allergy.';

async function shot(page, name) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/r532-${name}.png` });
}

const press = (loc, device) => (device === 'phone' ? loc.tap() : loc.click());

async function openDietPlans(page, device) {
  if (device === 'phone') return open(page, 'Diet plans');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /^Diet plans/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Diet plans' })).toBeVisible();
}

/** The picker: Veg then Non-veg, three plans each, no "sample" anywhere. */
async function checkPicker(page, device) {
  const picker = sheet(page, 'New diet plan');
  await expect(picker).toBeVisible();
  await expect(picker).toContainText('Start from a ready-made plan and change anything you like, or start empty.');
  await expect(picker).toContainText('Each ready-made plan is for an adult of about 60 to 70 kg who trains 3 to 5 days a week.');
  await expect(picker).not.toContainText(/sample/i);
  const veg = picker.getByRole('region', { name: 'Veg', exact: true });
  const nonVeg = picker.getByRole('region', { name: 'Non-veg', exact: true });
  await expect(veg).toContainText('No eggs, meat or fish');
  await expect(nonVeg).toContainText('With eggs, chicken or fish');
  for (const title of VEG) await expect(veg.getByRole('button', { name: new RegExp(`^${title}`) })).toBeVisible();
  for (const title of NON_VEG) await expect(nonVeg.getByRole('button', { name: new RegExp(`^${title}`) })).toBeVisible();
  await expect(veg.getByRole('button')).toHaveCount(3);
  await expect(nonVeg.getByRole('button')).toHaveCount(3);
  await expect(picker.getByRole('button', { name: /^Start empty/ })).toBeVisible();
  if (device === 'phone') await expectFitsPhone(page, 'in the ready-made plan picker');
  await shot(page, `${device}-1-picker`);
  await nonVeg.scrollIntoViewIfNeeded();
  await shot(page, `${device}-2-picker-non-veg`);
}

/** Open one ready-made plan in the builder and photograph its top, its meals and its notes. */
async function openPlan(page, device, title, n, { kcal, protein, food, line }) {
  await press(page.getByRole('button', { name: '+ New plan' }).first(), device);
  await press(sheet(page, 'New diet plan').getByRole('button', { name: new RegExp(`^${title}`) }), device);
  const b = sheet(page, 'New diet plan');
  await expect(b.getByLabel('Plan name')).toHaveValue(title);
  await expect(b.getByLabel('Calories a day (optional)')).toHaveValue(kcal);
  await expect(b.getByLabel('Protein a day (optional)')).toHaveValue(protein);
  const notes = b.getByLabel('Notes for the member (optional)');
  await expect(notes).toHaveValue(/Made for an adult of about 60 to 70 kg who trains 3 to 5 days a week\./);
  await expect(notes).toHaveValue(/This is a ready-made plan\. Your trainer can change it to suit you\./);
  await expect(notes).toHaveValue(new RegExp(CHECK_FIRST.replace(/[.()]/g, '\\$&')));
  await expect(notes).toHaveValue(/Talk to a doctor if you have a health condition\.$/);
  await expect(notes).not.toHaveValue(/sample/i);
  await expect(b.getByText('Add “Talk to a doctor')).toHaveCount(0);
  const foods = await b.getByLabel('Food, one per line').evaluateAll((els) => els.map((e) => e.value).join('\n'));
  expect(foods).toContain(line);
  if (food === 'veg') expect(foods).not.toMatch(/\b(eggs?|chicken|fish|omelette)\b/i);
  else expect(foods).toMatch(/\b(eggs?|chicken|fish)\b/i);
  if (device === 'phone') await expectFitsPhone(page, `in ${title}`);
  // Every food box and the notes box shows all its lines: nothing hidden under the box's own scroll (R-532 follow-up).
  const hidden = await b.locator('textarea').evaluateAll((els) =>
    // A box may scroll inside only once it reaches the 600 px most (about 26 lines).
    els.filter((e) => e.scrollHeight > e.clientHeight + 1 && e.offsetHeight < 600).map((e) => `${e.id}: ${e.scrollHeight} > ${e.clientHeight}`),
  );
  console.log(`[r532] ${title}: box heights ${await b.locator('textarea').evaluateAll((els) => els.map((e) => e.offsetHeight).join(', '))}`);
  expect(hidden, `boxes in ${title} that hide lines`).toEqual([]);
  await shot(page, `${device}-${n}-${food}-top`);
  await b.getByLabel('Food, one per line').nth(2).scrollIntoViewIfNeeded();
  await shot(page, `${device}-${n}-${food}-meals`);
  await notes.scrollIntoViewIfNeeded();
  await shot(page, `${device}-${n}-${food}-notes`);
  console.log(`[r532] ${title}: ${(await notes.inputValue()).length} letters of notes`);
  // Typing another line makes the box taller straight away, so the new line is not hidden either.
  const box = b.getByLabel('Food, one per line').first();
  const before = await box.evaluate((e) => e.clientHeight);
  await box.press('End');
  await box.evaluate((e) => e.setSelectionRange(e.value.length, e.value.length));
  await box.pressSequentially('\n1 cup green tea, no sugar');
  await expect.poll(() => box.evaluate((e) => e.clientHeight)).toBeGreaterThan(before);
  expect(await box.evaluate((e) => e.scrollHeight <= e.clientHeight + 1)).toBe(true);
  await press(b.getByRole('button', { name: 'Cancel' }), device);
  await expect(b).toBeHidden();
}

for (const device of ['phone', 'computer']) {
  test.describe(`R532 on a ${device}`, () => {
    if (device === 'computer') test.use(COMPUTER);

    test(`R532-${device}: the ready-made plans, veg and non-veg, opened in the builder`, async ({ page }) => {
      const server = await openApp(page);
      server.bodyServer = true;
      await startOnlineGym(page);
      await openDietPlans(page, device);
      const main = page.getByRole('main');
      await expect(main).toContainText('Start from a ready-made plan, like “Fat loss veg · 1,600 kcal”');
      await expect(main).not.toContainText(/sample/i);
      await shot(page, `${device}-0-empty-list`);

      await press(page.getByRole('button', { name: '+ New plan' }).first(), device);
      await checkPicker(page, device);
      await press(sheet(page, 'New diet plan').getByRole('button', { name: 'Cancel' }), device);

      await openPlan(page, device, 'Fat loss veg · 1,600 kcal', 3, { kcal: '1600', protein: '85', food: 'veg', line: '2 moong dal chilla: 50 g dry moong dal, 1 tsp oil' });
      await openPlan(page, device, 'Muscle gain non-veg · 2,600 kcal', 4, { kcal: '2600', protein: '125', food: 'non-veg', line: 'Chicken curry: 100 g raw boneless chicken, 1 tsp oil' });
      expect(server.diets ?? []).toHaveLength(0); // looking is free: nothing saved or sent
    });
  });
}

test('R532-phone: a member’s page offers “Start from a ready-made plan”', async ({ page }) => {
  const server = await openApp(page);
  server.bodyServer = true;
  await startOnlineGym(page);
  await addMember(page, ASHA);
  await openMember(page, ASHA.name);
  const diet = page.getByRole('main').getByRole('region', { name: 'Diet plan', exact: true });
  await diet.getByRole('button', { name: 'Send a diet plan' }).tap();
  const send = sheet(page, `Send a diet plan to ${ASHA.name}`);
  const row = send.getByRole('button', { name: /^Start from a ready-made plan/ });
  await expect(row).toContainText('Veg or non-veg, for fat loss, muscle gain or keeping your weight');
  await expect(send).not.toContainText(/sample/i);
  await shot(page, 'phone-5-member-send');
  await row.tap();
  await checkPicker(page, 'phone-member');
});
