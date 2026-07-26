/**
 * App shell — sidebar on a desktop console, bottom bar on a phone.
 *
 * The phone-vs-desktop question was the one the fieldwork was meant to settle, and
 * it is unanswered. Rather than gamble the build on a guess, the shell renders a
 * genuinely different navigation structure at each width off the same screens: a
 * front desk on a shared PC gets a dense console, an owner on their phone gets an
 * app. Neither is a squashed version of the other.
 */

import type { ReactNode } from 'react';

import { color, font, radius, space, TOUCH, useIsCompact } from './kit';
import { Link, useRoute } from './router';

export interface NavItem {
  path: string;
  label: string;
  glyph: string;
  /** Number shown as an attention badge (dues, expiries) — hidden at 0. */
  badge?: number;
}

export function AppShell({
  gymName,
  nav,
  children,
}: {
  gymName: string;
  nav: NavItem[];
  children: ReactNode;
}) {
  const compact = useIsCompact();
  const route = useRoute();
  const activePath = `/${route.segments[0] ?? ''}`;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: color.bg,
        color: color.ink,
        display: compact ? 'block' : 'grid',
        gridTemplateColumns: compact ? undefined : '236px 1fr',
      }}
    >
      {compact ? (
        <CompactHeader gymName={gymName} />
      ) : (
        <Sidebar gymName={gymName} nav={nav} activePath={activePath} />
      )}

      <main
        style={{
          minWidth: 0,
          padding: compact ? `${space.lg}px ${space.lg}px 96px` : `${space.xxl}px ${space.xxl}px 64px`,
          maxWidth: 1180,
        }}
      >
        {children}
      </main>

      {compact && <BottomNav nav={nav} activePath={activePath} />}
    </div>
  );
}

function Sidebar({ gymName, nav, activePath }: { gymName: string; nav: NavItem[]; activePath: string }) {
  return (
    <nav
      aria-label="Main"
      style={{
        borderRight: `1px solid ${color.border}`,
        padding: `${space.xl}px ${space.md}px`,
        position: 'sticky',
        top: 0,
        alignSelf: 'start',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        gap: space.xs,
        background: color.surfaceSunken,
      }}
    >
      <div style={{ padding: `0 ${space.md}px ${space.lg}px` }}>
        <div style={{ fontFamily: font.display, fontSize: 15, fontWeight: 700, color: color.ink }}>
          {gymName}
        </div>
        <div style={{ fontFamily: font.body, fontSize: 11, color: color.inkMuted, letterSpacing: 0.6 }}>
          POWERED BY FORGEAI
        </div>
      </div>

      {nav.map((item) => (
        <SidebarLink key={item.path} item={item} active={item.path === activePath} />
      ))}
    </nav>
  );
}

function SidebarLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link to={item.path}>
      <span
        aria-current={active ? 'page' : undefined}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: space.md,
          minHeight: TOUCH,
          padding: `0 ${space.md}px`,
          borderRadius: radius.md,
          background: active ? color.accentSoft : 'transparent',
          color: active ? color.accentBright : color.inkSecondary,
          fontFamily: font.body,
          fontSize: 14,
          fontWeight: active ? 700 : 500,
        }}
      >
        <span aria-hidden style={{ fontSize: 16, width: 20, textAlign: 'center' }}>
          {item.glyph}
        </span>
        <span style={{ flex: 1 }}>{item.label}</span>
        {item.badge ? <Badge count={item.badge} /> : null}
      </span>
    </Link>
  );
}

function CompactHeader({ gymName }: { gymName: string }) {
  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 20,
        background: color.surfaceSunken,
        borderBottom: `1px solid ${color.border}`,
        padding: `${space.md}px ${space.lg}px`,
      }}
    >
      <div style={{ fontFamily: font.display, fontSize: 15, fontWeight: 700 }}>{gymName}</div>
    </header>
  );
}

function BottomNav({ nav, activePath }: { nav: NavItem[]; activePath: string }) {
  return (
    <nav
      aria-label="Main"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 30,
        display: 'grid',
        gridTemplateColumns: `repeat(${nav.length}, 1fr)`,
        background: color.surfaceSunken,
        borderTop: `1px solid ${color.border}`,
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {nav.map((item) => {
        const active = item.path === activePath;
        return (
          <Link key={item.path} to={item.path}>
            <span
              aria-current={active ? 'page' : undefined}
              style={{
                display: 'grid',
                justifyItems: 'center',
                gap: 2,
                padding: `${space.sm}px 4px`,
                minHeight: 58,
                color: active ? color.accentBright : color.inkMuted,
                fontFamily: font.body,
                fontSize: 10,
                fontWeight: active ? 700 : 500,
                position: 'relative',
              }}
            >
              <span aria-hidden style={{ fontSize: 18 }}>
                {item.glyph}
              </span>
              {item.label}
              {item.badge ? (
                <span style={{ position: 'absolute', top: 2, right: '50%', marginRight: -22 }}>
                  <Badge count={item.badge} />
                </span>
              ) : null}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

function Badge({ count }: { count: number }) {
  return (
    <span
      style={{
        background: color.accent,
        color: '#1F0D05',
        borderRadius: radius.pill,
        fontFamily: font.body,
        fontSize: 10,
        fontWeight: 800,
        minWidth: 18,
        height: 18,
        display: 'grid',
        placeItems: 'center',
        padding: '0 5px',
      }}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
