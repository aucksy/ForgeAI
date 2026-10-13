/**
 * The gym's real shop on this phone (S2): the link from Join (its member key), the last good
 * product list and orders (so the tab opens at once and reads offline), and the bag. AsyncStorage
 * through zustand's persist, like the demo shop's store — under its own name, so the sample shop
 * (shopStore.ts, 'forgeai-shop') keeps working on its own.
 *
 * Nothing here talks to the server: gymActions.ts does the calls and puts the answers here.
 * "Erase all data" clears this store and its saved copy (onboarding/eraseDevice.ts, step
 * "gym-shop"); "Leave" does the same from the Shop tab.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { EMPTY_GYM_BLOB, cleanGymBlob, linkWithNow, upsertOrder, type GymBlob, type GymNow, type OrderFlash } from './gym';
import { addToBag, removeLine, setLineQty } from './money';
import type { BagLine, GymLink, GymOrder, Product } from './types';

export const GYM_SHOP_STORAGE_KEY = 'forgeai-gym-shop';

export interface GymShopState extends GymBlob {
  /** The sample (S1 demo) shop is open in place of the join card. Not saved: a restart shows the card. */
  sampleOpen: boolean;
  /** A line for the join card (the gym no longer knows this phone). Not saved. */
  notice: string | null;
  /** "Order 12 placed…" for My orders to show once, with the order it is about. Not saved. */
  flash: OrderFlash | null;
  setLink: (link: GymLink) => void;
  /** member_me's news (the gym's name and brand now). Nothing moves when nothing changed. */
  setGymNow: (now: GymNow) => void;
  /** Forget the gym on this phone: link, lists and bag. */
  unlink: (notice?: string | null) => void;
  setProducts: (products: Product[], atISO: string) => void;
  setOrders: (orders: GymOrder[]) => void;
  putOrder: (order: GymOrder) => void;
  /** Returns how many actually went in (0 when sold out or the line is full). */
  add: (productId: string, optionId: string | null, qty: number) => number;
  setQty: (key: string, qty: number) => void;
  remove: (key: string) => void;
  setBag: (bag: BagLine[]) => void;
  setSampleOpen: (open: boolean) => void;
  setNotice: (notice: string | null) => void;
  setFlash: (flash: OrderFlash | null) => void;
}

export const useGymShop = create<GymShopState>()(
  persist(
    (set, get) => ({
      ...EMPTY_GYM_BLOB,
      sampleOpen: false,
      notice: null,
      flash: null,
      setLink: (link) => set({ ...EMPTY_GYM_BLOB, link, notice: null, flash: null, sampleOpen: false }),
      setGymNow: (now) => {
        const link = get().link;
        if (!link) return;
        const next = linkWithNow(link, now);
        if (next !== link) set({ link: next });
      },
      unlink: (notice = null) => set({ ...EMPTY_GYM_BLOB, notice, flash: null, sampleOpen: false }),
      setProducts: (products, atISO) => set({ products, productsAt: atISO }),
      setOrders: (orders) => set({ orders }),
      putOrder: (order) => set({ orders: upsertOrder(get().orders, order) }),
      add: (productId, optionId, qty) => {
        const r = addToBag(get().bag, get().products, productId, optionId, qty);
        if (r.added > 0) set({ bag: r.lines });
        return r.added;
      },
      setQty: (key, qty) => set({ bag: setLineQty(get().bag, get().products, key, qty) }),
      remove: (key) => set({ bag: removeLine(get().bag, key) }),
      setBag: (bag) => set({ bag }),
      setSampleOpen: (open) => set({ sampleOpen: open }),
      setNotice: (notice) => set({ notice }),
      setFlash: (flash) => set({ flash }),
    }),
    {
      name: GYM_SHOP_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s): GymBlob => ({ link: s.link, products: s.products, productsAt: s.productsAt, orders: s.orders, bag: s.bag }),
      merge: (persisted, current) => ({ ...current, ...cleanGymBlob(persisted) }),
    },
  ),
);

/** Which shop the Shop pages show: the gym's own once joined, else the sample. */
export function shopModeOf(s: Pick<GymShopState, 'link'>): 'gym' | 'sample' {
  return s.link ? 'gym' : 'sample';
}
