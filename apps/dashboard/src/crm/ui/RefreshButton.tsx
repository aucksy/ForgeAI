/**
 * R-561 (owner, 15 Nov 2026): the panel's ONE Refresh, in the top bar on every page (logic/panelRefresh.ts). It
 * replaces R-539's two quiet lines (Enquiries, Today's "Needs you"), so a screen never has two refresh buttons.
 *  - A computer: "Updated 20 s ago" and a Refresh button.
 *  - A phone: a round button with the refresh mark and the short age under it ("20 s"); the whole sentence is its
 *    name for a screen reader. While it runs and when it fails, a small line under the top bar says so.
 * The age counts on by itself (a redraw every few seconds while the tab is in view, no server call). Hidden until a
 * timed read first worked: the demo gym and a gym kept only in this browser never show it.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { t } from '../lang/lang';
import { FRESH_WORDS, freshAt, subscribeFresh, updatedWords } from '../logic/freshness';
import { panelFreshAt, runPanelRefresh, shortAge } from '../logic/panelRefresh';
import { useCrm } from '../store';
import { useNeedsYou } from './NeedsYou';
import { TOUCH, color, font, radius, space } from './kit';

/** How often the age on screen moves on. */
const TICK_MS = 5_000;

const both = () => `${freshAt('records') ?? ''}|${freshAt('needs') ?? ''}`;

function RefreshMark({ spin }: { spin: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      // The turn is in index.css (mu-spin); it stays still for people who ask for less motion.
      style={{ flexShrink: 0, animation: spin ? 'mu-spin 900ms linear infinite' : undefined }}
    >
      <path d="M20 11a8 8 0 0 0-14.6-4.5L4 8" />
      <path d="M4 3v5h5" />
      <path d="M4 13a8 8 0 0 0 14.6 4.5L20 16" />
      <path d="M20 21v-5h-5" />
    </svg>
  );
}

export function RefreshButton({ compact = false }: { compact?: boolean }) {
  const sig = useSyncExternalStore(subscribeFresh, both, () => '|');
  const at = panelFreshAt(freshAt('records'), freshAt('needs'));
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') setNow(Date.now());
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, []);
  // A read that lands redraws through `sig`; the age is then measured from this moment.
  useEffect(() => setNow(Date.now()), [sig]);
  const { refreshNow } = useCrm();
  const { refreshAll } = useNeedsYou();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const live = useRef(true);
  useEffect(
    () => () => {
      live.current = false;
    },
    [],
  );
  if (at === null) return null;

  const press = async () => {
    if (busy) return;
    const start = Date.now();
    const hadRecords = freshAt('records') !== null;
    setBusy(true);
    setFailed(false);
    try {
      const [, needsOk, partsOk] = await Promise.all([refreshNow(), refreshAll(), runPanelRefresh()]);
      const recordsOk = !hadRecords || (freshAt('records') ?? 0) >= start;
      if (live.current) setFailed(!(needsOk && recordsOk && partsOk));
    } catch (e) {
      console.warn('[ForgeErr] refresh', e);
      if (live.current) setFailed(true);
    } finally {
      if (live.current) {
        setBusy(false);
        setNow(Date.now());
      }
    }
  };

  const w = updatedWords(now - at);
  const sentence = failed ? t(FRESH_WORDS.failed) : t(w.key, w.vars);
  const short = shortAge(now - at);

  if (compact) {
    return (
      <div data-testid="panel-refresh" data-panel-refresh="" style={{ position: 'relative', flexShrink: 0 }}>
        <button
          type="button"
          onClick={() => void press()}
          aria-label={`${busy ? t(FRESH_WORDS.refreshing) : t(FRESH_WORDS.refresh)}. ${sentence}`}
          aria-busy={busy}
          style={{
            width: TOUCH - 4,
            height: TOUCH - 4,
            display: 'grid',
            placeItems: 'center',
            alignContent: 'center',
            gap: 0,
            padding: 0,
            background: 'transparent',
            border: `1px solid ${failed ? color.critical : color.border}`,
            borderRadius: radius.pill,
            color: failed ? color.criticalText : color.ink,
            cursor: busy ? 'default' : 'pointer',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <RefreshMark spin={busy} />
          <span aria-hidden style={{ fontFamily: font.body, fontSize: 9, fontWeight: 700, lineHeight: 1, color: color.inkSecondary, fontVariantNumeric: 'tabular-nums' }}>
            {failed ? '!' : t(short.key, short.vars)}
          </span>
        </button>
        {/* The whole sentence, for tests and screen readers; on screen only while it runs or failed. */}
        <span data-testid="updated-words" style={visuallyHidden}>
          {sentence}
        </span>
        {busy || failed ? (
          <p
            role={failed ? 'alert' : undefined}
            style={{
              position: 'fixed',
              left: space.lg,
              right: space.lg,
              top: 'calc(var(--demo-bar, 0px) + 64px)',
              zIndex: 40,
              margin: 0,
              padding: `${space.sm}px ${space.md}px`,
              borderRadius: radius.md,
              border: `1px solid ${failed ? color.critical : color.border}`,
              background: color.surface,
              boxShadow: '0 8px 20px rgba(0, 0, 0, 0.22)',
              fontFamily: font.body,
              fontSize: 14,
              lineHeight: 1.4,
              color: failed ? color.criticalText : color.ink,
            }}
          >
            {busy ? t(FRESH_WORDS.refreshing) : t(FRESH_WORDS.failed)}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div data-testid="panel-refresh" data-panel-refresh="" style={{ display: 'flex', alignItems: 'center', gap: space.sm, minWidth: 0 }}>
      {/* Not role="status": the screens' short messages use it (one toast per page). */}
      <span
        data-testid="updated-words"
        role={failed ? 'alert' : undefined}
        style={{ fontFamily: font.body, fontSize: 13, color: failed ? color.criticalText : color.inkSecondary, whiteSpace: 'nowrap' }}
      >
        {sentence}
      </span>
      <button
        type="button"
        onClick={() => void press()}
        disabled={busy}
        aria-busy={busy}
        style={{
          appearance: 'none',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          minHeight: TOUCH - 4,
          padding: '0 14px',
          borderRadius: radius.pill,
          border: `1px solid ${color.borderStrong}`,
          background: 'transparent',
          color: color.ink,
          fontFamily: font.body,
          fontSize: 14,
          fontWeight: 600,
          cursor: busy ? 'default' : 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        <RefreshMark spin={busy} />
        {busy ? t(FRESH_WORDS.refreshing) : t(FRESH_WORDS.refresh)}
      </button>
    </div>
  );
}

const visuallyHidden = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const;
