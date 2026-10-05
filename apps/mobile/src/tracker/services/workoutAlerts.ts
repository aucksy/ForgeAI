/**
 * Workout alerts on the phone's notification shade and lock screen (Phase 1).
 *
 *  - "Rest is over" — scheduled for the moment the rest timer ends, so it sounds and
 *    vibrates even when the screen is off or the app is in the background. When the
 *    app is open the banner is suppressed (the in-app timer plays its own sound).
 *  - "Workout in progress" — a quiet, non-swipeable card for as long as a workout is
 *    open. Tapping either one brings the member back to the workout.
 *
 * Every call is fire-and-forget and never throws: a phone that refused notification
 * permission, the web build and the test runner all simply get no notification.
 * The native module is loaded lazily so the web bundle and the unit tests never
 * touch it.
 */
import { Platform } from 'react-native';

type NotificationsModule = typeof import('expo-notifications');

const REST_ID = 'forgeai-rest-end';
const ONGOING_ID = 'forgeai-workout-ongoing';
const REST_CHANNEL = 'rest-timer';
const ONGOING_CHANNEL = 'workout-ongoing';
export const WORKOUT_ROUTE = '/session/active';

let mod: NotificationsModule | null | undefined;
function N(): NotificationsModule | null {
  if (mod !== undefined) return mod;
  if (Platform.OS !== 'android') {
    mod = null;
    return mod;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('expo-notifications') as NotificationsModule;
  } catch {
    mod = null;
  }
  return mod;
}

let setupDone: Promise<void> | null = null;

/** Channels + foreground behaviour. Idempotent; safe to call often. */
export function setupWorkoutAlerts(): Promise<void> {
  if (setupDone) return setupDone;
  setupDone = (async () => {
    const n = N();
    if (!n) return;
    try {
      n.setNotificationHandler({
        handleNotification: async (notification) => {
          const kind = (notification.request.content.data as { kind?: string } | null)?.kind;
          // App is open: the rest timer on screen already beeps — no banner, no sound.
          // The ongoing card still lists in the shade.
          return {
            shouldShowBanner: false,
            shouldShowList: kind === 'workout',
            shouldPlaySound: false,
            shouldSetBadge: false,
          };
        },
      });
      await n.setNotificationChannelAsync(REST_CHANNEL, {
        name: 'Rest timer',
        description: 'Tells you when your rest is over',
        importance: n.AndroidImportance.HIGH,
        sound: 'default',
        vibrationPattern: [0, 250, 150, 250],
        enableVibrate: true,
        lockscreenVisibility: n.AndroidNotificationVisibility.PUBLIC,
        showBadge: false,
      });
      await n.setNotificationChannelAsync(ONGOING_CHANNEL, {
        name: 'Workout in progress',
        description: 'Shows your open workout so you can jump back in',
        importance: n.AndroidImportance.LOW,
        sound: null,
        enableVibrate: false,
        lockscreenVisibility: n.AndroidNotificationVisibility.PUBLIC,
        showBadge: false,
      });
    } catch {
      // Notifications unavailable — the in-app timer still works.
    }
  })();
  return setupDone;
}

let askedThisRun = false;

/** Ask once per app run, and only if Android will still show the prompt. */
export async function ensureAlertPermission(): Promise<void> {
  const n = N();
  if (!n || askedThisRun) return;
  askedThisRun = true;
  try {
    await setupWorkoutAlerts();
    const cur = await n.getPermissionsAsync();
    if (!cur.granted && cur.canAskAgain) await n.requestPermissionsAsync();
  } catch {
    // ignore
  }
}

/** Schedule (or move) the "Rest is over" alert. */
export async function scheduleRestEnd(endsAt: number, nextLabel: string | null): Promise<void> {
  const n = N();
  if (!n) return;
  try {
    await setupWorkoutAlerts();
    await n.cancelScheduledNotificationAsync(REST_ID);
    if (endsAt - Date.now() < 1000) return;
    await n.scheduleNotificationAsync({
      identifier: REST_ID,
      content: {
        title: 'Rest is over',
        body: nextLabel ? `Next up: ${nextLabel}` : 'Time for your next set',
        data: { kind: 'rest', route: WORKOUT_ROUTE },
        sound: 'default',
        priority: 'max',
        color: '#FF7A3B',
      },
      trigger: { type: n.SchedulableTriggerInputTypes.DATE, date: endsAt, channelId: REST_CHANNEL },
    });
  } catch {
    // ignore
  }
}

export async function cancelRestEnd(): Promise<void> {
  const n = N();
  if (!n) return;
  try {
    await n.cancelScheduledNotificationAsync(REST_ID);
    await n.dismissNotificationAsync(REST_ID);
  } catch {
    // ignore
  }
}

/** Show or update the quiet "Workout in progress" card. */
export async function showWorkoutOngoing(title: string, body: string): Promise<void> {
  const n = N();
  if (!n) return;
  try {
    await setupWorkoutAlerts();
    await n.scheduleNotificationAsync({
      identifier: ONGOING_ID,
      content: {
        title,
        body,
        data: { kind: 'workout', route: WORKOUT_ROUTE },
        sticky: true,
        autoDismiss: false,
        sound: false,
        priority: 'low',
        color: '#FF7A3B',
      },
      trigger: { channelId: ONGOING_CHANNEL },
    });
  } catch {
    // ignore
  }
}

export async function clearWorkoutOngoing(): Promise<void> {
  const n = N();
  if (!n) return;
  try {
    await n.dismissNotificationAsync(ONGOING_ID);
  } catch {
    // ignore
  }
}

/**
 * Tap on either notification → `onRoute(route)`. Also handles the tap that
 * cold-started the app. Returns an unsubscribe function.
 */
export function listenForAlertTaps(onRoute: (route: string) => void): () => void {
  const n = N();
  if (!n) return () => undefined;
  const routeOf = (data: unknown): string | null => {
    const r = (data as { route?: unknown } | null)?.route;
    return typeof r === 'string' ? r : null;
  };
  let sub: { remove: () => void } | null = null;
  try {
    sub = n.addNotificationResponseReceivedListener((resp) => {
      const r = routeOf(resp.notification.request.content.data);
      if (r) onRoute(r);
    });
    void n
      .getLastNotificationResponseAsync()
      .then((resp) => {
        const r = resp ? routeOf(resp.notification.request.content.data) : null;
        if (r) onRoute(r);
      })
      .catch(() => undefined);
  } catch {
    // ignore
  }
  return () => sub?.remove();
}
