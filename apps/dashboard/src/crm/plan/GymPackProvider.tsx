/**
 * T66 (#30 A): the gym's pack for the admin app's screens. While the switch PLAN_GATE_ON
 * (packages/theme/src/plans.ts) is OFF this asks nothing and every feature is on. Turning it on needs
 * the owner's yes (tracker #30 / T66).
 *
 * With the switch on, an online gym asks the server once per sign-in (owner_gym_pack, 0046). Until it
 * answers, offline, on a server without 0046, in a browser-only gym or the demo gym (no provider), the
 * pack is unknown and every feature stays on: a wrong "closed" would cost a paying gym more than a
 * wrong "open".
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { hasFeature, PLAN_GATE_ON, type GymPack, type ProFeature } from '@forgeai/theme';

import { call } from '../shop/api';
import { packFromRow } from './pack';

const PackContext = createContext<GymPack | null>(null);

export function GymPackProvider({ sessionKey, children }: { sessionKey: string | null; children: ReactNode }) {
  const [pack, setPack] = useState<GymPack | null>(null);
  useEffect(() => {
    setPack(null);
    if (!PLAN_GATE_ON || !sessionKey) return;
    let live = true;
    call<unknown>('owner_gym_pack', { p_key: sessionKey })
      .then((r) => {
        if (live) setPack(packFromRow(r));
      })
      // No answer (offline, no 0046 yet): unknown pack, every feature stays on.
      .catch((e: unknown) => console.warn('[pack] could not read the gym pack', e));
    return () => {
      live = false;
    };
  }, [sessionKey]);
  return <PackContext.Provider value={pack}>{children}</PackContext.Provider>;
}

/** Does this gym have the feature? Always true while the switch is off or the pack is unknown. */
export function useHasFeature(feature: ProFeature): boolean {
  const pack = useContext(PackContext);
  return hasFeature({ plan: pack }, feature);
}

/** The same question for any feature (a route table asks about the page it is about to show). */
export function useFeatureCheck(): (feature: ProFeature) => boolean {
  const pack = useContext(PackContext);
  return (feature) => hasFeature({ plan: pack }, feature);
}
