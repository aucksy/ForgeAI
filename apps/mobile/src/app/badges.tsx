/**
 * F58 Badge shelf — every badge (opened from Profile → "Badges"). Earned badges first, newest
 * first, bright, with the day each was earned; then "Still to earn", dim, each with how to earn
 * it and, for counts, how far along the member is. The rule is `tracker/engine/badges.ts`.
 */
import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';

import { LoadError, Screen, Skeleton } from '@/components/ui';
import { tinyDateWithYear } from '@/lib/date';
import { goBack } from '@/lib/goBack';
import { useLoad } from '@/lib/useLoad';
import { useUnits } from '@/lib/useUnits';
import { color, radius, space, type } from '@/theme/tokens';
import { BadgeMedal } from '@/tracker/components/profile/BadgeShelf';
import { BADGES, badgeHowTo, badgeName, badgeProgressText, earnedNewestFirst, earnedText, type BadgeState } from '@/tracker/engine/badges';
import { getBadges } from '@/tracker/services/badgesService';
import type { UnitSystem } from '@/types/models';

function BadgeRow({ badge, units }: { badge: BadgeState; units: UnitSystem }) {
  const name = badgeName(badge.id, units);
  const got = badge.earned != null;
  const lines = got
    ? [earnedText(tinyDateWithYear((badge.earned as { dateISO: string }).dateISO))]
    : [badgeHowTo(badge.id, units), badgeProgressText(badge, units)].filter((l): l is string => l != null);
  return (
    <View
      accessible
      accessibilityLabel={`${name}. ${got ? '' : 'Not earned yet. '}${lines.join(' ')}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
        borderRadius: radius.md,
        backgroundColor: color.surface,
        borderWidth: 1,
        borderColor: got ? color.borderStrong : color.border,
      }}
    >
      <BadgeMedal icon={badge.icon} earned={got} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: got ? color.ink : color.inkSecondary }}>{name}</Text>
        {lines.map((l, i) => (
          <Text
            key={i}
            style={{
              fontFamily: i === 0 && got ? type.bodySemi : type.bodyMedium,
              fontSize: type.size.sub,
              lineHeight: 18,
              color: got ? color.accent : color.inkMuted,
            }}
          >
            {l}
          </Text>
        ))}
      </View>
    </View>
  );
}

function Heading({ text }: { text: string }) {
  return (
    <Text accessibilityRole="header" style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.inkSecondary, marginTop: space.sm }}>
      {text}
    </Text>
  );
}

export default function BadgesScreen() {
  const router = useRouter();
  const units = useUnits();
  const { data, state, retry } = useLoad(getBadges, [], { onFocus: true });
  const earned = data ? earnedNewestFirst(data) : [];
  const toEarn = data ? data.filter((b) => b.earned == null) : [];

  return (
    <Screen
      title="Badges"
      subtitle={data ? `${earned.length} of ${BADGES.length} earned` : undefined}
      onBack={() => goBack(router, '/profile')}
    >
      {state === 'error' && !data ? (
        <LoadError what="your badges" onRetry={retry} />
      ) : !data ? (
        <View style={{ gap: space.md }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} width="100%" height={72} radius={radius.md} />
          ))}
        </View>
      ) : (
        <View style={{ gap: space.md, paddingBottom: space.xxl }}>
          <Text style={{ fontFamily: type.body, fontSize: type.size.sub, lineHeight: 20, color: color.inkSecondary }}>
            You earn badges from the workouts you log in the app. Each badge is earned once, on the day of the workout that earned it.
          </Text>
          {earned.length > 0 ? (
            <>
              <Heading text="Earned" />
              {earned.map((b) => (
                <BadgeRow key={b.id} badge={b} units={units} />
              ))}
            </>
          ) : null}
          {toEarn.length > 0 ? (
            <>
              <Heading text="Still to earn" />
              {toEarn.map((b) => (
                <BadgeRow key={b.id} badge={b} units={units} />
              ))}
            </>
          ) : null}
        </View>
      )}
    </Screen>
  );
}
