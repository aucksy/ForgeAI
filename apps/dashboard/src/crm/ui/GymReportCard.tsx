/**
 * "Workout report" on a member's page (F121): "Request workout report", the request's status, and
 * "Download report" once the member's app has sent it. The report holds only workouts from the
 * member's join date at this gym on (the server fixes that date; the phone makes the file). Hidden
 * until the gym server has 0045, when signed out of the cloud, and in the demo. Rules and words:
 * logic/gymReports.ts.
 */

import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '../auth/AuthProvider';
import { guardCsv } from '../logic/csv';
import { dateISOFromEpoch, todayISO } from '../logic/dates';
import {
  GYM_REPORT_DESK_WORDS as W,
  reportButtons,
  reportCoverLine,
  reportErrorWords,
  reportFileName,
  reportKeptLine,
  reportStatusLine,
  type ReportRow,
} from '../logic/gymReports';
import { downloadReportFile, gymReportServer, listReportRequests, requestReport } from '../shop/gymReportApi';
import { downloadCsv } from './download';
import { Button, Card, ErrorBanner, Row, SectionTitle, color, font, space } from './kit';

export function GymReportCard({ memberId }: { memberId: string }) {
  const { session } = useAuth();
  const key = session?.online ? (session.ownerKey ?? null) : null;
  const [rows, setRows] = useState<ReportRow[] | null>(null);
  const [busy, setBusy] = useState<'ask' | 'download' | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!key) return;
    try {
      const r = await listReportRequests(key, memberId);
      setRows(r === 'missing' ? null : r);
    } catch (e) {
      console.warn('[ForgeErr] gym reports: reading the list', e);
    }
  }, [key, memberId]);

  useEffect(() => {
    setRows(null);
    setProblem(null);
    if (key && gymReportServer() !== 'no') void load();
  }, [key, load]);

  if (!key || !rows) return null;
  const buttons = reportButtons(rows);
  const latest = rows[0] ?? null;

  const ask = async (): Promise<void> => {
    setBusy('ask');
    setProblem(null);
    try {
      await requestReport(key, memberId);
    } catch (e) {
      console.warn('[ForgeErr] gym reports: request', e);
      setProblem(reportErrorWords(e));
    } finally {
      await load();
      setBusy(null);
    }
  };

  const download = async (r: ReportRow): Promise<void> => {
    setBusy('download');
    setProblem(null);
    try {
      const file = await downloadReportFile(key, r.id);
      if (!file) throw new Error('unreadable report');
      // The byte-order mark makes Excel read names in any language correctly.
      downloadCsv(reportFileName(file.row.memberName, file.row.sentAt != null ? dateISOFromEpoch(file.row.sentAt) : todayISO()), `﻿${guardCsv(file.csv)}`);
    } catch (e) {
      console.warn('[ForgeErr] gym reports: download', e);
      setProblem(reportErrorWords(e));
      await load();
    } finally {
      setBusy(null);
    }
  };

  const small = { fontFamily: font.body, fontSize: 13, color: color.inkSecondary } as const;
  const kept = latest ? reportKeptLine(latest) : null;

  return (
    <Card style={{ marginBottom: space.lg }}>
      <SectionTitle>{W.title}</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: space.sm }}>
        {latest ? (
          <>
            <div style={{ ...small, color: latest.status === 'sent' ? color.goodText : color.ink }}>{reportStatusLine(latest)}</div>
            <div style={small}>{reportCoverLine(latest)}</div>
            {kept ? <div style={small}>{kept}</div> : null}
          </>
        ) : (
          <div style={small}>{W.help}</div>
        )}
        <Row gap={space.sm}>
          {buttons.download ? (
            <Button disabled={busy !== null} onClick={() => buttons.download && download(buttons.download)}>
              {busy === 'download' ? W.downloading : W.download}
            </Button>
          ) : null}
          {buttons.request ? (
            <Button variant={buttons.download ? 'ghost' : undefined} disabled={busy !== null} onClick={ask}>
              {busy === 'ask' ? W.asking : W.request}
            </Button>
          ) : null}
        </Row>
        {problem ? <ErrorBanner>{problem}</ErrorBanner> : null}
      </div>
    </Card>
  );
}
