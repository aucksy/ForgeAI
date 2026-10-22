/**
 * Gym branding: the joined gym's logo and name, small, at the top of the Workout, Profile and Shop
 * tabs — the member's gym, at a glance, in its own heading style. Shown only for a branded gym (a
 * colour, a tone or a logo); ForgeAI's own look and an unbranded gym show nothing here.
 * Without a logo, or when it cannot load, the name stands alone.
 *
 * Draws the gym the COLOURS are painted for (theme/gymTheme.ts `look`), not the gym shop's latest
 * answer: a look that is still waiting for a safe moment changes the logo, the name and the
 * colours together (D12).
 *
 * The logo keeps its own shape (D14): it is shown whole ("contain") in a 28 dp-high box as wide as
 * the picture needs (a square badge or a wide wordmark, up to 4:1), with softly rounded corners —
 * never squeezed into a circle.
 */
import { Image } from 'expo-image';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { isBranded } from '@forgeai/theme';

import { pictureUrl } from '@/cloud/picture';
import { brandHeadingStyle } from '@/theme/brandTokens';
import { useGymTheme } from '@/theme/gymTheme';
import { color, space, type } from '@/theme/tokens';

const LOGO = 28;

/** The header logo's width for a picture of `w` × `h`: its own shape at 28 dp high, 1:1 to 4:1. PURE. */
export function logoMarkWidth(w: number | null | undefined, h: number | null | undefined): number {
  if (!w || !h || w <= 0 || h <= 0) return LOGO;
  return Math.round(LOGO * Math.min(4, Math.max(1, w / h)));
}

export function GymBrandMark() {
  const look = useGymTheme((s) => s.look);
  const [failed, setFailed] = useState<string | null>(null);
  const [size, setSize] = useState<{ url: string; w: number; h: number } | null>(null);
  const brand = look?.brand ?? null;
  if (!look || !isBranded(brand)) return null;
  const logo = brand.logoUrl && failed !== brand.logoUrl ? brand.logoUrl : null;
  const width = logo && size?.url === logo ? logoMarkWidth(size.w, size.h) : LOGO;
  return (
    <View
      accessible
      accessibilityLabel={`Your gym: ${look.gymName}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: LOGO }}
    >
      {logo ? (
        <Image
          source={{ uri: pictureUrl(logo) }}
          style={{ width, height: LOGO, borderRadius: 6 }}
          contentFit="contain"
          cachePolicy="memory-disk"
          accessible={false}
          onLoad={(e) => setSize({ url: logo, w: e.source.width, h: e.source.height })}
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
        {look.gymName}
      </Text>
    </View>
  );
}
