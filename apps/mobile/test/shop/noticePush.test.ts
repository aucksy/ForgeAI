/**
 * R-153 step 2: a push from the gym arrived (shop/noticeAlertsRun.ts onPushArrived), with stand-ins
 * for the phone. Android shows the pushed pop-up itself; the app then remembers the notice, so the
 * 15-minute check never pops it up a second time, and takes away a push it should not show.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mem = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (k: string) => mem.get(k) ?? null,
    setItem: async (k: string, v: string) => void mem.set(k, v),
    removeItem: async (k: string) => void mem.delete(k),
  },
}));

const gym = vi.hoisted(() => ({ server: [] as unknown[], fail: false, calls: 0, demo: false }));
vi.mock('@/shop/gymActions', async () => {
  const { useGymInbox } = await import('@/shop/inboxStore');
  return {
    refreshInbox: async () => {
      gym.calls += 1;
      if (gym.fail) return "No internet — showing the last messages.";
      useGymInbox.getState().setList('m1', gym.server as never);
      return null;
    },
  };
});
vi.mock('@/db', () => ({ initDb: async () => undefined }));
vi.mock('@/onboarding/db/dataActions', () => ({ isDemoData: async () => gym.demo }));
vi.mock('@/shop/gymApi', () => ({ apiMessages: async () => ({ ok: true, data: gym.server }) }));

import { useGymShop } from '@/shop/gymStore';
import { useGymInbox } from '@/shop/inboxStore';
import { GYM_NOTICE_ALERTS_KEY, onPushArrived, runNoticeCheck, setNoticeAppInFrontForTest, setNoticeNotificationsForTest } from '@/shop/noticeAlertsRun';
import { usePhonePrefs } from '@/tracker/phone/phonePrefs';

const LINK = { memberKey: 'k1', memberId: 'm1', gymId: 'g1', gymName: "RAM'S FITNESS", joinCode: 'ABC123', name: 'Asha', brand: null };
const row = (id: string, title: string, minsAgo = 5, seen = false) => ({
  id,
  kind: 'announcement',
  title,
  body: 'More',
  createdAt: new Date(Date.now() - minsAgo * 60000).toISOString(),
  seen,
});

const shown: { id: string; title: string; body: string; channelId: string; data: Record<string, unknown> }[] = [];
const channels: { id: string; name: string; importance: number }[] = [];
let granted = true;
const dismissed: string[] = [];
const fake = {
  dismissNotificationAsync: async (id: string) => void dismissed.push(id),
  AndroidImportance: { HIGH: 4 },
  getPermissionsAsync: async () => ({ granted }),
  setNotificationChannelAsync: async (id: string, c: { name: string; importance: number }) => void channels.push({ id, name: c.name, importance: c.importance }),
  scheduleNotificationAsync: async (r: { identifier: string; content: { title: string; body: string; data: Record<string, unknown> }; trigger: { channelId: string } }) => {
    shown.push({ id: r.identifier, title: r.content.title, body: r.content.body, channelId: r.trigger.channelId, data: r.content.data });
  },
};

beforeEach(() => {
  mem.clear();
  shown.length = 0;
  channels.length = 0;
  dismissed.length = 0;
  granted = true;
  setNoticeAppInFrontForTest(false);
  gym.server = [];
  gym.fail = false;
  gym.calls = 0;
  gym.demo = false;
  setNoticeNotificationsForTest(fake);
  usePhonePrefs.setState({ gymMessagesOn: true });
  useGymShop.setState({ link: LINK });
  useGymInbox.getState().clear();
});

const ID_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const ID_B = 'bbbbbbbb-0000-0000-0000-000000000002';
const pushed = (id: string, push = 'message', gymId = 'g1') => ({
  data: { title: "RAM'S FITNESS", message: 'Closed', push, noticeId: id, gymId, body: JSON.stringify({ kind: 'gym-message', push, noticeId: id, gymId }) },
  notification: null,
});
const alerted = (): string[] => (JSON.parse(mem.get(GYM_NOTICE_ALERTS_KEY) ?? '{"ids":[]}') as { ids: string[] }).ids;

describe('a push arrives', () => {
  it('the pushed message is remembered, so the 15-minute check never pops it up again', async () => {
    gym.server = [row('old', 'Old news', 600)];
    await runNoticeCheck(); // first look: remembers "old"
    gym.server = [row(ID_A, 'Closed on Sunday', 1), row('old', 'Old news', 600)];
    await onPushArrived(pushed(ID_A));
    expect(alerted()).toContain(ID_A);
    expect(gym.calls).toBe(2); // the bell is read again
    await runNoticeCheck();
    expect(shown).toEqual([]);
    expect(dismissed).toEqual([]);
  });

  it('a push before the first look also remembers what the inbox already held (no flood later)', async () => {
    gym.server = [row(ID_B, 'Yoga day', 1), row('old', 'Old news', 60)];
    await onPushArrived(pushed(ID_B));
    expect(alerted().sort()).toEqual([ID_B, 'old'].sort());
    await runNoticeCheck();
    expect(shown).toEqual([]);
  });

  it('the same push twice is kept once', async () => {
    await onPushArrived(pushed(ID_A));
    await onPushArrived(pushed(ID_A));
    expect(alerted().filter((x) => x === ID_A)).toHaveLength(1);
  });

  it('an offer is not a message: nothing kept, nothing taken away', async () => {
    await onPushArrived(pushed(ID_A, 'offer'));
    expect(mem.has(GYM_NOTICE_ALERTS_KEY)).toBe(false);
    expect(dismissed).toEqual([]);
  });

  it('takes the pop-up away with the switch off, after leaving, or from another gym', async () => {
    usePhonePrefs.setState({ gymMessagesOn: false });
    await onPushArrived(pushed(ID_A));
    usePhonePrefs.setState({ gymMessagesOn: true });
    await onPushArrived(pushed(ID_B, 'message', 'other-gym'));
    useGymShop.setState({ link: null });
    await onPushArrived(pushed(ID_A, 'offer'));
    expect(dismissed).toEqual([`gym-notice-${ID_A}`, `gym-notice-${ID_B}`, `gym-offer-${ID_A}`]);
    expect(mem.has(GYM_NOTICE_ALERTS_KEY)).toBe(false);
  });

  it('anything that is not our push is ignored', async () => {
    await onPushArrived({ data: { kind: 'rest' } });
    await onPushArrived(null);
    expect(dismissed).toEqual([]);
    expect(gym.calls).toBe(0);
  });
});
