/**
 * Audit C6 (gym side), the S4 findings fixed: C6-9 an invite link with extra characters is not a
 * gym code, C6-10 the bag badge counts what can be ordered, C6-12 an imported visit shows no
 * 1970 time, C6-13 an emoji-first gym name draws a real letter, C6-15 a gym that drops the member
 * takes its messages off the phone too, C6-16 joining from the check-in poster goes back to the
 * check-in, C6-11 a typed code shows the gym's name before joining.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mem = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (k: string) => mem.get(k) ?? null,
    setItem: async (k: string, v: string) => void mem.set(k, v),
    removeItem: async (k: string) => void mem.delete(k),
  },
}));
vi.mock('@/theme/logoPrefetch', () => ({ prefetchGymLogo: () => undefined }));
let previewAnswer: unknown = null;
const previews: string[] = [];
vi.mock('@/shop/gymApi', () => ({
  apiProducts: async () => ({ ok: false, error: { kind: 'BAD_KEY' } }),
  apiPreview: async (code: string) => {
    previews.push(code);
    return previewAnswer;
  },
}));

import { checkInFromRow, checkInTime, doneHeadline } from '@/shop/checkIn';
import { afterJoinPath, codeFromInvite, gymInitial, joinPathFromCheckIn, productsFromRows } from '@/shop/gym';
import { checkTypedCode, refreshProducts } from '@/shop/gymActions';
import { useGymShop } from '@/shop/gymStore';
import { inboxFor, useGymInbox } from '@/shop/inboxStore';
import { bagBadgeCount } from '@/shop/money';

describe('C6-9: an invite link is exactly a 6-character code', () => {
  it('extra characters are refused, like the check-in link', () => {
    expect(codeFromInvite('RAMS01X')).toBeNull();
    expect(codeFromInvite('rams01')).toBe('RAMS01');
    expect(codeFromInvite('RAMS-01')).toBeNull();
  });
});

describe('C6-10: the bag badge counts what can be ordered', () => {
  const LIST = productsFromRows([
    { product_id: 'whey', name: 'Whey', category: 'protein', price_p: 249900, options: [], stock: 2, active: true, art_kind: 'tub', art_tint: '#E8661F' },
    { product_id: 'hidden', name: 'Bar', category: 'protein', price_p: 9900, options: [], stock: 9, active: false, art_kind: 'barbox', art_tint: '#E8661F' },
  ]);
  const bag = [
    { productId: 'whey', optionId: null, qty: 5 },
    { productId: 'hidden', optionId: null, qty: 3 },
  ];
  it('the same number as the bag page', () => {
    expect(bagBadgeCount(bag, LIST)).toBe(2);
  });
  it('before any list arrives, every item added', () => {
    expect(bagBadgeCount(bag)).toBe(8);
    expect(bagBadgeCount(bag, [])).toBe(8);
  });
});

describe('C6-12: a visit with no real time shows no time', () => {
  it('0 and null are "no time"', () => {
    expect(checkInTime(0)).toBe('');
    expect(doneHeadline({ checkedInAt: 0 })).toBe("You're in ✓");
    const a = checkInFromRow({ ok: true, alreadyIn: true, gymName: 'G', memberName: 'Asha', day: '2026-10-16', planOk: true, checkedInAt: null });
    expect(a && a.ok && doneHeadline(a)).toBe("You're in ✓");
  });
});

describe('C6-13: the letter tile of a gym with no logo', () => {
  it('the first letter or digit, never half an emoji', () => {
    expect(gymInitial('💪 Iron Paradise')).toBe('I');
    expect(gymInitial(' ram’s fitness')).toBe('R');
    expect(gymInitial('24x7 Gym')).toBe('2');
    expect(gymInitial('💪')).toBe('💪');
    expect(gymInitial('')).toBe('');
  });
});

describe('C6-15: a gym that dropped the member takes its messages off the phone', () => {
  beforeEach(() => {
    useGymShop.getState().unlink(null);
    useGymInbox.getState().clear();
  });
  it('the inbox is emptied with the link', async () => {
    useGymShop.getState().setLink({ memberKey: 'k'.repeat(48), memberId: 'm1', gymId: 'g1', gymName: 'Iron', joinCode: 'IRON01', name: 'Asha' });
    useGymInbox.getState().setList('m1', [{ id: 'msg1', kind: 'notice', title: 'Closed Sunday', body: 'Diwali', createdAt: '2026-10-15T10:00:00Z', seen: false }] as never);
    expect(inboxFor(useGymInbox.getState(), 'm1')).toHaveLength(1);
    await refreshProducts();
    expect(useGymShop.getState().link).toBeNull();
    expect(useGymInbox.getState().messages).toEqual([]);
  });
});

describe('C6-16: joining from the check-in poster goes back to the check-in', () => {
  it('the poster sends the join screen a way back', () => {
    expect(joinPathFromCheckIn('RAMS01')).toBe('/j/RAMS01?then=checkin');
  });
  it('after the join: the check-in when asked, else the Shop', () => {
    expect(afterJoinPath('RAMS01', 'checkin')).toBe('/c/RAMS01');
    expect(afterJoinPath('RAMS01', ['checkin'])).toBe('/c/RAMS01');
    expect(afterJoinPath('RAMS01', undefined)).toBe('/workout');
    expect(afterJoinPath('RAMS01', 'elsewhere')).toBe('/workout');
  });
});

describe('C6-11: a typed code names its gym before joining', () => {
  beforeEach(() => {
    previews.length = 0;
  });
  it("the gym's name to confirm", async () => {
    previewAnswer = { ok: true, data: { gymName: "RAM'S FITNESS CLUB", joinCode: 'RAMS01', brand: null } };
    expect(await checkTypedCode('rams01')).toEqual({ kind: 'gym', gymName: "RAM'S FITNESS CLUB" });
    expect(previews).toEqual(['RAMS01']);
  });
  it('a code no gym has is said at once, before anything is sent', async () => {
    previewAnswer = { ok: true, data: null };
    const r = await checkTypedCode('RAMS02');
    expect(r).toEqual({ kind: 'words', words: "That code didn't match a gym. Check it with the front desk." });
  });
  it('the gym could not be asked: the join itself is tried (it says why if it fails too)', async () => {
    previewAnswer = { ok: false, error: { kind: 'offline' } };
    expect(await checkTypedCode('RAMS01')).toEqual({ kind: 'ask-failed' });
  });
  it('a short code is not looked up', async () => {
    const r = await checkTypedCode('RAM');
    expect(r.kind).toBe('words');
    expect(previews).toEqual([]);
  });
});
