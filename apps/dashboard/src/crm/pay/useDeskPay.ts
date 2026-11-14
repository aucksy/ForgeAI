/**
 * F79 (R-328): is online payment on for this gym, and which company is connected? Asked once a minute at
 * most (shared by every sheet on the page), and again at once after Settings -> Payments changes it.
 * A gym that is not online (browser only), the demo gym and an older server all read { on: false }.
 */

import { useCallback, useEffect, useState } from 'react';

import { useAuth, useRole } from '../auth/AuthProvider';
import { isRealMoney } from '../logic/joinPay';
import { useShop } from '../shop/ShopProvider';
import { useCrm } from '../store';
import { deskPay, settleForDesk, type DeskPay, type PayProvider, type PayRequest } from './payApi';

const FRESH_MS = 60_000;

let cached: { key: string; at: number; value: DeskPay } | null = null;
let inFlight: Promise<DeskPay> | null = null;
const listeners = new Set<(v: DeskPay) => void>();

/** Forget the answer (after a connect or a disconnect) and tell every open screen. */
export function setDeskPay(key: string, value: DeskPay): void {
  cached = { key, at: Date.now(), value };
  for (const f of [...listeners]) f(value);
}

async function load(key: string, gym: { upiId: string | null; name: string; owner: boolean }, force: boolean): Promise<DeskPay> {
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
  // Review round 3 (R-550): only the owner's app hands the server the gym's UPI ID.
  const owner = useRole() === 'owner';

  useEffect(() => {
    if (!key) {
      setState({ on: false, why: 'OFFLINE' });
      return;
    }
    let live = true;
    const hear = (v: DeskPay) => live && setState(v);
    listeners.add(hear);
    void load(key, { upiId: upi, name, owner }, force || tick > 0).then(hear, (e) => console.warn('[pay] state not read', e));
    return () => {
      live = false;
      listeners.delete(hear);
    };
  }, [key, upi, name, owner, force, tick]);

  return { state, key, reload: () => setTick((n) => n + 1) };
}

/**
 * Review round 3 (R-550): call it just before the desk saves money taken another way (cash, or UPI to the gym's own
 * QR) for a due or a shop order. The server closes the open online payments for it, here and at the company. -> a REAL
 * payment made online a moment ago (the desk must not take the money again), else null. It never stops the desk: no
 * internet, an older server, a test payment or online payments not on all give null, and the desk saves as before.
 */
export function useBeforeDeskMoney(): (
  kind: 'fee' | 'shop',
  ref: string | null | undefined,
  amounts?: { amountP: number; dueP: number },
) => Promise<PayRequest | null> {
  const { state, key } = useDeskPay();
  const on = state?.on === true;
  return useCallback(
    async (kind: 'fee' | 'shop', ref: string | null | undefined, amounts?: { amountP: number; dueP: number }) => {
      if (!key || !on || !ref) return null;
      try {
        const paid = await settleForDesk(key, kind, ref, amounts);
        return paid && isRealMoney(paid) ? paid : null;
      } catch (e) {
        console.warn('[pay] open online payments were not closed before a desk payment', e instanceof Error ? e.message : e);
        return null;
      }
    },
    [key, on],
  );
}
