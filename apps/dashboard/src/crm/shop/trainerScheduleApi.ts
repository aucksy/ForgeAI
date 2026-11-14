/**
 * F105: the admin app's calls about trainer pages and personal-training bookings
 * (supabase/migrations/0065_trainer_schedule.sql, NOT APPLIED). Every call carries the owner, desk or trainer key;
 * the server keeps each gym to its own trainers and members, lets a trainer edit only their own page, and checks
 * the clashes again (one booking at a time per gym).
 *
 * Until 0065 is on the server, the first read answers PGRST202 ("no such function"): the page remembers "not
 * here yet" and More -> Trainers SAYS SO ("not ready for your gym yet"), never a pretend list. Any other failure
 * (no internet) is not remembered.
 */

import { demoWithoutServer } from '../../lib/demoLock';
import { bookingFrom, hoursFrom, scheduleFrom, type PtBooking, type TrainerSchedule, type WeekHours } from '../logic/trainerSchedule';
import type { DateISO } from '../logic/dates';
import { isNoSuchFunction } from '../logic/workoutOffer';
import { call } from './api';

export type ScheduleServer = 'unknown' | 'yes' | 'no';

let server: ScheduleServer = 'unknown';

export function scheduleServer(): ScheduleServer {
  return demoWithoutServer() ? 'no' : server;
}

/** The week starting `monday`, or 'missing' while the server has no 0065 (then remembered for the page). */
export async function getTrainerSchedule(key: string, monday: DateISO): Promise<TrainerSchedule | 'missing'> {
  if (scheduleServer() === 'no') return 'missing';
  try {
    const s = scheduleFrom(await call<unknown>('owner_trainer_schedule', { p_key: key, p_week: monday }), monday);
    server = 'yes';
    return s;
  } catch (e) {
    if (isNoSuchFunction(e)) {
      if (server !== 'no') console.info('[trainers] this gym server has no trainer pages yet (0065 not applied); the screen says so');
      server = 'no';
      return 'missing';
    }
    throw e;
  }
}

/**
 * Save a trainer's page (the owner, or the trainer themself). `photo`: undefined keeps it, null removes it, a
 * base64 JPEG sets it.
 */
export async function saveTrainerProfile(
  key: string,
  p: { staffId: string; teaches: string; hours: WeekHours; photo: string | null | undefined },
): Promise<{ teaches: string | null; hours: WeekHours; photo: string | null }> {
  const r = (await call<unknown>('owner_save_trainer_profile', {
    p_key: key,
    p_staff: p.staffId,
    p_teaches: p.teaches,
    p_hours: p.hours,
    p_photo: p.photo === undefined ? null : (p.photo ?? ''),
  })) as Record<string, unknown> | null;
  return {
    teaches: typeof r?.teaches === 'string' ? r.teaches : null,
    hours: hoursFrom(r?.hours),
    photo: typeof r?.photo === 'string' && r.photo ? r.photo : null,
  };
}

/** Book a member with a trainer. `requestId`: made once when the sheet opens (a second press finds the first). */
export async function bookPt(
  key: string,
  b: { trainerId: string; memberId: string; day: DateISO; start: number; length: number; outsideOk: boolean; requestId: string },
): Promise<PtBooking> {
  const r = bookingFrom(
    await call<unknown>('owner_book_pt', {
      p_key: key,
      p_staff: b.trainerId,
      p_member: b.memberId,
      p_day: b.day,
      p_start: b.start,
      p_length: b.length,
      p_outside_ok: b.outsideOk,
      p_request: b.requestId,
    }),
  );
  if (!r) throw new Error('unreadable booking');
  return r;
}

export async function cancelPt(key: string, bookingId: string): Promise<void> {
  await call<unknown>('owner_cancel_pt', { p_key: key, p_booking: bookingId });
}

/** Tests only: back to a fresh page. */
export function resetScheduleServerForTest(): void {
  server = 'unknown';
}
