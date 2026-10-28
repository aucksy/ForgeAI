/**
 * Gym notices that pop up (shop/noticeAlertsRun.ts) with stand-ins for the phone: no live server,
 * no real notifications. The first check after joining shows nothing, a later new notice shows ONE
 * pop-up on its own channel, the same notice never twice, nothing with the app in front (but it is
 * remembered), nothing when the switch is off, demo data, or Android blocks notifications.
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

import { useGymShop } from '@/shop/gymStore';
import { useGymInbox } from '@/shop/inboxStore';
import { afterInboxRefresh, forgetNoticeAlerts, GYM_NOTICE_ALERTS_KEY, GYM_NOTICE_CHANNEL, runNoticeCheck, setNoticeAppInFrontForTest, setNoticeNotificationsForTest } from '@/shop/noticeAlertsRun';
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
const fake = {
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

describe('the background check', () => {
  it('the first check shows nothing and remembers the old notices; a new one then shows ONE pop-up', async () => {
    gym.server = [row('a', 'Old news', 600), row('b', 'Older news', 900)];
    expect(await runNoticeCheck()).toBe(true);
    expect(shown).toEqual([]);
    expect(JSON.parse(mem.get(GYM_NOTICE_ALERTS_KEY)!)).toMatchObject({ memberId: 'm1', ids: ['b', 'a'] });

    gym.server = [row('c', 'Gym closed on Diwali', 1), row('a', 'Old news', 600), row('b', 'Older news', 900)];
    await runNoticeCheck();
    expect(shown).toEqual([
      { id: 'gym-notice-c', title: "RAM'S FITNESS", body: 'Gym closed on Diwali', channelId: GYM_NOTICE_CHANNEL, data: { kind: 'gym-message', route: '/shop/inbox' } },
    ]);
    expect(channels).toEqual([{ id: 'gym-messages', name: 'Messages from your gym', importance: 4 }]);
    // The inbox store has it too, so the bell is right when the app opens.
    expect(useGymInbox.getState().messages.map((m) => m.id)).toContain('c');
  });

  it('the same notice is never shown twice', async () => {
    gym.server = [row('a', 'Old', 600)];
    await runNoticeCheck();
    gym.server = [row('c', 'New', 1), row('a', 'Old', 600)];
    await runNoticeCheck();
    await runNoticeCheck();
    expect(shown).toHaveLength(1);
  });

  it('more than three new at once: one pop-up', async () => {
    await runNoticeCheck();
    gym.server = [row('1', 'One', 4), row('2', 'Two', 3), row('3', 'Three', 2), row('4', 'Four', 1)];
    await runNoticeCheck();
    expect(shown.map((s) => [s.title, s.body])).toEqual([['4 new messages from RAM\'S FITNESS', 'Tap to read them.']]);
  });

  it('a notice already seen on the phone is skipped', async () => {
    await runNoticeCheck();
    gym.server = [row('s', 'Seen at the desk', 2, true)];
    await runNoticeCheck();
    expect(shown).toEqual([]);
  });

  it('with the app in front nothing pops up, and the background job does not pop it up later', async () => {
    await runNoticeCheck();
    gym.server = [row('n', 'News', 1)];
    setNoticeAppInFrontForTest(true);
    await afterInboxRefresh('m1', gym.server as never);
    expect(shown).toEqual([]);
    setNoticeAppInFrontForTest(false);
    await runNoticeCheck();
    expect(shown).toEqual([]);
  });

  it('nothing for a phone in no gym, with the switch off, or on demo data (the gym is not asked)', async () => {
    gym.server = [row('x', 'X', 1)];
    useGymShop.setState({ link: null });
    expect(await runNoticeCheck()).toBe(true);
    useGymShop.setState({ link: LINK });
    usePhonePrefs.setState({ gymMessagesOn: false });
    expect(await runNoticeCheck()).toBe(true);
    usePhonePrefs.setState({ gymMessagesOn: true });
    gym.demo = true;
    expect(await runNoticeCheck()).toBe(true);
    expect(gym.calls).toBe(0);
    expect(shown).toEqual([]);
  });

  it('a gym that cannot be reached: the job reports it and nothing is shown or remembered', async () => {
    gym.fail = true;
    expect(await runNoticeCheck()).toBe(false);
    expect(shown).toEqual([]);
    expect(mem.has(GYM_NOTICE_ALERTS_KEY)).toBe(false);
  });

  it('Android blocking notifications: nothing shows, and the notice is not held back for later', async () => {
    await runNoticeCheck();
    granted = false;
    gym.server = [row('c', 'News', 1)];
    await runNoticeCheck();
    expect(shown).toEqual([]);
    granted = true;
    await runNoticeCheck();
    expect(shown).toEqual([]);
  });

  it('another member, or forgetting (left the gym / switch off), starts with a first look again', async () => {
    gym.server = [row('a', 'Old', 600)];
    await runNoticeCheck();
    await forgetNoticeAlerts();
    expect(mem.has(GYM_NOTICE_ALERTS_KEY)).toBe(false);
    gym.server = [row('a', 'Old', 600), row('b', 'Newer', 1)];
    await runNoticeCheck();
    expect(shown).toEqual([]);
  });
});
