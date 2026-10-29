/**
 * Workout reports the gym asks for (F121): the calls to the gym server. Thin wrappers over
 * supabase/migrations/0045_report_requests.sql; every call carries the owner or desk key and the
 * server keeps each gym to its own members' reports. Rules and words: logic/gymReports.ts.
 *
 * Until 0045 is on the server, the first read answers PGRST202 ("no such function"): the panel then
 * remembers "no reports here" for the life of the page and the card stays hidden, with no error shown
 * and one quiet note in the console (the same as F150's requests). Any other failure (no internet) is
 * not remembered: the next read asks again.
 */

import { isDemoLocked } from '../../lib/demoLock';
import { reportFileFrom, reportRowFrom, reportRowsFrom, type ReportRow } from '../logic/gymReports';
import { isNoSuchFunction } from '../logic/workoutOffer';
import { call } from './api';

export type GymReportServer = 'unknown' | 'yes' | 'no';

let server: GymReportServer = 'unknown';

export function gymReportServer(): GymReportServer {
  return isDemoLocked() ? 'no' : server;
}

function markNoServer(): void {
  if (server === 'no') return;
  server = 'no';
  console.info('[gym reports] this gym server has no workout reports yet (0045 not applied); the report card stays hidden');
}

/** One member's report requests, newest first (the last 60 days). 'missing' without 0045 (then remembered). */
export async function listReportRequests(key: string, rosterId: string): Promise<ReportRow[] | 'missing'> {
  if (gymReportServer() === 'no') return 'missing';
  try {
    const rows = reportRowsFrom(await call<unknown>('owner_report_requests', { p_key: key, p_member: rosterId }));
    server = 'yes';
    return rows;
  } catch (e) {
    if (isNoSuchFunction(e)) {
      markNoServer();
      return 'missing';
    }
    throw e;
  }
}

/** Ask the member for their report (one waiting request per member; asking again returns it). Throws the server's refusal. */
export async function requestReport(key: string, rosterId: string): Promise<ReportRow | null> {
  return reportRowFrom(await call<unknown>('owner_request_report', { p_key: key, p_member: rosterId }));
}

/** The sent report's text, to save as a file. Throws GONE / NOT_SENT / EXPIRED as the server says. */
export async function downloadReportFile(key: string, requestId: string): Promise<{ row: ReportRow; csv: string } | null> {
  return reportFileFrom(await call<unknown>('owner_report_file', { p_key: key, p_request: requestId }));
}

/** Tests only: back to a fresh page. */
export function resetGymReportsForTest(): void {
  server = 'unknown';
}
