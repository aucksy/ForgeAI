/**
 * F207 (coordinator, 14 Nov 2026, the owner's hard rule "show a feature only when it is on"): every part of the gym web
 * page in this admin app (the "Your web page" menu row and screen, Set up your gym's step, "Asked on your web page" on
 * an enquiry) shows only while gym web pages are open to visitors. That is ONE switch: the panel Worker's var GYM_PAGES
 * set to "live" (deploy/panel/switches.js), the same one that opens join.mettleup.fit/<gym>. The Worker says it at
 * GET /api/switches.
 *
 * Asked when the panel opens, again whenever the panel comes back to the front (tab shown, window focused) and every
 * 5 minutes while open, so switching it on shows everything at once, with no reload. Until the Worker has answered,
 * or when it cannot be asked, it is off. A failed re-ask keeps what was known (one bad network moment hides nothing).
 *
 * R-555 (15 Nov 2026): the same answer carries the Worker's other "show it only when it is on" switches, read here so
 * the admin app asks once: `joinPay` (JOIN_PAY "live": pay online on the join page, held by the owner; while off the
 * "Take payments when people join online" switch and Today's Approve line are hidden) and `aiCharge`
 * (AI_CREDITS_CHARGE "on": members' AI answers use the gym's credits; while off the credits sheet shows nothing about
 * charging, because nothing is charged). Each is off until the Worker says exactly `true`.
 */
import { useSyncExternalStore } from 'react';

const EVERY_MS = 5 * 60_000;
const TIMEOUT_MS = 4000;

/** The Worker's switches the admin app follows (GET /api/switches). */
export interface WorkerSwitches {
  gymPages: boolean;
  joinPay: boolean;
  aiCharge: boolean;
}

export const ALL_OFF: Readonly<WorkerSwitches> = Object.freeze({ gymPages: false, joinPay: false, aiCharge: false });

/** /api/switches's answer: each switch on only when it says exactly `true`. PURE. */
export function switchesFrom(raw: unknown): WorkerSwitches {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...ALL_OFF };
  const r = raw as Record<string, unknown>;
  return { gymPages: r.gymPages === true, joinPay: r.joinPay === true, aiCharge: r.aiCharge === true };
}

/** /api/switches's answer: on only when it says exactly `gymPages: true`. PURE. */
export function pagesOpenFrom(raw: unknown): boolean {
  return switchesFrom(raw).gymPages;
}

/** undefined: not answered yet. */
let known: WorkerSwitches | undefined;
let asking: Promise<void> | null = null;
const listeners = new Set<() => void>();

function setKnown(v: WorkerSwitches) {
  if (known && known.gymPages === v.gymPages && known.joinPay === v.joinPay && known.aiCharge === v.aiCharge) return;
  known = v;
  for (const f of listeners) f();
}

/** What is known now about gym web pages: undefined until the Worker has answered. */
export function pagesOpenNow(): boolean | undefined {
  return known?.gymPages;
}

/** R-555: every switch as known now: undefined until the Worker has answered. */
export function switchesNow(): WorkerSwitches | undefined {
  return known;
}

/** Ask the Worker. Never throws. */
export function checkPagesOpen(fetchImpl: typeof fetch = fetch, timeoutMs = TIMEOUT_MS): Promise<void> {
  if (asking) return asking;
  asking = (async () => {
    const stop = new AbortController();
    const timer = setTimeout(() => stop.abort(), timeoutMs);
    try {
      const r = await fetchImpl('/api/switches', { cache: 'no-store', signal: stop.signal });
      const type = r.headers.get('Content-Type') ?? '';
      // An address without the answer (an older Worker, a dev server) is "off", not an error.
      setKnown(r.ok && type.includes('json') ? switchesFrom(await r.json()) : { ...ALL_OFF });
    } catch (e) {
      console.info('[web page] /api/switches not answered; web page parts stay as they were', e instanceof Error ? e.message : e);
      if (known === undefined) setKnown({ ...ALL_OFF });
    } finally {
      clearTimeout(timer);
      asking = null;
    }
  })();
  return asking;
}

let watching = false;
function watch() {
  if (watching || typeof window === 'undefined') return;
  watching = true;
  const again = () => void checkPagesOpen();
  window.addEventListener('focus', again);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') again();
  });
  setInterval(again, EVERY_MS);
  again();
}

function subscribe(f: () => void) {
  listeners.add(f);
  watch();
  return () => listeners.delete(f);
}

/** Are gym web pages open? undefined until the Worker has answered (show nothing yet), then true or false. */
export function usePagesOpenState(): boolean | undefined {
  return useSyncExternalStore(subscribe, () => known?.gymPages, () => undefined);
}

/** Show the web page parts? false until the Worker says they are open. */
export function usePagesOpen(): boolean {
  return usePagesOpenState() === true;
}

/** R-555: is pay online on the join page switched on (JOIN_PAY)? false until the Worker says so. */
export function useJoinPayOn(): boolean {
  return useSyncExternalStore(subscribe, () => known?.joinPay === true, () => false);
}

/** R-555: are AI questions charged on the gym's credits (AI_CREDITS_CHARGE)? false until the Worker says so. */
export function useAiChargeOn(): boolean {
  return useSyncExternalStore(subscribe, () => known?.aiCharge === true, () => false);
}

/** For tests: set or forget the gym web pages answer (the other switches stay as they are, off when unknown). */
export function setPagesOpenForTests(v: boolean | undefined): void {
  asking = null;
  known = v === undefined ? undefined : { ...(known ?? ALL_OFF), gymPages: v };
  for (const f of listeners) f();
}

/** R-555, for tests: set some switches (the rest stay as they were, off when unknown), or forget them all. */
export function setSwitchesForTests(v: Partial<WorkerSwitches> | undefined): void {
  asking = null;
  known = v === undefined ? undefined : { ...(known ?? ALL_OFF), ...v };
  for (const f of listeners) f();
}
