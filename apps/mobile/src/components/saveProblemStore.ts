/**
 * The app-wide "couldn't save" state behind `SaveProblemBanner` (audit DS-09 / LW-01).
 *
 * Two kinds of failure report here; the banner shows one calm line.
 *  - The live-workout AUTOSAVE (`reportSaveProblem`): it retries by itself, so the line says
 *    "we'll keep trying", the failures in a row drive its back-off, and its next successful
 *    save clears it (`clearSaveProblem`).
 *  - A failed FINISH or edit SAVE (`reportActionProblem`): nothing retries it — the member must
 *    tap again — so the line says exactly that, and an autosave that works afterwards neither
 *    clears it nor counts towards the autosave's back-off. It goes when the workout is finished,
 *    saved or discarded (`clearAllSaveProblems`).
 * Pure (no React Native) so it can be unit-tested.
 */
import { create } from 'zustand';

export const STORAGE_FULL_MESSAGE = "Couldn't save — your phone's storage may be full. Free some space; we'll keep trying.";
export const GENERIC_SAVE_MESSAGE = "Couldn't save your workout. We'll keep trying.";
export const FINISH_FAILED_MESSAGE = "Couldn't finish your workout. It's still open — tap Finish again.";
export const FINISH_STORAGE_FULL_MESSAGE =
  "Couldn't finish your workout — your phone's storage may be full. It's still open: free some space, then tap Finish again.";
export const SAVE_EDITS_FAILED_MESSAGE = "Couldn't save your changes. They're still open — tap Save changes again.";
export const SAVE_EDITS_STORAGE_FULL_MESSAGE =
  "Couldn't save your changes — your phone's storage may be full. They're still open: free some space, then tap Save changes again.";

/** True when the error means the phone has no room left (SQLite or the file system). */
export function isStorageFull(err: unknown): boolean {
  const parts: string[] = [];
  if (err && typeof err === 'object') {
    const e = err as { message?: unknown; code?: unknown; cause?: unknown };
    if (typeof e.message === 'string') parts.push(e.message);
    if (typeof e.code === 'string' || typeof e.code === 'number') parts.push(String(e.code));
    if (e.cause) parts.push(String((e.cause as { message?: unknown }).message ?? e.cause));
  } else if (err != null) {
    parts.push(String(err));
  }
  const text = parts.join(' ');
  return /SQLITE_FULL|database or disk is full|disk is full|ENOSPC|no space left/i.test(text);
}

/** The banner's words for a save failure. Never a code or a stack trace. */
export function saveProblemMessage(err: unknown): string {
  return isStorageFull(err) ? STORAGE_FULL_MESSAGE : GENERIC_SAVE_MESSAGE;
}

/** The banner's words for a Finish / edit Save that failed and is NOT retried. */
export function actionProblemMessage(action: 'finish' | 'save', err: unknown): string {
  const full = isStorageFull(err);
  if (action === 'finish') return full ? FINISH_STORAGE_FULL_MESSAGE : FINISH_FAILED_MESSAGE;
  return full ? SAVE_EDITS_STORAGE_FULL_MESSAGE : SAVE_EDITS_FAILED_MESSAGE;
}

interface SaveProblemState {
  /** The line the banner shows, or null when every save is going through. */
  message: string | null;
  /** How many AUTOSAVES in a row have failed (drives the autosave's retry back-off only). */
  failures: number;
  /** A failed Finish / edit Save the member must tap again (wins the banner while set). */
  actionMessage: string | null;
  /** The autosave's own line while it is failing. */
  draftMessage: string | null;
}

export const useSaveProblem = create<SaveProblemState>()(() => ({
  message: null,
  failures: 0,
  actionMessage: null,
  draftMessage: null,
}));

function show(patch: Partial<SaveProblemState>): void {
  const next = { ...useSaveProblem.getState(), ...patch };
  useSaveProblem.setState({ ...patch, message: next.actionMessage ?? next.draftMessage });
}

/** An autosave failed: show the banner. Returns the number of autosave failures in a row. */
export function reportSaveProblem(err: unknown): number {
  const failures = useSaveProblem.getState().failures + 1;
  show({ draftMessage: saveProblemMessage(err), failures });
  return failures;
}

/** An autosave went through: its line goes (a failed Finish's line stays — it still needs a tap). */
export function clearSaveProblem(): void {
  const s = useSaveProblem.getState();
  if (s.draftMessage !== null || s.failures !== 0) show({ draftMessage: null, failures: 0 });
}

/** A Finish / edit Save failed: the workout is still open and nothing retries it. */
export function reportActionProblem(action: 'finish' | 'save', err: unknown): void {
  show({ actionMessage: actionProblemMessage(action, err) });
}

/** The workout was finished, saved or discarded: every save line goes. */
export function clearAllSaveProblems(): void {
  const s = useSaveProblem.getState();
  if (s.message !== null || s.failures !== 0 || s.actionMessage !== null || s.draftMessage !== null) {
    useSaveProblem.setState({ message: null, failures: 0, actionMessage: null, draftMessage: null });
  }
}

/** Wait before the next automatic retry: 2 s, 4 s, 8 s … at most 30 s. */
export function retryDelayMs(failures: number): number {
  return Math.min(30_000, 1000 * 2 ** Math.max(1, Math.min(failures, 5)));
}
