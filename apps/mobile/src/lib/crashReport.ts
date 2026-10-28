/**
 * Crash reports from the member app (#34 alerts, 28 Oct 2026). Started once from the app's entry
 * (index.js). Two kinds of crash are sent to MettleUp's own Worker (POST /api/crash on the admin
 * site, deploy/panel/crash.js), which keeps them and opens one GitHub issue per new kind:
 * - an error nothing caught (React Native's global handler; a fatal one closes the app, so the
 *   report gets a short head start before the app's own handler runs);
 * - a screen that crashed and showed "Try again" (components/ScreenErrorBoundary logs it with
 *   console.error; that file stays as it is, the log line is read here).
 *
 * No personal data: the message and a short stack, the app version, and "screen" or "app". No gym
 * code, no install id, no phone model. At most MAX_PER_RUN reports per app run, each kind once.
 * Nothing in development (Metro) builds.
 */
import Constants from 'expo-constants';

export const CRASH_URLS = ['https://app.mettleup.fit/api/crash', 'https://forgeai.aakashpahuja.in/api/crash'] as const;
export const MAX_PER_RUN = 5;
/** How long a fatal crash waits for its report before the app closes. */
export const FATAL_WAIT_MS = 1500;
const BOUNDARY_LOG = '[ScreenErrorBoundary] a screen crashed:';

type Handler = (error: unknown, isFatal?: boolean) => void;
export interface ErrorUtilsLike {
  getGlobalHandler(): Handler;
  setGlobalHandler(h: Handler): void;
}

/** What an unknown thrown value says. PURE. */
export function describeError(reason: unknown): { message: string; stack: string } {
  if (reason instanceof Error) return { message: `${reason.name}: ${reason.message}`, stack: reason.stack ?? '' };
  if (typeof reason === 'string') return { message: reason, stack: '' };
  try {
    return { message: JSON.stringify(reason)?.slice(0, 300) ?? String(reason), stack: '' };
  } catch {
    return { message: String(reason), stack: '' }; // quiet: an unprintable value is described by String()
  }
}

/** The report's body. PURE. */
export function crashBody(message: string, stack: string, app: string, screen: string, fatal: boolean): string {
  return JSON.stringify({ source: 'member', message: message.slice(0, 300), stack: stack.slice(0, 1500), app, screen, fatal });
}

export type Send = (body: string) => Promise<unknown>;

/** A reporter with its own limits (one per app run). Returns the send's promise, or null when skipped. */
export function makeReporter(send: Send, app: string, max = MAX_PER_RUN) {
  const sent = new Set<string>();
  return (error: unknown, screen: string, fatal: boolean, extraStack = ''): Promise<unknown> | null => {
    const d = describeError(error);
    const key = d.message.slice(0, 200);
    if (!key || sent.size >= max || sent.has(key)) return null;
    sent.add(key);
    const stack = [d.stack, extraStack].filter(Boolean).join('\n');
    return send(crashBody(d.message, stack, app, screen, fatal)).catch((e: unknown) => console.warn('[crash] could not send a crash report', e));
  };
}

/** POST to the first address that answers (the old address stays, like Send feedback). */
export async function postCrash(body: string, post: typeof fetch = fetch): Promise<void> {
  for (const url of CRASH_URLS) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await post(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: ctrl.signal });
      if (res.status !== 404 && res.status < 500) return;
      console.warn('[crash] report address answered', res.status, url);
    } catch (e) {
      console.warn('[crash] report address gave no answer', url, e);
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Hooks the global handler and the screen-crash log line. Returns false when it did nothing
 * (development, or no ErrorUtils). Every hook calls what was there before, unchanged.
 */
export function installCrashReports(opts: { errorUtils?: ErrorUtilsLike; dev?: boolean; send?: Send; app?: string; log?: Pick<Console, 'error'> } = {}): boolean {
  const g = globalThis as { ErrorUtils?: ErrorUtilsLike };
  const errorUtils = opts.errorUtils ?? g.ErrorUtils;
  const dev = opts.dev ?? (typeof __DEV__ !== 'undefined' && __DEV__);
  if (dev || !errorUtils) return false;
  const report = makeReporter(opts.send ?? ((b) => postCrash(b)), opts.app ?? Constants.expoConfig?.version ?? '');

  const before = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error, isFatal) => {
    const pending = report(error, 'app', isFatal === true);
    if (!isFatal || !pending) {
      before(error, isFatal);
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      before(error, isFatal);
    };
    setTimeout(finish, FATAL_WAIT_MS);
    // The report's own failure is logged in makeReporter; either way the app's handler runs.
    pending.then(finish, finish).catch((e: unknown) => console.warn('[crash] the app crash handler failed', e));
  });

  const log = opts.log ?? console;
  const original = log.error.bind(log);
  log.error = (...args: unknown[]) => {
    original(...args);
    if (args[0] === BOUNDARY_LOG) {
      report(args[1], 'screen', false, typeof args[2] === 'string' ? args[2] : '')?.catch((e: unknown) => console.warn('[crash] screen crash not sent', e));
    }
  };
  return true;
}

installCrashReports();
