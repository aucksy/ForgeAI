/**
 * F201 (03-design §6 and §7): doing what the owner CONFIRMED, through the panel's own ways of saving (the
 * same createMember / sellMembership / recordPayment ... the forms use, the Messages page's sendMessage).
 *
 * Credits: a task is one request of the owner (at most 3 actions). On Confirm the browser first spends the
 * task's credits (owner_ai_spend: atomic, refuses with NO_CREDITS), then runs each action; if any action
 * fails it asks for them back (owner_ai_refund, once, within 10 minutes). The same task twice is done once:
 * here (an in-flight and done list per task id), on the server (ALREADY_SPENT), and in each save (requestId).
 * A step that already saved is never saved again when the owner tries the task again.
 */
import { validateEnquiry } from '../logic/enquiries';
import { validateMember } from '../logic/members';
import { dietPayload, type DietPayload } from '../logic/dietPlans';
import type { MessageDraft, SentMessage } from '../shop/messages';
import { messageErrorWords, sendAtFromLocal } from '../shop/messages';
import type { EnquiryDraft, ExpenseDraft, MemberDraft, MemberView, WorkoutPlanDraft } from '../types';
import type { RecordPaymentInput, SellMembershipInput } from '../data/adapter';
import { line, type Line } from './catalogue';
import { checkDraft, messageReach, type Draft, type PlanData } from './plan';

/** The writes the assistant may make: the panel store's own (store.tsx useCrm). */
export interface AssistWriter {
  createMember(draft: MemberDraft): Promise<{ id: string }>;
  sellMembership(input: SellMembershipInput): Promise<{ membership: { id: string } }>;
  recordPayment(input: RecordPaymentInput): Promise<{ id: string }>;
  extendMembership(id: string, days: number, reason: string): Promise<{ id: string }>;
  createEnquiry(draft: EnquiryDraft): Promise<{ id: string }>;
  addExpense(draft: ExpenseDraft): Promise<{ id: string }>;
  saveWorkoutPlan(draft: WorkoutPlanDraft): Promise<{ id: string }>;
}

export interface ExecuteDeps {
  writer: AssistWriter;
  /** shop/api `call`: a Supabase RPC (15 s timeout). */
  rpc: <T>(fn: string, args: Record<string, unknown>) => Promise<T>;
  /** shop/api `sendMessage`. */
  sendMessage: (key: string, d: MessageDraft, opts: { to?: readonly string[] | null; sendAt?: string | null }) => Promise<SentMessage>;
  /** shop/bodyApi `saveDiet`. */
  saveDiet: (key: string, plan: DietPayload) => Promise<{ id: string }>;
  /** Hands the members without the app to the WhatsApp send queue (Messages page), with the words to send. */
  queueWhatsApp: (people: readonly MemberView[], text: string) => void;
  /** The owner key (p_key) of this panel. */
  key: string;
  /** Who is doing it (the receipt's "collected by", the plan's "sold by"). */
  taker: { id: string | null; name: string | null };
}

/** A task the owner confirmed: the request, and the drafts as he left them. */
export interface Task {
  /** One id per request: the server's task id (owner_ai_task_save) and the credits' key. */
  id: string;
  drafts: Draft[];
}

export interface StepResult {
  tool: Draft['tool'];
  ok: boolean;
  /** What happened, for the chat ("Saved", "Sent to 12 members in the app"). */
  words: Line;
  /** Where to see it. */
  path?: string;
}

export type ExecuteResult =
  | { ok: true; taskId: string; credits: number; balance: number | null; steps: StepResult[] }
  /** Nothing ran: a draft has a problem, or there are no credits. */
  | { ok: false; taskId: string; reason: 'invalid' | 'no_credits' | 'already' | 'spend_failed'; words: Line; steps: StepResult[] }
  /** Something ran and something failed; the credits were given back when `refunded`. */
  | { ok: false; taskId: string; reason: 'failed'; words: Line; steps: StepResult[]; refunded: boolean };

// ------------------------------------------------------------------ once only

const inFlight = new Map<string, Promise<ExecuteResult>>();
const finished = new Map<string, ExecuteResult>();
/** Steps that saved, by the draft's requestId (and its part): a retry never saves them twice. */
const savedSteps = new Map<string, string>();

/** For tests: forget every task. */
export function resetExecuteMemory(): void {
  inFlight.clear();
  finished.clear();
  savedSteps.clear();
}

async function once(stepKey: string, run: () => Promise<string>): Promise<string> {
  const had = savedSteps.get(stepKey);
  if (had !== undefined) return had;
  const id = await run();
  savedSteps.set(stepKey, id);
  return id;
}

/** The server's error code in an RPC error ("NO_CREDITS"), or ''. */
export function errorCode(err: unknown): string {
  const text = err instanceof Error ? err.message : typeof err === 'object' && err ? String((err as { message?: unknown }).message ?? '') : String(err ?? '');
  return /\b(NO_CREDITS|ALREADY_SPENT|ALREADY_REFUNDED|ALREADY_DONE|TOO_LATE|NOT_FOUND|SUSPENDED|INVALID|TOO_MANY|BAD_KEY)\b/.exec(text)?.[1] ?? '';
}

const CALM_FAIL = 'This did not save. Check the internet and try again.';

// ------------------------------------------------------------------ one step

async function runStep(dr: Draft, d: PlanData, deps: ExecuteDeps): Promise<StepResult> {
  const { writer, taker } = deps;
  const today = d.today;
  switch (dr.tool) {
    case 'add_member': {
      const v = validateMember(dr.form, today);
      if (!v.ok) return { tool: dr.tool, ok: false, words: line(v.message) };
      const memberId = await once(`${dr.requestId}:member`, async () => (await writer.createMember({ ...v.value, archived: false, photoUri: null })).id);
      if (dr.planId) {
        await once(`${dr.requestId}:sale`, async () =>
          (
            await writer.sellMembership({
              memberId,
              planId: dr.planId!,
              startsOn: dr.startsOn,
              priceP: dr.priceP,
              joiningFeeP: dr.joiningFeeP,
              notes: null,
              collectNowP: dr.collectNowP,
              method: dr.method,
              reference: null,
              paidOn: today,
              soldBy: taker.id,
              soldByName: taker.name,
              requestId: dr.requestId,
            })
          ).membership.id,
        );
      }
      return { tool: dr.tool, ok: true, words: line('{name} is added.', { name: v.value.fullName }), path: `/members/${encodeURIComponent(memberId)}` };
    }
    case 'renew': {
      await once(`${dr.requestId}:sale`, async () =>
        (
          await writer.sellMembership({
            memberId: dr.memberId,
            planId: dr.planId!,
            startsOn: dr.startsOn,
            priceP: dr.priceP,
            joiningFeeP: dr.joiningFeeP,
            notes: null,
            collectNowP: dr.collectNowP,
            method: dr.method,
            reference: null,
            paidOn: today,
            soldBy: taker.id,
            soldByName: taker.name,
            requestId: dr.requestId,
          })
        ).membership.id,
      );
      return { tool: dr.tool, ok: true, words: line('Plan renewed.'), path: `/members/${encodeURIComponent(dr.memberId)}` };
    }
    case 'record_payment': {
      await once(`${dr.requestId}:pay`, async () =>
        (
          await writer.recordPayment({
            memberId: dr.memberId,
            membershipId: dr.membershipId,
            amountP: dr.amountP,
            method: dr.method,
            paidOn: today,
            reference: null,
            note: dr.note || null,
            collectedBy: taker.id,
            collectedByName: taker.name,
            requestId: dr.requestId,
          })
        ).id,
      );
      return { tool: dr.tool, ok: true, words: line('Payment saved.'), path: `/members/${encodeURIComponent(dr.memberId)}` };
    }
    case 'extend': {
      await once(`${dr.requestId}:extend`, async () => (await writer.extendMembership(dr.membershipId!, dr.days, dr.reason)).id);
      return { tool: dr.tool, ok: true, words: line('Plan extended by {days} days.', { days: dr.days }), path: `/members/${encodeURIComponent(dr.memberId)}` };
    }
    case 'add_enquiry': {
      const v = validateEnquiry(dr.form, today);
      if (!v.ok) return { tool: dr.tool, ok: false, words: line(v.message) };
      await once(`${dr.requestId}:enquiry`, async () => (await writer.createEnquiry({ ...v.value, requestId: dr.requestId })).id);
      return { tool: dr.tool, ok: true, words: line('Enquiry saved.'), path: '/enquiries' };
    }
    case 'add_expense': {
      await once(`${dr.requestId}:expense`, async () =>
        (await writer.addExpense({ spentOn: dr.spentOn, amountP: dr.amountP, category: dr.category, note: dr.note || null, requestId: dr.requestId })).id,
      );
      return { tool: dr.tool, ok: true, words: line('Expense saved.'), path: '/expenses' };
    }
    case 'draft_workout_plan': {
      await once(`${dr.requestId}:workout`, async () => (await writer.saveWorkoutPlan(dr.plan)).id);
      return { tool: dr.tool, ok: true, words: line('Workout plan saved. Send it to members from Workouts.'), path: '/workouts' };
    }
    case 'draft_diet_plan': {
      const { payload, problem } = dietPayload(dr.diet);
      if (!payload) return { tool: dr.tool, ok: false, words: line(problem ?? CALM_FAIL) };
      await once(`${dr.requestId}:diet`, async () => (await deps.saveDiet(deps.key, payload)).id);
      return { tool: dr.tool, ok: true, words: line('Diet plan saved. Send it to members from Diet plans.'), path: '/diet' };
    }
    case 'draft_message': {
      const reach = messageReach(dr, d);
      if (!reach) return { tool: dr.tool, ok: false, words: line('This group could not be found. Pick another.') };
      const draft: MessageDraft = { kind: dr.kind, title: dr.title.trim(), body: dr.body.trim() };
      const when = dr.sendAt ? sendAtFromLocal(dr.sendAt, d.now) : null;
      if (when && !when.ok) return { tool: dr.tool, ok: false, words: line(when.problem) };
      const sendAt = when && when.ok ? when.iso : null;
      let inApp = 0;
      if (reach.everyone || (reach.appIds?.length ?? 0) > 0) {
        const id = await once(`${dr.requestId}:send`, async () => {
          const m = await deps.sendMessage(deps.key, draft, { to: reach.appIds, sendAt });
          return `${m.id}|${m.recipients}`;
        });
        inApp = Number(id.split('|')[1] ?? 0) || 0;
      }
      // Members without the app: the WhatsApp queue, the same as the Messages page.
      const queue = reach.whatsapp;
      if (queue.length > 0) deps.queueWhatsApp(queue, `${draft.title}\n\n${draft.body}`);
      const words =
        queue.length > 0
          ? line('Sent to {app} in the app. {wa} without the app are ready on WhatsApp.', { app: inApp, wa: queue.length })
          : line('Sent to {app} in the app.', { app: inApp });
      return { tool: dr.tool, ok: true, words, path: '/messages' };
    }
  }
}

/** What failed, in calm words; the error itself goes to the console (a "try again" must leave a trace). */
function failWords(dr: Draft, err: unknown): Line {
  console.warn('[assistant] step failed', dr.tool, dr.requestId, err);
  if (dr.tool === 'draft_message') return line(messageErrorWords(err));
  const text = err instanceof Error ? err.message : '';
  if (/already exists/i.test(text)) return line('A member with this mobile number already exists.');
  return line(CALM_FAIL);
}

// ------------------------------------------------------------------ the task

/** A short record of what was done, kept with the task (owner_ai_spend p_result, 20 000 letters at most). */
function resultOf(task: Task): Record<string, unknown> {
  return { drafts: task.drafts.map((d) => ({ tool: d.tool, requestId: d.requestId })) };
}

async function run(task: Task, d: PlanData, deps: ExecuteDeps): Promise<ExecuteResult> {
  const taskId = task.id;
  // 1. Every draft must pass its checks again, now, with today's records.
  for (const dr of task.drafts) {
    // A member this draft already added (a retry after the sale failed) now holds that mobile number.
    const added = dr.tool === 'add_member' && savedSteps.has(`${dr.requestId}:member`);
    const problems = checkDraft(dr, d).problems.filter((p) => !(added && p.field === 'phone'));
    if (problems.length > 0) return { ok: false, taskId, reason: 'invalid', words: problems[0].message, steps: [] };
  }
  const credits = task.drafts.reduce((n, dr) => n + dr.credits, 0);

  // 2. Spend first. Nothing runs without the credits.
  let balance: number | null = null;
  if (credits > 0) {
    try {
      const r = await deps.rpc<{ balance?: number } | null>('owner_ai_spend', { p_key: deps.key, p_task_id: taskId, p_credits: credits, p_result: resultOf(task) });
      balance = typeof r?.balance === 'number' ? r.balance : null;
    } catch (err) {
      const code = errorCode(err);
      console.warn('[assistant] spend failed', taskId, err);
      if (code === 'NO_CREDITS') return { ok: false, taskId, reason: 'no_credits', words: line('You have no AI credits left. Get credits to send this.'), steps: [] };
      if (code === 'ALREADY_SPENT') return { ok: false, taskId, reason: 'already', words: line('This was done already.'), steps: [] };
      return { ok: false, taskId, reason: 'spend_failed', words: line('The AI credits could not be checked. Check the internet and try again.'), steps: [] };
    }
  }

  // 3. Run each draft; stop at the first that fails.
  const steps: StepResult[] = [];
  for (const dr of task.drafts) {
    let step: StepResult;
    try {
      step = await runStep(dr, d, deps);
    } catch (err) {
      step = { tool: dr.tool, ok: false, words: failWords(dr, err) };
    }
    steps.push(step);
    if (!step.ok) {
      // 4. Give the credits back (once, within 10 minutes: the server's rule).
      let refunded = false;
      if (credits > 0) {
        try {
          await deps.rpc('owner_ai_refund', { p_key: deps.key, p_task_id: taskId });
          refunded = true;
        } catch (err) {
          console.warn('[assistant] refund failed', taskId, err);
        }
      }
      return { ok: false, taskId, reason: 'failed', words: step.words, steps, refunded };
    }
  }
  return { ok: true, taskId, credits, balance, steps };
}

/**
 * Do a confirmed task. Call ONLY from the owner's Confirm press. The same task id twice (a double tap, a
 * slow network) gives the first run's answer, never a second run.
 */
export function executeTask(task: Task, d: PlanData, deps: ExecuteDeps): Promise<ExecuteResult> {
  const done = finished.get(task.id);
  if (done) return Promise.resolve(done);
  const running = inFlight.get(task.id);
  if (running) return running;
  const p = run(task, d, deps).then(
    (r) => {
      inFlight.delete(task.id);
      // A task that never reached the server (no credits, a problem, no internet) may be tried again.
      if (r.ok || r.reason === 'failed' || r.reason === 'already') finished.set(task.id, r);
      return r;
    },
    (err: unknown) => {
      inFlight.delete(task.id);
      throw err;
    },
  );
  inFlight.set(task.id, p);
  return p;
}

/**
 * Save the drafted task on the server (no charge) when the drafts are shown: the history keeps it, and
 * owner_ai_spend needs it. Never throws: a task that could not be saved shows as a calm line, and Confirm
 * saves it again first.
 */
export async function saveTask(
  deps: Pick<ExecuteDeps, 'rpc' | 'key'>,
  task: { id: string; request: string; spoken: boolean; actions: readonly { tool: string; input: unknown }[] },
): Promise<boolean> {
  try {
    await deps.rpc('owner_ai_task_save', {
      p_key: deps.key,
      p_id: task.id,
      p_request: task.request.slice(0, 600),
      p_spoken: task.spoken,
      p_actions: task.actions.slice(0, 5),
    });
    return true;
  } catch (err) {
    console.warn('[assistant] task save failed', task.id, err);
    return false;
  }
}
