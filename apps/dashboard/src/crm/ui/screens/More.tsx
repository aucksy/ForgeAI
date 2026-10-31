/**
 * More (phone only, Gym Panel step 3): the pages that are not on the five-item bottom bar, as big
 * rows with their own badges — Plans, Shop, Messages & offers (the owner's), Branding (the owner's), Settings, and the two
 * Settings pages owners look for most (Staff & sign-in, Invite members). On a computer the sidebar
 * shows them all instead.
 */

import { useRole } from '../../auth/AuthProvider';
import { navFor } from '../../auth/permissions';
import { dueCount } from '../../logic/enquiries';
import { useShop } from '../../shop/ShopProvider';
import { useCrm } from '../../store';
import { Icon, type IconName } from '../icons';
import { Card, PageHeader, TOUCH, color, font, radius, space } from '../kit';
import { Link } from '../router';

interface Row {
  path: string;
  label: string;
  hint: string;
  icon: IconName;
  badge?: number;
  /** UAT B-15 (30 Oct 2026): the 16 rows sit under three headings. */
  group: Group;
}

type Group = 'run' | 'talk' | 'setup';
const GROUPS: { id: Group; title: string }[] = [
  { id: 'run', title: 'Run the gym' },
  { id: 'talk', title: 'Talk to members' },
  { id: 'setup', title: 'Set up and help' },
];

export function MoreScreen() {
  const { newCount } = useShop();
  const { snapshot, today } = useCrm();
  const enquiriesDue = dueCount(snapshot.enquiries, today);
  const role = useRole();
  const owner = role === 'owner';
  // Staff never sees Expenses (permissions.ts); the rest stays, with words that fit what they can do.
  const rows: Row[] = navFor<Row>(role, [
    { path: '/growth', group: 'run', label: 'Your growth', hint: 'Is the gym growing since MettleUp? Month by month', icon: 'growth' },
    { path: '/plans', group: 'run', label: 'Plans', hint: 'Prices and durations', icon: 'plans' },
    {
      path: '/enquiries', group: 'run',
      label: 'Enquiries',
      hint: 'People who asked about joining',
      icon: 'enquiries',
      badge: enquiriesDue,
    },
    { path: '/expenses', group: 'run', label: 'Expenses', hint: 'Money going out, and profit', icon: 'money' },
    { path: '/workouts', group: 'talk', label: 'Workout plans', hint: 'Send members their routines', icon: 'workouts' },
    { path: '/diet', group: 'talk', label: 'Diet plans', hint: 'Send members what to eat', icon: 'diet' },
    { path: '/shop', group: 'run', label: 'Shop', hint: 'Orders from the app', icon: 'shop', badge: newCount },
    { path: '/messages', group: 'talk', label: 'Messages & offers', hint: 'Messages, offers and wishes to members', icon: 'messages' },
    { path: '/settings/branding', group: 'setup', label: 'Branding', hint: 'Your logo and colours in the member app', icon: 'brand' },
    { path: '/settings/timings', group: 'setup', label: 'Gym timings', hint: owner ? 'When you are open, for members to see' : 'When the gym is open', icon: 'clock' },
    { path: '/challenges', group: 'talk', label: 'Challenges', hint: owner ? 'A monthly goal for members, and the leaderboard' : 'Who has reached the goal', icon: 'trophy' },
    {
      path: '/settings/people', group: 'setup',
      label: 'Staff & sign-in',
      hint: owner ? 'Who can open this admin app, and your PIN' : 'Your PIN, and signing out',
      icon: 'key',
    },
    {
      path: '/settings/invite', group: 'talk',
      label: 'Invite members',
      hint: 'Link and QR poster',
      icon: 'invite',
    },
    {
      path: '/settings', group: 'setup',
      label: 'Settings',
      hint: owner ? 'Gym details, screen colours, app' : 'Screen colours, app, sign-in',
      icon: 'settings',
    },
    // R-148: what changed in the admin app.
    { path: '/settings/news', group: 'setup', label: "What's new", hint: 'Changes to this admin app', icon: 'news' },
    // Launch H7 (21 Oct 2026).
    { path: '/feedback', group: 'setup', label: 'Send feedback', hint: 'Tell MettleUp a problem or an idea', icon: 'feedback' },
  ]);
  return (
    <>
      <PageHeader title="More" />
      {GROUPS.map((g) => {
        const inGroup = rows.filter((r) => r.group === g.id);
        if (inGroup.length === 0) return null;
        return (
      <section key={g.id} aria-label={g.title} style={{ marginBottom: space.lg }}>
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
        {g.title}
      </h2>
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
                  <span style={{ display: 'block', fontFamily: font.body, fontSize: 16, fontWeight: 700 }}>{r.label}</span>
                  <span style={{ display: 'block', fontFamily: font.body, fontSize: 13, color: color.inkSecondary }}>{r.hint}</span>
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
