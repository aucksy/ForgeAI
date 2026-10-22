/**
 * Missing-muscle suggestions (R-58): the one calm line inside the Up next card, e.g. "Easy add today:
 * 3 sets of Face Pull for your rear shoulders." [Add to routine] [Not now] · I skip this on purpose.
 * It says what to add, never what is wrong (no red, no "missing"). The tip itself: services/muscleTips.
 */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { GhostButton, Icon } from '@/components/ui';
import { tap } from '@/lib/haptics';
import { color, radius, space, type } from '@/theme/tokens';

import type { MuscleTip } from '../services/muscleTips';

export function MuscleTipNote({
  tip,
  onAdd,
  onNotNow,
  onSkip,
}: {
  tip: MuscleTip;
  onAdd: () => Promise<void>;
  onNotNow: () => void;
  onSkip: () => void;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <View style={{ borderRadius: radius.md, backgroundColor: color.surfaceSunken, borderWidth: 1, borderColor: color.border, padding: space.md, gap: space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
        <Icon name="plus" size={16} color={color.accentBright} />
        <Text style={{ flex: 1, fontFamily: type.bodyMedium, fontSize: type.size.sub, lineHeight: 19, color: color.ink }}>{tip.line}</Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' }}>
        <GhostButton
          label={adding ? 'Adding…' : 'Add to routine'}
          icon="plus"
          onPress={() => {
            if (adding) return;
            tap();
            setAdding(true);
            void onAdd().finally(() => setAdding(false));
          }}
        />
        <Pressable
          onPress={() => {
            tap();
            onNotNow();
          }}
          accessibilityRole="button"
          accessibilityLabel="Not now. Ask again in 4 weeks"
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
        accessibilityLabel="I skip this on purpose. Don't suggest it again"
        style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}
      >
        <Text style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted, textDecorationLine: 'underline' }}>
          I skip this on purpose
        </Text>
      </Pressable>
    </View>
  );
}
