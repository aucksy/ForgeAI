/**
 * R-501 follow-up (cloud phone run 43564951323): a gym push that arrived with the app OPEN IN FRONT posted
 * nothing at all (moments b and c: "NOT POSTED"). Every gym push is data-only; expo-notifications 56 shows
 * one itself only with the app in the background or closed, and with the app in front its handler module
 * drops data-only pushes without asking the app. Now the app posts it itself (gymPopup.frontPushPost):
 *   app in front, no workout   -> "Messages from your gym" (gym-messages), pops up with its sound;
 *   app in front, a workout    -> gym-messages-quiet, pops up with no sound and no buzz;
 *   app in background / closed -> the library posts it, the app posts nothing (no second copy).
 * The phone itself is checked in the cloud (qa/run-device-qa.sh part_u501: all four moments must be posted
 * on the right channel AND shown by System UI as a heads-up).
 */
import fs from 'node:fs';
import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hoisted with the mock: the stores read it while they load, so it must exist before them (or they never load).
const mem = vi.hoisted(() => new Map<string, string>());
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (k: string) => mem.get(k) ?? null,
    setItem: async (k: string, v: string) => void mem.set(k, v),
    removeItem: async (k: string) => void mem.delete(k),
  },
}));
vi.mock('@/shop/gymActions', () => ({ refreshInbox: async () => null }));

import {
  frontPushPost,
  GYM_MESSAGE_FRONT_KIND,
  GYM_MESSAGE_QUIET_KIND,
  GYM_MESSAGES_CHANNEL,
  GYM_QUIET_CHANNEL,
  gymPopupPlan,
  type ArrivedRequest,
} from '@/shop/gymPopup';
import { useGymShop } from '@/shop/gymStore';
import { GYM_NOTICE_CHANNEL, postPushInFront, setNoticeNotificationsForTest } from '@/shop/noticeAlertsRun';
import { usePhonePrefs } from '@/tracker/phone/phonePrefs';

const ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const LINK = { memberKey: 'k1', memberId: 'm1', gymId: 'g1', gymName: "RAM'S FITNESS", joinCode: 'ABC123', name: 'Asha', brand: null };

/** A data-only gym push as the library hands it to a "received" listener (NotificationSerializer). */
function pushed(over: { tag?: string; gymId?: string; notification?: unknown; title?: string; body?: string; channelId?: string } = {}): ArrivedRequest {
  const tag = over.tag ?? `gym-notice-${ID}`;
  const data = { kind: 'gym-message', route: '/shop/inbox', push: 'message', noticeId: ID, gymId: over.gymId ?? 'g1' };
  return {
    identifier: tag,
    content: { title: over.title ?? "RAM'S FITNESS", body: over.body ?? 'Happy Chhath Puja', data },
    trigger: {
      type: 'push',
      remoteMessage: {
        data: { title: over.title ?? "RAM'S FITNESS", message: over.body ?? 'Happy Chhath Puja', channelId: over.channelId ?? 'gym-messages', tag, body: JSON.stringify(data) },
        notification: over.notification ?? null,
      },
    },
  };
}

describe('a push with the app open in front: the decision', () => {
  it('no workout: posted on "Messages from your gym", same id, words and tap; shown with its sound', () => {
    const post = frontPushPost(pushed(), false)!;
    expect(post).toEqual({
      identifier: `gym-notice-${ID}`,
      title: "RAM'S FITNESS",
      body: 'Happy Chhath Puja',
      data: { kind: GYM_MESSAGE_FRONT_KIND, route: '/shop/inbox', push: 'message', noticeId: ID, gymId: 'g1' },
      channelId: 'gym-messages',
    });
    // The handler then shows it with "play sound" on: never the silent post that does not pop up.
    expect(gymPopupPlan(post.data.kind as string, false)).toEqual({
      behavior: { shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false },
      repostQuietly: false,
    });
  });

  it('a workout open: posted on the quiet channel (no sound, no buzz), still a pop-up', () => {
    const post = frontPushPost(pushed(), true)!;
    expect(post.channelId).toBe(GYM_QUIET_CHANNEL);
    expect(post.data.kind).toBe(GYM_MESSAGE_QUIET_KIND);
    expect(post.identifier).toBe(`gym-notice-${ID}`);
    expect(post.data.route).toBe('/shop/inbox');
    // Shown, not silenced by the library (the quiet channel has no sound of its own).
    expect(gymPopupPlan(post.data.kind as string, true)!.behavior.shouldShowBanner).toBe(true);
    expect(gymPopupPlan(post.data.kind as string, true)!.behavior.shouldPlaySound).toBe(true);
    expect(gymPopupPlan(post.data.kind as string, true)!.repostQuietly).toBe(false);
  });

  it("keeps the push's own channel when it names another one; no channel = Messages from your gym", () => {
    expect(frontPushPost(pushed({ channelId: 'gym-plans' }), false)!.channelId).toBe('gym-plans');
    expect(frontPushPost(pushed({ channelId: 'gym-plans' }), true)!.channelId).toBe(GYM_QUIET_CHANNEL);
    const noChannel = pushed();
    delete ((noChannel.trigger as { remoteMessage: { data: Record<string, string> } }).remoteMessage.data as Record<string, string>).channelId;
    expect(frontPushPost(noChannel, false)!.channelId).toBe(GYM_MESSAGES_CHANNEL);
    expect(GYM_NOTICE_CHANNEL).toBe(GYM_MESSAGES_CHANNEL);
  });

  it('our own posted copies, local notifications and pushes the library already handles are left alone', () => {
    // Our copy comes back through the same listener: never posted again (no loop).
    const copy: ArrivedRequest = { identifier: 'x', content: { title: 'T', body: 'B', data: { kind: GYM_MESSAGE_FRONT_KIND } }, trigger: { type: 'channel', channelId: 'gym-messages' } };
    expect(frontPushPost(copy, false)).toBeNull();
    expect(frontPushPost({ ...copy, trigger: null }, false)).toBeNull();
    expect(frontPushPost({ ...copy, trigger: undefined }, true)).toBeNull();
    // A push with a notification block goes through the library's handler (it asks the app itself).
    expect(frontPushPost(pushed({ notification: { title: 'T', body: 'B' } }), false)).toBeNull();
    // A data-only push with no words: the library never shows that one in the background either.
    expect(frontPushPost(pushed({ title: '', body: '' }), false)).toBeNull();
  });

  it('one line of words is enough (title or body)', () => {
    expect(frontPushPost(pushed({ title: '' }), false)!.body).toBe('Happy Chhath Puja');
    expect(frontPushPost(pushed({ body: '' }), false)!.title).toBe("RAM'S FITNESS");
  });
});

const shown: { identifier: string; content: { title: string; body: string; data: Record<string, unknown> }; trigger: { channelId: string } }[] = [];
const channels: string[] = [];
const fake = {
  AndroidImportance: { HIGH: 4 },
  setNotificationChannelAsync: async (id: string) => void channels.push(id),
  scheduleNotificationAsync: async (r: (typeof shown)[number]) => void shown.push(r),
};

beforeEach(() => {
  mem.clear();
  shown.length = 0;
  channels.length = 0;
  setNoticeNotificationsForTest(fake);
  usePhonePrefs.setState({ gymMessagesOn: true });
  useGymShop.setState({ link: LINK });
});

describe('a push with the app open in front: the post', () => {
  it('posts it once, on the chosen channel, with both gym channels made first', async () => {
    await postPushInFront(frontPushPost(pushed(), false)!);
    expect(channels).toEqual(['gym-messages', 'gym-messages-quiet']);
    expect(shown).toHaveLength(1);
    expect(shown[0]).toMatchObject({
      identifier: `gym-notice-${ID}`,
      content: { title: "RAM'S FITNESS", body: 'Happy Chhath Puja', data: { kind: GYM_MESSAGE_FRONT_KIND, route: '/shop/inbox' } },
      trigger: { channelId: 'gym-messages' },
    });
  });

  it('during a workout it goes on the quiet channel', async () => {
    await postPushInFront(frontPushPost(pushed(), true)!);
    expect(shown[0]!.trigger.channelId).toBe(GYM_QUIET_CHANNEL);
  });

  it('not for this phone (another gym, left the gym, the switch off): nothing posted, as in the background', async () => {
    await postPushInFront(frontPushPost(pushed({ gymId: 'g2' }), false)!);
    usePhonePrefs.setState({ gymMessagesOn: false });
    await postPushInFront(frontPushPost(pushed(), false)!);
    usePhonePrefs.setState({ gymMessagesOn: true });
    useGymShop.setState({ link: null });
    await postPushInFront(frontPushPost(pushed(), false)!);
    expect(shown).toHaveLength(0);
  });

  it('a push the app cannot read as a notice (a note, a test push) is still shown, as the library does in the background', async () => {
    const qa = pushed({ tag: 'gym-notice-qa501b', gymId: '' });
    qa.content.data = { kind: 'gym-message', route: '/shop/inbox', push: 'message', noticeId: 'gym-notice-qa501b', gymId: '' };
    useGymShop.setState({ link: null });
    await postPushInFront(frontPushPost(qa, false)!);
    useGymShop.setState({ link: LINK });
    const note = pushed({ tag: 'gym-pause-1' });
    note.content.data = { kind: 'gym-message', route: '/shop/inbox', push: 'pause', noteId: '1' };
    await postPushInFront(frontPushPost(note, false)!);
    expect(shown.map((s) => s.identifier)).toEqual(['gym-notice-qa501b', 'gym-pause-1']);
  });

  it('never throws when the phone refuses', async () => {
    setNoticeNotificationsForTest({ ...fake, scheduleNotificationAsync: async () => Promise.reject(new Error('no')) });
    await expect(postPushInFront(frontPushPost(pushed(), false)!)).resolves.toBeUndefined();
  });
});

describe('the listener and the library (source checks)', () => {
  const root = path.resolve(__dirname, '../..');
  it('the app listens for pushes that arrive with it open, and posts them through frontPushPost', () => {
    const src = fs.readFileSync(path.join(root, 'src/tracker/services/workoutAlerts.ts'), 'utf8');
    expect(src).toMatch(/addNotificationReceivedListener\(\(notification\) => \{\s*const post = frontPushPost\(notification\.request, liveWorkout\(\) != null\)/);
    expect(src).toMatch(/m\.postPushInFront\(post\)/);
  });

  const lib = ['node_modules', '../../node_modules']
    .map((p) => path.resolve(root, p, 'expo-notifications/android/src/main/java/expo/modules/notifications'))
    .find((p) => fs.existsSync(p));
  // Why the app posts it: if a later expo-notifications starts showing data-only pushes with the app in
  // front, this fails, and the app's own post must go (or it would show twice).
  it.skipIf(!lib)('expo-notifications still drops a data-only push with the app in front', () => {
    const kt = fs.readFileSync(path.join(lib!, 'notifications/handling/NotificationsHandler.kt'), 'utf8');
    expect(kt).toMatch(/if \(content is RemoteNotificationContent && content\.isDataOnly\) \{[\s\S]{0,300}return\s*\}/);
  });
  // Why there is no second copy in the background: the listeners hear a push only with the app in front.
  it.skipIf(!lib)('expo-notifications tells the listeners only with the app in front, and posts it itself otherwise', () => {
    const kt = fs.readFileSync(path.join(lib!, 'service/delegates/ExpoHandlingDelegate.kt'), 'utf8');
    expect(kt).toMatch(/if \(isAppInForeground\(\)\) \{[\s\S]{0,400}it\.onNotificationReceived\(notification\)[\s\S]{0,200}\} else if \(notification\.shouldPresent\(\)\) \{[\s\S]{0,900}NotificationsService\.present\(context, notification\)/);
  });
});
