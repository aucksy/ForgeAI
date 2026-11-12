/**
 * F201: the floating "AI Assistant" button (canvas boards "EntryPhone", "EntryDesk", "EntryDeskOpen"), owner only.
 *
 * - Computer: bottom right (28 px in). A tap opens the 420 px side panel; the page behind stays usable (no dimming,
 *   the page moves left so nothing is under the panel).
 * - Phone: bottom right, just above the bottom bar (90 px up). A tap opens /assistant full screen. While the page
 *   scrolls down it shrinks to a round sparkle; scrolling up brings the words back.
 * - Hidden: for desk staff and trainers, until the server's wallet answers (useAssistant), on /assistant, while a
 *   sheet, a toast or the undo bar shows, and on a phone while the keyboard is up.
 * - It sets --assist-fab-space (and --assist-panel-space when the panel is open), which AppShell adds to the page's
 *   bottom (right) padding, so the last row is never hidden.
 */
import { useEffect, useState } from 'react';

import { t } from '../../lang/lang';
import { color, font, useIsCompact } from '../../ui/kit';
import { navigate, useRoute } from '../../ui/router';
import { useAssistant } from '../useAssistant';
import { AssistantHome } from './AssistantHome';
import { SparkleIcon, setPanelOpen, useOpener } from './parts';

export const PANEL_WIDTH = 420;

/** Something on top of the page that the button must not cover or sit over: a sheet, a dialog, a toast. */
function overlayShowing(): boolean {
  return document.querySelector('[aria-modal="true"], [data-floating]') !== null;
}

function useOverlayShowing(active: boolean): boolean {
  const [showing, setShowing] = useState(false);
  useEffect(() => {
    if (!active) return undefined;
    let frame = 0;
    const check = (): void => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setShowing(overlayShowing()));
    };
    check();
    const watch = new MutationObserver(check);
    watch.observe(document.body, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(frame);
      watch.disconnect();
    };
  }, [active]);
  return showing;
}

/** A phone's keyboard is up: a text box has the focus. */
function useTyping(active: boolean): boolean {
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    if (!active) return undefined;
    const isField = (el: Element | null): boolean =>
      !!el && (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit'].includes((el as HTMLInputElement).type)) || (el as HTMLElement).isContentEditable);
    const update = (): void => setTyping(isField(document.activeElement));
    // Focus leaving a box lands on the next one a moment later: check after it settles.
    const later = (): void => void window.setTimeout(update, 0);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', later);
    return () => {
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', later);
    };
  }, [active]);
  return typing;
}

/** True while the page is scrolling down (the phone's button shrinks), false when it goes back up. */
function useScrollingDown(active: boolean): boolean {
  const [down, setDown] = useState(false);
  useEffect(() => {
    if (!active) return undefined;
    let last = window.scrollY;
    const onScroll = (): void => {
      const y = window.scrollY;
      if (Math.abs(y - last) < 6) return;
      setDown(y > last && y > 80);
      last = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [active]);
  return down;
}

export function AssistantFab() {
  const { on, key, wallet } = useAssistant();
  const compact = useIsCompact();
  const route = useRoute();
  const { panel } = useOpener();
  const onPage = route.segments[0] === 'assistant';
  const overlay = useOverlayShowing(on);
  const typing = useTyping(on && compact);
  const down = useScrollingDown(on && compact);
  const panelOpen = on && panel && !compact && !onPage;
  const showButton = on && !onPage && !overlay && !(compact && typing) && !panelOpen;

  // A phone has no side panel: a panel left open on a wide window closes when it narrows.
  useEffect(() => {
    if (panel && (compact || !on || onPage)) setPanelOpen(false);
  }, [panel, compact, on, onPage]);

  // The page's room for the button and the panel (AppShell reads these).
  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty('--assist-fab-space', on && !onPage ? (compact ? '56px' : '40px') : '0px');
    root.setProperty('--assist-panel-space', panelOpen ? `${PANEL_WIDTH}px` : '0px');
    return () => {
      root.removeProperty('--assist-fab-space');
      root.removeProperty('--assist-panel-space');
    };
  }, [on, onPage, compact, panelOpen]);

  if (!on || !key || !wallet) return null;

  const round = compact && down;
  return (
    <>
      {showButton ? (
        <button
          type="button"
          data-assistant-fab
          onClick={() => (compact ? navigate('/assistant') : setPanelOpen(true))}
          aria-label={t('Open the AI Assistant')}
          style={{
            position: 'fixed',
            right: compact ? 16 : 28,
            bottom: compact ? 'calc(90px + env(safe-area-inset-bottom))' : 28,
            zIndex: 35,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            height: compact ? 48 : 52,
            minWidth: compact ? 48 : 52,
            padding: round ? 0 : compact ? '0 18px 0 14px' : '0 22px 0 18px',
            borderRadius: 999,
            border: 'none',
            background: color.accent,
            color: '#1F0D05',
            fontFamily: font.body,
            fontWeight: 800,
            fontSize: compact ? 15 : 16,
            boxShadow: '0 10px 28px rgba(0,0,0,0.35)',
            cursor: 'pointer',
            transition: 'padding 160ms ease, width 160ms ease',
            whiteSpace: 'nowrap',
          }}
        >
          <SparkleIcon size={compact ? 20 : 22} />
          {round ? null : <span>{t('AI Assistant')}</span>}
        </button>
      ) : null}
      {panelOpen ? (
        <aside
          aria-label={t('AI Assistant')}
          data-assistant-panel
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            width: PANEL_WIDTH,
            maxWidth: '100vw',
            zIndex: 40,
            background: color.bg,
            borderLeft: `1px solid ${color.borderStrong}`,
            boxShadow: '-12px 0 40px rgba(0,0,0,0.25)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <AssistantHome assistKey={key} wallet={wallet} panel />
        </aside>
      ) : null}
    </>
  );
}
