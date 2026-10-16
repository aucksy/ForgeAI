/**
 * The Dark | Light switch: two words side by side, the chosen one filled. In the panel's top bar
 * (phone), the sidebar (computer), on the welcome screen and in Staff settings. It took the place
 * of the English | Hinglish switch (16 Oct 2026). The choice is kept on this device.
 */

import { useState } from 'react';

import { savedTheme, setTheme, type ThemeMode } from '../../theme';
import { color, font, radius, TOUCH } from './kit';

const OPTIONS: { mode: ThemeMode; label: string }[] = [
  { mode: 'dark', label: 'Dark' },
  { mode: 'light', label: 'Light' },
];

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
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
              padding: compact ? '0 10px' : '0 14px',
              borderRadius: radius.pill,
              background: on ? color.accentSoft : 'transparent',
              color: on ? color.accentBright : color.inkSecondary,
              fontFamily: font.body,
              fontSize: compact ? 13 : 14,
              fontWeight: on ? 700 : 500,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
