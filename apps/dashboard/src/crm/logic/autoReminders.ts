/**
 * Messages & offers → Automatic reminders (R-86, 23 Oct 2026). The owner switches each automatic
 * reminder on or off and sets the days where they matter; members' phones set the reminders
 * themselves (apps/mobile/src/shop/autoReminders.ts — the SAME keys, defaults and ranges; a test
 * reads both files and the server's check). Server: supabase/migrations/0029_auto_reminders.sql.
 * Research and the full list: docs/overhaul/research/R-auto-reminders.md. PURE.
 */

export type ReminderCase =
  | 'plan_ends_soon'
  | 'plan_ends_today'
  | 'plan_ended'
  | 'birthday'
  | 'welcome'
  | 'anniversary'
  | 'miss_you'
  | 'offer_reward'
  | 'offer_ending'
  | 'offer_near'
  | 'pt_low';

export interface ReminderNumbers {
  /** The field's label. */
  label: string;
  default: number[];
  min: number;
  max: number;
  /** How many values may be given. */
  most: number;
}

export interface ReminderCaseInfo {
  key: ReminderCase;
  title: string;
  /** When it goes, in one plain line. */
  when: string;
  /** What the member reads (an example; {gym} is the gym's name, see exampleFor). */
  example: string;
  defaultOn: boolean;
  numbers?: ReminderNumbers;
}

/** In the order the owner reads them (the phone's priority order is its own). */
export const REMINDER_CASES: readonly ReminderCaseInfo[] = [
  {
    key: 'plan_ends_soon',
    title: 'Plan ends soon',
    when: 'Before a plan ends. Not sent when the member already renewed.',
    example: 'Your plan ends in 3 days, on 30 Nov. Renew at the desk to keep training.',
    defaultOn: true,
    numbers: { label: 'Days before the last day', default: [7, 3], min: 1, max: 30, most: 3 },
  },
  {
    key: 'plan_ends_today',
    title: 'Plan ends today',
    when: "On the plan's last day, if not renewed.",
    example: 'Your plan ends today. Renew at the desk to keep training.',
    defaultOn: true,
  },
  {
    key: 'plan_ended',
    title: 'Plan ended',
    when: 'After the plan ended, if not renewed.',
    example: 'Your plan ended on 30 Nov. Renew at the desk to keep your progress going.',
    defaultOn: true,
    numbers: { label: 'Days after the last day', default: [7, 1], min: 1, max: 60, most: 3 },
  },
  {
    key: 'birthday',
    title: 'Birthday wish',
    when: "On the member's birthday (the date of birth on their member page).",
    example: 'Happy birthday, Asha! Best wishes from all of us at {gym}.',
    defaultOn: true,
  },
  {
    key: 'welcome',
    title: 'Welcome',
    when: 'The first morning after a new member joins.',
    example: "Welcome to {gym}, Asha! Your plan and the gym's news are in MettleUp.",
    defaultOn: true,
  },
  {
    key: 'anniversary',
    title: 'One year with you',
    when: 'On each anniversary of the joining day.',
    example: '1 year with {gym} today. Thank you for training with us!',
    defaultOn: false,
  },
  {
    key: 'miss_you',
    title: "We haven't seen you",
    when: 'When a member with a running plan has not checked in for a while. Kind words, never an offer.',
    example: "We haven't seen you for 14 days, Asha. Come in when you can.",
    defaultOn: false,
    numbers: { label: 'Days without a check-in', default: [14], min: 5, max: 60, most: 1 },
  },
  {
    key: 'offer_reward',
    title: 'Workout offer: days added',
    when: "When a member's reward days are added to their plan.",
    example: '3 extra days added to your plan for your workouts. It now ends on 3 Dec.',
    defaultOn: true,
  },
  {
    key: 'offer_ending',
    title: 'Workout offer: ending soon',
    when: "Before a member's offer days run out, if they have not finished.",
    example: 'Your workout offer ends on 15 Nov: 4 more workouts for 3 extra days.',
    defaultOn: false,
    numbers: { label: 'Days before the end', default: [3], min: 1, max: 14, most: 1 },
  },
  {
    key: 'offer_near',
    title: 'Workout offer: almost there',
    when: 'When a member is 2 workouts, then 1 workout, from the reward.',
    example: '1 more workout for your 3 extra days. Check in and train today.',
    defaultOn: false,
  },
  {
    key: 'pt_low',
    title: 'Personal training running low',
    when: "When a member's personal training pack is nearly used up.",
    example: 'Personal training: 2 of 12 left. Ask the desk to add more.',
    defaultOn: false,
    numbers: { label: 'When this many are left', default: [2], min: 1, max: 5, most: 1 },
  },
];

export interface ReminderRule {
  on: boolean;
  /** Largest first; empty for a case without a number. */
  days: number[];
}
export type ReminderSettings = Record<ReminderCase, ReminderRule>;

export function defaultReminderSettings(): ReminderSettings {
  const out = {} as ReminderSettings;
  for (const c of REMINDER_CASES) out[c.key] = { on: c.defaultOn, days: [...(c.numbers?.default ?? [])] };
  return out;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The saved switches over the defaults (a case left out, or unreadable, keeps its default). */
export function reminderSettingsFromRow(raw: unknown): ReminderSettings {
  const out = defaultReminderSettings();
  if (!isObj(raw)) return out;
  for (const c of REMINDER_CASES) {
    const v = raw[c.key];
    if (!isObj(v) || typeof v.on !== 'boolean') continue;
    let days = out[c.key].days;
    const n = c.numbers;
    if (n && Array.isArray(v.days)) {
      const ok = [...new Set(v.days.filter((x): x is number => typeof x === 'number' && Number.isInteger(x) && x >= n.min && x <= n.max))];
      if (ok.length > 0) days = ok.sort((a, b) => b - a).slice(0, n.most);
    }
    out[c.key] = { on: v.on, days };
  }
  return out;
}

export interface RemindersAnswer {
  settings: ReminderSettings;
  /** The owner has saved switches (false: everything is still the default). */
  saved: boolean;
  updatedAt: string | null;
  updatedByName: string | null;
  /** The owner (or an old owner key); the front desk only looks. */
  canEdit: boolean;
}

/** owner_auto_reminders / owner_save_auto_reminders' answer. */
export function remindersFromAnswer(raw: unknown): RemindersAnswer {
  const r = isObj(raw) ? raw : {};
  return {
    settings: reminderSettingsFromRow(r.settings),
    saved: isObj(r.settings),
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : null,
    updatedByName: typeof r.updatedByName === 'string' && r.updatedByName.trim() ? r.updatedByName.trim() : null,
    canEdit: r.canEdit === true,
  };
}

/** What a save sends: every case, so the phones never guess. */
export function reminderPayload(s: ReminderSettings): Record<string, { on: boolean; days?: number[] }> {
  const out: Record<string, { on: boolean; days?: number[] }> = {};
  for (const c of REMINDER_CASES) out[c.key] = c.numbers ? { on: s[c.key].on, days: [...s[c.key].days] } : { on: s[c.key].on };
  return out;
}

/** The example as this gym's members read it. */
export function exampleFor(c: ReminderCaseInfo, gymName: string): string {
  return c.example.replace('{gym}', gymName.trim() || 'your gym');
}

/** "7, 3" for the days field. */
export function daysText(days: readonly number[]): string {
  return days.join(', ');
}

/** The days field read back: the numbers (largest first), or the words for what is wrong. */
export function parseDays(text: string, n: ReminderNumbers): { ok: true; days: number[] } | { ok: false; error: string } {
  const parts = text.split(/[\s,]+/).filter(Boolean);
  const rule = n.most === 1 ? `a whole number from ${n.min} to ${n.max}` : `whole numbers from ${n.min} to ${n.max}, up to ${n.most} (like ${daysText(n.default)})`;
  const error = `${n.label}: ${rule}.`;
  if (parts.length === 0 || parts.length > n.most) return { ok: false, error };
  const nums = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
  if (nums.some((x) => !Number.isInteger(x) || x < n.min || x > n.max)) return { ok: false, error };
  return { ok: true, days: [...new Set(nums)].sort((a, b) => b - a) };
}

/** True when two settings say the same. */
export function sameReminderSettings(a: ReminderSettings, b: ReminderSettings): boolean {
  return REMINDER_CASES.every((c) => a[c.key].on === b[c.key].on && a[c.key].days.join() === b[c.key].days.join());
}

/** How many are on, for the header line. */
export function onCount(s: ReminderSettings): number {
  return REMINDER_CASES.filter((c) => s[c.key].on).length;
}

/** Plain words for a refused save, or null when it is not one of the reminders' codes. */
export function reminderErrorWords(err: unknown): string | null {
  const t = typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : String(err);
  if (/\bOWNER_ONLY\b/.test(t)) return 'Only the owner can change automatic reminders.';
  if (/\bINVALID\b/.test(t)) return 'One of the numbers is not allowed. Check the days and try again.';
  return null;
}
