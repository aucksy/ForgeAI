// R-514 (owner, 14 Nov 2026): he said in Hindi "kal gym band rahega, sab members ko message bhejo". The AI wrote "the
// gym will be closed" with no day in it, and the card's send time read like tomorrow. Now a "Gym closed" or "Timing
// change" message always names its day with the date in each language; with no day the card asks for it and Send waits;
// the day never becomes the send time; and the button says when the message goes.
import { describe, expect, it } from 'vitest';

import type { Action, ToolInputs } from '../../../src/crm/assistant/catalogue';
import { cardsFor, confirmWords, withDraft, type CardModel } from '../../../src/crm/assistant/conversation';
import { canConfirm, checkDraft, dayLine, swapDay, withDayLine, type MessageDraftA } from '../../../src/crm/assistant/plan';
import { TODAY, planData } from './gym';

type DraftCard = Extract<CardModel, { kind: 'draft' }>;

// TODAY is Thursday 12 Nov 2026: "kal" is Friday 13 Nov.
const HI_BODY = 'कृपया ध्यान दें कि जिम बंद रहेगा।';
const closed = (over: Partial<ToolInputs['draft_message']> & { day?: string } = {}): Action => ({
  tool: 'draft_message',
  input: {
    audience: { group: 'everyone', days: 0, plan: '', batch: '', trainer: '', names: [] },
    kind: 'closed',
    lang: 'hi',
    title_en: 'Gym closed',
    body_en: 'Please note the gym will be closed.',
    title_hi: 'जिम बंद',
    body_hi: HI_BODY,
    send_at: '',
    offer: '',
    ...over,
  } as ToolInputs['draft_message'],
});

function draftOf(action: Action): { card: DraftCard; dr: MessageDraftA } {
  let n = 0;
  const [card] = cardsFor([action], planData(), () => `id-${(n += 1)}`);
  if (!card || card.kind !== 'draft' || card.result.kind !== 'draft' || card.result.draft.tool !== 'draft_message') throw new Error('no message card');
  return { card, dr: card.result.draft };
}

describe('a closure message names its day', () => {
  it('(a) a day given: the day with its date in the Hindi words, and it sends now', () => {
    const { dr } = draftOf(closed({ day: '2026-11-13' }));
    expect(dr.day).toBe('2026-11-13');
    expect(dr.body).toBe(`जिम बंद: कल, शुक्रवार 13 नवंबर।\n${HI_BODY}`);
    expect(dr.sendAt).toBe('');
    expect(canConfirm(dr, planData())).toBe(true);
  });

  it('(a) the same in English, and in both languages', () => {
    expect(draftOf(closed({ day: '2026-11-13', lang: 'en' })).dr.body).toBe('Gym closed: Tomorrow, Friday 13 Nov.\nPlease note the gym will be closed.');
    expect(draftOf(closed({ day: '2026-11-13', lang: 'both' })).dr.body).toBe(
      `Gym closed: Tomorrow, Friday 13 Nov.\nPlease note the gym will be closed.\n\nजिम बंद: कल, शुक्रवार 13 नवंबर।\n${HI_BODY}`,
    );
    // Today, and a later day (no "Tomorrow"); a timing change says so.
    expect(dayLine('closed', TODAY, TODAY, 'en')).toBe('Gym closed: Today, Thursday 12 Nov.');
    expect(dayLine('closed', '2026-11-15', TODAY, 'hi')).toBe('जिम बंद: रविवार 15 नवंबर।');
    expect(dayLine('timing', '2026-11-13', TODAY, 'en')).toBe('Timing change: Tomorrow, Friday 13 Nov.');
    expect(dayLine('announcement', '2026-11-13', TODAY, 'en')).toBeNull();
  });

  it('words that already name the date get no second line', () => {
    const body = 'The gym is closed on Sunday 15 Nov for Chhath Puja.';
    expect(withDayLine(body, 'closed', '2026-11-15', TODAY, 'en')).toBe(body);
  });

  it('(b) no day: the card asks for it and Send stays off', () => {
    const { dr } = draftOf(closed({ day: '' }));
    expect(dr.day).toBe('');
    expect(dr.body).toBe(HI_BODY);
    const { problems } = checkDraft(dr, planData());
    expect(problems.filter((p) => p.field === 'day').map((p) => p.message.text)).toEqual(['Pick the day the gym is closed.']);
    expect(canConfirm(dr, planData())).toBe(false);
    // He picks Friday: Send works.
    expect(canConfirm({ ...dr, day: '2026-11-13' }, planData())).toBe(true);
    // A day gone by is refused.
    expect(checkDraft({ ...dr, day: '2026-11-10' }, planData()).problems.map((p) => p.message.text)).toContain('This day has passed. Pick today or a later day.');
  });

  it('(c) "send it tomorrow at 8": Later, at that time; the closed day stays the closed day', () => {
    const { dr, card } = draftOf(closed({ day: '2026-11-14', send_at: '2026-11-13T08:00' }));
    expect(dr.sendAt).toBe('2026-11-13T08:00');
    expect(dr.day).toBe('2026-11-14');
    expect(canConfirm(dr, planData())).toBe(true);
    expect(confirmWords(dr, 1, 20).action).toEqual({ text: 'Send on {when} to 1 member', vars: { when: '13 Nov, 8:00 am' } });
    // A send time after the closed day is refused (it would reach members too late).
    const late = withDraft(card, { ...dr, sendAt: '2026-11-15T08:00' });
    if (late.result.kind !== 'draft') throw new Error('no draft');
    expect(checkDraft(late.result.draft, planData()).problems.map((p) => p.message.text)).toContain('This would reach members after that day. Pick an earlier time, or Now.');
  });

  it('an older server with no day field: a date it put in send_at is the closed day, and the message sends now', () => {
    const old = closed();
    (old.input as Record<string, unknown>).send_at = '2026-11-13T08:00';
    delete (old.input as Record<string, unknown>).day;
    const { dr } = draftOf(old);
    expect(dr.day).toBe('2026-11-13');
    expect(dr.sendAt).toBe('');
  });

  it('(d) the button says when it goes', () => {
    const { dr } = draftOf(closed({ day: '2026-11-13' }));
    expect(confirmWords(dr, 1, 20)).toEqual({ action: { text: 'Send now to 1 member' }, credits: 1, needCredits: false });
    expect(confirmWords({ ...dr, sendAt: '2026-11-13T08:00' }, 12, 20).action).toEqual({ text: 'Send on {when} to {n} members', vars: { when: '13 Nov, 8:00 am', n: 12 } });
  });

  it('his own edited words: changing the day swaps the date, in both languages', () => {
    const body = `Gym closed: Tomorrow, Friday 13 Nov.\nSee you Saturday.\n\nजिम बंद: कल, शुक्रवार 13 नवंबर।\n${HI_BODY}`;
    expect(swapDay(body, 'closed', '2026-11-13', '2026-11-15', TODAY)).toBe(
      `Gym closed: Sunday 15 Nov.\nSee you Saturday.\n\nजिम बंद: रविवार 15 नवंबर।\n${HI_BODY}`,
    );
    expect(swapDay('Closed on 13 Nov.', 'closed', '2026-11-13', '2026-11-15', TODAY)).toBe('Closed on 15 Nov.');
    expect(swapDay(HI_BODY, 'closed', '', '2026-11-13', TODAY)).toBe(`जिम बंद: कल, शुक्रवार 13 नवंबर।\n${HI_BODY}`);
  });
});
