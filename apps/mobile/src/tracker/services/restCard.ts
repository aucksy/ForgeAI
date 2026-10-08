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
  clear(dismissOver: boolean): boolean;
  getState(): { endsAt: number; startedAt: number; next: string | null };
  takeOpenRequest(): boolean;
  addListener(event: string, cb: (e: Record<string, unknown>) => void): { remove: () => void };
}

let mod: Native | null | undefined;
/** True while the running rest was handed to the card (so a missing card means it was skipped). */
let handed = false;
export function restCardHolds(): boolean {
  return handed;
}
/** The app adopted the card's rest (after a sleep or a restart): the card holds it. */
export function markRestCardHeld(): void {
  handed = true;
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
export function showRestCard(startedAt: number, endsAt: number, next: string | null): boolean {
  const n = N();
  if (!n) return false;
  try {
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
