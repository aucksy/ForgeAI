/**
 * Plain words for every Google Drive backup and restore problem (audit C9-8 to C9-14).
 *
 * Before, the Backup screen showed whatever was thrown: Google's raw sign-in text, "Drive request
 * failed (403)" with 140 characters of Google's JSON, or a SQLite message. Now a member only ever
 * reads a sentence written here, each with a next step; the technical detail goes to the log
 * (`[ForgeErr]`), where a developer can read it.
 *
 * PURE (no native imports), so the words are tested without a phone.
 */

/** An error whose message is plain words, safe to show a member as it is. */
export class PlainError extends Error {}

/** A Google Drive problem. Its message is plain words; `detail` is the developer text (logged). */
export class DriveError extends PlainError {
  constructor(
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    if (detail) console.warn(`[ForgeErr] drive: ${detail}`);
  }
}

/** Drive backup can't work in this build (no Google client, or the build's key isn't registered). */
export const DRIVE_NOT_IN_THIS_VERSION =
  'Google Drive backup isn’t working in this version of ForgeAI. For now, keep a copy with Save my history (Settings → Export & import), and tell your gym.';

export const DRIVE_NO_INTERNET = 'Couldn’t reach Google Drive. Check your internet and try again.';

export const DRIVE_SIGN_IN_AGAIN = 'Google Drive needs you to sign in again. Tap Unlink Google, then Link Google Drive.';

/** A Drive web reply that was not OK → the member's words. PURE. */
export function driveStatusWords(status: number, body: string): string {
  const b = body.toLowerCase();
  if (status === 507 || b.includes('storagequotaexceeded') || b.includes('quotaexceeded')) {
    return 'Your Google Drive is full. Free some space in Drive, then tap Back up now.';
  }
  if (status === 429 || b.includes('ratelimitexceeded')) {
    return 'Google Drive is busy right now. Wait a minute, then try again.';
  }
  if (status === 401 || status === 403) return DRIVE_SIGN_IN_AGAIN;
  return DRIVE_NO_INTERNET;
}

/** A backup file this version can't read → words with a next step. PURE. */
export function backupVersionWords(backupVersion: unknown, appVersion: number): string | null {
  if (typeof backupVersion !== 'number' || !Number.isFinite(backupVersion)) {
    return 'That backup file is damaged, so it can’t be restored. Make a new backup with Back up now.';
  }
  // Older backups restore: every column added since comes back empty (see snapshot.ts).
  if (backupVersion <= appVersion) return null;
  return 'This backup was made by a newer ForgeAI. Update ForgeAI from the Play Store, then restore again.';
}

/**
 * What the Backup screen shows for a thrown error: a PlainError's own words, otherwise the fixed
 * `fallback` (the raw text, which can be SQLite's or a file error, goes to the log). PURE apart
 * from the log line.
 */
export function shownBackupError(e: unknown, fallback: string, what: string): string {
  if (e instanceof PlainError) return e.message;
  console.warn(`[ForgeErr] backup: ${what} failed`, e);
  return fallback;
}
