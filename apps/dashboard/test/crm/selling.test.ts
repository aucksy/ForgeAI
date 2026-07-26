import { describe, expect, it } from 'vitest';

import {
  hasPaidJoiningFee,
  saleDefaults,
  validateSale,
} from '../../src/crm/logic/selling';
import { makeMembership, makePlan } from './fixtures';

const TODAY = '2026-07-26';

const monthly = makePlan({ name: 'Monthly', durationUnit: 'month', durationCount: 1, priceP: 120_000, joiningFeeP: 50_000 });
const annual = makePlan({ name: 'Annual', durationUnit: 'month', durationCount: 12, priceP: 1_000_000, joiningFeeP: 0 });

describe('saleDefaults — start date', () => {
  it('starts today for someone with no history', () => {
    const d = saleDefaults([], monthly, TODAY);
    expect(d.startsOn).toBe(TODAY);
    expect(d.endsOn).toBe('2026-08-25');
    expect(d.isRenewal).toBe(false);
  });

  it('continues the day after a running term', () => {
    const running = makeMembership({ startsOn: '2026-07-01', endsOn: '2026-08-25' });
    const d = saleDefaults([running], monthly, TODAY);
    expect(d.startsOn).toBe('2026-08-26');
    expect(d.isRenewal).toBe(true);
  });

  it('starts AFTER an early renewal, not inside it', () => {
    // The bug: reading only the term running today defaulted the start date to
    // the first day of a renewal the member had already bought, so confirming
    // sold them the same year twice and moved their real expiry nowhere.
    const running = makeMembership({ startsOn: '2026-07-01', endsOn: '2026-07-30' });
    const alreadyRenewed = makeMembership({ startsOn: '2026-07-31', endsOn: '2027-07-30' });

    const d = saleDefaults([running, alreadyRenewed], annual, TODAY);
    expect(d.startsOn).toBe('2027-07-31');
    expect(d.endsOn).toBe('2028-07-30');
  });

  it('starts today for a member who lapsed, rather than backdating', () => {
    const lapsed = makeMembership({ startsOn: '2026-01-01', endsOn: '2026-04-30' });
    expect(saleDefaults([lapsed], monthly, TODAY).startsOn).toBe(TODAY);
  });

  it('ignores a cancelled term when deciding where to start', () => {
    const cancelled = makeMembership({ startsOn: '2026-07-01', endsOn: '2026-12-31', cancelled: true });
    expect(saleDefaults([cancelled], monthly, TODAY).startsOn).toBe(TODAY);
  });
});

describe('saleDefaults — joining fee', () => {
  it('charges the fee to someone who has never paid one', () => {
    expect(saleDefaults([], monthly, TODAY).joiningFeeP).toBe(50_000);
  });

  it('does not charge it twice', () => {
    const first = makeMembership({ joiningFeeP: 50_000, startsOn: '2026-01-01', endsOn: '2026-01-31' });
    expect(saleDefaults([first], monthly, TODAY).joiningFeeP).toBe(0);
  });

  it('still counts a fee charged on a CANCELLED term', () => {
    // "Do they have a live membership?" is the wrong question — a cancelled term
    // still took the member's ₹500, and asking the wrong one charged it again.
    const cancelledButPaidFee = makeMembership({
      joiningFeeP: 50_000,
      cancelled: true,
      startsOn: '2026-01-01',
      endsOn: '2026-01-31',
    });
    expect(hasPaidJoiningFee([cancelledButPaidFee])).toBe(true);
    expect(saleDefaults([cancelledButPaidFee], monthly, TODAY).joiningFeeP).toBe(0);
  });

  it('DOES charge it when the earlier term happened to carry a zero fee', () => {
    // The mirror error: an existing member whose first plan was a fee-free
    // Annual was never charged the joining fee on any later plan.
    const feeFreeFirstPlan = makeMembership({
      joiningFeeP: 0,
      startsOn: '2025-07-01',
      endsOn: '2026-06-30',
    });
    expect(hasPaidJoiningFee([feeFreeFirstPlan])).toBe(false);
    expect(saleDefaults([feeFreeFirstPlan], monthly, TODAY).joiningFeeP).toBe(50_000);
  });
});

describe('validateSale', () => {
  const ok = {
    planId: 'plan_1',
    startsOn: TODAY,
    priceP: 120_000,
    joiningFeeP: 0,
    collectNowP: 0,
  };

  it('accepts a clean sale', () => {
    expect(validateSale(ok, [], TODAY)).toBeNull();
  });

  it('rejects an unparseable amount by naming the field', () => {
    expect(validateSale({ ...ok, priceP: null }, [], TODAY)).toMatchObject({ field: 'priceP' });
    expect(validateSale({ ...ok, joiningFeeP: null }, [], TODAY)).toMatchObject({ field: 'joiningFeeP' });
    expect(validateSale({ ...ok, collectNowP: null }, [], TODAY)).toMatchObject({ field: 'collectNowP' });
    expect(validateSale({ ...ok, planId: null }, [], TODAY)).toMatchObject({ field: 'plan' });
    expect(validateSale({ ...ok, startsOn: 'soon' }, [], TODAY)).toMatchObject({ field: 'startsOn' });
  });

  it('refuses to collect more than the total', () => {
    expect(validateSale({ ...ok, collectNowP: 120_001 }, [], TODAY)).toMatchObject({
      field: 'collectNowP',
    });
    // Exactly the total is fine, and so is the total including a joining fee.
    expect(validateSale({ ...ok, collectNowP: 120_000 }, [], TODAY)).toBeNull();
    expect(
      validateSale({ ...ok, joiningFeeP: 50_000, collectNowP: 170_000 }, [], TODAY),
    ).toBeNull();
  });

  it('refuses a term that starts on top of time the member already owns', () => {
    const running = makeMembership({ startsOn: '2026-07-01', endsOn: '2026-08-25' });
    const clash = validateSale({ ...ok, startsOn: '2026-08-25' }, [running], TODAY);
    expect(clash).toMatchObject({ field: 'startsOn' });
    // Reads like the rest of the app, not like a database row.
    expect(clash?.message).toContain('25 Aug 2026');
    expect(validateSale({ ...ok, startsOn: '2026-08-01' }, [running], TODAY)).toMatchObject({
      field: 'startsOn',
    });
    // The day after cover ends is exactly right.
    expect(validateSale({ ...ok, startsOn: '2026-08-26' }, [running], TODAY)).toBeNull();
  });

  it('allows any start date for a lapsed member', () => {
    const lapsed = makeMembership({ startsOn: '2026-01-01', endsOn: '2026-04-30' });
    expect(validateSale({ ...ok, startsOn: TODAY }, [lapsed], TODAY)).toBeNull();
  });
});
