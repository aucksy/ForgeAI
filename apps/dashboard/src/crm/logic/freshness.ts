/**
 * R-539 (owner, 14 Nov 2026): "ensure that these real time notifications or changes ... is basically popping up real
 * time. If not real-time, whatever the minimum possible gap ... we should give them a refresh button somewhere".
 * How fresh the panel's lists are, for the quiet "Updated 20 s ago" line with its Refresh button (ui/UpdatedLine.tsx)
 * on Enquiries and on Today's "Needs you":
 *  - 'records': the gym's records (members, enquiries ...), pulled every 15 s while the tab is in view (store.tsx);
 *  - 'needs':   the alerts and the waiting lists, read every minute while the tab is in view (ui/NeedsYou.tsx).
 * Both stop while the tab is hidden (R-522: Cloudflare's free plan) and look again at once when it comes back. New
 * alerts reach a hidden or closed panel by web push (0076).
 * A tiny store of its own, so only the line redraws when a pull lands (never the whole app, every 15 s).
 */

export type FreshSource = 'records' | 'needs';

const at: Record<FreshSource, number | null> = { records: null, needs: null };
const listeners = new Set<() => void>();

/** A pull of `source` worked at `ms`. */
export function markFresh(source: FreshSource, ms: number = Date.now()): void {
  if (at[source] !== null && (at[source] as number) >= ms) return;
  at[source] = ms;
  for (const f of listeners) f();
}

/** When `source` last worked; null when it never did on this page (the demo gym, an offline-only gym). */
export function freshAt(source: FreshSource): number | null {
  return at[source];
}

export function subscribeFresh(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

/** For tests: forget everything. */
export function resetFreshForTests(): void {
  at.records = null;
  at.needs = null;
}

/** The line's words as an English key and its values (for t()). PURE. */
export function updatedWords(ageMs: number): { key: string; vars?: { n: number } } {
  const s = Math.max(0, Math.floor(ageMs / 1000));
  if (s < 10) return { key: 'Updated just now' };
  if (s < 60) return { key: 'Updated {n} s ago', vars: { n: Math.floor(s / 10) * 10 } };
  const m = Math.floor(s / 60);
  if (m < 60) return { key: 'Updated {n} min ago', vars: { n: m } };
  return { key: 'Updated over an hour ago' };
}

export const FRESH_WORDS = {
  refresh: 'Refresh',
  refreshing: 'Refreshing…',
  failed: 'Could not refresh. Check the internet and try again.',
} as const;
