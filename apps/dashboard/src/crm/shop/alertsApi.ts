/**
 * R-506/R-510: the gym's alerts from the gym server (supabase/migrations/0075_gym_alerts.sql owner_alerts). Every
 * call carries the owner's, desk's or trainer's key; the server shows each person only what they may see.
 *
 * Until 0075 is on the server, the first call answers PGRST202 ("no such function"): this page then remembers
 * "not here" for the life of the page, and Needs you keeps working from the lists it reads itself (as
 * questionsApi.ts does for 0053). Any other failure is not remembered. The demo gym never calls.
 */

import { isDemoLocked } from '../../lib/demoLock';
import { alertInboxFrom, type AlertInbox } from '../logic/alertInbox';
import { gymAlertsFrom, type GymAlert } from '../logic/gymAlerts';
import { isNoSuchFunction } from '../logic/workoutOffer';
import { call } from './api';

let missing = false;

/** True once the server said it has no 0075 (or in the demo gym). */
export function alertsMissing(): boolean {
  return missing || isDemoLocked();
}

/** The alerts of the last 3 days this key may see, newest first. 'missing': no 0075. */
export async function getAlerts(key: string): Promise<GymAlert[] | 'missing'> {
  if (alertsMissing()) return 'missing';
  try {
    const list = gymAlertsFrom(await call<unknown>('owner_alerts', { p_key: key }));
    if (!list) throw new Error('unreadable answer');
    return list;
  } catch (e) {
    if (isNoSuchFunction(e)) {
      if (!missing) console.info('[alerts] this gym server has no alerts list yet (0075 not applied)');
      missing = true;
      return 'missing';
    }
    throw e;
  }
}

// ---------------------------------------------------------------- R-604: the bell from the server's truth (0098)

let inboxMissing = false;

/** True once the server said it has no 0098 (or in the demo gym): the panel then works as before 0098. */
export function inboxMissingNow(): boolean {
  return inboxMissing || isDemoLocked();
}

function noInbox(e: unknown): boolean {
  if (!isNoSuchFunction(e)) return false;
  if (!inboxMissing) console.info('[alerts] this gym server has no done/read list yet (0098 not applied)');
  inboxMissing = true;
  return true;
}

/** This person's bell: the main list, History, the number. 'missing': no 0098 (use getAlerts and the old rules). */
export async function getAlertInbox(key: string): Promise<AlertInbox | 'missing'> {
  if (inboxMissingNow()) return 'missing';
  try {
    const inbox = alertInboxFrom(await call<unknown>('owner_alert_list', { p_key: key }));
    if (!inbox) throw new Error('unreadable answer');
    return inbox;
  } catch (e) {
    if (noInbox(e)) return 'missing';
    throw e;
  }
}

/** The panel showed these: read for this person (never done). At most 200 at a time. */
export async function markAlertsReadOnServer(key: string, ids: readonly string[]): Promise<void> {
  if (inboxMissingNow() || ids.length === 0) return;
  try {
    for (let i = 0; i < ids.length; i += 200) await call<unknown>('owner_alerts_read', { p_key: key, p_ids: ids.slice(i, i + 200) });
  } catch (e) {
    if (!noInbox(e)) throw e;
  }
}

/** Its page was opened from the bell or Today: news is then done for this person. */
export async function markAlertOpenedOnServer(key: string, id: string): Promise<void> {
  if (inboxMissingNow()) return;
  try {
    await call<unknown>('owner_alert_opened', { p_key: key, p_alert: id });
  } catch (e) {
    if (!noInbox(e)) throw e;
  }
}

/** The X (remove = true) and its Undo (false), for this person only. Never makes a thing done. */
export async function removeAlertOnServer(key: string, id: string, remove: boolean): Promise<void> {
  if (inboxMissingNow()) return;
  try {
    await call<unknown>('owner_alert_remove', { p_key: key, p_alert: id, p_remove: remove });
  } catch (e) {
    if (!noInbox(e)) throw e;
  }
}
