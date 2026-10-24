/**
 * Shop state for the whole panel: which cloud gym this browser runs, and its live
 * order list.
 *
 * Orders are polled here, once, rather than inside the Shop screen, because three
 * places need them at the same time — the nav badge, the Today card and the
 * "new order" toast — and the toast must fire wherever the owner happens to be.
 * Polling stops while the tab is hidden and catches up the moment it is shown.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { useAuth } from '../auth/AuthProvider';
import { useCrm } from '../store';
import { Toast } from '../ui/kit';
import { replace } from '../ui/router';
import * as api from './api';
import { clearCloudGym, readCloudGym, writeCloudGym, type CloudGym } from './cloudGym';
import {
  arrivalMessage,
  errorCode,
  errorWords,
  MutationGate,
  newArrivals,
  type Order,
  type OrderStatus,
} from './logic';

export const DEMO_GYM_NAME = 'Iron Temple Fitness';
const ORDER_POLL_MS = 5_000;

interface ShopContextValue {
  /** The cloud gym, or null when this browser has none (a local-only gym). */
  cloud: CloudGym | null;
  /** False while the cloud is unreachable; the cached code and name still show. */
  online: boolean;
  /** A one-off message for the welcome screen (e.g. the demo gym was closed). */
  notice: string | null;

  /** Welcome's "Start demo": a cloud gym plus the sample members. Throws plain words. */
  startDemo: () => Promise<void>;
  /** Give a gym that was set up locally its own cloud shop (and join code). */
  connectShop: () => Promise<void>;
  /** DEMO GYMS ONLY: forget the cloud gym and empty this browser, back to Welcome. */
  startOver: () => Promise<void>;
  /** Forget the cloud shop only; the CRM's own records are untouched. */
  disconnectShop: () => void;
  /** Rename the cloud gym too, when the owner renames theirs in Settings. */
  renameCloudGym: (name: string) => Promise<void>;
  /** Call when any cloud call fails: a dead key closes the gym. Returns plain words. */
  handleError: (err: unknown) => string;

  orders: Order[];
  ordersLoaded: boolean;
  ordersError: string | null;
  refreshOrders: () => Promise<void>;
  setOrderStatus: (orderId: string, status: OrderStatus) => Promise<void>;
  /** Orders waiting for the desk (status `ordered`). */
  newCount: number;
  /** Ticks every 30 s so "2 min ago" stays true. */
  now: number;
  flash: (message: string) => void;
}

const ShopContext = createContext<ShopContextValue | null>(null);

export function useShop(): ShopContextValue {
  const ctx = useContext(ShopContext);
  if (!ctx) throw new Error('useShop must be used inside <ShopProvider>');
  return ctx;
}

/**
 * Run `fn` now, then every `ms` while the page is visible, and again whenever the
 * window regains focus. Nothing runs while `enabled` is false.
 */
export function usePoll(fn: () => void | Promise<void>, ms: number, enabled: boolean): void {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!enabled) return;
    let timer: number | undefined;
    const tick = () => void ref.current();
    const start = () => {
      window.clearInterval(timer);
      timer = window.setInterval(() => {
        if (document.visibilityState === 'visible') tick();
      }, ms);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        tick();
        start();
      }
    };
    tick();
    start();
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', tick);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [ms, enabled]);
}

/** Identity of an order list — redraw only when something the owner can see changed. */
function signature(orders: readonly Order[]): string {
  return orders.map((o) => `${o.orderId}:${o.status}:${o.updatedAt}`).join('|');
}

export function ShopProvider({ children }: { children: ReactNode }) {
  const { snapshot, loadDemoGym, updateGym, startEmptyGym } = useCrm();
  const { lost } = useAuth();
  const [cloud, setCloud] = useState<CloudGym | null>(() => readCloudGym());
  const [online, setOnline] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const seen = useRef<Set<string> | null>(null);
  const sig = useRef('');
  // A poll already on its way must not repaint over a tap's reply.
  const gate = useRef(new MutationGate()).current;

  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const flash = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 5000);
  }, []);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const resetOrders = useCallback(() => {
    setOrders([]);
    setOrdersLoaded(false);
    setOrdersError(null);
    seen.current = null;
    sig.current = '';
  }, []);

  /** The key no longer opens a gym. Drop it; a demo CRM goes with it. */
  const keyLost = useCallback(
    async (gym: CloudGym) => {
      // A signed-in person's key: the whole panel goes back to the sign-in door.
      if (gym.person) {
        lost();
        return;
      }
      clearCloudGym();
      setCloud(null);
      resetOrders();
      if (gym.demo) {
        setNotice('That demo gym is no longer available. Start a new one below.');
        await startEmptyGym('My Gym');
        replace('/');
      }
    },
    [resetOrders, startEmptyGym, lost],
  );

  const cloudRef = useRef(cloud);
  cloudRef.current = cloud;

  const handleError = useCallback(
    (err: unknown): string => {
      const code = errorCode(err);
      if (code === 'BAD_KEY' && cloudRef.current) void keyLost(cloudRef.current);
      if (code === 'OFFLINE') setOnline(false);
      return errorWords(err);
    },
    [keyLost],
  );

  // On open: check the stored key still opens its gym, and pick up a rename.
  const checkedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!cloud || checkedFor.current === cloud.ownerKey) return;
    checkedFor.current = cloud.ownerKey;
    let cancelled = false;
    api
      .ownerGym(cloud.ownerKey)
      .then((info) => {
        if (cancelled) return;
        setOnline(true);
        if (info.name !== cloud.name || info.joinCode !== cloud.joinCode) {
          const next = { ...cloud, name: info.name, joinCode: info.joinCode };
          writeCloudGym(next);
          setCloud(next);
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        handleError(e);
      });
    return () => {
      cancelled = true;
    };
  }, [cloud, handleError]);

  const refreshOrders = useCallback(async () => {
    const gym = cloudRef.current;
    if (!gym) return;
    const stamp = gate.stamp();
    try {
      const list = await api.listOrders(gym.ownerKey);
      if (cloudRef.current?.ownerKey !== gym.ownerKey) return;
      // A status change started or finished while this was out: its reply is
      // newer than this list. The next poll picks up anything else.
      if (!gate.fresh(stamp)) return;
      setOnline(true);
      setOrdersError(null);
      setOrdersLoaded(true);
      const arrivals = newArrivals(seen.current, list);
      seen.current = new Set(list.map((o) => o.orderId));
      const msg = arrivalMessage(arrivals);
      if (msg) flash(msg);
      const s = signature(list);
      if (s !== sig.current) {
        sig.current = s;
        setOrders(list);
      }
    } catch (e) {
      setOrdersError(handleError(e));
    }
  }, [flash, handleError, gate]);

  usePoll(refreshOrders, ORDER_POLL_MS, cloud !== null);

  const setOrderStatus = useCallback(
    async (orderId: string, status: OrderStatus) => {
      const gym = cloudRef.current;
      if (!gym) throw new Error('The shop is not turned on.');
      let failure: unknown = null;
      await gate.run(async () => {
        try {
          const updated = await api.setOrderStatus(gym.ownerKey, orderId, status);
          setOrders((prev) => {
            const next = prev.map((o) => (o.orderId === orderId ? updated : o));
            sig.current = signature(next);
            return next;
          });
        } catch (e) {
          failure = e;
        }
      });
      if (failure !== null) {
        const words = handleError(failure);
        // The order moved elsewhere (or vanished): show the truth, then say why.
        // Read only now, after the gate has closed, so the read is not dropped.
        void refreshOrders();
        throw new Error(words);
      }
    },
    [handleError, refreshOrders, gate],
  );

  const adopt = useCallback((gym: CloudGym) => {
    writeCloudGym(gym);
    checkedFor.current = gym.ownerKey;
    setCloud(gym);
    setOnline(true);
    setNotice(null);
  }, []);

  const startDemo = useCallback(async () => {
    let made: Awaited<ReturnType<typeof api.startDemoGym>>;
    try {
      made = await api.startDemoGym(DEMO_GYM_NAME);
    } catch (e) {
      const code = errorCode(e);
      throw new Error(
        code === 'OFFLINE' || code === 'UNKNOWN'
          ? 'Can’t reach MettleUp. Check the internet and try again.'
          : errorWords(e),
      );
    }
    resetOrders();
    adopt({ gymId: made.gymId, ownerKey: made.ownerKey, joinCode: made.joinCode, name: made.name, demo: true });
    await loadDemoGym();
    await updateGym({ name: made.name, joinCode: made.joinCode });
    // Open on Today, whatever page the last gym was left on.
    replace('/');
  }, [adopt, loadDemoGym, resetOrders, updateGym]);

  const connectShop = useCallback(async () => {
    let made: Awaited<ReturnType<typeof api.startDemoGym>>;
    try {
      made = await api.startDemoGym(snapshot.gym.name);
    } catch (e) {
      throw new Error(errorWords(e));
    }
    resetOrders();
    adopt({ gymId: made.gymId, ownerKey: made.ownerKey, joinCode: made.joinCode, name: made.name, demo: false });
    await updateGym({ joinCode: made.joinCode });
  }, [adopt, resetOrders, snapshot.gym.name, updateGym]);

  const startOver = useCallback(async () => {
    // Only ever for a demo gym. A real gym that turned the shop on keeps its own
    // members and payments in this browser; erasing them here would lose real
    // records, so it gets `disconnectShop` instead.
    if (!cloudRef.current?.demo) throw new Error('Only a demo gym can be started over.');
    clearCloudGym();
    setCloud(null);
    resetOrders();
    setNotice(null);
    await startEmptyGym('My Gym');
    replace('/');
  }, [resetOrders, startEmptyGym]);

  const disconnectShop = useCallback(() => {
    // Forgets the cloud key only. Members, plans, payments and visits stay.
    clearCloudGym();
    setCloud(null);
    resetOrders();
  }, [resetOrders]);

  const renameCloudGym = useCallback(
    async (name: string) => {
      const gym = cloudRef.current;
      if (!gym || !name.trim() || name.trim() === gym.name) return;
      try {
        const info = await api.renameGym(gym.ownerKey, name.trim());
        const next = { ...gym, name: info.name, joinCode: info.joinCode };
        writeCloudGym(next);
        setCloud(next);
      } catch (e) {
        throw new Error(handleError(e));
      }
    },
    [handleError],
  );

  const newCount = useMemo(() => orders.filter((o) => o.status === 'ordered').length, [orders]);

  const value = useMemo<ShopContextValue>(
    () => ({
      cloud,
      online,
      notice,
      startDemo,
      connectShop,
      startOver,
      disconnectShop,
      renameCloudGym,
      handleError,
      orders,
      ordersLoaded,
      ordersError,
      refreshOrders,
      setOrderStatus,
      newCount,
      now,
      flash,
    }),
    [
      cloud,
      online,
      notice,
      startDemo,
      connectShop,
      startOver,
      disconnectShop,
      renameCloudGym,
      handleError,
      orders,
      ordersLoaded,
      ordersError,
      refreshOrders,
      setOrderStatus,
      newCount,
      now,
      flash,
    ],
  );

  return (
    <ShopContext.Provider value={value}>
      {children}
      {toast && <Toast message={toast} />}
    </ShopContext.Provider>
  );
}
