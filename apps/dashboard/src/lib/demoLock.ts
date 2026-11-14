/**
 * The demo gym's lock (R-119, 24 Oct 2026). The demo (app.mettleup.fit/demo) is made-up data kept
 * only in the page's memory. Once the page is locked for the demo:
 *   - nothing reads, writes or clears the gym this device is signed in to (shop/cloudGym.ts),
 *   - nothing reaches the gym server (lib/supabase.ts refuses every call),
 *   - the browser's own fetch refuses our server address and any other site (crm/demo/lockdown.ts).
 * The lock is one-way for the life of the page. Leaving the demo is a full page load, which starts
 * unlocked. PURE state; no storage.
 */
let locked = false;

export function lockForDemo(): void {
  locked = true;
}

export function isDemoLocked(): boolean {
  return locked;
}

/** Words for anything the lock turned away. */
export const DEMO_LOCKED_WORDS = 'This is the demo gym, so this does nothing here. It works in your own gym.';

/** Is this address the demo entry? `/demo` (or `/demo/`) on any host, or the older-style `?demo=1`. PURE. */
export function isDemoAddress(pathname: string, search: string): boolean {
  if (/^\/demo\/?$/.test(pathname)) return true;
  return pathname === '/' && /(^|[?&])demo=1(&|$)/.test(search);
}
