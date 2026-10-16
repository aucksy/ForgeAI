/**
 * Audit C6-1 (S2): an order's answer lost on a patchy network must never become a second order.
 * The app sends a client-made order id with every Place order (member_place_order's p_order_id,
 * migration 0020). The same bag sent again keeps the same id, so the gym returns the order it
 * already has instead of writing another one. Runs the real gymActions + gymApi against a fake
 * gym server (in place of the Supabase client) that can "lose the answer after the write".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mem = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (k: string) => mem.get(k) ?? null,
    setItem: async (k: string, v: string) => void mem.set(k, v),
    removeItem: async (k: string) => void mem.delete(k),
  },
}));
vi.mock('@/theme/logoPrefetch', () => ({ prefetchGymLogo: () => undefined }));

interface Row {
  order_id: string;
  order_no: number;
  created_at: string;
  updated_at: string;
  lines: unknown[];
  total_p: number;
  status: string;
  cancelled_by: null;
  client_order_id: string | null;
}
const server = {
  orders: [] as Row[],
  /** Answers lost after the write (the phone sees "Network request failed"). */
  dropAnswers: 0,
  /** member_orders cannot be reached either (still in the basement). */
  ordersDown: false,
  /** A server from before 0020: it does not know p_order_id. */
  old: false,
  placeArgs: [] as Record<string, unknown>[],
};
type Res = { data: unknown; error: unknown; status: number };
const offline: Res = { data: null, error: { message: 'TypeError: Network request failed' }, status: 0 };

function handle(fn: string, args: Record<string, unknown>): Res {
  if (fn === 'member_orders') return server.ordersDown ? offline : { data: server.orders, error: null, status: 200 };
  if (fn !== 'member_place_order') return { data: null, error: { message: 'other' }, status: 400 };
  server.placeArgs.push(args);
  if (server.old && 'p_order_id' in args) {
    return { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.member_place_order(p_key, p_lines, p_order_id) in the schema cache' }, status: 404 };
  }
  const id = (args.p_order_id as string | undefined) ?? null;
  const seen = id ? server.orders.find((o) => o.client_order_id === id) : undefined;
  let row = seen;
  if (!row) {
    const n = server.orders.length + 1;
    const lines = (args.p_lines as { productId: string; optionId: string | null; qty: number }[]).map((l) => ({ ...l, name: 'Shaker bottle 700 ml', unitPriceP: 39900 }));
    row = { order_id: `o${n}`, order_no: n, created_at: `2026-10-16T10:0${n}:00Z`, updated_at: `2026-10-16T10:0${n}:00Z`, lines, total_p: 39900 * lines.reduce((s, l) => s + l.qty, 0), status: 'ordered', cancelled_by: null, client_order_id: id };
    server.orders.push(row);
  }
  if (server.dropAnswers > 0) {
    server.dropAnswers -= 1;
    return offline;
  }
  return { data: row, error: null, status: 200 };
}
vi.mock('@/cloud/client', () => ({
  getSupabase: () => ({
    rpc: (fn: string, args: Record<string, unknown>) => ({ abortSignal: async () => handle(fn, args) }),
  }),
}));

import { productsFromRows } from '@/shop/gym';
import { placeGymOrder, refreshOrders } from '@/shop/gymActions';
import { useGymShop } from '@/shop/gymStore';

const LINK = { memberKey: 'k'.repeat(48), memberId: 'm1', gymId: 'g1', gymName: 'Iron Temple Fitness', joinCode: 'IRON01', name: 'Asha' };
const LIST = productsFromRows([
  { product_id: 'shaker', name: 'Shaker bottle 700 ml', category: 'gear', price_p: 39900, options: [], stock: 9, active: true, art_kind: 'shaker', art_tint: '#E8661F' },
]);

function joinedWithBag(qty: number) {
  useGymShop.getState().setLink(LINK);
  useGymShop.getState().setProducts(LIST, '2026-10-16T09:00:00Z');
  useGymShop.getState().add('shaker', null, qty);
}

describe('C6-1: one tap, one order — even when the answer is lost', () => {
  beforeEach(() => {
    useGymShop.getState().unlink(null);
    mem.clear();
    server.orders = [];
    server.dropAnswers = 0;
    server.ordersDown = false;
    server.old = false;
    server.placeArgs = [];
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('a retry after a dropped answer returns the same order, not a second one', async () => {
    joinedWithBag(1);
    server.dropAnswers = 1;
    server.ordersDown = true;
    const first = await placeGymOrder();
    expect(first.ok).toBe(false);
    expect(server.orders).toHaveLength(1); // the gym did write it
    expect(useGymShop.getState().bag).toHaveLength(1); // the phone could not know: bag kept

    server.ordersDown = false;
    const again = await placeGymOrder();
    expect(again.ok).toBe(true);
    expect(server.orders).toHaveLength(1);
    expect(again.ok && again.order.orderNo).toBe(1);
    expect(useGymShop.getState().bag).toEqual([]);
    const ids = server.placeArgs.map((a) => a.p_order_id);
    expect(typeof ids[0]).toBe('string');
    expect(ids[1]).toBe(ids[0]);
  });

  it('the id survives the app being closed between the two taps', async () => {
    joinedWithBag(1);
    server.dropAnswers = 1;
    server.ordersDown = true;
    await placeGymOrder();
    await new Promise((r) => setTimeout(r, 0));
    // A cold start: the memory is gone, the saved copy is read back.
    const saved = mem.get('forgeai-gym-shop') ?? '';
    expect(JSON.parse(saved).state.pendingOrder?.id).toBe(server.placeArgs[0].p_order_id);
    useGymShop.setState({ pendingOrder: null } as never);
    mem.set('forgeai-gym-shop', saved);
    await useGymShop.persist.rehydrate();
    server.ordersDown = false;
    const again = await placeGymOrder();
    expect(again.ok).toBe(true);
    expect(server.orders).toHaveLength(1);
  });

  it('a placed order lets the next bag be a new order', async () => {
    joinedWithBag(1);
    expect((await placeGymOrder()).ok).toBe(true);
    useGymShop.getState().add('shaker', null, 1);
    expect((await placeGymOrder()).ok).toBe(true);
    expect(server.orders).toHaveLength(2);
    expect(server.placeArgs[1].p_order_id).not.toBe(server.placeArgs[0].p_order_id);
  });

  it('a bag changed after a failed try is a new order (never mistaken for the old one)', async () => {
    joinedWithBag(1);
    server.dropAnswers = 1;
    server.ordersDown = true;
    await placeGymOrder();
    useGymShop.getState().add('shaker', null, 1);
    server.ordersDown = false;
    await placeGymOrder();
    expect(server.placeArgs[1].p_order_id).not.toBe(server.placeArgs[0].p_order_id);
  });

  it('a dropped answer whose order already shows in My orders is said as placed', async () => {
    joinedWithBag(2);
    server.dropAnswers = 1;
    const r = await placeGymOrder();
    expect(r.ok).toBe(true);
    expect(server.orders).toHaveLength(1);
    expect(useGymShop.getState().bag).toEqual([]);
  });

  // Review of wave 4a (BLOCKER): an id matched on the items alone, kept for ever, handed a week-old
  // collected order back for a new order of the same item.
  it('a saved id older than 15 minutes is a new order', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-16T10:00:00Z'));
    joinedWithBag(1);
    server.dropAnswers = 1;
    server.ordersDown = true;
    await placeGymOrder();
    vi.setSystemTime(new Date('2026-10-16T10:16:00Z'));
    server.ordersDown = false;
    await placeGymOrder();
    expect(server.placeArgs[1].p_order_id).not.toBe(server.placeArgs[0].p_order_id);
  });

  it('My orders showing the order lets the saved id go', async () => {
    joinedWithBag(1);
    server.dropAnswers = 1;
    server.ordersDown = true;
    await placeGymOrder();
    expect(useGymShop.getState().pendingOrder).not.toBeNull();
    server.ordersDown = false;
    await refreshOrders();
    expect(useGymShop.getState().pendingOrder).toBeNull();
    // The member collects that order, then orders the same item again: a new order.
    server.orders[0].status = 'collected';
    await placeGymOrder();
    expect(server.placeArgs[1].p_order_id).not.toBe(server.placeArgs[0].p_order_id);
    expect(server.orders).toHaveLength(2);
  });

  it('a server from before the fix still takes the order (sent again without the id)', async () => {
    server.old = true;
    joinedWithBag(1);
    const r = await placeGymOrder();
    expect(r.ok).toBe(true);
    expect(server.orders).toHaveLength(1);
    expect(server.placeArgs.at(-1)).not.toHaveProperty('p_order_id');
  });
});
