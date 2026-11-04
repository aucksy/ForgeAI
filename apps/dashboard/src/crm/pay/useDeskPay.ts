/**
 * F79 (R-328): is online payment on for this gym, and which company is connected? Asked once a minute at
 * most (shared by every sheet on the page), and again at once after Settings -> Payments changes it.
 * A gym that is not online (browser only), the demo gym and an older server all read { on: false }.
 */

import { useEffect, useState } from 'react';

import { useAuth } from '../auth/AuthProvider';
import { useShop } from '../shop/ShopProvider';
import { useCrm } from '../store';
import { deskPay, type DeskPay, type PayProvider } from './payApi';

const FRESH_MS = 60_000;

let cached: { key: string; at: number; value: DeskPay } | null = null;
let inFlight: Promise<DeskPay> | null = null;
const listeners = new Set<(v: DeskPay) => void>();

/** Forget the answer (after a connect or a disconnect) and tell every open screen. */
export function setDeskPay(key: string, value: DeskPay): void {
  cached = { key, at: Date.now(), value };
  for (const f of [...listeners]) f(value);
}

async function load(key: string, gym: { upiId: string | null; name: string }, force: boolean): Promise<DeskPay> {
  if (!force && cached && cached.key === key && Date.now() - cached.at < FRESH_MS) return cached.value;
  if (inFlight) return inFlight;
  inFlight = deskPay(key, gym).finally(() => {
    inFlight = null;
  });
  const value = await inFlight;
  setDeskPay(key, value);
  return value;
}

/** The connection that makes payment links now: the first one switched on, in the screen's order. PURE. */
export function activeProvider(state: DeskPay | null): PayProvider | null {
  if (!state || !state.on || !state.connectOn) return null;
  return state.providers.find((p) => p.connection?.on) ?? null;
}

export function useDeskPay(force = false): { state: DeskPay | null; key: string | null; reload: () => void } {
  const { cloud } = useShop();
  const online = useAuth().session?.online === true;
  const { gym } = useCrm().snapshot;
  const key = online && cloud ? cloud.ownerKey : null;
  const [state, setState] = useState<DeskPay | null>(() => (key && cached && cached.key === key ? cached.value : null));
  const [tick, setTick] = useState(0);
  const upi = gym.upiId ?? null;
  const name = gym.name;

  useEffect(() => {
    if (!key) {
      setState({ on: false, why: 'OFFLINE' });
      return;
    }
    let live = true;
    const hear = (v: DeskPay) => live && setState(v);
    listeners.add(hear);
    void load(key, { upiId: upi, name }, force || tick > 0).then(hear, (e) => console.warn('[pay] state not read', e));
    return () => {
      live = false;
      listeners.delete(hear);
    };
  }, [key, upi, name, force, tick]);

  return { state, key, reload: () => setTick((n) => n + 1) };
}
