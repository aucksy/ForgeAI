/**
 * The words on the backup screens (R-123), PURE so a test can read them. Member words: say where
 * and what it does for them; never "volume", "PR" or "session".
 */
import { sizeWords } from './backupSave';

const n = (x: number, one: string, many: string = `${one}s`): string => `${x} ${x === 1 ? one : many}`;

/** What the file holds, under "Save a backup". */
export const SAVE_ABOUT =
  'One file with your workouts, routines in their order, your own exercises, rest times, body weight, measurements, photos, profile and settings. Keep it in Files, Google Drive or WhatsApp, then open it in MettleUp on any phone with “Restore from a backup”.';

/** What is never in it. */
export const SAVE_NEVER = 'Your phone number and your gym membership are never in the file.';

/** "Saving 37 of 210 photos…" while the photos go in. */
export function savingText(done: number, total: number): string {
  if (total <= 0) return 'Saving…';
  return `Saving ${Math.min(done, total)} of ${total} ${total === 1 ? 'photo' : 'photos'}…`;
}

/** After the share sheet: what was saved. */
export function savedText(o: { name: string; bytes: number; workouts: number; photos: number; photosLeftOut: number }): string {
  const what = `${n(o.workouts, 'workout')} and ${n(o.photos, 'photo')}`;
  const left = o.photosLeftOut > 0 ? ` ${n(o.photosLeftOut, 'photo')} could not be read and ${o.photosLeftOut === 1 ? 'was' : 'were'} left out.` : '';
  return `Saved ${o.name} (${sizeWords(o.bytes)}): ${what}.${left}`;
}

export function noSpaceText(needBytes: number, freeBytes: number): string {
  return `Your phone is short of space: this needs about ${sizeWords(needBytes)} and only ${sizeWords(freeBytes)} is free. Free up some space, then try again. Nothing was changed.`;
}

export const SAVE_EMPTY = 'Nothing to back up yet. Log a workout or make a routine first.';
export const SAVE_DEMO = 'This is the sample member’s made-up data, so there is nothing of yours to back up.';
export const SAVE_FAILED = 'Couldn’t save the backup. Nothing on this phone changed. Please try again.';
export const SHARE_MISSING = 'Sharing isn’t available on this phone, so the file couldn’t be handed over.';

/** What "Restore from a backup" does, before a file is picked. */
export const RESTORE_ABOUT =
  'Choose a backup file made by MettleUp or the old ForgeAI app. You see what is inside before anything changes.';

/** "Putting back 12 of 40 photos…" and the steps after. */
export function restoringText(step: 'photos' | 'data' | 'records', done: number, total: number): string {
  if (step === 'photos') return `Putting back ${Math.min(done + 1, total)} of ${total} ${total === 1 ? 'photo' : 'photos'}…`;
  if (step === 'data') return 'Putting back your workouts and routines…';
  return 'Working out your records…';
}

export const REPLACE_LABEL = 'Replace everything on this phone';
export const ADD_LABEL = 'Add to what’s here';

/** Under the two choices. */
export function choiceHelp(phoneWorkouts: number): string {
  if (phoneWorkouts <= 0) return 'Your settings and profile come back too. Photos already on this phone stay.';
  return `“${REPLACE_LABEL}”: this phone’s ${n(phoneWorkouts, 'workout')}, routines and measurements go, and the backup’s come in, with its settings and profile. “${ADD_LABEL}”: only what this phone doesn’t have yet comes in; your settings stay.`;
}

/** The question before Replace. */
export function replaceQuestion(removed: number, onlyHere: number): { title: string; body: string } {
  const back = 'A copy is kept while you stay on this screen, so you can undo.';
  if (removed <= 0) return { title: 'Replace with this backup?', body: `Your settings and profile come from the backup. ${back}` };
  const only = onlyHere > 0 ? ` ${onlyHere} of them ${onlyHere === 1 ? 'is' : 'are'} not in the backup.` : ' Every one of them is in the backup too.';
  return { title: `Delete ${n(removed, 'workout')} first?`, body: `This phone’s ${n(removed, 'workout')} go and the backup’s come in.${only} ${back}` };
}

/** After the restore. */
export function restoredText(o: { mode: 'replace' | 'add'; workouts: number; routines: number; measurements: number; photos: number; photosFailed: number; alreadyHere: number }): string {
  const parts = [n(o.workouts, 'workout'), n(o.routines, 'routine'), n(o.measurements, 'measurement'), n(o.photos, 'photo')];
  let s = `Restored ${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}.`;
  if (o.mode === 'add' && o.alreadyHere > 0) s += ` ${n(o.alreadyHere, 'workout')} ${o.alreadyHere === 1 ? 'was' : 'were'} already here, so ${o.alreadyHere === 1 ? 'it was' : 'they were'} left out.`;
  if (o.photosFailed > 0) s += ` ${n(o.photosFailed, 'photo')} couldn’t be put back.`;
  return s;
}

/** The backup had Health Connect on: Android asks for it on each phone, so the member turns it on. */
export const HEALTH_AGAIN = 'Health Connect was on in your backup. Android asks for permission on each phone, so turn it on again in Settings → Health Connect.';

export const RESTORE_FAILED = 'Couldn’t restore the backup. Nothing was changed. Please try again.';
export const FINISH_WORKOUT_FIRST = 'Finish your workout first: finish or discard the workout in progress, then restore.';
export const UNDO_DONE = 'Done. This phone is back to how it was before the restore.';
export const UNDO_FAILED = 'Couldn’t undo. Please try again.';
