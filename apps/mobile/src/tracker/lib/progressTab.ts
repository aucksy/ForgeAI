/**
 * The Progress tab's Reports block (Release A, A5): the reports a member can open now, as rows. The
 * same choice as Charts' Reports card (`reportIndex`): the latest finished month (or this month so
 * far for a new member), this year so far or last year's review, and in January last year's review
 * beside this year. PURE.
 */
import { monthTitle } from '@/lib/date';
import { reportIndex } from '@/tracker/services/reportsService';

import { monthOf } from './months';

export interface ReportRow {
  /** The report page's period: 'YYYY-MM' or 'YYYY'. */
  period: string;
  title: string;
  sub: string;
}

export function reportRows(months: readonly string[], today: string): ReportRow[] {
  const idx = reportIndex(months, today);
  const thisYear = Number(today.slice(0, 4));
  const rows: ReportRow[] = [];
  if (idx.month) {
    rows.push({ period: idx.month, title: idx.month === monthOf(today) ? `${monthTitle(idx.month)} so far` : monthTitle(idx.month), sub: 'Monthly report' });
  }
  if (idx.year != null) rows.push({ period: String(idx.year), title: idx.year === thisYear ? `${idx.year} so far` : `${idx.year} in review`, sub: 'Year in review' });
  if (idx.lastYear != null) rows.push({ period: String(idx.lastYear), title: `${idx.lastYear} in review`, sub: 'Year in review' });
  return rows;
}