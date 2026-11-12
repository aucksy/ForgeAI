/**
 * F56 MettleUp Plus (R-461): buying through Google Play. TEST MODE until the owner says "payments live"
 * (MEMBER_PAYMENTS_LIVE, @forgeai/theme): until then no real purchase is ever started. A QA build uses a
 * stand-in store instead (the screen says no money is taken), so the cloud phone test can walk every step.
 *
 * Native: modules/forge-billing (Kotlin, Play Billing Library 8.0.0; Android only). On iPhone there is no
 * module yet (StoreKit, docs/ios/PARITY.yaml "member-plus-billing"): the store reads as "not available".
 * Products (Play Console): subscription `mettleup_plus` (base plans monthly, yearly) and one-time
 * `mettleup_plus_lifetime`.
 */
import { MEMBER_PAYMENTS_LIVE, PLAY_PLUS_BASE_PLANS, PLAY_PLUS_LIFETIME, PLAY_PLUS_SUBSCRIPTION, PLUS_OPTIONS, type PlusOption } from '@forgeai/theme';

import { isQaPlanBuild, noteBought, useMemberPlan } from './memberPlanStore';

export type BuyResult = 'bought' | 'cancelled' | 'pending' | 'failed' | 'unavailable' | 'notLive';

interface NativeBilling {
  /** JSON {monthly?: "₹149.00", yearly?: ..., lifetime?: ...} or "" when Google Play is not reachable. */
  prices(sub: string, monthlyPlan: string, yearlyPlan: string, lifetime: string): Promise<string>;
  /** 'bought' | 'cancelled' | 'pending' | 'failed' | 'unavailable'. */
  buy(option: string, sub: string, plan: string, lifetime: string): Promise<string>;
  /** JSON array: "lifetime" and/or "subscription" this Google account owns now; "" when Google Play could not be asked. */
  owned(sub: string, monthlyPlan: string, yearlyPlan: string, lifetime: string): Promise<string>;
}

let mod: NativeBilling | null | undefined;
function N(): NativeBilling | null {
  if (mod !== undefined) return mod;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const core = require('expo-modules-core') as { requireOptionalNativeModule: (n: string) => unknown };
    mod = (core.requireOptionalNativeModule('ForgeBilling') as NativeBilling | null) ?? null;
  } catch {
    mod = null;
  }
  return mod;
}

/** Which store this build talks to. */
export function storeKind(): 'play' | 'standIn' | 'none' {
  if (MEMBER_PAYMENTS_LIVE && N()) return 'play';
  if (isQaPlanBuild()) return 'standIn';
  return 'none';
}

const isOption = (v: unknown): v is PlusOption => (PLUS_OPTIONS as readonly unknown[]).includes(v);

/**
 * The best of what an account owns: for life beats a subscription. Play does not say which base plan a
 * subscription is on, so the option this phone bought is kept (monthly when it never knew). PURE.
 */
export function bestOwned(list: readonly unknown[], had: PlusOption | null): PlusOption | null {
  if (list.includes('lifetime')) return 'lifetime';
  if (list.includes('subscription')) return had === 'monthly' || had === 'yearly' ? had : 'monthly';
  return null;
}

/** Google Play's own price words per option ({} when not known: the screen shows ours). */
export async function playPrices(): Promise<Partial<Record<PlusOption, string>>> {
  const n = storeKind() === 'play' ? N() : null;
  if (!n) return {};
  try {
    const raw = await n.prices(PLAY_PLUS_SUBSCRIPTION, PLAY_PLUS_BASE_PLANS.monthly, PLAY_PLUS_BASE_PLANS.yearly, PLAY_PLUS_LIFETIME);
    const v: unknown = raw ? JSON.parse(raw) : {};
    const out: Partial<Record<PlusOption, string>> = {};
    if (v && typeof v === 'object') {
      for (const [k, p] of Object.entries(v as Record<string, unknown>)) if (isOption(k) && typeof p === 'string' && p) out[k] = p.slice(0, 20);
    }
    return out;
  } catch (e) {
    console.warn('[plan] Google Play prices not read', e);
    return {};
  }
}

/** Ask Google Play what this account owns and keep it. True when it answered. */
export async function refreshOwned(): Promise<boolean> {
  const n = storeKind() === 'play' ? N() : null;
  if (!n) return false;
  try {
    const raw = await n.owned(PLAY_PLUS_SUBSCRIPTION, PLAY_PLUS_BASE_PLANS.monthly, PLAY_PLUS_BASE_PLANS.yearly, PLAY_PLUS_LIFETIME);
    if (!raw) return false; // not reachable: keep what we knew
    const v: unknown = JSON.parse(raw);
    noteBought(Array.isArray(v) ? bestOwned(v, useMemberPlan.getState().bought?.option ?? null) : null);
    return true;
  } catch (e) {
    console.warn('[plan] Google Play purchases not read', e);
    return false;
  }
}

/**
 * Buy one option. The stand-in store (QA builds) asks first, then keeps it, with no money. Never throws.
 * `askStandIn` shows the test-build question and answers it (the screen's own pop-up).
 */
export async function buy(option: PlusOption, askStandIn: () => Promise<boolean>): Promise<BuyResult> {
  const kind = storeKind();
  if (kind === 'standIn') {
    if (!(await askStandIn())) return 'cancelled';
    noteBought(option);
    return 'bought';
  }
  if (kind === 'none') return MEMBER_PAYMENTS_LIVE ? 'unavailable' : 'notLive';
  const n = N();
  if (!n) return 'unavailable';
  try {
    const plan = option === 'lifetime' ? '' : PLAY_PLUS_BASE_PLANS[option];
    const r = await n.buy(option, PLAY_PLUS_SUBSCRIPTION, plan, PLAY_PLUS_LIFETIME);
    if (r === 'bought') {
      noteBought(option);
      void refreshOwned();
      return 'bought';
    }
    return r === 'cancelled' || r === 'pending' || r === 'unavailable' ? r : 'failed';
  } catch (e) {
    console.warn('[plan] Google Play purchase failed', e);
    return 'failed';
  }
}

/** "I already paid": ask Google Play again. The stand-in store has nothing to find. */
export async function restore(): Promise<'found' | 'none' | 'unavailable'> {
  if (storeKind() !== 'play') return 'none';
  const ok = await refreshOwned();
  if (!ok) return 'unavailable';
  return useMemberPlan.getState().bought ? 'found' : 'none';
}
