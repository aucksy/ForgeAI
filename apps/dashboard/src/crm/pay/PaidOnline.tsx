/**
 * F79 online payments (R-328): payments that came in online while no sheet was open (the member paid
 * the link later, from home). On Today, every 5 minutes while the admin app is in view (R-522: never with the tab
 * hidden; at once when it comes back), the desk asks the
 * server for paid links with no receipt yet and makes each receipt by itself: same receipt numbers and
 * rules as the desk's own (recordPayment), the company's payment id as the reference, "Paid online" as
 * the note. One desk at a time makes a receipt (claimReceipt is a 5-minute lease), and the same
 * payment can never make two receipts (requestId `pay-<id>`, the store's C7-1 rule).
 *
 * A payment that cannot become a receipt by itself (the membership was removed, or it is more than is
 * due now) is shown on Today: "Paid online, receipt not made", with the member and the amount, so the
 * desk can save it by hand and tap "I saved it".
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '../auth/AuthProvider';
import { takerOf } from '../auth/permissions';
import { t } from '../lang/lang';
import { dateISOFromEpoch } from '../logic/dates';
import { isRealMoney, joinLeftover } from '../logic/joinPay';
import { waitingOnlineJoins } from '../logic/selfJoin';
import { startVisiblePoll } from '../logic/visiblePoll';
import { unpaidForMembership } from '../logic/membership';
import { formatINR } from '../logic/money';
import { useCrm } from '../store';
import { Button, Card, Row, SectionTitle, color, font, space } from '../ui/kit';
import { navigate } from '../ui/router';
import { claimReceipt, markRecorded, paidOnline, type PayRequest } from './payApi';
import { onlineReference, receiptMethod } from './payWords';
import { useDeskPay } from './useDeskPay';

// R-522: was every 2 minutes, also with the tab hidden (720 calls a day per open panel).
const EVERY_MS = 5 * 60_000;

export type StuckWhy = 'NO_MEMBERSHIP' | 'MORE_THAN_DUE' | 'TEST_MODE' | 'JOIN_NOT_APPROVED';

/** Can this paid request become a receipt by itself? PURE. */
export function stuckWhy(
  r: PayRequest,
  memberships: readonly { id: string; memberId: string; priceP: number; joiningFeeP: number }[],
  unpaid: (membershipId: string) => number,
): StuckWhy | null {
  // Payment sweep (R-542): a test-mode payment is never a receipt (anyone can "pay" a test link).
  if (!isRealMoney(r)) return 'TEST_MODE';
  const m = memberships.find((x) => x.id === r.ref && x.memberId === r.memberId);
  if (!m) return 'NO_MEMBERSHIP';
  if ((r.paidP || r.amountP) > unpaid(m.id)) return 'MORE_THAN_DUE';
  return null;
}

/** The receipt's date: the day it was paid (India time), never later than today. PURE. */
export function paidDay(paidAt: string | null, today: string): string {
  const ms = paidAt ? Date.parse(paidAt) : NaN;
  const day = Number.isFinite(ms) ? dateISOFromEpoch(ms) : '';
  return day && day <= today ? day : today;
}

export function PaidOnlineCard() {
  const { snapshot, today, recordPayment } = useCrm();
  const session = useAuth().session;
  const { state, key } = useDeskPay();
  const on = state?.on === true && state.connectOn;
  const [stuck, setStuck] = useState<{ r: PayRequest; why: StuckWhy }[]>([]);
  const running = useRef(false);
  const latest = useRef({ snapshot, today, recordPayment, session });
  latest.current = { snapshot, today, recordPayment, session };

  const sweep = useCallback(async () => {
    if (!key || running.current) return;
    running.current = true;
    try {
      const { paid } = await paidOnline(key);
      const { snapshot: snap, today: day, recordPayment: save, session: who } = latest.current;
      const unpaid = (id: string) => {
        const m = snap.memberships.find((x) => x.id === id);
        return m ? unpaidForMembership(m, snap.payments) : 0;
      };
      const left: { r: PayRequest; why: StuckWhy }[] = [];
      const waiting = new Set(waitingOnlineJoins(snap.enquiries).map((j) => j.enquiry.id));
      for (const r of paid) {
        // Payment sweep (R-542): a join payment nobody approved must not sit unseen: the gym holds that money.
        if (r.kind === 'join') {
          const leftover = joinLeftover(r, waiting, snap.payments);
          if (leftover.kind === 'stuck') left.push({ r, why: leftover.why });
          else if (leftover.kind === 'saved') {
            const { token } = await claimReceipt(key, r.id);
            if (token) await markRecorded(key, r.id, { token, receiptNo: leftover.receiptNo });
          }
          continue;
        }
        if (r.kind !== 'fee' || !r.memberId) continue;
        const why = stuckWhy(r, snap.memberships, unpaid);
        if (why) {
          left.push({ r, why });
          continue;
        }
        const { token } = await claimReceipt(key, r.id);
        if (!token) continue; // another desk is making it
        const taker = takerOf(who);
        const payment = await save({
          memberId: r.memberId,
          membershipId: r.ref,
          amountP: r.paidP || r.amountP,
          method: receiptMethod(r),
          paidOn: paidDay(r.paidAt, day),
          reference: onlineReference(r) || null,
          note: r.testMode ? 'Paid online (test mode)' : 'Paid online',
          collectedBy: taker.id,
          collectedByName: taker.name,
          requestId: `pay-${r.id}`,
        });
        await markRecorded(key, r.id, { token, receiptNo: payment.receiptNo ?? '' });
      }
      setStuck(left);
    } catch (e) {
      console.warn('[pay] paid-online check failed; trying again later', e instanceof Error ? e.message : e);
    } finally {
      running.current = false;
    }
  }, [key]);

  useEffect(() => {
    if (!on || !key) return;
    return startVisiblePoll(sweep, EVERY_MS);
  }, [on, key, sweep]);

  const savedByHand = async (r: PayRequest) => {
    if (!key) return;
    try {
      const { token } = await claimReceipt(key, r.id);
      if (token) await markRecorded(key, r.id, { token, receiptNo: '' });
      setStuck((old) => old.filter((x) => x.r.id !== r.id));
    } catch (e) {
      console.warn('[pay] could not mark an online payment as saved', e instanceof Error ? e.message : e);
    }
  };

  if (!on || stuck.length === 0) return null;
  const nameOf = (r: PayRequest) =>
    (r.kind === 'join' ? snapshot.enquiries.find((e) => e.id === r.ref)?.name : snapshot.members.find((m) => m.id === r.memberId)?.fullName) ?? t('A member');

  return (
    <Card style={{ marginBottom: space.lg }}>
      <SectionTitle>{t('Paid online, receipt not made')}</SectionTitle>
      <p style={{ margin: 0, fontFamily: font.body, fontSize: 13, color: color.inkSecondary }}>
        {t('These members paid online, but the receipt could not be made by itself. Save each payment by hand, then tap I saved it.')}
      </p>
      {stuck.map(({ r, why }) => (
        <div key={r.id} style={{ marginTop: space.md, paddingTop: space.md, borderTop: `1px solid ${color.border}` }}>
          <div style={{ fontFamily: font.body, fontSize: 14, fontWeight: 700, color: color.ink }}>
            {why === 'TEST_MODE'
              ? t('{name} paid {amount} in test mode', { name: nameOf(r), amount: formatINR(r.paidP || r.amountP) })
              : t('{name} paid {amount} online', { name: nameOf(r), amount: formatINR(r.paidP || r.amountP) })}
          </div>
          <div style={{ fontFamily: font.body, fontSize: 13, color: color.inkMuted }}>
            {why === 'TEST_MODE'
              ? t('Test mode: no real money came in, so no receipt was made. Collect the fee at the desk.')
              : why === 'JOIN_NOT_APPROVED'
                ? t('They paid on your join page, but were made a member without Approve. They may have paid twice: check, and refund one if so. If not, save this payment on their member page.')
                : why === 'NO_MEMBERSHIP'
                  ? t('The plan this was for is no longer there.')
                  : t('It is more than what is due on that plan now.')}{' '}
            {onlineReference(r)}
          </div>
          <Row gap={space.sm} align="center">
            {r.memberId && (
              <Button variant="quiet" onClick={() => navigate(`/members/${r.memberId}`)}>
                {t('Open member')}
              </Button>
            )}
            <Button variant="quiet" onClick={() => savedByHand(r)}>
              {why === 'TEST_MODE' ? t('Got it') : t('I saved it')}
            </Button>
          </Row>
        </div>
      ))}
    </Card>
  );
}
