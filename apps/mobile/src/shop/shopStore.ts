/**
 * The member's bag and demo orders, kept on the phone (S1). AsyncStorage through zustand's
 * persist, like the tracker preferences — not the workout database: nothing here is training
 * history, and the real orders (S2) will live on the gym's server.
 *
 * "Erase all data" resets this store (onboarding/eraseDevice.ts, step "shop").
 * The rules themselves are pure, in money.ts; this file only keeps the result.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { uuid } from '@/lib/uuid';

import { getCatalog } from './catalog';
import { addToBag, buildOrder, cancelOrderIn, leftAfterOrder, removeLine, setLineQty } from './money';
import type { BagLine, Order } from './types';

export interface ShopState {
  bag: BagLine[];
  /** Newest first. */
  orders: Order[];
  /** Returns how many actually went in (0 when sold out or the line is full). */
  add: (productId: string, optionId: string | null, qty: number) => number;
  setQty: (key: string, qty: number) => void;
  remove: (key: string) => void;
  /** Turns the bag into a demo order; returns it, or null when nothing could be ordered. */
  placeOrder: () => Order | null;
  cancelOrder: (id: string) => void;
}

/** Keep only well-formed rows from storage (an older or damaged blob must not crash the Shop). PURE. */
export function cleanShopBlob(raw: unknown): { bag: BagLine[]; orders: Order[] } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as { bag?: unknown; orders?: unknown };
  const bag = Array.isArray(r.bag)
    ? r.bag.filter(
        (l): l is BagLine =>
          !!l && typeof l === 'object' && typeof (l as BagLine).productId === 'string' && (typeof (l as BagLine).optionId === 'string' || (l as BagLine).optionId === null) && Number.isInteger((l as BagLine).qty) && (l as BagLine).qty > 0,
      )
    : [];
  const orders = Array.isArray(r.orders)
    ? r.orders.filter(
        (o): o is Order =>
          !!o && typeof o === 'object' && typeof (o as Order).id === 'string' && typeof (o as Order).createdAt === 'string' && Array.isArray((o as Order).lines) && Number.isInteger((o as Order).totalP),
      )
    : [];
  return { bag, orders };
}

export const useShop = create<ShopState>()(
  persist(
    (set, get) => ({
      bag: [],
      orders: [],
      add: (productId, optionId, qty) => {
        const r = addToBag(get().bag, getCatalog(), productId, optionId, qty);
        if (r.added > 0) set({ bag: r.lines });
        return r.added;
      },
      setQty: (key, qty) => set({ bag: setLineQty(get().bag, getCatalog(), key, qty) }),
      remove: (key) => set({ bag: removeLine(get().bag, key) }),
      placeOrder: () => {
        const catalog = getCatalog();
        const order = buildOrder(get().bag, catalog, new Date().toISOString(), uuid());
        if (!order) return null;
        set({ orders: [order, ...get().orders], bag: leftAfterOrder(get().bag, catalog) });
        return order;
      },
      cancelOrder: (id) => set({ orders: cancelOrderIn(get().orders, id) }),
    }),
    {
      name: 'forgeai-shop',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ bag: s.bag, orders: s.orders }),
      merge: (persisted, current) => ({ ...current, ...cleanShopBlob(persisted) }),
    },
  ),
);
