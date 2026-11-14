/**
 * R-501 (owner, 14 Nov 2026): a message from the gym must pop up on the screen (a heads-up banner), not
 * only land in the notification list. PURE rules; the phone side is in noticeAlertsRun.ts and the app's
 * notification handler (tracker/services/workoutAlerts.ts).
 *
 * WHY THIS EXISTS. expo-notifications 56 builds every notification it shows with
 * `NotificationCompat.Builder.setSilent(true)` when the handler says "no sound" (ExpoNotificationBuilder
 * .applySoundsAndVibrations: no sound and no vibration -> setSilent). androidx makes a silent notification
 * a child of the group "silent" with GROUP_ALERT_SUMMARY, and Android's System UI never pops up a child
 * whose group alert behaviour suppresses it (NotificationInterruptStateProviderImpl.canAlertHeadsUpCommon:
 * "suppressed due to group alert behavior"). So the old handler answer for a gym message while a workout
 * was open with the app in front ({ shouldShowBanner: true, shouldPlaySound: false }) never showed a
 * banner: the message only went into the list.
 *
 * NOW. While a workout is open the library posts nothing itself; the app posts the same message again
 * (same id, same words, same tap) on a second HIGH channel that has no sound and no buzz, and the handler
 * lets that one "play its sound" (the channel has none), so the library does not silence it and Android
 * pops it up quietly. With no workout open nothing changes: the message pops up on "Messages from your
 * gym" with its sound.
 */

/** The library's notification behaviour (expo-notifications NotificationBehavior). */
export interface GymPopupBehavior {
  shouldShowBanner: boolean;
  shouldShowList: boolean;
  shouldPlaySound: boolean;
  shouldSetBadge: boolean;
}

/** A gym message, offer, note or the MettleUp team's reply (push or the 15-minute check). */
export const GYM_MESSAGE_KIND = 'gym-message';
/** The same message posted again by the app, on the quiet channel, while a workout is open. */
export const GYM_MESSAGE_QUIET_KIND = 'gym-message-quiet';

export const GYM_QUIET_CHANNEL = 'gym-messages-quiet';
export const GYM_QUIET_CHANNEL_NAME = 'Messages from your gym during a workout';
export const GYM_QUIET_CHANNEL_DESCRIPTION = "Your gym's messages pop up without a sound while a workout is open";

const SHOW: GymPopupBehavior = { shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false };
const NOTHING: GymPopupBehavior = { shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false };

/**
 * What the handler answers for a gym message with the app in front; null = not a gym message.
 * `repostQuietly` = the app must post it again on the quiet channel (the library shows nothing). PURE.
 */
export function gymPopupPlan(kind: string | undefined, workoutOpen: boolean): { behavior: GymPopupBehavior; repostQuietly: boolean } | null {
  if (kind === GYM_MESSAGE_QUIET_KIND) return { behavior: SHOW, repostQuietly: false };
  if (kind !== GYM_MESSAGE_KIND) return null;
  if (workoutOpen) return { behavior: NOTHING, repostQuietly: true };
  return { behavior: SHOW, repostQuietly: false };
}

/** The quiet copy's data: the same tap (route) and ids, marked as the quiet copy. PURE. */
export function quietCopyData(data: unknown): Record<string, unknown> {
  const base = data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
  return { ...base, kind: GYM_MESSAGE_QUIET_KIND };
}

/**
 * One short line for the feedback box's "device" field (R-501): how Android set up this phone's gym
 * message channel, so a member's next message tells us whether pop-ups can show there (4 = high, the
 * only importance that pops up). Never words a member reads. PURE.
 */
export function gymPopupsNote(allowed: boolean | null, importance: number | null): string {
  if (allowed === false) return 'gym pop-ups: notifications off';
  if (importance === null) return 'gym pop-ups: no channel yet';
  return `gym pop-ups: importance ${importance}${importance >= 4 ? '' : ' (below 4: no pop-up)'}`;
}
