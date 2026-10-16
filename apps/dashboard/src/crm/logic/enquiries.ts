/**
 * Enquiries — people who asked about joining (a walk-in, a phone call) and have not joined yet
 * (Gym Panel step 5, 15 Oct 2026). Owners chase them by a follow-up date, the way GoGym4U and
 * GymBook do it: whoever is due today or overdue is the list they open every morning.
 *
 * PURE (no screen code, no storage): which bucket an enquiry sits in, the counts on the chips and
 * the home tile, the add-form checks, and the follow-up WhatsApp message.
 */

import { firstName } from '../shop/invite';
import { addDays, isValidDateISO, type DateISO } from './dates';
import { DEFAULT_DIAL_CODE, normalizeName, normalizePhone } from './members';
import type { Enquiry, EnquiryDraft } from '../types';

// ---------------------------------------------------------------- buckets

export type EnquiryBucket = 'overdue' | 'today' | 'later' | 'joined' | 'lost';

/**
 * Where an enquiry sits today. Open ones go by their follow-up date: before today is overdue,
 * today is today, later (or no date at all) is later. Closed ones go by how they closed.
 */
export function enquiryBucket(e: Pick<Enquiry, 'status' | 'followUpOn'>, today: DateISO): EnquiryBucket {
  if (e.status === 'joined') return 'joined';
  if (e.status === 'lost') return 'lost';
  if (!e.followUpOn) return 'later';
  if (e.followUpOn < today) return 'overdue';
  if (e.followUpOn === today) return 'today';
  return 'later';
}

export type BucketCounts = Record<EnquiryBucket, number>;

export function bucketCounts(list: readonly Enquiry[], today: DateISO): BucketCounts {
  const counts: BucketCounts = { overdue: 0, today: 0, later: 0, joined: 0, lost: 0 };
  for (const e of list) counts[enquiryBucket(e, today)] += 1;
  return counts;
}

/** The number on the home tile and the default chip: overdue + due today. */
export function dueCount(list: readonly Enquiry[], today: DateISO): number {
  const c = bucketCounts(list, today);
  return c.overdue + c.today;
}

// ---------------------------------------------------------------- the chips

export type EnquiryFilter = 'due' | 'later' | 'joined' | 'lost' | 'all';

export const ENQUIRY_FILTERS: readonly EnquiryFilter[] = ['due', 'later', 'joined', 'lost', 'all'];

const FILTER_BUCKETS: Record<EnquiryFilter, readonly EnquiryBucket[]> = {
  due: ['overdue', 'today'],
  later: ['later'],
  joined: ['joined'],
  lost: ['lost'],
  all: ['overdue', 'today', 'later', 'joined', 'lost'],
};

export function filterCounts(list: readonly Enquiry[], today: DateISO): Record<EnquiryFilter, number> {
  const c = bucketCounts(list, today);
  return {
    due: c.overdue + c.today,
    later: c.later,
    joined: c.joined,
    lost: c.lost,
    all: list.length,
  };
}

const BUCKET_ORDER: Record<EnquiryBucket, number> = { overdue: 0, today: 1, later: 2, joined: 3, lost: 4 };

/**
 * The enquiries a chip shows, in calling order: open ones by follow-up date (the longest overdue
 * first, no date last), closed ones newest first. Ties go to whoever asked first.
 */
export function filterEnquiries(list: readonly Enquiry[], filter: EnquiryFilter, today: DateISO): Enquiry[] {
  const wanted = FILTER_BUCKETS[filter];
  return list
    .filter((e) => wanted.includes(enquiryBucket(e, today)))
    .sort((a, b) => {
      const ba = enquiryBucket(a, today);
      const bb = enquiryBucket(b, today);
      if (ba !== bb) return BUCKET_ORDER[ba] - BUCKET_ORDER[bb];
      if (ba === 'joined' || ba === 'lost') return b.updatedAt - a.updatedAt || b.createdAt - a.createdAt;
      if (a.followUpOn !== b.followUpOn) {
        if (!a.followUpOn) return 1;
        if (!b.followUpOn) return -1;
        return a.followUpOn < b.followUpOn ? -1 : 1;
      }
      return a.createdAt - b.createdAt;
    });
}

// ---------------------------------------------------------------- follow-up date

export interface FollowUpPick {
  label: string;
  date: DateISO;
}

/** The quick picks on "Dobara call kab": tomorrow, 3 days, a week. */
export function followUpPicks(today: DateISO): FollowUpPick[] {
  return [
    { label: 'Tomorrow', date: addDays(today, 1) },
    { label: 'In 3 days', date: addDays(today, 3) },
    { label: 'In a week', date: addDays(today, 7) },
  ];
}

// ---------------------------------------------------------------- the add form

export interface EnquiryFormDraft {
  name: string;
  dialCode: string;
  phone: string;
  interest: string;
  followUpOn: string;
}

export type EnquiryField = keyof EnquiryFormDraft;

export type EnquiryValidation =
  | { ok: true; value: EnquiryDraft }
  | { ok: false; field: EnquiryField; message: string };

const NAME_MAX = 80;
const INTEREST_MAX = 200;

/** A blank add form: +91, follow-up tomorrow. */
export function emptyEnquiryForm(today: DateISO): EnquiryFormDraft {
  return { name: '', dialCode: DEFAULT_DIAL_CODE, phone: '', interest: '', followUpOn: addDays(today, 1) };
}

/** Check the add form; name the one field at fault. */
export function validateEnquiry(form: EnquiryFormDraft, today: DateISO): EnquiryValidation {
  const name = normalizeName(form.name);
  if (name.length < 2) {
    return { ok: false, field: 'name', message: 'Type their name.' };
  }
  if (name.length > NAME_MAX) {
    return {
      ok: false,
      field: 'name',
      message: `The name can be at most ${NAME_MAX} letters.`,
    };
  }

  const phone = normalizePhone(form.dialCode, form.phone);
  if (!phone) {
    return { ok: false, field: 'phone', message: 'This mobile number looks wrong. Check it and type it again.' };
  }

  const interest = form.interest.trim().replace(/\s+/g, ' ');
  if (interest.length > INTEREST_MAX) {
    return {
      ok: false,
      field: 'interest',
      message: `Use at most ${INTEREST_MAX} letters.`,
    };
  }

  const followRaw = form.followUpOn.trim();
  if (followRaw && !isValidDateISO(followRaw)) {
    return { ok: false, field: 'followUpOn', message: 'Pick a real date.' };
  }
  if (followRaw && followRaw < today) {
    return {
      ok: false,
      field: 'followUpOn',
      message: 'The follow-up date can’t be in the past.',
    };
  }

  return {
    ok: true,
    value: { name, phone: phone.e164, interest: interest || null, followUpOn: followRaw || null },
  };
}

/**
 * An OPEN enquiry already on this number, so the add form can warn ("already asked on…").
 * A warning, not a block: the same person can ask twice, or share a number with family.
 */
export function findOpenDuplicate(list: readonly Enquiry[], phoneE164: string, selfId?: string): Enquiry | null {
  return list.find((e) => e.status === 'open' && e.phone === phoneE164 && e.id !== selfId) ?? null;
}

// ---------------------------------------------------------------- the WhatsApp message

/**
 * The follow-up message, polite and short, signed by the gym. The owner
 * can edit it in WhatsApp before sending.
 */
export function followUpMessage(e: Pick<Enquiry, 'name' | 'interest'>, gym: { name: string }): string {
  const n = firstName(e.name);
  const gymName = gym.name.trim() || 'our gym';
  const interest = e.interest?.trim();
  const hello = n ? `Hi ${n},` : 'Hi,';
  const asked = interest
    ? `you asked about ${gymName} (${interest}).`
    : `you asked about ${gymName}.`;
  return [
    `${hello} ${asked}`,
    'Would you like to start this week? Reply here if you have any questions, or come to the gym.',
    `– ${gym.name.trim() || 'Your gym'}`,
  ].join('\n');
}
