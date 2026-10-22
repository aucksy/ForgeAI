/**
 * Messages & offers → Workout offer (OWNER-INBOX #49 step 2, 23 Oct 2026; R-82). The owner starts
 * "Train 10 times in 30 days, get 3 extra days" and picks how the days are given: by themselves when
 * a member qualifies, or by the desk with one tap. The list shows who joined, each member's count
 * (the SERVER's count: dates the phone sent that match a check-in in the register), "Ready for
 * reward" with one-tap Give (owner and front desk), and rewards given, each of which the owner can
 * take back. Server: supabase/migrations/0025_workout_offer.sql; words and states:
 * logic/workoutOffer.ts.
 *
 * Needs the gym's records online (the server matches dates against the online register) and a
 * server with 0025; otherwise it says so in one plain line.
 */

import { useCallback, useMemo, useRef, useState } from 'react';

import { useAuth, useCan } from '../auth/AuthProvider';
import { addDays, formatDay } from '../logic/dates';
import {
  OFFER_LIMITS,
  STATE_WORDS,
  canGive,
  checkDraft,
  countsLine,
  givenLine,
  memberState,
  modeWords,
  offerErrorWords,
  offerRuleLine,
  offerTitle,
  progressLine,
  runningOffer,
  startingDraft,
  type CheckedDraft,
  type OfferDraft,
  type OfferMember,
  type OfferMemberState,
  type OffersAnswer,
  type WorkoutOffer,
} from '../logic/workoutOffer';
import { useCrm } from '../store';
import { Button, Card, ChipToggle, EmptyState, ErrorBanner, Pill, SectionTitle, TOUCH, TextField, Toast, color, font, radius, space, useIsCompact, type Tone } from '../ui/kit';
import { Link } from '../ui/router';
import * as api from './api';
import { probeOffers, type OfferServer } from './offerServer';
import { errorWords } from './logic';
import { usePoll } from './ShopProvider';

const quiet = { margin: 0, fontFamily: font.body, fontSize: 13, color: color.inkSecondary } as const;

const STATE_TONE: Record<OfferMemberState, Tone> = {
  in: 'muted',
  ready: 'accent',
  given: 'good',
  takenBack: 'warn',
  left: 'muted',
  ended: 'muted',
};

/** Plain words for any failed offer call. */
function failWords(e: unknown): string {
  return offerErrorWords(e) ?? errorWords(e);
}

export function OffersSection() {
  const { session } = useAuth();
  const allowed = useCan();
  const owner = allowed('manageGym');
  const { snapshot, today, refreshNow } = useCrm();
  const compact = useIsCompact();
  const online = Boolean(session?.online);
  const key = online ? (session?.ownerKey ?? null) : null;

  const [server, setServer] = useState<OfferServer>('unknown');
  const [answer, setAnswer] = useState<OffersAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const flash = useCallback((m: string) => {
    setToast(m);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4000);
  }, []);

  const load = useCallback(async () => {
    if (!key) return;
    try {
      const r = await probeOffers(key);
      setServer(r.server);
      if (r.server === 'yes') setAnswer(r.answer);
    } catch (e) {
      setError(failWords(e));
    }
  }, [key]);

  usePoll(load, 30_000, key !== null);

  const names = useMemo(() => new Map(snapshot.members.map((m) => [m.id, m.fullName])), [snapshot.members]);

  /** One action, then the list again and the gym's records (a reward moved a plan's last day). */
  const act = async (id: string, fn: () => Promise<string>) => {
    if (busy) return;
    setBusy(id);
    setError(null);
    try {
      flash(await fn());
    } catch (e) {
      setError(failWords(e));
    } finally {
      setBusy(null);
      await load();
      await refreshNow();
    }
  };

  if (!online) {
    return (
      <Card>
        <EmptyState
          title="Workout offers need your gym online"
          body="The offer checks each workout against your check-in register on the server. Put your gym's records online first (Settings → Staff & sign-in)."
        />
      </Card>
    );
  }

  if (server === 'no') {
    return (
      <Card>
        <SectionTitle>Workout offer</SectionTitle>
        <p style={{ ...quiet, fontSize: 14, color: color.ink }}>Workout offers in the app are not switched on for your gym yet.</p>
        <p style={{ ...quiet, marginTop: space.sm }}>
          Until then, a member can open “Show my workouts to the desk” in the ForgeAI app. Type their code on the member’s page (Check
          workout code) and give the days with Freeze / extra days.
        </p>
      </Card>
    );
  }

  if (answer === null) {
    return (
      <>
        {error && <ErrorBanner>{error}</ErrorBanner>}
        <Card>
          <EmptyState title="Loading…" />
        </Card>
      </>
    );
  }

  const running = runningOffer(answer.offers);
  const day = answer.today ?? today;

  return (
    <>
      {error && <ErrorBanner>{error}</ErrorBanner>}
      {!running && owner && key && (
        <StartOfferForm
          today={day}
          compact={compact}
          busy={busy === 'start'}
          onStart={(offer) =>
            void act('start', async () => {
              await api.saveOffer(key, offer);
              return 'Offer started. Members see it in the ForgeAI app now.';
            })
          }
        />
      )}
      {!running && !owner && (
        <Card style={{ marginBottom: space.lg }}>
          <EmptyState title="No workout offer running" body="The owner starts one in Messages & offers." />
        </Card>
      )}

      {answer.offers.map((o) => (
        <OfferCard
          key={o.id}
          offer={o}
          members={answer.members.filter((m) => m.offerId === o.id)}
          today={day}
          owner={owner}
          busy={busy}
          nameOf={(id) => names.get(id) ?? null}
          onMode={(auto) =>
            key &&
            void act(`mode:${o.id}`, async () => {
              await api.saveOffer(key, { id: o.id, autoGive: auto });
              return auto ? 'The days are now given by themselves.' : 'The desk now gives the days with one tap.';
            })
          }
          onStop={() => {
            if (!key || !window.confirm('Stop this offer? Nobody new can join. Members already in keep their days to finish.')) return;
            void act(`stop:${o.id}`, async () => {
              await api.stopOffer(key, o.id);
              return 'Offer stopped. Members already in can still finish.';
            });
          }}
          onGive={(m) =>
            key &&
            void act(`give:${m.rosterId}`, async () => {
              const r = await api.giveReward(key, o.id, m.rosterId);
              const name = names.get(m.rosterId) ?? 'The member';
              const end = r.newEnd ? ` New last day: ${formatDay(r.newEnd)}.` : '';
              return r.alreadyGiven ? `${name} already has the reward.${end}` : `${r.days} days added for ${name}.${end}`;
            })
          }
          onTakeBack={(m) => {
            const name = names.get(m.rosterId) ?? 'this member';
            if (!key || !window.confirm(`Take back the ${m.givenDays ?? o.rewardDays} reward days from ${name}? Their plan's last day goes back.`)) return;
            void act(`undo:${m.rosterId}`, async () => {
              const r = await api.undoReward(key, o.id, m.rosterId);
              return `Reward taken back. Last day: ${formatDay(r.endsOn)}.`;
            });
          }}
        />
      ))}
      {toast && <Toast message={toast} />}
    </>
  );
}

// ---------------------------------------------------------------- start an offer

function StartOfferForm({
  today,
  compact,
  busy,
  onStart,
}: {
  today: string;
  compact: boolean;
  busy: boolean;
  onStart: (offer: CheckedDraft) => void;
}) {
  const [draft, setDraft] = useState<OfferDraft>(() => startingDraft(today));
  const checked = checkDraft(draft, today);
  const set = (patch: Partial<OfferDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 2);
  const L = OFFER_LIMITS;
  const preview = checked.ok
    ? checked.offer
    : { workouts: Number(draft.workouts) || L.workouts.start, windowDays: Number(draft.windowDays) || L.windowDays.start, rewardDays: Number(draft.rewardDays) || L.rewardDays.start };

  return (
    <Card style={{ marginBottom: space.lg }}>
      <SectionTitle>Start a workout offer</SectionTitle>
      <p style={quiet}>
        A workout counts only on a day your register shows a check-in for that member, and only if they logged 20+ minutes with 6+ sets
        in the ForgeAI app. Once per member. Members with a plan running can join.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: compact ? 'minmax(0, 1fr)' : 'repeat(3, minmax(0, 1fr))', columnGap: space.md }}>
        <TextField label="Workouts" value={draft.workouts} inputMode="numeric" onChange={(v) => set({ workouts: digits(v) })} hint={`${L.workouts.min} to ${L.workouts.max}`} />
        <TextField
          label="Within (days of joining)"
          value={draft.windowDays}
          inputMode="numeric"
          onChange={(v) => set({ windowDays: digits(v) })}
          hint={`${L.windowDays.min} to ${L.windowDays.max}`}
        />
        <TextField label="Reward (extra days)" value={draft.rewardDays} inputMode="numeric" onChange={(v) => set({ rewardDays: digits(v) })} hint={`${L.rewardDays.min} to ${L.rewardDays.max}`} />
      </div>
      <TextField
        label="Members can join until"
        type="date"
        value={draft.joinUntil}
        onChange={(v) => set({ joinUntil: v })}
        hint={`Up to ${formatDay(addDays(today, L.joinAheadMax))}.`}
      />
      <div style={{ marginTop: space.md, fontFamily: font.body, fontSize: 12, color: color.inkSecondary, marginBottom: 5 }}>Check-ins that count</div>
      <ChipToggle
        label="Check-ins that count"
        wrap
        value={draft.countAppCheckins ? 'both' : 'desk'}
        onChange={(v) => set({ countAppCheckins: v === 'both' })}
        options={[
          { value: 'both', label: 'Desk and QR poster' },
          { value: 'desk', label: 'Desk only' },
        ]}
      />
      <div style={{ marginTop: space.md, fontFamily: font.body, fontSize: 12, color: color.inkSecondary, marginBottom: 5 }}>How the days are given</div>
      <div role="group" aria-label="How the days are given" style={{ display: 'grid', gridTemplateColumns: compact ? 'minmax(0, 1fr)' : 'repeat(2, minmax(0, 1fr))', gap: space.sm }}>
        <Choice label="I give them (the desk gives with one tap)" pressed={!draft.autoGive} onClick={() => set({ autoGive: false })} />
        <Choice label="Give the days by themselves when a member qualifies" pressed={draft.autoGive} onClick={() => set({ autoGive: true })} />
      </div>
      <p style={{ ...quiet, marginTop: space.sm }}>
        {draft.autoGive
          ? 'When a member reaches the target, the days are added to their plan at once. You see it in the list and on their page, and you can take it back.'
          : 'When a member reaches the target, they show as “Ready for reward”. The owner or the front desk gives the days with one tap.'}{' '}
        No receipt and no GST: free days are not a sale.
      </p>

      <div style={{ marginTop: space.lg, fontFamily: font.body, fontSize: 12, color: color.inkSecondary, marginBottom: 5 }}>What members see</div>
      <div style={{ background: '#07080C', borderRadius: 12, padding: space.lg, border: `1px solid ${color.border}` }}>
        <div style={{ fontFamily: font.body, fontSize: 11, fontWeight: 700, letterSpacing: 0.4, color: '#FF8B4A', marginBottom: 4 }}>OFFER</div>
        <div style={{ fontFamily: font.display, fontSize: 15, fontWeight: 600, color: '#F4F5F8', overflowWrap: 'anywhere' }}>
          {offerTitle(preview.workouts, preview.windowDays, preview.rewardDays)}
        </div>
        <div style={{ marginTop: 4, fontFamily: font.body, fontSize: 13, color: '#B9BFCC' }}>{offerRuleLine()}</div>
      </div>

      {!checked.ok && (
        <p role="status" style={{ ...quiet, marginTop: space.md, color: color.warning }}>
          {checked.problem}
        </p>
      )}
      <div style={{ marginTop: space.lg }}>
        <Button disabled={busy || !checked.ok} onClick={() => checked.ok && onStart(checked.offer)}>
          {busy ? 'Starting…' : 'Start offer'}
        </Button>
      </div>
    </Card>
  );
}

/** One of two choices that each need a full sentence: a big target that wraps, pressed when picked. */
function Choice({ label, pressed, onClick }: { label: string; pressed: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      style={{
        appearance: 'none',
        minHeight: TOUCH,
        padding: '10px 12px',
        borderRadius: radius.md,
        border: `1px solid ${pressed ? 'transparent' : color.borderStrong}`,
        background: pressed ? color.accentSoft : 'transparent',
        color: pressed ? color.accentBright : color.ink,
        fontFamily: font.body,
        fontSize: 14,
        fontWeight: 600,
        textAlign: 'left',
        cursor: 'pointer',
        minWidth: 0,
        overflowWrap: 'anywhere',
      }}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------- one offer and its members

function OfferCard({
  offer,
  members,
  today,
  owner,
  busy,
  nameOf,
  onMode,
  onStop,
  onGive,
  onTakeBack,
}: {
  offer: WorkoutOffer;
  members: OfferMember[];
  today: string;
  owner: boolean;
  busy: string | null;
  nameOf: (rosterId: string) => string | null;
  onMode: (auto: boolean) => void;
  onStop: () => void;
  onGive: (m: OfferMember) => void;
  onTakeBack: (m: OfferMember) => void;
}) {
  const runningNow = offer.stoppedAt === null;
  // Ready first, then in the offer, then the rest; by name inside each.
  const order: OfferMemberState[] = ['ready', 'takenBack', 'in', 'given', 'ended', 'left'];
  const rows = [...members].sort(
    (a, b) =>
      order.indexOf(memberState(a, today)) - order.indexOf(memberState(b, today)) ||
      (nameOf(a.rosterId) ?? '').localeCompare(nameOf(b.rosterId) ?? ''),
  );
  return (
    <Card style={{ marginBottom: space.lg, opacity: runningNow ? 1 : 0.85 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm, alignItems: 'center', marginBottom: 6 }}>
        <Pill tone={runningNow ? (offer.open ? 'good' : 'muted') : 'muted'}>{runningNow ? (offer.open ? 'Running' : 'Joining closed') : 'Stopped'}</Pill>
        <span style={{ fontFamily: font.body, fontSize: 12, color: color.inkMuted }}>
          {runningNow ? `Join until ${formatDay(offer.joinUntil)}` : `Started ${formatDay(offer.startsOn)}`}
        </span>
      </div>
      <div style={{ fontFamily: font.display, fontSize: 17, fontWeight: 600, color: color.ink, overflowWrap: 'anywhere' }}>{offer.title}</div>
      <p style={{ ...quiet, marginTop: 4, fontSize: 14, color: color.ink }}>{countsLine(offer)}</p>
      <p style={{ ...quiet, marginTop: 4 }}>
        {modeWords(offer.autoGive)} {offer.countAppCheckins ? 'Desk and QR poster check-ins count.' : 'Only desk check-ins count.'}
      </p>
      {owner && runningNow && (
        <div style={{ marginTop: space.md }}>
          <ChipToggle
            label="How the days are given"
            wrap
            value={offer.autoGive ? 'auto' : 'desk'}
            onChange={(v) => {
              if ((v === 'auto') !== offer.autoGive && busy === null) onMode(v === 'auto');
            }}
            options={[
              { value: 'desk', label: 'I give them' },
              { value: 'auto', label: 'By themselves' },
            ]}
          />
        </div>
      )}

      <div style={{ marginTop: space.lg, display: 'grid', gap: space.sm }}>
        {rows.length === 0 ? (
          <p style={quiet}>Nobody has joined yet. Members join from the Gym tab in the ForgeAI app.</p>
        ) : (
          rows.map((m) => {
            const state = memberState(m, today);
            const name = nameOf(m.rosterId);
            return (
              <div
                key={m.rosterId}
                aria-label={`${name ?? 'A member (removed)'}: ${STATE_WORDS[state]}`}
                role="group"
                style={{ border: `1px solid ${color.border}`, borderRadius: 10, padding: space.md, background: color.surfaceSunken }}
              >
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm, alignItems: 'center', justifyContent: 'space-between' }}>
                  {name ? (
                    <Link to={`/members/${m.rosterId}`}>
                      <span style={{ fontFamily: font.body, fontSize: 14, fontWeight: 600, color: color.ink }}>{name}</span>
                    </Link>
                  ) : (
                    <span style={{ fontFamily: font.body, fontSize: 14, fontWeight: 600, color: color.inkSecondary }}>A member (removed)</span>
                  )}
                  <Pill tone={STATE_TONE[state]}>{STATE_WORDS[state]}</Pill>
                </div>
                <div style={{ ...quiet, marginTop: 4, fontSize: 12 }}>{progressLine(m, offer)}</div>
                {m.givenAt !== null && <div style={{ ...quiet, marginTop: 4, fontSize: 12, color: color.goodText }}>{givenLine(m)}</div>}
                {state === 'takenBack' && m.undoneByName && (
                  <div style={{ ...quiet, marginTop: 4, fontSize: 12 }}>{`Taken back by ${m.undoneByName}.`}</div>
                )}
                {(canGive(m) || (owner && m.givenAt !== null)) && (
                  <div style={{ marginTop: space.sm, display: 'flex', flexWrap: 'wrap', gap: space.sm }}>
                    {canGive(m) && (
                      <Button disabled={busy !== null} onClick={() => onGive(m)} ariaLabel={`Give ${offer.rewardDays} days to ${name ?? 'this member'}`}>
                        {busy === `give:${m.rosterId}` ? 'Giving…' : `Give ${offer.rewardDays} days`}
                      </Button>
                    )}
                    {owner && m.givenAt !== null && (
                      <Button variant="quiet" disabled={busy !== null} onClick={() => onTakeBack(m)} ariaLabel={`Take back the reward from ${name ?? 'this member'}`}>
                        Take back
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {owner && runningNow && (
        <div style={{ marginTop: space.lg, paddingTop: space.md, borderTop: `1px solid ${color.border}` }}>
          <Button variant="ghost" tone="danger" disabled={busy !== null} onClick={onStop}>
            Stop offer
          </Button>
        </div>
      )}
    </Card>
  );
}
