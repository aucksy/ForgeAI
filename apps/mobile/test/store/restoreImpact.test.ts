/**
 * 16 Oct 2026 audit (C4-9): restoring a Drive backup says how many newer workouts on this phone
 * will go. Failed before the fix (no such helpers).
 */
import { describe, expect, it } from 'vitest';

import { restoreConfirmText, workoutsNotInBackup } from '@/store/restoreImpact';

describe('C4-9: the restore question counts what it removes', () => {
  it('counts the phone workouts the backup does not have', () => {
    expect(workoutsNotInBackup(['a', 'b', 'c'], { tables: { workout_sessions: [{ id: 'a' }, { id: 'b' }] } })).toBe(1);
    expect(workoutsNotInBackup(['a'], { tables: {} })).toBe(1);
  });

  it('says so in the question, and says nothing extra when none go', () => {
    const base = 'This replaces what’s on this phone with your backup.';
    expect(restoreConfirmText(base, 0)).toBe(`${base} A copy of this phone is kept first, so you can undo it.`);
    expect(restoreConfirmText(base, 3)).toBe(
      `${base} 3 workouts on this phone are not in this backup and will be removed. A copy of this phone is kept first, so you can undo it.`,
    );
    expect(restoreConfirmText(base, 1)).toContain('1 workout on this phone is not in this backup and will be removed.');
  });
});
