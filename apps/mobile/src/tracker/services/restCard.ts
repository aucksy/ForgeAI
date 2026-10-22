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

import { color } from '@/theme/tokens';

import type { CardDone, DoneRequest, QueuedTick } from './restDone';
import type { LiveClock } from './liveClock';
import type { RestSoundId } from './restSounds';

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
  /** C5-4 + C1-10 (16 Oct 2026): "native" | "hold" | "app"; an older native piece lacks it. */
  restBell?(): string;
  setRingThroughDnd?(on: boolean): boolean;
  /** Rest-alert audit (11 Oct 2026); an older native piece lacks these. */
  alertChannelState?(): string;
  backgroundRestricted?(): boolean;
  openAlertChannelSettings?(): boolean;
  openAppSettings?(): boolean;
  /**
   * Phase 6 ("Done"); an older native piece lacks these. exKey null = no Done button. `values`:
   * the row's grey hint (`hintSignature`), carried on the button and handed back with the tap.
   */
  setDoneTarget?(workout: number, exKey: string | null, setKey: string | null, open: boolean, values: string | null): boolean;
  takePendingDone?(): Record<string, unknown> | null;
  postDoneNote?(title: string, text: string): boolean;
  /** Review fix: the app has acted on a Done tap (its broadcast may end; else it ends after ~2 s). */
  doneSettled?(): boolean;
  /**
   * 13 Oct 2026, the live workout card (WorkoutCard.kt); an older native piece lacks these.
   * `done`: JSON { workout, exKey, setKey, open, values, label } for "Complete set", or null.
   */
  showWorkoutCard?(title: string, text: string, image: string | null, done: string | null, plan: string | null, clock: string | null): boolean;
  clearWorkoutCard?(): boolean;
  /** One at a time (13 Oct 2026): keep the card's words but take it down while a rest runs. */
  hideWorkoutCard?(title: string, text: string, image: string | null, done: string | null, plan: string | null, clock: string | null): boolean;
  /** R-55: the "Rest is over" sound ("forge" | "bell" | "beep" | "whistle"); an older native piece lacks it. */
  setRestSound?(id: string): boolean;
  /** v0.37.1 (C1): the ticks made with the app closed (JSON array), taken once. */
  takeQueuedTicks?(): string | null;
  /** v0.37.1 (C9): the next rest follows the workout's last set (called just before show). */
  setRestAllDone?(on: boolean): boolean;
  /** v0.37.1 (C2): an old "Rest is over" goes and the live card comes back. */
  dismissRestOver?(): boolean;
  /** D5: the gym's accent for both cards ("#RRGGBB"; null = ForgeAI orange). */
  setAccent?(hex: string | null): boolean;
  addListener(event: string, cb: (e: Record<string, unknown>) => void): { remove: () => void };
}

let mod: Native | null | undefined;
/** True while the running rest was handed to the card (so a missing card means it was skipped). */
let handed = false;
export function restCardHolds(): boolean {
  return handed;
}
/** The native rest card is in this build (it then owns "Rest is over" and its channels). */
export function hasRestCard(): boolean {
  return N() != null;
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
    syncNotifAccent();
    try {
      if (quiet !== undefined) n.setQuiet?.(quiet); // "Workout sounds" off: "Rest is over" only vibrates
    } catch {
      // ignore
    }
    try {
      if (done !== undefined) {
        n.setDoneTarget?.(done?.workout ?? 0, done?.exKey ?? null, done?.setKey ?? null, done?.open === true, done?.values ?? null);
        // v0.37.1 (C9): no next row and no next label = the rest after the last set.
        n.setRestAllDone?.(restEndsWorkout(next, done));
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

/**
 * v0.37.1 (C9): does this rest follow the workout's LAST set? Yes when the tick handed over no
 * next row (`done === null`) and no next label: the card and "Rest is over" then say "All sets
 * done · Finish when ready", not "Time for your next set". `done` left out (+15 s, a rest adopted
 * from the card) says nothing: the card keeps what it has. PURE.
 */
export function restEndsWorkout(next: string | null, done: CardDone | null | undefined): boolean {
  return done === null && (next == null || next === '');
}

/** The words after a rest that followed the last set (the native card says the same). */
export const ALL_DONE_TEXT = 'All sets done · Finish when ready';

/**
 * D5 (gym branding): the accent as the native cards take it — "#RRGGBB" (a CSS "#RRGGBBAA" loses
 * its alpha, "#RGB" is spelled out); null for anything else (the cards stay ForgeAI orange). PURE.
 */
export function notifAccent(c: string | null | undefined): string | null {
  if (typeof c !== 'string') return null;
  const s = c.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toUpperCase();
  if (/^#[0-9a-fA-F]{8}$/.test(s)) return s.slice(0, 7).toUpperCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toUpperCase();
  return null;
}

let accentSent: string | null | undefined;
/**
 * D5: hand the accent the app shows now (`color.accent`, the gym's after its brand is applied) to
 * the native cards, when it changed. Called before every card post, so a brand change reaches the
 * next card; kept natively, so a card posted with the app closed is the gym's colour too.
 */
export function syncNotifAccent(): void {
  const n = N();
  if (!n?.setAccent) return;
  const hex = notifAccent(color.accent);
  if (hex === accentSent) return;
  try {
    n.setAccent(hex);
    accentSent = hex;
  } catch {
    // ignore: ForgeAI orange
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

/** PURE. The ticks the phone queued with the app closed (OfflineTick.kt), oldest first; bad entries dropped. */
export function parseQueuedTicks(raw: unknown): QueuedTick[] {
  let list: unknown = raw;
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];
  const out: QueuedTick[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const exKey = typeof r.exKey === 'string' && r.exKey ? r.exKey : null;
    const setKey = typeof r.setKey === 'string' && r.setKey ? r.setKey : null;
    const workout = Number(r.workout);
    const at = Number(r.at);
    if (!exKey || !setKey || !(workout > 0)) continue;
    out.push({
      workout,
      exKey,
      setKey,
      values: typeof r.values === 'string' && r.values ? r.values : null,
      at: Number.isFinite(at) ? at : 0,
      label: typeof r.label === 'string' ? r.label : null,
    });
  }
  return out;
}

/**
 * v0.37.1 (C1): the "Complete set" / Done taps the phone handled while ForgeAI was closed (it
 * started their rests itself), taken ONCE — the native piece forgets them. Empty when none.
 */
export function takeQueuedTicks(): QueuedTick[] {
  try {
    return parseQueuedTicks(N()?.takeQueuedTicks?.() ?? null);
  } catch {
    return [];
  }
}

/**
 * v0.37.1 (C2): an old "Rest is over" has done its job (the app came to the front, or a set was
 * ticked with no rest to start): it goes, and the live workout card comes back (one at a time).
 */
export function dismissRestOver(): void {
  call((n) => n.dismissRestOver?.());
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

/** R-55: Settings → Rest-over sound changed: the next "Rest is over" plays it (also with the screen off). */
export function setRestSoundNative(id: RestSoundId): void {
  call((n) => n.setRestSound?.(id));
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

/** Rest-alert audit: the "Rest timer" channel as Android has it. Null = unknown (old build). */
export function alertChannelState(): 'ok' | 'silenced' | 'blocked' | null {
  const v = call((n) => n.alertChannelState?.());
  return v === 'ok' || v === 'silenced' || v === 'blocked' ? v : null;
}

/** Rest-alert audit: Android's background restriction for ForgeAI is on. Null = unknown. */
export function backgroundRestricted(): boolean | null {
  const v = call((n) => n.backgroundRestricted?.());
  return typeof v === 'boolean' ? v : null;
}

/** The "Rest timer" channel's own Android page. False when it could not be opened. */
export function openAlertChannelSettings(): boolean {
  return call((n) => n.openAlertChannelSettings?.()) === true;
}

/** ForgeAI's own Android page (battery and background settings). False when it could not be opened. */
export function openAppSettings(): boolean {
  return call((n) => n.openAppSettings?.()) === true;
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

/**
 * Who makes the end-of-rest sound with ForgeAI on screen (C5-4 + C1-10, 16 Oct 2026), as the
 * native piece reports it (`RestCard.restBell`):
 *  - 'native': the app-open "Rest is over" rings itself — the same sound as with the screen off, at
 *    NOTIFICATION volume (the app's bell played through MEDIA volume, often at 0);
 *  - 'hold': Do Not Disturb is on and "Ring through Do Not Disturb" is off — the screen-off alert
 *    is held, so the app's bell must be too (it rang out loud before: JS cannot see DND);
 *  - 'app': the alert cannot ring (notifications off, its channel muted, sounds off): the app's
 *    own bell, as before.
 * Null = unknown (no native piece, or an older one): the app's bell, as before.
 */
export type RestBell = 'native' | 'hold' | 'app';

export function restBell(): RestBell | null {
  const v = call((n) => n.restBell?.());
  return v === 'native' || v === 'hold' || v === 'app' ? v : null;
}

/**
 * PURE. The ringer as the in-app rest bell must follow it: 'silent' whenever the app must not ring
 * its own bell (the alert rings itself, or Do Not Disturb holds it), else the phone's ringer.
 */
export function ringerForBell(ringer: RingerMode | null, bell: RestBell | null): RingerMode | null {
  if (bell === 'native' || bell === 'hold') return 'silent';
  return ringer;
}

/** The phone's ringer, read raw (RT-08). Null = unknown (no native piece). */
export function phoneRingerMode(): RingerMode | null {
  const v = call((n) => n.ringerMode?.());
  if (v === 0) return 'silent';
  if (v === 1) return 'vibrate';
  if (v === 2) return 'normal';
  return null;
}

/**
 * The ringer AS THE IN-APP REST BELL FOLLOWS IT (RT-08; the rest timer's only caller rings its
 * bell only on 'normal' or unknown). C5-4 + C1-10: 'silent' also when the app must not ring
 * ([restBell] 'native' or 'hold'), so the bell follows Do Not Disturb exactly as the screen-off
 * alert does and never doubles the alert's own sound. Null = unknown: the bell plays as before.
 */
export function ringerMode(): RingerMode | null {
  const bell = restBell();
  // 'native' only for a rest the card holds: a rest the native piece never got has no alert to ring.
  return ringerForBell(phoneRingerMode(), bell === 'native' && !handed ? null : bell);
}

// ------------------------------------------------------------------ 13 Oct 2026: the live workout card

/**
 * Post or update the live workout card (the next set and "Complete set"; WorkoutCard.kt). False
 * = no native piece, or an older one (the app then posts its old quiet card).
 */
export function showLiveWorkoutCard(
  title: string,
  text: string,
  image: string | null,
  done: CardDone | null,
  label: string | null,
  /** v0.37.1 (C1): the plan of the sets ahead (`livePlan`, JSON) for taps with the app closed. */
  plan: string | null = null,
  /** R-55: the workout time in the card's header (`liveClock`). */
  clock: LiveClock | null = null,
): boolean {
  const n = N();
  if (!n?.showWorkoutCard) return false;
  try {
    syncNotifAccent();
    const json = done ? JSON.stringify({ workout: done.workout, exKey: done.exKey, setKey: done.setKey, open: done.open, values: done.values, label }) : null;
    return n.showWorkoutCard(title, text, image, json, plan, clock ? JSON.stringify(clock) : null) === true;
  } catch {
    return false;
  }
}

/**
 * ONE workout notification at a time (13 Oct 2026): while a rest runs the rest card is alone;
 * the live card keeps its words natively (`WorkoutCard.hide`) and comes back when the rest and
 * "Rest is over" are gone. False = no native piece / an older one.
 */
export function hideLiveWorkoutCard(
  title: string,
  text: string,
  image: string | null,
  done: CardDone | null,
  label: string | null,
  plan: string | null = null,
  clock: LiveClock | null = null,
): boolean {
  const n = N();
  if (!n?.hideWorkoutCard) return false;
  try {
    syncNotifAccent();
    const json = done ? JSON.stringify({ workout: done.workout, exKey: done.exKey, setKey: done.setKey, open: done.open, values: done.values, label }) : null;
    return n.hideWorkoutCard(title, text, image, json, plan, clock ? JSON.stringify(clock) : null) === true;
  } catch {
    return false;
  }
}

/** Does this build's native piece have the live workout card? (False: web, tests, an older build.) */
export function liveWorkoutCardAvailable(): boolean {
  return call((n) => typeof n.showWorkoutCard === 'function') === true;
}

/** Remove the live workout card (the workout ended). */
export function clearLiveWorkoutCard(): void {
  call((n) => n.clearWorkoutCard?.());
}
