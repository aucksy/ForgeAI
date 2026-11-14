/**
 * R-539: the quiet "Updated 20 s ago · Refresh" line on Enquiries and on Today's "Needs you". The age counts on by
 * itself (a redraw every few seconds while the tab is in view, no server call); Refresh pulls the gym's records and
 * reads the alerts and every waiting list at once, the same reads the timers make. Hidden until the first pull worked
 * (the demo gym and a gym kept only in this browser never show it). Words and the freshness store: logic/freshness.ts.
 */

import { useEffect, useState, useSyncExternalStore } from 'react';

import { t } from '../lang/lang';
import { FRESH_WORDS, freshAt, subscribeFresh, updatedWords, type FreshSource } from '../logic/freshness';
import { useCrm } from '../store';
import { useNeedsYou } from './NeedsYou';
import { Button, color, font, space } from './kit';

/** How often the age on screen moves on. */
const TICK_MS = 5_000;

export function UpdatedLine({ source }: { source: FreshSource }) {
  const at = useSyncExternalStore(
    subscribeFresh,
    () => freshAt(source),
    () => null,
  );
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') setNow(Date.now());
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, []);
  // A pull that lands redraws through `at`; the age is then measured from this moment.
  useEffect(() => setNow(Date.now()), [at]);
  const { refreshNow } = useCrm();
  const { refreshAll } = useNeedsYou();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  if (at === null) return null;

  const press = async () => {
    const start = Date.now();
    const hadRecords = freshAt('records') !== null;
    setBusy(true);
    setFailed(false);
    try {
      const [, needsOk] = await Promise.all([refreshNow(), refreshAll()]);
      const recordsOk = !hadRecords || (freshAt('records') ?? 0) >= start;
      setFailed(!(needsOk && recordsOk));
    } catch (e) {
      console.warn('[ForgeErr] refresh', e);
      setFailed(true);
    } finally {
      setBusy(false);
      setNow(Date.now());
    }
  };

  const w = updatedWords(now - at);
  return (
    <div
      data-testid={`updated-${source}`}
      style={{ marginTop: space.sm, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: space.sm, minWidth: 0 }}
    >
      {/* Not role="status": the screens' short messages use it (one toast per page). */}
      <span data-testid="updated-words" style={{ fontFamily: font.body, fontSize: 13, color: color.inkSecondary }}>
        {failed ? t(FRESH_WORDS.failed) : t(w.key, w.vars)}
      </span>
      <Button variant="quiet" disabled={busy} onClick={press}>
        {busy ? t(FRESH_WORDS.refreshing) : t(FRESH_WORDS.refresh)}
      </Button>
    </div>
  );
}
