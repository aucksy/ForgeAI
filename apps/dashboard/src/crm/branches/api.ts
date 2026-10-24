/**
 * The panel's calls for branches (supabase/migrations/0031_branches.sql). Every call carries this
 * device's key for ONE branch; the server works out the group from it.
 */

import { signedInFromRow, type SignedIn } from '../auth/signin';
import { call } from '../shop/api';
import { branchListFromRow, visitorsFromRows, visitorsTodayFromRows, type BranchList, type Visitor, type VisitorToday } from './logic';

type Row = Record<string, unknown>;

function device(): string | null {
  return typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : null;
}

/**
 * PostgREST's "no function with these argument names" (PGRST202): the gym's server has not had 0031
 * yet. The panel then behaves as a gym with one branch.
 */
export function isMissingFunction(e: unknown): boolean {
  if (typeof e === 'object' && e && (e as { code?: unknown }).code === 'PGRST202') return true;
  const msg = e instanceof Error ? e.message : typeof e === 'object' && e ? String((e as { message?: unknown }).message ?? '') : String(e ?? '');
  return /\bPGRST202\b|could not find the function/i.test(msg);
}

export async function listBranches(key: string, fallback: { gymId: string; name: string; joinCode: string }): Promise<BranchList> {
  return branchListFromRow(await call<unknown>('owner_branches', { p_key: key }), fallback);
}

/** A new branch; the answer is a session for it on this device (with its receipt prefix). */
export async function addBranch(key: string, name: string, copyPlans: boolean): Promise<SignedIn & { receiptPrefix: string | null; plansCopied: number }> {
  const r = await call<Row>('owner_add_branch', { p_key: key, p_name: name.trim(), p_copy_plans: copyPlans, p_device: device() });
  return {
    ...signedInFromRow(r),
    receiptPrefix: typeof r.receiptPrefix === 'string' ? r.receiptPrefix : null,
    plansCopied: Number(r.plansCopied) || 0,
  };
}

/** A session in another branch of the group, for this device. */
export async function openBranch(key: string, gymId: string): Promise<SignedIn> {
  return signedInFromRow(await call<Row>('owner_open_branch', { p_key: key, p_gym: gymId, p_device: device() }));
}

export async function renameGroup(key: string, name: string): Promise<void> {
  await call<unknown>('owner_rename_group', { p_key: key, p_name: name.trim() });
}

/** Members of OTHER branches with this mobile (10 digits). */
export async function findVisitor(key: string, phone: string): Promise<Visitor[]> {
  return visitorsFromRows(await call<unknown>('branch_find_visitor', { p_key: key, p_phone: phone }));
}

export async function checkInVisitor(key: string, gymId: string, memberId: string): Promise<{ alreadyIn: boolean; firstName: string; branchName: string; planOk: boolean }> {
  const r = await call<Row>('branch_check_in_visitor', { p_key: key, p_gym: gymId, p_member: memberId });
  return {
    alreadyIn: r.alreadyIn === true,
    firstName: typeof r.firstName === 'string' ? r.firstName : '',
    branchName: typeof r.branchName === 'string' ? r.branchName : '',
    planOk: r.planOk === true,
  };
}

/** Members of other branches who trained HERE on `day`. */
export async function visitorsOn(key: string, day: string): Promise<VisitorToday[]> {
  return visitorsTodayFromRows(await call<unknown>('branch_visitors', { p_key: key, p_day: day }));
}

export async function undoVisitor(key: string, gymId: string, memberId: string, day: string): Promise<void> {
  await call<unknown>('branch_undo_visitor', { p_key: key, p_gym: gymId, p_member: memberId, p_day: day });
}
