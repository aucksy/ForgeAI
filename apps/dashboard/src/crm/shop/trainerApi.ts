/**
 * F109 "Trainers see their members' progress": the calls to the gym server (supabase/migrations/0050_trainer_view.sql).
 * Every call carries the owner, desk or trainer key; the server keeps each gym to its own members, lets a ticked
 * trainer read only their own members, and refuses the front desk without the tick (TRAINER_ONLY).
 *
 * Until 0050 is on the server, the first read answers PGRST202 ("no such function"): this page then remembers
 * "not here" for the life of the page, and "Training progress", the Trainer tick and the member's trainer stay hidden,
 * with no error shown and one quiet note in the console (as machinesApi.ts does for 0049). A desk person without
 * the tick is remembered as 'no' too (the link stays hidden). Any other failure is not remembered.
 */

import { isDemoLocked } from '../../lib/demoLock';
import { trainerMembersFrom, trainerSetupFrom, type TrainerMembers, type TrainerSetup } from '../logic/trainerView';
import { isNoSuchFunction } from '../logic/workoutOffer';
import { call } from './api';

/** 'unknown' before the first read; 'no': no 0050 or not allowed; 'owner' / 'trainer': who this key is. */
export type TrainerAccess = 'unknown' | 'no' | 'owner' | 'trainer';

let access: TrainerAccess = 'unknown';
let accessKey: string | null = null;
const listeners = new Set<() => void>();

function setAccess(key: string, a: TrainerAccess): void {
  accessKey = key;
  if (access === a) return;
  access = a;
  for (const fn of [...listeners]) fn();
}

/** What is known for this key. The demo gym never asks. */
export function trainerAccess(key: string | null): TrainerAccess {
  if (isDemoLocked() || !key) return 'no';
  return accessKey === key ? access : 'unknown';
}

export function onTrainerAccessChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** The members this key may see. 'missing': no 0050 on the server; 'refused': the desk without the tick. */
export async function getTrainerMembers(key: string): Promise<TrainerMembers | 'missing' | 'refused'> {
  if (accessKey === key && access === 'no') return 'missing';
  try {
    const r = trainerMembersFrom(await call<unknown>('owner_trainer_members', { p_key: key }));
    if (!r) throw new Error('unreadable answer');
    setAccess(key, r.role);
    return r;
  } catch (e) {
    if (isNoSuchFunction(e)) {
      if (access !== 'no') console.info('[trainer view] this gym server has no trainer view yet (0050 not applied); it stays hidden');
      setAccess(key, 'no');
      return 'missing';
    }
    if (/\bTRAINER_ONLY\b/.test(e instanceof Error ? e.message : String((e as { message?: unknown })?.message ?? e))) {
      setAccess(key, 'no');
      return 'refused';
    }
    throw e;
  }
}

/** The people with their Trainer tick, and who trains whom (owner only). 'missing' without 0050. */
export async function getTrainerSetup(key: string): Promise<TrainerSetup | 'missing'> {
  if (isDemoLocked() || (accessKey === key && access === 'no')) return 'missing';
  try {
    return trainerSetupFrom(await call<unknown>('owner_trainer_setup', { p_key: key }));
  } catch (e) {
    if (isNoSuchFunction(e)) {
      setAccess(key, 'no');
      return 'missing';
    }
    throw e;
  }
}

/** Tick or untick a person as a trainer (owner only). Throws OWNER_ONLY / NOT_FOUND / SUSPENDED as they came. */
export async function setTrainer(key: string, staffId: string, on: boolean): Promise<TrainerSetup> {
  return trainerSetupFrom(await call<unknown>('owner_set_trainer', { p_key: key, p_staff: staffId, p_on: on }));
}

/** Pick a member's trainer, or none (null). Throws NO_MEMBER / NOT_TRAINER / OWNER_ONLY as they came. */
export async function assignTrainer(key: string, memberId: string, staffId: string | null): Promise<TrainerSetup> {
  return trainerSetupFrom(await call<unknown>('owner_assign_trainer', { p_key: key, p_member: memberId, p_staff: staffId }));
}

/** Tests only: back to a fresh page. */
export function resetTrainerApiForTest(): void {
  access = 'unknown';
  accessKey = null;
  listeners.clear();
}
