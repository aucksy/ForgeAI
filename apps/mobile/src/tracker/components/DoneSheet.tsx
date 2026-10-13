/**
 * The shared bottom sheet (`components/ui/Sheet`, frozen) with ONE addition in its title row: a
 * ✓ "Done" beside the ×, shown once something in the sheet has changed (13 Oct 2026, owner: in
 * "Set type" the choices apply at once, yet the only button was the ×, which reads as "cancel").
 * ✓ = keep it and close; × still closes. Both keep what was picked — every choice here applies
 * the moment it is tapped — the ✓ just says so.
 *
 * Why a copy: the frozen Sheet has no slot in its title row. Everything else is the same — the
 * backdrop, the 90 % cap, the scroll-when-taller body, the keyboard room, the closing clock that
 * `tell()` / `askConfirm` wait for, "Remove animations". Keep it in step with Sheet.tsx
 * (test/tracker/doneSheet.test.ts reads both). Used through `TrackerSheet` with `onDone`.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui';
import { noteSheetClosed } from '@/components/ui/sheetClock';
import { useReduceMotion } from '@/components/ui/useReduceMotion';
import { useKeyboardFrame } from '@/components/KeyboardRoom';
import { keyboardRoom } from '@/lib/keyboardRoom';
import { color, radius, space, type } from '@/theme/tokens';

export interface DoneSheetProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  /** ✓: keep and close. */
  onDone: () => void;
  /** Show the ✓ (something in the sheet changed since it opened). */
  showDone: boolean;
  children: ReactNode;
}

export function DoneSheet({ visible, title, subtitle, onClose, onDone, showDone, children }: DoneSheetProps) {
  const insets = useSafeAreaInsets();
  const reduced = useReduceMotion();
  const [viewH, setViewH] = useState(0);
  const kb = useKeyboardFrame();
  const [windowH, setWindowH] = useState(0);
  const [contentH, setContentH] = useState(0);
  const overflows = contentH > viewH + 1;

  const wasVisible = useRef(visible);
  useLayoutEffect(() => {
    if (wasVisible.current && !visible) {
      noteSheetClosed();
      Keyboard.dismiss();
    }
    wasVisible.current = visible;
  }, [visible]);
  useLayoutEffect(
    () => () => {
      if (wasVisible.current) noteSheetClosed();
    },
    [],
  );

  return (
    <Modal visible={visible} transparent animationType={reduced ? 'none' : 'slide'} onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View
          style={{ flex: 1, justifyContent: 'flex-end', paddingTop: insets.top + space.lg, paddingBottom: keyboardRoom(windowH, kb) }}
          onLayout={(e) => setWindowH(e.nativeEvent.layout.height)}
        >
          <Pressable
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)' }}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
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
                <Text accessibilityRole="header" numberOfLines={2} style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>
                  {title}
                </Text>
                {subtitle ? (
                  <Text numberOfLines={3} style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary, marginTop: 2 }}>
                    {subtitle}
                  </Text>
                ) : null}
              </View>
              {showDone ? (
                <Pressable
                  onPress={onDone}
                  accessibilityRole="button"
                  accessibilityLabel="Done"
                  style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}
                >
                  {({ pressed }) => (
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: color.accent,
                        opacity: pressed ? 0.8 : 1,
                      }}
                    >
                      <Icon name="check" size={22} color="#1A0F08" />
                    </View>
                  )}
                </Pressable>
              ) : null}
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close"
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
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
