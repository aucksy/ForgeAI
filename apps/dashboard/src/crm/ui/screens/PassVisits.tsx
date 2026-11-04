/**
 * F123 (4 Nov 2026): Visits -> Pass visits. How many visits each pass company (FITPASS, cultpass...)
 * owes the gym for, month by month, so the owner can match the company's payment. One visit per
 * person per day, the same rule as the register. "Download Excel file" gives the month's visits one
 * line each, to tick off against the company's statement. The counting is logic/passMembers.ts.
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import { useCrm } from '../../store';
import { csvDocument, csvFilename } from '../../logic/csv';
import { formatDay } from '../../logic/dates';
import { phoneForExport } from '../../logic/members';
import {
  PASS_EXPORT_HEADERS,
  monthOfDay,
  passExportRows,
  passMonthLabel,
  passMonthRows,
  passMonths,
  passPeopleInMonth,
  passVisitLines,
} from '../../logic/passMembers';
import { t } from '../../lang/lang';
import { downloadCsv } from '../download';
import { Button, Card, ChipToggle, EmptyState, Grid, PageHeader, Row, SectionTitle, StatTile, Toast, color, font, space } from '../kit';
import { Link, navigate } from '../router';

const cell = { padding: `${space.sm}px ${space.xs}px`, fontFamily: font.body, fontSize: 14, color: color.ink } as const;
const num = { ...cell, textAlign: 'right' as const, fontFamily: font.mono, fontWeight: 700 };
const head = { ...cell, fontSize: 12, color: color.inkMuted, fontWeight: 600 } as const;

/** `/attendance/pass`, opened by "Pass visits" at the top of Visits. */
export function PassVisitsScreen() {
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const seq = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const flash = (text: string) => {
    seq.current += 1;
    setToast({ id: seq.current, text });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 2600);
  };
  return (
    <>
      <PageHeader
        title={t('Pass visits')}
        subtitle={t('Visits by FITPASS, cultpass and other pass members')}
        actions={
          <Button variant="ghost" onClick={() => navigate('/attendance')}>
            {t('Back to visits')}
          </Button>
        }
      />
      <PassVisits onToast={flash} />
      {toast && <Toast key={toast.id} message={toast.text} />}
    </>
  );
}

function PassVisits({ onToast }: { onToast: (msg: string) => void }) {
  const { snapshot, today } = useCrm();
  const lines = useMemo(() => passVisitLines(snapshot.members, snapshot.visits), [snapshot.members, snapshot.visits]);
  const rows = useMemo(() => passMonthRows(lines), [lines]);
  const months = useMemo(() => passMonths(rows, today), [rows, today]);
  const [month, setMonth] = useState(() => monthOfDay(today));
  const shown = rows.filter((r) => r.month === month);
  const people = useMemo(() => passPeopleInMonth(lines, month), [lines, month]);
  const total = shown.reduce((n, r) => n + r.visits, 0);

  const exportCsv = () => {
    const contents = csvDocument([...PASS_EXPORT_HEADERS], passExportRows(lines, month, phoneForExport));
    downloadCsv(csvFilename([snapshot.gym.name, 'pass-visits', month]), contents);
    onToast(total === 1 ? t('Exported 1 pass visit.') : t('Exported {n} pass visits.', { n: total }));
  };

  return (
    <>
      <p style={{ margin: `0 0 ${space.md}px`, fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>
        {t('Pass members pay a pass company like FITPASS or cultpass, and the company pays your gym for each visit. Match these counts with the company’s monthly payment.')}
      </p>

      {months.length > 1 && (
        <div style={{ marginBottom: space.lg }}>
          <ChipToggle
            label={t('Month')}
            value={month}
            onChange={setMonth}
            options={months.map((m) => ({ value: m, label: passMonthLabel(m) }))}
          />
        </div>
      )}

      <Grid min={150}>
        <StatTile label={t('Pass visits')} value={total} sub={passMonthLabel(month)} tone={total > 0 ? 'accent' : undefined} />
        <StatTile label={t('Pass members who came')} value={people.length} sub={passMonthLabel(month)} />
      </Grid>

      <div style={{ height: space.lg }} />

      <Card style={{ marginBottom: space.lg }}>
        <SectionTitle
          action={
            <Button variant="ghost" onClick={exportCsv} disabled={total === 0}>
              {t('Download Excel file')}
            </Button>
          }
        >
          {t('Visits by pass company')}
        </SectionTitle>
        {shown.length === 0 ? (
          <EmptyState
            title={t('No pass visits in {month}', { month: passMonthLabel(month) })}
            body={t('Add a pass member from Members, then check them in at the desk or let them scan your check-in QR. Each visit counts here.')}
            action={<Button onClick={() => navigate('/members/new')}>{t('Add member')}</Button>}
          />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }} aria-label={t('Visits by pass company')}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${color.border}` }}>
                <th style={{ ...head, textAlign: 'left' }}>{t('Pass company')}</th>
                <th style={{ ...head, textAlign: 'left' }}>{t('Month')}</th>
                <th style={{ ...head, textAlign: 'right' }}>{t('Visits')}</th>
                <th style={{ ...head, textAlign: 'right' }}>{t('People')}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.company} style={{ borderBottom: `1px solid ${color.border}` }}>
                  <td style={{ ...cell, fontWeight: 600 }}>{r.company}</td>
                  <td style={{ ...cell, color: color.inkSecondary }}>{passMonthLabel(r.month)}</td>
                  <td style={num}>{r.visits}</td>
                  <td style={num}>{r.people}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {people.length > 0 && (
        <Card>
          <SectionTitle>{t('Who came on a pass')}</SectionTitle>
          <div style={{ display: 'grid', gap: space.sm }}>
            {people.map((p) => (
              <Row key={`${p.memberId}|${p.company}`} gap={space.md} wrap={false}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <Link to={`/members/${p.memberId}`}>
                    <span style={{ fontFamily: font.body, fontSize: 14, color: color.ink, fontWeight: 600 }}>{p.name}</span>
                  </Link>
                  <div style={{ fontFamily: font.body, fontSize: 12, color: color.inkMuted }}>
                    {t('{company} · last came {date}', { company: p.company, date: formatDay(p.lastOn) })}
                  </div>
                </span>
                <span style={{ fontFamily: font.mono, fontSize: 14, fontWeight: 700, color: color.ink }}>
                  {p.visits === 1 ? t('1 visit') : t('{n} visits', { n: p.visits })}
                </span>
              </Row>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
