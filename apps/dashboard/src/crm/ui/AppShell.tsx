/**
 * App shell — sidebar on a desktop console, bottom bar on a phone.
 *
 * The phone-vs-desktop question was the one the fieldwork was meant to settle, and
 * it is unanswered. Rather than gamble the build on a guess, the shell renders a
 * genuinely different navigation structure at each width off the same screens: a
 * front desk on a shared PC gets a dense console, an owner on their phone gets an
 * app. Neither is a squashed version of the other.
 */

import { Fragment, type ReactNode } from 'react';

import { BranchSwitch } from '../branches/BranchSwitch';
import { Icon, type IconName } from './icons';
import { ThemeToggle } from './ThemeToggle';
import { NewsBell, NewsSidebarLink } from './WhatsNew';
import { color, font, radius, space, useIsCompact } from './kit';
import { Link, useRoute } from './router';

export interface NavItem {
  path: string;
  label: string;
  icon: IconName;
  /** Number shown as an attention badge (dues, expiries) — hidden at 0. */
  badge?: number;
  /** UAT A-19 (30 Oct 2026): rows marked 'setup' sit under a small "Set up and help" heading in the sidebar. */
  group?: 'setup';
}

/** Height of the demo gym's banner (demo/demoMode.tsx), set as a page variable by the shell; 0 in the real app. */
const UNDER_DEMO_BAR = 'var(--demo-bar, 0px)';

/**
 * Which nav entry is open: the one with the longest path that the route starts with. `/settings/branding`
 * lights Branding (not Settings); `/messages/offer` lights Messages & offers. A page with no entry of its
 * own (a member's page, Receipts) falls back to its first word, so Members stays lit. PURE.
 */
export function activeNavPath(navPaths: readonly string[], routePath: string): string {
  const path = routePath.split('?')[0]!.replace(/\/+$/, '') || '/';
  // R-168: the lists behind Today's "Your numbers" tiles belong to Today.
  if (path === '/numbers' || path.startsWith('/numbers/')) return '/';
  let best = '';
  for (const p of navPaths) {
    if (p === '/' ? path === '/' : path === p || path.startsWith(`${p}/`)) if (p.length > best.length) best = p;
  }
  return best || `/${path.split('/').filter(Boolean)[0] ?? ''}`;
}

export function AppShell({
  gymName,
  nav,
  phoneNav,
  children,
}: {
  gymName: string;
  /** Every page: the sidebar on a computer. */
  nav: NavItem[];
  /** The phone's bottom bar (step 3: five, like the rival apps); the rest sit under More. */
  phoneNav?: NavItem[];
  children: ReactNode;
}) {
  const compact = useIsCompact();
  const route = useRoute();
  const activePath = activeNavPath((phoneNav ?? nav).concat(nav).map((n) => n.path), route.path);

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
        {/* R-239: the bell, top right on a computer (a phone has it in the header). */}
        {compact ? null : (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: -space.lg, marginBottom: space.sm }}>
            <NewsBell />
          </div>
        )}
        {children}
      </main>

      {compact && <BottomNav nav={phoneNav ?? nav} activePath={activePath} />}
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
        top: UNDER_DEMO_BAR,
        alignSelf: 'start',
        height: `calc(100vh - ${UNDER_DEMO_BAR})`,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        background: color.surfaceSunken,
      }}
    >
      <div style={{ padding: `0 ${space.md}px ${space.lg}px` }}>
        {/* #41: an owner with 2 or more branches picks the branch here; everyone else sees the name. */}
        <BranchSwitch gymName={gymName} />
        <div style={{ fontFamily: font.body, fontSize: 11, color: color.inkMuted, letterSpacing: 0.6 }}>
          POWERED BY METTLEUP
        </div>
        <div style={{ marginTop: space.md }}>
          <ThemeToggle compact />
        </div>
      </div>

      {nav.map((item, i) => (
        <Fragment key={item.path}>
          {item.group === 'setup' && nav[i - 1]?.group !== 'setup' ? (
            <div
              style={{
                margin: `${space.md}px ${space.md}px ${space.xs}px`,
                fontFamily: font.body,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 0.6,
                color: color.inkMuted,
              }}
            >
              SET UP AND HELP
            </div>
          ) : null}
          <SidebarLink item={item} active={item.path === activePath} />
        </Fragment>
      ))}

      {/* R-239: What's new and the version, at the bottom left. */}
      <div
        style={{
          // Stuck to the bottom: the sidebar scrolls on a short window, and this row must stay in view.
          marginTop: 'auto',
          position: 'sticky',
          bottom: -space.xl,
          paddingTop: space.sm,
          paddingBottom: space.xl,
          marginBottom: -space.xl,
          borderTop: `1px solid ${color.border}`,
          background: color.surfaceSunken,
        }}
      >
        <NewsSidebarLink active={activePath === '/news'} />
      </div>
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
          // UAT A-19 (30 Oct 2026): 44px rows pushed Settings and Send feedback below a 1280x800 window. The
          // sidebar only shows on a computer (a mouse), so 36px is enough.
          minHeight: 36,
          padding: `0 ${space.md}px`,
          borderRadius: radius.md,
          background: active ? color.accentSoft : 'transparent',
          color: active ? color.accentBright : color.inkSecondary,
          fontFamily: font.body,
          fontSize: 14,
          fontWeight: active ? 700 : 500,
        }}
      >
        <Icon name={item.icon} size={20} />
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
        top: UNDER_DEMO_BAR,
        zIndex: 20,
        background: color.surfaceSunken,
        borderBottom: `1px solid ${color.border}`,
        padding: `${space.sm}px ${space.lg}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: space.md,
      }}
    >
      <BranchSwitch gymName={gymName} compact />
      <div style={{ display: 'flex', alignItems: 'center', gap: space.sm }}>
        <NewsBell />
        <ThemeToggle compact />
      </div>
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
        // A page that is not on the bar itself (Plans, Shop, Settings) lights up More.
        const active = item.path === activePath || (item.path === '/more' && !nav.some((n) => n.path === activePath));
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
                fontSize: 12,
                fontWeight: active ? 700 : 500,
                position: 'relative',
              }}
            >
              <Icon name={item.icon} size={22} />
              {/* Six items across a 375px phone leaves ~54px of text room. Without
                  this the label is sized to its own content and bleeds over its
                  neighbour rather than being clipped, which is invisible until a
                  label grows — so it is pinned here rather than only kept short. */}
              <span
                style={{
                  maxWidth: '100%',
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.label}
              </span>
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
