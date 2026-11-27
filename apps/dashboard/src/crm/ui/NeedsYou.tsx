/**
 * R-319 item 8a: "Needs you" on the gym admin panel. The provider reads what waits (members' plan
 * requests, check-in numbers to confirm, new shop orders) every minute while the tab is in view, so a new one can
 * ring (R-522: never while the tab is hidden; web push, 0076, brings those alerts then; logic/needsPoll.ts says
 * which lists each look reads). It sets the tab title's count and gives Today's menu item its
 * badge. The card at the top of Today lists them, each line opening its place. The sound and the
 * browser notice need one tap on "Turn on alerts" (the browser's permission is never asked on load).
 * Rules and words: logic/needsYou.ts.
 *
 * R-506 (14 Nov 2026): it also reads the questions for a trainer (0053) and the member messages waiting for a reply
 * (0069), so they show and ring like the rest, and the gym's alerts list (0075 owner_alerts, logic/gymAlerts.ts):
 * once the server has it, a new alert rings with the server's own line ("Asha sent your gym a complaint...") and its
 * tap opens the right page; the latest show on Today. Without 0075 the ring comes from the lists, as before.
 *
 * R-539 (owner, 14 Nov 2026: new things must show at once, or a refresh button): refreshAll reads the alerts and every
 * list at once. R-561: its button is the panel's one Refresh in the top bar (ui/RefreshButton.tsx), on every page. Coming back to the tab already looks at once (logic/visiblePoll.ts); the minute stays a minute.
 *
 * R-604 (owner, 16 Nov 2026, "yes alerts fix"): with 0098 on the server the bell and Today read THIS person's list from
 * the server (owner_alert_list, logic/alertInbox.ts): done is what the server knows was done in its page, read / opened
 * / removed are this person's own, on every device. Without 0098 everything works as before (owner_alerts + the
 * browser's own guesses, logic/alertHandled.ts). After a step that can handle something (a reply, a decision, an order
 * moved on, an enquiry saved) the list is read again a few seconds later, so the bell is right when it next opens.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';

import { useAuth, useRole } from '../auth/AuthProvider';
import { ALERT_WORDS, alertAge, alertNotice, alertShown, alertsFor, freshAlerts, latestAlerts, type GymAlert, type GymAlertKind } from '../logic/gymAlerts';
import { alertState as handledState, handledHow, type AlertFacts, type AlertState as HandledState, type CountRead, type Read, type RequestFact } from '../logic/alertHandled';
import { alertFactsVersion, markInfoShown, questionsFor, seenInfoFor, setTodayVisit, subscribeAlertFacts, talkFor } from '../shop/alertFacts';
import { useCrm } from '../store';
import { markFresh } from '../logic/freshness';
import { LIST_PARTS, NEEDS_POLL_MS, partsToRead, type NeedsPart } from '../logic/needsPoll';
import { pendingLinks, type PhoneLinkRow } from '../logic/phoneLinks';
import type { PlanRequestRow } from '../logic/planRequests';
import { startVisiblePoll } from '../logic/visiblePoll';
import {
  arrivalLine,
  countIds,
  itemKeys,
  needsItems,
  needsLines,
  newArrivals,
  NEEDS_WORDS as W,
  titleWithCount,
  type NeedsItem,
} from '../logic/needsYou';
import { getAlertInbox, getAlerts, markAlertOpenedOnServer, markAlertsReadOnServer, removeAlertOnServer } from '../shop/alertsApi';
import { markOpened, markRead, markRemoved, recount, todayFromInbox, undoRemoved, type AlertInbox } from '../logic/alertInbox';
import { turnOnPush } from '../shop/webPushApi';
import { getTalkCount } from '../shop/memberMessagesApi';
import { listPhoneLinks, phoneLinkServer } from '../shop/phoneLinkApi';
import { listPlanRequests, planRequestServer } from '../shop/planRequestApi';
import { getQuestionCount, getQuestions } from '../shop/questionsApi';
import { useShop } from '../shop/ShopProvider';
import { memberMessageCountFor, publishMemberMessageCount, subscribeMemberMessageCount } from './MemberMessageParts';
import { publishQuestionCount, questionCountFor, subscribeQuestionCountChange } from './QuestionParts';
import { navigate, useAddressChanges } from './router';
import { Button, Card, color, font, radius, space } from './kit';
import { PaymentTag, paymentRowLook } from './PaymentTag';
import { paymentTone } from '../logic/bellGroups';

const BASE_TITLE = 'MettleUp for Gyms';
const DAY_MS = 24 * 60 * 60 * 1000;

interface NeedsValue {
  items: NeedsItem[];
  total: number;
  /** The gym's alerts of the last 3 days, newest first (empty until the server has 0075). */
  alerts: GymAlert[];
  /**
   * R-593: what the panel knows about each alert's thing (logic/alertHandled.ts), without the news seen on Today
   * (each user adds its own: Today leaves out this visit, the bell counts every visit). null outside the provider.
   */
  facts: Omit<AlertFacts, 'seenInfo'> | null;
  /** The gym id (the news seen on Today is kept per gym). */
  gymId: string;
  /** R-522: the plan requests and the check-in numbers as last read (null: not read yet, or not on this server). */
  planRows: PlanRequestRow[] | null;
  linkRows: PhoneLinkRow[] | null;
  /** Read again now: the lists named, or all of them. */
  refresh: (parts?: readonly NeedsPart[]) => Promise<void>;
  /** R-539: the Refresh button: the alerts and every list (the shop's orders too), now. False when the alerts failed. */
  refreshAll: () => Promise<boolean>;
  /** R-604: this person's bell from the server (0098); null before the first answer or on a server without 0098. */
  inbox: AlertInbox | null;
  /** R-604: what this person did, sent to the server (the list changes here at once). */
  inboxDo: InboxDo;
}

export interface InboxDo {
  /** The panel showed these. */
  read: (ids: readonly string[]) => void;
  /** Its page was opened (bell or Today). */
  opened: (id: string) => void;
  /** The X, and its Undo. */
  remove: (id: string) => void;
  undo: (id: string) => void;
}

const NO_INBOX_DO: InboxDo = { read: () => undefined, opened: () => undefined, remove: () => undefined, undo: () => undefined };

const NeedsContext = createContext<NeedsValue | null>(null);
const EMPTY: NeedsValue = { items: [], total: 0, alerts: [], facts: null, gymId: '', planRows: null, linkRows: null, refresh: async () => undefined, refreshAll: async () => true, inbox: null, inboxDo: NO_INBOX_DO };

/** The waiting items; nothing outside the provider (the demo gym). */
export function useNeedsYou(): NeedsValue {
  return useContext(NeedsContext) ?? EMPTY;
}

/** A short two-note chime made in the browser (no sound file). Logged when the browser refuses. */
function chime(): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [660, 880].forEach((hz, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = hz;
      const at = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.2, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.17);
    });
    window.setTimeout(() => void ctx.close(), 800);
  } catch (e) {
    console.warn('[needs] sound not played', e);
  }
}

function canNotify(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/** A chime and a browser notice; its tap opens `route`. The tag replaces an older notice of the same thing. */
function notify(title: string, body: string, route: string, tag: string): void {
  if (!canNotify() || Notification.permission !== 'granted') return;
  chime();
  try {
    const n = new Notification(title, { body, tag });
    n.onclick = () => {
      window.focus();
      navigate(route);
      n.close();
    };
  } catch (e) {
    console.warn('[needs] notice not shown', e);
  }
}

function ring(fresh: NeedsItem[]): void {
  notify(W.noticeTitle, arrivalLine(fresh), '/', 'mettleup-needs-you');
}

/** One alert keeps its own tag (the same one the web push uses, so a pushed copy replaces it, never doubles). */
function ringAlerts(fresh: GymAlert[]): void {
  const n = alertNotice(fresh);
  if (n) notify(n.title, n.body, n.route, fresh.length === 1 ? `mettleup-alert-${fresh[0].id}` : 'mettleup-needs-you');
}

export function NeedsYouProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const key = session?.online ? (session.ownerKey ?? null) : null;
  const role = useRole();
  const { orders, refreshOrders } = useShop();
  const ordersRef = useRef(refreshOrders);
  ordersRef.current = refreshOrders;
  // The rows themselves (R-522: Today's two cards draw from these, so the lists are read once, here).
  const [planRows, setPlanRows] = useState<PlanRequestRow[] | null>(null);
  const [linkRows, setLinkRows] = useState<PhoneLinkRow[] | null>(null);
  const [questions, setQuestions] = useState(0);
  const [messages, setMessages] = useState(0);
  // R-593: the same counts with when they were read (null: not read yet), and when the two lists were read, so a
  // line on Today goes only when the panel KNOWS its thing was handled.
  const [questionRead, setQuestionRead] = useState<CountRead | null>(null);
  const [talkRead, setTalkRead] = useState<CountRead | null>(null);
  const [planReadAt, setPlanReadAt] = useState(0);
  const [linkReadAt, setLinkReadAt] = useState(0);
  // null: not read yet, or the server has no 0075 (then the lists ring instead).
  const [alerts, setAlerts] = useState<GymAlert[] | null>(null);
  // R-604: this person's list from the server (0098); null until read, or on a server without it.
  const [inbox, setInbox] = useState<AlertInbox | null>(null);
  // "Only a real change redraws" (a poll that redraws everything jumps the page): one signature per block.
  const sigs = useRef<Record<string, string>>({});
  const changed = (block: string, value: unknown): boolean => {
    const s = JSON.stringify(value);
    if (sigs.current[block] === s) return false;
    sigs.current[block] = s;
    return true;
  };
  const changedRef = useRef(changed);
  changedRef.current = changed;

  /** Read the lists named (all of them when none are named). */
  const readParts = useCallback(
    async (parts: readonly NeedsPart[]) => {
      if (!key) return;
      const same = changedRef.current;
      if (parts.includes('plan') && planRequestServer() !== 'no') {
        try {
          const r = await listPlanRequests(key);
          const rows = r === 'missing' ? null : r;
          if (same('plan', rows)) setPlanRows(rows);
          setPlanReadAt(Date.now());
        } catch (e) {
          console.warn('[ForgeErr] needs you: plan requests', e);
        }
      }
      if (parts.includes('links') && phoneLinkServer() !== 'no') {
        try {
          const r = await listPhoneLinks(key);
          const rows = r === 'missing' ? null : r;
          if (same('links', rows)) setLinkRows(rows);
          setLinkReadAt(Date.now());
        } catch (e) {
          console.warn('[ForgeErr] needs you: check-in numbers', e);
        }
      }
      // One count with the menu badges (fresh eyes, 14 Nov 2026): what is read here goes to the menu at once, and a
      // reply on Member messages or Questions for trainers (which asks the menu's count again) comes back here below.
      if (parts.includes('questions')) {
        try {
          const n = await getQuestionCount(key);
          setQuestions(typeof n === 'number' ? n : 0);
          publishQuestionCount(key, typeof n === 'number' ? n : null);
          if (typeof n === 'number') {
            setQuestionRead({ n, readAt: Date.now() });
            // R-593: a question line on Today and questions still open: which ones (no side effect on the server).
            if (n > 0 && questionLinesRef.current) await getQuestions(key);
          }
        } catch (e) {
          console.warn('[ForgeErr] needs you: questions', e);
        }
      }
      if (parts.includes('messages')) {
        try {
          const n = await getTalkCount(key);
          setMessages(typeof n === 'number' ? n : 0);
          publishMemberMessageCount(key, typeof n === 'number' ? n : null);
          if (typeof n === 'number') setTalkRead({ n, readAt: Date.now() });
        } catch (e) {
          console.warn('[ForgeErr] needs you: member messages', e);
        }
      }
      if (parts.includes('orders')) await ordersRef.current();
    },
    [key],
  );

  const refresh = useCallback(
    async (parts?: readonly NeedsPart[]) => {
      await readParts(parts && parts.length ? parts : LIST_PARTS);
    },
    [readParts],
  );

  // A reply lowers the shared count; Needs you (Today's list and badge, the tab title) follows at once.
  useEffect(
    () =>
      subscribeMemberMessageCount(() => {
        const n = memberMessageCountFor(key);
        if (n !== null) {
          setMessages(n);
          setTalkRead({ n, readAt: Date.now() });
        }
      }),
    [key],
  );
  useEffect(
    () =>
      subscribeQuestionCountChange(() => {
        const n = questionCountFor(key);
        if (n !== null) {
          setQuestions(n);
          setQuestionRead({ n, readAt: Date.now() });
        }
      }),
    [key],
  );

  // R-522: one look a minute, ONLY while the tab is in view (logic/visiblePoll.ts), and once at once when it comes
  // back. A hidden tab asks nothing: what comes in meanwhile reaches the staff by web push (0076), tab hidden or closed.
  // The alerts are read first (fresh eyes, 14 Nov 2026), so a line on Today is never newer than its count.
  const lastFull = useRef(-Infinity);
  const knownAlerts = useRef<Set<string> | null>(null);
  const firstSeen = useRef(new Map<string, number>());
  const questionLinesRef = useRef(false);
  // R-539: the poll's own look, for the Refresh button (`all`: every list now, as the every-5-minutes read does).
  const lookRef = useRef<((all: boolean) => Promise<boolean>) | null>(null);
  useEffect(() => {
    lastFull.current = -Infinity;
    knownAlerts.current = null;
    firstSeen.current = new Map();
    sigs.current = {};
    lookRef.current = null;
    if (!key) return;
    const look = async (all = false): Promise<boolean> => {
      let ok = true;
      let alertsOn = false;
      let fresh: GymAlertKind[] = [];
      // R-593: the new alerts are shown only after the lists below are read, so Today never shows (even for a moment)
      // a line whose conversation or request was already handled.
      let show: (() => void) | null = null;
      try {
        // R-604: this person's list from the server (0098) when it has one; else 0075's list, as before.
        const box = await getAlertInbox(key);
        const r = box !== 'missing' ? box.open : await getAlerts(key);
        if (r !== 'missing') {
          alertsOn = true;
          const before = knownAlerts.current;
          if (before) fresh = r.filter((a) => !before.has(a.id)).map((a) => a.kind);
          knownAlerts.current = new Set(r.map((a) => a.id));
          // R-593: when this browser first had each alert (its own clock), before the lists below are read.
          const at = Date.now();
          for (const a of r) if (!firstSeen.current.has(a.id)) firstSeen.current.set(a.id, at);
          questionLinesRef.current = r.some((a) => a.kind === 'trainer_question' && at - a.at < DAY_MS + 60 * 60_000);
        }
        const next = r === 'missing' ? null : r;
        // The server's clock moves on every answer: left out of the signature (only a real change redraws).
        const nextBox = box === 'missing' ? null : { ...box, now: 0 };
        show = () => {
          if (changedRef.current('alerts', next)) setAlerts(next);
          if (changedRef.current('inbox', nextBox)) setInbox(box === 'missing' ? null : box);
        };
      } catch (e) {
        ok = false;
        console.warn('[ForgeErr] needs you: alerts', e);
      }
      const now = Date.now();
      const { parts, full } = all
        ? { parts: [...LIST_PARTS, 'orders' as const], full: true }
        : partsToRead({ alertsOn, sinceFullMs: now - lastFull.current, fresh });
      if (full) lastFull.current = now;
      if (parts.length) await readParts(parts);
      show?.();
      if (ok) markFresh('needs');
      return ok;
    };
    lookRef.current = look;
    return startVisiblePoll(async () => {
      await look();
    }, NEEDS_POLL_MS);
  }, [key, readParts]);

  const refreshAll = useCallback(async () => (lookRef.current ? lookRef.current(true) : true), []);

  // R-604: read this person's list again (only the list; on a server without 0098 nothing happens).
  const reloadInbox = useCallback(async () => {
    if (!key) return;
    try {
      const box = await getAlertInbox(key);
      if (box === 'missing') return;
      if (changedRef.current('inbox', { ...box, now: 0 })) setInbox(box);
      if (changedRef.current('alerts', box.open)) setAlerts(box.open);
    } catch (e) {
      console.warn('[ForgeErr] needs you: alerts list again', e);
    }
  }, [key]);
  const reloadRef = useRef(reloadInbox);
  reloadRef.current = reloadInbox;
  // What this person did: the list changes here at once, then the server is told, then the list is read again.
  const inboxDo = useMemo<InboxDo>(() => {
    // One after another, in the order they were made: an X and its quick Undo must reach the server in that order.
    let queue: Promise<void> = Promise.resolve();
    const send = (what: string, job: () => Promise<void>) => {
      queue = queue
        .then(job)
        .catch((e: unknown) => console.warn(`[ForgeErr] alerts: ${what} not saved`, e))
        .finally(() => void reloadRef.current());
    };
    return {
      read: (ids) => {
        if (!key || ids.length === 0) return;
        setInbox((b) => (b ? markRead(b, new Set(ids)) : b));
        send('read', () => markAlertsReadOnServer(key, ids));
      },
      opened: (id) => {
        if (!key) return;
        setInbox((b) => (b ? markOpened(b, id, Date.now()) : b));
        send('opened', () => markAlertOpenedOnServer(key, id));
      },
      remove: (id) => {
        if (!key) return;
        setInbox((b) => (b ? markRemoved(b, id, Date.now()) : b));
        send('remove', () => removeAlertOnServer(key, id, true));
      },
      undo: (id) => {
        if (!key) return;
        setInbox((b) => (b ? undoRemoved(b, id) : b));
        send('undo', () => removeAlertOnServer(key, id, false));
      },
    };
  }, [key]);
  useEffect(() => {
    setInbox(null);
  }, [key]);

  const plan = useMemo(() => (planRows ?? []).filter((x) => x.status === 'pending').map((x) => x.id), [planRows]);
  const links = useMemo(() => pendingLinks(linkRows ?? []).map((x) => x.id), [linkRows]);

  const shopIds = useMemo(() => orders.filter((o) => o.status === 'ordered').map((o) => o.orderId), [orders]);
  const items = useMemo(
    () =>
      needsItems({
        planRequests: plan,
        phoneLinks: links,
        shopOrders: shopIds,
        questions: countIds('q', questions),
        messages: countIds('m', messages),
      }),
    [plan, links, shopIds, questions, messages],
  );

  // A new item rings once. What is there in the first 10 s after opening (the first answers from the
  // server and the shop) counts as already waiting, so opening the panel never rings.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!key) return;
    const t = window.setTimeout(() => {
      seen.current = itemKeys(itemsRef.current);
    }, 10_000);
    return () => {
      window.clearTimeout(t);
      seen.current = null;
    };
  }, [key]);
  // With the alerts list on the server, the alerts ring (their own words and page) and the lists stay quiet.
  const alertsOn = alerts !== null;
  useEffect(() => {
    if (seen.current === null) return;
    const fresh = newArrivals(seen.current, items);
    seen.current = itemKeys(items);
    if (fresh.length && !alertsOn) ring(fresh);
  }, [items, alertsOn]);

  // The first alerts answer counts as already seen, so opening the panel never rings.
  const seenAlerts = useRef<Set<string> | null>(null);
  useEffect(() => {
    seenAlerts.current = null;
  }, [key]);
  // Only what this person may see (a complaint is the owner's alone; the server keeps it from the desk too).
  const mine = useMemo(() => (alerts === null ? null : alertsFor(alerts, role)), [alerts, role]);
  // R-604: the server already sends only what this person may see; the admin app's own check runs on its list too.
  const inboxMine = useMemo(() => {
    if (!inbox) return null;
    const ok = new Set(alertsFor([...inbox.open, ...inbox.history], role).map((a) => a.id));
    return recount({ ...inbox, open: inbox.open.filter((a) => ok.has(a.id)), history: inbox.history.filter((a) => ok.has(a.id)) });
  }, [inbox, role]);
  useEffect(() => {
    if (mine === null) return;
    const fresh = freshAlerts(seenAlerts.current, mine);
    seenAlerts.current = new Set([...(seenAlerts.current ?? []), ...mine.map((a) => a.id)]);
    if (fresh.length) ringAlerts(fresh);
  }, [mine]);

  const total = items.length;
  useEffect(() => {
    document.title = titleWithCount(BASE_TITLE, total);
    return () => {
      document.title = BASE_TITLE;
    };
  }, [total]);

  // R-593: what the panel knows about each alert's thing (logic/alertHandled.ts).
  const { snapshot, today } = useCrm();
  const gymId = String(snapshot.gym.gymId);
  const factsVersion = useSyncExternalStore(subscribeAlertFacts, alertFactsVersion, alertFactsVersion);
  const facts = useMemo<Omit<AlertFacts, 'seenInfo'>>(() => {
    const req = (rows: readonly RequestFact[] | null, readAt: number): Read<RequestFact> | null => (rows ? { rows, readAt } : null);
    return {
      now: Date.now(),
      today,
      firstSeen: (id: string) => firstSeen.current.get(id) ?? Infinity,
      talkCount: talkRead,
      talk: talkFor(key),
      questionCount: questionRead,
      questions: questionsFor(key),
      plan: req(planRows, planReadAt),
      links: req(linkRows, linkReadAt),
      orders,
      enquiries: snapshot.enquiries ?? null,
    };
    // factsVersion and mine: the kept Member messages / questions changed, or new alerts came (firstSeen).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today, talkRead, key, questionRead, planRows, planReadAt, linkRows, linkReadAt, orders, snapshot.enquiries, factsVersion, mine]);

  // R-604: a step that can handle something happened (a reply or answer lowered a count, a request or number was
  // decided, an order moved on, an enquiry changed): read the list again a few seconds later (the server has it by
  // then; an enquiry reaches it with the gym's next sync, and the minute's look catches anything later).
  const inboxOn = inbox !== null;
  const firstFacts = useRef(true);
  useEffect(() => {
    if (firstFacts.current) {
      firstFacts.current = false;
      return undefined;
    }
    if (!inboxOn) return undefined;
    const t = window.setTimeout(() => void reloadRef.current(), 3_000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [talkRead, questionRead, planRows, linkRows, orders, snapshot.enquiries]);

  const value = useMemo<NeedsValue>(
    () => ({ items, total, alerts: mine ?? [], facts, gymId, planRows, linkRows, refresh, refreshAll, inbox: inboxMine, inboxDo }),
    [items, total, mine, facts, gymId, planRows, linkRows, refresh, refreshAll, inboxMine, inboxDo],
  );
  return <NeedsContext.Provider value={value}>{children}</NeedsContext.Provider>;
}

type AlertState = 'none' | 'default' | 'granted' | 'denied';

function alertState(): AlertState {
  return canNotify() ? (Notification.permission as AlertState) : 'none';
}

/** The list at the top of Today. Hidden when nothing waits. */
export function NeedsYouCard() {
  const { items } = useNeedsYou();
  const { session } = useAuth();
  const key = session?.online ? (session.ownerKey ?? null) : null;
  const [alerts, setAlerts] = useState<AlertState>(alertState);
  const lines = needsLines(items);
  if (lines.length === 0) return null;

  const open = (to: string) => {
    if (to.startsWith('#')) {
      document.getElementById(to.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      navigate(to);
    }
  };

  const turnOn = async () => {
    try {
      const answer = await Notification.requestPermission();
      setAlerts(answer as AlertState);
      if (answer === 'granted') {
        chime();
        // R-506 (0076): the same yes also brings alerts with the admin app closed (quietly nothing before 0076).
        if (key) void turnOnPush(key).catch((e: unknown) => console.warn('[needs] alerts with the app closed not turned on', e));
      }
    } catch (e) {
      console.warn('[needs] alerts permission not asked', e);
      setAlerts(alertState());
    }
  };

  const small = { margin: 0, fontFamily: font.body, fontSize: 13, lineHeight: 1.5, color: color.inkSecondary } as const;
  return (
    <Card style={{ marginBottom: space.lg, borderColor: color.critical }}>
      <h2 style={{ margin: 0, fontFamily: font.display, fontSize: 18, color: color.ink }}>{W.title}</h2>
      <ul style={{ listStyle: 'none', margin: `${space.sm}px 0 0`, padding: 0, display: 'grid', gap: space.xs }}>
        {lines.map((l) => (
          <li key={l.kind}>
            <button
              type="button"
              onClick={() => open(l.to)}
              style={{
                width: '100%',
                minHeight: 44,
                textAlign: 'left',
                background: 'none',
                border: 'none',
                padding: `${space.xs}px 0`,
                cursor: 'pointer',
                fontFamily: font.body,
                fontSize: 15,
                fontWeight: 600,
                color: color.ink,
                textDecoration: 'underline',
              }}
            >
              {l.text}
            </button>
          </li>
        ))}
      </ul>
      {alerts === 'default' ? (
        <div style={{ marginTop: space.sm, display: 'grid', gap: space.xs }}>
          <p style={small}>{W.alertsOff}</p>
          <div>
            <Button variant="ghost" onClick={() => void turnOn()}>
              {W.alertsButton}
            </Button>
          </div>
        </div>
      ) : alerts === 'denied' ? (
        <p style={{ ...small, marginTop: space.sm }}>{W.alertsBlocked}</p>
      ) : null}
    </Card>
  );
}

/** R-506: the latest from members (the last 24 hours) on Today, each line opening its page. Hidden when none. */
export function LatestAlertsCard() {
  const { alerts, facts, gymId, inbox, inboxDo } = useNeedsYou();
  // Fresh eyes (14 Nov 2026): a shop line reads the same orders as "Shop today", so the two always agree.
  const { orders } = useShop();
  // R-593: this visit to Today. News shown in an EARLIER visit is left out; news shown now stays until he leaves.
  const [mounted] = useState(() => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
  // CI 27 Nov 2026: Money and straight back to Today before Money was drawn kept this card on screen, so the same
  // visit showed the news again. A visit also ends when the address leaves Today, however fast React draws it.
  const left = useAddressChanges();
  const visit = `${mounted}-${left}`;
  const now = Date.now();
  // R-593: only what still needs someone (logic/alertHandled.ts); the bell keeps the whole history.
  const seenInfo = gymId ? seenInfoFor(gymId, visit) : new Set<string>();
  // R-604: with 0098 the server says what is done (and what this person opened); else the browser's own rules.
  const list = inbox
    ? todayFromInbox(inbox, seenInfo, now)
    : latestAlerts(facts ? alerts.filter((a) => handledState(a, { ...facts, seenInfo }) === 'waiting') : alerts, now);
  const newsShown = list.filter((a) => handledHow(a) === 'info').map((a) => a.id).join(',');
  useEffect(() => {
    setTodayVisit(visit);
    return () => setTodayVisit(null);
  }, [visit]);
  useEffect(() => {
    if (gymId && newsShown) markInfoShown(gymId, visit, newsShown.split(','));
  }, [gymId, visit, newsShown]);
  if (list.length === 0) return null;
  return (
    <Card style={{ marginBottom: space.lg }}>
      <h2 style={{ margin: 0, fontFamily: font.display, fontSize: 18, color: color.ink }}>{ALERT_WORDS.latest}</h2>
      <ul data-testid="latest-alerts" style={{ listStyle: 'none', margin: `${space.sm}px 0 0`, padding: 0, display: 'grid', gap: space.xs }}>
        {list.map((a) => {
          const shown = alertShown(a, orders);
          // R-561: a payment line in its own colour, with its mark and "Payment" label (as in the bell panel).
          const tone = paymentTone(a);
          const pay = tone ? paymentRowLook(tone) : null;
          return (
          <li key={a.id}>
            <button
              type="button"
              data-pay-row={tone ?? undefined}
              className="tap-line"
              onClick={() => {
                // R-604: opened from Today counts as opened (news then leaves this person's bell).
                if (inbox) inboxDo.opened(a.id);
                navigate(shown.route);
              }}
              style={{
                width: '100%',
                minHeight: 44,
                textAlign: 'left',
                background: pay ? pay.background : 'none',
                border: 'none',
                borderLeft: pay ? pay.borderLeft : 'none',
                borderRadius: pay ? radius.md : undefined,
                padding: pay ? `${space.xs}px ${space.sm}px` : `${space.xs}px 0`,
                cursor: 'pointer',
                fontFamily: font.body,
                fontSize: 14,
                lineHeight: 1.45,
                color: color.ink,
              }}
            >
              {tone ? (
                <span style={{ display: 'block', marginBottom: 2 }}>
                  <PaymentTag tone={tone} />
                </span>
              ) : null}
              <span style={{ fontWeight: a.urgent && !shown.done ? 600 : 400 }}>{shown.line}</span>{' '}
              <span style={{ color: color.inkSecondary, fontSize: 13 }}>{alertAge(a.at, now)}</span>
            </button>
          </li>
          );
        })}
      </ul>
    </Card>
  );
}

/**
 * R-593: how each alert stands, for the bell: its number counts only what still needs someone (news already seen on
 * Today, in any visit, is not counted again); its list keeps every alert and marks the handled ones "Done".
 */
export function useAlertStates(): (a: GymAlert) => HandledState {
  const { facts, gymId } = useNeedsYou();
  return useMemo(() => {
    if (!facts) return (): HandledState => 'waiting';
    const f: AlertFacts = { ...facts, seenInfo: gymId ? seenInfoFor(gymId) : new Set<string>() };
    return (a: GymAlert) => handledState(a, f);
  }, [facts, gymId]);
}
