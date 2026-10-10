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
 *
 * Phase 6 (point 4): a third button, "Done" (first in order: Done, +15 s, Skip), on the card and
 * on "Rest is over" ticks the row the card names. The app hands that row over with each rest
 * (`showRestCard(..., done)`); a tap is kept natively and taken once (`takePendingDone`) by
 * `restDoneRun.ts`, which ticks through the store's normal tick path.
 */
import { Platform } from 'react-native';

import type { CardDone, DoneRequest } from './restDone';

export interface CardRest {
  startedAt: number;
  endsAt: number;
  next: string | null;
}

export type CardChange =
  | { kind: 'add'; endsAt: number; startedAt: number }
  | { kind: 'skip' }
  | { kind: 'end' }
  /** Phase 6: "Done" was tapped (card, "Rest is over", or the watch); read it with takePendingDone. */
  | { kind: 'done' };

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
  /**
   * Phase 6 ("Done"); an older native piece lacks these. exKey null = no Done button. `values`:
   * the row's grey hint (`hintSignature`), carried on the button and handed back with the tap.
   */
  setDoneTarget?(workout: number, exKey: string | null, setKey: string | null, open: boolean, values: string | null): boolean;
  takePendingDone?(): Record<string, unknown> | null;
  postDoneNote?(title: string, text: string): boolean;
  /** Review fix: the app has acted on a Done tap (its broadcast may end; else it ends after ~2 s). */
  doneSettled?(): boolean;
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

/**
 * Post or update the card. False = no native piece (use the old alert).
 * Phase 6: `done` is the row the card's "Done" ticks (null = no Done button); left out, the card
 * keeps the Done it has (+15 s in the app, or the card's rest adopted after a sleep).
 */
export function showRestCard(
  startedAt: number,
  endsAt: number,
  next: string | null,
  quiet?: boolean,
  done?: CardDone | null,
): boolean {
  const n = N();
  if (!n) return false;
  try {
    try {
      if (quiet !== undefined) n.setQuiet?.(quiet); // "Workout sounds" off: "Rest is over" only vibrates
    } catch {
      // ignore
    }
    try {
      if (done !== undefined) {
        n.setDoneTarget?.(done?.workout ?? 0, done?.exKey ?? null, done?.setKey ?? null, done?.open === true, done?.values ?? null);
      }
    } catch {
      // ignore: the card shows without Done
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
      else if (kind === 'skip' || kind === 'end' || kind === 'done') cb({ kind });
    });
    return () => sub.remove();
  } catch {
    return () => undefined;
  }
}

/** PURE. A Done tap as the native piece hands it over; null when it lacks the row's identity. */
export function parsePendingDone(raw: unknown): DoneRequest | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const exKey = typeof r.exKey === 'string' && r.exKey ? r.exKey : null;
  const setKey = typeof r.setKey === 'string' && r.setKey ? r.setKey : null;
  const workout = Number(r.workout);
  const at = Number(r.at);
  if (!exKey || !setKey || !(workout > 0) || !(at > 0)) return null;
  const endsAt = Number(r.endsAt);
  return {
    workout,
    exKey,
    setKey,
    endsAt: Number.isFinite(endsAt) ? endsAt : 0,
    at,
    open: r.open === true,
    label: typeof r.label === 'string' ? r.label : null,
    values: typeof r.values === 'string' && r.values ? r.values : null,
  };
}

/**
 * Phase 6: the Done tap the phone kept, taken ONCE (the native piece forgets it). Null when none
 * (or no native piece). Also picks up a Done that launched the app ("open" Done).
 */
export function takePendingDone(): DoneRequest | null {
  try {
    return parsePendingDone(N()?.takePendingDone?.() ?? null);
  } catch {
    return null;
  }
}

/**
 * Review fix: the app has acted on the Done tap (ticked and saved, or decided not to). The
 * native piece kept the tap's broadcast open for this (at most ~2 s), so Android does not freeze
 * a cached app between the tap and the tick; this lets it end now.
 */
export function settleDone(): void {
  try {
    N()?.doneSettled?.();
  } catch {
    // ignore: it ends by itself
  }
}

/**
 * Phase 6: a Done that could not be acted on while the app is in the background (nothing to save,
 * or the card was out of date): a quiet note that opens ForgeAI when tapped.
 */
export function postDoneNote(title: string, text: string): void {
  try {
    N()?.postDoneNote?.(title, text);
  } catch {
    // ignore
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
