/**
 * ForgeAI HQ (#51, migration 0028): the gym owner's "ForgeAI access" list and the button that lets
 * ForgeAI support look at the gym's records for one hour. The owner always sees every time ForgeAI
 * opened the records (either door), what was looked at, and every other ForgeAI action on the gym
 * (paused, new sign-in code, signed out everywhere). Nobody can hide or delete these lines.
 * Server: owner_hq_access / owner_hq_grant / owner_hq_end (owner only; a front-desk key gets OWNER_ONLY).
 */

import { call } from '../shop/api';

export type HqStatus = 'trial' | 'active' | 'suspended' | null;

export interface HqLook {
  at: string;
  what: string;
  rows: number;
}

export interface HqGrant {
  grantId: string;
  openedBy: 'gym' | 'hq';
  openedByName: string;
  reasonKind: string;
  reason: string;
  startsAt: string;
  endsAt: string;
  endedEarly: boolean;
  open: boolean;
  looked: HqLook[];
}

export interface HqAction {
  at: string;
  action: string;
  reason: string | null;
}

export interface HqAccess {
  status: HqStatus;
  grants: HqGrant[];
  actions: HqAction[];
}

type Row = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const rowsOf = (v: unknown): Row[] => (Array.isArray(v) ? v.filter((x): x is Row => !!x && typeof x === 'object') : []);

/** The server's answer, checked field by field (anything odd is dropped, never shown raw). PURE. */
export function hqAccessFromRow(raw: unknown): HqAccess {
  const r = raw && typeof raw === 'object' ? (raw as Row) : {};
  const status = r.status === 'trial' || r.status === 'active' || r.status === 'suspended' ? r.status : null;
  const grants = rowsOf(r.grants)
    .filter((g) => str(g.startsAt) && str(g.endsAt))
    .map((g) => ({
      grantId: str(g.grantId),
      openedBy: g.openedBy === 'hq' ? ('hq' as const) : ('gym' as const),
      openedByName: str(g.openedByName),
      reasonKind: str(g.reasonKind),
      reason: str(g.reason),
      startsAt: str(g.startsAt),
      endsAt: str(g.endsAt),
      endedEarly: g.endedEarly === true,
      open: g.open === true,
      looked: rowsOf(g.looked).map((l) => ({ at: str(l.at), what: str(l.what), rows: typeof l.rows === 'number' ? l.rows : 0 })),
    }));
  const actions = rowsOf(r.actions)
    .filter((a) => str(a.at) && str(a.action))
    .map((a) => ({ at: str(a.at), action: str(a.action), reason: str(a.reason) || null }));
  return { status, grants, actions };
}

const IST = 'Asia/Kolkata';

/** "23 Oct, 14:05" in India time. PURE. */
export function dayTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const day = d.toLocaleDateString('en-IN', { timeZone: IST, day: 'numeric', month: 'short' });
  return `${day}, ${clock(iso)}`;
}

/** "14:05" in India time. PURE. */
export function clock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-IN', { timeZone: IST, hour: '2-digit', minute: '2-digit', hour12: false });
}

const WHAT: Record<string, string> = {
  member: 'members',
  plan: 'plans',
  membership: 'memberships',
  payment: 'receipts',
  visit: 'check-ins',
  order: 'shop orders',
  staff: 'staff list',
};

const REASON: Record<string, string> = {
  gym_asked: 'you asked ForgeAI support to look',
  leak: 'a suspected data leak',
  legal: 'a legal demand',
  erase: 'a member asked ForgeAI to erase their details',
  locked_out: 'the owner was locked out',
  other: 'other',
};

/** What was looked at, in words: "members and receipts". PURE. */
export function lookedWords(looked: readonly HqLook[]): string {
  const kinds = [...new Set(looked.map((l) => WHAT[l.what] ?? 'records'))];
  if (kinds.length <= 1) return kinds[0] ?? '';
  return `${kinds.slice(0, -1).join(', ')} and ${kinds[kinds.length - 1]}`;
}

/**
 * One line of the owner's list, for example "ForgeAI support viewed your members and receipts on
 * 23 Oct, 14:05-14:35. Reason: you asked ForgeAI support to look." PURE.
 */
export function grantLine(g: HqGrant): string {
  const who = g.openedBy === 'gym' ? 'you opened it' : 'ForgeAI opened it in an emergency';
  const reason = g.openedBy === 'gym' ? REASON.gym_asked : `${REASON[g.reasonKind] ?? 'other'}: ${g.reason}`;
  if (g.open) {
    const seen = g.looked.length ? ` So far ForgeAI support viewed your ${lookedWords(g.looked)}.` : ' Nothing looked at yet.';
    return `Support access is open until ${clock(g.endsAt)} (${who}).${seen} Reason: ${reason}.`;
  }
  const span = `${dayTime(g.startsAt)}-${clock(g.endsAt)}`;
  if (!g.looked.length) return `Support access was open ${span} (${who}). Nothing was looked at.`;
  const first = g.looked[0].at;
  const last = g.looked[g.looked.length - 1].at;
  return `ForgeAI support viewed your ${lookedWords(g.looked)} on ${dayTime(first)}-${clock(last)} (${who}). Reason: ${reason}.`;
}

const ACTION: Record<string, string> = {
  approve_gym: 'ForgeAI checked and approved your gym',
  suspend_gym: 'ForgeAI paused your gym',
  restore_gym: 'ForgeAI switched your gym back on',
  reset_owner_signin: 'ForgeAI made a new sign-in code for the owner, after a call to your gym',
  sign_out_gym: 'ForgeAI signed every phone and computer of your gym out',
  create_gym: 'ForgeAI set up your gym',
  ai_limit_set: 'ForgeAI changed your daily AI matches',
};

/** One other ForgeAI action on the gym, in words. PURE. */
export function actionLine(a: HqAction): string {
  const what = ACTION[a.action] ?? 'ForgeAI made a change to your gym';
  return `${dayTime(a.at)}: ${what}.${a.reason ? ` Reason: ${a.reason}` : ''}`;
}

/** The open grant, if any. PURE. */
export function openGrant(access: HqAccess): HqGrant | null {
  return access.grants.find((g) => g.open) ?? null;
}

/** A server without migration 0028 (the function is not there yet). PURE. */
export function notLiveYet(e: unknown): boolean {
  const o = e && typeof e === 'object' ? (e as { code?: unknown; message?: unknown }) : {};
  return o.code === 'PGRST202' || /could not find the function/i.test(typeof o.message === 'string' ? o.message : String(e ?? ''));
}

export async function loadHqAccess(key: string): Promise<HqAccess> {
  return hqAccessFromRow(await call<unknown>('owner_hq_access', { p_key: key }));
}

export async function letSupportLook(key: string): Promise<void> {
  await call<unknown>('owner_hq_grant', { p_key: key });
}

export async function closeSupportAccess(key: string): Promise<void> {
  await call<null>('owner_hq_end', { p_key: key });
}
