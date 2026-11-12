// F201: drafts and their checks (plan.ts), and doing a confirmed task with credits spent first and given
// back on failure, once only (execute.ts).
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Action, ToolInputs } from '../../../src/crm/assistant/catalogue';
import { executeTask, resetExecuteMemory, saveTask, type AssistWriter, type ExecuteDeps } from '../../../src/crm/assistant/execute';
import { checkDraft, messageReach, messageWords, planAction, type Draft, type MessageDraftA, type PlanData } from '../../../src/crm/assistant/plan';
import type { SentMessage } from '../../../src/crm/shop/messages';
import { NOW, planData, TODAY } from './gym';

const d = planData();

function draftOf(action: Action, data: PlanData = d, chosen?: string): Draft {
  const r = planAction(action, data, `req-${action.tool}`, chosen);
  if (!r || r.kind !== 'draft') throw new Error(`no draft: ${JSON.stringify(r)}`);
  return r.draft;
}

const message = (over: Partial<ToolInputs['draft_message']> = {}): Action => ({
  tool: 'draft_message',
  input: {
    audience: { group: 'ending', days: 0, plan: '', batch: '', trainer: '', names: [] },
    kind: 'reminder',
    lang: 'en',
    title_en: 'Your plan ends soon',
    body_en: 'Renew this week and keep your streak going.',
    title_hi: '',
    body_hi: '',
    send_at: '',
    offer: '',
    ...over,
  },
});

const sentAt = (ms: number, kind: SentMessage['kind'] = 'announcement'): SentMessage => ({
  id: `s${ms}${kind}`, kind, title: 't', body: 'b', createdAt: ms, recipients: 5, seen: 0, withdrawn: false, sendAt: null, toGroup: false,
});

const fields = (dr: Draft, data: PlanData = d) => checkDraft(dr, data).problems.map((p) => p.field);

describe('drafts', () => {
  it('add_member: name, phone, plan by months, the money; the form and the sale rules check it', () => {
    const dr = draftOf({
      tool: 'add_member',
      input: { name: 'Ramesh Kumar', phone: '98290 11111', gender: 'male', plan: '', months: 3, start: '', amount_paid: 4500, method: 'upi', batch: 'morning 6-8', notes: '' },
    });
    expect(dr).toMatchObject({ tool: 'add_member', planId: 'plan_q', startsOn: TODAY, priceP: 450_000, collectNowP: 450_000, method: 'upi', credits: 1 });
    expect(dr.tool === 'add_member' && dr.form).toMatchObject({ fullName: 'Ramesh Kumar', dialCode: '+91', phone: '9829011111' });
    expect(fields(dr)).toEqual([]);
    // The mobile of a member already on the list is refused, like the form.
    const same = draftOf({ tool: 'add_member', input: { name: 'Another Pooja', phone: '+91 98000 00002', gender: '', plan: 'Monthly', months: 0, start: '', amount_paid: 0, method: 'none', batch: '', notes: '' } });
    expect(fields(same)).toEqual(['phone']);
    // More money than the plan costs is refused.
    const over = draftOf({ tool: 'add_member', input: { name: 'Ravi Jain', phone: '9829033333', gender: '', plan: 'Monthly', months: 0, start: '', amount_paid: 5000, method: 'cash', batch: '', notes: '' } });
    expect(fields(over)).toEqual(['collectNowP']);
  });

  it('renew: starts the day after the current plan ends; a member who is not there is offered as new', () => {
    const dr = draftOf({ tool: 'renew', input: { member: 'Preeti', plan: '', months: 0, amount_paid: 1200, method: 'cash' } });
    expect(dr).toMatchObject({ tool: 'renew', memberId: 'm_preeti', planId: 'plan_m', startsOn: '2026-11-16', priceP: 120_000 });
    expect(fields(dr)).toEqual([]);
    const ended = draftOf({ tool: 'renew', input: { member: 'Vikas', plan: 'Quarterly', months: 0, amount_paid: 0, method: 'none' } });
    expect(ended).toMatchObject({ planId: 'plan_q', startsOn: TODAY });
    expect(planAction({ tool: 'renew', input: { member: 'Rahul', plan: '', months: 0, amount_paid: 0, method: 'none' } }, d, 'r')?.kind).toBe('choose');
    expect(planAction({ tool: 'renew', input: { member: 'Ankit', plan: '', months: 0, amount_paid: 0, method: 'none' } }, d, 'r')).toMatchObject({
      kind: 'not_found',
      followUps: [{ request: 'Add Ankit as a new member' }],
    });
  });

  it('record_payment: against the open due; more than owed, ₹0, or nobody owing is refused', () => {
    const dr = draftOf({ tool: 'record_payment', input: { member: 'pooja', amount: 2000, method: 'upi', note: '' } });
    expect(dr).toMatchObject({ memberId: 'm_pooja', membershipId: 'ms_pooja', amountP: 200_000 });
    expect(fields(dr)).toEqual([]);
    expect(fields({ ...dr, amountP: 250_000 } as Draft)).toEqual(['amountP']);
    expect(fields({ ...dr, amountP: 0 } as Draft)).toEqual(['amountP']);
    expect(fields(draftOf({ tool: 'record_payment', input: { member: 'Preeti', amount: 500, method: 'cash', note: '' } }))).toEqual(['memberId']);
  });

  it('extend, enquiry, expense: days, names, dates checked', () => {
    const ext = draftOf({ tool: 'extend', input: { member: 'Pooja', days: 7, reason: 'travel' } });
    expect(ext).toMatchObject({ membershipId: 'ms_pooja', days: 7 });
    expect(fields(ext)).toEqual([]);
    expect(fields({ ...ext, days: 0 } as Draft)).toEqual(['days']);
    expect(fields({ ...ext, days: 120 } as Draft)).toEqual(['days']);
    expect(fields(draftOf({ tool: 'extend', input: { member: 'Sanjay', days: 3, reason: 'ill' } }))).toEqual(['membershipId']);

    const enq = draftOf({ tool: 'add_enquiry', input: { name: 'Kiran', phone: '9811122233', interest: '3 months', follow_up: '', notes: 'evening' } });
    expect(enq.tool === 'add_enquiry' && enq.form).toMatchObject({ name: 'Kiran', interest: '3 months · evening', followUpOn: '2026-11-13' });
    expect(fields(enq)).toEqual([]);

    const exp = draftOf({ tool: 'add_expense', input: { amount: 1500, category: 'repairs', date: '', method: 'upi', note: 'treadmill belt' } });
    expect(exp).toMatchObject({ spentOn: TODAY, amountP: 150_000, category: 'repairs', note: 'treadmill belt · UPI' });
    expect(fields(exp)).toEqual([]);
    expect(fields({ ...exp, spentOn: '2026-11-20' } as Draft)).toEqual(['spentOn']);
    expect(fields({ ...exp, amountP: 0 } as Draft)).toEqual(['amountP']);
  });

  it('workout and diet plans: from the ready-made plans, saved with nobody assigned', () => {
    const w = draftOf({ tool: 'draft_workout_plan', input: { member: 'Pooja', goal: 'muscle_gain', days_per_week: 4, level: 'intermediate', notes: '' } });
    expect(w).toMatchObject({ memberId: 'm_pooja', templateKey: 'gym_upper_lower_intermediate', credits: 3 });
    expect(w.tool === 'draft_workout_plan' && w.plan.assign).toEqual({ memberIds: [], planIds: [] });
    expect(fields(w)).toEqual([]);
    const diet = draftOf({ tool: 'draft_diet_plan', input: { member: '', goal: 'fat_loss', food: 'veg', notes: '' } });
    expect(diet).toMatchObject({ memberId: '', templateKey: 'fat-loss-veg-1600' });
  });
});

describe('message drafts and the server limits', () => {
  it('the words for the chosen language; "gym" follows the Messages page', () => {
    const i = (message({ title_hi: 'Plan khatam', body_hi: 'Is hafte renew karein' }).input as ToolInputs['draft_message']);
    expect(messageWords({ ...i, lang: 'hi' }, 'en')).toEqual({ title: 'Plan khatam', body: 'Is hafte renew karein' });
    expect(messageWords({ ...i, lang: 'both' }, 'en').body).toBe('Renew this week and keep your streak going.\n\nIs hafte renew karein');
    expect(messageWords({ ...i, lang: 'gym' }, 'hi').title).toBe('Plan khatam');
  });

  it('reaches app members by id and the rest on WhatsApp', () => {
    const dr = draftOf(message({ audience: { group: 'members', days: 0, plan: '', batch: '', trainer: '', names: ['Preeti', 'Pooja'] } })) as MessageDraftA;
    const reach = messageReach(dr, d)!;
    expect(reach.appIds).toEqual(['app_preeti']);
    expect(reach.whatsapp.map((v) => v.member.id)).toEqual(['m_pooja']);
    const all = messageReach(draftOf(message({ audience: { group: 'everyone', days: 0, plan: '', batch: '', trainer: '', names: [] } })) as MessageDraftA, d)!;
    expect(all.appIds).toBeNull();
    expect(all.whatsapp).toHaveLength(4);
  });

  it('title 60 and message 300 letters at most; a time in the past is refused', () => {
    const dr = draftOf(message()) as MessageDraftA;
    expect(fields(dr)).toEqual([]);
    expect(fields({ ...dr, title: 'x'.repeat(61) })).toEqual(['title']);
    expect(fields({ ...dr, body: 'x'.repeat(301) })).toEqual(['body']);
    expect(fields({ ...dr, sendAt: '2026-11-12T08:00' })).toEqual(['sendAt']);
    expect(fields({ ...dr, sendAt: '2026-11-13T08:00' })).toEqual([]);
  });

  it('10 a day; an offer or event 1 a day and 3 a week; quiet from the 3rd', () => {
    const dr = draftOf(message({ kind: 'offer' })) as MessageDraftA;
    const today = (n: number) => Array.from({ length: n }, (_, i) => sentAt(NOW - (i + 1) * 60_000));
    expect(fields(dr, { ...d, sent: today(10) })).toEqual(['kind']);
    expect(fields(dr, { ...d, sent: [sentAt(NOW - 60_000, 'offer')] })).toEqual(['kind']);
    const day = 86_400_000;
    expect(fields(dr, { ...d, sent: [1, 2, 3].map((n) => sentAt(NOW - n * day, 'event')) })).toEqual(['kind']);
    expect(fields(dr, { ...d, sent: [1, 2].map((n) => sentAt(NOW - n * day, 'event')) })).toEqual([]);
    const third = checkDraft({ ...dr, kind: 'reminder' }, { ...d, sent: today(2) });
    expect(third.problems).toEqual([]);
    expect(third.warnings[0].text).toMatch(/3rd message today/);
  });

  it('a group with nobody in it is refused', () => {
    const dr = draftOf(message({ audience: { group: 'birthday_week', days: 0, plan: '', batch: '', trainer: '', names: [] } }), { ...d, today: '2026-06-01' });
    expect(fields(dr, { ...d, today: '2026-06-01' })).toContain('group');
  });
});

// ------------------------------------------------------------------ execute

function fakeDeps(over: Partial<ExecuteDeps> = {}) {
  const calls: string[] = [];
  const writer: AssistWriter = {
    createMember: vi.fn(async () => { calls.push('createMember'); return { id: 'm_new' }; }),
    sellMembership: vi.fn(async () => { calls.push('sellMembership'); return { membership: { id: 'ms_new' } }; }),
    recordPayment: vi.fn(async () => { calls.push('recordPayment'); return { id: 'pay_new' }; }),
    extendMembership: vi.fn(async () => { calls.push('extendMembership'); return { id: 'ms_x' }; }),
    createEnquiry: vi.fn(async () => { calls.push('createEnquiry'); return { id: 'e_new' }; }),
    addExpense: vi.fn(async () => { calls.push('addExpense'); return { id: 'x_new' }; }),
    saveWorkoutPlan: vi.fn(async () => { calls.push('saveWorkoutPlan'); return { id: 'wp_new' }; }),
  };
  const deps: ExecuteDeps = {
    writer,
    rpc: vi.fn(async (fn: string) => {
      calls.push(fn);
      return (fn === 'owner_ai_spend' ? { balance: 41 } : { ok: true }) as never;
    }) as unknown as ExecuteDeps['rpc'],
    sendMessage: vi.fn(async () => {
      calls.push('sendMessage');
      return sentAt(NOW, 'reminder');
    }),
    saveDiet: vi.fn(async () => { calls.push('saveDiet'); return { id: 'diet_new' }; }),
    queueWhatsApp: vi.fn(() => { calls.push('queueWhatsApp'); }),
    key: 'owner-key-123456789',
    taker: { id: 'u1', name: 'Owner' },
    ...over,
  };
  return { deps, calls, writer };
}

describe('doing a confirmed task', () => {
  beforeEach(() => {
    resetExecuteMemory();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it('spends the credits first, then saves through the panel\'s own methods', async () => {
    const { deps, calls, writer } = fakeDeps();
    const pay = draftOf({ tool: 'record_payment', input: { member: 'pooja', amount: 2000, method: 'upi', note: '' } });
    const r = await executeTask({ id: 't1', drafts: [pay] }, d, deps);
    expect(r).toMatchObject({ ok: true, credits: 1, balance: 41 });
    expect(calls).toEqual(['owner_ai_spend', 'recordPayment']);
    expect(deps.rpc).toHaveBeenCalledWith('owner_ai_spend', expect.objectContaining({ p_key: deps.key, p_task_id: 't1', p_credits: 1 }));
    expect(writer.recordPayment).toHaveBeenCalledWith(expect.objectContaining({ memberId: 'm_pooja', membershipId: 'ms_pooja', amountP: 200_000, method: 'upi', paidOn: TODAY, requestId: 'req-record_payment' }));
  });

  it('a message: the app members by id, the rest to the WhatsApp queue', async () => {
    const { deps, calls } = fakeDeps();
    const dr = draftOf(message({ audience: { group: 'members', days: 0, plan: '', batch: '', trainer: '', names: ['Preeti', 'Pooja'] } }));
    const r = await executeTask({ id: 't-msg', drafts: [dr] }, d, deps);
    expect(r.ok).toBe(true);
    expect(calls).toEqual(['owner_ai_spend', 'sendMessage', 'queueWhatsApp']);
    expect(deps.sendMessage).toHaveBeenCalledWith(deps.key, { kind: 'reminder', title: 'Your plan ends soon', body: 'Renew this week and keep your streak going.' }, { to: ['app_preeti'], sendAt: null });
    expect((deps.queueWhatsApp as ReturnType<typeof vi.fn>).mock.calls[0][0].map((v: { member: { id: string } }) => v.member.id)).toEqual(['m_pooja']);
  });

  it('gives the credits back when a step fails, and says it calmly (the error is logged)', async () => {
    const { deps, calls } = fakeDeps();
    (deps.writer.addExpense as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Failed to fetch'));
    const dr = draftOf({ tool: 'add_expense', input: { amount: 1500, category: 'repairs', date: '', method: 'none', note: '' } });
    const r = await executeTask({ id: 't2', drafts: [dr] }, d, deps);
    expect(r).toMatchObject({ ok: false, reason: 'failed', refunded: true, words: { text: 'This did not save. Check the internet and try again.' } });
    expect(calls).toEqual(['owner_ai_spend', 'owner_ai_refund']);
    expect(console.warn).toHaveBeenCalled();
  });

  it('no credits: nothing runs', async () => {
    const { deps, calls } = fakeDeps({
      rpc: vi.fn(async () => {
        throw new Error('NO_CREDITS');
      }) as unknown as ExecuteDeps['rpc'],
    });
    const dr = draftOf({ tool: 'extend', input: { member: 'Pooja', days: 7, reason: 'travel' } });
    const r = await executeTask({ id: 't3', drafts: [dr] }, d, deps);
    expect(r).toMatchObject({ ok: false, reason: 'no_credits', words: { text: 'You have no AI credits left. Get credits to send this.' } });
    expect(calls).toEqual([]);
  });

  it('a draft with a problem: no credits spent, nothing saved', async () => {
    const { deps, calls } = fakeDeps();
    const dr = draftOf({ tool: 'add_expense', input: { amount: 0, category: 'rent', date: '', method: 'none', note: '' } });
    const r = await executeTask({ id: 't4', drafts: [dr] }, d, deps);
    expect(r).toMatchObject({ ok: false, reason: 'invalid' });
    expect(calls).toEqual([]);
  });

  it('the same task twice (a double tap) is done once', async () => {
    const { deps, calls } = fakeDeps();
    const dr = draftOf({ tool: 'add_enquiry', input: { name: 'Kiran', phone: '9811122233', interest: '', follow_up: '', notes: '' } });
    const [a, b] = await Promise.all([executeTask({ id: 't5', drafts: [dr] }, d, deps), executeTask({ id: 't5', drafts: [dr] }, d, deps)]);
    const c = await executeTask({ id: 't5', drafts: [dr] }, d, deps);
    expect(a).toBe(b);
    expect(c).toBe(a);
    expect(calls).toEqual(['owner_ai_spend', 'createEnquiry']);
  });

  it('a retry after a failure never saves a step twice (the member was added, the sale failed)', async () => {
    const { deps, calls, writer } = fakeDeps();
    (writer.sellMembership as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('timed out'));
    const dr = draftOf({ tool: 'add_member', input: { name: 'Ramesh Kumar', phone: '9829011111', gender: '', plan: 'Monthly', months: 0, start: '', amount_paid: 0, method: 'none', batch: '', notes: '' } });
    expect((await executeTask({ id: 't6', drafts: [dr] }, d, deps)).ok).toBe(false);
    // The panel tries again as a new task (the server allows one spend a task); the same draft keeps its requestId.
    // By now the store holds the new member, with that mobile number: the retry must not refuse it.
    const after = planData();
    after.snapshot.members.push({ ...after.snapshot.members[0], id: 'm_new', fullName: 'Ramesh Kumar', phone: '+919829011111' });
    expect((await executeTask({ id: 't6b', drafts: [dr] }, after, deps)).ok).toBe(true);
    expect(writer.createMember).toHaveBeenCalledTimes(1);
    expect(writer.sellMembership).toHaveBeenCalledTimes(2);
    expect(writer.sellMembership).toHaveBeenLastCalledWith(expect.objectContaining({ memberId: 'm_new', planId: 'plan_m' }));
    expect(calls.filter((c) => c === 'owner_ai_refund')).toHaveLength(1);
  });

  it('saving the drafted task is free and never throws', async () => {
    const { deps } = fakeDeps();
    expect(await saveTask(deps, { id: 't7', request: 'Pooja ne 2000 diye', spoken: true, actions: [] })).toBe(true);
    expect(deps.rpc).toHaveBeenCalledWith('owner_ai_task_save', { p_key: deps.key, p_id: 't7', p_request: 'Pooja ne 2000 diye', p_spoken: true, p_actions: [] });
    const failing = fakeDeps({ rpc: vi.fn(async () => { throw new Error('offline'); }) as unknown as ExecuteDeps['rpc'] });
    expect(await saveTask(failing.deps, { id: 't8', request: 'x', spoken: false, actions: [] })).toBe(false);
  });
});
