// F201 the AI plan writer, browser side (R-471): the card's starting choices, the gym's exercise list, the request
// body (no member data, focus masked), the check on the written plan, the plan card in the conversation, and the
// save that spends 3 credits only for a plan the AI wrote (refunded when the save fails).
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { writePlan } from '../../../src/crm/assistant/api';
import type { Action } from '../../../src/crm/assistant/catalogue';
import { cardsFor, chooseOnCard, writerCard, type WorkoutWriterCard } from '../../../src/crm/assistant/conversation';
import { executeTask, resetExecuteMemory, type ExecuteDeps } from '../../../src/crm/assistant/execute';
import { aiPlanDraft, checkDraft, planAction, type Draft } from '../../../src/crm/assistant/plan';
import { gymExerciseList, planAskFrom, planLang, planRequestBody, writtenPlan, PLAN_LIST_MAX } from '../../../src/crm/assistant/planWriter';
import { planSaveWords } from '../../../src/crm/assistant/ui/Cards';
import { EXERCISE_CATALOG } from '../../../src/crm/logic/exerciseCatalog';
import type { WorkoutPlan, WorkoutPlanDraft } from '../../../src/crm/types';
import { planData } from './gym';

const d = planData();
let n = 0;
const newId = () => `id-${(n += 1)}`;

const workoutAction = (over: Record<string, unknown> = {}): Action =>
  ({ tool: 'draft_workout_plan', input: { member: 'Pooja', goal: 'fat_loss', days_per_week: 3, level: 'beginner', notes: 'Knee pain', ...over } }) as Action;

/** What the server sends back (assistPlan.js cleanPlan): two days of library exercises. */
function serverPlan(): WorkoutPlanDraft {
  const ex = (key: string) => {
    const e = EXERCISE_CATALOG.find((x) => x.key === key)!;
    return { name: e.name, catalogKey: e.key, logType: e.logType, sets: 3, repMin: 8, repMax: 12, primary: [...e.primary], restSec: 90, note: null };
  };
  return {
    name: 'Fat loss · 2 days · Beginner',
    note: 'Warm up first.',
    routines: [
      { name: 'Day 1 · Upper', dayType: 'upper', exercises: [ex('barbell_bench_press'), ex('dumbbell_fly')] },
      { name: 'Day 2 · Upper', dayType: 'upper', exercises: [ex('incline_dumbbell_press'), ex('cable_fly')] },
    ],
    assign: { memberIds: [], planIds: [] },
  };
}

describe('the plan writer card starts from what the AI heard', () => {
  it('maps the catalogue goals onto the writer goals; days default to 4 and stay 2-6', () => {
    expect(planAskFrom({ goal: 'muscle_gain', level: 'advanced', days_per_week: 5, notes: ' Home  gym ', member: '' })).toEqual({ goal: 'muscle', level: 'advanced', days: 5, focus: 'Home gym' });
    expect(planAskFrom({ goal: 'beginner', level: 'advanced', days_per_week: 0, notes: '', member: '' })).toEqual({ goal: 'general', level: 'beginner', days: 4, focus: '' });
    expect(planAskFrom({ goal: 'general_fitness', level: 'intermediate', days_per_week: 9, notes: '', member: '' }).days).toBe(6);
    expect(planAskFrom({ goal: 'strength', level: 'beginner', days_per_week: 1, notes: '', member: '' })).toMatchObject({ goal: 'strength', days: 2 });
    expect(planAskFrom(null)).toEqual({ goal: 'general', level: 'beginner', days: 4, focus: '' });
  });

  it('a draft_workout_plan request becomes the writer card, with the one member it names; a diet stays "not yet"', () => {
    const cards = cardsFor([workoutAction(), { tool: 'draft_diet_plan', input: { member: '', goal: 'fat_loss', food: 'veg', notes: '' } } as Action], d, newId);
    expect(cards).toHaveLength(2);
    const w = cards[0] as WorkoutWriterCard;
    expect(w).toMatchObject({ kind: 'plan_writer', what: 'workout', memberId: 'm_pooja', status: 'open', plan: null, ask: { goal: 'fat_loss', days: 3 } });
    expect(w.taskId).not.toBe(w.requestId);
    expect(cards[1]).toEqual({ kind: 'plan_writer', id: expect.any(String), what: 'diet' });
  });

  it('two members of that name: he picks one on the card; nobody of that name: the card says so, no member', () => {
    const two = writerCard(workoutAction({ member: 'Rahul' }) as never, d, newId);
    expect(two.memberId).toBe('');
    expect(two.options.map((o) => o.memberId).sort()).toEqual(['m_rahul_m', 'm_rahul_s']);
    const picked = chooseOnCard(two, 'm_rahul_s', d) as WorkoutWriterCard;
    expect(picked).toMatchObject({ memberId: 'm_rahul_s', options: [] });
    const none = writerCard(workoutAction({ member: 'Zorawar' }) as never, d, newId);
    expect(none).toMatchObject({ memberId: '', options: [], memberTyped: 'Zorawar' });
    expect(writerCard(workoutAction({ member: '' }) as never, d, newId)).toMatchObject({ memberId: '', memberTyped: '' });
  });

  it('a plan is never a draft straight from the request (no template is ever sold as AI)', () => {
    expect(planAction(workoutAction(), d, 'r1')).toBeNull();
    expect(planAction({ tool: 'draft_diet_plan', input: { member: 'Pooja', goal: 'fat_loss', food: 'veg', notes: '' } } as Action, d, 'r2')).toBeNull();
  });
});

describe('what goes to the writer', () => {
  it('the library, then the exercises the gym typed itself (custom, with a main muscle), at most 500', () => {
    const own: Pick<WorkoutPlan, 'routines'>[] = [
      {
        routines: [
          {
            name: 'Day 1',
            dayType: 'full',
            exercises: [
              { name: 'Tyre flip', catalogKey: null, logType: 'reps', sets: 3, repMin: 5, repMax: 8, primary: ['glutes', 'quads'] },
              { name: 'tyre  flip', catalogKey: null, logType: 'reps', sets: 3, repMin: 5, repMax: 8, primary: ['glutes'] },
              { name: 'Mystery move', catalogKey: null, logType: 'reps', sets: 3, repMin: 5, repMax: 8, primary: [] },
              { name: 'Barbell Bench Press', catalogKey: 'barbell_bench_press', logType: 'weight_reps', sets: 3, repMin: 5, repMax: 8, primary: ['chest'] },
            ],
          },
        ],
      },
    ];
    const list = gymExerciseList(own);
    expect(list).toHaveLength(EXERCISE_CATALOG.length + 1);
    expect(list[0]).toEqual({ key: EXERCISE_CATALOG[0].key, name: EXERCISE_CATALOG[0].name, kind: EXERCISE_CATALOG[0].logType, primary: [...EXERCISE_CATALOG[0].primary] });
    expect(list.at(-1)).toEqual({ key: 'custom_1', name: 'Tyre flip', kind: 'reps', primary: ['glutes', 'quads'], custom: true });
    expect(list.every((e) => /^[a-z0-9_]{1,60}$/.test(e.key))).toBe(true);
    expect(gymExerciseList(null)).toHaveLength(EXERCISE_CATALOG.length);
    expect(PLAN_LIST_MAX).toBe(500);
  });

  it('the body carries the choices and the list, never a member; Hindi only when the gym writes to members in Hindi', () => {
    const body = planRequestBody({ goal: 'muscle', level: 'beginner', days: 4, focus: 'x'.repeat(300) }, gymExerciseList([]), planLang('hi'));
    expect(body).toMatchObject({ what: 'workout', goal: 'muscle', level: 'beginner', days_per_week: 4, lang: 'hi' });
    expect(body.focus).toHaveLength(200);
    expect(JSON.stringify(body)).not.toMatch(/Pooja|m_pooja|98000/);
    expect(planLang('both')).toBe('en');
    expect(planLang('en')).toBe('en');
  });

  it('POST /api/assist/plan with the panel key; a phone in the focus is masked; refusals come back in calm words', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const seen: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];
    const ok = vi.fn(async (url: string, init: RequestInit) => {
      seen.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ plan: serverPlan(), summary: 'A 2-day plan.', left: 41, dropped: 0 }), { status: 200 });
    });
    const r = await writePlan('key-1', { focus: 'call me 98290 11111', goal: 'fat_loss' }, ok as unknown as typeof fetch);
    expect(r).toMatchObject({ ok: true, summary: 'A 2-day plan.', left: 41 });
    expect(seen[0].url).toBe('/api/assist/plan');
    expect(seen[0].headers['X-Forge-Key']).toBe('key-1');
    expect(seen[0].body.focus).toBe('call me [PHONE_1]');

    const limit = vi.fn(async () => new Response(JSON.stringify({ reason: 'limit', error: 'You have asked a lot today.' }), { status: 429 }));
    expect(await writePlan('k', { focus: '' }, limit as unknown as typeof fetch)).toMatchObject({ ok: false, status: 429, reason: 'limit', words: { text: 'You have asked a lot today.' } });
    const off = vi.fn(async () => new Response(JSON.stringify({ reason: 'off', error: 'Switched off.' }), { status: 503 }));
    expect(await writePlan('k', { focus: '' }, off as unknown as typeof fetch)).toMatchObject({ ok: false, status: 503, reason: 'off' });
    const down = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await writePlan('k', { focus: '' }, down as unknown as typeof fetch)).toMatchObject({ ok: false, status: 0, reason: 'offline' });
  });
});

describe('the written plan', () => {
  it('is made ready for the builder: sent only to the member it is for, named for them', () => {
    const p = writtenPlan(serverPlan(), { id: 'm_pooja', name: 'Pooja Verma' })!;
    expect(p.name).toBe('Fat loss · 2 days · Beginner · Pooja Verma');
    expect(p.assign).toEqual({ memberIds: ['m_pooja'], planIds: [] });
    expect(p.routines).toHaveLength(2);
    expect(p.id).toBeNull();
    expect(writtenPlan(serverPlan(), null)!.assign.memberIds).toEqual([]);
  });

  it('a broken plan is refused, never shown for credits', () => {
    expect(writtenPlan(null, null)).toBeNull();
    expect(writtenPlan({ name: 'x', routines: 'no' }, null)).toBeNull();
    expect(writtenPlan({ name: 'x', routines: [{ name: 'D', dayType: 'full', exercises: [{ sets: 3 }] }] }, null)).toBeNull();
    expect(writtenPlan({ ...serverPlan(), routines: [] }, null)).toBeNull();
    const tooMany = serverPlan();
    tooMany.routines[0].exercises[0].sets = 99;
    expect(writtenPlan(tooMany, null)).toBeNull();
  });

  it('the Save button carries the price, or "Get credits to save"', () => {
    expect(planSaveWords(20)).toEqual({ label: { text: 'Save plan · {credits} credits', vars: { credits: 3 } }, needCredits: false });
    expect(planSaveWords(2)).toEqual({ label: { text: 'Get credits to save' }, needCredits: true });
    expect(planSaveWords(null).needCredits).toBe(false);
  });
});

describe('saving a plan the AI wrote: 3 credits, given back on a failed save', () => {
  beforeEach(() => {
    resetExecuteMemory();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  function fakeDeps(saveFails = false) {
    const calls: string[] = [];
    const saveWorkoutPlan = vi.fn(async () => {
      calls.push('saveWorkoutPlan');
      if (saveFails) throw new Error('Failed to fetch');
      return { id: 'wp_1' };
    });
    const deps = {
      writer: { saveWorkoutPlan },
      rpc: vi.fn(async (fn: string) => {
        calls.push(fn);
        return { balance: 38 };
      }),
      key: 'owner-key',
      taker: { id: 'u1', name: 'Owner' },
    } as unknown as ExecuteDeps;
    return { deps, calls, saveWorkoutPlan };
  }

  it('spends 3 first, then saves the plan for the member, stamped with who made it', async () => {
    const plan = writtenPlan(serverPlan(), { id: 'm_pooja', name: 'Pooja Verma' })!;
    const { deps, calls, saveWorkoutPlan } = fakeDeps();
    const r = await executeTask({ id: 't-plan', drafts: [aiPlanDraft(plan, 'm_pooja', 'req-p')] }, d, deps);
    expect(r).toMatchObject({ ok: true, credits: 3, balance: 38 });
    expect(calls).toEqual(['owner_ai_spend', 'saveWorkoutPlan']);
    expect(deps.rpc).toHaveBeenCalledWith('owner_ai_spend', expect.objectContaining({ p_task_id: 't-plan', p_credits: 3 }));
    expect(saveWorkoutPlan).toHaveBeenCalledWith(expect.objectContaining({ assign: { memberIds: ['m_pooja'], planIds: [] }, createdBy: 'u1', createdByName: 'Owner' }));
    expect(r.ok && r.steps[0].words).toEqual({ text: 'Workout plan saved for {name}. It is in Workout plans.', vars: { name: 'Pooja Verma' } });
  });

  it('a failed save gives the 3 credits back', async () => {
    const plan = writtenPlan(serverPlan(), null)!;
    const { deps, calls } = fakeDeps(true);
    const r = await executeTask({ id: 't-plan-2', drafts: [aiPlanDraft(plan, '', 'req-q')] }, d, deps);
    expect(r).toMatchObject({ ok: false, reason: 'failed', refunded: true });
    expect(calls).toEqual(['owner_ai_spend', 'saveWorkoutPlan', 'owner_ai_refund']);
  });

  it('a plan not written by the AI, or one the builder would refuse, spends nothing', async () => {
    const plan = writtenPlan(serverPlan(), null)!;
    const { deps, calls } = fakeDeps();
    const template = { ...aiPlanDraft(plan, '', 'req-t'), writtenBy: 'template' } as unknown as Draft;
    expect(checkDraft(template, d).problems.map((p) => p.message.text)).toContain('Only a plan the AI wrote uses credits.');
    expect(await executeTask({ id: 't-t', drafts: [template] }, d, deps)).toMatchObject({ ok: false, reason: 'invalid' });
    const empty = aiPlanDraft({ ...plan, name: '  ' }, '', 'req-e');
    expect(await executeTask({ id: 't-e', drafts: [empty] }, d, deps)).toMatchObject({ ok: false, reason: 'invalid' });
    expect(calls).toEqual([]);
  });
});
