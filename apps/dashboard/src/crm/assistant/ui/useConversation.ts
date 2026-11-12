/**
 * F201: what the Assistant screen DOES: ask the AI, show its cards, rewrite a message, and send or save one card
 * (its own task, its own charge, R-471). The side panel on a computer and the full screen on a phone share it.
 *
 * Money and records are touched ONLY in `confirm`, which runs from a card's own button: the task is saved again
 * (free), then executeTask spends the card's credits and does the one thing (assistant/execute.ts).
 */
import { useCallback, useMemo } from 'react';

import { useAuth } from '../../auth/AuthProvider';
import { takerOf } from '../../auth/permissions';
import { getLang, t } from '../../lang/lang';
import * as shopApi from '../../shop/api';
import { saveDiet } from '../../shop/bodyApi';
import { useCrm } from '../../store';
import { askAssistant, rewriteMessage, type AssistFail } from '../api';
import { line } from '../catalogue';
import { buildAssistContext } from '../context';
import { addTurn, cardsFor, updateCard, updateTurn, useTurns, withMessage, type CardModel, type Turn } from '../conversation';
import { executeTask, saveTask, type ExecuteDeps } from '../execute';
import type { PlanData } from '../plan';
import { markAssistantOff, noteBalance, refreshAssistantWallet } from '../useAssistant';
import { newId } from './parts';

type DraftCard = Extract<CardModel, { kind: 'draft' }>;

/** Devanagari letters in the sentence (U+0900 to U+097F). PURE. */
export function hasDevanagari(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    if (c >= 0x0900 && c <= 0x097f) return true;
  }
  return false;
}

/** The worker switched the assistant off, or refuses this gym: hide everything. */
function hideIfOff(f: AssistFail): void {
  if ((f.status === 503 && f.reason === 'off') || (f.status === 403 && f.reason === 'demo')) markAssistantOff();
}

export interface Conversation {
  turns: Turn[];
  ask: (text: string, spoken: boolean) => Promise<void>;
  confirm: (turnId: string, card: DraftCard) => Promise<void>;
  rewrite: (turnId: string, card: DraftCard, how: string) => Promise<void>;
}

export function useConversation(key: string, data: PlanData, reload: () => Promise<void>, openCredits: () => void): Conversation {
  const turns = useTurns(key);
  const store = useCrm();
  const { session } = useAuth();

  const deps = useMemo<ExecuteDeps>(
    () => ({
      writer: {
        createMember: (d) => store.createMember(d),
        sellMembership: (i) => store.sellMembership(i),
        recordPayment: (i) => store.recordPayment(i),
        // The store's extend and expense saves return nothing; the step only needs to know it saved.
        extendMembership: async (id, days, reason) => {
          await store.extendMembership(id, days, reason);
          return { id };
        },
        createEnquiry: (d) => store.createEnquiry(d),
        addExpense: async (d) => {
          await store.addExpense(d);
          return { id: 'saved' };
        },
        saveWorkoutPlan: (d) => store.saveWorkoutPlan(d),
      },
      rpc: shopApi.call,
      sendMessage: shopApi.sendMessage,
      saveDiet,
      // The card itself offers the WhatsApp list after sending (Cards.tsx DoneView): nothing pops up by itself.
      queueWhatsApp: () => undefined,
      key,
      taker: takerOf(session),
    }),
    [store, key, session],
  );

  const ask = useCallback(
    async (text: string, spoken: boolean) => {
      const request = text.trim().slice(0, 600);
      if (!request) return;
      const id = newId();
      addTurn(key, { id, request, spoken, status: 'asking', cards: [], note: '', fail: null });
      const lang: 'en' | 'hi' = hasDevanagari(request) || getLang() === 'hinglish' ? 'hi' : 'en';
      const ctx = buildAssistContext(data.snapshot, data.today, data.gymLang);
      const r = await askAssistant(key, { text: request, spoken, lang, ctx });
      if (!r.ok) {
        hideIfOff(r);
        updateTurn(id, (t) => ({ ...t, status: 'failed', fail: r.words }));
        return;
      }
      const cards = cardsFor(r.actions, data, newId);
      updateTurn(id, (t) => ({
        ...t,
        status: 'done',
        cards,
        note: r.note,
        fail: cards.length === 0 ? line('The AI Assistant did not understand. Say it another way.') : null,
      }));
      // Each draft is its own task, saved now (free) so History keeps it and the spend can find it.
      for (const c of cards) {
        if (c.kind === 'draft' && c.result.kind === 'draft') {
          void saveTask(deps, { id: c.taskId, request, spoken, actions: [c.action] });
        }
      }
    },
    [key, data, deps],
  );

  const confirm = useCallback(
    async (turnId: string, card: DraftCard) => {
      if (card.result.kind !== 'draft' || card.status === 'saving') return;
      const turn = turns.find((t) => t.id === turnId);
      const draft = card.result.draft;
      updateCard(turnId, card.id, (c) => (c.kind === 'draft' ? { ...c, status: 'saving', outcome: null } : c));
      // Saved again with the drafts as he left them (a changed amount, a picked member).
      await saveTask(deps, { id: card.taskId, request: turn?.request ?? '', spoken: turn?.spoken ?? false, actions: [card.action] });
      try {
        const r = await executeTask({ id: card.taskId, drafts: [draft] }, data, deps);
        if (r.ok) {
          noteBalance(r.balance);
          void refreshAssistantWallet(key);
          void reload();
          updateCard(turnId, card.id, (c) => (c.kind === 'draft' ? { ...c, status: 'done', steps: r.steps, outcome: r.steps[0]?.words ?? line('Done.') } : c));
          return;
        }
        if (r.reason === 'already') {
          updateCard(turnId, card.id, (c) => (c.kind === 'draft' ? { ...c, status: 'done', steps: r.steps, outcome: r.words } : c));
          return;
        }
        if (r.reason === 'failed') {
          // Something did not save. A new task id, so trying again is a new charge only if the credits came back.
          void refreshAssistantWallet(key);
          const words = r.refunded ? line('{words} Your credit was given back.', { words: t(r.words.text, r.words.vars) }) : r.words;
          updateCard(turnId, card.id, (c) => (c.kind === 'draft' ? { ...c, status: 'open', steps: r.steps, outcome: words, taskId: r.refunded ? newId() : c.taskId } : c));
          return;
        }
        updateCard(turnId, card.id, (c) => (c.kind === 'draft' ? { ...c, status: 'open', outcome: r.words } : c));
        if (r.reason === 'no_credits') {
          void refreshAssistantWallet(key);
          openCredits();
        }
      } catch (err) {
        console.warn('[assistant] the task did not run', card.taskId, err);
        updateCard(turnId, card.id, (c) => (c.kind === 'draft' ? { ...c, status: 'open', outcome: line('That did not work. Check the internet and try again.') } : c));
      }
    },
    [turns, data, deps, key, reload, openCredits],
  );

  const rewrite = useCallback(
    async (turnId: string, card: DraftCard, how: string) => {
      const msg = card.message;
      if (!msg || msg.rewrites >= 5) return;
      updateCard(turnId, card.id, (c) => (c.kind === 'draft' ? { ...c, status: 'saving', outcome: null } : c));
      const r = await rewriteMessage(key, msg.words, how);
      if (!r.ok) {
        hideIfOff(r);
        updateCard(turnId, card.id, (c) => (c.kind === 'draft' ? { ...c, status: 'open', outcome: r.words } : c));
        return;
      }
      const words = { title_en: r.title_en, body_en: r.body_en, title_hi: r.title_hi, body_hi: r.body_hi };
      // "Add Hindi": the card shows both languages once the Hindi words are there.
      const lang = msg.lang === 'en' && words.body_hi.trim() && how.includes('Hindi') ? 'both' : msg.lang;
      updateCard(turnId, card.id, (c) =>
        c.kind === 'draft' ? { ...withMessage(c, { words, lang, edited: false, rewrites: msg.rewrites + 1 }, data), status: 'open', outcome: null } : c,
      );
    },
    [key, data],
  );

  return { turns, ask, confirm, rewrite };
}
