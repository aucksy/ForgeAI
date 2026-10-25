/**
 * Gym timings (R-124, 25 Oct 2026): when the gym is open, shown to members in the MettleUp app
 * (Gym tab: "Open now · closes 10:00 pm", and the week).
 *
 * For each day Monday to Sunday: Closed, Times (one or two: morning and evening) or Open 24 hours,
 * with "Copy Monday to Tue to Sat" and three starting points (morning and evening, one long day,
 * 24 hours). Special days: a date closed or with other times, with a short note ("Diwali"); members
 * see one on the Gym tab a week before. One optional note for members ("Ladies batch 11 am to 12 pm").
 * A line shows what members see right now. Saved on the gym's server (0036), per branch, so it needs
 * the gym online and the internet. The owner changes them; the front desk sees them read-only (to
 * answer a member on the phone). Rules and words: packages/theme/src/gymHours.ts, logic/gymTimings.ts.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import {
  DAY_KEYS,
  DAY_NAMES,
  HOURS_PRESETS,
  addDaysISO,
  dateWords,
  dayLines,
  indiaNow,
  openStatus,
  rangeSpan,
  specialWords,
  timeWords,
  weekGroups,
  type DayHours,
  type DayKind,
  type GymHours,
  type SpecialDay,
} from '@forgeai/theme';

import { useAuth } from '../../auth/AuthProvider';
import { useBranches } from '../../branches/context';
import { dateISOFromEpoch, formatDay } from '../../logic/dates';
import {
  MEMBERS_SEE_TIMINGS,
  TIMINGS_SAVED,
  copyMonday,
  newSpecial,
  timingsChanged,
  timingsErrorWords,
  timingsPayload,
  withDay,
  withKind,
  withSecondTime,
  withTime,
  withoutTime,
  type TimingsAnswer,
} from '../../logic/gymTimings';
import { isNoSuchFunction } from '../../logic/workoutOffer';
import * as timingsApi from '../../shop/timingsApi';
import { errorWords } from '../../shop/logic';
import { Button, Card, ChipToggle, EmptyState, ErrorBanner, PageHeader, SectionTitle, Sheet, TextField, Toast, color, font, radius, space } from '../kit';
import { navigate } from '../router';
import { ChoiceRow } from './WorkoutPlans';

type Load = { state: 'loading' } | { state: 'missing' } | { state: 'error'; message: string } | { state: 'ready'; saved: TimingsAnswer };

const quiet = { margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary } as const;

const KIND_OPTIONS: { value: DayKind; label: string }[] = [
  { value: 'closed', label: 'Closed' },
  { value: 'hours', label: 'Times' },
  { value: 'allDay', label: '24 hours' },
];

function failWords(e: unknown): string {
  return timingsErrorWords(e) ?? errorWords(e);
}

const todayISO = () => indiaNow(Date.now()).dateISO;

export function GymTimingsScreen() {
  const { session } = useAuth();
  const online = Boolean(session?.online);
  const key = online ? (session?.ownerKey ?? null) : null;
  const { multi, branches, currentGymId } = useBranches();
  const branchName = multi ? branches.find((b) => b.gymId === currentGymId)?.name ?? null : null;
  const [load, setLoad] = useState<Load>({ state: 'loading' });

  const fetchTimings = useCallback(async () => {
    if (!key) return;
    setLoad({ state: 'loading' });
    try {
      setLoad({ state: 'ready', saved: await timingsApi.getTimings(key) });
    } catch (e) {
      if (isNoSuchFunction(e)) return setLoad({ state: 'missing' });
      console.warn('[ForgeErr] gym timings: reading', e);
      setLoad({ state: 'error', message: failWords(e) });
    }
  }, [key]);

  useEffect(() => {
    void fetchTimings();
  }, [fetchTimings]);

  return (
    <>
      <PageHeader
        title="Gym timings"
        subtitle={branchName ? `When ${branchName} is open. Each branch has its own timings.` : 'When your gym is open, for members to see'}
        actions={
          <Button variant="ghost" onClick={() => navigate('/settings')}>
            Back to Settings
          </Button>
        }
      />
      {!online || !key ? (
        <Card>
          <EmptyState title="Gym timings need your gym online" body="Members’ phones read the timings from your gym’s server. Put your gym online first (Settings → Put your gym online)." />
        </Card>
      ) : load.state === 'missing' ? (
        <Card>
          <EmptyState title="Gym timings are not switched on for your gym yet" body="They will appear here once your gym’s server has them." />
        </Card>
      ) : load.state === 'error' ? (
        <Card>
          <ErrorBanner>{load.message}</ErrorBanner>
          <Button variant="ghost" onClick={() => void fetchTimings()}>
            Try again
          </Button>
        </Card>
      ) : load.state === 'loading' ? (
        <p style={quiet}>Loading…</p>
      ) : load.saved.canEdit ? (
        <TimingsEditor ownerKey={key} saved={load.saved} onSaved={(saved) => setLoad({ state: 'ready', saved })} />
      ) : (
        <TimingsReadOnly saved={load.saved} />
      )}
    </>
  );
}

// ---------------------------------------------------------------- the front desk: read-only

function WeekSummary({ hours }: { hours: GymHours }) {
  const today = todayISO();
  const coming = hours.special.filter((s) => s.date >= today);
  return (
    <div style={{ display: 'grid', gap: space.sm }}>
      <dl aria-label="Every week" style={{ margin: 0, display: 'grid', gridTemplateColumns: 'minmax(84px, auto) 1fr', columnGap: space.md, rowGap: space.xs }}>
        {weekGroups(hours).map((g) => (
          <div key={g.days} style={{ display: 'contents' }}>
            <dt style={{ fontFamily: font.body, fontSize: 14, fontWeight: 700, color: color.ink }}>{g.days}</dt>
            <dd style={{ margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>{g.lines.join(', ')}</dd>
          </div>
        ))}
      </dl>
      {coming.length > 0 && (
        <ul aria-label="Special days" style={{ margin: 0, paddingLeft: 18, fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>
          {coming.map((s) => (
            <li key={s.date}>{specialWords(s, today)}</li>
          ))}
        </ul>
      )}
      {hours.note && <p style={{ ...quiet, fontSize: 13 }}>{hours.note}</p>}
    </div>
  );
}

function TimingsReadOnly({ saved }: { saved: TimingsAnswer }) {
  return (
    <Card>
      <SectionTitle>Your gym’s timings</SectionTitle>
      {saved.hours ? (
        <>
          <p style={{ ...quiet, marginBottom: space.md }}>
            Right now members see: <strong style={{ color: color.ink }}>{openStatus(saved.hours, Date.now()).line}</strong>
          </p>
          <WeekSummary hours={saved.hours} />
        </>
      ) : (
        <p style={quiet}>No timings yet.</p>
      )}
      <p style={{ ...quiet, fontSize: 13, marginTop: space.md }}>Only the owner can change the gym timings.</p>
    </Card>
  );
}

// ---------------------------------------------------------------- the owner: the editor

function TimingsEditor({ ownerKey, saved, onSaved }: { ownerKey: string; saved: TimingsAnswer; onSaved: (a: TimingsAnswer) => void }) {
  const [draft, setDraft] = useState<GymHours | null>(saved.hours);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const closeRemove = useCallback(() => setConfirmRemove(false), []);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);
  const flash = (m: string) => {
    setToast(m);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3000);
  };

  const today = todayISO();
  const preview = useMemo(() => {
    if (!draft) return null;
    const { payload } = timingsPayload(draft, today);
    return payload ? openStatus(payload, Date.now()).line : null;
  }, [draft, today]);

  if (!draft) {
    return (
      <Card>
        <SectionTitle>Start from</SectionTitle>
        <p style={{ ...quiet, fontSize: 13, marginBottom: space.md }}>Pick the one closest to your gym, then change any day.</p>
        <div style={{ display: 'grid', gap: space.sm }}>
          {HOURS_PRESETS.map((p) => (
            <ChoiceRow key={p.key} title={p.title} sub={p.sub} onClick={() => setDraft(p.hours())} />
          ))}
        </div>
        <p style={{ ...quiet, fontSize: 13, marginTop: space.md }}>{MEMBERS_SEE_TIMINGS}</p>
        {/* "Removed" is said here: the editor is gone once the timings are. */}
        {toast && <Toast message={toast} />}
      </Card>
    );
  }

  const set = (next: GymHours) => {
    setError(null);
    setDraft(next);
  };
  const changed = timingsChanged(draft, saved.hours, today);

  const save = async () => {
    if (saving) return;
    const { payload, problem } = timingsPayload(draft, today);
    if (!payload) return setError(problem);
    setSaving(true);
    setError(null);
    try {
      const answer = await timingsApi.saveTimings(ownerKey, payload);
      onSaved(answer);
      setDraft(answer.hours);
      flash(TIMINGS_SAVED);
    } catch (e) {
      console.warn('[ForgeErr] gym timings: saving', e);
      setError(failWords(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setConfirmRemove(false);
    setSaving(true);
    setError(null);
    try {
      const answer = await timingsApi.saveTimings(ownerKey, null);
      onSaved(answer);
      setDraft(null);
      flash('Gym timings removed. Members no longer see them.');
    } catch (e) {
      console.warn('[ForgeErr] gym timings: removing', e);
      setError(failWords(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {error && <ErrorBanner>{error}</ErrorBanner>}
      <Card style={{ marginBottom: space.lg }}>
        <p aria-live="polite" style={{ ...quiet, color: color.ink }}>
          {preview ? (
            <>
              Right now members see: <strong>{preview}</strong>
            </>
          ) : (
            'Fix the times below to see what members will see.'
          )}
        </p>
        <p style={{ ...quiet, fontSize: 13, marginTop: space.xs }}>{MEMBERS_SEE_TIMINGS}</p>
        {saved.hours && saved.updatedAt && (
          <p style={{ ...quiet, fontSize: 12, color: color.inkMuted, marginTop: space.xs }}>
            {`Last saved ${formatDay(dateISOFromEpoch(saved.updatedAt))}${saved.updatedByName ? ` by ${saved.updatedByName}` : ''}.`}
          </p>
        )}
      </Card>

      <Card style={{ marginBottom: space.lg }}>
        <SectionTitle>Every week</SectionTitle>
        <div style={{ display: 'grid', gap: space.md }}>
          {DAY_KEYS.map((k) => (
            <DayEditor
              key={k}
              label={DAY_NAMES[k]}
              day={draft.week[k]}
              onChange={(d) => set(withDay(draft, k, d))}
              extra={
                k === 'mon' ? (
                  <Button variant="quiet" onClick={() => set(copyMonday(draft))}>
                    Copy Monday to Tue to Sat
                  </Button>
                ) : undefined
              }
            />
          ))}
        </div>
      </Card>

      <Card style={{ marginBottom: space.lg }}>
        <SectionTitle
          action={
            <Button variant="ghost" disabled={draft.special.length >= 30} onClick={() => set({ ...draft, special: [...draft.special, newSpecial(addDaysISO(today, 1))] })}>
              + Add a special day
            </Button>
          }
        >
          Special days
        </SectionTitle>
        <p style={{ ...quiet, fontSize: 13 }}>
          Add holidays like Diwali, or days with other times. Members see them on the Gym tab 7 days before.
        </p>
        <div style={{ display: 'grid', gap: space.md, marginTop: space.md }}>
          {draft.special.map((s, i) => (
            <SpecialEditor
              key={i}
              index={i}
              special={s}
              onChange={(next) => set({ ...draft, special: draft.special.map((x, j) => (j === i ? next : x)) })}
              onRemove={() => set({ ...draft, special: draft.special.filter((_, j) => j !== i) })}
            />
          ))}
        </div>
      </Card>

      <Card style={{ marginBottom: space.lg }}>
        <SectionTitle>Note for members (optional)</SectionTitle>
        <TextField
          label="One line members see under the timings"
          value={draft.note ?? ''}
          onChange={(v) => set({ ...draft, note: v })}
          placeholder="Ladies batch 11 am to 12 pm"
          hint="At most 120 letters."
        />
      </Card>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' }}>
        <Button needsInternet onClick={save} disabled={saving || !changed}>
          {saving ? 'Saving…' : saved.hours ? 'Save timings' : 'Save and show members'}
        </Button>
        {saved.hours && (
          <Button variant="quiet" tone="danger" needsInternet disabled={saving} onClick={() => setConfirmRemove(true)}>
            Remove timings
          </Button>
        )}
      </div>

      {confirmRemove && (
        <Sheet
          title="Remove the gym timings?"
          onClose={closeRemove}
          footer={
            <>
              <Button variant="ghost" onClick={closeRemove}>
                Keep them
              </Button>
              <Button tone="danger" needsInternet onClick={() => void remove()}>
                Remove
              </Button>
            </>
          }
        >
          <p style={quiet}>Members will no longer see when your gym is open. You can add the timings again at any time.</p>
        </Sheet>
      )}
      {toast && <Toast message={toast} />}
    </>
  );
}

// ---------------------------------------------------------------- one day

/** "Ends the next day at 2:00 am" under a time that runs past midnight. */
function overnightNote(d: DayHours): string | null {
  const late = d.kind === 'hours' ? d.ranges.find((r) => rangeSpan(r)?.overnight && r.close !== '00:00') : undefined;
  return late ? `Ends the next day at ${timeWords(late.close)}.` : null;
}

function DayEditor<T extends DayHours>({ label, day, onChange, extra }: { label: string; day: T; onChange: (d: T) => void; extra?: ReactNode }) {
  const note = overnightNote(day);
  return (
    <fieldset aria-label={label} style={dayBox}>
      <legend style={{ padding: `0 ${space.xs}px`, fontFamily: font.body, fontSize: 15, fontWeight: 700, color: color.ink }}>{label}</legend>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm, alignItems: 'center', justifyContent: 'space-between' }}>
        <ChipToggle variant="tabs" label={`${label} is`} options={KIND_OPTIONS} value={day.kind} onChange={(v) => onChange(withKind(day, v as DayKind))} />
        <span style={{ fontFamily: font.body, fontSize: 13, color: color.inkMuted }}>{dayLines(day).join(', ')}</span>
      </div>
      {day.kind === 'hours' && (
        <>
          {day.ranges.map((r, i) => (
            <div key={i} style={pairGrid}>
              <TextField label={i === 0 ? `${label} opens` : `${label} opens again`} type="time" value={r.open} onChange={(v) => onChange(withTime(day, i, 'open', v))} />
              <TextField label={i === 0 ? `${label} closes` : `${label} closes again`} type="time" value={r.close} onChange={(v) => onChange(withTime(day, i, 'close', v))} />
            </div>
          ))}
          {note && <p style={{ ...quiet, fontSize: 12, marginTop: space.xs }}>{note}</p>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.xs, marginTop: space.xs }}>
            {day.ranges.length < 2 ? (
              <Button variant="quiet" onClick={() => onChange(withSecondTime(day))}>
                + Add evening time
              </Button>
            ) : (
              <Button variant="quiet" ariaLabel={`Remove ${label}’s second time`} onClick={() => onChange(withoutTime(day, 1))}>
                Remove second time
              </Button>
            )}
            {extra}
          </div>
        </>
      )}
      {day.kind !== 'hours' && extra && <div style={{ marginTop: space.xs }}>{extra}</div>}
    </fieldset>
  );
}

function SpecialEditor({ index, special, onChange, onRemove }: { index: number; special: SpecialDay; onChange: (s: SpecialDay) => void; onRemove: () => void }) {
  const label = special.date ? dateWords(special.date) : `Special day ${index + 1}`;
  return (
    <div style={{ display: 'grid', gap: space.xs }}>
      <div style={pairGrid}>
        <TextField label={`Special day ${index + 1}: date`} type="date" value={special.date} onChange={(v) => onChange({ ...special, date: v })} />
        <TextField label={`Special day ${index + 1}: why (optional)`} value={special.note ?? ''} onChange={(v) => onChange({ ...special, note: v })} placeholder="Diwali" />
      </div>
      <DayEditor label={label} day={special} onChange={onChange} />
      <div>
        <Button variant="quiet" tone="danger" ariaLabel={`Remove the special day ${label}`} onClick={onRemove}>
          Remove this special day
        </Button>
      </div>
    </div>
  );
}

const dayBox = { border: `1px solid ${color.border}`, borderRadius: radius.md, padding: `${space.xs}px ${space.md}px ${space.md}px`, margin: 0, minWidth: 0 } as const;
const pairGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', columnGap: space.md } as const;
