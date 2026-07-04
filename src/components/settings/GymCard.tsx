import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { GlassCard, Skeleton } from '@/components/ui';
import { Logo } from '@/components/ui/Logo';
import { fromISO } from '@/lib/date';
import { getProfile } from '@/db/repos/userRepo';
import { color, space, type } from '@/theme/tokens';
import type { UserProfile } from '@/types/models';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function monthYear(iso: string): string {
  const d = fromISO(iso);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Gym branding: the member's gym, tenure and the ForgeAI lockup. */
export function GymCard() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    getProfile()
      .then((p) => {
        if (alive) setProfile(p);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <GlassCard>
      <Text
        style={{
          fontFamily: type.bodySemi,
          fontSize: type.size.caption,
          color: color.accentBright,
          letterSpacing: 1.4,
          textTransform: 'uppercase',
        }}
      >
        Your gym
      </Text>

      {profile ? (
        <>
          <Text
            style={{
              fontFamily: type.display,
              fontSize: type.size.h2,
              color: color.ink,
              letterSpacing: -0.3,
              marginTop: space.sm,
            }}
          >
            {profile.gymName}
          </Text>
          <Text
            style={{
              fontFamily: type.bodyMedium,
              fontSize: type.size.sub,
              color: color.inkSecondary,
              marginTop: 3,
            }}
          >
            Member since {monthYear(profile.memberSinceISO)}
          </Text>
        </>
      ) : failed ? (
        <Text
          style={{
            fontFamily: type.display,
            fontSize: type.size.h2,
            color: color.ink,
            marginTop: space.sm,
          }}
        >
          Your gym
        </Text>
      ) : (
        <View style={{ marginTop: space.sm, gap: space.sm }}>
          <Skeleton width="62%" height={24} />
          <Skeleton width="40%" height={14} />
        </View>
      )}

      <Text
        style={{
          fontFamily: type.body,
          fontSize: type.size.sub,
          color: color.inkSecondary,
          lineHeight: 19,
          marginTop: space.md,
        }}
      >
        Your coach and complete history live with your gym membership.
      </Text>

      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: color.border,
          marginTop: space.lg,
          paddingTop: space.lg,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Logo height={22} />
        <Text
          style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }}
        >
          Powered by ForgeAI
        </Text>
      </View>
    </GlassCard>
  );
}
