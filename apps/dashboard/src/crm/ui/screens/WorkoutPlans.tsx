/**
 * Workout plans — routines the gym or a trainer sends to members (18 Oct 2026, OWNER-INBOX #6).
 *
 * The list of plans (withdrawn ones folded away at the bottom), and the builder sheet: the plan's
 * name and note, one section per day with its exercises (picked from the library by any name, Hindi
 * gym words included, or typed by hand), and who it goes to — members by name, and everyone on a
 * membership plan. The member sees it in the ForgeAI app after one check-in at the gym.
 *
 * Owner and Staff (trainers) alike (permissions.ts `editWorkoutPlans`). Withdraw is the only
 * destructive control, so it asks first; nothing is ever deleted (the routines already on a
 * member's phone stay there).
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { useCrm } from '../../store';
import { useAuth } from '../../auth/AuthProvider';
import { takerOf } from '../../auth/permissions';
import { dateISOFromEpoch, formatDay } from '../../logic/dates';
import { musclesWords } from '../../logic/exerciseCatalog';
import { formatPhone, matchesQuery } from '../../logic/members';
import { countOf } from '../../logic/plural';
import {
  assignSummary,
  cleanDraft,
  customExercise,
  dayTypeOptions,
  draftOf,
  emptyRoutine,
  emptyWorkoutDraft,
  exerciseFromCatalog,
  moveItem,
  planSizeWords,
  searchExercises,
  splitPlans,
  workoutPlanProblem,
  WP_MAX_EXERCISES,
  WP_MAX_REPS,
  WP_MAX_REST_SEC,
  WP_MAX_ROUTINES,
  WP_MAX_SETS,
} from '../../logic/workoutPlans';
import type { WorkoutDayType, WorkoutExercise, WorkoutPlan, WorkoutPlanDraft, WorkoutRoutine } from '../../types';
import {
  Button,
  Card,
  ChipToggle,
  EmptyState,
  ErrorBanner,
  PageHeader,
  Pill,
  Row,
  SearchField,
  SectionTitle,
  SelectField,
  Sheet,
  TextField,
  Toast,
  color,
  font,
  radius,
  space,
  TOUCH,
} from '../kit';

/** The line every builder and list shows: when the member gets it. */
export const MEMBERS_SEE_IT = 'Members see it in the ForgeAI app after one check-in at the gym.';
/** Review fix: a browser-only gym's plans never reach a phone (member_gym_plans reads online records). */
export const NOT_ONLINE_YET = 'Members get these plans only once your gym is online (Settings → Put your gym online).';

export function membersSeeIt(online: boolean): string {
  return online ? MEMBERS_SEE_IT : NOT_ONLINE_YET;
}

export function WorkoutPlansScreen() {
  const { snapshot, withdrawWorkoutPlan } = useCrm();
  const online = Boolean(useAuth().session?.online);
  const [editing, setEditing] = useState<WorkoutPlanDraft | null>(null);
  const [withdrawing, setWithdrawing] = useState<WorkoutPlan | null>(null);
  const [showWithdrawn, setShowWithdrawn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const flash = (msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  };

  const { open, withdrawn } = useMemo(() => splitPlans(snapshot.workoutPlans ?? []), [snapshot.workoutPlans]);
  const newButton = <Button onClick={() => setEditing(emptyWorkoutDraft())}>+ New plan</Button>;

  return (
    <>
      <PageHeader title="Workout plans" subtitle="Send members their routines" actions={newButton} />

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <p style={{ margin: `0 0 ${space.lg}px`, fontFamily: font.body, fontSize: 13, color: color.inkSecondary }}>{membersSeeIt(online)}</p>

      <Card style={{ marginBottom: space.lg }}>
        <SectionTitle>Plans</SectionTitle>
        {open.length === 0 ? (
          <EmptyState
            title="No workout plans yet"
            body="Make a plan once (for example “Beginner 3 days”) and send it to members or to everyone on a membership plan."
            action={newButton}
          />
        ) : (
          <div style={{ display: 'grid' }}>
            {open.map((p, i) => (
              <PlanRow
                key={p.id}
                plan={p}
                first={i === 0}
                actions={
                  <>
                    <Button variant="ghost" onClick={() => setEditing(draftOf(p))} ariaLabel={`Edit ${p.name}`}>
                      Edit
                    </Button>
                    <Button variant="quiet" tone="danger" onClick={() => setWithdrawing(p)} ariaLabel={`Withdraw ${p.name}`}>
                      Withdraw
                    </Button>
                  </>
                }
              />
            ))}
          </div>
        )}
      </Card>

      {withdrawn.length > 0 && (
        <Card>
          <button
            type="button"
            aria-expanded={showWithdrawn}
            onClick={() => setShowWithdrawn((v) => !v)}
            style={{
              appearance: 'none',
              width: '100%',
              minHeight: TOUCH,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              color: color.ink,
              fontFamily: font.display,
              fontSize: 16,
              fontWeight: 600,
            }}
          >
            <span>Withdrawn plans ({withdrawn.length})</span>
            <span aria-hidden style={{ color: color.inkMuted }}>{showWithdrawn ? '▴' : '▾'}</span>
          </button>
          {showWithdrawn && (
            <div style={{ display: 'grid', marginTop: space.sm }}>
              <p style={{ margin: `0 0 ${space.sm}px`, fontFamily: font.body, fontSize: 12, color: color.inkMuted }}>
                Members no longer get these. Routines already on their phones stay there.
              </p>
              {withdrawn.map((p, i) => (
                <PlanRow key={p.id} plan={p} first={i === 0} />
              ))}
            </div>
          )}
        </Card>
      )}

      {editing && (
        <WorkoutPlanSheet
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={(plan, isNew) => {
            const sent = plan.assign.memberIds.length + plan.assign.planIds.length > 0;
            flash(!sent ? `“${plan.name}” saved. Tick members to send it.` : isNew ? `“${plan.name}” saved and sent.` : `“${plan.name}” updated.`);
          }}
        />
      )}
      {withdrawing && (
        <Sheet
          title="Withdraw this plan?"
          onClose={() => setWithdrawing(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setWithdrawing(null)}>
                Keep it
              </Button>
              <Button
                tone="danger"
                onClick={async () => {
                  const target = withdrawing;
                  setWithdrawing(null);
                  setError(null);
                  try {
                    await withdrawWorkoutPlan(target.id);
                    flash('Plan withdrawn.');
                  } catch (e) {
                    setError(e instanceof Error ? e.message : 'Could not withdraw it. Try again.');
                  }
                }}
              >
                Withdraw
              </Button>
            </>
          }
        >
          <p style={{ margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>
            <strong style={{ color: color.ink }}>{withdrawing.name}</strong>
            {' will stop going to members. Routines already on their phones stay there, but get no more changes. You can’t send this plan again; make a new one instead.'}
          </p>
        </Sheet>
      )}
      {toast && <Toast message={toast} />}
    </>
  );
}

function PlanRow({ plan, first, actions }: { plan: WorkoutPlan; first: boolean; actions?: ReactNode }) {
  const { snapshot } = useCrm();
  return (
    <div style={{ borderTop: first ? undefined : `1px solid ${color.border}`, padding: `${space.sm}px 0` }}>
      <Row gap={space.sm} align="center">
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <div style={{ fontFamily: font.body, fontSize: 15, fontWeight: 700, color: color.ink, overflowWrap: 'anywhere' }}>{plan.name}</div>
          <div style={{ fontFamily: font.body, fontSize: 13, color: color.inkSecondary, marginTop: 2 }}>
            {assignSummary(plan, snapshot.plans)}
          </div>
          <div style={{ fontFamily: font.body, fontSize: 12, color: color.inkMuted, marginTop: 2 }}>
            {planSizeWords(plan)} · Updated {formatDay(dateISOFromEpoch(plan.updatedAt))}
            {plan.createdByName ? ` · by ${plan.createdByName}` : ''}
          </div>
        </div>
        {actions && <Row gap={space.xs}>{actions}</Row>}
      </Row>
    </div>
  );
}

// ---------------------------------------------------------------- the builder

/**
 * Make or change a plan. Exported for Member detail's "Send a plan" (opened with that member
 * already ticked). `onSaved` gets the saved plan and whether it was new.
 */
export function WorkoutPlanSheet({
  initial,
  onClose,
  onSaved,
}: {
  initial: WorkoutPlanDraft;
  onClose: () => void;
  onSaved?: (plan: WorkoutPlan, isNew: boolean) => void;
}) {
  const { saveWorkoutPlan } = useCrm();
  const { session } = useAuth();
  const online = Boolean(session?.online);
  const [draft, setDraft] = useState<WorkoutPlanDraft>(initial);
  const [day, setDay] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const isNew = !initial.id;

  const routine = draft.routines[Math.min(day, draft.routines.length - 1)];
  const dayIndex = draft.routines.indexOf(routine);

  const setRoutines = (fn: (rs: WorkoutRoutine[]) => WorkoutRoutine[]) => {
    setError(null);
    setDraft((d) => ({ ...d, routines: fn(d.routines) }));
  };
  const setRoutine = (patch: Partial<WorkoutRoutine>) =>
    setRoutines((rs) => rs.map((r, i) => (i === dayIndex ? { ...r, ...patch } : r)));
  const setExercises = (fn: (es: WorkoutExercise[]) => WorkoutExercise[]) => setRoutine({ exercises: fn(routine.exercises) });

  const submit = async () => {
    setError(null);
    const clean = cleanDraft(draft);
    const problem = workoutPlanProblem(clean);
    if (problem) return setError(problem);
    setSaving(true);
    try {
      const taker = takerOf(session);
      const plan = await saveWorkoutPlan({
        ...clean,
        baseUpdatedAt: draft.baseUpdatedAt ?? null,
        ...(isNew ? { createdBy: taker.id, createdByName: taker.name } : {}),
      });
      onSaved?.(plan, isNew);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this plan.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      title={isNew ? 'New workout plan' : 'Edit workout plan'}
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : isNew ? 'Save plan' : 'Save changes'}
          </Button>
        </>
      }
    >
      {error && <ErrorBanner>{error}</ErrorBanner>}
      <p style={{ margin: 0, fontFamily: font.body, fontSize: 13, color: color.inkSecondary }}>{membersSeeIt(online)}</p>
      <TextField
        label="Plan name"
        value={draft.name}
        onChange={(v) => {
          setError(null);
          setDraft((d) => ({ ...d, name: v }));
        }}
        placeholder="Beginner 3 days"
        autoFocus={isNew}
      />
      <TextField
        label="Note for members (optional)"
        value={draft.note ?? ''}
        onChange={(v) => setDraft((d) => ({ ...d, note: v }))}
        placeholder="Warm up for 10 minutes first. Drink water."
        multiline
      />

      <div style={{ height: space.lg }} />
      <SectionTitle
        action={
          <Button
            variant="ghost"
            disabled={draft.routines.length >= WP_MAX_ROUTINES}
            onClick={() => {
              setRoutines((rs) => [...rs, emptyRoutine(rs.length)]);
              setDay(draft.routines.length);
            }}
          >
            + Add day
          </Button>
        }
      >
        Days
      </SectionTitle>
      <ChipToggle
        label="Days of the plan"
        value={String(dayIndex)}
        onChange={(v) => setDay(Number(v))}
        options={draft.routines.map((r, i) => ({ value: String(i), label: r.name.trim() || `Day ${i + 1}`, count: r.exercises.length }))}
      />
      {draft.routines.length >= WP_MAX_ROUTINES && <Hint>A plan can have at most {WP_MAX_ROUTINES} days.</Hint>}

      <div
        style={{
          marginTop: space.md,
          padding: space.md,
          borderRadius: radius.md,
          border: `1px solid ${color.border}`,
          background: color.surface,
        }}
      >
        <div style={{ display: 'grid', gap: `0 ${space.md}px`, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          <TextField label="Day name" value={routine.name} onChange={(v) => setRoutine({ name: v })} placeholder="Chest and triceps" />
          <SelectField
            label="Kind of day"
            value={routine.dayType}
            onChange={(v) => setRoutine({ dayType: v as WorkoutDayType })}
            options={dayTypeOptions()}
          />
        </div>
        <Row gap={space.xs}>
          <Button variant="quiet" disabled={dayIndex === 0} onClick={() => { setRoutines((rs) => moveItem(rs, dayIndex, -1)); setDay(dayIndex - 1); }}>
            ‹ Move day earlier
          </Button>
          <Button
            variant="quiet"
            disabled={dayIndex === draft.routines.length - 1}
            onClick={() => { setRoutines((rs) => moveItem(rs, dayIndex, 1)); setDay(dayIndex + 1); }}
          >
            Move day later ›
          </Button>
          {draft.routines.length > 1 && (
            <Button
              variant="quiet"
              tone="danger"
              onClick={() => {
                setRoutines((rs) => rs.filter((_, i) => i !== dayIndex));
                setDay(Math.max(0, dayIndex - 1));
              }}
            >
              Remove this day
            </Button>
          )}
        </Row>

        {routine.exercises.length === 0 ? (
          <Hint>No exercises on this day yet. Search below to add one.</Hint>
        ) : (
          <div style={{ display: 'grid', gap: space.sm, marginTop: space.sm }}>
            {routine.exercises.map((e, i) => (
              <ExerciseEditor
                key={`${dayIndex}-${i}-${e.catalogKey ?? e.name}`}
                exercise={e}
                position={i}
                count={routine.exercises.length}
                onChange={(patch) => setExercises((es) => es.map((x, j) => (j === i ? { ...x, ...patch } : x)))}
                onMove={(by) => setExercises((es) => moveItem(es, i, by))}
                onRemove={() => setExercises((es) => es.filter((_, j) => j !== i))}
              />
            ))}
          </div>
        )}

        {routine.exercises.length >= WP_MAX_EXERCISES ? (
          <Hint>A day can have at most {WP_MAX_EXERCISES} exercises.</Hint>
        ) : (
          <ExercisePicker onPick={(e) => setExercises((es) => [...es, e])} />
        )}
      </div>

      <div style={{ height: space.xl }} />
      <AssignSection
        assign={draft.assign}
        onChange={(assign) => {
          setError(null);
          setDraft((d) => ({ ...d, assign }));
        }}
      />
    </Sheet>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return <p style={{ margin: `${space.sm}px 0 0`, fontFamily: font.body, fontSize: 12, color: color.inkMuted }}>{children}</p>;
}

/** A whole number typed in a box: empty or not a number reads as NaN (the check says so). */
function NumberBox({
  label,
  value,
  onChange,
  emptyIsNull,
  hint,
}: {
  label: string;
  value: number | null | undefined;
  onChange: (n: number | null) => void;
  emptyIsNull?: boolean;
  hint?: string;
}) {
  const shown = typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
  return (
    <TextField
      label={label}
      value={shown}
      inputMode="numeric"
      hint={hint}
      onChange={(v) => {
        const t = v.replace(/\D/g, '').slice(0, 4);
        onChange(t === '' ? (emptyIsNull ? null : Number.NaN) : Number(t));
      }}
    />
  );
}

function ExerciseEditor({
  exercise,
  position,
  count,
  onChange,
  onMove,
  onRemove,
}: {
  exercise: WorkoutExercise;
  position: number;
  count: number;
  onChange: (patch: Partial<WorkoutExercise>) => void;
  onMove: (by: number) => void;
  onRemove: () => void;
}) {
  const [noteOpen, setNoteOpen] = useState(Boolean(exercise.note));
  const muscles = musclesWords(exercise.primary);
  return (
    <div style={{ padding: space.md, borderRadius: radius.md, background: color.surfaceSunken, border: `1px solid ${color.border}` }}>
      <Row gap={space.sm} wrap={false} align="flex-start">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: font.body, fontSize: 14, fontWeight: 700, color: color.ink, overflowWrap: 'anywhere' }}>
            {position + 1}. {exercise.name}
          </div>
          <div style={{ fontFamily: font.body, fontSize: 12, color: color.inkMuted, marginTop: 2 }}>
            {exercise.catalogKey ? muscles || 'From the ForgeAI exercise list' : 'Your own exercise'}
          </div>
        </div>
        <Row gap={2} wrap={false}>
          <Button variant="quiet" disabled={position === 0} onClick={() => onMove(-1)} ariaLabel={`Move ${exercise.name} up`}>
            ↑
          </Button>
          <Button variant="quiet" disabled={position === count - 1} onClick={() => onMove(1)} ariaLabel={`Move ${exercise.name} down`}>
            ↓
          </Button>
          <Button variant="quiet" tone="danger" onClick={onRemove} ariaLabel={`Remove ${exercise.name}`}>
            Remove
          </Button>
        </Row>
      </Row>
      <div style={{ display: 'grid', gap: `0 ${space.sm}px`, gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))' }}>
        <NumberBox label={`Sets (1-${WP_MAX_SETS})`} value={exercise.sets} onChange={(n) => onChange({ sets: n ?? Number.NaN })} />
        <NumberBox label="Reps from" value={exercise.repMin} onChange={(n) => onChange({ repMin: n ?? Number.NaN })} />
        <NumberBox label={`Reps to (max ${WP_MAX_REPS})`} value={exercise.repMax} onChange={(n) => onChange({ repMax: n ?? Number.NaN })} />
        <NumberBox
          label="Rest (seconds)"
          value={exercise.restSec}
          emptyIsNull
          onChange={(n) => onChange({ restSec: n })}
          hint={exercise.restSec == null ? 'Empty: their own timer' : `Up to ${WP_MAX_REST_SEC}`}
        />
      </div>
      {noteOpen ? (
        <TextField
          label="Note (optional)"
          value={exercise.note ?? ''}
          onChange={(v) => onChange({ note: v })}
          placeholder="Slow on the way down"
        />
      ) : (
        <div style={{ marginTop: space.xs }}>
          <Button variant="quiet" onClick={() => setNoteOpen(true)}>
            + Add a note
          </Button>
        </div>
      )}
    </div>
  );
}

/** Search the exercise list by any name; or add one that is not in it. */
function ExercisePicker({ onPick }: { onPick: (e: WorkoutExercise) => void }) {
  const [query, setQuery] = useState('');
  const results = useMemo(() => (query.trim() ? searchExercises(query, 8) : []), [query]);
  const typed = query.replace(/\s+/g, ' ').trim();
  const exact = results.some((r) => r.name.toLowerCase() === typed.toLowerCase());
  const pick = (e: WorkoutExercise) => {
    onPick(e);
    setQuery('');
  };
  return (
    <div style={{ marginTop: space.md }}>
      <div style={{ fontFamily: font.body, fontSize: 12, color: color.inkSecondary, marginBottom: 5 }}>Add an exercise</div>
      <SearchField value={query} onChange={setQuery} placeholder="Search: bench, squat, dole, chhati…" />
      {results.length > 0 && (
        <div style={{ display: 'grid', marginTop: space.xs }}>
          {results.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => pick(exerciseFromCatalog(r))}
              style={pickRowStyle}
            >
              <span style={{ fontWeight: 700, color: color.ink }}>+ {r.name}</span>
              <span style={{ fontSize: 12, color: color.inkMuted }}> · {musclesWords(r.primary)}</span>
            </button>
          ))}
        </div>
      )}
      {typed && !exact && (
        <button type="button" onClick={() => pick(customExercise(typed))} style={pickRowStyle}>
          <span style={{ fontWeight: 700, color: color.accentBright }}>+ Add “{typed.slice(0, 80)}” as your own exercise</span>
        </button>
      )}
    </div>
  );
}

const pickRowStyle = {
  appearance: 'none',
  textAlign: 'left',
  minHeight: TOUCH,
  padding: `${space.xs}px ${space.sm}px`,
  background: 'transparent',
  border: 'none',
  borderBottom: `1px solid ${color.border}`,
  cursor: 'pointer',
  fontFamily: font.body,
  fontSize: 14,
  overflowWrap: 'anywhere',
} as const;

// ---------------------------------------------------------------- who gets it

function AssignSection({
  assign,
  onChange,
}: {
  assign: WorkoutPlanDraft['assign'];
  onChange: (a: WorkoutPlanDraft['assign']) => void;
}) {
  const { snapshot, memberViews } = useCrm();
  const [query, setQuery] = useState('');
  const ticked = useMemo(() => new Set(assign.memberIds), [assign.memberIds]);
  const toggle = (list: string[], id: string, on: boolean) => (on ? [...new Set([...list, id])] : list.filter((x) => x !== id));

  // Typing: the members that match. Not typing: the members already ticked.
  const shown = useMemo(() => {
    const q = query.trim();
    const list = q ? memberViews.map((v) => v.member).filter((m) => matchesQuery(m, q)) : snapshot.members.filter((m) => ticked.has(m.id));
    return list.slice(0, 30);
  }, [query, memberViews, snapshot.members, ticked]);
  const plans = snapshot.plans.filter((p) => p.active || assign.planIds.includes(p.id));

  return (
    <div>
      <SectionTitle>Send to</SectionTitle>
      <div style={{ fontFamily: font.body, fontSize: 13, color: color.inkSecondary, marginBottom: space.sm }}>
        {assignSummary({ assign }, snapshot.plans)}
      </div>
      <SearchField value={query} onChange={setQuery} placeholder="Search members by name or mobile" />
      {shown.length > 0 ? (
        <div style={{ display: 'grid', marginTop: space.xs }}>
          {shown.map((m) => (
            <TickRow
              key={m.id}
              on={ticked.has(m.id)}
              onChange={(on) => onChange({ ...assign, memberIds: toggle(assign.memberIds, m.id, on) })}
              title={m.fullName}
              sub={formatPhone(m.phone)}
            />
          ))}
        </div>
      ) : (
        <Hint>{query.trim() ? 'No member matches that.' : 'Type a name or mobile number to find a member.'}</Hint>
      )}
      {ticked.size > 0 && !query.trim() && <Hint>{countOf(ticked.size, 'member')} ticked.</Hint>}

      {plans.length > 0 && (
        <>
          <div style={{ fontFamily: font.body, fontSize: 12, color: color.inkSecondary, margin: `${space.lg}px 0 5px` }}>
            Or everyone on a membership plan (who has it today)
          </div>
          <div style={{ display: 'grid' }}>
            {plans.map((p) => (
              <TickRow
                key={p.id}
                on={assign.planIds.includes(p.id)}
                onChange={(on) => onChange({ ...assign, planIds: toggle(assign.planIds, p.id, on) })}
                title={p.name}
                sub={p.active ? undefined : 'No longer sold'}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function TickRow({ on, onChange, title, sub }: { on: boolean; onChange: (on: boolean) => void; title: string; sub?: string }) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: space.md,
        minHeight: TOUCH,
        padding: `${space.xs}px ${space.sm}px`,
        borderBottom: `1px solid ${color.border}`,
        cursor: 'pointer',
      }}
    >
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 20, height: 20, margin: 0, accentColor: color.accent, flexShrink: 0 }}
      />
      <span style={{ flex: 1, minWidth: 0, fontFamily: font.body, fontSize: 14, color: color.ink, overflowWrap: 'anywhere' }}>
        {title}
        {sub && <span style={{ fontSize: 12, color: color.inkMuted }}> · {sub}</span>}
      </span>
      {on && <Pill tone="accent">Sending</Pill>}
    </label>
  );
}
