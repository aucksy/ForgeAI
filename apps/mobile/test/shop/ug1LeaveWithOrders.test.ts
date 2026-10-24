/**
 * UAT U-G1 (S2): a member who left the gym with an open order lost it — the order stayed "Ordered"
 * at the gym with its stock held, and a rejoin is a new member who can never see or cancel it.
 *
 * Now, before Leave (and before an invite link's "Switch to <gym>"):
 *  - the question says how many orders are open and what they come to, and that leaving cancels
 *    them; an order already READY at the desk is the gym's to settle, and the question says so;
 *  - "Leave" cancels every order still `ordered` (member_cancel_order) BEFORE member_leave;
 *  - a cancel that fails (no internet, slow gym) never leaves: the member is told and can try again;
 *  - an order the gym made ready in the meantime stops the leave and says so.
 *
 * Runs the real gymActions + gymApi + leaveFlow against a fake gym server, and the app's own
 * "Are you sure?" sheet answered by the test.
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

/** The sheet's questions, in order, and the answers the test gives them (true = the red button). */
const asked: { title: string; body?: string; confirmLabel: string; cancelLabel?: string; notice?: boolean }[] = [];
let answers: (boolean | (() => boolean))[] = [];
vi.mock('@/components/ui', () => ({
  askConfirm: async (o: { title: string; body?: string; confirmLabel: string; cancelLabel?: string; notice?: boolean }) => {
    asked.push(o);
    const a = answers.shift() ?? false;
    return typeof a === 'function' ? a() : a;
  },
}));

interface Row {
  order_id: string;
  order_no: number;
  created_at: string;
  updated_at: string;
  lines: unknown[];
  total_p: number;
  status: string;
  cancelled_by: string | null;
  member_key: string;
}
const server = {
  orders: [] as Row[],
  /** Every call that reached the gym, by name. */
  calls: [] as string[],
  /** No signal: every call fails as "Network request failed". */
  offline: false,
  /** Only member_cancel_order fails with no signal. */
  cancelOffline: false,
  /** The desk moves this order to Ready the moment a cancel for it arrives. */
  readyOnCancel: null as string | null,
  left: [] as string[],
  /** U-G6: the new gym can't be reached (gym_preview fails with no signal). */
  previewOffline: false,
};
type Res = { data: unknown; error: unknown; status: number };
const offline: Res = { data: null, error: { message: 'TypeError: Network request failed' }, status: 0 };
const raise = (m: string): Res => ({ data: null, error: { message: m }, status: 400 });

function handle(fn: string, args: Record<string, unknown>): Res {
  server.calls.push(fn);
  if (server.offline) return offline;
  const key = args.p_key as string;
  if (server.left.includes(key)) return raise('BAD_KEY');
  switch (fn) {
    case 'member_orders':
      return { data: server.orders.filter((o) => o.member_key === key), error: null, status: 200 };
    case 'member_cancel_order': {
      if (server.cancelOffline) return offline;
      const o = server.orders.find((r) => r.order_id === args.p_order && r.member_key === key);
      if (!o) return raise('GONE');
      if (server.readyOnCancel === o.order_id) o.status = 'ready';
      if (o.status !== 'ordered') return raise('TOO_LATE');
      o.status = 'cancelled';
      o.cancelled_by = 'member';
      return { data: o, error: null, status: 200 };
    }
    case 'member_leave':
      server.left.push(key);
      return { data: null, error: null, status: 200 };
    case 'gym_preview':
      if (server.previewOffline) return offline;
      return { data: { gymName: "RAM'S FITNESS CLUB IMPACT", joinCode: 'RAMS01', brand: null }, error: null, status: 200 };
    case 'member_products':
      return { data: [], error: null, status: 200 };
    case 'member_join':
      return {
        data: { memberKey: 'new-key', memberId: 'm2', gymId: 'g2', gymName: "RAM'S FITNESS CLUB IMPACT", joinCode: 'RAMS01', name: args.p_name },
        error: null,
        status: 200,
      };
    default:
      return raise('other');
  }
}
vi.mock('@/cloud/client', () => ({
  getSupabase: () => ({
    rpc: (fn: string, args: Record<string, unknown>) => ({ abortSignal: async () => handle(fn, args) }),
  }),
}));

import { leaveQuestion, openOrdersText, switchQuestion } from '@/shop/gym';
import { cancelOpenOrdersBeforeLeave } from '@/shop/gymActions';
import { useGymShop } from '@/shop/gymStore';
import { askAndLeaveGym, askAndSwitchGym } from '@/shop/leaveFlow';
import type { GymOrder } from '@/shop/types';

const KEY = 'k'.repeat(48);
const LINK = { memberKey: KEY, memberId: 'm1', gymId: 'g1', gymName: 'MettleUp Test Gym', joinCode: 'FORGE1', name: 'Asha' };

function row(n: number, status: string, totalP = 45000): Row {
  return {
    order_id: `o${n}`,
    order_no: n,
    created_at: `2026-10-16T10:0${n}:00Z`,
    updated_at: `2026-10-16T10:0${n}:00Z`,
    lines: [{ productId: 'shaker', optionId: null, name: 'Shaker bottle 700 ml', qty: 1, unitPriceP: totalP }],
    total_p: totalP,
    status,
    cancelled_by: null,
    member_key: KEY,
  };
}
const order = (n: number, status: GymOrder['status'], totalP = 45000): GymOrder => ({
  id: `o${n}`,
  orderNo: n,
  createdAt: `2026-10-16T10:0${n}:00Z`,
  updatedAt: `2026-10-16T10:0${n}:00Z`,
  lines: [],
  totalP,
  status,
  cancelledBy: null,
});

function joinedWith(rows: Row[]) {
  server.orders = rows;
  useGymShop.getState().setLink(LINK);
}

beforeEach(() => {
  useGymShop.getState().unlink(null);
  mem.clear();
  asked.length = 0;
  answers = [];
  server.orders = [];
  server.calls = [];
  server.offline = false;
  server.cancelOffline = false;
  server.readyOnCancel = null;
  server.left = [];
  server.previewOffline = false;
});

describe('U-G1: the words before Leave', () => {
  it('nothing open: the question is as before, without the old "orders stay" promise', () => {
    const q = leaveQuestion({ gymName: 'MettleUp Test Gym', branded: false, orders: [order(1, 'collected'), order(2, 'cancelled')] });
    expect(q.title).toBe('Leave MettleUp Test Gym?');
    expect(q.confirmLabel).toBe('Leave gym');
    expect(q.cancelLabel).toBe('Stay');
    expect(q.body).toBe('Your workouts stay on this phone. You can join again with the code.');
    expect(leaveQuestion({ gymName: 'X', branded: true, orders: [] }).body).toMatch(/goes back to MettleUp's colours/);
  });

  it('one open order: how much, and that leaving cancels it', () => {
    expect(openOrdersText([order(1, 'ordered', 45000)], 'leave')).toBe('You have 1 open order (₹450). Leaving cancels it.');
    const q = leaveQuestion({ gymName: 'MettleUp Test Gym', branded: false, orders: [order(1, 'ordered', 45000)] });
    expect(q.body).toBe('You have 1 open order (₹450). Leaving cancels it. Your workouts stay on this phone. You can join again with the code.');
    expect(q.confirmLabel).toBe('Cancel order and leave');
  });

  it('two open orders: added up, "them"', () => {
    expect(openOrdersText([order(1, 'ordered', 45000), order(2, 'ordered', 39900)], 'leave')).toBe('You have 2 open orders (₹849). Leaving cancels them.');
    expect(leaveQuestion({ gymName: 'G', branded: false, orders: [order(1, 'ordered'), order(2, 'ordered')] }).confirmLabel).toBe('Cancel orders and leave');
  });

  it('a ready order: the desk has it, so the member is told to collect it or ask the desk', () => {
    expect(openOrdersText([order(1, 'ready')], 'leave')).toBe('1 order is ready at the desk. Collect it or ask the desk to cancel it before you leave.');
    expect(openOrdersText([order(1, 'ready'), order(2, 'ready')], 'leave')).toBe(
      '2 orders are ready at the desk. Collect them or ask the desk to cancel them before you leave.',
    );
    const q = leaveQuestion({ gymName: 'G', branded: false, orders: [order(1, 'ready')] });
    expect(q.confirmLabel).toBe('Leave anyway');
  });

  it('both kinds: both said, the cancel wins the button', () => {
    const q = leaveQuestion({ gymName: 'G', branded: false, orders: [order(2, 'ordered', 45000), order(1, 'ready')] });
    expect(q.body).toMatch(/^You have 1 open order \(₹450\)\. Leaving cancels it\. 1 order is ready at the desk\./);
    expect(q.confirmLabel).toBe('Cancel order and leave');
  });

  it('switching gyms: asked only when something is open, in "switch" words', () => {
    expect(switchQuestion({ fromGym: 'MettleUp Test Gym', toGym: 'RAMS', orders: [order(1, 'collected')] })).toBeNull();
    const q = switchQuestion({ fromGym: 'MettleUp Test Gym', toGym: 'RAMS', orders: [order(1, 'ordered', 45000), order(2, 'ready')] });
    expect(q?.title).toBe('Switch to RAMS?');
    expect(q?.body).toBe(
      "You have 1 open order at MettleUp Test Gym (₹450). Switching cancels it. 1 order is ready at MettleUp Test Gym's desk. Collect it or ask the desk to cancel it before you switch.",
    );
    expect(q?.confirmLabel).toBe('Cancel order and switch');
    expect(switchQuestion({ fromGym: 'A', toGym: 'B', orders: [order(1, 'ready')] })?.confirmLabel).toBe('Switch anyway');
  });

  it('never says the words a member must not read', () => {
    const all = [
      leaveQuestion({ gymName: 'G', branded: true, orders: [order(1, 'ordered'), order(2, 'ready')] }),
      switchQuestion({ fromGym: 'A', toGym: 'B', orders: [order(1, 'ordered'), order(2, 'ready')] }),
    ]
      .map((q) => `${q?.title} ${q?.body} ${q?.confirmLabel}`)
      .join(' ');
    expect(all).not.toMatch(/\bsession\b|\bPR\b|\bvolume\b/i);
  });
});

describe('U-G1: Leave cancels the open orders first', () => {
  it('Leave with an order still "ordered": cancelled on the server, THEN left', async () => {
    joinedWith([row(1, 'ordered')]);
    answers = [true];
    await askAndLeaveGym(false);
    expect(asked[0].title).toBe('Leave MettleUp Test Gym?');
    expect(asked[0].body).toMatch(/You have 1 open order \(₹450\)\. Leaving cancels it\./);
    expect(server.orders[0].status).toBe('cancelled');
    expect(server.orders[0].cancelled_by).toBe('member');
    const cancelAt = server.calls.indexOf('member_cancel_order');
    expect(cancelAt).toBeGreaterThanOrEqual(0);
    expect(server.calls.indexOf('member_leave')).toBeGreaterThan(cancelAt);
    expect(useGymShop.getState().link).toBeNull();
  });

  it('a ready order is left with the desk: never cancelled by the phone, the member still leaves', async () => {
    joinedWith([row(2, 'ordered'), row(1, 'ready')]);
    answers = [true];
    await askAndLeaveGym(false);
    expect(server.orders.find((o) => o.order_id === 'o2')?.status).toBe('cancelled');
    expect(server.orders.find((o) => o.order_id === 'o1')?.status).toBe('ready');
    expect(server.calls.filter((c) => c === 'member_cancel_order')).toHaveLength(1);
    expect(useGymShop.getState().link).toBeNull();
  });

  it('"Stay": nothing is cancelled and the member stays', async () => {
    joinedWith([row(1, 'ordered')]);
    answers = [false];
    await askAndLeaveGym(false);
    expect(server.orders[0].status).toBe('ordered');
    expect(server.calls).not.toContain('member_cancel_order');
    expect(server.calls).not.toContain('member_leave');
    expect(useGymShop.getState().link?.memberKey).toBe(KEY);
  });

  it('the question uses the gym\'s latest list, not an old copy on the phone', async () => {
    joinedWith([row(1, 'ordered')]);
    // The phone's copy is empty (never refreshed); the gym has the order.
    answers = [false];
    await askAndLeaveGym(false);
    expect(asked[0].body).toMatch(/1 open order/);
  });

  it('no internet: the order is NOT cancelled, the member is NOT left, and is told and offered a retry', async () => {
    joinedWith([row(1, 'ordered')]);
    useGymShop.getState().setOrders([order(1, 'ordered')]);
    server.offline = true;
    answers = [true, false]; // Leave → then "Not now" on the retry
    await askAndLeaveGym(false);
    expect(asked).toHaveLength(2);
    expect(asked[1].body).toMatch(/No internet/);
    expect(asked[1].body).toMatch(/still in the gym/);
    expect(asked[1].confirmLabel).toBe('Try again');
    expect(asked[1].cancelLabel).toBe('Not now');
    expect(server.orders[0].status).toBe('ordered');
    expect(server.left).toEqual([]);
    expect(useGymShop.getState().link?.memberKey).toBe(KEY);
    expect(mem.has('forgeai-gym-leave-pending')).toBe(false);
  });

  it('"Try again" once back online: cancelled, then left', async () => {
    joinedWith([row(1, 'ordered')]);
    useGymShop.getState().setOrders([order(1, 'ordered')]);
    server.cancelOffline = true;
    // Leave; then, at the retry question, the signal is back before the member taps "Try again".
    answers = [
      true,
      () => {
        server.cancelOffline = false;
        return true;
      },
    ];
    await askAndLeaveGym(false);
    expect(asked[1]?.confirmLabel).toBe('Try again');
    expect(server.orders[0].status).toBe('cancelled');
    expect(server.left).toEqual([KEY]);
    expect(useGymShop.getState().link).toBeNull();
  });

  it('the desk made it ready meanwhile: the leave stops and says so (collect it or ask the desk)', async () => {
    joinedWith([row(4, 'ordered')]);
    server.readyOnCancel = 'o4';
    answers = [true, true];
    await askAndLeaveGym(false);
    expect(asked[1].title).toBe('Order 4 is ready');
    expect(asked[1].body).toMatch(/ready at the desk/);
    expect(asked[1].body).toMatch(/Collect it or ask the desk to cancel it/);
    expect(asked[1].notice).toBe(true);
    expect(server.left).toEqual([]);
    expect(useGymShop.getState().link?.memberKey).toBe(KEY);
    expect(useGymShop.getState().orders[0].status).toBe('ready');
  });

  it('an order the gym already has no more (GONE) or already cancelled does not stop the leave', async () => {
    joinedWith([row(1, 'cancelled')]);
    useGymShop.getState().setOrders([order(1, 'ordered'), order(9, 'ordered')]);
    expect(await cancelOpenOrdersBeforeLeave('leave')).toEqual({ kind: 'done' });
  });

  it('an order whose answer was lost, with no signal to check it: the member is told, not left', async () => {
    joinedWith([]);
    useGymShop.getState().setPendingOrder({ id: 'p1', lines: 'shaker::::1', at: Date.now() });
    server.offline = true;
    const r = await cancelOpenOrdersBeforeLeave('leave');
    expect(r.kind).toBe('retry');
    expect(r.kind === 'retry' && r.words).toMatch(/No internet/);
    expect(r.kind === 'retry' && r.words).toMatch(/last order/);
  });
});

describe('U-G1: switching gyms from an invite link follows the same rule', () => {
  it('open order: asked, cancelled at the old gym, then the new gym is joined and the old one let go', async () => {
    joinedWith([row(1, 'ordered')]);
    answers = [true];
    const r = await askAndSwitchGym('RAMS01', 'Asha', "RAM'S FITNESS CLUB IMPACT");
    expect(r).toBeNull();
    expect(asked[0].title).toBe("Switch to RAM'S FITNESS CLUB IMPACT?");
    expect(server.orders[0].status).toBe('cancelled');
    expect(server.calls.indexOf('member_cancel_order')).toBeLessThan(server.calls.indexOf('member_join'));
    expect(useGymShop.getState().link?.gymName).toBe("RAM'S FITNESS CLUB IMPACT");
    await vi.waitFor(() => expect(server.left).toEqual([KEY]));
  });

  it('nothing open: no extra question, the switch is as before', async () => {
    joinedWith([row(1, 'collected')]);
    const r = await askAndSwitchGym('RAMS01', 'Asha', "RAM'S FITNESS CLUB IMPACT");
    expect(r).toBeNull();
    expect(asked).toHaveLength(0);
    // U-G6: with nothing to cancel the new gym is not asked twice; the join is the check.
    expect(server.calls).not.toContain('gym_preview');
    expect(useGymShop.getState().link?.gymName).toBe("RAM'S FITNESS CLUB IMPACT");
  });

  it('"Stay": no cancel, no join', async () => {
    joinedWith([row(1, 'ordered')]);
    answers = [false];
    expect(await askAndSwitchGym('RAMS01', 'Asha', 'RAMS')).toBe('stayed');
    expect(server.calls).not.toContain('member_cancel_order');
    expect(server.calls).not.toContain('member_join');
    expect(useGymShop.getState().link?.gymName).toBe('MettleUp Test Gym');
  });

  it('U-G6: the new gym can\'t be reached: NOTHING is cancelled, not switched, told why', async () => {
    joinedWith([row(1, 'ordered')]);
    answers = [true];
    server.previewOffline = true;
    const r = await askAndSwitchGym('RAMS01', 'Asha', "RAM'S FITNESS CLUB IMPACT");
    expect(r).toMatch(/Nothing was cancelled: you are still in MettleUp Test Gym\./);
    expect(server.calls.indexOf('gym_preview')).toBeGreaterThan(-1);
    expect(server.calls).not.toContain('member_cancel_order');
    expect(server.calls).not.toContain('member_join');
    expect(server.orders[0].status).toBe('ordered');
    expect(useGymShop.getState().link?.gymName).toBe('MettleUp Test Gym');
  });

  it('U-G6: the new gym is asked BEFORE the old gym\'s orders are cancelled', async () => {
    joinedWith([row(1, 'ordered')]);
    answers = [true];
    await askAndSwitchGym('RAMS01', 'Asha', "RAM'S FITNESS CLUB IMPACT");
    expect(server.calls.indexOf('gym_preview')).toBeLessThan(server.calls.indexOf('member_cancel_order'));
  });

  it('no internet for the cancel: not switched, told, offered a retry', async () => {
    joinedWith([row(1, 'ordered')]);
    useGymShop.getState().setOrders([order(1, 'ordered')]);
    server.cancelOffline = true;
    answers = [true, false];
    expect(await askAndSwitchGym('RAMS01', 'Asha', 'RAMS')).toBe('stayed');
    expect(asked[1].body).toMatch(/No internet/);
    expect(asked[1].body).toMatch(/haven't switched gyms/);
    expect(server.calls).not.toContain('member_join');
    expect(useGymShop.getState().link?.gymName).toBe('MettleUp Test Gym');
  });
});
