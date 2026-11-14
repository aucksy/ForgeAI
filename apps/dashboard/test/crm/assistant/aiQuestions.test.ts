/**
 * F209 (owner 14 Nov 2026): every AI question is paid from the gym's AI credits, 20 questions = 1 credit (supabase 0078).
 * The admin app: this month's questions by who asked, the credits sheet's words, the ask box's daily line, the Help
 * page sending its sign-in key, and the "credits low" alert. Before 0078 is live everything reads as it did.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { fullLine, isDayLimit, leftLine, resetAllowance, setQuestionsCounted } from '../../../src/crm/assistant/allowance';
import { aiQuestions, memberAiFrom, saveMemberAi, type AiQuestions } from '../../../src/crm/assistant/api';
import { askedRows, limitHint, limitOf, lowWords, usedWords, walletRowWords } from '../../../src/crm/assistant/ui/CreditsSheet';
import type { AiWalletRow } from '../../../src/crm/assistant/api';
import { feedbackAnswer, sendFeedback } from '../../../src/crm/logic/feedback';
import { gymAlertsFrom } from '../../../src/crm/logic/gymAlerts';

const Q: AiQuestions = { month: '2026-11', perCredit: 20, memberDay: 10, visitorDay: 3, lowAt: 10, owner: 3, staff: 1, members: 20, visitors: 0, credits: 2, memberAi: null };

const rpcOf = (answer: unknown) => (async () => answer) as unknown as Parameters<typeof aiQuestions>[1];

afterEach(() => resetAllowance());

describe("this month's AI questions (owner_ai_questions)", () => {
  it('reads the server answer', async () => {
    const got = await aiQuestions('k', rpcOf({ ok: true, month: '2026-11', per_credit: 20, member_day: 10, visitor_day: 3, low_at: 10, owner: 3, staff: 1, members: 20, visitors: 0, credits: 2 }));
    expect(got).toEqual(Q);
  });

  it('is null (nothing new shows) before 0078 is live, offline, or with an odd answer', async () => {
    expect(await aiQuestions('k', rpcOf(null))).toBeNull();
    expect(await aiQuestions('k', rpcOf({ ok: false }))).toBeNull();
    // A wallet-like answer without the rules is not the questions.
    expect(await aiQuestions('k', rpcOf({ ok: true, balance: 5 }))).toBeNull();
    const missing = (async () => {
      throw { code: 'PGRST202', message: 'Could not find the function' };
    }) as unknown as Parameters<typeof aiQuestions>[1];
    expect(await aiQuestions('k', missing)).toBeNull();
  });
});

describe('the credits sheet', () => {
  it('the low line: before 0078 questions stay free; after, members get help pages', () => {
    expect(lowWords({ balance: 20, lowAt: 10, questions: Q })).toBeNull();
    expect(lowWords({ balance: 3, lowAt: 5 })).toBe('Your credits are running low. Questions stay free.');
    expect(lowWords({ balance: 0, lowAt: 5, questions: null })).toBe('You have no credits left. Questions stay free.');
    // The wallet warns from 5; with questions counted, from the alert's 10.
    expect(lowWords({ balance: 8, lowAt: 5, questions: Q })).toBe('Your credits are running low. When they run out, members get help pages instead of AI answers.');
    expect(lowWords({ balance: 0, lowAt: 10, questions: Q })).toBe('You have no credits left. Members now get help pages instead of AI answers.');
  });

  it('who asked: you, staff, members; gym page visitors once there are some', () => {
    expect(askedRows(Q)).toEqual([
      { label: 'You', n: 3 },
      { label: 'Your staff', n: 1 },
      { label: 'Members', n: 20 },
    ]);
    expect(askedRows({ ...Q, visitors: 4 }).at(-1)).toEqual({ label: 'Gym page visitors', n: 4 });
  });

  it('a block of questions in the credit history', () => {
    const row = (note: string): AiWalletRow => ({ at: 0, delta: -1, reason: 'questions', note, taskId: null });
    expect(walletRowWords(row('20 AI questions'))).toBe('20 AI questions');
    expect(walletRowWords(row(''))).toBe('AI questions');
    // R-531 (0083): only members' answers take credits now.
    expect(walletRowWords(row('10 AI answers for members'))).toBe('10 AI answers for members');
  });
});

describe("R-531: members' AI answers (supabase 0083)", () => {
  const SERVER = { members_on: true, month_credits: 20, month_max: 500, per_credit: 10, month_answers: 36, month_used: 4 };
  const M = { on: true, monthCredits: 20, monthMax: 500, perCredit: 10, monthAnswers: 36, monthUsed: 4 };

  it("reads the owner's switch and limit with the month's questions; none before 0083", async () => {
    const got = await aiQuestions('k', rpcOf({ ok: true, month: '2026-11', member_day: 10, visitor_day: 3, low_at: 10, owner: 3, staff: 1, members: 20, visitors: 0, credits: 4, ...SERVER }));
    expect(got?.memberAi).toEqual(M);
    expect(got?.perCredit).toBe(10);
    expect(memberAiFrom({ ok: true })).toBeNull();
    expect(memberAiFrom({ ...SERVER, members_on: 'yes' })).toBeNull();
    expect(memberAiFrom({ ...SERVER, members_on: false, month_credits: 900 })).toMatchObject({ on: false, monthCredits: 500 });
  });

  it('saves the switch and the limit; a refusal or no 0083 is "not saved"', async () => {
    const sent: unknown[] = [];
    const ok = (async (name: string, args: unknown) => {
      sent.push([name, args]);
      return { ok: true, ...SERVER, members_on: false, month_credits: 5 };
    }) as unknown as Parameters<typeof saveMemberAi>[3];
    expect(await saveMemberAi('owner-key', false, 5, ok)).toEqual({ ...M, on: false, monthCredits: 5 });
    expect(sent).toEqual([['owner_save_ai_member_rules', { p_key: 'owner-key', p_members_on: false, p_month_credits: 5 }]]);
    const refused = (async () => {
      throw { message: 'OWNER_ONLY' };
    }) as unknown as Parameters<typeof saveMemberAi>[3];
    expect(await saveMemberAi('desk-key', true, 5, refused)).toBeNull();
    expect(await saveMemberAi('k', true, 5, (async () => ({ ok: true })) as unknown as Parameters<typeof saveMemberAi>[3])).toBeNull();
  });

  it('the words under the limit and the month so far', () => {
    expect(limitHint(20, 10)).toBe('This gives members up to 200 AI answers a month. After that, they get help pages until the month ends.');
    expect(limitHint(0, 10)).toBe('With 0, members get help pages instead of AI answers.');
    expect(usedWords({ monthAnswers: 36, monthUsed: 4 })).toBe('Used this month: 36 answers (4 credits).');
    expect(usedWords({ monthAnswers: 1, monthUsed: 1 })).toBe('Used this month: 1 answer (1 credit).');
  });

  it('the limit box takes a whole number from 0 to the most allowed', () => {
    expect(limitOf('20', 500)).toBe(20);
    expect(limitOf(' 0 ', 500)).toBe(0);
    expect(limitOf('500', 500)).toBe(500);
    expect(limitOf('501', 500)).toBeNull();
    expect(limitOf('-1', 500)).toBeNull();
    expect(limitOf('2.5', 500)).toBeNull();
    expect(limitOf('', 500)).toBeNull();
    expect(limitOf('ten', 500)).toBeNull();
  });

  it('the "members used this month\'s AI answers" alert is a gym alert the owner sees', () => {
    const list = gymAlertsFrom({
      ok: true,
      alerts: [{ id: 'm1', kind: 'ai_members_limit', line: "Members have used this month's AI answers.", route: '/assistant', urgent: false, at: 1 }],
    });
    expect(list?.map((a) => [a.kind, a.route])).toEqual([['ai_members_limit', '/assistant']]);
  });
});

describe("the ask box's daily line", () => {
  it('says "free" only while questions are not counted', () => {
    expect(leftLine(3)?.text).toBe('{n} free questions left today.');
    expect(fullLine(50).text).toBe("You have used today's {n} free questions. Your credits are safe. Ask again tomorrow.");
    setQuestionsCounted(true);
    expect(leftLine(1)?.text).toBe('1 AI question left today.');
    expect(leftLine(3)?.text).toBe('{n} AI questions left today.');
    expect(fullLine(60).text).toBe("You have used today's {n} AI questions. Your credits are safe. Ask again tomorrow.");
    expect(fullLine(null).text).toBe("You have used today's AI questions. Your credits are safe. Ask again tomorrow.");
  });

  it("the gym's allowance and the person's own both lock the box", () => {
    expect(isDayLimit('limit')).toBe(true);
    expect(isDayLimit('q_limit')).toBe(true);
    expect(isDayLimit('no_credits')).toBe(false);
  });
});

describe('the Help page', () => {
  it("sends the sign-in key only when given, so the gym's credits pay for the answer", async () => {
    const seen: (string | null)[] = [];
    const f = (async (_url: string, init: RequestInit) => {
      seen.push(new Headers(init.headers).get('X-Forge-Key'));
      return new Response(JSON.stringify({ ok: true }), { status: 201 });
    }) as unknown as typeof fetch;
    const store = { getItem: () => null, setItem: () => undefined };
    await sendFeedback('how do I add a member', 'more/feedback', f, store, 'session-key-1234567890');
    await sendFeedback('delete my gym data', 'more/data', f, store);
    expect(seen).toEqual(['session-key-1234567890', null]);
  });

  it('reads why the AI was not asked; an answer without it is as before', () => {
    expect(feedbackAnswer(201, { id: 3, answer: 'From the help pages.', ai: false, credits: 'no_credits' })).toEqual({
      ok: true,
      reply: { id: 3, text: 'From the help pages.', ai: false, credits: 'no_credits' },
    });
    expect(feedbackAnswer(201, { id: 3, answer: 'AI words.', ai: true })).toEqual({ ok: true, reply: { id: 3, text: 'AI words.', ai: true } });
    expect(feedbackAnswer(201, { id: 3, answer: 'x', ai: false, credits: '<b>' })).toEqual({ ok: true, reply: { id: 3, text: 'x', ai: false } });
  });
});

describe('the "credits low" alert', () => {
  it('is a gym alert the owner sees', () => {
    const list = gymAlertsFrom({
      ok: true,
      alerts: [{ id: 'c1', kind: 'ai_credits_low', line: 'Your gym has 10 AI credits left.', route: '/assistant', urgent: false, at: 1 }],
    });
    expect(list?.map((a) => [a.kind, a.route])).toEqual([['ai_credits_low', '/assistant']]);
  });
});
