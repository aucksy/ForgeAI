/**
 * Attendance — the register, and the members who have stopped turning up.
 *
 * TWO JOBS, ONE SCREEN. The register is the busiest interaction in the whole
 * product: someone walks in, you find them and mark them present in about two
 * seconds, forty times an evening. It is search-first for that reason — a roster you
 * have to scroll is a roster the desk stops using, and until now the only way to
 * check anybody in was to open their profile and find a button.
 *
 * The at-risk list is what all that typing is FOR. Days-without-attendance is the
 * one churn signal with peer-reviewed support across several countries, so this is
 * the screen that turns a register into a reason to keep one.
 *
 * A note on the copy, which is a design constraint and not a style choice: a
 * randomised field experiment found proactive retention outreach RAISED churn (10%
 * vs 6% untouched). The rule taken from it — talk to an at-risk member about their
 * training, never about their membership — is why nothing on the risk tab mentions
 * renewals or money, even though both are one click away on their profile.
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import { useCrm } from '../../store';
import {
  atRiskList,
  attendanceSummary,
  BAND_TONE,
  dailyVisitCounts,
  hourHistogram,
  hourLabel,
  isRegisterInUse,
  registerFor,
  riskReason,
  riskTotals,
  RISK_LABEL,
  visitSourceTag,
  type AtRiskRow,
  type RiskBand,
} from '../../logic/attendance';
import { csvDocument, csvFilename } from '../../logic/csv';
import { ALL_BATCHES, inBatch, listBatches, memberBatch } from '../../logic/batches';
import { addDays, dateISOFromEpoch, formatDay, formatDayShort, hourOfEpoch, isValidDateISO, minuteOfEpoch, relativeDay } from '../../logic/dates';
import { STATE_LABEL, stateTone } from '../../logic/membership';
import { formatPhone, initials, matchesQuery, phoneDigits, phoneForExport } from '../../logic/members';
import { formatINR } from '../../logic/money';
import type { MemberView, Visit } from '../../types';
import { downloadCsv } from '../download';
import {
  Avatar,
  Button,
  Card,
  ChipToggle,
  EmptyState,
  ErrorBanner,
  Grid,
  PageHeader,
  Pill,
  Row,
  SearchField,
  SectionTitle,
  StatTile,
  TextField,
  Toast,
  color,
  font,
  radius,
  space,
} from '../kit';
import { Link, navigate } from '../router';
import { CheckInQrScreen } from '../../shop/CheckInQrScreen';
import { VisitorsCard } from '../../branches/VisitorsCard';
import { MemberAvatar } from '../MemberPhoto';
import { useBranches } from '../../branches/context';

type Tab = 'register' | 'risk';

/** How many search hits to render. A desk types until the right person is on top. */
const MAX_RESULTS = 8;

/** The reporting window under the register. */
const TREND_DAYS = 30;

export function AttendanceScreen({ section }: { section?: string }) {
  // `/attendance/qr`: the "Scan to check in" poster (QR self check-in, 15 Oct 2026).
  if (section === 'qr') return <CheckInQrScreen />;
  return <AttendanceTabs section={section} />;
}

function AttendanceTabs({ section }: { section?: string }) {
  const tab: Tab = section === 'risk' ? 'risk' : 'register';
  const { snapshot, today } = useCrm();

  const atRiskN = useMemo(
    () => atRiskList(snapshot.members, snapshot.memberships, snapshot.visits, today).length,
    [snapshot.members, snapshot.memberships, snapshot.visits, today],
  );

  // Same toast discipline as the Money screen: a `Toast` with no timer is a banner,
  // and the sequence counter is what lets the SAME message fire twice in a row —
  // checking in two people back to back must acknowledge both.
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const toastSeq = useRef(0);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const flash = (text: string) => {
    toastSeq.current += 1;
    setToast({ id: toastSeq.current, text });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  };

  return (
    <>
      <PageHeader
        title="Visits"
        subtitle={
          tab === 'risk'
            ? 'Paying members who are losing the habit'
            : 'Who trained, and when'
        }
        actions={
          <Button variant="ghost" onClick={() => navigate('/attendance/qr')}>
            Check-in QR
          </Button>
        }
      />

      <div style={{ marginBottom: space.lg }}>
        <ChipToggle
          variant="tabs"
          label="Attendance view"
          value={tab}
          onChange={(v) => navigate(v === 'risk' ? '/attendance/risk' : '/attendance')}
          options={[
            { value: 'register', label: 'Register' },
            // The count rides on the chip because the navigation badge that brings
            // people here lands on the Register tab: without it the badge shows a
            // number over a screen that never explains it.
            { value: 'risk', label: 'Losing the habit', count: atRiskN },
          ]}
        />
      </div>

      {tab === 'risk' ? <AtRisk onToast={flash} /> : <Register onToast={flash} />}

      {toast && <Toast key={toast.id} message={toast.text} />}
    </>
  );
}

// ---------------------------------------------------------------- register

function Register({ onToast }: { onToast: (msg: string) => void }) {
  const { snapshot, today, memberViews, checkIn, undoCheckIn } = useCrm();
  // #41: a visit kept here that happened at another branch says where.
  const { multi } = useBranches();

  // The day is held as a MODE plus a typed date, not as a bare date with the mode
  // derived back out of it. Deriving it made "Another day" a dead chip: clicking it
  // changed no state, so the selection snapped back to Today and the date field it
  // is supposed to reveal could never be reached. Holding the mode also means a tab
  // left open overnight follows the clock on its own — `viewing` recomputes from the
  // new `today` with no effect to keep in step.
  const [mode, setMode] = useState<'today' | 'yesterday' | 'other'>('today');
  const [customDay, setCustomDay] = useState(() => addDays(today, -2));
  const [query, setQuery] = useState('');
  // Batch (15 Oct 2026): the 6 am desk picks "Morning 6-8" and gets that batch as a tick list,
  // no typing; a search typed with a batch picked looks only inside it.
  const [batch, setBatch] = useState<string>(ALL_BATCHES);
  const batches = useMemo(() => listBatches(memberViews.map((v) => v.member)), [memberViews]);
  const viewById = useMemo(() => new Map(memberViews.map((v) => [v.member.id, v])), [memberViews]);
  const batchName = batches.find((b) => b.key === batch)?.name ?? null;
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // NULL when the typed day cannot be used, rather than quietly falling back to
  // today. Falling back is the dangerous option: a `type="date"` field reads as ''
  // mid-keystroke, so the banner saying "recording for 20 July" would vanish while
  // the mode still said "another day", and the next check-in would land on today
  // without anyone being told. Everything that writes is hidden until the day is real.
  const viewing: string | null =
    mode === 'today'
      ? today
      : mode === 'yesterday'
        ? addDays(today, -1)
        : isValidDateISO(customDay) && customDay <= today
          ? customDay
          : null;
  const isToday = viewing === today;

  const checkedInOn = useMemo(() => {
    const ids = new Set<string>();
    if (viewing) for (const v of snapshot.visits) if (v.visitedOn === viewing) ids.add(v.memberId);
    return ids;
  }, [snapshot.visits, viewing]);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    return memberViews.filter((v) => matchesQuery(v.member, query) && inBatch(v.member, batch));
  }, [memberViews, query, batch]);

  /** The picked batch, A to Z, when nothing is typed. A fixed order: rows never jump under a finger. */
  const batchList = useMemo(() => {
    if (batch === ALL_BATCHES || query.trim()) return [];
    return memberViews
      .filter((v) => inBatch(v.member, batch))
      .sort((a, b) => a.member.fullName.localeCompare(b.member.fullName));
  }, [memberViews, query, batch]);
  const batchInN = batchList.filter((v) => checkedInOn.has(v.member.id)).length;

  const register = useMemo(
    () => (viewing ? registerFor(snapshot.visits, snapshot.members, viewing) : []),
    [snapshot.visits, snapshot.members, viewing],
  );

  /** Shown while no day is usable, so the tile never reads 0 for a gym that is busy. */
  const todayRegisterN = useMemo(
    () => snapshot.visits.filter((v) => v.visitedOn === today).length,
    [snapshot.visits, today],
  );

  const trendFrom = addDays(today, -(TREND_DAYS - 1));
  const trend = useMemo(
    () => dailyVisitCounts(snapshot.visits, trendFrom, today),
    [snapshot.visits, trendFrom, today],
  );
  const summary = useMemo(
    () => attendanceSummary(snapshot.visits, trendFrom, today),
    [snapshot.visits, trendFrom, today],
  );
  const hours = useMemo(
    () => hourHistogram(snapshot.visits.filter((v) => v.visitedOn >= trendFrom && v.visitedOn <= today)),
    [snapshot.visits, trendFrom, today],
  );

  const run = async (memberId: string, fn: () => Promise<void>, done: string) => {
    setError(null);
    setBusyId(memberId);
    try {
      await fn();
      onToast(done);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t work. Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const doCheckIn = (view: MemberView) => {
    if (!viewing) return;
    return run(
      view.member.id,
      async () => {
        await checkIn(view.member.id, 'desk', viewing);
        // Clear the box so the next person can be typed straight away — the desk
        // is a queue, not a form.
        setQuery('');
      },
      `${view.member.fullName} checked in.`,
    );
  };

  return (
    <>
      {error && <ErrorBanner>{error}</ErrorBanner>}

      <Card style={{ marginBottom: space.lg }}>
        <SectionTitle>Check someone in</SectionTitle>

        <ChipToggle
          label="Day"
          value={mode}
          onChange={(v) => setMode(v as 'today' | 'yesterday' | 'other')}
          options={[
            { value: 'today', label: 'Today' },
            { value: 'yesterday', label: 'Yesterday' },
            { value: 'other', label: 'Another day' },
          ]}
        />

        {batches.length > 0 && (
          <div style={{ marginTop: space.md }}>
            <ChipToggle
              label="Batch"
              value={batch}
              onChange={setBatch}
              options={[
                { value: ALL_BATCHES, label: 'All batches' },
                ...batches.map((b) => ({ value: b.key, label: b.name, count: b.countN })),
              ]}
            />
          </div>
        )}

        {mode === 'other' && (
          <TextField
            label="Register date"
            type="date"
            value={customDay}
            onChange={setCustomDay}
            error={
              isValidDateISO(customDay) && customDay > today
                ? 'That day hasn’t happened yet.'
                : null
            }
            hint="Use this to add a day the desk missed. You can’t pick a future day."
          />
        )}

        {viewing && !isToday && (
          // Loud, because everything typed below lands on a day that is not today,
          // and an owner who does not notice will wonder for weeks why the at-risk
          // list disagrees with the register.
          <div
            // Not `role="status"`: this is a persistent label, not an event, and a
            // live region here re-announces the same sentence on every render. The
            // mode change is already carried by the chip's `aria-pressed` and by the
            // date field's own label.
            style={{
              marginTop: space.md,
              border: `1px solid ${color.warning}`,
              background: 'rgba(224, 150, 60, 0.10)',
              borderRadius: radius.md,
              padding: `${space.sm}px ${space.md}px`,
              fontFamily: font.body,
              fontSize: 13,
              color: color.warning,
            }}
          >
            {'Adding check-ins for '}
            <strong>{formatDay(viewing)}</strong>
            {', not today.'}
          </div>
        )}

        {viewing ? (
          <div style={{ marginTop: space.md }}>
            <SearchField
              value={query}
              onChange={setQuery}
              placeholder="Type a name or the last 4 digits of a mobile"
            />
          </div>
        ) : (
          <EmptyState
            title="Pick a day first"
            body="Pick a day that has already passed. Then the check-in box comes back."
          />
        )}

        {viewing && query.trim() && (
          <div style={{ marginTop: space.md, display: 'grid', gap: space.sm }}>
            {results.length === 0 ? (
              <EmptyState
                title="Nobody matches that"
                body={
                  batchName
                    ? `Searching only ${batchName}. Pick “All batches” to search everyone.`
                    : multi
                      ? 'Check the spelling, or add them in Members first. A member of another branch? Use “Member from another branch” below.'
                      : 'Check the spelling, or add them in Members first.'
                }
                action={<Button onClick={() => navigate('/members')}>Open Members</Button>}
              />
            ) : (
              <>
                {results.slice(0, MAX_RESULTS).map((v) => (
                  <SearchResult
                    key={v.member.id}
                    view={v}
                    already={checkedInOn.has(v.member.id)}
                    busy={busyId === v.member.id}
                    onCheckIn={() => void doCheckIn(v)}
                  />
                ))}
                {results.length > MAX_RESULTS && (
                  <div style={{ fontFamily: font.body, fontSize: 12, color: color.inkMuted }}>
                    {`${results.length - MAX_RESULTS} more match. Type more to find them.`}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {viewing && batchName && !query.trim() && (
          <div style={{ marginTop: space.md }}>
            <div style={{ fontFamily: font.body, fontSize: 13, color: color.inkSecondary, marginBottom: space.sm }}>
              {`${batchName}: ${batchInN} of ${batchList.length} in`}
            </div>
            {batchList.length === 0 ? (
              <EmptyState title="Nobody in this batch" />
            ) : (
              <div style={{ display: 'grid', gap: space.sm }}>
                {batchList.map((v) => (
                  <SearchResult
                    key={v.member.id}
                    view={v}
                    already={checkedInOn.has(v.member.id)}
                    busy={busyId === v.member.id}
                    onCheckIn={() => void doCheckIn(v)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      {isToday && <VisitorsCard onToast={onToast} />}

      <Grid min={165}>
        <StatTile
          label={
            isToday || !viewing
              ? 'Check-ins today'
              : `Check-ins on ${formatDayShort(viewing)}`
          }
          value={viewing ? register.length : todayRegisterN}
          tone="accent"
          sub={isToday || !viewing ? 'So far today' : 'On that day'}
        />
        <StatTile
          label={`Visits in ${TREND_DAYS} days`}
          value={summary.visitsN}
          sub={summary.membersN === 1 ? '1 member' : `${summary.membersN} different members`}
        />
        {/* UAT A-24 / B-21 (30 Oct 2026): a young gym read "0.0 a day". Under 1 a day, count the week. */}
        <StatTile
          label={summary.perDay > 0 && summary.perDay < 1 ? 'Check-ins a week' : 'Check-ins a day'}
          value={summary.perDay > 0 && summary.perDay < 1
            ? (summary.perDay * 7 < 1 ? 'Under 1' : (summary.perDay * 7).toFixed(1))
            : summary.perDay.toFixed(1)}
          sub={`Average over the last ${TREND_DAYS} days`}
        />
        <StatTile
          label="Busiest hour"
          value={summary.busiestHour === null ? '—' : hourLabel(summary.busiestHour)}
          sub={
            summary.busiestHour === null
              ? 'No timed check-ins yet'
              : `Over the last ${TREND_DAYS} days`
          }
        />
      </Grid>

      <div style={{ height: space.lg }} />

      <Card style={{ marginBottom: space.lg }}>
        <SectionTitle>
          {!viewing
            ? 'The register'
            : isToday
              ? 'In today'
              : `In on ${formatDay(viewing)}`}
        </SectionTitle>
        {register.length === 0 ? (
          <EmptyState
            title={viewing ? 'Nobody yet' : 'No day selected'}
            body={
              !viewing
                ? 'Pick a day above to see who trained.'
                : isToday
                  ? 'Check-ins show here as soon as you add them.'
                  : 'No check-ins on this day.'
            }
          />
        ) : (
          <div style={{ display: 'grid', gap: space.xs }}>
            {register.map((row) => (
              <RegisterRowView
                key={row.visit.id}
                visit={row.visit}
                name={row.member?.fullName ?? 'Unknown member'}
                memberId={row.member?.id ?? null}
                view={row.visit.source === 'app' ? viewById.get(row.visit.memberId) ?? null : null}
                busy={busyId === row.visit.memberId}
                onUndo={() =>
                  void run(
                    row.visit.memberId,
                    () => undoCheckIn(row.visit.memberId, row.visit.visitedOn),
                    `Check-in removed for ${row.member?.fullName ?? 'that member'}.`,
                  )
                }
              />
            ))}
          </div>
        )}
      </Card>

      <Card style={{ marginBottom: space.lg }}>
        <SectionTitle>{`Last ${TREND_DAYS} days`}</SectionTitle>
        <TrendBars days={trend} today={today} />
      </Card>

      <Card>
        <SectionTitle>When the gym is busy</SectionTitle>
        {summary.busiestHour === null ? (
          <EmptyState
            title="No timed check-ins yet"
            body="Each check-in here saves the time. This fills in as you use the register."
          />
        ) : (
          <HourBars hours={hours} />
        )}
      </Card>
    </>
  );
}

function SearchResult({
  view,
  already,
  busy,
  onCheckIn,
}: {
  view: MemberView;
  already: boolean;
  busy: boolean;
  onCheckIn: () => void;
}) {
  const { member } = view;
  return (
    <div
      style={{
        border: `1px solid ${color.border}`,
        borderRadius: radius.md,
        padding: space.md,
        background: color.surfaceSunken,
      }}
    >
      <Row gap={space.md} wrap={false}>
        {/* F107: the member's photo when the desk took one, so the desk knows who is who. */}
        <MemberAvatar memberId={member.id} name={member.fullName} size={44} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Link to={`/members/${member.id}`}>
            <span style={{ ...tapTarget, fontSize: 14, fontWeight: 600, color: color.ink }}>
              {member.fullName}
            </span>
          </Link>
          <Row gap={space.xs}>
            {/* The desk needs to see an expired plan or an unpaid balance BEFORE
                waving somebody through — but neither blocks the check-in. Whether
                a member trains today is the owner's call, not the software's. */}
            <Pill tone={stateTone(view.state)}>{STATE_LABEL[view.state]}</Pill>
            {view.outstandingP > 0 && <Pill tone="warn">{`${formatINR(view.outstandingP)} due`}</Pill>}
          </Row>
          <div style={{ fontFamily: font.mono, fontSize: 12, color: color.inkMuted, marginTop: 2 }}>
            {formatPhone(member.phone)}
            {memberBatch(member) && (
              <span style={{ fontFamily: font.body }}>{` · ${memberBatch(member)}`}</span>
            )}
          </div>
        </div>
        {already ? (
          <span style={{ ...tapTarget, fontSize: 13, fontWeight: 700, color: color.goodText }}>
            ✓ Already in
          </span>
        ) : (
          <Button onClick={onCheckIn} disabled={busy}>
            {busy ? 'Saving…' : 'Check in'}
          </Button>
        )}
      </Row>
    </div>
  );
}

function RegisterRowView({
  visit,
  name,
  memberId,
  view,
  busy,
  onUndo,
}: {
  visit: Visit;
  name: string;
  memberId: string | null;
  /**
   * Only for a check-in made with the app (review, 15 Oct 2026): the desk never saw this member's
   * plan or balance before they walked in, so an ended plan or money due shows here instead.
   */
  view: MemberView | null;
  busy: boolean;
  onUndo: () => void;
}) {
  const planWarn = view !== null && view.state !== 'active' && view.state !== 'expiring';
  return (
    <Row gap={space.md} wrap={false}>
      <span style={{ fontFamily: font.mono, fontSize: 12, color: color.inkMuted, minWidth: 62 }}>
        {timeLabel(visit)}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        {memberId ? (
          <Link to={`/members/${memberId}`}>
            <span style={{ ...tapTarget, fontSize: 14, color: color.ink }}>{name}</span>
          </Link>
        ) : (
          <span style={{ ...tapTarget, fontSize: 14, color: color.inkMuted }}>{name}</span>
        )}
      </span>
      {view !== null && planWarn && <Pill tone={stateTone(view.state)}>{STATE_LABEL[view.state]}</Pill>}
      {view !== null && view.outstandingP > 0 && (
        <Pill tone="warn">{`${formatINR(view.outstandingP)} due`}</Pill>
      )}
      {visit.atGymId && visit.atGymId !== visit.gymId && <Pill tone="muted">{`At ${visit.atGymName || 'another branch'}`}</Pill>}
      {visitSourceTag(visit.source) && (
        <Pill tone="muted">
          <span title={visit.source === 'app' ? 'Checked in with the MettleUp app' : undefined}>{visitSourceTag(visit.source)}</span>
        </Pill>
      )}
      <Button
        variant="quiet"
        onClick={onUndo}
        disabled={busy}
        ariaLabel={`Undo check-in for ${name}`}
      >
        Undo
      </Button>
    </Row>
  );
}

/**
 * Wall-clock time of a check-in, or a dash when the stored timestamp does not belong
 * to the day it is recorded against — an imported row carries no real time, and
 * printing 5:30 am against it would be inventing data.
 */
function timeLabel(visit: Visit): string {
  // UAT F-13: India time, whatever the PC's time zone.
  if (dateISOFromEpoch(visit.checkedInAt) !== visit.visitedOn) return '—';
  const hour = hourOfEpoch(visit.checkedInAt);
  const minute = minuteOfEpoch(visit.checkedInAt);
  if (hour === null || minute === null) return '—';
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'am' : 'pm'}`;
}

function TrendBars({ days, today }: { days: { day: string; countN: number }[]; today: string }) {
  const peak = days.reduce((max, d) => Math.max(max, d.countN), 0);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 96 }}>
        {days.map((d) => (
          <div
            key={d.day}
            // "today" is marked by a brighter bar; the title carries it in words as
            // well, because colour alone is not a label.
            title={`${formatDay(d.day)}${d.day === today ? ' (today)' : ''}: ${d.countN} ${
              d.countN === 1 ? 'check-in' : 'check-ins'
            }`}
            style={{
              flex: 1,
              minWidth: 0,
              // A zero day still draws a 2px floor, so a closed Sunday reads as a
              // gap in the bar chart rather than as missing data.
              height: peak === 0 ? 2 : Math.max(2, Math.round((d.countN / peak) * 96)),
              background: d.day === today ? color.accentBright : color.accent,
              opacity: d.countN === 0 ? 0.25 : 1,
              borderRadius: 2,
            }}
          />
        ))}
      </div>
      <Row gap={space.sm}>
        <span style={{ fontFamily: font.body, fontSize: 11, color: color.inkMuted }}>
          {formatDay(days[0]?.day ?? today)}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: font.body, fontSize: 11, color: color.inkMuted }}>
          {`Most in a day: ${peak}`}
        </span>
      </Row>
    </div>
  );
}

function HourBars({ hours }: { hours: { hour: number; countN: number }[] }) {
  const peak = hours.reduce((max, h) => Math.max(max, h.countN), 0);
  // Empty hours at either end are dead space on a phone; a gym is not open at 3am.
  const first = hours.findIndex((h) => h.countN > 0);
  const last = hours.length - 1 - [...hours].reverse().findIndex((h) => h.countN > 0);
  const shown = hours.slice(Math.max(0, first), last + 1);

  return (
    <div style={{ display: 'grid', gap: space.xs }}>
      {shown.map((h) => (
        <Row key={h.hour} gap={space.sm} wrap={false}>
          <span
            style={{
              fontFamily: font.body,
              fontSize: 12,
              color: color.inkSecondary,
              minWidth: 82,
              whiteSpace: 'nowrap',
            }}
          >
            {hourLabel(h.hour)}
          </span>
          <span
            aria-hidden
            style={{
              flex: 1,
              height: 8,
              borderRadius: radius.pill,
              background: color.surfaceSunken,
              overflow: 'hidden',
              minWidth: 0,
            }}
          >
            <span
              style={{
                display: 'block',
                width: peak === 0 ? '0%' : `${Math.max(1, Math.round((h.countN / peak) * 100))}%`,
                height: '100%',
                background: color.accent,
              }}
            />
          </span>
          <span style={{ fontFamily: font.mono, fontSize: 12, color: color.ink, minWidth: 32, textAlign: 'right' }}>
            {h.countN}
          </span>
        </Row>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- at risk

function AtRisk({ onToast }: { onToast: (msg: string) => void }) {
  const { snapshot, today } = useCrm();
  const [band, setBand] = useState<RiskBand | 'all'>('all');

  const rows = useMemo(
    () => atRiskList(snapshot.members, snapshot.memberships, snapshot.visits, today),
    [snapshot.members, snapshot.memberships, snapshot.visits, today],
  );

  // An empty list means two completely different things and must not look the same.
  const registerUsed = useMemo(
    () => isRegisterInUse(snapshot.visits, today),
    [snapshot.visits, today],
  );

  const totals = useMemo(() => riskTotals(rows), [rows]);
  const shown = useMemo(() => rows.filter((r) => band === 'all' || r.band === band), [rows, band]);

  const exportCsv = () => {
    // Exports exactly the rows on screen, like both Money exports. A file that
    // quietly contains more than the screen it came from is a file that gets a
    // trainer phoning people the owner filtered out.
    const contents = csvDocument(
      ['Member', 'Mobile', 'Batch', 'Status', 'Last visit', 'Days since visit', 'Visits in last 8 weeks', 'Why'],
      shown.map((r) => [
        r.member.fullName,
        phoneForExport(r.member.phone),
        memberBatch(r.member) ?? '',
        RISK_LABEL[r.band],
        r.profile.lastVisitOn ?? 'Never',
        r.profile.daysSinceVisit ?? '',
        r.profile.visitsInWindowN,
        riskReason(r),
      ]),
    );
    downloadCsv(csvFilename([snapshot.gym.name, 'at-risk', today]), contents);
    onToast(
      shown.length === 1
        ? `Exported ${shown.length} member.`
        : `Exported ${shown.length} members.`,
    );
  };

  if (rows.length === 0) {
    return (
      <Card>
        {registerUsed ? (
          <EmptyState
            title="Everybody is training"
            body="Every member with a running plan is coming as usual."
            action={<Button onClick={() => navigate('/attendance')}>Back to the register</Button>}
          />
        ) : (
          // NOT "everybody is training" — that would be a claim, and this gym has
          // given us no evidence for it either way.
          <EmptyState
            title="Start checking members in"
            body="This list needs a few days of check-ins first. Check members in as they arrive, and it fills in by itself. Nobody is listed just because their visits were never added."
            action={<Button onClick={() => navigate('/attendance')}>Open the register</Button>}
          />
        )}
      </Card>
    );
  }

  return (
    <>
      <Grid min={165}>
        <StatTile
          label="Need a word"
          value={shown.length}
          tone="warn"
          sub={`of ${rows.length} listed`}
        />
        {totals.map((t) => (
          <StatTile
            key={t.band}
            label={RISK_LABEL[t.band]}
            value={t.countN}
            tone={t.countN > 0 ? tileTone(t.band) : undefined}
            sub={BAND_SUB[t.band]}
          />
        ))}
      </Grid>

      <div style={{ height: space.lg }} />

      <Card>
        <SectionTitle
          action={
            <Button variant="ghost" needsInternet onClick={exportCsv} disabled={shown.length === 0}>
              Download Excel file
            </Button>
          }
        >
          Who to talk to
        </SectionTitle>

        <p style={{ margin: `0 0 ${space.md}px`, fontFamily: font.body, fontSize: 13, color: color.inkSecondary }}>
          {/* "Stopped coming" was wrong for a third of this list: a new member who
              has been in twice in three weeks has not stopped, they never started,
              and the heading read absurdly above their "last visit 2 days ago". */}
          Everyone here has weeks left on their plan, but they stopped coming or never really started. Ask about their training, not their plan. Pushing a renewal on them makes them more likely to leave.
        </p>

        <ChipToggle
          label="Filter by what is happening"
          value={band}
          onChange={(v) => setBand(v as RiskBand | 'all')}
          options={[
            { value: 'all', label: 'Everyone', count: rows.length },
            ...totals.map((t) => ({ value: t.band, label: RISK_LABEL[t.band], count: t.countN })),
          ]}
        />

        {shown.length === 0 ? (
          <EmptyState title="Nobody in this group" />
        ) : (
          <div style={{ display: 'grid', gap: space.sm, marginTop: space.md }}>
            {shown.map((row) => (
              <RiskCard key={row.member.id} row={row} today={today} />
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

const BAND_SUB: Record<RiskBand, string> = {
  get settling_in() {
    return 'New, and not coming regularly yet';
  },
  // Not "past their own usual gap": a member with too few visits to have a rhythm
  // is on the fixed fallback and has no gap of their own to be past.
  get slipping() {
    return 'Away longer than they usually are';
  },
  get gone_quiet() {
    return 'Weeks without a visit';
  },
  ok: '',
};

/** A stat tile has no muted tone — an empty band simply reads as ordinary. */
function tileTone(band: RiskBand): 'good' | 'warn' | 'critical' | undefined {
  const tone = BAND_TONE[band];
  return tone === 'muted' ? undefined : tone;
}

function RiskCard({ row, today }: { row: AtRiskRow; today: string }) {
  const { member, profile } = row;
  return (
    <div
      style={{
        border: `1px solid ${color.border}`,
        borderRadius: radius.md,
        padding: space.md,
        background: color.surfaceSunken,
      }}
    >
      <Row gap={space.md} wrap={false}>
        <Avatar text={initials(member.fullName)} size={36} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Link to={`/members/${member.id}`}>
            <span style={{ ...tapTarget, fontSize: 14, fontWeight: 600, color: color.ink }}>
              {member.fullName}
            </span>
          </Link>
          <div style={{ fontFamily: font.body, fontSize: 13, color: color.inkSecondary }}>
            {riskReason(row)}
          </div>
          <Row gap={space.xs}>
            <Pill tone={BAND_TONE[row.band]}>{RISK_LABEL[row.band]}</Pill>
            {profile.usualHour !== null && <Pill tone="muted">{`Usually ${hourLabel(profile.usualHour)}`}</Pill>}
            {profile.lastVisitOn && (
              // "Last visit 3 weeks ago", not "Last in 3 weeks ago" — `relativeDay`
              // already carries the "ago".
              <Pill tone="muted">
                {`Last visit ${relativeDay(profile.lastVisitOn, today)}`}
              </Pill>
            )}
          </Row>
        </div>
        <a
          href={`https://wa.me/${phoneDigits(member.phone)}`}
          target="_blank"
          rel="noreferrer"
          title={`WhatsApp ${formatPhone(member.phone)}`}
          style={{
            fontFamily: font.body,
            fontSize: 12,
            fontWeight: 700,
            color: color.accentBright,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
            minHeight: 44,
            minWidth: 64,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          Message
        </a>
      </Row>
    </div>
  );
}

/** An inline link that is still a comfortable thumb target — the kit's floor is 44. */
const tapTarget: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 44,
  fontFamily: font.body,
};
