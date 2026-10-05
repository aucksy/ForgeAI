/** "New record" pop-up on the workout screen (Phase 1). Fades out after ~3.5 s. */
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';

import { color, radius, space, type } from '@/theme/tokens';

import { useWorkoutUi } from '../store/workoutUiStore';
import { Glyph } from './TrackerGlyph';

export function RecordToast() {
  const record = useWorkoutUi((s) => s.record);
  const clear = useWorkoutUi((s) => s.clearRecord);

  useEffect(() => {
    if (!record) return;
    const id = record.id;
    const t = setTimeout(() => clear(id), 3500);
    return () => clearTimeout(t);
  }, [record, clear]);

  if (!record) return null;
  return (
    <Animated.View
      key={record.id}
      entering={FadeInUp.duration(220)}
      exiting={FadeOutUp.duration(200)}
      accessibilityLiveRegion="polite"
      accessibilityLabel={`New record. ${record.exercise}. ${record.label}`}
      style={{ position: 'absolute', left: 0, right: 0, top: 0, zIndex: 10, alignItems: 'center' }}
      pointerEvents="none"
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.sm,
          paddingHorizontal: space.lg,
          paddingVertical: space.md,
          borderRadius: radius.pill,
          backgroundColor: color.surfaceRaised,
          borderWidth: 1,
          borderColor: color.accent,
          maxWidth: '100%',
        }}
      >
        <Glyph name="medal" size={20} color={color.accentBright} />
        <View style={{ flexShrink: 1 }}>
          <Text numberOfLines={1} style={{ fontFamily: type.bodyBold, fontSize: type.size.sub, color: color.ink }}>
            New record · {record.exercise}
          </Text>
          <Text numberOfLines={1} style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.accentBright }}>
            {record.label}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}
