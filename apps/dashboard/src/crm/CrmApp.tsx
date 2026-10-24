/**
 * Route table for the CRM.
 *
 * A gym with no name and nothing in it has never been set up, so the whole shell is
 * replaced by the welcome screen rather than pushing a route — the same structural
 * choice the mobile app made in Phase O2, and for the same reason: the tabs must
 * never mount over an empty gym, and erasing must land you back here with no
 * navigation race.
 */

import { dueCount } from './logic/enquiries';
import { EnquiriesScreen } from './ui/screens/Enquiries';
import { ExpensesScreen } from './ui/screens/Expenses';
import { MoreScreen } from './ui/screens/More';
import { isTileFilter } from './logic/homeTiles';
import { useEffect, useMemo, useRef } from 'react';

import { cloudApi } from './auth/api';
import { AuthProvider, useAuth, useRole } from './auth/AuthProvider';
import { OwnerOnly } from './auth/OwnerOnly';
import { canOpen, navFor, oldMessagesLinkTo, roleOf } from './auth/permissions';
import { PeopleScreen } from './auth/PeopleScreen';
import type { Role } from './auth/signin';
import { CloudCrmData } from './data/cloud';
import { setInstallOffer } from './install';
import { browserSavedCopy } from './data/savedCopy';
import { browserOutbox } from './data/outbox';
import { NeedsInternetPage } from './ui/offline';
import { useOffline } from './ui/offlineContext';

import { BrandingScreen } from './brand/BrandingScreen';
import { atRiskList } from './logic/attendance';
import { duesByMember, duesLedger } from './logic/collections';
import { needsAttentionToday } from './logic/membership';
import { InviteScreen } from './shop/InviteScreen';
import { ShopProvider, useShop } from './shop/ShopProvider';
import { ShopScreen } from './shop/ShopScreen';
import { CrmProvider, useCrm } from './store';
import { AppShell, type NavItem } from './ui/AppShell';
import { AttendanceScreen } from './ui/screens/Attendance';
import { ImportMembersScreen } from './ui/screens/ImportMembers';
import { MemberDetailScreen } from './ui/screens/MemberDetail';
import { MembersScreen } from './ui/screens/Members';
import { MoneyScreen } from './ui/screens/Money';
import { PlansScreen } from './ui/screens/Plans';
import { ReceiptScreen } from './ui/screens/Receipt';
import { SettingsScreen } from './ui/screens/Settings';
import { TodayScreen } from './ui/screens/Today';
import { WorkoutPlansScreen } from './ui/screens/WorkoutPlans';
import { FeedbackScreen } from './ui/screens/Feedback';
import { MessagesScreen } from './ui/screens/Messages';
import { Welcome } from './ui/Welcome';
import { AllBranchesScreen } from './branches/AllBranches';
import { BranchProvider } from './branches/BranchProvider';
import { useBranches } from './branches/context';
import { TermsGate } from './auth/TermsGate';
import { Redirect, useRoute } from './ui/router';
import { MoveBanner } from './move/MoveBanner';

export function CrmApp() {
  return (
    <>
      {/* R-105: MettleUp's new address (old address: when it is safe to move; new: once, after). */}
      <MoveBanner />
      <AuthProvider>
        {/* #41: above the panel, so it lives on while the panel remounts for another branch. */}
        <BranchProvider>
          {/* #38: an owner who has not accepted the terms yet is asked once, before the panel. */}
          <TermsGate>
            <SessionRoot />
          </TermsGate>
        </BranchProvider>
      </AuthProvider>
    </>
  );
}

/**
 * One panel per key. Signing in, out, or putting the records online changes the key, and the
 * whole panel remounts on it — so one gym's screens never keep another gym's records.
 */
function SessionRoot() {
  const { session, lost } = useAuth();
  const lostRef = useRef(lost);
  lostRef.current = lost;
  const onlineKey = session?.online ? session.ownerKey : null;
  // R-97: "Install the admin app" only for someone signed in (install.ts).
  const signedIn = session !== null;
  useEffect(() => setInstallOffer(signedIn), [signedIn]);
  // UAT F-02: the desk's 31-day limit on receipt dates is checked before anything is sent.
  const role = roleOf(session);
  // Offline front desk (review SHOULD 6): money kept for later remembers who took it.
  const staffId = session?.person?.staffId ?? null;
  const personName = session?.person?.name ?? '';
  const data = useMemo(
    () =>
      onlineKey
        ? new CloudCrmData(onlineKey, cloudApi, { onSignedOut: () => lostRef.current(), role, saved: browserSavedCopy(), outbox: browserOutbox(), person: staffId ? { staffId, name: personName, role } : null })
        : undefined,
    [onlineKey, role, staffId, personName],
  );
  return (
    <CrmProvider key={`${session?.ownerKey ?? 'none'}:${onlineKey ? 'online' : 'browser'}`} data={data}>
      <ShopProvider>
        <Routes online={onlineKey !== null} />
      </ShopProvider>
    </CrmProvider>
  );
}

function Routes({ online }: { online: boolean }) {
  const { snapshot, memberViews, today } = useCrm();
  const { newCount } = useShop();
  const route = useRoute();
  const role = useRole();
  // #41: an owner with 2 or more branches gets "All branches" (totals and lists across branches).
  const { multi, canOpenOthers } = useBranches();
  const allBranches = multi && canOpenOthers;

  // Never set up: no plans, no members, and still the placeholder name.
  // An online gym is always set up: it was named when it was made, and its welcome screen's
  // demo and erase buttons must never touch online records.
  const isNewGym =
    !online &&
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
    // Counted in PEOPLE like the two badges beside it, and like the list it opens.
    const atRisk = atRiskList(snapshot.members, snapshot.memberships, snapshot.visits, today).length;
    const enquiriesDue = dueCount(snapshot.enquiries, today);
    // A Staff person never sees a page they cannot open (permissions.ts): no Expenses.
    return navFor<NavItem>(role, [
      ...(allBranches ? [{ path: '/branches', label: 'All branches', icon: 'branches' } as NavItem] : []),
      { path: '/', label: 'Today', icon: 'today' },
      { path: '/members', label: 'Members', icon: 'members', badge: needsAttention },
      // Badged with orders waiting at the desk — the one number on this bar that
      // changes by itself while the owner watches.
      { path: '/shop', label: 'Shop', icon: 'shop', badge: newCount },
      // 22 Oct 2026: notices, offers and wishes to members, moved out of Shop (owner only).
      { path: '/messages', label: 'Messages & offers', icon: 'messages' },
      // #49 step 2: the front desk sees only the workout offer (to give earned rewards). The owner
      // reaches it inside Messages & offers.
      ...(role === 'staff' ? [{ path: '/messages/offer', label: 'Workout offer', icon: 'messages' } as NavItem] : []),
      // "Visits" rather than "Attendance": six items across a 375px phone leave
      // about 54px of text, and the longer word does not fit. The screen itself is
      // still titled Attendance, which is the word an owner comparing products
      // looks for — a short tab label under a fuller page title is the ordinary
      // pattern on both mobile platforms.
      { path: '/attendance', label: 'Visits', icon: 'visits', badge: atRisk },
      { path: '/money', label: 'Money', icon: 'money', badge: overdue },
      { path: '/plans', label: 'Plans', icon: 'plans' },
      // Step 5 (15 Oct 2026): people who asked about joining, and money going out.
      { path: '/enquiries', label: 'Enquiries', icon: 'members', badge: enquiriesDue || undefined },
      { path: '/expenses', label: 'Expenses', icon: 'money' },
      // 18 Oct 2026: routines the gym or a trainer sends to members' MettleUp app (owner and Staff).
      { path: '/workouts', label: 'Workout plans', icon: 'workouts' },
      { path: '/settings', label: 'Settings', icon: 'settings' },
      // Launch H7 (21 Oct 2026): write to MettleUp (problems, ideas). Owner and Staff.
      { path: '/feedback', label: 'Send feedback', icon: 'more' },
    ]);
  }, [memberViews, snapshot, today, newCount, role, allBranches]);
  // Step 3 (15 Oct 2026): five on a phone's bottom bar, like GoGym4U and GymBook — Aaj, Members,
  // Hisaab, Hazri and More (Plans, Shop, Settings). Six or seven icons were too small to read.
  const phoneNav = useMemo<NavItem[]>(() => {
    const by = (path: string) => nav.find((n) => n.path === path);
    const kept = ['/', '/members', '/money', '/attendance'].map(by).filter((n): n is NavItem => Boolean(n));
    const rest = nav.filter((n) => !kept.includes(n));
    const restBadge = rest.reduce((sum, n) => sum + (n.badge ?? 0), 0);
    return [...kept, { path: '/more', label: 'More', icon: 'more', badge: restBadge || undefined }];
  }, [nav]);


  if (isNewGym) return <Welcome />;

  return (
    <AppShell gymName={snapshot.gym.name} nav={nav} phoneNav={phoneNav}>
      {canOpen(role, `/${route.segments.join('/')}`) ? <Screen segments={route.segments} role={role} /> : <OwnerOnly />}
    </AppShell>
  );
}

/**
 * Offline front desk, step 3 (owner #7): pages whose every action needs the server (sending
 * messages and offers, the shop, workout plans, staff and sign-in, branches, AI import, branding,
 * the invite link, feedback). While offline they show one plain card instead; a page with a list
 * worth reading offline (plans, enquiries, expenses, settings) stays, with its buttons greyed out.
 */
function offlinePage(head: string | undefined, id: string | undefined): string | null {
  if (head === 'messages') return 'Messages & offers';
  if (head === 'shop') return 'The shop';
  if (head === 'workouts') return 'Workout plans';
  if (head === 'feedback') return 'Send feedback';
  if (head === 'branches') return 'All branches';
  if (head === 'members' && id === 'import') return 'Importing members';
  if (head === 'members' && id === 'app') return 'Members using the app';
  if (head === 'settings' && id === 'people') return 'Staff & sign-in';
  if (head === 'settings' && id === 'branding') return 'Branding';
  if (head === 'settings' && id === 'invite') return 'The invite link';
  return null;
}

function Screen({ segments, role }: { segments: string[]; role: Role }) {
  const [head, id] = segments;
  const { offline } = useOffline();
  const blocked = offline ? offlinePage(head, id) : null;
  if (blocked) return <NeedsInternetPage what={blocked} />;

  switch (head) {
    case undefined:
      return <TodayScreen />;
    case 'members':
      // `/members/app` is the "Joined in the app" list, not a member id (ids are UUIDs).
      if (id === 'app') return <MembersScreen section="app" />;
      // `/members/import`: bring members in from an Excel or CSV file (owner and Staff).
      if (id === 'import') return <ImportMembersScreen />;
      // `/members/new`: the quick button "New member" opens the add form at once.
      // Its own key (R-85): coming from "Joined in the app" (the same screen) must open the form too.
      if (id === 'new') return <MembersScreen key="new" startAdding />;
      // `/members/f/<tile>`: the roster filtered like the home tile that was tapped.
      if (id === 'f') return <MembersScreen key={segments[2]} filter={isTileFilter(segments[2]) ? segments[2] : undefined} />;
      return id ? <MemberDetailScreen memberId={id} /> : <MembersScreen />;
    case 'shop':
      // Messages moved to their own page (22 Oct 2026): an old link still lands in the right place.
      if (id === 'messages') return <Redirect to={oldMessagesLinkTo(role)} />;
      return <ShopScreen section={id} />;
    case 'messages':
      return <MessagesScreen startWith={id} />;
    case 'attendance':
      return <AttendanceScreen section={id} />;
    case 'money':
      return <MoneyScreen section={id} />;
    case 'receipts':
      // A receipt with no id is a broken link, not a list — send them to the ledger.
      return id ? <ReceiptScreen paymentId={id} /> : <MoneyScreen />;
    case 'plans':
      return <PlansScreen />;
    case 'more':
      return <MoreScreen />;
    case 'enquiries':
      return <EnquiriesScreen startAdding={id === 'new'} />;
    case 'expenses':
      return <ExpensesScreen />;
    case 'workouts':
      return <WorkoutPlansScreen />;
    case 'feedback':
      return <FeedbackScreen />;
    case 'branches':
      return <AllBranchesScreen />;
    case 'settings':
      // Gym branding: Settings -> Branding (the gym's look in the member app).
      if (id === 'branding') return <BrandingScreen />;
      // Invite link + front-desk QR poster.
      if (id === 'invite') return <InviteScreen />;
      // Staff & sign-in: people who may sign in, and the codes the owner makes for them.
      if (id === 'people') return <PeopleScreen />;
      return <SettingsScreen />;
    default:
      return <TodayScreen />;
  }
}
