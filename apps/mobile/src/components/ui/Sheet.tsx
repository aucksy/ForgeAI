/**
 * The one bottom sheet (LW-16 / EX-11). A dimmed backdrop that closes on tap, a raised panel
 * with a handle, a title row with a close ×, and a body that SCROLLS once it is taller than
 * the room it has — so at 200 % text or on a 360 × 640 dp phone the title and × never leave
 * the screen. The panel is capped at 90 % of the screen and never goes under the status bar.
 *
 * Keyboard: a React Native Modal is its own window, which Android still shrinks for the
 * keyboard (the app-wide KeyboardRoom only covers the main window), so the capped panel simply
 * rides up above it. iOS gets a KeyboardAvoidingView.
 */
import { useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, radius, space, type } from '@/theme/tokens';

import { Icon } from './Icon';

export interface SheetProps {
  visible: boolean;
  title: string;
  /** One line of facts under the title (a count, a date) — never a slogan. */
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  /** Pinned under the scrolling body, always visible (e.g. the sheet's main button). */
  footer?: ReactNode;
  /** Spoken name of the × (default "Close"). */
  closeLabel?: string;
}

export function Sheet({ visible, title, subtitle, onClose, children, footer, closeLabel = 'Close' }: SheetProps) {
  const insets = useSafeAreaInsets();
  const [viewH, setViewH] = useState(0);
  const [contentH, setContentH] = useState(0);
  // Scroll only when the body overflows: a short sheet stays still, and a list that scrolls
  // inside a short sheet keeps its own gestures.
  const overflows = contentH > viewH + 1;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={{ flex: 1, justifyContent: 'flex-end', paddingTop: insets.top + space.lg }}>
          <Pressable
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)' }}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={closeLabel}
          />
          <View
            accessibilityViewIsModal
            style={{
              maxHeight: '90%',
              backgroundColor: color.surfaceRaised,
              borderTopLeftRadius: radius.xl,
              borderTopRightRadius: radius.xl,
              borderWidth: 1,
              borderColor: color.borderStrong,
              paddingTop: space.sm,
              paddingBottom: Math.max(insets.bottom, space.lg) + space.md,
            }}
          >
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: color.borderStrong, marginBottom: space.xs }}
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingLeft: space.xl, paddingRight: space.sm }}>
              <View style={{ flex: 1 }}>
                <Text
                  accessibilityRole="header"
                  numberOfLines={2}
                  style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}
                >
                  {title}
                </Text>
                {subtitle ? (
                  <Text
                    numberOfLines={3}
                    style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary, marginTop: 2 }}
                  >
                    {subtitle}
                  </Text>
                ) : null}
              </View>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel={closeLabel}
                style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}
              >
                <Icon name="close" size={22} color={color.inkMuted} />
              </Pressable>
            </View>
            <ScrollView
              style={{ flexGrow: 0, flexShrink: 1 }}
              scrollEnabled={overflows}
              showsVerticalScrollIndicator={overflows}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              onLayout={(e) => setViewH(e.nativeEvent.layout.height)}
              onContentSizeChange={(_w, h) => setContentH(h)}
              contentContainerStyle={{ paddingHorizontal: space.xl, paddingTop: space.sm, gap: space.md }}
            >
              {children}
            </ScrollView>
            {footer ? <View style={{ paddingHorizontal: space.xl, paddingTop: space.md }}>{footer}</View> : null}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export interface SheetRowProps {
  label: string;
  value?: string;
  leading?: ReactNode;
  danger?: boolean;
  selected?: boolean;
  onPress: () => void;
}

/** One tappable row in a sheet: leading glyph, label, optional value on the right. 48 dp tall. */
export function SheetRow({ label, value, leading, danger, onPress, selected }: SheetRowProps) {
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
