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
 * The server enforces the WRITES too (supabase/migrations/0014_staff_limits.sql, 15 Oct 2026):
 * crm_push refuses a Staff session's plan / expense / gym rows, voiding a receipt, and cancelling or
 * moving the end of a membership (OWNER_ONLY). HONEST LIMIT that remains: READING — the whole gym
 * is pulled to every signed-in device, so a determined staff member with the browser's developer
 * tools could still add up the totals the panel hides from them.
 */

import { tr } from '../i18n';
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
  | 'undoOldPtSession';

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
];

/** Everything listed above is owner-only today; a new action must be added here on purpose. */
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
};

/** May this role do this? Owners may do everything. */
export function can(role: Role, action: Action): boolean {
  return role === 'owner' ? true : STAFF_MAY[action] === true;
}

/** The role of whoever this device is signed in as. No person (browser-only gym, old owner key) = owner. */
export function roleOf(session: { person?: Person | null } | null | undefined): Role {
  return session?.person?.role === 'staff' ? 'staff' : 'owner';
}

// ---------------------------------------------------------------- screen-level helpers

/** Pages a role may open at all. Staff: everything except Expenses. */
export function canOpen(role: Role, path: string): boolean {
  const [head, sub] = path.replace(/^#?\/?/, '').split('/');
  if (head === 'expenses') return can(role, 'seeExpenses');
  if (head === 'settings' && sub === 'branding') return can(role, 'manageGym');
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

export type ShopTab = 'orders' | 'products' | 'messages';

/** Shop's tabs: Staff hands over orders; products, prices and messages are the owner's. */
export function shopTabs(role: Role): ShopTab[] {
  return can(role, 'manageGym') ? ['orders', 'products', 'messages'] : ['orders'];
}

/** Which Shop tab a route opens for this role. */
export function shopTabFor(role: Role, section: string | undefined): ShopTab {
  const tabs = shopTabs(role);
  const wanted: ShopTab = section === 'products' || section === 'messages' ? section : 'orders';
  return tabs.includes(wanted) ? wanted : 'orders';
}

/** One plain line: what Staff can and cannot do now. Shown on Staff & sign-in. */
export function staffRightsWords(): string {
  return tr(
    'Owner: everything. Staff (front desk): add members, sell plans, collect fees, check in, hand over shop orders. Staff cannot see money totals or expenses, void receipts, cancel or freeze plans, change prices, or change the gym.',
    'Owner: sab kuch. Staff (front desk): member jodo, Plan do, Fees lo, Hazri lagao, Shop order do. Staff kul paisa ya Kharcha nahi dekh sakta, Raseed ya Plan cancel nahi kar sakta, Freeze nahi de sakta, Fees ya gym ki details nahi badal sakta.',
  );
}
