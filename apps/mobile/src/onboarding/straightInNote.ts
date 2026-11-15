/**
 * R-587 review (15 Nov 2026): a member who goes straight into the gym never answers the 3 setup questions; the app
 * picks "New to lifting" and "Build muscle" for them (phoneSignIn.straightInDraft). The Workout tab says so once, with
 * where to change it (onboarding/components/StraightInNoteCard.tsx). 'due' is written just before the setup is saved,
 * 'done' when the card is closed, or when the setup was not saved after all (the member answers the questions).
 */
import { getMeta, setMeta } from '@/db';
import { enqueueWrite } from '@/db/writeQueue';

export const STRAIGHT_IN_NOTE_KEY = 'straight_in_note';

export const STRAIGHT_IN_NOTE = {
  body: 'We set you up as "New to lifting" and "Build muscle". You can change both in Profile.',
  open: 'Open Profile',
  close: 'Got it',
} as const;

/** The note shows only after a straight-in setup, until it is closed. PURE. */
export function straightInNoteDue(stored: string | null): boolean {
  return stored === 'due';
}

export async function markStraightInNote(v: 'due' | 'done'): Promise<void> {
  await enqueueWrite(() => setMeta(STRAIGHT_IN_NOTE_KEY, v));
}

/** Never throws: a failed read shows nothing (the note is a courtesy, not a gate). */
export async function readStraightInNote(): Promise<boolean> {
  try {
    return straightInNoteDue(await getMeta(STRAIGHT_IN_NOTE_KEY));
  } catch (e) {
    console.warn('[straight-in note] could not read the mark', e);
    return false;
  }
}
