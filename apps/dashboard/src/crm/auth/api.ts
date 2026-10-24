/**
 * The panel's calls for sign-in, people and codes (supabase/migrations/0010_signin_and_records.sql).
 * Every call but the sign-in itself carries this device's key (a session key, or an old owner key).
 */

import type { CrmCloudApi, CrmRecord } from '../data/cloud';
import { call } from '../shop/api';
import { isMissingFunction } from '../branches/api';
import {
  madeCodeFromRow,
  peopleFromRows,
  personFromRow,
  SignInError,
  signedInFromRow,
  authErrorCode,
  keyStatusFromRow,
  type KeyStatus,
  type MadeCode,
  type Person,
  type PersonRow,
  type Role,
  type SignedIn,
} from './signin';

type Row = Record<string, unknown>;

function device(): string | null {
  return typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : null;
}

/**
 * A new gym, online from the first minute, with this person as its owner (signed in here).
 * `termsVersion` (#38): the version of the terms the owner ticked at "Create my gym"; the server
 * keeps it with the gym (0033). A server without 0033 does not know the argument: the gym is then
 * made without it, and the owner is asked once 0033 is there (TermsGate).
 */
export async function createOnlineGym(gymName: string, name: string, phone: string, termsVersion?: string): Promise<SignedIn> {
  const args = {
    p_gym_name: gymName.trim(),
    p_name: name.trim(),
    p_phone: phone,
    p_device: device(),
  };
  if (!termsVersion) return signedInFromRow(await call<Row>('gym_create_online', args));
  try {
    return signedInFromRow(await call<Row>('gym_create_online', { ...args, p_terms_version: termsVersion }));
  } catch (e) {
    if (!isMissingFunction(e)) throw e;
    console.warn('[ForgeErr] gym_create_online: no terms on this server yet (0033), made without', e);
    return signedInFromRow(await call<Row>('gym_create_online', args));
  }
}

/** An existing cloud gym (held by an old owner key) gets its owner as a person, signed in here. */
export async function goOnline(ownerKey: string, name: string, phone: string): Promise<SignedIn> {
  const r = await call<Row>('owner_go_online', { p_key: ownerKey, p_name: name.trim(), p_phone: phone, p_device: device() });
  return signedInFromRow(r);
}

/** Mobile + code. A refusal is thrown as a SignInError (WRONG_CODE carries the tries left). */
export async function signIn(phone: string, code: string): Promise<SignedIn> {
  const r = await call<Row>('staff_sign_in', { p_phone: phone, p_code: code, p_device: device() });
  if (r && typeof r === 'object' && typeof r.error === 'string') {
    const left = typeof r.triesLeft === 'number' ? r.triesLeft : null;
    throw new SignInError(authErrorCode(r.error), left);
  }
  return signedInFromRow(r);
}

/** Who this key is. Person is null for an old owner key. */
export async function whoAmI(key: string): Promise<{ name: string; joinCode: string; person: Person | null }> {
  const r = await call<Row>('staff_me', { p_key: key });
  return { name: String(r.name ?? ''), joinCode: String(r.joinCode ?? ''), person: personFromRow(r.person) };
}

/** Sign this device out. Never throws: the device forgets its key whatever the server says. */
export async function signOut(key: string): Promise<void> {
  try {
    await call<null>('staff_sign_out', { p_key: key });
  } catch {
    // Offline: the key is forgotten here anyway; an owner can sign the device out from the list.
  }
}

/**
 * UAT U-A14: why this device's key stopped working, for the words on the sign-in screen (0022).
 * Never throws: a server without 0022, or no internet, answers 'unknown' (the "signed out" words).
 */
export async function keyStatus(key: string): Promise<KeyStatus> {
  try {
    return keyStatusFromRow(await call<unknown>('staff_key_status', { p_key: key }));
  } catch (e) {
    console.warn('[ForgeErr] staff_key_status:', e);
    return 'unknown';
  }
}

/** Once a gym's records are online, the old owner key it was made with stops working. */
export async function retireOwnerKey(sessionKey: string): Promise<void> {
  await call<null>('owner_retire_key', { p_key: sessionKey });
}

export async function listPeople(key: string): Promise<PersonRow[]> {
  return peopleFromRows(await call<unknown>('owner_people', { p_key: key }));
}

export async function addPerson(key: string, name: string, phone: string, role: Role): Promise<Person> {
  const r = await call<Row>('owner_add_person', { p_key: key, p_name: name.trim(), p_phone: phone, p_role: role });
  const p = personFromRow(r);
  if (!p) throw new Error('UNKNOWN');
  return p;
}

export async function removePerson(key: string, staffId: string): Promise<void> {
  await call<null>('owner_remove_person', { p_key: key, p_staff: staffId });
}

export async function makeCode(key: string, staffId: string): Promise<MadeCode> {
  return madeCodeFromRow(await call<Row>('owner_make_signin_code', { p_key: key, p_staff: staffId }));
}

export async function signOutPerson(key: string, staffId: string): Promise<void> {
  await call<null>('owner_sign_out_person', { p_key: key, p_staff: staffId });
}

// ---------------------------------------------------------------- the gym's records (crm_pull / crm_push)

function recordsFromRaw(raw: unknown): CrmRecord[] {
  const out: CrmRecord[] = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Row;
    const k = r.k;
    if (typeof k !== 'string' || typeof r.id !== 'string') continue;
    out.push({ k: k as CrmRecord['k'], id: r.id, d: r.d ?? null, x: r.x === true });
  }
  return out;
}

/** The live server, for CloudCrmData. */
export const cloudApi: CrmCloudApi = {
  async pull(key, since) {
    const r = await call<Row>('crm_pull', { p_key: key, p_since: since });
    const g = (r.gym ?? {}) as Row;
    const created = typeof g.createdAt === 'string' ? Date.parse(g.createdAt) : NaN;
    return {
      version: Number(r.version) || 0,
      gym: {
        gymId: String(g.gymId ?? ''),
        name: String(g.name ?? ''),
        joinCode: String(g.joinCode ?? ''),
        createdAt: Number.isFinite(created) ? created : Date.now(),
      },
      records: recordsFromRaw(r.records),
    };
  },
  async push(key, base, records, pushId) {
    const v = await call<number | string>('crm_push', { p_key: key, p_base: base, p_records: records, p_push_id: pushId });
    return Number(v);
  },
};
