/**
 * Plain bottom sheet for the workout screen's small choices (Phase 1): a dimmed
 * backdrop that closes on tap, a raised panel, a title row with a close button.
 * Same construction as SupersetSheet (an RN Modal, no gesture library), so the
 * look and the back-button behaviour match.
 */
import type { ReactNode } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui';
import { color, radius, space, type } from '@/theme/tokens';

export function TrackerSheet({
  visible,
  title,
  subtitle,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
      />
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: color.surfaceRaised,
          borderTopLeftRadius: radius.xl,
          borderTopRightRadius: radius.xl,
          borderWidth: 1,
          borderColor: color.borderStrong,
          paddingHorizontal: space.xl,
          paddingTop: space.lg,
          paddingBottom: Math.max(insets.bottom, space.lg) + space.md,
          gap: space.md,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>
              {title}
            </Text>
            {subtitle ? (
              <Text
                numberOfLines={2}
                style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary, marginTop: 2 }}
              >
                {subtitle}
              </Text>
            ) : null}
          </View>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
            <Icon name="close" size={22} color={color.inkMuted} />
          </Pressable>
        </View>
        {children}
      </View>
    </Modal>
  );
}

/** One tappable row in a sheet: leading glyph, label, optional value on the right. */
export function SheetRow({
  label,
  value,
  leading,
  danger,
  onPress,
  selected,
}: {
  label: string;
  value?: string;
  leading?: ReactNode;
  danger?: boolean;
  selected?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={selected != null ? { selected } : undefined}
      accessibilityLabel={value ? `${label}, ${value}` : label}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        minHeight: 48,
        paddingHorizontal: space.md,
        borderRadius: radius.md,
        backgroundColor: selected ? color.accentSoft : pressed ? color.surface : 'transparent',
      })}
    >
      {leading ? <View style={{ width: 24, alignItems: 'center' }}>{leading}</View> : null}
      <Text
        style={{
          flex: 1,
          fontFamily: type.bodySemi,
          fontSize: type.size.body,
          color: danger ? color.criticalText : selected ? color.accent : color.ink,
        }}
      >
        {label}
      </Text>
      {value ? (
        <Text style={{ fontFamily: type.monoBold, fontSize: type.size.sub, color: color.inkSecondary }}>{value}</Text>
      ) : null}
    </Pressable>
  );
}
