/**
 * Start-up failure → what the error screen says (audit DS-08 / SH-11). Pure: no React, no
 * database, so the decision is unit-tested on its own.
 */
import { StartupError, type StartupStage } from '@/db/startupError';

export interface BootFailure {
  stage: StartupStage;
  /** The phone ran out of storage (the most common cause, and the one the member can fix). */
  storageFull: boolean;
  /** The raw error text, shown only under "Details" for support. */
  detail: string;
}

const STORAGE_FULL = /SQLITE_FULL|database or disk is full|ENOSPC|no space left/i;

function messageOf(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  try {
    return JSON.stringify(e) ?? String(e);
  } catch {
    return String(e);
  }
}

/** True when an error (from SQLite or the file system) means the phone's storage is full. */
export function isStorageFull(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  if (STORAGE_FULL.test(e.message)) return true;
  const code = (e as { code?: unknown }).code;
  if (typeof code === 'string' && STORAGE_FULL.test(code)) return true;
  const original = e instanceof StartupError ? e.original : undefined;
  return original !== undefined && original !== e && isStorageFull(original);
}

/** Any thrown value from start-up → the failure the error screen shows. */
export function bootFailureFrom(e: unknown): BootFailure {
  let stage: StartupStage = 'read';
  if (e instanceof StartupError) stage = e.stage;
  // A read that ran before the database ever opened (getDb() throws this).
  else if (/not initialised/i.test(messageOf(e))) stage = 'open';
  const label = stage === 'open' ? 'Opening' : stage === 'upgrade' ? 'Updating' : 'Reading';
  return { stage, storageFull: isStorageFull(e), detail: `${label} the database failed: ${messageOf(e)}` };
}

const STILL_HERE = 'Your workouts are still on this phone. Tap Try again.';

/** Title and main line for the error screen. */
export function bootMessage(f: BootFailure): { title: string; body: string } {
  if (f.storageFull) {
    return {
      title: "Your phone's storage is full",
      body: "Your phone's storage is full. Free some space, then tap Try again.",
    };
  }
  switch (f.stage) {
    case 'open':
      return { title: 'ForgeAI could not start', body: `ForgeAI couldn't open your data. ${STILL_HERE}` };
    case 'upgrade':
      return { title: 'ForgeAI could not start', body: `ForgeAI couldn't finish updating your data. ${STILL_HERE}` };
    default:
      return { title: 'ForgeAI could not start', body: `ForgeAI couldn't read your data. ${STILL_HERE}` };
  }
}
