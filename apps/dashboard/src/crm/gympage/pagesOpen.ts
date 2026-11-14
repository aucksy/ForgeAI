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
 */
import { useSyncExternalStore } from 'react';

const EVERY_MS = 5 * 60_000;
const TIMEOUT_MS = 4000;

/** /api/switches's answer: on only when it says exactly `gymPages: true`. PURE. */
export function pagesOpenFrom(raw: unknown): boolean {
  return Boolean(raw && typeof raw === 'object' && !Array.isArray(raw) && (raw as { gymPages?: unknown }).gymPages === true);
}

/** undefined: not answered yet. */
let known: boolean | undefined;
let asking: Promise<void> | null = null;
const listeners = new Set<() => void>();

function setKnown(v: boolean) {
  if (known === v) return;
  known = v;
  for (const f of listeners) f();
}

/** What is known now: undefined until the Worker has answered. */
export function pagesOpenNow(): boolean | undefined {
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
      setKnown(r.ok && type.includes('json') ? pagesOpenFrom(await r.json()) : false);
    } catch (e) {
      console.info('[web page] /api/switches not answered; web page parts stay as they were', e instanceof Error ? e.message : e);
      if (known === undefined) setKnown(false);
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
  return useSyncExternalStore(subscribe, () => known, () => undefined);
}

/** Show the web page parts? false until the Worker says they are open. */
export function usePagesOpen(): boolean {
  return usePagesOpenState() === true;
}

/** For tests: set or forget the answer. */
export function setPagesOpenForTests(v: boolean | undefined): void {
  asking = null;
  known = v;
  for (const f of listeners) f();
}
