/**
 * Which shop the product page and the bag work on: the gym's own (S2) once this phone has joined
 * it, else the sample shop (the S1 demo catalog and its pretend orders). One hook, so the pages
 * never mix the two bags.
 */
import { useEffect, useState } from 'react';

import { getCatalog } from './catalog';
import { useGymShop } from './gymStore';
import { useShop } from './shopStore';
import type { BagLine, Product } from './types';

export interface ShopSource {
  mode: 'gym' | 'sample';
  products: readonly Product[];
  bag: BagLine[];
  add: (productId: string, optionId: string | null, qty: number) => number;
  setQty: (key: string, qty: number) => void;
  remove: (key: string) => void;
}

export function useShopSource(): ShopSource {
  const joined = useGymShop((s) => s.link != null);
  const gymProducts = useGymShop((s) => s.products);
  const gymBag = useGymShop((s) => s.bag);
  const sampleBag = useShop((s) => s.bag);
  if (joined) {
    const g = useGymShop.getState();
    return { mode: 'gym', products: gymProducts, bag: gymBag, add: g.add, setQty: g.setQty, remove: g.remove };
  }
  const d = useShop.getState();
  return { mode: 'sample', products: getCatalog(), bag: sampleBag, add: d.add, setQty: d.setQty, remove: d.remove };
}

/**
 * True once the saved gym link has been read back from the phone (so the Shop never flashes the
 * join card at a member who joined). If storage cannot be read at all, it gives up waiting after
 * a moment and the Shop opens as if nothing were saved.
 */
export function useGymHydrated(): boolean {
  const [done, setDone] = useState(() => useGymShop.persist.hasHydrated());
  useEffect(() => {
    if (done) return undefined;
    const unsub = useGymShop.persist.onFinishHydration(() => setDone(true));
    if (useGymShop.persist.hasHydrated()) setDone(true);
    const t = setTimeout(() => setDone(true), 5000);
    return () => {
      unsub();
      clearTimeout(t);
    };
  }, [done]);
  return done;
}
