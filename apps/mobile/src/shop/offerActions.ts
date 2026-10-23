/**
 * The gym's workout offer (OWNER-INBOX #49 step 2): the calls (gymApi.ts) and what the phone keeps
 * (AsyncStorage). The rules are offer.ts's (pure, tested); the words offerWords.ts's.
 *
 *  - The consent record is written ONLY when the member presses "Join the offer" on the consent
 *    screen, and removed at once on "Leave the offer" (before the gym is told, so nothing is sent
 *    even with no signal). A Leave the gym has not heard is sent again on the next refresh.
 *  - Dates leave the phone only through syncOfferDates, only when offer.ts mayShareDates says so.
 *  - A server without the offer (0025 not applied): one log line, no card, no words to the member.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { getDb } from '@/db';
import { todayISO } from '@/lib/date';

import { apiJoinOffer, apiLeaveOffer, apiOfferDays, apiOffers, type OfferResult } from './gymApi';
import {
  OFFER_CONSENT_KEY,
  OFFER_KEPT_KEY,
  OFFER_LEAVE_KEY,
  OFFER_SENT_KEY,
  OFFER_STORAGE_KEYS,
  consentFromRaw,
  datesToSend,
  mayShareDates,
  offersFromRow,
  offersToRow,
  sentFromRaw,
  shouldSendDates,
  type MemberOffer,
  type OfferConsent,
  type OffersAnswer,
} from './offer';
import { OFFER_NOTICE_VERSION, joinErrorWords } from './offerWords';
import type { GymLink } from './types';
import type { CountRow } from './workoutCode';

let toldMissing = false;
/** One line in the log, once per run: the gym's server has no workout offers yet. */
function noteMissing(): void {
  if (toldMissing) return;
  toldMissing = true;
  console.log('[Forge] offers: server has no workout offers yet');
}

async function readJson(key: string): Promise<unknown> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch (e) {
    console.warn('[ForgeErr] offer: reading what the phone kept', key, e);
    return null;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('[ForgeErr] offer: keeping', key, e);
  }
}

async function remove(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch (e) {
    console.warn('[ForgeErr] offer: forgetting', key, e);
  }
}

export async function readConsent(): Promise<OfferConsent | null> {
  return consentFromRaw(await readJson(OFFER_CONSENT_KEY));
}

/**
 * Moves on at every Leave (the offer or the gym) and Erase: a sync that started before it must not
 * write its answer back afterwards (review fix, 23 Oct 2026).
 */
let offerEpoch = 0;

/** Leave the gym / Erase all data: the consent, a pending Leave, the kept card and the last send all go. */
export async function forgetOfferData(): Promise<void> {
  offerEpoch += 1;
  for (const k of OFFER_STORAGE_KEYS) await remove(k);
}

/** The last answer, kept per member so the card still shows at the gym with no signal. */
export async function readKeptOffer(memberId: string): Promise<{ answer: OffersAnswer; at: number } | null> {
  const v = await readJson(OFFER_KEPT_KEY);
  if (!v || typeof v !== 'object') return null;
  const o = v as { memberId?: unknown; answer?: unknown; at?: unknown };
  if (o.memberId !== memberId || typeof o.at !== 'number') return null;
  const answer = offersFromRow(o.answer);
  return answer ? { answer, at: o.at } : null;
}

async function keepOffer(memberId: string, answer: OffersAnswer): Promise<void> {
  await writeJson(OFFER_KEPT_KEY, { memberId, answer: offersToRow(answer), at: Date.now() });
  // R-86: the offer's reminders (days added, ending soon, almost there) follow the kept answer.
  void import('./gymReminders').then((m) => m.refreshGymReminders()).catch((e: unknown) => console.warn('[ForgeErr] offer: the gym reminders', e));
}

/** A "Leave the offer" the gym has not confirmed: sent again before anything else. */
async function retryPendingOfferLeave(link: GymLink): Promise<void> {
  const v = (await readJson(OFFER_LEAVE_KEY)) as { memberKey?: unknown; offerId?: unknown } | null;
  if (!v || typeof v.offerId !== 'string' || typeof v.memberKey !== 'string') return;
  // A Leave from another membership of the app (rejoined since): that key is retired already.
  if (v.memberKey !== link.memberKey) {
    await remove(OFFER_LEAVE_KEY);
    return;
  }
  const r = await apiLeaveOffer(link.memberKey, v.offerId);
  if (r.ok || r.missing || r.error?.kind === 'BAD_KEY') await remove(OFFER_LEAVE_KEY);
}

/** `stale`: a Leave (or Erase) happened while this sync ran; its answer is thrown away. */
export type OfferLoad = { kind: 'answer'; answer: OffersAnswer } | { kind: 'missing' } | { kind: 'failed'; offline: boolean } | { kind: 'stale' };

function loadFrom(r: OfferResult): OfferLoad {
  if (r.ok) return { kind: 'answer', answer: r.data };
  if ('missing' in r) {
    noteMissing();
    return { kind: 'missing' };
  }
  if ('refused' in r) {
    console.warn('[ForgeErr] offer: the gym refused', r.refused);
    return { kind: 'failed', offline: false };
  }
  if (r.error.kind !== 'offline' && r.error.kind !== 'timeout') console.warn('[ForgeErr] offer', r.error);
  return { kind: 'failed', offline: r.error.kind === 'offline' || r.error.kind === 'timeout' };
}

/** The workouts the offer's rule reads, from the day the member joined to today. */
async function readCountRows(from: string, to: string): Promise<CountRow[]> {
  const rows = await getDb().getAllAsync<{ date_iso: string; source: string; started_at: number; ended_at: number | null; working: number }>(
    `SELECT ws.date_iso, ws.source, ws.started_at, ws.ended_at,
            (SELECT COUNT(*) FROM set_entries se WHERE se.session_id = ws.id AND se.is_warmup = 0) AS working
       FROM workout_sessions ws
      WHERE ws.date_iso >= ? AND ws.date_iso <= ?`,
    [from, to],
  );
  return rows.map((r) => ({ dateISO: r.date_iso, source: r.source, startedAt: r.started_at, endedAt: r.ended_at, workingSets: r.working }));
}

/**
 * Send the counted workout DATES when the member is in the offer (and only then), and hand back
 * the gym's answer after it. With no answer given, the gym is asked first. Quiet: a failure keeps
 * what the card shows.
 */
let syncing: Promise<OfferLoad> | null = null;
let syncingEpoch = -1;

export function syncOfferDates(link: GymLink, known?: OffersAnswer): Promise<OfferLoad> {
  // A sync from before a Leave is not shared with a call made after it.
  if (syncing && syncingEpoch === offerEpoch) return syncing;
  const epoch = offerEpoch;
  const p = (async (): Promise<OfferLoad> => {
    await retryPendingOfferLeave(link).catch((e: unknown) => console.warn('[ForgeErr] offer: resending a leave', e));
    let load: OfferLoad = known ? { kind: 'answer', answer: known } : loadFrom(await apiOffers(link.memberKey));
    if (epoch !== offerEpoch) return { kind: 'stale' };
    if (load.kind !== 'answer') return load;
    const answer = load.answer;
    const consent = await readConsent();
    if (mayShareDates(consent, answer, link.memberId) && answer.offer && answer.me) {
      const today = todayISO();
      const offer = answer.offer;
      const rows = await readCountRows(answer.me.joinedOn, today);
      const days = datesToSend(rows, answer.me, today, offer.minMinutes, offer.minSets);
      // Nothing new to tell (every date already matched): no call. The same unmatched set again
      // (a workout on a day with no check-in): at most once a day.
      const news = days.some((d) => !answer.me!.days.includes(d));
      const last = sentFromRaw(await readJson(OFFER_SENT_KEY));
      if (news && shouldSendDates(last, offer.id, days, today) && epoch === offerEpoch) {
        const after = loadFrom(await apiOfferDays(link.memberKey, offer.id, days));
        // Remember it once the gym heard it (an answer or a refusal such as TOO_MANY, not no signal).
        if (after.kind === 'answer' || (after.kind === 'failed' && !after.offline)) {
          if (epoch === offerEpoch) await writeJson(OFFER_SENT_KEY, { offerId: offer.id, days: days.join(','), on: today });
        }
        if (after.kind === 'answer') load = after;
      }
    }
    if (epoch !== offerEpoch) return { kind: 'stale' };
    if (load.kind === 'answer') await keepOffer(link.memberId, load.answer);
    return load;
  })();
  syncing = p;
  syncingEpoch = epoch;
  const done = (): void => {
    if (syncing === p) syncing = null;
  };
  p.then(done, done);
  return p;
}

/**
 * "Join the offer" pressed on the consent screen: the consent is kept on the phone, then the gym
 * is told (with the words' version). On a refusal the consent goes again and the words say why.
 */
export async function joinOffer(link: GymLink, offer: MemberOffer): Promise<{ ok: true; answer: OffersAnswer } | { ok: false; words: string }> {
  const consent: OfferConsent = { memberId: link.memberId, offerId: offer.id, noticeVersion: OFFER_NOTICE_VERSION, at: Date.now() };
  await writeJson(OFFER_CONSENT_KEY, consent);
  await remove(OFFER_LEAVE_KEY);
  const r = await apiJoinOffer(link.memberKey, offer.id, OFFER_NOTICE_VERSION);
  if (!r.ok) {
    await remove(OFFER_CONSENT_KEY);
    if ('missing' in r) {
      noteMissing();
      return { ok: false, words: joinErrorWords(null, false) };
    }
    if ('refused' in r) return { ok: false, words: joinErrorWords(r.refused, false) };
    const offline = r.error.kind === 'offline' || r.error.kind === 'timeout';
    if (!offline) console.warn('[ForgeErr] offer: join', r.error);
    return { ok: false, words: joinErrorWords(null, offline) };
  }
  // The dates so far (from today, the day of joining) go now.
  const after = await syncOfferDates(link, r.data).catch((e: unknown): OfferLoad => {
    console.warn('[ForgeErr] offer: first dates after joining', e);
    return { kind: 'answer', answer: r.data };
  });
  return { ok: true, answer: after.kind === 'answer' ? after.answer : r.data };
}

/**
 * "Leave the offer": the phone stops at once (consent gone), then the gym deletes the dates. With
 * no signal the Leave is kept and sent again on the next refresh.
 */
export async function leaveOffer(link: GymLink, offerId: string): Promise<void> {
  offerEpoch += 1;
  await remove(OFFER_CONSENT_KEY);
  await remove(OFFER_SENT_KEY);
  await writeJson(OFFER_LEAVE_KEY, { memberKey: link.memberKey, offerId });
  const r = await apiLeaveOffer(link.memberKey, offerId);
  if (r.ok || r.missing || r.error?.kind === 'BAD_KEY') await remove(OFFER_LEAVE_KEY);
  else if (r.error && r.error.kind !== 'offline' && r.error.kind !== 'timeout') console.warn('[ForgeErr] offer: leave', r.error);
}
