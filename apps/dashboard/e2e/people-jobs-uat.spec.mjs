// R-522 (owner, 14 Nov 2026): UAT of Settings -> Staff & sign-in -> "Add a person" with its four jobs (Owner, Staff
// (front desk), Trainer, Other + a typed job), the pill on each person's row, and R-523's Get started step "Add your
// staff and trainers". Phone (390 x 844) and computer (1280 x 900). Pictures go to e2e/.results/uat (CI uploads them
// as "dashboard-uat-pictures"). The gym's server is the pretend one (support.mjs), with the trainer view (0050, live)
// answered here, and the job names (0079, NOT live yet) first missing, then switched on.
// Second journey: the panel asks the server nothing while its tab is hidden, and asks at once when it comes back.
//
//  1. Today: Get started says "Add your staff and trainers", with its new line.
//  2. The pop-up: the four choices in order; each says what that person may do; Other shows a box for the job.
//  3. Negative: Other with no job typed is refused, and nothing is added.
//  4. Sunita as Trainer: front-desk access + the Trainer tick (the same call as the tick on her row); pill "Trainer".
//  5. Suresh as Other "Cleaner" before 0079: front-desk access; pill "Cleaner" (kept on this browser).
//  6. Vikram as Staff: pill "Staff". Anita as Owner: pill "Owner", owner access.
//  7. 0079 goes live: the kept "Cleaner" is sent to the server once; the pill stays.
//  8. Hinglish: the pop-up's words.
import { mkdirSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { NoSuchFunction, expectFitsPhone, openApp, sheet, startOnlineGym, wait } from './support.mjs';

const DIR = 'e2e/.results/uat';
mkdirSync(DIR, { recursive: true });

async function shot(page, name, fullPage = true) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage });
}

const PHONE = { width: 390, height: 844 };
const COMPUTER = { width: 1280, height: 900 };

/** 0050's trainer view (live) and 0079's job names (`jobs.on`; false = PGRST202, like the live server today). */
function installPeopleExtras(server) {
  const extra = { trainers: new Set(), jobs: new Map(), jobsOn: false, setTrainer: [], setJob: [] };
  const base = server.answer.bind(server);
  const people = () => [...server.people.values()];
  const setup = () => ({ people: people().map((p) => ({ id: p.staffId, name: p.name, role: p.role, trainer: extra.trainers.has(p.staffId) })), assigned: [] });
  server.answer = (fn, args) => {
    if (fn === 'owner_trainer_members') {
      server.calls.push(fn);
      server.ownerOnly(args.p_key);
      return { ok: true, role: 'owner', members: [] };
    }
    if (fn === 'owner_trainer_setup') {
      server.calls.push(fn);
      server.ownerOnly(args.p_key);
      return setup();
    }
    if (fn === 'owner_set_trainer') {
      server.calls.push(fn);
      server.ownerOnly(args.p_key);
      extra.setTrainer.push({ staff: args.p_staff, on: args.p_on });
      if (args.p_on) extra.trainers.add(args.p_staff);
      else extra.trainers.delete(args.p_staff);
      return setup();
    }
    if (fn === 'owner_set_person_job') {
      server.calls.push(fn);
      if (!extra.jobsOn) throw new NoSuchFunction(`Could not find the function public.${fn} in the schema cache`);
      server.ownerOnly(args.p_key);
      extra.setJob.push({ staff: args.p_staff, job: args.p_job });
      extra.jobs.set(args.p_staff, args.p_job);
      return { staffId: args.p_staff, job: args.p_job };
    }
    const r = base(fn, args);
    if (fn === 'owner_people' && extra.jobsOn) return r.map((p) => ({ ...p, job: p.role === 'staff' ? (extra.jobs.get(p.staffId) ?? null) : null }));
    return r;
  };
  return extra;
}

const go = (page, path) =>
  page.evaluate((p) => {
    window.location.hash = p;
  }, path);

/** One person's card on Staff & sign-in. */
function row(page, name) {
  return page
    .getByRole('main')
    .locator('div')
    .filter({ has: page.getByText(name, { exact: true }) })
    .filter({ has: page.getByRole('button', { name: 'Make sign-in code' }) })
    .last();
}

async function openAdd(page) {
  await page.getByRole('button', { name: 'Add a person' }).tap();
  const add = sheet(page, 'Add a person');
  await expect(add).toBeVisible();
  return add;
}

async function addPerson(page, { name, phone, job, typed }) {
  const add = await openAdd(page);
  await add.getByLabel('Name').fill(name);
  await add.getByLabel('Mobile number').fill(phone);
  await add.getByLabel('What is their job?').selectOption(job);
  if (typed) await add.getByLabel('Type the job (for example Manager, Cleaner)').fill(typed);
  await add.getByRole('button', { name: 'Add', exact: true }).tap();
  await expect(add).toBeHidden();
  await expect(row(page, name)).toBeVisible();
}

test.use({ viewport: PHONE });

test('R-522: Add a person with Owner, Staff, Trainer or Other; the pill on each row; Get started', async ({ page }) => {
  const server = await openApp(page);
  const extra = installPeopleExtras(server);
  await startOnlineGym(page);
  const main = page.getByRole('main');

  // 1. Get started (R-523).
  const step = main.getByRole('button', { name: /Add your staff and trainers/ }).first();
  await expect(step).toBeVisible();
  await expect(main).toContainText('They sign in with their own mobile number and a code. A trainer sees only their own members.');
  await expect(main.getByText('Add your desk staff')).toHaveCount(0);
  await step.scrollIntoViewIfNeeded();
  await shot(page, 'people-jobs-0-get-started-phone', false);

  // 2. The pop-up.
  await go(page, '/settings/people');
  await expect(page.getByRole('heading', { name: 'Staff & sign-in' })).toBeVisible();
  let add = await openAdd(page);
  const pick = add.getByLabel('What is their job?');
  await expect(pick).toHaveValue('staff');
  await expect(pick.locator('option')).toHaveText(['Owner', 'Staff (front desk)', 'Trainer', 'Other']);
  const hint = add.getByTestId('job-hint');
  const typedBox = add.getByLabel('Type the job (for example Manager, Cleaner)');
  await expect(hint).toHaveText('Adds members, collects fees and checks members in. Never sees money totals.');
  await expect(typedBox).toHaveCount(0);
  await expectFitsPhone(page, 'in Add a person');
  await shot(page, 'people-jobs-1-staff-phone', false);
  await pick.selectOption('owner');
  await expect(hint).toHaveText('Can do everything, including money totals.');
  await shot(page, 'people-jobs-2-owner-phone', false);
  await pick.selectOption('trainer');
  await expect(hint).toHaveText('Same access as the front desk, plus the workout progress of the members you give them.');
  await shot(page, 'people-jobs-3-trainer-phone', false);
  await pick.selectOption('other');
  await expect(hint).toHaveText('Same access as the front desk. The job only shows next to their name.');
  await expect(typedBox).toBeVisible();
  await shot(page, 'people-jobs-4-other-empty-phone', false);

  // 3. Negative: no job typed.
  await add.getByLabel('Name').fill('Nobody Yet');
  await add.getByLabel('Mobile number').fill('98290 00009');
  await add.getByRole('button', { name: 'Add', exact: true }).tap();
  await expect(add).toContainText('Type their job, like Manager or Cleaner.');
  await expect(add).toBeVisible();
  expect(server.calls.filter((c) => c === 'owner_add_person'), 'nothing added').toHaveLength(0);
  await typedBox.fill('  Head   cleaner  ');
  await expect(add).not.toContainText('Type their job, like Manager or Cleaner.');
  await expectFitsPhone(page, 'in Add a person with a job typed');
  await shot(page, 'people-jobs-5-other-typed-phone', false);
  await add.getByRole('button', { name: 'Cancel' }).tap();
  await expect(add).toBeHidden();

  // 4. Trainer.
  await addPerson(page, { name: 'Sunita Verma', phone: '98290 54321', job: 'trainer' });
  const sunita = [...server.people.values()].find((p) => p.name === 'Sunita Verma');
  expect(sunita.role, 'a trainer never gets owner powers').toBe('staff');
  expect(extra.setTrainer).toEqual([{ staff: sunita.staffId, on: true }]);
  await expect(page.getByText('Sunita Verma added. Now make a sign-in code for them.')).toBeVisible();
  await expect(row(page, 'Sunita Verma')).toContainText('Trainer');
  await expect(row(page, 'Sunita Verma').getByRole('checkbox', { name: /Trainer/ })).toBeChecked();

  // 5. Other, before 0079: kept on this browser, front-desk access.
  await addPerson(page, { name: 'Suresh Kumar', phone: '98290 54322', job: 'other', typed: 'Cleaner' });
  const suresh = [...server.people.values()].find((p) => p.name === 'Suresh Kumar');
  expect(suresh.role).toBe('staff');
  expect(extra.setJob, 'no 0079 yet: nothing saved on the server').toEqual([]);
  await expect(row(page, 'Suresh Kumar')).toContainText('Cleaner');

  // 6. Staff and Owner.
  await addPerson(page, { name: 'Vikram Singh', phone: '98290 54323', job: 'staff' });
  await addPerson(page, { name: 'Anita Sharma', phone: '98290 54324', job: 'owner' });
  expect([...server.people.values()].find((p) => p.name === 'Vikram Singh').role).toBe('staff');
  expect([...server.people.values()].find((p) => p.name === 'Anita Sharma').role).toBe('owner');
  const pills = async (name) => (await row(page, name).locator('span').allInnerTexts()).map((s) => s.trim());
  expect(await pills('Vikram Singh')).toContain('Staff');
  expect(await pills('Anita Sharma')).toContain('Owner');
  expect(await pills('Suresh Kumar')).toContain('Cleaner');
  expect(await pills('Sunita Verma')).toContain('Trainer');
  await expectFitsPhone(page, 'on Staff & sign-in with four people');
  await shot(page, 'people-jobs-6-rows-phone');

  // 7. 0079 goes live: the kept job is sent once, and stays on the row.
  extra.jobsOn = true;
  await page.reload();
  await expect(row(page, 'Suresh Kumar')).toContainText('Cleaner', { timeout: 15_000 });
  await expect.poll(() => extra.setJob).toEqual([{ staff: suresh.staffId, job: 'Cleaner' }]);
  await page.reload();
  await expect(row(page, 'Suresh Kumar')).toContainText('Cleaner', { timeout: 15_000 });
  expect(extra.setJob, 'sent once only').toHaveLength(1);
  // With 0079 live a new Other goes straight to the server.
  await addPerson(page, { name: 'Ravi Manager', phone: '98290 54325', job: 'other', typed: 'Manager' });
  const ravi = [...server.people.values()].find((p) => p.name === 'Ravi Manager');
  expect(extra.setJob.at(-1)).toEqual({ staff: ravi.staffId, job: 'Manager' });
  await expect(row(page, 'Ravi Manager')).toContainText('Manager');

  // Computer width: the pop-up with a typed job, and the rows.
  await page.setViewportSize(COMPUTER);
  await expect(row(page, 'Ravi Manager')).toBeVisible();
  await shot(page, 'people-jobs-7-rows-computer');
  add = await openAdd(page);
  await add.getByLabel('What is their job?').selectOption('other');
  await add.getByLabel('Type the job (for example Manager, Cleaner)').fill('Receptionist');
  await shot(page, 'people-jobs-8-other-typed-computer', false);
  await add.getByRole('button', { name: 'Cancel' }).tap();

  // 8. Hinglish.
  await page.setViewportSize(PHONE);
  await page.evaluate(() => localStorage.setItem('forgeai.lang.v1', 'hinglish'));
  await page.reload();
  await expect(page.getByRole('button', { name: 'Kisi ko jodo' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Kisi ko jodo' }).tap();
  const hi = sheet(page, 'Kisi ko jodo');
  const hiPick = hi.getByLabel('Inka kaam kya hai?');
  await expect(hiPick.locator('option')).toHaveText(['Owner', 'Staff (front desk)', 'Trainer', 'Anya']);
  await hiPick.selectOption('trainer');
  await expect(hi.getByTestId('job-hint')).toHaveText('Front desk jaisa hi access, aur aap jo members denge unki workout progress bhi dekhte hain.');
  await hiPick.selectOption('other');
  await hi.getByLabel('Kaam likho (jaise Manager, Cleaner)').fill('Cleaner');
  await expectFitsPhone(page, 'in Add a person, Hinglish');
  await shot(page, 'people-jobs-9-hinglish-phone', false);
});

// R-522 (Cloudflare free plan): one panel left open made ~124 calls an hour all night. A hidden tab now asks nothing.
test('R-522: a hidden admin panel asks the server nothing; back in view it asks at once', async ({ page }) => {
  const server = await openApp(page);
  // 0075's alerts list answered (empty), so Needs you runs its alerts-led look.
  const base = server.answer.bind(server);
  server.answer = (fn, args) => {
    if (fn !== 'owner_alerts') return base(fn, args);
    server.calls.push(fn);
    return { ok: true, alerts: [] };
  };
  await startOnlineGym(page);
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await wait(page, 2 * 60_000);
  expect(server.calls.filter((c) => c === 'owner_alerts').length, 'in view: the alerts list once a minute').toBeGreaterThanOrEqual(2);

  const setHidden = (hidden) =>
    page.evaluate((h) => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
      document.dispatchEvent(new Event('visibilitychange'));
    }, hidden);

  await setHidden(true);
  await page.waitForTimeout(500);
  const before = server.calls.length;
  // Two hours with the tab hidden.
  for (let i = 0; i < 8; i++) await wait(page, 15 * 60_000);
  const hiddenCalls = server.calls.slice(before);
  expect(hiddenCalls, 'two hours hidden: no call at all').toEqual([]);

  await setHidden(false);
  await expect.poll(() => server.calls.slice(before).includes('owner_alerts'), { message: 'back in view: asks at once' }).toBe(true);
  await expect.poll(() => server.calls.slice(before).includes('crm_pull')).toBe(true);
});
