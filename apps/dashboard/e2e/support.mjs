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
export class Refusal extends Error {}

/** A function this server does not have (PostgREST: 404, code PGRST202), e.g. before 0025. */
export class NoSuchFunction extends Error {}

/** #41 (0031): the branch calls. A FakeServer alone is a server before 0031; e2e/branchNet.mjs answers them. */
export const BRANCH_FNS = [
  'owner_branches', 'owner_add_branch', 'owner_open_branch', 'owner_rename_group',
  'branch_find_visitor', 'branch_check_in_visitor', 'branch_visitors', 'branch_undo_visitor',
];

/** #38 (0033): the terms calls, answered only when `termsServer` is on. */
const TERMS_FNS = ['owner_terms', 'owner_accept_terms'];

/** R-117 (0034): the PIN calls, answered only when `pinServer` is on. */
const PIN_FNS = ['staff_set_pin', 'staff_pin_status'];

/** R-120 (0035): measurements taken by the trainer and diet plans, answered only when `bodyServer` is on. */
const BODY_FNS = [
  'owner_member_measurements', 'owner_save_measurement', 'owner_delete_measurement',
  'owner_diet_plans', 'owner_save_diet_plan', 'owner_withdraw_diet_plan',
];
/** R-124 (0036): the gym's opening hours, answered only when `timingsServer` is on. */
const TIMINGS_FNS = ['owner_gym_timings', 'owner_save_gym_timings'];
const TAPE = ['neck', 'shoulders', 'chest', 'arm', 'forearm', 'waist', 'hips', 'thigh', 'calf'];

/** #49 step 2 (0025): the calls only a server with the workout offer answers. */
const OFFER_FNS = ['owner_offers', 'owner_save_offer', 'owner_stop_offer', 'staff_give_reward', 'owner_undo_reward'];

/** R-86 (0029): the calls only a server with automatic reminders answers. */
const REMINDER_FNS = ['owner_auto_reminders', 'owner_save_auto_reminders'];
/** 0029's check: the cases with a number, and their ranges [min, max, most]. */
const REMINDER_NUMBERS = { plan_ends_soon: [1, 30, 3], plan_ended: [1, 60, 3], offer_ending: [1, 14, 1], pt_low: [1, 5, 1], miss_you: [5, 60, 1] };
const REMINDER_KEYS = ['plan_ends_soon', 'plan_ends_today', 'plan_ended', 'birthday', 'welcome', 'offer_reward', 'offer_ending', 'offer_near', 'pt_low', 'miss_you', 'anniversary'];

/** 'YYYY-MM-DD' + n days. */
function plusDays(day, n) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

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
    /** Members who joined the gym in the MettleUp app (owner_app_members rows). None by default. */
    this.appMembers = [];
    /**
     * #49 step 2: does this server have 0025 (the workout offer, group and timed messages)? Off by
     * default: the calls answer PGRST202 like a server before 0025, so the older journeys see the
     * panel exactly as before.
     */
    this.offerServer = false;
    this.offers = [];
    /** offer members: { offerId, rosterId, joinedOn, windowEndsOn, counted, deskDays, appDays, ... } */
    this.offerMembers = [];
    /** #51 (0027/0028): the gym's status as MettleUp HQ set it, its support-access windows and HQ actions. */
    /**
     * R-86: does this server have 0029 (automatic reminders)? Off by default, like a server before
     * it: the calls answer PGRST202. `autoReminders`: the owner's saved switches (null = none).
     */
    this.reminderServer = false;
    this.autoReminders = null;
    this.hqStatus = 'active';
    this.hqGrants = [];
    this.hqActions = [];
    /** R-97 (0030): the gym's free trial { startsAt, endsAt, plan, billing, paidUntil }; undefined = a server before 0030. */
    this.hqTrial = undefined;
    /**
     * #38: does this server have 0033 (terms acceptance)? Off by default (PGRST202), so the older
     * journeys never see the "Before you go on" card. `terms`: what was accepted, null = nothing.
     */
    this.termsServer = false;
    this.terms = null;
    /**
     * R-117: does this server have 0034 (each person's own PIN)? Off by default, like a server before
     * it: gym_create_online with a PIN and the PIN calls answer PGRST202, and a sign-in reply has no
     * `via` / `hasPin`, so the older journeys never see the "Set your own PIN" prompt.
     */
    this.pinServer = false;
    /** session key -> 'pin' | 'code' (how that device signed in; 0034's gym_sessions.via). */
    this.sessionVia = new Map();
    /**
     * R-120: does this server have 0035 (measurements taken by the trainer, diet plans)? Off by
     * default: its calls answer PGRST202 like a server before it.
     */
    this.bodyServer = false;
    /** 0035's gym_body_measurements rows and gym_diet_plans rows. */
    this.measures = [];
    this.diets = [];
    this.bodySeq = 0;
    /** R-124: does this server have 0036 (gym timings)? Off by default (PGRST202, like a server before it). */
    this.timingsServer = false;
    /** 0036's gym_timings row: {hours, updatedByName, updatedAt}, or null. */
    this.timings = null;
  }

  /** 0035 _roster_member_ok: a live member record of this gym. */
  rosterMember(id) {
    const r = this.records.get(`member:${id}`);
    if (!r || r.x) throw new Refusal('NO_MEMBER');
    return r;
  }

  /** 0035 _measure_clean (the same ranges and codes). */
  cleanMeasure(p) {
    if (!p || typeof p !== 'object' || !/^\d{4}-\d{2}-\d{2}$/.test(String(p.date ?? '')) || p.date > TODAY) throw new Refusal('BAD_DATE');
    const n01 = (v, lo, hi) => {
      if (v == null) return null;
      if (typeof v !== 'number') throw new Refusal('INVALID');
      const r = Math.round(v * 10) / 10;
      if (r < lo || r > hi) throw new Refusal('INVALID');
      return r;
    };
    const tape = {};
    for (const [k, v] of Object.entries(p.tape ?? {})) {
      if (!TAPE.includes(k)) throw new Refusal('INVALID');
      if (v != null) tape[k] = n01(v, 5, 300);
    }
    const out = { date: p.date, weightKg: n01(p.weightKg, 20, 350), bodyFat: n01(p.bodyFat, 2, 75), tape, note: p.note ? String(p.note).trim() || null : null };
    if (out.weightKg == null && out.bodyFat == null && Object.keys(tape).length === 0) throw new Refusal('EMPTY');
    return out;
  }

  /** 0035 _diet_clean, in short. */
  cleanDiet(p) {
    const title = String(p?.title ?? '').trim();
    if (!title || title.length > 80 || !Array.isArray(p.meals) || p.meals.length < 1 || p.meals.length > 10) throw new Refusal('INVALID');
    if (p.kcal != null && (p.kcal < 800 || p.kcal > 6000)) throw new Refusal('INVALID');
    if (p.proteinG != null && (p.proteinG < 20 || p.proteinG > 400)) throw new Refusal('INVALID');
    const meals = p.meals.map((m) => {
      const items = (m.items ?? []).map((i) => String(i).trim()).filter(Boolean);
      if (!String(m.name ?? '').trim() || items.length === 0) throw new Refusal('INVALID');
      return { name: String(m.name).trim(), time: m.time ? String(m.time).trim() : null, items };
    });
    const a = p.assign ?? {};
    if (!Array.isArray(a.memberIds) || !Array.isArray(a.planIds)) throw new Refusal('INVALID');
    return { title, goal: p.goal ?? null, kcal: p.kcal ?? null, proteinG: p.proteinG ?? null, meals, notes: p.notes ?? null,
      assign: { memberIds: [...new Set(a.memberIds)], planIds: [...new Set(a.planIds)] } };
  }

  /**
   * A member joins the running offer in the app and has `counted` workouts matched by the register
   * (what member_join_offer and member_offer_days would leave on the real server).
   */
  joinOffer(rosterId, counted = 0) {
    const o = this.offers.find((x) => x.stoppedAt === null);
    if (!o) throw new Error('no running offer');
    const m = {
      offerId: o.id,
      rosterId,
      joinedOn: TODAY,
      windowEndsOn: plusDays(TODAY, o.windowDays - 1),
      counted,
      deskDays: counted,
      appDays: 0,
      left: false,
      earnedAt: counted >= o.workouts ? NOW.toISOString() : null,
      givenAt: null,
      givenAuto: null,
      givenByName: null,
      givenDays: null,
      oldEnd: null,
      newEnd: null,
      undoneAt: null,
      undoneByName: null,
    };
    this.offerMembers.push(m);
    return m;
  }

  /** The owner of an old owner key (the demo's shop), or a signed-in owner; OWNER_ONLY for the desk. */
  ownerLike(key) {
    if (this.ownerKeys.has(key)) return { staffId: null, name: 'Owner (old owner key)', role: 'owner' };
    return this.ownerOnly(key);
  }

  /** A person by key for a desk-or-owner call (an old owner key is the owner). */
  anyone(key) {
    if (this.ownerKeys.has(key)) return { staffId: null, name: 'Owner (old owner key)', role: 'owner' };
    return this.who(key);
  }

  /** owner_terms' answer (0033). */
  termsJson(canAccept) {
    const t = this.terms;
    return { acceptedVersion: t ? t.version : null, acceptedAt: t ? t.at : null, acceptedByName: t ? t.by : null, how: t ? t.how : null, canAccept };
  }

  /** owner_auto_reminders' answer (0029). */
  remindersJson(canEdit) {
    const r = this.autoReminders;
    return { settings: r ? r.settings : null, updatedAt: r ? r.updatedAt : null, updatedByName: r ? r.updatedByName : null, canEdit };
  }

  offerJson(o) {
    const ms = this.offerMembers.filter((m) => m.offerId === o.id);
    return {
      ...o,
      open: o.stoppedAt === null && o.startsOn <= TODAY && o.joinUntil >= TODAY,
      joined: ms.length,
      inNow: ms.filter((m) => !m.left && !m.earnedAt && m.windowEndsOn >= TODAY).length,
      ready: ms.filter((m) => m.earnedAt && !m.givenAt && !m.undoneAt).length,
      given: ms.filter((m) => m.givenAt).length,
    };
  }

  /** 0025's _offer_give: the member's gym plan that ends last moves `rewardDays` later, with a note. */
  giveReward(o, m, by, auto) {
    if (m.givenAt) return { ok: true, alreadyGiven: true, days: m.givenDays, oldEnd: m.oldEnd, newEnd: m.newEnd, version: this.version };
    if (!m.earnedAt) throw new Refusal('NOT_EARNED');
    const plan = [...this.records.values()]
      .filter((r) => r.k === 'membership' && !r.x && r.d.memberId === m.rosterId && r.d.cancelled !== true && !(Number(r.d.ptSessions) > 0) && r.d.endsOn >= TODAY)
      .sort((a, b) => (a.d.endsOn < b.d.endsOn ? 1 : -1))[0];
    if (!plan) throw new Refusal('NO_PLAN');
    const oldEnd = plan.d.endsOn;
    const newEnd = plusDays(oldEnd, o.rewardDays);
    const line = `+${o.rewardDays} days (Reward - Workout offer): ${oldEnd} -> ${newEnd}`;
    this.version += 1;
    plan.d = { ...plan.d, endsOn: newEnd, notes: plan.d.notes ? `${plan.d.notes}\n${line}` : line, updatedAt: NOW.getTime() };
    plan.ver = this.version;
    Object.assign(m, { givenAt: NOW.toISOString(), givenAuto: auto, givenByName: by, givenDays: o.rewardDays, oldEnd, newEnd, undoneAt: null, undoneByName: null, membershipId: plan.id });
    return { ok: true, alreadyGiven: false, days: o.rewardDays, oldEnd, newEnd, membershipId: plan.id, version: this.version };
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

  /** A person the owner added, with the sign-in code they were given (and, 0034, their PIN). */
  addPerson({ name, phone, role, code, pin = null }) {
    const staffId = `s-${role}-${phone}`;
    this.people.set(phone, { staffId, name, phone, role, code, lastSeenAt: null, pin, pinTries: 0, pinLocked: false });
    return staffId;
  }

  /** 0034's _pin_problem. */
  pinProblem(pin, phone) {
    if (!/^\d{6}$/.test(String(pin ?? ''))) return 'BAD_PIN';
    if (/^(\d)\1{5}$/.test(pin) || '0123456789'.includes(pin) || '9876543210'.includes(pin)) return 'WEAK_PIN';
    if (String(phone).slice(-6) === pin) return 'WEAK_PIN';
    return null;
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

  /** 0034: a sign-in reply that says how the device came in and whether a PIN exists. */
  signedInVia(person, via) {
    const out = this.signedIn(person);
    if (!this.pinServer) return out;
    this.sessionVia.set(out.sessionKey, via);
    return { ...out, via, hasPin: Boolean(person.pin) };
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
    // A server before 0025 has neither the offer calls nor owner_send_message's two new arguments.
    if (!this.offerServer && (OFFER_FNS.includes(fn) || (fn === 'owner_send_message' && ('p_to' in args || 'p_send_at' in args)))) {
      throw new NoSuchFunction(`Could not find the function public.${fn} in the schema cache`);
    }
    if (!this.bodyServer && BODY_FNS.includes(fn)) {
      throw new NoSuchFunction(`Could not find the function public.${fn} in the schema cache`);
    }
    if (!this.timingsServer && TIMINGS_FNS.includes(fn)) {
      throw new NoSuchFunction(`Could not find the function public.${fn} in the schema cache`);
    }
    if (!this.reminderServer && REMINDER_FNS.includes(fn)) {
      throw new NoSuchFunction(`Could not find the function public.${fn} in the schema cache`);
    }
    if (BRANCH_FNS.includes(fn) || (!this.termsServer && TERMS_FNS.includes(fn))) {
      throw new NoSuchFunction(`Could not find the function public.${fn} in the schema cache`);
    }
    // A server before 0034 has neither the PIN calls nor gym_create_online's p_pin.
    if (!this.pinServer && (PIN_FNS.includes(fn) || (fn === 'gym_create_online' && 'p_pin' in args))) {
      throw new NoSuchFunction(`Could not find the function public.${fn} in the schema cache`);
    }
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
        // 0034: a PIN that is sent must be a good one.
        if (args.p_pin) {
          const bad = this.pinProblem(args.p_pin, args.p_phone);
          if (bad) throw new Refusal(bad);
        }
        this.gym.name = args.p_gym_name;
        const staffId = this.addPerson({ name: args.p_name, phone: args.p_phone, role: 'owner', code: null, pin: args.p_pin ?? null });
        // 0033: the box ticked at "Create my gym" is kept with the gym.
        if (this.termsServer && args.p_terms_version) {
          this.terms = { version: args.p_terms_version, at: NOW.toISOString(), by: args.p_name, how: 'create' };
        }
        return this.signedIn(this.people.get(args.p_phone) ?? { staffId });
      }
      case 'owner_terms': {
        const p = this.anyone(args.p_key);
        return this.termsJson(p.role === 'owner');
      }
      case 'owner_accept_terms': {
        const p = this.ownerLike(args.p_key);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(args.p_version))) throw new Refusal('INVALID');
        if (!this.terms || this.terms.version < args.p_version) {
          this.terms = { version: args.p_version, at: NOW.toISOString(), by: p.name, how: 'sign_in' };
        }
        return this.termsJson(true);
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
        // 0034 (pinServer): the person's own PIN first (not while it is locked after 5 wrong tries),
        // then the code; every wrong try counts against the PIN too.
        const misses = this.misses.get(args.p_phone) ?? 0;
        if (misses >= CODE_TRIES) return { error: 'TOO_MANY_TRIES' };
        const p = this.people.get(args.p_phone);
        if (this.pinServer && p?.pin && !p.pinLocked && p.pin === args.p_code) {
          p.pinTries = 0;
          this.misses.delete(args.p_phone);
          return this.signedInVia(p, 'pin');
        }
        if (!p || !p.code || p.code !== args.p_code) {
          this.misses.set(args.p_phone, misses + 1);
          if (this.pinServer && p?.pin && !p.pinLocked) {
            p.pinTries += 1;
            if (p.pinTries >= 5) Object.assign(p, { pinTries: 0, pinLocked: true });
          }
          return { error: 'WRONG_CODE', triesLeft: Math.max(0, CODE_TRIES - 1 - misses) };
        }
        p.code = null;
        p.pinTries = 0;
        p.pinLocked = false;
        this.misses.delete(args.p_phone);
        return this.signedInVia(p, 'code');
      }
      case 'staff_pin_status': {
        const p = this.who(args.p_key);
        return {
          canSet: true,
          hasPin: Boolean(p.pin),
          setAt: p.pin ? NOW.toISOString() : null,
          needsCurrent: Boolean(p.pin) && this.sessionVia.get(args.p_key) !== 'code',
          lockedUntil: p.pinLocked ? new Date(NOW.getTime() + 15 * 60_000).toISOString() : null,
        };
      }
      case 'staff_set_pin': {
        const p = this.who(args.p_key);
        const bad = this.pinProblem(args.p_pin, p.phone);
        if (bad) return { error: bad };
        if (p.pin && this.sessionVia.get(args.p_key) !== 'code') {
          if (p.pinLocked) return { error: 'TOO_MANY_TRIES' };
          if (!args.p_current) return { error: 'NEED_CURRENT' };
          if (args.p_current !== p.pin) {
            p.pinTries += 1;
            if (p.pinTries >= 5) Object.assign(p, { pinTries: 0, pinLocked: true });
            return { error: 'WRONG_PIN', triesLeft: p.pinLocked ? 0 : 5 - p.pinTries };
          }
        }
        Object.assign(p, { pin: args.p_pin, pinTries: 0, pinLocked: false });
        return { ok: true, hasPin: true, setAt: NOW.toISOString() };
      }
      case 'staff_sign_out':
        this.endSession(args.p_key);
        return null;
      case 'staff_me': {
        // 0010: who this key is (an old owner key has no person).
        if (this.ownerKeys.has(args.p_key)) return { gymId: this.shopGym.gymId, name: this.shopGym.name, joinCode: this.shopGym.joinCode, person: null };
        const p = this.who(args.p_key);
        return { gymId: this.gym.gymId, name: this.gym.name, joinCode: this.gym.joinCode, person: { staffId: p.staffId, name: p.name, phone: p.phone, role: p.role } };
      }
      case 'staff_key_status': {
        if (this.sessions.has(args.p_key)) return 'live';
        const id = this.deadKeys.get(args.p_key);
        if (!id) return 'unknown';
        return this.removedStaff.has(id) ? 'removed' : 'signed_out';
      }
      // #51 (0028): the owner's "MettleUp access" list and the one-hour support access.
      case 'owner_hq_access': {
        this.ownerOnly(args.p_key);
        const t = NOW.getTime();
        return {
          status: this.hqStatus,
          ...(this.hqTrial === undefined ? {} : { trial: this.hqTrial }),
          grants: this.hqGrants.map((g) => ({ ...g, open: !g.endedEarly && Date.parse(g.startsAt) <= t && Date.parse(g.endsAt) > t })).reverse(),
          actions: this.hqActions,
        };
      }
      case 'owner_hq_grant': {
        const me = this.ownerOnly(args.p_key);
        const g = {
          grantId: `grant-${this.hqGrants.length + 1}`,
          openedBy: 'gym',
          openedByName: me.name,
          reasonKind: 'gym_asked',
          reason: 'The gym asked MettleUp support to look',
          startsAt: NOW.toISOString(),
          endsAt: new Date(NOW.getTime() + 60 * 60_000).toISOString(),
          endedEarly: false,
          looked: [],
        };
        this.hqGrants.push(g);
        return { ...g, open: true };
      }
      case 'owner_hq_end': {
        this.ownerOnly(args.p_key);
        for (const g of this.hqGrants) {
          if (!g.endedEarly && Date.parse(g.endsAt) > NOW.getTime()) Object.assign(g, { endedEarly: true, endsAt: NOW.toISOString() });
        }
        return null;
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
          ...(this.pinServer
            ? { hasPin: Boolean(p.pin), pinLockedUntil: p.pinLocked ? new Date(NOW.getTime() + 15 * 60_000).toISOString() : null }
            : {}),
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
        const out = this.personById(args.p_staff);
        if (!out) throw new Refusal('GONE');
        // 0034: "Sign out everywhere" clears that person's PIN too.
        if (this.pinServer) Object.assign(out, { pin: null, pinTries: 0, pinLocked: false });
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
        // #51 (0027): a gym MettleUp paused can look but not save.
        if (this.hqStatus === 'suspended') throw new Refusal('SUSPENDED');
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
        // 0025: a group (app member ids; none left: NO_ONE) and a time to appear.
        const to = Array.isArray(args.p_to) ? args.p_to.filter((id) => this.appMembers.some((a) => a.member_id === id)) : null;
        if (to && to.length === 0) throw new Refusal('NO_ONE');
        const m = {
          id: `msg-${this.messages.length + 1}`,
          kind: args.p_kind,
          title,
          body,
          createdAt: NOW.toISOString(),
          recipients: to ? to.length : this.appMembers.length,
          seen: 0,
          withdrawn: false,
          sendAt: typeof args.p_send_at === 'string' ? new Date(args.p_send_at).toISOString() : null,
          toGroup: Boolean(to),
        };
        this.messages.unshift(m);
        return m;
      }
      case 'owner_messages':
        return this.messages;
      case 'owner_app_members':
        return this.appMembers;
      // ---- #49 step 2 (0025): the workout offer, only when offerServer is on (see above).
      case 'owner_offers': {
        this.anyone(args.p_key);
        return { offers: this.offers.map((o) => this.offerJson(o)), members: this.offerMembers, today: TODAY };
      }
      case 'owner_save_offer': {
        const me = this.ownerLike(args.p_key);
        const p = args.p_offer ?? {};
        if (p.id) {
          const o = this.offers.find((x) => x.id === p.id && x.stoppedAt === null);
          if (!o) throw new Refusal('GONE');
          if (typeof p.autoGive === 'boolean') o.autoGive = p.autoGive;
          if (p.joinUntil) o.joinUntil = p.joinUntil;
          return this.offerJson(o);
        }
        if (this.offers.some((o) => o.stoppedAt === null)) throw new Refusal('ONE_RUNNING');
        const w = Number(p.workouts);
        const wd = Number(p.windowDays);
        const rd = Number(p.rewardDays);
        if (!(w >= 4 && w <= 30 && wd >= 7 && wd <= 60 && rd >= 1 && rd <= 7 && w <= wd)) throw new Refusal('INVALID');
        const o = {
          id: `offer-${this.offers.length + 1}`,
          kind: 'workout',
          title: String(p.title ?? '').trim(),
          workouts: w,
          windowDays: wd,
          rewardDays: rd,
          minMinutes: 20,
          minSets: 6,
          startsOn: TODAY,
          joinUntil: p.joinUntil,
          countAppCheckins: p.countAppCheckins !== false,
          autoGive: p.autoGive === true,
          createdAt: NOW.toISOString(),
          createdByName: me.name,
          stoppedAt: null,
        };
        this.offers.unshift(o);
        return this.offerJson(o);
      }
      case 'owner_stop_offer': {
        this.ownerLike(args.p_key);
        const o = this.offers.find((x) => x.id === args.p_offer);
        if (!o) throw new Refusal('GONE');
        o.stoppedAt = o.stoppedAt ?? NOW.toISOString();
        return this.offerJson(o);
      }
      case 'staff_give_reward': {
        const p = this.anyone(args.p_key);
        const o = this.offers.find((x) => x.id === args.p_offer);
        const m = this.offerMembers.find((x) => x.offerId === args.p_offer && x.rosterId === args.p_roster);
        if (!o || !m) throw new Refusal('GONE');
        // A reward the owner took back: only the owner gives it again (0025 review fix).
        if (!m.givenAt && m.undoneAt && p.role !== 'owner') throw new Refusal('TAKEN_BACK');
        return this.giveReward(o, m, p.name, false);
      }
      case 'owner_undo_reward': {
        const p = this.ownerLike(args.p_key);
        const m = this.offerMembers.find((x) => x.offerId === args.p_offer && x.rosterId === args.p_roster);
        if (!m) throw new Refusal('GONE');
        if (!m.givenAt) throw new Refusal('NOT_GIVEN');
        const plan = this.records.get(`membership:${m.membershipId}`);
        if (!plan || plan.x || plan.d.endsOn !== m.newEnd) throw new Refusal('CHANGED');
        const line = `Reward taken back: ${m.newEnd} -> ${m.oldEnd}`;
        this.version += 1;
        plan.d = { ...plan.d, endsOn: m.oldEnd, notes: `${plan.d.notes}\n${line}`, updatedAt: NOW.getTime() };
        plan.ver = this.version;
        Object.assign(m, { givenAt: null, givenAuto: null, givenByName: null, givenDays: null, undoneAt: NOW.toISOString(), undoneByName: p.name });
        return { ok: true, endsOn: m.oldEnd, version: this.version };
      }
      // ---- R-86 (0029): automatic reminders, only when reminderServer is on.
      case 'owner_auto_reminders': {
        const p = this.anyone(args.p_key);
        return this.remindersJson(p.role === 'owner');
      }
      case 'owner_save_auto_reminders': {
        const p = this.ownerLike(args.p_key);
        const s = args.p_settings;
        if (!s || typeof s !== 'object' || Array.isArray(s)) throw new Refusal('INVALID');
        const clean = {};
        for (const [k, v] of Object.entries(s)) {
          if (!REMINDER_KEYS.includes(k) || !v || typeof v.on !== 'boolean') throw new Refusal('INVALID');
          clean[k] = { on: v.on };
          if (v.days != null) {
            const range = REMINDER_NUMBERS[k];
            if (!range || !Array.isArray(v.days)) throw new Refusal('INVALID');
            const days = [...new Set(v.days)];
            if (days.length < 1 || days.length > range[2] || days.some((d) => !Number.isInteger(d) || d < range[0] || d > range[1])) throw new Refusal('INVALID');
            clean[k].days = days.sort((a, b) => b - a);
          }
        }
        this.autoReminders = { settings: clean, updatedAt: NOW.toISOString(), updatedByName: p.name };
        return this.remindersJson(true);
      }
      // ---- R-120 (0035): measurements taken by the trainer, and diet plans (owner and desk alike).
      case 'owner_member_measurements': {
        this.anyone(args.p_key);
        return this.measures.filter((m) => m.memberId === args.p_member).sort((a, b) => (a.date < b.date ? 1 : -1));
      }
      case 'owner_save_measurement': {
        const p = this.anyone(args.p_key);
        this.rosterMember(args.p_member);
        const c = this.cleanMeasure(args.p_entry);
        const id = args.p_entry?.id;
        const old = id ? this.measures.find((m) => m.id === id && m.memberId === args.p_member) : null;
        if (id && !old) throw new Refusal('NOT_FOUND');
        if (this.measures.some((m) => m.memberId === args.p_member && m.date === c.date && m.id !== id)) throw new Refusal('DAY_TAKEN');
        if (old) {
          Object.assign(old, c, { updatedAt: NOW.getTime() });
          return old;
        }
        this.bodySeq += 1;
        const row = { id: `00000000-0000-4000-8000-${String(this.bodySeq).padStart(12, '0')}`, memberId: args.p_member, ...c, byName: p.staffId ? p.name : null, createdAt: NOW.getTime(), updatedAt: NOW.getTime() };
        this.measures.push(row);
        return row;
      }
      case 'owner_delete_measurement': {
        this.anyone(args.p_key);
        const i = this.measures.findIndex((m) => m.id === args.p_id);
        if (i < 0) throw new Refusal('NOT_FOUND');
        this.measures.splice(i, 1);
        return null;
      }
      case 'owner_diet_plans': {
        this.anyone(args.p_key);
        return [...this.diets].sort((a, b) => b.updatedAt - a.updatedAt);
      }
      case 'owner_save_diet_plan': {
        const p = this.anyone(args.p_key);
        const c = this.cleanDiet(args.p_plan);
        const id = args.p_plan?.id;
        if (id) {
          const old = this.diets.find((d) => d.id === id);
          if (!old) throw new Refusal('NOT_FOUND');
          if (old.withdrawn) throw new Refusal('WITHDRAWN');
          this.bodySeq += 1;
          Object.assign(old, c, { updatedAt: NOW.getTime() + this.bodySeq });
          return old;
        }
        this.bodySeq += 1;
        const row = { id: `00000000-0000-4000-9000-${String(this.bodySeq).padStart(12, '0')}`, ...c, withdrawn: false, byName: p.staffId ? p.name : null, createdAt: NOW.getTime(), updatedAt: NOW.getTime() + this.bodySeq };
        this.diets.push(row);
        return row;
      }
      case 'owner_withdraw_diet_plan': {
        this.anyone(args.p_key);
        const d = this.diets.find((x) => x.id === args.p_id);
        if (!d) throw new Refusal('NOT_FOUND');
        this.bodySeq += 1;
        Object.assign(d, { withdrawn: true, updatedAt: NOW.getTime() + this.bodySeq });
        return d;
      }
      // ---- R-124 (0036): the gym's opening hours (the desk reads; only the owner saves).
      case 'owner_gym_timings': {
        const p = this.anyone(args.p_key);
        return { hours: this.timings?.hours ?? null, updatedByName: this.timings?.updatedByName ?? null, updatedAt: this.timings?.updatedAt ?? null, canEdit: p.role === 'owner' };
      }
      case 'owner_save_gym_timings': {
        const p = this.ownerLike(args.p_key);
        if (args.p_hours == null) {
          this.timings = null;
          return { hours: null, updatedByName: null, updatedAt: null, canEdit: true };
        }
        const h = args.p_hours;
        const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
        const okDay = (d) => d && ['closed', 'hours', 'allDay'].includes(d.kind) && Array.isArray(d.ranges ?? []) &&
          (d.kind !== 'hours' || (d.ranges.length >= 1 && d.ranges.length <= 2 && d.ranges.every((r) => /^([01]\d|2[0-3]):[0-5]\d$/.test(r.open) && /^([01]\d|2[0-3]):[0-5]\d$/.test(r.close))));
        if (!h || typeof h !== 'object' || !DAYS.every((k) => okDay(h.week?.[k])) || DAYS.every((k) => h.week[k].kind === 'closed')) throw new Refusal('INVALID');
        if (!(h.special ?? []).every((s) => /^\d{4}-\d{2}-\d{2}$/.test(s.date) && okDay(s))) throw new Refusal('INVALID');
        const hours = { week: h.week, special: (h.special ?? []).filter((s) => s.date >= plusDays(TODAY, -1)), note: h.note ?? null };
        this.timings = { hours, updatedByName: p.staffId ? p.name : null, updatedAt: NOW.getTime() };
        return { ...this.timings, canEdit: true };
      }
      default:
        // Orders, messages, app members: an empty list, as for a new gym.        return [];
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
        if (e instanceof NoSuchFunction) {
          await route.fulfill({
            status: 404,
            contentType: 'application/json',
            body: JSON.stringify({ code: 'PGRST202', message: e.message, details: null, hint: null }),
          });
          return;
        }
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

/** The owner of the online journeys; `pin` is the PIN he chooses at Create my gym (R-117). */
export const OWNER = { name: 'Ramesh Sharma', phone: '98290 12345', gym: 'Shakti Gym', pin: '271828' };
export const DESK = { name: 'Sunita Verma', phone: '98290 54321' };

/** Welcome -> "New here? Set up your gym" -> Create my gym. Ends on Today, signed in as the owner. */
export async function startOnlineGym(page, { gym = OWNER.gym, name = OWNER.name, phone = OWNER.phone, pin = OWNER.pin } = {}) {
  const start = page.locator('form').filter({ has: page.getByRole('button', { name: 'Create my gym' }) });
  await start.getByLabel('Gym name').fill(gym);
  await start.getByLabel('Your name').fill(name);
  await start.getByLabel('Your mobile number').fill(phone);
  // R-117: the owner's own PIN, typed twice.
  await fillNewPin(start, pin);
  // #38: the owner agrees to the terms before the gym is made.
  await start.getByRole('checkbox', { name: /I agree to the MettleUp terms and the data agreement/ }).check();
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

/** R-117: "Choose a 6-digit PIN" and "Type the PIN again" (Create my gym, Set my PIN). */
export async function fillNewPin(scope, pin, again = pin) {
  await scope.getByLabel('Choose a 6-digit PIN').fill(pin);
  await scope.getByLabel('Type the PIN again').fill(again);
}

/** Welcome -> Sign in with a mobile number and a code (or, 0034, a PIN). Does not wait for the result. */
export async function typeSignIn(page, phone, code) {
  const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Sign in' }) });
  await form.getByLabel('Your mobile number').fill(phone);
  await form.getByLabel('Sign-in code or PIN (6 digits)').fill(code);
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
