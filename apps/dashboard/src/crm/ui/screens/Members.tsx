/**
 * The roster. Search, filter by status, and open anyone.
 *
 * Sorted by who needs attention (expired, then expiring soonest) rather than
 * alphabetically, because the list's job is to answer "who do I deal with today",
 * not "find me the S's". Alphabetical is one click away via search.
 */

import { useMemo, useState } from 'react';

import { useCrm } from '../../store';
import { tr } from '../../i18n';
import { formatDay, relativeDay } from '../../logic/dates';
import { compareByAttention, STATE_LABEL, stateTone } from '../../logic/membership';
import { formatINR } from '../../logic/money';
import { formatPhone, initials, matchesQuery } from '../../logic/members';
import type { MemberState, MemberView } from '../../types';
import { AppMembersSection } from '../../shop/AppMembers';
import { MemberFormSheet } from '../forms/MemberFormSheet';
import {
  Avatar,
  Button,
  Card,
  ChipToggle,
  EmptyState,
  PageHeader,
  Pill,
  Row,
  ScrollX,
  SearchField,
  color,
  font,
  space,
  useIsCompact,
} from '../kit';
import { Link, navigate } from '../router';

type Filter = 'all' | MemberState | 'dues' | 'archived';

/**
 * Two lists under one tab: the gym's own roster (everyone who pays), and the
 * members who joined in the ForgeAI app with the gym's code (`/members/app`).
 */
export function MembersScreen({ section }: { section?: 'app' } = {}) {
  const { memberViews } = useCrm();
  const [adding, setAdding] = useState(false);
  const app = section === 'app';
  return (
    <>
      <PageHeader
        title={tr('Members', 'Members')}
        subtitle={
          app
            ? tr('Who has the ForgeAI app on their phone', 'Kiske phone par ForgeAI App hai')
            : tr(`${memberViews.length} on the roster`, `${memberViews.length} members gym mein`)
        }
        actions={app ? undefined : <Button onClick={() => setAdding(true)}>{tr('+ Add member', '+ Naya member jodo')}</Button>}
      />
      <div style={{ marginBottom: space.lg }}>
        <ChipToggle
          variant="tabs"
          label={tr('Which members', 'Kaun se members')}
          value={app ? 'app' : 'roster'}
          onChange={(v) => navigate(v === 'app' ? '/members/app' : '/members')}
          options={[
            { value: 'roster', label: tr('Gym roster', 'Gym ke members') },
            { value: 'app', label: tr('Joined in the app', 'App se jude') },
          ]}
        />
      </div>
      {app ? <AppMembersSection /> : <RosterSection adding={adding} setAdding={setAdding} />}
    </>
  );
}

function RosterSection({ adding, setAdding }: { adding: boolean; setAdding: (v: boolean) => void }) {
  const { memberViews, allMemberViews, today } = useCrm();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const compact = useIsCompact();

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: memberViews.length, dues: 0, archived: 0 };
    for (const v of memberViews) {
      c[v.state] = (c[v.state] ?? 0) + 1;
    }
    // Dues count over EVERY member: archiving someone does not cancel their debt,
    // and a dues figure that quietly drops when you archive is a way to lose money.
    for (const v of allMemberViews) {
      if (v.outstandingP > 0) c.dues += 1;
      if (v.member.archived) c.archived += 1;
    }
    return c;
  }, [memberViews, allMemberViews]);

  const rows = useMemo(() => {
    // Archived members are reachable through their own filter and through the
    // dues filter — otherwise an archived debtor is invisible everywhere.
    const source = filter === 'archived' || filter === 'dues' ? allMemberViews : memberViews;
    const filtered = source.filter((v) => {
      if (!matchesQuery(v.member, query)) return false;
      if (filter === 'all') return true;
      if (filter === 'dues') return v.outstandingP > 0;
      if (filter === 'archived') return v.member.archived;
      return v.state === filter;
    });
    return filtered.sort(compareByAttention);
  }, [memberViews, allMemberViews, query, filter]);

  return (
    <>
      <Row gap={space.md}>
        <SearchField value={query} onChange={setQuery} placeholder={tr('Search name or mobile number', 'Naam ya mobile se dhoondo')} />
      </Row>

      <div style={{ margin: `${space.md}px 0 ${space.lg}px` }}>
        <ChipToggle
          label={tr('Filter members', 'Members chhaano')}
          value={filter}
          onChange={(v) => setFilter(v as Filter)}
          options={[
            { value: 'all', label: tr('All', 'Sab'), count: counts.all },
            { value: 'expired', label: tr('Expired', 'Khatam ho gaye'), count: counts.expired ?? 0 },
            { value: 'expiring', label: tr('Expiring', 'Jaldi khatam'), count: counts.expiring ?? 0 },
            { value: 'active', label: tr('Active', 'Chalu'), count: counts.active ?? 0 },
            { value: 'dues', label: tr('Owes money', 'Fees baaki'), count: counts.dues },
            { value: 'never', label: tr('No membership', 'Koi plan nahi'), count: counts.never ?? 0 },
            { value: 'archived', label: tr('Archived', 'Archive kiye'), count: counts.archived },
          ]}
        />
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            title={query ? tr('Nobody matches that', 'Koi nahi mila') : tr('No members yet', 'Abhi koi member nahi')}
            body={
              query
                ? tr(
                    'Try part of a name, or the last four digits of their mobile number.',
                    'Naam ka thoda hissa, ya mobile number ke aakhri 4 ank likho.',
                  )
                : tr(
                    'Add your first member and you can sell them a membership straight away.',
                    'Pehla member jodo, phir turant unhe Plan do.',
                  )
            }
            action={!query && <Button onClick={() => setAdding(true)}>{tr('+ Add member', '+ Naya member jodo')}</Button>}
          />
        </Card>
      ) : compact ? (
        <div style={{ display: 'grid', gap: space.sm }}>
          {rows.map((v) => (
            <MemberCard key={v.member.id} view={v} today={today} />
          ))}
        </div>
      ) : (
        <Card pad={0}>
          <ScrollX>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: font.body }}>
              <thead>
                <tr>
                  {(
                    [
                      ['Member', 'Member'],
                      ['Status', 'Haal'],
                      ['Plan', 'Plan'],
                      ['Expires', 'Khatam'],
                      ['Last visit', 'Aakhri hazri'],
                      ['Dues', 'Fees baaki'],
                    ] as const
                  ).map(([h, hi]) => (
                    <th
                      key={h}
                      scope="col"
                      style={{
                        textAlign: h === 'Dues' ? 'right' : 'left',
                        padding: `${space.md}px ${space.lg}px`,
                        fontSize: 11,
                        letterSpacing: 0.6,
                        textTransform: 'uppercase',
                        color: color.inkMuted,
                        borderBottom: `1px solid ${color.border}`,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {tr(h, hi)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((v) => (
                  <MemberRow key={v.member.id} view={v} today={today} />
                ))}
              </tbody>
            </table>
          </ScrollX>
        </Card>
      )}

      {adding && (
        <MemberFormSheet
          onClose={() => setAdding(false)}
          onSaved={(m) => navigate(`/members/${m.id}`)}
        />
      )}
    </>
  );
}

function MemberRow({ view, today }: { view: MemberView; today: string }) {
  const { member, current } = view;
  // Coverage, not the live term — a member who renewed early expires later than
  // the row they are currently sitting inside.
  const expiresOn = view.coversUntil ?? current?.endsOn ?? null;
  return (
    <tr
      onClick={() => navigate(`/members/${member.id}`)}
      // Mouse convenience only — the member's name in the first cell is the real,
      // keyboard-reachable link, so this row is never the sole way in.
      style={{ cursor: 'pointer', borderBottom: `1px solid ${color.border}` }}
    >
      <td style={cell}>
        <Row gap={space.md} wrap={false}>
          <Avatar text={initials(member.fullName)} />
          <div style={{ minWidth: 0 }}>
            <Link to={`/members/${member.id}`}>
              <div style={{ fontSize: 14, fontWeight: 600, color: color.ink }}>{member.fullName}</div>
            </Link>
            <div style={{ fontSize: 12, color: color.inkMuted, fontFamily: font.mono }}>
              {formatPhone(member.phone)}
            </div>
          </div>
        </Row>
      </td>
      <td style={cell}>
        <Pill tone={stateTone(view.state)}>{STATE_LABEL[view.state]}</Pill>
      </td>
      <td style={{ ...cell, color: color.inkSecondary, fontSize: 13 }}>{current?.planName ?? '—'}</td>
      <td style={{ ...cell, fontSize: 13 }}>
        {expiresOn ? (
          <>
            <div style={{ color: color.ink }}>{formatDay(expiresOn)}</div>
            <div style={{ color: color.inkMuted, fontSize: 12 }}>{relativeDay(expiresOn, today)}</div>
          </>
        ) : (
          <span style={{ color: color.inkMuted }}>—</span>
        )}
      </td>
      <td style={{ ...cell, fontSize: 13, color: color.inkSecondary }}>
        {view.lastVisitOn ? relativeDay(view.lastVisitOn, today) : tr('never', 'kabhi nahi')}
      </td>
      <td style={{ ...cell, textAlign: 'right' }}>
        {view.outstandingP > 0 ? (
          <span style={{ color: color.warning, fontFamily: font.mono, fontWeight: 700, fontSize: 14 }}>
            {formatINR(view.outstandingP)}
          </span>
        ) : (
          <span style={{ color: color.inkFaint }}>—</span>
        )}
      </td>
    </tr>
  );
}

function MemberCard({ view, today }: { view: MemberView; today: string }) {
  const { member, current } = view;
  return (
    <Link to={`/members/${member.id}`}>
      <Card pad={space.lg}>
        <Row gap={space.md} wrap={false} align="flex-start">
          <Avatar text={initials(member.fullName)} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Row gap={space.sm}>
              <span style={{ fontFamily: font.body, fontSize: 15, fontWeight: 600, color: color.ink }}>
                {member.fullName}
              </span>
              <Pill tone={stateTone(view.state)}>{STATE_LABEL[view.state]}</Pill>
            </Row>
            <div style={{ fontFamily: font.mono, fontSize: 12, color: color.inkMuted, marginTop: 2 }}>
              {formatPhone(member.phone)}
            </div>
            <div style={{ fontFamily: font.body, fontSize: 12, color: color.inkSecondary, marginTop: 6 }}>
              {current
                ? `${current.planName} · ${view.state === 'expired' ? tr('ended', 'khatam hua') : tr('ends', 'khatam hoga')} ${relativeDay(
                    view.coversUntil ?? current.endsOn,
                    today,
                  )}`
                : tr('No membership', 'Koi plan nahi')}
              {view.outstandingP > 0 && (
                <span style={{ color: color.warning, fontWeight: 700 }}>
                  {' '}
                  · {tr(`${formatINR(view.outstandingP)} due`, `${formatINR(view.outstandingP)} baaki`)}
                </span>
              )}
            </div>
          </div>
        </Row>
      </Card>
    </Link>
  );
}

const cell: React.CSSProperties = { padding: `${space.md}px ${space.lg}px`, verticalAlign: 'middle' };
