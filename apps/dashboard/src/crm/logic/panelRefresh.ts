/**
 * R-561 (owner, 15 Nov 2026): one Refresh for the WHOLE admin panel, in the top bar on every page ("updated XX seconds
 * or minutes ago and then a button to refresh"). The button (ui/RefreshButton.tsx) pulls the gym's records and the
 * alerts with every waiting list (the same reads the timers make), and then asks every part of the open page that
 * reads its own list (the bell's messages from MettleUp, Member messages, Member questions ...) to read it again.
 * Nothing reloads the page, so the scroll place and an open form stay as they are.
 *
 * A part that reads its own list joins with `onPanelRefresh` (ui: usePanelRefresh) and leaves when it closes. Its
 * answer: false when its read failed (the button then says so in a plain sentence). PURE apart from the list.
 */

export type RefreshPart = () => Promise<boolean | void> | boolean | void;

const parts = new Set<RefreshPart>();

/** Join the panel's Refresh; returns the way to leave. */
export function onPanelRefresh(part: RefreshPart): () => void {
  parts.add(part);
  return () => {
    parts.delete(part);
  };
}

/** How many parts are listening now (for tests). */
export function panelRefreshParts(): number {
  return parts.size;
}

/**
 * Ask every part at once; true when every one worked. A part that throws counts as failed and is logged; the others
 * still run.
 */
export async function runPanelRefresh(): Promise<boolean> {
  const answers = await Promise.allSettled([...parts].map(async (p) => p()));
  let ok = true;
  for (const a of answers) {
    if (a.status === 'rejected') {
      ok = false;
      console.warn('[ForgeErr] refresh: a part failed', a.reason);
    } else if (a.value === false) {
      ok = false;
    }
  }
  return ok;
}

/** The age the top bar shows: the OLDER of the two timed reads (records, alerts) that worked; null when neither did. PURE. */
export function panelFreshAt(records: number | null, needs: number | null): number | null {
  if (records === null) return needs;
  if (needs === null) return records;
  return Math.min(records, needs);
}

/** The short age for a phone's top bar, under the Refresh icon: "now", "20 s", "3 min", "1 h+". PURE. */
export function shortAge(ageMs: number): { key: string; vars?: { n: number } } {
  const s = Math.max(0, Math.floor(ageMs / 1000));
  if (s < 10) return { key: 'now' };
  if (s < 60) return { key: '{n} s', vars: { n: Math.floor(s / 10) * 10 } };
  const m = Math.floor(s / 60);
  if (m < 60) return { key: '{n} min', vars: { n: m } };
  return { key: '1 h+' };
}
