/**
 * One member — everything the desk needs while they're standing there.
 *
 * Order is deliberate: status and what they owe first (the two things that decide
 * whether they train today), then the actions, then history. Contact details sit
 * below, because the person is usually in front of you.
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import { useCrm } from '../../store';
import { formatDay, relativeDay } from '../../logic/dates';
import { isChased, STATE_LABEL, stateTone, toMembershipView, unpaidForMembership } from '../../logic/membership';
import { formatINR } from '../../logic/money';
import { formatPhone, initials, phoneDigits } from '../../logic/members';
import type { Membership, Payment } from '../../types';
import { CollectPaymentSheet } from '../forms/CollectPaymentSheet';
import { MemberFormSheet } from '../forms/MemberFormSheet';
import { SellMembershipSheet } from '../forms/SellMembershipSheet';
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
import { navigate } from '../router';

type Confirming =
  | { kind: 'cancel'; membership: Membership }
  | { kind: 'void'; payment: Payment }
  | null;

export function MemberDetailScreen({ memberId }: { memberId: string }) {
  const { snapshot, today, viewFor, checkIn, setMemberArchived, cancelMembership, uncancelMembership, voidPayment } =
    useCrm();
  const [editing, setEditing] = useState(false);
  const [selling, setSelling] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [confirming, setConfirming] = useState<Confirming>(null);
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

  const visitCount = useMemo(
    () => snapshot.visits.filter((v) => v.memberId === memberId).length,
    [snapshot.visits, memberId],
  );

  const visitedToday = useMemo(
    () => snapshot.visits.some((v) => v.memberId === memberId && v.visitedOn === today),
    [snapshot.visits, memberId, today],
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
                onCancel={() => setConfirming({ kind: 'cancel', membership: m })}
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
              <PaymentRow key={p.id} payment={p} onVoid={() => setConfirming({ kind: 'void', payment: p })} />
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
          onSold={() => flash('Membership saved.')}
        />
      )}
      {collecting && (
        <CollectPaymentSheet
          view={view}
          onClose={() => setCollecting(false)}
          onCollected={() => flash('Payment recorded.')}
        />
      )}
      {confirming && (
        <ConfirmSheet
          confirming={confirming}
          onClose={() => setConfirming(null)}
          onCancelMembership={(reason) =>
            run(async () => {
              await cancelMembership(confirming.kind === 'cancel' ? confirming.membership.id : '', reason);
              setConfirming(null);
            }, 'Membership cancelled.')
          }
          onVoidPayment={(reason) =>
            run(async () => {
              await voidPayment(confirming.kind === 'void' ? confirming.payment.id : '', reason);
              setConfirming(null);
            }, 'Payment voided.')
          }
        />
      )}
      {toast && <Toast message={toast} />}
    </>
  );
}

/**
 * Cancelling a membership and voiding a receipt both move money. Neither may be a
 * single unconfirmed click — the review's point was that "Load demo gym" asked for
 * confirmation while the irreversible money actions did not.
 */
function ConfirmSheet({
  confirming,
  onClose,
  onCancelMembership,
  onVoidPayment,
}: {
  confirming: NonNullable<Confirming>;
  onClose: () => void;
  onCancelMembership: (reason: string) => void;
  onVoidPayment: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const isCancel = confirming.kind === 'cancel';

  return (
    <Sheet
      title={isCancel ? 'Cancel this membership?' : 'Void this receipt?'}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Keep it
          </Button>
          <Button
            tone="danger"
            disabled={reason.trim().length < 3}
            onClick={() => (isCancel ? onCancelMembership(reason.trim()) : onVoidPayment(reason.trim()))}
          >
            {isCancel ? 'Cancel membership' : 'Void receipt'}
          </Button>
        </>
      }
    >
      <p style={{ margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>
        {isCancel ? (
          <>
            <strong style={{ color: color.ink }}>{confirming.membership.planName}</strong> (
            {formatDay(confirming.membership.startsOn)} → {formatDay(confirming.membership.endsOn)}) will
            stop counting as cover and will no longer be chased for money. The record stays, and you can
            undo this afterwards.
          </>
        ) : (
          <>
            Receipt <strong style={{ color: color.ink }}>{confirming.payment.receiptNo}</strong> for{' '}
            {formatINR(confirming.payment.amountP)} will stop counting as money received. The row stays in
            the ledger and its number is never reused — that is what an auditor expects.
          </>
        )}
      </p>

      <TextField
        label="Reason"
        value={reason}
        onChange={setReason}
        autoFocus
        placeholder={isCancel ? 'Moved city' : 'Entered twice'}
        hint="Recorded against the record so it makes sense months later."
      />
    </Sheet>
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
      <span style={{ fontFamily: font.mono, fontSize: 12, color: color.inkMuted, minWidth: 96 }}>
        {payment.receiptNo}
      </span>
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
