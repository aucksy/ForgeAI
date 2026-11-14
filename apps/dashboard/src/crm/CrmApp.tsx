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

import { BILLING_ONLINE_ON } from '@forgeai/theme';

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
import { NeedsYouProvider, useNeedsYou } from './ui/NeedsYou';
import { ShopScreen } from './shop/ShopScreen';
import { CrmProvider, useCrm } from './store';
import { AppShell, type NavItem } from './ui/AppShell';
import { NewDotsProvider } from './ui/NewDots';
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
import { DietPlansScreen } from './ui/screens/DietPlans';
import { GymTimingsScreen } from './ui/screens/GymTimings';
import { PaymentsScreen } from './pay/PaymentsScreen';
import { BusyMachinesScreen } from './ui/screens/BusyMachines';
import { EntryMachinesScreen } from './ui/screens/EntryMachines';
import { PayMettleUpScreen } from './ui/screens/PayMettleUp';
import { MettleUpReceiptScreen } from './ui/screens/MettleUpReceipt';
import { EntryMachineJob } from './ui/EntryMachineJob';
import { MyMembersScreen } from './ui/screens/MyMembers';
import { TrainersScreen } from './ui/screens/Trainers';
import { useTrainerAccess } from './ui/TrainerParts';
import { useQuestionCount } from './ui/QuestionParts';
import { QuestionsScreen } from './ui/screens/Questions';
import { useMemberMessageCount } from './ui/MemberMessageParts';
import { MemberMessagesScreen } from './ui/screens/MemberMessages';
import { ChallengesScreen } from './ui/screens/Challenges';
import { FeedbackScreen } from './ui/screens/Feedback';
import { MessagesScreen } from './ui/screens/Messages';
import { Welcome } from './ui/Welcome';
import { NextStepBar, useGetStarted } from './ui/GetStartedCard';
import { SetupGymScreen } from './ui/screens/SetupGym';
import { NewGymReady } from './ui/NewGymReady';
import { t, useLang } from './lang/lang';
import { WhatsNewScreen } from './ui/WhatsNew';
import { AllBranchesScreen } from './branches/AllBranches';
import { NumbersScreen } from './ui/OwnerNumbers';
import { GrowthPrintScreen, GrowthScreen } from './ui/BusinessGrowth';
import { BranchProvider } from './branches/BranchProvider';
import { useBranches } from './branches/context';
import { TermsGate } from './auth/TermsGate';
import { PinPrompt } from './auth/PinForms';
import { Redirect, useRoute } from './ui/router';
import { MoveBanner } from './move/MoveBanner';
import { DemoNeedsRealGym, demoNeedsRealGym, useDemo } from './demo/demoMode';
import { GymPackProvider, useFeatureCheck } from './plan/GymPackProvider';
import { proFeatureOfPage } from './plan/pack';
import { ProPage } from './plan/ProNote';
import { AssistantWatch, useAssistant } from './assistant/useAssistant';
import { AssistantFab } from './assistant/ui/AssistantFab';
import { AssistantScreen } from './ui/screens/Assistant';
import { WebPageScreen } from './ui/screens/WebPage';
import { useWebPage } from './gympage/pageState';

export function CrmApp() {
  // English | Hinglish (1 Nov 2026): a switch draws the whole panel again in the new words.
  useLang();
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
    <>
      <CrmProvider key={`${session?.ownerKey ?? 'none'}:${onlineKey ? 'online' : 'browser'}`} data={data}>
        <ShopProvider>
          {/* R-319 item 8a: what waits for the desk (Today's badge, the tab title, the alert). */}
          <NeedsYouProvider>
            {/* T66: the gym's pack (Starter or Pro). Asks nothing while PLAN_GATE_ON is off. */}
            <GymPackProvider sessionKey={onlineKey}>
              <Routes online={onlineKey !== null} />
            </GymPackProvider>
          </NeedsYouProvider>
        </ShopProvider>
      </CrmProvider>
      {/* R-117: once, after a sign-in with a one-time code by someone with no PIN yet. */}
      <PinPrompt key={session?.ownerKey ?? 'none'} />
    </>
  );
}

/** The screens and navigation. The real app mounts it per session (SessionRoot); the demo gym mounts it on the sample gym (demo/DemoApp). */
export function Routes({ online }: { online: boolean }) {
  const demo = useDemo() !== null;
  const { snapshot, memberViews, today } = useCrm();
  const { newCount } = useShop();
  // R-319 item 8a: everything waiting (plan requests, numbers to confirm, new orders) badges Today.
  const { total: needsTotal } = useNeedsYou();
  const route = useRoute();
  const role = useRole();
  // #41: an owner with 2 or more branches gets "All branches" (totals and lists across branches).
  const { multi, canOpenOthers } = useBranches();
  const allBranches = multi && canOpenOthers;
  const lang = useLang();
  // F109: "Training progress" for the owner and ticked trainers, once the gym's server has the trainer view (0050).
  const trainerAccess = useTrainerAccess();
  const trainerNav = trainerAccess === 'owner' || trainerAccess === 'trainer';
  // R-319 item 1: questions members asked in the app, for the person they picked (null: hidden, no 0053).
  const questionsOpen = useQuestionCount(trainerNav);
  // Owner, 12 Nov 2026: "Message your gym" from members, badged with those waiting (null: hidden, no 0069 yet).
  const talkWaiting = useMemberMessageCount();
  // F201: the AI Assistant, for the owner of a real online gym, once the server's wallet answers (0071).
  const assistantOn = useAssistant().on;
  // F207: "Your web page", once the gym's server has the web page part (0080) and the gym is online (pageState.ts).
  const webPageOn = Boolean(useWebPage());
  // R-526: Set up your gym, for the owner: its place in the menu and its ring (ui/GetStartedCard.tsx). The ring's
  // numbers while steps are left and the row is at the top; undefined when every step is done or it was moved down.
  const getStarted = useGetStarted();
  const { done: setupDone, total: setupTotal } = getStarted.progress;
  const setupPending = getStarted.pending;
  const setupProgress = useMemo(() => (setupPending ? { done: setupDone, total: setupTotal } : undefined), [setupPending, setupDone, setupTotal]);

  // Never set up: no plans, no members, and still the placeholder name.
  // An online gym is always set up: it was named when it was made, and its welcome screen's
  // demo and erase buttons must never touch online records.
  // The demo gym is always set up, and its Welcome screen would start a real cloud gym.
  const isNewGym =
    !demo &&
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
    // R-526 (owner, 14 Nov 2026): Set up your gym. Right under Today with its ring while steps are left; at the bottom
    // (Your gym) with no ring once every step is done or the owner moved it down. The owner's (permissions.ts).
    const setup: NavItem = setupProgress
      ? { path: '/setup', label: t('Set up your gym'), icon: 'setup', progress: setupProgress }
      : { path: '/setup', label: t('Set up your gym'), icon: 'setup', group: 'gym' };
    // R-526: the top rows (no heading), then five small groups (logic/navGroups.ts). Every row and every role, flag
    // and server condition is as before; only the order and the headings changed.
    // A Staff person never sees a page they cannot open (permissions.ts): no Expenses.
    return navFor<NavItem>(role, [
      { path: '/', label: t('Today'), icon: 'today', badge: needsTotal || undefined },
      ...(setupProgress ? [setup] : []),
      // F201: right under Today on a computer (a phone has the floating button and the row under More).
      ...(assistantOn ? [{ path: '/assistant', label: t('AI Assistant'), icon: 'sparkle' } as NavItem] : []),
      // #41: an owner with 2 or more branches gets "All branches" (totals and lists across branches).
      ...(allBranches ? [{ path: '/branches', label: t('All branches'), icon: 'branches' } as NavItem] : []),

      // -- Members --
      { path: '/members', label: t('Members'), icon: 'members', badge: needsAttention, group: 'members' },
      // "Visits" rather than "Attendance": six items across a 375px phone leave
      // about 54px of text, and the longer word does not fit. The screen itself is
      // still titled Attendance, which is the word an owner comparing products
      // looks for — a short tab label under a fuller page title is the ordinary
      // pattern on both mobile platforms.
      { path: '/attendance', label: t('Visits'), icon: 'visits', badge: atRisk, group: 'members' },
      // Step 5 (15 Oct 2026): people who asked about joining.
      { path: '/enquiries', label: t('Enquiries'), icon: 'enquiries', badge: enquiriesDue || undefined, group: 'members' },
      // Owner, 12 Nov 2026: questions, feedback and complaints members send the gym from the app (owner and staff;
      // the server keeps complaints for the owner). Hidden until the gym's server has 0069.
      ...(talkWaiting !== null
        ? [{ path: '/member-messages', label: t('Member messages'), icon: 'feedback', badge: talkWaiting || undefined, group: 'members' } as NavItem]
        : []),
      // Fresh eyes (R-447): the link and QR poster were under More on a phone but missing from a computer's menu.
      { path: '/settings/invite', label: t('Invite members'), icon: 'invite', group: 'members' },

      // -- Money --
      { path: '/money', label: t('Money'), icon: 'money', badge: overdue, group: 'money' },
      { path: '/plans', label: t('Plans'), icon: 'plans', group: 'money' },
      // Badged with orders waiting at the desk — the one number on this bar that
      // changes by itself while the owner watches.
      { path: '/shop', label: t('Shop'), icon: 'shop', badge: newCount, group: 'money' },
      // Step 5 (15 Oct 2026): money going out.
      { path: '/expenses', label: t('Expenses'), icon: 'money', group: 'money' },
      // Owner, 30 Oct 2026: month by month since the gym started on MettleUp (owner only: money totals).
      { path: '/growth', label: t('Your growth'), icon: 'growth', group: 'money' },

      // -- Training --
      // F105 (7 Nov 2026): trainer pages and personal-training bookings.
      { path: '/trainers', label: t('Trainers'), icon: 'trainer', group: 'training' },
      // 18 Oct 2026: routines the gym or a trainer sends to members' MettleUp app (owner and Staff).
      { path: '/workouts', label: t('Workout plans'), icon: 'workouts', group: 'training' },
      // R-120 (24 Oct 2026): what to eat, from the trainer (owner and Staff; on the gym's server, 0035).
      { path: '/diet', label: t('Diet plans'), icon: 'diet', group: 'training' },
      // F109 (#46): members' workout progress, for trainers and the owner (hidden until 0050, and for the plain desk).
      ...(trainerNav ? [{ path: '/trainer', label: t('Training progress'), icon: 'growth', group: 'training' } as NavItem] : []),
      // R-319 item 1 (4 Nov 2026): members' "Ask a trainer" questions, badged with the ones waiting (hidden until 0053).
      ...(trainerNav && questionsOpen !== null
        ? [{ path: '/questions', label: t('Questions for trainers'), icon: 'feedback', badge: questionsOpen || undefined, group: 'training' } as NavItem]
        : []),
      // R-133 (26 Oct 2026): a monthly challenge and the leaderboard. The owner changes; the desk reads.
      { path: '/challenges', label: t('Challenges'), icon: 'trophy', group: 'training' },

      // -- Reach members --
      // 22 Oct 2026: notices, offers and wishes to members, moved out of Shop (owner only).
      { path: '/messages', label: t('Messages & offers'), icon: 'messages', group: 'reach' },
      // #49 step 2: the front desk sees only the workout offer (to give earned rewards). The owner
      // reaches it inside Messages & offers.
      ...(role === 'staff' ? [{ path: '/messages/offer', label: t('Workout offer'), icon: 'messages', group: 'reach' } as NavItem] : []),

      // -- Your gym --
      // R-119 (owner, 24 Oct 2026): the gym's logo and colours, one tap from the menu instead of
      // Settings -> Open branding. The owner's (permissions.ts canOpen hides it from the front desk).
      { path: '/settings/branding', label: t('Branding'), icon: 'brand', group: 'gym' },
      // R-124 (25 Oct 2026): when the gym is open, for members to see. The owner edits; the desk reads.
      { path: '/settings/timings', label: t('Gym timings'), icon: 'clock', group: 'gym' },
      // F207 (R-519): the gym's own free web page. The owner edits; the desk sees the address (ui/screens/WebPage.tsx).
      ...(webPageOn ? [{ path: '/settings/web-page', label: t('Your web page'), icon: 'globe', group: 'gym' } as NavItem] : []),
      { path: '/settings', label: t('Settings'), icon: 'settings', group: 'gym' },
      // Launch H7 (21 Oct 2026): write to MettleUp (problems, ideas). Owner and Staff. Not in the demo
      // gym, which sends nothing to anyone.
      ...(demo ? [] : [{ path: '/feedback', label: t('Help and feedback'), icon: 'feedback', group: 'gym' } as NavItem]),
      ...(setupProgress ? [] : [setup]),
    ]);
    // `lang`: the labels are words, so a language switch makes them again.
  }, [memberViews, snapshot, today, newCount, role, allBranches, demo, lang, trainerNav, questionsOpen, talkWaiting, needsTotal, assistantOn, setupProgress, webPageOn]);
  // Step 3 (15 Oct 2026): five on a phone's bottom bar, like GoGym4U and GymBook — Aaj, Members,
  // Hisaab, Hazri and More (Plans, Shop, Settings). Six or seven icons were too small to read.
  const phoneNav = useMemo<NavItem[]>(() => {
    const by = (path: string) => nav.find((n) => n.path === path);
    const kept = ['/', '/members', '/money', '/attendance'].map(by).filter((n): n is NavItem => Boolean(n));
    const rest = nav.filter((n) => !kept.includes(n));
    const restBadge = rest.reduce((sum, n) => sum + (n.badge ?? 0), 0);
    // R-526: the set-up ring shows on More too, while its row is in there with steps left.
    const restProgress = rest.find((n) => n.progress)?.progress;
    return [...kept, { path: '/more', label: t('More'), icon: 'more', badge: restBadge || undefined, progress: restProgress }];
  }, [nav]);


  if (isNewGym) return <Welcome />;

  return (
    // F198 (R-389): new-feature dots, for the owner of a real online gym only (the features are the owner's pages).
    <NewDotsProvider enabled={role === 'owner' && online && !demo} since={snapshot.gym.createdAt} menuPaths={nav.map((n) => n.path)}>
    <AppShell gymName={snapshot.gym.name} nav={nav} phoneNav={phoneNav}>
      {/* Owner, 1 Nov 2026: "Next step" on a screen opened from Get started; the gym code once after "Create my gym". */}
      <NextStepBar path={route.path} />
      <NewGymReady />
      {/* F103 step 2: keeps entry machines in step with sales, renewals and the nightly sweep; nothing without a machine. */}
      {online && !demo && <EntryMachineJob />}
      {/* F201: asks the gym's server for the AI credits; the floating button and the side panel (owner only). */}
      <AssistantWatch />
      <AssistantFab />
      {canOpen(role, `/${route.segments.join('/')}`) ? <Screen segments={route.segments} role={role} /> : <OwnerOnly />}
    </AppShell>
    </NewDotsProvider>
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
  if (head === 'diet') return 'Diet plans';
  if (head === 'challenges') return 'Challenges';
  if (head === 'questions') return 'Questions for trainers';
  if (head === 'member-messages') return 'Member messages';
  if (head === 'trainers') return 'Trainers';
  if (head === 'feedback') return 'Help and feedback';
  if (head === 'assistant') return 'AI Assistant';
  if (head === 'branches') return 'All branches';
  if (head === 'members' && id === 'import') return 'Importing members';
  if (head === 'members' && id === 'app') return 'Members using the app';
  if (head === 'settings' && id === 'people') return 'Staff & sign-in';
  if (head === 'settings' && id === 'branding') return 'Branding';
  if (head === 'settings' && id === 'timings') return 'Gym timings';
  if (head === 'settings' && id === 'web-page') return 'Your web page';
  if (head === 'settings' && id === 'machines') return 'Busy machines';
  if (head === 'settings' && id === 'entry') return 'Entry machines';
  if (head === 'settings' && id === 'mettleup') return 'Paying MettleUp';
  if (head === 'settings' && id === 'invite') return 'The invite link';
  return null;
}

function Screen({ segments, role }: { segments: string[]; role: Role }) {
  const [head, id] = segments;
  const { offline } = useOffline();
  const proOn = useFeatureCheck();
  // R-119: the demo gym shows a plain card in place of any page that only works in a real gym.
  const demoPage = useDemo() ? demoNeedsRealGym(head, id) : null;
  if (demoPage) return <DemoNeedsRealGym page={demoPage} />;
  const blocked = offline ? offlinePage(head, id) : null;
  if (blocked) return <NeedsInternetPage what={blocked} />;
  // T66 (#30 A): a Pro page on a Starter gym shows what it is instead (only once PLAN_GATE_ON is on).
  const pro = proFeatureOfPage(head, id);
  if (pro && !proOn(pro)) return <ProPage feature={pro} />;

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
    case 'diet':
      return <DietPlansScreen />;
    case 'trainer':
      // F109: the server decides who may read it (owner, ticked trainer); the page says so to anyone else.
      // R-535: `/trainer/<list member id>` is one member's full progress.
      return <MyMembersScreen key={id ?? 'list'} memberId={id ?? null} />;
    case 'trainers':
      // F105: trainer pages and the week of personal-training bookings (NOT LIVE until 0065; the page says so).
      return <TrainersScreen key={id ?? 'all'} trainerId={id} />;
    case 'questions':
      // R-319 item 1: the server shows each person only the questions addressed to them; others are told so.
      return <QuestionsScreen />;
    case 'member-messages':
      // Owner, 12 Nov 2026: members' "Message your gym"; the server keeps complaints for the owner (0069).
      // Fresh eyes (14 Nov 2026): `/member-messages/complaint` (and feedback, question) opens on that type, so a line on
      // Today opens the message it is about.
      return <MemberMessagesScreen key={id ?? 'all'} startWith={id} />;
    case 'challenges':
      return <ChallengesScreen />;
    case 'feedback':
      return <FeedbackScreen />;
    case 'branches':
      return <AllBranchesScreen />;
    case 'growth':
      // Owner, 30 Oct 2026: is the gym growing since MettleUp? `/growth/print` is the one-page report.
      return id === 'print' ? <GrowthPrintScreen /> : <GrowthScreen />;
    case 'assistant':
      // F201: the AI Assistant (owner only; hidden until the gym's server has 0071, then the page goes to Today).
      return <AssistantScreen />;
    case 'setup':
      // R-526 (owner, 14 Nov 2026): Set up your gym, the first steps, out of Today (owner only, permissions.ts).
      return <SetupGymScreen />;
    case 'get-started':
      // R-526: an old or typed "get-started" address lands on the same page.
      return <Redirect to="/setup" />;
    case 'news':
      // R-239: What's new, out of Settings (the sidebar's bottom row, the bell, More on a phone).
      return <WhatsNewScreen />;
    case 'numbers':
      // R-168: `/numbers/<tile>/<range>`, the list behind a "Your numbers" tile on Today.
      return <NumbersScreen key={id} which={id} rangeSeg={segments[2]} />;
    case 'settings':
      // Gym branding: Settings -> Branding (the gym's look in the member app).
      if (id === 'branding') return <BrandingScreen />;
      // R-124: Settings -> Gym timings (when the gym is open, shown in the member app).
      if (id === 'timings') return <GymTimingsScreen />;
      // F207 (R-519): Settings -> Your web page (join.mettleup.fit/<gym>).
      if (id === 'web-page') return <WebPageScreen />;
      // F79 (R-328): Settings -> Payments (UPI QR and the gym's own payment company).
      if (id === 'payments') return <PaymentsScreen />;
      // F137: Settings -> Member app -> Busy machines (hidden until the gym's server has 0049).
      if (id === 'machines') return <BusyMachinesScreen />;
      // F103 step 2: Settings -> Entry machines (says plainly when the gym's server is not ready, 0059).
      if (id === 'entry') return <EntryMachinesScreen />;
      // T79: Settings -> Pay MettleUp (the owner pays for the plan; says plainly when the server is not ready, 0060).
      // Billing step 3: one MettleUp receipt, /settings/mettleup/receipt/<number> (owner only, like the screen).
      // Off (BILLING_ONLINE_ON false): no receipt screen, so owner_receipt (0063) is never called.
      if (id === 'mettleup' && segments[2] === 'receipt' && BILLING_ONLINE_ON) return <MettleUpReceiptScreen receiptNo={segments[3] ?? ''} />;
      if (id === 'mettleup') return <PayMettleUpScreen />;
      // Invite link + front-desk QR poster.
      if (id === 'invite') return <InviteScreen />;
      // Staff & sign-in: people who may sign in, and the codes the owner makes for them.
      if (id === 'people') return <PeopleScreen />;
      // R-148: the old address of What's new (now /news, R-239).
      if (id === 'news') return <WhatsNewScreen />;
      // R-247: the Gym, Member app (/settings/app) and Sign-in & data (/settings/data) tabs.
      return <SettingsScreen section={id} />;
    default:
      return <TodayScreen />;
  }
}
