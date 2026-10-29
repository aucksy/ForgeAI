/**
 * What an owner and a front-desk Staff person may do in the panel (15 Oct 2026). PURE.
 *
 * Research (Audit/crm-research/RESEARCH.md §9 rec 8; rivals GymBook and OkGym): "Staff login with
 * a Front Desk role: can add, collect and check in; cannot delete or see totals." So Staff can add
 * members, sell and renew plans, collect fees, check people in and hand over shop orders; Staff
 * cannot see the gym's money totals, undo money (void a receipt, cancel a plan, remove an
 * expense), give free days, change prices, erase data or change the gym itself.
 *
 * A browser-only gym, or an old owner key from before sign-in, has no person: that is the OWNER.
 *
 * Screens HIDE what a role cannot do (never a greyed-out button, never a blank hole in a layout).
 *
 * The server enforces the WRITES too (supabase/migrations/0014_staff_limits.sql, 15 Oct 2026;
 * 0018_staff_and_owner_rules.sql, 16 Oct 2026): crm_push refuses a Staff session's plan / expense /
 * gym rows, any change to a saved receipt, any change to a saved membership other than marking a PT
 * session (and taking back today's), and a new membership that is not one of the gym's plans or
 * starts more than 31 days back (OWNER_ONLY). Gym name, branding, shop products and member messages
 * (manageGym) are refused for Staff too; orders stay open. HONEST LIMIT that remains: READING — the whole gym
 * is pulled to every signed-in device, so a determined staff member with the browser's developer
 * tools could still add up the totals the panel hides from them.
 */

import type { Person, Role } from './signin';

export type Action =
  /** Money totals: today's / this month's collection, profit, fees-due totals, Money's sums and charts. */
  | 'seeTotals'
  | 'voidReceipt'
  | 'cancelMembership'
  | 'removeExpense'
  /** The whole Expenses screen, profit included. */
  | 'seeExpenses'
  /** Create or edit plans and their prices. */
  | 'editPlans'
  /** Settings' data actions: load the demo, erase, start over, disconnect the shop. */
  | 'eraseOrDemo'
  /** Gym details, branding, shop products and prices, messages to members. (The invite poster is fine for staff.) */
  | 'manageGym'
  /** Freeze / extra days: moving a plan's end date for free. */
  | 'freeze'
  /**
   * PT: take back a session marked on an EARLIER day (a free session given back). Anyone may mark a
   * session, and take back one marked today (a tap on the wrong member).
   */
  | 'undoOldPtSession'
  /**
   * Workout plans (18 Oct 2026, 0024): make, change, send and withdraw them. Staff MAY: trainers
   * write the plans, and the server takes a Staff session's workout plans.
   */
  | 'editWorkoutPlans';

export const ACTIONS: readonly Action[] = [
  'seeTotals',
  'voidReceipt',
  'cancelMembership',
  'removeExpense',
  'seeExpenses',
  'editPlans',
  'eraseOrDemo',
  'manageGym',
  'freeze',
  'undoOldPtSession',
  'editWorkoutPlans',
];

/** Owner-only unless it says true here; a new action must be added here on purpose. */
const STAFF_MAY: Readonly<Record<Action, boolean>> = {
  seeTotals: false,
  voidReceipt: false,
  cancelMembership: false,
  removeExpense: false,
  seeExpenses: false,
  editPlans: false,
  eraseOrDemo: false,
  manageGym: false,
  freeze: false,
  undoOldPtSession: false,
  editWorkoutPlans: true,
};

/** May this role do this? Owners may do everything. */
export function can(role: Role, action: Action): boolean {
  return role === 'owner' ? true : STAFF_MAY[action] === true;
}

/** The role of whoever this device is signed in as. No person (browser-only gym, old owner key) = owner. */
export function roleOf(session: { person?: Person | null } | null | undefined): Role {
  return session?.person?.role === 'staff' ? 'staff' : 'owner';
}

/**
 * Admin audit C7-12 (16 Oct 2026): who is taking the money on this device — the signed-in person.
 * A browser-only gym or an old owner key has no person: null (single-operator gym).
 */
export function takerOf(session: { person?: Person | null } | null | undefined): { id: string | null; name: string | null } {
  const p = session?.person;
  return p ? { id: p.staffId, name: p.name || null } : { id: null, name: null };
}

// ---------------------------------------------------------------- screen-level helpers

/** Pages a role may open at all. Staff: everything except Expenses (Workout plans included). */
export function canOpen(role: Role, path: string): boolean {
  const [head, sub] = path.replace(/^#?\/?/, '').split('/');
  if (head === 'expenses') return can(role, 'seeExpenses');
  if (head === 'workouts') return can(role, 'editWorkoutPlans');
  if (head === 'diet') return can(role, 'editWorkoutPlans');
  // Messages & offers (22 Oct 2026): the owner's, like messages always were (the server sends only
  // for the owner, 0018). Staff opening an old Shop -> Messages link is sent to Shop instead.
  // #49 step 2: the workout offer's list (`/messages/offer`) is open to the front desk too, so the
  // desk can give an earned reward with one tap. Starting, stopping and taking back stay the owner's.
  // R-86: Automatic reminders (`/messages/reminders`) too: the desk can look; only the owner changes them.
  if (head === 'messages') return sub === 'offer' || sub === 'reminders' || can(role, 'manageGym');
  if (head === 'settings' && sub === 'branding') return can(role, 'manageGym');
  // #41: every branch's totals together: the owner's (the desk works at one branch).
  if (head === 'branches') return can(role, 'seeTotals');
  // R-168: the "Money owed" list behind its Today tile is a money total (the other numbers are people).
  if (head === 'numbers' && sub === 'owed') return can(role, 'seeTotals');
  // Owner, 30 Oct 2026: "Your growth" is the gym's money and members month by month: the owner's.
  if (head === 'growth') return can(role, 'seeTotals');
  return true;
}

/** Keep only the nav entries (sidebar, bottom bar, More) this role may open. */
export function navFor<T extends { path: string }>(role: Role, items: readonly T[]): T[] {
  return items.filter((i) => canOpen(role, i.path));
}

export type MoneyTab = 'collections' | 'dues';

/** Money's tabs: Staff sees only Dues (the people to collect from). Collections is all totals. */
export function moneyTabs(role: Role): MoneyTab[] {
  return can(role, 'seeTotals') ? ['collections', 'dues'] : ['dues'];
}

/** Which Money tab a route opens for this role. */
export function moneyTabFor(role: Role, section: string | undefined): MoneyTab {
  const tabs = moneyTabs(role);
  const wanted: MoneyTab = section === 'dues' ? 'dues' : 'collections';
  return tabs.includes(wanted) ? wanted : tabs[0]!;
}

export type ShopTab = 'orders' | 'products';

/**
 * Shop's tabs: Staff hands over orders; products and prices are the owner's. Messages moved out to
 * their own page, Messages & offers (22 Oct 2026); `/shop/messages` now opens it (CrmApp.tsx).
 */
export function shopTabs(role: Role): ShopTab[] {
  return can(role, 'manageGym') ? ['orders', 'products'] : ['orders'];
}

/** Which Shop tab a route opens for this role. */
export function shopTabFor(role: Role, section: string | undefined): ShopTab {
  const tabs = shopTabs(role);
  const wanted: ShopTab = section === 'products' ? section : 'orders';
  return tabs.includes(wanted) ? wanted : 'orders';
}

/** Where an old Shop -> Messages link goes: Messages & offers, or Shop for someone who cannot send. */
export function oldMessagesLinkTo(role: Role): '/messages' | '/shop' {
  return canOpen(role, '/messages') ? '/messages' : '/shop';
}

/** One plain line: what Staff can and cannot do now. Shown on Staff & sign-in. `multi`: the gym has branches. */
export function staffRightsWords(multi = false): string {
  return (multi ? 'Owners are owners of every branch. Staff work only at the branch they are added to. ' : '') + 'The owner can do everything. Staff (front desk) can add members, sell plans, collect fees, check members in, hand over shop orders and send members workout plans. Staff can give at most 10% off a plan, and must charge the joining fee as listed. Every receipt shows who took the money. Staff can date a payment at most 31 days back, never ahead. Staff cannot see money totals or expenses. They cannot cancel receipts, cancel or freeze plans, change plan prices or change gym details.';
}
