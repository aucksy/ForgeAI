/**
 * F201: the conversation on the Assistant screen. One owner request (typed or spoken) is one TURN; the AI's
 * actions become its CARDS (03-design §6): an answer, a message to send, a change to save, a question back,
 * the page to open, or "I can't do that".
 *
 * R-471 (12 Nov 2026): ONE CARD = ONE TASK = ONE CHARGE. Every message or change card carries its own task id,
 * its own button and its own price, and is saved and paid for alone, so a refund never undoes another card.
 * R-471 too: a workout plan costs 3 credits only because the AI WRITES it for that member. A plan request shows the
 * plan writer card (goal, level, days a week, "Write the plan"); the written plan opens in the Workout plans builder
 * and is saved, and paid for, from there. A template is never sold as AI. Diet plans are not written yet: that card
 * says so and opens Diet plans, with no price.
 *
 * The cards are worked out here (PURE); the turns are kept in memory per panel key, so the side panel on a
 * computer and the full screen show the same conversation. History (past tasks) comes from the server.
 */
import { useSyncExternalStore } from 'react';

import { answerAction, isAskTool, pickMember, type AnswerResult, type AnswerRow } from './answer';
import { line, pageById, pagePath, type Action, type Line } from './catalogue';
import type { MessageWords } from './api';
import { planAskFrom, type PlanAsk } from './planWriter';
import type { WorkoutPlanDraft } from '../types';
import { isDraftTool, messageWords, planAction, type Draft, type PlanData, type PlanResult } from './plan';
import type { StepResult } from './execute';

export type CardStatus = 'open' | 'saving' | 'done' | 'failed' | 'cancelled';

/** A message card's words and language, so the language switch and the rewrite chips can redo the draft. */
export interface MessageState {
  words: MessageWords;
  lang: 'en' | 'hi' | 'both';
  /** He changed the words by hand: a language switch asks before throwing them away. */
  edited: boolean;
  /** Rewrites asked for this card (5 at most, 03-design §2 B). */
  rewrites: number;
}

export type CardModel =
  | { kind: 'answer'; id: string; action: Action; result: AnswerResult }
  | {
      kind: 'draft';
      id: string;
      action: Action;
      /** This card's own task (owner_ai_task_save / owner_ai_spend). */
      taskId: string;
      requestId: string;
      result: PlanResult;
      status: CardStatus;
      /** What happened after Send or Save. */
      outcome: Line | null;
      steps: StepResult[];
      message: MessageState | null;
    }
  | { kind: 'ask_back'; id: string; question: string; options: string[] }
  | { kind: 'open_page'; id: string; why: string; steps: string[]; path: string | null; name: string }
  | { kind: 'cannot'; id: string; reason: string }
  | { kind: 'plan_writer'; id: string; what: 'diet' }
  | WorkoutWriterCard
  | { kind: 'help'; id: string; question: string };

/** Where the plan writer card is: choices -> writing -> written (the builder) -> saving -> saved. */
export type WriterStatus = 'open' | 'writing' | 'written' | 'saving' | 'done';

/** The AI plan writer's card (R-471): one plan = one task = 3 credits, paid only when the owner saves it. */
export interface WorkoutWriterCard {
  kind: 'plan_writer';
  id: string;
  what: 'workout';
  /** The AI's draft_workout_plan request: saved with the task (owner_ai_task_save). */
  action: Action;
  ask: PlanAsk;
  /** The member it is for: the name the AI heard, the member picked ('' = none), and the choice when two match. */
  memberTyped: string;
  memberId: string;
  options: AnswerRow[];
  taskId: string;
  requestId: string;
  status: WriterStatus;
  /** The written plan, as the owner left it in the builder. */
  plan: WorkoutPlanDraft | null;
  /** The writer's one line about the plan. */
  summary: string;
  /** The builder is open. */
  editing: boolean;
  /** What happened last (a refusal, "saved"). */
  outcome: Line | null;
  /** Set once saved: where to see it. */
  path: string | null;
}

/** The plan writer card for a draft_workout_plan request: the member found by name when exactly one matches. PURE. */
export function writerCard(action: Extract<Action, { tool: 'draft_workout_plan' }>, d: PlanData, newId: () => string, id = newId()): WorkoutWriterCard {
  const typed = (action.input?.member ?? '').trim();
  const picked = typed ? pickMember(typed, d.views) : null;
  return {
    kind: 'plan_writer',
    id,
    what: 'workout',
    action,
    ask: planAskFrom(action.input),
    memberTyped: typed,
    memberId: picked?.kind === 'one' ? picked.view.member.id : '',
    options: picked?.kind === 'choose' ? picked.options : [],
    taskId: newId(),
    requestId: newId(),
    status: 'open',
    plan: null,
    summary: '',
    editing: false,
    outcome: null,
    path: null,
  };
}

export interface Turn {
  id: string;
  request: string;
  spoken: boolean;
  status: 'asking' | 'done' | 'failed';
  cards: CardModel[];
  /** The AI's own short note, when it sent one. */
  note: string;
  /** Why it failed (no internet, the daily limit ...). */
  fail: Line | null;
  /** R-488: the fail line is a calm notice (the day's free questions are used up), not an error. */
  notice?: boolean;
}

/** The language a message card starts in: what the AI chose, or the gym's own. */
function startLang(a: Extract<Action, { tool: 'draft_message' }>, d: PlanData): 'en' | 'hi' | 'both' {
  const l = a.input.lang === 'gym' ? d.gymLang : a.input.lang;
  return l === 'hi' || l === 'both' ? l : 'en';
}

/**
 * The cards for one answer of the AI, in its order. `newId` makes ids (crypto.randomUUID in the panel). PURE.
 * R-485: one answer per how-to. When the AI also shows where to do it (open_page, with its steps and button),
 * the "Help and feedback answers it" card is dropped: the owner saw two buttons for one question.
 */
export function cardsFor(actions: readonly Action[], d: PlanData, newId: () => string): CardModel[] {
  const cards = cardsOf(actions, d, newId);
  return cards.some((c) => c.kind === 'open_page') ? cards.filter((c) => c.kind !== 'help') : cards;
}

function cardsOf(actions: readonly Action[], d: PlanData, newId: () => string): CardModel[] {
  const cards: CardModel[] = [];
  for (const action of actions) {
    const id = newId();
    if (isAskTool(action.tool)) {
      const result = answerAction(action, d);
      if (!result) continue;
      cards.push(result.kind === 'help' ? { kind: 'help', id, question: result.question } : { kind: 'answer', id, action, result });
      continue;
    }
    switch (action.tool) {
      case 'draft_workout_plan':
        cards.push(writerCard(action, d, newId, id));
        continue;
      case 'draft_diet_plan':
        cards.push({ kind: 'plan_writer', id, what: 'diet' });
        continue;
      case 'ask_back':
        cards.push({ kind: 'ask_back', id, question: action.input.question, options: action.input.options.filter((o) => o.trim()).slice(0, 6) });
        continue;
      case 'open_page': {
        const page = pageById(action.input.page);
        const path = page ? pagePath(page.id) : null;
        cards.push({ kind: 'open_page', id, why: action.input.why, steps: action.input.steps.filter((s) => s.trim()).slice(0, 6), path, name: page?.name ?? '' });
        continue;
      }
      case 'cannot_do':
        cards.push({ kind: 'cannot', id, reason: action.input.reason });
        continue;
      default:
        break;
    }
    if (!isDraftTool(action.tool)) continue;
    const requestId = newId();
    const result = planAction(action, d, requestId);
    if (!result) continue;
    const message: MessageState | null =
      action.tool === 'draft_message'
        ? {
            words: { title_en: action.input.title_en, body_en: action.input.body_en, title_hi: action.input.title_hi, body_hi: action.input.body_hi },
            lang: startLang(action, d),
            edited: false,
            rewrites: 0,
          }
        : null;
    cards.push({ kind: 'draft', id, action, taskId: newId(), requestId, result, status: 'open', outcome: null, steps: [], message });
  }
  return cards;
}

/** A member picked on a card ("Which Rahul?"): the same action again, for that member. PURE. */
export function chooseOnCard(card: CardModel, chosenId: string, d: PlanData): CardModel {
  if (card.kind === 'answer') {
    const result = answerAction(card.action, d, chosenId);
    return result && result.kind !== 'help' ? { ...card, result } : card;
  }
  if (card.kind === 'draft') {
    const result = planAction(card.action, d, card.requestId, chosenId);
    return result ? { ...card, result } : card;
  }
  if (card.kind === 'plan_writer' && card.what === 'workout') {
    const v = d.views.find((x) => x.member.id === chosenId);
    return v ? { ...card, memberId: v.member.id, options: [] } : card;
  }
  return card;
}

/** A message card in another language, or with new words: the draft's title and body made again. PURE. */
export function withMessage(card: Extract<CardModel, { kind: 'draft' }>, next: MessageState, d: PlanData): Extract<CardModel, { kind: 'draft' }> {
  if (card.action.tool !== 'draft_message' || card.result.kind !== 'draft' || card.result.draft.tool !== 'draft_message') return card;
  const { title, body } = messageWords({ ...card.action.input, ...next.words, lang: next.lang }, d.gymLang);
  return { ...card, message: next, result: { kind: 'draft', draft: { ...card.result.draft, title, body } } };
}

/** A draft changed by hand on its card. PURE. */
export function withDraft(card: Extract<CardModel, { kind: 'draft' }>, draft: Draft): Extract<CardModel, { kind: 'draft' }> {
  return { ...card, result: { kind: 'draft', draft } };
}

/** A card's main button: what it does, and its price (R-471: each card shows its own price). */
export interface ConfirmWords {
  action: Line;
  /** Null: no price on it ("Ask MettleUp for credits": buying in the panel is not built). */
  credits: number | null;
  /** Not enough credits: the button opens the packs instead. */
  needCredits: boolean;
}

/** The words on a card's main button. `appCount`: members a message reaches in the app (null = not known). PURE. */
export function confirmWords(draft: Draft, appCount: number | null, balance: number | null): ConfirmWords {
  if (balance !== null && balance < draft.credits) return { action: line('Ask MettleUp for credits'), credits: null, needCredits: true };
  const action =
    draft.tool === 'draft_message'
      ? appCount === null
        ? line(draft.sendAt ? 'Schedule the message' : 'Send the message')
        : appCount === 1
          ? line(draft.sendAt ? 'Schedule for 1 member' : 'Send to 1 member')
          : line(draft.sendAt ? 'Schedule for {n} members' : 'Send to {n} members', { n: appCount })
      : line(SAVE_WORDS[draft.tool]);
  return { action, credits: draft.credits, needCredits: false };
}

export const SAVE_WORDS: Record<Exclude<Draft['tool'], 'draft_message'>, string> = {
  add_member: 'Add member',
  renew: 'Save renewal',
  record_payment: 'Save payment',
  extend: 'Extend plan',
  add_enquiry: 'Save enquiry',
  add_expense: 'Save expense',
  draft_workout_plan: 'Save workout plan',
  draft_diet_plan: 'Save diet plan',
};

/** The title on a change or message card. */
export const CARD_TITLE: Record<Draft['tool'], string> = {
  draft_message: 'Message to your members',
  add_member: 'Add a new member',
  renew: 'Renew a plan',
  record_payment: 'Record a payment',
  extend: 'Extend a plan',
  add_enquiry: 'Save an enquiry',
  add_expense: 'Save an expense',
  draft_workout_plan: 'Workout plan',
  draft_diet_plan: 'Diet plan',
};

// ------------------------------------------------------------------ the turns, kept in memory per panel

let turnsKey: string | null = null;
let turns: Turn[] = [];
const listeners = new Set<() => void>();

function emit(): void {
  for (const fn of [...listeners]) fn();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** This panel's turns, oldest first. */
export function useTurns(key: string | null): Turn[] {
  const list = useSyncExternalStore(subscribe, () => turns, () => turns);
  return key !== null && turnsKey === key ? list : EMPTY;
}
const EMPTY: Turn[] = [];

export function addTurn(key: string, turn: Turn): void {
  if (turnsKey !== key) {
    turnsKey = key;
    turns = [];
  }
  // A long conversation keeps the latest 30 turns (the history keeps every task on the server).
  turns = [...turns, turn].slice(-30);
  emit();
}

export function updateTurn(id: string, change: (t: Turn) => Turn): void {
  turns = turns.map((t) => (t.id === id ? change(t) : t));
  emit();
}

export function updateCard(turnId: string, cardId: string, change: (c: CardModel) => CardModel): void {
  updateTurn(turnId, (t) => ({ ...t, cards: t.cards.map((c) => (c.id === cardId ? change(c) : c)) }));
}

/** Start again (the "New chat" button). */
export function clearTurns(): void {
  turns = [];
  emit();
}
