/**
 * Numbers for the gym owner (R-150 / R-168): the "Your numbers" section on Today and the page each
 * tile opens (`/numbers/<tile>/<range>`). All the maths is in logic/ownerNumbers.ts (pure, tested);
 * this file only draws it.
 *
 * Five tiles, each a figure, a short line of words and a small trend line; a tap opens the list
 * behind the figure, with Call and WhatsApp on every member and an Excel download of the list. Money
 * owed is the owner's alone (permissions.ts `seeTotals`): the front desk never sees the tile, and
 * its page is closed to them (canOpen).
 */

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';

import { useCan } from '../auth/AuthProvider';
import { riskReason, riskReasonShort, hourLabel } from '../logic/attendance';
import { AGING_LABEL } from '../logic/collections';
import { csvDocument, csvFilename, type CsvValue } from '../logic/csv';
import { addDays, diffDays, formatDay, formatDayShort, isValidDateISO, relativeDay } from '../logic/dates';
import { formatINR, formatINRShort, paiseToRupees } from '../logic/money';
import { formatPhone, initials, phoneForExport, validateE164 } from '../logic/members';
import {
  backWindow,
  busyHours,
  countChangeWords,
  customRange,
  DEFAULT_RANGE,
  drawnHours,
  hourShort,
  isMoneyNumber,
  isNumberId,
  newMemberPlanWords,
  newMembers,
  numberLabel,
  numbersFor,
  owedListOn,
  parseRange,
  perDayWords,
  rangeChipLabel,
  rangeParam,
  RANGE_PRESET_IDS,
  renewalsDue,
  stoppedComingOn,
  tileFigures,
  windowFor,
  windowWords,
  type BusyHours,
  type HourRow,
  type NumberId,
  type NumbersRange,
  type TrendPoint,
} from '../logic/ownerNumbers';
import { countOf } from '../logic/plural';
import { useCrm } from '../store';
import type { MessageKind } from '../logic/whatsapp';
import type { Member, MemberView } from '../types';
import { downloadCsv } from './download';
import {
  Avatar,
  Button,
  Card,
  ChipToggle,
  EmptyState,
  Grid,
  PageHeader,
  Row,
  SectionTitle,
  TextField,
  TOUCH,
  Toast,
  color,
  font,
  radius,
  space,
  useIsCompact,
} from './kit';
import { Link, navigate, Redirect, replace } from './router';
import { WhatsAppSheet } from './WhatsAppSheet';

// ---------------------------------------------------------------- the remembered range

const RANGE_KEY = 'forgeai.numbers.range.v1';

function savedRange(): NumbersRange {
  try {
    return parseRange(typeof localStorage === 'undefined' ? null : localStorage.getItem(RANGE_KEY));
  } catch {
    // quiet: storage blocked (private window); 30 days is the default.
    return DEFAULT_RANGE;
  }
}

function saveRange(range: NumbersRange): void {
  try {
    localStorage.setItem(RANGE_KEY, rangeParam(range));
  } catch {
    // quiet: a private window cannot remember it; the choice still lasts while the page is open.
  }
}

/** The address of a tile's list for a range. */
export function numbersPath(id: NumberId, range: NumbersRange): string {
  return `/numbers/${id}/${rangeParam(range)}`;
}

// ---------------------------------------------------------------- tones

type Tone = 'accent' | 'good' | 'warn' | 'critical' | 'plain';

function toneColor(tone: Tone): string {
  switch (tone) {
    case 'good':
      return color.goodText;
    case 'warn':
      return color.warning;
    case 'critical':
      return color.criticalText;
    case 'accent':
      return color.accentBright;
    case 'plain':
      return color.ink;
  }
}

/** The line's colour: a plain figure keeps the gym's orange line so the section still reads as one. */
function lineColor(tone: Tone): string {
  return tone === 'plain' ? color.accent : toneColor(tone);
}

// ---------------------------------------------------------------- the range picker

function RangePicker({
  value,
  onChange,
  seed,
}: {
  value: NumbersRange;
  onChange: (r: NumbersRange) => void;
  /** The days Pick dates starts from: the days on show (ahead for Renewals, back for the rest). */
  seed: (r: NumbersRange) => { from: string; to: string };
}) {
  // The two date boxes keep what is typed, half-typed dates included; the range moves only once both
  // are real days (a `type="date"` box gives '' mid-typing).
  const start = value.kind === 'custom' ? value : seed(value);
  const [from, setFrom] = useState(start.from);
  const [to, setTo] = useState(start.to);
  useEffect(() => {
    if (value.kind === 'custom') {
      setFrom(value.from);
      setTo(value.to);
    }
  }, [value]);

  const pick = (kind: string) => {
    if (kind === 'custom') {
      const w = value.kind === 'custom' ? value : seed(value);
      setFrom(w.from);
      setTo(w.to);
      onChange(customRange(w.from, w.to));
      return;
    }
    if (kind === '7' || kind === '30' || kind === '90') onChange({ kind });
  };

  const typed = (f: string, t: string) => {
    setFrom(f);
    setTo(t);
    if (isValidDateISO(f) && isValidDateISO(t)) onChange(customRange(f, t));
  };

  return (
    <div style={{ display: 'grid', gap: space.md, minWidth: 0 }}>
      <ChipToggle
        label="Days to show"
        // Inside a card on a phone the four chips do not fit one line; a second line beats a hidden chip.
        wrap
        value={value.kind}
        onChange={pick}
        options={[...RANGE_PRESET_IDS, 'custom' as const].map((k) => ({ value: k, label: rangeChipLabel(k) }))}
      />
      {value.kind === 'custom' && (
        <Grid min={150}>
          <TextField label="From" type="date" value={from} onChange={(v) => typed(v, to)} />
          <TextField label="To" type="date" value={to} onChange={(v) => typed(from, v)} />
        </Grid>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- the small pictures

/**
 * A trend line. Drawn in a 100-wide box stretched to the tile, with a stroke that does not stretch,
 * so it is the same 2px line on a phone and on a wide screen. A flat run sits in the middle, not on
 * the floor, so "nothing changed" never reads as "nothing at all".
 */
export function Sparkline({
  points,
  stroke,
  height = 40,
  label,
  fromZero = true,
}: {
  points: readonly TrendPoint[];
  stroke: string;
  height?: number;
  label: string;
  /**
   * Counts are drawn from zero. A figure that stands (money owed, members away) is drawn between its own
   * lowest and highest point, or a 12% rise on Rs 1.5L would be a flat line along the top.
   */
  fromZero?: boolean;
}) {
  const values = points.map((p) => p.value);
  if (values.length === 0) return <div style={{ height }} aria-hidden />;
  const max = Math.max(...values);
  const min = fromZero ? Math.min(...values, 0) : Math.min(...values);
  const flat = max === min;
  const pad = 3;
  const y = (v: number) => (flat ? height / 2 : pad + (1 - (v - min) / (max - min)) * (height - pad * 2));
  const x = (i: number) => (values.length === 1 ? 50 : (i / (values.length - 1)) * 100);
  const coords = values.length === 1 ? [`0,${y(values[0])}`, `100,${y(values[0])}`] : values.map((v, i) => `${x(i)},${y(v)}`);
  const area = `M0,${height} L${coords.join(' L')} L100,${height} Z`;
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      style={{ display: 'block', width: '100%', height, overflow: 'visible' }}
    >
      <path d={area} fill={stroke} fillOpacity={0.12} stroke="none" />
      <polyline
        points={coords.join(' ')}
        fill="none"
        stroke={stroke}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Check-ins by hour as small bars; the busiest hour in the tone's colour, the rest quiet. */
export function HourBars({ busy, height = 40, labels = false }: { busy: BusyHours; height?: number; labels?: boolean }) {
  const hours = drawnHours(busy);
  const max = Math.max(1, ...hours.map((h) => h.visitsN));
  return (
    <div aria-hidden style={{ display: 'grid', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 3, height }}>
        {hours.map((h) => (
          <div
            key={h.hour}
            title={`${hourLabel(h.hour)}: ${countOf(h.visitsN, 'check-in')}`}
            style={{
              flex: '1 1 0',
              minWidth: 0,
              // Thin bars on a wide screen: sixteen 90px blocks read as a wall, not a day.
              maxWidth: labels ? 40 : 18,
              height: h.visitsN === 0 ? 2 : Math.max(3, (h.visitsN / max) * height),
              borderRadius: 2,
              background: h.hour === busy.busiest ? color.accent : color.inkFaint,
              opacity: h.hour === busy.busiest ? 1 : 0.55,
            }}
          />
        ))}
      </div>
      {labels && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 3 }}>
          {hours.map((h) => (
            <div
              key={h.hour}
              style={{ flex: '1 1 0', minWidth: 0, maxWidth: 40, fontFamily: font.body, fontSize: 10, color: color.inkMuted, textAlign: 'center', whiteSpace: 'nowrap', overflow: 'visible' }}
            >
              {h.hour % 3 === 0 ? hourShort(h.hour).replace(' ', '') : ''}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- one tile

function NumberTile({
  id,
  value,
  fullValue,
  sub,
  tone,
  picture,
  onOpen,
}: {
  id: NumberId;
  value: string;
  fullValue?: string;
  sub: string;
  tone: Tone;
  picture: ReactNode;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${numberLabel(id)}: ${fullValue ?? value}. ${sub}. Open the list.`}
      style={{
        appearance: 'none',
        font: 'inherit',
        color: 'inherit',
        textAlign: 'left',
        width: '100%',
        minWidth: 0,
        cursor: 'pointer',
        background: color.surface,
        border: `1px solid ${color.border}`,
        borderRadius: radius.lg,
        padding: space.lg,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        alignItems: 'stretch',
        gap: 0,
      }}
    >
      <div title={fullValue} style={{ fontFamily: font.mono, fontSize: 28, fontWeight: 700, color: toneColor(tone), lineHeight: 1.15, overflowWrap: 'anywhere' }}>
        {value}
      </div>
      <div style={{ fontFamily: font.body, fontSize: 12, color: color.inkMuted, marginTop: 6, textTransform: 'uppercase', letterSpacing: 0.6 }}>
        {numberLabel(id)}
      </div>
      <div style={{ fontFamily: font.body, fontSize: 12, color: color.inkSecondary, marginTop: 4, textWrap: 'pretty' }}>{sub}</div>
      {/* The picture sits on the tile's floor, so lines line up across a row of tiles of different text heights. */}
      <div style={{ marginTop: 'auto', paddingTop: space.md }}>{picture}</div>
    </button>
  );
}

// ---------------------------------------------------------------- the Today section

/** "Your numbers" on Today: the range picker and the tiles. */
export function NumbersSection() {
  const { snapshot, today } = useCrm();
  const seeTotals = useCan()('seeTotals');
  const compact = useIsCompact();
  const [range, setRangeState] = useState<NumbersRange>(savedRange);
  const setRange = (r: NumbersRange) => {
    setRangeState(r);
    saveRange(r);
  };

  const f = useMemo(() => tileFigures(snapshot, range, today, seeTotals), [snapshot, range, today, seeTotals]);
  const ids = numbersFor(seeTotals);
  const back = backWindow(range, today);
  const custom = range.kind === 'custom';
  // What a standing figure (owed, away) is compared with: the day before the days shown.
  const dayBefore = formatDayShort(addDays(back.from, -1));
  const beforeWords = custom ? `on ${dayBefore}` : `${range.kind} days ago`;
  const moneySince = custom ? `since ${dayBefore}` : `in ${range.kind} days`;
  const sameSpanBefore = custom ? 'the same days before' : `the ${range.kind} days before`;

  const tile = (id: NumberId): ReactNode => {
    const open = () => navigate(numbersPath(id, range));
    const words = windowWords(id, range, today);
    switch (id) {
      case 'renewals':
        return (
          <NumberTile
            key={id}
            id={id}
            value={String(f.renewals.count)}
            sub={custom ? `Plans ending ${words}` : `Plans ending in the next ${range.kind} days`}
            tone={f.renewals.count > 0 ? 'warn' : 'plain'}
            onOpen={open}
            picture={<Sparkline points={f.renewals.trend} stroke={lineColor(f.renewals.count > 0 ? 'warn' : 'plain')} label={trendWords(f.renewals.trend, (v) => countOf(v, 'plan'))} />}
          />
        );
      case 'owed':
        return (
          <NumberTile
            key={id}
            id={id}
            value={formatINRShort(f.owed.totalP)}
            fullValue={formatINR(f.owed.totalP)}
            sub={`${countOf(f.owed.people, 'member')} · ${moneyChangeWords(f.owed.totalP, f.owed.beforeP, moneySince)}`}
            tone={f.owed.totalP > 0 ? 'warn' : 'plain'}
            onOpen={open}
            picture={<Sparkline points={f.owed.trend} stroke={lineColor(f.owed.totalP > 0 ? 'warn' : 'plain')} label={trendWords(f.owed.trend, (v) => formatINR(v))} fromZero={false} />}
          />
        );
      case 'stopped':
        return (
          <NumberTile
            key={id}
            id={id}
            value={f.stopped.registerUsed ? String(f.stopped.count) : '–'}
            sub={f.stopped.registerUsed ? countChangeWords(f.stopped.count, f.stopped.before, beforeWords) : 'Check members in to see this'}
            tone={f.stopped.registerUsed && f.stopped.count > 0 ? 'warn' : 'plain'}
            onOpen={open}
            picture={<Sparkline points={f.stopped.trend} stroke={lineColor(f.stopped.count > 0 ? 'warn' : 'plain')} label={trendWords(f.stopped.trend, (v) => countOf(v, 'member'))} fromZero={false} />}
          />
        );
      case 'new':
        return (
          <NumberTile
            key={id}
            id={id}
            value={String(f.newcomers.count)}
            sub={`${words} · ${countChangeWords(f.newcomers.count, f.newcomers.before, sameSpanBefore).replace(/^Same as/, 'same as')}`}
            tone={f.newcomers.count > 0 ? 'good' : 'plain'}
            onOpen={open}
            picture={<Sparkline points={f.newcomers.trend} stroke={lineColor(f.newcomers.count > 0 ? 'good' : 'plain')} label={trendWords(f.newcomers.trend, (v) => countOf(v, 'new member'))} />}
          />
        );
      case 'busy': {
        const b = f.busy;
        const peak = b.busiest === null ? null : b.hours[b.busiest];
        return (
          <NumberTile
            key={id}
            id={id}
            value={peak ? hourShort(peak.hour) : '–'}
            fullValue={peak ? hourLabel(peak.hour) : undefined}
            sub={peak ? `Busiest hour · ${perDayWords(peak.perDay)}` : 'Check members in to see this'}
            tone={peak ? 'accent' : 'plain'}
            onOpen={open}
            picture={<HourBars busy={b} />}
          />
        );
      }
    }
  };

  return (
    <section aria-labelledby="your-numbers" style={{ marginTop: space.xl }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: space.md,
          marginBottom: space.sm,
        }}
      >
        <h2 id="your-numbers" style={{ margin: 0, fontFamily: font.display, fontSize: 16, fontWeight: 600, color: color.ink }}>
          Your numbers
        </h2>
        <div style={{ minWidth: 0, maxWidth: '100%', flex: compact ? '1 1 100%' : '0 1 auto' }}>
          <RangePicker value={range} onChange={setRange} seed={(r) => backWindow(r, today)} />
        </div>
      </div>
      <p style={{ margin: `0 0 ${space.md}px`, fontFamily: font.body, fontSize: 12, color: color.inkMuted, textWrap: 'pretty' }}>
        {custom
          ? `${windowWords('new', range, today)}. Tap a number to see who is behind it.`
          : `Last ${range.kind} days, and plans ending in the next ${range.kind}. Tap a number to see who is behind it.`}
      </p>
      <Grid min={compact ? 150 : 190}>{ids.map(tile)}</Grid>
    </section>
  );
}

/** "up ₹4k in 30 days" / "down ₹1.2k since 29 Sep" / "no change in 30 days"; short money, so it fits a tile. */
function moneyChangeWords(now: number, before: number, since: string): string {
  if (now === before) return `no change ${since}`;
  return `${now > before ? 'up' : 'down'} ${formatINRShort(Math.abs(now - before))} ${since}`;
}

/** What a screen reader hears for a line: where it started, where it ended, and its highest point. */
function trendWords(points: readonly TrendPoint[], say: (v: number) => string): string {
  if (points.length === 0) return 'No line to show';
  const first = points[0];
  const last = points[points.length - 1];
  const high = points.reduce((a, b) => (b.value > a.value ? b : a), first);
  return `Trend: ${say(first.value)} on ${formatDayShort(first.to)}, ${say(last.value)} on ${formatDayShort(last.to)}, highest ${say(high.value)}.`;
}

// ---------------------------------------------------------------- the page behind a tile

interface ListRow {
  key: string;
  member: Member;
  detail: string;
  tone?: Tone;
  /** Right-hand figure (money owed). */
  figure?: string;
  /** The WhatsApp message to open on. */
  message: MessageKind;
}

export function NumbersScreen({ which, rangeSeg }: { which: string | undefined; rangeSeg: string | undefined }) {
  const { snapshot, today, viewFor } = useCrm();
  const seeTotals = useCan()('seeTotals');
  const compact = useIsCompact();
  const range = useMemo(() => parseRange(rangeSeg), [rangeSeg]);
  const [whatsApp, setWhatsApp] = useState<{ view: MemberView; kind: MessageKind } | null>(null);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(t);
  }, [toast]);

  // Money owed is the owner's: the front desk is sent home (canOpen already closes the address).
  const id: NumberId | null = isNumberId(which) && (seeTotals || !isMoneyNumber(which)) ? which : null;
  const figures = useMemo(
    () => (id ? tileFigures(snapshot, range, today, isMoneyNumber(id)) : null),
    [id, snapshot, range, today],
  );
  const w = useMemo(() => (id ? windowFor(id, range, today) : null), [id, range, today]);

  const data = useMemo(() => {
    if (!id || !w) return null;
    switch (id) {
      case 'renewals': {
        const rows = renewalsDue(snapshot.members, snapshot.memberships, w, today);
        return {
          rows: rows.map<ListRow>((r) => ({
            key: r.member.id,
            member: r.member,
            detail: `${r.planName} · ${r.daysLeft < 0 ? 'ended' : 'ends'} ${relativeDay(r.endsOn, today)} (${formatDayShort(r.endsOn)})`,
            tone: r.daysLeft <= 0 ? 'critical' : r.daysLeft <= 3 ? 'warn' : undefined,
            message: r.daysLeft < 0 ? 'ended' : 'ending',
          })),
          csv: {
            headers: ['Member', 'Mobile', 'Plan', 'Plan ends', 'Days left'],
            rows: rows.map<CsvValue[]>((r) => [r.member.fullName, phoneForExport(r.member.phone), r.planName, r.endsOn, r.daysLeft]),
          },
        };
      }
      case 'owed': {
        const rows = owedListOn(snapshot.members, snapshot.memberships, snapshot.payments, w.to);
        return {
          rows: rows.map<ListRow>((p) => ({
            key: p.member.id,
            member: p.member,
            detail: `${countOf(p.terms.length, 'plan')} · ${AGING_LABEL[p.bucket].toLowerCase()}${p.member.archived ? ' · archived' : ''}`,
            tone: p.bucket === 'd60plus' ? 'critical' : 'warn',
            figure: formatINR(p.totalP),
            message: 'fees',
          })),
          csv: {
            headers: ['Member', 'Mobile', 'Plans unpaid', 'Owed since', 'Days', 'Amount owed (INR)', 'Archived'],
            rows: rows.map<CsvValue[]>((p) => [
              p.member.fullName,
              phoneForExport(p.member.phone),
              p.terms.length,
              p.terms.reduce((a, t) => (t.membership.startsOn < a ? t.membership.startsOn : a), p.terms[0].membership.startsOn),
              Math.max(0, p.oldestAgeDays),
              paiseToRupees(p.totalP),
              p.member.archived ? 'Yes' : 'No',
            ]),
          },
        };
      }
      case 'stopped': {
        const rows = stoppedComingOn(snapshot.members, snapshot.memberships, snapshot.visits, w.to);
        return {
          rows: rows.map<ListRow>((r) => ({
            key: r.member.id,
            member: r.member,
            detail: riskReasonShort(r),
            tone: r.band === 'settling_in' ? 'critical' : 'warn',
            message: 'away',
          })),
          csv: {
            headers: ['Member', 'Mobile', 'Last visit', 'Days away', 'Why'],
            rows: rows.map<CsvValue[]>((r) => [
              r.member.fullName,
              phoneForExport(r.member.phone),
              r.profile.lastVisitOn ?? '',
              r.profile.daysSinceVisit ?? '',
              riskReason(r),
            ]),
          },
        };
      }
      case 'new': {
        const rows = newMembers(snapshot.members, w);
        return {
          rows: rows.map<ListRow>((m) => {
            const v = viewFor(m.id);
            return {
              key: m.id,
              member: m,
              detail: `Joined ${relativeDay(m.joinedOn, today)} · ${newMemberPlanWords(v?.state, v?.current?.planName ?? null)}`,
              message: 'welcome',
            };
          }),
          csv: {
            headers: ['Member', 'Mobile', 'Joined on', 'Plan now'],
            rows: rows.map<CsvValue[]>((m) => {
              const v = viewFor(m.id);
              return [m.fullName, phoneForExport(m.phone), m.joinedOn, newMemberPlanWords(v?.state, v?.current?.planName ?? null)];
            }),
          },
        };
      }
      case 'busy':
        return null;
    }
  }, [id, w, snapshot, today, viewFor]);

  const busy = useMemo(() => (id === 'busy' && w ? busyHours(snapshot.visits, w) : null), [id, w, snapshot.visits]);

  if (!id || !w || !figures) return <Redirect to="/" />;

  const setRange = (r: NumbersRange) => {
    saveRange(r);
    replace(numbersPath(id, r));
  };

  const fileBase = [snapshot.gym.name, numberLabel(id), w.from, w.to];
  const download = () => {
    if (busy) {
      const contents = csvDocument(
        ['Hour', 'Check-ins', 'Average a day'],
        busy.hours.map((h) => [hourLabel(h.hour), h.visitsN, Math.round(h.perDay * 10) / 10]),
      );
      downloadCsv(csvFilename(fileBase), contents);
      setToast({ id: Date.now(), text: 'Downloaded the hours.' });
      return;
    }
    if (!data) return;
    downloadCsv(csvFilename(fileBase), csvDocument(data.csv.headers, data.csv.rows));
    setToast({ id: Date.now(), text: data.rows.length === 1 ? 'Downloaded 1 member.' : `Downloaded ${data.rows.length} members.` });
  };

  const openWhatsApp = (r: ListRow) => {
    const v = viewFor(r.member.id);
    if (v) setWhatsApp({ view: v, kind: r.message });
  };

  const words = windowWords(id, range, today);
  const listCount = busy ? busy.timedN : (data?.rows.length ?? 0);

  return (
    <>
      <PageHeader title={numberLabel(id)} subtitle={`${pageSubtitle(id)} · ${words}`} actions={compact ? undefined : <Button variant="ghost" onClick={() => navigate('/')}>Back to Today</Button>} />

      <Card style={{ marginBottom: space.lg }}>
        <RangePicker value={range} onChange={setRange} seed={(r) => windowFor(id, r, today)} />
      </Card>

      <Card style={{ marginBottom: space.lg }}>
        <SectionTitle>{busy ? 'Check-ins by hour' : 'How it changed'}</SectionTitle>
        {busy ? (
          busy.timedN === 0 ? (
            <EmptyState title="No check-in times yet" body="This fills in once members are checked in at the desk or scan the gym's code in the app." />
          ) : (
            <HourBars busy={busy} height={120} labels />
          )
        ) : (
          <BigTrend id={id} figures={figures} />
        )}
      </Card>

      <Card>
        <SectionTitle
          action={
            <Button variant="ghost" onClick={download} disabled={listCount === 0}>
              Download Excel file
            </Button>
          }
        >
          {busy ? 'Hours, busiest first' : countOf(listCount, 'member')}
        </SectionTitle>

        {busy ? (
          <HourList busy={busy} />
        ) : data && data.rows.length > 0 ? (
          <div style={{ display: 'grid', gap: 0 }}>
            {data.rows.map((r, i) => (
              <MemberLine key={r.key} row={r} first={i === 0} compact={compact} onWhatsApp={() => openWhatsApp(r)} />
            ))}
          </div>
        ) : (
          <ListEmpty id={id} registerUsed={figures.stopped.registerUsed} />
        )}
      </Card>

      {whatsApp && <WhatsAppSheet view={whatsApp.view} startWith={whatsApp.kind} onClose={() => setWhatsApp(null)} />}
      {toast && <Toast key={toast.id} message={toast.text} />}
    </>
  );
}

function pageSubtitle(id: NumberId): string {
  switch (id) {
    case 'renewals':
      return 'Plans that end and are not renewed yet';
    case 'owed':
      return 'Fees members still have to pay';
    case 'stopped':
      return 'Members with a plan who stopped coming';
    case 'new':
      return 'Members who joined';
    case 'busy':
      return 'When members come in';
  }
}

function ListEmpty({ id, registerUsed }: { id: NumberId; registerUsed: boolean }) {
  switch (id) {
    case 'renewals':
      return <EmptyState title="No plans end in these days" body="Nobody needs to renew in these days." />;
    case 'owed':
      return <EmptyState title="Nobody owes money" body="Every plan is fully paid." />;
    case 'stopped':
      return registerUsed ? (
        <EmptyState title="Everybody is coming" body="Every member with a running plan is coming as usual." />
      ) : (
        <EmptyState title="Start checking members in" body="After a few days of check-ins, this fills in by itself." />
      );
    case 'new':
      return <EmptyState title="Nobody joined in these days" body="Pick more days at the top to look further back." />;
    case 'busy':
      return null;
  }
}

/** The tile's line, drawn large, with its first and last day under it and its highest point beside it. */
function BigTrend({ id, figures }: { id: NumberId; figures: ReturnType<typeof tileFigures> }) {
  const points =
    id === 'renewals' ? figures.renewals.trend : id === 'owed' ? figures.owed.trend : id === 'stopped' ? figures.stopped.trend : figures.newcomers.trend;
  const say = (v: number) => (id === 'owed' ? formatINR(v) : String(v));
  const unit =
    id === 'renewals' ? 'Plans ending' : id === 'owed' ? 'Money owed' : id === 'stopped' ? 'Members away' : 'Members joined';
  if (points.length === 0) return null;
  const high = points.reduce((a, b) => (b.value > a.value ? b : a), points[0]);
  // The newest point is always a whole step (trendSpans cuts from the end): 1, 7 or 30 days.
  const last = points[points.length - 1];
  const step = diffDays(last.from, last.to) + 1;
  const stepWords = step === 1 ? 'each point is a day' : step === 7 ? 'each point is a week' : 'each point is a month';
  const stroke = id === 'new' ? color.goodText : color.warning;
  return (
    <div style={{ display: 'grid', gap: space.sm }}>
      <Row gap={space.lg}>
        <Figure label="Highest" value={say(high.value)} />
        <Figure label="Now" value={say(points[points.length - 1].value)} />
        <span style={{ fontFamily: font.body, fontSize: 12, color: color.inkMuted }}>
          {unit} · {stepWords}
        </span>
      </Row>
      <Sparkline points={points} stroke={stroke} height={120} label={trendWords(points, say)} fromZero={id === 'renewals' || id === 'new'} />
      <Row gap={space.sm} wrap={false}>
        <span style={axisText}>{formatDay(points[0].from)}</span>
        <span style={{ flex: 1 }} />
        <span style={axisText}>{formatDay(points[points.length - 1].to)}</span>
      </Row>
    </div>
  );
}

const axisText: CSSProperties = { fontFamily: font.body, fontSize: 11, color: color.inkMuted };

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'grid', gap: 2 }}>
      <span style={{ fontFamily: font.body, fontSize: 11, color: color.inkMuted, textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</span>
      <span style={{ fontFamily: font.mono, fontSize: 18, fontWeight: 700, color: color.ink }}>{value}</span>
    </div>
  );
}

function HourList({ busy }: { busy: BusyHours }) {
  if (busy.timedN === 0) return <EmptyState title="Nothing to list yet" body="Check members in, and the busiest hours show here." />;
  const rows = busy.hours.filter((h) => h.visitsN > 0).sort((a, b) => b.visitsN - a.visitsN || a.hour - b.hour);
  const max = rows[0]?.visitsN ?? 1;
  return (
    <div style={{ display: 'grid', gap: space.sm }}>
      {rows.map((h) => (
        <HourLine key={h.hour} h={h} share={h.visitsN / max} top={h.hour === busy.busiest} />
      ))}
    </div>
  );
}

function HourLine({ h, share, top }: { h: HourRow; share: number; top: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(84px, auto) 1fr auto', alignItems: 'center', gap: space.md, minHeight: 32 }}>
      <span style={{ fontFamily: font.body, fontSize: 13, fontWeight: top ? 700 : 600, color: color.ink, whiteSpace: 'nowrap' }}>{hourLabel(h.hour)}</span>
      <div style={{ height: 8, borderRadius: radius.pill, background: color.surfaceSunken, overflow: 'hidden' }}>
        <div style={{ width: `${Math.max(2, share * 100)}%`, height: '100%', background: top ? color.accent : color.inkFaint }} />
      </div>
      <span style={{ fontFamily: font.body, fontSize: 12, color: color.inkSecondary, whiteSpace: 'nowrap', textAlign: 'right' }}>
        {perDayWords(h.perDay)} · {h.visitsN}
      </span>
    </div>
  );
}

const actionLink: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: TOUCH,
  minWidth: 64,
  padding: '0 14px',
  borderRadius: radius.pill,
  border: `1px solid ${color.borderStrong}`,
  background: 'transparent',
  color: color.ink,
  fontFamily: font.body,
  fontSize: 13,
  fontWeight: 700,
  textDecoration: 'none',
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  appearance: 'none',
};

function MemberLine({ row, first, compact, onWhatsApp }: { row: ListRow; first: boolean; compact: boolean; onWhatsApp: () => void }) {
  const { member } = row;
  const canCall = validateE164(member.phone) !== null;
  const detailColor = row.tone ? toneColor(row.tone) : color.inkSecondary;
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: compact ? 'wrap' : 'nowrap',
        alignItems: 'center',
        gap: space.md,
        padding: `${space.md}px 0`,
        borderTop: first ? 'none' : `1px solid ${color.border}`,
      }}
    >
      <Link to={`/members/${member.id}`} style={{ flex: '1 1 220px', minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: space.md, minHeight: TOUCH, minWidth: 0 }}>
          <Avatar text={initials(member.fullName)} size={32} />
          <span style={{ display: 'grid', minWidth: 0 }}>
            <span style={{ fontFamily: font.body, fontSize: 14, fontWeight: 600, color: color.ink, overflowWrap: 'anywhere' }}>{member.fullName}</span>
            <span style={{ fontFamily: font.body, fontSize: 12, color: detailColor, textWrap: 'pretty' }}>{row.detail}</span>
          </span>
        </span>
      </Link>
      <div style={{ display: 'flex', alignItems: 'center', gap: space.sm, marginLeft: compact ? 44 : 0, flexShrink: 0 }}>
        {row.figure && (
          <span style={{ fontFamily: font.mono, fontSize: 15, fontWeight: 700, color: color.warning, marginRight: space.xs, whiteSpace: 'nowrap' }}>{row.figure}</span>
        )}
        {canCall && (
          <a href={`tel:${member.phone}`} style={actionLink} aria-label={`Call ${member.fullName}, ${formatPhone(member.phone)}`}>
            Call
          </a>
        )}
        <button type="button" onClick={onWhatsApp} style={actionLink} aria-label={`WhatsApp ${member.fullName}`}>
          WhatsApp
        </button>
      </div>
    </div>
  );
}
