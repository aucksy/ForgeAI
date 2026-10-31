/**
 * "What's new" in the admin app (R-148; logic/whatsNew.ts). Places:
 * - NewsBell (R-239, owner 31 Oct 2026: "a notifications section on the right upper corner with the
 *   notifications bell"): top right on every page, a count of updates not seen yet; tapping it lists the
 *   newest updates and the admin app's version (its newest update day), and marks them seen.
 *   R-243 ("yes, build HQ messages"): messages from MettleUp HQ (logic/hqNews.ts) come first in it,
 *   under "From MettleUp", and count in the same number.
 * - NewsSidebarLink (R-239: "outside, maybe in the left bottom corner", not under Settings): the
 *   sidebar's last row, with the version.
 * - WhatsNewCard: top of Today, once after an update ("Got it" hides it until the next one).
 * - WhatsNewScreen: /news, every update to read again (also More -> What's new on a phone).
 * Each change may carry a button to the page where it is; a page this person cannot open has none.
 * The bell and the card are not in the demo gym (a visitor there has no "update" to hear about).
 */
import { useEffect, useRef, useState } from 'react';

import { useRole } from '../auth/AuthProvider';
import { canOpen } from '../auth/permissions';
import type { Role } from '../auth/signin';
import { useDemo } from '../demo/demoMode';
import { HQ_POLL_MS, fetchHqNews, markHqSeen, readHqUnread, type HqMessage } from '../logic/hqNews';
import {
  ADMIN_NEWS,
  NEWS_SEEN_EVENT,
  SHOWN_UPDATES,
  browserStore,
  currentNews,
  markNewsSeen,
  newsDay,
  readNews,
  type AdminNewsEntry,
  type AdminNewsLine,
} from '../logic/whatsNew';
import { Icon } from './icons';
import { Card, PageHeader, SectionTitle, TOUCH, color, font, radius, space, useIsCompact } from './kit';
import { Link, navigate } from './router';

/** "Version 31 Oct 2026": the admin app's version is its newest update's day. */
export const ADMIN_VERSION = `Version ${newsDay(currentNews() ?? '')}`;

/** The updates this browser has not seen yet; empties when they are marked seen anywhere on the page. */
function useUnreadNews(demo: boolean): readonly AdminNewsEntry[] {
  const [entries, setEntries] = useState<readonly AdminNewsEntry[]>(() => (demo ? [] : readNews()));
  useEffect(() => {
    const seen = () => setEntries([]);
    window.addEventListener(NEWS_SEEN_EVENT, seen);
    return () => window.removeEventListener(NEWS_SEEN_EVENT, seen);
  }, []);
  return entries;
}

/** R-243: HQ's messages, asked for when the page opens and every HQ_POLL_MS; none in the demo gym. */
function useHqNews(demo: boolean): { messages: HqMessage[]; unread: HqMessage[]; seen: () => void } {
  const [messages, setMessages] = useState<HqMessage[]>([]);
  const [unread, setUnread] = useState<HqMessage[]>([]);
  useEffect(() => {
    if (demo) return undefined;
    let live = true;
    const load = async () => {
      const list = await fetchHqNews();
      if (!live) return;
      setMessages(list);
      setUnread(readHqUnread(list, browserStore()));
    };
    void load();
    const timer = window.setInterval(() => void load(), HQ_POLL_MS);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [demo]);
  const seen = () => {
    markHqSeen(messages, browserStore());
    setUnread([]);
  };
  return { messages, unread, seen };
}

/** "31 Oct 2026" for a moment, by the India date. PURE. */
export function hqDay(at: string): string {
  const ms = Date.parse(at);
  return Number.isNaN(ms) ? '' : newsDay(new Date(ms + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10));
}

/** The button an HQ message gets for this person: an admin app page they may open, or an https address. */
export function hqGo(m: HqMessage, role: Role): { label: string; path?: string; href?: string } | null {
  if (!m.link || !m.label) return null;
  if (m.link.startsWith('https://')) return { label: m.label, href: m.link };
  return canOpen(role, m.link) ? { label: m.label, path: m.link } : null;
}

const newTag = (
  <span style={{ padding: '1px 8px', borderRadius: radius.pill, background: color.accentSoft, color: color.accentBright, fontSize: 11, fontWeight: 800 }}>New</span>
);

function HqMessages({ messages, fresh, role, onGo }: { messages: readonly HqMessage[]; fresh: ReadonlySet<string>; role: Role; onGo: () => void }) {
  return (
    <section aria-label="From MettleUp" style={{ display: 'grid', gap: space.md, paddingBottom: space.lg, marginBottom: space.lg, borderBottom: `1px solid ${color.border}` }}>
      <p style={{ margin: 0, fontFamily: font.body, fontSize: 12, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase', color: color.inkMuted }}>From MettleUp</p>
      {messages.map((m) => {
        const go = hqGo(m, role);
        return (
          <article key={m.id} style={{ display: 'grid', gap: 4 }}>
            <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: space.sm, fontFamily: font.body, fontSize: 12, color: color.inkMuted }}>
              {hqDay(m.at)}
              {fresh.has(`hq-${m.id}`) ? newTag : null}
            </p>
            <h3 style={{ margin: 0, fontFamily: font.body, fontSize: 15, fontWeight: 700, color: color.ink }}>{m.title}</h3>
            <p style={{ margin: 0, fontFamily: font.body, fontSize: 14, lineHeight: 1.45, color: color.ink, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{m.body}</p>
            {go?.path ? (
              <button
                type="button"
                style={linkStyle}
                onClick={() => {
                  onGo();
                  navigate(go.path as string);
                }}
              >
                {go.label} ›
              </button>
            ) : go?.href ? (
              <a href={go.href} target="_blank" rel="noopener noreferrer" style={{ ...linkStyle, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
                {go.label} ›
              </a>
            ) : null}
          </article>
        );
      })}
    </section>
  );
}

/** The button a line gets for this person, or null. PURE. */
export function newsGo(line: AdminNewsLine, role: Role): { label: string; path: string } | null {
  return line.go && canOpen(role, line.go.path) ? line.go : null;
}

const linkStyle = {
  background: 'none',
  border: 'none',
  padding: 0,
  minHeight: TOUCH,
  cursor: 'pointer',
  fontFamily: font.body,
  fontSize: 14,
  fontWeight: 700,
  color: color.accentBright,
  textAlign: 'left',
} as const;

function NewsLines({ entry, role, onGo }: { entry: AdminNewsEntry; role: Role; onGo?: () => void }) {
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: space.sm }}>
      {entry.lines.map((l) => {
        const go = newsGo(l, role);
        return (
          <li key={l.text} style={{ display: 'grid', gap: 2 }}>
            <span style={{ fontFamily: font.body, fontSize: 14, color: color.ink, lineHeight: 1.45 }}>{l.text}</span>
            {go && (
              <button
                type="button"
                style={linkStyle}
                onClick={() => {
                  onGo?.();
                  navigate(go.path);
                }}
              >
                {go.label} ›
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function DayTitle({ id }: { id: string }) {
  return (
    <p style={{ margin: `0 0 ${space.sm}px`, fontFamily: font.body, fontSize: 13, fontWeight: 700, color: color.inkSecondary }}>
      {`Update of ${newsDay(id)}`}
    </p>
  );
}

/** Today: what changed since this browser last looked, once. */
export function WhatsNewCard() {
  const demo = useDemo() !== null;
  const role = useRole();
  const entries = useUnreadNews(demo);
  if (demo || entries.length === 0) return null;
  const done = () => markNewsSeen();
  return (
    <Card style={{ marginBottom: space.lg }}>
      <section aria-label="What's new in the admin app">
        <SectionTitle>What's new in the admin app</SectionTitle>
        <div style={{ display: 'grid', gap: space.lg }}>
          {entries.map((e) => (
            <div key={e.id}>
              <DayTitle id={e.id} />
              <NewsLines entry={e} role={role} onGo={done} />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: space.lg, marginTop: space.sm }}>
          <button type="button" style={linkStyle} onClick={done} aria-label="Got it. Hide what's new">
            Got it
          </button>
          <button
            type="button"
            style={{ ...linkStyle, color: color.inkSecondary }}
            onClick={() => {
              done();
              navigate('/news');
            }}
          >
            See earlier updates
          </button>
        </div>
      </section>
    </Card>
  );
}

/** /news: every update, newest first. */
export function WhatsNewScreen() {
  const role = useRole();
  return (
    <>
      <PageHeader title="What's new" subtitle={`Changes to the admin app, newest first. ${ADMIN_VERSION}.`} />
      {ADMIN_NEWS.filter((e) => e.lines.length > 0).map((e) => (
        <Card key={e.id} style={{ marginBottom: space.lg }}>
          <SectionTitle>{newsDay(e.id)}</SectionTitle>
          <NewsLines entry={e} role={role} />
        </Card>
      ))}
    </>
  );
}

/** R-239: the bell, top right. Its number: updates not seen yet. Opening it marks them seen. */
export function NewsBell() {
  const demo = useDemo() !== null;
  const role = useRole();
  const compact = useIsCompact();
  const unread = useUnreadNews(demo);
  const hq = useHqNews(demo);
  const [open, setOpen] = useState(false);
  // Which updates were new when the list opened: they keep their "New" tag while it stays open.
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
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
  if (demo) return null;
  const count = unread.length + hq.unread.length;
  const recent = ADMIN_NEWS.filter((e) => e.lines.length > 0).slice(0, SHOWN_UPDATES);
  const toggle = () => {
    if (!open) {
      setFresh(new Set([...unread.map((e) => e.id), ...hq.unread.map((m) => `hq-${m.id}`)]));
      if (unread.length > 0) markNewsSeen();
      if (hq.unread.length > 0) hq.seen();
    }
    setOpen(!open);
  };
  return (
    <div ref={box} style={{ position: 'relative' }}>
      <button
        type="button"
        aria-label={count > 0 ? `Notifications, ${count} new` : 'Notifications'}
        aria-expanded={open}
        onClick={toggle}
        style={{
          position: 'relative',
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
        <Icon name="bell" size={20} />
        {count > 0 ? (
          <span
            aria-hidden
            style={{
              position: 'absolute',
              top: -2,
              right: -2,
              minWidth: 18,
              height: 18,
              padding: '0 5px',
              display: 'grid',
              placeItems: 'center',
              borderRadius: radius.pill,
              background: color.accent,
              color: '#1F0D05',
              fontFamily: font.body,
              fontSize: 10,
              fontWeight: 800,
            }}
          >
            {count}
          </span>
        ) : null}
      </button>
      {open && (
        <section
          role="dialog"
          aria-label="Notifications"
          style={{
            // A phone: the full width under the header. A computer: hangs from the bell.
            position: compact ? 'fixed' : 'absolute',
            top: compact ? 'calc(var(--demo-bar, 0px) + 64px)' : TOUCH + space.sm,
            left: compact ? space.lg : undefined,
            right: compact ? space.lg : 0,
            width: compact ? undefined : 380,
            maxHeight: compact ? 'calc(100vh - var(--demo-bar, 0px) - 160px)' : 'min(70vh, 560px)',
            overflowY: 'auto',
            zIndex: 50,
            background: color.surface,
            border: `1px solid ${color.border}`,
            borderRadius: radius.lg,
            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.28)',
            padding: space.lg,
            textAlign: 'left',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: space.md, marginBottom: space.md }}>
            <h2 style={{ margin: 0, fontFamily: font.display, fontSize: 18, color: color.ink }}>Notifications</h2>
            <span style={{ fontFamily: font.body, fontSize: 12, color: color.inkMuted }}>{ADMIN_VERSION}</span>
          </div>
          {hq.messages.length > 0 ? <HqMessages messages={hq.messages.slice(0, SHOWN_UPDATES)} fresh={fresh} role={role} onGo={() => setOpen(false)} /> : null}
          <div style={{ display: 'grid', gap: space.lg }}>
            {recent.map((e) => (
              <div key={e.id}>
                <p style={{ margin: `0 0 ${space.sm}px`, display: 'flex', alignItems: 'center', gap: space.sm, fontFamily: font.body, fontSize: 13, fontWeight: 700, color: color.inkSecondary }}>
                  {`Update of ${newsDay(e.id)}`}
                  {fresh.has(e.id) ? newTag : null}
                </p>
                <NewsLines entry={e} role={role} onGo={() => setOpen(false)} />
              </div>
            ))}
          </div>
          <button
            type="button"
            style={{ ...linkStyle, marginTop: space.sm }}
            onClick={() => {
              setOpen(false);
              navigate('/news');
            }}
          >
            See all updates ›
          </button>
        </section>
      )}
    </div>
  );
}

/** R-239: the sidebar's last row (a computer): What's new and the version, outside Settings. */
export function NewsSidebarLink({ active }: { active: boolean }) {
  return (
    <Link to="/news">
      <span
        aria-current={active ? 'page' : undefined}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: space.md,
          minHeight: 44,
          padding: `${space.xs}px ${space.md}px`,
          borderRadius: radius.md,
          background: active ? color.accentSoft : 'transparent',
          color: active ? color.accentBright : color.inkSecondary,
          fontFamily: font.body,
        }}
      >
        <Icon name="news" size={20} />
        <span style={{ display: 'grid' }}>
          <span style={{ fontSize: 14, fontWeight: active ? 700 : 500 }}>What's new</span>
          <span style={{ fontSize: 11, color: color.inkMuted }}>{ADMIN_VERSION}</span>
        </span>
      </span>
    </Link>
  );
}
