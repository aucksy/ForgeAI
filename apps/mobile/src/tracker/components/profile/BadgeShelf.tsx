/**
 * F58 Badge shelf. Two pieces:
 *  - `BadgeMedal`: one badge's round mark — bright in the accent when earned, dim grey when not;
 *  - `BadgeShelfRow`: the Profile's "Badges" row under Calendar — how many are earned and the
 *    newest few marks; a tap opens the whole shelf (/badges).
 * The row reads its own badges on focus (kept until anything is saved), so Profile's own reads
 * are untouched. A failed read hides only the marks (the row still opens the shelf, which says so).
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/ui';
import { tap } from '@/lib/haptics';
import { useUnits } from '@/lib/useUnits';
import { color, radius, space, type } from '@/theme/tokens';

import { BADGES, badgeName, earnedNewestFirst, type BadgeIcon, type BadgeState } from '../../engine/badges';
import { getBadges } from '../../services/badgesService';

const SHOWN_ON_ROW = 3;

export function BadgeMedal({ icon, earned, size = 44 }: { icon: BadgeIcon; earned: boolean; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: earned ? color.accentSoft : color.surfaceSunken,
        borderWidth: earned ? 1.5 : 1,
        borderColor: earned ? color.accent : color.border,
      }}
    >
      <Icon name={icon} size={Math.round(size * 0.5)} color={earned ? color.accent : color.inkDisabled} />
    </View>
  );
}

export function BadgeShelfRow() {
  const router = useRouter();
  const units = useUnits();
  const [badges, setBadges] = useState<BadgeState[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      getBadges()
        .then((b) => {
          if (live) setBadges(b);
        })
        .catch((e: unknown) => console.warn('[badges] could not read the badges for Profile', e));
      return () => {
        live = false;
      };
    }, []),
  );

  const earned = badges ? earnedNewestFirst(badges) : [];
  const shown = earned.slice(0, SHOWN_ON_ROW);
  const total = BADGES.length;
  const count = badges ? `${earned.length} of ${total}` : null;
  const spoken = badges
    ? `Badges. ${earned.length} of ${total} earned${shown.length > 0 ? `. Newest: ${badgeName(shown[0].id, units)}` : ''}`
    : 'Badges';

  return (
    <Pressable
      onPress={() => {
        tap();
        router.push('/badges');
      }}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      style={({ pressed }) => ({
        minHeight: 56,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
        borderRadius: radius.md,
        backgroundColor: pressed ? color.surfaceRaised : color.surface,
        borderWidth: 1,
        borderColor: color.border,
      })}
    >
      <Icon name="trophy" size={22} color={color.ink} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text numberOfLines={1} style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>
          Badges
        </Text>
        {count ? (
          <Text numberOfLines={1} style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }}>
            {count} earned
          </Text>
        ) : null}
      </View>
      {shown.length > 0 ? (
        <View style={{ flexDirection: 'row', gap: space.xs }} importantForAccessibility="no-hide-descendants">
          {shown.map((b) => (
            <BadgeMedal key={b.id} icon={b.icon} earned size={28} />
          ))}
        </View>
      ) : null}
      <Icon name="chevron-right" size={18} color={color.inkMuted} />
    </Pressable>
  );
}
