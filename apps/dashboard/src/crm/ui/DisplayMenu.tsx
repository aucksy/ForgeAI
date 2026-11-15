/**
 * R-584 (owner, 15 Nov 2026, on his phone: "the very top of the app is kind of messed up because of too many
 * buttons, so you might want to rethink that"): on a phone, Dark | Light and English | Hinglish move behind one
 * round button, drawn like the bell. Tapping it drops a small panel with both switches side by side (R-561 kept them
 * together). The gym's name gets its room back. A computer keeps both switches in its top bar.
 * The panel is not a pop-up over the page: a tap anywhere else, or Escape, closes it, and that tap still works.
 */

import { useEffect, useRef, useState } from 'react';

import { LangToggle } from './LangToggle';
import { ThemeToggle } from './ThemeToggle';
import { TOUCH, color, radius, space } from './kit';

export const DISPLAY_MENU_LABEL = 'Screen and language';

export function DisplayMenu() {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div ref={box} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        aria-label={DISPLAY_MENU_LABEL}
        title={DISPLAY_MENU_LABEL}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        style={{
          width: TOUCH,
          height: TOUCH,
          display: 'grid',
          placeItems: 'center',
          background: open ? color.accentSoft : 'transparent',
          border: `1px solid ${color.border}`,
          borderRadius: radius.pill,
          color: open ? color.accentBright : color.ink,
          cursor: 'pointer',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <DisplayMark />
      </button>
      {open && (
        <section
          role="group"
          aria-label={DISPLAY_MENU_LABEL}
          style={{
            position: 'absolute',
            top: TOUCH + space.sm,
            right: 0,
            zIndex: 50,
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
            gap: space.sm,
            width: 'max-content',
            maxWidth: 'calc(100vw - 32px)',
            background: color.surface,
            border: `1px solid ${color.border}`,
            borderRadius: radius.lg,
            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.28)',
            padding: space.md,
          }}
        >
          <ThemeToggle compact />
          <LangToggle compact />
        </section>
      )}
    </div>
  );
}

/** A circle, half filled (screen colours), with a small "A" (language) beside it. */
function DisplayMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="9" cy="12" r="6.5" />
      <path d="M9 5.5a6.5 6.5 0 0 0 0 13z" fill="currentColor" stroke="none" />
      <path d="M16.5 18l3-8 3 8M17.6 15.2h3.8" />
    </svg>
  );
}
