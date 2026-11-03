/**
 * F151 "The gym's workout of the day" (Workout plans page, top card).
 *
 * The trainer or owner sets one workout for everyone at the gym, for today or a day in the next week: picked
 * from a day of one of the gym's plans (and changed if wanted), or built here with the plans' own exercise
 * boxes. Members see it on their MettleUp Workout tab ("Today at <gym>") and start it with one tap. Saved on
 * the gym's server (0051); until 0051 is there (or for a browser-only gym) the card is not drawn at all.
 * Owner and Staff (trainers) alike, like workout plans. Words and rules: logic/gymWod.ts.
 */

import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '../../auth/AuthProvider';
import {
  copyRoutineForWod,
  emptyWodDraft,
  wodDayChoices,
  wodDayWords,
  wodDraftOf,
  wodErrorWords,
  wodLine,
  wodOn,
  wodPayload,
  wodPlanChoices,
  type GymWod,
  type GymWodsAnswer,
  type WodDraft,
} from '../../logic/gymWod';
import { addDays, todayISO } from '../../logic/dates';
import { dayTypeOptions, moveItem, WP_MAX_EXERCISES } from '../../logic/workoutPlans';
import { errorWords } from '../../shop/logic';
import * as wodApi from '../../shop/wodApi';
import type { WorkoutDayType, WorkoutExercise, WorkoutPlan } from '../../types';
import { Button, Card, ErrorBanner, Row, SectionTitle, SelectField, Sheet, TextField, Toast, color, font, radius, space } from '../kit';
import { ExerciseEditor, ExercisePicker, Hint } from './WorkoutPlans';

/** What members are told this is (the card and the builder). */
export const WOD_MEMBERS_LINE = 'One workout for everyone at your gym. Members see it on the Workout tab of their MettleUp app and start it with one tap.';

function failWords(e: unknown): string {
  return wodErrorWords(e) ?? errorWords(e);
}

/** "today", "tomorrow" or "5 Nov 2026", inside a sentence. */
function dayInLine(day: string, today: string): string {
  const w = wodDayWords(day, today);
  return w === 'Today' || w === 'Tomorrow' ? w.toLowerCase() : w;
}

const quiet = { margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary } as const;

export function WorkoutOfTheDayCard({ plans }: { plans: readonly WorkoutPlan[] }) {
  const { session } = useAuth();
  const key = session?.online ? (session.ownerKey ?? null) : null;
  const [answer, setAnswer] = useState<GymWodsAnswer | null>(null);
  const [missing, setMissing] = useState(wodApi.wodServer() === 'no');
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<WodDraft | null>(null);
  const [clearing, setClearing] = useState<GymWod | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!key) return;
    try {
      const a = await wodApi.getWods(key);
      if (a === 'missing') {
        setMissing(true);
        return;
      }
      setAnswer(a);
      setError(null);
    } catch (e) {
      console.warn('[ForgeErr] workout of the day: reading', e);
      setError(failWords(e));
    }
  }, [key]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(t);
  }, [toast]);

  if (!key || missing) return null;
  if (!answer) {
    return error ? (
      <Card style={{ marginBottom: space.lg }}>
        <SectionTitle>Workout of the day</SectionTitle>
        <ErrorBanner>{error}</ErrorBanner>
      </Card>
    ) : null;
  }

  const today = answer.today || todayISO();
  const todays = wodOn(answer, today);
  const later = answer.wods.filter((w) => w.day > today);
  const nextFree = [1, 2, 3, 4, 5, 6, 7].map((i) => addDays(today, i)).find((d) => !wodOn(answer, d)) ?? addDays(today, 1);

  const row = (w: GymWod, first: boolean) => (
    <div key={w.day} style={{ borderTop: first ? undefined : `1px solid ${color.border}`, padding: `${space.sm}px 0` }}>
      <Row gap={space.sm} align="center">
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <div style={{ fontFamily: font.body, fontSize: 13, color: color.inkMuted }}>{wodDayWords(w.day, today)}</div>
          <div style={{ fontFamily: font.body, fontSize: 15, fontWeight: 700, color: color.ink, overflowWrap: 'anywhere' }}>{wodLine(w)}</div>
        </div>
        <Row gap={space.xs}>
          <Button variant="ghost" onClick={() => setEditing(wodDraftOf(w))} ariaLabel={`Change the workout for ${wodDayWords(w.day, today)}`}>
            Change
          </Button>
          <Button variant="quiet" tone="danger" onClick={() => setClearing(w)} ariaLabel={`Take off the workout for ${wodDayWords(w.day, today)}`}>
            Take it off
          </Button>
        </Row>
      </Row>
    </div>
  );

  return (
    <Card style={{ marginBottom: space.lg }}>
      <SectionTitle
        action={
          <Button variant="ghost" onClick={() => setEditing(emptyWodDraft(todays ? nextFree : today))}>
            {todays ? '+ Plan another day' : 'Set today’s workout'}
          </Button>
        }
      >
        Workout of the day
      </SectionTitle>
      <p style={{ ...quiet, fontSize: 13, marginBottom: space.sm }}>{WOD_MEMBERS_LINE}</p>
      {error && <ErrorBanner>{error}</ErrorBanner>}
      {todays ? row(todays, true) : <p style={quiet}>Nothing set for today.</p>}
      {later.map((w) => row(w, false))}

      {editing && (
        <WodSheet
          initial={editing}
          today={today}
          answer={answer}
          plans={plans}
          onClose={() => setEditing(null)}
          onSave={async (payload) => {
            const saved = await wodApi.saveWod(key, payload);
            setAnswer((a) => (a ? { ...a, wods: [...a.wods.filter((x) => x.day !== saved.day), saved].sort((x, y) => (x.day < y.day ? -1 : 1)) } : a));
            setToast(saved.day === today ? 'Saved. Members see it now.' : `Saved for ${dayInLine(saved.day, today)}.`);
          }}
        />
      )}
      {clearing && (
        <Sheet
          title="Take this workout off?"
          onClose={() => setClearing(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setClearing(null)}>
                Keep it
              </Button>
              <Button
                tone="danger"
                onClick={async () => {
                  const target = clearing;
                  setClearing(null);
                  setError(null);
                  try {
                    await wodApi.clearWod(key, target.day);
                    setAnswer((a) => (a ? { ...a, wods: a.wods.filter((x) => x.day !== target.day) } : a));
                    setToast('Workout taken off.');
                  } catch (e) {
                    console.warn('[ForgeErr] workout of the day: taking it off', e);
                    setError(failWords(e));
                  }
                }}
              >
                Take it off
              </Button>
            </>
          }
        >
          <p style={quiet}>
            <strong style={{ color: color.ink }}>{clearing.name}</strong>
            {` will no longer show to members for ${dayInLine(clearing.day, today)}. Members who already started it keep their workout.`}
          </p>
        </Sheet>
      )}
      {toast && <Toast message={toast} />}
    </Card>
  );
}

function WodSheet({
  initial,
  today,
  answer,
  plans,
  onClose,
  onSave,
}: {
  initial: WodDraft;
  today: string;
  answer: GymWodsAnswer;
  plans: readonly WorkoutPlan[];
  onClose: () => void;
  onSave: (payload: NonNullable<ReturnType<typeof wodPayload>['payload']>) => Promise<void>;
}) {
  const [draft, setDraft] = useState<WodDraft>(initial);
  const [from, setFrom] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const choices = wodPlanChoices(plans);
  const taken = draft.day !== initial.day || !wodOn(answer, initial.day) ? wodOn(answer, draft.day) : null;

  const setExercises = (fn: (es: WorkoutExercise[]) => WorkoutExercise[]) => {
    setError(null);
    setDraft((d) => ({ ...d, routine: { ...d.routine, exercises: fn(d.routine.exercises) } }));
  };

  const submit = async () => {
    setError(null);
    const { payload, problem } = wodPayload(draft);
    if (!payload) return setError(problem);
    setSaving(true);
    try {
      await onSave(payload);
      onClose();
    } catch (e) {
      console.warn('[ForgeErr] workout of the day: saving', e);
      setError(failWords(e));
    } finally {
      setSaving(false);
    }
  };

  const routine = draft.routine;
  return (
    <Sheet
      title="Workout of the day"
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : 'Save workout'}
          </Button>
        </>
      }
    >
      {error && <ErrorBanner>{error}</ErrorBanner>}
      <p style={{ ...quiet, fontSize: 13 }}>{WOD_MEMBERS_LINE}</p>
      <SelectField label="Day" value={draft.day} onChange={(v) => setDraft((d) => ({ ...d, day: v }))} options={wodDayChoices(today)} />
      {taken && <Hint>{`This replaces “${taken.name}”, already set for that day.`}</Hint>}
      {choices.length > 0 && (
        <SelectField
          label="Start from one of your plans (optional)"
          value={from}
          onChange={(v) => {
            setFrom(v);
            const c = choices.find((x) => x.value === v);
            if (c) {
              setError(null);
              setDraft((d) => ({ ...d, routine: copyRoutineForWod(c.routine) }));
            }
          }}
          options={[{ value: '', label: 'Pick a day of a plan' }, ...choices.map(({ value, label }) => ({ value, label }))]}
        />
      )}
      <div style={{ display: 'grid', gap: `0 ${space.md}px`, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <TextField
          label="Workout name"
          value={routine.name}
          onChange={(v) => {
            setError(null);
            setDraft((d) => ({ ...d, routine: { ...d.routine, name: v } }));
          }}
          placeholder="Leg day"
        />
        <SelectField
          label="Kind of day"
          value={routine.dayType}
          onChange={(v) => setDraft((d) => ({ ...d, routine: { ...d.routine, dayType: v as WorkoutDayType } }))}
          options={dayTypeOptions()}
        />
      </div>
      <TextField
        label="Note for members (optional)"
        value={draft.note ?? ''}
        onChange={(v) => setDraft((d) => ({ ...d, note: v }))}
        placeholder="Warm up for 10 minutes first."
        multiline
      />
      <div style={{ marginTop: space.md, padding: space.md, borderRadius: radius.md, border: `1px solid ${color.border}`, background: color.surface }}>
        {routine.exercises.length === 0 ? (
          <Hint>No exercises yet. Pick a plan above, or search below to add one.</Hint>
        ) : (
          <div style={{ display: 'grid', gap: space.sm }}>
            {routine.exercises.map((e, i) => (
              <ExerciseEditor
                key={`${i}-${e.catalogKey ?? e.name}`}
                exercise={e}
                position={i}
                count={routine.exercises.length}
                videos
                onChange={(patch) => setExercises((es) => es.map((x, j) => (j === i ? { ...x, ...patch } : x)))}
                onMove={(by) => setExercises((es) => moveItem(es, i, by))}
                onRemove={() => setExercises((es) => es.filter((_, j) => j !== i))}
              />
            ))}
          </div>
        )}
        {routine.exercises.length >= WP_MAX_EXERCISES ? (
          <Hint>A workout can have at most {WP_MAX_EXERCISES} exercises.</Hint>
        ) : (
          <ExercisePicker onPick={(e) => setExercises((es) => [...es, e])} />
        )}
      </div>
    </Sheet>
  );
}
