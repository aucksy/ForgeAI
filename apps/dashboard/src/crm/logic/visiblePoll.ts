/**
 * R-522 (owner, 14 Nov 2026: "why 13,806 Cloudflare requests in a day"): one admin panel left open in a browser
 * asked the server ~4,600 times a day, ~124 an hour all night with nobody looking. The free Cloudflare plan allows
 * 100,000 a day for ALL gyms. So every repeating check of the admin app runs through here:
 *  - only while the tab is in view (document.visibilityState === 'visible'): a hidden tab asks NOTHING;
 *  - once at once when the tab comes back into view (or the window gets focus), unless it ran in the last
 *    RETURN_GAP_MS (switching tabs back and forth does not fire a call each time);
 *  - never two at once (a slow answer is waited for);
 *  - then every `everyMs` again.
 * New-member and other urgent alerts still reach the owner with the tab hidden or closed: that is web push
 * (0076, deploy/hq/panelPush.js), not this.
 * The host (document, window, timers) is passed in, so the rules are tested without a browser (test/crm/visiblePoll).
 */

export interface PollHost {
  visible(): boolean;
  /** Calls `fn` when the tab is shown or hidden; returns the undo. */
  onVisibility(fn: () => void): () => void;
  /** Calls `fn` when the window gets focus; returns the undo. */
  onFocus(fn: () => void): () => void;
  now(): number;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(id: unknown): void;
}

/** Coming back within this long of the last run does not run again at once. */
export const RETURN_GAP_MS = 15_000;

/** The real browser. */
export function browserPollHost(): PollHost {
  return {
    visible: () => typeof document === 'undefined' || document.visibilityState === 'visible',
    onVisibility: (fn) => {
      document.addEventListener('visibilitychange', fn);
      return () => document.removeEventListener('visibilitychange', fn);
    },
    onFocus: (fn) => {
      window.addEventListener('focus', fn);
      return () => window.removeEventListener('focus', fn);
    },
    now: () => Date.now(),
    setTimer: (fn, ms) => window.setTimeout(fn, ms),
    clearTimer: (id) => window.clearTimeout(id as number),
  };
}

/**
 * Run `run` now (when the tab is in view), then every `everyMs` while it stays in view; nothing while hidden; at
 * once when it comes back. Returns the stop.
 */
export function startVisiblePoll(run: () => void | Promise<void>, everyMs: number, host: PollHost = browserPollHost()): () => void {
  let timer: unknown = null;
  let last = -Infinity;
  let busy = false;
  let stopped = false;

  const clear = () => {
    if (timer !== null) host.clearTimer(timer);
    timer = null;
  };
  const schedule = (ms: number) => {
    clear();
    if (stopped || !host.visible()) return;
    timer = host.setTimer(() => {
      timer = null;
      void go();
    }, Math.max(0, ms));
  };
  const go = async () => {
    if (stopped) return;
    if (!host.visible()) return clear();
    if (busy) return schedule(everyMs);
    busy = true;
    last = host.now();
    try {
      await run();
    } catch (e) {
      console.warn('[poll] a check failed; the next one tries again', e);
    } finally {
      busy = false;
    }
    schedule(everyMs);
  };
  const back = () => {
    if (stopped) return;
    if (!host.visible()) return clear();
    const since = host.now() - last;
    if (since >= RETURN_GAP_MS) void go();
    else if (timer === null && !busy) schedule(everyMs - since);
  };

  const offVis = host.onVisibility(back);
  const offFocus = host.onFocus(back);
  if (host.visible()) void go();
  return () => {
    stopped = true;
    clear();
    offVis();
    offFocus();
  };
}
