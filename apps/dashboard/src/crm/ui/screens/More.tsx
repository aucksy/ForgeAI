/**
 * More (phone only, Gym Panel step 3): the pages that are not on the five-item bottom bar, as big
 * rows with their own badges — Plans, Shop, Settings, and the two Settings pages owners look for
 * most (Staff & sign-in, Invite members). On a computer the sidebar shows them all instead.
 */

import { tr } from '../../i18n';
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
  const rows: Row[] = [
    { path: '/plans', label: tr('Plans', 'Plan'), hint: tr('Prices and durations', 'Fees aur samay'), icon: 'plans' },
    {
      path: '/enquiries',
      label: tr('Enquiries', 'Enquiry'),
      hint: tr('People who asked about joining', 'Jinhone join karne ke baare mein poocha'),
      icon: 'members',
      badge: enquiriesDue,
    },
    { path: '/expenses', label: tr('Expenses', 'Kharcha'), hint: tr('Money going out, and profit', 'Kharcha aur munafa'), icon: 'money' },
    { path: '/shop', label: tr('Shop', 'Shop'), hint: tr('Orders from the app', 'App se aaye orders'), icon: 'shop', badge: newCount },
    {
      path: '/settings/people',
      label: tr('Staff & sign-in', 'Staff ka login'),
      hint: tr('Who can open this panel', 'Panel kaun khol sakta hai'),
      icon: 'members',
    },
    {
      path: '/settings/invite',
      label: tr('Invite members', 'Members ko bulao'),
      hint: tr('Link and QR poster', 'Link aur QR poster'),
      icon: 'today',
    },
    { path: '/settings', label: tr('Settings', 'Settings'), hint: tr('Gym details, language, app', 'Gym ki details, bhasha, app'), icon: 'settings' },
  ];
  return (
    <>
      <PageHeader title={tr('More', 'Aur')} />
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
