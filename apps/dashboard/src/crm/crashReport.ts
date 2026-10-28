/**
 * Crash reports from the admin app (#34 alerts, 28 Oct 2026). An error nothing caught (window
 * "error") or a promise nobody handled ("unhandledrejection") is sent to MettleUp's own Worker
 * (POST /api/crash, deploy/panel/crash.js), which keeps it and opens a GitHub issue per new kind.
 *
 * No personal data: the message and a short stack, the page's path with ids taken out, and which
 * admin-app update this is. No gym, no member, no person. At most MAX_PER_PAGE reports per page
 * load, each kind once. Never on a local test server (the admin journeys run there).
 */
import { currentNews } from './logic/whatsNew';

export const MAX_PER_PAGE = 5;

/** The page's path without ids or codes (a member's id is not data we send). PURE. */
export function screenOf(pathname: string): string {
  return pathname
    .split('/')
    .map((s) => (/^[0-9a-f-]{16,}$/i.test(s) || /\d/.test(s) || /^[A-Z0-9]{6}$/.test(s) ? ':id' : s))
    .join('/')
    .slice(0, 80);
}

/** Noise that is not our crash: other sites' scripts (no details), the browser's own resize note. PURE. */
export function isNoise(message: string, filename: string | undefined, origin: string): boolean {
  if (!message || message === 'Script error.' || /ResizeObserver loop/.test(message)) return true;
  // A browser extension's file, not ours.
  return Boolean(filename && !filename.startsWith(origin) && !filename.startsWith('/'));
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

export interface CrashSender {
  (body: string): Promise<unknown>;
}

/** A reporter with its own limits (one per page load). PURE apart from `send`. */
export function makeReporter(send: CrashSender, app: string, max = MAX_PER_PAGE) {
  const sent = new Set<string>();
  return (message: string, stack: string, screen: string, fatal: boolean): boolean => {
    const key = message.slice(0, 200);
    if (sent.size >= max || sent.has(key)) return false;
    sent.add(key);
    const body = JSON.stringify({ source: 'admin', message: message.slice(0, 300), stack: stack.slice(0, 1500), app, screen, fatal });
    send(body).catch((e: unknown) => console.warn('[crash] could not send a crash report', e));
    return true;
  };
}

function isLocal(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname.endsWith('.localhost');
}

/** Starts listening. Called once from main.tsx. */
export function startCrashReports(): void {
  if (typeof window === 'undefined' || isLocal(window.location.hostname)) return;
  const report = makeReporter(
    (body) => fetch('/api/crash', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }),
    currentNews() ?? '',
  );
  window.addEventListener('error', (ev: ErrorEvent) => {
    if (isNoise(ev.message, ev.filename, window.location.origin)) return;
    const d = ev.error != null ? describeError(ev.error) : { message: ev.message, stack: '' };
    report(d.message, d.stack, screenOf(window.location.pathname), true);
  });
  window.addEventListener('unhandledrejection', (ev: PromiseRejectionEvent) => {
    const d = describeError(ev.reason);
    if (isNoise(d.message, undefined, window.location.origin)) return;
    report(d.message, d.stack, screenOf(window.location.pathname), false);
  });
}
