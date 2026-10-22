/**
 * R-77 (owner, 22 Oct 2026: "the shop shouldn't be there if there is no gym active"): the gym's own
 * pages (bag, a product, My orders) show only with a gym joined. With none (a Leave, or the gym let
 * this phone go while a page was open) they go to Workout, never to the old sample shop.
 */
import { Redirect } from 'expo-router';
import type { ReactNode } from 'react';

import { useGymShop } from './gymStore';
import { useGymHydrated } from './shopSource';

export function GymOnly({ children }: { children: ReactNode }) {
  const hydrated = useGymHydrated();
  const joined = useGymShop((s) => s.link != null);
  if (hydrated && !joined) return <Redirect href="/workout" />;
  return <>{children}</>;
}
