// Shared steps for the admin-app journeys (UAT work package 5, 17 Oct 2026; 5b and 10 the same night).
//
// Every step taps and types on the real screen. Only three things are set by code:
//  - the clock: 17 Oct 2026, 10:00 in India (a Saturday; financial year 2026-27), unless a journey
//    picks another moment (WP10, the fixed clocks);
//  - the server: the Supabase calls are answered here, like scripts/crawl.mjs does, by a small
//    in-memory gym server (sign-in, people and their keys, the online records crm_pull / crm_push,
//    the shop's sample products), so no real server is touched and no gym is made anywhere;
//  - browser storage, only where a journey says so (two tabs, damaged storage).

import { expect, test } from '@playwright/test';

/** The fixed "now" of every journey: Saturday 17 Oct 2026, 10:00 IST. */
export const NOW = new Date('2026-10-17T10:00:00+05:30');
export const TODAY = '2026-10-17';

const DEMO_GYM = { gymId: 'g-qa', name: 'Iron Temple Fitness', joinCode: 'QA0001' };

/** The code the pretend server makes when the owner taps "Make sign-in code". */
export const SIGN_IN_CODE = '482913';

/** Wrong tries one mobile gets in 15 minutes (the server's rule, 0011); a new code clears them. */
const CODE_TRIES = 5;

/** The 12 sample products a new shop starts with (supabase/migrations/0002_shop.sql, _seed_shop). */
export const SAMPLE_PRODUCTS = [
  ['Whey protein 1 kg', 'protein', 249900, 20, 'tub'],
  ['Whey isolate 1 kg', 'protein', 379900, 6, 'tub'],
  ['Mass gainer 3 kg', 'protein', 289900, 5, 'pouch'],
  ['Protein bars, box of 12', 'protein', 119900, 15, 'barbox'],
  ['Pre-workout 300 g', 'preworkout', 179900, 11, 'jar'],
  ['Creatine monohydrate 250 g', 'creatine', 89900, 18, 'jar'],
  ['Shaker bottle 700 ml', 'gear', 39900, 25, 'shaker'],
  ['Lifting gloves', 'gear', 69900, 11, 'gloves'],
  ['Gym towel', 'gear', 29900, 30, 'towel'],
  ['Gym T-shirt', 'clothing', 59900, 18, 'tshirt'],
  ['Electrolyte drink 500 ml', 'drinks', 6000, 40, 'bottle'],
  ['Black coffee, cold brew', 'drinks', 9000, 20, 'bottle'],
];

/** A server refusal, answered the way PostgREST does (400 with the message). */
class Refusal extends Error {}

/**
 * A pretend server, shared by every phone (browser context) attached to it. Holds an online gym's
 * records the way crm_pull / crm_push do (a version number; a push built on an old version is
 * refused with STALE), the people who may sign in, their codes and their signed-in KEYS (one per
 * device), and the old owner key a shop is turned on with. A call with a key that was signed out,
 * removed or retired is refused with BAD_KEY, as the real server does.
 */
export class FakeServer {
  /** `offline`: function names whose calls never reach the server (no internet). */
  constructor({ offline = [] } = {}) {
    this.offline = new Set(offline);
    /** fn -> how many calls get through before the internet drops for that function. */
    this.dropAfter = new Map();
    this.passed = new Map();
    this.version = 0;
    /** key `${k}:${id}` -> { k, id, d, x, ver } */
    this.records = new Map();
    this.gym = { gymId: 'g-online', name: '', joinCode: 'QA0002', createdAt: NOW.toISOString() };
    /** The shop's gym (demo_start_gym: the demo, or a shop turned on), with its sample products. */
    this.shopGym = { ...DEMO_GYM };
    this.products = [];
    /** phone -> { staffId, name, phone, role, code, lastSeenAt } */
    this.people = new Map();
    /** session key -> staffId: one per signed-in device. */
    this.sessions = new Map();
    /** Old owner keys (a shop turned on before sign-in) that still open the gym. */
    this.ownerKeys = new Set();
    this.retiredKeys = new Set();
    /** Keys that stopped working -> their person (for staff_key_status, 0022); removed people. */
    this.deadKeys = new Map();
    this.removedStaff = new Set();
    this.keySeq = 0;
    /** mobile -> wrong sign-in tries (cleared by a new code or a sign-in). */
    this.misses = new Map();
    this.calls = [];
    /** Every call with its arguments, for checks after a journey. */
    this.log = [];
    this.pushes = [];
    /** Messages sent to app members (owner_send_message), newest first. */
    this.messages = [];
    /** Members who joined the gym in the ForgeAI app (owner_app_members rows). None by default. */
    this.appMembers = [];
  }

  /** The internet goes off for `fn` after `n` more calls get through (n = 0: at once). */
  dropAfterCalls(fn, n) {
    this.dropAfter.set(fn, n);
    this.passed.set(fn, 0);
  }

  /** R-55: no internet at all (every call fails as the browser's offline mode would). */
  disconnect() {
    this.allOffline = true;
  }

  /** The internet is back for every function. */
  reconnect() {
    this.allOffline = false;
    this.offline.clear();
    this.dropAfter.clear();
  }

  /** A person the owner added, with the sign-in code they were given. */
  addPerson({ name, phone, role, code }) {
    const staffId = `s-${role}-${phone}`;
    this.people.set(phone, { staffId, name, phone, role, code, lastSeenAt: null });
    return staffId;
  }

  personById(staffId) {
    return [...this.people.values()].find((p) => p.staffId === staffId) ?? null;
  }

  /** Devices signed in as this person right now. */
  devices(staffId) {
    return [...this.sessions.values()].filter((id) => id === staffId).length;
  }

  newKey(prefix) {
    this.keySeq += 1;
    return `${prefix}-${this.keySeq}-`.padEnd(48, 'k');
  }

  signedIn(person) {
    const sessionKey = this.newKey(person.role);
    this.sessions.set(sessionKey, person.staffId);
    person.lastSeenAt = NOW.toISOString();
    return {
      gymId: this.gym.gymId,
      name: this.gym.name,
      joinCode: this.gym.joinCode,
      sessionKey,
      person: { staffId: person.staffId, name: person.name, phone: person.phone, role: person.role },
    };
  }

  /** A device's key stops working (kept, so staff_key_status can say why). */
  endSession(key) {
    const id = this.sessions.get(key);
    if (id) this.deadKeys.set(key, id);
    this.sessions.delete(key);
  }

  /** The person a session key belongs to; BAD_KEY when it no longer opens the gym. */
  who(key) {
    const staffId = this.sessions.get(key);
    const p = staffId ? this.personById(staffId) : null;
    if (!p) throw new Refusal('BAD_KEY');
    return p;
  }

  /** Any live key: a session, or an old owner key. */
  checkKey(key) {
    if (this.sessions.has(key) && this.personById(this.sessions.get(key))) return;
    if (this.ownerKeys.has(key)) return;
    throw new Refusal('BAD_KEY');
  }

  ownerOnly(key) {
    const p = this.who(key);
    if (p.role !== 'owner') throw new Refusal('OWNER_ONLY');
    return p;
  }

  answer(fn, args) {
    this.calls.push(fn);
    this.log.push({ fn, args });
    // Every call but the doors in (and the demo) carries this device's key.
    if (typeof args.p_key === 'string' && !['staff_sign_in', 'gym_create_online', 'staff_key_status'].includes(fn)) this.checkKey(args.p_key);
    switch (fn) {
      case 'demo_start_gym': {
        // The demo, or "Turn on the shop" for a gym kept in this browser: a gym with a code, the
        // 12 sample products, and an owner key.
        const ownerKey = this.newKey('owner-key');
        this.ownerKeys.add(ownerKey);
        this.shopGym = { ...DEMO_GYM, name: String(args.p_name || DEMO_GYM.name).slice(0, 60) };
        this.products = SAMPLE_PRODUCTS.map(([name, category, price, stock, art], i) => ({
          product_id: `p-${i + 1}`,
          name,
          category,
          description: '',
          price_p: price,
          option_name: null,
          options: [],
          stock,
          active: true,
          art_kind: art,
          art_tint: '#E8661F',
          sort: i + 1,
          updated_at: NOW.toISOString(),
          image_url: null,
        }));
        return { ...this.shopGym, ownerKey };
      }
      case 'owner_gym':
        if (this.sessions.has(args.p_key)) return { gymId: this.gym.gymId, name: this.gym.name, joinCode: this.gym.joinCode, brand: null };
        return { ...this.shopGym, brand: null };
      case 'owner_rename_gym':
        this.shopGym.name = String(args.p_name);
        return this.shopGym;
      case 'owner_products':
        return this.products;
      case 'gym_create_online': {
        this.gym.name = args.p_gym_name;
        const staffId = this.addPerson({ name: args.p_name, phone: args.p_phone, role: 'owner', code: null });
        return this.signedIn(this.people.get(args.p_phone) ?? { staffId });
      }
      case 'owner_go_online': {
        // The shop's gym (held by an old owner key) gets its owner as a person, signed in here.
        this.gym = { gymId: this.shopGym.gymId, name: this.shopGym.name, joinCode: this.shopGym.joinCode, createdAt: NOW.toISOString() };
        this.addPerson({ name: args.p_name, phone: args.p_phone, role: 'owner', code: null });
        return this.signedIn(this.people.get(args.p_phone));
      }
      case 'owner_retire_key': {
        this.ownerOnly(args.p_key);
        for (const k of this.ownerKeys) this.retiredKeys.add(k);
        this.ownerKeys.clear();
        return null;
      }
      case 'staff_sign_in': {
        // 0011: every miss counts per mobile; a miss never kills the code; one reply for "no code"
        // and "wrong code"; after 5 misses even the right code waits (TOO_MANY_TRIES).
        const misses = this.misses.get(args.p_phone) ?? 0;
        if (misses >= CODE_TRIES) return { error: 'TOO_MANY_TRIES' };
        const p = this.people.get(args.p_phone);
        if (!p || !p.code || p.code !== args.p_code) {
          this.misses.set(args.p_phone, misses + 1);
          return { error: 'WRONG_CODE', triesLeft: Math.max(0, CODE_TRIES - 1 - misses) };
        }
        p.code = null;
        this.misses.delete(args.p_phone);
        return this.signedIn(p);
      }
      case 'staff_sign_out':
        this.endSession(args.p_key);
        return null;
      case 'staff_key_status': {
        if (this.sessions.has(args.p_key)) return 'live';
        const id = this.deadKeys.get(args.p_key);
        if (!id) return 'unknown';
        return this.removedStaff.has(id) ? 'removed' : 'signed_out';
      }
      case 'owner_people': {
        const me = this.ownerOnly(args.p_key);
        return [...this.people.values()].map((p) => ({
          staffId: p.staffId,
          name: p.name,
          phone: p.phone,
          role: p.role,
          me: p.staffId === me.staffId,
          devices: this.devices(p.staffId),
          lastSeenAt: p.lastSeenAt,
          codeUntil: p.code ? new Date(NOW.getTime() + 30 * 60_000).toISOString() : null,
        }));
      }
      case 'owner_add_person': {
        this.ownerOnly(args.p_key);
        const staffId = this.addPerson({ name: args.p_name, phone: args.p_phone, role: args.p_role, code: null });
        return { staffId, name: args.p_name, phone: args.p_phone, role: args.p_role };
      }
      case 'owner_make_signin_code': {
        this.ownerOnly(args.p_key);
        const p = this.personById(args.p_staff);
        if (!p) throw new Refusal('GONE');
        p.code = SIGN_IN_CODE;
        this.misses.delete(p.phone);
        return {
          staffId: p.staffId,
          code: p.code,
          expiresAt: new Date(NOW.getTime() + 30 * 60_000).toISOString(),
          name: p.name,
          phone: p.phone,
        };
      }
      case 'owner_sign_out_person': {
        const me = this.ownerOnly(args.p_key);
        for (const [k, id] of [...this.sessions]) {
          if (id === args.p_staff && k !== args.p_key) this.endSession(k);
        }
        if (!this.personById(args.p_staff)) throw new Refusal('GONE');
        void me;
        return null;
      }
      case 'owner_remove_person': {
        const me = this.ownerOnly(args.p_key);
        if (args.p_staff === me.staffId) throw new Refusal('SELF');
        const p = this.personById(args.p_staff);
        if (!p) throw new Refusal('GONE');
        this.people.delete(p.phone);
        this.removedStaff.add(p.staffId);
        for (const [k, id] of [...this.sessions]) if (id === p.staffId) this.endSession(k);
        return null;
      }
      case 'crm_pull': {
        this.who(args.p_key);
        const since = Number(args.p_since) || 0;
        const records = [...this.records.values()]
          .filter((r) => r.ver > since)
          .map(({ k, id, d, x }) => ({ k, id, d, x }));
        return { version: this.version, gym: this.gym, records };
      }
      case 'crm_push': {
        this.who(args.p_key);
        if (Number(args.p_base) !== this.version) throw new Refusal('STALE');
        this.version += 1;
        for (const r of args.p_records) {
          this.records.set(`${r.k}:${r.id}`, { k: r.k, id: r.id, d: r.d, x: r.x === true, ver: this.version });
        }
        this.pushes.push(args.p_records);
        return this.version;
      }
      case 'owner_send_message': {
        // 0008 / 0018: to every app member of the gym; the same limits as the real server.
        const title = String(args.p_title ?? '').trim();
        const body = String(args.p_body ?? '').trim();
        if (!title) throw new Refusal('EMPTY');
        if ([...title].length > 60 || [...body].length > 300) throw new Refusal('TOO_LONG');
        const m = {
          id: `msg-${this.messages.length + 1}`,
          kind: args.p_kind,
          title,
          body,
          createdAt: NOW.toISOString(),
          recipients: this.appMembers.length,
          seen: 0,
          withdrawn: false,
        };
        this.messages.unshift(m);
        return m;
      }
      case 'owner_messages':
        return this.messages;
      case 'owner_app_members':
        return this.appMembers;
      default:
        // Orders, messages, app members: an empty list, as for a new gym.
        return [];
    }
  }

  /** Records of one kind now on the server (deleted ones left out). */
  rows(kind) {
    return [...this.records.values()].filter((r) => r.k === kind && !r.x).map((r) => r.d);
  }

  /** True when this call's internet is off right now (and counts the calls that get through). */
  dropped(fn) {
    if (this.allOffline || this.offline.has(fn)) return true;
    if (!this.dropAfter.has(fn)) return false;
    const n = this.passed.get(fn) ?? 0;
    if (n >= this.dropAfter.get(fn)) return true;
    this.passed.set(fn, n + 1);
    return false;
  }

  /** Answer every Supabase function call made by this context (one phone). */
  async attach(context) {
    await context.route(/\/rest\/v1\/rpc\/([a-z_]+)/, async (route) => {
      const fn = /rpc\/([a-z_]+)/.exec(route.request().url())?.[1] ?? '';
      if (this.dropped(fn)) {
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

/**
 * Fixed clock + fake server, then the first screen. Returns the server.
 * `time`: another fixed moment (WP10). `server`: a server another phone already uses (a second
 * device of the same gym); otherwise a new one with `offline`.
 */
export async function openApp(page, { time = NOW, server: shared, ...serverOptions } = {}) {
  const server = shared ?? new FakeServer(serverOptions);
  await server.attach(page.context());
  await page.clock.install({ time });
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
export async function freshGym(page, options) {
  const server = await openApp(page, options);
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

// ---------------------------------------------------------------- online gyms, people, devices (WP5b)

/** The phone of playwright.config.mjs, for a second device of the same gym (browser.newContext). */
export const PHONE = {
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 2,
  locale: 'en-IN',
  timezoneId: 'Asia/Kolkata',
};

/** A second phone (its own browser storage) on the same pretend server, open on Welcome. */
export async function secondPhone(browser, server, time = NOW) {
  const context = await browser.newContext({ ...PHONE, baseURL: test.info().project.use.baseURL });
  const page = await context.newPage();
  await openApp(page, { server, time });
  return page;
}

export const OWNER = { name: 'Ramesh Sharma', phone: '98290 12345', gym: 'Shakti Gym' };
export const DESK = { name: 'Sunita Verma', phone: '98290 54321' };

/** Welcome -> "New here? Set up your gym" -> Create my gym. Ends on Today, signed in as the owner. */
export async function startOnlineGym(page, { gym = OWNER.gym, name = OWNER.name, phone = OWNER.phone } = {}) {
  const start = page.locator('form').filter({ has: page.getByRole('button', { name: 'Create my gym' }) });
  await start.getByLabel('Gym name').fill(gym);
  await start.getByLabel('Your name').fill(name);
  await start.getByLabel('Your mobile number').fill(phone);
  await start.getByRole('button', { name: 'Create my gym' }).tap();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('banner')).toContainText(gym);
}

/** One person's card on Staff & sign-in. */
export function personCard(page, name) {
  return page
    .getByRole('main')
    .locator('div')
    .filter({ has: page.getByText(name, { exact: true }) })
    .filter({ has: page.getByRole('button', { name: 'Make sign-in code' }) })
    .last();
}

/** Staff & sign-in -> Add a person (front desk) -> Make sign-in code -> Done. */
export async function addDeskPerson(page, { name = DESK.name, phone = DESK.phone } = {}) {
  await open(page, 'Staff & sign-in');
  await page.getByRole('button', { name: 'Add a person' }).tap();
  const add = sheet(page, 'Add a person');
  await add.getByLabel('Name').fill(name);
  await add.getByLabel('Mobile number').fill(phone);
  await add.getByRole('button', { name: 'Add', exact: true }).tap();
  await expect(add).toBeHidden();
  await personCard(page, name).getByRole('button', { name: 'Make sign-in code' }).tap();
  const codeSheet = sheet(page, `Sign-in code for ${name}`);
  await expect(codeSheet.getByLabel(`Code ${SIGN_IN_CODE.split('').join(' ')}`)).toBeVisible();
  await codeSheet.getByRole('button', { name: 'Done' }).tap();
  await expect(codeSheet).toBeHidden();
}

/** Welcome -> Sign in with a mobile number and a code. Does not wait for the result. */
export async function typeSignIn(page, phone, code) {
  const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Sign in' }) });
  await form.getByLabel('Your mobile number').fill(phone);
  await form.getByLabel('Sign-in code (6 digits)').fill(code);
  await form.getByRole('button', { name: 'Sign in' }).tap();
  return form;
}

/** Welcome -> Sign in -> Today. */
export async function signIn(page, phone, code = SIGN_IN_CODE) {
  await typeSignIn(page, phone, code);
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible({ timeout: 15_000 });
}

/**
 * Let the app's own timers run as if `ms` had passed (the 15-second refresh, the 60-second "is it
 * still today" check). Only the clock moves; nothing on the page is touched.
 */
export async function wait(page, ms) {
  await page.clock.fastForward(ms);
}

/** Move the page's clock forward to a moment (an ISO time with +05:30), firing due timers. */
export async function clockTo(page, iso) {
  const now = await page.evaluate(() => Date.now());
  const target = new Date(iso).getTime();
  if (target > now) await page.clock.fastForward(target - now);
}

/** Members -> Import from Excel -> Choose file. Ends on the review ("Check the list"). */
export async function chooseFile(page, path) {
  await open(page, 'Members');
  await page.getByRole('button', { name: 'Import from Excel' }).first().tap();
  await expect(page.getByRole('heading', { name: 'Import members from Excel', exact: true })).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose file' }).tap();
  await (await chooser).setFiles(path);
  await expect(page.getByText('Check the list', { exact: true })).toBeVisible();
}

/** A members file of `n` rows (Name, Mobile), written to the test's own folder. */
export async function membersFile(testInfo, name, n, first = 1) {
  const { writeFile } = await import('node:fs/promises');
  const rows = ['Name,Mobile'];
  for (let i = first; i < first + n; i += 1) rows.push(`Member ${String(i).padStart(3, '0')},98${String(70000000 + i).padStart(8, '0')}`);
  const path = testInfo.outputPath(name);
  await writeFile(path, `${rows.join('\n')}\n`);
  return path;
}

/**
 * A gym kept only in this browser, empty, with no shop: Start demo with no internet -> "Open the
 * demo without the shop" -> Erase and start fresh. The internet then comes back.
 */
export async function browserOnlyGym(page) {
  const server = await openApp(page, { offline: ['demo_start_gym'] });
  await page.getByRole('button', { name: 'Start demo' }).tap();
  await page.getByRole('button', { name: 'Open the demo without the shop (works without internet)' }).tap();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await eraseAndStartFresh(page);
  server.reconnect();
  return server;
}
