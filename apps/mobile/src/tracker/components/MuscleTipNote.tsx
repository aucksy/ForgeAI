/**
 * Muscle tips (R-58, rebuilt R-482): the one calm line inside the Up next card.
 *  - Tip 1: "None of your routines trains your calves. Add 3 sets of Standing Calf Raise to your Legs
 *    routine?" [Add] [Not now] · I skip this on purpose
 *  - Tip 2: "Your routines give your shoulders 3 sets a week and your chest 12. Swap Incline Dumbbell
 *    Press for Dumbbell Shoulder Press in your Push routine?" [Swap] [Not now] · Keep as is
 * It says what to do, never what is wrong (no red, no "missing"). The tip itself: services/muscleTips.
 */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { GhostButton, Icon } from '@/components/ui';
import { tap } from '@/lib/haptics';
import { color, radius, space, type } from '@/theme/tokens';

import type { MuscleTip } from '../services/muscleTips';

export function MuscleTipNote({
  tip,
  onApply,
  onNotNow,
  onSkip,
  lastNotNow = false,
}: {
  tip: MuscleTip;
  /** A second "Not now" puts the group away for good (muscleTipsStore): the label says so. */
  lastNotNow?: boolean;
  /** "Add" (tip 1) or "Swap" (tip 2). */
  onApply: () => Promise<void>;
  onNotNow: () => void;
  /** "I skip this on purpose" (tip 1) or "Keep as is" (tip 2): that group stays quiet. */
  onSkip: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const swap = tip.kind === 'swap';
  const label = swap ? (busy ? 'Swapping…' : 'Swap') : busy ? 'Adding…' : 'Add';
  const skipLabel = swap ? 'Keep as is' : 'I skip this on purpose';
  return (
    <View style={{ borderRadius: radius.md, backgroundColor: color.surfaceSunken, borderWidth: 1, borderColor: color.border, padding: space.md, gap: space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
        <Icon name={swap ? 'dumbbell' : 'plus'} size={16} color={color.accentBright} />
        <Text style={{ flex: 1, fontFamily: type.bodyMedium, fontSize: type.size.sub, lineHeight: 19, color: color.ink }}>{tip.line}</Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' }}>
        <GhostButton
          label={label}
          icon={swap ? 'dumbbell' : 'plus'}
          onPress={() => {
            if (busy) return;
            tap();
            setBusy(true);
            void onApply().finally(() => setBusy(false));
          }}
        />
        <Pressable
          onPress={() => {
            tap();
            onNotNow();
          }}
          accessibilityRole="button"
          accessibilityLabel={lastNotNow ? "Not now. Don't suggest it again" : 'Not now. Ask again in 4 weeks'}
          style={{ minHeight: 48, paddingHorizontal: space.md, justifyContent: 'center' }}
        >
          <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.inkSecondary }}>Not now</Text>
        </Pressable>
      </View>
      <Pressable
        onPress={() => {
          tap();
          onSkip();
        }}
        accessibilityRole="button"
        accessibilityLabel={`${skipLabel}. Don't suggest it again`}
        style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}
      >
        <Text style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted, textDecorationLine: 'underline' }}>{skipLabel}</Text>
      </Pressable>
    </View>
  );
}
