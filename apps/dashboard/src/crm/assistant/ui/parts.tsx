/**
 * F201: small shared pieces of the AI Assistant's screens (canvas boards 1-10): the words of a Line, the sparkle
 * and microphone icons, the credits pill, section labels and the soft chips. Colours come from the panel's
 * theme (dark and light), never from the boards' fixed hex values.
 */
import { useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';

import { t } from '../../lang/lang';
import { TOUCH, color, font, radius, space } from '../../ui/kit';
import type { Line } from '../catalogue';

/** A Line in the owner's language (English or Hinglish). */
export function say(l: Line): string {
  return t(l.text, l.vars);
}

/** One id (crypto.randomUUID; a plain-http LAN desk falls back to random digits). */
export function newId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const hex = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  return `${hex()}${hex()}-${hex()}-4${hex().slice(1)}-a${hex().slice(1)}-${hex()}${hex()}${hex()}`;
}

export function SparkleIcon({ size = 20 }: { size?: number }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', flexShrink: 0 }}>
      <path d="M11 3c.6 4.4 2.6 6.4 7 7-4.4.6-6.4 2.6-7 7-.6-4.4-2.6-6.4-7-7 4.4-.6 6.4-2.6 7-7zM19 15c.3 1.6 1 2.3 2.5 2.5-1.5.2-2.2.9-2.5 2.5-.3-1.6-1-2.3-2.5-2.5 1.5-.2 2.2-.9 2.5-2.5z" />
    </svg>
  );
}

export function MicIcon({ size = 22 }: { size?: number }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

export function SendIcon({ size = 22 }: { size?: number }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function ChevronIcon() {
  return (
    <svg aria-hidden width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" style={{ display: 'block', flexShrink: 0, color: color.inkMuted }}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

/** "84 credits": opens the Credits sheet. */
export function CreditsPill({ balance, onOpen }: { balance: number; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t('{n} AI credits. Open AI credits.', { n: balance })}
      style={{
        appearance: 'none',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        minHeight: 36,
        padding: '0 12px',
        borderRadius: radius.pill,
        border: 'none',
        background: color.accentSoft,
        color: color.accentBright,
        fontFamily: font.body,
        fontWeight: 800,
        fontSize: 14,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      <SparkleIcon size={16} />
      {balance === 1 ? t('1 credit') : t('{n} credits', { n: balance })}
    </button>
  );
}

/** "TODAY FOR YOU": the small capital headings of the boards. */
export function SectionLabel({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h3
      id={id}
      style={{
        margin: 0,
        fontFamily: font.body,
        fontSize: 13,
        fontWeight: 800,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: color.inkMuted,
      }}
    >
      {children}
    </h3>
  );
}

/** A soft outlined chip ("Shorter", a "Try saying" example). */
export function Chip({ children, onClick, pressed, ariaLabel, round }: { children: ReactNode; onClick: () => void; pressed?: boolean; ariaLabel?: string; round?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      aria-label={ariaLabel}
      style={{
        appearance: 'none',
        minHeight: round ? 36 : TOUCH,
        padding: round ? '0 12px' : '8px 12px',
        borderRadius: round ? radius.pill : 12,
        border: `1px solid ${pressed ? color.accent : color.borderStrong}`,
        background: pressed ? color.accent : 'transparent',
        color: pressed ? '#1F0D05' : color.ink,
        fontFamily: font.body,
        fontWeight: pressed ? 800 : 600,
        fontSize: round ? 13 : 14,
        textAlign: 'left',
        cursor: 'pointer',
        lineHeight: 1.3,
        maxWidth: '100%',
        overflowWrap: 'anywhere',
      }}
    >
      {children}
    </button>
  );
}

export const quiet: CSSProperties = { margin: 0, fontFamily: font.body, fontSize: 13, color: color.inkMuted, lineHeight: 1.45 };
export const body: CSSProperties = { margin: 0, fontFamily: font.body, fontSize: 15, color: color.ink, lineHeight: 1.45 };

/** An assistant card's frame (kit Card look, rounder like the boards). */
export function CardFrame({ children, label }: { children: ReactNode; label: string }) {
  return (
    <article
      aria-label={label}
      style={{
        borderRadius: 16,
        background: color.surface,
        border: `1px solid ${color.border}`,
        overflow: 'hidden',
        minWidth: 0,
      }}
    >
      {children}
    </article>
  );
}

/** The card's title row with its small icon tile. */
export function CardHead({ title, icon }: { title: string; icon?: ReactNode }) {
  return (
    <div style={{ padding: `14px ${space.lg}px`, display: 'flex', alignItems: 'center', gap: 10, borderBottom: `1px solid ${color.border}` }}>
      <span aria-hidden style={{ width: 32, height: 32, borderRadius: 10, background: color.accentSoft, color: color.accentBright, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        {icon ?? <SparkleIcon size={18} />}
      </span>
      <h3 style={{ margin: 0, fontFamily: font.body, fontSize: 16, fontWeight: 800, color: color.ink }}>{title}</h3>
    </div>
  );
}

// ------------------------------------------------------------------ opening the assistant from anywhere

interface Opener {
  /** The computer's side panel is open. */
  panel: boolean;
  /** A sentence waiting to go into the box (and be sent, when `send`). */
  pending: { text: string; send: boolean } | null;
}

let opener: Opener = { panel: false, pending: null };
const openerListeners = new Set<() => void>();
const emitOpener = (next: Opener) => {
  opener = next;
  for (const fn of [...openerListeners]) fn();
};
const subscribeOpener = (fn: () => void) => {
  openerListeners.add(fn);
  return () => {
    openerListeners.delete(fn);
  };
};

export function useOpener(): Opener {
  return useSyncExternalStore(subscribeOpener, () => opener, () => opener);
}

/** Open the side panel (computer). The phone opens /assistant instead (the caller navigates). */
export function setPanelOpen(open: boolean): void {
  if (opener.panel !== open) emitOpener({ ...opener, panel: open });
}

/** Put a sentence in the assistant's box; `send`: ask it at once (a "Make it" tap). */
export function queueRequest(text: string, send: boolean): void {
  emitOpener({ ...opener, pending: { text, send } });
}

/** The waiting sentence, taken once by the screen that shows the box. */
export function takeRequest(): { text: string; send: boolean } | null {
  const p = opener.pending;
  if (p) emitOpener({ ...opener, pending: null });
  return p;
}
