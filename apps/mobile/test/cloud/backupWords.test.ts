/**
 * Audit C9-8 to C9-14: a Google Drive backup or restore problem reaches the member as plain words
 * with a next step. The developer text (SHA-1, OAuth client, Google's JSON, SQLite's message)
 * only goes to the log.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  backupVersionWords,
  DRIVE_NOT_IN_THIS_VERSION,
  DriveError,
  driveStatusWords,
  PlainError,
  shownBackupError,
} from '@/cloud/backupWords';
import { parseSnapshot } from '@/cloud/snapshot';

const DEVELOPER_WORDS = /SHA-?1|OAuth|com\.forgeai|Google Cloud|\(\d{3}\)|\{|error_description|DEVELOPER_ERROR/i;

afterEach(() => vi.restoreAllMocks());

describe('Drive web replies become plain words', () => {
  it('a 401 or 403 asks the member to sign in again, naming the buttons on the card', () => {
    expect(driveStatusWords(401, '{"error":{"code":401}}')).toBe(
      'Google Drive needs you to sign in again. Tap Unlink Google, then Link Google Drive.',
    );
    expect(driveStatusWords(403, '{"error":{"reason":"insufficientPermissions"}}')).toContain('sign in again');
  });

  it('a full Drive says so, whether Google sends 403 storageQuotaExceeded or 507', () => {
    const full = 'Your Google Drive is full. Free some space in Drive, then tap Back up now.';
    expect(driveStatusWords(403, '{"error":{"errors":[{"reason":"storageQuotaExceeded"}]}}')).toBe(full);
    expect(driveStatusWords(507, '')).toBe(full);
  });

  it('a rate limit asks to wait; anything else is the internet line', () => {
    expect(driveStatusWords(429, '')).toContain('Wait a minute');
    expect(driveStatusWords(403, '{"reason":"userRateLimitExceeded"}')).toContain('Wait a minute');
    expect(driveStatusWords(500, 'Internal error')).toBe('Couldn’t reach Google Drive. Check your internet and try again.');
  });

  it('no line carries a status code, JSON or developer word', () => {
    for (const [s, b] of [[401, ''], [403, 'storageQuotaExceeded'], [429, ''], [500, '{}'], [404, '']] as const) {
      expect(driveStatusWords(s, b)).not.toMatch(DEVELOPER_WORDS);
    }
    expect(DRIVE_NOT_IN_THIS_VERSION).not.toMatch(DEVELOPER_WORDS);
    expect(DRIVE_NOT_IN_THIS_VERSION).toContain('Save my history');
  });
});

describe('the developer detail goes to the log only', () => {
  it('a DriveError logs its detail with [ForgeErr] and shows only its message', () => {
    const log = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const e = new DriveError(DRIVE_NOT_IN_THIS_VERSION, 'DEVELOPER_ERROR: add the SHA-1');
    expect(log).toHaveBeenCalledWith('[ForgeErr] drive: DEVELOPER_ERROR: add the SHA-1');
    expect(shownBackupError(e, 'fallback', 'link')).toBe(DRIVE_NOT_IN_THIS_VERSION);
  });

  it('a raw SQLite or file error shows the fixed fallback, and is logged', () => {
    const log = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const raw = new Error('SQLITE_FULL: database or disk is full');
    expect(shownBackupError(raw, 'Could not restore. Nothing was changed.', 'restore')).toBe('Could not restore. Nothing was changed.');
    expect(log).toHaveBeenCalledWith('[ForgeErr] backup: restore failed', raw);
  });

  it('a PlainError (already plain words) is shown as it is', () => {
    expect(shownBackupError(new PlainError('Plain.'), 'fallback', 'x')).toBe('Plain.');
  });
});

describe('C9-14: an older backup restores; a newer one says what to do', () => {
  const envelope = (v: unknown): string => JSON.stringify({ app: 'forgeai', schema_version: v, exported_at: '2026-01-01T00:00:00Z', tables: {} });

  it('the words', () => {
    expect(backupVersionWords(1, 1)).toBeNull();
    expect(backupVersionWords(0, 1)).toBeNull();
    expect(backupVersionWords(2, 1)).toBe('This backup was made by a newer ForgeAI. Update ForgeAI from the Play Store, then restore again.');
    expect(backupVersionWords('1', 1)).toContain('damaged');
  });

  it('parseSnapshot takes an older backup and refuses a newer one with the update step', () => {
    expect(parseSnapshot(envelope(0)).schema_version).toBe(0);
    expect(() => parseSnapshot(envelope(99))).toThrow('Update ForgeAI from the Play Store');
    expect(() => parseSnapshot(envelope(99))).toThrow(PlainError);
    expect(() => parseSnapshot('not json')).toThrow(PlainError);
  });
});
