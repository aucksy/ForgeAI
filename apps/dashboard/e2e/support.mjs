// Shared steps for the admin-app journeys (UAT work package 5, 17 Oct 2026).
//
// Every step taps and types on the real screen. Only two things are faked:
//  - the clock: 17 Oct 2026, 10:00 in India (a Saturday; financial year 2026-27);
//  - the server: the Supabase calls are answered here, like scripts/crawl.mjs does, by a small
//    in-memory gym server (sign-in, the online records crm_pull / crm_push), so no real server is
//    touched and no gym is made anywhere.

import { expect } from '@playwright/test';

/** The fixed "now" of every journey: Saturday 17 Oct 2026, 10:00 IST. */
export const NOW = new Date('2026-10-17T10:00:00+05:30');
export const TODAY = '2026-10-17';

const DEMO_GYM = { gymId: 'g-qa', name: 'Iron Temple Fitness', joinCode: 'QA0001' };

/** The code the pretend server makes when the owner taps "Make sign-in code". */
export const SIGN_IN_CODE = '482913';

/**
 * A pretend server for one browser context. Holds an online gym's records the way crm_pull /
 * crm_push do (a version number; a push built on an old version is refused with STALE), the
 * people who may sign in, and the codes waiting for them.
 */
export class FakeServer {
  /** `offline`: function names whose calls never reach the server (no internet). */
  constructor({ offline = [] } = {}) {
    this.offline = new Set(offline);
    this.version = 0;
    /** key `${k}:${id}` -> { k, id, d, x, ver } */
    this.records = new Map();
    this.gym = { gymId: 'g-online', name: '', joinCode: 'QA0002', createdAt: NOW.toISOString() };
    /** phone -> { staffId, name, phone, role, code } */
    this.people = new Map();
    this.calls = [];
    this.pushes = [];
  }

  /** A person the owner added, with the sign-in code they were given. */
  addPerson({ name, phone, role, code }) {
    const staffId = `s-${role}-${phone}`;
    this.people.set(phone, { staffId, name, phone, role, code });
    return staffId;
  }

  signedIn(person) {
    return {
      gymId: this.gym.gymId,
      name: this.gym.name,
      joinCode: this.gym.joinCode,
      sessionKey: `${person.role}-key-`.padEnd(48, 'k'),
      person: { staffId: person.staffId, name: person.name, phone: person.phone, role: person.role },
    };
  }

  answer(fn, args) {
    this.calls.push(fn);
    switch (fn) {
      case 'demo_start_gym':
        return { ...DEMO_GYM, ownerKey: 'd'.repeat(48) };
      case 'owner_gym':
        return { ...DEMO_GYM, brand: null };
      case 'owner_rename_gym':
        return DEMO_GYM;
      case 'gym_create_online': {
        this.gym.name = args.p_gym_name;
        const staffId = this.addPerson({ name: args.p_name, phone: args.p_phone, role: 'owner', code: null });
        return this.signedIn(this.people.get(args.p_phone) ?? { staffId });
      }
      case 'staff_sign_in': {
        const p = this.people.get(args.p_phone);
        if (!p || !p.code || p.code !== args.p_code) return { error: 'WRONG_CODE', triesLeft: 2 };
        p.code = null;
        return this.signedIn(p);
      }
      case 'staff_sign_out':
        return null;
      case 'owner_people':
        return [...this.people.values()].map((p) => ({
          staffId: p.staffId,
          name: p.name,
          phone: p.phone,
          role: p.role,
          me: p.role === 'owner',
          devices: p.role === 'owner' ? 1 : 0,
          lastSeenAt: null,
          codeUntil: p.code ? new Date(NOW.getTime() + 30 * 60_000).toISOString() : null,
        }));
      case 'owner_add_person': {
        const staffId = this.addPerson({ name: args.p_name, phone: args.p_phone, role: args.p_role, code: null });
        return { staffId, name: args.p_name, phone: args.p_phone, role: args.p_role };
      }
      case 'owner_make_signin_code': {
        const p = [...this.people.values()].find((x) => x.staffId === args.p_staff);
        if (!p) throw new Error('GONE');
        p.code = SIGN_IN_CODE;
        return {
          staffId: p.staffId,
          code: p.code,
          expiresAt: new Date(NOW.getTime() + 30 * 60_000).toISOString(),
          name: p.name,
          phone: p.phone,
        };
      }
      case 'crm_pull': {
        const since = Number(args.p_since) || 0;
        const records = [...this.records.values()]
          .filter((r) => r.ver > since)
          .map(({ k, id, d, x }) => ({ k, id, d, x }));
        return { version: this.version, gym: this.gym, records };
      }
      case 'crm_push': {
        if (Number(args.p_base) !== this.version) throw new Error('STALE');
        this.version += 1;
        for (const r of args.p_records) {
          this.records.set(`${r.k}:${r.id}`, { k: r.k, id: r.id, d: r.d, x: r.x === true, ver: this.version });
        }
        this.pushes.push(args.p_records);
        return this.version;
      }
      default:
        // Shop lists, messages, products: an empty list, as for a new gym.
        return [];
    }
  }

  /** Answer every Supabase function call made by this context. */
  async attach(context) {
    await context.route(/\/rest\/v1\/rpc\/([a-z_]+)/, async (route) => {
      const fn = /rpc\/([a-z_]+)/.exec(route.request().url())?.[1] ?? '';
      if (this.offline.has(fn)) {
        this.calls.push(`${fn} (offline)`);
        await route.abort('internetdisconnected');
        return;
      }
      let args = {};
      try {
        args = route.request().postDataJSON() ?? {};
      } catch {
        args = {};
      }
      try {
        const body = this.answer(fn, args);
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      } catch (e) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ message: String(e?.message ?? e), code: 'P0001', details: null, hint: null }),
        });
      }
    });
  }
}

/** Fixed clock + fake server, then the first screen. Returns the server. */
export async function openApp(page, serverOptions) {
  const server = new FakeServer(serverOptions);
  await server.attach(page.context());
  await page.clock.install({ time: NOW });
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Start demo' })).toBeVisible();
  await expectFitsPhone(page, 'on Welcome');
  return server;
}

/**
 * Nothing is wider than the phone (no sideways scroll). Measured against the phone's 390px, not
 * window.innerWidth: on a phone the browser widens the page to fit a too-wide element, so the two
 * grow together and comparing them proves nothing (U-A9).
 */
export async function expectFitsPhone(page, where = '') {
  const width = page.viewportSize()?.width ?? 390;
  const wide = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(wide, `page is ${wide}px wide on a ${width}px phone ${where}`.trim()).toBeLessThanOrEqual(width + 1);
}

/** The fixed "Main" bar at the bottom of the phone screen. */
export function bottomBar(page) {
  return page.getByRole('navigation', { name: 'Main' });
}

const ON_BAR = ['Today', 'Members', 'Money', 'Visits', 'More'];

/** Open a page the way a person does: its tab at the bottom, or More, then its row. */
export async function open(page, label) {
  if (ON_BAR.includes(label)) {
    await bottomBar(page).getByRole('link', { name: new RegExp(`^${label}`) }).tap();
  } else {
    await bottomBar(page).getByRole('link', { name: /^More/ }).tap();
    await expect(page.getByRole('heading', { name: 'More', exact: true })).toBeVisible();
    await page.getByRole('main').getByRole('link', { name: new RegExp(`^${label}`) }).tap();
  }
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expectFitsPhone(page, `on ${label}`);
}

/** A sheet (dialog) by its title. */
export function sheet(page, title) {
  return page.getByRole('dialog', { name: title });
}

/** The short message that appears for a moment at the bottom. */
export function toast(page) {
  return page.getByRole('status').filter({ hasNotText: /^$/ });
}

/** Welcome -> Start demo (answered by the fake server) -> the demo gym opens on Today. */
export async function startDemo(page) {
  await page.getByRole('button', { name: 'Start demo' }).tap();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible({ timeout: 15_000 });
}

/** Settings -> Erase and start fresh -> confirm. Leaves an empty gym that keeps its name. */
export async function eraseAndStartFresh(page) {
  await open(page, 'Settings');
  await page.getByRole('button', { name: 'Erase and start fresh' }).tap();
  const confirm = sheet(page, 'Erase everything?');
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Erase everything' }).tap();
  await expect(page.getByText('0 members · 0 memberships · 0 payments · 0 check-ins.', { exact: false })).toBeVisible();
}

/** A fresh, empty gym in this browser: the demo first (how a new owner gets in), then erased. */
export async function freshGym(page) {
  const server = await openApp(page);
  await startDemo(page);
  await eraseAndStartFresh(page);
  return server;
}

/** Plans -> + Add plan -> fill -> Save plan. */
export async function addPlan(page, { name, price, joining = '0', months = '1' }) {
  await open(page, 'Plans');
  await expect(page.getByRole('heading', { name: 'Plans', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '+ Add plan' }).first().tap();
  const s = sheet(page, 'Add plan');
  await expect(s).toBeVisible();
  await expectFitsPhone(page, 'in Add plan');
  await s.getByLabel('Plan name').fill(name);
  await s.getByLabel('Duration').fill(months);
  await s.getByLabel('Price (₹)').fill(price);
  await s.getByLabel('Joining fee (₹)').fill(joining);
  await s.getByRole('button', { name: 'Save plan' }).tap();
  await expect(s).toBeHidden();
}

/** Members -> + Add member -> name + mobile -> Add member. Ends on the member's own page. */
export async function addMember(page, { name, phone }) {
  await open(page, 'Members');
  await expect(page.getByRole('heading', { name: 'Members', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '+ Add member' }).first().tap();
  const s = sheet(page, 'Add member');
  await expect(s).toBeVisible();
  await expectFitsPhone(page, 'in Add member');
  await s.getByLabel('Full name').fill(name);
  await s.getByLabel('Mobile number').fill(phone);
  await s.getByRole('button', { name: 'Add member' }).tap();
  await expect(s).toBeHidden();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
}

/**
 * On a member's page: Sell membership (or Renew) -> the first plan -> "Received now" -> Confirm.
 * Returns the toast text ("Membership saved. Receipt 2026-27/0001." or "... No money taken yet.").
 */
export async function sell(page, { received, price, title = 'Sell membership', button = /^(Sell membership|Renew)$/ }) {
  await page.getByRole('button', { name: button }).first().tap();
  const s = sheet(page, title);
  await expect(s).toBeVisible();
  await expectFitsPhone(page, `in ${title}`);
  if (price !== undefined) await s.getByLabel('Plan price').fill(price);
  if (received !== undefined) await s.getByLabel('Received now').fill(received);
  await s.getByRole('button', { name: 'Confirm' }).tap();
  await expect(s).toBeHidden();
  const t = page.getByText(/^Membership saved\./);
  await expect(t).toBeVisible();
  return (await t.textContent()) ?? '';
}

/** Members list -> tap the member's card. */
export async function openMember(page, name) {
  await open(page, 'Members');
  await page.getByRole('main').getByRole('link', { name: new RegExp(name) }).tap();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
}

/**
 * A stat tile (value, label, small line under it), found by its label, e.g. "Dues" or
 * "Today's collection". Assert on it with toContainText.
 */
export function tile(page, label) {
  // The label is a <div> (a page title of the same words is an <h1>, so it is never picked).
  return page.getByRole('main').getByText(label, { exact: true }).locator('xpath=self::div/..');
}

/**
 * The fresh gym every money journey starts from: one plan, Monthly Rs 1,500 + Rs 500 joining fee.
 */
export async function gymWithMonthlyPlan(page) {
  const server = await freshGym(page);
  await addPlan(page, { name: 'Monthly', price: '1500', joining: '500', months: '1' });
  return server;
}

/** The three sales of journey 2: full, part (Rs 1,000) and nothing now, each on its own member. */
export const MEMBERS = {
  full: { name: 'Asha Verma', phone: '98290 11111' },
  part: { name: 'Bharat Singh', phone: '98290 22222' },
  none: { name: 'Chetan Rao', phone: '98290 33333' },
};

export async function threeSales(page) {
  await addMember(page, MEMBERS.full);
  const full = await sell(page, { received: '2000' });
  await addMember(page, MEMBERS.part);
  const part = await sell(page, { received: '1000' });
  await addMember(page, MEMBERS.none);
  const none = await sell(page, {});
  return { full, part, none };
}
