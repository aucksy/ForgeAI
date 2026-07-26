/**
 * Route table for the CRM.
 *
 * A gym with no name and nothing in it has never been set up, so the whole shell is
 * replaced by the welcome screen rather than pushing a route — the same structural
 * choice the mobile app made in Phase O2, and for the same reason: the tabs must
 * never mount over an empty gym, and erasing must land you back here with no
 * navigation race.
 */

import { useMemo } from 'react';

import { duesByMember, duesLedger } from './logic/collections';
import { needsAttentionToday } from './logic/membership';
import { CrmProvider, useCrm } from './store';
import { AppShell, type NavItem } from './ui/AppShell';
import { MemberDetailScreen } from './ui/screens/MemberDetail';
import { MembersScreen } from './ui/screens/Members';
import { MoneyScreen } from './ui/screens/Money';
import { PlansScreen } from './ui/screens/Plans';
import { ReceiptScreen } from './ui/screens/Receipt';
import { SettingsScreen } from './ui/screens/Settings';
import { TodayScreen } from './ui/screens/Today';
import { Welcome } from './ui/Welcome';
import { useRoute } from './ui/router';

export function CrmApp() {
  return (
    <CrmProvider>
      <Routes />
    </CrmProvider>
  );
}

function Routes() {
  const { snapshot, memberViews, today } = useCrm();
  const route = useRoute();

  // Never set up: no plans, no members, and still the placeholder name.
  const isNewGym =
    snapshot.members.length === 0 && snapshot.plans.length === 0 && snapshot.gym.name === 'My Gym';

  const nav = useMemo<NavItem[]>(() => {
    // Same rule as the Today screen's call list. Counting every expired member
    // ever made the badge read a large number over a list of a handful.
    const needsAttention = memberViews.filter((v) => needsAttentionToday(v)).length;
    // Only genuinely overdue money badges Money — a term that has not started yet
    // is a sale, not a debt, and badging it would send the owner chasing members
    // who are not late.
    //
    // Counted in PEOPLE, like the Members badge beside it and like the list the
    // badge opens. Counting unpaid terms made a member with three of them badge 3
    // over a list showing one row.
    const overdue = duesByMember(
      duesLedger(snapshot.members, snapshot.memberships, snapshot.payments, today).filter(
        (d) => d.bucket !== 'upcoming',
      ),
    ).length;
    return [
      { path: '/', label: 'Today', glyph: '◆' },
      { path: '/members', label: 'Members', glyph: '☰', badge: needsAttention },
      { path: '/money', label: 'Money', glyph: '▤', badge: overdue },
      { path: '/plans', label: 'Plans', glyph: '₹' },
      { path: '/settings', label: 'Settings', glyph: '⚙' },
    ];
  }, [memberViews, snapshot, today]);

  if (isNewGym) return <Welcome />;

  return (
    <AppShell gymName={snapshot.gym.name} nav={nav}>
      <Screen segments={route.segments} />
    </AppShell>
  );
}

function Screen({ segments }: { segments: string[] }) {
  const [head, id] = segments;

  switch (head) {
    case undefined:
      return <TodayScreen />;
    case 'members':
      return id ? <MemberDetailScreen memberId={id} /> : <MembersScreen />;
    case 'money':
      return <MoneyScreen section={id} />;
    case 'receipts':
      // A receipt with no id is a broken link, not a list — send them to the ledger.
      return id ? <ReceiptScreen paymentId={id} /> : <MoneyScreen />;
    case 'plans':
      return <PlansScreen />;
    case 'settings':
      return <SettingsScreen />;
    default:
      return <TodayScreen />;
  }
}
