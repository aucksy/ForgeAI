/**
 * R-436 (owner, 10 Nov 2026): "Start remembering my empty workouts... The exercises I do in an empty
 * workout get saved, and next time I start an empty workout the same exercises are automatically
 * pulled up again." For every member, no setting.
 *
 * ONE saved list per member: the exercises of the last FINISHED empty workout ("Start empty workout",
 * or Start with no routine), in their order, with how many sets each had. Never weights or reps: each
 * card already shows last time's numbers. A discarded workout saves nothing. Each finish replaces it.
 *
 * Kept in `meta` (LAST_EMPTY_KEY) on the phone, so it works offline, and copied to the member's cloud
 * copy as the 'p' item 'empty' (copyLocal.ts / pack.ts packEmptyWorkout), so it comes back on a new
 * phone or after a reinstall. The local copy holds this phone's exercise ids; the cloud copy holds
 * exercise refs (a library exercise's id differs on every phone).
 */
import { getMeta, setMeta } from '@/db';
import { draftToRichSets } from '@/tracker/services/draftSets';

export const LAST_EMPTY_KEY = 'last_empty_workout_v1';

/** At most this many exercises are remembered (and this many sets each). */
export const MAX_REMEMBERED = 30;
export const MAX_SETS = 10;

export interface RememberedExercise {
  /** This phone's exercise id. */
  id: string;
  /** Working sets it had (1..MAX_SETS): the new card gets that many empty rows. */
  sets: number;
}

export interface RememberedWorkout {
  items: RememberedExercise[];
  /** When it was saved (ms). */
  at: number;
}

/** What goes into the "Start blank" line's words (member-words: plain, no "session"). */
export const PREFILL_LINE = 'We added the exercises from your last empty workout.';
export const START_BLANK = 'Start blank';
export const START_BLANK_A11Y = 'Remove these exercises and start with none';

type DraftCard = Parameters<typeof draftToRichSets>[0][number];

const clampSets = (n: number): number => Math.max(1, Math.min(MAX_SETS, Math.round(n)));

/**
 * The list a finished empty workout leaves: each card that SAVED at least one working set (warm-ups
 * alone do not count), in screen order, with how many working sets it saved. `tickedOnly` = what
 * Finish saves (rows never ticked are left out unless the member chose "Save them"). PURE.
 */
export function rememberFromCards(cards: readonly DraftCard[], tickedOnly: boolean): RememberedExercise[] {
  const out: RememberedExercise[] = [];
  for (const card of cards) {
    const saved = draftToRichSets([card], { tickedOnly }).filter((r) => !r.isWarmup).length;
    if (saved > 0) out.push({ id: card.exerciseId, sets: clampSets(saved) });
    if (out.length >= MAX_REMEMBERED) break;
  }
  return out;
}

export function serializeRemembered(w: RememberedWorkout): string {
  return JSON.stringify({ v: 1, at: w.at, items: w.items.map((i) => [i.id, i.sets]) });
}

/** Read back; anything damaged = nothing remembered. PURE. */
export function parseRemembered(raw: string | null | undefined): RememberedWorkout | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as { v?: unknown; at?: unknown; items?: unknown };
    if (!o || o.v !== 1 || !Array.isArray(o.items)) return null;
    const items: RememberedExercise[] = [];
    for (const it of o.items) {
      if (!Array.isArray(it) || typeof it[0] !== 'string' || it[0] === '') continue;
      const sets = typeof it[1] === 'number' && Number.isFinite(it[1]) ? clampSets(it[1]) : 1;
      items.push({ id: it[0], sets });
      if (items.length >= MAX_REMEMBERED) break;
    }
    if (items.length === 0) return null;
    return { items, at: typeof o.at === 'number' && Number.isFinite(o.at) ? o.at : 0 };
  } catch {
    return null;
  }
}

/**
 * The cards to pre-add: the remembered exercises this phone still has, in order (one that was deleted
 * since is left out). PURE.
 */
export function cardsToRestore<T>(w: RememberedWorkout | null, have: ReadonlyMap<string, T>): { exercise: T; sets: number }[] {
  if (!w) return [];
  const out: { exercise: T; sets: number }[] = [];
  for (const it of w.items) {
    const ex = have.get(it.id);
    if (ex !== undefined) out.push({ exercise: ex, sets: it.sets });
  }
  return out;
}

/**
 * The "Start blank" line shows on a live workout that was pre-filled, until the member ticks a set or
 * taps "Start blank". PURE.
 */
export function showPrefillLine(s: {
  active: boolean;
  emptyPrefill: readonly string[] | null;
  exercises: readonly { key: string; sets: readonly { done: boolean }[] }[];
}): boolean {
  if (!s.active || !s.emptyPrefill || s.emptyPrefill.length === 0) return false;
  const pre = new Set(s.emptyPrefill);
  if (!s.exercises.some((e) => pre.has(e.key))) return false;
  return !s.exercises.some((e) => e.sets.some((x) => x.done));
}

/**
 * "Start blank": the pre-added cards with no ticked set go; everything the member added keeps. PURE.
 */
export function withoutPrefill<E extends { key: string; sets: readonly { done: boolean }[] }>(
  exercises: readonly E[],
  prefill: readonly string[] | null,
): E[] {
  if (!prefill || prefill.length === 0) return [...exercises];
  const pre = new Set(prefill);
  return exercises.filter((e) => !pre.has(e.key) || e.sets.some((x) => x.done));
}

export async function readRemembered(): Promise<RememberedWorkout | null> {
  return parseRemembered(await getMeta(LAST_EMPTY_KEY));
}

/** Inside a queued write job (Finish's). */
export async function writeRemembered(items: readonly RememberedExercise[], at: number): Promise<void> {
  if (items.length === 0) return;
  await setMeta(LAST_EMPTY_KEY, serializeRemembered({ items: [...items], at }));
}
