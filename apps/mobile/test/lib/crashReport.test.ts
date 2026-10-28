// #34 alerts: the member app's crash reports (src/lib/crashReport.ts).
import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-constants', () => ({ default: { expoConfig: { version: '0.59.0', extra: {} } } }));

import { CRASH_URLS, FATAL_WAIT_MS, MAX_PER_RUN, crashBody, describeError, installCrashReports, makeReporter, postCrash } from '@/lib/crashReport';

function fakeErrorUtils() {
  const calls: { error: unknown; fatal?: boolean }[] = [];
  let handler = (error: unknown, fatal?: boolean) => void calls.push({ error, fatal });
  return {
    calls,
    getGlobalHandler: () => handler,
    setGlobalHandler: (h: typeof handler) => {
      handler = h;
    },
    fire: (e: unknown, fatal?: boolean) => handler(e, fatal),
  };
}

describe('member crash reports', () => {
  it('the body has only the error, the version, where, and fatal', () => {
    const b = JSON.parse(crashBody('TypeError: x', 'at A', '0.59.0', 'app', true));
    expect(Object.keys(b).sort()).toEqual(['app', 'fatal', 'message', 'screen', 'source', 'stack']);
    expect(b.source).toBe('member');
    expect(describeError(new RangeError('bad')).message).toBe('RangeError: bad');
  });

  it('each kind once, at most a few per run', () => {
    const send = vi.fn(async () => undefined);
    const report = makeReporter(send, '0.59.0');
    expect(report(new Error('a'), 'app', false)).not.toBeNull();
    expect(report(new Error('a'), 'app', false)).toBeNull();
    for (let i = 0; i < 10; i++) report(new Error(`b${i}`), 'app', false);
    expect(send).toHaveBeenCalledTimes(MAX_PER_RUN);
  });

  it('does nothing in development', () => {
    expect(installCrashReports({ dev: true, errorUtils: fakeErrorUtils() })).toBe(false);
  });

  it('a non-fatal error is sent and the old handler still runs at once', () => {
    const eu = fakeErrorUtils();
    const send = vi.fn(async () => undefined);
    const log = { error: vi.fn() };
    expect(installCrashReports({ dev: false, errorUtils: eu, send, app: '0.59.0', log })).toBe(true);
    eu.fire(new Error('soft'), false);
    expect(eu.calls).toHaveLength(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('a fatal error waits for its report (never longer than the limit), then the old handler runs', async () => {
    vi.useFakeTimers();
    try {
      const eu = fakeErrorUtils();
      const send = vi.fn(() => new Promise(() => undefined)); // never answers
      installCrashReports({ dev: false, errorUtils: eu, send, app: '0.59.0', log: { error: vi.fn() } });
      eu.fire(new Error('hard'), true);
      expect(eu.calls).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(FATAL_WAIT_MS);
      expect(eu.calls).toHaveLength(1);
      expect(eu.calls[0].fatal).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a screen that crashed (the boundary log line) is sent, and the log still prints', () => {
    const send = vi.fn(async () => undefined);
    const printed = vi.fn();
    const log = { error: printed };
    installCrashReports({ dev: false, errorUtils: fakeErrorUtils(), send, app: '0.59.0', log });
    log.error('[ScreenErrorBoundary] a screen crashed:', new TypeError('oops'), '\n    in Workout');
    log.error('something else', new Error('not a crash'));
    expect(printed).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledTimes(1);
    const body = JSON.parse((send.mock.calls[0] as unknown as [string])[0]);
    expect(body).toMatchObject({ message: 'TypeError: oops', screen: 'screen', fatal: false });
    expect(body.stack).toContain('in Workout');
  });

  it('tries the old address when the new one has no box', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const post = vi.fn(async (url: string) => new Response('', { status: url === CRASH_URLS[0] ? 404 : 201 }));
    await postCrash('{}', post as unknown as typeof fetch);
    expect(post.mock.calls.map((c) => c[0])).toEqual([...CRASH_URLS]);
    warn.mockRestore();
  });
});
