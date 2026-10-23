/**
 * Messages & offers → Automatic reminders (R-86, 23 Oct 2026). One switch per reminder (plan ends
 * soon, plan ended, birthday, welcome, ...) with a plain line on when it goes, what the member reads,
 * and the days where they matter. The common ones start on. Saved on the gym's server (0029); members'
 * phones pick the change up the next time ForgeAI checks the gym, and set the reminders themselves
 * (9:30 am, at most one a day). Owner only; the front desk can look. Words and rules:
 * logic/autoReminders.ts. A server without 0029 says so in one line.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth, useCan } from '../auth/AuthProvider';
import {
  REMINDER_CASES,
  daysText,
  exampleFor,
  onCount,
  parseDays,
  reminderErrorWords,
  sameReminderSettings,
  type ReminderCase,
  type ReminderCaseInfo,
  type ReminderSettings,
  type RemindersAnswer,
} from '../logic/autoReminders';
import { isNoSuchFunction } from '../logic/workoutOffer';
import { useCrm } from '../store';
import { Button, Card, EmptyState, ErrorBanner, SectionTitle, TextField, Toast, color, font, space } from '../ui/kit';
import * as api from './api';
import { errorWords } from './logic';

const quiet = { margin: 0, fontFamily: font.body, fontSize: 13, color: color.inkSecondary } as const;

type Server = 'unknown' | 'yes' | 'no';

function failWords(e: unknown): string {
  return reminderErrorWords(e) ?? errorWords(e);
}

/** The days fields as typed, per case. */
function textsOf(s: ReminderSettings): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of REMINDER_CASES) if (c.numbers) out[c.key] = daysText(s[c.key].days);
  return out;
}

export function AutoRemindersSection() {
  const { session } = useAuth();
  const owner = useCan()('manageGym');
  const { snapshot } = useCrm();
  const online = Boolean(session?.online);
  const key = online ? (session?.ownerKey ?? null) : null;

  const [server, setServer] = useState<Server>('unknown');
  const [answer, setAnswer] = useState<RemindersAnswer | null>(null);
  const [draft, setDraft] = useState<ReminderSettings | null>(null);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toastTimer = useRef<number | undefined>(undefined);

  const take = useCallback((a: RemindersAnswer) => {
    setAnswer(a);
    setDraft(a.settings);
    setTexts(textsOf(a.settings));
  }, []);

  useEffect(() => {
    if (!key) return;
    let live = true;
    api.getAutoReminders(key).then(
      (a) => {
        if (!live) return;
        setServer('yes');
        take(a);
      },
      (e: unknown) => {
        if (!live) return;
        if (isNoSuchFunction(e)) {
          setServer('no');
          return;
        }
        console.warn('[ForgeErr] automatic reminders: asking the server', e);
        setError(failWords(e));
      },
    );
    return () => {
      live = false;
    };
  }, [key, take]);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  if (!online) {
    return (
      <Card>
        <EmptyState
          title="Automatic reminders need your gym online"
          body="Members' phones read your choices from the server. Put your gym's records online first (Settings → Staff & sign-in)."
        />
      </Card>
    );
  }

  if (server === 'no') {
    return (
      <Card>
        <SectionTitle>Automatic reminders</SectionTitle>
        <p style={{ ...quiet, fontSize: 14, color: color.ink }}>Automatic reminders are not switched on for your gym yet.</p>
        <p style={{ ...quiet, marginTop: space.sm }}>
          Until then, members with the ForgeAI app get the usual ones: plan ends in 7 and 3 days, ends today, plan ended, welcome, and workout
          offer days added.
        </p>
      </Card>
    );
  }

  if (!answer || !draft) {
    return (
      <>
        {error && <ErrorBanner>{error}</ErrorBanner>}
        <Card>
          <EmptyState title="Loading…" />
        </Card>
      </>
    );
  }

  const canEdit = owner && answer.canEdit && key !== null;
  const errors: Partial<Record<ReminderCase, string>> = {};
  const next: ReminderSettings = { ...draft };
  for (const c of REMINDER_CASES) {
    if (!c.numbers) continue;
    const p = parseDays(texts[c.key] ?? '', c.numbers);
    if (p.ok) next[c.key] = { ...draft[c.key], days: p.days };
    else if (draft[c.key].on) errors[c.key] = p.error;
  }
  const invalid = Object.keys(errors).length > 0;
  const changed = !sameReminderSettings(next, answer.settings);

  const save = async () => {
    if (!key || busy || invalid) return;
    setBusy(true);
    setError(null);
    try {
      take(await api.saveAutoReminders(key, next));
      setToast("Saved. Members' phones pick this up the next time they open ForgeAI.");
      window.clearTimeout(toastTimer.current);
      toastTimer.current = window.setTimeout(() => setToast(null), 4000);
    } catch (e) {
      console.warn('[ForgeErr] automatic reminders: saving', e);
      setError(failWords(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {error && <ErrorBanner>{error}</ErrorBanner>}
      <Card style={{ marginBottom: space.lg }}>
        <SectionTitle>Automatic reminders</SectionTitle>
        <p style={{ ...quiet, fontSize: 14, color: color.ink }}>
          Members with the ForgeAI app get these on their phone at 9:30 am, never more than one a day. Their phone sets them, so they cost
          nothing. Members can turn them off in the app.
        </p>
        <p style={{ ...quiet, marginTop: space.sm }}>
          {onCount(draft)} of {REMINDER_CASES.length} on
          {answer.updatedByName && answer.updatedAt ? ` · last changed by ${answer.updatedByName}` : ' · the usual ones'}
        </p>
        {!canEdit && <p style={{ ...quiet, marginTop: space.sm }}>Only the owner can change these.</p>}
      </Card>

      {REMINDER_CASES.map((c) => (
        <ReminderRow
          key={c.key}
          info={c}
          gymName={snapshot.gym.name}
          on={draft[c.key].on}
          text={texts[c.key] ?? ''}
          error={errors[c.key] ?? null}
          disabled={!canEdit || busy}
          readOnly={!canEdit}
          onToggle={(v) => setDraft({ ...draft, [c.key]: { ...draft[c.key], on: v } })}
          onText={(t) => setTexts({ ...texts, [c.key]: t })}
        />
      ))}

      {canEdit && (
        <div style={{ display: 'flex', gap: space.sm, flexWrap: 'wrap', marginTop: space.md }}>
          <Button onClick={() => save()} disabled={!changed || invalid || busy}>
            {busy ? 'Saving…' : 'Save changes'}
          </Button>
          {changed && (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setDraft(answer.settings);
                setTexts(textsOf(answer.settings));
              }}
            >
              Undo changes
            </Button>
          )}
        </div>
      )}
      {toast && <Toast message={toast} />}
    </>
  );
}

function ReminderRow({
  info,
  gymName,
  on,
  text,
  error,
  disabled,
  readOnly,
  onToggle,
  onText,
}: {
  info: ReminderCaseInfo;
  gymName: string;
  on: boolean;
  text: string;
  error: string | null;
  disabled: boolean;
  /** The front desk: the days as words, no field. */
  readOnly: boolean;
  onToggle: (v: boolean) => void;
  onText: (t: string) => void;
}) {
  return (
    <Card style={{ marginBottom: space.sm }}>
      <div role="group" aria-label={info.title}>
        {/* A real checkbox with role="switch" inside its label: the whole row is one tap target. */}
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: space.md, minHeight: 44, cursor: disabled ? 'default' : 'pointer' }}>
          <input
            type="checkbox"
            role="switch"
            checked={on}
            disabled={disabled}
            onChange={(e) => onToggle(e.target.checked)}
            style={{ width: 20, height: 20, margin: '2px 0 0', accentColor: color.accent, flexShrink: 0 }}
          />
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontFamily: font.body, fontSize: 15, fontWeight: 700, color: color.ink }}>{info.title}</span>
            <span style={{ display: 'block', ...quiet, marginTop: 2 }}>{info.when}</span>
            <span style={{ display: 'block', ...quiet, marginTop: 4, fontStyle: 'italic' }}>“{exampleFor(info, gymName)}”</span>
          </span>
        </label>
        {info.numbers && on && readOnly && (
          <p style={{ ...quiet, marginTop: space.sm }}>
            {info.numbers.label}: {text}
          </p>
        )}
        {info.numbers && on && !readOnly && (
          <TextField
            label={info.numbers.label}
            value={text}
            onChange={onText}
            inputMode="numeric"
            error={error}
            hint={error ? undefined : info.numbers.most > 1 ? `Up to ${info.numbers.most}, separated by commas.` : undefined}
          />
        )}
      </div>
    </Card>
  );
}
