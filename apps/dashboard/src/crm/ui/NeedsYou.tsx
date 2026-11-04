/**
 * R-319 item 8a: "Needs you" on the gym admin panel. The provider reads what waits (members' plan
 * requests, check-in numbers to confirm, new shop orders) every minute, also while the tab is in the
 * background, so a new one can ring. It sets the tab title's count and gives Today's menu item its
 * badge. The card at the top of Today lists them, each line opening its place. The sound and the
 * browser notice need one tap on "Turn on alerts" (the browser's permission is never asked on load).
 * Rules and words: logic/needsYou.ts.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { useAuth } from '../auth/AuthProvider';
import { pendingLinks } from '../logic/phoneLinks';
import {
  arrivalLine,
  itemKeys,
  needsItems,
  needsLines,
  newArrivals,
  NEEDS_WORDS as W,
  titleWithCount,
  type NeedsItem,
} from '../logic/needsYou';
import { listPhoneLinks, phoneLinkServer } from '../shop/phoneLinkApi';
import { listPlanRequests, planRequestServer } from '../shop/planRequestApi';
import { useShop } from '../shop/ShopProvider';
import { navigate } from './router';
import { Button, Card, color, font, space } from './kit';

const POLL_MS = 60_000;
const BASE_TITLE = 'MettleUp for Gyms';

interface NeedsValue {
  items: NeedsItem[];
  total: number;
  refresh: () => Promise<void>;
}

const NeedsContext = createContext<NeedsValue | null>(null);
const EMPTY: NeedsValue = { items: [], total: 0, refresh: async () => undefined };

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

function ring(fresh: NeedsItem[]): void {
  if (!canNotify() || Notification.permission !== 'granted') return;
  chime();
  try {
    const n = new Notification(W.noticeTitle, { body: arrivalLine(fresh), tag: 'mettleup-needs-you' });
    n.onclick = () => {
      window.focus();
      navigate('/');
      n.close();
    };
  } catch (e) {
    console.warn('[needs] notice not shown', e);
  }
}

export function NeedsYouProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const key = session?.online ? (session.ownerKey ?? null) : null;
  const { orders } = useShop();
  const [plan, setPlan] = useState<string[]>([]);
  const [links, setLinks] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    if (!key) return;
    if (planRequestServer() !== 'no') {
      try {
        const r = await listPlanRequests(key);
        setPlan(r === 'missing' ? [] : r.filter((x) => x.status === 'pending').map((x) => x.id));
      } catch (e) {
        console.warn('[ForgeErr] needs you: plan requests', e);
      }
    }
    if (phoneLinkServer() !== 'no') {
      try {
        const r = await listPhoneLinks(key);
        setLinks(r === 'missing' ? [] : pendingLinks(r).map((x) => x.id));
      } catch (e) {
        console.warn('[ForgeErr] needs you: check-in numbers', e);
      }
    }
  }, [key]);

  // Every minute, also in a background tab: the point is to ring for what comes in meanwhile.
  useEffect(() => {
    if (!key) return;
    void refresh();
    const t = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(t);
  }, [key, refresh]);

  const shopIds = useMemo(() => orders.filter((o) => o.status === 'ordered').map((o) => o.orderId), [orders]);
  const items = useMemo(() => needsItems({ planRequests: plan, phoneLinks: links, shopOrders: shopIds }), [plan, links, shopIds]);

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
  useEffect(() => {
    if (seen.current === null) return;
    const fresh = newArrivals(seen.current, items);
    seen.current = itemKeys(items);
    if (fresh.length) ring(fresh);
  }, [items]);

  const total = items.length;
  useEffect(() => {
    document.title = titleWithCount(BASE_TITLE, total);
    return () => {
      document.title = BASE_TITLE;
    };
  }, [total]);

  const value = useMemo<NeedsValue>(() => ({ items, total, refresh }), [items, total, refresh]);
  return <NeedsContext.Provider value={value}>{children}</NeedsContext.Provider>;
}

type AlertState = 'none' | 'default' | 'granted' | 'denied';

function alertState(): AlertState {
  return canNotify() ? (Notification.permission as AlertState) : 'none';
}

/** The list at the top of Today. Hidden when nothing waits. */
export function NeedsYouCard() {
  const { items } = useNeedsYou();
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
      if (answer === 'granted') chime();
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
