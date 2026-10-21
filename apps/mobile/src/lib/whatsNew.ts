/**
 * "What's new" after each update (owner backlog, Planned): the first time the app opens on a new
 * version, the Workout tab says in plain words what changed, once. "Got it" hides it until the next
 * version. The first version an install meets is only remembered, never announced: a fresh install
 * has nothing "new", and the cloud phone tests (fresh installs with sample workouts) must not see a
 * card that moves every screen. So the news shows from the NEXT update on.
 *
 * Add the lines for a version here when it is released; a version with no lines shows nothing.
 * Member words: never "volume", "PR" or "session".
 */
import { getMeta, setMeta } from '@/db';
import { enqueueWrite } from '@/db/writeQueue';

export const WHATS_NEW: Readonly<Record<string, readonly string[]>> = {
  '0.50.0': [
    'Finished a workout without a routine? Save its exercises as a routine in one tap.',
    'During rest, tap "Machine in use" to show a big timer, so others know you are coming back.',
    'Change an exercise\'s rest while its timer runs, and the running timer changes too.',
  ],
};

const SEEN_KEY = 'whats_new_seen'; // the last version whose news was shown (or skipped)

/** The lines to show, or null. PURE. */
export function whatsNewToShow(current: string | null | undefined, seen: string | null): readonly string[] | null {
  if (!current || seen == null || seen === current) return null;
  const lines = WHATS_NEW[current];
  return lines && lines.length > 0 ? lines : null;
}

/** What the card shows now. A version with nothing to show is remembered at once. Never throws. */
export async function readWhatsNew(current: string | null | undefined): Promise<readonly string[] | null> {
  if (!current) return null;
  try {
    const seen = await getMeta(SEEN_KEY);
    const lines = whatsNewToShow(current, seen);
    if (!lines && seen !== current) await enqueueWrite(() => setMeta(SEEN_KEY, current));
    return lines;
  } catch (e) {
    console.warn('[whats new] could not read', e);
    return null;
  }
}

export async function markWhatsNewSeen(current: string): Promise<void> {
  await enqueueWrite(() => setMeta(SEEN_KEY, current));
}
