/**
 * Gym branding: the joined gym's logo and name, small, at the top of the Workout, Profile and Shop
 * tabs — the member's gym, at a glance, in its own heading style. Shown only for a branded gym (a
 * colour or a logo); ForgeAI's own look and an unbranded gym show nothing here.
 * Without a logo, or when it cannot load, the name stands alone.
 */
import { Image } from 'expo-image';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { isBranded } from '@forgeai/theme';

import { useGymShop } from '@/shop/gymStore';
import { brandHeadingStyle } from '@/theme/brandTokens';
import { color, space, type } from '@/theme/tokens';

const LOGO = 28;

export function GymBrandMark() {
  const link = useGymShop((s) => s.link);
  const [failed, setFailed] = useState<string | null>(null);
  const brand = link?.brand ?? null;
  if (!link || !isBranded(brand)) return null;
  const logo = brand.logoUrl && failed !== brand.logoUrl ? brand.logoUrl : null;
  return (
    <View
      accessible
      accessibilityLabel={`Your gym: ${link.gymName}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: LOGO }}
    >
      {logo ? (
        <Image
          source={{ uri: logo }}
          style={{ width: LOGO, height: LOGO, borderRadius: LOGO / 2 }}
          contentFit="contain"
          cachePolicy="memory-disk"
          accessible={false}
          onError={() => setFailed(logo)}
        />
      ) : (
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color.accent }} />
      )}
      <Text
        numberOfLines={1}
        style={{
          flexShrink: 1,
          fontFamily: type.bodyBold,
          fontSize: type.size.sub,
          letterSpacing: 0.4,
          color: color.inkSecondary,
          ...brandHeadingStyle(),
          // An italic's last letter leans past its box: a little room so it is not cut.
          paddingRight: 3,
        }}
      >
        {link.gymName}
      </Text>
    </View>
  );
}
