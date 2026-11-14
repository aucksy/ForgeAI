/**
 * F201 (03-design §2 B-E and §6): every action that sends or changes something becomes an EDITABLE draft
 * first. Nothing here writes: execute.ts does, and only after the owner presses Confirm. Each draft is checked
 * with the rules the matching form already uses (validateMember, validateSale, validateEnquiry, the message
 * limits), so the assistant can never save what the page itself would refuse. PURE.
 */
import { endDateForPlan } from '../logic/membership';
import { addDays, diffDays, isValidDateISO, type DateISO } from '../logic/dates';
import { emptyEnquiryForm, validateEnquiry, type EnquiryFormDraft } from '../logic/enquiries';
import { emptyMemberForm, findDuplicatePhone, validateMember, type MemberFormDraft } from '../logic/members';
import { bothTitle } from '../logic/messageTemplates';
import { dayMonth, weekdayDayMonth, type MessageLang as GymMessageLang } from '../logic/messageWords';
import { formatINR, rupeesToPaise, type Paise } from '../logic/money';
import { owedListOn } from '../logic/ownerNumbers';
import { saleDefaults, validateSale } from '../logic/selling';
import { workoutPlanProblem } from '../logic/workoutPlans';
import type { DietDraft } from '../logic/dietPlans';
import { appIdsOf, appPhones, withoutApp } from '../logic/audience';
import { calmNudge, capProblem, draftProblem, sendAtFromLocal, type MessageKind, type SentMessage } from '../shop/messages';
import type { ExpenseCategory, MemberView, Membership, PaymentMethod, Plan, WorkoutPlanDraft } from '../types';
import { membersInGroup, pickMember, type AnswerData, type AnswerRow, type FollowUp } from './answer';
import { bestMatch, matchMember } from './match';
import { line, TOOL_CREDITS, type Action, type Line, type MemberGroup, type PayMethodSaid, type ToolInputs, type ToolName } from './catalogue';

/** What a draft may read, on top of what an answer reads. */
export interface PlanData extends AnswerData {
  role: 'owner' | 'staff';
  /** The gym's messages so far (shop/api listMessages), for the daily and weekly limits; null = not loaded. */
  sent: readonly SentMessage[] | null;
  /** The gym's app members (shop/api listAppMembers); null = not loaded. */
  appMembers: readonly { memberId: string; phone: string | null }[] | null;
  /** The language the gym's messages go in (Messages page, logic/sendQueue readLang). */
  gymLang: GymMessageLang;
}

export interface Problem {
  /** The draft field at fault (the screen marks that box). */
  field: string;
  message: Line;
}

interface DraftBase {
  /** One id per draft: the same id twice is done once (execute.ts), and the server dedupes it too. */
  requestId: string;
  credits: number;
}

export interface MessageDraftA extends DraftBase {
  tool: 'draft_message';
  group: MemberGroup;
  days: number;
  plan: string;
  batch: string;
  trainer: string;
  /** For group "members": the members named. */
  memberIds: string[];
  kind: MessageKind;
  title: string;
  body: string;
  /** '' = now; else 'YYYY-MM-DDTHH:mm', India time. */
  sendAt: string;
  /**
   * R-514: for "Gym closed" and "Timing change", the day it happens (YYYY-MM-DD); '' = not given yet (the card asks,
   * and Send waits). Never the send time. '' for every other kind.
   */
  day: string;
}

export interface AddMemberDraft extends DraftBase {
  tool: 'add_member';
  form: MemberFormDraft;
  /** Null = add the member without selling a plan. */
  planId: string | null;
  startsOn: DateISO;
  priceP: Paise;
  joiningFeeP: Paise;
  collectNowP: Paise;
  method: PaymentMethod;
}

export interface RenewDraft extends DraftBase {
  tool: 'renew';
  memberId: string;
  planId: string | null;
  /** The day after their current plan ends (or today when it has ended). */
  startsOn: DateISO;
  priceP: Paise;
  joiningFeeP: Paise;
  collectNowP: Paise;
  method: PaymentMethod;
}

export interface PaymentDraft extends DraftBase {
  tool: 'record_payment';
  memberId: string;
  /** The open due it pays (their oldest unpaid plan). */
  membershipId: string | null;
  amountP: Paise;
  method: PaymentMethod;
  note: string;
}

export interface ExtendDraft extends DraftBase {
  tool: 'extend';
  memberId: string;
  membershipId: string | null;
  days: number;
  reason: string;
}

export interface EnquiryDraftA extends DraftBase {
  tool: 'add_enquiry';
  form: EnquiryFormDraft;
}

export interface ExpenseDraftA extends DraftBase {
  tool: 'add_expense';
  spentOn: DateISO;
  amountP: Paise;
  category: ExpenseCategory;
  note: string;
}

export interface WorkoutDraftA extends DraftBase {
  tool: 'draft_workout_plan';
  /** The member it is for ('' = none: the owner ticks members in the builder). It is in `plan.assign.memberIds`. */
  memberId: string;
  /**
   * R-471: only a plan the AI WROTE is ever saved for credits (aiPlanDraft, from POST /api/assist/plan). There is
   * no other way to make this draft: a ready-made template is never sold as AI.
   */
  writtenBy: 'ai';
  plan: WorkoutPlanDraft;
}

/** No path makes a diet draft yet: diet plans stay "not yet" (03-design, "AI plan writer (server)"). */
export interface DietDraftA extends DraftBase {
  tool: 'draft_diet_plan';
  memberId: string;
  diet: DietDraft;
}

export type Draft =
  | MessageDraftA
  | AddMemberDraft
  | RenewDraft
  | PaymentDraft
  | ExtendDraft
  | EnquiryDraftA
  | ExpenseDraftA
  | WorkoutDraftA
  | DietDraftA;

export type DraftTool = Draft['tool'];
export const DRAFT_TOOLS: readonly DraftTool[] = [
  'draft_message', 'add_member', 'renew', 'record_payment', 'extend', 'add_enquiry', 'add_expense', 'draft_workout_plan', 'draft_diet_plan',
];
export const isDraftTool = (name: string): name is DraftTool => (DRAFT_TOOLS as readonly string[]).includes(name);

export type PlanResult =
  | { kind: 'draft'; draft: Draft }
  | { kind: 'choose'; typed: string; options: AnswerRow[] }
  | { kind: 'not_found'; typed: string; followUps: FollowUp[] };

// ------------------------------------------------------------------ limits the forms do not hold

export const MESSAGE_TITLE_MAX = 60;
export const MESSAGE_BODY_MAX = 300;
/** An extension longer than this is not a pause, it is a free plan: the owner does it on the member's page. */
export const EXTEND_MAX_DAYS = 90;
/** An expense older than this is a typing mistake more often than a real one. */
export const EXPENSE_BACK_DAYS = 366;

// ------------------------------------------------------------------ helpers

/** "none" (not said) is cash, the desk's default. */
const methodOf = (said: PayMethodSaid): PaymentMethod => (said === 'none' ? 'cash' : said);

const paise = (rupees: number): Paise => (Number.isFinite(rupees) && rupees > 0 ? rupeesToPaise(rupees) : 0);

/** The plan he named, or the one plan of that many months, among the active plans. */
function findPlan(name: string, months: number, plans: readonly Plan[]): Plan | null {
  const active = plans.filter((p) => p.active);
  if (name.trim()) {
    const m = bestMatch(name, active, (p) => p.name);
    if (m.kind === 'one') return m.item;
  }
  if (months > 0) {
    const fit = active.filter((p) => p.durationUnit === 'month' && p.durationCount === Math.round(months) && !p.ptSessions);
    if (fit.length === 1) return fit[0];
  }
  return null;
}

/** The member's terms, in the order the store keeps them. */
const termsOf = (memberId: string, memberships: readonly Membership[]) => memberships.filter((m) => m.memberId === memberId);

/** Phone digits for the form: "+91 98290 11111" -> dial "+91", "9829011111". */
function phoneParts(raw: string): { dialCode: string; phone: string } {
  const t = raw.trim();
  const m = /^\+(\d{1,3})[\s-]*(.*)$/.exec(t);
  if (m && m[1] !== '91' && m[2].replace(/\D/g, '').length >= 6) return { dialCode: `+${m[1]}`, phone: m[2].replace(/\D/g, '') };
  return { dialCode: '+91', phone: t.replace(/\D/g, '') };
}

/**
 * The words for one language choice. "both": the two bodies one under the other, and the title "English / हिन्दी" when
 * the Hindi title is there and both fit in 60 letters (else the English), as Messages & offers' templates do.
 */
export function messageWords(
  input: ToolInputs['draft_message'],
  gymLang: GymMessageLang,
  when?: { day: string; today: DateISO },
): { title: string; body: string } {
  const lang = input.lang === 'gym' ? gymLang : input.lang;
  // R-514: a "Gym closed" or "Timing change" message always names its day with the date, in each language.
  const dated = (body: string, l: 'en' | 'hi') => (when ? withDayLine(body, input.kind, when.day, when.today, l) : body);
  const en = { title: input.title_en.trim(), body: input.body_en.trim() };
  const hiBody = input.body_hi.trim();
  const hi = { title: input.title_hi.trim() || en.title, body: hiBody ? dated(hiBody, 'hi') : dated(en.body, 'en') };
  if (lang === 'hi') return hi;
  if (lang === 'both' && hiBody) {
    // Fresh eyes (14 Nov 2026): with Both, the title stayed English only while the message was in both languages.
    const hiTitle = input.title_hi.trim();
    const title = en.title && hiTitle && hiTitle !== en.title ? bothTitle(en.title, hiTitle, MESSAGE_TITLE_MAX) : en.title || hi.title;
    return { title, body: `${dated(en.body, 'en')}\n\n${dated(hiBody, 'hi')}` };
  }
  return { title: en.title || hi.title, body: en.body ? dated(en.body, 'en') : hi.body };
}

/** R-514: the message kinds about one day (the gym closed, a timing change): the card asks for that day. */
export const DAY_KINDS: readonly MessageKind[] = ['closed', 'timing'];
export const needsDay = (kind: MessageKind): boolean => DAY_KINDS.includes(kind);

/**
 * R-514 (owner, 14 Nov 2026): the AI wrote "the gym will be closed" with no day. The line that names it, on top of
 * the message: "Gym closed: Tomorrow, Sunday 15 Nov." / "जिम बंद: कल, रविवार 15 नवंबर।". Null: not a day kind, or no
 * day yet. PURE.
 */
export function dayLine(kind: MessageKind, day: string, today: DateISO, lang: 'en' | 'hi'): string | null {
  if (!needsDay(kind) || !isValidDateISO(day)) return null;
  const date = weekdayDayMonth(day, lang);
  if (!date) return null;
  const gap = isValidDateISO(today) ? diffDays(today, day) : null;
  const near = gap === 0 ? (lang === 'hi' ? 'आज' : 'Today') : gap === 1 ? (lang === 'hi' ? 'कल' : 'Tomorrow') : null;
  const when = near ? `${near}, ${date}` : date;
  if (lang === 'hi') return kind === 'closed' ? `जिम बंद: ${when}।` : `समय में बदलाव: ${when}।`;
  return kind === 'closed' ? `Gym closed: ${when}.` : `Timing change: ${when}.`;
}

/** The message with its day line on top, unless the words already name that date ("15 Nov" / "15 नवंबर"). PURE. */
export function withDayLine(body: string, kind: MessageKind, day: string, today: DateISO, lang: 'en' | 'hi'): string {
  const top = dayLine(kind, day, today, lang);
  if (!top) return body;
  const date = dayMonth(day, lang);
  if (date && new RegExp(`(^|[^0-9])${date}`).test(body)) return body;
  return body ? `${top}\n${body}` : top;
}

/**
 * R-514: the day changed on a card whose words he edited by hand: the old day line (or the old date inside his words)
 * becomes the new one, in both languages; with neither, the new line goes on top. PURE.
 */
export function swapDay(body: string, kind: MessageKind, from: string, to: string, today: DateISO): string {
  let out = body;
  for (const lang of ['en', 'hi'] as const) {
    const oldLine = dayLine(kind, from, today, lang);
    const newLine = dayLine(kind, to, today, lang);
    const oldDate = isValidDateISO(from) ? dayMonth(from, lang) : null;
    const newDate = isValidDateISO(to) ? dayMonth(to, lang) : null;
    if (oldLine && out.includes(oldLine)) out = out.replace(oldLine, newLine ?? '').replace(/^\n/, '');
    else if (oldDate && newDate && out.includes(oldDate)) out = out.split(oldDate).join(newDate);
  }
  if (out === body && isValidDateISO(to)) {
    const hasHindi = /[ऀ-ॿ]/.test(body);
    const hasLatin = /[A-Za-z]/.test(body);
    if (hasLatin || !hasHindi) out = withDayLine(out, kind, to, today, 'en');
    if (hasHindi && !hasLatin) out = withDayLine(out, kind, to, today, 'hi');
  }
  return out;
}

/**
 * The draft for a plan the AI WROTE (POST /api/assist/plan, planWriter.ts writtenPlan), as the owner left it in the
 * builder. 3 credits (the catalogue's price for a plan). `memberId`: the member it is for, '' for none. PURE.
 */
export function aiPlanDraft(plan: WorkoutPlanDraft, memberId: string, requestId: string): WorkoutDraftA {
  return { tool: 'draft_workout_plan', requestId, credits: TOOL_CREDITS.draft_workout_plan, memberId, writtenBy: 'ai', plan };
}

// ------------------------------------------------------------------ action -> draft

type Pickable = Exclude<PlanResult, { kind: 'draft' }>;

function member(typed: string, d: PlanData, chosenId?: string | null): { view: MemberView } | Pickable {
  const p = pickMember(typed, d.views, chosenId);
  return p.kind === 'one' ? { view: p.view } : p;
}

/**
 * The editable draft for one action. `requestId`: made once per proposed action (crypto.randomUUID).
 * `chosenId`: the member he picked after "which one?". Phones and emails must already be put back (mask.ts).
 */
export function planAction(action: Action, d: PlanData, requestId: string, chosenId?: string | null): PlanResult | null {
  const credits = TOOL_CREDITS[action.tool as ToolName] ?? 0;
  const base = { requestId, credits };
  const { snapshot: s, today } = d;

  switch (action.tool) {
    case 'draft_message': {
      const i = action.input;
      // R-514: the day of a closure or timing change is its own field, never the send time. A panel server from before
      // the `day` field had only send_at for it: a date put there for a closure is that day, and the message goes now.
      const told = typeof i.day === 'string';
      let day = told ? (i.day ?? '').trim() : '';
      let sendAt = i.send_at.trim();
      if (!told && needsDay(i.kind) && sendAt) {
        day = sendAt.slice(0, 10);
        sendAt = '';
      }
      if (!needsDay(i.kind) || !isValidDateISO(day)) day = '';
      const words = messageWords(i, d.gymLang, { day, today });
      const memberIds: string[] = [];
      if (i.audience.group === 'members') {
        for (const name of i.audience.names) {
          const m = matchMember(name, d.views);
          if (m.kind === 'one') memberIds.push(m.item.member.id);
          else if (m.kind === 'choose' && chosenId && m.items.some((v) => v.member.id === chosenId)) memberIds.push(chosenId);
          else if (m.kind === 'choose') return { kind: 'choose', typed: name, options: m.items.map((v) => ({ key: v.member.id, label: v.member.fullName, detail: null, memberId: v.member.id })) };
          else return { kind: 'not_found', typed: name, followUps: [] };
        }
      }
      return {
        kind: 'draft',
        draft: {
          ...base,
          tool: 'draft_message',
          group: i.audience.group,
          days: i.audience.days,
          plan: i.audience.plan,
          batch: i.audience.batch,
          trainer: i.audience.trainer,
          memberIds,
          kind: i.kind,
          title: words.title,
          body: words.body,
          sendAt,
          day,
        },
      };
    }
    case 'add_member': {
      const i = action.input;
      const plan = findPlan(i.plan, i.months, s.plans);
      const start = isValidDateISO(i.start) ? i.start : today;
      const sale = plan ? saleDefaults([], plan, today, []) : null;
      const form: MemberFormDraft = {
        ...emptyMemberForm(today),
        fullName: i.name.trim(),
        ...phoneParts(i.phone),
        gender: i.gender,
        joinedOn: start <= today ? start : today,
        notes: i.notes.trim(),
        batch: i.batch.trim(),
      };
      const collectNowP = paise(i.amount_paid);
      return {
        kind: 'draft',
        draft: {
          ...base,
          tool: 'add_member',
          form,
          planId: plan?.id ?? null,
          startsOn: start,
          priceP: sale?.priceP ?? 0,
          joiningFeeP: sale?.joiningFeeP ?? 0,
          collectNowP,
          method: methodOf(i.method),
        },
      };
    }
    case 'renew': {
      const i = action.input;
      const m = member(i.member, d, chosenId);
      if (!('view' in m)) return m;
      const v = m.view;
      const plan = findPlan(i.plan, i.months, s.plans) ?? s.plans.find((p) => p.active && p.id === v.current?.planId) ?? null;
      const mine = termsOf(v.member.id, s.memberships);
      const sale = plan ? saleDefaults(mine, plan, today, s.payments.filter((p) => p.memberId === v.member.id)) : null;
      const collectNowP = paise(i.amount_paid);
      return {
        kind: 'draft',
        draft: {
          ...base,
          tool: 'renew',
          memberId: v.member.id,
          planId: plan?.id ?? null,
          startsOn: sale?.startsOn ?? today,
          priceP: sale?.priceP ?? 0,
          joiningFeeP: sale?.joiningFeeP ?? 0,
          collectNowP,
          method: methodOf(i.method),
        },
      };
    }
    case 'record_payment': {
      const i = action.input;
      const m = member(i.member, d, chosenId);
      if (!('view' in m)) return m;
      const due = owedListOn(s.members, s.memberships, s.payments, today).find((r) => r.member.id === m.view.member.id);
      const amountP = paise(i.amount);
      return {
        kind: 'draft',
        draft: {
          ...base,
          tool: 'record_payment',
          memberId: m.view.member.id,
          membershipId: due?.terms[0]?.membership.id ?? null,
          amountP,
          method: methodOf(i.method),
          note: i.note.trim(),
        },
      };
    }
    case 'extend': {
      const i = action.input;
      const m = member(i.member, d, chosenId);
      if (!('view' in m)) return m;
      const cur = m.view.current;
      return {
        kind: 'draft',
        draft: {
          ...base,
          tool: 'extend',
          memberId: m.view.member.id,
          membershipId: cur && !cur.cancelled ? cur.id : null,
          days: Math.round(i.days),
          reason: i.reason.trim(),
        },
      };
    }
    case 'add_enquiry': {
      const i = action.input;
      const interest = [i.interest.trim(), i.notes.trim()].filter(Boolean).join(' · ');
      return {
        kind: 'draft',
        draft: {
          ...base,
          tool: 'add_enquiry',
          form: {
            ...emptyEnquiryForm(today),
            name: i.name.trim(),
            ...phoneParts(i.phone),
            interest,
            followUpOn: isValidDateISO(i.follow_up) ? i.follow_up : addDays(today, 1),
          },
        },
      };
    }
    case 'add_expense': {
      const i = action.input;
      // An expense has no payment method: a method he said goes into the note ("UPI").
      const how = i.method !== 'none' ? i.method.toUpperCase() : '';
      return {
        kind: 'draft',
        draft: {
          ...base,
          tool: 'add_expense',
          spentOn: isValidDateISO(i.date) ? i.date : today,
          amountP: paise(i.amount),
          category: i.category,
          note: [i.note.trim(), how].filter(Boolean).join(' · '),
        },
      };
    }
    // R-471: a plan is never a draft straight from the AI's request. A workout plan is WRITTEN first (the plan
    // writer card, conversation.ts, then aiPlanDraft); a diet plan is not written yet. No template, no charge.
    case 'draft_workout_plan':
    case 'draft_diet_plan':
      return null;
    default:
      return null;
  }
}

// ------------------------------------------------------------------ the message's people

export interface MessageReach {
  /** Everyone on the list (the app message goes to every app member, no `to`). */
  everyone: boolean;
  group: MemberView[];
  /** App member ids for the server's `p_to`; null for everyone; [] = nobody in the group has the app. */
  appIds: string[] | null;
  /** The group's members without the app: the WhatsApp send queue. */
  whatsapp: MemberView[];
}

/** Who a message draft reaches, or null when the group cannot be listed. */
export function messageReach(dr: MessageDraftA, d: PlanData): MessageReach | null {
  const group =
    dr.group === 'members'
      ? d.views.filter((v) => dr.memberIds.includes(v.member.id))
      : membersInGroup({ group: dr.group, days: dr.days, plan: dr.plan, batch: dr.batch, trainer: dr.trainer, gender: '' }, d);
  if (!group) return null;
  const phones = appPhones(d.appMembers ?? []);
  const everyone = dr.group === 'everyone';
  return {
    everyone,
    group,
    appIds: everyone ? null : appIdsOf(group, d.appMembers ?? []),
    whatsapp: withoutApp(group, phones),
  };
}

// ------------------------------------------------------------------ checks

export interface DraftCheck {
  /** Each one blocks Confirm. */
  problems: Problem[];
  /** Said, but Confirm still works ("this is your 3rd message today"). */
  warnings: Line[];
}

const problem = (field: string, text: string, vars?: Record<string, string | number>): Problem => ({ field, message: line(text, vars) });

function findView(memberId: string, d: PlanData): MemberView | undefined {
  return d.allViews.find((v) => v.member.id === memberId);
}

/** Every field of a draft checked against the gym's records and the server's limits. PURE. */
export function checkDraft(dr: Draft, d: PlanData): DraftCheck {
  const problems: Problem[] = [];
  const warnings: Line[] = [];
  const { snapshot: s, today } = d;

  const saleCheck = (planId: string | null, memberId: string | null, startsOn: DateISO, priceP: Paise, joiningFeeP: Paise, collectNowP: Paise) => {
    const plan = s.plans.find((p) => p.id === planId && p.active);
    if (!plan) {
      problems.push(problem('planId', 'Pick a plan.'));
      return;
    }
    if (!(priceP > 0) && !(joiningFeeP > 0)) problems.push(problem('priceP', 'The price must be more than ₹0.'));
    const mine = memberId ? termsOf(memberId, s.memberships) : [];
    const p = validateSale(
      {
        planId: plan.id,
        startsOn,
        priceP,
        joiningFeeP,
        collectNowP,
        pt: Boolean(plan.ptSessions),
        endsOn: isValidDateISO(startsOn) ? endDateForPlan(startsOn, plan) : null,
        paidOn: today,
        listPriceP: plan.priceP,
        listJoiningFeeP: memberId ? null : plan.joiningFeeP,
      },
      mine,
      today,
      d.role,
    );
    if (p) problems.push(problem(p.field, p.message));
  };

  switch (dr.tool) {
    case 'draft_message': {
      const p = draftProblem({ kind: dr.kind, title: dr.title, body: dr.body });
      if (p) problems.push(problem(/title/i.test(p) ? 'title' : 'body', p));
      if (dr.body.trim().length === 0) problems.push(problem('body', 'Write the message.'));
      // R-514: never a closure message with no day; the day never moves the send time.
      if (needsDay(dr.kind)) {
        if (!isValidDateISO(dr.day)) problems.push(problem('day', dr.kind === 'closed' ? 'Pick the day the gym is closed.' : 'Pick the day the timing changes.'));
        else if (dr.day < today) problems.push(problem('day', 'This day has passed. Pick today or a later day.'));
        else if (dr.sendAt && dr.sendAt.slice(0, 10) > dr.day) problems.push(problem('sendAt', 'This would reach members after that day. Pick an earlier time, or Now.'));
      }
      let at = d.now;
      if (dr.sendAt) {
        const when = sendAtFromLocal(dr.sendAt, d.now);
        if (!when.ok) problems.push(problem('sendAt', when.problem));
        else at = when.at;
      }
      const reach = messageReach(dr, d);
      if (!reach) problems.push(problem('group', 'This group could not be found. Pick another.'));
      else if (reach.group.length === 0 && !reach.everyone) problems.push(problem('group', 'Nobody is in this group right now.'));
      const goesInApp = reach ? reach.everyone || (reach.appIds?.length ?? 0) > 0 : false;
      if (goesInApp) {
        const cap = capProblem(dr.kind, d.sent, d.now, at);
        if (cap) problems.push(problem('kind', cap));
        const calm = calmNudge(d.sent, d.now, at);
        if (calm) warnings.push(line(calm));
      }
      break;
    }
    case 'add_member': {
      const v = validateMember(dr.form, today);
      if (!v.ok) {
        for (const e of v.all ?? [{ field: v.field, message: v.message }]) problems.push(problem(e.field, e.message));
      } else {
        const same = findDuplicatePhone(s.members, v.value.phone);
        if (same) problems.push(problem('phone', '{name} already has this mobile number.', { name: same.fullName }));
      }
      if (dr.planId) saleCheck(dr.planId, null, dr.startsOn, dr.priceP, dr.joiningFeeP, dr.collectNowP);
      else if (dr.collectNowP > 0) problems.push(problem('planId', 'Pick a plan for the money received.'));
      break;
    }
    case 'renew': {
      const v = findView(dr.memberId, d);
      if (!v || v.member.archived) problems.push(problem('memberId', 'This member is not on your list.'));
      saleCheck(dr.planId, dr.memberId, dr.startsOn, dr.priceP, dr.joiningFeeP, dr.collectNowP);
      break;
    }
    case 'record_payment': {
      const v = findView(dr.memberId, d);
      if (!v) problems.push(problem('memberId', 'This member is not on your list.'));
      if (!(dr.amountP > 0)) problems.push(problem('amountP', 'The amount must be more than ₹0.'));
      const due = owedListOn(s.members, s.memberships, s.payments, today).find((r) => r.member.id === dr.memberId);
      if (!due || !dr.membershipId) problems.push(problem('memberId', 'This member owes nothing. Sell a plan to take money.'));
      else {
        const term = due.terms.find((t) => t.membership.id === dr.membershipId);
        if (!term) problems.push(problem('membershipId', 'Pick the plan this money is for.'));
        else if (dr.amountP > term.unpaidP) problems.push(problem('amountP', 'They owe {amount} for this plan. Type that or less.', { amount: formatINR(term.unpaidP) }));
      }
      break;
    }
    case 'extend': {
      const v = findView(dr.memberId, d);
      if (!v) problems.push(problem('memberId', 'This member is not on your list.'));
      if (!dr.membershipId) problems.push(problem('membershipId', 'This member has no plan to extend.'));
      if (!Number.isInteger(dr.days) || dr.days < 1) problems.push(problem('days', 'Extend by at least 1 day.'));
      else if (dr.days > EXTEND_MAX_DAYS) problems.push(problem('days', 'Extend by at most {days} days here. For more, open the member’s page.', { days: EXTEND_MAX_DAYS }));
      if (!dr.reason.trim()) problems.push(problem('reason', 'Write why (for example: travel, illness, gym closed).'));
      break;
    }
    case 'add_enquiry': {
      const v = validateEnquiry(dr.form, today);
      if (!v.ok) problems.push(problem(v.field, v.message));
      break;
    }
    case 'add_expense': {
      if (!(dr.amountP > 0)) problems.push(problem('amountP', 'The amount must be more than ₹0.'));
      if (!isValidDateISO(dr.spentOn)) problems.push(problem('spentOn', 'The date looks wrong. Pick it again.'));
      else if (dr.spentOn > today) problems.push(problem('spentOn', 'The date cannot be in the future.'));
      else if (diffDays(dr.spentOn, today) > EXPENSE_BACK_DAYS) problems.push(problem('spentOn', 'The date is more than a year ago. Check it.'));
      break;
    }
    case 'draft_workout_plan': {
      if (dr.memberId && !findView(dr.memberId, d)) problems.push(problem('memberId', 'This member is not on your list.'));
      if (dr.writtenBy !== 'ai') problems.push(problem('plan', 'Only a plan the AI wrote uses credits.'));
      if (!dr.plan.name.trim()) problems.push(problem('name', 'Give the plan a name.'));
      if (dr.plan.routines.length === 0) problems.push(problem('routines', 'The plan has no workout days.'));
      else {
        // The builder's own check (sets, reps, names, the 20 KB record): the plan saves only if Workout plans would.
        const bad = workoutPlanProblem(dr.plan);
        if (bad) problems.push({ field: 'plan', message: line(bad) });
      }
      break;
    }
    case 'draft_diet_plan': {
      if (dr.memberId && !findView(dr.memberId, d)) problems.push(problem('memberId', 'This member is not on your list.'));
      if (!dr.diet.title.trim()) problems.push(problem('title', 'Give the diet a name.'));
      break;
    }
  }
  return { problems, warnings };
}

/** True when the draft may be confirmed. */
export const canConfirm = (dr: Draft, d: PlanData): boolean => checkDraft(dr, d).problems.length === 0;
