/**
 * More (phone only, Gym Panel step 3): the pages that are not on the five-item bottom bar, as big
 * rows with their own badges — Plans, Shop, Messages & offers (the owner's), Settings, and the two
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
}

export function MoreScreen() {
  const { newCount } = useShop();
  const { snapshot, today } = useCrm();
  const enquiriesDue = dueCount(snapshot.enquiries, today);
  const role = useRole();
  const owner = role === 'owner';
  // Staff never sees Expenses (permissions.ts); the rest stays, with words that fit what they can do.
  const rows: Row[] = navFor<Row>(role, [
    { path: '/plans', label: 'Plans', hint: 'Prices and durations', icon: 'plans' },
    {
      path: '/enquiries',
      label: 'Enquiries',
      hint: 'People who asked about joining',
      icon: 'members',
      badge: enquiriesDue,
    },
    { path: '/expenses', label: 'Expenses', hint: 'Money going out, and profit', icon: 'money' },
    { path: '/workouts', label: 'Workout plans', hint: 'Send members their routines', icon: 'workouts' },
    { path: '/shop', label: 'Shop', hint: 'Orders from the app', icon: 'shop', badge: newCount },
    { path: '/messages', label: 'Messages & offers', hint: 'Notices, offers and wishes to members', icon: 'messages' },
    {
      path: '/settings/people',
      label: 'Staff & sign-in',
      hint: owner ? 'Who can open this admin app, and your PIN' : 'Your PIN, and signing out',
      icon: 'members',
    },
    {
      path: '/settings/invite',
      label: 'Invite members',
      hint: 'Link and QR poster',
      icon: 'today',
    },
    {
      path: '/settings',
      label: 'Settings',
      hint: owner ? 'Gym details, screen colours, app' : 'Screen colours, app, sign-in',
      icon: 'settings',
    },
    // Launch H7 (21 Oct 2026).
    { path: '/feedback', label: 'Send feedback', hint: 'Tell MettleUp a problem or an idea', icon: 'more' },
  ]);
  return (
    <>
      <PageHeader title="More" />
      <Card>
        <div style={{ display: 'grid' }}>
          {rows.map((r, i) => (
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
    </>
  );
}
