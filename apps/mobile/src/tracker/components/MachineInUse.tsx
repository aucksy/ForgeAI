/**
 * "Machine in use" (owner backlog, Planned; built 21 Oct 2026): during rest, a tap on the rest clock
 * fills the screen with a big "IN USE · back in 1:32", so others in the gym can read from a few
 * metres that the machine is taken while the member walks around or drinks water. The live timer
 * keeps counting; "I'm back" or the end of the rest closes it (R-456: nothing else on the screen does).
 * R-457: the sign names the kit ("BENCH" / "MACHINE" over "IN USE"). The workout screen keeps the phone
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
 * R-305 (owner, 3 Nov 2026, "a marketing move: people look at the phone and ask which app"): the
 * MettleUp logo at the foot. R-346 (owner, 5 Nov 2026): under the lift's name, the watch's two rest
 * lines instead of the kg to beat: "Previous 60 kg × 8" (grey) and "Next 62.5 kg × 8" (accent).
 */
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MettleUpLogo } from '@/components/brand/MettleUpLogo';
import { Icon } from '@/components/ui';
import { popupBarsFollowLook } from '@/theme/appearance';
import { color, radius, space, type } from '@/theme/tokens';

import { IN_USE_WORDS, inUseAutoOn, inUseScreenLabel, type InUseEquipment, type InUseKit } from '../lib/inUse';
import { useTrackerPrefs } from '../store/trackerPrefsStore';
import { RecordToast } from './RecordToast';

export { IN_USE_WORDS, machineName } from '../lib/inUse';

/**
 * R-364 edge check (5 Nov 2026, font 2.0 on a 360 dp phone): every word here is already large, so it
 * grows at most 1.3x with the phone's text size; at 2.0 the IN USE box rode up under the status bar.
 */
const TEXT_MAX = 1.3;

/** Drawn by RestTimerBar, which owns the clock (no import back, so no module cycle). */
export function MachineInUse({
  visible,
  remaining,
  clock,
  machine,
  kit = null,
  previous = null,
  next = null,
  exercise = null,
  onClose,
}: {
  visible: boolean;
  remaining: number;
  clock: string;
  /** The lift whose tick started this rest (RestTimerBar finds it), or null. */
  machine: string | null;
  /** R-457: the kit that lift uses ("Bench", "Machine"; lib/inUse.ts inUseKit), or null for plain IN USE. */
  kit?: InUseKit | null;
  /** R-346: the watch's rest lines for the next set of this lift ("Previous 60 kg × 8", "Next 62.5 kg × 8"), or null. */
  previous?: string | null;
  next?: string | null;
  /** R-304: the lift whose tick started this rest, for its own "Show after every set" tick; null = no tick. */
  exercise?: InUseExercise | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    // R-456: Android's Back still closes it (onRequestClose: the member's own phone gesture, never a stranger's tap).
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} onShow={popupBarsFollowLook} statusBarTranslucent>
      {/* R-456 (owner, 12 Nov 2026: "going away if you simply tap anywhere on the screen. That should only go
          away if someone taps on I am back"; first reported R-345): the screen itself is no longer a button.
          A tap on it, or on the strip round the tick, does nothing; only "I'm back", the end of the rest and
          the phone's Back close it. The column scrolls when a big text size makes it taller than the phone;
          "I'm back" sits in the fixed foot below it, so it is always on screen (UAT run 43187431184: at 360 dp
          it had slid below the tick strip). */}
      <ScrollView
        style={{ flex: 1, backgroundColor: color.bg }}
        contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl, paddingTop: insets.top + space.md, paddingBottom: space.md, gap: space.md }}
        bounces={false}
        overScrollMode="never"
      >
        {/* R-457 (owner, 12 Nov 2026): the sign names the kit, "BENCH" over "IN USE", so people who never saw
            the app know what is taken. Two lines, not one: on one line "PULL-UP BAR IN USE" shrank IN USE to a
            third of its size; read from a few metres, IN USE stays as big as before. */}
        <View
          accessible
          accessibilityRole="header"
          accessibilityLabel={inUseScreenLabel(kit, previous, next, remaining)}
          testID="in-use-sign"
          style={{ alignSelf: 'stretch', alignItems: 'center', borderWidth: 6, borderColor: color.accent, borderRadius: radius.xl, paddingVertical: kit ? space.sm : space.lg, paddingHorizontal: space.lg }}
        >
          {kit ? (
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              maxFontSizeMultiplier={1}
              style={{ fontFamily: type.display, fontSize: 60, lineHeight: 64, color: color.accent, letterSpacing: 2, textAlign: 'center' }}
            >
              {kit.toUpperCase()}
            </Text>
          ) : null}
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            maxFontSizeMultiplier={1}
            style={{ fontFamily: type.display, fontSize: 96, lineHeight: kit ? 98 : 104, color: color.accent, letterSpacing: 2, textAlign: 'center' }}
          >
            {IN_USE_WORDS.title}
          </Text>
        </View>
        {machine ? (
          <Text numberOfLines={2} maxFontSizeMultiplier={TEXT_MAX} style={{ fontFamily: type.displaySemi, fontSize: 26, color: color.ink, textAlign: 'center' }}>
            {machine}
          </Text>
        ) : null}
        {previous || next ? (
          <View style={{ alignItems: 'center', gap: space.xs }}>
            {previous ? (
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} maxFontSizeMultiplier={TEXT_MAX} style={{ fontFamily: type.bodySemi, fontSize: 20, color: color.inkSecondary, textAlign: 'center', fontVariant: ['tabular-nums'] }}>
                {previous}
              </Text>
            ) : null}
            {next ? (
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} maxFontSizeMultiplier={TEXT_MAX} style={{ fontFamily: type.bodyBold, fontSize: 26, color: color.accentBright, textAlign: 'center', fontVariant: ['tabular-nums'] }}>
                {next}
              </Text>
            ) : null}
          </View>
        ) : null}
        <View style={{ alignItems: 'center' }}>
          <Text maxFontSizeMultiplier={TEXT_MAX} style={{ fontFamily: type.bodySemi, fontSize: 22, color: color.inkSecondary, textAlign: 'center' }}>{IN_USE_WORDS.back}</Text>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            maxFontSizeMultiplier={1}
            style={{ fontFamily: type.monoBold, fontSize: 108, lineHeight: 116, color: color.ink, fontVariant: ['tabular-nums'] }}
          >
            {clock}
          </Text>
        </View>
        <View style={{ opacity: 0.85 }}>
          <MettleUpLogo height={22} />
        </View>
      </ScrollView>
      <View style={{ backgroundColor: color.bg, alignItems: 'center', paddingTop: space.sm, paddingBottom: exercise ? space.md : Math.max(insets.bottom, space.md) + space.md }}>
        {/* R-456: the one close button, in the foot under the column (never scrolled away). A real button with its own name for TalkBack / VoiceOver, wide and tall
            enough to hit without looking, with a little extra room round it (hitSlop). */}
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={IN_USE_WORDS.close}
          hitSlop={space.sm}
          style={({ pressed }) => ({
            minHeight: 56,
            minWidth: 200,
            paddingHorizontal: space.xl,
            borderRadius: radius.pill,
            borderWidth: 2,
            borderColor: color.ink,
            backgroundColor: pressed ? color.surfaceSunken : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          })}
        >
          <Text maxFontSizeMultiplier={TEXT_MAX} style={{ fontFamily: type.bodySemi, fontSize: type.size.body + 2, color: color.ink }}>{IN_USE_WORDS.close}</Text>
        </Pressable>
      </View>
      {/* R-345 (owner, 5 Nov 2026): the tick lives in its own strip at the foot, apart from "I'm back"
          (a line and a gap between them). R-456 (12 Nov 2026): a tap in the strip round the tick no longer
          closes the screen either; a tap on the tick only flips the tick. */}
      {exercise ? (
        <View
          style={{
            backgroundColor: color.bg,
            alignItems: 'center',
            borderTopWidth: 1,
            borderTopColor: color.border,
            paddingTop: space.sm,
            paddingBottom: Math.max(insets.bottom, space.md) + space.sm,
          }}
        >
          <AutoTick exercise={exercise} />
        </View>
      ) : null}
      {/* The set's own pop-up (a record, better than last time) stays readable over this screen, below
          the status bar (this screen draws behind it). R-357: the pop-up is drawn at its holder's top
          edge (position absolute ignores padding), so the holder itself starts below the status bar;
          with paddingTop it was drawn under the phone's clock. */}
      <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, top: insets.top + space.sm }}>
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
 * here never closes the screen. R-345: the rest bar under the clock then says the new state
 * ("In use opens after each set" / "Tap to show In use"), so the change is never silent.
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
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={IN_USE_WORDS.auto}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 56, paddingHorizontal: space.md }}
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
        {on ? <Icon name="check" size={16} color={color.onAccent} /> : null}
      </View>
      <Text style={{ flexShrink: 1, fontFamily: type.bodyMedium, fontSize: type.size.sub, color: on ? color.ink : color.inkSecondary }}>{IN_USE_WORDS.auto}</Text>
    </Pressable>
  );
}
