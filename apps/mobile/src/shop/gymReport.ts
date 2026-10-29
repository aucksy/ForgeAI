/**
 * "Send your report to the gym?" (F121) - the PURE half. The gym's desk taps "Request workout report";
 * the member's app asks; on yes the PHONE makes the report (the same spreadsheet as Settings -> Save as
 * a spreadsheet, only the workouts on or after the member's join date at THAT gym) and sends it to
 * that gym only. The server side is supabase/migrations/0045_report_requests.sql; the join date
 * (`fromDay`) comes from the gym's own records there, never from this phone. This file reads the
 * server's answers and picks every word; GymReportPanel.tsx lays them out, gymReportMake.ts makes the
 * file. Members always keep saving ALL their own workouts themselves (R-220): nothing here changes that.
 * Member words: never "volume", "PR" or "session".
 */
import { tinyDateWithYear } from '@/lib/date';

export type ReportRequestStatus = 'pending' | 'sent' | 'declined' | 'expired';

export interface ReportRequest {
  id: string;
  status: ReportRequestStatus;
  /** The member's join date at this gym: the report starts here (YYYY-MM-DD). */
  fromDay: string;
  /** The member already said yes (the file may still be on its way). */
  agreed: boolean;
}

export type ReportRequestsAnswer =
  | { ok: true; day: string; requests: ReportRequest[] }
  /** The member's identity problem (0023): the plan card already explains it, so nothing shows. */
  | { ok: false; problem: string };

/** The largest report the server takes (characters). */
export const REPORT_MAX_CHARS = 3_000_000;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const day = (v: unknown): string | null => (typeof v === 'string' && ISO.test(v) ? v : null);
const STATUSES: readonly ReportRequestStatus[] = ['pending', 'sent', 'declined', 'expired'];

/** One request from the server; null when it is not one. PURE. */
export function reportRequestFromRow(v: unknown): ReportRequest | null {
  if (!isObj(v)) return null;
  const id = str(v.id);
  const status = STATUSES.find((s) => s === v.status) ?? null;
  const fromDay = day(v.fromDay);
  if (!id || !status || !fromDay) return null;
  return { id, status, fromDay, agreed: v.agreed === true };
}

/** member_report_requests' answer, checked; null when it is not one. PURE. */
export function reportRequestsFromRow(raw: unknown): ReportRequestsAnswer | null {
  const r = Array.isArray(raw) ? raw[0] : raw;
  if (!isObj(r)) return null;
  if (typeof r.error === 'string' && r.error) return { ok: false, problem: r.error };
  if (r.ok !== true) return null;
  const today = day(r.day);
  if (!today) return null;
  const requests: ReportRequest[] = [];
  for (const q of Array.isArray(r.requests) ? r.requests : []) {
    const req = reportRequestFromRow(q);
    if (req) requests.push(req);
  }
  return { ok: true, day: today, requests };
}

/** member_answer_report_request / member_attach_report's answer: the request, or the refusal code. PURE. */
export function reportAnswerFromRow(raw: unknown): { ok: true; request: ReportRequest } | { ok: false; refused: string } | null {
  const r = Array.isArray(raw) ? raw[0] : raw;
  if (!isObj(r)) return null;
  if (typeof r.error === 'string' && r.error) return { ok: false, refused: r.error };
  const request = r.ok === true ? reportRequestFromRow(r.request) : null;
  return request ? { ok: true, request } : null;
}

/** The request the card asks about: the newest one still waiting (the server keeps one). PURE. */
export function requestToAsk(a: ReportRequestsAnswer | null): ReportRequest | null {
  if (!a || !a.ok) return null;
  return a.requests.find((r) => r.status === 'pending') ?? null;
}

export const GYM_REPORT_WORDS = {
  title: 'Send your report to the gym?', // member-words
  yes: 'Yes, send it', // member-words
  no: 'No', // member-words
  sending: 'Sending your report…', // member-words
  sent: 'Report sent to the gym.', // member-words
  declined: 'OK. Nothing was sent to the gym.', // member-words
  tryAgain: 'Try again', // member-words
  failed: "Couldn't send it. Check your internet and try again.", // member-words
  ownCopy: 'Want your own copy? Go to Settings and save all your workouts.', // member-words
} as const;

/**
 * "Your gym wants a copy of your workouts from 1 Jun, the day you joined: exercises, sets, weights,
 * reps and your notes. The gym owner and desk can see it. Older workouts stay on your phone." PURE.
 */
export function reportAskLine(gymName: string, fromDay: string, today: string): string {
  const gym = gymName.trim() || 'Your gym';
  return `${gym} wants a copy of your workouts from ${tinyDateWithYear(fromDay, today)}, the day you joined: exercises, sets, weights, reps and your notes. The gym owner and desk can see it. Older workouts stay on your phone.`; // member-words
}

/** The words for a refusal code from the server (0045), or the phone's own TOO_BIG. PURE. */
export function reportRefusedWords(code: string): string {
  switch (code) {
    case 'GONE':
      return 'The gym no longer needs this report.'; // member-words
    case 'TOO_BIG':
      return 'We could not send your report because it is too big. Please tell the gym desk.'; // member-words
    case 'SUSPENDED':
      return 'Your gym is not taking reports in the app right now.'; // member-words
    default:
      return GYM_REPORT_WORDS.failed;
  }
}

/** The report is ready to send only when it fits the server's limit. PURE. */
export function reportTooBig(csv: string): boolean {
  return csv.length > REPORT_MAX_CHARS;
}
