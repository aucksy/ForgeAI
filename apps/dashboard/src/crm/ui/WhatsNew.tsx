/**
 * "What's new" in the admin app (R-148; logic/whatsNew.ts). Places:
 * - NewsBell (R-239, owner 31 Oct 2026: "a notifications section on the right upper corner with the
 *   notifications bell"): top right on every page, a count of updates not seen yet; tapping it lists the
 *   newest updates and the admin app's version (its newest update day), and marks them seen.
 *   R-243 ("yes, build HQ messages"): messages from MettleUp HQ (logic/hqNews.ts) are in it, under
 *   "From MettleUp", and count in the same number.
 *   R-245 (owner 31 Oct 2026: "I do not want what's new ... right on the landing page. It should be first
 *   part of notifications panel ... a quick summary ... then they click on see more"): the panel opens
 *   with a short summary of the newest update and "See what's new", then HQ's messages. Anything new is
 *   tinted with an orange edge and a "New" tag.
 * - NewsSidebarLink (R-239: "outside, maybe in the left bottom corner", not under Settings): the
 *   sidebar's last row, with the version.
 * - WhatsNewScreen: /news, every update to read again (also More -> What's new on a phone).
 * Each change may carry a button to the page where it is; a page this person cannot open has none.
 * R-561 (owner, 15 Nov 2026): the panel in three groups with headings that are easy to notice (ui/GroupLabel.tsx), in
 * this order: "Your gym" (the gym's alerts, 0075: members, payments, joins), "From MettleUp", "What's new"; an empty
 * group is left out and each heading shows its count (logic/bellGroups.ts). Payment notices have their own colour,
 * mark and "Payment" label. While alerts are off for this device, "Turn on alerts" sits at the top (BellAlertsCard).
 * The bell's number also counts the gym's alerts that came since the bell was last opened.
 * The bell is not in the demo gym (a visitor there has no "update" to hear about).
 * R-604 (owner, 16 Nov 2026, "yes alerts fix"): with 0098 on the server, "Your gym" is this person's to-do list from the
 * server (ui/BellInbox.tsx, logic/alertInbox.ts): an action item stays until it is done in its page, news until it is
 * opened; a folded History at the top keeps the last 7 days; each card has its own X ("Removed. Undo"). Opening the
 * panel reads what it shows (on the server, for this person). Nothing moves while it is open, except a card removed
 * with the X. The bell's number: action items not done + news not read. Without 0098: as before.
 */
import { useEffect, useRef, useState } from 'react';

import { historyWhileOpen, shownWhileOpen, unreadIds, INBOX_WORDS, type InboxAlert } from '../logic/alertInbox';
import { BellHistory, BellInbox } from './BellInbox';

import { useRole } from '../auth/AuthProvider';
import { t } from '../lang/lang';
import { BELL_ALERTS, bellGroups, paymentTone, readBellSeen, saveBellSeen, unseenAlerts } from '../logic/bellGroups';
import { alertAge, alertShown, type GymAlert } from '../logic/gymAlerts';
import type { AlertState } from '../logic/alertHandled';
import { onPanelRefresh } from '../logic/panelRefresh';
import { useShop } from '../shop/ShopProvider';
import { useCrm } from '../store';
import { BellAlertsCard } from './AlertsCards';
import { GroupLabel } from './GroupLabel';
import { PaymentTag, paymentRowLook } from './PaymentTag';
import { useAlertStates, useNeedsYou } from './NeedsYou';
import { canOpen } from '../auth/permissions';
import type { Role } from '../auth/signin';
import { useDemo } from '../demo/demoMode';
import { HQ_POLL_MS, fetchHqNews, markHqSeen, readHqUnread, type HqMessage } from '../logic/hqNews';
import { startVisiblePoll } from '../logic/visiblePoll';
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
import { Card, PageHeader, SectionTitle, TOUCH, UndoBar, color, font, radius, space, useIsCompact } from './kit';
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
    let sig = '';
    const load = async () => {
      const list = await fetchHqNews();
      if (!live) return;
      // Only a real change redraws (a poll that redraws everything jumps the page).
      const next = JSON.stringify(list);
      if (next === sig) return;
      sig = next;
      setMessages(list);
      setUnread(readHqUnread(list, browserStore()));
    };
    // R-245: a desk that comes back to the tab sees a new message without waiting for the timer.
    // R-522: and nothing is asked while the tab is hidden (logic/visiblePoll.ts).
    const stop = startVisiblePoll(load, HQ_POLL_MS);
    // R-561: the top bar's Refresh reads MettleUp's messages again too.
    const leave = onPanelRefresh(async () => {
      await load();
    });
    return () => {
      live = false;
      stop();
      leave();
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

/** R-593: a gym alert someone already handled (it is off Today and out of the bell's number). Made at render, so it
 * follows the language picked. */
function DoneTag() {
  return (
    <span data-done-tag style={{ padding: '1px 8px', borderRadius: radius.pill, background: color.surfaceSunken, color: color.inkSecondary, fontSize: 11, fontWeight: 800 }}>
      {t('Done')}
    </span>
  );
}

/** R-245: one item in the bell. While it is new: a raised background, an orange edge (and a "New" tag). */
function rowStyle(isNew: boolean) {
  return {
    display: 'grid',
    gap: 4,
    padding: `${space.sm}px ${space.md}px`,
    borderRadius: radius.md,
    borderLeft: `3px solid ${isNew ? color.accent : 'transparent'}`,
    background: isNew ? color.surfaceRaised : 'transparent',
  } as const;
}

/** How many lines of the newest update the bell shows before "See what's new". */
const SUMMARY_LINES = 2;

/** R-245: the bell's first part: the newest update in short, and the way to the whole list. */
function NewsSummary({ entry, isNew, newCount, onSee, first }: { entry: AdminNewsEntry; isNew: boolean; newCount: number; onSee: () => void; first: boolean }) {
  const more = entry.lines.length - SUMMARY_LINES;
  return (
    <section aria-label="What's new in the admin app" style={{ display: 'grid', gap: space.sm }}>
      <GroupLabel as="h3" first={first} count={entry.lines.length}>
        {t("What's new")}
      </GroupLabel>
      <div style={rowStyle(isNew)}>
        <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: space.sm, fontFamily: font.body, fontSize: 13, fontWeight: 700, color: color.inkSecondary }}>
          {`Update of ${newsDay(entry.id)}`}
          {isNew ? newTag : null}
        </p>
        <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
          {entry.lines.slice(0, SUMMARY_LINES).map((l) => (
            <li
              key={l.text}
              style={{ fontFamily: font.body, fontSize: 14, lineHeight: 1.45, color: color.ink, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
            >
              {l.text}
            </li>
          ))}
        </ul>
        {more > 0 || newCount > 1 ? (
          <p style={{ margin: 0, fontFamily: font.body, fontSize: 13, color: color.inkMuted }}>
            {[more > 0 ? `${more} more ${more === 1 ? 'change' : 'changes'}` : '', newCount > 1 ? `${newCount} updates since you last looked` : ''].filter(Boolean).join(' · ')}
          </p>
        ) : null}
        <button type="button" style={linkStyle} onClick={onSee}>
          See what's new ›
        </button>
      </div>
    </section>
  );
}

function HqMessages({ messages, fresh, role, onGo, first }: { messages: readonly HqMessage[]; fresh: ReadonlySet<string>; role: Role; onGo: () => void; first: boolean }) {
  return (
    <section aria-label="From MettleUp" style={{ display: 'grid', gap: space.sm }}>
      <GroupLabel as="h3" first={first} count={messages.length}>
        {t('From MettleUp')}
      </GroupLabel>
      {messages.map((m) => {
        const go = hqGo(m, role);
        return (
          <article key={m.id} style={rowStyle(fresh.has(`hq-${m.id}`))}>
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

/** R-561: "Your gym": the newest of the gym's alerts, each opening its page; a payment one in its own colour. */
function GymAlerts({
  alerts,
  fresh,
  onGo,
  first,
  stateOf,
}: {
  alerts: readonly GymAlert[];
  fresh: ReadonlySet<string>;
  onGo: (route: string) => void;
  first: boolean;
  stateOf: (a: GymAlert) => AlertState;
}) {
  // The shop's own orders, so a shop line says ready or collected exactly as Today does.
  const { orders } = useShop();
  const now = Date.now();
  return (
    <section aria-label="Your gym" style={{ display: 'grid', gap: space.xs }}>
      <GroupLabel as="h3" first={first} count={alerts.length}>
        {t('Your gym')}
      </GroupLabel>
      <ul data-testid="bell-gym-alerts" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: space.xs }}>
        {alerts.map((a) => {
          const shown = alertShown(a, orders);
          const tone = paymentTone(a);
          const isNew = fresh.has(`alert-${a.id}`);
          const done = stateOf(a) === 'done';
          const pay = tone ? paymentRowLook(tone) : null;
          return (
            <li key={a.id}>
              <button
                type="button"
                className="tap-row"
                data-pay-row={tone ?? undefined}
                onClick={() => onGo(shown.route)}
                style={{
                  width: '100%',
                  minHeight: TOUCH,
                  display: 'grid',
                  gap: 4,
                  textAlign: 'left',
                  cursor: 'pointer',
                  padding: `${space.sm}px ${space.md}px`,
                  border: 'none',
                  borderRadius: radius.md,
                  borderLeft: pay ? pay.borderLeft : `3px solid ${isNew ? color.accent : 'transparent'}`,
                  background: pay ? pay.background : isNew ? color.surfaceRaised : 'transparent',
                  color: color.ink,
                  fontFamily: font.body,
                }}
              >
                {tone || isNew || done ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
                    {tone ? <PaymentTag tone={tone} /> : null}
                    {isNew ? newTag : null}
                    {done ? <DoneTag /> : null}
                  </span>
                ) : null}
                <span style={{ fontSize: 14, lineHeight: 1.45, fontWeight: a.urgent && !shown.done ? 600 : 400 }}>{shown.line}</span>
                <span style={{ fontSize: 12, color: color.inkSecondary }}>{alertAge(a.at, now)}</span>
              </button>
            </li>
          );
        })}
      </ul>
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
  // R-561: the gym's alerts (0075; none before it, and none in the demo gym), newest first, for this person.
  const { alerts, inbox, inboxDo } = useNeedsYou();
  // R-604: the server's truth (0098) when it is there; the browser's own rules before it.
  const serverTruth = !demo && inbox !== null;
  const { orders } = useShop();
  // What the open panel shows, as it was when it opened (nothing moves under the finger), and the cards removed here.
  const [frozen, setFrozen] = useState<{ open: InboxAlert[]; history: InboxAlert[] } | null>(null);
  const [removedHere, setRemovedHere] = useState<ReadonlyMap<string, number>>(new Map());
  const [undo, setUndo] = useState<{ id: string; line: string } | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!undo) return undefined;
    const t = window.setTimeout(() => setUndo(null), 7_000);
    return () => window.clearTimeout(t);
  }, [undo]);
  // Fresh-eyes review (15 Nov 2026): each branch keeps its own seen time; switching branch reads that branch's.
  const gymId = String(useCrm().snapshot.gym.gymId);
  const [seen, setSeen] = useState<{ gymId: string; at: number | null }>(() => ({ gymId, at: readBellSeen(browserStore(), gymId) }));
  if (seen.gymId !== gymId) setSeen({ gymId, at: readBellSeen(browserStore(), gymId) });
  const alertsSeen = seen.gymId === gymId ? seen.at : null;
  // R-593: the number counts only what still needs someone (a conversation marked done is not news to act on).
  const stateOf = useAlertStates();
  const newAlerts = demo ? [] : unseenAlerts(alerts.filter((a) => stateOf(a) === 'waiting'), alertsSeen, Date.now());
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
  const gymCount = serverTruth && inbox ? inbox.count : newAlerts.length;
  const count = unread.length + hq.unread.length + gymCount;
  const newest = ADMIN_NEWS.find((e) => e.lines.length > 0);
  const newUpdates = ADMIN_NEWS.filter((e) => fresh.has(e.id)).length;
  const gymShown = alerts.slice(0, BELL_ALERTS);
  const hqShown = hq.messages.slice(0, SHOWN_UPDATES);
  // The panel opened before the server's first answer: what came is shown as it is (frozen from the next opening).
  const still = frozen ?? (inbox ? { open: inbox.open, history: inbox.history } : null);
  const inboxShown = serverTruth && inbox && still ? shownWhileOpen(still.open, inbox, removedHere) : [];
  const historyShown = serverTruth && still ? historyWhileOpen(still.open, still.history, removedHere) : [];
  const otherGroups = bellGroups({ gym: serverTruth ? 0 : gymShown.length, mettleup: hqShown.length, news: newest?.lines.length ?? 0 });
  // R-604: "Your gym" is always there with the server's truth (an empty list says nothing is waiting).
  const groups = serverTruth ? [{ id: 'gym' as const, title: 'Your gym', count: inboxShown.length }, ...otherGroups] : otherGroups;
  const goAlert = (a: InboxAlert, route: string) => {
    inboxDo.opened(a.id);
    setOpen(false);
    navigate(route);
  };
  const removeAlert = (a: InboxAlert, line: string) => {
    setRemovedHere((m) => new Map(m).set(a.id, Date.now()));
    inboxDo.remove(a.id);
    setUndo({ id: a.id, line });
    // The X is gone with its card: the panel keeps the keyboard's place.
    panelRef.current?.focus({ preventScroll: true });
  };
  const undoRemove = () => {
    if (!undo) return;
    const id = undo.id;
    setRemovedHere((m) => {
      const next = new Map(m);
      next.delete(id);
      return next;
    });
    inboxDo.undo(id);
    setUndo(null);
  };
  const toggle = () => {
    if (!open) {
      const gymNew = serverTruth && inbox ? unreadIds(inbox) : newAlerts.map((a) => a.id);
      setFresh(new Set([...unread.map((e) => e.id), ...hq.unread.map((m) => `hq-${m.id}`), ...gymNew.map((id) => `alert-${id}`)]));
      if (serverTruth && inbox) {
        // R-604: freeze what is shown, and read it (for this person, on the server).
        setFrozen({ open: inbox.open, history: inbox.history });
        setRemovedHere(new Map());
        inboxDo.read(gymNew);
      }
      if (unread.length > 0) markNewsSeen();
      if (hq.unread.length > 0) hq.seen();
      const newestAlert = alerts[0]?.at;
      if (newestAlert && newestAlert > (alertsSeen ?? 0)) {
        saveBellSeen(browserStore(), gymId, newestAlert);
        setSeen({ gymId, at: newestAlert });
      }
    }
    setOpen(!open);
  };
  return (
    <div ref={box} style={{ position: 'relative' }}>
      <button
        type="button"
        aria-label={count > 0 ? (serverTruth ? `Notifications, ${count} waiting for you` : `Notifications, ${count} new`) : 'Notifications'}
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
            {/* R-604: a busy morning reads "99+" (the full number is in the bell's name). */}
            {count > 99 ? '99+' : count}
          </span>
        ) : null}
      </button>
      {open && (
        <section
          ref={panelRef}
          tabIndex={-1}
          role="dialog"
          aria-label="Notifications"
          style={{
            outline: 'none',
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
            <h2 style={{ margin: 0, fontFamily: font.display, fontSize: 18, color: color.ink }}>{t('Notifications')}</h2>
            <span style={{ fontFamily: font.body, fontSize: 12, color: color.inkMuted }}>{ADMIN_VERSION}</span>
          </div>
          {/* R-561: while alerts are off for this device, until they are on or the card is closed. */}
          <BellAlertsCard />
          {/* R-604: History at the top, folded to one row. */}
          {serverTruth ? <BellHistory items={historyShown} orders={orders} onGo={goAlert} /> : null}
          {groups.map((g, i) =>
            g.id === 'gym' && serverTruth ? (
              <BellInbox key={g.id} first={i === 0} items={inboxShown} fresh={fresh} orders={orders} onGo={goAlert} onRemove={removeAlert} />
            ) : g.id === 'gym' ? (
              <GymAlerts
                key={g.id}
                first={i === 0}
                alerts={gymShown}
                fresh={fresh}
                stateOf={stateOf}
                onGo={(route) => {
                  setOpen(false);
                  navigate(route);
                }}
              />
            ) : g.id === 'mettleup' ? (
              <HqMessages key={g.id} first={i === 0} messages={hqShown} fresh={fresh} role={role} onGo={() => setOpen(false)} />
            ) : newest ? (
              <NewsSummary
                key={g.id}
                first={i === 0}
                entry={newest}
                isNew={fresh.has(newest.id)}
                newCount={newUpdates}
                onSee={() => {
                  setOpen(false);
                  navigate('/news');
                }}
              />
            ) : null,
          )}
        </section>
      )}
      {/* R-604: a mis-tap on the X is one tap from undone (inside the bell's box: tapping it never closes the panel). */}
      {undo ? (
        <div className="bell-undo">
          <UndoBar message={t(INBOX_WORDS.removed)} onUndo={undoRemove} undoLabel={t(INBOX_WORDS.undoLabel, { line: undo.line })} />
        </div>
      ) : null}
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
