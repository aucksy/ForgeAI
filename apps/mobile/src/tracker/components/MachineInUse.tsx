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
 *
 * R-304 (owner, 3 Nov 2026): the tick is per exercise ("Show after every set of this exercise") and
 * remembered for that exercise; its first state comes from the equipment (lib/inUse.ts inUseDefault).
 *
 * R-305 (owner, 3 Nov 2026, "a marketing move: people look at the phone and ask which app"): under
 * the lift's name, "300 kg more to reach today's target", and the MettleUp logo at the foot.
 */
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MettleUpLogo } from '@/components/brand/MettleUpLogo';
import { Icon } from '@/components/ui';
import { color, radius, space, type } from '@/theme/tokens';

import { IN_USE_WORDS, inUseAutoOn, type InUseEquipment } from '../lib/inUse';
import { useTrackerPrefs } from '../store/trackerPrefsStore';
import { RecordToast } from './RecordToast';

export { IN_USE_WORDS, machineName } from '../lib/inUse';

/** Drawn by RestTimerBar, which owns the clock (no import back, so no module cycle). */
export function MachineInUse({
  visible,
  remaining,
  clock,
  machine,
  beatLine = null,
  exercise = null,
  onClose,
}: {
  visible: boolean;
  remaining: number;
  clock: string;
  /** The lift whose tick started this rest (RestTimerBar finds it), or null. */
  machine: string | null;
  /** R-305: "300 kg more to reach today's target", or null. */
  beatLine?: string | null;
  /** R-304: the lift whose tick started this rest, for its own "Show after every set" tick; null = no tick. */
  exercise?: InUseExercise | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={`In use. ${beatLine ? `${beatLine}. ` : ''}Back in ${remaining} seconds. Tap to close`}
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
        {beatLine ? (
          <Text numberOfLines={2} style={{ fontFamily: type.bodySemi, fontSize: 20, color: color.accentBright, textAlign: 'center' }}>
            {beatLine}
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
        {exercise ? <AutoTick exercise={exercise} /> : null}
        <View style={{ opacity: 0.85 }}>
          <MettleUpLogo height={22} />
        </View>
      </Pressable>
      {/* The set's own pop-up (a record, better than last time) stays readable over this screen, below
          the status bar (this screen draws behind it). */}
      <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, top: 0, paddingTop: insets.top }}>
        <RecordToast />
      </View>
    </Modal>
  );
}

/** R-304: what the tick needs to know about the lift. */
export interface InUseExercise {
  id: string;
  name: string;
  equipment: InUseEquipment | string | null;
}

/**
 * R-70 / R-304: "Show after every set of this exercise" — this exercise only, remembered for it. A tick
 * with Settings' master switch off turns that switch on too (else the tick would do nothing). A tap
 * here never closes the screen.
 */
function AutoTick({ exercise }: { exercise: InUseExercise }) {
  const master = useTrackerPrefs((s) => s.inUseAfterSet);
  const chosen = useTrackerPrefs((s) => s.inUseByExercise[exercise.id]);
  const on = inUseAutoOn(master, chosen, { name: exercise.name, key: exercise.id, equipment: exercise.equipment });
  return (
    <Pressable
      onPress={() => {
        const prefs = useTrackerPrefs.getState();
        prefs.setInUseFor(exercise.id, !on);
        if (!on && !prefs.inUseAfterSet) prefs.setInUseAfterSet(true);
      }}
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
