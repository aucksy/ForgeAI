/** A member with no activity for this many days (or never) counts as "at risk". */
export const AT_RISK_DAYS = 7;

/** True when a member hasn't been active within AT_RISK_DAYS (or never synced activity). */
export function isAtRisk(lastActiveIso: string | null): boolean {
  const d = daysSince(lastActiveIso);
  return d === null || d >= AT_RISK_DAYS;
}

/** Whole days between `iso` and now (floored), or null if absent/invalid. */
export function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((Date.now() - then) / 86_400_000);
}

/** Human "last active" label from an ISO timestamp. */
export function relativeDay(iso: string | null): string {
  const d = daysSince(iso);
  if (d === null) return 'never';
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d} days ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

export function fmtWeight(kg: number | null): string {
  return kg == null ? '—' : `${kg.toFixed(1)} kg`;
}

/** First-name-ish initial block for an avatar chip. */
export function initials(name: string | null): string {
  const n = (name ?? '').trim();
  if (!n) return '?';
  const parts = n.split(/\s+/);
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}
