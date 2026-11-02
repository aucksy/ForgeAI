/**
 * Small pieces of the welcome's three screens (R-273 / R-277, owner-approved design, 2 Nov 2026):
 * the orange "Continue with Google" pill with Google's G, the two outlined pills, the "Back" row and
 * a sub-screen's heading. Built from the app's own tokens and the kit's PressScale; the frozen kit
 * buttons take only a named icon, so the G needs its own pill. Every touch target is >= 48 dp and
 * every label wraps (never cut) at a large font on a 360 dp phone.
 */
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Icon, type IconName } from '@/components/ui';
import { PressScale } from '@/components/ui/PressScale';
import { color, gradients, radius, shadow, space, type } from '@/theme/tokens';

/** Google's "G", one colour (the design draws it in the button's ink: the ink on the accent). */
export function GoogleG({ size = 20, fill: fillProp }: { size?: number; fill?: string }) {
  // Read when drawn: gym branding repaints the tokens.
  const fill = fillProp ?? color.onAccent;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3Z" fill={fill} />
      <Path d="M12 22c2.7 0 5-.9 6.6-2.5l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22Z" fill={fill} />
      <Path d="M6.4 13.9a6 6 0 0 1 0-3.8V7.5H3.1a10 10 0 0 0 0 9Z" fill={fill} />
      <Path d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.5l3.3 2.6C7.2 7.8 9.4 6 12 6Z" fill={fill} />
    </Svg>
  );
}

/** The QR-in-corners mark of the poster box. */
export function QrMark({ size = 44 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color.accent} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
      <Path d="M8 8h3v3H8zM13 8h3v3h-3zM8 13h3v3H8z" />
      <Path d="M13 13h3v3" />
    </Svg>
  );
}

/** The big orange pill (one per screen). `glyph` is drawn before the label. */
export function OrangePill({
  label,
  onPress,
  glyph,
  loading,
  disabled,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  glyph?: ReactNode;
  loading?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const inactive = Boolean(disabled || loading);
  return (
    <PressScale
      onPress={onPress}
      disabled={inactive}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={loading ? { busy: true } : undefined}
      style={{ borderRadius: radius.pill, opacity: disabled ? 0.45 : 1, ...(inactive ? null : shadow.glow) }}
    >
      <LinearGradient
        colors={gradients.ember}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          minHeight: 56,
          paddingVertical: space.sm,
          paddingHorizontal: space.xl,
          borderRadius: radius.pill,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
        }}
      >
        {loading ? <ActivityIndicator size="small" color={color.onAccent} /> : glyph ?? null}
        <Text style={{ fontFamily: type.bodyBold, fontSize: 17, color: color.onAccent, textAlign: 'center', flexShrink: 1 }}>{label}</Text>
      </LinearGradient>
    </PressScale>
  );
}

/** An outlined pill with an orange icon ("Join my gym", "Bring workouts"). */
export function OutlinePill({ label, icon, onPress }: { label: string; icon: IconName; onPress: () => void }) {
  return (
    <PressScale
      onPress={onPress}
      style={{
        minHeight: 52,
        paddingVertical: space.sm,
        paddingHorizontal: space.md,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: color.borderStrong,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.sm,
      }}
    >
      <Icon name={icon} size={18} color={color.accent} />
      <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink, textAlign: 'center', flexShrink: 1 }}>{label}</Text>
    </PressScale>
  );
}

/** An underlined text link, 48 dp tall. */
export function TextLink({ label, onPress, faint }: { label: string; onPress: () => void; faint?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({ minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.md, opacity: pressed ? 0.6 : 1 })}
    >
      <Text
        style={{
          fontFamily: faint ? type.body : type.bodySemi,
          fontSize: faint ? type.size.sub : 14,
          color: faint ? color.inkFaint : color.inkMuted,
          textDecorationLine: 'underline',
          textAlign: 'center',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** "‹ Back" at the top of a sub-screen. */
export function BackRow({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Back"
      hitSlop={{ right: 16 }}
      style={({ pressed }) => ({
        alignSelf: 'flex-start',
        minHeight: 48,
        minWidth: 48,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Icon name="chevron-left" size={20} color={color.inkMuted} />
      <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.inkMuted }}>Back</Text>
    </Pressable>
  );
}

/** A sub-screen's title and the line under it. */
export function SubHeading({ title, body }: { title: string; body: string }) {
  return (
    <View style={{ gap: space.sm }}>
      <Text accessibilityRole="header" style={{ fontFamily: type.display, fontSize: type.size.h1, color: color.ink, lineHeight: 32 }}>
        {title}
      </Text>
      <Text style={{ fontFamily: type.body, fontSize: 16, color: color.inkMuted, lineHeight: 23 }}>{body}</Text>
    </View>
  );
}
