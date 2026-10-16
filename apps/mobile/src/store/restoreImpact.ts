/**
 * 16 Oct 2026 audit (C4-9): what "Restore from Drive" removes, said before it happens — the
 * Replace import already says how many workouts go (`replaceImpact`); the restore said only
 * "This replaces what's on this phone". PURE.
 */

/** Workouts on this phone (their ids) that the backup does not hold. */
export function workoutsNotInBackup(phoneIds: readonly string[], env: { tables: Record<string, readonly { id?: unknown }[] | undefined> }): number {
  const kept = new Set((env.tables['workout_sessions'] ?? []).map((r) => String(r.id)));
  return phoneIds.filter((id) => !kept.has(id)).length;
}

/** The restore question's body: `base`, the workouts it removes (when any), and the undo line. */
export function restoreConfirmText(base: string, removed: number): string {
  const one = removed === 1;
  const loss =
    removed > 0 ? ` ${removed} ${one ? 'workout' : 'workouts'} on this phone ${one ? 'is' : 'are'} not in this backup and will be removed.` : '';
  return `${base}${loss} A copy of this phone is kept first, so you can undo it.`;
}
