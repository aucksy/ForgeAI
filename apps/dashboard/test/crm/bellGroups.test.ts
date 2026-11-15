/**
 * R-561 (owner, 15 Nov 2026): the bell panel in three groups (Your gym, From MettleUp, What's new) with counts, payment
 * notices with their own tone, the bell's count of new gym alerts, the top bar's one Refresh for the whole panel, and
 * the Hinglish of every word these draw through t().
 */
import { describe, expect, it, vi } from 'vitest';

import { HINGLISH } from '../../src/crm/lang/hinglish';
import {
  BELL_GROUPS,
  BELL_SEEN_KEY,
  BELL_SEEN_PREFIX,
  FIRST_LOOK_MS,
  PAY_WORDS,
  bellGroups,
  paymentTone,
  readBellSeen,
  saveBellSeen,
  unseenAlerts,
} from '../../src/crm/logic/bellGroups';
import { FRESH_WORDS } from '../../src/crm/logic/freshness';
import { onPanelRefresh, panelFreshAt, panelRefreshParts, runPanelRefresh, shortAge } from '../../src/crm/logic/panelRefresh';
import { PUSH_WORDS } from '../../src/crm/logic/webPush';

describe('payment notices', () => {
  it('a member who paid online is green (paid), by its kind', () => {
    expect(paymentTone({ kind: 'paid_online', line: 'Asha paid online for 3 months. See it on Money.' })).toBe('paid');
  });

  it('a failed or overdue payment is a problem; "said they paid" is to check; by the words, whatever the kind', () => {
    expect(paymentTone({ kind: 'member_message', line: 'Ravi’s payment failed. Ask him to try again.' } as never)).toBe('problem');
    expect(paymentTone({ kind: 'paid_online', line: 'The payment did not go through for Ravi.' })).toBe('problem');
    expect(paymentTone({ kind: 'plan_request', line: 'Ravi’s fee is due since Monday and is overdue.' })).toBe('problem');
    expect(paymentTone({ kind: 'member_message', line: 'Sunil said they paid by UPI. Check your bank.' } as never)).toBe('check');
  });

  it('everything else is not about money', () => {
    expect(paymentTone({ kind: 'member_question', line: 'Asha asked a workout question.' })).toBeNull();
    expect(paymentTone({ kind: 'member_joined', line: 'Ravi joined your gym.' })).toBeNull();
    expect(paymentTone({ kind: 'shop_order', line: 'Asha ordered a shaker from the shop.' })).toBeNull();
  });
});

describe('the bell groups', () => {
  it('in the owner’s order: Your gym, From MettleUp, What’s new', () => {
    expect(BELL_GROUPS.map((g) => g.title)).toEqual(['Your gym', 'From MettleUp', "What's new"]);
  });

  it('show their counts and leave an empty group out', () => {
    expect(bellGroups({ gym: 3, mettleup: 0, news: 2 })).toEqual([
      { id: 'gym', title: 'Your gym', count: 3 },
      { id: 'news', title: "What's new", count: 2 },
    ]);
    expect(bellGroups({ gym: 0, mettleup: 0, news: 0 })).toEqual([]);
  });
});

describe('which gym alerts are new to the bell', () => {
  const now = Date.UTC(2026, 10, 15, 6, 0);
  const list = [{ at: now - 60_000 }, { at: now - 2 * FIRST_LOOK_MS }];

  it('before any look: the last day; after a look: only the newer ones', () => {
    expect(unseenAlerts(list, null, now)).toEqual([list[0]]);
    expect(unseenAlerts(list, now - 30_000, now)).toEqual([]);
  });

  it('keeps the time it saw, and a browser that keeps nothing is quiet', () => {
    const kept = new Map<string, string>();
    const store = { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v) };
    expect(readBellSeen(store, 'g1')).toBeNull();
    saveBellSeen(store, 'g1', now);
    expect(readBellSeen(store, 'g1')).toBe(now);
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(readBellSeen(broken, 'g1')).toBeNull();
    expect(() => saveBellSeen(broken, 'g1', now)).not.toThrow();
    expect(readBellSeen(null, 'g1')).toBeNull();
    warn.mockRestore();
  });

  it('each branch keeps its own seen time (fresh-eyes review, 15 Nov 2026)', () => {
    const kept = new Map<string, string>();
    const store = { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v) };
    saveBellSeen(store, 'branch-a', now);
    expect(readBellSeen(store, 'branch-a')).toBe(now);
    // Opening branch A's bell does not mark branch B's alerts as seen.
    expect(readBellSeen(store, 'branch-b')).toBeNull();
    expect(unseenAlerts(list, readBellSeen(store, 'branch-b'), now)).toEqual([list[0]]);
    saveBellSeen(store, 'branch-b', now - 30_000);
    expect(readBellSeen(store, 'branch-a')).toBe(now);
    expect(readBellSeen(store, 'branch-b')).toBe(now - 30_000);
  });

  it('the old shared time is copied once to each gym that has none, so nothing old shows as new', () => {
    const kept = new Map<string, string>([[BELL_SEEN_KEY, String(now - 5_000)]]);
    const store = { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v) };
    expect(readBellSeen(store, 'g1')).toBe(now - 5_000);
    expect(kept.get(BELL_SEEN_PREFIX + 'g1')).toBe(String(now - 5_000));
    // After that the gym's own time wins, whatever the old one says.
    saveBellSeen(store, 'g1', now);
    kept.set(BELL_SEEN_KEY, String(now - 99_000));
    expect(readBellSeen(store, 'g1')).toBe(now);
    // Another branch that never had its own time also starts from the old one.
    expect(readBellSeen(store, 'g2')).toBe(now - 99_000);
  });
});

describe('one Refresh for the whole panel', () => {
  it('asks every part on the page, and leaves out a part that closed', async () => {
    const before = panelRefreshParts();
    const a = vi.fn(async () => true);
    const b = vi.fn(() => undefined);
    const offA = onPanelRefresh(a);
    const offB = onPanelRefresh(b);
    expect(panelRefreshParts()).toBe(before + 2);
    await expect(runPanelRefresh()).resolves.toBe(true);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    offB();
    await runPanelRefresh();
    expect(b).toHaveBeenCalledTimes(1);
    offA();
    expect(panelRefreshParts()).toBe(before);
  });

  it('says it failed when one part failed or threw, and still asks the others', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ok = vi.fn(async () => true);
    const offs = [onPanelRefresh(ok), onPanelRefresh(async () => false)];
    await expect(runPanelRefresh()).resolves.toBe(false);
    offs.push(
      onPanelRefresh(async () => {
        throw new Error('offline');
      }),
    );
    await expect(runPanelRefresh()).resolves.toBe(false);
    expect(ok).toHaveBeenCalledTimes(2);
    for (const off of offs) off();
    warn.mockRestore();
  });

  it('shows the older of the two timed reads', () => {
    expect(panelFreshAt(null, null)).toBeNull();
    expect(panelFreshAt(100, null)).toBe(100);
    expect(panelFreshAt(null, 200)).toBe(200);
    expect(panelFreshAt(300, 200)).toBe(200);
  });

  it('a short age for the phone’s top bar', () => {
    expect(shortAge(3_000)).toEqual({ key: 'now' });
    expect(shortAge(25_000)).toEqual({ key: '{n} s', vars: { n: 20 } });
    expect(shortAge(3 * 60_000 + 5_000)).toEqual({ key: '{n} min', vars: { n: 3 } });
    expect(shortAge(2 * 60 * 60_000)).toEqual({ key: '1 h+' });
  });
});

describe('Hinglish', () => {
  it('every word the bell and the top bar draw through t() has its Hinglish', () => {
    const drawn = [
      ...BELL_GROUPS.map((g) => g.title),
      ...Object.values(PAY_WORDS),
      ...Object.values(FRESH_WORDS),
      'now',
      '{n} s',
      '{n} min',
      '1 h+',
      'Notifications',
      PUSH_WORDS.bellTitle,
      PUSH_WORDS.bellText,
      PUSH_WORDS.bellLater,
      PUSH_WORDS.bellClose,
      PUSH_WORDS.offerYes,
      PUSH_WORDS.on,
      PUSH_WORDS.failed,
      PUSH_WORDS.blocked,
      PUSH_WORDS.noSupport,
      PUSH_WORDS.iphone,
      PUSH_WORDS.notReady,
    ];
    expect(drawn.filter((k) => !(k in HINGLISH))).toEqual([]);
  });
});
