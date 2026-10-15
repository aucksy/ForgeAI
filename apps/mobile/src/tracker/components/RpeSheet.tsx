/**
 * The RPE sheet (15 Oct 2026, owner testing in the gym: "Keep RPE section just for RPE and this
 * one doesn't have to have a check mark... single tap register of rpe and gets out").
 *
 * Opened from a set's RPE cell (with "Track RPE" on). Only RPE lives here — the set type stays in
 * the set-number sheet. One tap on a value saves it and closes the sheet: no ✓ "Done" to press.
 * Each row says what the number means ("8 · 2 more reps left"), so the member reads before the
 * one tap. "Clear RPE" shows only when the set has one. Closing with × or Back changes nothing.
 */
import { Pressable, Text, View } from 'react-native';

import { trimNum } from '@/lib/format';
import { color, radius, space, type } from '@/theme/tokens';

import { RPE_CHOICES, rpeColor, rpeMeaning } from '../lib/rpe';
import { TrackerSheet } from './TrackerSheet';

export function RpeSheet({
  visible,
  rpe,
  who,
  onPick,
  onClose,
}: {
  visible: boolean;
  /** The set's RPE now (null = none yet). */
  rpe: number | null;
  /** "Bench Press set 1" — spoken in the title's subtitle for a screen reader. */
  who: string;
  /** A value (or null to clear). The caller saves it; the sheet then closes itself. */
  onPick: (rpe: number | null) => void;
  onClose: () => void;
}) {
  const pick = (v: number | null) => {
    onPick(v);
    onClose();
  };
  return (
    <TrackerSheet visible={visible} title="How hard was it? (RPE)" subtitle={who} onClose={onClose}>
      <View style={{ gap: 2 }}>
        {[...RPE_CHOICES].reverse().map((v) => {
          const selected = rpe === v;
          return (
            <Pressable
              key={v}
              onPress={() => pick(v)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`RPE ${trimNum(v)}: ${rpeMeaning(v)}`}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.md,
                minHeight: 48,
                paddingHorizontal: space.md,
                borderRadius: radius.sm,
                borderWidth: selected ? 2 : 0,
                borderColor: selected ? rpeColor(v) : 'transparent',
                backgroundColor: selected ? color.accentSoft : pressed ? color.surface : 'transparent',
              })}
            >
              <Text style={{ minWidth: 40, fontFamily: type.monoBold, fontSize: type.size.body, color: rpeColor(v) }}>
                {trimNum(v)}
              </Text>
              <Text style={{ flex: 1, fontFamily: selected ? type.bodySemi : type.body, fontSize: type.size.body, color: color.ink }}>
                {rpeMeaning(v)}
              </Text>
            </Pressable>
          );
        })}
        {rpe != null ? (
          <Pressable
            onPress={() => pick(null)}
            accessibilityRole="button"
            accessibilityLabel="Clear RPE"
            style={({ pressed }) => ({
              minHeight: 48,
              justifyContent: 'center',
              paddingHorizontal: space.md,
              borderRadius: radius.sm,
              backgroundColor: pressed ? color.surface : 'transparent',
            })}
          >
            <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.inkSecondary }}>Clear RPE</Text>
          </Pressable>
        ) : null}
      </View>
    </TrackerSheet>
  );
}
