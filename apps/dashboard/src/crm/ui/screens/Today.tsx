/**
 * Today — the screen the owner opens first.
 *
 * It answers three questions in order: what is my gym worth right now, who do I
 * need to talk to today, and who owes me money. Everything else is one tap away.
 * Deliberately no vanity charts: the research is blunt that owners judge this
 * category on whether it saves them a task, not on how it looks.
 */

import { collectedOn, gymHasRecords, tileCounts } from '../../logic/homeTiles';
import { t } from '../../lang/lang';
import { dueCount } from '../../logic/enquiries';
import { GetStartedCard } from '../GetStartedCard';
import { QuickActions } from '../QuickActions';
import { InstallCard } from '../InstallCard';
import { PhoneLinksCard } from '../PhoneLinksCard';
import { PlanRequestsCard } from '../PlanRequestsCard';
import { NeedsYouCard } from '../NeedsYou';
import { TrialBanner } from '../TrialBanner';
import { LapseBanner, useLapseWords } from '../LapseBanner';
import { useCan, useRole } from '../../auth/AuthProvider';
import { canOpen } from '../../auth/permissions';
import { endingSoon } from '../../logic/audience';
import { isBirthdayToday } from '../../logic/homeTiles';
import { useCallback, useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { rewardsToGive } from '../../logic/workoutOffer';
import { probeOffers } from '../../shop/offerServer';
import { usePoll } from '../../shop/ShopProvider';

import { JoinCodeCard } from '../../shop/JoinCode';
import { ShopTodayCard } from '../../shop/ShopTodayCard';
import { useCrm } from '../../store';
import { atRiskList, isRegisterInUse, riskReasonShort } from '../../logic/attendance';
import { formatDay, monthKey, relativeDay } from '../../logic/dates';
import { compareByAttention, needsAttentionToday, WINBACK_WINDOW_DAYS } from '../../logic/membership';
import { formatINR, sumPaise } from '../../logic/money';
import { formatPhone, initials, phoneDigits } from '../../logic/members';
import type { Member } from '../../types';
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  Grid,
  PageHeader,
  Row,
  SectionTitle,
  StatTile,
  TOUCH,
  color,
  useIsCompact,
  font,
  space,
} from '../kit';
import { WaitingMoneyLine } from '../offline';
import { NumbersSection } from '../OwnerNumbers';
import { WhatsAppSheet } from '../WhatsAppSheet';
import { cameInWithProblem, type CameInRow } from '../../logic/cameInToday';
import { isMonday, weekNumbers, weekSummaryText } from '../../logic/weekSummary';
import { whatsAppHref } from '../../shop/invite';
import { useHasFeature } from '../../plan/GymPackProvider';
import { ProNote } from '../../plan/ProNote';
import { Link, navigate } from '../router';
import { PaidOnlineCard } from '../../pay/PaidOnline';

export function TodayScreen() {
  const { snapshot, memberViews, allMemberViews, today, desk } = useCrm();
  const compact = useIsCompact();
  const numbersOn = useHasFeature('yourNumbers');
  // Billing step 1 (R-384): grace / basic mode / read-only, only once PLAN_GATE_ON is on.
  const lapse = useLapseWords();
  // Staff (front desk) sees counts of people, never the gym's money totals (permissions.ts).
  const seeTotals = useCan()('seeTotals');

  const stats = useMemo(() => {
    const expiring = memberViews.filter((v) => v.state === 'expiring');
    const expired = memberViews.filter((v) => v.state === 'expired');
    // Over EVERY member, archived included: archiving someone who owes ₹5,000
    // must not quietly remove ₹5,000 from what the gym is owed.
    const dues = allMemberViews.filter((v) => v.outstandingP > 0);

    const thisMonth = monthKey(today);
    const collectedThisMonth = sumPaise(
      snapshot.payments.filter((p) => !p.voided && monthKey(p.paidOn) === thisMonth).map((p) => p.amountP),
    );

    const visitsToday = snapshot.visits.filter((v) => v.visitedOn === today).length;

    return {
      expiring,
      expired,
      recentlyLapsed: expired.filter((v) => needsAttentionToday(v)).length,
      dues,
      duesTotalP: sumPaise(dues.map((v) => v.outstandingP)),
      collectedThisMonth,
      visitsToday,
    };
  }, [memberViews, allMemberViews, snapshot, today]);

  const tiles = useMemo(() => tileCounts(memberViews, today), [memberViews, today]);
  const collectedToday = useMemo(() => collectedOn(snapshot.payments, today), [snapshot.payments, today]);
  const enquiriesDue = useMemo(() => dueCount(snapshot.enquiries ?? [], today), [snapshot.enquiries, today]);

  // Only people still worth a conversation today. A member who left two years ago
  // is a win-back campaign, not a phone call this morning — and a list that never
  // forgets anyone is a list the owner stops opening.
  const renewals = useMemo(
    () => memberViews.filter((v) => needsAttentionToday(v)).sort(compareByAttention),
    [memberViews],
  );

  const duesList = useMemo(
    () => [...stats.dues].sort((a, b) => b.outstandingP - a.outstandingP).slice(0, 6),
    [stats.dues],
  );

  // Paying members who have stopped showing up. A different list from the one above
  // it on purpose: those people's memberships are running out, these people's
  // memberships are fine and they have quietly stopped coming — which is the thing
  // an owner cannot see without this product.
  const atRisk = useMemo(
    () => atRiskList(snapshot.members, snapshot.memberships, snapshot.visits, today),
    [snapshot.members, snapshot.memberships, snapshot.visits, today],
  );

  // An empty list means "nobody has drifted" or "we have no attendance to read" —
  // two completely different messages.
  const registerUsed = useMemo(() => isRegisterInUse(snapshot.visits, today), [snapshot.visits, today]);

  // Owner, 1 Nov 2026: a brand-new gym sees Get started, not a wall of zeros. The tiles and lists
  // come back by themselves with the first member, sale, payment, visit or enquiry.
  const hasRecords = gymHasRecords(snapshot);

  // Launch audit 3 Nov 2026: on a phone, once a member has joined in the app (the last Get started
  // step) the gym code card has done its job on Today; it stays in Settings -> Member app and Invite.
  // The shop card moves below the lists. A new gym, and a computer, keep both at the top.
  const appInUse = useMemo(() => snapshot.members.some((m) => !m.archived && Boolean(m.appUserId)), [snapshot.members]);
  const setupAtBottom = compact && hasRecords && appInUse;

  return (
    <>
      <PageHeader
        // The gym's name is already in the sidebar (and the phone's top bar); a
        // second copy as the page title said nothing about which page this is.
        title={t('Today')}
        subtitle={formatDay(today)}
      />

      {/* R-97 (0030): the owner's free trial, in words (nothing locks when it ends). */}
      {/* R-319 item 8a: everything waiting for the desk or the owner, at the top (hidden when nothing waits). */}
      <NeedsYouCard />

      {/* Billing step 1: when the plan has run out, that line replaces the trial line. */}
      {lapse ? <LapseBanner words={lapse} /> : <TrialBanner />}

      {/* Offline front desk, step 3: money taken on this device that is not on the server yet. */}
      <WaitingMoneyLine state={desk} />

      {/* F79 (R-328): online payments whose receipt could not be made by itself (hidden when none). */}
      <PaidOnlineCard />

      {/* Backlog (21 Oct): big buttons for the desk's common jobs, chosen and ordered by the owner. */}
      <QuickActions />

      {/* Launch I5: a new gym's first five steps (owner only; gone when done or hidden). */}
      <GetStartedCard />

      {/* Phones only, until installed or closed: "Phone par app lagao". */}
      <InstallCard variant="banner" />

      {/* Messages & offers (22 Oct 2026): who to message today, each opening its ready message. */}
      <MessageNudges />

      {/* #49 step 2: earned workout-offer rewards waiting for the desk's one tap (owner and desk). */}
      <RewardNudge />

      {/* F150: members' "Pause my plan" / "Renew my plan" from the app, one tap to approve (owner and
          desk). Hidden until the gym server has 0044, and when there is nothing to show. */}
      <div id="needs-plan-requests">
        <PlanRequestsCard />
      </div>

      {/* 0048 (R-287): numbers members typed at the poster check-in, waiting for the desk's yes (owner
          and desk). Hidden until the gym server has 0048, and when none are waiting. */}
      <div id="needs-phone-links">
        <PhoneLinksCard />
      </div>

      {/* The join code first: it is how members get into the app, and the shop
          card beside it is the part of the demo that moves on its own. */}
      {!setupAtBottom && (
        <>
          <Grid min={320}>
            <JoinCodeCard compact flush />
            <ShopTodayCard flush />
          </Grid>
          <div style={{ height: space.md }} />
        </>
      )}

      {hasRecords && (
      <>
      {/* Gym Panel step 3 (15 Oct 2026): the tiles Jaipur owners already know from GoGym4U and
          GymBook, in their order — today's money first, then who is about to end (today, 1-3,
          4-7, 8-15 days), who has ended, fees due, birthdays and who came in today. Every tile
          opens its own list, filtered by the same rule as the number (logic/homeTiles.ts). */}
      <Grid min={compact ? 140 : 200}>
        {seeTotals && (
          <StatTile
            label={t("Today's collection")}
            value={formatINR(collectedToday)}
            tone="good"
            onClick={() => navigate('/money/today')}
            sub={t('This month {amount}', { amount: formatINR(stats.collectedThisMonth) })}
          />
        )}
        <StatTile
          label={t('Active members')}
          value={tiles.active}
          tone="accent"
          onClick={() => navigate('/members/f/active')}
          sub={t('With a running plan')}
        />
        <StatTile
          label={t('Ending today')}
          value={tiles['exp-today']}
          tone={tiles['exp-today'] > 0 ? 'critical' : undefined}
          onClick={() => navigate('/members/f/exp-today')}
          sub={t('Last day of their plan')}
        />
        <StatTile
          label={t('Ending in 1-3 days')}
          value={tiles['exp-1-3']}
          tone={tiles['exp-1-3'] > 0 ? 'warn' : undefined}
          onClick={() => navigate('/members/f/exp-1-3')}
          sub={t('Renew them now')}
        />
        <StatTile
          label={t('Ending in 4-7 days')}
          value={tiles['exp-4-7']}
          tone={tiles['exp-4-7'] > 0 ? 'warn' : undefined}
          onClick={() => navigate('/members/f/exp-4-7')}
          sub={t('Remind them this week')}
        />
        <StatTile
          label={t('Ending in 8-15 days')}
          value={tiles['exp-8-15']}
          onClick={() => navigate('/members/f/exp-8-15')}
          sub={t('Coming up')}
        />
        <StatTile
          label={t('Expired')}
          value={tiles.expired}
          tone={tiles.expired > 0 ? 'critical' : undefined}
          onClick={() => navigate('/members/f/expired')}
          sub={t('{n} in the last {days} days', { n: stats.recentlyLapsed, days: WINBACK_WINDOW_DAYS })}
        />
        {seeTotals && (
          <StatTile
            label={t('Fees due')}
            value={formatINR(stats.duesTotalP)}
            tone={stats.duesTotalP > 0 ? 'warn' : undefined}
            onClick={() => navigate('/money/dues')}
            sub={stats.dues.length === 1 ? t('1 member') : t('{n} members', { n: stats.dues.length })}
          />
        )}
        <StatTile
          label={t('Birthdays today')}
          value={tiles.birthday}
          onClick={() => navigate('/members/f/birthday')}
          sub={t('Send a wish')}
        />
        <StatTile
          label={t('Came in today')}
          value={stats.visitsToday}
          onClick={() => navigate('/attendance')}
          sub={t('Open the register')}
        />
        <StatTile
          label={t('Enquiries to call')}
          value={enquiriesDue}
          tone={enquiriesDue > 0 ? 'warn' : undefined}
          onClick={() => navigate('/enquiries')}
          sub={t('Follow-ups due')}
        />
        {/* "Losing the habit" is not a tile: it is the list right below, and the
            same number twice on one screen is a duplicate, not a summary. */}
      </Grid>

      <div style={{ height: space.lg }} />

      {/* Launch audit 3 Nov 2026: came in today with no running plan or owing money. */}
      <CameInCard />

      {/* Launch audit 3 Nov 2026: Mondays, last week's numbers for the owner's own WhatsApp. */}
      {seeTotals && isMonday(today) && <WeekSummaryCard />}

      {/* Launch audit 3 Nov 2026: the people to act on come right under the tiles, money to
          collect second (it sat at the very bottom of a ~12-screen phone page), then the habit list. */}
      <Grid min={290}>
        <Card>
          <SectionTitle
            action={
              <Link to="/members">
                <span style={moreLink}>{t('See all')}</span>
              </Link>
            }
          >
            {t('Talk to these members')}
          </SectionTitle>
          {renewals.length === 0 ? (
            <EmptyState
              title={t('Nobody to follow up')}
              body={t('No plans are ending soon, and no plan ended in the last {days} days.', { days: WINBACK_WINDOW_DAYS })}
            />
          ) : (
            <div style={{ display: 'grid', gap: space.sm }}>
              {renewals.slice(0, 6).map((v) => (
                <PersonRow
                  key={v.member.id}
                  member={v.member}
                  detail={
                    v.current
                      ? `${v.current.planName} · ${
                          v.state === 'expired' ? 'expired' : 'ends'
                        } ${relativeDay(v.coversUntil ?? v.current.endsOn, today)}`
                      : t('No membership')
                  }
                  tone={v.state === 'expired' ? color.criticalText : color.warning}
                />
              ))}
            </div>
          )}
        </Card>

        <Card>
          {/* Every list on this screen has a "See all" — without one this title sat
              11px higher than its neighbours. */}
          <SectionTitle
            action={
              <Link to="/money/dues">
                <span style={moreLink}>{t('See all')}</span>
              </Link>
            }
          >
            {t('Money to collect')}
          </SectionTitle>
          {duesList.length === 0 ? (
            <EmptyState
              title={t('Everyone has paid')}
              body={t('No member has dues.')}
            />
          ) : (
            <div style={{ display: 'grid', gap: space.sm }}>
              {duesList.map((v) => (
                <PersonRow
                  key={v.member.id}
                  member={v.member}
                  detail={t('{amount} due', { amount: formatINR(v.outstandingP) })}
                  tone={color.warning}
                />
              ))}
            </div>
          )}
        </Card>
        <Card>
          <SectionTitle
            action={
              <Link to="/attendance/risk">
                <span style={moreLink}>{t('See all')}</span>
              </Link>
            }
          >
            {t('Losing the habit')}
          </SectionTitle>
          {atRisk.length === 0 ? (
            registerUsed ? (
              <EmptyState
                title={t('Everybody is training')}
                body={t('Every member with a running plan is coming as usual.')}
              />
            ) : (
              // Claiming everyone is training would be inventing evidence this gym
              // has not yet produced.
              <EmptyState
                title={t('Start checking members in')}
                body={t('After a few days of check-ins, this fills in by itself.')}
              />
            )
          ) : (
            <div style={{ display: 'grid', gap: space.sm }}>
              {atRisk.slice(0, 6).map((r) => (
                <PersonRow
                  key={r.member.id}
                  member={r.member}
                  detail={riskReasonShort(r)}
                  tone={r.band === 'settling_in' ? color.criticalText : color.warning}
                />
              ))}
            </div>
          )}
        </Card>
      </Grid>

      <div style={{ height: space.xl }} />

      {/* R-168: five numbers with a trend line each (money owed is the owner's); a tap opens the list. */}
      {/* T66: Pro (closed only once PLAN_GATE_ON is on and the gym is on Starter). */}
      {numbersOn ? <NumbersSection /> : <ProNote feature="yourNumbers" />}

      {setupAtBottom && (
        <div style={{ marginTop: space.xl }}>
          <ShopTodayCard flush />
        </div>
      )}
      </>
      )}
    </>
  );
}

/**
 * Launch audit 3 Nov 2026 (owner side #5): members who checked in today with no running plan or
 * owing money (an ended plan does not stop a check-in, at the desk or by the QR poster). Each row
 * opens the ready WhatsApp message: fees when they owe, plan ended otherwise. Gone when nobody.
 */
function CameInCard() {
  const { snapshot, allMemberViews, today } = useCrm();
  const rows = useMemo(() => cameInWithProblem(snapshot.visits, allMemberViews, today), [snapshot.visits, allMemberViews, today]);
  const [open, setOpen] = useState<CameInRow | null>(null);
  if (rows.length === 0) return null;
  return (
    <Card style={{ marginBottom: space.lg }}>
      <SectionTitle>{t('Came in today with an ended plan or fees due')}</SectionTitle>
      <p style={{ margin: `-${space.sm}px 0 ${space.md}px`, fontFamily: font.body, fontSize: 13, color: color.inkSecondary }}>
        {t('They checked in today. Ask them to renew or pay before they leave.')}
      </p>
      <div style={{ display: 'grid', gap: space.sm }}>
        {rows.slice(0, 5).map((r) => (
          <Row key={r.view.member.id} gap={space.md} wrap={false}>
            <Link to={`/members/${r.view.member.id}`}>
              <span style={{ display: 'flex', alignItems: 'center', gap: space.md, minHeight: TOUCH, minWidth: 0 }}>
                <Avatar text={initials(r.view.member.fullName)} size={32} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: font.body, fontSize: 14, fontWeight: 600, color: color.ink }}>{r.view.member.fullName}</div>
                  <div style={{ fontFamily: font.body, fontSize: 12, color: r.noPlan ? color.criticalText : color.warning, textWrap: 'pretty' }}>
                    {cameInDetail(r)}
                  </div>
                </div>
              </span>
            </Link>
            <span style={{ flex: 1 }} />
            <Button variant="ghost" onClick={() => setOpen(r)} ariaLabel={`${t('Message')}: ${r.view.member.fullName}`}>
              {t('Message')}
            </Button>
          </Row>
        ))}
      </div>
      {rows.length > 5 && (
        <p style={{ margin: `${space.md}px 0 0`, fontFamily: font.body, fontSize: 13, color: color.inkSecondary }}>
          <Link to="/attendance">
            <span style={moreLink}>{t('{n} more in the register.', { n: rows.length - 5 })}</span>
          </Link>
        </p>
      )}
      {open && (
        <WhatsAppSheet view={open.view} startWith={open.dueP > 0 ? 'fees' : 'ended'} onClose={() => setOpen(null)} />
      )}
    </Card>
  );
}

/** "Plan ended 1 Nov · ₹1,500 due", "No plan bought", "₹800 due". */
function cameInDetail(r: CameInRow): string {
  const parts: string[] = [];
  if (r.noPlan) {
    const ended = r.view.current?.endsOn;
    parts.push(
      r.view.state === 'expired' && ended
        ? t('Plan ended {date}', { date: formatDay(r.view.coversUntil ?? ended) })
        : r.view.state === 'never'
          ? t('No plan bought')
          : t('No running plan today'),
    );
  }
  if (r.dueP > 0) parts.push(t('{amount} due', { amount: formatINR(r.dueP) }));
  return parts.join(' · ');
}

/**
 * Launch audit 3 Nov 2026 (revenue ideas): Mondays, the owner sends last week's numbers to himself
 * or a partner from his own WhatsApp (logic/weekSummary.ts). Owner and money-seeing roles only.
 */
function WeekSummaryCard() {
  const { snapshot, allMemberViews, today } = useCrm();
  const text = useMemo(
    () => weekSummaryText(snapshot.gym.name, weekNumbers(snapshot, allMemberViews, today)),
    [snapshot, allMemberViews, today],
  );
  return (
    <Card style={{ marginBottom: space.lg }}>
      <SectionTitle>{t('Last week at your gym')}</SectionTitle>
      <p style={{ margin: `-${space.sm}px 0 ${space.md}px`, fontFamily: font.body, fontSize: 13, color: color.inkSecondary }}>
        {t('Send last week’s money, plans sold and check-ins to yourself or your partner on WhatsApp.')}
      </p>
      <Button variant="ghost" onClick={() => window.open(whatsAppHref(text), '_blank', 'noopener')}>
        {t('Share on WhatsApp')}
      </Button>
    </Card>
  );
}

/**
 * Messages & offers step 1 (22 Oct 2026, R-offers-notices §6): "3 birthdays today", "5 plans end this
 * week", each opening the ready message with its group picked. The owner's (messages are owner-only);
 * gone when there is nobody to message.
 */
function MessageNudges() {
  const { memberViews, today } = useCrm();
  const role = useRole();
  const counts = useMemo(
    () => ({
      birthdays: memberViews.filter((v) => isBirthdayToday(v.member.dateOfBirth, today)).length,
      ending: memberViews.filter((v) => endingSoon(v)).length,
    }),
    [memberViews, today],
  );
  if (!canOpen(role, '/messages') || (counts.birthdays === 0 && counts.ending === 0)) return null;
  const rows = [
    counts.birthdays > 0 && {
      text: counts.birthdays === 1 ? t('1 birthday today') : t('{n} birthdays today', { n: counts.birthdays }),
      action: t('Send wishes'),
      to: '/messages/birthday',
    },
    counts.ending > 0 && {
      text: counts.ending === 1 ? t('1 plan ends this week') : t('{n} plans end this week', { n: counts.ending }),
      action: t('Remind them'),
      to: '/messages/ending',
    },
  ].filter((r): r is { text: string; action: string; to: string } => Boolean(r));
  return (
    <Card pad={space.lg} style={{ marginBottom: space.md }}>
      <SectionTitle>{t('Messages to send')}</SectionTitle>
      <div style={{ display: 'grid', gap: space.sm, marginTop: -space.sm }}>
        {rows.map((r) => (
          <Row key={r.to} gap={space.md} wrap={false}>
            <span style={{ flex: 1, minWidth: 0, fontFamily: font.body, fontSize: 14, fontWeight: 600, color: color.ink }}>{r.text}</span>
            <Button variant="ghost" onClick={() => navigate(r.to)} ariaLabel={`${r.action}: ${r.text}`}>
              {r.action}
            </Button>
          </Row>
        ))}
      </div>
    </Card>
  );
}

/**
 * #49 step 2 (23 Oct 2026): "2 rewards to give" when members reached a workout offer's target and
 * the days wait for the desk. Online gyms on a server with 0025 only; nothing otherwise.
 */
function RewardNudge() {
  const { session } = useAuth();
  const key = session?.online ? (session.ownerKey ?? null) : null;
  const [count, setCount] = useState(0);
  const [server, setServer] = useState<'yes' | 'no' | 'unknown'>('unknown');
  const load = useCallback(async () => {
    if (!key) return;
    try {
      const r = await probeOffers(key);
      setServer(r.server);
      setCount(r.server === 'yes' ? rewardsToGive(r.answer) : 0);
    } catch (e) {
      console.warn('[ForgeErr] today: rewards to give', e);
    }
  }, [key]);
  usePoll(load, 60_000, key !== null && server !== 'no');
  if (!key || count === 0) return null;
  const text = count === 1 ? '1 reward to give' : `${count} rewards to give`;
  return (
    <Card pad={space.lg} style={{ marginBottom: space.md }}>
      <SectionTitle>Workout offer</SectionTitle>
      <Row gap={space.md} wrap={false}>
        <span style={{ flex: 1, minWidth: 0, fontFamily: font.body, fontSize: 14, fontWeight: 600, color: color.ink }}>{text}</span>
        <Button variant="ghost" onClick={() => navigate('/messages/offer')} ariaLabel={`Give rewards: ${text}`}>
          Give
        </Button>
      </Row>
    </Card>
  );
}

function PersonRow({ member, detail, tone }: { member: Member; detail: string; tone: string }) {
  return (
    <Row gap={space.md} wrap={false}>
      <Link to={`/members/${member.id}`}>
        {/* The whole name-and-status block is one 44px target. It measured 36px:
            the kit commits to 44 and the "Message" link beside it already is, so
            the two halves of the same row disagreed under a thumb. */}
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: space.md,
            minHeight: TOUCH,
            minWidth: 0,
          }}
        >
          <Avatar text={initials(member.fullName)} size={32} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: font.body, fontSize: 14, fontWeight: 600, color: color.ink }}>
              {member.fullName}
            </div>
            {/* `pretty` keeps a lone last word ("ago") off a line of its own. */}
            <div style={{ fontFamily: font.body, fontSize: 12, color: tone, textWrap: 'pretty' }}>{detail}</div>
          </div>
        </span>
      </Link>
      <span style={{ flex: 1 }} />
      <a
        href={`https://wa.me/${phoneDigits(member.phone)}`}
        target="_blank"
        rel="noreferrer"
        title={`WhatsApp ${formatPhone(member.phone)}`}
        style={{
          fontFamily: font.body,
          fontSize: 12,
          fontWeight: 700,
          color: color.accentBright,
          textDecoration: 'none',
          whiteSpace: 'nowrap',
          // The kit commits to 44px targets; this link was 55x32.
          minHeight: 44,
          minWidth: 64,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {t('Message')}
      </a>
    </Row>
  );
}

const moreLink: React.CSSProperties = {
  fontFamily: "'Manrope', system-ui, sans-serif",
  fontSize: 13,
  color: color.accentBright,
  // An 18px text link is not a tap target.
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: TOUCH,
  paddingLeft: space.sm,
};
