/**
 * "Joined online" on Today (R-513 Join online): people who filled the gym's "Become a member" page on their own phone
 * (app.mettleup.fit/m/<code>). Each row: the name, the plan and start day they picked, and how they pay.
 *  - Paid on the page (R-528): "Paid online" and one "Approve" tap: the member, their plan and the receipt are made
 *    together (logic/joinPay.ts). A plain UPI payment nobody confirms says "Check your bank before approving".
 *  - Not paid (pay at the desk, or an online try that failed or was left half way): "Make member", as before: the
 *    usual Add member form filled in, then Sell membership on that plan (nothing collected until they pay).
 * Hidden when nobody is waiting. Owner and desk (both may add members and sell plans). Rules: logic/selfJoin.ts,
 * logic/joinPay.ts. The join page's payments are asked every 2 minutes while Today is in view and a row is waiting.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '../auth/AuthProvider';
import { useJoinPayOn } from '../gympage/pagesOpen';
import { takerOf } from '../auth/permissions';
import { t } from '../lang/lang';
import { formatDay } from '../logic/dates';
import { approveQuestion, approveSale, canApprove, isRealMoney, joinPayFor, openJoinPays, paidWhileClosing, type JoinPayState } from '../logic/joinPay';
import { emptyMemberForm, findDuplicatePhone, formatPhone, splitE164, validateMember } from '../logic/members';
import { formatINR } from '../logic/money';
import { waitingOnlineJoins, type OnlineJoin } from '../logic/selfJoin';
import { startVisiblePoll } from '../logic/visiblePoll';
import { cancelRequest, checkBeforeApprove, claimReceipt, joinPays, markRecorded, type JoinPay } from '../pay/payApi';
import { useDeskPay } from '../pay/useDeskPay';
import { useCrm } from '../store';
import type { Enquiry, EnquirySelfJoin, Member } from '../types';
import { Button, Card, ErrorBanner, Row, SectionTitle, color, font, space } from './kit';
import { navigate } from './router';
import { MakeMemberFlow } from './screens/Enquiries';

const EVERY_MS = 2 * 60_000;

/**
 * The row's money line. Payment sweep (R-542): a paid row says what was REALLY paid (the server's paid amount), never
 * the plan's total in its place; a test-mode payment says plainly that no money came in.
 */
export function payLine(total: number, s: JoinPayState): { text: string; tone: 'good' | 'warn' } {
  const amount = formatINR(total);
  if (s.kind === 'paid') {
    const paid = formatINR(s.pay.paidP || s.pay.amountP);
    if (!isRealMoney(s.pay)) return { text: t('{total} paid in test mode · No real money came in · Collect it at the desk', { total: paid }), tone: 'warn' };
    if ((s.pay.paidP || s.pay.amountP) !== total) return { text: t('{paid} paid online, but the plan is {total} · Check before approving', { paid, total: amount }), tone: 'warn' };
    return { text: t('{total} paid online', { total: paid }), tone: 'good' };
  }
  if (s.kind === 'said') return { text: t('{total} paid by UPI, they say · Check your bank before approving', { total: amount }), tone: 'warn' };
  if (s.kind === 'failed') return { text: t('{total} · The online payment did not go through · Not paid', { total: amount }), tone: 'warn' };
  if (s.kind === 'started') return { text: t('{total} · Started paying online, did not finish · Not paid', { total: amount }), tone: 'warn' };
  return { text: t('{total} to pay at the desk · Not paid yet', { total: amount }), tone: 'warn' };
}

/** The question Approve asks first (approveQuestion). */
export function approveWords(ask: NonNullable<ReturnType<typeof approveQuestion>>, name: string): string {
  if (ask.kind === 'bank') return t('Can you see {amount} from {name} in your bank or UPI app? Approve saves it as paid.', { amount: formatINR(ask.askedP), name });
  return t('{name} paid {paid}, but the plan is {total}. Approve saves {paid} as paid; the rest stays due.', { name, paid: formatINR(ask.paidP), total: formatINR(ask.askedP) });
}

export function JoinedOnlineCard() {
  const crm = useCrm();
  const { snapshot } = crm;
  const session = useAuth().session;
  const { state, key } = useDeskPay();
  const rows = useMemo(() => waitingOnlineJoins(snapshot.enquiries), [snapshot.enquiries]);
  // Kept while the flow runs: the row itself goes away as soon as the member is saved.
  const [making, setMaking] = useState<Enquiry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pays, setPays] = useState<JoinPay[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const payOn = state?.on === true && Boolean(key);
  // R-555: while join payments are held (the Worker's JOIN_PAY off) nobody can pay on the join page, so the card does
  // not talk about approving online payments. One already paid (made while it was on) still says it, with Approve.
  const joinPay = useJoinPayOn();
  const anyPaid = pays.some((p) => p.status === 'paid');

  const load = useCallback(async () => {
    if (!key) return;
    try {
      setPays(await joinPays(key));
    } catch (e) {
      // An older server (no /api/pay/joins) or no internet: the rows show "pay at the desk", as before.
      console.warn('[join-pay] payments on the join page not read; trying again later', e instanceof Error ? e.message : e);
    }
  }, [key]);

  useEffect(() => {
    if (!payOn || rows.length === 0) return;
    return startVisiblePoll(load, EVERY_MS);
  }, [payOn, rows.length, load]);

  const approve = async ({ enquiry, join }: OnlineJoin, s: JoinPayState) => {
    if (!key || !canApprove(s)) return;
    // Payment sweep (R-542): a UPI payment nobody confirmed, or a payment that is not the plan's amount, is asked first.
    const ask = approveQuestion(s);
    if (ask && !window.confirm(approveWords(ask, enquiry.name))) return;
    setBusy(enquiry.id);
    setError(null);
    try {
      const member = await approveJoin(crm, key, takerOf(session), enquiry, s.pay, join);
      navigate(`/members/${member.id}`);
    } catch (e) {
      console.warn('[join-pay] approve failed', e instanceof Error ? e.message : e);
      setError(approveProblem(e));
    } finally {
      setBusy(null);
      void load();
    }
  };

  // Review round 2 (R-542): before Make member, the join page's open payment is closed (the server asks the company
  // first and cancels the link there too), so nobody pays online after paying at the desk. Paid a moment ago: Approve.
  const makeMember = async (enquiry: Enquiry) => {
    setError(null);
    const open = payOn && key ? openJoinPays(enquiry.id, pays) : [];
    if (key && open.length > 0) {
      setBusy(enquiry.id);
      try {
        const closed = await Promise.all(open.map((p) => cancelRequest(key, p.id)));
        if (paidWhileClosing(closed)) {
          setError(t('{name} has just paid online. Tap Approve instead.', { name: enquiry.name }));
          return;
        }
      } catch (e) {
        console.warn('[join-pay] the open online payment was not closed', e instanceof Error ? e.message : e);
        setError(t('Could not check their online payment. Check your internet and try again.'));
        return;
      } finally {
        setBusy(null);
        void load();
      }
    }
    setMaking(enquiry);
  };

  if (rows.length === 0 && !making && !error) return null;

  return (
    <>
      {rows.length > 0 || error ? (
        <Card pad={space.lg} style={{ marginBottom: space.md }}>
          <SectionTitle>{t('Joined online')}</SectionTitle>
          <p style={{ margin: `0 0 ${space.md}px`, fontFamily: font.body, fontSize: 13, color: color.inkSecondary, overflowWrap: 'anywhere' }}>
            {joinPay || anyPaid
              ? t('They filled your "Become a member" page. Approve the ones who paid online. Make the others members when they come in and pay.')
              : t('They filled your "Become a member" page. Make them members when they come in and pay.')}
          </p>
          {error ? <ErrorBanner>{error}</ErrorBanner> : null}
          <div style={{ display: 'flex', flexDirection: 'column', gap: space.md }}>
            {rows.map((row) => {
              const { enquiry, join } = row;
              const s = join.paid ? ({ kind: 'desk' } as JoinPayState) : joinPayFor(enquiry.id, pays);
              const line = join.paid ? { text: t('{total} paid', { total: formatINR(join.totalP) }), tone: 'good' as const } : payLine(join.totalP, s);
              const one = canApprove(s);
              return (
                <Row key={enquiry.id} gap={space.md}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontFamily: font.body, fontSize: 14, fontWeight: 600, color: color.ink, overflowWrap: 'anywhere' }}>{enquiry.name}</div>
                    <div style={{ fontFamily: font.mono, fontSize: 12, color: color.inkSecondary }}>{formatPhone(enquiry.phone)}</div>
                    <div style={{ fontFamily: font.body, fontSize: 13, color: color.ink, overflowWrap: 'anywhere' }}>
                      {t('{plan} · starts {date}', { plan: join.planName, date: formatDay(join.startsOn) })}
                    </div>
                    <div style={{ fontFamily: font.body, fontSize: 13, fontWeight: 600, color: line.tone === 'good' ? color.goodText : color.warning, overflowWrap: 'anywhere' }}>
                      {line.text}
                    </div>
                    {s.kind === 'paid' ? (
                      <div style={{ fontFamily: font.body, fontSize: 12, color: color.inkMuted }}>
                        {isRealMoney(s.pay) ? t('Approve makes them a member, with their plan and receipt.') : t('Approve makes them a member with their plan. Nothing is saved as paid.')}
                      </div>
                    ) : null}
                  </div>
                  {one ? (
                    <Button
                      needsInternet
                      disabled={busy !== null}
                      onClick={() => void approve(row, s)}
                      ariaLabel={t('Approve {name}', { name: enquiry.name })}
                    >
                      {busy === enquiry.id ? t('Approving…') : t('Approve')}
                    </Button>
                  ) : (
                    <Button
                      needsInternet
                      disabled={busy !== null}
                      onClick={() => void makeMember(enquiry)}
                      ariaLabel={t('Make {name} a member', { name: enquiry.name })}
                    >
                      {t('Make member')}
                    </Button>
                  )}
                </Row>
              );
            })}
          </div>
        </Card>
      ) : null}
      {making ? (
        <MakeMemberFlow
          enquiry={making}
          onClose={() => setMaking(null)}
          onError={(m) => {
            setError(m);
            setMaking(null);
          }}
        />
      ) : null}
    </>
  );
}

class ApproveError extends Error {
  constructor(readonly code: 'PLAN_GONE' | 'TAKEN' | 'BAD_DETAILS' | 'REFUNDED') {
    super(code);
    this.name = 'ApproveError';
  }
}

function approveProblem(e: unknown): string {
  if (e instanceof ApproveError && e.code === 'PLAN_GONE') return t('The plan they picked is no longer sold. Tap Make member and pick a plan.');
  if (e instanceof ApproveError && e.code === 'TAKEN') return t('Someone else at the desk is approving this person now. Wait a minute and look again.');
  if (e instanceof ApproveError && e.code === 'BAD_DETAILS') return t('Their name or number could not be saved. Tap Make member to check them.');
  if (e instanceof ApproveError && e.code === 'REFUNDED') return t('This online payment was refunded, so nothing was saved. Ask them how they will pay.');
  return t('Could not approve. Check your internet and try again.');
}

/**
 * One tap: the member (or the one already on the list with this number), their plan and the receipt for what was
 * paid, then the request marked joined. One desk at a time (claimReceipt is a 5-minute hold), and the receipt is
 * saved once however often this runs (approveSale's requestId).
 */
async function approveJoin(
  crm: ReturnType<typeof useCrm>,
  key: string,
  taker: { id: string | null; name: string | null },
  enquiry: Enquiry,
  pay: JoinPay,
  join: EnquirySelfJoin,
): Promise<Member> {
  const { snapshot, today, createMember, setMemberArchived, sellMembership, updateEnquiry } = crm;
  const draftSale = approveSale({ memberId: '-', join, pay, plans: snapshot.plans, today, taker });
  if (!draftSale) throw new ApproveError('PLAN_GONE');
  // Review round 2 (R-542): the company is asked once more right now. Refunded since (or reversed): nothing is saved
  // as paid. No answer (an older server, no internet): Approve goes on as before; the claim below needs the server too.
  if (pay.status === 'paid' && pay.provider) {
    const fresh = await checkBeforeApprove(key, pay.id).catch((e: unknown) => {
      console.warn('[join-pay] the check before Approve did not answer', e instanceof Error ? e.message : e);
      return null;
    });
    if (fresh?.refunded) throw new ApproveError('REFUNDED');
  }
  const { token, request } = await claimReceipt(key, pay.id);
  let member = findDuplicatePhone(snapshot.members, enquiry.phone);
  if (!token && request.recorded && member) {
    // An earlier Approve made the member and the receipt but stopped before the request was marked joined.
    await updateEnquiry(enquiry.id, { status: 'joined', memberId: member.id });
    return member;
  }
  if (!token) throw new ApproveError('TAKEN');

  if (member?.archived) {
    await setMemberArchived(member.id, false);
    member = { ...member, archived: false };
  }
  if (!member) {
    const { dialCode, national } = splitE164(enquiry.phone);
    const form = { ...emptyMemberForm(today), fullName: enquiry.name, dialCode, phone: national, gender: join.gender ?? '' };
    const checked = validateMember(form, today);
    if (!checked.ok) throw new ApproveError('BAD_DETAILS');
    member = await createMember({ ...checked.value, archived: false, photoUri: null });
  }
  const { payment } = await sellMembership({ ...draftSale, memberId: member.id });
  try {
    await markRecorded(key, pay.id, pay.status === 'paid' ? { token, receiptNo: payment?.receiptNo ?? '' } : { token, receiptNo: payment?.receiptNo ?? '', method: draftSale.method, amountP: draftSale.collectNowP });
  } catch (e) {
    // The member, plan and receipt are saved; only the server's note that the receipt is made is missing.
    console.warn('[join-pay] receipt saved, but the server was not told', e instanceof Error ? e.message : e);
  }
  await updateEnquiry(enquiry.id, { status: 'joined', memberId: member.id });
  return member;
}
