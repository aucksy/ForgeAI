/**
 * Audit C6 (gym side), the S3 findings: C6-3 a new price said with the order, C6-4 an old list
 * says how old it is, C6-5 a pasted invite link fills the code box, C6-6 a Join retry is the same
 * join (one member on the gym's list), C6-7 a link opened before setup survives the app closing.
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

const joins: { code: string; name: string; joinId: string | undefined }[] = [];
let joinAnswer: unknown = { ok: false, error: { kind: 'timeout' } };
let placeAnswer: unknown = null;
vi.mock('@/shop/gymApi', () => ({
  apiJoin: async (code: string, name: string, joinId?: string) => {
    joins.push({ code, name, joinId });
    return joinAnswer;
  },
  apiPlaceOrder: async () => placeAnswer,
  apiProducts: async () => ({ ok: false, error: { kind: 'offline' } }),
  apiOrders: async () => ({ ok: false, error: { kind: 'offline' } }),
  apiLeaveQuietly: async () => true,
  apiMe: async () => ({ ok: false, error: { kind: 'offline' } }),
}));

import { joinCodeFromTyped, linkFromJoin, listAgeText, orderPlacedText, productsFromRows } from '@/shop/gym';
import { joinGym, placeGymOrder } from '@/shop/gymActions';
import { useGymShop } from '@/shop/gymStore';
import { restorePendingLinks, setPendingCheckIn, setPendingInvite, takePendingCheckIn, takePendingInvite } from '@/shop/pendingInvite';

const LINK = { memberKey: 'k'.repeat(48), memberId: 'm1', gymId: 'g1', gymName: 'Iron Temple Fitness', joinCode: 'IRON01', name: 'Asha' };
const LIST = productsFromRows([
  { product_id: 'whey', name: 'Whey 1 kg', category: 'protein', price_p: 249900, options: [], stock: 5, active: true, art_kind: 'tub', art_tint: '#E8661F' },
]);

describe('C6-3: a new price is said with the order', () => {
  beforeEach(() => {
    useGymShop.getState().unlink(null);
    mem.clear();
  });

  it('the flash names the new total when the gym charged more than the bag showed', async () => {
    useGymShop.getState().setLink(LINK);
    useGymShop.getState().setProducts(LIST, '2026-10-16T09:00:00Z');
    useGymShop.getState().add('whey', null, 1);
    placeAnswer = {
      ok: true,
      data: { id: 'o1', orderNo: 1, createdAt: '2026-10-16T10:00:00Z', updatedAt: '2026-10-16T10:00:00Z', lines: [{ productId: 'whey', optionId: null, name: 'Whey 1 kg', qty: 1, unitPriceP: 279900 }], totalP: 279900, status: 'ordered', cancelledBy: null },
    };
    const r = await placeGymOrder();
    expect(r.ok).toBe(true);
    const flash = useGymShop.getState().flash?.text ?? '';
    expect(flash).toMatch(/price changed/);
    expect(flash).toMatch(/₹2,799/);
  });

  it('the same price says nothing more', () => {
    expect(orderPlacedText(1)).toBe('Order 1 placed. Pay at the desk when you collect it.');
    expect(orderPlacedText(1, null)).toBe('Order 1 placed. Pay at the desk when you collect it.');
    expect(orderPlacedText(4, 279900)).toBe('Order 4 placed. The price changed since your bag — total ₹2,799. Pay at the desk when you collect it.');
  });
});

describe('C6-4: an old list says how old it is', () => {
  const now = new Date(2026, 9, 16, 19, 30).getTime(); // Fri 16 Oct, 7:30 pm (phone time)
  it('nothing for a fresh list or none', () => {
    expect(listAgeText(null, now)).toBeNull();
    expect(listAgeText(new Date(now - 5 * 60000).toISOString(), now)).toBeNull();
  });
  it('the time today, the day before that', () => {
    expect(listAgeText(new Date(2026, 9, 16, 7, 10).toISOString(), now)).toBe('Prices and stock as of 7:10 am today.');
    expect(listAgeText(new Date(2026, 9, 13, 19, 10).toISOString(), now)).toBe('Prices and stock as of Tue 13 Oct, 7:10 pm.');
  });
  it('a damaged time says nothing', () => {
    expect(listAgeText('junk', now)).toBeNull();
  });
});

describe('C6-5: a pasted invite link fills the code box', () => {
  it('takes the code from the link, alone or inside a WhatsApp message', () => {
    expect(joinCodeFromTyped('https://forgeai.aakashpahuja.in/j/RAMS01')).toBe('RAMS01');
    expect(joinCodeFromTyped("Join RAM'S on ForgeAI: https://forgeai.aakashpahuja.in/j/rams01 see you")).toBe('RAMS01');
  });
  it('a typed code is cleaned as before', () => {
    expect(joinCodeFromTyped('rams 01')).toBe('RAMS01');
    expect(joinCodeFromTyped('IRON01X')).toBe('IRON01');
  });
});

describe('C6-6: a Join retry is the same join', () => {
  beforeEach(() => {
    useGymShop.getState().unlink(null);
    joins.length = 0;
    joinAnswer = { ok: false, error: { kind: 'timeout' } };
  });

  it('the retry after "the gym didn\'t answer" sends the same join id; a new join a new one', async () => {
    expect(await joinGym('RAMS01', 'Rahul')).toMatch(/didn't answer/);
    joinAnswer = { ok: true, data: linkFromJoin({ ...LINK, gymName: "RAM'S", joinCode: 'RAMS01' }) };
    expect(await joinGym('rams01', 'Rahul')).toBeNull();
    expect(typeof joins[0].joinId).toBe('string');
    expect(joins[1].joinId).toBe(joins[0].joinId);
    useGymShop.getState().unlink(null);
    await joinGym('RAMS01', 'Rahul');
    expect(joins[2].joinId).not.toBe(joins[0].joinId);
  });

  it('another code is another join', async () => {
    await joinGym('RAMS01', 'Rahul');
    await joinGym('IRON01', 'Rahul');
    expect(joins[1].joinId).not.toBe(joins[0].joinId);
  });
});

describe('C6-7: a link opened before setup survives the app closing', () => {
  beforeEach(() => {
    mem.clear();
    takePendingInvite();
    takePendingCheckIn();
  });

  it('kept on the phone and handed out after a restart, once', async () => {
    setPendingInvite('RAMS01');
    setPendingCheckIn('RAMS01');
    await new Promise((r) => setTimeout(r, 0));
    const saved = mem.get('forgeai-pending-link') ?? '';
    // The app is closed: memory is gone (emptied here by taking; the saved copy is put back as a
    // closed app left it).
    takePendingInvite();
    takePendingCheckIn();
    await new Promise((r) => setTimeout(r, 0));
    mem.set('forgeai-pending-link', saved);
    await restorePendingLinks();
    expect(takePendingInvite()).toBe('RAMS01');
    expect(takePendingCheckIn()).toBe('RAMS01');
    await new Promise((r) => setTimeout(r, 0));
    await restorePendingLinks();
    expect(takePendingInvite()).toBeNull();
  });

  it('saved when set', async () => {
    setPendingInvite('RAMS01');
    await new Promise((r) => setTimeout(r, 0));
    expect(JSON.parse(mem.get('forgeai-pending-link') ?? '{}').invite).toBe('RAMS01');
  });

  it('a link older than 7 days is dropped', async () => {
    mem.set('forgeai-pending-link', JSON.stringify({ invite: 'RAMS01', at: Date.now() - 8 * 86400000 }));
    await restorePendingLinks();
    expect(takePendingInvite()).toBeNull();
  });
});
