import type { CSSProperties, ReactNode } from 'react';

import { color, font, gradients, radius, space } from '../theme';
import { initials } from '../lib/format';

export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        background: color.surface,
        border: `1px solid ${color.border}`,
        borderRadius: radius.lg,
        padding: space.xl,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2
      style={{
        margin: `0 0 ${space.lg}px`,
        fontFamily: font.display,
        fontSize: 17,
        fontWeight: 600,
        color: color.ink,
      }}
    >
      {children}
    </h2>
  );
}

export function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: 'accent' | 'good' | 'critical';
}) {
  const valueColor =
    tone === 'good'
      ? color.goodText
      : tone === 'critical'
        ? color.criticalText
        : tone === 'accent'
          ? color.accentBright
          : color.ink;
  return (
    <div
      style={{
        background: color.surface,
        border: `1px solid ${color.border}`,
        borderRadius: radius.lg,
        padding: space.lg,
        minWidth: 0,
      }}
    >
      <div style={{ fontFamily: font.mono, fontSize: 30, fontWeight: 700, color: valueColor, lineHeight: 1.1 }}>
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
    </div>
  );
}

export function Button({
  children,
  onClick,
  type,
  disabled,
  variant,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  variant?: 'primary' | 'ghost';
}) {
  const ghost = variant === 'ghost';
  return (
    <button
      type={type ?? 'button'}
      onClick={onClick}
      disabled={disabled}
      style={{
        appearance: 'none',
        border: ghost ? `1px solid ${color.borderStrong}` : 'none',
        background: ghost ? 'transparent' : gradients.ember,
        color: ghost ? color.ink : '#1F0D05',
        fontFamily: font.body,
        fontWeight: 700,
        fontSize: 14,
        padding: '10px 18px',
        borderRadius: radius.pill,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

export function TextField({
  label,
  value,
  onChange,
  type,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label style={{ display: 'block', marginTop: space.md }}>
      <span
        style={{
          display: 'block',
          fontFamily: font.body,
          fontSize: 12,
          color: color.inkSecondary,
          marginBottom: 4,
        }}
      >
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type={type ?? 'text'}
        placeholder={placeholder}
        autoComplete="off"
        style={{
          width: '100%',
          background: color.surfaceSunken,
          border: `1px solid ${color.borderStrong}`,
          borderRadius: radius.md,
          padding: '10px 12px',
          color: color.ink,
          fontSize: 14,
          outline: 'none',
        }}
      />
    </label>
  );
}

export function Avatar({ name }: { name: string | null }) {
  return (
    <div
      style={{
        width: 34,
        height: 34,
        borderRadius: radius.pill,
        background: color.accentSoft,
        border: `1px solid ${color.border}`,
        display: 'grid',
        placeItems: 'center',
        fontFamily: font.body,
        fontWeight: 700,
        fontSize: 13,
        color: color.accentBright,
        flexShrink: 0,
      }}
    >
      {initials(name)}
    </div>
  );
}

export function Pill({ children, tone }: { children: ReactNode; tone?: 'good' | 'critical' | 'muted' }) {
  const fg =
    tone === 'good' ? color.goodText : tone === 'critical' ? color.criticalText : color.inkSecondary;
  return (
    <span
      style={{
        display: 'inline-block',
        fontFamily: font.body,
        fontSize: 11,
        fontWeight: 600,
        color: fg,
        background: color.surfaceSunken,
        border: `1px solid ${color.border}`,
        borderRadius: radius.pill,
        padding: '2px 8px',
      }}
    >
      {children}
    </span>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <div style={{ color: color.criticalText, fontFamily: font.body, fontSize: 13, marginTop: space.md }}>
      {children}
    </div>
  );
}

/** Full-viewport centered state (loading / error / empty). */
export function Centered({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: space.xl,
        textAlign: 'center',
        color: color.inkSecondary,
        fontFamily: font.body,
      }}
    >
      <div style={{ maxWidth: 420, display: 'grid', gap: space.md, justifyItems: 'center' }}>{children}</div>
    </div>
  );
}
