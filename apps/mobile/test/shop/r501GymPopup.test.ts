/**
 * R-501 (owner, 14 Nov 2026): a gym message must pop up on the screen, not only land in the list.
 * expo-notifications 56 posts a "no sound" notification with setSilent(true) (androidx: the "silent" group,
 * GROUP_ALERT_SUMMARY), which Android's System UI never pops up. The old handler answer for a gym message
 * during a workout with the app open was exactly that, so it only went into the list. Now the library shows
 * nothing and the app posts the same message on a quiet HIGH channel, which pops up without a sound.
 * The phone itself is checked in the cloud (qa/run-device-qa.sh part_u501, notif.py gym-pop).
 */
import fs from 'node:fs';
import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shop/gymActions', () => ({ refreshInbox: async () => null }));

import {
  GYM_MESSAGE_KIND,
  GYM_MESSAGE_QUIET_KIND,
  GYM_QUIET_CHANNEL,
  gymPopupPlan,
  gymPopupsNote,
  quietCopyData,
} from '@/shop/gymPopup';
import { ensureNoticeChannel, GYM_NOTICE_CHANNEL, gymPopupsLine, repostGymMessageQuietly, setNoticeNotificationsForTest } from '@/shop/noticeAlertsRun';

const channels: { id: string; importance: number; sound?: string | null; enableVibrate?: boolean }[] = [];
const shown: { identifier: string; content: { title: string; body: string; data: Record<string, unknown> }; trigger: { channelId: string } }[] = [];
let granted = true;
let stored: { importance: number } | null = { importance: 4 };
const fake = {
  AndroidImportance: { HIGH: 4 },
  getPermissionsAsync: async () => ({ granted }),
  getNotificationChannelAsync: async () => stored,
  setNotificationChannelAsync: async (id: string, c: { importance: number; sound?: string | null; enableVibrate?: boolean }) =>
    void channels.push({ id, importance: c.importance, ...('sound' in c ? { sound: c.sound } : {}), ...('enableVibrate' in c ? { enableVibrate: c.enableVibrate } : {}) }),
  scheduleNotificationAsync: async (r: (typeof shown)[number]) => void shown.push(r),
};

beforeEach(() => {
  channels.length = 0;
  shown.length = 0;
  granted = true;
  stored = { importance: 4 };
  setNoticeNotificationsForTest(fake);
});

describe('the handler answer for a gym message with the app open', () => {
  it('no workout: pops up with its sound, as before', () => {
    expect(gymPopupPlan(GYM_MESSAGE_KIND, false)).toEqual({
      behavior: { shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false },
      repostQuietly: false,
    });
  });

  it('during a workout: never a "banner, no sound" answer (the library posts that silently: no pop-up)', () => {
    const plan = gymPopupPlan(GYM_MESSAGE_KIND, true)!;
    expect(plan.repostQuietly).toBe(true);
    // The library shows nothing itself; the app posts the quiet copy.
    expect(plan.behavior).toEqual({ shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false });
    // Regression: the 0.59-0.77 answer, which only reached the list.
    expect(plan.behavior).not.toEqual({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false });
  });

  it('the quiet copy may "play its sound" (its channel has none), so the library does not silence it', () => {
    for (const workout of [true, false]) {
      expect(gymPopupPlan(GYM_MESSAGE_QUIET_KIND, workout)).toEqual({
        behavior: { shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false },
        repostQuietly: false,
      });
    }
  });

  it('other notifications are not gym messages (the handler keeps its own answers)', () => {
    for (const k of ['rest', 'workout', 'gym', undefined, '']) expect(gymPopupPlan(k, true)).toBeNull();
  });
});

describe('the quiet copy', () => {
  it('keeps the tap (route) and ids, marked as the quiet copy', () => {
    expect(quietCopyData({ kind: 'gym-message', route: '/shop/inbox', push: 'message', noticeId: '7' })).toEqual({
      kind: GYM_MESSAGE_QUIET_KIND,
      route: '/shop/inbox',
      push: 'message',
      noticeId: '7',
    });
    expect(quietCopyData(null)).toEqual({ kind: GYM_MESSAGE_QUIET_KIND });
    expect(quietCopyData(['x'])).toEqual({ kind: GYM_MESSAGE_QUIET_KIND });
  });

  it('is posted under the SAME id (the push tag), the same words, on the quiet channel', async () => {
    await repostGymMessageQuietly({
      identifier: 'gym-notice-42',
      content: { title: "RAM'S FITNESS", body: 'Happy Chhath Puja', data: { kind: 'gym-message', route: '/shop/inbox' } },
    });
    expect(shown).toHaveLength(1);
    expect(shown[0]).toMatchObject({
      identifier: 'gym-notice-42',
      content: { title: "RAM'S FITNESS", body: 'Happy Chhath Puja', data: { kind: GYM_MESSAGE_QUIET_KIND, route: '/shop/inbox' } },
      trigger: { channelId: GYM_QUIET_CHANNEL },
    });
  });

  it('never throws when the phone refuses', async () => {
    setNoticeNotificationsForTest({ ...fake, scheduleNotificationAsync: async () => Promise.reject(new Error('no')) });
    await expect(repostGymMessageQuietly({ identifier: 'x', content: {} })).resolves.toBeUndefined();
  });
});

describe('the channels', () => {
  it('both HIGH (4, the only importance that pops up); the quiet one has no sound and no buzz', async () => {
    await ensureNoticeChannel();
    expect(channels).toEqual([
      { id: GYM_NOTICE_CHANNEL, importance: 4 },
      { id: GYM_QUIET_CHANNEL, importance: 4, sound: null, enableVibrate: false },
    ]);
  });
});

describe("the feedback box's device line", () => {
  it('says how Android set up the gym channel on this phone', async () => {
    expect(await gymPopupsLine()).toBe('gym pop-ups: importance 4');
    stored = { importance: 3 };
    expect(await gymPopupsLine()).toBe('gym pop-ups: importance 3 (below 4: no pop-up)');
    stored = null;
    expect(await gymPopupsLine()).toBe('gym pop-ups: no channel yet');
    granted = false;
    expect(await gymPopupsLine()).toBe('gym pop-ups: notifications off');
  });

  it('fits the box with the phone line (120 letters)', () => {
    expect(`CPH2873 (OPPO), Android 17, ${gymPopupsNote(true, 2)}`.length).toBeLessThanOrEqual(120);
  });
});

describe('the handler and the library (source checks)', () => {
  const root = path.resolve(__dirname, '../..');
  it('the app handler asks gymPopupPlan for gym messages, and posts the quiet copy', () => {
    const src = fs.readFileSync(path.join(root, 'src/tracker/services/workoutAlerts.ts'), 'utf8');
    expect(src).toMatch(/gymPopupPlan\(kind, liveWorkout\(\) != null\)/);
    expect(src).toMatch(/repostGymMessageQuietly\(notification\.request\)/);
    expect(src).not.toMatch(/kind === 'gym-message'\)[\s\S]{0,300}shouldPlaySound: liveWorkout\(\) == null/);
  });

  // Why the quiet copy exists: if a later expo-notifications stops silencing "no sound" notifications this
  // way, this fails and the copy can be dropped (the handler could then answer "banner, no sound" again).
  const builder = ['node_modules', '../../node_modules']
    .map((p) => path.resolve(root, p, 'expo-notifications/android/src/main/java/expo/modules/notifications/notifications/presentation/builders/ExpoNotificationBuilder.kt'))
    .find((p) => fs.existsSync(p));
  it.skipIf(!builder)('expo-notifications still posts a no-sound, no-buzz notification with setSilent(true)', () => {
    const kt = fs.readFileSync(builder!, 'utf8');
    expect(kt).toMatch(/if \(!shouldPlaySound && !shouldVibrate\) \{[\s\S]{0,200}builder\.setSilent\(true\)/);
    expect(kt).toMatch(/val behaviorAllowsVibration = notificationBehavior\?\.shouldPlaySound/);
  });
});
