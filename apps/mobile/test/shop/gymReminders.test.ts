/**
 * R-86: the gym reminders on the phone (shop/gymReminders.ts) with a stand-in notifications module:
 * set from the gym's answers, set again only when something changed, a renewal cancels "ends soon",
 * the member's switch and leaving the gym cancel everything, and a server without 0029 means the
 * defaults and one log line (never an error).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mem = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (k: string) => mem.get(k) ?? null,
    setItem: async (k: string, v: string) => void mem.set(k, v),
    removeItem: async (k: string) => void mem.delete(k),
  },
}));

const api = vi.hoisted(() => ({ auto: null as unknown, plan: null as unknown, calls: [] as string[] }));
vi.mock('@/shop/gymApi', () => ({
  apiAutoReminders: async () => {
    api.calls.push('member_auto_reminders');
    return api.auto;
  },
  apiMembership: async () => {
    api.calls.push('member_membership');
    return api.plan;
  },
}));

import { autoAnswerFromRow } from '@/shop/autoReminders';
import { useGymShop } from '@/shop/gymStore';
import {
  GYM_REMINDERS_KEY,
  GYM_REMINDER_STORAGE_KEYS,
  cancelGymReminders,
  forgetGymReminders,
  refreshGymReminders,
  setGymNotificationsForTest,
  syncGymReminders,
} from '@/shop/gymReminders';
import { membershipFromRow } from '@/shop/membership';
import { usePhonePrefs } from '@/tracker/phone/phonePrefs';

/** A stand-in for expo-notifications: what is set, and how often Android was touched. */
const set = new Map<string, { title: string; body: string; date: number; channelId: string; data: Record<string, unknown> }>();
let writes = 0;
const fake = {
  AndroidImportance: { DEFAULT: 3 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
  getAllScheduledNotificationsAsync: async () => [...set.keys()].map((identifier) => ({ identifier })),
  cancelScheduledNotificationAsync: async (id: string) => {
    writes += 1;
    set.delete(id);
  },
  scheduleNotificationAsync: async (r: { identifier: string; content: { title: string; body: string; data: Record<string, unknown> }; trigger: { date: number; channelId: string } }) => {
    writes += 1;
    set.set(r.identifier, { title: r.content.title, body: r.content.body, date: r.trigger.date, channelId: r.trigger.channelId, data: r.content.data });
  },
  setNotificationChannelAsync: async () => undefined,
};

const LINK = { memberKey: 'k1', memberId: 'm1', gymId: 'g1', gymName: "RAM'S FITNESS", joinCode: 'ABC123', name: 'Asha', brand: null };
const planRow = (over: Record<string, unknown> = {}) => ({
  ok: true,
  gymName: "RAM'S FITNESS",
  memberName: 'Asha',
  day: '2026-10-23',
  current: { planName: 'Monthly', startsOn: '2026-10-03', endsOn: '2026-11-02', ptSessions: null, ptUsed: 0, trainer: null },
  next: null,
  lastEndedOn: '2026-10-02',
  visitsThisMonth: 9,
  ...over,
});
const days = () => [...set.keys()].map((id) => id.replace('forgeai-gym-', '')).sort();

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 23, 8, 0));
});
afterAll(() => vi.useRealTimers());

beforeEach(() => {
  mem.clear();
  set.clear();
  writes = 0;
  api.calls = [];
  api.auto = { ok: false, missing: true };
  api.plan = { ok: true, data: membershipFromRow(planRow()) };
  setGymNotificationsForTest(fake);
  usePhonePrefs.setState({ gymRemindersOn: true });
  useGymShop.setState({ link: LINK });
});

describe('gym reminders on the phone', () => {
  it('a server without 0029: the defaults, one log line, no error', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await syncGymReminders();
    await syncGymReminders();
    expect(api.calls).toContain('member_auto_reminders');
    expect(days()).toEqual(['2026-10-26', '2026-10-30', '2026-11-02', '2026-11-03', '2026-11-09']);
    const first = set.get('forgeai-gym-2026-10-26')!;
    expect(first).toMatchObject({ title: "RAM'S FITNESS", channelId: 'gym-reminders', data: { kind: 'gym', route: '/shop' } });
    expect(new Date(first.date).getHours()).toBe(9);
    expect(log.mock.calls.filter((c) => String(c[0]).includes('no automatic reminders yet'))).toHaveLength(1);
    expect(warn).not.toHaveBeenCalled();
    log.mockRestore();
    warn.mockRestore();
  });

  it("follows the owner's switches from the server, and touches Android only when something changed", async () => {
    api.auto = { ok: true, data: autoAnswerFromRow({ ok: true, settings: { plan_ended: { on: false }, plan_ends_soon: { on: true, days: [3] } }, birthday: '11-10', joinedOn: null, lastVisitOn: null }) };
    await syncGymReminders();
    expect(days()).toEqual(['2026-10-30', '2026-11-02', '2026-11-10']);
    expect(set.get('forgeai-gym-2026-11-10')!.body).toBe("Happy birthday, Asha! Best wishes from all of us at RAM'S FITNESS.");
    const before = writes;
    await refreshGymReminders();
    await syncGymReminders();
    expect(writes).toBe(before);
    // Offline next time: what the phone kept still sets the same reminders.
    api.auto = { ok: false, error: { kind: 'offline' } };
    api.plan = { ok: false, error: { kind: 'offline' } };
    await syncGymReminders();
    expect(days()).toEqual(['2026-10-30', '2026-11-02', '2026-11-10']);
    expect(mem.has(GYM_REMINDERS_KEY)).toBe(true);
  });

  it('a renewal cancels "ends soon", "ends today" and "ended"', async () => {
    await syncGymReminders();
    expect(days()).toHaveLength(5);
    api.plan = { ok: true, data: membershipFromRow(planRow({ next: { planName: 'Monthly', startsOn: '2026-11-03', endsOn: '2026-12-02' } })) };
    await syncGymReminders();
    expect(days()).toEqual([]);
  });

  it("the member's switch off cancels them all; on sets them again", async () => {
    await syncGymReminders();
    usePhonePrefs.setState({ gymRemindersOn: false });
    await cancelGymReminders();
    expect(days()).toEqual([]);
    await refreshGymReminders();
    expect(days()).toEqual([]);
    usePhonePrefs.setState({ gymRemindersOn: true });
    await refreshGymReminders();
    expect(days()).toHaveLength(5);
  });

  it('leaving the gym cancels every one and forgets what was kept', async () => {
    await syncGymReminders();
    useGymShop.setState({ link: null });
    await forgetGymReminders();
    expect(days()).toEqual([]);
    for (const k of GYM_REMINDER_STORAGE_KEYS) expect(mem.has(k)).toBe(false);
    // A sync after leaving sets nothing (and asks nothing).
    api.calls = [];
    await syncGymReminders();
    expect(days()).toEqual([]);
    expect(api.calls).toEqual([]);
  });

  it('only gym reminders are touched (the workout reminders stay)', async () => {
    set.set('forgeai-reminder-w0', { title: 'Time to train', body: '', date: 0, channelId: 'workout-reminders', data: {} });
    await syncGymReminders();
    await cancelGymReminders();
    expect([...set.keys()]).toEqual(['forgeai-reminder-w0']);
  });

  it('with no notifications module (web, tests), nothing throws', async () => {
    setGymNotificationsForTest(null);
    await expect(syncGymReminders()).resolves.toBeUndefined();
    await expect(cancelGymReminders()).resolves.toBeUndefined();
  });
});
