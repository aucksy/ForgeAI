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
import { tr } from '../../i18n';
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
import { addDays, formatDay, relativeDay } from '../../logic/dates';
import { isChased, STATE_LABEL, stateTone, toMembershipView, unpaidForMembership } from '../../logic/membership';
import { formatINR } from '../../logic/money';
import { formatPhone, initials } from '../../logic/members';
import { methodLabel } from '../../logic/payments';
import type { Membership, Payment } from '../../types';
import { CollectPaymentSheet } from '../forms/CollectPaymentSheet';
import { ExtendMembershipSheet } from '../forms/ExtendMembershipSheet';
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
  TOUCH,
  useIsCompact,
} from '../kit';
import { Link, navigate } from '../router';

export function MemberDetailScreen({ memberId }: { memberId: string }) {
  const { snapshot, today, viewFor, checkIn, setMemberArchived, cancelMembership, uncancelMembership } =
    useCrm();
  const compact = useIsCompact();
  const { cloud } = useShop();
  const [editing, setEditing] = useState(false);
  const [selling, setSelling] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [cancelling, setCancelling] = useState<Membership | null>(null);
  const [extending, setExtending] = useState<Membership | null>(null);
  const [voiding, setVoiding] = useState<Payment | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [whatsApp, setWhatsApp] = useState(false);

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

  // Freeze / Extra din goes on the plan that ends LAST (not cancelled): extending an earlier
  // term when a renewal is already queued would make the two overlap and give the member nothing.
  // An ended plan qualifies too — the days are given back from its old last day.
  const extendTarget = useMemo(
    () =>
      memberships
        .filter((m) => !m.cancelled)
        .reduce<Membership | null>((best, m) => (!best || m.endsOn > best.endsOn ? m : best), null),
    [memberships],
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
          title={tr('Member not found', 'Member nahi mila')}
          body={tr('They may have been removed.', 'Shayad hata diya gaya hai.')}
          action={<Button onClick={() => navigate('/members')}>{tr('Back to members', 'Peeche, members par')}</Button>}
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
      setError(e instanceof Error ? e.message : tr('That didn’t work. Please try again.', 'Kuch gadbad hui. Phir se try karo.'));
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
        onClick={() => run(() => checkIn(memberId, 'desk'), tr('Checked in for today.', 'Aaj ki Hazri lag gayi.'))}
      >
        {visitedToday ? tr('Checked in today', 'Aaj Hazri lag gayi') : tr('Check in', 'Hazri lagao')}
      </Button>
      <Button
        full
        variant="ghost"
        tone={member.archived ? undefined : 'danger'}
        onClick={() =>
          run(
            () => setMemberArchived(memberId, !member.archived),
            member.archived
              ? tr('Member restored.', 'Member wapas aa gaya.')
              : tr('Member archived.', 'Member archive ho gaya.'),
          )
        }
      >
        {member.archived ? tr('Restore member', 'Member wapas lao') : tr('Archive member', 'Archive karo')}
      </Button>
    </div>
  );

  return (
    <>
      <PageHeader
        title={member.fullName}
        subtitle={tr(`Member since ${formatDay(member.joinedOn)}`, `${formatDay(member.joinedOn)} se member`)}
        actions={
          <>
            <Button variant="ghost" onClick={() => setEditing(true)}>
              {tr('Edit', 'Badlo')}
            </Button>
            {view.outstandingP > 0 && (
              <Button variant="ghost" onClick={() => setCollecting(true)}>
                {tr('Record payment', 'Fees lo')}
              </Button>
            )}
            <Button onClick={() => setSelling(true)}>
              {view.coversUntil ? tr('Renew', 'Renew karo') : tr('Sell membership', 'Plan do')}
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
              {member.archived && <Pill tone="muted">{tr('Archived', 'Archive kiye')}</Pill>}
              {member.appUserId && <Pill tone="accent">{tr('Using the app', 'App chala rahe')}</Pill>}
            </Row>
            <div style={{ marginTop: space.sm, fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>
              {current ? (
                <>
                  {current.planName} · {formatDay(current.startsOn)} → {formatDay(current.endsOn)}
                  {view.coversUntil && view.coversUntil !== current.endsOn ? (
                    // Already renewed: lead with where the cover actually runs to,
                    // so nobody chases a member who has paid.
                    <>
                      {tr(
                        ` · renewed through ${formatDay(view.coversUntil)} (${relativeDay(view.coversUntil, today)})`,
                        ` · ${formatDay(view.coversUntil)} tak Renew hai (${relativeDay(view.coversUntil, today)})`,
                      )}
                    </>
                  ) : (
                    <> ({relativeDay(current.endsOn, today)})</>
                  )}
                </>
              ) : (
                tr('No membership on record.', 'Koi plan nahi hai.')
              )}
            </div>
            <Row gap={space.sm}>
              <a href={`tel:${member.phone}`} style={linkStyle}>
                {formatPhone(member.phone)}
              </a>
              {/* Step 4: WhatsApp with the message already typed (fees, plan ending, birthday…). */}
              <button type="button" onClick={() => setWhatsApp(true)} style={{ ...linkStyle, background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit' }}>
                {tr('WhatsApp', 'WhatsApp bhejo')}
              </button>
              {/* Invite link: WhatsApp opens on this member with the gym's link typed in. */}
              {cloud && !member.appUserId && (
                <a
                  href={whatsAppHref(inviteMessage(cloud.name, cloud.joinCode, member.fullName), member.phone)}
                  target="_blank"
                  rel="noreferrer"
                  style={linkStyle}
                >
                  {tr('Send app invite', 'App ka invite bhejo')}
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
          label={tr('Outstanding', 'Baaki')}
          value={view.outstandingP > 0 ? formatINR(view.outstandingP) : '—'}
          tone={view.outstandingP > 0 ? 'warn' : undefined}
          sub={view.outstandingP > 0 ? tr('Money still owed', 'Fees baaki hai') : tr('Fully paid', 'Poori fees di')}
        />
        <StatTile
          label={tr('Last visit', 'Aakhri hazri')}
          value={view.lastVisitOn ? relativeDay(view.lastVisitOn, today) : tr('never', 'kabhi nahi')}
          tone={view.daysSinceVisit !== null && view.daysSinceVisit >= 14 ? 'critical' : undefined}
          sub={view.lastVisitOn ? formatDay(view.lastVisitOn) : tr('No check-ins recorded', 'Koi Hazri nahi lagi')}
        />
        <StatTile
          label={tr('Days left', 'Kitne din bache')}
          value={view.daysRemaining === null ? '—' : view.daysRemaining < 0 ? tr('Expired', 'Khatam ho gaye') : view.daysRemaining}
          tone={view.daysRemaining !== null && view.daysRemaining <= 7 ? 'warn' : undefined}
          sub={
            view.coversUntil
              ? view.daysRemaining === 0
                ? tr('Last day is today', 'Aaj aakhri din hai')
                : tr(`Covered until ${formatDay(view.coversUntil)}`, `${formatDay(view.coversUntil)} tak chalu`)
              : tr('No live membership', 'Koi chalu plan nahi')
          }
        />
        <StatTile
          label={tr('Total visits', 'Kul hazri')}
          value={visitCount}
          sub={tr(`Since ${formatDay(member.joinedOn)}`, `${formatDay(member.joinedOn)} se`)}
        />
      </Grid>

      <div style={{ height: space.lg }} />

      {profile && (
        <Card style={{ marginBottom: space.lg }}>
          <SectionTitle>{tr('Training pattern', 'Aane ka pattern')}</SectionTitle>
          <AttendanceStrip profile={profile} today={today} />
        </Card>
      )}

      <Card style={{ marginBottom: space.lg }}>
        <SectionTitle>{tr('Memberships', 'Plan')}</SectionTitle>
        {memberships.length === 0 ? (
          <EmptyState
            title={tr('No memberships yet', 'Abhi koi plan nahi')}
            body={tr(
              'Sell one and their expiry date starts driving the renewals list.',
              'Plan do, phir khatam hone ki date Renew list mein aayegi.',
            )}
            action={<Button onClick={() => setSelling(true)}>{tr('Sell membership', 'Plan do')}</Button>}
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
                onExtend={extendTarget?.id === m.id ? () => setExtending(m) : undefined}
                onRestore={() => run(() => uncancelMembership(m.id), tr('Cancellation reversed.', 'Cancel wapas liya.'))}
              />
            ))}
          </div>
        )}
      </Card>

      <Card style={{ marginBottom: space.lg }}>
        <SectionTitle>{tr('Payments', 'Fees ka hisaab')}</SectionTitle>
        {payments.length === 0 ? (
          <EmptyState title={tr('No payments recorded', 'Abhi koi fees nahi li')} />
        ) : (
          <div style={{ display: 'grid', gap: space.xs }}>
            {payments.map((p) => (
              <PaymentRow key={p.id} payment={p} onVoid={() => setVoiding(p)} />
            ))}
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle>{tr('Details', 'Jaankari')}</SectionTitle>
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
          <Detail label={tr('Mobile', 'Mobile')} value={formatPhone(member.phone)} />
          <Detail label={tr('Email', 'Email')} value={member.email} />
          <Detail label={tr('Date of birth', 'Janam din')} value={member.dateOfBirth ? formatDay(member.dateOfBirth) : null} />
          <Detail label={tr('Address', 'Pata')} value={member.address} />
          <Detail
            label={tr('Emergency contact', 'Ghar ka number')}
            value={
              member.emergencyName || member.emergencyPhone
                ? `${member.emergencyName ?? ''} ${member.emergencyPhone ? formatPhone(member.emergencyPhone) : ''}`.trim()
                : null
            }
          />
          <Detail label={tr('Notes', 'Notes')} value={member.notes} />
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
                ? tr(
                    `Membership saved. Receipt ${result.payment.receiptNo}.`,
                    `Plan save ho gaya. Raseed ${result.payment.receiptNo}.`,
                  )
                : tr('Membership saved — nothing collected yet.', 'Plan save ho gaya — abhi fees nahi li.'),
            )
          }
        />
      )}
      {collecting && (
        <CollectPaymentSheet
          view={view}
          onClose={() => setCollecting(false)}
          onCollected={(payment) => flash(tr(`Payment recorded. Receipt ${payment.receiptNo}.`, `Fees le li. Raseed ${payment.receiptNo}.`))}
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
            }, tr('Membership cancelled.', 'Plan cancel ho gaya.'))
          }
        />
      )}
      {extending && (
        <ExtendMembershipSheet
          membership={extending}
          onClose={() => setExtending(null)}
          onDone={(days) => flash(tr(`Plan moved ${days} days later.`, `Plan ${days} din aage badh gaya.`))}
        />
      )}
      {voiding && (
        <VoidPaymentSheet
          payment={voiding}
          onClose={() => setVoiding(null)}
          onVoided={(restored) =>
            flash(
              restored
                ? tr(
                    'Receipt voided. The amount is back on their dues.',
                    'Raseed cancel ho gayi. Paise wapas Fees baaki mein jud gaye.',
                  )
                : tr('Receipt voided.', 'Raseed cancel ho gayi.'),
            )
          }
        />
      )}
      {whatsApp && view && <WhatsAppSheet view={view} onClose={() => setWhatsApp(false)} />}
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
      title={tr('Cancel this membership?', 'Yeh plan cancel karein?')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tr('Keep it', 'Rehne do')}
          </Button>
          <Button tone="danger" disabled={reason.trim().length < 3} onClick={() => onConfirm(reason.trim())}>
            {tr('Cancel membership', 'Plan cancel karo')}
          </Button>
        </>
      }
    >
      <p style={{ margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>
        <strong style={{ color: color.ink }}>{membership.planName}</strong>
        {tr(
          ` (${formatDay(membership.startsOn)} → ${formatDay(membership.endsOn)}) will stop counting as cover and will no longer be chased for money. The record stays, and you can undo this afterwards.`,
          ` (${formatDay(membership.startsOn)} → ${formatDay(membership.endsOn)}) ab cover mein nahi ginega aur iski fees nahi maangi jayegi. Record rahega, aur aap baad mein ise wapas kar sakte hain.`,
        )}
      </p>

      <TextField
        label={tr('Reason', 'Kaaran')}
        value={reason}
        onChange={setReason}
        autoFocus
        placeholder={tr('Moved city', 'Shehar badal liya')}
        hint={tr(
          'Recorded against the record so it makes sense months later.',
          'Record mein likha rahega, taaki mahino baad bhi samajh aaye.',
        )}
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
            {tr(`Usually ${hourLabel(profile.usualHour)}`, `Aksar ${hourLabel(profile.usualHour)}`)}
          </Pill>}
        {profile.medianGapDays !== null && (
          <Pill tone="muted">
            {Math.round(profile.medianGapDays) === 1
              ? tr(`Every ${Math.round(profile.medianGapDays)} day`, 'Har din')
              : tr(
                  `Every ${Math.round(profile.medianGapDays)} days`,
                  `Har ${Math.round(profile.medianGapDays)} din mein`,
                )}
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
            title={`${formatDay(day)}${present.has(day) ? tr(' — trained', ' — aaye') : ''}`}
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
          ? tr(
              `${profile.visitsInWindowN} visit in the last ${RHYTHM_WINDOW_DAYS} days`,
              `Pichhle ${RHYTHM_WINDOW_DAYS} din mein ${profile.visitsInWindowN} baar aaye`,
            )
          : tr(
              `${profile.visitsInWindowN} visits in the last ${RHYTHM_WINDOW_DAYS} days`,
              `Pichhle ${RHYTHM_WINDOW_DAYS} din mein ${profile.visitsInWindowN} baar aaye`,
            )}
        {/* The rate is measured over the days their plan actually covered, so it says
            so — otherwise a member who renewed six days ago reads "20 visits in 56
            days · about 20.0 a week" and the two numbers cannot both be true. */}
        {profile.weeklyRate > 0 &&
          tr(
            ` · about ${profile.weeklyRate.toFixed(1)} a week while their plan was running`,
            ` · plan chalte waqt hafte mein lagbhag ${profile.weeklyRate.toFixed(1)} baar`,
          )}
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
  onExtend,
}: {
  membership: Membership;
  payments: Payment[];
  today: string;
  onCancel: () => void;
  onRestore: () => void;
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
          {membership.notes.trim()}
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
              {chased ? tr('due', 'baaki') : tr('unpaid · not chased', 'Fees nahi di · maangi nahi jayegi')}
            </span>
          ) : (
            <span style={{ fontFamily: font.body, fontSize: 12, color: color.goodText }}>{tr('Paid', 'Poori fees di')}</span>
          )}
          {membership.listPriceP > membership.priceP && (
            <span style={{ fontFamily: font.body, fontSize: 12, color: color.inkMuted }}>
              {tr(
                `${formatINR(membership.listPriceP - membership.priceP)} discount`,
                `${formatINR(membership.listPriceP - membership.priceP)} Chhoot`,
              )}
            </span>
          )}
        </div>
        {membership.cancelled ? (
          <Button variant="quiet" onClick={onRestore}>
            {tr('Undo cancel', 'Cancel wapas lo')}
          </Button>
        ) : (
          <Button variant="quiet" tone="danger" onClick={onCancel}>
            {tr('Cancel', 'Cancel')}
          </Button>
        )}
      </Row>
      {onExtend && (
        <div style={{ marginTop: space.sm }}>
          <Button variant="ghost" full onClick={onExtend}>
            {tr('Freeze / extra days', 'Freeze / Extra din')}
          </Button>
        </div>
      )}
    </div>
  );
}

function PaymentRow({ payment, onVoid }: { payment: Payment; onVoid: () => void }) {
  return (
    <Row gap={space.md} wrap={false}>
      {/* The receipt number is the handle on the printable copy — a member asking
          for "the receipt for July" is the commonest counter request there is. */}
      {/* Receipt number over date and method, as one tap target: side by side
          they left the date 60px on a phone and it broke into three lines. */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <Link to={`/receipts/${payment.id}`} title={tr('Open printable receipt', 'Raseed kholo')}>
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
            {tr('Voided', 'Raseed cancel hui')}
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
      {!payment.voided && (
        <Button variant="quiet" tone="danger" onClick={onVoid}>
          {tr('Void', 'Raseed cancel karo')}
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
        {value || tr('Not recorded', 'Nahi likha')}
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
