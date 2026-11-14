/**
 * F201: is the AI Assistant there for this person, and how many credits are left. One shared answer for the
 * floating button, the menu, the Today card and the Assistant screen.
 *
 * The WHOLE feature stays hidden (button, route, menu, Today card) until the gym's server answers the wallet
 * (owner_ai_wallet, migration 0071). Today the live server has no 0071, so nothing shows on the live panel.
 * It is also hidden for desk staff and trainers (owner only, 03-design §4), in the demo gym (the worker refuses
 * demo gyms), when the panel worker says the assistant is switched off (503 {reason:'off'}), and offline before
 * the first answer.
 *
 * <AssistantWatch /> (mounted once, in the routes) asks for the wallet when the panel opens, when the tab comes
 * back into view and every 5 minutes; everything else only reads.
 *
 * R-555 (15 Nov 2026): what the gym's server says about AI questions (the counts, "AI answers for members") is shown
 * only while the panel Worker charges for them (AI_CREDITS_CHARGE "on", told at GET /api/switches as `aiCharge`).
 * With charging off nothing is taken from any gym, so `wallet.questions` reads as null: asking is free, and the credits
 * sheet shows no members' section and no counts. Switching it on or off shows within minutes, with no release.
 */
import { useEffect, useMemo, useSyncExternalStore } from 'react';

import { useAuth, useRole } from '../auth/AuthProvider';
import { useDemo } from '../demo/demoMode';
import { switchesNow, useAiChargeOn } from '../gympage/pagesOpen';
import { setQuestionsCounted } from './allowance';
import { aiQuestions, aiWallet, chargedView, type AiWallet } from './api';

interface State {
  key: string | null;
  wallet: AiWallet | null;
  /** The worker said the assistant is off (or refuses this gym): hidden until the panel is opened again. */
  off: boolean;
  /** The server answered the wallet at least once for this key (with a wallet or without). */
  asked: boolean;
}

let state: State = { key: null, wallet: null, off: false, asked: false };
const listeners = new Set<() => void>();
let asking: Promise<void> | null = null;

function set(next: State): void {
  state = next;
  for (const fn of [...listeners]) fn();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

const read = (): State => state;

/** Ask the server for the wallet now (after a spend, a refund, or the Credits sheet opening). */
export async function refreshAssistantWallet(key: string | null = state.key): Promise<void> {
  if (!key) return;
  if (asking) return asking;
  asking = (async () => {
    // F209: this month's AI questions too (supabase 0078); null until the gym's server counts them.
    const [w0, q] = await Promise.all([aiWallet(key), aiQuestions(key)]);
    const keep = state.key === key ? (state.wallet?.questions ?? null) : null;
    const w = w0 ? { ...w0, questions: q ?? keep } : null;
    // R-531 (decision #98 = B, supabase 0083): the owner's own questions are free again once the server has 0083.
    if (w) setQuestionsCounted(switchesNow()?.aiCharge === true && !!w.questions && !w.questions.memberAi);
    // Offline or a hiccup on a panel that already had it: keep what was shown (the next tick asks again).
    if (w || state.key !== key || state.wallet === null) set({ key, wallet: w, off: state.key === key ? state.off : false, asked: true });
  })().finally(() => {
    asking = null;
  });
  return asking;
}

/** The worker answered 503 {reason:'off'} or refused this gym ('demo'): hide the assistant. */
export function markAssistantOff(): void {
  if (!state.off) set({ ...state, off: true });
  console.info('[assistant] switched off by the server; hidden');
}

/** After a spend or refund: the server's new balance, shown at once (the wallet is asked again too). */
export function noteBalance(balance: number | null): void {
  if (balance === null || !state.wallet) return;
  set({ ...state, wallet: { ...state.wallet, balance, freeLeft: Math.min(state.wallet.freeLeft, balance) } });
}

/** For tests: forget everything. */
export function resetAssistantState(): void {
  state = { key: null, wallet: null, off: false, asked: false };
  asking = null;
}

/** The online owner key of this panel, or null (a browser-only gym has no server). */
function useOnlineKey(): string | null {
  const { session } = useAuth();
  return session?.online ? (session.ownerKey ?? null) : null;
}

/** Owner, online, a real gym: the only people who may ever see the assistant. */
function useMaySee(): boolean {
  const role = useRole();
  const demo = useDemo() !== null;
  const key = useOnlineKey();
  return role === 'owner' && !demo && key !== null;
}

export interface AssistantState {
  /** Show the assistant (button, route, menu, Today card). */
  on: boolean;
  key: string | null;
  wallet: AiWallet | null;
  /** Still waiting for the server's first answer (an owner on a real online gym): show nothing yet, decide nothing. */
  waiting: boolean;
}

/** Is the AI Assistant there, and the credits. Reads only; <AssistantWatch /> keeps it fresh. */
export function useAssistant(): AssistantState {
  const key = useOnlineKey();
  const may = useMaySee();
  const s = useSyncExternalStore(subscribe, read, read);
  const charge = useAiChargeOn();
  const mine = may && s.key === key;
  const raw = mine ? s.wallet : null;
  // R-555: nothing about charging for questions while the Worker does not charge (AI_CREDITS_CHARGE off).
  const wallet = useMemo(() => chargedView(raw, charge), [raw, charge]);
  return { on: may && wallet !== null && !s.off, key, wallet, waiting: may && !(mine && s.asked) };
}

/** Keeps the wallet fresh while the panel is open. Mount once (CrmApp Routes). Draws nothing. */
export function AssistantWatch(): null {
  const key = useOnlineKey();
  const may = useMaySee();
  useEffect(() => {
    if (!may || !key) return undefined;
    if (state.key !== key) set({ key, wallet: null, off: false, asked: false });
    const run = (): void => void refreshAssistantWallet(key);
    run();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') run();
    }, 5 * 60 * 1000);
    const onShow = (): void => {
      if (document.visibilityState === 'visible') run();
    };
    document.addEventListener('visibilitychange', onShow);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onShow);
    };
  }, [may, key]);
  return null;
}
