/**
 * Billing step 3: the upgrade price and the founding offer's rule (packages/theme/src/plans.ts). The server's
 * copies (_upgrade_paise, _founding_open/_founding_taken in 0063) use the same cases in
 * supabase/tests/0063_gym_checkout.sql.
 */
import { describe, expect, it } from 'vitest';

import { foundingOpen, upgradeDaysLeft, upgradePaise } from '@forgeai/theme';

const NOW = Date.parse('2026-11-06T12:00:00+05:30');

describe('upgrade from Starter to Pro', () => {
  it('monthly, 15 India days left (today counted): Rs 500 x 15/30 = Rs 250', () => {
    const pu = '2026-11-20T23:59:59+05:30';
    expect(upgradeDaysLeft(pu, NOW)).toBe(15);
    expect(upgradePaise('monthly', pu, NOW)).toBe(25_000);
  });

  it('yearly, 100 days left: Rs 5,000 x 100/365 rounded up to Rs 1,370', () => {
    const pu = '2027-02-13T23:59:59+05:30';
    expect(upgradeDaysLeft(pu, NOW)).toBe(100);
    expect(upgradePaise('yearly', pu, NOW)).toBe(137_000);
  });

  it('a plan ending tonight has 1 day left: Rs 16.67 rounded up to Rs 17', () => {
    const pu = '2026-11-06T23:59:59+05:30';
    expect(upgradeDaysLeft(pu, NOW)).toBe(1);
    expect(upgradePaise('monthly', pu, NOW)).toBe(1_700);
  });

  it('paid time already over, or never paid: no upgrade (a new purchase instead)', () => {
    expect(upgradeDaysLeft('2026-11-05T23:59:59+05:30', NOW)).toBe(0);
    expect(upgradePaise('monthly', '2026-11-05T23:59:59+05:30', NOW)).toBeNull();
    expect(upgradePaise('monthly', null, NOW)).toBeNull();
    expect(upgradePaise('yearly', 'not a date', NOW)).toBeNull();
  });

  it('a whole-rupee answer is never rounded up by a stray fraction', () => {
    // 73 days of a yearly plan: 5,000 x 73/365 = exactly Rs 1,000.
    const pu = new Date(NOW + 72 * 86_400_000).toISOString();
    expect(upgradeDaysLeft(pu, NOW)).toBe(73);
    expect(upgradePaise('yearly', pu, NOW)).toBe(100_000);
  });
});

describe('founding offer', () => {
  it('open on its last day with 24 places taken', () => {
    expect(foundingOpen(Date.parse('2027-03-31T23:00:00+05:30'), 24)).toBe(true);
  });
  it('closed once 25 places are taken', () => {
    expect(foundingOpen(Date.parse('2027-03-31T23:00:00+05:30'), 25)).toBe(false);
    expect(foundingOpen(NOW, 30)).toBe(false);
  });
  it('closed from 1 Apr 2027 India time', () => {
    expect(foundingOpen(Date.parse('2027-04-01T00:30:00+05:30'), 0)).toBe(false);
    // 31 Mar 2027 at 19:00 UTC is already 1 Apr in India.
    expect(foundingOpen(Date.parse('2027-03-31T19:00:00Z'), 0)).toBe(false);
  });
});
