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
import { inEnglish, tr } from '../../i18n';
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
  type AtRiskRow,
  type RiskBand,
} from '../../logic/attendance';
import { csvDocument, csvFilename } from '../../logic/csv';
import { addDays, formatDay, formatDayShort, isValidDateISO, relativeDay } from '../../logic/dates';
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

type Tab = 'register' | 'risk';

/** How many search hits to render. A desk types until the right person is on top. */
const MAX_RESULTS = 8;

/** The reporting window under the register. */
const TREND_DAYS = 30;

export function AttendanceScreen({ section }: { section?: string }) {
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
        title={tr('Attendance', 'Hazri')}
        subtitle={
          tab === 'risk'
            ? tr('Paying members who are losing the habit', 'Paise dene wale members jo kaafi din se nahi aaye')
            : tr('Who trained, and when', 'Kaun aaya, kab aaya')
        }
      />

      <div style={{ marginBottom: space.lg }}>
        <ChipToggle
          variant="tabs"
          label={tr('Attendance view', 'Hazri ka view')}
          value={tab}
          onChange={(v) => navigate(v === 'risk' ? '/attendance/risk' : '/attendance')}
          options={[
            { value: 'register', label: tr('Register', 'Register') },
            // The count rides on the chip because the navigation badge that brings
            // people here lands on the Register tab: without it the badge shows a
            // number over a screen that never explains it.
            { value: 'risk', label: tr('Losing the habit', 'Kaafi din se nahi aaye'), count: atRiskN },
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

  // The day is held as a MODE plus a typed date, not as a bare date with the mode
  // derived back out of it. Deriving it made "Another day" a dead chip: clicking it
  // changed no state, so the selection snapped back to Today and the date field it
  // is supposed to reveal could never be reached. Holding the mode also means a tab
  // left open overnight follows the clock on its own — `viewing` recomputes from the
  // new `today` with no effect to keep in step.
  const [mode, setMode] = useState<'today' | 'yesterday' | 'other'>('today');
  const [customDay, setCustomDay] = useState(() => addDays(today, -2));
  const [query, setQuery] = useState('');
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
    return memberViews.filter((v) => matchesQuery(v.member, query));
  }, [memberViews, query]);

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
      setError(e instanceof Error ? e.message : tr('That didn’t work. Please try again.', 'Nahi hua. Phir se try karo.'));
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
      tr(`${view.member.fullName} checked in.`, `${view.member.fullName} ki hazri lag gayi.`),
    );
  };

  return (
    <>
      {error && <ErrorBanner>{error}</ErrorBanner>}

      <Card style={{ marginBottom: space.lg }}>
        <SectionTitle>{tr('Check someone in', 'Hazri lagao')}</SectionTitle>

        <ChipToggle
          label={tr('Day', 'Din')}
          value={mode}
          onChange={(v) => setMode(v as 'today' | 'yesterday' | 'other')}
          options={[
            { value: 'today', label: tr('Today', 'Aaj') },
            { value: 'yesterday', label: tr('Yesterday', 'Beete kal') },
            { value: 'other', label: tr('Another day', 'Koi aur din') },
          ]}
        />

        {mode === 'other' && (
          <TextField
            label={tr('Register date', 'Register ki tareekh')}
            type="date"
            value={customDay}
            onChange={setCustomDay}
            error={
              isValidDateISO(customDay) && customDay > today
                ? tr('That day hasn’t happened yet.', 'Yeh din abhi aaya nahi.')
                : null
            }
            hint={tr('Catching up a day the desk missed. Future days are refused.', 'Chhoota hua din bharne ke liye. Aage ke din nahi chalenge.')}
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
            {tr('Recording for ', '')}
            <strong>{formatDay(viewing)}</strong>
            {tr(' — not today.', ' ki hazri lag rahi hai — aaj ki nahi.')}
          </div>
        )}

        {viewing ? (
          <div style={{ marginTop: space.md }}>
            <SearchField
              value={query}
              onChange={setQuery}
              placeholder={tr('Type a name or the last 4 digits of a mobile', 'Naam ya mobile number ke aakhri 4 ank likho')}
            />
          </div>
        ) : (
          <EmptyState
            title={tr('Pick a day first', 'Pehle din chuno')}
            body={tr(
              'Choose a real day that has already happened, and the check-in box comes back.',
              'Jo din beet chuka hai woh chuno, phir Check-in box wapas aa jayega.',
            )}
          />
        )}

        {viewing && query.trim() && (
          <div style={{ marginTop: space.md, display: 'grid', gap: space.sm }}>
            {results.length === 0 ? (
              <EmptyState
                title={tr('Nobody matches that', 'Koi nahi mila')}
                body={tr(
                  'Check the spelling, or add them to the roster first.',
                  'Spelling check karo, ya pehle unhe members mein jodo.',
                )}
                action={<Button onClick={() => navigate('/members')}>{tr('Open roster', 'Members kholo')}</Button>}
              />
            ) : (
              <>
                {results.slice(0, MAX_RESULTS).map((v) => (
                  <SearchResult
                    key={v.member.id}
                    view={v}
                    already={checkedInOn.has(v.member.id)}
                    busy={busyId === v.member.id}
                    onCheckIn={() => doCheckIn(v)}
                  />
                ))}
                {results.length > MAX_RESULTS && (
                  <div style={{ fontFamily: font.body, fontSize: 12, color: color.inkMuted }}>
                    {tr(
                      `${results.length - MAX_RESULTS} more match — keep typing to narrow it down.`,
                      `${results.length - MAX_RESULTS} aur mile — aur likho taaki list chhoti ho.`,
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </Card>

      <Grid min={165}>
        <StatTile
          label={
            isToday || !viewing
              ? tr('Check-ins today', 'Aaj aaye')
              : tr(`Check-ins on ${formatDayShort(viewing)}`, `${formatDayShort(viewing)} ko aaye`)
          }
          value={viewing ? register.length : todayRegisterN}
          tone="accent"
          sub={isToday || !viewing ? tr('So far today', 'Aaj ab tak') : tr('On that day', 'Us din')}
        />
        <StatTile
          label={tr(`Visits in ${TREND_DAYS} days`, `${TREND_DAYS} din mein hazri`)}
          value={summary.visitsN}
          sub={tr(`${summary.membersN} different members`, `${summary.membersN} alag members`)}
        />
        <StatTile
          label={tr('Check-ins a day', 'Roz ki hazri')}
          value={summary.perDay.toFixed(1)}
          sub={tr(`Average over the last ${TREND_DAYS} days`, `Pichhle ${TREND_DAYS} din ka average`)}
        />
        <StatTile
          label={tr('Busiest hour', 'Sabse bheed ka time')}
          value={summary.busiestHour === null ? '—' : hourLabel(summary.busiestHour)}
          sub={
            summary.busiestHour === null
              ? tr('No timed check-ins yet', 'Abhi time wali hazri nahi')
              : tr(`Over the last ${TREND_DAYS} days`, `Pichhle ${TREND_DAYS} din mein`)
          }
        />
      </Grid>

      <div style={{ height: space.lg }} />

      <Card style={{ marginBottom: space.lg }}>
        <SectionTitle>
          {!viewing
            ? tr('The register', 'Register')
            : isToday
              ? tr('In today', 'Aaj aaye')
              : tr(`In on ${formatDay(viewing)}`, `${formatDay(viewing)} ko aaye`)}
        </SectionTitle>
        {register.length === 0 ? (
          <EmptyState
            title={viewing ? tr('Nobody yet', 'Abhi koi nahi') : tr('No day selected', 'Koi din nahi chuna')}
            body={
              !viewing
                ? tr('Pick a day above to see who trained.', 'Kaun aaya dekhne ke liye upar din chuno.')
                : isToday
                  ? tr('Check-ins appear here the moment you record them.', 'Hazri lagate hi yahan dikhegi.')
                  : tr('No visits were recorded on this day.', 'Is din koi hazri nahi lagi.')
            }
          />
        ) : (
          <div style={{ display: 'grid', gap: space.xs }}>
            {register.map((row) => (
              <RegisterRowView
                key={row.visit.id}
                visit={row.visit}
                name={row.member?.fullName ?? tr('Unknown member', 'Anjaan member')}
                memberId={row.member?.id ?? null}
                busy={busyId === row.visit.memberId}
                onUndo={() =>
                  run(
                    row.visit.memberId,
                    () => undoCheckIn(row.visit.memberId, row.visit.visitedOn),
                    tr(
                      `Check-in removed for ${row.member?.fullName ?? 'that member'}.`,
                      `${row.member?.fullName ?? 'us member'} ki hazri hata di.`,
                    ),
                  )
                }
              />
            ))}
          </div>
        )}
      </Card>

      <Card style={{ marginBottom: space.lg }}>
        <SectionTitle>{tr(`Last ${TREND_DAYS} days`, `Pichhle ${TREND_DAYS} din`)}</SectionTitle>
        <TrendBars days={trend} today={today} />
      </Card>

      <Card>
        <SectionTitle>{tr('When the gym is busy', 'Gym mein bheed kab hoti hai')}</SectionTitle>
        {summary.busiestHour === null ? (
          <EmptyState
            title={tr('No timed check-ins yet', 'Abhi time wali hazri nahi')}
            body={tr(
              'Check-ins recorded here carry the time, so this fills in as the register is used.',
              'Yahan lagi hazri mein time hota hai, toh register chalne ke saath yeh bharta jayega.',
            )}
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
        <Avatar text={initials(member.fullName)} size={36} />
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
            {view.outstandingP > 0 && <Pill tone="warn">{tr(`${formatINR(view.outstandingP)} due`, `${formatINR(view.outstandingP)} baaki`)}</Pill>}
          </Row>
          <div style={{ fontFamily: font.mono, fontSize: 12, color: color.inkMuted, marginTop: 2 }}>
            {formatPhone(member.phone)}
          </div>
        </div>
        {already ? (
          <span style={{ ...tapTarget, fontSize: 13, fontWeight: 700, color: color.goodText }}>
            {tr('✓ Already in', '✓ Aa chuke')}
          </span>
        ) : (
          <Button onClick={onCheckIn} disabled={busy}>
            {busy ? tr('Saving…', 'Save ho raha hai…') : tr('Check in', 'Hazri lagao')}
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
  busy,
  onUndo,
}: {
  visit: Visit;
  name: string;
  memberId: string | null;
  busy: boolean;
  onUndo: () => void;
}) {
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
      {visit.source !== 'desk' && <Pill tone="muted">{visit.source === 'app' ? tr('App', 'App') : tr('Imported', 'Import kiya')}</Pill>}
      <Button
        variant="quiet"
        onClick={onUndo}
        disabled={busy}
        ariaLabel={tr(`Undo check-in for ${name}`, `${name} ki hazri wapas lo`)}
      >
        {tr('Undo', 'Wapas lo')}
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
  const d = new Date(visit.checkedInAt);
  if (Number.isNaN(d.getTime())) return '—';
  const [y, m, day] = visit.visitedOn.split('-').map(Number);
  if (d.getFullYear() !== y || d.getMonth() + 1 !== m || d.getDate() !== day) return '—';
  const hour = d.getHours();
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${String(d.getMinutes()).padStart(2, '0')} ${hour < 12 ? 'am' : 'pm'}`;
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
            title={`${formatDay(d.day)}${d.day === today ? tr(' (today)', ' (aaj)') : ''}: ${d.countN} ${
              d.countN === 1 ? tr('check-in', 'Check-in') : tr('check-ins', 'Check-in')
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
          {tr(`Peak ${peak} in a day`, `Ek din mein sabse zyada ${peak}`)}
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
    // Downloads stay English in every language (an accountant reads them).
    const contents = inEnglish(() => csvDocument(
      ['Member', 'Mobile', 'Status', 'Last visit', 'Days since visit', 'Visits in last 8 weeks', 'Why'],
      shown.map((r) => [
        r.member.fullName,
        phoneForExport(r.member.phone),
        RISK_LABEL[r.band],
        r.profile.lastVisitOn ?? 'Never',
        r.profile.daysSinceVisit ?? '',
        r.profile.visitsInWindowN,
        riskReason(r),
      ]),
    ));
    downloadCsv(csvFilename([snapshot.gym.name, 'at-risk', today]), contents);
    onToast(
      shown.length === 1
        ? tr(`Exported ${shown.length} member.`, `${shown.length} member export ho gaya.`)
        : tr(`Exported ${shown.length} members.`, `${shown.length} members export ho gaye.`),
    );
  };

  if (rows.length === 0) {
    return (
      <Card>
        {registerUsed ? (
          <EmptyState
            title={tr('Everybody is training', 'Sab aa rahe hain')}
            body={tr(
              'No member with a live plan has drifted away from their usual routine.',
              'Chalu Plan wala koi member apni routine se nahi bhatka.',
            )}
            action={<Button onClick={() => navigate('/attendance')}>{tr('Back to the register', 'Register par wapas')}</Button>}
          />
        ) : (
          // NOT "everybody is training" — that would be a claim, and this gym has
          // given us no evidence for it either way.
          <EmptyState
            title={tr('Start checking members in', 'Members ki hazri lagana shuru karo')}
            body={tr(
              'This list needs a few days of the register before it can tell you anything. Check people in as they arrive and it fills itself in — nobody is judged on attendance that was never recorded.',
              'Yeh list kuch din ke register ke baad hi kuch bata payegi. Jaise log aayein hazri lagao, list apne aap bharegi — jo hazri kabhi lagi hi nahi, uspar kisi ko judge nahi kiya jata.',
            )}
            action={<Button onClick={() => navigate('/attendance')}>{tr('Open the register', 'Register kholo')}</Button>}
          />
        )}
      </Card>
    );
  }

  return (
    <>
      <Grid min={165}>
        <StatTile
          label={tr('Need a word', 'Baat karni hai')}
          value={shown.length}
          tone="warn"
          sub={tr(`of ${rows.length} flagged`, `${rows.length} mein se`)}
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
            <Button variant="ghost" onClick={exportCsv} disabled={shown.length === 0}>
              {tr('Export CSV', 'CSV export karo')}
            </Button>
          }
        >
          {tr('Who to talk to', 'Kisse baat karein')}
        </SectionTitle>

        <p style={{ margin: `0 0 ${space.md}px`, fontFamily: font.body, fontSize: 13, color: color.inkSecondary }}>
          {/* "Stopped coming" was wrong for a third of this list: a new member who
              has been in twice in three weeks has not stopped, they never started,
              and the heading read absurdly above their "last visit 2 days ago". */}
          {tr(
            'Everyone here has a plan with weeks left on it — they have stopped coming, or never really started. Ask about their training, not their membership: the evidence says a renewal pitch to someone who has drifted makes them likelier to leave, not less.',
            'Yahan sabka Plan abhi hafton chalega — inhone aana band kar diya, ya kabhi theek se shuru hi nahi kiya. Inse training ki baat karein, membership ki nahi: research kehta hai ki bhatke hue member se Renew ki baat karne se woh chhodne ki taraf aur badhta hai, kam nahi.',
          )}
        </p>

        <ChipToggle
          label={tr('Filter by what is happening', 'Kya ho raha hai, us hisaab se chuno')}
          value={band}
          onChange={(v) => setBand(v as RiskBand | 'all')}
          options={[
            { value: 'all', label: tr('Everyone', 'Sab'), count: rows.length },
            ...totals.map((t) => ({ value: t.band, label: RISK_LABEL[t.band], count: t.countN })),
          ]}
        />

        {shown.length === 0 ? (
          <EmptyState title={tr('Nobody in this group', 'Is group mein koi nahi')} />
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

// Getters, so the words follow the panel's language rather than the one on when this loaded.
const BAND_SUB: Record<RiskBand, string> = {
  get settling_in() {
    return tr('New, and the habit hasn’t formed', 'Naye hain, aadat nahi bani');
  },
  // Not "past their own usual gap": a member with too few visits to have a rhythm
  // is on the fixed fallback and has no gap of their own to be past.
  get slipping() {
    return tr('Away longer than they usually are', 'Aam taur se zyada din se nahi aaye');
  },
  get gone_quiet() {
    return tr('Weeks without a visit', 'Hafton se nahi aaye');
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
            {profile.usualHour !== null && <Pill tone="muted">{tr(`Usually ${hourLabel(profile.usualHour)}`, `Aksar ${hourLabel(profile.usualHour)}`)}</Pill>}
            {profile.lastVisitOn && (
              // "Last visit 3 weeks ago", not "Last in 3 weeks ago" — `relativeDay`
              // already carries the "ago".
              <Pill tone="muted">
                {tr(
                  `Last visit ${relativeDay(profile.lastVisitOn, today)}`,
                  `Pichhli baar ${relativeDay(profile.lastVisitOn, today)}`,
                )}
              </Pill>
            )}
          </Row>
        </div>
        <a
          href={`https://wa.me/${phoneDigits(member.phone)}`}
          target="_blank"
          rel="noreferrer"
          title={tr(`WhatsApp ${formatPhone(member.phone)}`, `WhatsApp ${formatPhone(member.phone)}`)}
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
          {tr('Message', 'Message karo')}
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
