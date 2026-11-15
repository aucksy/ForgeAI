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
import { t } from '../../lang/lang';
import { diffDays, formatDay, formatDayShort, todayISO } from '../../logic/dates';
import {
  READY_WORDS,
  readyAsk,
  readyDraft,
  readyMatch,
  readyOnToast,
  readyReward,
  readyShown,
  readyStart,
  readyState,
  readyTurnOnLabel,
  readyWaits,
  type Line,
  type ReadyChallenge,
} from '../../logic/readyChallenges';
import {
  MEMBERS_SEE_CHALLENGE,
  MEMBERS_SEE_LEADERBOARD,
  askWords,
  challengeErrorWords,
  challengePayload,
  confirmedWords,
  countedWords,
  draftFromChallenge,
  giveAllLabel,
  giveLabel,
  measureLabel,
  needsConfirm,
  needsHand,
  newDraft,
  pastChallenges,
  pastSummary,
  periodWords,
  prizeNote,
  reachedWords,
  rewardWords,
  runningChallenge,
  statusLabel,
  upcomingChallenges,
  valueWords,
  whenWords,
  winnersText,
  withMeasure,
  type BoardAnswer,
  type BoardMeasure,
  type BoardRow,
  type Challenge,
  type ChallengeDraft,
  type ChallengeMeasure,
  type ChallengePayload,
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
import { DayField } from '../DayField';
import { navigate } from '../router';

type Load = { state: 'loading' } | { state: 'missing' } | { state: 'error'; message: string } | { state: 'ready'; challenges: ChallengesAnswer; board: BoardAnswer };

const quiet = { margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary } as const;
const small = { ...quiet, fontSize: 13 } as const;

function failWords(e: unknown): string {
  return challengeErrorWords(e) ?? errorWords(e);
}

/** A line from logic/readyChallenges.ts in the owner's language (English or Hinglish). */
const tl = (l: Line): string => t(l.en, l.vars);

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
        title={t('Challenges')}
        subtitle={
          branchName
            ? t('A challenge for {branch}’s members. Each branch has its own.', { branch: branchName })
            : t('A challenge for your members. Everyone who reaches the goal wins.')
        }
      />
      {!online || !key ? (
        <Card>
          <EmptyState
            title={t('Challenges need your gym online')}
            body={t('Members’ phones read the challenge from your gym’s server. Put your gym online first (Settings → Sign-in & data).')}
          />
        </Card>
      ) : load.state === 'missing' ? (
        <Card>
          <EmptyState title={t('Challenges are not switched on for your gym yet')} body={t('They will appear here once your gym’s server has them.')} />
        </Card>
      ) : load.state === 'error' ? (
        <Card>
          <ErrorBanner>{load.message}</ErrorBanner>
          <Button variant="ghost" onClick={() => void fetchAll()}>
            {t('Try again')}
          </Button>
        </Card>
      ) : load.state === 'loading' ? (
        <p style={quiet}>{t('Loading…')}</p>
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
  // The form is either a challenge of the owner's own, or a ready-made card's (`ready`: name and measure fixed).
  const [form, setForm] = useState<{ draft: ChallengeDraft; ready: boolean } | null>(null);
  // `ready`: turned off from a ready-made card (its own words), else cancelled from the challenge's card.
  const [cancelling, setCancelling] = useState<{ c: Challenge; ready: boolean } | null>(null);
  const closeForm = useCallback(() => setForm(null), []);
  const closeCancel = useCallback(() => setCancelling(null), []);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const cards = readyShown(challenges);

  const cancel = async () => {
    if (!cancelling) return;
    setCancelError(null);
    try {
      await challengesApi.cancelChallenge(ownerKey, cancelling.c.id);
      setCancelling(null);
      await reload();
      flash(cancelling.ready ? t(READY_WORDS.toastOff, { title: cancelling.c.title }) : t('Challenge cancelled. Members no longer see it.'));
    } catch (e) {
      console.warn('[ForgeErr] challenges: cancelling', e);
      setCancelError(failWords(e));
    }
  };

  // One tap: the card's own numbers, from today or the day after the challenge in its way ends.
  const turnOn = async (r: ReadyChallenge) => {
    if (busy) return;
    const start = readyStart(challenges.challenges, r.days, today);
    if (!start) return flash(t(READY_WORDS.blocked));
    const { payload, problem } = challengePayload(readyDraft(r, start.startsOn), today);
    if (!payload) return flash(problem ?? '');
    setBusy(r.id);
    try {
      await challengesApi.saveChallenge(ownerKey, payload);
      await reload();
      flash(tl(readyOnToast(r.title, payload.startsOn, today, false)));
    } catch (e) {
      console.warn('[ForgeErr] challenges: turning on a ready-made challenge', e);
      flash(failWords(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <ReadyList
        cards={cards}
        list={challenges.challenges}
        today={today}
        canEdit={canEdit}
        busy={busy}
        onTurnOn={(r) => void turnOn(r)}
        onChange={(r, on) => {
          if (on) return setForm({ draft: draftFromChallenge(on), ready: true });
          const start = readyStart(challenges.challenges, r.days, today);
          setForm({ draft: readyDraft(r, start?.startsOn ?? today), ready: true });
        }}
        onTurnOff={(c) => setCancelling({ c, ready: true })}
      />

      {canEdit ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: space.md, marginBottom: space.lg }}>
          <Button variant="ghost" needsInternet onClick={() => setForm({ draft: newDraft(today), ready: false })}>
            {t('New challenge')}
          </Button>
          <p style={{ ...small, flex: '1 1 220px' }}>{t(READY_WORDS.ownLine)}</p>
        </div>
      ) : (
        <p style={{ ...small, marginBottom: space.lg }}>{t('Only the owner can start, change or cancel a challenge. You can see who has reached the goal.')}</p>
      )}

      {running ? (
        <ChallengeCard
          c={running}
          today={today}
          canEdit={canEdit}
          autoRewards={challenges.autoRewards}
          onCancel={() => setCancelling({ c: running, ready: false })}
          flash={flash}
          ownerKey={ownerKey}
          reload={reload}
          showWinners
        />
      ) : (
        <Card style={{ marginBottom: space.lg }}>
          <SectionTitle>{t('No challenge is running')}</SectionTitle>
          <p style={quiet}>
            {canEdit
              ? cards.length > 0
                ? t('Turn on a ready-made challenge above, or make your own with “New challenge”.')
                : t('Start one to give members a goal for the month. Everyone who reaches it wins free days.')
              : t('The owner has not started one.')}
          </p>
        </Card>
      )}

      {next.map((c) => (
        <ChallengeCard
          key={c.id}
          c={c}
          today={today}
          canEdit={canEdit}
          autoRewards={challenges.autoRewards}
          onChange={() => setForm({ draft: draftFromChallenge(c), ready: false })}
          onCancel={() => setCancelling({ c, ready: false })}
          flash={flash}
          ownerKey={ownerKey}
          reload={reload}
        />
      ))}

      <Leaderboard ownerKey={ownerKey} board={board} canEdit={canEdit} reload={reload} flash={flash} />

      {past.length > 0 && (
        <Card style={{ marginBottom: space.lg }}>
          <SectionTitle>{t('Past challenges')}</SectionTitle>
          <div style={{ display: 'grid', gap: space.md }}>
            {past.map((c) => (
              <PastRow key={c.id} c={c} canEdit={canEdit} autoRewards={challenges.autoRewards} flash={flash} ownerKey={ownerKey} reload={reload} />
            ))}
          </div>
        </Card>
      )}

      {form && (
        <ChallengeForm
          ownerKey={ownerKey}
          start={form.draft}
          ready={form.ready}
          checkins={challenges.checkins}
          today={today}
          onClose={closeForm}
          onSaved={async (p) => {
            const ready = form.ready;
            setForm(null);
            await reload();
            flash(ready ? tl(readyOnToast(p.title, p.startsOn, today, Boolean(p.id))) : t('Challenge saved. Members see it in the MettleUp app within 10 minutes.'));
          }}
        />
      )}

      {cancelling && (
        <Sheet
          title={cancelling.ready ? t(READY_WORDS.offTitle) : t('Cancel this challenge?')}
          onClose={closeCancel}
          footer={
            <>
              <Button variant="ghost" onClick={closeCancel}>
                {cancelling.ready ? t(READY_WORDS.keepOn) : t('Keep it')}
              </Button>
              <Button tone="danger" needsInternet onClick={() => void cancel()}>
                {cancelling.ready ? t(READY_WORDS.turnOff) : t('Cancel challenge')}
              </Button>
            </>
          }
        >
          {cancelError && <ErrorBanner>{cancelError}</ErrorBanner>}
          <p style={quiet}>
            {cancelling.ready
              ? t(READY_WORDS.offBody, { title: cancelling.c.title })
              : t('“{title}” will disappear from members’ phones. Nobody gets free days for it. This cannot be undone, but you can start a new one.', { title: cancelling.c.title })}
          </p>
        </Sheet>
      )}
    </>
  );
}

// ---------------------------------------------------------------- ready-made challenges

function ReadyList({
  cards,
  list,
  today,
  canEdit,
  busy,
  onTurnOn,
  onChange,
  onTurnOff,
}: {
  cards: readonly ReadyChallenge[];
  list: readonly Challenge[];
  today: string;
  canEdit: boolean;
  busy: string | null;
  onTurnOn: (r: ReadyChallenge) => void;
  onChange: (r: ReadyChallenge, on: Challenge | null) => void;
  onTurnOff: (c: Challenge) => void;
}) {
  if (cards.length === 0) return null;
  return (
    <Card style={{ marginBottom: space.lg }}>
      <SectionTitle>{t(READY_WORDS.section)}</SectionTitle>
      <p style={quiet}>{t(READY_WORDS.intro)}</p>
      {!canEdit && <p style={{ ...small, marginTop: space.xs }}>{t(READY_WORDS.deskOnly)}</p>}
      <ul
        aria-label={t(READY_WORDS.section)}
        style={{ margin: `${space.md}px 0 0`, padding: 0, listStyle: 'none', display: 'grid', gap: space.md, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))' }}
      >
        {cards.map((r) => (
          <ReadyCard
            key={r.id}
            r={r}
            list={list}
            today={today}
            canEdit={canEdit}
            busy={busy === r.id}
            anyBusy={busy !== null}
            onTurnOn={() => onTurnOn(r)}
            onChange={(on) => onChange(r, on)}
            onTurnOff={onTurnOff}
          />
        ))}
      </ul>
    </Card>
  );
}

function ReadyCard({
  r,
  list,
  today,
  canEdit,
  busy,
  anyBusy,
  onTurnOn,
  onChange,
  onTurnOff,
}: {
  r: ReadyChallenge;
  list: readonly Challenge[];
  today: string;
  canEdit: boolean;
  busy: boolean;
  anyBusy: boolean;
  onTurnOn: () => void;
  onChange: (on: Challenge | null) => void;
  onTurnOff: (c: Challenge) => void;
}) {
  const on = readyMatch(r, list);
  const start = on ? null : readyStart(list, r.days, today);
  // An "on" card shows the numbers the owner saved; an "off" card the ready-made ones.
  const goal = on ? on.goal : r.goal;
  const days = on ? diffDays(on.startsOn, on.endsOn) + 1 : r.days;
  const prize = on ? on.prizeDays : r.prizeDays;
  const waits = on ? null : readyWaits(start);
  return (
    <li
      data-testid={`ready-${r.id}`}
      aria-label={r.title}
      style={{
        display: 'grid',
        gap: space.xs,
        alignContent: 'start',
        padding: space.md,
        border: `1px solid ${on ? color.accent : color.border}`,
        borderRadius: radius.md,
        background: color.surface,
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm, alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0, fontFamily: font.display, fontSize: 16, fontWeight: 700, color: color.ink }}>{r.title}</h3>
        <Pill tone={on ? 'good' : 'muted'}>{on ? t(READY_WORDS.on) : t(READY_WORDS.off)}</Pill>
      </div>
      <p style={quiet}>{t(r.why)}</p>
      <p style={{ ...quiet, color: color.ink }}>
        {tl(readyAsk(r.measure, goal, days))} {tl(readyReward(prize))}
      </p>
      <p style={{ ...small, fontWeight: on ? 700 : 400, color: on ? color.ink : color.inkSecondary }}>{tl(readyState(on))}</p>
      {canEdit && waits && <p style={small}>{tl(waits)}</p>}
      {canEdit && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm, marginTop: space.xs }}>
          {!on && start && (
            <Button needsInternet disabled={anyBusy} onClick={onTurnOn} ariaLabel={`${tl(readyTurnOnLabel(start))}: ${r.title}`}>
              {busy ? t(READY_WORDS.saving) : tl(readyTurnOnLabel(start))}
            </Button>
          )}
          {(!on ? start !== null : on.status === 'upcoming') && (
            <Button variant="ghost" needsInternet disabled={anyBusy} onClick={() => onChange(on)} ariaLabel={`${t(READY_WORDS.change)}: ${r.title}`}>
              {t(READY_WORDS.change)}
            </Button>
          )}
          {on && (
            <Button variant="quiet" tone="danger" needsInternet disabled={anyBusy} onClick={() => onTurnOff(on)} ariaLabel={`${t(READY_WORDS.turnOff)}: ${r.title}`}>
              {t(READY_WORDS.turnOff)}
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------- one challenge

type WinnerLinks = { ownerKey: string; reload: () => Promise<void> };

function Winners({
  c,
  canEdit,
  autoRewards,
  flash,
  ownerKey,
  reload,
}: {
  c: Challenge;
  canEdit: boolean;
  autoRewards: boolean;
  flash: (m: string) => void;
} & WinnerLinks) {
  // F143: under the list, how the free days reach the winners (by themselves, or by hand).
  const note = prizeNote(c, canEdit, autoRewards);
  // 0048: a finished challenge's winners wait for the owner's Give or Skip (the desk only reads).
  const waiting = canEdit ? c.hitters.filter(needsConfirm) : [];
  const [busy, setBusy] = useState<string | null>(null);
  const confirm = async (who: Challenge['hitters'], give: boolean, one: string | null) => {
    setBusy(one ?? 'all');
    let last = '';
    try {
      for (const h of who) {
        const r = await challengesApi.confirmChallengeReward(ownerKey, c.id, h.memberId, give);
        last = confirmedWords(h.name, r);
      }
      flash(who.length === 1 ? last : t('Done for {n} winners. Each line says what happened.', { n: who.length }));
    } catch (e) {
      console.warn('[ForgeErr] challenges: giving free days', e);
      flash(failWords(e));
    } finally {
      await reload();
      setBusy(null);
    }
  };
  const copy = async () => {
    const ok = await copyText(winnersText(c));
    flash(ok ? t('List copied. You can paste it into WhatsApp.') : t('Could not copy. Select the names and copy them by hand.'));
  };
  return (
    <div style={{ marginTop: space.md }}>
      <p style={{ ...quiet, color: color.ink, fontWeight: 700 }}>{reachedWords(c)}</p>
      {c.hitters.length > 0 && (
        <>
          <ul aria-label={t('Members who reached the goal of {title}', { title: c.title })} style={{ margin: `${space.sm}px 0 0`, padding: 0, listStyle: 'none', display: 'grid', gap: space.xs }}>
            {c.hitters.map((h) => {
              const ask = canEdit && needsConfirm(h);
              const reward = ask ? null : rewardWords(h);
              return (
                <li
                  key={h.memberId}
                  style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm, justifyContent: 'space-between', fontFamily: font.body, fontSize: 14, color: color.ink }}
                >
                  <span style={{ fontWeight: 700 }}>{h.name}</span>
                  <span style={{ color: color.inkSecondary }}>{[h.phone, valueWords(c.measure, h.value)].filter(Boolean).join(' · ')}</span>
                  {reward && (
                    <span style={{ flexBasis: '100%', fontSize: 13, fontWeight: needsHand(h) ? 700 : 400, color: needsHand(h) ? color.ink : color.inkSecondary }}>
                      {reward}
                    </span>
                  )}
                  {ask && h.reward && (
                    <span style={{ flexBasis: '100%', display: 'flex', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' }}>
                      <Button
                        needsInternet
                        disabled={busy !== null}
                        onClick={() => void confirm([h], true, h.memberId)}
                        ariaLabel={`${giveLabel(h.reward.days)}: ${h.name}`}
                      >
                        {busy === h.memberId ? t('Saving…') : giveLabel(h.reward.days)}
                      </Button>
                      <Button variant="ghost" needsInternet disabled={busy !== null} onClick={() => void confirm([h], false, h.memberId)} ariaLabel={`${t('Skip')}: ${h.name}`}>
                        {t('Skip')}
                      </Button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <p style={{ ...small, marginTop: space.sm }}>{countedWords(c.measure)}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm, marginTop: space.md }}>
            {waiting.length > 1 && (
              <Button needsInternet disabled={busy !== null} onClick={() => void confirm(waiting, true, null)}>
                {busy === 'all' ? t('Saving…') : giveAllLabel(waiting.length)}
              </Button>
            )}
            <Button variant="ghost" onClick={copy}>
              {t('Copy this list')}
            </Button>
            {c.status !== 'cancelled' && (
              <Button variant="quiet" onClick={() => navigate('/members')}>
                {t('Open Members')}
              </Button>
            )}
          </div>
          {note && <p style={{ ...small, marginTop: space.sm }}>{note}</p>}
        </>
      )}
    </div>
  );
}

function ChallengeCard({
  c,
  today,
  canEdit,
  autoRewards,
  onChange,
  onCancel,
  flash,
  showWinners,
  ownerKey,
  reload,
}: {
  c: Challenge;
  today: string;
  canEdit: boolean;
  autoRewards: boolean;
  onChange?: () => void;
  onCancel: () => void;
  flash: (m: string) => void;
  showWinners?: boolean;
} & WinnerLinks) {
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
      {showWinners && <Winners c={c} canEdit={canEdit} autoRewards={autoRewards} flash={flash} ownerKey={ownerKey} reload={reload} />}
      <p style={{ ...small, marginTop: space.md }}>{t(MEMBERS_SEE_CHALLENGE)}</p>
      {canEdit && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm, marginTop: space.md }}>
          {onChange && (
            <Button variant="ghost" needsInternet onClick={onChange}>
              {t('Change')}
            </Button>
          )}
          <Button variant="quiet" tone="danger" needsInternet onClick={onCancel}>
            {t('Cancel challenge')}
          </Button>
        </div>
      )}
    </Card>
  );
}

function PastRow({
  c,
  canEdit,
  autoRewards,
  flash,
  ownerKey,
  reload,
}: { c: Challenge; canEdit: boolean; autoRewards: boolean; flash: (m: string) => void } & WinnerLinks) {
  return (
    <details style={{ borderTop: `1px solid ${color.border}`, paddingTop: space.sm }}>
      <summary style={{ cursor: 'pointer', fontFamily: font.body, fontSize: 15, color: color.ink }}>
        <strong>{c.title}</strong>
        <span style={{ color: color.inkSecondary }}>
          {' · '}
          {periodWords(c)}
          {' · '}
          {c.status === 'cancelled' ? t('Cancelled') : pastSummary(c)}
        </span>
      </summary>
      <p style={{ ...small, marginTop: space.sm }}>{askWords(c)}</p>
      {c.status !== 'cancelled' && <Winners c={c} canEdit={canEdit} autoRewards={autoRewards} flash={flash} ownerKey={ownerKey} reload={reload} />}
    </details>
  );
}

// ---------------------------------------------------------------- the form

function ChallengeForm({
  ownerKey,
  start,
  ready,
  checkins,
  today,
  onClose,
  onSaved,
}: {
  ownerKey: string;
  start: ChallengeDraft;
  /** A ready-made card's form: its name and what counts stay as they are; Save turns it on. */
  ready: boolean;
  /** 0091: the gym's server can count visits, so "Visits" is offered. */
  checkins: boolean;
  today: string;
  onClose: () => void;
  onSaved: (payload: ChallengePayload) => Promise<void>;
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
      await onSaved(checked.payload);
    } catch (e) {
      console.warn('[ForgeErr] challenges: saving', e);
      setError(failWords(e));
      setSaving(false);
    }
  };

  // What members will read, in the owner's language: the dates, the goal, the reward.
  const p = checked.payload;
  const preview = p
    ? [
        t(READY_WORDS.runs, { start: formatDayShort(p.startsOn), end: formatDay(p.endsOn) }),
        tl(readyAsk(p.measure, p.goal, diffDays(p.startsOn, p.endsOn) + 1)),
        tl(readyReward(p.prizeDays)),
      ].join(' ')
    : null;
  const measures = [
    { value: 'workouts', label: t('Workouts') },
    { value: 'kg', label: t('Kg lifted') },
    ...(checkins || d.measure === 'checkins' ? [{ value: 'checkins', label: t('Visits') }] : []),
  ];
  const goalLabel =
    d.measure === 'kg' ? t('Goal (kg lifted in total)') : d.measure === 'checkins' ? t('Goal (number of days with a visit)') : t('Goal (number of workouts)');
  const goalHint =
    d.measure === 'kg'
      ? t('Total kg a member lifts in these days, counted from the app.')
      : d.measure === 'checkins'
        ? t('A member counts once a day, at the desk or with the QR code.')
        : t('The app counts up to 3 workouts a day for each member.');

  return (
    <Sheet
      title={ready ? d.title : d.id ? t('Change the challenge') : t('New challenge')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('Not now')}
          </Button>
          <Button needsInternet disabled={saving} onClick={save}>
            {saving ? t('Saving…') : d.id ? t('Save changes') : ready ? t(READY_WORDS.turnOn) : t('Start challenge')}
          </Button>
        </>
      }
    >
      {error && <ErrorBanner>{error}</ErrorBanner>}
      {ready ? (
        <p style={{ ...quiet, marginBottom: space.md }}>{t(d.id ? READY_WORDS.formIntroUpcoming : READY_WORDS.formIntro, { title: d.title })}</p>
      ) : (
        <>
          <TextField
            label={t('Name')}
            value={d.title}
            onChange={(v) => set({ ...d, title: v })}
            placeholder={t('November challenge')}
            hint={t('Members see this name. At most 60 letters.')}
          />
          <div style={{ marginTop: space.md }}>
            <ChipToggle variant="tabs" label={t('What counts')} options={measures} value={d.measure} onChange={(v) => set(withMeasure(d, v as ChallengeMeasure))} />
          </div>
        </>
      )}
      <TextField label={goalLabel} value={d.goal} onChange={(v) => set({ ...d, goal: v })} inputMode={d.measure === 'kg' ? 'decimal' : 'numeric'} hint={goalHint} />
      <DayField label={t('First day')} value={d.startsOn} onChange={(v) => set({ ...d, startsOn: v })} hint={t('Today or a later day, up to 60 days from today.')} />
      <TextField label={t('How many days')} value={d.days} onChange={(v) => set({ ...d, days: v })} inputMode="numeric" hint={t('From 7 to 31 days.')} />
      <TextField
        label={t('Free days for everyone who reaches the goal')}
        value={d.prizeDays}
        onChange={(v) => set({ ...d, prizeDays: v })}
        inputMode="numeric"
        hint={t('From 0 to 60. You check each winner before the days are added.')}
      />
      <p aria-live="polite" style={{ ...quiet, marginTop: space.md, color: color.ink }}>
        {preview ?? t('Fill in the boxes above to see what members will read.')}
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
  const [tab, setTab] = useState<BoardMeasure>('workouts');
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
      flash(hidden ? t('{name} is hidden from the leaderboard.', { name }) : t('{name} is on the leaderboard again.', { name }));
    } catch (e) {
      console.warn('[ForgeErr] challenges: hiding on the leaderboard', e);
      setError(failWords(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card style={{ marginBottom: space.lg }}>
      <SectionTitle>{t('Leaderboard · last 30 days')}</SectionTitle>
      <p style={small}>
        {board.members === 0
          ? t('No member has logged a workout in the last 30 days yet.')
          : t('{n} of your members trained in the last 30 days.', { n: board.members })}{' '}
        {t(MEMBERS_SEE_LEADERBOARD)}
      </p>
      {error && <ErrorBanner>{error}</ErrorBanner>}
      <div style={{ marginTop: space.md }}>
        <ChipToggle
          variant="tabs"
          label={t('Rank by')}
          options={[
            { value: 'workouts', label: measureLabel('workouts') },
            { value: 'kg', label: measureLabel('kg') },
          ]}
          value={tab}
          onChange={(v) => setTab(v as BoardMeasure)}
        />
      </div>
      {rows.length === 0 ? (
        <p style={{ ...quiet, marginTop: space.md }}>{t('Nobody to show yet. Totals appear after members train and open the MettleUp app.')}</p>
      ) : (
        <ol aria-label={t('Top {n} by {what}', { n: rows.length, what: measureLabel(tab).toLowerCase() })} style={{ margin: `${space.md}px 0 0`, padding: 0, listStyle: 'none', display: 'grid', gap: space.sm }}>
          {rows.map((r) => (
            <BoardLine key={r.memberId} row={r} measure={tab} canEdit={canEdit} busy={busy === r.memberId} onHide={(hidden) => void hide(r.memberId, r.name, hidden)} />
          ))}
        </ol>
      )}

      {board.hiddenMembers.length > 0 && (
        <div style={{ marginTop: space.lg }}>
          <p style={{ ...quiet, color: color.ink, fontWeight: 700 }}>{t('Hidden from members')}</p>
          <ul aria-label={t('Hidden from the leaderboard')} style={{ margin: `${space.xs}px 0 0`, padding: 0, listStyle: 'none', display: 'grid', gap: space.xs }}>
            {board.hiddenMembers.map((h) => (
              <li key={h.memberId} style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm, alignItems: 'center', justifyContent: 'space-between', fontFamily: font.body, fontSize: 14, color: color.ink }}>
                <span>{h.name}</span>
                {canEdit && (
                  <Button variant="quiet" needsInternet disabled={busy === h.memberId} ariaLabel={t('Show {name} on the leaderboard again', { name: h.name })} onClick={() => void hide(h.memberId, h.name, false)}>
                    {t('Show again')}
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

function BoardLine({ row, measure, canEdit, busy, onHide }: { row: BoardRow; measure: BoardMeasure; canEdit: boolean; busy: boolean; onHide: (hidden: boolean) => void }) {
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
      {row.hidden && <Pill>{t('Hidden')}</Pill>}
      {canEdit && (
        <Button
          variant="quiet"
          needsInternet
          disabled={busy}
          ariaLabel={row.hidden ? t('Show {name} on the leaderboard again', { name: row.name }) : t('Hide {name} from the leaderboard', { name: row.name })}
          onClick={() => onHide(!row.hidden)}
        >
          {row.hidden ? t('Show again') : t('Hide from the leaderboard')}
        </Button>
      )}
    </li>
  );
}
