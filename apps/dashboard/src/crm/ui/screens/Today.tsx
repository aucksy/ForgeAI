/**
 * Today — the screen the owner opens first.
 *
 * It answers three questions in order: what is my gym worth right now, who do I
 * need to talk to today, and who owes me money. Everything else is one tap away.
 * Deliberately no vanity charts: the research is blunt that owners judge this
 * category on whether it saves them a task, not on how it looks.
 */

import { useMemo } from 'react';

import { useCrm } from '../../store';
import { atRiskList, isRegisterInUse, riskReason } from '../../logic/attendance';
import { formatDay, monthKey, relativeDay, startOfMonth } from '../../logic/dates';
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
  font,
  space,
} from '../kit';
import { Link, navigate } from '../router';

export function TodayScreen() {
  const { snapshot, memberViews, allMemberViews, today } = useCrm();

  const stats = useMemo(() => {
    const active = memberViews.filter((v) => v.state === 'active' || v.state === 'expiring');
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
      active: active.length,
      expiring,
      expired,
      recentlyLapsed: expired.filter((v) => needsAttentionToday(v)).length,
      dues,
      duesTotalP: sumPaise(dues.map((v) => v.outstandingP)),
      collectedThisMonth,
      visitsToday,
    };
  }, [memberViews, allMemberViews, snapshot, today]);

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
        title={snapshot.gym.name}
        subtitle={formatDay(today)}
        actions={<Button onClick={() => navigate('/members')}>Open roster</Button>}
      />

      <Grid min={165}>
        {/* Labelled "with a live plan", not "Active": the roster has an "Active"
            filter chip that counts a strictly narrower thing (it excludes the
            expiring), and two different numbers under the same word one click
            apart is how a report loses trust. */}
        <StatTile label="Members with a live plan" value={stats.active} tone="accent" />
        <StatTile
          label="Expiring this week"
          value={stats.expiring.length}
          tone={stats.expiring.length > 0 ? 'warn' : undefined}
          sub="Renew before they lapse"
        />
        <StatTile
          label="Recently lapsed"
          value={stats.recentlyLapsed}
          tone={stats.recentlyLapsed > 0 ? 'critical' : undefined}
          sub={`Left in the last ${WINBACK_WINDOW_DAYS} days`}
        />
        <StatTile
          label="Money owed"
          value={formatINRShort(stats.duesTotalP)}
          tone={stats.duesTotalP > 0 ? 'warn' : undefined}
          sub={`${stats.dues.length} members`}
        />
        <StatTile
          label="Collected this month"
          value={formatINRShort(stats.collectedThisMonth)}
          tone="good"
          sub={`Since ${formatDay(startOfMonth(today))}`}
        />
        <StatTile
          label="Check-ins today"
          value={stats.visitsToday}
          onClick={() => navigate('/attendance')}
          sub="Open the register"
        />
        {/* "Stopped coming" was wrong for a third of this list — a new member two
            visits into their first month has not stopped, they never started. */}
        <StatTile
          label="Losing the habit"
          value={atRisk.length}
          tone={atRisk.length > 0 ? 'critical' : undefined}
          onClick={() => navigate('/attendance/risk')}
          sub="Paying, but barely training"
        />
      </Grid>

      <div style={{ height: space.xl }} />

      <Grid min={330}>
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
                  detail={riskReason(r)}
                  tone={r.band === 'settling_in' ? color.criticalText : color.warning}
                />
              ))}
            </div>
          )}
        </Card>

        <Card>
          <SectionTitle>Money to collect</SectionTitle>
          {duesList.length === 0 ? (
            <EmptyState title="Everyone's paid up" body="No outstanding dues on the roster." />
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
            <div style={{ fontFamily: font.body, fontSize: 12, color: tone }}>{detail}</div>
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
