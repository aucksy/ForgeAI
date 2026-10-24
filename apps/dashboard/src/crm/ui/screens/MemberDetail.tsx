/**
 * One member — everything the desk needs while they're standing there.
 *
 * Order is deliberate: status and what they owe first (the two things that decide
 * whether they train today), then the actions, then history. Contact details sit
 * below, because the person is usually in front of you.
 */

import { WhatsAppSheet } from '../WhatsAppSheet';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useCrm } from '../../store';
import { inviteMessage, whatsAppHref } from '../../shop/invite';
import { useShop } from '../../shop/ShopProvider';
import {
  attendanceProfile,
  hourLabel,
  patternSummary,
  riskBandFor,
  riskReason,
  RHYTHM_WINDOW_DAYS,
} from '../../logic/attendance';
import { addDays, diffDays, formatDay, relativeDay } from '../../logic/dates';
import { daysLeftTile, historyLine, isChased, STATE_LABEL, stateTone, toMembershipView, unpaidForMembership } from '../../logic/membership';
import { formatINR } from '../../logic/money';
import { formatPhone, initials } from '../../logic/members';
import { memberBatch } from '../../logic/batches';
import { methodLabel } from '../../logic/payments';
import {
  canUndoPtSession,
  endedPtPacksWithSessionsLeft,
  isPtMembership,
  lastPtDay,
  livePtPack,
  PT_ENDING_DAYS,
  PT_LOW_LEFT,
  ptDays,
  ptLeft,
  ptPackToMark,
  ptPackToUndo,
  ptSummary,
  ptTotal,
  ptUsed,
  runningPtPacks,
} from '../../logic/pt';
import type { Membership, Payment, WorkoutPlan, WorkoutPlanDraft } from '../../types';
import { CollectPaymentSheet } from '../forms/CollectPaymentSheet';
import { ExtendMembershipSheet } from '../forms/ExtendMembershipSheet';
import { useAuth, useCan } from '../../auth/AuthProvider';
import { MemberFormSheet } from '../forms/MemberFormSheet';
import { SellMembershipSheet } from '../forms/SellMembershipSheet';
import { VoidPaymentSheet } from '../forms/VoidPaymentSheet';
import { MemberCardSheet } from '../MemberCardSheet';
import { WorkoutCodeCheckSheet } from '../WorkoutCodeCheckSheet';
import { memberCardFacts } from '../../logic/memberCard';
import { plansForMember, withoutMember } from '../../logic/workoutPlans';
import { NOT_ONLINE_YET, SendPlanSheet, WorkoutPlanSheet } from './WorkoutPlans';
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Grid,
  PageHeader,
  Pill,
  Row,
  SectionTitle,
  Sheet,
  StatTile,
  TextField,
  Toast,
  UndoBar,
  color,
  font,
  radius,
  space,
  TOUCH,
  useIsCompact,
} from '../kit';
import { Link, navigate } from '../router';

export function MemberDetailScreen({ memberId }: { memberId: string }) {
  const {
    snapshot,
    today,
    viewFor,
    checkIn,
    setMemberArchived,
    cancelMembership,
    uncancelMembership,
    markPtSession,
    undoPtSession,
    saveWorkoutPlan,
  } = useCrm();
  const compact = useIsCompact();
  const { cloud } = useShop();
  // Staff (front desk) can sell, collect and check in, but cannot cancel, freeze or void (permissions.ts).
  const allowed = useCan();
  const online = Boolean(useAuth().session?.online);
  const canCancel = allowed('cancelMembership');
  const canFreeze = allowed('freeze');
  const canVoid = allowed('voidReceipt');
  const canUndoOldPt = allowed('undoOldPtSession');
  const [editing, setEditing] = useState(false);
  const [selling, setSelling] = useState(false);
  /** Renew the PT plan: the sell sheet opens on this plan. */
  const [sellPlanId, setSellPlanId] = useState<string | undefined>(undefined);
  const [ptBusy, setPtBusy] = useState(false);
  // C7-26: one "Undo cancel" at a time.
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [cancelling, setCancelling] = useState<Membership | null>(null);
  const [extending, setExtending] = useState<Membership | null>(null);
  // #49 step 1: the workout offer's claim code, and a reward given from it (opens on Gift, 3 days).
  const [checkingCode, setCheckingCode] = useState(false);
  const [rewardDays, setRewardDays] = useState<number | undefined>(undefined);
  const [voiding, setVoiding] = useState<Payment | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [whatsApp, setWhatsApp] = useState(false);
  /** The member ID card sheet (owner and staff alike). */
  const [card, setCard] = useState(false);
  /**
   * "Send a plan": a chooser (one tap sends one of the gym's plans), then, for a ready or new plan,
   * the builder with this member already ticked.
   */
  const [sendingPlan, setSendingPlan] = useState(false);
  const [buildingPlan, setBuildingPlan] = useState<WorkoutPlanDraft | null>(null);
  /** A plan just sent in one tap: the Undo bar takes this member off it again. */
  const [sentPlan, setSentPlan] = useState<WorkoutPlan | null>(null);
  const canSendPlan = allowed('editWorkoutPlans');

  // A stray `setTimeout` that outlives the screen sets state on an unmounted tree.
  const toastTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);
  // The Undo bar goes away on its own (the plan stays sent).
  useEffect(() => {
    if (!sentPlan) return;
    const t = window.setTimeout(() => setSentPlan(null), 8000);
    return () => window.clearTimeout(t);
  }, [sentPlan]);

  const view = viewFor(memberId);

  const memberships = useMemo(
    () =>
      snapshot.memberships
        .filter((m) => m.memberId === memberId)
        .sort((a, b) => b.startsOn.localeCompare(a.startsOn)),
    [snapshot.memberships, memberId],
  );

  // Freeze / Extra din goes on the GYM plan that ends LAST (not cancelled): extending an earlier
  // term when a renewal is already queued would make the two overlap and give the member nothing.
  // An ended plan qualifies too — the days are given back from its old last day.
  // A PT pack runs beside the gym plan (logic/pt.ts) and has its own Freeze / extra days: any PT
  // pack, not cancelled, with sessions still unused (see `canExtendRow`).
  const extendTarget = useMemo(
    () =>
      memberships
        .filter((m) => !m.cancelled && !isPtMembership(m))
        .reduce<Membership | null>((best, m) => (!best || m.endsOn > best.endsOn ? m : best), null),
    [memberships],
  );
  const canExtendRow = (m: Membership) =>
    canFreeze && !m.cancelled && (isPtMembership(m) ? ptLeft(m) > 0 : extendTarget?.id === m.id);

  // PT: every pack running today (sessions used oldest pack first), the pack the next session
  // comes off, the pack Undo takes back from, and packs that ended with sessions unused.
  const ptRunning = useMemo(() => runningPtPacks(memberships, today), [memberships, today]);
  const ptMark = useMemo(() => ptPackToMark(memberships, today), [memberships, today]);
  const ptUndo = useMemo(() => ptPackToUndo(memberships, today), [memberships, today]);
  const ptNewest = useMemo(() => livePtPack(memberships, today), [memberships, today]);
  const ptEnded = useMemo(() => endedPtPacksWithSessionsLeft(memberships, today), [memberships, today]);
  const ptRenewFrom = ptNewest ?? ptEnded[0] ?? null;

  const payments = useMemo(
    () =>
      snapshot.payments
        .filter((p) => p.memberId === memberId)
        .sort((a, b) => b.paidOn.localeCompare(a.paidOn) || b.createdAt - a.createdAt),
    [snapshot.payments, memberId],
  );

  const memberVisits = useMemo(
    () => snapshot.visits.filter((v) => v.memberId === memberId),
    [snapshot.visits, memberId],
  );

  // Workout plans this member gets: sent to them by name, or to a plan they have today.
  const workoutPlans = useMemo(
    () => plansForMember(snapshot.workoutPlans ?? [], memberId, snapshot.memberships, today),
    [snapshot.workoutPlans, snapshot.memberships, memberId, today],
  );

  const visitCount = memberVisits.length;
  const daysTile = view ? daysLeftTile(view, today) : null;

  const visitedToday = useMemo(
    () => memberVisits.some((v) => v.visitedOn === today),
    [memberVisits, today],
  );

  const memberRow = useMemo(
    () => snapshot.members.find((m) => m.id === memberId) ?? null,
    [snapshot.members, memberId],
  );

  // Their own rhythm, and what it says. Built here rather than read off the roster
  // view because the profile needs the raw visits, not just the last one.
  const profile = useMemo(
    () => (memberRow ? attendanceProfile(memberRow, memberships, memberVisits, today) : null),
    [memberRow, memberships, memberVisits, today],
  );

  if (!view) {
    return (
      <Card>
        <EmptyState
          title="Member not found"
          body="They may have been removed."
          action={<Button onClick={() => navigate('/members')}>Back to members</Button>}
        />
      </Card>
    );
  }

  const { member, current } = view;

  const flash = (msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  };

  const run = async (fn: () => Promise<void>, done: string) => {
    setError(null);
    try {
      await fn();
      flash(done);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t work. Please try again.');
    }
  };

  // One PT action at a time: a second tap while the first is saving does nothing.
  const runPt = async (fn: () => Promise<void>, done: string) => {
    if (ptBusy) return;
    setPtBusy(true);
    try {
      await run(fn, done);
    } finally {
      setPtBusy(false);
    }
  };

  // Check-in and archive live inside the member's card. On their own they floated
  // between two cards, anchored to nothing, with "Archive" drawn as bare text.
  const heroActions = (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: compact ? 'repeat(2, minmax(0, 1fr))' : 'auto',
        gap: space.sm,
        flexShrink: 0,
        alignSelf: 'center',
      }}
    >
      <Button
        full
        variant="ghost"
        disabled={visitedToday}
        onClick={() => run(() => checkIn(memberId, 'desk'), 'Checked in for today.')}
      >
        {visitedToday ? 'Checked in today' : 'Check in'}
      </Button>
      <Button
        full
        variant="ghost"
        tone={member.archived ? undefined : 'danger'}
        onClick={() =>
          run(
            () => setMemberArchived(memberId, !member.archived),
            member.archived
              ? 'Member restored.'
              : 'Member archived.',
          )
        }
      >
        {member.archived ? 'Restore member' : 'Archive member'}
      </Button>
      {/* Owner and staff both: the card is printed at the desk. Full width under the two on a phone. */}
      <div style={{ gridColumn: compact ? '1 / -1' : undefined }}>
        <Button full variant="ghost" onClick={() => setCard(true)}>
          Member card
        </Button>
      </div>
    </div>
  );

  return (
    <>
      <PageHeader
        title={member.fullName}
        subtitle={
          (memberBatch(member) ? `${memberBatch(member)} batch · ` : '') +
          `Member since ${formatDay(member.joinedOn)}`
        }
        actions={
          <>
            <Button variant="ghost" onClick={() => setEditing(true)}>
              Edit
            </Button>
            {view.outstandingP > 0 && (
              <Button variant="ghost" onClick={() => setCollecting(true)}>
                Collect payment
              </Button>
            )}
            <Button onClick={() => setSelling(true)}>
              {view.coversUntil ? 'Renew' : 'Sell membership'}
            </Button>
          </>
        }
      />

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <Card style={{ marginBottom: space.lg }}>
        <Row gap={space.lg} wrap={false} align="flex-start">
          <Avatar text={initials(member.fullName)} size={52} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Row gap={space.sm}>
              <Pill tone={stateTone(view.state)}>{STATE_LABEL[view.state]}</Pill>
              {member.archived && <Pill tone="muted">Archived</Pill>}
              {member.appUserId && <Pill tone="accent">Using the app</Pill>}
              {/* #41: may train at every branch (set on the member's form by an owner). */}
              {member.allBranches && <Pill tone="muted">Every branch</Pill>}
            </Row>
            <div style={{ marginTop: space.sm, fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>
              {current ? (
                <>
                  {current.planName} · {formatDay(current.startsOn)} → {formatDay(current.endsOn)}
                  {view.coversUntil && view.coversUntil !== current.endsOn ? (
                    // Already renewed: lead with where the cover actually runs to,
                    // so nobody chases a member who has paid.
                    <>
                      {` · renewed till ${formatDay(view.coversUntil)} (${relativeDay(view.coversUntil, today)})`}
                    </>
                  ) : (
                    <> ({relativeDay(current.endsOn, today)})</>
                  )}
                </>
              ) : (
                'No membership yet.'
              )}
            </div>
            <Row gap={space.sm}>
              <a href={`tel:${member.phone}`} style={linkStyle}>
                {formatPhone(member.phone)}
              </a>
              {/* Step 4: WhatsApp with the message already typed (fees, plan ending, birthday…). */}
              <button type="button" onClick={() => setWhatsApp(true)} style={{ ...linkStyle, background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit' }}>
                WhatsApp
              </button>
              {/* Invite link: WhatsApp opens on this member with the gym's link typed in. */}
              {cloud && !member.appUserId && (
                <a
                  href={whatsAppHref(inviteMessage(cloud.name, cloud.joinCode, member.fullName), member.phone)}
                  target="_blank"
                  rel="noreferrer"
                  style={linkStyle}
                >
                  Send app invite
                </a>
              )}
            </Row>
          </div>
          {!compact && heroActions}
        </Row>
        {compact && <div style={{ marginTop: space.md }}>{heroActions}</div>}
      </Card>

      <Grid min={150}>
        <StatTile
          label="Dues"
          value={view.outstandingP > 0 ? formatINR(view.outstandingP) : '—'}
          tone={view.outstandingP > 0 ? 'warn' : undefined}
          sub={view.outstandingP > 0 ? 'Still to pay' : 'Fully paid'}
        />
        <StatTile
          label="Last visit"
          value={view.lastVisitOn ? relativeDay(view.lastVisitOn, today) : 'never'}
          tone={view.daysSinceVisit !== null && view.daysSinceVisit >= 14 ? 'critical' : undefined}
          sub={view.lastVisitOn ? formatDay(view.lastVisitOn) : 'No check-ins yet'}
        />
        {/* C7-33: a plan paid ahead says when it starts, not the days to its end. */}
        <StatTile
          label={daysTile?.label ?? ''}
          value={daysTile?.value ?? '—'}
          tone={view.coversUntil && view.daysRemaining !== null && view.daysRemaining <= 7 ? 'warn' : undefined}
          sub={daysTile?.sub}
        />
        <StatTile
          label="Total visits"
          value={visitCount}
          sub={`Since ${formatDay(member.joinedOn)}`}
        />
      </Grid>

      <div style={{ height: space.lg }} />

      {(ptRunning.length > 0 || ptEnded.length > 0) && (
        <PtCard
          running={ptRunning}
          markPack={ptMark}
          newest={ptNewest}
          ended={ptEnded}
          today={today}
          busy={ptBusy}
          canUndo={canUndoPtSession(ptUndo ? lastPtDay(ptUndo) : null, today, canUndoOldPt)}
          canRenew={ptRenewFrom !== null && snapshot.plans.some((p) => p.id === ptRenewFrom.planId && p.active)}
          canExtend={canFreeze}
          onMark={() => {
            if (ptMark) void runPt(() => markPtSession(ptMark.id), 'PT session marked.');
          }}
          onUndo={() => {
            const last = ptUndo ? lastPtDay(ptUndo) : null;
            if (ptUndo && last) void runPt(() => undoPtSession(ptUndo.id, last), 'Last PT session undone.');
          }}
          onRenew={() => {
            if (!ptRenewFrom) return;
            setSellPlanId(ptRenewFrom.planId);
            setSelling(true);
          }}
          onExtend={(m) => setExtending(m)}
        />
      )}

      {profile && (
        <Card style={{ marginBottom: space.lg }}>
          <SectionTitle>Training pattern</SectionTitle>
          <AttendanceStrip profile={profile} today={today} />
          <div style={{ marginTop: space.md }}>
            <Button variant="ghost" onClick={() => setCheckingCode(true)}>
              Check workout code
            </Button>
          </div>
        </Card>
      )}

      <Card style={{ marginBottom: space.lg }}>
        <SectionTitle>Memberships</SectionTitle>
        {memberships.length === 0 ? (
          <EmptyState
            title="No memberships yet"
            body="Sell one. Then they show in the renewals list when their plan is ending."
            action={<Button onClick={() => setSelling(true)}>Sell membership</Button>}
          />
        ) : (
          <div style={{ display: 'grid', gap: space.sm }}>
            {memberships.map((m) => (
              <MembershipRow
                key={m.id}
                membership={m}
                payments={payments}
                today={today}
                onCancel={canCancel ? () => setCancelling(m) : undefined}
                onExtend={canExtendRow(m) ? () => setExtending(m) : undefined}
                onRestore={
                  canCancel && !restoreBusy
                    ? () => {
                        setRestoreBusy(true);
                        void run(() => uncancelMembership(m.id).then(() => undefined), 'Cancel undone.').finally(() =>
                          setRestoreBusy(false),
                        );
                      }
                    : undefined
                }
              />
            ))}
          </div>
        )}
      </Card>

      {canSendPlan && (
        <Card style={{ marginBottom: space.lg }}>
          <SectionTitle
            action={
              <Button variant="ghost" onClick={() => setSendingPlan(true)}>
                Send a plan
              </Button>
            }
          >
            Workout plans
          </SectionTitle>
          <div style={{ fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>
            {workoutPlans.length === 0 ? (
              online ? (
                'No workout plan sent yet. They see one in the ForgeAI app after one check-in at the gym.'
              ) : (
                `No workout plan sent yet. ${NOT_ONLINE_YET}`
              )
            ) : (
              <div style={{ display: 'grid', gap: space.xs }}>
                {workoutPlans.map((w) => (
                  <Link key={w.id} to="/workouts">
                    <span style={{ color: color.ink, fontWeight: 600 }}>{w.name}</span>
                    {w.assign.memberIds.includes(memberId) ? '' : ' · through their membership plan'}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

      <Card style={{ marginBottom: space.lg }}>
        <SectionTitle>Payments</SectionTitle>
        {payments.length === 0 ? (
          <EmptyState title="No payments yet" />
        ) : (
          <div style={{ display: 'grid', gap: space.xs }}>
            {payments.map((p) => (
              <PaymentRow key={p.id} payment={p} onVoid={canVoid ? () => setVoiding(p) : undefined} />
            ))}
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle>Details</SectionTitle>
        {/* Three across on a desk screen: one column of six short pairs left a
            thousand pixels of empty card beside them. */}
        <dl
          style={{
            margin: 0,
            display: 'grid',
            gap: `${space.lg}px ${space.xl}px`,
            gridTemplateColumns: compact ? 'minmax(0, 1fr)' : 'repeat(3, minmax(0, 1fr))',
          }}
        >
          <Detail label="Mobile" value={formatPhone(member.phone)} />
          <Detail label="Email" value={member.email} />
          <Detail label="Date of birth" value={member.dateOfBirth ? formatDay(member.dateOfBirth) : null} />
          <Detail label="Address" value={member.address} />
          <Detail
            label="Emergency contact"
            value={
              member.emergencyName || member.emergencyPhone
                ? `${member.emergencyName ?? ''} ${member.emergencyPhone ? formatPhone(member.emergencyPhone) : ''}`.trim()
                : null
            }
          />
          <Detail label="Notes" value={member.notes} />
          {/* #47: the gym's own details brought in from an old file (Locker No., Blood Group). */}
          {Object.entries(member.extra ?? {})
            .filter(([, v]) => typeof v === 'string' && v !== '')
            .map(([k, v]) => (
              <Detail key={`extra-${k}`} label={k} value={v} />
            ))}
        </dl>
      </Card>

      {card && (
        <MemberCardSheet
          facts={memberCardFacts(snapshot.gym.name, member, view)}
          phone={member.phone}
          onClose={() => setCard(false)}
          say={flash}
        />
      )}
      {editing && <MemberFormSheet editing={member} onClose={() => setEditing(false)} />}
      {sendingPlan && (
        <SendPlanSheet
          member={member}
          onClose={() => setSendingPlan(false)}
          onSent={(plan) => {
            setToast(null);
            setSentPlan(plan);
          }}
          onBuild={(draft) => {
            setSendingPlan(false);
            setBuildingPlan(draft);
          }}
        />
      )}
      {buildingPlan && (
        <WorkoutPlanSheet
          initial={buildingPlan}
          onClose={() => setBuildingPlan(null)}
          onSaved={(plan) =>
            flash(plan.assign.memberIds.includes(member.id) ? `“${plan.name}” sent to ${member.fullName}.` : `“${plan.name}” saved.`)
          }
        />
      )}
      {selling && (
        <SellMembershipSheet
          view={view}
          initialPlanId={sellPlanId}
          onClose={() => {
            setSelling(false);
            setSellPlanId(undefined);
          }}
          onSold={(result) =>
            flash(
              result.payment
                ? `Membership saved. Receipt ${result.payment.receiptNo}.`
                : 'Membership saved. No money taken yet.',
            )
          }
        />
      )}
      {collecting && (
        <CollectPaymentSheet
          view={view}
          onClose={() => setCollecting(false)}
          onCollected={(payment) => flash(`Payment saved. Receipt ${payment.receiptNo}.`)}
        />
      )}
      {cancelling && (
        <CancelMembershipSheet
          membership={cancelling}
          onClose={() => setCancelling(null)}
          onConfirm={async (reason) => {
            // C7-26: a failure is shown inside the sheet (it used to land on the page behind it).
            await cancelMembership(cancelling.id, reason);
            setCancelling(null);
            flash('Membership cancelled.');
          }}
        />
      )}
      {extending && (
        <ExtendMembershipSheet
          membership={extending}
          gift={rewardDays}
          onClose={() => {
            setExtending(null);
            setRewardDays(undefined);
          }}
          onDone={(days) => flash(`Plan moved ${days} days later.`)}
        />
      )}
      {checkingCode && (
        <WorkoutCodeCheckSheet
          visits={memberVisits}
          today={today}
          onGive={
            canFreeze && extendTarget
              ? () => {
                  setCheckingCode(false);
                  setRewardDays(3);
                  setExtending(extendTarget);
                }
              : undefined
          }
          onClose={() => setCheckingCode(false)}
        />
      )}
      {voiding && (
        <VoidPaymentSheet
          payment={voiding}
          onClose={() => setVoiding(null)}
          onVoided={(restored) =>
            flash(
              restored
                ? 'Receipt cancelled. The amount is back in their dues.'
                : 'Receipt cancelled.',
            )
          }
        />
      )}
      {whatsApp && view && <WhatsAppSheet view={view} onClose={() => setWhatsApp(false)} />}
      {sentPlan ? (
        <UndoBar
          message={`“${sentPlan.name}” sent to ${member.fullName}.`}
          undoLabel={`Undo sending ${sentPlan.name} to ${member.fullName}`}
          onUndo={() => {
            const plan = sentPlan;
            setSentPlan(null);
            // The saved plan is the base: a change another desk made since is refused, never dropped.
            void run(async () => {
              try {
                await saveWorkoutPlan(withoutMember(plan, member.id));
              } catch (e) {
                // Review fix: nothing is "open" on this page; say where to take them off instead.
                if (e instanceof Error && e.message.startsWith('Someone else changed this plan')) {
                  throw new Error(`Someone changed “${plan.name}” just now. To take ${member.fullName} off it, open it under Workout plans.`);
                }
                throw e;
              }
            }, `“${plan.name}” is no longer sent to ${member.fullName}.`);
          }}
        />
      ) : (
        toast && <Toast message={toast} />
      )}
    </>
  );
}

/**
 * Cancelling a membership moves money, so it is never a single unconfirmed click —
 * the review's point was that "Load demo gym" asked for confirmation while the
 * irreversible money actions did not. Voiding a receipt has the same rule and now
 * lives in its own `VoidPaymentSheet`, shared with the money ledger, so the two
 * places a receipt can be voided cannot drift apart.
 */
function CancelMembershipSheet({
  membership,
  onClose,
  onConfirm,
}: {
  membership: Membership;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  // C7-26: a double tap saved the cancel twice; now one save at a time, and its error shows here.
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(null);
    try {
      await onConfirm(reason.trim());
    } catch (e) {
      setFailed(e instanceof Error ? e.message : 'That didn’t work. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      title="Cancel this membership?"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Keep it
          </Button>
          <Button tone="danger" disabled={busy || reason.trim().length < 3} onClick={() => void confirm()}>
            {busy ? 'Saving…' : 'Cancel membership'}
          </Button>
        </>
      }
    >
      {failed && <ErrorBanner>{failed}</ErrorBanner>}
      <p style={{ margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>
        <strong style={{ color: color.ink }}>{membership.planName}</strong>
        {` (${formatDay(membership.startsOn)} → ${formatDay(membership.endsOn)}) will no longer count, and its unpaid amount is removed from their dues. It stays on their page, and you can undo this later.`}
      </p>

      <TextField
        label="Reason"
        value={reason}
        onChange={setReason}
        autoFocus
        placeholder="Moved city"
        hint="Saved with the membership, so it is clear months later."
      />
    </Sheet>
  );
}

/**
 * Eight weeks of attendance as a row of squares, plus what their rhythm says.
 *
 * A calendar strip rather than a count, because "18 visits" answers nothing an owner
 * asks: a member who came 18 times in the first fortnight and never since is a
 * different conversation from one who comes twice a week without fail, and the two
 * are the same number.
 */
function AttendanceStrip({
  profile,
  today,
}: {
  profile: ReturnType<typeof attendanceProfile>;
  today: string;
}) {
  const band = riskBandFor(profile);
  // NOT the raw band: `ok` covers "training fine", "no plan running" and "too new to
  // judge", and showing a green "Training" pill above "0 visits in 56 days" is a
  // label contradicting the number beneath it.
  const verdict = patternSummary(profile, band);
  const present = new Set(profile.recentDays);
  const days: string[] = [];
  for (let i = RHYTHM_WINDOW_DAYS - 1; i >= 0; i -= 1) days.push(addDays(today, -i));

  return (
    <>
      <Row gap={space.xs}>
        <Pill tone={verdict.tone}>{verdict.label}</Pill>
        {profile.usualHour !== null && <Pill tone="muted">
            {`Usually ${hourLabel(profile.usualHour)}`}
          </Pill>}
        {profile.medianGapDays !== null && (
          <Pill tone="muted">
            {Math.round(profile.medianGapDays) === 1
              ? `Every ${Math.round(profile.medianGapDays)} day`
              : `Every ${Math.round(profile.medianGapDays)} days`}
          </Pill>
        )}
      </Row>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 3,
          margin: `${space.md}px 0`,
        }}
      >
        {days.map((day) => (
          <span
            key={day}
            title={`${formatDay(day)}${present.has(day) ? ' — trained' : ''}`}
            style={{
              width: 12,
              height: 12,
              borderRadius: 3,
              background: present.has(day) ? color.accent : color.surfaceSunken,
              border: `1px solid ${color.border}`,
            }}
          />
        ))}
      </div>

      <div style={{ fontFamily: font.body, fontSize: 13, color: color.inkSecondary }}>
        {profile.visitsInWindowN === 1
          ? `${profile.visitsInWindowN} visit in the last ${RHYTHM_WINDOW_DAYS} days`
          : `${profile.visitsInWindowN} visits in the last ${RHYTHM_WINDOW_DAYS} days`}
        {/* The rate is measured over the days their plan actually covered, so it says
            so — otherwise a member who renewed six days ago reads "20 visits in 56
            days · about 20.0 a week" and the two numbers cannot both be true. */}
        {profile.weeklyRate > 0 &&
          ` · about ${profile.weeklyRate.toFixed(1)} a week while their plan was running`}
        {band !== 'ok' && ` · ${riskReason({ profile, band })}`}
      </div>
    </>
  );
}

/**
 * The member's PT: the running pack(s) — how many sessions are used, Mark session (owner and Staff;
 * the session comes off the OLDEST running pack with sessions left, so an early renewal never
 * strands paid sessions), Undo last session (anyone the same day, only an owner for an older day),
 * the days used, a Renew prompt when they run out — and every pack that ENDED with sessions unused,
 * which an owner can Extend (logic/pt.ts).
 */
function PtCard({
  running,
  markPack,
  newest,
  ended,
  today,
  busy,
  canUndo,
  canRenew,
  canExtend,
  onMark,
  onUndo,
  onRenew,
  onExtend,
}: {
  /** Running packs, in the order sessions are used. */
  running: Membership[];
  /** The pack the next session comes off; null when every running pack is used up. */
  markPack: Membership | null;
  /** The newest running pack (shown when all are used up). */
  newest: Membership | null;
  /** Packs that ended with sessions unused, latest first. */
  ended: Membership[];
  today: string;
  busy: boolean;
  canUndo: boolean;
  /** The PT plan is still on sale, so Renew can open on it. */
  canRenew: boolean;
  /** Owner: may move a pack's last day (Freeze / extra days). Staff see a plain note. */
  canExtend: boolean;
  onMark: () => void;
  onUndo: () => void;
  onRenew: () => void;
  onExtend: (pack: Membership) => void;
}) {
  const main = markPack ?? newest;
  const total = main ? ptTotal(main) : 0;
  const left = main ? ptLeft(main) : 0;
  const days = main ? ptDays(main) : [];
  const leftAll = running.reduce((sum, m) => sum + ptLeft(m), 0);
  // One session a day at the desk: marked on any running pack today greys the button.
  const markedToday = running.some((m) => ptDays(m).includes(today));
  const usedUp = running.length > 0 && markPack === null;
  const pct = total > 0 ? Math.round(((total - left) / total) * 100) : 0;
  const lastEnd = running.reduce<string | null>((max, m) => (max === null || m.endsOn > max ? m.endsOn : max), null);
  const endsSoon = !usedUp && lastEnd !== null && diffDays(today, lastEnd) <= PT_ENDING_DAYS;
  const note = { fontFamily: font.body, fontSize: 13, fontWeight: 600, color: color.warning, marginTop: space.md } as const;

  return (
    <Card style={{ marginBottom: space.lg }}>
      <SectionTitle>Personal training (PT)</SectionTitle>
      {main && (
        <>
          <div style={{ fontFamily: font.body, fontSize: 15, fontWeight: 700, color: color.ink, overflowWrap: 'anywhere' }}>
            {ptSummary(main)}
          </div>
          <div
            role="progressbar"
            aria-label="PT sessions used"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={total - left}
            style={{ height: 8, borderRadius: 999, background: color.surfaceSunken, border: `1px solid ${color.border}`, margin: `${space.sm}px 0`, overflow: 'hidden' }}
          >
            <div style={{ width: `${pct}%`, height: '100%', background: usedUp ? color.warning : color.accent }} />
          </div>
          <div style={{ fontFamily: font.body, fontSize: 13, color: color.inkSecondary, overflowWrap: 'anywhere' }}>
            {main.planName} · {`runs until ${formatDay(main.endsOn)}`}
          </div>
        </>
      )}

      {running.length > 1 && (
        // Two packs at once (one renewed early): each pack's own count, and which one is in use.
        <div style={{ marginTop: space.md, display: 'grid', gap: 4 }}>
          <div style={{ fontFamily: font.body, fontSize: 12, color: color.inkMuted }}>
            {`${running.length} PT packs running. Sessions are used from the oldest pack first.`}
          </div>
          {running.map((m) => (
            <div key={m.id} style={{ fontFamily: font.body, fontSize: 13, color: color.ink, overflowWrap: 'anywhere' }}>
              {m.planName} · {`${ptUsed(m)} of ${ptTotal(m)} used`} ·{' '}
              {`until ${formatDay(m.endsOn)}`}
              {m.id === markPack?.id && (
                <span style={{ color: color.accentBright, fontWeight: 700 }}>{' · next session'}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {running.length > 0 &&
        (usedUp ? (
          <div style={{ ...note, fontSize: 14, fontWeight: 700 }}>
            {running.length === 1
              ? `All ${total} PT sessions used. Time to renew.`
              : 'All PT sessions used. Time to renew.'}
          </div>
        ) : leftAll <= PT_LOW_LEFT ? (
          <div style={note}>
            {leftAll === 1
              ? 'Only 1 PT session left'
              : `Only ${leftAll} PT sessions left`}
          </div>
        ) : (
          endsSoon &&
          lastEnd && (
            <div style={note}>
              {`PT ends ${formatDay(lastEnd)} (${relativeDay(lastEnd, today)}) with ${leftAll} sessions left`}
            </div>
          )
        ))}

      {running.length > 0 && (
        <div style={{ marginTop: space.md, display: 'flex', flexWrap: 'wrap', gap: space.sm }}>
          {usedUp ? (
            canRenew && <Button onClick={onRenew}>Renew PT</Button>
          ) : (
            <Button onClick={onMark} disabled={busy || markedToday}>
              {markedToday ? 'Session marked today' : 'Mark session'}
            </Button>
          )}
          {canUndo && (
            <Button variant="ghost" onClick={onUndo} disabled={busy}>
              Undo last session
            </Button>
          )}
        </div>
      )}

      {main && (
        <>
          <div style={{ marginTop: space.md, fontFamily: font.body, fontSize: 12, color: color.inkMuted }}>
            {days.length === 0 ? 'No sessions used yet.' : 'Sessions used on'}
          </div>
          {days.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.xs, marginTop: space.xs }}>
              {[...days].reverse().map((d, i) => (
                <Pill key={d} tone={i === 0 ? 'accent' : 'muted'}>
                  {formatDay(d)}
                </Pill>
              ))}
            </div>
          )}
        </>
      )}

      {ended.map((m) => {
        const n = ptLeft(m);
        return (
          <div
            key={m.id}
            style={{
              marginTop: space.md,
              padding: space.md,
              border: `1px solid ${color.border}`,
              borderRadius: radius.md,
              background: color.surfaceSunken,
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: space.sm,
            }}
          >
            <span style={{ flex: '1 1 220px', minWidth: 0, fontFamily: font.body, fontSize: 13, fontWeight: 600, color: color.warning, overflowWrap: 'anywhere' }}>
              {m.planName} ·{' '}
              {n === 1
                ? `Ended on ${formatDay(m.endsOn)} with 1 session left`
                : `Ended on ${formatDay(m.endsOn)} with ${n} sessions left`}
              {!canExtend && (
                <span style={{ display: 'block', fontWeight: 400, color: color.inkSecondary }}>
                  Only the owner can extend it.
                </span>
              )}
            </span>
            {canExtend && (
              <Button variant="ghost" onClick={() => onExtend(m)}>
                Extend
              </Button>
            )}
          </div>
        );
      })}

      {running.length === 0 && canRenew && (
        <div style={{ marginTop: space.md }}>
          <Button onClick={onRenew}>Renew PT</Button>
        </div>
      )}
    </Card>
  );
}

function MembershipRow({
  membership,
  payments,
  today,
  onCancel,
  onRestore,
  onExtend,
}: {
  membership: Membership;
  payments: Payment[];
  today: string;
  /** Owners only: absent for Staff, and the button is not drawn. */
  onCancel?: () => void;
  onRestore?: () => void;
  /** Only on the plan that ends last: opens Freeze / Extra din. */
  onExtend?: () => void;
}) {
  const view = toMembershipView(membership, today);
  const unpaid = unpaidForMembership(membership, payments);
  const chased = isChased(membership);

  return (
    <div
      style={{
        border: `1px solid ${color.border}`,
        borderRadius: radius.md,
        padding: space.md,
        background: color.surfaceSunken,
      }}
    >
      <Row gap={space.sm}>
        <span style={{ fontFamily: font.body, fontWeight: 600, fontSize: 14, color: color.ink, flex: 1 }}>
          {membership.planName}
        </span>
        <Pill tone={stateTone(view.state)}>{STATE_LABEL[view.state]}</Pill>
      </Row>
      <div style={{ fontFamily: font.body, fontSize: 12, color: color.inkSecondary, marginTop: 4 }}>
        {formatDay(membership.startsOn)} → {formatDay(membership.endsOn)}
      </div>
      {isPtMembership(membership) && (
        <div style={{ fontFamily: font.body, fontSize: 12, fontWeight: 600, color: color.accentBright, marginTop: 4, overflowWrap: 'anywhere' }}>
          {ptSummary(membership)}
        </div>
      )}
      {/* The plan's own notes, which is where Freeze / Extra din records itself
          ("+15 days (Freeze - medical): …"), so the owner can see why the end date moved. */}
      {membership.notes?.trim() && (
        <div
          style={{
            fontFamily: font.body,
            fontSize: 12,
            color: color.inkMuted,
            marginTop: 4,
            whiteSpace: 'pre-line',
            overflowWrap: 'anywhere',
          }}
        >
          {/* C7-32: dates and words as the rest of the page shows them. */}
          {membership.notes
            .trim()
            .split('\n')
            .map(historyLine)
            .join('\n')}
        </div>
      )}
      {/* Figures wrap inside their own box; Cancel stays on the same line at the
          right. It used to wrap onto its own indented row on a phone for two of
          three cards and not the third. */}
      <Row gap={space.sm} wrap={false}>
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'baseline',
            columnGap: space.md,
            rowGap: 2,
          }}
        >
          <span style={{ fontFamily: font.mono, fontSize: 13, color: color.ink }}>{formatINR(view.totalDueP)}</span>
          {unpaid > 0 ? (
            // A cancelled term still shows what was never collected, but says
            // plainly that it is not being chased — otherwise this figure and the
            // "Outstanding" tile above disagree with no explanation.
            <span
              style={{
                fontFamily: font.mono,
                fontSize: 13,
                color: chased ? color.warning : color.inkMuted,
                fontWeight: 700,
              }}
            >
              {formatINR(unpaid)}{' '}
              {chased ? 'due' : 'unpaid · not in dues'}
            </span>
          ) : (
            <span style={{ fontFamily: font.body, fontSize: 12, color: color.goodText }}>Paid</span>
          )}
          {membership.listPriceP > membership.priceP && (
            <span style={{ fontFamily: font.body, fontSize: 12, color: color.inkMuted }}>
              {`${formatINR(membership.listPriceP - membership.priceP)} discount`}
            </span>
          )}
        </div>
        {membership.cancelled
          ? onRestore && (
              <Button variant="quiet" onClick={onRestore}>
                Undo cancel
              </Button>
            )
          : onCancel && (
              <Button variant="quiet" tone="danger" onClick={onCancel}>
                Cancel
              </Button>
            )}
      </Row>
      {onExtend && (
        <div style={{ marginTop: space.sm }}>
          <Button variant="ghost" full onClick={onExtend}>
            Freeze / extra days
          </Button>
        </div>
      )}
    </div>
  );
}

function PaymentRow({ payment, onVoid }: { payment: Payment; onVoid?: () => void }) {
  return (
    <Row gap={space.md} wrap={false}>
      {/* The receipt number is the handle on the printable copy — a member asking
          for "the receipt for July" is the commonest counter request there is. */}
      {/* Receipt number over date and method, as one tap target: side by side
          they left the date 60px on a phone and it broke into three lines. */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <Link to={`/receipts/${payment.id}`} title="Open printable receipt">
          <span style={{ display: 'block', minHeight: TOUCH, padding: '4px 0' }}>
            <span style={{ display: 'block', fontFamily: font.mono, fontSize: 13, color: color.accentBright }}>
              {payment.receiptNo}
            </span>
            <span
              style={{
                display: 'block',
                fontFamily: font.body,
                fontSize: 12,
                color: color.inkSecondary,
                marginTop: 2,
              }}
            >
              {formatDay(payment.paidOn)} · {methodLabel(payment.method)}
              {payment.reference ? ` · ${payment.reference}` : ''}
            </span>
          </span>
        </Link>
        {payment.voided && (
          // Colour + strikethrough alone is invisible to a screen reader, which
          // would read a cancelled receipt as a normal one.
          <div style={{ fontFamily: font.body, fontSize: 12, fontWeight: 700, color: color.criticalText }}>
            Cancelled
            {payment.voidReason ? `: ${payment.voidReason}` : ''}
          </div>
        )}
      </div>
      <span
        style={{
          fontFamily: font.mono,
          fontSize: 14,
          fontWeight: 700,
          color: payment.voided ? color.inkFaint : color.ink,
          textDecoration: payment.voided ? 'line-through' : undefined,
        }}
      >
        {formatINR(payment.amountP)}
      </span>
      {!payment.voided && onVoid && (
        <Button variant="quiet" tone="danger" onClick={onVoid}>
          Cancel receipt
        </Button>
      )}
    </Row>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt style={{ fontFamily: font.body, fontSize: 12, color: color.inkMuted }}>{label}</dt>
      <dd
        style={{
          margin: '2px 0 0',
          fontFamily: font.body,
          fontSize: 14,
          color: value ? color.ink : color.inkMuted,
          whiteSpace: 'pre-wrap',
        }}
      >
        {value || 'Not added'}
      </dd>
    </div>
  );
}

const linkStyle: React.CSSProperties = {
  fontFamily: "'Manrope', system-ui, sans-serif",
  fontSize: 13,
  color: color.accentBright,
  textDecoration: 'none',
  marginTop: space.sm,
  display: 'inline-block',
  minHeight: 44,
  lineHeight: '44px',
};
