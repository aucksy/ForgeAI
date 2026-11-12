/**
 * T66 (#30, option A): which features each pack has (packages/theme/src/plans.ts), shared by the
 * member app and the admin app. The switch PLAN_GATE_ON ships OFF: nothing may change for any gym
 * until the owner says yes.
 */
import { describe, expect, it } from 'vitest';

import {
  AI_CREDITS,
  GYM_PACKS,
  PACK_PRICES,
  PACKS_FOR_SALE,
  PLAN_GATE_ON,
  PRO_FEATURES,
  hasFeature,
  lockedFeatures,
  packName,
  packOf,
  shownPack,
} from '@forgeai/theme';

import { linkFromJoin, linkWithPack } from '../../src/shop/gym';
import { gymShortcutPlan } from '../../src/shop/gymShortcut';

const LOGO = 'https://example.supabase.co/storage/v1/object/public/gym-logos/g1.png';

describe('the switch', () => {
  it('ships off', () => {
    expect(PLAN_GATE_ON).toBe(false);
  });

  it('switch off: every feature is on for every pack, even Starter', () => {
    for (const plan of [...GYM_PACKS, null, undefined, 'gold', '']) {
      for (const f of PRO_FEATURES) expect(hasFeature({ plan }, f)).toBe(true);
      expect(lockedFeatures({ plan })).toEqual([]);
    }
  });
});

describe('switch on', () => {
  it('Starter loses exactly the Pro list, and nothing else', () => {
    expect(lockedFeatures({ plan: 'starter' }, true)).toEqual([...PRO_FEATURES]);
    expect([...PRO_FEATURES].sort()).toEqual(['branding', 'challenge', 'shop', 'trainerPlans', 'workoutOffer', 'yourNumbers']);
  });

  it("Pro and the retired 'ai' pack keep everything", () => {
    for (const plan of ['pro', 'ai', ' PRO ']) expect(lockedFeatures({ plan }, true)).toEqual([]);
  });

  it('no pack, an unknown pack or no gym: everything stays on (today)', () => {
    for (const gym of [{ plan: null }, { plan: undefined }, {}, { plan: 'gold' }, { plan: 7 }, null, undefined]) {
      expect(lockedFeatures(gym, true)).toEqual([]);
    }
  });

  it('reads the pack words loosely and nothing else', () => {
    expect(packOf(' Starter ')).toBe('starter');
    expect(packOf('ai')).toBe('ai');
    expect(packOf('founding')).toBeNull();
    expect(packOf(null)).toBeNull();
  });
});

describe("F201: the retired 'ai' pack (replaced by the AI Assistant's credits on every plan)", () => {
  it('stays a valid word, for old rows, and is shown and named as Pro', () => {
    expect(GYM_PACKS).toContain('ai');
    expect(shownPack('ai')).toBe('pro');
    expect(shownPack(' Starter ')).toBe('starter');
    expect(shownPack('gold')).toBeNull();
    expect(packName('ai')).toBe('Pro');
    expect(packName('pro')).toBe('Pro');
    expect(packName('starter')).toBe('Starter');
    expect(packName(null)).toBe('');
  });

  it('is never priced or sold', () => {
    expect(Object.keys(PACK_PRICES).sort()).toEqual(['pro', 'starter']);
    expect([...PACKS_FOR_SALE]).toEqual(['starter', 'pro']);
  });

  it('the credits offer is the decided one (03-design section 3, R-470)', () => {
    expect(AI_CREDITS).toEqual({
      perTask: 1,
      perPlan: 3,
      trialFree: 20,
      monthlyFree: 0,
      yearlyFreeEachMonth: 100,
      packs: [
        { credits: 50, rupees: 149, popular: false },
        { credits: 150, rupees: 399, popular: true },
        { credits: 500, rupees: 999, popular: false },
      ],
    });
  });
});

describe('the member app keeps the pack on its saved gym link', () => {
  const join = { memberKey: 'k'.padEnd(48, 'x'), memberId: 'm1', gymId: 'g1', gymName: 'Iron Temple', joinCode: 'IRON01', name: 'Asha' };

  it('no pack from the server: no plan on the link (everything on)', () => {
    expect(linkFromJoin(join)?.plan).toBeUndefined();
  });

  it('keeps a known pack and drops an unknown one', () => {
    expect(linkFromJoin({ ...join, plan: 'starter' })?.plan).toBe('starter');
    expect(linkFromJoin({ ...join, plan: 'gold' })?.plan).toBeUndefined();
  });

  it('linkWithPack moves only when the pack changed', () => {
    const link = linkFromJoin(join)!;
    expect(linkWithPack(link, null)).toBe(link);
    const starter = linkWithPack(link, 'starter');
    expect(starter.plan).toBe('starter');
    expect(linkWithPack(starter, 'starter')).toBe(starter);
    expect(linkWithPack(starter, null).plan).toBeUndefined();
  });

  it('a Starter gym still gets its home-screen logo while the switch is off', () => {
    const plan = gymShortcutPlan({ gymName: 'Iron Temple', brand: { accent: '#F7D411', bg: '#0A0A0C', logoUrl: LOGO, heading: 'normal', updatedAt: '2026-10-01T00:00:00Z' }, plan: 'starter' });
    expect(plan?.logoUrl).toBe(LOGO);
  });
});
