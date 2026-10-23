import { describe, expect, it } from 'vitest';

import {
  ACTIONS,
  can,
  canOpen,
  moneyTabFor,
  moneyTabs,
  navFor,
  oldMessagesLinkTo,
  roleOf,
  shopTabFor,
  shopTabs,
  staffRightsWords,
} from '../../src/crm/auth/permissions';
import type { Person } from '../../src/crm/auth/signin';

const staff: Person = { staffId: 's1', name: 'Suresh', phone: '9829012345', role: 'staff' };
const owner: Person = { ...staff, staffId: 'o1', role: 'owner' };

describe('can', () => {
  it('lets an owner do everything', () => {
    for (const a of ACTIONS) expect(can('owner', a)).toBe(true);
  });

  it('lets staff do none of the owner-only actions', () => {
    for (const a of ACTIONS) if (a !== 'editWorkoutPlans') expect(can('staff', a)).toBe(false);
  });

  it('lets staff (trainers) make and send workout plans, as the server does (0024)', () => {
    expect(can('staff', 'editWorkoutPlans')).toBe(true);
    expect(can('owner', 'editWorkoutPlans')).toBe(true);
    expect(canOpen('staff', '/workouts')).toBe(true);
    expect(canOpen('owner', '/workouts')).toBe(true);
  });

  it('covers every action the brief names', () => {
    expect([...ACTIONS].sort()).toEqual(
      [
        'cancelMembership',
        'editPlans',
        'editWorkoutPlans',
        'eraseOrDemo',
        'freeze',
        'manageGym',
        'removeExpense',
        'seeExpenses',
        'seeTotals',
        'voidReceipt',
        'undoOldPtSession',
      ].sort(),
    );
  });
});

describe('roleOf', () => {
  it('treats a browser-only gym (no session) as the owner', () => {
    expect(roleOf(null)).toBe('owner');
    expect(roleOf(undefined)).toBe('owner');
  });

  it('treats an old owner key (no person) as the owner', () => {
    expect(roleOf({ person: null })).toBe('owner');
    expect(roleOf({})).toBe('owner');
  });

  it('reads the signed-in person', () => {
    expect(roleOf({ person: staff })).toBe('staff');
    expect(roleOf({ person: owner })).toBe('owner');
  });
});

describe('canOpen / navFor', () => {
  const nav = ['/', '/members', '/shop', '/attendance', '/money', '/plans', '/enquiries', '/expenses', '/settings'].map(
    (path) => ({ path }),
  );

  it('hides only Expenses from staff', () => {
    expect(navFor('staff', nav).map((n) => n.path)).toEqual(
      ['/', '/members', '/shop', '/attendance', '/money', '/plans', '/enquiries', '/settings'],
    );
    expect(navFor('owner', nav)).toHaveLength(nav.length);
  });

  it('blocks typed addresses to owner pages, but keeps invite and sign-in open', () => {
    expect(canOpen('staff', '/expenses')).toBe(false);
    // #49 step 2: the desk gives earned workout-offer rewards, but never sends messages.
    expect(canOpen('staff', '/messages/offer')).toBe(true);
    // R-86: the desk may look at the automatic reminders (the server lets only the owner save).
    expect(canOpen('staff', '/messages/reminders')).toBe(true);
    expect(canOpen('staff', '/messages')).toBe(false);
    expect(canOpen('staff', '/messages/birthday')).toBe(false);
    expect(canOpen('staff', 'expenses')).toBe(false);
    expect(canOpen('staff', '/settings/branding')).toBe(false);
    expect(canOpen('staff', '/settings/invite')).toBe(true);
    expect(canOpen('staff', '/settings/people')).toBe(true);
    expect(canOpen('staff', '/settings')).toBe(true);
    expect(canOpen('staff', '/')).toBe(true);
    expect(canOpen('owner', '/expenses')).toBe(true);
    expect(canOpen('owner', '/settings/branding')).toBe(true);
  });
});

describe('Money tabs', () => {
  it('gives staff only Dues, whatever the link asked for', () => {
    expect(moneyTabs('staff')).toEqual(['dues']);
    expect(moneyTabFor('staff', undefined)).toBe('dues');
    expect(moneyTabFor('staff', 'today')).toBe('dues');
    expect(moneyTabFor('staff', 'dues')).toBe('dues');
  });

  it('keeps both tabs for an owner', () => {
    expect(moneyTabs('owner')).toEqual(['collections', 'dues']);
    expect(moneyTabFor('owner', undefined)).toBe('collections');
    expect(moneyTabFor('owner', 'today')).toBe('collections');
    expect(moneyTabFor('owner', 'dues')).toBe('dues');
  });
});

describe('Shop tabs', () => {
  it('gives staff only Orders', () => {
    expect(shopTabs('staff')).toEqual(['orders']);
    expect(shopTabFor('staff', 'products')).toBe('orders');
    expect(shopTabFor('staff', 'messages')).toBe('orders');
  });

  it('keeps both for an owner; messages moved to their own page (22 Oct 2026)', () => {
    expect(shopTabs('owner')).toEqual(['orders', 'products']);
    expect(shopTabFor('owner', 'products')).toBe('products');
    expect(shopTabFor('owner', 'messages')).toBe('orders');
    expect(shopTabFor('owner', 'nonsense')).toBe('orders');
  });
});

describe('Messages & offers (22 Oct 2026)', () => {
  it('is the owner’s page: staff cannot open it', () => {
    expect(canOpen('owner', '/messages')).toBe(true);
    expect(canOpen('owner', '/messages/birthday')).toBe(true);
    expect(canOpen('staff', '/messages')).toBe(false);
    expect(navFor('staff', [{ path: '/messages' }, { path: '/shop' }])).toEqual([{ path: '/shop' }]);
  });

  it('an old Shop -> Messages link lands on the new page, or on Shop for staff', () => {
    expect(oldMessagesLinkTo('owner')).toBe('/messages');
    expect(oldMessagesLinkTo('staff')).toBe('/shop');
  });
});

describe('staffRightsWords', () => {
  it('says what staff can and cannot do', () => {
    const en = staffRightsWords();
    expect(en).toMatch(/collect fees/);
    expect(en).toMatch(/cannot see money totals/);
    expect(en).not.toMatch(/comes later/);
  });
});
