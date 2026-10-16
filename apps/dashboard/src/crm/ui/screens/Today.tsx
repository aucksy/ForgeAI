/**
 * Today — the screen the owner opens first.
 *
 * It answers three questions in order: what is my gym worth right now, who do I
 * need to talk to today, and who owes me money. Everything else is one tap away.
 * Deliberately no vanity charts: the research is blunt that owners judge this
 * category on whether it saves them a task, not on how it looks.
 */

import { collectedOn, tileCounts } from '../../logic/homeTiles';
import { dueCount } from '../../logic/enquiries';
import { InstallCard } from '../InstallCard';
import { useCan } from '../../auth/AuthProvider';
import { useMemo } from 'react';

import { JoinCodeCard } from '../../shop/JoinCode';
import { ShopTodayCard } from '../../shop/ShopTodayCard';
import { useCrm } from '../../store';
import { atRiskList, isRegisterInUse, riskReasonShort } from '../../logic/attendance';
import { formatDay, monthKey, relativeDay } from '../../logic/dates';
import { compareByAttention, needsAttentionToday, WINBACK_WINDOW_DAYS } from '../../logic/membership';
import { formatINR, formatINRShort, sumPaise } from '../../logic/money';
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
import { Link, navigate } from '../router';

export function TodayScreen() {
  const { snapshot, memberViews, allMemberViews, today } = useCrm();
  const compact = useIsCompact();
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

  return (
    <>
      <PageHeader
        // The gym's name is already in the sidebar (and the phone's top bar); a
        // second copy as the page title said nothing about which page this is.
        title="Today"
        subtitle={formatDay(today)}
        actions={<Button onClick={() => navigate('/members')}>Open roster</Button>}
      />

      {/* Phones only, until installed or closed: "Phone par app lagao". */}
      <InstallCard variant="banner" />

      {/* The join code first: it is how members get into the app, and the shop
          card beside it is the part of the demo that moves on its own. */}
      <Grid min={320}>
        <JoinCodeCard compact flush />
        <ShopTodayCard flush />
      </Grid>
      <div style={{ height: space.md }} />

      {/* Gym Panel step 3 (15 Oct 2026): the tiles Jaipur owners already know from GoGym4U and
          GymBook, in their order — today's money first, then who is about to end (today, 1-3,
          4-7, 8-15 days), who has ended, fees due, birthdays and who came in today. Every tile
          opens its own list, filtered by the same rule as the number (logic/homeTiles.ts). */}
      <Grid min={compact ? 140 : 200}>
        {seeTotals && (
          <StatTile
            label="Today's collection"
            value={formatINRShort(collectedToday)}
            tone="good"
            onClick={() => navigate('/money/today')}
            sub={`This month ${formatINRShort(stats.collectedThisMonth)}`}
          />
        )}
        <StatTile
          label="Active members"
          value={tiles.active}
          tone="accent"
          onClick={() => navigate('/members/f/active')}
          sub="With a live plan"
        />
        <StatTile
          label="Ending today"
          value={tiles['exp-today']}
          tone={tiles['exp-today'] > 0 ? 'critical' : undefined}
          onClick={() => navigate('/members/f/exp-today')}
          sub="Last day of their plan"
        />
        <StatTile
          label="Ending in 1-3 days"
          value={tiles['exp-1-3']}
          tone={tiles['exp-1-3'] > 0 ? 'warn' : undefined}
          onClick={() => navigate('/members/f/exp-1-3')}
          sub="Renew them now"
        />
        <StatTile
          label="Ending in 4-7 days"
          value={tiles['exp-4-7']}
          tone={tiles['exp-4-7'] > 0 ? 'warn' : undefined}
          onClick={() => navigate('/members/f/exp-4-7')}
          sub="Remind them this week"
        />
        <StatTile
          label="Ending in 8-15 days"
          value={tiles['exp-8-15']}
          onClick={() => navigate('/members/f/exp-8-15')}
          sub="Coming up"
        />
        <StatTile
          label="Expired"
          value={tiles.expired}
          tone={tiles.expired > 0 ? 'critical' : undefined}
          onClick={() => navigate('/members/f/expired')}
          sub={`${stats.recentlyLapsed} in the last ${WINBACK_WINDOW_DAYS} days`}
        />
        {seeTotals && (
          <StatTile
            label="Fees due"
            value={formatINRShort(stats.duesTotalP)}
            tone={stats.duesTotalP > 0 ? 'warn' : undefined}
            onClick={() => navigate('/money/dues')}
            sub={`${stats.dues.length} members`}
          />
        )}
        <StatTile
          label="Birthdays today"
          value={tiles.birthday}
          onClick={() => navigate('/members/f/birthday')}
          sub="Send a wish"
        />
        <StatTile
          label="Came in today"
          value={stats.visitsToday}
          onClick={() => navigate('/attendance')}
          sub="Open the register"
        />
        <StatTile
          label="Enquiries to call"
          value={enquiriesDue}
          tone={enquiriesDue > 0 ? 'warn' : undefined}
          onClick={() => navigate('/enquiries')}
          sub="Follow-ups due"
        />
        {/* "Losing the habit" is not a tile: it is the list right below, and the
            same number twice on one screen is a duplicate, not a summary. */}
      </Grid>

      <div style={{ height: space.xl }} />

      <Grid min={290}>
        <Card>
          <SectionTitle
            action={
              <Link to="/members">
                <span style={moreLink}>See all</span>
              </Link>
            }
          >
            Talk to these members
          </SectionTitle>
          {renewals.length === 0 ? (
            <EmptyState
              title="Nothing to chase"
              body={`No memberships are expiring, and nobody has lapsed in the last ${WINBACK_WINDOW_DAYS} days.`}
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
                      : 'No membership'
                  }
                  tone={v.state === 'expired' ? color.criticalText : color.warning}
                />
              ))}
            </div>
          )}
        </Card>

        <Card>
          <SectionTitle
            action={
              <Link to="/attendance/risk">
                <span style={moreLink}>See all</span>
              </Link>
            }
          >
            Losing the habit
          </SectionTitle>
          {atRisk.length === 0 ? (
            registerUsed ? (
              <EmptyState
                title="Everybody is training"
                body="No member with a live plan has drifted away from their usual routine."
              />
            ) : (
              // Claiming everyone is training would be inventing evidence this gym
              // has not yet produced.
              <EmptyState
                title="Start checking members in"
                body="A few days of the register and this fills itself in."
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

        <Card>
          {/* Every list on this screen has a "See all" — without one this title sat
              11px higher than its neighbours. */}
          <SectionTitle
            action={
              <Link to="/money/dues">
                <span style={moreLink}>See all</span>
              </Link>
            }
          >
            Money to collect
          </SectionTitle>
          {duesList.length === 0 ? (
            <EmptyState
              title="Everyone's paid up"
              body="No outstanding dues on the roster."
            />
          ) : (
            <div style={{ display: 'grid', gap: space.sm }}>
              {duesList.map((v) => (
                <PersonRow
                  key={v.member.id}
                  member={v.member}
                  detail={`${formatINR(v.outstandingP)} outstanding`}
                  tone={color.warning}
                />
              ))}
            </div>
          )}
        </Card>
      </Grid>
    </>
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
        Message
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
