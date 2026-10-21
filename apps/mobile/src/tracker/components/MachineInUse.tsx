/**
 * "Machine in use" (owner backlog, Planned; built 21 Oct 2026): during rest, a tap on the rest clock
 * fills the screen with a big "IN USE · back in 1:32", so others in the gym can read from a few
 * metres that the machine is taken while the member walks around or drinks water. The live timer
 * keeps counting; "I'm back" or the end of the rest closes it. The workout screen keeps the phone
 * awake already (useKeepAwake in session/active).
 */
import { Modal, Pressable, Text, View } from 'react-native';

import { color, radius, space, type } from '@/theme/tokens';

export const IN_USE_WORDS = {
  title: 'IN USE',
  back: 'Back in',
  close: "I'm back",
} as const;

/** "Bench Press, set 3" -> "Bench Press": the machine, not the set. PURE. */
export function machineName(nextLabel: string | null): string | null {
  const name = (nextLabel ?? '').split(',')[0].trim();
  return name || null;
}

/** Drawn by RestTimerBar, which owns the clock (no import back, so no module cycle). */
export function MachineInUse({
  visible,
  remaining,
  clock,
  nextLabel,
  onClose,
}: {
  visible: boolean;
  remaining: number;
  clock: string;
  nextLabel: string | null;
  onClose: () => void;
}) {
  const machine = machineName(nextLabel);
  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={`In use. Back in ${remaining} seconds. Tap to close`}
        style={{ flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.lg }}
      >
        <View style={{ borderWidth: 6, borderColor: color.accent, borderRadius: radius.xl, paddingVertical: space.lg, paddingHorizontal: space.xl }}>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            style={{ fontFamily: type.display, fontSize: 96, lineHeight: 104, color: color.accent, letterSpacing: 2, textAlign: 'center' }}
          >
            {IN_USE_WORDS.title}
          </Text>
        </View>
        {machine ? (
          <Text numberOfLines={2} style={{ fontFamily: type.displaySemi, fontSize: 26, color: color.ink, textAlign: 'center' }}>
            {machine}
          </Text>
        ) : null}
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontFamily: type.bodySemi, fontSize: 22, color: color.inkSecondary }}>{IN_USE_WORDS.back}</Text>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            style={{ fontFamily: type.monoBold, fontSize: 120, lineHeight: 132, color: color.ink, fontVariant: ['tabular-nums'] }}
          >
            {clock}
          </Text>
        </View>
        <View style={{ marginTop: space.lg, minHeight: 56, paddingHorizontal: space.xl, borderRadius: radius.pill, borderWidth: 1, borderColor: color.borderStrong, justifyContent: 'center' }}>
          <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>{IN_USE_WORDS.close}</Text>
        </View>
      </Pressable>
    </Modal>
  );
}
