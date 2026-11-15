/**
 * R-593 (owner, 15 Nov 2026): "Anything that user has already completed manually themselves doesn't have to be sitting
 * here in the today section." Today's "Latest from your members" and the bell's number keep only what still needs
 * someone (logic/alertHandled.ts). One block per alert kind: waiting, handled, and "cannot tell yet" (stays).
 */
import { describe, expect, it } from 'vitest';

import {
  ENQUIRY_GONE_MS,
  HANDLED_BY,
  alertEnquiry,
  alertState,
  handledHow,
  talkFact,
  waitingAlerts,
  type AlertFacts,
  type EnquiryFact,
} from '../../src/crm/logic/alertHandled';
import { GYM_ALERT_KINDS, type GymAlert, type GymAlertKind } from '../../src/crm/logic/gymAlerts';
import type { TalkThread } from '../../src/crm/logic/memberMessages';

const T = Date.UTC(2026, 10, 15, 4, 30, 0); // server time of the alert
const SEEN = 1_000_000; // this browser's clock when it first had the alert (a phone clock far from the server's)
const MIN = 60_000;

function alert(kind: GymAlertKind, extra: Partial<GymAlert> = {}): GymAlert {
  return { id: `a-${kind}`, kind, line: 'Words.', route: '/', urgent: false, at: T, ...extra };
}

function facts(extra: Partial<AlertFacts> = {}): AlertFacts {
  return {
    now: SEEN + 5 * MIN,
    today: '2026-11-15',
    firstSeen: () => SEEN,
    talkCount: null,
    talk: null,
    questionCount: null,
    questions: null,
    plan: null,
    links: null,
    orders: [],
    enquiries: null,
    seenInfo: new Set(),
    ...extra,
  };
}

function thread(over: Partial<TalkThread> & { lines: [boolean, number][] }): TalkThread {
  const messages = over.lines.map(([fromGym, at], i) => ({ id: `m${i}`, fromGym, who: fromGym ? 'Owner' : null, text: 'x', at }));
  return {
    id: 't1', kind: 'question', anonymous: false, appId: 'app', memberId: null, name: 'Aakash', phone: null, createdAt: messages[0].at,
    lastAt: messages[messages.length - 1].at, waiting: !messages[messages.length - 1].fromGym && !over.done, done: false, doneAt: null,
    doneBy: null, readByMember: false, to: null, toName: null, messages, ...over,
  };
}

describe('every alert kind has a "handled" rule', () => {
  it('no kind is left out', () => {
    for (const k of GYM_ALERT_KINDS) expect(HANDLED_BY[k], k).toBeTruthy();
    expect(Object.keys(HANDLED_BY).sort()).toEqual([...GYM_ALERT_KINDS].sort());
  });
  it('a friend who is already a member is news; a friend who asked to join is a call', () => {
    expect(handledHow(alert('friend_referred', { route: '/enquiries' }))).toBe('enquiry');
    expect(handledHow(alert('friend_referred', { route: '/members/m-1' }))).toBe('info');
  });
});

describe('member messages: question, feedback, complaint', () => {
  const q = alert('member_question');
  it('waiting: the member wrote, nobody replied', () => {
    const t = thread({ lines: [[false, T]] });
    expect(alertState(q, facts({ talk: { rows: [talkFact(t)], readAt: SEEN + MIN } }))).toBe('waiting');
  });
  it('handled: the gym replied after that line', () => {
    const t = thread({ lines: [[false, T], [true, T + 5 * MIN]] });
    expect(alertState(q, facts({ talk: { rows: [talkFact(t)], readAt: SEEN + MIN } }))).toBe('done');
  });
  it('handled: marked done (the owner, 15 Nov), even with no reply', () => {
    const t = thread({ kind: 'feedback', anonymous: true, done: true, doneAt: T + MIN, lines: [[false, T]] });
    expect(alertState(alert('member_feedback'), facts({ talk: { rows: [talkFact(t)], readAt: SEEN + MIN } }))).toBe('done');
  });
  it('a reply to an older line does not handle the newer one', () => {
    const t = thread({ lines: [[false, T - 60 * MIN], [true, T - 30 * MIN], [false, T]] });
    expect(alertState(q, facts({ talk: { rows: [talkFact(t)], readAt: SEEN + MIN } }))).toBe('waiting');
    expect(alertState({ ...q, at: T - 60 * MIN }, facts({ talk: { rows: [talkFact(t)], readAt: SEEN + MIN } }))).toBe('done');
  });
  it('matches on kind: a complaint line is not a question line at the same time', () => {
    const t = thread({ kind: 'question', lines: [[false, T], [true, T + MIN]] });
    expect(alertState(alert('member_complaint'), facts({ talk: { rows: [talkFact(t)], readAt: SEEN - MIN } }))).toBe('waiting');
  });
  it('nothing waits on Member messages (count 0, read after the alert came): every message line is handled', () => {
    expect(alertState(q, facts({ talkCount: { n: 0, readAt: SEEN + 1 } }))).toBe('done');
    expect(alertState(alert('member_complaint'), facts({ talkCount: { n: 0, readAt: SEEN + 1 } }))).toBe('done');
  });
  it('a count read BEFORE the alert came proves nothing; a count above 0 alone keeps the line', () => {
    expect(alertState(q, facts({ talkCount: { n: 0, readAt: SEEN - 1 } }))).toBe('waiting');
    expect(alertState(q, facts({ talkCount: { n: 2, readAt: SEEN + 1 } }))).toBe('waiting');
  });
  it('gone from the list read after the alert came (no longer there for this person): handled', () => {
    expect(alertState(q, facts({ talk: { rows: [], readAt: SEEN + 1 } }))).toBe('done');
    expect(alertState(q, facts({ talk: { rows: [], readAt: SEEN - 1 } }))).toBe('waiting');
  });
  it('the database step may round the time a little', () => {
    const t = thread({ lines: [[false, T + 900], [true, T + MIN]] });
    expect(alertState(q, facts({ talk: { rows: [talkFact(t)], readAt: SEEN - 1 } }))).toBe('done');
  });
});

describe('trainer questions', () => {
  const a = alert('trainer_question');
  it('waiting until answered', () => {
    expect(alertState(a, facts({ questions: { rows: [{ askedAt: T, open: true }], readAt: SEEN + 1 } }))).toBe('waiting');
    expect(alertState(a, facts({ questions: { rows: [{ askedAt: T, open: false }], readAt: SEEN + 1 } }))).toBe('done');
  });
  it('no open question at all (count 0 after the alert): handled; unknown: stays', () => {
    expect(alertState(a, facts({ questionCount: { n: 0, readAt: SEEN + 1 } }))).toBe('done');
    expect(alertState(a, facts())).toBe('waiting');
  });
});

describe('plan requests and check-in numbers', () => {
  it('a plan request: waiting while pending; approved or declined: handled', () => {
    const a = alert('plan_request');
    expect(alertState(a, facts({ plan: { rows: [{ createdAt: T, status: 'pending' }], readAt: SEEN + 1 } }))).toBe('waiting');
    expect(alertState(a, facts({ plan: { rows: [{ createdAt: T, status: 'approved' }], readAt: SEEN + 1 } }))).toBe('done');
    expect(alertState(a, facts({ plan: { rows: [{ createdAt: T, status: 'declined' }], readAt: SEEN + 1 } }))).toBe('done');
    expect(alertState(a, facts({ plan: { rows: [], readAt: SEEN - 1 } })), 'list older than the alert').toBe('waiting');
  });
  it('a check-in number: confirmed or refused is handled', () => {
    const a = alert('phone_link');
    expect(alertState(a, facts({ links: { rows: [{ createdAt: T, status: 'pending' }], readAt: SEEN + 1 } }))).toBe('waiting');
    expect(alertState(a, facts({ links: { rows: [{ createdAt: T, status: 'confirmed' }], readAt: SEEN + 1 } }))).toBe('done');
    expect(alertState(a, facts({ links: null }))).toBe('waiting');
  });
});

describe('shop orders', () => {
  const a = alert('shop_order', { line: 'New shop order 12 from Neha. Get it ready on Shop.' });
  it('handled once the desk moves it on (ready, collected, cancelled)', () => {
    expect(alertState(a, facts({ orders: [{ orderNo: 12, status: 'ordered' }] }))).toBe('waiting');
    for (const status of ['ready', 'collected', 'cancelled'] as const) expect(alertState(a, facts({ orders: [{ orderNo: 12, status }] }))).toBe('done');
    expect(alertState(a, facts())).toBe('waiting');
  });
});

describe('enquiries: a friend, joining online, a web page question or chat', () => {
  const base: EnquiryFact = { status: 'open', followUpOn: '2026-11-15', createdAt: T, updatedAt: T };
  it('matched by the time the server stamped on the enquiry', () => {
    expect(alertEnquiry({ at: T }, [base])).toBe(base);
    const again: EnquiryFact = { ...base, createdAt: T - 9 * 24 * 60 * MIN, updatedAt: T + 4 * MIN, invitedAgain: { at: T } };
    expect(alertEnquiry({ at: T }, [again])).toBe(again);
    expect(alertEnquiry({ at: T }, [{ ...base, createdAt: T - 10 * MIN, updatedAt: T - 10 * MIN }])).toBeNull();
  });
  it('waiting while open and due today; handled when joined, not interested, or called and moved to a later day', () => {
    const a = alert('friend_referred', { route: '/enquiries' });
    expect(alertState(a, facts({ enquiries: [base] }))).toBe('waiting');
    expect(alertState(a, facts({ enquiries: [{ ...base, status: 'joined' }] }))).toBe('done');
    expect(alertState(a, facts({ enquiries: [{ ...base, status: 'lost' }] }))).toBe('done');
    expect(alertState(a, facts({ enquiries: [{ ...base, followUpOn: '2026-11-16' }] }))).toBe('done');
    expect(alertState(alert('online_join'), facts({ enquiries: [{ ...base, selfJoin: { at: T } }] }))).toBe('waiting');
  });
  it('a web page chat: "Mark as done" after the alert handles it', () => {
    const chat: EnquiryFact = { ...base, createdAt: T - 60 * MIN, updatedAt: T, pageChat: { needAt: T, lastAt: T } };
    expect(alertState(alert('page_question'), facts({ enquiries: [chat] }))).toBe('waiting');
    expect(alertState(alert('page_question'), facts({ enquiries: [{ ...chat, pageChat: { needAt: T, lastAt: T, doneAt: T + MIN } }] }))).toBe('done');
  });
  it('not in the records yet: stays; still missing long after (deleted): handled', () => {
    const a = alert('online_join');
    expect(alertState(a, facts({ enquiries: [] }))).toBe('waiting');
    expect(alertState(a, facts({ enquiries: [], now: SEEN + ENQUIRY_GONE_MS + 1 }))).toBe('done');
    expect(alertState(a, facts({ enquiries: null, now: SEEN + ENQUIRY_GONE_MS + 1 }))).toBe('waiting');
  });
});

describe('news (nothing to do): payments, reports, joins, AI credits', () => {
  it('shown until seen on Today in an earlier visit', () => {
    for (const k of ['paid_online', 'report_sent', 'member_joined', 'ai_credits_low', 'ai_members_limit'] as const) {
      const a = alert(k);
      expect(alertState(a, facts()), k).toBe('waiting');
      expect(alertState(a, facts({ seenInfo: new Set([a.id]) })), k).toBe('seen');
    }
  });
});

describe('the owner\'s screen on 15 Nov 2026', () => {
  it('three conversations he marked done and a join he already saw: nothing left; the friend is still to call', () => {
    const list: GymAlert[] = [
      alert('member_question', { id: 'q', at: T }),
      alert('member_question', { id: 'r', at: T + 1000 * 30, line: 'A member replied in Member messages. Open it to read the reply.' }),
      alert('member_feedback', { id: 'f', at: T + 1000 * 60 }),
      alert('member_joined', { id: 'j', at: T + 1000 * 90 }),
      alert('friend_referred', { id: 'e', at: T + 1000 * 120, route: '/enquiries' }),
    ];
    const done = (id: string, kind: TalkThread['kind'], ats: number[]) => talkFact(thread({ id, kind, done: true, doneAt: T + 10 * MIN, lines: ats.map((at) => [false, at] as [boolean, number]) }));
    const f = facts({
      talk: { rows: [done('t1', 'question', [T]), done('t2', 'question', [T + 30_000]), done('t3', 'feedback', [T + 60_000])], readAt: SEEN + MIN },
      seenInfo: new Set(['j']),
      enquiries: [{ status: 'open', followUpOn: '2026-11-15', createdAt: T + 120_000, updatedAt: T + 120_000 }],
    });
    expect(waitingAlerts(list, f).map((a) => a.id)).toEqual(['e']);
  });
});
