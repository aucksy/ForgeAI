/**
 * F105 "Trainer profiles and schedules" (plan docs/plans/F105-trainer-profiles.md): More -> Trainers (/trainers)
 * and one trainer's page (/trainers/<staff id>).
 *
 *  - The trainers: photo, what they teach, today's hours, how many personal-training members.
 *  - "Personal training this week": the week's days with how many bookings, and the chosen day's time grid (one
 *    column per trainer, half-hour rows: booked / free / not working). Tap a free slot to book; tap a booking to
 *    see it or cancel it.
 *  - A trainer's page: working hours, personal-training members with classes left, this week's bookings, Edit.
 *
 * NOT LIVE: needs supabase/migrations/0065 (NOT APPLIED). Until then the screen says plainly "Trainer pages are
 * not ready for your gym yet", and nothing is saved or pretended. Rules and words: logic/trainerSchedule.ts.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import { ptLeftRunning } from '../../logic/pt';
import { initials } from '../../logic/members';
import { addDays, formatDayShort, type DateISO } from '../../logic/dates';
import {
  DEFAULT_LENGTH,
  LENGTHS,
  SLOT_MIN,
  DAY_FIRST_MIN,
  DAY_LAST_MIN,
  TRAINER_WORDS,
  WEEKDAYS,
  bookedWords,
  bookingStarted,
  bookingsWords,
  canCancel,
  canEditProfile,
  checkBooking,
  classesLeftWords,
  countsByDay,
  dayChip,
  dayGrid,
  dayName,
  formFromHours,
  hoursDifferByDay,
  hoursFromForm,
  hoursLine,
  indiaMinutes,
  inputFromMinutes,
  isoWeekday,
  mondayOf,
  rangeWords,
  scheduleErrorWords,
  timeWords,
  trainerPtMembers,
  weekDays,
  type PtBooking,
  type ScheduleLoad,
  type TrainerProfile,
  type TrainerSchedule,
  type Weekday,
} from '../../logic/trainerSchedule';
import { errorWords } from '../../shop/logic';
import * as api from '../../shop/trainerScheduleApi';
import { useCrm } from '../../store';
import type { Member, Membership } from '../../types';
import { shrinkPickedFile } from '../deskPhotoImage';
import { Avatar, Button, Card, ChipToggle, EmptyState, ErrorBanner, PageHeader, Pill, SearchField, SectionTitle, SelectField, Sheet, TextField, Toast, color, font, space } from '../kit';
import { navigate } from '../router';
import { useEntryKey } from '../useEntryMachines';

const quiet = { margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary } as const;
const small = { ...quiet, fontSize: 13, color: color.inkMuted } as const;

function failWords(e: unknown, trainerName?: string): string {
  return scheduleErrorWords(e, trainerName) ?? errorWords(e);
}

function useToast(): [string | null, (m: string) => void] {
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(t);
  }, [toast]);
  return [toast, setToast];
}

/** India minutes now, read again every minute while the screen is open. */
function useNowMin(): number {
  const [now, setNow] = useState(() => indiaMinutes(Date.now()));
  useEffect(() => {
    const t = window.setInterval(() => setNow(indiaMinutes(Date.now())), 60_000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

function newRequestId(): string {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return `pt-${[...a].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

function blobToBase64(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => reject(r.error ?? new Error('read failed'));
    r.readAsDataURL(b);
  });
}

function TrainerPhoto({ trainer, size }: { trainer: Pick<TrainerProfile, 'name' | 'photo'>; size: number }) {
  if (!trainer.photo) return <Avatar text={initials(trainer.name)} size={size} />;
  return (
    <img
      src={`data:image/jpeg;base64,${trainer.photo}`}
      alt=""
      aria-hidden
      width={size}
      height={size}
      style={{ width: size, height: size, borderRadius: 999, objectFit: 'cover', flexShrink: 0, border: `1px solid ${color.border}` }}
    />
  );
}

// ---------------------------------------------------------------- the data

function useSchedule(week: DateISO): { load: ScheduleLoad; key: string | null; reload: () => Promise<void> } {
  const key = useEntryKey();
  const [load, setLoad] = useState<ScheduleLoad>({ state: 'loading' });
  const seq = useRef(0);
  const reload = useCallback(async () => {
    if (!key) return setLoad({ state: 'off' });
    const n = ++seq.current;
    try {
      const r = await api.getTrainerSchedule(key, week);
      if (n !== seq.current) return;
      setLoad(r === 'missing' ? { state: 'missing' } : { state: 'ready', schedule: r });
    } catch (e) {
      console.warn('[ForgeErr] trainers: reading the week', e);
      if (n !== seq.current) return;
      setLoad((old) => (old.state === 'ready' ? old : { state: 'error', message: failWords(e) }));
    }
  }, [key, week]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { load: key ? load : { state: 'off' }, key, reload };
}

interface MemberInfo {
  id: string;
  name: string;
  left: number;
  booked: number;
}

function useMemberInfo(schedule: TrainerSchedule | null): { info: MemberInfo[]; nameOf: (id: string) => string; byId: Map<string, MemberInfo> } {
  const { snapshot, today } = useCrm();
  return useMemo(() => {
    const byMember = new Map<string, Membership[]>();
    for (const m of snapshot.memberships) {
      const l = byMember.get(m.memberId) ?? [];
      l.push(m);
      byMember.set(m.memberId, l);
    }
    const info: MemberInfo[] = snapshot.members
      .filter((m: Member) => !m.archived)
      .map((m) => ({ id: m.id, name: m.fullName, left: ptLeftRunning(byMember.get(m.id) ?? [], today), booked: schedule?.ahead[m.id] ?? 0 }));
    const byId = new Map(info.map((i) => [i.id, i]));
    const names = new Map(snapshot.members.map((m) => [m.id, m.fullName]));
    return { info, byId, nameOf: (id: string) => names.get(id) ?? 'A member' };
  }, [snapshot.members, snapshot.memberships, today, schedule]);
}

// ---------------------------------------------------------------- the screen

export function TrainersScreen({ trainerId }: { trainerId?: string }) {
  const { today } = useCrm();
  const [week, setWeek] = useState<DateISO>(() => mondayOf(today));
  const { load, key, reload } = useSchedule(week);
  const [toast, setToast] = useToast();

  const header = (
    <PageHeader
      title={TRAINER_WORDS.title}
      subtitle={TRAINER_WORDS.subtitle}
      actions={
        trainerId ? (
          <Button variant="ghost" onClick={() => navigate('/trainers')}>
            All trainers
          </Button>
        ) : undefined
      }
    />
  );

  if (load.state !== 'ready') {
    const msg =
      load.state === 'off'
        ? { id: 'trainers-off', title: TRAINER_WORDS.offTitle, body: TRAINER_WORDS.offBody, retry: false }
        : load.state === 'missing'
          ? { id: 'trainers-not-ready', title: TRAINER_WORDS.missingTitle, body: TRAINER_WORDS.missingBody, retry: false }
          : load.state === 'error'
            ? { id: 'trainers-error', title: TRAINER_WORDS.errorTitle, body: load.message, retry: true }
            : null;
    return (
      <>
        {header}
        {msg ? (
          <Card>
            <div data-testid={msg.id}>
              <EmptyState
                title={msg.title}
                body={msg.body}
                action={
                  msg.retry ? (
                    <Button variant="ghost" onClick={() => void reload()}>
                      Try again
                    </Button>
                  ) : undefined
                }
              />
            </div>
          </Card>
        ) : (
          <p style={quiet}>Loading…</p>
        )}
      </>
    );
  }

  const s = load.schedule;
  if (s.trainers.length === 0) {
    return (
      <>
        {header}
        <Card>
          <div data-testid="trainers-empty">
            <EmptyState
              title={TRAINER_WORDS.noTrainersTitle}
              body={s.owner ? TRAINER_WORDS.noTrainersOwner : TRAINER_WORDS.noTrainersStaff}
              action={
                s.owner ? (
                  <Button variant="ghost" onClick={() => navigate('/settings/people')}>
                    Open Staff & sign-in
                  </Button>
                ) : undefined
              }
            />
          </div>
        </Card>
      </>
    );
  }

  const trainer = trainerId ? s.trainers.find((t) => t.id === trainerId) : undefined;
  return (
    <>
      {trainerId && !trainer ? (
        <>
          {header}
          <Card>
            <EmptyState title="This trainer is not on your list any more" body="The owner may have taken off their Trainer tick." />
          </Card>
        </>
      ) : trainer ? (
        <TrainerPage schedule={s} trainer={trainer} ownerKey={key!} week={week} setWeek={setWeek} reload={reload} toast={setToast} />
      ) : (
        <>
          {header}
          <TrainerList schedule={s} />
          <WeekCalendar schedule={s} ownerKey={key!} week={week} setWeek={setWeek} reload={reload} toast={setToast} />
        </>
      )}
      {toast && <Toast message={toast} />}
    </>
  );
}

function TrainerList({ schedule }: { schedule: TrainerSchedule }) {
  const { snapshot, today } = useCrm();
  const wd = isoWeekday(today);
  return (
    <div style={{ display: 'grid', gap: space.md, marginBottom: space.xl, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
      {schedule.trainers.map((t) => {
        const n = trainerPtMembers(t, snapshot.members, snapshot.memberships, schedule.assigned, schedule.ahead, today).length;
        return (
          <Card key={t.id}>
            <div data-testid="trainer-card" style={{ display: 'flex', gap: space.md, alignItems: 'flex-start' }}>
              <TrainerPhoto trainer={t} size={56} />
              <div style={{ minWidth: 0, display: 'grid', gap: 4, flex: 1 }}>
                <span style={{ fontFamily: font.display, fontSize: 17, fontWeight: 700, color: color.ink, overflowWrap: 'anywhere' }}>{t.name}</span>
                <p style={quiet}>{t.teaches ? `Teaches: ${t.teaches}` : 'What they teach is not added yet'}</p>
                <p style={small}>{`Today: ${hoursLine(t.hours, wd)}`}</p>
                <p style={small}>{n === 1 ? '1 personal-training member' : `${n} personal-training members`}</p>
                <div style={{ marginTop: space.sm }}>
                  <Button variant="ghost" ariaLabel={`Open ${t.name}’s page`} onClick={() => navigate(`/trainers/${encodeURIComponent(t.id)}`)}>
                    Open page
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- the week

interface WeekProps {
  schedule: TrainerSchedule;
  ownerKey: string;
  week: DateISO;
  setWeek: (w: DateISO) => void;
  reload: () => Promise<void>;
  toast: (m: string) => void;
}

function WeekNav({ week, setWeek, title }: { week: DateISO; setWeek: (w: DateISO) => void; title: string }) {
  const { today } = useCrm();
  const thisWeek = mondayOf(today);
  return (
    <>
      <SectionTitle>{week === thisWeek ? title : `${title.replace(/ this week$/, '')}, week of ${formatDayShort(week)}`}</SectionTitle>
      <div style={{ display: 'flex', gap: space.sm, flexWrap: 'wrap', marginBottom: space.md }}>
        <Button variant="ghost" onClick={() => setWeek(addDays(week, -7))}>
          Last week
        </Button>
        {week !== thisWeek && (
          <Button variant="ghost" onClick={() => setWeek(thisWeek)}>
            This week
          </Button>
        )}
        <Button variant="ghost" onClick={() => setWeek(addDays(week, 7))}>
          Next week
        </Button>
      </div>
    </>
  );
}

type BookStart = { trainerId: string; day: DateISO; start: number };

const OFF_CELL = { padding: '4px 8px', background: color.surfaceSunken, color: color.inkFaint, fontSize: 12 } as const;
const PAST_CELL = {
  padding: 0,
  background: `repeating-linear-gradient(135deg, transparent 0 6px, ${color.grid} 6px 8px)`,
} as const;

/** What the grid's cells mean: Free / Booked / Off (not working) / Already over. */
function GridKey() {
  const item = (swatch: CSSProperties, word: string, text?: string) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span
        aria-hidden
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 20, borderRadius: 4,
          border: `1px solid ${color.border}`, fontSize: 11, ...swatch, padding: 0,
        }}
      >
        {text}
      </span>
      {word}
    </span>
  );
  return (
    <div
      data-testid="pt-key"
      style={{ display: 'flex', flexWrap: 'wrap', gap: `${space.xs}px ${space.md}px`, marginTop: space.sm, fontFamily: font.body, fontSize: 12, color: color.inkMuted }}
    >
      {item({ color: color.goodText }, 'Free to book', 'Free')}
      {item({ background: color.accentSoft }, 'Booked')}
      {item(OFF_CELL, 'Not working', 'Off')}
      {item(PAST_CELL, 'Already over')}
    </div>
  );
}

function WeekCalendar({ schedule, ownerKey, week, setWeek, reload, toast }: WeekProps) {
  const { today } = useCrm();
  const nowMin = useNowMin();
  const days = weekDays(week);
  const counts = countsByDay(days, schedule.bookings);
  const [day, setDay] = useState<DateISO>(() => (days.includes(today) ? today : days[0]!));
  useEffect(() => {
    if (!days.includes(day)) setDay(days.includes(today) ? today : days[0]!);
  }, [week]);
  const [booking, setBooking] = useState<BookStart | null>(null);
  const [open, setOpen] = useState<PtBooking | null>(null);
  const { nameOf } = useMemberInfo(schedule);
  const rows = dayGrid(day, schedule.trainers, schedule.bookings, today, nowMin);
  // A new sheet hides the last "Booked: ..." note, which would otherwise sit over the sheet's own words.
  const openBook = (b: BookStart) => {
    toast('');
    setBooking(b);
  };
  const openBooking = (b: PtBooking) => {
    toast('');
    setOpen(b);
  };

  return (
    <Card>
      <WeekNav week={week} setWeek={setWeek} title={TRAINER_WORDS.weekTitle} />
      {/* All seven days wrap onto lines on a phone: none is cut at the edge or hidden off-screen. */}
      <div data-testid="pt-days">
        <ChipToggle
          wrap
          label="Pick a day"
          value={day}
          onChange={(v) => setDay(v as DateISO)}
          options={days.map((d, i) => ({ value: d, label: dayChip(d), count: counts[i] || undefined }))}
        />
      </div>
      <p style={{ ...small, margin: `${space.sm}px 0` }}>{`${dayName(isoWeekday(day))}: ${bookingsWords(counts[days.indexOf(day)] ?? 0)}. Tap a free time to book.`}</p>
      <div data-testid="pt-grid" style={{ overflowX: 'auto', maxWidth: '100%', border: `1px solid ${color.border}`, borderRadius: 10 }}>
        <table style={{ borderCollapse: 'collapse', fontFamily: font.body, fontSize: 13, minWidth: 80 + schedule.trainers.length * 128 }}>
          <thead>
            <tr>
              <th style={{ position: 'sticky', left: 0, background: color.surface, padding: 8, textAlign: 'left', color: color.inkMuted, fontWeight: 600, width: 80 }}>Time</th>
              {schedule.trainers.map((t) => (
                <th key={t.id} style={{ padding: 8, textAlign: 'left', color: color.ink, fontWeight: 700, minWidth: 120 }}>
                  {t.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.min} style={{ borderTop: `1px solid ${color.grid}` }}>
                <td style={{ position: 'sticky', left: 0, background: color.surface, padding: '4px 8px', color: r.cells.every((c) => c.kind === 'past') ? color.inkFaint : color.inkMuted, whiteSpace: 'nowrap' }}>{timeWords(r.min)}</td>
                {r.cells.map((c, i) => {
                  const t = schedule.trainers[i]!;
                  if (c.kind === 'booked') {
                    return (
                      <td key={t.id} style={{ padding: 2, background: color.accentSoft }}>
                        {c.first ? (
                          <button
                            type="button"
                            onClick={() => openBooking(c.booking)}
                            aria-label={`${nameOf(c.booking.memberId)} with ${t.name}, ${rangeWords(c.booking.start, c.booking.length)}`}
                            style={{ all: 'unset', cursor: 'pointer', display: 'block', minHeight: 36, padding: '4px 6px', color: color.accentBright, fontWeight: 700, overflowWrap: 'anywhere' }}
                          >
                            {nameOf(c.booking.memberId)}
                          </button>
                        ) : null}
                      </td>
                    );
                  }
                  if (c.kind === 'past') return <td key={t.id} style={PAST_CELL} aria-label="Already over" />;
                  if (c.kind === 'off') {
                    return (
                      <td key={t.id} style={OFF_CELL} aria-label="Not working">
                        Off
                      </td>
                    );
                  }
                  return (
                    <td key={t.id} style={{ padding: 2 }}>
                      <button
                        type="button"
                        onClick={() => openBook({ trainerId: t.id, day, start: r.min })}
                        aria-label={`Book ${t.name} at ${timeWords(r.min)}`}
                        style={{ all: 'unset', cursor: 'pointer', display: 'block', minHeight: 36, padding: '4px 6px', color: color.goodText }}
                      >
                        Free
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <GridKey />
      <div style={{ marginTop: space.md }}>
        <Button needsInternet onClick={() => openBook({ trainerId: schedule.trainers[0]!.id, day: day >= today ? day : today, start: -1 })}>
          Book personal training
        </Button>
      </div>
      {booking && (
        <BookSheet
          schedule={schedule}
          ownerKey={ownerKey}
          start={booking}
          days={days}
          onClose={() => setBooking(null)}
          onBooked={async (words) => {
            setBooking(null);
            toast(words);
            await reload();
          }}
        />
      )}
      {open && (
        <BookingSheet
          schedule={schedule}
          ownerKey={ownerKey}
          booking={open}
          onClose={() => setOpen(null)}
          onCancelled={async () => {
            setOpen(null);
            toast('Booking cancelled.');
            await reload();
          }}
        />
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- book

/** Shift times in the app's "6:00 am" words, every half hour from 5 am to 11 pm; "Not set" leaves a shift empty. */
const SHIFT_TIMES: { value: string; label: string }[] = [
  { value: '', label: 'Not set' },
  ...Array.from({ length: (DAY_LAST_MIN - DAY_FIRST_MIN) / SLOT_MIN + 1 }, (_, i) => DAY_FIRST_MIN + i * SLOT_MIN).map((m) => ({
    value: inputFromMinutes(m),
    label: timeWords(m),
  })),
];

function timeOptions(): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  for (let m = DAY_FIRST_MIN; m + 30 <= DAY_LAST_MIN; m += SLOT_MIN) out.push({ value: String(m), label: timeWords(m) });
  return out;
}

function BookSheet({
  schedule,
  ownerKey,
  start,
  days,
  onClose,
  onBooked,
}: {
  schedule: TrainerSchedule;
  ownerKey: string;
  start: BookStart;
  days: readonly DateISO[];
  onClose: () => void;
  onBooked: (words: string) => Promise<void>;
}) {
  const { today } = useCrm();
  const nowMin = useNowMin();
  const { info, nameOf } = useMemberInfo(schedule);
  const [trainerId, setTrainerId] = useState(start.trainerId);
  const bookable = days.filter((d) => d >= today);
  const [day, setDay] = useState<DateISO>(bookable.includes(start.day) ? start.day : (bookable[0] ?? start.day));
  const [startMin, setStartMin] = useState<number>(start.start >= 0 ? start.start : -1);
  const [length, setLength] = useState<number>(DEFAULT_LENGTH);
  const [query, setQuery] = useState('');
  const [memberId, setMemberId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [warnOutside, setWarnOutside] = useState(false);
  const [busy, setBusy] = useState(false);
  const requestId = useMemo(newRequestId, []);
  const trainer = schedule.trainers.find((t) => t.id === trainerId) ?? schedule.trainers[0]!;
  const member = memberId ? info.find((m) => m.id === memberId) ?? null : null;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? info.filter((m) => m.name.toLowerCase().includes(q)) : info.filter((m) => m.left > 0);
    return [...list].sort((a, b) => Number(b.left > 0) - Number(a.left > 0) || a.name.localeCompare(b.name)).slice(0, 8);
  }, [info, query]);

  const reset = () => {
    setProblem(null);
    setWarnOutside(false);
  };

  const book = async (outsideOk: boolean) => {
    if (busy) return;
    if (!member) return setProblem('Pick the member first.');
    if (startMin < 0) return setProblem('Pick a start time.');
    const c = checkBooking(
      { trainer, memberId: member.id, memberName: member.name, day, start: startMin, length, left: member.left, booked: member.booked },
      schedule.bookings,
      nameOf,
      today,
      nowMin,
    );
    if (!c.ok) return setProblem(c.words);
    if (c.outsideHours && !outsideOk) {
      setProblem(null);
      return setWarnOutside(true);
    }
    setBusy(true);
    setProblem(null);
    try {
      await api.bookPt(ownerKey, { trainerId: trainer.id, memberId: member.id, day, start: startMin, length, outsideOk, requestId });
      await onBooked(TRAINER_WORDS.booked(member.name, trainer.name, day, startMin, length));
    } catch (e) {
      console.warn('[ForgeErr] trainers: booking', e);
      if (/\bOUTSIDE_HOURS\b/.test(String((e as { message?: unknown })?.message ?? e))) setWarnOutside(true);
      else setProblem(failWords(e, trainer.name));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      title="Book personal training"
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', gap: space.sm, flexWrap: 'wrap' }}>
          {warnOutside ? (
            <Button needsInternet disabled={busy} onClick={() => book(true)}>
              {busy ? 'Booking…' : 'Book anyway'}
            </Button>
          ) : (
            <Button needsInternet disabled={busy} onClick={() => book(false)}>
              {busy ? 'Booking…' : 'Book'}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      }
    >
      <SectionTitle>Member</SectionTitle>
      {member ? (
        <div data-testid="book-member" style={{ display: 'flex', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: font.body, fontWeight: 700, color: color.ink }}>{member.name}</span>
          <Pill tone={member.left > 0 ? 'good' : 'critical'}>{classesLeftWords(member.left)}</Pill>
          {member.booked > 0 && <span style={small}>{bookedWords(member.booked)}</span>}
          <Button
            variant="quiet"
            onClick={() => {
              setMemberId(null);
              reset();
            }}
          >
            Change member
          </Button>
        </div>
      ) : (
        <>
          <SearchField value={query} onChange={setQuery} placeholder="Search name" label="Search member name" />
          <div role="list" style={{ display: 'grid', gap: 4, marginTop: space.sm }}>
            {matches.length === 0 && <p style={small}>{query.trim() ? 'No member with this name.' : 'No member has personal-training classes left. Search by name to find anyone.'}</p>}
            {matches.map((m) => (
              <div role="listitem" key={m.id}>
                <button
                  type="button"
                  onClick={() => {
                    setMemberId(m.id);
                    reset();
                  }}
                  style={{
                    all: 'unset', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: space.sm, flexWrap: 'wrap',
                    width: '100%', boxSizing: 'border-box', minHeight: 44, padding: '8px 10px', borderRadius: 8, border: `1px solid ${color.border}`,
                    fontFamily: font.body, fontSize: 14, color: color.ink,
                  }}
                >
                  <span style={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{m.name}</span>
                  <span style={{ color: m.left > 0 ? color.goodText : color.criticalText }}>{classesLeftWords(m.left)}</span>
                </button>
              </div>
            ))}
          </div>
        </>
      )}
      <SelectField
        label="Trainer"
        value={trainer.id}
        onChange={(v) => {
          setTrainerId(v);
          reset();
        }}
        options={schedule.trainers.map((t) => ({ value: t.id, label: t.name }))}
      />
      <SelectField
        label="Day"
        value={day}
        onChange={(v) => {
          setDay(v as DateISO);
          reset();
        }}
        options={(bookable.length ? bookable : [day]).map((d) => ({ value: d, label: dayChip(d) }))}
      />
      <SelectField
        label="Start time"
        value={String(startMin)}
        onChange={(v) => {
          setStartMin(Number(v));
          reset();
        }}
        options={[...(startMin < 0 ? [{ value: '-1', label: 'Pick a time' }] : []), ...timeOptions()]}
      />
      <SelectField
        label="How long"
        value={String(length)}
        onChange={(v) => {
          setLength(Number(v));
          reset();
        }}
        options={LENGTHS.map((l) => ({ value: String(l), label: `${l} minutes` }))}
      />
      <p style={{ ...small, marginTop: space.sm }}>{`${trainer.name}, ${dayName(isoWeekday(day))}: ${hoursLine(trainer.hours, isoWeekday(day))}`}</p>
      {warnOutside && (
        <div data-testid="book-outside" style={{ marginTop: space.md }}>
          <ErrorBanner>{`${TRAINER_WORDS.outside(trainer.name)} Press "Book anyway" if ${trainer.name} agreed.`}</ErrorBanner>
        </div>
      )}
      {problem && (
        <div data-testid="book-problem" style={{ marginTop: space.md }}>
          <ErrorBanner>{problem}</ErrorBanner>
        </div>
      )}
      <p style={{ ...small, marginTop: space.md }}>Booking does not use up a class. Tap "Mark session" on the member’s page when they come.</p>
    </Sheet>
  );
}

function BookingSheet({
  schedule,
  ownerKey,
  booking,
  onClose,
  onCancelled,
}: {
  schedule: TrainerSchedule;
  ownerKey: string;
  booking: PtBooking;
  onClose: () => void;
  onCancelled: () => Promise<void>;
}) {
  const { today } = useCrm();
  const nowMin = useNowMin();
  const { nameOf, byId } = useMemberInfo(schedule);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const trainer = schedule.trainers.find((t) => t.id === booking.trainerId);
  const name = nameOf(booking.memberId);
  const info = byId.get(booking.memberId);
  const mayCancel = canCancel(schedule.owner, booking, today, nowMin);

  const cancel = async () => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      await api.cancelPt(ownerKey, booking.id);
      await onCancelled();
    } catch (e) {
      console.warn('[ForgeErr] trainers: cancelling', e);
      setProblem(failWords(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      title={`${name} with ${trainer?.name ?? 'a trainer'}`}
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', gap: space.sm, flexWrap: 'wrap' }}>
          {mayCancel && (
            <Button tone="danger" variant="ghost" needsInternet disabled={busy} onClick={cancel}>
              {busy ? 'Cancelling…' : 'Cancel booking'}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <div data-testid="booking-detail" style={{ display: 'grid', gap: space.xs }}>
        <p style={quiet}>{`${dayChip(booking.day)}, ${rangeWords(booking.start, booking.length)}`}</p>
        {info && <p style={quiet}>{classesLeftWords(info.left)}</p>}
        {booking.byName && <p style={small}>{`Booked by ${booking.byName}`}</p>}
        {!mayCancel && <p style={small}>This booking has started, so only the gym owner can cancel it.</p>}
        {bookingStarted(booking, today, nowMin) && <p style={small}>Did they come? Tap "Mark session" on the member’s page.</p>}
        <div style={{ marginTop: space.sm }}>
          <Button variant="ghost" onClick={() => navigate(`/members/${encodeURIComponent(booking.memberId)}`)}>
            Open member
          </Button>
        </div>
      </div>
      {problem && <ErrorBanner>{problem}</ErrorBanner>}
    </Sheet>
  );
}

// ---------------------------------------------------------------- a trainer's page

function TrainerPage({ schedule, trainer, ownerKey, week, setWeek, reload, toast }: WeekProps & { trainer: TrainerProfile }) {
  const { snapshot, today } = useCrm();
  const nowMin = useNowMin();
  const [editing, setEditing] = useState(false);
  const [booking, setBooking] = useState<BookStart | null>(null);
  const [open, setOpen] = useState<PtBooking | null>(null);
  const { nameOf } = useMemberInfo(schedule);
  const members = trainerPtMembers(trainer, snapshot.members, snapshot.memberships, schedule.assigned, schedule.ahead, today);
  const mine = schedule.bookings.filter((b) => b.trainerId === trainer.id);
  const mayEdit = canEditProfile(schedule, trainer.id);
  const days = weekDays(week);

  return (
    <>
      <PageHeader
        title={trainer.name}
        subtitle="Trainer"
        actions={
          <Button variant="ghost" onClick={() => navigate('/trainers')}>
            All trainers
          </Button>
        }
      />
      <Card style={{ marginBottom: space.lg }}>
        <div data-testid="trainer-profile" style={{ display: 'flex', gap: space.lg, alignItems: 'center', flexWrap: 'wrap' }}>
          <TrainerPhoto trainer={trainer} size={88} />
          <div style={{ display: 'grid', gap: space.xs, minWidth: 0, flex: 1 }}>
            <p style={quiet}>{trainer.teaches ? `Teaches: ${trainer.teaches}` : 'What they teach is not added yet'}</p>
            {mayEdit && (
              <div>
                <Button
                  variant="ghost"
                  needsInternet
                  onClick={() => {
                    toast('');
                    setEditing(true);
                  }}
                >
                  Edit page
                </Button>
              </div>
            )}
          </div>
        </div>
      </Card>

      <Card style={{ marginBottom: space.lg }}>
        <SectionTitle>Working hours</SectionTitle>
        {/* One row per day: the day on the left, its times on the right (wrapping inside their own column), a line between days. */}
        <div data-testid="trainer-hours" style={{ display: 'grid' }}>
          {WEEKDAYS.map((d, i) => (
            <div
              key={d}
              style={{
                display: 'grid', gridTemplateColumns: '96px minmax(0, 1fr)', gap: space.sm, alignItems: 'baseline', padding: '8px 0',
                borderTop: i === 0 ? 'none' : `1px solid ${color.grid}`, fontFamily: font.body, fontSize: 14,
              }}
            >
              <span style={{ color: color.ink, fontWeight: 700 }}>{dayName(d)}</span>
              <span style={{ color: color.inkSecondary, textAlign: 'right', overflowWrap: 'anywhere' }}>{hoursLine(trainer.hours, d)}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card style={{ marginBottom: space.lg }}>
        <SectionTitle>Personal-training members</SectionTitle>
        <div data-testid="trainer-members" style={{ display: 'grid', gap: 6 }}>
          {members.length === 0 && <p style={small}>{TRAINER_WORDS.noMembers}</p>}
          {members.map((m) => (
            <div key={m.memberId} style={{ display: 'flex', justifyContent: 'space-between', gap: space.sm, flexWrap: 'wrap', alignItems: 'center' }}>
              <a href={`#/members/${encodeURIComponent(m.memberId)}`} style={{ fontFamily: font.body, fontSize: 14, fontWeight: 700, color: color.ink, overflowWrap: 'anywhere' }}>
                {m.name}
              </a>
              <span style={{ fontFamily: font.body, fontSize: 13, color: m.left > 0 ? color.inkSecondary : color.criticalText }}>
                {[classesLeftWords(m.left), bookedWords(m.booked)].filter(Boolean).join(' · ')}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <WeekNav week={week} setWeek={setWeek} title="Bookings this week" />
        <div data-testid="trainer-bookings" style={{ display: 'grid', gap: 6 }}>
          {mine.length === 0 && <p style={small}>No bookings this week.</p>}
          {mine.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => {
                toast('');
                setOpen(b);
              }}
              style={{
                all: 'unset', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', alignContent: 'center', gap: space.sm, flexWrap: 'wrap',
                boxSizing: 'border-box', width: '100%', minHeight: 44, padding: '6px 10px', borderRadius: 8, border: `1px solid ${color.border}`, fontFamily: font.body, fontSize: 14,
                color: bookingStarted(b, today, nowMin) ? color.inkMuted : color.ink,
              }}
            >
              <span style={{ fontWeight: 700 }}>{`${dayChip(b.day)}, ${rangeWords(b.start, b.length)}`}</span>
              <span style={{ overflowWrap: 'anywhere' }}>{nameOf(b.memberId)}</span>
            </button>
          ))}
        </div>
        <div style={{ marginTop: space.md }}>
          <Button
            needsInternet
            onClick={() => {
              toast('');
              setBooking({ trainerId: trainer.id, day: days.includes(today) ? today : days[0]!, start: -1 });
            }}
          >
            {`Book with ${trainer.name}`}
          </Button>
        </div>
      </Card>

      {editing && (
        <EditTrainerSheet
          trainer={trainer}
          ownerKey={ownerKey}
          onClose={() => setEditing(false)}
          onSaved={async () => {
            setEditing(false);
            toast(`Saved ${trainer.name}’s page.`);
            await reload();
          }}
        />
      )}
      {booking && (
        <BookSheet
          schedule={schedule}
          ownerKey={ownerKey}
          start={booking}
          days={days}
          onClose={() => setBooking(null)}
          onBooked={async (words) => {
            setBooking(null);
            toast(words);
            await reload();
          }}
        />
      )}
      {open && (
        <BookingSheet
          schedule={schedule}
          ownerKey={ownerKey}
          booking={open}
          onClose={() => setOpen(null)}
          onCancelled={async () => {
            setOpen(null);
            toast('Booking cancelled.');
            await reload();
          }}
        />
      )}
    </>
  );
}

function EditTrainerSheet({
  trainer,
  ownerKey,
  onClose,
  onSaved,
}: {
  trainer: TrainerProfile;
  ownerKey: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const start = useMemo(() => formFromHours(trainer.hours), [trainer.hours]);
  const [teaches, setTeaches] = useState(trainer.teaches ?? '');
  const [days, setDays] = useState<Weekday[]>(start.days);
  const [shifts, setShifts] = useState(start.shifts);
  /** undefined: keep the photo; null: remove it; a string: the new one. */
  const [photo, setPhoto] = useState<string | null | undefined>(undefined);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const shown = photo === undefined ? trainer.photo : photo;

  const pick = async (f: File | undefined) => {
    if (!f) return;
    try {
      setPhoto(await blobToBase64(await shrinkPickedFile(f)));
      setProblem(null);
    } catch (e) {
      console.warn('[ForgeErr] trainers: photo', e);
      setProblem(e instanceof Error && e.message ? e.message : 'This photo could not be used. Pick a JPG or PNG photo.');
    }
  };

  const save = async () => {
    if (busy) return;
    const h = hoursFromForm(days, shifts);
    if (!h.ok) return setProblem(h.words);
    setBusy(true);
    setProblem(null);
    try {
      await api.saveTrainerProfile(ownerKey, { staffId: trainer.id, teaches: teaches.trim().slice(0, 80), hours: h.hours, photo });
      await onSaved();
    } catch (e) {
      console.warn('[ForgeErr] trainers: saving the page', e);
      setProblem(failWords(e, trainer.name));
    } finally {
      setBusy(false);
    }
  };

  const setShift = (i: number, k: 'from' | 'to', v: string) => {
    setShifts((old) => old.map((s, j) => (j === i ? { ...s, [k]: v } : s)));
    setProblem(null);
  };

  return (
    <Sheet
      title={`Edit ${trainer.name}’s page`}
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', gap: space.sm, flexWrap: 'wrap' }}>
          <Button needsInternet disabled={busy} onClick={save}>
            {busy ? 'Saving…' : 'Save page'}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      }
    >
      <SectionTitle>Photo</SectionTitle>
      <div style={{ display: 'flex', gap: space.md, alignItems: 'center', flexWrap: 'wrap' }}>
        <TrainerPhoto trainer={{ name: trainer.name, photo: shown ?? null }} size={64} />
        <Button variant="ghost" onClick={() => file.current?.click()}>
          {shown ? 'Change photo' : 'Add a photo'}
        </Button>
        {shown && (
          <Button variant="quiet" onClick={() => setPhoto(null)}>
            Remove photo
          </Button>
        )}
        <input
          ref={file}
          type="file"
          accept="image/*"
          aria-label="Trainer photo"
          style={{ display: 'none' }}
          onChange={(e) => {
            void pick(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
      <TextField label="What they teach" value={teaches} onChange={setTeaches} placeholder="Weight loss, strength, yoga" hint="Members and the desk see this. At most 80 letters." />

      <div style={{ marginTop: space.xl }}>
        <SectionTitle>Working days</SectionTitle>
      </div>
      <div role="group" aria-label="Working days" style={{ display: 'flex', flexWrap: 'wrap', gap: space.xs }}>
        {WEEKDAYS.map((d) => {
          const on = days.includes(d);
          return (
            <button
              key={d}
              type="button"
              aria-pressed={on}
              onClick={() => {
                setDays((old) => (on ? old.filter((x) => x !== d) : [...old, d].sort()));
                setProblem(null);
              }}
              style={{
                all: 'unset', cursor: 'pointer', minHeight: 40, minWidth: 48, textAlign: 'center', padding: '0 10px', borderRadius: 999,
                border: `1px solid ${on ? color.accent : color.borderStrong}`, background: on ? color.accentSoft : 'transparent',
                color: on ? color.accentBright : color.inkSecondary, fontFamily: font.body, fontWeight: 700, fontSize: 13, lineHeight: '40px',
              }}
            >
              {dayName(d).slice(0, 3)}
            </button>
          );
        })}
      </div>
      {shifts.map((s, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: space.sm }}>
          <SelectField label={i === 0 ? 'Shift starts' : 'Second shift starts'} value={s.from} onChange={(v) => setShift(i, 'from', v)} options={SHIFT_TIMES} />
          <SelectField label={i === 0 ? 'Shift ends' : 'Second shift ends'} value={s.to} onChange={(v) => setShift(i, 'to', v)} options={SHIFT_TIMES} />
        </div>
      ))}
      <p style={{ ...small, marginTop: space.sm }}>
        {hoursDifferByDay(trainer.hours)
          ? 'Saving sets these same hours on every day you ticked.'
          : 'The second shift is optional. With no day ticked, every time can be booked.'}
      </p>
      {problem && (
        <div data-testid="edit-problem" style={{ marginTop: space.md }}>
          <ErrorBanner>{problem}</ErrorBanner>
        </div>
      )}
    </Sheet>
  );
}
