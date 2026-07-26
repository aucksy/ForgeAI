/**
 * CRM UI kit — the primitives every screen is built from.
 *
 * Styling stays inline (matching the existing dashboard) with one exception:
 * anything that needs a media query lives in `index.css`, because inline styles
 * cannot express one. The layout switch itself is done in JS via `useMediaQuery`
 * so the shell can render a genuinely different structure on a phone rather than
 * a squashed desktop one.
 *
 * Accessibility is built in here rather than retrofitted (the mobile app is paying
 * for that lesson under W5): every control is a real button/input/label, focus is
 * never removed, hit targets are >= 44px, and status is carried by text as well as
 * colour.
 */

import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';

import { color, font, gradients, radius, space } from '../../theme';

/** Minimum comfortable touch target. Google and Apple both land near 44px. */
export const TOUCH = 44;

// ---------------------------------------------------------------- responsive

/**
 * Track a media query.
 *
 * Listens to BOTH the MediaQueryList `change` event and window `resize`, because
 * the former is not dependable everywhere — under viewport emulation it can be
 * skipped entirely, which left the desktop sidebar rendered at phone width with the
 * page scrolling sideways. Two components using this hook disagreeing about the
 * layout is the exact failure that produces, so it re-reads on any resize as well.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(query).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    window.addEventListener('resize', onChange);
    return () => {
      mq.removeEventListener('change', onChange);
      window.removeEventListener('resize', onChange);
    };
  }, [query]);

  return matches;
}

/** True on phone-width screens, where the shell switches to a bottom nav. */
export function useIsCompact(): boolean {
  return useMediaQuery('(max-width: 860px)');
}

// ---------------------------------------------------------------- surfaces

export function Card({
  children,
  style,
  pad = space.xl,
}: {
  children: ReactNode;
  style?: CSSProperties;
  pad?: number;
}) {
  return (
    <div
      style={{
        background: color.surface,
        border: `1px solid ${color.border}`,
        borderRadius: radius.lg,
        padding: pad,
        minWidth: 0,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: space.md,
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        marginBottom: space.xl,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <h1
          style={{
            margin: 0,
            fontFamily: font.display,
            fontSize: 24,
            fontWeight: 700,
            color: color.ink,
            letterSpacing: -0.3,
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p style={{ margin: '4px 0 0', color: color.inkSecondary, fontFamily: font.body, fontSize: 14 }}>
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div style={{ display: 'flex', gap: space.sm, flexWrap: 'wrap' }}>{actions}</div>}
    </header>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: space.md,
        margin: `0 0 ${space.lg}px`,
      }}
    >
      <h2 style={{ margin: 0, fontFamily: font.display, fontSize: 16, fontWeight: 600, color: color.ink }}>
        {children}
      </h2>
      {action}
    </div>
  );
}

// ---------------------------------------------------------------- data display

export function StatTile({
  label,
  value,
  sub,
  tone,
  onClick,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: 'accent' | 'good' | 'warn' | 'critical';
  onClick?: () => void;
}) {
  const valueColor =
    tone === 'good'
      ? color.goodText
      : tone === 'critical'
        ? color.criticalText
        : tone === 'warn'
          ? color.warning
          : tone === 'accent'
            ? color.accentBright
            : color.ink;

  const body = (
    <>
      <div
        style={{
          fontFamily: font.mono,
          fontSize: 28,
          fontWeight: 700,
          color: valueColor,
          lineHeight: 1.15,
          overflowWrap: 'anywhere',
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontFamily: font.body,
          fontSize: 12,
          color: color.inkMuted,
          marginTop: 6,
          textTransform: 'uppercase',
          letterSpacing: 0.6,
        }}
      >
        {label}
      </div>
      {sub && (
        <div style={{ fontFamily: font.body, fontSize: 12, color: color.inkSecondary, marginTop: 4 }}>
          {sub}
        </div>
      )}
    </>
  );

  const shell: CSSProperties = {
    background: color.surface,
    border: `1px solid ${color.border}`,
    borderRadius: radius.lg,
    padding: space.lg,
    minWidth: 0,
    textAlign: 'left',
    width: '100%',
  };

  if (!onClick) return <div style={shell}>{body}</div>;
  return (
    <button type="button" onClick={onClick} style={{ ...shell, cursor: 'pointer', appearance: 'none' }}>
      {body}
    </button>
  );
}

export type Tone = 'good' | 'warn' | 'critical' | 'muted' | 'accent';

const TONE_TEXT: Record<Tone, string> = {
  good: color.goodText,
  warn: color.warning,
  critical: color.criticalText,
  muted: color.inkSecondary,
  accent: color.accentBright,
};

export function Pill({ children, tone = 'muted' }: { children: ReactNode; tone?: Tone }) {
  return (
    <span
      style={{
        display: 'inline-block',
        fontFamily: font.body,
        fontSize: 11,
        fontWeight: 700,
        color: TONE_TEXT[tone],
        background: color.surfaceSunken,
        border: `1px solid ${color.border}`,
        borderRadius: radius.pill,
        padding: '3px 9px',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

export function Avatar({ text, size = 36 }: { text: string; size?: number }) {
  return (
    <div
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: radius.pill,
        background: color.accentSoft,
        border: `1px solid ${color.border}`,
        display: 'grid',
        placeItems: 'center',
        fontFamily: font.body,
        fontWeight: 700,
        fontSize: size * 0.36,
        color: color.accentBright,
        flexShrink: 0,
      }}
    >
      {text}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gap: space.sm,
        justifyItems: 'center',
        textAlign: 'center',
        padding: `${space.xxxl}px ${space.xl}px`,
        color: color.inkSecondary,
        fontFamily: font.body,
      }}
    >
      <div style={{ fontFamily: font.display, fontSize: 16, fontWeight: 600, color: color.ink }}>
        {title}
      </div>
      {body && <div style={{ fontSize: 14, maxWidth: 380 }}>{body}</div>}
      {action && <div style={{ marginTop: space.sm }}>{action}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- controls

export function Button({
  children,
  onClick,
  type = 'button',
  disabled,
  variant = 'primary',
  tone,
  full,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  variant?: 'primary' | 'ghost' | 'quiet';
  tone?: 'danger';
  full?: boolean;
}) {
  const danger = tone === 'danger';
  const base: CSSProperties = {
    appearance: 'none',
    minHeight: TOUCH,
    padding: '10px 18px',
    borderRadius: radius.pill,
    fontFamily: font.body,
    fontWeight: 700,
    fontSize: 14,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.45 : 1,
    width: full ? '100%' : undefined,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    whiteSpace: 'nowrap',
  };

  const skin: CSSProperties =
    variant === 'primary'
      ? {
          border: 'none',
          background: danger ? color.critical : gradients.ember,
          color: danger ? '#FFF' : '#1F0D05',
        }
      : variant === 'ghost'
        ? {
            border: `1px solid ${color.borderStrong}`,
            background: 'transparent',
            color: danger ? color.criticalText : color.ink,
          }
        : {
            border: '1px solid transparent',
            background: 'transparent',
            color: danger ? color.criticalText : color.inkSecondary,
          };

  return (
    <button type={type} onClick={onClick} disabled={disabled} style={{ ...base, ...skin }}>
      {children}
    </button>
  );
}

const fieldShell: CSSProperties = {
  width: '100%',
  minHeight: TOUCH,
  background: color.surfaceSunken,
  border: `1px solid ${color.borderStrong}`,
  borderRadius: radius.md,
  padding: '10px 12px',
  color: color.ink,
  fontFamily: font.body,
  fontSize: 15, // >=16 avoids iOS zoom-on-focus; 15 is the compromise with density
  outline: 'none',
};

function FieldLabel({ children, htmlFor }: { children: ReactNode; htmlFor: string }) {
  return (
    <label
      htmlFor={htmlFor}
      style={{
        display: 'block',
        fontFamily: font.body,
        fontSize: 12,
        color: color.inkSecondary,
        marginBottom: 5,
      }}
    >
      {children}
    </label>
  );
}

export function TextField({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  error,
  hint,
  prefix,
  autoFocus,
  inputMode,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  error?: string | null;
  hint?: string;
  prefix?: string;
  autoFocus?: boolean;
  inputMode?: 'text' | 'numeric' | 'tel' | 'decimal' | 'email';
  multiline?: boolean;
}) {
  const id = useId();
  const noteId = `${id}-note`;
  const invalid = Boolean(error);
  const border = invalid ? color.critical : color.borderStrong;
  // Without this the error text is an unassociated div: `aria-invalid` announces
  // THAT the field is wrong but never WHY.
  const describedBy = error || hint ? noteId : undefined;

  return (
    <div style={{ marginTop: space.md, minWidth: 0 }}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div style={{ display: 'flex', alignItems: 'stretch' }}>
        {prefix && (
          <span
            aria-hidden
            style={{
              display: 'grid',
              placeItems: 'center',
              padding: '0 10px',
              background: color.surfaceSunken,
              border: `1px solid ${border}`,
              borderRight: 'none',
              borderRadius: `${radius.md}px 0 0 ${radius.md}px`,
              color: color.inkSecondary,
              fontFamily: font.mono,
              fontSize: 14,
            }}
          >
            {prefix}
          </span>
        )}
        {multiline ? (
          <textarea
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            rows={3}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            style={{ ...fieldShell, border: `1px solid ${border}`, resize: 'vertical', minHeight: 80 }}
          />
        ) : (
          <input
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            type={type}
            inputMode={inputMode}
            placeholder={placeholder}
            autoFocus={autoFocus}
            autoComplete="off"
            aria-invalid={invalid}
            aria-describedby={describedBy}
            style={{
              ...fieldShell,
              border: `1px solid ${border}`,
              borderRadius: prefix ? `0 ${radius.md}px ${radius.md}px 0` : radius.md,
            }}
          />
        )}
      </div>
      {(error || hint) && (
        <div
          id={noteId}
          style={{
            fontFamily: font.body,
            fontSize: 12,
            color: invalid ? color.criticalText : color.inkMuted,
            marginTop: 5,
          }}
        >
          {error ?? hint}
        </div>
      )}
    </div>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  error?: string | null;
}) {
  const id = useId();
  return (
    <div style={{ marginTop: space.md, minWidth: 0 }}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={Boolean(error)}
        style={{ ...fieldShell, border: `1px solid ${error ? color.critical : color.borderStrong}` }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} style={{ background: color.surface }}>
            {o.label}
          </option>
        ))}
      </select>
      {error && (
        <div style={{ fontFamily: font.body, fontSize: 12, color: color.criticalText, marginTop: 5 }}>
          {error}
        </div>
      )}
    </div>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      type="search"
      placeholder={placeholder}
      aria-label={placeholder}
      style={{ ...fieldShell, maxWidth: 360 }}
    />
  );
}

/**
 * Filter chips. `role="group"` + `aria-pressed`, NOT tablist/tab: these do not
 * control tab panels, and a screen reader announcing "tab 3 of 6" for a filter is
 * actively misleading.
 */
export function ChipToggle({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: string; label: string; count?: number }[];
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} style={{ display: 'flex', gap: space.sm, flexWrap: 'wrap' }}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            aria-pressed={selected}
            type="button"
            onClick={() => onChange(o.value)}
            style={{
              appearance: 'none',
              minHeight: TOUCH,
              padding: '6px 14px',
              borderRadius: radius.pill,
              border: `1px solid ${selected ? 'transparent' : color.borderStrong}`,
              background: selected ? color.accentSoft : 'transparent',
              color: selected ? color.accentBright : color.inkSecondary,
              fontFamily: font.body,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {o.label}
            {o.count !== undefined && (
              <span style={{ marginLeft: 6, color: selected ? color.accentBright : color.inkMuted }}>
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- overlay

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal sheet. Full-height on a phone (where it reads as a page), centred card on
 * desktop.
 *
 * Escape closes, focus moves in on open and is RESTORED to whatever opened it on
 * close, and Tab is trapped inside. Without the trap, `aria-modal="true"` tells a
 * screen reader the rest of the page is inert while the keyboard walks straight
 * out into it and operates the obscured form behind.
 */
export function Sheet({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const compact = useIsCompact();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;
      const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null || el === panel,
      );
      if (focusable.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      } else if (active && !panel.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      // Return the keyboard to where it came from, not to the top of the page.
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [onClose]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'grid',
        placeItems: compact ? 'stretch' : 'center',
        background: 'rgba(3, 4, 8, 0.72)',
        padding: compact ? 0 : space.xl,
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        style={{
          background: color.surfaceRaised,
          border: `1px solid ${color.border}`,
          borderRadius: compact ? 0 : radius.lg,
          width: '100%',
          maxWidth: compact ? undefined : wide ? 720 : 520,
          maxHeight: compact ? '100%' : '90vh',
          display: 'flex',
          flexDirection: 'column',
          outline: 'none',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: space.md,
            padding: `${space.lg}px ${space.xl}px`,
            borderBottom: `1px solid ${color.border}`,
          }}
        >
          <h2 style={{ margin: 0, fontFamily: font.display, fontSize: 17, fontWeight: 600, color: color.ink }}>
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              appearance: 'none',
              background: 'transparent',
              border: 'none',
              color: color.inkSecondary,
              fontSize: 22,
              lineHeight: 1,
              cursor: 'pointer',
              minWidth: TOUCH,
              minHeight: TOUCH,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: `${space.md}px ${space.xl}px ${space.xl}px`, overflowY: 'auto', flex: 1 }}>
          {children}
        </div>

        {footer && (
          <div
            style={{
              display: 'flex',
              gap: space.sm,
              justifyContent: 'flex-end',
              flexWrap: 'wrap',
              padding: `${space.lg}px ${space.xl}px`,
              borderTop: `1px solid ${color.border}`,
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/** Inline error banner for a failed action. */
export function ErrorBanner({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      style={{
        background: 'rgba(208, 59, 59, 0.12)',
        border: `1px solid ${color.critical}`,
        borderRadius: radius.md,
        padding: `${space.md}px ${space.lg}px`,
        color: color.criticalText,
        fontFamily: font.body,
        fontSize: 14,
        marginBottom: space.lg,
      }}
    >
      {children}
    </div>
  );
}

/** Transient confirmation, announced to screen readers. */
export function Toast({ message }: { message: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: 92,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 60,
        background: color.surfaceRaised,
        border: `1px solid ${color.borderStrong}`,
        borderRadius: radius.pill,
        padding: '10px 20px',
        color: color.ink,
        fontFamily: font.body,
        fontSize: 14,
        boxShadow: '0 8px 30px rgba(0,0,0,0.45)',
        maxWidth: 'calc(100vw - 32px)',
        textAlign: 'center',
      }}
    >
      {message}
    </div>
  );
}

/** Horizontal-scroll container so a wide table never makes the page scroll sideways. */
export function ScrollX({ children }: { children: ReactNode }) {
  return <div style={{ overflowX: 'auto', margin: `0 -${space.xl}px`, padding: `0 ${space.xl}px` }}>{children}</div>;
}

export function Row({
  children,
  gap = space.md,
  wrap = true,
  align = 'center',
}: {
  children: ReactNode;
  gap?: number;
  wrap?: boolean;
  align?: CSSProperties['alignItems'];
}) {
  return (
    <div style={{ display: 'flex', gap, flexWrap: wrap ? 'wrap' : 'nowrap', alignItems: align, minWidth: 0 }}>
      {children}
    </div>
  );
}

export function Grid({ children, min = 200 }: { children: ReactNode; min?: number }) {
  return (
    <div
      style={{
        display: 'grid',
        gap: space.md,
        gridTemplateColumns: `repeat(auto-fit, minmax(min(${min}px, 100%), 1fr))`,
      }}
    >
      {children}
    </div>
  );
}

export { color, font, radius, space };
