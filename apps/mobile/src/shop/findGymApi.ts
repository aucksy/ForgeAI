/**
 * "Find my gym with my number" (R-458 + F56 R-461): the calls. The WhatsApp check is the panel Worker's
 * "Verify with WhatsApp" (deploy/panel/phoneInbound.js, purpose 'member'); the search and the link are the gym
 * server's 0068 functions (gymApi.apiFindGyms / apiClaimPhone). The words and the checks are in findGym.ts.
 *
 * After "Join <gym>" on a found gym, the same proof links the gym's list member to this app (member_claim_phone):
 * `rememberFound` keeps it in memory for 15 minutes (the proof's life); `claimIfJoined` (planSync, when the gym
 * link appears) hands it in once and keeps the plan the search showed, so every paid feature opens at once.
 * Kept only in memory: a proof is a one-time pass, never written to the phone. If the app is closed in between,
 * the gym's desk confirms the number the usual way (0048). Shared code: Android and iPhone alike.
 */
import { noteFoundGym } from '@/plan/memberPlanStore';

import { apiClaimPhone, apiFindGyms } from './gymApi';
import { checkProblemFrom, checkStartFrom, checkStatusFrom, type CheckProblem, type CheckStart, type CheckStatus, type FoundGym } from './findGym';
import type { GymLink } from './types';

export const CHECK_BASE = 'https://app.mettleup.fit/api/phone-code/inbound';
/** "Tell my gym" with a gym name typed: the landing page's lead form (deploy/panel/leads.js, source 'member-app'). */
export const LEAD_URL = 'https://app.mettleup.fit/api/lead';
const TIMEOUT_MS = 15000;

async function fetchJson(url: string, init?: RequestInit): Promise<{ status: number; body: unknown } | null> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { ...init, signal: ac.signal, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
    let body: unknown = null;
    try {
      body = await r.json();
    } catch {
      body = null;
    }
    return { status: r.status, body };
  } catch (e) {
    console.warn('[find-gym] no answer from', url.replace(/\?.*$/, ''), e instanceof Error ? e.message : e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Which MettleUp gyms list the proven number (gymApi.apiFindGyms, 0068). */
export const findGyms = apiFindGyms;

/** Start the WhatsApp check for this 10-digit number. */
export async function startCheck(mobile10: string): Promise<{ ok: true; start: CheckStart } | { ok: false; problem: CheckProblem }> {
  const r = await fetchJson(`${CHECK_BASE}/start`, { method: 'POST', body: JSON.stringify({ phone: mobile10, purpose: 'member', website: '' }) });
  if (!r) return { ok: false, problem: 'OFFLINE' };
  const start = r.status >= 200 && r.status < 300 ? checkStartFrom(r.body) : null;
  if (start) return { ok: true, start };
  const problem = checkProblemFrom(r.status, r.body);
  console.warn('[find-gym] the check did not start', r.status, problem);
  return { ok: false, problem };
}

/** Has the member's message arrived? null = no answer (offline); try again later. */
export async function checkStatus(id: string): Promise<CheckStatus | null> {
  const r = await fetchJson(`${CHECK_BASE}/status?id=${encodeURIComponent(id)}`);
  if (!r) return null;
  if (r.status < 200 || r.status >= 300) {
    console.warn('[find-gym] status refused', r.status);
    return r.status === 400 || r.status === 404 ? { state: 'expired' } : null;
  }
  return checkStatusFrom(r.body);
}

/**
 * "Tell my gym" with a gym name typed: the landing page's lead form, source 'member-app' (gym name and city only,
 * never the member's number). Best try: the share itself never waits for it. Logs why it was not kept.
 */
export async function sendGymLead(lead: { gym: string; city: string }): Promise<boolean> {
  const r = await fetchJson(LEAD_URL, { method: 'POST', body: JSON.stringify({ gym: lead.gym, city: lead.city, source: 'member-app', website: '' }) });
  const ok = !!r && r.status >= 200 && r.status < 300;
  if (!ok) console.warn('[find-gym] the gym lead was not kept', r ? r.status : 'offline');
  return ok;
}

// ------------------------------------------------------------------ the link after "Join <gym>"

interface Pending {
  proof: string;
  gym: FoundGym;
  until: number;
}
let pending: Pending | null = null;
const PROOF_MS = 15 * 60 * 1000;

/** The member tapped "Join <gym>" on a found gym: keep the proof (memory only) for the link after the join. */
export function rememberFound(proof: string, gym: FoundGym): void {
  pending = { proof, gym, until: Date.now() + PROOF_MS };
}

/** For the tests and Erase all data. */
export function forgetFound(): void {
  pending = null;
}

/**
 * The gym link appeared (the join went through). If it is the gym the search found, hand the proof in once:
 * the gym's list member is linked, and the plan the search showed unlocks every paid feature now (the next
 * "My membership" answer keeps it up to date). Never throws.
 */
export async function claimIfJoined(link: GymLink | null): Promise<void> {
  const p = pending;
  if (!p || !link || link.gymId !== p.gym.gymId) return;
  pending = null;
  if (Date.now() > p.until) {
    console.warn('[find-gym] the check ran out before the join; the desk confirms the number instead');
    return;
  }
  try {
    const a = await apiClaimPhone(link.memberKey, p.proof);
    if (!a.ok) {
      console.warn('[find-gym] number link after the join refused', a.problem);
      return;
    }
    noteFoundGym(link.memberId, link.gymName || p.gym.gymName, p.gym.pass ? null : p.gym.endsOn);
    console.log('[find-gym] number linked after the join');
  } catch (e) {
    console.warn('[find-gym] number link after the join failed', e);
  }
}

// ------------------------------------------------------------------ QA builds only

let qaFind: { gyms: FoundGym[] } | null = null;

/**
 * QA builds only (mettleup://qa-plan?find=found&findGym=QA%20UAT%20Gym&findCode=QAGYM1, or find=none): the next
 * "Check with WhatsApp" answers at once with this made-up result (the screen says so); find=off clears it.
 */
export function setQaFind(p: Record<string, string | undefined>): void {
  if (p.find === 'off') qaFind = null;
  else if (p.find === 'none') qaFind = { gyms: [] };
  else if (p.find === 'found') {
    const code = String(p.findCode ?? 'QAGYM1').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'QAGYM1';
    qaFind = { gyms: [{ gymId: 'qa-find', gymName: (p.findGym ?? 'QA UAT Gym').slice(0, 80), joinCode: code, endsOn: /^\d{4}-\d{2}-\d{2}$/.test(p.findEnds ?? '') ? (p.findEnds as string) : null, pass: p.findPass === '1' }] };
  }
}

/** The made-up answer, when a QA link set one (never in a store build: qa-plan applies only in QA builds). */
export function qaFindAnswer(): { gyms: FoundGym[] } | null {
  return qaFind;
}
