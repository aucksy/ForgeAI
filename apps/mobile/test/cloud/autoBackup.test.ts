import { describe, expect, it, vi } from 'vitest';

// The Drive store pulls native modules in; the rules under test never touch it.
vi.mock('@/store/backupStore', () => ({ useBackup: { getState: () => ({}) } }));

import { AUTO_BACKUP_WORDS, MIN_GAP_MS, STALE_AFTER_MS, autoBackupDue, staleBackupDays } from '@/cloud/autoBackup';

const now = Date.parse('2026-10-21T20:00:00Z');
const ago = (ms: number) => new Date(now - ms).toISOString();

describe('automatic Drive backup (backlog, 21 Oct)', () => {
  it('backs up after a workout only for a linked member whose phone backed up before, at most once in 10 minutes', () => {
    expect(autoBackupDue(false, ago(STALE_AFTER_MS), now)).toBe(false);
    // Review MUST-FIX: a new phone (never backed up here) must not bury the real backup on Drive.
    expect(autoBackupDue(true, null, now)).toBe(false);
    expect(autoBackupDue(true, ago(MIN_GAP_MS - 1000), now)).toBe(false);
    expect(autoBackupDue(true, ago(MIN_GAP_MS + 1000), now)).toBe(true);
  });
  it('the Workout tab card: linked members whose phone backed up before, after 3 days', () => {
    expect(staleBackupDays(false, ago(10 * STALE_AFTER_MS), now)).toBeNull();
    expect(staleBackupDays(true, ago(STALE_AFTER_MS - 1000), now)).toBeNull();
    expect(staleBackupDays(true, ago(4 * 24 * 3600 * 1000), now)).toBe(4);
    expect(staleBackupDays(true, null, now)).toBeNull();
  });
  it('member words never say volume, PR or session', () => {
    for (const w of [AUTO_BACKUP_WORDS.stale(4), AUTO_BACKUP_WORDS.button, AUTO_BACKUP_WORDS.done, AUTO_BACKUP_WORDS.failed])
      expect(w).not.toMatch(/\b(volume|PR|session)\b/i);
  });
});
