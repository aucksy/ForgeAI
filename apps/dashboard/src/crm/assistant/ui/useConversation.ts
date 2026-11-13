/**
 * F201: what the Assistant screen DOES: ask the AI, show its cards, rewrite a message, and send or save one card
 * (its own task, its own charge, R-471). The side panel on a computer and the full screen on a phone share it.
 *
 * Money and records are touched ONLY in `confirm`, which runs from a card's own button, and in `savePlan`, which runs
 * from the Workout plans builder's Save on a plan the AI wrote (R-471): the task is saved again (free), then
 * executeTask spends the card's credits and does the one thing (assistant/execute.ts), giving them back if it fails.
 * Writing a plan (`writePlan`) is free, like asking.
 */
import { useCallback, useMemo } from 'react';

import { useAuth } from '../../auth/AuthProvider';
import { takerOf } from '../../auth/permissions';
import { getLang, t } from '../../lang/lang';
import * as shopApi from '../../shop/api';
import { saveDiet } from '../../shop/bodyApi';
import { useCrm } from '../../store';
import { noteFull, noteLeft } from '../allowance';
import { askAssistant, rewriteMessage, writePlan as askForPlan, type AssistFail } from '../api';
import { line } from '../catalogue';
import { buildAssistContext } from '../context';
import { addTurn, cardsFor, updateCard, updateTurn, useTurns, withMessage, type CardModel, type Turn, type WorkoutWriterCard } from '../conversation';
import { executeTask, saveTask, type ExecuteDeps } from '../execute';
import { aiPlanDraft, type PlanData } from '../plan';
import { gymExerciseList, planLang, planRequestBody, writtenPlan } from '../planWriter';
import type { WorkoutPlanDraft } from '../../types';
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
  /** The AI writes the plan (free); it opens in the builder. */
  writePlan: (turnId: string, card: WorkoutWriterCard) => Promise<void>;
  /** Save the plan as he left it in the builder: 3 credits, given back if the save fails. Null = saved; else why not. */
  savePlan: (turnId: string, card: WorkoutWriterCard, plan: WorkoutPlanDraft) => Promise<string | null>;
}

const isWriter = (c: CardModel): c is WorkoutWriterCard => c.kind === 'plan_writer' && c.what === 'workout';

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
        const full = r.reason === 'limit';
        if (full) noteFull(data.today);
        updateTurn(id, (t) => ({ ...t, status: 'failed', fail: r.words, notice: full }));
        return;
      }
      noteLeft(data.today, r.left);
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
      if (r.ok) noteLeft(data.today, r.left);
      else if (r.reason === 'limit') noteFull(data.today);
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

  const writePlan = useCallback(
    async (turnId: string, card: WorkoutWriterCard) => {
      if (card.status === 'writing' || card.status === 'saving' || card.status === 'done') return;
      updateCard(turnId, card.id, (c) => (isWriter(c) ? { ...c, status: 'writing', outcome: null } : c));
      const body = planRequestBody(card.ask, gymExerciseList(data.snapshot.workoutPlans), planLang(data.gymLang));
      const r = await askForPlan(key, body);
      if (r.ok) noteLeft(data.today, r.left);
      else if (r.reason === 'limit') noteFull(data.today);
      if (!r.ok) {
        hideIfOff(r);
        updateCard(turnId, card.id, (c) => (isWriter(c) ? { ...c, status: c.plan ? 'written' : 'open', outcome: r.words } : c));
        return;
      }
      const view = card.memberId ? data.allViews.find((v) => v.member.id === card.memberId) : undefined;
      const plan = writtenPlan(r.plan, view ? { id: view.member.id, name: view.member.fullName } : null);
      if (!plan) {
        console.warn('[assistant] the written plan did not pass the builder check', card.taskId);
        updateCard(turnId, card.id, (c) => (isWriter(c) ? { ...c, status: c.plan ? 'written' : 'open', outcome: line('The AI wrote a plan that could not be used. Try again.') } : c));
        return;
      }
      updateCard(turnId, card.id, (c) => (isWriter(c) ? { ...c, status: 'written', plan, summary: r.summary, editing: true, outcome: null } : c));
      // The task is saved now (free) so History keeps it; the 3 credits are spent only on Save.
      const turn = turns.find((t) => t.id === turnId);
      void saveTask(deps, { id: card.taskId, request: turn?.request ?? '', spoken: turn?.spoken ?? false, actions: [card.action] });
    },
    [key, data, deps, turns],
  );

  const savePlan = useCallback(
    async (turnId: string, card: WorkoutWriterCard, plan: WorkoutPlanDraft): Promise<string | null> => {
      const memberId = plan.assign.memberIds.length === 1 ? plan.assign.memberIds[0] : '';
      updateCard(turnId, card.id, (c) => (isWriter(c) ? { ...c, status: 'saving', plan, outcome: null } : c));
      const turn = turns.find((t) => t.id === turnId);
      await saveTask(deps, { id: card.taskId, request: turn?.request ?? '', spoken: turn?.spoken ?? false, actions: [card.action] });
      const back = (outcome: ReturnType<typeof line>, taskId = card.taskId) =>
        updateCard(turnId, card.id, (c) => (isWriter(c) ? { ...c, status: 'written', outcome, taskId } : c));
      try {
        const r = await executeTask({ id: card.taskId, drafts: [aiPlanDraft(plan, memberId, card.requestId)] }, data, deps);
        if (r.ok || r.reason === 'already') {
          if (r.ok) noteBalance(r.balance);
          void refreshAssistantWallet(key);
          const words = r.ok ? (r.steps[0]?.words ?? line('Done.')) : r.words;
          updateCard(turnId, card.id, (c) => (isWriter(c) ? { ...c, status: 'done', editing: false, outcome: words, path: '/workouts' } : c));
          return null;
        }
        if (r.reason === 'failed') {
          void refreshAssistantWallet(key);
          const words = r.refunded ? line('{words} Your credits were given back.', { words: t(r.words.text, r.words.vars) }) : r.words;
          // A new task id once the credits came back: the server allows one spend a task.
          back(words, r.refunded ? newId() : card.taskId);
          return t(words.text, words.vars);
        }
        back(r.words);
        if (r.reason === 'no_credits') {
          void refreshAssistantWallet(key);
          updateCard(turnId, card.id, (c) => (isWriter(c) ? { ...c, editing: false } : c));
          openCredits();
        }
        return t(r.words.text, r.words.vars);
      } catch (err) {
        console.warn('[assistant] the plan did not save', card.taskId, err);
        const words = line('That did not work. Check the internet and try again.');
        back(words);
        return t(words.text);
      }
    },
    [turns, data, deps, key, openCredits],
  );

  return { turns, ask, confirm, rewrite, writePlan, savePlan };
}
