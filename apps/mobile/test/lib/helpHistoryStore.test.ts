/**
 * R-452: the check when the app opens or comes back to the front (lib/helpHistoryStore.ts
 * checkHelpReplies) and the pop-up for a reply (lib/helpReplyAlert.ts), with stand-ins for the phone's
 * database, the help box and the notifications: no live server.
 *  - one request with the secrets of the recent questions; none at all when nothing was asked;
 *  - a new reply raises the red dot's count and gets ONE pop-up; asking again pops up nothing;
 *  - at most one ask a minute;
 *  - a saved list that could not be read is never written over (it kept every question before);
 *  - the pop-up only when notifications are already allowed (never asks), on the gym messages channel.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const meta = vi.hoisted(() => ({ rows: new Map<string, string>(), failReads: 0 }));
vi.mock('@/db', () => ({
  getMeta: async (k: string) => {
    if (meta.failReads > 0) {
      meta.failReads -= 1;
      throw new Error('database busy');
    }
    return meta.rows.get(k) ?? null;
  },
  setMeta: async (k: string, v: string) => void meta.rows.set(k, v),
}));
vi.mock('@/db/writeQueue', () => ({ enqueueWrite: async <T,>(fn: () => Promise<T>) => fn() }));
const net = vi.hoisted(() => ({ calls: [] as { url: string; body: { sender: string; keys: string[] } }[], replies: [] as { text: string; at: string }[] }));
vi.mock('@/lib/fetchTimeout', () => ({
  fetchWithTimeout: async (url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as { sender: string; keys: string[] };
    net.calls.push({ url, body });
    const items = body.keys.map((key) => ({ key, id: 78, answer: 'Open Gym, then Pause.', covered: 'no', reply: '', replyAt: '', replies: net.replies }));
    return new Response(JSON.stringify({ items }), { status: 200 });
  },
}));
vi.mock('@/shop/noticeAlertsRun', () => ({ GYM_NOTICE_CHANNEL: 'gym-messages', ensureNoticeChannel: async () => undefined }));

import { unreadReplies } from '@/lib/helpHistory';
import { checkHelpReplies, resetHelpCheckForTest, useHelpHistory } from '@/lib/helpHistoryStore';
import { helpReplyAlertWords, HELP_REPLY_ROUTE, setHelpAlertNotificationsForTest, showHelpReplyAlert } from '@/lib/helpReplyAlert';

const KEY = 'aaaaaaaa-1111-2222-3333-444444444444-x';
const R1 = { text: 'Yes, up to 30 days.', at: '2026-11-12T05:13:43.678Z' };
const R2 = { text: 'Correction: 45 days for yearly plans.', at: '2026-11-12T05:20:00.000Z' };

function deps(now = Date.now()) {
  const alerts: number[] = [];
  return { alerts, d: { sender: async () => 'install-12345678', alert: async (n: number) => void alerts.push(n), now: () => now } };
}

beforeEach(() => {
  meta.rows.clear();
  meta.failReads = 0;
  net.calls.length = 0;
  net.replies = [];
  resetHelpCheckForTest();
  useHelpHistory.getState().forget();
});

describe('the reply check when the app opens (R-452)', () => {
  it('asks nothing when this phone never asked a question', async () => {
    const { d, alerts } = deps();
    expect(await checkHelpReplies(d)).toBe(0);
    expect(net.calls).toHaveLength(0);
    expect(alerts).toEqual([]);
  });

  it('one request with the recent secrets; a new reply raises the dot and pops up once', async () => {
    await useHelpHistory.getState().add(KEY, 'Can I pause my plan?');
    await useHelpHistory.getState().settle(KEY, { id: 78, answer: 'Open Gym, then Pause.', ai: true, covered: false });
    const t = deps();
    expect(await checkHelpReplies(t.d, true)).toBe(0); // no reply yet
    expect(net.calls).toHaveLength(1);
    expect(net.calls[0].body).toEqual({ sender: 'install-12345678', keys: [KEY] });

    net.replies = [R1];
    expect(await checkHelpReplies(t.d, true)).toBe(1);
    expect(t.alerts).toEqual([1]);
    expect(unreadReplies(useHelpHistory.getState().items)).toBe(1);
    // Kept on the phone.
    expect(JSON.parse(meta.rows.get('help_questions') ?? '[]')[0].replies).toEqual([R1]);

    // Asked again: no second pop-up for the same reply; the dot stays until it is read.
    expect(await checkHelpReplies(t.d, true)).toBe(0);
    expect(t.alerts).toEqual([1]);
    expect(unreadReplies(useHelpHistory.getState().items)).toBe(1);

    // A correction: one more pop-up; read on screen, the dot goes.
    net.replies = [R1, R2];
    expect(await checkHelpReplies(t.d, true)).toBe(1);
    expect(unreadReplies(useHelpHistory.getState().items)).toBe(2);
    await useHelpHistory.getState().markSeen([KEY]);
    expect(unreadReplies(useHelpHistory.getState().items)).toBe(0);
  });

  it('at most one ask a minute when the app keeps coming to the front', async () => {
    await useHelpHistory.getState().add(KEY, 'Q');
    const t0 = Date.now();
    await checkHelpReplies(deps(t0).d);
    await checkHelpReplies(deps(t0 + 30_000).d);
    expect(net.calls).toHaveLength(1);
    await checkHelpReplies(deps(t0 + 61_000).d);
    expect(net.calls).toHaveLength(2);
  });

  it('a question older than 30 days is not asked about when the app opens', async () => {
    await useHelpHistory.getState().add(KEY, 'Q');
    const later = Date.now() + 31 * 24 * 60 * 60 * 1000;
    await checkHelpReplies(deps(later).d, true);
    expect(net.calls).toHaveLength(0);
  });

  it('a saved list that could not be read is never written over by the next question', async () => {
    meta.rows.set('help_questions', JSON.stringify([{ key: 'bbbbbbbb-1111-2222-3333-444444444444-y', text: 'Old', at: 1, replies: [] }]));
    meta.failReads = 2; // the first read and the retry before the save both fail
    await useHelpHistory.getState().add(KEY, 'New');
    expect(JSON.parse(meta.rows.get('help_questions') ?? '[]').map((q: { text: string }) => q.text)).toEqual(['Old']);
    // Once a read works, both are kept.
    await useHelpHistory.getState().settle(KEY, { id: 1, answer: '', ai: false });
    expect(JSON.parse(meta.rows.get('help_questions') ?? '[]').map((q: { text: string }) => q.text)).toEqual(['New', 'Old']);
  });
});

describe('the pop-up for a reply (R-452)', () => {
  it('only when notifications are allowed; never asks; on the gym messages channel; a tap opens Help and feedback', async () => {
    const shown: unknown[] = [];
    let asked = 0;
    const fake = (granted: boolean) => ({
      getPermissionsAsync: async () => ({ granted }),
      requestPermissionsAsync: async () => {
        asked += 1;
        return { granted: true };
      },
      scheduleNotificationAsync: async (r: unknown) => void shown.push(r),
    });
    setHelpAlertNotificationsForTest(fake(false));
    await showHelpReplyAlert(1);
    expect(shown).toEqual([]);
    setHelpAlertNotificationsForTest(fake(true));
    await showHelpReplyAlert(2);
    expect(asked).toBe(0);
    expect(shown).toEqual([
      {
        identifier: 'help-reply-local',
        content: { title: 'The MettleUp team answered your question', body: '2 new replies. Tap to read the answer.', data: { kind: 'gym-message', route: HELP_REPLY_ROUTE, push: 'help_reply' } },
        trigger: { channelId: 'gym-messages' },
      },
    ]);
    expect(helpReplyAlertWords(1)).toEqual({ title: 'The MettleUp team answered your question', body: 'Tap to read the answer.' });
    setHelpAlertNotificationsForTest(null);
    await showHelpReplyAlert(1); // no notifications module (iPhone today): quiet
    expect(shown).toHaveLength(1);
  });
});
