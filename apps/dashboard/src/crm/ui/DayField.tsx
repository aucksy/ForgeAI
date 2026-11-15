/**
 * A day box that always shows the day first, the Indian way: "17 Oct 2026" (R-561, 15 Nov 2026).
 *
 * A plain `<input type="date">` shows the day in the order of the device's language setting, so a phone or computer
 * set to US English shows "10/17/2026". Here the box shows the day in words (formatDay, as everywhere else in the admin
 * app) and the device's own date box lies on top of it, invisible: a tap still opens the phone's or browser's own
 * calendar, and the label, keyboard and screen readers still reach a real date box.
 */

import { useId, useState, type CSSProperties } from 'react';

import { formatDay, isValidDateISO } from '../logic/dates';

import { TOUCH, color, font, radius, space } from './kit';

export function DayField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  /** YYYY-MM-DD, or '' while the box is empty. */
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  const id = useId();
  const noteId = `${id}-note`;
  const [focused, setFocused] = useState(false);
  const shown = isValidDateISO(value) ? formatDay(value) : '';

  const shell: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    width: '100%',
    minHeight: TOUCH,
    background: color.surfaceSunken,
    border: `1px solid ${focused ? color.accent : color.borderStrong}`,
    borderRadius: radius.md,
    padding: '10px 12px',
    color: color.ink,
    fontFamily: font.body,
    fontSize: 15,
    boxSizing: 'border-box',
  };

  return (
    <div style={{ marginTop: space.md, minWidth: 0 }}>
      <label htmlFor={id} style={{ display: 'block', fontFamily: font.body, fontSize: 12, color: color.inkSecondary, marginBottom: 5 }}>
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        <div aria-hidden data-testid="day-shown" style={shell}>
          <span>{shown}</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: color.inkSecondary, flexShrink: 0 }}>
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M16 3v4M8 3v4M3 11h18" />
          </svg>
        </div>
        <input
          id={id}
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onClick={(e) => {
            // A click on a computer lands on one part of the date; open the whole calendar instead.
            try {
              e.currentTarget.showPicker?.();
            } catch {
              // Some browsers refuse outside a direct tap; the box still works by typing.
            }
          }}
          aria-describedby={hint ? noteId : undefined}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', margin: 0, padding: 0, border: 0, opacity: 0, cursor: 'pointer' }}
        />
      </div>
      {hint && (
        <div id={noteId} style={{ fontFamily: font.body, fontSize: 12, color: color.inkMuted, marginTop: 5 }}>
          {hint}
        </div>
      )}
    </div>
  );
}
