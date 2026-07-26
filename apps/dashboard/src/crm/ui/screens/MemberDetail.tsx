/**
 * One member — everything the desk needs while they're standing there.
 *
 * Order is deliberate: status and what they owe first (the two things that decide
 * whether they train today), then the actions, then history. Contact details sit
 * below, because the person is usually in front of you.
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import { useCrm } from '../../store';
import {
  attendanceProfile,
  hourLabel,
  patternSummary,
  riskBandFor,
  riskReason,
  RHYTHM_WINDOW_DAYS,
} from '../../logic/attendance';
import { addDays, formatDay, relativeDay } from '../../logic/dates';
import { isChased, STATE_LABEL, stateTone, toMembershipView, unpaidForMembership } from '../../logic/membership';
import { formatINR } from '../../logic/money';
import { formatPhone, initials, phoneDigits } from '../../logic/members';
import type { Membership, Payment } from '../../types';
import { CollectPaymentSheet } from '../forms/CollectPaymentSheet';
import { MemberFormSheet } from '../forms/MemberFormSheet';
import { SellMembershipSheet } from '../forms/SellMembershipSheet';
import { VoidPaymentSheet } from '../forms/VoidPaymentSheet';
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
  color,
  font,
  radius,
  space,
} from '../kit';
import { Link, navigate } from '../router';

export function MemberDetailScreen({ memberId }: { memberId: string }) {
  const { snapshot, today, viewFor, checkIn, setMemberArchived, cancelMembership, uncancelMembership } =
    useCrm();
  const [editing, setEditing] = useState(false);
  const [selling, setSelling] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [cancelling, setCancelling] = useState<Membership | null>(null);
  const [voiding, setVoiding] = useState<Payment | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A stray `setTimeout` that outlives the screen sets state on an unmounted tree.
  const toastTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const view = viewFor(memberId);

  const memberships = useMemo(
    () =>
      snapshot.memberships
        .filter((m) => m.memberId === memberId)
        .sort((a, b) => b.startsOn.localeCompare(a.startsOn)),
    [snapshot.memberships, memberId],
  );

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

  const visitCount = memberVisits.length;

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

  return (
    <>
      <PageHeader
        title={member.fullName}
        subtitle={`Member since ${formatDay(member.joinedOn)}`}
        actions={
          <>
            <Button variant="ghost" onClick={() => setEditing(true)}>
              Edit
            </Button>
            {view.outstandingP > 0 && (
              <Button variant="ghost" onClick={() => setCollecting(true)}>
                Record payment
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
            </Row>
            <div style={{ marginTop: space.sm, fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>
              {current ? (
                <>
                  {current.planName} · {formatDay(current.startsOn)} → {formatDay(current.endsOn)}
                  {view.coversUntil && view.coversUntil !== current.endsOn ? (
                    // Already renewed: lead with where the cover actually runs to,
                    // so nobody chases a member who has paid.
                    <> · renewed through {formatDay(view.coversUntil)} ({relativeDay(view.coversUntil, today)})</>
                  ) : (
                    <> ({relativeDay(current.endsOn, today)})</>
                  )}
                </>
              ) : (
                'No membership on record.'
              )}
            </div>
            <Row gap={space.sm}>
              <a href={`tel:${member.phone}`} style={linkStyle}>
                {formatPhone(member.phone)}
              </a>
              <a
                href={`https://wa.me/${phoneDigits(member.phone)}`}
                target="_blank"
                rel="noreferrer"
                style={linkStyle}
              >
                WhatsApp
              </a>
            </Row>
          </div>
        </Row>
      </Card>

      <Grid min={190}>
        <StatTile
          label="Outstanding"
          value={view.outstandingP > 0 ? formatINR(view.outstandingP) : '—'}
          tone={view.outstandingP > 0 ? 'warn' : undefined}
          sub={view.outstandingP > 0 ? 'Money still owed' : 'Fully paid'}
        />
        <StatTile
          label="Last visit"
          value={view.lastVisitOn ? relativeDay(view.lastVisitOn, today) : 'never'}
          tone={view.daysSinceVisit !== null && view.daysSinceVisit >= 14 ? 'critical' : undefined}
          sub={view.lastVisitOn ? formatDay(view.lastVisitOn) : 'No check-ins recorded'}
        />
        <StatTile
          label="Days left"
          value={view.daysRemaining === null ? '—' : view.daysRemaining < 0 ? 'Expired' : view.daysRemaining}
          tone={view.daysRemaining !== null && view.daysRemaining <= 7 ? 'warn' : undefined}
        />
        <StatTile label="Total visits" value={visitCount} />
      </Grid>

      <div style={{ margin: `${space.lg}px 0` }}>
        <Row gap={space.sm}>
          <Button
            variant="ghost"
            disabled={visitedToday}
            onClick={() => run(() => checkIn(memberId, 'desk'), 'Checked in for today.')}
          >
            {visitedToday ? '✓ Checked in today' : 'Check in'}
          </Button>
          <Button
            variant="quiet"
            onClick={() =>
              run(
                () => setMemberArchived(memberId, !member.archived),
                member.archived ? 'Member restored.' : 'Member archived.',
              )
            }
          >
            {member.archived ? 'Restore member' : 'Archive member'}
          </Button>
        </Row>
      </div>

      {profile && (
        <Card style={{ marginBottom: space.lg }}>
          <SectionTitle>Training pattern</SectionTitle>
          <AttendanceStrip profile={profile} today={today} />
        </Card>
      )}

      <Card style={{ marginBottom: space.lg }}>
        <SectionTitle>Memberships</SectionTitle>
        {memberships.length === 0 ? (
          <EmptyState
            title="No memberships yet"
            body="Sell one and their expiry date starts driving the renewals list."
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
                onCancel={() => setCancelling(m)}
                onRestore={() => run(() => uncancelMembership(m.id), 'Cancellation reversed.')}
              />
            ))}
          </div>
        )}
      </Card>

      <Card style={{ marginBottom: space.lg }}>
        <SectionTitle>Payments</SectionTitle>
        {payments.length === 0 ? (
          <EmptyState title="No payments recorded" />
        ) : (
          <div style={{ display: 'grid', gap: space.xs }}>
            {payments.map((p) => (
              <PaymentRow key={p.id} payment={p} onVoid={() => setVoiding(p)} />
            ))}
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle>Details</SectionTitle>
        <dl style={{ margin: 0, display: 'grid', gap: space.md }}>
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
        </dl>
      </Card>

      {editing && <MemberFormSheet editing={member} onClose={() => setEditing(false)} />}
      {selling && (
        <SellMembershipSheet
          view={view}
          onClose={() => setSelling(false)}
          onSold={(result) =>
            flash(
              result.payment
                ? `Membership saved. Receipt ${result.payment.receiptNo}.`
                : 'Membership saved — nothing collected yet.',
            )
          }
        />
      )}
      {collecting && (
        <CollectPaymentSheet
          view={view}
          onClose={() => setCollecting(false)}
          onCollected={(payment) => flash(`Payment recorded. Receipt ${payment.receiptNo}.`)}
        />
      )}
      {cancelling && (
        <CancelMembershipSheet
          membership={cancelling}
          onClose={() => setCancelling(null)}
          onConfirm={(reason) =>
            run(async () => {
              await cancelMembership(cancelling.id, reason);
              setCancelling(null);
            }, 'Membership cancelled.')
          }
        />
      )}
      {voiding && (
        <VoidPaymentSheet
          payment={voiding}
          onClose={() => setVoiding(null)}
          onVoided={(restored) =>
            flash(restored ? 'Receipt voided. The amount is back on their dues.' : 'Receipt voided.')
          }
        />
      )}
      {toast && <Toast message={toast} />}
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
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');

  return (
    <Sheet
      title="Cancel this membership?"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Keep it
          </Button>
          <Button tone="danger" disabled={reason.trim().length < 3} onClick={() => onConfirm(reason.trim())}>
            Cancel membership
          </Button>
        </>
      }
    >
      <p style={{ margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>
        <strong style={{ color: color.ink }}>{membership.planName}</strong> (
        {formatDay(membership.startsOn)} → {formatDay(membership.endsOn)}) will stop counting as cover and
        will no longer be chased for money. The record stays, and you can undo this afterwards.
      </p>

      <TextField
        label="Reason"
        value={reason}
        onChange={setReason}
        autoFocus
        placeholder="Moved city"
        hint="Recorded against the record so it makes sense months later."
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
        {profile.usualHour !== null && <Pill tone="muted">Usually {hourLabel(profile.usualHour)}</Pill>}
        {profile.medianGapDays !== null && (
          <Pill tone="muted">
            Every {Math.round(profile.medianGapDays)} {Math.round(profile.medianGapDays) === 1 ? 'day' : 'days'}
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
        {profile.visitsInWindowN} {profile.visitsInWindowN === 1 ? 'visit' : 'visits'} in the last{' '}
        {RHYTHM_WINDOW_DAYS} days
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

function MembershipRow({
  membership,
  payments,
  today,
  onCancel,
  onRestore,
}: {
  membership: Membership;
  payments: Payment[];
  today: string;
  onCancel: () => void;
  onRestore: () => void;
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
      <Row gap={space.md}>
        <span style={{ fontFamily: font.mono, fontSize: 13, color: color.ink }}>
          {formatINR(view.totalDueP)}
        </span>
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
            {formatINR(unpaid)} {chased ? 'due' : 'unpaid · not chased'}
          </span>
        ) : (
          <span style={{ fontFamily: font.body, fontSize: 12, color: color.goodText }}>Paid</span>
        )}
        {membership.listPriceP > membership.priceP && (
          <span style={{ fontFamily: font.body, fontSize: 12, color: color.inkMuted }}>
            {formatINR(membership.listPriceP - membership.priceP)} discount
          </span>
        )}
        <span style={{ flex: 1 }} />
        {membership.cancelled ? (
          <Button variant="quiet" onClick={onRestore}>
            Undo cancel
          </Button>
        ) : (
          <Button variant="quiet" tone="danger" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </Row>
    </div>
  );
}

function PaymentRow({ payment, onVoid }: { payment: Payment; onVoid: () => void }) {
  return (
    <Row gap={space.md} wrap={false}>
      {/* The receipt number is the handle on the printable copy — a member asking
          for "the receipt for July" is the commonest counter request there is. */}
      <Link to={`/receipts/${payment.id}`} title="Open printable receipt">
        <span
          style={{
            fontFamily: font.mono,
            fontSize: 12,
            color: color.accentBright,
            minWidth: 96,
            display: 'inline-block',
            minHeight: 44,
            lineHeight: '44px',
          }}
        >
          {payment.receiptNo}
        </span>
      </Link>
      <span style={{ fontFamily: font.body, fontSize: 13, color: color.inkSecondary, flex: 1, minWidth: 0 }}>
        {formatDay(payment.paidOn)} · {payment.method.toUpperCase()}
        {payment.reference ? ` · ${payment.reference}` : ''}
        {payment.voided && (
          // Colour + strikethrough alone is invisible to a screen reader, which
          // would read a cancelled receipt as a normal one.
          <strong style={{ color: color.criticalText }}> · VOIDED{payment.voidReason ? `: ${payment.voidReason}` : ''}</strong>
        )}
      </span>
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
      {!payment.voided && (
        <Button variant="quiet" tone="danger" onClick={onVoid}>
          Void
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
          color: value ? color.ink : color.inkFaint,
          whiteSpace: 'pre-wrap',
        }}
      >
        {value || 'Not recorded'}
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
