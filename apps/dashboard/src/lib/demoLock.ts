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

/**
 * R-540 (owner, 14 Nov 2026: "enough data so all the functionalities can be shown"): the demo's own pretend gym
 * server (crm/demo/demoServer.ts), held in this page's memory. With it, the screens that only work with a gym
 * server (messages, shop, staff, training progress ...) show the sample gym's made-up rows instead of a plain card.
 * It answers inside the page: nothing goes to the network, and the lock above stays on.
 */
export interface DemoServer {
  /** The answer to one gym-server call, as the real server would give it (or its refusal, thrown). */
  answer(fn: string, args: Record<string, unknown>): Promise<unknown>;
  /** The pretend signed-in session the demo's screens read (shop/cloudGym.ts `readCloudGym`). */
  session(): unknown;
}

let server: DemoServer | null = null;

/** Set the demo's pretend server. Only while the page is locked for the demo. */
export function serveDemo(s: DemoServer | null): void {
  server = locked ? s : null;
}

/** The demo's pretend server, or null (the real app, or a locked page without one). */
export function demoServer(): DemoServer | null {
  return locked ? server : null;
}

/** Locked for the demo with no pretend server: the screens that need a gym server stay switched off. */
export function demoWithoutServer(): boolean {
  return locked && server === null;
}

/** Is this address the demo entry? `/demo` (or `/demo/`) on any host, or the older-style `?demo=1`. PURE. */
export function isDemoAddress(pathname: string, search: string): boolean {
  if (/^\/demo\/?$/.test(pathname)) return true;
  return pathname === '/' && /(^|[?&])demo=1(&|$)/.test(search);
}
