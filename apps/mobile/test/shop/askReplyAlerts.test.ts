/**
 * R-533 (owner, 14 Nov 2026): "when I responded back from the admin panel, there was no notification... and there was
 * no dot or something in that section saying that there's something to be checked." The phone half, with stand-ins for
 * the phone and the gym's server: a reply's push sets the red count at once (Gym tab and row); the 15-minute check pops
 * up a reply the push missed, once, with the push's own id; opening the page clears the count; a member who may not
 * see the row gets no count.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mem = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (k: string) => mem.get(k) ?? null,
    setItem: async (k: string, v: string) => void mem.set(k, v),
    removeItem: async (k: string) => void mem.delete(k),
  },
}));

const gym = vi.hoisted(() => ({ questions: [] as unknown[], askFail: false, asks: 0, access: { kind: 'open' } as unknown }));
vi.mock('@/shop/gymActions', async () => {
  const { useGymInbox } = await import('@/shop/inboxStore');
  return {
    refreshInbox: async () => {
      useGymInbox.getState().setList('m1', [] as never);
      return null;
    },
  };
});
vi.mock('@/db', () => ({ initDb: async () => undefined }));
vi.mock('@/onboarding/db/dataActions', () => ({ isDemoData: async () => false }));
vi.mock('@/shop/gymApi', () => ({
  apiMessages: async () => ({ ok: true, data: [] }),
  apiAskQuestions: async () => {
    gym.asks += 1;
    return gym.askFail ? { ok: false, error: { kind: 'offline' } } : { ok: true, data: gym.questions };
  },
}));
vi.mock('@/shop/askAccessRead', () => ({ readAskAccess: async () => gym.access }));

import type { AskQuestion } from '@/shop/askTrainer';
import { ASK_ALERTED_KEY, askUnreadFor, refreshAskUnread, resetAskRepliesForTests, saveAskSeen, useAskReplies } from '@/shop/askReplySync';
import { useGymShop } from '@/shop/gymStore';
import { useGymInbox } from '@/shop/inboxStore';
import { GYM_NOTICE_CHANNEL, onPushArrived, runNoticeCheck, setNoticeAppInFrontForTest, setNoticeNotificationsForTest } from '@/shop/noticeAlertsRun';
import { usePhonePrefs } from '@/tracker/phone/phonePrefs';

const LINK = { memberKey: 'k1', memberId: 'm1', gymId: 'g1', gymName: "RAM'S FITNESS", joinCode: 'ABC123', name: 'Asha', brand: null };
const ID_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const ID_B = 'bbbbbbbb-0000-0000-0000-000000000002';
const ID_OLD = 'cccccccc-0000-0000-0000-000000000003';

const q = (id: string, answeredAt: number | null, answeredBy: string | null = 'Rohit'): AskQuestion => ({
  id,
  question: 'How many sets?',
  trainer: null,
  askedAt: 1000,
  answer: answeredAt ? 'Three sets of ten.' : null,
  answeredBy: answeredAt ? answeredBy : null,
  answeredAt,
  withdrawn: false,
  open: !answeredAt,
});

const shown: { id: string; title: string; body: string; channelId: string; data: Record<string, unknown> }[] = [];
let granted = true;
const dismissed: string[] = [];
const fake = {
  dismissNotificationAsync: async (id: string) => void dismissed.push(id),
  AndroidImportance: { HIGH: 4 },
  getPermissionsAsync: async () => ({ granted }),
  setNotificationChannelAsync: async () => undefined,
  scheduleNotificationAsync: async (r: { identifier: string; content: { title: string; body: string; data: Record<string, unknown> }; trigger: { channelId: string } }) => {
    shown.push({ id: r.identifier, title: r.content.title, body: r.content.body, channelId: r.trigger.channelId, data: r.content.data });
  },
};

const pushed = (id: string, gymId = 'g1') => ({
  data: { title: "RAM'S FITNESS", message: 'Rohit replied: Three sets of ten.', push: 'reply', noticeId: id, gymId, body: JSON.stringify({ kind: 'gym-message', route: '/shop/ask', push: 'reply', noticeId: id, gymId }) },
  notification: null,
});
const count = (): number => askUnreadFor(useAskReplies.getState(), 'm1');

// The saved stores are read once (else every check waits 5 s for them).
beforeAll(async () => {
  await Promise.all([useGymShop.persist.rehydrate(), usePhonePrefs.persist.rehydrate(), useGymInbox.persist.rehydrate()]);
});

beforeEach(() => {
  mem.clear();
  shown.length = 0;
  dismissed.length = 0;
  granted = true;
  gym.questions = [];
  gym.askFail = false;
  gym.asks = 0;
  gym.access = { kind: 'open' };
  resetAskRepliesForTests();
  setNoticeAppInFrontForTest(false);
  setNoticeNotificationsForTest(fake);
  usePhonePrefs.setState({ gymMessagesOn: true });
  useGymShop.setState({ link: LINK });
  useGymInbox.getState().clear();
});

describe('a reply’s push arrives', () => {
  it('the red count shows at once, and the 15-minute check never pops it up again', async () => {
    gym.questions = [q(ID_OLD, 2000)];
    await runNoticeCheck(); // the first look: remembers the old reply, pops up none
    expect(shown).toEqual([]);
    gym.questions = [q(ID_A, 9000), q(ID_OLD, 2000)];
    await onPushArrived(pushed(ID_A));
    expect(count()).toBe(2); // neither reply was opened on this phone yet
    await runNoticeCheck();
    expect(shown).toEqual([]);
    expect(dismissed).toEqual([]);
  });

  it('from another gym, or with gym messages off: taken away, no count', async () => {
    gym.questions = [q(ID_A, 9000)];
    await onPushArrived(pushed(ID_A, 'other-gym'));
    usePhonePrefs.setState({ gymMessagesOn: false });
    await onPushArrived(pushed(ID_B));
    expect(dismissed).toEqual([`trainer-reply-${ID_A}`, `trainer-reply-${ID_B}`]);
    expect(count()).toBe(0);
    expect(gym.asks).toBe(0);
  });
});

describe('the 15-minute check (the push missed the reply)', () => {
  it('pops it up once, with the push’s own id, words and tap', async () => {
    gym.questions = [q(ID_OLD, 2000)];
    await saveAskSeen('m1', gym.questions as AskQuestion[]); // the old reply was read on the page
    await runNoticeCheck();
    gym.questions = [q(ID_A, 9000), q(ID_OLD, 2000)];
    await runNoticeCheck();
    expect(shown).toEqual([
      {
        id: `trainer-reply-${ID_A}`,
        title: "RAM'S FITNESS",
        body: 'Rohit replied: Three sets of ten.',
        channelId: GYM_NOTICE_CHANNEL,
        data: { kind: 'gym-message', route: '/shop/ask', push: 'reply', noticeId: ID_A, gymId: 'g1' },
      },
    ]);
    expect(count()).toBe(1);
    await runNoticeCheck();
    expect(shown).toHaveLength(1);
    expect((JSON.parse(mem.get(ASK_ALERTED_KEY) ?? '{}') as { ids: string[] }).ids).toEqual([ID_OLD, ID_A]);
  });

  it('no name: "Your gym replied"', async () => {
    await runNoticeCheck();
    gym.questions = [q(ID_A, 9000, null)];
    await runNoticeCheck();
    expect(shown.map((s) => s.body)).toEqual(['Your gym replied: Three sets of ten.']);
  });

  it('with the app in front: no pop-up, the red count says it', async () => {
    await runNoticeCheck();
    gym.questions = [q(ID_A, 9000)];
    setNoticeAppInFrontForTest(true);
    await runNoticeCheck();
    expect(shown).toEqual([]);
    expect(count()).toBe(1);
    setNoticeAppInFrontForTest(false);
    await runNoticeCheck();
    expect(shown).toEqual([]); // never later either
  });

  it('notifications not allowed: no pop-up, the count still shows', async () => {
    await runNoticeCheck();
    gym.questions = [q(ID_A, 9000)];
    granted = false;
    await runNoticeCheck();
    expect(shown).toEqual([]);
    expect(count()).toBe(1);
  });
});

describe('the red count', () => {
  it('opening the page clears it, and it does not come back', async () => {
    gym.questions = [q(ID_A, 9000), q(ID_B, 5000)];
    await refreshAskUnread(LINK, { force: true });
    expect(count()).toBe(2);
    await saveAskSeen('m1', gym.questions as AskQuestion[]);
    expect(count()).toBe(0);
    await refreshAskUnread(LINK, { force: true });
    expect(count()).toBe(0);
    // An older copy of the list read later never moves "opened" backwards.
    await saveAskSeen('m1', [q(ID_B, 5000)]);
    await refreshAskUnread(LINK, { force: true });
    expect(count()).toBe(0);
  });

  it('a member who may not see the row (a pass member) gets no count', async () => {
    gym.questions = [q(ID_A, 9000)];
    gym.access = { kind: 'hidden' };
    await refreshAskUnread(LINK, { force: true });
    expect(count()).toBe(0);
    await runNoticeCheck();
    expect(count()).toBe(0);
  });

  it('offline: the count stays as it was', async () => {
    gym.questions = [q(ID_A, 9000)];
    await refreshAskUnread(LINK, { force: true });
    gym.askFail = true;
    await refreshAskUnread(LINK, { force: true });
    expect(count()).toBe(1);
  });

  it('asked at most every 5 minutes without a reason', async () => {
    await refreshAskUnread(LINK);
    await refreshAskUnread(LINK);
    expect(gym.asks).toBe(1);
    await refreshAskUnread(LINK, { force: true });
    expect(gym.asks).toBe(2);
  });

  it('another member on this phone never sees the first one’s count', async () => {
    gym.questions = [q(ID_A, 9000)];
    await refreshAskUnread(LINK, { force: true });
    expect(askUnreadFor(useAskReplies.getState(), 'someone-else')).toBe(0);
  });
});
