/**
 * The ForgeAI terms and the data agreement, accepted online (tracker #38, 24 Oct 2026; owner: "no
 * physical signing; a scalable digital acceptance of the terms online for gyms anywhere").
 *
 * A new gym ticks the box at "Create my gym" (auth/SignInForms.tsx). An existing gym's owner is
 * asked once, the next time they open the admin app signed in (TermsGate.tsx). Settings -> Your data
 * says when they accepted and which version. The server keeps when, which version, who, and a hash
 * of the address the request came from (supabase/migrations/0033_terms_acceptance.sql). A server
 * without 0033 asks nothing and records nothing (the gym is asked once it has it).
 */

import { call } from '../shop/api';
import { isMissingFunction } from '../branches/api';

/**
 * The version of /terms.html and /data-agreement.html an owner agrees to: the date they were last
 * changed. Change it (and the "Version" line in docs/launch/DATA-AGREEMENT.md, then run
 * scripts/legal_pages.py) when the words change: every owner is then asked once more.
 * test/crm/legalPages.test.ts fails when the two differ.
 */
export const TERMS_VERSION = '2026-10-24';

export const TERMS_URL = '/terms.html';
export const PRIVACY_URL = '/privacy.html';
/** #59 (24 Oct 2026): "the data agreement" opens its own page (it opened the privacy notice). */
export const DATA_AGREEMENT_URL = '/data-agreement.html';

export interface TermsState {
  acceptedVersion: string | null;
  /** Epoch ms. */
  acceptedAt: number | null;
  acceptedByName: string | null;
  how: 'create' | 'sign_in' | null;
  /** This person may accept for the gym (an owner). */
  canAccept: boolean;
}

/** owner_terms' answer. PURE. */
export function termsFromRow(raw: unknown): TermsState {
  const r = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const at = typeof r.acceptedAt === 'string' ? Date.parse(r.acceptedAt) : NaN;
  const v = typeof r.acceptedVersion === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.acceptedVersion) ? r.acceptedVersion : null;
  return {
    acceptedVersion: v,
    acceptedAt: Number.isFinite(at) ? at : null,
    acceptedByName: typeof r.acceptedByName === 'string' && r.acceptedByName ? r.acceptedByName : null,
    how: r.how === 'create' || r.how === 'sign_in' ? r.how : null,
    canAccept: r.canAccept === true,
  };
}

/** The owner must tick the box before going on: nothing accepted yet, or an older version. PURE. */
export function needsTerms(state: TermsState | null, current: string = TERMS_VERSION): boolean {
  if (!state || !state.canAccept) return false;
  return state.acceptedVersion === null || state.acceptedVersion < current;
}

/** The line in Settings -> Your data. PURE. */
export function acceptedLine(state: TermsState | null): string | null {
  if (!state?.acceptedVersion || state.acceptedAt === null) return null;
  const day = new Date(state.acceptedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
  return `You accepted the terms on ${day} (version ${state.acceptedVersion}).`;
}

/** What the server knows; null when it has no 0033 yet (nothing to ask). Throws when offline. */
export async function getTerms(key: string): Promise<TermsState | null> {
  try {
    return termsFromRow(await call<unknown>('owner_terms', { p_key: key }));
  } catch (e) {
    if (isMissingFunction(e)) return null;
    throw e;
  }
}

export async function acceptTerms(key: string, version: string = TERMS_VERSION): Promise<TermsState> {
  return termsFromRow(await call<unknown>('owner_accept_terms', { p_key: key, p_version: version }));
}
