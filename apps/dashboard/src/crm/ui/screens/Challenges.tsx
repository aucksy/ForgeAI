/**
 * Challenges (R-133, 26 Oct 2026): a monthly challenge for the gym's members, and the leaderboard.
 *
 * The owner sets a goal (workouts, or kg lifted), the days it runs and the free days for EVERYONE who
 * reaches it. Members see it, with how far they have got, on the Gym tab of the MettleUp app. This
 * page shows the one running now with who has reached the goal (name and phone, to copy), the next
 * ones, past ones, and the Leaderboard: the top 10 of the last 30 days with full names, where the
 * owner can hide a member from what members see. Saved on the gym's server (0037), per branch, so it
 * needs the gym online. The owner changes things; the front desk reads. Rules and words:
 * logic/challenges.ts.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '../../auth/AuthProvider';
import { useBranches } from '../../branches/context';
import { todayISO } from '../../logic/dates';
import {
  COUNTED_FROM_PHONE,
  MEMBERS_SEE_CHALLENGE,
  MEMBERS_SEE_LEADERBOARD,
  askWords,
  challengeErrorWords,
  challengePayload,
  draftFromChallenge,
  measureLabel,
  newDraft,
  pastChallenges,
  periodWords,
  prizeWords,
  reachedWords,
  runningChallenge,
  statusLabel,
  upcomingChallenges,
  valueWords,
  whenWords,
  winnersText,
  withMeasure,
  type BoardAnswer,
  type BoardRow,
  type Challenge,
  type ChallengeDraft,
  type ChallengeMeasure,
  type ChallengesAnswer,
} from '../../logic/challenges';
import { isNoSuchFunction } from '../../logic/workoutOffer';
import * as challengesApi from '../../shop/challengesApi';
import { copyText } from '../../shop/JoinCode';
import { errorWords } from '../../shop/logic';
import {
  Button,
  Card,
  ChipToggle,
  EmptyState,
  ErrorBanner,
  PageHeader,
  Pill,
  SectionTitle,
  Sheet,
  TextField,
  Toast,
  color,
  font,
  radius,
  space,
} from '../kit';
import { navigate } from '../router';

type Load = { state: 'loading' } | { state: 'missing' } | { state: 'error'; message: string } | { state: 'ready'; challenges: ChallengesAnswer; board: BoardAnswer };

const quiet = { margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary } as const;
const small = { ...quiet, fontSize: 13 } as const;

function failWords(e: unknown): string {
  return challengeErrorWords(e) ?? errorWords(e);
}

export function ChallengesScreen() {
  const { session } = useAuth();
  const online = Boolean(session?.online);
  const key = online ? (session?.ownerKey ?? null) : null;
  const { multi, branches, currentGymId } = useBranches();
  const branchName = multi ? branches.find((b) => b.gymId === currentGymId)?.name ?? null : null;
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);
  const flash = useCallback((m: string) => {
    setToast(m);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3500);
  }, []);

  const fetchAll = useCallback(async () => {
    if (!key) return;
    try {
      const [challenges, board] = await Promise.all([challengesApi.getChallenges(key), challengesApi.getBoard(key)]);
      setLoad({ state: 'ready', challenges, board });
    } catch (e) {
      if (isNoSuchFunction(e)) return setLoad({ state: 'missing' });
      console.warn('[ForgeErr] challenges: reading', e);
      setLoad({ state: 'error', message: failWords(e) });
    }
  }, [key]);

  useEffect(() => {
    setLoad({ state: 'loading' });
    void fetchAll();
  }, [fetchAll]);

  return (
    <>
      <PageHeader
        title="Challenges"
        subtitle={
          branchName
            ? `A challenge for ${branchName}’s members. Each branch has its own.`
            : 'A challenge for your members. Everyone who reaches the goal wins.'
        }
      />
      {!online || !key ? (
        <Card>
          <EmptyState
            title="Challenges need your gym online"
            body="Members’ phones read the challenge from your gym’s server. Put your gym online first (Settings → Put your gym online)."
          />
        </Card>
      ) : load.state === 'missing' ? (
        <Card>
          <EmptyState title="Challenges are not switched on for your gym yet" body="They will appear here once your gym’s server has them." />
        </Card>
      ) : load.state === 'error' ? (
        <Card>
          <ErrorBanner>{load.message}</ErrorBanner>
          <Button variant="ghost" onClick={() => void fetchAll()}>
            Try again
          </Button>
        </Card>
      ) : load.state === 'loading' ? (
        <p style={quiet}>Loading…</p>
      ) : (
        <Ready ownerKey={key} challenges={load.challenges} board={load.board} reload={fetchAll} flash={flash} />
      )}
      {toast && <Toast message={toast} />}
    </>
  );
}

// ---------------------------------------------------------------- the page

function Ready({
  ownerKey,
  challenges,
  board,
  reload,
  flash,
}: {
  ownerKey: string;
  challenges: ChallengesAnswer;
  board: BoardAnswer;
  reload: () => Promise<void>;
  flash: (m: string) => void;
}) {
  const today = todayISO();
  const canEdit = challenges.canEdit;
  const running = runningChallenge(challenges.challenges);
  const next = upcomingChallenges(challenges.challenges);
  const past = pastChallenges(challenges.challenges);
  const [form, setForm] = useState<ChallengeDraft | null>(null);
  const [cancelling, setCancelling] = useState<Challenge | null>(null);
  const closeForm = useCallback(() => setForm(null), []);
  const closeCancel = useCallback(() => setCancelling(null), []);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const cancel = async () => {
    if (!cancelling) return;
    setCancelError(null);
    try {
      await challengesApi.cancelChallenge(ownerKey, cancelling.id);
      setCancelling(null);
      await reload();
      flash('Challenge cancelled. Members no longer see it.');
    } catch (e) {
      console.warn('[ForgeErr] challenges: cancelling', e);
      setCancelError(failWords(e));
    }
  };

  return (
    <>
      {canEdit ? (
        <div style={{ marginBottom: space.lg }}>
          <Button needsInternet onClick={() => setForm(newDraft(today))}>
            New challenge
          </Button>
        </div>
      ) : (
        <p style={{ ...small, marginBottom: space.lg }}>Only the owner can start, change or cancel a challenge. You can see who has reached the goal.</p>
      )}

      {running ? (
        <ChallengeCard c={running} today={today} canEdit={canEdit} onCancel={() => setCancelling(running)} flash={flash} showWinners />
      ) : (
        <Card style={{ marginBottom: space.lg }}>
          <SectionTitle>No challenge is running</SectionTitle>
          <p style={quiet}>
            {canEdit
              ? 'Start one to give members a goal for the month. Everyone who reaches it wins free days.'
              : 'The owner has not started one.'}
          </p>
        </Card>
      )}

      {next.map((c) => (
        <ChallengeCard
          key={c.id}
          c={c}
          today={today}
          canEdit={canEdit}
          onChange={() => setForm(draftFromChallenge(c))}
          onCancel={() => setCancelling(c)}
          flash={flash}
        />
      ))}

      <Leaderboard ownerKey={ownerKey} board={board} canEdit={canEdit} reload={reload} flash={flash} />

      {past.length > 0 && (
        <Card style={{ marginBottom: space.lg }}>
          <SectionTitle>Past challenges</SectionTitle>
          <div style={{ display: 'grid', gap: space.md }}>
            {past.map((c) => (
              <PastRow key={c.id} c={c} flash={flash} />
            ))}
          </div>
        </Card>
      )}

      {form && (
        <ChallengeForm
          ownerKey={ownerKey}
          start={form}
          today={today}
          onClose={closeForm}
          onSaved={async () => {
            setForm(null);
            await reload();
            flash('Challenge saved. Members see it in the MettleUp app within 10 minutes.');
          }}
        />
      )}

      {cancelling && (
        <Sheet
          title="Cancel this challenge?"
          onClose={closeCancel}
          footer={
            <>
              <Button variant="ghost" onClick={closeCancel}>
                Keep it
              </Button>
              <Button tone="danger" needsInternet onClick={() => void cancel()}>
                Cancel challenge
              </Button>
            </>
          }
        >
          {cancelError && <ErrorBanner>{cancelError}</ErrorBanner>}
          <p style={quiet}>
            “{cancelling.title}” will disappear from members’ phones. Nobody gets free days for it. This cannot be undone, but you can start a new one.
          </p>
        </Sheet>
      )}
    </>
  );
}

// ---------------------------------------------------------------- one challenge

function Winners({ c, canEdit, flash }: { c: Challenge; canEdit: boolean; flash: (m: string) => void }) {
  const copy = async () => {
    const ok = await copyText(winnersText(c));
    flash(ok ? 'List copied. You can paste it into WhatsApp.' : 'Could not copy. Select the names and copy them by hand.');
  };
  return (
    <div style={{ marginTop: space.md }}>
      <p style={{ ...quiet, color: color.ink, fontWeight: 700 }}>{reachedWords(c)}</p>
      {c.hitters.length > 0 && (
        <>
          <ul aria-label={`Members who reached the goal of ${c.title}`} style={{ margin: `${space.sm}px 0 0`, padding: 0, listStyle: 'none', display: 'grid', gap: space.xs }}>
            {c.hitters.map((h) => (
              <li
                key={h.memberId}
                style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm, justifyContent: 'space-between', fontFamily: font.body, fontSize: 14, color: color.ink }}
              >
                <span style={{ fontWeight: 700 }}>{h.name}</span>
                <span style={{ color: color.inkSecondary }}>{[h.phone, valueWords(c.measure, h.value)].filter(Boolean).join(' · ')}</span>
              </li>
            ))}
          </ul>
          <p style={{ ...small, marginTop: space.sm }}>{COUNTED_FROM_PHONE}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm, marginTop: space.md }}>
            <Button variant="ghost" onClick={copy}>
              Copy this list
            </Button>
            {c.status !== 'cancelled' && (
              <Button variant="quiet" onClick={() => navigate('/members')}>
                Open Members
              </Button>
            )}
          </div>
          {c.prizeDays > 0 && c.status !== 'cancelled' && (
            <p style={{ ...small, marginTop: space.sm }}>
              {canEdit
                ? `To give the ${prizeWords(c.prizeDays)}: open the member and tap Freeze / extra days.`
                : `The owner gives the ${prizeWords(c.prizeDays)} (the member’s page, Freeze / extra days). Share this list with them.`}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function ChallengeCard({
  c,
  today,
  canEdit,
  onChange,
  onCancel,
  flash,
  showWinners,
}: {
  c: Challenge;
  today: string;
  canEdit: boolean;
  onChange?: () => void;
  onCancel: () => void;
  flash: (m: string) => void;
  showWinners?: boolean;
}) {
  return (
    <Card style={{ marginBottom: space.lg }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm, alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0, fontFamily: font.display, fontSize: 18, fontWeight: 700, color: color.ink }}>{c.title}</h2>
        <Pill tone={c.status === 'running' ? 'good' : 'accent'}>{statusLabel(c.status)}</Pill>
      </div>
      <p style={{ ...quiet, marginTop: space.xs, color: color.ink }}>{askWords(c)}</p>
      <p style={{ ...small, marginTop: space.xs }}>
        {periodWords(c)} · {whenWords(c, today)}
      </p>
      {showWinners && <Winners c={c} canEdit={canEdit} flash={flash} />}
      <p style={{ ...small, marginTop: space.md }}>{MEMBERS_SEE_CHALLENGE}</p>
      {canEdit && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm, marginTop: space.md }}>
          {onChange && (
            <Button variant="ghost" needsInternet onClick={onChange}>
              Change
            </Button>
          )}
          <Button variant="quiet" tone="danger" needsInternet onClick={onCancel}>
            Cancel challenge
          </Button>
        </div>
      )}
    </Card>
  );
}

function PastRow({ c, flash }: { c: Challenge; flash: (m: string) => void }) {
  return (
    <details style={{ borderTop: `1px solid ${color.border}`, paddingTop: space.sm }}>
      <summary style={{ cursor: 'pointer', fontFamily: font.body, fontSize: 15, color: color.ink }}>
        <strong>{c.title}</strong>
        <span style={{ color: color.inkSecondary }}>
          {' · '}
          {periodWords(c)}
          {' · '}
          {c.status === 'cancelled' ? 'Cancelled' : `${c.hitters.length} reached the goal`}
        </span>
      </summary>
      <p style={{ ...small, marginTop: space.sm }}>{askWords(c)}</p>
      {c.status !== 'cancelled' && <Winners c={c} canEdit={false} flash={flash} />}
    </details>
  );
}

// ---------------------------------------------------------------- the form

function ChallengeForm({
  ownerKey,
  start,
  today,
  onClose,
  onSaved,
}: {
  ownerKey: string;
  start: ChallengeDraft;
  today: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [d, setD] = useState<ChallengeDraft>(start);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const checked = useMemo(() => challengePayload(d, today), [d, today]);
  const set = (next: ChallengeDraft) => {
    setError(null);
    setD(next);
  };

  const save = async () => {
    if (saving) return;
    if (!checked.payload) return setError(checked.problem);
    setSaving(true);
    setError(null);
    try {
      await challengesApi.saveChallenge(ownerKey, checked.payload);
      await onSaved();
    } catch (e) {
      console.warn('[ForgeErr] challenges: saving', e);
      setError(failWords(e));
      setSaving(false);
    }
  };

  const preview = checked.payload
    ? `Runs ${periodWords(checked.payload)}. ${askWords(checked.payload)}.`
    : null;

  return (
    <Sheet
      title={d.id ? 'Change the challenge' : 'New challenge'}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Not now
          </Button>
          <Button needsInternet disabled={saving} onClick={save}>
            {saving ? 'Saving…' : d.id ? 'Save changes' : 'Start challenge'}
          </Button>
        </>
      }
    >
      {error && <ErrorBanner>{error}</ErrorBanner>}
      <TextField label="Name" value={d.title} onChange={(v) => set({ ...d, title: v })} placeholder="November challenge" hint="Members see this name. At most 60 letters." />
      <div style={{ marginTop: space.md }}>
        <ChipToggle
          variant="tabs"
          label="What counts"
          options={[
            { value: 'workouts', label: 'Workouts' },
            { value: 'kg', label: 'Kg lifted' },
          ]}
          value={d.measure}
          onChange={(v) => set(withMeasure(d, v as ChallengeMeasure))}
        />
      </div>
      <TextField
        label={d.measure === 'kg' ? 'Goal (kg lifted in total)' : 'Goal (number of workouts)'}
        value={d.goal}
        onChange={(v) => set({ ...d, goal: v })}
        inputMode="decimal"
        hint={d.measure === 'kg' ? 'Total kg a member lifts in these days, counted from the app.' : 'The app counts up to 3 workouts a day for each member.'}
      />
      <TextField label="First day" type="date" value={d.startsOn} onChange={(v) => set({ ...d, startsOn: v })} hint="Today or a later day, up to 60 days from today." />
      <TextField label="How many days" value={d.days} onChange={(v) => set({ ...d, days: v })} inputMode="numeric" hint="From 7 to 31 days." />
      <TextField
        label="Free days for everyone who reaches the goal"
        value={d.prizeDays}
        onChange={(v) => set({ ...d, prizeDays: v })}
        inputMode="numeric"
        hint="From 0 to 60. You give them yourself when members show their phone."
      />
      <p aria-live="polite" style={{ ...quiet, marginTop: space.md, color: color.ink }}>
        {preview ?? 'Fill in the boxes above to see what members will read.'}
      </p>
    </Sheet>
  );
}

// ---------------------------------------------------------------- the leaderboard

function Leaderboard({
  ownerKey,
  board,
  canEdit,
  reload,
  flash,
}: {
  ownerKey: string;
  board: BoardAnswer;
  canEdit: boolean;
  reload: () => Promise<void>;
  flash: (m: string) => void;
}) {
  const [tab, setTab] = useState<ChallengeMeasure>('workouts');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rows = tab === 'kg' ? board.kg : board.workouts;

  const hide = async (memberId: string, name: string, hidden: boolean) => {
    if (busy) return;
    setBusy(memberId);
    setError(null);
    try {
      await challengesApi.hideOnBoard(ownerKey, memberId, hidden);
      await reload();
      flash(hidden ? `${name} is hidden from the leaderboard.` : `${name} is on the leaderboard again.`);
    } catch (e) {
      console.warn('[ForgeErr] challenges: hiding on the leaderboard', e);
      setError(failWords(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card style={{ marginBottom: space.lg }}>
      <SectionTitle>Leaderboard · last 30 days</SectionTitle>
      <p style={small}>
        {board.members === 0 ? 'No member has logged a workout in the last 30 days yet.' : `${board.members} of your members trained in the last 30 days.`} {MEMBERS_SEE_LEADERBOARD}
      </p>
      {error && <ErrorBanner>{error}</ErrorBanner>}
      <div style={{ marginTop: space.md }}>
        <ChipToggle
          variant="tabs"
          label="Rank by"
          options={[
            { value: 'workouts', label: measureLabel('workouts') },
            { value: 'kg', label: measureLabel('kg') },
          ]}
          value={tab}
          onChange={(v) => setTab(v as ChallengeMeasure)}
        />
      </div>
      {rows.length === 0 ? (
        <p style={{ ...quiet, marginTop: space.md }}>Nobody to show yet. Totals appear after members train and open the MettleUp app.</p>
      ) : (
        <ol aria-label={`Top ${rows.length} by ${measureLabel(tab).toLowerCase()}`} style={{ margin: `${space.md}px 0 0`, padding: 0, listStyle: 'none', display: 'grid', gap: space.sm }}>
          {rows.map((r) => (
            <BoardLine key={r.memberId} row={r} measure={tab} canEdit={canEdit} busy={busy === r.memberId} onHide={(hidden) => void hide(r.memberId, r.name, hidden)} />
          ))}
        </ol>
      )}

      {board.hiddenMembers.length > 0 && (
        <div style={{ marginTop: space.lg }}>
          <p style={{ ...quiet, color: color.ink, fontWeight: 700 }}>Hidden from members</p>
          <ul aria-label="Hidden from the leaderboard" style={{ margin: `${space.xs}px 0 0`, padding: 0, listStyle: 'none', display: 'grid', gap: space.xs }}>
            {board.hiddenMembers.map((h) => (
              <li key={h.memberId} style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm, alignItems: 'center', justifyContent: 'space-between', fontFamily: font.body, fontSize: 14, color: color.ink }}>
                <span>{h.name}</span>
                {canEdit && (
                  <Button variant="quiet" needsInternet disabled={busy === h.memberId} ariaLabel={`Show ${h.name} on the leaderboard again`} onClick={() => void hide(h.memberId, h.name, false)}>
                    Show again
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function BoardLine({ row, measure, canEdit, busy, onHide }: { row: BoardRow; measure: ChallengeMeasure; canEdit: boolean; busy: boolean; onHide: (hidden: boolean) => void }) {
  return (
    <li
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: space.sm,
        padding: `${space.xs}px ${space.sm}px`,
        border: `1px solid ${color.border}`,
        borderRadius: radius.md,
        opacity: row.hidden ? 0.7 : 1,
      }}
    >
      <span style={{ minWidth: 28, fontFamily: font.display, fontWeight: 700, color: color.ink }}>{row.rank}</span>
      <span style={{ flex: 1, minWidth: 120, fontFamily: font.body, fontSize: 14, color: color.ink }}>
        <strong>{row.name}</strong>
        {row.phone && <span style={{ color: color.inkSecondary }}>{` · ${row.phone}`}</span>}
      </span>
      <span style={{ fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>{valueWords(measure, row.value)}</span>
      {row.hidden && <Pill>Hidden</Pill>}
      {canEdit && (
        <Button
          variant="quiet"
          needsInternet
          disabled={busy}
          ariaLabel={row.hidden ? `Show ${row.name} on the leaderboard again` : `Hide ${row.name} from the leaderboard`}
          onClick={() => onHide(!row.hidden)}
        >
          {row.hidden ? 'Show again' : 'Hide from the leaderboard'}
        </Button>
      )}
    </li>
  );
}
