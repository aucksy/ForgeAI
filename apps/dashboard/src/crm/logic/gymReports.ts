/**
 * Workout reports the gym asks for (F121) - the PURE half for the admin panel.
 *
 * On a member's page the desk taps "Request workout report". The member's app asks "Send your report
 * to the gym?"; on yes the phone makes the report (the same spreadsheet as the app's own "Save as a
 * spreadsheet", only workouts from the member's join date at this gym on) and sends it here; the desk
 * downloads it. Server: supabase/migrations/0045_report_requests.sql. A request nobody answers ends
 * after 30 days; a sent report can be downloaded for 30 days after it was sent.
 */

import type { DateISO } from '../types';
import { dateISOFromEpoch, formatDay } from './dates';

export type ReportStatus = 'pending' | 'sent' | 'declined' | 'expired';

export interface ReportRow {
  id: string;
  status: ReportStatus;
  /** The member's join date at this gym: the report starts here. */
  fromDay: DateISO;
  /** The member said yes (the file may still be on its way). */
  agreed: boolean;
  createdAt: number;
  answeredAt: number | null;
  sentAt: number | null;
  expiresAt: number | null;
  rosterId: string;
  memberName: string;
  requestedBy: string | null;
  workouts: number | null;
  sets: number | null;
  firstDay: DateISO | null;
  lastDay: DateISO | null;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const day = (v: unknown): DateISO | null => (typeof v === 'string' && ISO.test(v) ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const STATUSES: readonly ReportStatus[] = ['pending', 'sent', 'declined', 'expired'];

/** One request from owner_report_requests / owner_request_report / owner_report_file; null when it is not one. PURE. */
export function reportRowFrom(v: unknown): ReportRow | null {
  const r = Array.isArray(v) ? v[0] : v;
  if (!isObj(r)) return null;
  const id = str(r.id);
  const status = STATUSES.find((s) => s === r.status) ?? null;
  const fromDay = day(r.fromDay);
  if (!id || !status || !fromDay) return null;
  return {
    id,
    status,
    fromDay,
    agreed: r.agreed === true,
    createdAt: num(r.createdAt) ?? 0,
    answeredAt: num(r.answeredAt),
    sentAt: num(r.sentAt),
    expiresAt: num(r.expiresAt),
    rosterId: str(r.rosterId),
    memberName: str(r.memberName) || 'A member',
    requestedBy: str(r.requestedBy) || null,
    workouts: num(r.workouts),
    sets: num(r.sets),
    firstDay: day(r.firstDay),
    lastDay: day(r.lastDay),
  };
}

/** The list, newest first, junk left out. PURE. */
export function reportRowsFrom(raw: unknown): ReportRow[] {
  const out: ReportRow[] = [];
  for (const v of Array.isArray(raw) ? raw : []) {
    const r = reportRowFrom(v);
    if (r) out.push(r);
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

/** The report file the desk downloads (owner_report_file): the request and its text. PURE. */
export function reportFileFrom(raw: unknown): { row: ReportRow; csv: string } | null {
  const r = Array.isArray(raw) ? raw[0] : raw;
  const row = reportRowFrom(r);
  if (!row || !isObj(r) || typeof r.csv !== 'string') return null;
  return { row, csv: r.csv };
}

export const GYM_REPORT_DESK_WORDS = {
  title: 'Workout report', // member-words
  help: 'Ask this member to send their workouts from the app. Only workouts from the day they joined your gym are included.', // member-words
  request: 'Request workout report', // member-words
  asking: 'Asking…', // member-words
  download: 'Download report', // member-words
  downloading: 'Downloading…', // member-words
  failed: 'Couldn’t reach the server. Check the internet and try again.', // member-words
} as const;

/** Day of an instant, for the status line ("—" when there is none). PURE. */
const onDay = (ms: number | null): string => (ms == null ? '—' : formatDay(dateISOFromEpoch(ms)));

/**
 * The status line under the button:
 *   pending  "Asked on 12 Mar 2026. Waiting for the member to say yes in the app."
 *            (agreed: "The member said yes. The report is on its way.")
 *   sent     "Sent on 14 Mar 2026: 12 workouts, from 10 Mar 2026 to 13 Mar 2026."
 *   declined "The member said no on 13 Mar 2026. Nothing was sent."
 *   expired  "This request ended without a report. You can ask again."
 * PURE.
 */
export function reportStatusLine(r: ReportRow): string {
  switch (r.status) {
    case 'pending':
      return r.agreed
        ? 'The member said yes. The report is on its way.' // member-words
        : `Asked on ${onDay(r.createdAt)}. Waiting for the member to say yes in the app.`; // member-words
    case 'sent': {
      const n = r.workouts ?? 0;
      const count = n === 1 ? '1 workout' : `${n} workouts`;
      const span = r.firstDay && r.lastDay ? `, from ${formatDay(r.firstDay)} to ${formatDay(r.lastDay)}` : ' (nothing logged since joining)';
      return `Sent on ${onDay(r.sentAt)}: ${count}${span}.`; // member-words
    }
    case 'declined':
      return `The member said no on ${onDay(r.answeredAt)}. Nothing was sent.`; // member-words
    case 'expired':
      return 'This request ended without a report. You can ask again.'; // member-words
  }
}

/** "Workouts since 10 Mar 2026." - the line saying what the report covers. PURE. */
export function reportCoverLine(r: ReportRow): string {
  return `Workouts since ${formatDay(r.fromDay)}, the day they joined.`; // member-words
}

/** "Download until 13 Apr 2026." for a sent report. PURE. */
export function reportKeptLine(r: ReportRow): string | null {
  if (r.status !== 'sent' || r.expiresAt == null) return null;
  return `You can download it until ${onDay(r.expiresAt)}.`; // member-words
}

/** What the card offers: ask (none waiting) and/or download (the newest request was sent). PURE. */
export function reportButtons(rows: readonly ReportRow[]): { request: boolean; download: ReportRow | null } {
  const latest = rows[0] ?? null;
  return {
    request: !rows.some((r) => r.status === 'pending'),
    download: latest && latest.status === 'sent' ? latest : null,
  };
}

/** "workout-report-asha-verma-2026-03-14.csv". PURE. */
export function reportFileName(memberName: string, day: DateISO): string {
  const slug = memberName
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40);
  return `workout-report-${slug || 'member'}-${day}.csv`;
}

/** The server's refusals in plain words; anything else (no internet) the general line. PURE. */
export function reportErrorWords(err: unknown): string {
  const text = isObj(err) ? str(err.message) : err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  if (/\bNO_JOIN_DATE\b/.test(text)) return 'This member has no join date or plan yet. Add one first, then ask again.'; // member-words
  if (/\bNO_MEMBER\b/.test(text)) return 'This member is not on your list any more.'; // member-words
  if (/\bTOO_MANY\b/.test(text)) return 'You have asked this member many times today. Try again tomorrow.'; // member-words
  if (/\bSUSPENDED\b/.test(text)) return 'Your gym account is on hold, so you can’t ask for reports now.'; // member-words
  if (/\bEXPIRED\b/.test(text)) return 'This report is more than 30 days old and was removed. Ask again for a new one.'; // member-words
  if (/\bNOT_SENT\b/.test(text)) return 'The member has not sent the report yet.'; // member-words
  if (/\bGONE\b/.test(text)) return 'This report is no longer there.'; // member-words
  if (/\bBAD_KEY\b/.test(text)) return 'You have been signed out. Sign in again.'; // member-words
  return GYM_REPORT_DESK_WORDS.failed;
}
