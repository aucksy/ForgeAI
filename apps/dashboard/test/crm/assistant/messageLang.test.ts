// R-501 (owner, 14 Nov 2026): he tapped "write a Chhath Puja greeting", the AI wrote English, he picked "Both", the
// words did not change and the message went out in English only. Hindi or Both now writes the Hindi words first (the
// "Add Hindi" rewrite), the chip moves only when they come, and the card never says a language its preview does not show.
import { describe, expect, it } from 'vitest';

import type { Action, ToolInputs } from '../../../src/crm/assistant/catalogue';
import {
  ADD_HINDI_HOW,
  LANG_WORDS,
  MAX_REWRITES,
  afterRewrite,
  cardsFor,
  langNote,
  pickLang,
  shownLang,
  withMessage,
  type CardModel,
} from '../../../src/crm/assistant/conversation';
import { planData } from './gym';

type DraftCard = Extract<CardModel, { kind: 'draft' }>;

const greeting = (over: Partial<ToolInputs['draft_message']> = {}): Action => ({
  tool: 'draft_message',
  input: {
    audience: { group: 'everyone', days: 0, plan: '', batch: '', trainer: '', names: [] },
    kind: 'announcement',
    lang: 'en',
    title_en: 'Happy Chhath Puja',
    body_en: 'Wishing you and your family a happy Chhath Puja. The gym is open as usual.',
    title_hi: '',
    body_hi: '',
    send_at: '',
    offer: '',
    ...over,
  },
});

const HINDI = { title_hi: 'छठ पूजा की शुभकामनाएं', body_hi: 'आपको और आपके परिवार को छठ पूजा की शुभकामनाएं। जिम रोज़ की तरह खुला है।' };

function cardOf(action: Action, gymLang: 'en' | 'hi' | 'both' = 'en'): DraftCard {
  let n = 0;
  const [card] = cardsFor([action], planData({ gymLang }), () => `id-${(n += 1)}`);
  if (!card || card.kind !== 'draft' || card.result.kind !== 'draft') throw new Error('no message card');
  return card;
}

const draftOf = (c: DraftCard) => {
  if (c.result.kind !== 'draft' || c.result.draft.tool !== 'draft_message') throw new Error('not a message');
  return c.result.draft;
};
const shown = (c: DraftCard) => ({ title: draftOf(c).title, body: draftOf(c).body });

describe('Hindi or Both on a message the AI wrote in English', () => {
  it('Both asks the AI for the Hindi words first (the "Add Hindi" rewrite); the chip waits on English', () => {
    const card = cardOf(greeting());
    const p = pickLang(card, 'both', shown(card));
    expect(p).toEqual({ kind: 'write', lang: 'both', how: ADD_HINDI_HOW, words: card.message!.words });
    // Nothing on the card changed yet: still English, still the English words.
    expect(card.message!.lang).toBe('en');
    expect(langNote(card)).toBe(LANG_WORDS.free);
  });

  it('when the Hindi comes, Both shows English and Hindi, and that is what Send sends', () => {
    const card = cardOf(greeting());
    const p = pickLang(card, 'both', shown(card));
    if (p?.kind !== 'write') throw new Error('expected a write');
    const { next, outcome } = afterRewrite(card.message!, { ...p.words, ...HINDI }, p.how, p.lang);
    expect(outcome).toBeNull();
    const after = withMessage(card, next, planData());
    expect(after.message!.lang).toBe('both');
    expect(after.message!.rewrites).toBe(1);
    expect(draftOf(after).body).toContain('Wishing you and your family');
    expect(draftOf(after).body).toContain(HINDI.body_hi);
    expect(langNote(after)).toBeNull();
  });

  it('Hindi: the Hindi words only, once they are written', () => {
    const card = cardOf(greeting());
    const p = pickLang(card, 'hi', shown(card));
    expect(p?.kind).toBe('write');
    if (p?.kind !== 'write') return;
    expect(p.lang).toBe('hi');
    const after = withMessage(card, afterRewrite(card.message!, { ...p.words, ...HINDI }, p.how, 'hi').next, planData());
    expect(after.message!.lang).toBe('hi');
    expect(draftOf(after)).toMatchObject({ title: HINDI.title_hi, body: HINDI.body_hi });
  });

  it('an answer with no Hindi in it: the chip stays on English and the card says so', () => {
    const card = cardOf(greeting());
    const { next, outcome } = afterRewrite(card.message!, card.message!.words, ADD_HINDI_HOW, 'both');
    expect(next.lang).toBe('en');
    expect(outcome?.text).toBe(LANG_WORDS.failed);
    expect(draftOf(withMessage(card, next, planData())).body).not.toMatch(/[ऀ-ॿ]/);
  });

  it('his own edits are what the Hindi is written from', () => {
    const card = { ...cardOf(greeting()), message: { ...cardOf(greeting()).message!, edited: true } };
    const p = pickLang(card, 'both', { title: 'Chhath wishes', body: 'Happy Chhath from all of us. Open 6 am to 10 pm.' });
    expect(p).toMatchObject({ kind: 'write', words: { title_en: 'Chhath wishes', body_en: 'Happy Chhath from all of us. Open 6 am to 10 pm.', title_hi: '', body_hi: '' } });
  });

  it('after 5 rewrites nothing changes, and the card says why', () => {
    const base = cardOf(greeting());
    const card: DraftCard = { ...base, message: { ...base.message!, rewrites: MAX_REWRITES } };
    expect(pickLang(card, 'both', shown(card))).toEqual({ kind: 'cap' });
    expect(pickLang(card, 'hi', shown(card))).toEqual({ kind: 'cap' });
    expect(langNote(card)).toBe(LANG_WORDS.cap);
    // English is still fine.
    expect(pickLang(card, 'en', shown(card))?.kind).toBe('switch');
  });

  it('while the Hindi is written (or a send runs), another tap waits', () => {
    const base = cardOf(greeting());
    const card: DraftCard = { ...base, status: 'saving', message: { ...base.message!, writing: 'both' } };
    expect(pickLang(card, 'both', shown(card))).toEqual({ kind: 'busy' });
    expect(langNote(card)).toBe(LANG_WORDS.writing);
  });

  it('a gym that sends in Both, and an AI message with no Hindi: the chip starts on English, as the preview does', () => {
    const card = cardOf(greeting({ lang: 'gym' }), 'both');
    expect(card.message!.lang).toBe('en');
    expect(draftOf(card).body).toBe(greeting().input.body_en);
    // And a language switch can never put Hindi or Both on English-only words.
    expect(withMessage(card, { ...card.message!, lang: 'both' }, planData()).message!.lang).toBe('en');
    expect(shownLang('hi', card.message!.words)).toBe('en');
  });
});

describe('a message that already has its Hindi words (as before)', () => {
  it('Both and Hindi switch at once, with no rewrite', () => {
    const card = cardOf(greeting(HINDI));
    const both = pickLang(card, 'both', shown(card));
    expect(both?.kind).toBe('switch');
    if (both?.kind !== 'switch') return;
    const after = withMessage(card, both.next, planData());
    expect(after.message!.lang).toBe('both');
    expect(after.message!.rewrites).toBe(0);
    expect(draftOf(after).body).toBe(`${greeting().input.body_en}\n\n${HINDI.body_hi}`);
    const hi = pickLang(after, 'hi', shown(after));
    if (hi?.kind !== 'switch') throw new Error('expected a switch');
    expect(draftOf(withMessage(after, hi.next, planData())).body).toBe(HINDI.body_hi);
    expect(langNote(card)).toBeNull();
  });

  it('"Shorter" on a Both message keeps Both when the Hindi stays, and drops to English when it does not', () => {
    const msg = { ...cardOf(greeting(HINDI)).message!, lang: 'both' as const };
    expect(afterRewrite(msg, { ...greeting().input, ...HINDI }, 'Make it shorter').next.lang).toBe('both');
    expect(afterRewrite(msg, { ...greeting().input }, 'Make it shorter').next.lang).toBe('en');
  });
});
