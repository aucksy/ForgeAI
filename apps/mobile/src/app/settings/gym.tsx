/**
 * Settings → Your gym (Release A, docs/ux/MEMBER-APP-MAP.md A2/A4).
 *
 *  - With a gym: the gym's name, then "Gym logo on my home screen" (when it has a logo) and "Leave
 *    <gym>". The same rows sit in the Settings page's "Your gym" group; this page stays for older
 *    links ("To leave your gym, open Settings, then Your gym"). My membership lives on the Gym tab,
 *    and the gym's reminders on the one Reminders page.
 *  - With no gym: the Gym tab's "Join your gym" screen is the one place to join (code box and the
 *    poster scan), so this address goes there.
 */
import { Redirect } from 'expo-router';
import { Text } from 'react-native';

import { CloudCard } from '@/components/settings/CloudCard';
import { JoinedGymRows } from '@/components/settings/GymSettings';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { GlassCard } from '@/components/ui';
import { FEATURES, profileParts } from '@/lib/features';
import { useGymShop } from '@/shop/gymStore';
import { useGymHydrated } from '@/shop/shopSource';
import { color, space, type } from '@/theme/tokens';

const PARTS = new Set(profileParts(FEATURES));

export default function GymPage() {
  const hydrated = useGymHydrated();
  const link = useGymShop((s) => s.link);
  if (hydrated && !link) return <Redirect href="/shop" />;
  return (
    <SettingsPage title="Your gym">
      {link ? (
        <>
          <GlassCard>
            <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.caption, color: color.accentBright, letterSpacing: 1.4, textTransform: 'uppercase' }}>
              Your gym
            </Text>
            <Text style={{ fontFamily: type.display, fontSize: type.size.h2, color: color.ink, letterSpacing: -0.3, marginTop: space.sm }}>{link.gymName}</Text>
            <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkSecondary, marginTop: 3 }}>
              {link.name.trim() ? `Joined in the app as ${link.name.trim()}` : 'Joined in the app'}
            </Text>
          </GlassCard>
          <JoinedGymRows link={link} />
        </>
      ) : null}
      {PARTS.has('gymSync') ? <CloudCard /> : null}
    </SettingsPage>
  );
}