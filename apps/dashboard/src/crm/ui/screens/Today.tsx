/**
 * Today — the screen the owner opens first.
 *
 * It answers three questions in order: what is my gym worth right now, who do I
 * need to talk to today, and who owes me money. Everything else is one tap away.
 * Deliberately no vanity charts: the research is blunt that owners judge this
 * category on whether it saves them a task, not on how it looks.
 */

import { InstallCard } from '../InstallCard';
import { tr } from '../../i18n';
import { useMemo } from 'react';

import { JoinCodeCard } from '../../shop/JoinCode';
import { ShopTodayCard } from '../../shop/ShopTodayCard';
import { useCrm } from '../../store';
import { atRiskList, isRegisterInUse, riskReasonShort } from '../../logic/attendance';
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
  useIsCompact,
  font,
  space,
} from '../kit';
import { Link, navigate } from '../router';

export function TodayScreen() {
  const { snapshot, memberViews, allMemberViews, today } = useCrm();
  const compact = useIsCompact();

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
        // The gym's name is already in the sidebar (and the phone's top bar); a
        // second copy as the page title said nothing about which page this is.
        title={tr('Today', 'Aaj ka haal')}
        subtitle={formatDay(today)}
        actions={<Button onClick={() => navigate('/members')}>{tr('Open roster', 'Members dekho')}</Button>}
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

      {/* Three across on a desk screen (two rows of three), two across on a phone:
          six tiles squeezed into one row wrapped some labels onto two lines and not
          others, so the figures under them no longer lined up. */}
      <Grid min={compact ? 140 : 220}>
        {/* Labelled "with a live plan", not "Active": the roster has an "Active"
            filter chip that counts a strictly narrower thing (it excludes the
            expiring), and two different numbers under the same word one click
            apart is how a report loses trust. */}
        <StatTile
          label={tr('Members with a live plan', 'Chalu members')}
          value={stats.active}
          tone="accent"
          sub={tr(
            `${stats.active - stats.expiring.length} active · ${stats.expiring.length} expiring`,
            `${stats.active - stats.expiring.length} chalu · ${stats.expiring.length} jaldi khatam`,
          )}
        />
        <StatTile
          label={tr('Expiring this week', 'Is hafte khatam')}
          value={stats.expiring.length}
          tone={stats.expiring.length > 0 ? 'warn' : undefined}
          sub={tr('Renew before they lapse', 'Khatam hone se pehle Renew karo')}
        />
        <StatTile
          label={tr('Recently lapsed', 'Abhi khatam hue')}
          value={stats.recentlyLapsed}
          tone={stats.recentlyLapsed > 0 ? 'critical' : undefined}
          sub={tr(`Left in the last ${WINBACK_WINDOW_DAYS} days`, `Pichhle ${WINBACK_WINDOW_DAYS} din mein gaye`)}
        />
        <StatTile
          label={tr('Money owed', 'Fees baaki')}
          value={formatINRShort(stats.duesTotalP)}
          tone={stats.duesTotalP > 0 ? 'warn' : undefined}
          sub={tr(`${stats.dues.length} members`, `${stats.dues.length} members`)}
        />
        <StatTile
          label={tr('Collected this month', 'Is mahine ki collection')}
          value={formatINRShort(stats.collectedThisMonth)}
          tone="good"
          sub={tr(`Since ${formatDay(startOfMonth(today))}`, `${formatDay(startOfMonth(today))} se`)}
        />
        <StatTile
          label={tr('Check-ins today', 'Aaj aaye')}
          value={stats.visitsToday}
          onClick={() => navigate('/attendance')}
          sub={tr('Open the register', 'Hazri register kholo')}
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
                <span style={moreLink}>{tr('See all', 'Sab dekho')}</span>
              </Link>
            }
          >
            {tr('Talk to these members', 'In members se baat karo')}
          </SectionTitle>
          {renewals.length === 0 ? (
            <EmptyState
              title={tr('Nothing to chase', 'Abhi koi baaki nahi')}
              body={tr(
                `No memberships are expiring, and nobody has lapsed in the last ${WINBACK_WINDOW_DAYS} days.`,
                `Kisi ka plan khatam nahi ho raha, aur pichhle ${WINBACK_WINDOW_DAYS} din mein koi nahi gaya.`,
              )}
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
                          v.state === 'expired' ? tr('expired', 'khatam hua') : tr('ends', 'khatam hoga')
                        } ${relativeDay(v.coversUntil ?? v.current.endsOn, today)}`
                      : tr('No membership', 'Koi plan nahi')
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
                <span style={moreLink}>{tr('See all', 'Sab dekho')}</span>
              </Link>
            }
          >
            {tr('Losing the habit', 'Kaafi din se nahi aaye')}
          </SectionTitle>
          {atRisk.length === 0 ? (
            registerUsed ? (
              <EmptyState
                title={tr('Everybody is training', 'Sab aa rahe hain')}
                body={tr(
                  'No member with a live plan has drifted away from their usual routine.',
                  'Chalu plan wala koi member apni routine se nahi hata.',
                )}
              />
            ) : (
              // Claiming everyone is training would be inventing evidence this gym
              // has not yet produced.
              <EmptyState
                title={tr('Start checking members in', 'Members ki Hazri lagao')}
                body={tr(
                  'A few days of the register and this fills itself in.',
                  'Kuch din Hazri lagao, yeh list khud bhar jayegi.',
                )}
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
                <span style={moreLink}>{tr('See all', 'Sab dekho')}</span>
              </Link>
            }
          >
            {tr('Money to collect', 'Fees baaki')}
          </SectionTitle>
          {duesList.length === 0 ? (
            <EmptyState
              title={tr("Everyone's paid up", 'Sabne fees de di')}
              body={tr('No outstanding dues on the roster.', 'Kisi ki fees baaki nahi hai.')}
            />
          ) : (
            <div style={{ display: 'grid', gap: space.sm }}>
              {duesList.map((v) => (
                <PersonRow
                  key={v.member.id}
                  member={v.member}
                  detail={tr(`${formatINR(v.outstandingP)} outstanding`, `${formatINR(v.outstandingP)} baaki`)}
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
        title={tr(`WhatsApp ${formatPhone(member.phone)}`, `WhatsApp ${formatPhone(member.phone)}`)}
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
        {tr('Message', 'Message karo')}
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
