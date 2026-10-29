/**
 * "Your growth" (owner, 30 Oct 2026): is the gym growing since it started on MettleUp? The page
 * (`/growth`) and its one-page printable report (`/growth/print`). OWNER ONLY (permissions.ts
 * canOpen: money totals). All the maths is in logic/businessGrowth.ts (pure, tested); this file only
 * draws it, in the look of the "Your numbers" section on Today (OwnerNumbers.tsx).
 */

import { useEffect, useMemo, useState, type CSSProperties } from 'react';

import type { GymBrand } from '@forgeai/theme';

import {
  GROWTH_CSV_HEADERS,
  GROWTH_METRICS,
  RENEW_GRACE_DAYS,
  changeWords,
  formatMetric,
  growthCsvRows,
  growthReport,
  metricHint,
  metricLabel,
  shownValue,
  monthLabel,
  monthLong,
  monthShort,
  notYetWords,
  sideNames,
  summaryLead,
  summaryLines,
  type GrowthMetric,
  type GrowthReport,
  type MetricCompare,
  type MonthRow,
} from '../logic/businessGrowth';
import { csvDocument, csvFilename } from '../logic/csv';
import { formatDay } from '../logic/dates';
import { formatINRShort } from '../logic/money';
import * as api from '../shop/api';
import { useShop } from '../shop/ShopProvider';
import { useCrm } from '../store';
import { downloadCsv } from './download';
import { Button, Card, Grid, PageHeader, ScrollX, SectionTitle, Toast, color, font, radius, space, useIsCompact } from './kit';
import { navigate } from './router';

/** The address of the import screen (Excel file or a photo of the register). */
const IMPORT_PATH = '/members/import';

function useReport(): GrowthReport {
  const { snapshot, today } = useCrm();
  return useMemo(() => growthReport(snapshot, today), [snapshot, today]);
}

function useDownload(report: GrowthReport): { download: () => void; toast: { id: number; text: string } | null } {
  const { snapshot, today } = useCrm();
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(t);
  }, [toast]);
  const download = () => {
    downloadCsv(csvFilename([snapshot.gym.name, 'growth', today]), csvDocument([...GROWTH_CSV_HEADERS], growthCsvRows(report)));
    setToast({ id: Date.now(), text: report.rows.length === 1 ? 'Downloaded 1 month.' : `Downloaded ${report.rows.length} months.` });
  };
  return { download, toast };
}

// ---------------------------------------------------------------- the page

export function GrowthScreen() {
  const { today } = useCrm();
  const compact = useIsCompact();
  const report = useReport();
  const { download, toast } = useDownload(report);
  const names = sideNames(report.mode);
  const lines = summaryLines(report);
  const needsHistory = report.beforeMonthsOnRecord < 2;

  return (
    <>
      <PageHeader
        title="Your growth"
        subtitle="Is your gym growing? Month by month, before and since MettleUp."
        actions={
          <>
            <Button variant="ghost" onClick={() => navigate('/growth/print')}>
              Share this report
            </Button>
            <Button variant="ghost" onClick={download}>
              Download Excel file
            </Button>
          </>
        }
      />

      <section aria-label="Summary" style={summaryBox}>
        <p style={{ margin: 0, fontFamily: font.display, fontSize: 17, fontWeight: 700, color: color.ink, textWrap: 'pretty' }}>{summaryLead(report)}</p>
        {lines.length > 0 ? (
          <ul style={{ margin: `${space.md}px 0 0`, paddingLeft: 20, display: 'grid', gap: 6, fontFamily: font.body, fontSize: 15, color: color.ink }}>
            {lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        ) : (
          <p style={{ margin: `${space.sm}px 0 0`, fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>{notYetWords(report, today)}</p>
        )}
        <p style={noteText}>
          Started on MettleUp: {formatDay(report.start)}. These numbers show what changed since you started, not why. Other things also change your numbers, like the season or prices.
        </p>
      </section>

      {needsHistory && (
        <Card style={{ marginTop: space.lg }}>
          <SectionTitle>To compare with before MettleUp, add your old records</SectionTitle>
          <p style={{ margin: `0 0 ${space.md}px`, fontFamily: font.body, fontSize: 14, color: color.inkSecondary, textWrap: 'pretty' }}>
            {report.mode === 'firstLatest'
              ? 'Until then, this page compares your first months on MettleUp with your latest months. '
              : ''}
            Add your old member list and fee records from an Excel file or a photo of your register, and this page shows how the gym did before you started.
          </p>
          <Button onClick={() => navigate(IMPORT_PATH)}>Add old records</Button>
        </Card>
      )}

      <div style={{ height: space.lg }} />
      {/* One month on record draws six empty charts: the charts wait for a second month. */}
      {report.chartRows.length >= 2 ? (
        <Grid min={compact ? 260 : 320}>
          {GROWTH_METRICS.map((m) => (
            <MetricCard key={m} metric={m} report={report} names={names} />
          ))}
        </Grid>
      ) : (
        <p style={{ margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>The charts start once your gym has two months on record. This month so far is below.</p>
      )}

      <Card style={{ marginTop: space.lg }}>
        <SectionTitle
          action={
            <Button variant="ghost" onClick={download}>
              Download Excel file
            </Button>
          }
        >
          Month by month
        </SectionTitle>
        <MonthTable rows={report.chartRows} />
      </Card>

      <Card style={{ marginTop: space.lg }}>
        <SectionTitle>How these numbers are counted</SectionTitle>
        <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 6, fontFamily: font.body, fontSize: 13, color: color.inkSecondary }}>
          {GROWTH_METRICS.map((m) => (
            <li key={m}>
              <strong style={{ color: color.ink }}>{metricLabel(m)}:</strong> {metricHint(m)}
            </li>
          ))}
          <li>
            <strong style={{ color: color.ink }}>{names.before} and {names.after}:</strong>{' '}
            {report.mode === 'firstLatest'
              ? 'your first finished months on MettleUp, against your latest finished months.'
              : 'the monthly average of up to 6 months before you started, against the finished months since. The month you started in is left out of both.'}
          </li>
          <li>Old records count only if you added them. If some are missing, the months before MettleUp look smaller than they really were.</li>
          <li>Renewals take {RENEW_GRACE_DAYS} days to become final, so the latest months are left out of the renewal and members lost averages.</li>
        </ul>
      </Card>

      {toast && <Toast key={toast.id} message={toast.text} />}
    </>
  );
}

const summaryBox: CSSProperties = {
  background: color.accentSoft,
  border: `1px solid ${color.border}`,
  borderRadius: radius.lg,
  padding: space.xl,
  minWidth: 0,
};

const noteText: CSSProperties = { margin: `${space.md}px 0 0`, fontFamily: font.body, fontSize: 12, color: color.inkSecondary, textWrap: 'pretty' };

// ---------------------------------------------------------------- one number

function MetricCard({ metric, report, names }: { metric: GrowthMetric; report: GrowthReport; names: { before: string; after: string } }) {
  const c = report.compare[metric];
  const latest = report.chartRows[report.chartRows.length - 1];
  const latestValue = latest ? shownValue(latest, metric) : null;
  return (
    <Card pad={space.lg}>
      <h2 style={{ margin: 0, fontFamily: font.display, fontSize: 16, fontWeight: 600, color: color.ink }}>{metricLabel(metric)}</h2>
      <p style={{ margin: '4px 0 0', fontFamily: font.body, fontSize: 12, color: color.inkMuted, textWrap: 'pretty' }}>{metricHint(metric)}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: space.lg, marginTop: space.md }}>
        <Side label={names.before} value={formatMetric(metric, c.before)} months={c.beforeMonths} quiet />
        <Side label={names.after} value={formatMetric(metric, c.after)} months={c.afterMonths} />
        <ChangeChip c={c} />
      </div>
      <div style={{ marginTop: space.lg }}>
        <MonthBars rows={report.chartRows} metric={metric} startMonth={report.startMonth} />
      </div>
      {latest && !latest.complete && (
        <p style={{ margin: `${space.sm}px 0 0`, fontFamily: font.body, fontSize: 12, color: color.inkMuted }}>
          {latestValue === null && (metric === 'renewal' || metric === 'lost')
            ? `${monthLabel(latest.month)}: final ${RENEW_GRACE_DAYS} days after the month ends`
            : `${monthLabel(latest.month)} so far: ${formatMetric(metric, latestValue)}`}
        </p>
      )}
    </Card>
  );
}

function Side({ label, value, months, quiet = false }: { label: string; value: string; months: number; quiet?: boolean }) {
  return (
    <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
      <span style={{ fontFamily: font.body, fontSize: 11, color: color.inkMuted, textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</span>
      <span style={{ fontFamily: font.mono, fontSize: quiet ? 18 : 24, fontWeight: 700, color: quiet ? color.inkSecondary : color.ink, lineHeight: 1.15 }}>{value}</span>
      <span style={{ fontFamily: font.body, fontSize: 11, color: color.inkMuted }}>{months === 0 ? 'not enough months yet' : months === 1 ? 'from 1 month' : `average of ${months} months`}</span>
    </div>
  );
}

function ChangeChip({ c }: { c: MetricCompare }) {
  const words = changeWords(c);
  if (words === null || c.after === null || c.before === null) return null;
  const up = c.after > c.before;
  const tone = c.better === true ? color.goodText : c.better === false ? color.criticalText : color.inkSecondary;
  const arrow = c.change === 0 ? '' : up ? '▲ ' : '▼ ';
  const said = c.change === 0 ? 'No change' : `${up ? 'Up' : 'Down'} ${words}${c.better === true ? ', better' : c.better === false ? ', worse' : ''}`;
  return (
    <span
      aria-label={said}
      style={{
        marginLeft: 'auto',
        alignSelf: 'center',
        padding: '4px 10px',
        borderRadius: radius.pill,
        border: `1px solid ${tone}`,
        color: tone,
        fontFamily: font.body,
        fontSize: 13,
        fontWeight: 700,
        whiteSpace: 'nowrap',
      }}
    >
      {arrow}
      {words}
    </span>
  );
}

// ---------------------------------------------------------------- the chart

/**
 * One bar a month. Months before MettleUp are grey, months since are the gym's orange, the month it
 * started in is half way, and this month (not finished) is pale. A dashed line marks the start.
 */
export function MonthBars({ rows, metric, startMonth, height = 96, print = false }: { rows: readonly MonthRow[]; metric: GrowthMetric; startMonth: string; height?: number; print?: boolean }) {
  const values = rows.map((r) => shownValue(r, metric));
  const max = metric === 'renewal' ? 1 : Math.max(0, ...values.map((v) => v ?? 0));
  const ink = print ? PAPER.inkSoft : color.inkMuted;
  const startShown = rows.some((r) => r.month === startMonth);
  const label = `${metricLabel(metric)} by month: ${rows.map((r, i) => `${monthLabel(r.month)} ${formatMetric(metric, values[i])}`).join(', ')}.`;
  return (
    <div role="img" aria-label={label} style={{ display: 'grid', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height, position: 'relative' }}>
        {rows.map((r, i) => {
          const v = values[i];
          const isStart = r.month === startMonth;
          const fill = barColor(r, print);
          return (
            <div key={r.month} title={`${monthLabel(r.month)}: ${formatMetric(metric, v)}`} style={{ flex: '1 1 0', minWidth: 0, height: '100%', position: 'relative', display: 'flex', alignItems: 'flex-end' }}>
              {isStart && (
                <div
                  aria-hidden
                  style={{ position: 'absolute', left: -2, top: 0, bottom: 0, borderLeft: `2px dashed ${print ? PAPER.ink : color.inkSecondary}` }}
                />
              )}
              <div
                style={{
                  width: '100%',
                  height: v === null || max === 0 ? 2 : Math.max(2, (v / max) * (height - 14)),
                  borderRadius: 2,
                  background: v === null ? 'transparent' : fill,
                  borderBottom: v === null ? `2px dotted ${ink}` : undefined,
                  opacity: r.complete ? 1 : 0.5,
                }}
              />
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 3 }}>
        {rows.map((r, i) => (
          <div key={r.month} style={{ flex: '1 1 0', minWidth: 0, textAlign: 'center', fontFamily: print ? PAPER_FONT : font.body, fontSize: print ? 8 : 10, color: ink, overflow: 'hidden', whiteSpace: 'nowrap' }}>
            {rows.length > 8 && !print && i % 2 === 1 && i !== rows.length - 1 ? '' : monthShort(r.month)}
          </div>
        ))}
      </div>
      {startShown && (
        <div style={{ fontFamily: print ? PAPER_FONT : font.body, fontSize: print ? 8 : 11, color: ink, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <span>
            <span aria-hidden style={{ display: 'inline-block', width: 10, height: 8, background: barColor({ phase: 'before' } as MonthRow, print), marginRight: 4, borderRadius: 2 }} />
            Before
          </span>
          <span>
            <span aria-hidden style={{ display: 'inline-block', width: 10, height: 8, background: barColor({ phase: 'since' } as MonthRow, print), marginRight: 4, borderRadius: 2 }} />
            Since MettleUp ({monthShort(startMonth)}, dashed line)
          </span>
        </div>
      )}
    </div>
  );
}

function barColor(r: Pick<MonthRow, 'phase'>, print: boolean): string {
  if (print) return r.phase === 'before' ? '#B9BDC6' : r.phase === 'start' ? '#E9A47E' : '#D9571A';
  return r.phase === 'before' ? color.inkFaint : r.phase === 'start' ? color.accentDeep : color.accent;
}

// ---------------------------------------------------------------- the table

/** A month's figure as the table cell says it. */
function cellWords(r: MonthRow, m: GrowthMetric): string {
  return m === 'money' ? (r.moneyP === 0 ? '₹0' : formatINRShort(r.moneyP)) : formatMetric(m, shownValue(r, m));
}

function monthNote(r: MonthRow): string {
  return r.phase === 'before' ? 'Before MettleUp' : r.phase === 'start' ? 'Started MettleUp' : r.complete ? '' : 'So far';
}

function MonthTable({ rows }: { rows: readonly MonthRow[] }) {
  const compact = useIsCompact();
  // A phone gets one block a month (like Money's receipts): a 7-column table does not fit 390px.
  if (compact) {
    return (
      <div style={{ display: 'grid' }}>
        {[...rows].reverse().map((r, i) => (
          <div key={r.month} style={{ padding: `${space.md}px 0`, borderTop: i === 0 ? 'none' : `1px solid ${color.border}` }}>
            <div style={{ fontFamily: font.body, fontSize: 14, fontWeight: 700, color: color.ink }}>
              {monthLabel(r.month)}
              {monthNote(r) && <span style={{ fontWeight: 400, fontSize: 12, color: color.inkMuted }}> · {monthNote(r)}</span>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '2px 12px', marginTop: 4 }}>
              {GROWTH_METRICS.map((m) => (
                <div key={m} style={{ display: 'flex', justifyContent: 'space-between', gap: 6, fontFamily: font.body, fontSize: 12, color: color.inkSecondary, minWidth: 0 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{metricLabel(m)}</span>
                  <span style={{ fontFamily: font.mono, color: color.ink, whiteSpace: 'nowrap' }}>{cellWords(r, m)}</span>
                </div>
              ))}
            </div>
            {r.waiting > 0 && (
              <div style={{ fontFamily: font.body, fontSize: 11, color: color.inkMuted, marginTop: 2 }}>
                {r.waiting} {r.waiting === 1 ? 'member still has' : 'members still have'} time to renew
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }
  const th: CSSProperties = { textAlign: 'right', padding: '6px 8px', fontFamily: font.body, fontSize: 11, fontWeight: 600, color: color.inkMuted, whiteSpace: 'nowrap', borderBottom: `1px solid ${color.border}` };
  const td: CSSProperties = { textAlign: 'right', padding: '8px', fontFamily: font.mono, fontSize: 13, color: color.ink, whiteSpace: 'nowrap', borderBottom: `1px solid ${color.border}` };
  return (
    <ScrollX>
      <table style={{ borderCollapse: 'collapse', minWidth: 560, width: '100%' }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left' }}>Month</th>
            {GROWTH_METRICS.map((m) => (
              <th key={m} style={th}>
                {metricLabel(m)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...rows].reverse().map((r) => (
            <tr key={r.month} style={{ background: r.phase === 'before' ? color.surfaceSunken : undefined }}>
              <td style={{ ...td, textAlign: 'left', fontFamily: font.body }}>
                {monthLabel(r.month)}
                <span style={{ display: 'block', fontSize: 11, color: color.inkMuted }}>{monthNote(r)}</span>
              </td>
              {GROWTH_METRICS.map((m) => (
                <td key={m} style={td}>
                  {cellWords(r, m)}
                  {(m === 'renewal' || m === 'lost') && r.waiting > 0 && <span style={{ display: 'block', fontFamily: font.body, fontSize: 11, color: color.inkMuted }}>{r.waiting} still have time to renew</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollX>
  );
}

// ---------------------------------------------------------------- the printable report

const PAPER = { ink: '#101014', inkSoft: '#5E6574', line: '#D7DAE0', shade: '#F1F2F5' };
const PAPER_FONT = "'Manrope', system-ui, sans-serif";

/**
 * "Share this report": one A4 page on white paper (on screen too, like a receipt), with the gym's
 * name and logo, the summary, the before/since table and the months. The browser's Print saves it as
 * a PDF to send to a partner.
 */
export function GrowthPrintScreen() {
  const { snapshot, today } = useCrm();
  const { cloud } = useShop();
  const report = useReport();
  const [brand, setBrand] = useState<GymBrand | null>(null);
  useEffect(() => {
    if (!cloud) return;
    let live = true;
    api
      .ownerGym(cloud.ownerKey)
      .then((g) => live && setBrand(g.brand ?? null))
      .catch((e: unknown) => console.warn('growth report: the gym logo did not load, showing the name only', e));
    return () => {
      live = false;
    };
  }, [cloud]);

  const names = sideNames(report.mode);
  const lines = summaryLines(report);
  const first = report.chartRows[0];
  const cell: CSSProperties = { padding: '3px 6px', borderBottom: `1px solid ${PAPER.line}`, textAlign: 'right', whiteSpace: 'nowrap' };

  return (
    <>
      <div className="no-print">
        <PageHeader
          title="Share this report"
          subtitle="One page to print, or to save as a PDF and send."
          actions={
            <>
              <Button variant="ghost" onClick={() => navigate('/growth')}>
                Back
              </Button>
              <Button onClick={() => window.print()}>Print or save as PDF</Button>
            </>
          }
        />
      </div>
      <style>{'@media print { @page { size: A4 portrait; margin: 12mm; } }'}</style>
      {/* On a phone the A4 page scrolls sideways inside this box; printing lays it out on the paper. */}
      <div tabIndex={0} role="region" aria-label="The report" style={{ overflowX: 'auto', maxWidth: '100%' }}>
      <div className="print-sheet print-exact" style={{ maxWidth: 760, minWidth: 640, padding: 28, fontFamily: PAPER_FONT, color: PAPER.ink, fontSize: 12, lineHeight: 1.45 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, borderBottom: `2px solid ${PAPER.ink}`, paddingBottom: 10 }}>
          {brand?.logoUrl && <img src={brand.logoUrl} alt="" style={{ height: 44, maxWidth: 140, objectFit: 'contain' }} />}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{snapshot.gym.name}</div>
            <div style={{ color: PAPER.inkSoft }}>
              How the gym has grown{first ? `, ${monthLabel(first.month)} to ${monthLabel(report.chartRows[report.chartRows.length - 1].month)}` : ''} · made {formatDay(today)}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 12, fontWeight: 700, fontSize: 14 }}>{summaryLead(report)}</div>
        {lines.length > 0 ? (
          <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13 }}>
            {lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        ) : (
          <div style={{ marginTop: 4, color: PAPER.inkSoft }}>{notYetWords(report, today)}</div>
        )}

        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
          <thead>
            <tr style={{ background: PAPER.shade }}>
              <th style={{ ...cell, textAlign: 'left' }}>Average a month</th>
              <th style={cell}>{names.before}</th>
              <th style={cell}>{names.after}</th>
              <th style={cell}>Change</th>
            </tr>
          </thead>
          <tbody>
            {GROWTH_METRICS.map((m) => {
              const c = report.compare[m];
              const w = changeWords(c);
              const up = c.after !== null && c.before !== null && c.after > c.before;
              return (
                <tr key={m}>
                  <td style={{ ...cell, textAlign: 'left' }}>{metricLabel(m)}</td>
                  <td style={cell}>{formatMetric(m, c.before)}</td>
                  <td style={cell}>{formatMetric(m, c.after)}</td>
                  <td style={{ ...cell, fontWeight: 700, color: c.better === true ? '#137333' : c.better === false ? '#B42318' : PAPER.inkSoft }}>
                    {w === null ? '–' : c.change === 0 ? w : `${up ? '▲' : '▼'} ${w}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
          {(['money', 'active'] as const).map((m) => (
            <div key={m}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>{metricLabel(m)}</div>
              <MonthBars rows={report.chartRows} metric={m} startMonth={report.startMonth} height={64} print />
            </div>
          ))}
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 14, fontSize: 11 }}>
          <thead>
            <tr style={{ background: PAPER.shade }}>
              <th style={{ ...cell, textAlign: 'left' }}>Month</th>
              {GROWTH_METRICS.map((m) => (
                <th key={m} style={cell}>
                  {metricLabel(m)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.chartRows.map((r) => (
              <tr key={r.month} style={{ color: r.phase === 'before' ? PAPER.inkSoft : PAPER.ink }}>
                <td style={{ ...cell, textAlign: 'left' }}>
                  {monthLabel(r.month)}
                  {r.phase === 'start' ? ' · started' : r.complete ? '' : ' · so far'}
                </td>
                {GROWTH_METRICS.map((m) => (
                  <td key={m} style={cell}>
                    {m === 'money' ? formatINRShort(r.moneyP) : formatMetric(m, shownValue(r, m))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: 10, color: PAPER.inkSoft, fontSize: 10 }}>
          Started on MettleUp: {monthLong(report.startMonth)}. Grey months are before MettleUp. Renewal: a new plan within {RENEW_GRACE_DAYS} days of the old one ending.
          These numbers show what changed since the gym started, not why: other things also change them, like the season or prices. Made with MettleUp.
        </div>
      </div>
      </div>
    </>
  );
}
