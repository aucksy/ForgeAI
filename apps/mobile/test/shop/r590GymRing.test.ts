/**
 * R-590: on phones that take a channel's sound away (OPPO / ColorOS: his CPH2873 rewrote "Messages from
 * your gym" to importance 3, no sound, no banner), the app rings a gym message itself. The native piece
 * (AlertRing.kt, its own JVM test) decides whether the channel really lost its sound; here: the app asks
 * it once for every message it or the push showed WITH a sound, and never for the quiet copy over a workout.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mem = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (k: string) => mem.get(k) ?? null,
    setItem: async (k: string, v: string) => void mem.set(k, v),
    removeItem: async (k: string) => void mem.delete(k),
  },
}));
vi.mock('@/shop/gymActions', () => ({ refreshInbox: async () => null }));
vi.mock('@/db', () => ({ initDb: async () => undefined }));
vi.mock('@/onboarding/db/dataActions', () => ({ isDemoData: async () => false }));
vi.mock('@/shop/gymApi', () => ({
  apiMessages: async () => ({ ok: true, data: [] }),
  apiAskQuestions: async () => ({ ok: true, data: [] }),
}));

import { gymRingWanted, lastGymRing, ringGymMessage, setGymRingNativeForTest } from '@/shop/gymAlertRing';
import { GYM_MESSAGES_CHANNEL, GYM_QUIET_CHANNEL } from '@/shop/gymPopup';
import { useGymShop } from '@/shop/gymStore';
import { onPushArrived, postPushInFront, repostGymMessageQuietly, setNoticeAppInFrontForTest, setNoticeNotificationsForTest } from '@/shop/noticeAlertsRun';
import { pushOnGymChannel } from '@/shop/pushPlan';
import { setLiveWorkout } from '@/tracker/phone/liveWorkout';
import { usePhonePrefs } from '@/tracker/phone/phonePrefs';

const LINK = { memberKey: 'k1', memberId: 'm1', gymId: 'g1', gymName: "RAM'S FITNESS", joinCode: 'ABC123', name: 'Asha', brand: null };

const rings: string[] = [];
let answer = 'rang';
const native = {
  ringIfMuted: (ch: string): string => {
    rings.push(ch);
    return answer;
  },
};
const shown: string[] = [];
const fake = {
  dismissNotificationAsync: async () => undefined,
  AndroidImportance: { HIGH: 6 },
  getPermissionsAsync: async () => ({ granted: true }),
  setNotificationChannelAsync: async () => undefined,
  scheduleNotificationAsync: async (r: { trigger: { channelId: string } }) => void shown.push(r.trigger.channelId),
};

const ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const pushed = (push = 'message', gymId = 'g1') => ({
  data: { title: "RAM'S FITNESS", message: 'Closed', push, noticeId: ID, gymId, body: JSON.stringify({ kind: 'gym-message', push, noticeId: ID, gymId }) },
  notification: null,
});

beforeEach(() => {
  mem.clear();
  rings.length = 0;
  shown.length = 0;
  answer = 'rang';
  setGymRingNativeForTest(native);
  setNoticeNotificationsForTest(fake);
  setNoticeAppInFrontForTest(false);
  setLiveWorkout(null);
  usePhonePrefs.setState({ gymMessagesOn: true });
  useGymShop.setState({ link: LINK });
});

describe('when the app asks for its own ring', () => {
  it('never with the app open over a workout (R-501 quiet copy); every other time it asks', () => {
    expect(gymRingWanted(true, true)).toBe(false);
    expect(gymRingWanted(true, false)).toBe(true);
    expect(gymRingWanted(false, true)).toBe(true); // the push in the background still rang before R-590 on a Pixel
    expect(gymRingWanted(false, false)).toBe(true);
  });

  it('only "Messages from your gym", never the quiet channel', () => {
    expect(ringGymMessage({ inFront: false, workoutOpen: false })).toBe('rang');
    expect(ringGymMessage({ inFront: false, workoutOpen: false, channelId: GYM_QUIET_CHANNEL })).toBe('');
    expect(rings).toEqual([GYM_MESSAGES_CHANNEL]);
    expect(lastGymRing()).toBe('rang');
  });

  it('no native piece (an older build, iPhone) or a native failure: nothing, never a throw', () => {
    setGymRingNativeForTest(null);
    expect(ringGymMessage({ inFront: false, workoutOpen: false })).toBe('');
    setGymRingNativeForTest({
      ringIfMuted: () => {
        throw new Error('boom');
      },
    });
    expect(ringGymMessage({ inFront: false, workoutOpen: false })).toBe('');
  });
});

describe('every way a gym message is shown', () => {
  it('a push with the app closed or in the background rings once', async () => {
    await onPushArrived(pushed());
    expect(rings).toEqual([GYM_MESSAGES_CHANNEL]);
  });

  it("his case: the gym's reply to his feedback (a member note, not an inbox message) rings", async () => {
    const note = (push: string) => ({
      data: {
        title: "RAM'S FITNESS",
        message: 'We fixed the shower',
        channelId: 'gym-messages',
        tag: `gym-${push}-n1`,
        push,
        noteId: 'n1',
        gymId: 'g1',
        body: JSON.stringify({ kind: 'gym-message', route: '/shop/message', push, noteId: 'n1', gymId: 'g1' }),
      },
      notification: null,
    });
    await onPushArrived(note('gym_reply'));
    expect(rings).toEqual([GYM_MESSAGES_CHANNEL]);
    expect(pushOnGymChannel(note('order_ready'))).toBe(true);
    // The MettleUp team's reply (deploy/hq/push.js fcmHelpReplyMessage) is on the same channel.
    expect(pushOnGymChannel({ data: { channelId: 'gym-messages', push: 'help_reply', noteId: '7' } })).toBe(true);
    // Not ours: never a ring.
    expect(pushOnGymChannel({ data: { title: 'x' } })).toBe(false);
    expect(pushOnGymChannel(null)).toBe(false);
    rings.length = 0;
    setNoticeAppInFrontForTest(true); // in front, postPushInFront posts and rings it instead
    await onPushArrived(note('gym_reply'));
    expect(rings).toEqual([]);
  });

  it('a trainer reply push rings too', async () => {
    await onPushArrived(pushed('reply'));
    expect(rings).toEqual([GYM_MESSAGES_CHANNEL]);
  });

  it('a push the phone must not show (switch off, another gym) is taken away and never rings', async () => {
    usePhonePrefs.setState({ gymMessagesOn: false });
    await onPushArrived(pushed());
    usePhonePrefs.setState({ gymMessagesOn: true });
    await onPushArrived(pushed('message', 'other-gym'));
    expect(rings).toEqual([]);
  });

  it('a push with the app in front rings where the app posts it, not twice', async () => {
    setNoticeAppInFrontForTest(true);
    await onPushArrived(pushed());
    expect(rings).toEqual([]);
    await postPushInFront({ identifier: 'x', title: 'Gym', body: 'Hi', data: {}, channelId: GYM_MESSAGES_CHANNEL });
    expect(shown).toEqual([GYM_MESSAGES_CHANNEL]);
    expect(rings).toEqual([GYM_MESSAGES_CHANNEL]);
  });

  it('the quiet copy over a workout never rings', async () => {
    setNoticeAppInFrontForTest(true);
    setLiveWorkout({ name: 'Push 1' });
    await repostGymMessageQuietly({ identifier: 'x', content: { title: 'Gym', body: 'Hi' } });
    await postPushInFront({ identifier: 'y', title: 'Gym', body: 'Hi', data: {}, channelId: GYM_QUIET_CHANNEL });
    expect(shown).toEqual([GYM_QUIET_CHANNEL, GYM_QUIET_CHANNEL]);
    expect(rings).toEqual([]);
  });
});

describe('the other pop-ups on "Messages from your gym" (source checks)', () => {
  const src = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');
  it('the 15-minute check, missed trainer replies and the MettleUp team reply ring after posting', () => {
    const run = src('src/shop/noticeAlertsRun.ts');
    expect(run).toMatch(/async function showPopups[\s\S]*?scheduleNotificationAsync[\s\S]*?await ringShownGymMessage\(\);\s*\}/);
    expect(run).toMatch(/async function popReplies[\s\S]*?scheduleNotificationAsync[\s\S]*?await ringShownGymMessage\(\);/);
    expect(src('src/lib/helpReplyAlert.ts')).toMatch(/scheduleNotificationAsync[\s\S]*?await ringShownGymMessage\(\);/);
  });

  it('the native piece is in the module', () => {
    const mod = src('modules/forge-rest/android/src/main/java/com/forgeai/rest/ForgeRestModule.kt');
    expect(mod).toMatch(/Function\("ringIfMuted"\) \{ channelId: String ->[\s\S]*?AlertRing\.ringIfMuted\(c, channelId\)/);
  });
});
