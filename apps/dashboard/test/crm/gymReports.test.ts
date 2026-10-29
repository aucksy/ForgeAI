/**
 * F121: the workout report the desk asks for, on the admin panel. Reading the server, the status
 * lines and buttons, the file name, the error words, and the card staying hidden until the server
 * has 0045.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const callMock = vi.fn();
vi.mock('../../src/crm/shop/api', () => ({ call: (...a: unknown[]) => callMock(...a) }));
vi.mock('../../src/lib/demoLock', () => ({ isDemoLocked: () => false }));

import {
  GYM_REPORT_DESK_WORDS,
  reportButtons,
  reportCoverLine,
  reportErrorWords,
  reportFileFrom,
  reportFileName,
  reportKeptLine,
  reportRowFrom,
  reportRowsFrom,
  reportStatusLine,
  type ReportRow,
} from '../../src/crm/logic/gymReports';
import { downloadReportFile, gymReportServer, listReportRequests, requestReport, resetGymReportsForTest } from '../../src/crm/shop/gymReportApi';

/** 14 Mar 2026, 12:00 India time. */
const MAR14 = Date.UTC(2026, 2, 14, 6, 30);
const DAY = 86_400_000;

const row = (over: Partial<ReportRow> = {}): ReportRow => ({
  id: 'r1', status: 'pending', fromDay: '2026-03-10', agreed: false, createdAt: MAR14, answeredAt: null, sentAt: null,
  expiresAt: MAR14 + 30 * DAY, rosterId: 'mem_1', memberName: 'Asha Verma', requestedBy: 'Owner', workouts: null, sets: null,
  firstDay: null, lastDay: null, ...over,
});

describe('reading the server (0045)', () => {
  it('a full row, junk left out, newest first', () => {
    const raw = [
      { id: 'old', status: 'declined', fromDay: '2026-03-10', createdAt: 1, answeredAt: 2, rosterId: 'mem_1', memberName: 'Asha' },
      { id: 'new', status: 'sent', fromDay: '2026-03-10', agreed: true, createdAt: 5, sentAt: 6, expiresAt: 7, rosterId: 'mem_1', memberName: ' ', workouts: 3, sets: 20, firstDay: '2026-03-10', lastDay: '2026-03-13' },
      { id: '', status: 'sent', fromDay: '2026-03-10' },
      { id: 'x', status: 'odd', fromDay: '2026-03-10' },
      { id: 'y', status: 'sent', fromDay: '10 Mar' },
      null,
    ];
    const rows = reportRowsFrom(raw);
    expect(rows.map((r) => r.id)).toEqual(['new', 'old']);
    expect(rows[0]).toMatchObject({ memberName: 'A member', workouts: 3, sets: 20, firstDay: '2026-03-10', lastDay: '2026-03-13', agreed: true });
    expect(reportRowsFrom('nope')).toEqual([]);
    expect(reportRowFrom(null)).toBeNull();
  });

  it('a file: the row and its text; no text, no file', () => {
    expect(reportFileFrom({ id: 'r1', status: 'sent', fromDay: '2026-03-10', csv: '"title","start_time"\n' })?.csv).toBe('"title","start_time"\n');
    expect(reportFileFrom({ id: 'r1', status: 'sent', fromDay: '2026-03-10' })).toBeNull();
  });
});

describe('what the card says and offers', () => {
  it('status lines', () => {
    expect(reportStatusLine(row())).toBe('Asked on 14 Mar 2026. Waiting for the member to say yes in the app.');
    expect(reportStatusLine(row({ agreed: true }))).toBe('The member said yes. The report is on its way.');
    expect(reportStatusLine(row({ status: 'sent', sentAt: MAR14, workouts: 12, firstDay: '2026-03-10', lastDay: '2026-03-13' })))
      .toBe('Sent on 14 Mar 2026: 12 workouts, from 10 Mar 2026 to 13 Mar 2026.');
    expect(reportStatusLine(row({ status: 'sent', sentAt: MAR14, workouts: 1, firstDay: '2026-03-12', lastDay: '2026-03-12' }))).toContain(': 1 workout,');
    expect(reportStatusLine(row({ status: 'sent', sentAt: MAR14, workouts: 0 }))).toBe('Sent on 14 Mar 2026: 0 workouts (nothing logged since joining).');
    expect(reportStatusLine(row({ status: 'declined', answeredAt: MAR14 }))).toBe('The member said no on 14 Mar 2026. Nothing was sent.');
    expect(reportStatusLine(row({ status: 'expired' }))).toBe('This request ended without a report. You can ask again.');
    expect(reportCoverLine(row())).toBe('Workouts since 10 Mar 2026, the day they joined.');
    expect(reportKeptLine(row({ status: 'sent', expiresAt: MAR14 + 30 * DAY }))).toBe('You can download it until 13 Apr 2026.');
    expect(reportKeptLine(row())).toBeNull();
  });

  it('buttons: ask when nothing waits; download only the newest sent report', () => {
    expect(reportButtons([])).toEqual({ request: true, download: null });
    expect(reportButtons([row()])).toEqual({ request: false, download: null });
    const sent = row({ status: 'sent' });
    expect(reportButtons([sent])).toEqual({ request: true, download: sent });
    expect(reportButtons([row({ id: 'r2', status: 'declined' }), sent])).toEqual({ request: true, download: null });
    expect(reportButtons([row({ status: 'expired' })]).request).toBe(true);
  });

  it('file name', () => {
    expect(reportFileName('Asha Verma', '2026-03-14')).toBe('workout-report-asha-verma-2026-03-14.csv');
    expect(reportFileName('  ', '2026-03-14')).toBe('workout-report-member-2026-03-14.csv');
    expect(reportFileName('José / O\'Neil', '2026-03-14')).toBe('workout-report-jose-oneil-2026-03-14.csv');
  });

  it('error words; never "volume", "PR" or "session"', () => {
    const codes = ['NO_JOIN_DATE', 'NO_MEMBER', 'TOO_MANY', 'SUSPENDED', 'EXPIRED', 'NOT_SENT', 'GONE', 'BAD_KEY'];
    const words = codes.map((c) => reportErrorWords(new Error(c)));
    expect(new Set(words).size).toBe(codes.length);
    for (const w of words) expect(w).not.toBe(GYM_REPORT_DESK_WORDS.failed);
    expect(reportErrorWords({ message: 'TOO_MANY' })).toMatch(/many times today/);
    expect(reportErrorWords(new Error('Failed to fetch'))).toBe(GYM_REPORT_DESK_WORDS.failed);
    const all = [...Object.values(GYM_REPORT_DESK_WORDS), ...words, reportStatusLine(row()), reportCoverLine(row())];
    for (const w of all) expect(w).not.toMatch(/volume|\bPRs?\b|session/i);
  });
});

describe('the server calls', () => {
  beforeEach(() => {
    callMock.mockReset();
    resetGymReportsForTest();
  });
  afterEach(() => vi.restoreAllMocks());

  it('PGRST202: "missing", remembered, one quiet note, no second call', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    callMock.mockRejectedValue({ code: 'PGRST202', message: 'Could not find the function public.owner_report_requests' });
    expect(await listReportRequests('k', 'mem_1')).toBe('missing');
    expect(await listReportRequests('k', 'mem_1')).toBe('missing');
    expect(callMock).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledTimes(1);
    expect(gymReportServer()).toBe('no');
  });

  it('a list: "yes"; no internet: thrown and not remembered', async () => {
    callMock.mockRejectedValueOnce(new Error('timed out'));
    await expect(listReportRequests('k', 'mem_1')).rejects.toThrow('timed out');
    expect(gymReportServer()).toBe('unknown');
    callMock.mockResolvedValueOnce([]);
    expect(await listReportRequests('k', 'mem_1')).toEqual([]);
    expect(gymReportServer()).toBe('yes');
    expect(callMock).toHaveBeenLastCalledWith('owner_report_requests', { p_key: 'k', p_member: 'mem_1' });
  });

  it('ask and download carry the key and only this member or request', async () => {
    callMock.mockResolvedValueOnce({ id: 'r1', status: 'pending', fromDay: '2026-03-10', rosterId: 'mem_1' });
    expect((await requestReport('k', 'mem_1'))?.id).toBe('r1');
    expect(callMock).toHaveBeenLastCalledWith('owner_request_report', { p_key: 'k', p_member: 'mem_1' });
    callMock.mockResolvedValueOnce({ id: 'r1', status: 'sent', fromDay: '2026-03-10', csv: 'x' });
    expect((await downloadReportFile('k', 'r1'))?.csv).toBe('x');
    expect(callMock).toHaveBeenLastCalledWith('owner_report_file', { p_key: 'k', p_request: 'r1' });
    callMock.mockRejectedValueOnce(new Error('NO_JOIN_DATE'));
    await expect(requestReport('k', 'mem_2')).rejects.toThrow('NO_JOIN_DATE');
  });
});
