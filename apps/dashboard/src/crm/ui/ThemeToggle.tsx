/**
 * The Dark | Light switch: two words side by side, the chosen one filled. In the panel's top bar
 * (phone and computer), on the welcome screen and in Staff settings. The choice is kept on this device.
 * R-561: `icons` (a phone's top bar, which now also holds Refresh and English | Hinglish): a moon and a sun in place
 * of the words, each still named Dark and Light for a screen reader and a long press.
 */

import { useState } from 'react';

import { savedTheme, setTheme, type ThemeMode } from '../../theme';
import { color, font, radius, TOUCH } from './kit';

const OPTIONS: { mode: ThemeMode; label: string }[] = [
  { mode: 'dark', label: 'Dark' },
  { mode: 'light', label: 'Light' },
];

export function ThemeToggle({ compact = false, icons = false }: { compact?: boolean; icons?: boolean }) {
  const [mode, setMode] = useState<ThemeMode>(savedTheme);
  return (
    <div
      role="radiogroup"
      aria-label="Screen colours"
      style={{
        display: 'inline-flex',
        border: `1px solid ${color.borderStrong}`,
        borderRadius: radius.pill,
        padding: 2,
        gap: 2,
        flexShrink: 0,
      }}
    >
      {OPTIONS.map((o) => {
        const on = o.mode === mode;
        return (
          <button
            key={o.mode}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={icons ? o.label : undefined}
            title={icons ? o.label : undefined}
            onClick={() => {
              if (on) return;
              setTheme(o.mode);
              setMode(o.mode);
            }}
            style={{
              appearance: 'none',
              border: 'none',
              cursor: on ? 'default' : 'pointer',
              minHeight: TOUCH - 4,
              padding: icons ? 0 : compact ? '0 10px' : '0 14px',
              width: icons ? 30 : undefined,
              display: icons ? 'grid' : undefined,
              placeItems: icons ? 'center' : undefined,
              borderRadius: radius.pill,
              background: on ? color.accentSoft : 'transparent',
              color: on ? color.accentBright : color.inkSecondary,
              fontFamily: font.body,
              fontSize: compact ? 13 : 14,
              fontWeight: on ? 700 : 500,
            }}
          >
            {icons ? <ModeMark mode={o.mode} /> : o.label}
          </button>
        );
      })}
    </div>
  );
}

/** A moon for Dark, a sun for Light. */
function ModeMark({ mode }: { mode: ThemeMode }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {mode === 'dark' ? (
        <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
      ) : (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
        </>
      )}
    </svg>
  );
}
