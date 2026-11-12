// Types for assistCatalogue.js, so the admin app (TypeScript, no allowJs) can import the same catalogue.
// Keep in step with the .js file; apps/dashboard typecheck fails when they drift apart.

export type ToolKind = 'ask' | 'talk' | 'message' | 'change' | 'content';
export type ToolName =
  | 'list_members'
  | 'who_owes'
  | 'money_summary'
  | 'attendance_summary'
  | 'growth_summary'
  | 'member_lookup'
  | 'week_summary'
  | 'gym_numbers'
  | 'how_to'
  | 'draft_message'
  | 'add_member'
  | 'renew'
  | 'record_payment'
  | 'extend'
  | 'add_enquiry'
  | 'add_expense'
  | 'draft_workout_plan'
  | 'draft_diet_plan'
  | 'ask_back'
  | 'open_page'
  | 'cannot_do';

export type Period =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'last_30_days'
  | 'this_year'
  | 'custom';
export type MemberGroup =
  | 'everyone'
  | 'active'
  | 'ending'
  | 'ended'
  | 'away'
  | 'birthday_today'
  | 'birthday_week'
  | 'new_joins'
  | 'plan'
  | 'batch'
  | 'trainer'
  | 'owes'
  | 'no_app'
  | 'visited_today'
  | 'no_plan'
  | 'members';
export type MessageKind = 'announcement' | 'offer' | 'event' | 'closed' | 'timing' | 'reminder';
export type MessageLang = 'gym' | 'en' | 'hi' | 'both';
export type PayMethodSaid = 'cash' | 'upi' | 'card' | 'bank' | 'other' | 'none';
export type ExpenseCategorySaid = 'rent' | 'salary' | 'electricity' | 'equipment' | 'stock' | 'repairs' | 'other';
export type GenderSaid = '' | 'male' | 'female' | 'other';

interface PeriodInput {
  period: Period;
  from: string;
  to: string;
}

/** Every tool's input exactly as the AI returns it ("" / 0 / [] = not said). */
export interface ToolInputs {
  list_members: { group: Exclude<MemberGroup, 'members'>; days: number; plan: string; batch: string; trainer: string; gender: GenderSaid };
  who_owes: { member: string };
  money_summary: PeriodInput & { breakdown: 'total' | 'by_plan' | 'by_method' | 'expenses' | 'profit' };
  attendance_summary: PeriodInput & { focus: 'count' | 'peak_hours' | 'inside_now' | 'who_came' };
  growth_summary: PeriodInput;
  member_lookup: { member: string };
  week_summary: { week: 'last_week' | 'this_week' };
  gym_numbers: {
    topic:
      | 'members_by_plan'
      | 'members_by_gender'
      | 'members_by_batch'
      | 'plans_and_prices'
      | 'enquiries'
      | 'followups_today'
      | 'trainers'
      | 'without_app'
      | 'birthdays_week';
  };
  how_to: { question: string };
  draft_message: {
    audience: { group: MemberGroup; days: number; plan: string; batch: string; trainer: string; names: string[] };
    kind: MessageKind;
    lang: MessageLang;
    title_en: string;
    body_en: string;
    title_hi: string;
    body_hi: string;
    send_at: string;
    offer: string;
  };
  add_member: {
    name: string;
    phone: string;
    gender: GenderSaid;
    plan: string;
    months: number;
    start: string;
    amount_paid: number;
    method: PayMethodSaid;
    batch: string;
    notes: string;
  };
  renew: { member: string; plan: string; months: number; amount_paid: number; method: PayMethodSaid };
  record_payment: { member: string; amount: number; method: PayMethodSaid; note: string };
  extend: { member: string; days: number; reason: string };
  add_enquiry: { name: string; phone: string; interest: string; follow_up: string; notes: string };
  add_expense: { amount: number; category: ExpenseCategorySaid; date: string; method: PayMethodSaid; note: string };
  draft_workout_plan: {
    member: string;
    goal: 'fat_loss' | 'muscle_gain' | 'strength' | 'general_fitness' | 'beginner';
    days_per_week: number;
    level: 'beginner' | 'intermediate' | 'advanced';
    notes: string;
  };
  draft_diet_plan: {
    member: string;
    goal: 'fat_loss' | 'muscle_gain' | 'general_fitness';
    food: 'veg' | 'egg' | 'non_veg' | 'vegan' | 'any';
    notes: string;
  };
  ask_back: { question: string; options: string[] };
  open_page: { page: string; steps: string[]; why: string };
  cannot_do: { reason: string };
}

/** One action the AI asked for. */
export type Action = { [K in ToolName]: { tool: K; input: ToolInputs[K] } }[ToolName];

export interface ToolDef {
  name: ToolName;
  kind: ToolKind;
  strict?: false;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface PageDef {
  id: string;
  path: string;
  name: string;
  does: string;
  owner?: true;
}

export type ExampleGroup = 'messages' | 'members' | 'money' | 'questions' | 'settings';
export interface Example {
  group: ExampleGroup;
  text: string;
  tool: ToolName;
  expect?: Record<string, string | number>;
}

export const CREDITS: Readonly<Record<ToolKind, number>>;
export const STRICT_LIMITS: Readonly<{ tools: number; optional: number; unions: number }>;
export const PERIODS: readonly Period[];
export const MEMBER_GROUPS: readonly MemberGroup[];
export const MESSAGE_KINDS: readonly MessageKind[];
export const MESSAGE_LANGS: readonly MessageLang[];
export const PAY_METHODS: readonly PayMethodSaid[];
export const EXPENSE_CATEGORIES: readonly ExpenseCategorySaid[];
export const GENDERS: readonly GenderSaid[];
export const PAGES: readonly PageDef[];
export const PAGE_IDS: readonly string[];
export const AI_PAGE_IDS: readonly string[];
export function pageById(id: string): PageDef | undefined;
export function pagePath(id: string, param?: string): string | null;
export const TOOLS: readonly ToolDef[];
export const TOOL_KIND: Readonly<Record<ToolName, ToolKind>>;
export const TOOL_CREDITS: Readonly<Record<ToolName, number>>;
export function toolByName(name: string): ToolDef | undefined;
export function creditsFor(actions: readonly { tool: string }[] | null | undefined): number;
export function toolsForClaude(): { name: ToolName; description: string; input_schema: Record<string, unknown>; strict?: true }[];
export const EXAMPLE_GROUPS: readonly ExampleGroup[];
export const EXAMPLES: readonly Example[];
