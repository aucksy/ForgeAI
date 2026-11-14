/**
 * R-517 (owner, 14 Nov 2026): the Gym tab's own header for a branded gym. "Let the logo of the gym and
 * the name of the gym be bigger, and the logo can be tappable so people can tap on it and see the
 * enlarged logo."
 *  - The logo, 56 dp high in its own shape (D14: shown whole, never squeezed into a circle), with
 *    rounded corners and a thin border; the gym's name next to it in the gym's heading style, 22 sp,
 *    up to 2 lines; "Your gym" (or "Pay at the desk") small under the name.
 *  - Tapping the logo opens it full size on a dark screen with the gym's name under it. The X, the
 *    phone's Back and a tap anywhere close it.
 *  - No logo (a gym with only colours), or one that cannot load: the small dot and the name, as
 *    before, and nothing to tap.
 * The Workout and Profile tabs keep the small mark (components/GymBrandMark.tsx).
 * Draws the gym the colours are painted for (theme/gymTheme.ts `look`), like the small mark.
 */
import { Image } from 'expo-image';
import { useState } from 'react';
import { Modal, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isBranded } from '@forgeai/theme';

import { pictureUrl } from '@/cloud/picture';
import { IconButton } from '@/components/ui';
import { brandHeadingStyle } from '@/theme/brandTokens';
import { useGymTheme } from '@/theme/gymTheme';
import { color, radius, space, type } from '@/theme/tokens';
import { phoneNative } from '@/tracker/phone/native';

import { bigLogoBox, GYM_LOGO_CLOSE_LABEL, GYM_LOGO_TAP_LABEL, gymHeaderLogoWidth } from './gymHeader';

/** Same as GYM_HEADER_LOGO (gymHeader.ts); written out so the touch-size check can read it. */
const LOGO = 56;
/** The full-size view is dark in both looks: a logo is made to stand out on it. */
const BACKDROP = 'rgba(6, 7, 10, 0.96)';
const ON_BACKDROP = '#FFFFFF';

export function GymHeaderMark({ tagline }: { tagline: string }) {
  const look = useGymTheme((s) => s.look);
  const [failed, setFailed] = useState<string | null>(null);
  const [size, setSize] = useState<{ url: string; w: number; h: number } | null>(null);
  const [open, setOpen] = useState(false);
  const brand = look?.brand ?? null;
  if (!look || !isBranded(brand)) return null;
  const logo = brand.logoUrl && failed !== brand.logoUrl ? brand.logoUrl : null;
  const known = logo && size?.url === logo ? size : null;
  const width = gymHeaderLogoWidth(known?.w, known?.h);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: LOGO }}>
      {logo ? (
        <Pressable
          onPress={() => setOpen(true)}
          accessibilityRole="imagebutton"
          accessibilityLabel={GYM_LOGO_TAP_LABEL}
          style={{
            width,
            height: LOGO,
            flexShrink: 0,
            borderRadius: radius.sm,
            borderWidth: 1,
            borderColor: color.borderStrong,
            overflow: 'hidden',
          }}
        >
          <Image
            source={{ uri: pictureUrl(logo) }}
            style={{ width: '100%', height: '100%' }}
            contentFit="contain"
            cachePolicy="memory-disk"
            accessible={false}
            onLoad={(e) => setSize({ url: logo, w: e.source.width, h: e.source.height })}
            onError={() => setFailed(logo)}
          />
        </Pressable>
      ) : (
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color.accent }} />
      )}
      <View style={{ flex: 1, gap: 2 }}>
        {/* "Your gym: <name>" is what TalkBack says, and what the phone tests look for. */}
        <View accessible accessibilityRole="header" accessibilityLabel={`Your gym: ${look.gymName}`}>
          <Text
            numberOfLines={2}
            style={{
              fontFamily: type.display,
              fontSize: type.size.h2,
              lineHeight: 28,
              color: color.ink,
              ...brandHeadingStyle(),
              // An italic's last letter leans past its box: a little room so it is not cut.
              paddingRight: 3,
            }}
          >
            {look.gymName}
          </Text>
        </View>
        <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkSecondary }}>{tagline}</Text>
      </View>
      {logo ? (
        <BigLogo
          visible={open}
          uri={pictureUrl(logo)}
          gymName={look.gymName}
          w={known?.w}
          h={known?.h}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </View>
  );
}

/** The logo full size: as large as fits, its own shape, never cropped; the gym's name under it. */
function BigLogo({
  visible,
  uri,
  gymName,
  w,
  h,
  onClose,
}: {
  visible: boolean;
  uri: string;
  gymName: string;
  w: number | undefined;
  h: number | undefined;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const screen = useWindowDimensions();
  const box = bigLogoBox(w, h, screen.width, screen.height - insets.top - insets.bottom);
  // Light icons on the dark backdrop in both looks.
  const darkBars = () => {
    try {
      phoneNative()?.modalBars?.(false);
    } catch (e) {
      console.warn('[ForgeErr] logo viewer status bar', e);
    }
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} onShow={darkBars} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: BACKDROP }}>
        {/* A tap anywhere closes it (the X and Back too). TalkBack uses the X. */}
        <Pressable
          accessible={false}
          onPress={onClose}
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingTop: insets.top, paddingBottom: insets.bottom }}
        >
          <Image
            source={{ uri }}
            style={{ width: box.width, height: box.height }}
            contentFit="contain"
            cachePolicy="memory-disk"
            accessible
            accessibilityLabel={`${gymName} logo, full size`}
          />
          <Text
            numberOfLines={3}
            style={{
              marginTop: space.xl,
              textAlign: 'center',
              fontFamily: type.display,
              fontSize: type.size.h2,
              lineHeight: 28,
              color: ON_BACKDROP,
              ...brandHeadingStyle(),
              paddingHorizontal: 3,
            }}
          >
            {gymName}
          </Text>
        </Pressable>
        <View style={{ position: 'absolute', top: insets.top + space.md, right: space.lg }}>
          <IconButton icon="close" onPress={onClose} accessibilityLabel={GYM_LOGO_CLOSE_LABEL} />
        </View>
      </View>
    </Modal>
  );
}
