/**
 * More (phone only, Gym Panel step 3): the pages that are not on the five-item bottom bar, as big
 * rows with their own badges — Plans, Shop, Messages & offers (the owner's), Branding (the owner's), Settings, and the two
 * Settings pages owners look for most (Staff & sign-in, Invite members). On a computer the sidebar
 * shows them all instead.
 * R-526 (owner, 14 Nov 2026): the same groups and headings as the computer's side menu (logic/navGroups.ts), and Set
 * up your gym on top with its ring while steps are left.
 */

import { useRole } from '../../auth/AuthProvider';
import { navFor } from '../../auth/permissions';
import { dueCount } from '../../logic/enquiries';
import { useShop } from '../../shop/ShopProvider';
import { useCrm } from '../../store';
import { Icon, type IconName } from '../icons';
import { Card, NewDot, PageHeader, TOUCH, color, font, radius, space } from '../kit';
import { useNewFeatures } from '../NewDots';
import { linkLit } from '../../logic/newDots';
import { Link } from '../router';
import { useTrainerAccess } from '../TrainerParts';
import { useQuestionCount } from '../QuestionParts';
import { QUESTION_WORDS } from '../../logic/askQuestions';
import { MEMBER_MESSAGE_WORDS } from '../../logic/memberMessages';
import { useMemberMessageCount } from '../MemberMessageParts';
import { useAssistant } from '../../assistant/useAssistant';
import { useBranches } from '../../branches/context';
import { t } from '../../lang/lang';
import { navSections, type NavGroupId, type SetupProgress } from '../../logic/navGroups';
import { ProgressRing, progressWords, useGetStarted } from '../GetStartedCard';
import { useWebPage } from '../../gympage/pageState';

interface Row {
  path: string;
  label: string;
  hint: string;
  icon: IconName;
  badge?: number;
  /** UAT B-15 (30 Oct 2026): the rows sit under headings; R-526: the side menu's groups (none = the top rows). */
  group?: NavGroupId;
  /** R-526: Set up your gym's steps done, while some are left. */
  progress?: SetupProgress;
}

export function MoreScreen() {
  const { newCount } = useShop();
  const { snapshot, today } = useCrm();
  const enquiriesDue = dueCount(snapshot.enquiries, today);
  const role = useRole();
  const owner = role === 'owner';
  const trainerAccess = useTrainerAccess();
  const trainerNav = trainerAccess === 'owner' || trainerAccess === 'trainer';
  const questionsOpen = useQuestionCount(trainerNav);
  const talkWaiting = useMemberMessageCount();
  // F201: the AI Assistant (owner only; hidden until the gym's server answers its credits, 0071).
  const assistantOn = useAssistant().on;
  // #41: "All branches", as in the side menu (an owner with 2 or more branches).
  const { multi, canOpenOthers } = useBranches();
  // R-526: Set up your gym, on top with its ring while steps are left; under Your gym once done or moved down.
  const getStarted = useGetStarted();
  // F207: the gym's web page, once its server has the web page part (0080).
  const webPageOn = Boolean(useWebPage());
  const setupRow: Row = {
    path: '/setup',
    label: 'Set up your gym',
    hint: 'Finish these steps and your gym is ready for members.',
    icon: 'setup',
    ...(getStarted.pending ? { progress: getStarted.progress } : { group: 'gym' as const }),
  };
  // Staff never sees Expenses (permissions.ts); the rest stays, with words that fit what they can do.
  // R-526: in the side menu's order. Members, Visits and Money are on the bottom bar, so not here.
  const rows: Row[] = navFor<Row>(role, [
    ...(getStarted.pending ? [setupRow] : []),
    ...(assistantOn
      ? [{ path: '/assistant', label: 'AI Assistant', hint: 'Ask a question or give a task, in Hindi or English', icon: 'sparkle' } as Row]
      : []),
    ...(multi && canOpenOthers ? [{ path: '/branches', label: 'All branches', hint: 'Totals and lists from every branch', icon: 'branches' } as Row] : []),

    {
      path: '/enquiries', group: 'members',
      label: 'Enquiries',
      hint: 'People who asked about joining',
      icon: 'enquiries',
      badge: enquiriesDue,
    },
    // Owner, 12 Nov 2026: members' "Message your gym" (owner and staff; complaints the owner's). Hidden until 0069.
    ...(talkWaiting !== null
      ? [{ path: '/member-messages', group: 'members', label: 'Member messages', hint: MEMBER_MESSAGE_WORDS.navHint, icon: 'feedback', badge: talkWaiting } as Row]
      : []),
    {
      path: '/settings/invite', group: 'members',
      label: 'Invite members',
      hint: 'Link and QR poster',
      icon: 'invite',
    },

    { path: '/plans', group: 'money', label: 'Plans', hint: 'Prices and durations', icon: 'plans' },
    { path: '/shop', group: 'money', label: 'Shop', hint: 'Orders from the app', icon: 'shop', badge: newCount },
    { path: '/expenses', group: 'money', label: 'Expenses', hint: 'Money going out, and profit', icon: 'money' },
    { path: '/growth', group: 'money', label: 'Your growth', hint: 'Is the gym growing since MettleUp? Month by month', icon: 'growth' },

    { path: '/trainers', group: 'training', label: 'Trainers', hint: 'Their hours, and personal-training bookings', icon: 'trainer' },
    { path: '/workouts', group: 'training', label: 'Workout plans', hint: 'Send members their routines', icon: 'workouts' },
    { path: '/diet', group: 'training', label: 'Diet plans', hint: 'Send members what to eat', icon: 'diet' },
    // F109 (#46): hidden until the gym's server has the trainer view (0050), and for the desk without the Trainer tick.
    ...(trainerNav
      ? [{ path: '/trainer', group: 'training', label: 'Training progress', hint: owner ? 'Members’ workout progress, and their trainer' : 'Your members’ workout progress', icon: 'growth' } as Row]
      : []),
    // R-319 item 1: members' "Ask a trainer" questions for this person; hidden until 0053 (count null).
    ...(trainerNav && questionsOpen !== null
      ? [{ path: '/questions', group: 'training', label: 'Member questions', hint: QUESTION_WORDS.navHint, icon: 'feedback', badge: questionsOpen } as Row]
      : []),
    { path: '/challenges', group: 'training', label: 'Challenges', hint: owner ? 'A monthly goal for members, and the leaderboard' : 'Who has reached the goal', icon: 'trophy' },

    { path: '/messages', group: 'reach', label: 'Messages & offers', hint: 'Messages, offers and wishes to members', icon: 'messages' },
    // #49 step 2: the desk's workout offer list, as in the side menu (the owner reaches it in Messages & offers).
    ...(role === 'staff' ? [{ path: '/messages/offer', group: 'reach', label: 'Workout offer', hint: 'Give members the rewards they earned', icon: 'messages' } as Row] : []),

    { path: '/settings/branding', group: 'gym', label: 'Branding', hint: 'Your logo and colours in the member app', icon: 'brand' },
    { path: '/settings/timings', group: 'gym', label: 'Gym timings', hint: owner ? 'When you are open, for members to see' : 'When the gym is open', icon: 'clock' },
    ...(webPageOn
      ? [{ path: '/settings/web-page', group: 'gym', label: 'Your web page', hint: owner ? 'Your gym’s free page: fees, timings and photos' : 'The gym’s free web page', icon: 'globe' } as Row]
      : []),
    {
      path: '/settings/people', group: 'gym',
      label: 'Staff & sign-in',
      hint: owner ? 'Who can open this admin app, and your PIN' : 'Your PIN, and signing out',
      icon: 'key',
    },
    {
      path: '/settings', group: 'gym',
      label: 'Settings',
      hint: owner ? 'Gym details, screen colours, app' : 'Screen colours, app, sign-in',
      icon: 'settings',
    },
    // R-148: what changed in the admin app (R-239: its own page, /news).
    { path: '/news', group: 'gym', label: "What's new", hint: 'Changes to this admin app', icon: 'news' },
    // Launch H7 (21 Oct 2026).
    { path: '/feedback', group: 'gym', label: 'Help and feedback', hint: 'Ask a question, or tell MettleUp a problem or an idea', icon: 'feedback' },
    ...(getStarted.pending ? [] : [setupRow]),
  ]);
  // F198: a dot on the row that leads to a new feature (Settings for Pay MettleUp, Branding for its icon preview).
  const lit = useNewFeatures();
  const rowPaths = rows.map((r) => r.path);
  return (
    <>
      <PageHeader title={t('More')} />
      {navSections(rows).map((g) => {
        const inGroup = g.items;
        const title = g.title ? t(g.title) : null;
        return (
      <section key={g.group ?? 'top'} aria-label={title ?? t('More')} style={{ marginBottom: space.lg }}>
      {title ? (
      <h2
        style={{
          margin: `0 0 ${space.sm}px`,
          fontFamily: font.body,
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: 0.6,
          textTransform: 'uppercase',
          color: color.inkMuted,
        }}
      >
        {title}
      </h2>
      ) : null}
      <Card>
        <div style={{ display: 'grid' }}>
          {inGroup.map((r, i) => (
            <Link key={r.path} to={r.path}>
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: space.md,
                  minHeight: TOUCH + 12,
                  padding: `${space.sm}px 0`,
                  borderTop: i === 0 ? 'none' : `1px solid ${color.border}`,
                  color: color.ink,
                }}
              >
                <span
                  style={{
                    display: 'grid',
                    placeItems: 'center',
                    width: 40,
                    height: 40,
                    borderRadius: radius.md,
                    background: color.accentSoft,
                    color: color.accentBright,
                    flexShrink: 0,
                  }}
                >
                  <Icon name={r.icon} size={22} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: font.body, fontSize: 16, fontWeight: 700 }}>
                    {t(r.label)}
                    {linkLit(lit, rowPaths, r.path) ? <NewDot /> : null}
                  </span>
                  <span style={{ display: 'block', fontFamily: font.body, fontSize: 13, color: color.inkSecondary }}>{t(r.hint)}</span>
                </span>
                {r.badge ? (
                  <span
                    style={{
                      minWidth: 24,
                      height: 24,
                      padding: '0 7px',
                      borderRadius: radius.pill,
                      background: color.accent,
                      color: '#1F0D05',
                      fontFamily: font.body,
                      fontSize: 12,
                      fontWeight: 800,
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    {r.badge}
                  </span>
                ) : null}
                {r.progress ? (
                  // R-526: the set-up ring and "3 of 8", unlike the orange number badges.
                  <span data-setup-mark="" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <ProgressRing progress={r.progress} size={18} />
                    <span style={{ fontFamily: font.body, fontSize: 13, fontWeight: 700, color: color.inkSecondary, whiteSpace: 'nowrap' }}>
                      {t('{done} of {total}', { done: r.progress.done, total: r.progress.total })}
                    </span>
                    <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{progressWords(r.progress)}</span>
                  </span>
                ) : null}
                <span aria-hidden style={{ color: color.inkMuted, fontSize: 20 }}>
                  ›
                </span>
              </span>
            </Link>
          ))}
        </div>
      </Card>
      </section>
        );
      })}
    </>
  );
}
