/**
 * "Machine in use" (owner backlog, Planned; built 21 Oct 2026): during rest, a tap on the rest clock
 * fills the screen with a big "IN USE · back in 1:32", so others in the gym can read from a few
 * metres that the machine is taken while the member walks around or drinks water. The live timer
 * keeps counting; "I'm back" or the end of the rest closes it. The workout screen keeps the phone
 * awake already (useKeepAwake in session/active).
 *
 * R-70 (owner, 22 Oct 2026: "after my set, I walk and I get away from my equipment and people start
 * to take away the weights"): with "Show after every set" ticked (here, or Settings → Workouts) it
 * opens by itself when a set's rest starts, and it says "Resting" over the clock so people nearby
 * know the member is coming back. The set's pop-up (a record, better than last time) shows on top.
 */
import { Modal, Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/ui';
import { color, radius, space, type } from '@/theme/tokens';

import { IN_USE_WORDS } from '../lib/inUse';
import { useTrackerPrefs } from '../store/trackerPrefsStore';
import { RecordToast } from './RecordToast';

export { IN_USE_WORDS, machineName } from '../lib/inUse';

/** Drawn by RestTimerBar, which owns the clock (no import back, so no module cycle). */
export function MachineInUse({
  visible,
  remaining,
  clock,
  machine,
  onClose,
}: {
  visible: boolean;
  remaining: number;
  clock: string;
  /** The lift whose tick started this rest (RestTimerBar finds it), or null. */
  machine: string | null;
  onClose: () => void;
}) {
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
          <Text style={{ fontFamily: type.bodySemi, fontSize: 22, color: color.inkSecondary, textAlign: 'center' }}>{IN_USE_WORDS.back}</Text>
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
        <AutoTick />
      </Pressable>
      {/* The set's own pop-up (a record, better than last time) stays readable over this screen. */}
      <RecordToast />
    </Modal>
  );
}

/** R-70: "Show after every set" — the same setting as Settings → Workouts. A tap here never closes the screen. */
function AutoTick() {
  const on = useTrackerPrefs((s) => s.inUseAfterSet);
  const setOn = useTrackerPrefs((s) => s.setInUseAfterSet);
  return (
    <Pressable
      onPress={() => setOn(!on)}
      hitSlop={8}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={IN_USE_WORDS.auto}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 48, paddingHorizontal: space.md }}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 6,
          borderWidth: 2,
          borderColor: on ? color.accent : color.borderStrong,
          backgroundColor: on ? color.accent : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {on ? <Icon name="check" size={16} color={color.bg} /> : null}
      </View>
      <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkSecondary }}>{IN_USE_WORDS.auto}</Text>
    </Pressable>
  );
}
