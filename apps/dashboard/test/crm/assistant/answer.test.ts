// F201: every "ask" tool answered locally on the fixture gym, with the panel's own numbers (answer.ts),
// and the small context that is the only gym data the AI ever sees (context.ts).
import { describe, expect, it } from 'vitest';

import { answerAsk, periodRange, ROWS_MAX, type AnswerCard, type AnswerResult } from '../../../src/crm/assistant/answer';
import { ASK_TOOLS } from '../../../src/crm/assistant/answer';
import { TOOL_KIND } from '../../../src/crm/assistant/catalogue';
import { buildAssistContext } from '../../../src/crm/assistant/context';
import type { ToolInputs } from '../../../src/crm/assistant/catalogue';
import { makeMember } from '../fixtures';
import { answerData, fixtureGym, TODAY } from './gym';

const d = answerData();
const list = (over: Partial<ToolInputs['list_members']>): ToolInputs['list_members'] => ({ group: 'everyone', days: 0, plan: '', batch: '', trainer: '', gender: '', ...over });
const cardOf = (r: AnswerResult): AnswerCard => {
  if (r.kind !== 'card') throw new Error(`expected a card, got ${r.kind}`);
  return r.card;
};
const ids = (c: AnswerCard) => c.rows.map((r) => r.memberId).sort();

describe('the ask tools', () => {
  it('ASK_TOOLS are exactly the catalogue\'s "ask" tools', () => {
    expect([...ASK_TOOLS].sort()).toEqual(Object.entries(TOOL_KIND).filter(([, k]) => k === 'ask').map(([n]) => n).sort());
  });

  it('list_members: every group', () => {
    expect(ids(cardOf(answerAsk('list_members', list({ group: 'ending' }), d)))).toEqual(['m_preeti']);
    expect(cardOf(answerAsk('list_members', list({ group: 'ending' }), d)).seeAll).toEqual({ path: '/numbers/renewals' });
    expect(ids(cardOf(answerAsk('list_members', list({ group: 'away', days: 10 }), d)))).toEqual(['m_pooja']);
    expect(ids(cardOf(answerAsk('list_members', list({ group: 'ended' }), d)))).toEqual(['m_vikas']);
    expect(ids(cardOf(answerAsk('list_members', list({ group: 'birthday_today' }), d)))).toEqual(['m_preeti']);
    expect(ids(cardOf(answerAsk('list_members', list({ group: 'birthday_week' }), d)))).toEqual(['m_preeti', 'm_rahul_s']);
    expect(ids(cardOf(answerAsk('list_members', list({ group: 'new_joins' }), d)))).toEqual(['m_preeti', 'm_rahul_m', 'm_sanjay']);
    expect(ids(cardOf(answerAsk('list_members', list({ group: 'plan', plan: 'quarterly' }), d)))).toEqual(['m_pooja', 'm_rahul_s']);
    expect(ids(cardOf(answerAsk('list_members', list({ group: 'batch', batch: 'morning' }), d)))).toEqual(['m_preeti']);
    const pt = cardOf(answerAsk('list_members', list({ group: 'trainer', trainer: 'Rohit' }), d));
    expect(ids(pt)).toEqual(['m_rahul_s']);
    expect(pt.rows[0].detail).toEqual({ text: '{n} sessions left', vars: { n: 10 } });
    expect(ids(cardOf(answerAsk('list_members', list({ group: 'no_app' }), d)))).toEqual(['m_pooja', 'm_rahul_m', 'm_sanjay', 'm_vikas']);
    expect(ids(cardOf(answerAsk('list_members', list({ group: 'visited_today' }), d)))).toEqual(['m_preeti', 'm_rahul_s']);
    expect(ids(cardOf(answerAsk('list_members', list({ group: 'no_plan' }), d)))).toEqual(['m_sanjay']);
    expect(ids(cardOf(answerAsk('list_members', list({ group: 'active', gender: 'male' }), d)))).toEqual(['m_rahul_m', 'm_rahul_s']);
    // Archived members are never listed.
    expect(cardOf(answerAsk('list_members', list({ group: 'everyone' }), d)).total).toBe(6);
  });

  it('list_members: an unknown plan or batch says so; the app list offline says so', () => {
    expect(cardOf(answerAsk('list_members', list({ group: 'plan', plan: 'Gold' }), d)).headline).toEqual({ text: 'No plan called “{name}”.', vars: { name: 'Gold' } });
    expect(cardOf(answerAsk('list_members', list({ group: 'no_app' }), { ...d, appPhones: null })).number).toBeNull();
  });

  it('at most 8 rows, with the full count', () => {
    const many = fixtureGym();
    for (let i = 0; i < 12; i += 1) many.members.push(makeMember({ id: `x${i}`, fullName: `Extra Person${i}`, phone: `+91990000${String(i).padStart(4, '0')}` }));
    const c = cardOf(answerAsk('list_members', list({ group: 'everyone' }), answerData({ snapshot: many })));
    expect(c.rows).toHaveLength(ROWS_MAX);
    expect(c.total).toBe(18);
    expect(c.number).toBe('18');
  });

  it('who_owes: the Dues list, one member, two Rahuls, nobody, and desk staff', () => {
    const all = cardOf(answerAsk('who_owes', { member: '' }, d));
    expect(all.number).toBe('₹2,000');
    expect(ids(all)).toEqual(['m_pooja']);
    expect(all.seeAll).toEqual({ path: '/money/dues' });
    const pooja = cardOf(answerAsk('who_owes', { member: 'Puja' }, d));
    expect(pooja.number).toBe('₹2,000');
    expect(pooja.rows[0].label).toBe('Quarterly');
    expect(pooja.followUps[0]).toEqual({ label: { text: 'Record a payment' }, request: 'Pooja Verma paid 2000' });
    expect(cardOf(answerAsk('who_owes', { member: 'Preeti' }, d)).number).toBe('₹0');
    const two = answerAsk('who_owes', { member: 'Rahul' }, d);
    expect(two.kind).toBe('choose');
    expect(cardOf(answerAsk('who_owes', { member: 'Rahul' }, d, 'm_rahul_m')).number).toBe('₹0');
    expect(answerAsk('who_owes', { member: 'Ankit' }, d)).toMatchObject({ kind: 'not_found', typed: 'Ankit' });
    expect(cardOf(answerAsk('who_owes', { member: '' }, { ...d, seeTotals: false })).headline.text).toBe('Only the gym owner can see money totals.');
  });

  it('money_summary: total, by method, by plan, expenses, profit; voided receipts never count', () => {
    const base = { period: 'this_month' as const, from: '', to: '' };
    const total = cardOf(answerAsk('money_summary', { ...base, breakdown: 'total' }, d));
    expect(total.number).toBe('₹9,700');
    expect(total.rows.map((r) => r.key)).toEqual(['cash', 'upi', 'card']);
    const byPlan = cardOf(answerAsk('money_summary', { ...base, breakdown: 'by_plan' }, d));
    expect(byPlan.rows.map((r) => r.label)).toEqual(['PT 12 sessions', 'Quarterly', 'Monthly']);
    const spent = cardOf(answerAsk('money_summary', { ...base, breakdown: 'expenses' }, d));
    expect(spent.number).toBe('₹23,000');
    expect(spent.rows.map((r) => r.key)).toEqual(['rent', 'electricity']);
    const profit = cardOf(answerAsk('money_summary', { ...base, breakdown: 'profit' }, d));
    expect(profit.headline.text).toBe('Loss {when}');
    expect(profit.number).toBe('₹13,300');
    expect(cardOf(answerAsk('money_summary', { period: 'today', from: '', to: '', breakdown: 'total' }, d)).number).toBe('₹0');
    expect(cardOf(answerAsk('money_summary', { ...base, breakdown: 'total' }, { ...d, seeTotals: false })).number).toBeNull();
  });

  it('attendance_summary: count, peak hours, inside now, who came', () => {
    expect(cardOf(answerAsk('attendance_summary', { period: 'this_week', from: '', to: '', focus: 'count' }, d)).number).toBe('3');
    expect(cardOf(answerAsk('attendance_summary', { period: 'last_week', from: '', to: '', focus: 'count' }, d)).number).toBe('3');
    expect(cardOf(answerAsk('attendance_summary', { period: 'today', from: '', to: '', focus: 'peak_hours' }, d)).number).toBe('7 am–8 am');
    const inside = cardOf(answerAsk('attendance_summary', { period: 'today', from: '', to: '', focus: 'inside_now' }, d));
    expect(ids(inside)).toEqual(['m_preeti']);
    const came = cardOf(answerAsk('attendance_summary', { period: 'last_week', from: '', to: '', focus: 'who_came' }, d));
    expect(came.number).toBe('2');
    expect(came.rows[0]).toMatchObject({ memberId: 'm_rahul_m', detail: { text: '{n} visits', vars: { n: 2 } } });
  });

  it('growth_summary: members with a plan, joins and endings', () => {
    const g = cardOf(answerAsk('growth_summary', { period: 'this_month', from: '', to: '' }, d));
    expect(g.number).toBe('4');
    expect(g.rows.find((r) => r.key === 'joined')?.detail?.vars).toEqual({ n: 2 });
    expect(g.rows.find((r) => r.key === 'change')?.detail?.vars).toEqual({ n: '+1' });
  });

  it('member_lookup: one member, with PT and dues; two Rahuls -> choose', () => {
    const pooja = cardOf(answerAsk('member_lookup', { member: 'pooja' }, d));
    expect(pooja.headline.vars).toEqual({ name: 'Pooja Verma' });
    expect(pooja.rows.find((r) => r.key === 'owes')?.detail?.vars).toEqual({ amount: '₹2,000' });
    expect(pooja.rows.find((r) => r.key === 'visit')?.detail).toEqual({ text: 'Last came {days} days ago', vars: { days: 18 } });
    expect(pooja.seeAll).toEqual({ path: '/members/m_pooja' });
    expect(answerAsk('member_lookup', { member: 'Rahul' }, d).kind).toBe('choose');
    const rahul = cardOf(answerAsk('member_lookup', { member: 'Rahul' }, d, 'm_rahul_s'));
    expect(rahul.rows.find((r) => r.key === 'pt')?.detail?.vars).toEqual({ n: 10 });
  });

  it('week_summary: last week from weekNumbers, this week Monday to today', () => {
    const last = cardOf(answerAsk('week_summary', { week: 'last_week' }, d));
    expect(last.number).toBe('₹3,700');
    expect(last.rows.find((r) => r.key === 'sold')?.detail?.vars).toEqual({ n: 1 });
    expect(last.rows.find((r) => r.key === 'dues')?.detail?.vars).toEqual({ amount: '₹2,000', n: 1 });
    const now = cardOf(answerAsk('week_summary', { week: 'this_week' }, d));
    expect(now.headline.vars).toEqual({ when: '9 Nov 2026 – 12 Nov 2026' });
    expect(now.rows.find((r) => r.key === 'visits')?.detail?.vars).toEqual({ n: 3 });
    expect(now.rows.find((r) => r.key === 'new')?.detail?.vars).toEqual({ n: 1 });
  });

  it('gym_numbers: every topic', () => {
    const t = (topic: ToolInputs['gym_numbers']['topic']) => cardOf(answerAsk('gym_numbers', { topic }, d));
    expect(t('members_by_plan').rows.map((r) => [r.label, r.detail?.vars?.n])).toEqual([['Monthly', 2], ['Quarterly', 2]]);
    expect(t('members_by_gender').rows.map((r) => [r.label, r.detail?.vars?.n])).toEqual([['Women', 2], ['Men', 2]]);
    expect(t('members_by_batch').rows.map((r) => r.label)).toEqual(['Evening', 'Morning 6-8']);
    expect(t('plans_and_prices').rows.map((r) => r.label)).toEqual(['Monthly', 'Quarterly', 'PT 12 sessions']);
    expect(t('enquiries').number).toBe('2');
    expect(t('followups_today').rows.map((r) => r.label)).toEqual(['Amit Jain']);
    expect(t('trainers').rows.map((r) => [r.label, r.detail?.vars?.n])).toEqual([['Rohit', 1]]);
    expect(t('without_app').number).toBe('4');
    expect(t('birthdays_week').number).toBe('2');
  });

  it('how_to goes to the help assistant', () => {
    expect(answerAsk('how_to', { question: 'How do I add a trainer?' }, d)).toEqual({ kind: 'help', question: 'How do I add a trainer?' });
  });

  it('periods: India weeks start Monday; custom ranges are put in order and stop at today', () => {
    expect(periodRange('this_week', '', '', TODAY)).toEqual({ from: '2026-11-09', to: TODAY });
    expect(periodRange('last_month', '', '', TODAY)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(periodRange('custom', '2026-12-31', '2026-11-01', TODAY)).toEqual({ from: '2026-11-01', to: TODAY });
    expect(periodRange('custom', 'nope', '', TODAY)).toEqual({ from: '2026-11-01', to: TODAY });
  });
});

describe('the context sent to the AI', () => {
  const s = fixtureGym();
  const ctx = buildAssistContext(s, TODAY, 'both');

  it('holds the gym, the day, plans, batches and trainers', () => {
    expect(ctx).toEqual({
      gym: 'Iron Temple Fitness',
      today: TODAY,
      weekday: 'Thursday',
      plans: [
        { name: 'Monthly', price: 1200, months: 1 },
        { name: 'Quarterly', price: 4500, months: 3 },
        { name: 'PT 12 sessions', price: 6000, months: 1 },
      ],
      batches: ['Evening', 'Morning 6-8'],
      trainers: ['Rohit'],
      messageLang: 'both',
    });
  });

  it('never a member, a phone, a due or a visit', () => {
    const text = JSON.stringify(ctx);
    for (const m of s.members) {
      expect(text).not.toContain(m.fullName.split(' ')[0]);
      expect(text).not.toContain(m.phone.slice(-10));
    }
    expect(text).not.toMatch(/\d{10}/);
    expect(text).not.toContain('2026-10-25');
    expect(Object.keys(ctx).sort()).toEqual(['batches', 'gym', 'messageLang', 'plans', 'today', 'trainers', 'weekday']);
  });
});
