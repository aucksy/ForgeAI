/**
 * F208 (R-538): a visitor's chat with the AI helper on the gym's web page, as the owner reads it in Enquiries
 * (logic/pageChat.ts): the status words, "Needs you" and "Wants a call" first, "Mark as done", the alert the gym
 * server sends, and the owner's switch on the page. Made-up visitors and fake numbers only.
 */
import { describe, expect, it } from 'vitest';

import { draftFrom, savePayload, type SavedPage } from '../../src/crm/gympage/logic';
import { GYM_ALERT_KINDS, gymAlertsFrom } from '../../src/crm/logic/gymAlerts';
import {
  CHAT_STATUS_WORDS,
  chatLineNote,
  chatNeedsOwner,
  chatStatus,
  chatsNeedingOwnerFirst,
  markChatDone,
  noNumber,
  pageChatOf,
} from '../../src/crm/logic/pageChat';
import type { Enquiry, PageChatMessage } from '../../src/crm/types';

const v = (text: string, state: PageChatMessage['state'], at = 1): PageChatMessage => ({ id: `m${at}`, from: 'visitor', text, at, state });
const ai = (text: string, at = 2): PageChatMessage => ({ id: `a${at}`, from: 'ai', text, at });

function enquiry(id: string, pageChat: unknown, over: Partial<Enquiry> = {}): Enquiry {
  return {
    id, gymId: 'g', name: 'Web page visitor', phone: '', interest: 'Chat on your web page: Parking?', followUpOn: '2026-11-15',
    status: 'open', memberId: null, createdAt: 1, updatedAt: 1, pageChat: pageChat as Enquiry['pageChat'], ...over,
  };
}

describe('the chat status (the same rule as the gym server)', () => {
  it('asked to join > wants a call > a question the AI did not answer > answered', () => {
    expect(chatStatus([v('Parking?', 'answered'), ai('Yes.')], null)).toBe('answered');
    expect(chatStatus([v('Parking?', 'answered'), v('Steam?', 'unknown')], null)).toBe('needs_you');
    for (const s of ['limit', 'failed', 'waiting'] as const) expect(chatStatus([v('Q', s)], null)).toBe('needs_you');
    expect(chatStatus([v('Steam?', 'unknown')], 'call')).toBe('wants_call');
    expect(chatStatus([v('Steam?', 'unknown')], 'join')).toBe('join');
    expect(CHAT_STATUS_WORDS).toEqual({ answered: 'AI answered', needs_you: 'Needs you: the AI could not answer', wants_call: 'Wants a call', join: 'Asked to join' });
  });

  it('reads the server block safely and works the status out again from the lines', () => {
    const c = pageChatOf(enquiry('e1', { v: 1, status: 'answered', wants: null, messages: [v('Parking?', 'answered'), ai('Yes.'), v('Steam?', 'unknown'), { from: 'x', text: 'bad' }, { from: 'ai', text: '  ' }] }));
    expect(c?.messages.map((m) => m.text)).toEqual(['Parking?', 'Yes.', 'Steam?']);
    expect(c?.status).toBe('needs_you');
    expect(pageChatOf(enquiry('e2', null))).toBeNull();
    expect(pageChatOf(enquiry('e3', { messages: [] }))).toBeNull();
    expect(pageChatOf(enquiry('e4', 'odd'))).toBeNull();
    // A visitor line with an odd state counts as not answered.
    expect(pageChatOf(enquiry('e5', { messages: [{ id: 'm1', from: 'visitor', text: 'Q', at: 1, state: 'weird' }] }))?.status).toBe('needs_you');
    // After 90 days: no lines, the kept status and number stay.
    const old = pageChatOf(enquiry('e6', { v: 1, status: 'join', wants: 'join', messages: [], cleared: true }, { phone: '+919000093001' }));
    expect(old).toMatchObject({ status: 'join', cleared: true, messages: [] });
  });
});

describe('who the owner must answer', () => {
  it('"AI answered" never needs the owner; the rest do until "Mark as done", and again after a newer need', () => {
    const answered = pageChatOf(enquiry('a', { messages: [v('Parking?', 'answered'), ai('Yes.')], needAt: 5 }));
    expect(chatNeedsOwner(answered)).toBe(false);
    const needs = pageChatOf(enquiry('n', { messages: [v('Steam?', 'unknown')], needAt: 10 }));
    expect(chatNeedsOwner(needs)).toBe(true);
    expect(chatNeedsOwner(pageChatOf(enquiry('d', { messages: [v('Steam?', 'unknown')], needAt: 10, doneAt: 11 })))).toBe(false);
    expect(chatNeedsOwner(pageChatOf(enquiry('d2', { messages: [v('Steam?', 'unknown')], needAt: 12, doneAt: 11 })))).toBe(true);
    expect(chatNeedsOwner(null)).toBe(false);
  });

  it('"Needs you", "Wants a call" and "Asked to join" come first, the newest need on top; the rest keep their calling order', () => {
    const rows = [
      enquiry('desk-typed', undefined, { name: 'Ravi', phone: '+919000093002', interest: '3 months' }),
      enquiry('answered', { messages: [v('Parking?', 'answered'), ai('Yes.')] }),
      enquiry('needs', { messages: [v('Steam?', 'limit')], needAt: 3 }),
      enquiry('call', { messages: [v('Parking?', 'answered')], wants: 'call', needAt: 4 }, { name: 'Pooja', phone: '+919000093001' }),
      enquiry('done', { messages: [v('Steam?', 'unknown')], needAt: 3, doneAt: 9 }),
      enquiry('join', { messages: [], wants: 'join', cleared: true, status: 'join' }, { phone: '+919000093003' }),
    ];
    expect(chatsNeedingOwnerFirst(rows).map((e) => e.id)).toEqual(['call', 'needs', 'join', 'desk-typed', 'answered', 'done']);
  });

  it('"Mark as done" keeps the whole server block and adds the time', () => {
    const raw = { v: 1, messages: [v('Steam?', 'unknown')], status: 'needs_you', wants: null, needAt: 3, wording: '2026-11-15' };
    expect(markChatDone(enquiry('x', raw), 99)).toEqual({ ...raw, doneAt: 99 });
    expect(markChatDone(enquiry('y', null), 99)).toBeNull();
  });

  it('a line says what happened to it; a visitor with no number has nothing to call', () => {
    expect(chatLineNote(v('Q', 'unknown'))).toBe('The AI could not answer this from your page.');
    expect(chatLineNote(v('Q', 'limit'))).toBe('Not sent to the AI: a daily limit or no AI credits left.');
    expect(chatLineNote(v('Q', 'failed'))).toBe('The AI did not answer this.');
    expect(chatLineNote(v('Q', 'answered'))).toBeNull();
    expect(chatLineNote(ai('A'))).toBeNull();
    expect(noNumber({ phone: '' })).toBe(true);
    expect(noNumber({ phone: '+919000093001' })).toBe(false);
  });
});

describe('the alerts and the owner switch', () => {
  it('the chat alerts use the page_question kind the panel already shows, opening Enquiries', () => {
    expect(GYM_ALERT_KINDS).toContain('page_question');
    const got = gymAlertsFrom({
      ok: true,
      alerts: [
        { id: 'c1', kind: 'page_question', line: 'A visitor asked something on your web page that the AI could not answer. Open Enquiries to read the chat.', route: '/enquiries', urgent: true, at: 7 },
        { id: 'c2', kind: 'page_question', line: 'Pooja wants to join, from the chat on your web page. Open Enquiries to call them.', route: '/enquiries', urgent: true, at: 8 },
      ],
    });
    expect(got?.map((a) => [a.kind, a.route])).toEqual([['page_question', '/enquiries'], ['page_question', '/enquiries']]);
  });

  it("the page's AI helper switch: on by default, the owner's choice saved", () => {
    const gym = { name: 'Shakti Gym', joinCode: 'QA0002' };
    expect(draftFrom(null, gym).aiHelper).toBe(true);
    expect(savePayload(draftFrom(null, gym), null).aiHelper).toBe(true);
    const saved = { aiHelper: true } as unknown as SavedPage;
    expect(savePayload({ ...draftFrom(null, gym), aiHelper: false }, saved).aiHelper).toBe(false);
  });
});
