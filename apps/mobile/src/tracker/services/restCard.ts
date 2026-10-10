/**
 * The rest card — the watch's view of the rest timer (v0.26.1, tracker plan Phase 5 option A).
 *
 * A Wear OS watch copies a phone alert only if it can be swiped away, so while a rest runs the
 * phone posts a quiet swipe-away card ("Rest 1:30 · ends 4:12 pm" / "Next: Bench Press, set 3")
 * with "+15 s" and "Skip", counting down where Android allows it. The card, its buttons and the
 * end-of-rest alert ("Rest is over", posted also with the app open so the watch buzzes) live in a
 * small native piece: `modules/forge-rest` (Kotlin). A tap on the watch runs on the phone even
 * with the app in the background or its JS asleep; the native side keeps the rest, and the app
 * catches up through `onRestChange` or, after a sleep, `readRestCard()` + `reconcileWithCard`.
 *
 * No native piece (web, tests, an old build): every call returns false / null and the app falls
 * back to the Phase 1 expo-notifications alert.
 */
import { Platform } from 'react-native';

export interface CardRest {
  startedAt: number;
  endsAt: number;
  next: string | null;
}

export type CardChange =
  | { kind: 'add'; endsAt: number; startedAt: number }
  | { kind: 'skip' }
  | { kind: 'end' };

interface Native {
  show(startedAt: number, endsAt: number, next: string | null): boolean;
  /** Added in v0.28.1; an older native piece lacks it. */
  setQuiet?(quiet: boolean): boolean;
  clear(dismissOver: boolean): boolean;
  getState(): { endsAt: number; startedAt: number; next: string | null };
  takeOpenRequest(): boolean;
  /** Phase 2 (D8, RT-02, RT-05, RT-08, RT-12); an older native piece lacks these. */
  canScheduleExact?(): boolean;
  openExactAlarmSettings?(): boolean;
  notificationsEnabled?(): boolean;
  openNotificationSettings?(): boolean;
  is24Hour?(): boolean;
  ringerMode?(): number;
  setRingThroughDnd?(on: boolean): boolean;
  addListener(event: string, cb: (e: Record<string, unknown>) => void): { remove: () => void };
}

let mod: Native | null | undefined;
/** True while the running rest was handed to the card (so a missing card means it was skipped). */
let handed = false;
export function restCardHolds(): boolean {
  return handed;
}
function N(): Native | null {
  if (mod !== undefined) return mod;
  mod = null;
  if (Platform.OS !== 'android') return mod;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const core = require('expo-modules-core') as { requireOptionalNativeModule: (n: string) => unknown };
    mod = (core.requireOptionalNativeModule('ForgeRest') as Native | null) ?? null;
  } catch {
    mod = null;
  }
  return mod;
}

/** Post or update the card. False = no native piece (use the old alert). */
export function showRestCard(startedAt: number, endsAt: number, next: string | null, quiet?: boolean): boolean {
  const n = N();
  if (!n) return false;
  try {
    try {
      if (quiet !== undefined) n.setQuiet?.(quiet); // "Workout sounds" off: "Rest is over" only vibrates
    } catch {
      // ignore
    }
    handed = n.show(startedAt, endsAt, next) === true;
    return handed;
  } catch {
    handed = false;
    return false;
  }
}

/** Remove the card (and, with `dismissOver`, a "Rest is over" still showing). */
export function clearRestCard(dismissOver: boolean): void {
  handed = false;
  try {
    N()?.clear(dismissOver);
  } catch {
    // ignore
  }
}

/** The rest as the card knows it; null when none runs or there is no native piece. */
export function readRestCard(): CardRest | null | undefined {
  const n = N();
  if (!n) return undefined;
  try {
    const s = n.getState();
    if (!s || !(s.endsAt > 0)) return null;
    return { startedAt: s.startedAt, endsAt: s.endsAt, next: s.next ?? null };
  } catch {
    return undefined;
  }
}

/** True once when the app was opened by tapping the card or "Rest is over". */
export function takeRestOpenRequest(): boolean {
  try {
    return N()?.takeOpenRequest() === true;
  } catch {
    return false;
  }
}

/** Card buttons / end, while JS runs. Returns an unsubscribe function. */
export function onRestCardChange(cb: (c: CardChange) => void): () => void {
  const n = N();
  if (!n) return () => undefined;
  try {
    const sub = n.addListener('onRestChange', (e) => {
      const kind = e.kind;
      if (kind === 'add') cb({ kind, endsAt: Number(e.endsAt), startedAt: Number(e.startedAt) });
      else if (kind === 'skip' || kind === 'end') cb({ kind });
    });
    return () => sub.remove();
  } catch {
    return () => undefined;
  }
}

/** A tap on the card or "Rest is over" while the app was already running. */
export function onRestOpen(cb: () => void): () => void {
  const n = N();
  if (!n) return () => undefined;
  try {
    const sub = n.addListener('onOpenWorkout', () => cb());
    return () => sub.remove();
  } catch {
    return () => undefined;
  }
}

export type Reconcile =
  | { do: 'nothing' }
  | { do: 'adopt'; startedAt: number; endsAt: number; next: string | null }
  | { do: 'stop' };

/**
 * PURE. The app woke up (or started): bring its timer in line with the card, which may have
 * been changed from the watch while JS slept.
 *  - the card runs a rest the app does not have, or with another end → adopt the card's;
 *  - the app runs a rest the card no longer has (skipped on the watch, or ended) → stop;
 *  - `card === undefined` (no native piece) or the app never handed this rest to the card → nothing.
 */
export function reconcileWithCard(
  app: { endsAt: number | null; onCard: boolean },
  card: CardRest | null | undefined,
  now: number,
): Reconcile {
  if (card === undefined) return { do: 'nothing' };
  if (card && card.endsAt > now) {
    if (app.endsAt === card.endsAt) return { do: 'nothing' };
    return { do: 'adopt', startedAt: card.startedAt, endsAt: card.endsAt, next: card.next };
  }
  if (app.endsAt != null && app.onCard) return { do: 'stop' };
  return { do: 'nothing' };
}

// ------------------------------------------------------------------ Phase 2: alerts you never miss

/** Call an optional native function; undefined when the piece or the function is missing. */
function call<T>(pick: (n: Native) => T | undefined): T | undefined {
  try {
    const n = N();
    if (!n) return undefined;
    return pick(n);
  } catch {
    return undefined;
  }
}

/** "Workout sounds" changed (RT-07): the running rest's "Rest is over" follows at once. */
export function setRestQuiet(quiet: boolean): void {
  call((n) => n.setQuiet?.(quiet));
}

/** Profile → "Ring through Do Not Disturb" (RT-12). */
export function setRestRingThroughDnd(on: boolean): void {
  call((n) => n.setRingThroughDnd?.(on));
}

/** May the app schedule exact alarms ("Alarms & reminders")? Null = unknown (no native piece). */
export function canScheduleExact(): boolean | null {
  const v = call((n) => n.canScheduleExact?.());
  return typeof v === 'boolean' ? v : null;
}

/** Are the app's notifications on? Null = unknown here (ask expo-notifications instead). */
export function nativeNotificationsEnabled(): boolean | null {
  const v = call((n) => n.notificationsEnabled?.());
  return typeof v === 'boolean' ? v : null;
}

/** Android's "Alarms & reminders" page for ForgeAI. False when it could not be opened. */
export function openExactAlarmSettings(): boolean {
  return call((n) => n.openExactAlarmSettings?.()) === true;
}

/** Android's notification settings for ForgeAI. False when it could not be opened. */
export function openNotificationSettings(): boolean {
  return call((n) => n.openNotificationSettings?.()) === true;
}

/** The phone's 12/24-hour setting (RT-05). Null = unknown. */
export function phoneUses24Hour(): boolean | null {
  const v = call((n) => n.is24Hour?.());
  return typeof v === 'boolean' ? v : null;
}

export type RingerMode = 'normal' | 'vibrate' | 'silent';

/** The phone's ringer (RT-08). Null = unknown (no native piece): the bell plays as before. */
export function ringerMode(): RingerMode | null {
  const v = call((n) => n.ringerMode?.());
  if (v === 0) return 'silent';
  if (v === 1) return 'vibrate';
  if (v === 2) return 'normal';
  return null;
}
