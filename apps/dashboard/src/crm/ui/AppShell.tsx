/**
 * App shell — sidebar on a desktop console, bottom bar on a phone.
 *
 * The phone-vs-desktop question was the one the fieldwork was meant to settle, and
 * it is unanswered. Rather than gamble the build on a guess, the shell renders a
 * genuinely different navigation structure at each width off the same screens: a
 * front desk on a shared PC gets a dense console, an owner on their phone gets an
 * app. Neither is a squashed version of the other.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { BranchSwitch } from '../branches/BranchSwitch';
import { GymLogo } from '../brand/GymLogo';
import { Icon, type IconName } from './icons';
import { ThemeToggle } from './ThemeToggle';
import { NewsBell, NewsSidebarLink } from './WhatsNew';
import { NewDot, color, font, radius, space, useIsCompact, useMediaQuery } from './kit';
import { useNewFeatures } from './NewDots';
import { barLit, linkLit, reachable } from '../logic/newDots';
import { menuStore, navSections, progressShort, readClosed, saveClosed, sectionBadge, type NavGroupId, type SetupProgress } from '../logic/navGroups';
import { ProgressRing, progressWords } from './GetStartedCard';
import { Link, useRoute } from './router';
import { t } from '../lang/lang';
import { SteelLockup } from '../../components/SteelLockup';

export interface NavItem {
  path: string;
  label: string;
  icon: IconName;
  /** Number shown as an attention badge (dues, expiries) — hidden at 0. */
  badge?: number;
  /** R-526: the menu group the row sits in (logic/navGroups.ts); none = the top rows, under no heading. */
  group?: NavGroupId;
  /** R-526: Set up your gym's steps done, while some are left: a small green ring, not a number badge. */
  progress?: SetupProgress;
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
          // F201: room for the AI Assistant's floating button (--assist-fab-space) and, on a computer, its open
          // side panel (--assist-panel-space), so the last row and the right edge are never under them.
          padding: compact
            ? `${space.lg}px ${space.lg}px calc(96px + var(--assist-fab-space, 0px))`
            : `${space.xxl}px calc(${space.xxl}px + var(--assist-panel-space, 0px)) calc(64px + var(--assist-fab-space, 0px)) ${space.xxl}px`,
          maxWidth: 1180,
        }}
      >
        {/* R-239: the bell, top right on a computer (a phone has it in the header). */}
        {compact ? null : (
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: space.sm, marginTop: -space.lg, marginBottom: space.sm }}>
            <NewsBell />
            {/* R-447: Dark | Light moved here from the side menu (as on a phone's header), so the menu has room. */}
            <ThemeToggle compact />
          </div>
        )}
        {children}
      </main>

      {compact && <BottomNav nav={phoneNav ?? nav} menuPaths={nav.map((n) => n.path)} activePath={activePath} />}
    </div>
  );
}

function Sidebar({ gymName, nav, activePath }: { gymName: string; nav: NavItem[]; activePath: string }) {
  // F198: a dot on the menu item that leads to a new feature (Settings for Pay MettleUp).
  const lit = useNewFeatures();
  const paths = nav.map((n) => n.path);
  // R-447 (10 Nov 2026): "Help and feedback" sat half under the pinned "What's new" at 1366x768 and 1280x720. Now:
  // shorter rows on a short window, so an owner's whole menu fits a 720-px-high window; Dark | Light sits beside the
  // bell instead; the rows scroll in their own box and "What's new" sits under it, never over it. When a window is
  // too short even so, "More below" says so and scrolls the menu on.
  const short = useMediaQuery('(max-height: 820px)');
  const shorter = useMediaQuery('(max-height: 740px)');
  // R-526: 34 (not 36) on a tall window, so the five group headings still let a 1080-px-high window show every row.
  const rowHeight = shorter ? 28 : short ? 30 : 34;
  const list = useRef<HTMLDivElement>(null);
  // R-526: the five groups; a tap on a heading folds or opens it, kept in this browser (logic/navGroups.ts).
  const sections = useMemo(() => navSections(nav), [nav]);
  const store = useMemo(() => menuStore(), []);
  const [closed, setClosed] = useState<ReadonlySet<NavGroupId>>(() => readClosed(store));
  const toggle = useCallback(
    (id: NavGroupId) => {
      setClosed((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        saveClosed(store, next);
        return next;
      });
    },
    [store],
  );
  const [scroll, setScroll] = useState({ overflows: false, moreBelow: false, moreAbove: false });
  useEffect(() => {
    const el = list.current;
    if (!el) return undefined;
    const check = () => {
      const overflows = el.scrollHeight > el.clientHeight + 1;
      const moreBelow = overflows && el.scrollTop + el.clientHeight < el.scrollHeight - 1;
      const moreAbove = overflows && el.scrollTop > 1;
      setScroll((s) =>
        s.overflows === overflows && s.moreBelow === moreBelow && s.moreAbove === moreAbove ? s : { overflows, moreBelow, moreAbove },
      );
    };
    check();
    el.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    const seen = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(check);
    seen?.observe(el);
    return () => {
      el.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
      seen?.disconnect();
    };
  }, [nav.length, rowHeight, closed]);
  useEffect(() => {
    list.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest' });
  }, [activePath]);
  const showMore = () => {
    const el = list.current;
    if (el) el.scrollBy({ top: Math.max(el.clientHeight - rowHeight * 2, rowHeight), behavior: 'smooth' });
  };

  return (
    <nav
      aria-label="Main"
      style={{
        borderRight: `1px solid ${color.border}`,
        padding: `${short ? space.lg : space.xl}px ${space.md}px 0`,
        position: 'sticky',
        top: UNDER_DEMO_BAR,
        alignSelf: 'start',
        height: `calc(100vh - ${UNDER_DEMO_BAR})`,
        display: 'flex',
        flexDirection: 'column',
        background: color.surfaceSunken,
      }}
    >
      <div style={{ padding: `0 ${space.md}px ${short ? space.md : space.lg}px`, flexShrink: 0 }}>
        {/* #41: an owner with 2 or more branches picks the branch here; everyone else sees the name.
            R-495: the gym's own logo (Branding) sits just before it; no logo, just the name as before. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: space.sm, minWidth: 0 }}>
          <GymLogo gymName={gymName} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <BranchSwitch gymName={gymName} />
          </div>
        </div>
        {/* R-259: "Powered by" + the steel-plate name, small (in the splash's shine, R-425), so it stays quiet under the gym's name. */}
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: font.body, fontSize: 11, color: color.inkMuted, letterSpacing: 0.4 }}
        >
          {t('Powered by')}
          <SteelLockup height={12} mark={false} />
        </div>
      </div>

      {/* Fresh eyes (R-447): a row cut at the edge looked covered. A soft fade at each edge that has more says
          "the list goes on"; it never takes a click (pointer-events: none). */}
      <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {scroll.moreAbove ? <EdgeFade at="top" /> : null}
      {scroll.moreBelow ? <EdgeFade at="bottom" /> : null}
      <div
        ref={list}
        data-sidebar-rows=""
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: short ? 0 : 2,
          // Fresh eyes (14 Nov 2026): the last row (Settings) sat half under the fade by "More below". While the menu is
          // longer than the window, the rows end with the fade's height of room, so the last one scrolls fully clear.
          paddingBottom: scroll.overflows ? 28 + space.xs : space.xs,
        }}
      >
        {sections.map((sec) => {
          if (!sec.group) {
            return (
              <div key="top" style={{ display: 'flex', flexDirection: 'column', gap: short ? 0 : 2 }}>
                {sec.items.map((item) => (
                  <SidebarLink key={item.path} item={item} active={item.path === activePath} dot={linkLit(lit, paths, item.path)} height={rowHeight} />
                ))}
              </div>
            );
          }
          const id = sec.group;
          const folded = closed.has(id);
          // A folded group still shows the page that is open, so the lit row never disappears.
          const shown = folded ? sec.items.filter((i) => i.path === activePath) : sec.items;
          const count = folded ? sectionBadge(sec.items) : 0;
          const dot = folded && sec.items.some((i) => linkLit(lit, paths, i.path));
          return (
            <div key={id} role="group" aria-labelledby={`menu-group-${id}`} style={{ display: 'flex', flexDirection: 'column', gap: short ? 0 : 2 }}>
              <GroupHeading id={id} title={t(sec.title ?? '')} folded={folded} count={count} dot={dot} short={short} onToggle={() => toggle(id)} />
              {shown.map((item) => (
                <SidebarLink key={item.path} item={item} active={item.path === activePath} dot={linkLit(lit, paths, item.path)} height={rowHeight} />
              ))}
            </div>
          );
        })}
      </div>
      </div>

      {/* R-239: What's new and the version, at the bottom left: under the rows, never over them (R-447). */}
      <div data-sidebar-foot="" style={{ flexShrink: 0, background: color.surfaceSunken }}>
        {/* The room for "More below" stays while the menu is longer than the window, so nothing jumps when it goes. */}
        {scroll.overflows ? (
          <div style={{ height: 32, display: 'grid', placeItems: 'center' }}>
            {scroll.moreBelow ? (
              <button
                type="button"
                onClick={showMore}
                style={{
                  appearance: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  minHeight: 28,
                  padding: '0 12px',
                  borderRadius: radius.pill,
                  border: `1px solid ${color.borderStrong}`,
                  background: color.surfaceSunken,
                  color: color.inkSecondary,
                  fontFamily: font.body,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {t('More below')}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
            ) : null}
          </div>
        ) : null}
        <div style={{ paddingTop: space.xs, paddingBottom: short ? space.sm : space.lg, borderTop: `1px solid ${color.border}` }}>
          <NewsSidebarLink active={activePath === '/news'} />
        </div>
      </div>
    </nav>
  );
}

/**
 * R-526: a group's small grey heading, which folds the group or opens it again. Folded, it shows the sum of its rows'
 * numbers (and the new-feature dot of a row inside), so nothing waiting is hidden by folding.
 */
function GroupHeading({
  id,
  title,
  folded,
  count,
  dot,
  short,
  onToggle,
}: {
  id: NavGroupId;
  title: string;
  folded: boolean;
  count: number;
  dot: boolean;
  short: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      id={`menu-group-${id}`}
      className="menu-group"
      aria-expanded={!folded}
      onClick={onToggle}
      style={{
        appearance: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        width: '100%',
        minHeight: short ? 18 : 20,
        margin: short ? '6px 0 0' : `${space.sm}px 0 0`,
        padding: `0 ${space.md}px`,
        border: 'none',
        borderRadius: radius.sm,
        background: 'transparent',
        cursor: 'pointer',
        fontFamily: font.body,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.6,
        // CSS capitals, so a screen reader says the word ("Members"), not the letters.
        textTransform: 'uppercase',
        color: color.inkMuted,
        textAlign: 'left',
      }}
    >
      <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
        {title}
        {dot ? <NewDot /> : null}
      </span>
      {count > 0 ? <Badge count={count} /> : null}
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        style={{ flexShrink: 0, transform: folded ? 'rotate(-90deg)' : 'none', transition: 'transform 160ms cubic-bezier(0.16, 1, 0.3, 1)' }}
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
  );
}

/** R-447: a soft fade over one edge of the side menu's rows while more rows are that way. */
function EdgeFade({ at }: { at: 'top' | 'bottom' }) {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: at === 'top' ? 0 : undefined,
        bottom: at === 'bottom' ? 0 : undefined,
        height: 28,
        zIndex: 1,
        pointerEvents: 'none',
        background: `linear-gradient(to ${at}, transparent, ${color.surfaceSunken})`,
      }}
    />
  );
}

function SidebarLink({ item, active, dot, height }: { item: NavItem; active: boolean; dot: boolean; height: number }) {
  return (
    <Link to={item.path}>
      <span
        aria-current={active ? 'page' : undefined}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: space.md,
          // UAT A-19 (30 Oct 2026): 44px rows pushed Settings and Send feedback below a 1280x800 window. The
          // sidebar only shows on a computer (a mouse), so 36px is enough. R-447: 30 or 28 on a short window.
          minHeight: height,
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
        <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          {item.label}
          {dot ? <NewDot /> : null}
        </span>
        {item.badge ? <Badge count={item.badge} /> : null}
        {item.progress ? <SetupMark progress={item.progress} /> : null}
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
      {/* R-495: the gym's own logo before its name (nothing when it has none). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: space.sm, minWidth: 0, flex: 1 }}>
        <GymLogo gymName={gymName} size={26} />
        <BranchSwitch gymName={gymName} compact />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: space.sm, flexShrink: 0 }}>
        <NewsBell />
        <ThemeToggle compact />
      </div>
    </header>
  );
}

function BottomNav({ nav, menuPaths, activePath }: { nav: NavItem[]; menuPaths: string[]; activePath: string }) {
  // F198: a feature behind one of the bar's own pages lights it; anything else lights More. Only features
  // this person can reach count, or More would show a dot that leads nowhere (9 Nov: Questions, hidden).
  const lit = reachable(useNewFeatures(), menuPaths);
  const paths = nav.map((n) => n.path);
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
              {item.progress ? (
                // R-526: Set up your gym's ring on More: top left when a number badge is on the right, else top right.
                <span
                  data-setup-mark=""
                  style={{ position: 'absolute', top: 4, lineHeight: 0, ...(item.badge ? { left: '50%', marginLeft: -24 } : { right: '50%', marginRight: -22 }) }}
                >
                  <ProgressRing progress={item.progress} size={14} />
                  {/* Named, so a screen reader says "More, 1, Set up your gym: 3 of 8 steps done", never "More 13 of 8". */}
                  <span style={visuallyHidden}>{`${t('Set up your gym')}: ${progressWords(item.progress)}`}</span>
                </span>
              ) : null}
              {/* With a badge and the ring both on More, the new-feature dot waits: the ring already says "look here". */}
              {barLit(lit, paths, item.path) && !(item.progress && item.badge) ? (
                // Top right of the icon; top left when a number badge sits on the right.
                <span
                  style={{
                    position: 'absolute',
                    top: 6,
                    lineHeight: 0,
                    ...(item.badge || item.progress ? { left: '50%', marginLeft: -18 } : { right: '50%', marginRight: -16 }),
                  }}
                >
                  <NewDot />
                </span>
              ) : null}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

/** R-526: the set-up mark in a menu row: the ring and "3/8", with the whole words for a screen reader. */
function SetupMark({ progress }: { progress: SetupProgress }) {
  return (
    // A smaller gap before the mark than between the other parts, so "Set up your gym" stays on one line in English.
    <span data-setup-mark="" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0, marginLeft: -6 }}>
      <ProgressRing progress={progress} size={14} />
      <span aria-hidden style={{ fontFamily: font.body, fontSize: 12, fontWeight: 700, color: color.inkSecondary, fontVariantNumeric: 'tabular-nums' }}>
        {progressShort(progress)}
      </span>
      <span style={visuallyHidden}>{progressWords(progress)}</span>
    </span>
  );
}

const visuallyHidden = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const;

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
