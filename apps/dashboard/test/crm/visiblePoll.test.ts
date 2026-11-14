/**
 * R-522 (Cloudflare free plan): the admin app's repeating checks ask NOTHING while the tab is hidden, ask once at
 * once when it comes back, and then keep their own pace (logic/visiblePoll.ts). Also: which lists "Needs you" reads
 * on each look (logic/needsPoll.ts).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LISTS_EVERY_MS, partsToRead } from '../../src/crm/logic/needsPoll';
import { RETURN_GAP_MS, startVisiblePoll, type PollHost } from '../../src/crm/logic/visiblePoll';

/** A pretend browser tab: shown or hidden, with focus, on vitest's fake clock. */
function fakeTab(visible = true) {
  let shown = visible;
  const vis = new Set<() => void>();
  const focus = new Set<() => void>();
  const host: PollHost = {
    visible: () => shown,
    onVisibility: (fn) => {
      vis.add(fn);
      return () => vis.delete(fn);
    },
    onFocus: (fn) => {
      focus.add(fn);
      return () => focus.delete(fn);
    },
    now: () => Date.now(),
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
  };
  return {
    host,
    hide() {
      shown = false;
      for (const f of [...vis]) f();
    },
    show() {
      shown = true;
      for (const f of [...vis]) f();
    },
    focus() {
      for (const f of [...focus]) f();
    },
    listeners: () => vis.size + focus.size,
  };
}

const MIN = 60_000;

describe('startVisiblePoll', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-14T22:00:00+05:30'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('asks at once, then once a minute while the tab is in view', async () => {
    const tab = fakeTab();
    const run = vi.fn();
    const stop = startVisiblePoll(run, MIN, tab.host);
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10 * MIN);
    expect(run).toHaveBeenCalledTimes(11);
    stop();
  });

  it('asks NOTHING while the tab is hidden, all night long', async () => {
    const tab = fakeTab();
    const run = vi.fn();
    const stop = startVisiblePoll(run, MIN, tab.host);
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);
    tab.hide();
    await vi.advanceTimersByTimeAsync(10 * 60 * MIN);
    expect(run, 'ten hours hidden').toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount(), 'no timer left waiting').toBe(0);
    stop();
  });

  it('asks once at once when the tab comes back, then keeps its pace', async () => {
    const tab = fakeTab();
    const run = vi.fn();
    const stop = startVisiblePoll(run, MIN, tab.host);
    await vi.advanceTimersByTimeAsync(0);
    tab.hide();
    await vi.advanceTimersByTimeAsync(3 * 60 * MIN);
    tab.show();
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(MIN);
    expect(run).toHaveBeenCalledTimes(3);
    stop();
  });

  it('a tab opened hidden asks nothing until it is shown', async () => {
    const tab = fakeTab(false);
    const run = vi.fn();
    const stop = startVisiblePoll(run, MIN, tab.host);
    await vi.advanceTimersByTimeAsync(30 * MIN);
    expect(run).not.toHaveBeenCalled();
    tab.show();
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);
    stop();
  });

  it('flipping tabs back and forth does not fire a call each time', async () => {
    const tab = fakeTab();
    const run = vi.fn();
    const stop = startVisiblePoll(run, MIN, tab.host);
    await vi.advanceTimersByTimeAsync(0);
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(1000);
      tab.hide();
      tab.show();
      tab.focus();
    }
    expect(run).toHaveBeenCalledTimes(1);
    // ...but past the gap, coming back asks at once.
    tab.hide();
    await vi.advanceTimersByTimeAsync(RETURN_GAP_MS);
    tab.show();
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(2);
    stop();
  });

  it('never two at once: a slow answer is waited for', async () => {
    const tab = fakeTab();
    let release: () => void = () => undefined;
    const run = vi.fn(() => new Promise<void>((r) => (release = r)));
    const stop = startVisiblePoll(run, MIN, tab.host);
    await vi.advanceTimersByTimeAsync(5 * MIN);
    expect(run).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(MIN);
    expect(run).toHaveBeenCalledTimes(2);
    stop();
  });

  it('a failed check does not stop the next one; stop() ends everything', async () => {
    const tab = fakeTab();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const run = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    const stop = startVisiblePoll(run, MIN, tab.host);
    await vi.advanceTimersByTimeAsync(MIN);
    expect(run).toHaveBeenCalledTimes(2);
    stop();
    expect(tab.listeners()).toBe(0);
    tab.show();
    await vi.advanceTimersByTimeAsync(10 * MIN);
    expect(run).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});

describe('partsToRead (Needs you)', () => {
  it('without the alerts list on the server: every list, every look (as before)', () => {
    expect(partsToRead({ alertsOn: false, sinceFullMs: 0, fresh: [] })).toEqual({ parts: ['plan', 'links', 'questions', 'messages'], full: true });
  });

  it('with alerts and nothing new: only the alerts list is read', () => {
    expect(partsToRead({ alertsOn: true, sinceFullMs: MIN, fresh: [] })).toEqual({ parts: [], full: false });
  });

  it('a new alert reads its own list at once', () => {
    expect(partsToRead({ alertsOn: true, sinceFullMs: MIN, fresh: ['plan_request', 'member_complaint', 'shop_order', 'member_joined'] }).parts).toEqual([
      'plan',
      'messages',
      'orders',
    ]);
    expect(partsToRead({ alertsOn: true, sinceFullMs: MIN, fresh: ['phone_link'] }).parts).toEqual(['links']);
    expect(partsToRead({ alertsOn: true, sinceFullMs: MIN, fresh: ['trainer_question'] }).parts).toEqual(['questions']);
  });

  it('every few minutes all lists anyway (another desk may have answered one); the first look reads them all', () => {
    expect(partsToRead({ alertsOn: true, sinceFullMs: LISTS_EVERY_MS, fresh: [] }).full).toBe(true);
    expect(partsToRead({ alertsOn: true, sinceFullMs: Infinity, fresh: [] }).parts).toHaveLength(4);
  });
});
